import * as THREE from "../vendor/three-module.js";
import { CYCLE_BOUNDS, TRON_COLORS, mergeDevHud } from "../config.js";
import { getCycleAssetTemplate, hasLoadedCycleAsset } from "./cycleAssetLoader.js";

export { preloadLightCycleAsset } from "./cycleAssetLoader.js";

/**
 * Procedural mesh, or a loaded GLB/GLTF/SVG if {@link preloadLightCycleAsset} succeeded.
 *
 * @param {object} [options]
 * @param {number} [options.color] — primary emissive color (hex), default player cyan
 * @param {'player'|'enemy'} [options.variant] — picks default color when `color` omitted
 * @param {ReturnType<typeof mergeDevHud>} [options.devHud] — animation toggles + tuning (mutable)
 */
export function createLightCycle(options = {}) {
  if (hasLoadedCycleAsset()) {
    return createAssetBasedLightCycle(options);
  }
  return createProceduralLightCycle(options);
}

/**
 * Procedural Tron: Legacy–style silhouette: **front + rear hubless wheels**, low bridging hull,
 * tinted cockpit, cyan contour tubes — sized from {@link CYCLE_BOUNDS} (local **+Z** forward).
 * For film-accurate detail, set `WORLD.lightCycleModelUrl` to a `.glb` (see `preloadLightCycleAsset`).
 *
 * @param {object} [options]
 */
