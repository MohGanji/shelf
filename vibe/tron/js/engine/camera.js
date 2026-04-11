import * as THREE from "three";

/**
 * Third-person chase camera: stays behind the player’s horizontal heading (velocity when moving,
 * else last facing / WASD intent). Smoothing uses `cameraDamping`. Nitro adds FOV + optional pull-back.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {import("../config.js").DEFAULT_DEV_HUD} devHud — mutable runtime HUD
 */
export function createChaseCamera(camera, devHud) {
  const smoothPos = new THREE.Vector3();
  const smoothLook = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();

  let smoothFov = devHud.cameraBaseFov;
  let spawned = false;

  /**
   * @param {THREE.Vector3} playerPos
   * @param {import("cannon-es").Vec3} playerVel
   * @param {{ w?: boolean; a?: boolean; s?: boolean; d?: boolean }} keys
   * @param {number} nitroStrength 0–1 (visual / burst strength)
   */
  function update(dt, { playerPos, playerVel, keys, nitroStrength }) {
    if (dt <= 0) return;

    const vx = playerVel.x;
    const vz = playerVel.z;
    const hs = Math.hypot(vx, vz);

    let ix = 0;
    let iz = 0;
    if (keys.w) iz -= 1;
    if (keys.s) iz += 1;
    if (keys.a) ix -= 1;
    if (keys.d) ix += 1;
    const intentLen = Math.hypot(ix, iz);

    if (hs > 0.2) {
      forward.set(vx / hs, 0, vz / hs);
    } else if (intentLen > 1e-5) {
      forward.set(ix / intentLen, 0, iz / intentLen);
    }

    right.set(-forward.z, 0, forward.x);
    if (right.lengthSq() > 1e-8) right.normalize();

    const steer = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);

    const n = Math.max(0, Math.min(1, nitroStrength));
    const dist =
      devHud.cameraDistance +
      (devHud.nitroCameraPullBack ? n * devHud.nitroPullBackAdd : 0);

    const desiredPos = tmp
      .copy(playerPos)
      .addScaledVector(forward, -dist)
      .addScaledVector(up, devHud.cameraHeight)
      .addScaledVector(right, steer * devHud.cameraTurnOffset * 0.2);

    const look = new THREE.Vector3()
      .copy(playerPos)
      .addScaledVector(forward, devHud.cameraLookAhead)
      .addScaledVector(right, steer * devHud.cameraTurnOffset * 0.35);

    const k = 1 - Math.exp(-devHud.cameraDamping * 22 * dt);
    if (!spawned) {
      smoothPos.copy(desiredPos);
      smoothLook.copy(look);
      spawned = true;
    } else {
      smoothPos.lerp(desiredPos, k);
      smoothLook.lerp(look, k);
    }

    camera.position.copy(smoothPos);
    camera.lookAt(smoothLook);

    const targetFov =
      devHud.cameraBaseFov +
      (devHud.nitroFovWiden ? n * devHud.nitroFovAdd : 0);
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

  return { update, spawnAt };
}
