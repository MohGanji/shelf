import * as THREE from "../vendor/three-module.js";

/**
 * Third-person chase camera: stays behind the player’s horizontal heading (velocity when moving,
 * else bike heading when nearly stationary — world-fixed WASD alone does not match steer-based movement).
 * Smoothing uses `cameraDamping`. Nitro adds FOV + optional pull-back.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {import("../config.js").DEFAULT_DEV_HUD} devHud — mutable runtime HUD
 * @param {{ arenaClamp?: { halfW: number; halfD: number; margin?: number } }} [opts] — keep chase camera inside arena footprint (XZ)
 */
export function createChaseCamera(camera, devHud, opts = {}) {
  const smoothPos = new THREE.Vector3();
  const smoothLook = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const tmpDesired = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  const arenaClamp = opts.arenaClamp;

  let smoothFov = devHud.cameraBaseFov;
  let spawned = false;

  function clampCameraXZ(v) {
    if (!arenaClamp) return;
    const hw = arenaClamp.halfW;
    const hd = arenaClamp.halfD;
    if (!(hw > 0) || !(hd > 0)) return;
    const m = typeof arenaClamp.margin === "number" && Number.isFinite(arenaClamp.margin) ? arenaClamp.margin : 2.5;
    const hx = Math.max(0.5, hw - m);
    const hz = Math.max(0.5, hd - m);
    v.x = THREE.MathUtils.clamp(v.x, -hx, hx);
    v.z = THREE.MathUtils.clamp(v.z, -hz, hz);
  }

  /**
   * Instant chase “ideal” (plan § kill-cam return): no smoothing — matches normal chase endpoint math.
   * @param {THREE.Vector3} outPos
   * @param {THREE.Vector3} outLook
   * @param {object} p
   * @param {THREE.Vector3} p.playerPos
   * @param {import("cannon-es").Vec3} p.playerVel
   * @param {{ w?: boolean; a?: boolean; s?: boolean; d?: boolean }} p.keys
   * @param {number} p.nitroStrength
   * @param {number} [p.playerHeading]
   * @returns {number} targetFov
   */
  function computeChaseFrame(
    outPos,
    outLook,
    { playerPos, playerVel, keys, nitroStrength, playerHeading },
  ) {
    const vx = playerVel.x;
    const vz = playerVel.z;
    const hs = Math.hypot(vx, vz);

    let ix = 0;
    let iz = 0;
    if (keys && keys.w) iz -= 1;
    if (keys && keys.s) iz += 1;
    if (keys && keys.a) ix -= 1;
    if (keys && keys.d) ix += 1;
    const intentLen = Math.hypot(ix, iz);

    const head =
      typeof playerHeading === "number" && Number.isFinite(playerHeading) ? playerHeading : null;

    if (hs > 0.2) {
      forward.set(vx / hs, 0, vz / hs);
    } else if (head != null) {
      forward.set(Math.sin(head), 0, Math.cos(head));
    } else if (intentLen > 1e-5) {
      forward.set(ix / intentLen, 0, iz / intentLen);
    }

    right.set(-forward.z, 0, forward.x);
    if (right.lengthSq() > 1e-8) right.normalize();

    const steer = (keys && keys.a ? 1 : 0) - (keys && keys.d ? 1 : 0);

    const n = Math.max(0, Math.min(1, nitroStrength));
    const dist =
      devHud.cameraDistance +
      (devHud.nitroCameraPullBack ? n * devHud.nitroPullBackAdd : 0);

    outPos
      .copy(playerPos)
      .addScaledVector(forward, -dist)
      .addScaledVector(up, devHud.cameraHeight)
      .addScaledVector(right, steer * devHud.cameraTurnOffset * 0.2);

    outLook
      .copy(playerPos)
      .addScaledVector(forward, devHud.cameraLookAhead)
      .addScaledVector(right, steer * devHud.cameraTurnOffset * 0.35);

    clampCameraXZ(outPos);

    return (
      devHud.cameraBaseFov +
      (devHud.nitroFovWiden ? n * devHud.nitroFovAdd : 0)
    );
  }

  /**
   * Re-sync internal smoother after a temporary override (e.g. enemy kill-cam).
   * @param {object} p
   * @param {THREE.Vector3} p.playerPos
   * @param {import("cannon-es").Vec3} p.playerVel
   * @param {{ w?: boolean; a?: boolean; s?: boolean; d?: boolean }} p.keys
   * @param {number} p.nitroStrength
   * @param {number} [p.playerHeading]
   */
  function snapToGameplayChase(p) {
    const targetFov = computeChaseFrame(tmpDesired, tmpLook, p);
    smoothPos.copy(tmpDesired);
    smoothLook.copy(tmpLook);
    camera.position.copy(smoothPos);
    camera.lookAt(smoothLook);
    smoothFov = targetFov;
    camera.fov = smoothFov;
    camera.updateProjectionMatrix();
    spawned = true;
  }

  /**
   * @param {THREE.Vector3} playerPos
   * @param {import("cannon-es").Vec3} playerVel
   * @param {{ w?: boolean; a?: boolean; s?: boolean; d?: boolean }} keys
   * @param {number} nitroStrength 0–1 (visual / burst strength)
   * @param {number} [playerHeading] — yaw (rad), same as `body.userData.heading`; keeps chase behind the cycle at low speed
   * @param {{ active: true; playerPos: THREE.Vector3; elapsedSec: number; playerHeading: number } | { active?: false }} [derez] — **player** derez only (overhead / shake)
   */
  function update(dt, { playerPos, playerVel, keys, nitroStrength, playerHeading, derez }) {
    if (dt <= 0) return;

    if (derez && derez.active) {
      const pos = derez.playerPos;
      const t = Math.max(0, derez.elapsedSec);
      const overheadOn = devHud.derezCameraOverhead !== false;
      const shakeOn = devHud.derezCameraShake !== false;
      const h = typeof derez.playerHeading === "number" ? derez.playerHeading : 0;

      let cx;
      let cy;
      let cz;
      let lx;
      let ly;
      let lz;
      if (overheadOn) {
        const yLift = devHud.derezOverheadHeight ?? 28;
        cx = pos.x;
        cy = pos.y + yLift;
        cz = pos.z;
        lx = pos.x;
        ly = pos.y + 0.15;
        lz = pos.z;
      } else {
        forward.set(Math.sin(h), 0, Math.cos(h));
        const dist = devHud.cameraDistance + 10;
        tmp.copy(forward).multiplyScalar(-dist).addScaledVector(up, devHud.cameraHeight + 5);
        cx = pos.x + tmp.x;
        cy = pos.y + tmp.y;
        cz = pos.z + tmp.z;
        lx = pos.x + forward.x * devHud.cameraLookAhead;
        ly = pos.y + 0.2;
        lz = pos.z + forward.z * devHud.cameraLookAhead;
      }
      if (shakeOn) {
        const s = t * 38;
        cx += Math.sin(s * 1.73) * 0.42 + Math.sin(s * 5.1) * 0.11;
        cy += Math.sin(s * 2.41) * 0.28;
        cz += Math.cos(s * 1.91) * 0.42;
      }
      camera.position.set(cx, cy, cz);
      camera.lookAt(lx, ly, lz);
      const targetFov = devHud.cameraBaseFov;
      const fk = 1 - Math.exp(-12 * dt);
      smoothFov += (targetFov - smoothFov) * fk;
      camera.fov = smoothFov;
      camera.updateProjectionMatrix();
      return;
    }

    const targetFov = computeChaseFrame(tmpDesired, tmpLook, {
      playerPos,
      playerVel,
      keys: keys || {},
      nitroStrength,
      playerHeading,
    });

    const n = Math.max(0, Math.min(1, nitroStrength));
    const k = 1 - Math.exp(-devHud.cameraDamping * 22 * dt);
    if (!spawned) {
      smoothPos.copy(tmpDesired);
      smoothLook.copy(tmpLook);
      spawned = true;
    } else {
      smoothPos.lerp(tmpDesired, k);
      smoothLook.lerp(tmpLook, k);
    }

    camera.position.copy(smoothPos);
    camera.lookAt(smoothLook);

    const fk = 1 - Math.exp(-10 * dt);
    smoothFov += (targetFov - smoothFov) * fk;
    camera.fov = smoothFov;
    camera.updateProjectionMatrix();
  }

  /**
   * Snap behind the player (e.g. arena spawn).
   * @param {THREE.Vector3} playerPos
   * @param {number} [heading=0] — horizontal facing (matches `body.userData.heading`; 0 = +Z)
   */
  function spawnAt(playerPos, heading = 0) {
    forward.set(Math.sin(heading), 0, Math.cos(heading));
    right.set(-forward.z, 0, forward.x);
    if (right.lengthSq() > 1e-8) right.normalize();
    tmp
      .copy(forward)
      .multiplyScalar(-devHud.cameraDistance)
      .addScaledVector(up, devHud.cameraHeight);
    smoothPos.copy(playerPos).add(tmp);
    clampCameraXZ(smoothPos);
    smoothLook
      .copy(playerPos)
      .addScaledVector(forward, devHud.cameraLookAhead);
    camera.position.copy(smoothPos);
    camera.lookAt(smoothLook);
    smoothFov = devHud.cameraBaseFov;
    camera.fov = smoothFov;
    camera.updateProjectionMatrix();
    spawned = true;
  }

  return { update, spawnAt, snapToGameplayChase, computeChaseFrame };
}