export function createProceduralLightCycle(options = {}) {
  const variant = options.variant ?? "player";
  const defaultHex =
    variant === "enemy" ? TRON_COLORS.enemyCycle : TRON_COLORS.playerCycle;
  let primaryHex = options.color ?? defaultHex;

  const devHud = options.devHud ?? mergeDevHud({});

  const root = new THREE.Group();
  const animationRoot = new THREE.Group();
  root.add(animationRoot);

  const { length: L, width: W, height: H } = CYCLE_BOUNDS;

  const primary = new THREE.Color(primaryHex);
  const bodyBase = primary.clone().multiplyScalar(0.08);
  const emissiveDim = primary.clone().multiplyScalar(0.22);

  /** Base emissive intensities before Dev HUD `neonIntensity` scaling + derez pulse. */
  const EMISSIVE = {
    hull: 0.38,
    stripStrong: 3.05,
    stripSoft: 1.68,
    wheelNeon: 2.65,
    glass: 0.22,
    underglow: 0.95,
    rearSlot: 2.2,
  };

  function neonScale() {
    const n = devHud.neonIntensity;
    return typeof n === "number" && Number.isFinite(n) ? Math.max(0.2, Math.min(2.5, n)) : 1;
  }
  let ns = neonScale();

  /** @type {THREE.BufferGeometry[]} */
  const disposableGeoms = [];

  function makeHullMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      metalness: 0.92,
      roughness: 0.42,
      emissive: emissiveDim,
      emissiveIntensity: EMISSIVE.hull * ns,
    });
  }

  function makeStripMaterial(baseIntensity) {
    const m = new THREE.MeshStandardMaterial({
      color: primary.clone().multiplyScalar(0.08),
      metalness: 0.4,
      roughness: 0.28,
      emissive: primary.clone(),
      emissiveIntensity: baseIntensity * ns,
    });
    return m;
  }

  let bodyMat = makeHullMaterial();
  const stripMatStrong = makeStripMaterial(EMISSIVE.stripStrong);
  const stripMatSoft = makeStripMaterial(EMISSIVE.stripSoft);
  const stripMatFaint = makeStripMaterial(EMISSIVE.stripSoft * 0.55);
  const wheelDarkMat = new THREE.MeshStandardMaterial({
    color: 0x050508,
    metalness: 0.75,
    roughness: 0.48,
  });
  const wheelGlowMat = makeStripMaterial(EMISSIVE.wheelNeon);
  const rimBloomMat = new THREE.MeshBasicMaterial({
    color: primary,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x040810,
    metalness: 0.96,
    roughness: 0.06,
    transparent: true,
    opacity: 0.36,
    emissive: 0x001018,
    emissiveIntensity: EMISSIVE.glass * ns,
  });
  const hullEdgeMat = new THREE.LineBasicMaterial({
    color: primary,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const underglowMat = makeStripMaterial(EMISSIVE.underglow);
  underglowMat.transparent = true;
  underglowMat.opacity = 0.85;
  const rearAccentMat = makeStripMaterial(EMISSIVE.rearSlot);

  /** Hubless torus: major radius R, tube r; wheel plane YZ, axle X (rotation.y = π/2). */
  const wheelR = Math.min(H * 0.48, L * 0.14, 0.19);
  const wheelTube = Math.max(0.022, wheelR * 0.24);
  const torusSeg = 48;
  const tubeSeg = 64;

  function buildHublessWheel() {
    const g = new THREE.TorusGeometry(wheelR, wheelTube, torusSeg, tubeSeg);
    disposableGeoms.push(g);
    const tire = new THREE.Mesh(g, wheelDarkMat);
    tire.rotation.y = Math.PI / 2;
    const gGlow = new THREE.TorusGeometry(wheelR * 1.06, wheelTube * 0.42, torusSeg / 2, tubeSeg);
    disposableGeoms.push(gGlow);
    const bloom = new THREE.Mesh(gGlow, rimBloomMat);
    bloom.rotation.y = Math.PI / 2;
    bloom.renderOrder = 2;
    const gNeon = new THREE.TorusGeometry(wheelR * 1.04, Math.max(0.006, wheelTube * 0.2), 24, tubeSeg);
    disposableGeoms.push(gNeon);
    const neon = new THREE.Mesh(gNeon, wheelGlowMat);
    neon.rotation.y = Math.PI / 2;
    neon.renderOrder = 2;
    const grp = new THREE.Group();
    grp.add(tire, bloom, neon);
    return grp;
  }

  function groundAlign(obj) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;
  }

  const zFront = L * 0.5 - wheelR * 0.75;
  const zRear = -L * 0.5 + wheelR * 0.75;

  const wheelFront = buildHublessWheel();
  wheelFront.position.set(0, 0, zFront);
  groundAlign(wheelFront);
  animationRoot.add(wheelFront);

  const wheelRear = buildHublessWheel();
  wheelRear.position.set(0, 0, zRear);
  groundAlign(wheelRear);
  animationRoot.add(wheelRear);

  /** @type {THREE.Object3D[]} */
  const wheels = [wheelFront, wheelRear];

  // --- Bridging hull (low pan + sweeping top shell between the wheels)
  const panGeo = new THREE.BoxGeometry(W * 0.72, H * 0.14, L * 0.62);
  disposableGeoms.push(panGeo);
  const pan = new THREE.Mesh(panGeo, bodyMat);
  pan.position.set(0, H * 0.08, 0);
  groundAlign(pan);
  animationRoot.add(pan);

  const shellGeo = new THREE.SphereGeometry(Math.max(W, H) * 0.85, 36, 26);
  disposableGeoms.push(shellGeo);
  const shell = new THREE.Mesh(shellGeo, bodyMat);
  shell.scale.set(W * 3.05, H * 0.52, L * 0.5);
  shell.position.set(0, H * 0.27, -L * 0.03);
  shell.rotation.x = -0.09;
  animationRoot.add(shell);

  const noseGeo = new THREE.BoxGeometry(W * 0.78, H * 0.38, L * 0.2);
  disposableGeoms.push(noseGeo);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.position.set(0, H * 0.14, L * 0.38);
  animationRoot.add(nose);
  const noseEdgeGeo = new THREE.EdgesGeometry(noseGeo, 32);
  disposableGeoms.push(noseEdgeGeo);
  nose.add(new THREE.LineSegments(noseEdgeGeo, hullEdgeMat));

  const chinGeo = new THREE.BoxGeometry(W * 0.62, H * 0.1, L * 0.08);
  disposableGeoms.push(chinGeo);
  const chin = new THREE.Mesh(chinGeo, bodyMat);
  chin.position.set(0, H * 0.05, L * 0.48);
  animationRoot.add(chin);

  const panEdgeGeo = new THREE.EdgesGeometry(panGeo, 28);
  disposableGeoms.push(panEdgeGeo);
  pan.add(new THREE.LineSegments(panEdgeGeo, hullEdgeMat));

  const deckGeo = new THREE.BoxGeometry(W * 0.92, H * 0.06, L * 0.55);
  disposableGeoms.push(deckGeo);
  const deckGlow = new THREE.Mesh(deckGeo, stripMatSoft);
  deckGlow.position.set(0, H * 0.26, -L * 0.04);
  animationRoot.add(deckGlow);

  const underGeo = new THREE.BoxGeometry(W * 0.88, H * 0.035, L * 0.58);
  disposableGeoms.push(underGeo);
  const underglow = new THREE.Mesh(underGeo, underglowMat);
  underglow.position.set(0, H * 0.025, -L * 0.02);
  groundAlign(underglow);
  animationRoot.add(underglow);

  const rearSlotGeo = new THREE.BoxGeometry(W * 0.22, H * 0.06, L * 0.06);
  disposableGeoms.push(rearSlotGeo);
  const rearAccent = new THREE.Mesh(rearSlotGeo, rearAccentMat);
  rearAccent.position.set(0, H * 0.14, zRear + wheelR * 0.15);
  animationRoot.add(rearAccent);

  const spineGeo = new THREE.BoxGeometry(W * 0.18, H * 0.05, L * 0.58);
  disposableGeoms.push(spineGeo);
  const spine = new THREE.Mesh(spineGeo, stripMatStrong);
  spine.position.set(0, H * 0.3, -L * 0.02);
  animationRoot.add(spine);

  const canopyGeo = new THREE.SphereGeometry(W * 2.4, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
  disposableGeoms.push(canopyGeo);
  const canopy = new THREE.Mesh(canopyGeo, glassMat);
  canopy.scale.set(1, 0.5, 1.05);
  canopy.position.set(0, H * 0.38, L * 0.12);
  animationRoot.add(canopy);

  // --- “C” contour neon (side ribbons) + inner faint trace for circuitry depth
  function sideContour(xSign, mat, tubeR, curveIn) {
    const inset = curveIn ? 0.92 : 1;
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(xSign * W * 0.52 * inset, H * 0.1, zFront - wheelR * 0.4),
      new THREE.Vector3(xSign * W * 0.58 * inset, H * 0.3, L * 0.1),
      new THREE.Vector3(xSign * W * 0.54 * inset, H * 0.26, -L * 0.2),
      new THREE.Vector3(xSign * W * 0.46 * inset, H * 0.07, zRear + wheelR * 0.38),
    );
    const tubeGeo = new THREE.TubeGeometry(curve, 56, tubeR, 7, false);
    disposableGeoms.push(tubeGeo);
    const m = new THREE.Mesh(tubeGeo, mat);
    m.renderOrder = 1;
    return m;
  }
  animationRoot.add(
    sideContour(1, stripMatStrong, 0.013, false),
    sideContour(-1, stripMatStrong, 0.013, false),
    sideContour(1, stripMatFaint, 0.0065, true),
    sideContour(-1, stripMatFaint, 0.0065, true),
  );

  /** Equippable shield dome — neon wire + translucent shell (plan P3.4). */
  const shieldBubble = new THREE.Group();
  shieldBubble.name = "shield-bubble";
  const shieldR = Math.max(L, W * 4, H * 3) * 0.55;
  const shieldFill = new THREE.Mesh(
    new THREE.SphereGeometry(shieldR, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0x9966ff,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const shieldWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(shieldR * 1.02, 2),
    new THREE.MeshBasicMaterial({
      color: 0xdd99ff,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  shieldBubble.add(shieldFill, shieldWire);
  shieldBubble.visible = false;
  animationRoot.add(shieldBubble);

  let shieldPulse = 0;

  /** Non-collidable nitro burst streak — additive planes behind rear (P1.6). */
  const nitroVfx = new THREE.Group();
  nitroVfx.position.set(0, H * 0.04, -L * 0.42);
  animationRoot.add(nitroVfx);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const streakGeo = new THREE.PlaneGeometry(W * 4.2, L * 0.2, 1, 1);
  disposableGeoms.push(streakGeo);
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
    bodyBase.copy(primary).multiplyScalar(0.08);
    emissiveDim.copy(primary).multiplyScalar(0.22);
    ns = neonScale();

    bodyMat.emissive.copy(emissiveDim);
    bodyMat.emissiveIntensity = EMISSIVE.hull * ns;
    stripMatStrong.emissive.copy(primary);
    stripMatSoft.emissive.copy(primary);
    stripMatFaint.emissive.copy(primary);
    wheelGlowMat.emissive.copy(primary);
    underglowMat.emissive.copy(primary);
    rearAccentMat.emissive.copy(primary);
    rimBloomMat.color.copy(primary);
    hullEdgeMat.color.copy(primary);

    stripMatStrong.color.copy(primary).multiplyScalar(0.08);
    stripMatSoft.color.copy(primary).multiplyScalar(0.08);
    stripMatFaint.color.copy(primary).multiplyScalar(0.05);

    stripMatStrong.emissiveIntensity = EMISSIVE.stripStrong * ns;
    stripMatSoft.emissiveIntensity = EMISSIVE.stripSoft * ns;
    stripMatFaint.emissiveIntensity = EMISSIVE.stripSoft * 0.55 * ns;
    wheelGlowMat.emissiveIntensity = EMISSIVE.wheelNeon * ns;
    underglowMat.emissiveIntensity = EMISSIVE.underglow * ns;
    rearAccentMat.emissiveIntensity = EMISSIVE.rearSlot * ns;

    glassMat.emissive.copy(primary).multiplyScalar(0.35);
    glassMat.emissiveIntensity = EMISSIVE.glass * ns;
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
   * @param {'off'|'deploy'|'active'} [input.shieldBubbleMode] — P3.4 equippable shield dome
   */
  function update(dt, input) {
    if (dt <= 0) return;

    ns = neonScale();
    bodyMat.emissiveIntensity = EMISSIVE.hull * ns;
    stripMatStrong.emissiveIntensity = EMISSIVE.stripStrong * ns;
    stripMatSoft.emissiveIntensity = EMISSIVE.stripSoft * ns;
    stripMatFaint.emissiveIntensity = EMISSIVE.stripSoft * 0.55 * ns;
    wheelGlowMat.emissiveIntensity = EMISSIVE.wheelNeon * ns;
    underglowMat.emissiveIntensity = EMISSIVE.underglow * ns;
    rearAccentMat.emissiveIntensity = EMISSIVE.rearSlot * ns;
    glassMat.emissiveIntensity = EMISSIVE.glass * ns;

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

    const shieldMode = input.shieldBubbleMode ?? "off";
    if (shieldMode === "off") {
      shieldBubble.visible = false;
    } else {
      shieldBubble.visible = true;
      shieldPulse += dt * (shieldMode === "deploy" ? 14 : 5.5);
      const pulse = 0.5 + 0.5 * Math.sin(shieldPulse);
      shieldFill.material.opacity = shieldMode === "deploy" ? 0.04 + pulse * 0.05 : 0.08 + pulse * 0.04;
      shieldWire.material.opacity = shieldMode === "deploy" ? 0.25 + pulse * 0.35 : 0.5 + pulse * 0.22;
      shieldBubble.scale.setScalar(shieldMode === "deploy" ? 0.72 + pulse * 0.12 : 1);
    }
  }

  function setPrimaryColor(hex) {
    applyPrimaryColor(hex);
  }

  /**
   * Player derez implosion (plan P2.4): shrink + spin + emissive spike, then fade.
   * @param {number} dt
   * @param {number} u — progress 0–1 through derez sequence
   */
  function updateDerezImplosion(dt, u) {
    if (dt <= 0) return;
    const clamped = THREE.MathUtils.clamp(u, 0, 1);
    const shrink = Math.max(0.02, 1 - Math.pow(clamped, 1.35));
    animationRoot.scale.setScalar(shrink);
    animationRoot.rotation.y += dt * (6 + clamped * 24);
    animationRoot.rotation.x += dt * (2 + clamped * 8) * Math.sin(clamped * 20);
    animationRoot.rotation.z = Math.sin(clamped * 18) * 0.45 * (1 - clamped);

    const emissivePulse = clamped < 0.22 ? 1 + (1 - clamped / 0.22) * 2.2 : (1 - clamped) * 0.9;
    const n = neonScale();
    bodyMat.emissiveIntensity = EMISSIVE.hull * n * emissivePulse;
    stripMatStrong.emissiveIntensity = EMISSIVE.stripStrong * n * emissivePulse;
    stripMatSoft.emissiveIntensity = EMISSIVE.stripSoft * n * emissivePulse;
    stripMatFaint.emissiveIntensity = EMISSIVE.stripSoft * 0.55 * n * emissivePulse;
    wheelGlowMat.emissiveIntensity = EMISSIVE.wheelNeon * n * emissivePulse;
    underglowMat.emissiveIntensity = EMISSIVE.underglow * n * emissivePulse;
    rearAccentMat.emissiveIntensity = EMISSIVE.rearSlot * n * emissivePulse;
    glassMat.emissiveIntensity = EMISSIVE.glass * n * emissivePulse;
  }

  function dispose() {
    for (const g of disposableGeoms) g.dispose();
    streakMat.dispose();
    shieldFill.geometry.dispose();
    shieldWire.geometry.dispose();
    shieldFill.material.dispose();
    shieldWire.material.dispose();
    bodyMat.dispose();
    stripMatStrong.dispose();
    stripMatSoft.dispose();
    stripMatFaint.dispose();
    wheelDarkMat.dispose();
    wheelGlowMat.dispose();
    rimBloomMat.dispose();
    glassMat.dispose();
    hullEdgeMat.dispose();
    underglowMat.dispose();
    rearAccentMat.dispose();
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
    updateDerezImplosion,
    dispose,
  };
}

/**
 * Loaded GLTF/SVG mesh + same gameplay VFX as procedural (shield, nitro).
 * Name meshes with "wheel" (case-insensitive) for spin animation.
 * @param {object} [options]
 */
function createAssetBasedLightCycle(options = {}) {
  const tpl = getCycleAssetTemplate();
  if (!tpl) return createProceduralLightCycle(options);

  const variant = options.variant ?? "player";
  const defaultHex =
    variant === "enemy" ? TRON_COLORS.enemyCycle : TRON_COLORS.playerCycle;
  let primaryHex = options.color ?? defaultHex;
  const devHud = options.devHud ?? mergeDevHud({});

  const model = tpl.clone(true);
  const root = new THREE.Group();
  const animationRoot = new THREE.Group();
  animationRoot.add(model);
  root.add(animationRoot);

  const { length: L, width: W, height: H } = CYCLE_BOUNDS;
  const primary = new THREE.Color(primaryHex);

  /** @type {THREE.Mesh[]} */
  const wheelMeshes = [];
  /** @type {THREE.MeshStandardMaterial[]} */
  const tintMaterials = [];

  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name && /wheel/i.test(o.name)) wheelMeshes.push(o);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m.isMeshStandardMaterial && !tintMaterials.includes(m)) tintMaterials.push(m);
    }
  });

  const shieldBubble = new THREE.Group();
  shieldBubble.name = "shield-bubble";
  const shieldR = Math.max(L, W * 4, H * 3) * 0.55;
  const shieldFill = new THREE.Mesh(
    new THREE.SphereGeometry(shieldR, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0x9966ff,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const shieldWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(shieldR * 1.02, 2),
    new THREE.MeshBasicMaterial({
      color: 0xdd99ff,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  shieldBubble.add(shieldFill, shieldWire);
  shieldBubble.visible = false;
  animationRoot.add(shieldBubble);

  let shieldPulse = 0;

  const nitroVfx = new THREE.Group();
  nitroVfx.position.set(0, H * 0.04, -L * 0.42);
  animationRoot.add(nitroVfx);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const streakGeo = new THREE.PlaneGeometry(W * 4.2, L * 0.2, 1, 1);
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
    for (const m of tintMaterials) {
      m.emissive.copy(primary);
      m.emissiveIntensity = Math.max(1.1, m.emissiveIntensity ?? 0.8);
      m.color.copy(primary).multiplyScalar(0.18);
    }
  }

  applyPrimaryColor(primaryHex);

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
    for (const w of wheelMeshes) {
      w.rotation.x = wheelSpin;
    }

    const nitroS = THREE.MathUtils.clamp(input.nitroBurstStrength ?? 0, 0, 1);
    streakMat.opacity = nitroS * 0.78;
    nitroVfx.visible = nitroS > 0.02;

    const shieldMode = input.shieldBubbleMode ?? "off";
    if (shieldMode === "off") {
      shieldBubble.visible = false;
    } else {
      shieldBubble.visible = true;
      shieldPulse += dt * (shieldMode === "deploy" ? 14 : 5.5);
      const pulse = 0.5 + 0.5 * Math.sin(shieldPulse);
      shieldFill.material.opacity = shieldMode === "deploy" ? 0.04 + pulse * 0.05 : 0.08 + pulse * 0.04;
      shieldWire.material.opacity = shieldMode === "deploy" ? 0.25 + pulse * 0.35 : 0.5 + pulse * 0.22;
      shieldBubble.scale.setScalar(shieldMode === "deploy" ? 0.72 + pulse * 0.12 : 1);
    }
  }

  function setPrimaryColor(hex) {
    applyPrimaryColor(hex);
  }

  function updateDerezImplosion(dt, u) {
    if (dt <= 0) return;
    const clamped = THREE.MathUtils.clamp(u, 0, 1);
    const shrink = Math.max(0.02, 1 - Math.pow(clamped, 1.35));
    animationRoot.scale.setScalar(shrink);
    animationRoot.rotation.y += dt * (6 + clamped * 24);
    animationRoot.rotation.x += dt * (2 + clamped * 8) * Math.sin(clamped * 20);
    animationRoot.rotation.z = Math.sin(clamped * 18) * 0.45 * (1 - clamped);

    const emissivePulse = clamped < 0.22 ? 1 + (1 - clamped / 0.22) * 2.2 : (1 - clamped) * 0.9;
    for (const m of tintMaterials) {
      m.emissiveIntensity = (m.emissiveIntensity ?? 1) * emissivePulse * 1.2;
    }
  }

  function dispose() {
    streakGeo.dispose();
    streakMat.dispose();
    shieldFill.geometry.dispose();
    shieldWire.geometry.dispose();
    shieldFill.material.dispose();
    shieldWire.material.dispose();
    model.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose();
      }
    });
  }

  return {
    root,
    animationRoot,
    get primaryColor() {
      return primaryHex;
    },
    setPrimaryColor,
    patchDevHud(patch) {
      Object.assign(devHud, patch);
    },
    getDevHud: () => devHud,
    update,
    updateDerezImplosion,
    dispose,
  };
}
