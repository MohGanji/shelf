import * as THREE from 'three';
import {
  CYCLE_BOUNDS,
  TRON_COLORS,
  mergeDevHud,
} from '../config.js';

/**
 * Procedural Tron-style light cycle mesh (plan P1.3): low-poly body, emissive strips,
 * side wheels with glow, parameterized primary neon color.
 *
 * @param {object} [options]
 * @param {number} [options.color] — primary emissive color (hex), default player cyan
 * @param {'player'|'enemy'} [options.variant] — picks default color when `color` omitted
 * @param {ReturnType<typeof mergeDevHud>} [options.devHud] — animation toggles + tuning (mutable)
 */
export function createLightCycle(options = {}) {
  const variant = options.variant ?? 'player';
  const defaultHex =
    variant === 'enemy' ? TRON_COLORS.enemyCycle : TRON_COLORS.playerCycle;
  let primaryHex = options.color ?? defaultHex;

  const devHud = options.devHud ?? mergeDevHud({});

  const root = new THREE.Group();
  const animationRoot = new THREE.Group();
  root.add(animationRoot);

  const { length: L, width: W, height: H } = CYCLE_BOUNDS;

  const primary = new THREE.Color(primaryHex);
  const bodyBase = primary.clone().multiplyScalar(0.22);
  const emissiveDim = primary.clone().multiplyScalar(0.35);

  function makeBodyMaterial() {
    return new THREE.MeshStandardMaterial({
      color: bodyBase,
      metalness: 0.88,
      roughness: 0.18,
      emissive: emissiveDim,
      emissiveIntensity: 0.9,
    });
  }

  function makeStripMaterial(intensity) {
    return new THREE.MeshStandardMaterial({
      color: primary.clone().multiplyScalar(0.15),
      metalness: 0.4,
      roughness: 0.35,
      emissive: primary.clone(),
      emissiveIntensity: intensity,
    });
  }

  let bodyMat = makeBodyMaterial();
  const stripMatStrong = makeStripMaterial(2.2);
  const stripMatSoft = makeStripMaterial(1.35);
  const wheelRimMat = makeBodyMaterial();
  const wheelGlowMat = makeStripMaterial(1.6);

  // --- Chassis (low deck)
  const chassisGeo = new THREE.BoxGeometry(W * 0.92, H * 0.28, L * 0.62);
  const chassis = new THREE.Mesh(chassisGeo, bodyMat);
  chassis.position.set(0, -H * 0.08, 0);
  animationRoot.add(chassis);

  // --- Forward fairing / nose
  const fairGeo = new THREE.BoxGeometry(W * 0.78, H * 0.42, L * 0.38);
  const fairing = new THREE.Mesh(fairGeo, bodyMat);
  fairing.position.set(0, H * 0.12, L * 0.2);
  animationRoot.add(fairing);

  // --- Rear hump
  const humpGeo = new THREE.BoxGeometry(W * 0.7, H * 0.36, L * 0.22);
  const hump = new THREE.Mesh(humpGeo, bodyMat);
  hump.position.set(0, H * 0.1, -L * 0.28);
  animationRoot.add(hump);

  // --- Center light spine
  const spineGeo = new THREE.BoxGeometry(W * 0.12, H * 0.06, L * 0.82);
  const spine = new THREE.Mesh(spineGeo, stripMatStrong);
  spine.position.set(0, H * 0.06, 0);
  animationRoot.add(spine);

  // --- Side accent rails
  const railGeo = new THREE.BoxGeometry(0.02, H * 0.1, L * 0.76);
  const railL = new THREE.Mesh(railGeo, stripMatSoft);
  railL.position.set(-W * 0.38, 0, 0);
  const railR = railL.clone();
  railR.position.x = W * 0.38;
  animationRoot.add(railL, railR);

  // --- Wheels (cylinder axis = X)
  const wheelRadius = W * 0.42;
  const wheelThickness = 0.035;
  const wheelGeo = new THREE.CylinderGeometry(
    wheelRadius,
    wheelRadius,
    wheelThickness,
    20,
  );
  wheelGeo.rotateZ(Math.PI / 2);

  const wheelL = new THREE.Mesh(wheelGeo, wheelRimMat);
  const wheelR = new THREE.Mesh(wheelGeo, wheelRimMat);
  const wx = W * 0.52 + wheelThickness * 0.5;
  wheelL.position.set(-wx, -H * 0.12, 0);
  wheelR.position.set(wx, -H * 0.12, 0);
  animationRoot.add(wheelL, wheelR);

  const glowGeo = new THREE.TorusGeometry(wheelRadius * 1.02, 0.018, 8, 28);
  glowGeo.rotateY(Math.PI / 2);
  const glowL = new THREE.Mesh(glowGeo, wheelGlowMat);
  const glowR = new THREE.Mesh(glowGeo, wheelGlowMat);
  wheelL.add(glowL);
  wheelR.add(glowR);

  const wheels = [wheelL, wheelR];

  /** Non-collidable nitro burst streak — additive planes behind rear (P1.6). */
  const nitroVfx = new THREE.Group();
  nitroVfx.position.set(0, H * 0.02, -L * 0.36);
  animationRoot.add(nitroVfx);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const streakGeo = new THREE.PlaneGeometry(W * 0.55, L * 0.22, 1, 1);
  const streakA = new THREE.Mesh(streakGeo, streakMat);
  streakA.rotation.x = -Math.PI * 0.42;
  streakA.position.z = -0.02;
  const streakB = new THREE.Mesh(streakGeo, streakMat);
  streakB.rotation.x = -Math.PI * 0.38;
  streakB.position.y = 0.04;
  streakB.rotation.z = 0.12;
  nitroVfx.add(streakA, streakB);

  let wheelSpin = 0;
  let tiltCurrent = 0;
  let pitchCurrent = 0;

  function applyPrimaryColor(hex) {
    primaryHex = hex;
    primary.set(hex);
    bodyBase.copy(primary).multiplyScalar(0.22);
    emissiveDim.copy(primary).multiplyScalar(0.35);

    bodyMat.color.copy(bodyBase);
    bodyMat.emissive.copy(emissiveDim);

    wheelRimMat.color.copy(bodyBase);
    wheelRimMat.emissive.copy(emissiveDim);

    stripMatStrong.emissive.copy(primary);
    stripMatSoft.emissive.copy(primary);
    wheelGlowMat.emissive.copy(primary);

    stripMatStrong.color.copy(primary).multiplyScalar(0.15);
    stripMatSoft.color.copy(primary).multiplyScalar(0.15);
  }

  applyPrimaryColor(primaryHex);

  /**
   * @param {number} dt
   * @param {object} input
   * @param {number} input.speed — signed forward speed (units/s); magnitude drives wheel spin
   * @param {number} input.steer — -1..1 turn input (A/D)
   * @param {boolean} [input.accelerating]
   * @param {boolean} [input.braking]
   * @param {number} [input.nitroBurstStrength] — 0–1 visual only (non-collidable nitro trail)
   */
  function update(dt, input) {
    if (dt <= 0) return;

    const speed = input.speed ?? 0;
    const steer = THREE.MathUtils.clamp(input.steer ?? 0, -1, 1);
    const accel = !!input.accelerating;
    const brake = !!input.braking;

    const tiltOn = devHud.cycleTiltOnSteer !== false;
    const tiltTarget = steer * devHud.cycleTiltMax * (tiltOn ? 1 : 0);
    const k = 1 - Math.exp(-devHud.cycleTiltSmoothing * dt);
    tiltCurrent = THREE.MathUtils.lerp(tiltCurrent, tiltTarget, k);

    let pitchTarget = 0;
    if (devHud.cycleLeanOnBrake && brake) {
      pitchTarget = devHud.cycleLeanBrakeAngle;
    } else if (devHud.cyclePitchOnAccel && accel && !brake) {
      pitchTarget = -devHud.cyclePitchAccelAngle;
    }
    pitchCurrent = THREE.MathUtils.lerp(pitchCurrent, pitchTarget, k);

    animationRoot.rotation.z = tiltCurrent;
    animationRoot.rotation.x = pitchCurrent;

    const spin = speed * devHud.cycleWheelSpinScale * dt;
    wheelSpin += spin;
    for (const w of wheels) {
      w.rotation.x = wheelSpin;
    }

    const nitroS = THREE.MathUtils.clamp(input.nitroBurstStrength ?? 0, 0, 1);
    streakMat.opacity = nitroS * 0.78;
    nitroVfx.visible = nitroS > 0.02;
  }

  function setPrimaryColor(hex) {
    applyPrimaryColor(hex);
  }

  function dispose() {
    chassisGeo.dispose();
    fairGeo.dispose();
    humpGeo.dispose();
    spineGeo.dispose();
    railGeo.dispose();
    wheelGeo.dispose();
    glowGeo.dispose();
    streakGeo.dispose();
    streakMat.dispose();
    bodyMat.dispose();
    stripMatStrong.dispose();
    stripMatSoft.dispose();
    wheelRimMat.dispose();
    wheelGlowMat.dispose();
  }

  return {
    root,
    animationRoot,
    get primaryColor() {
      return primaryHex;
    },
    setPrimaryColor,
    /** @param {Partial<typeof devHud>} patch */
    patchDevHud(patch) {
      Object.assign(devHud, patch);
    },
    getDevHud: () => devHud,
    update,
    dispose,
  };
}
