import * as THREE from "../vendor/three-module.js";
import { CYCLE_BOUNDS, TRON_COLORS, mergeDevHud } from "../config.js";
import { getCycleAssetTemplate, hasLoadedCycleAsset } from "./cycleAssetLoader.js";

export { preloadLightCycleAsset } from "./cycleAssetLoader.js";

/**
 * Enhanced Tron hull shader: multi-layer fresnel rim, procedural panel lines,
 * animated energy pulse scan. Injected via onBeforeCompile to preserve PBR lighting.
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ value: THREE.Color }} rimColorUniform
 * @param {{ value: number }} rimStrengthUniform
 * @param {{ value: number }} timeUniform
 * @param {{ panelLines?: boolean; energyPulse?: boolean }} [opts]
 */
function installTronShader(material, rimColorUniform, rimStrengthUniform, timeUniform, opts = {}) {
  const { panelLines = false, energyPulse = false } = opts;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTronRimColor = rimColorUniform;
    shader.uniforms.uTronRimStrength = rimStrengthUniform;
    shader.uniforms.uTronTime = timeUniform;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vTronWorldPos;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <fog_vertex>",
      "vTronWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <fog_vertex>",
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "varying vec3 vTronWorldPos;",
        "uniform vec3 uTronRimColor;",
        "uniform float uTronRimStrength;",
        "uniform float uTronTime;",
      ].join("\n"),
    );

    const lines = [
      "vec3 tronVD = normalize(vViewPosition);",
      "vec3 tronN  = normalize(normal);",
      "float tronDot = abs(dot(tronN, tronVD));",
      "",
      "float fresnelSoft  = pow(clamp(1.0 - tronDot, 0.0, 1.0), 2.0);",
      "float fresnelMid   = pow(clamp(1.0 - tronDot, 0.0, 1.0), 3.5);",
      "float fresnelSharp = pow(clamp(1.0 - tronDot, 0.0, 1.0), 6.0);",
      "float tronFresnel  = fresnelSoft * 0.25 + fresnelMid * 0.45 + fresnelSharp * 0.65;",
      "outgoingLight += uTronRimColor * tronFresnel * uTronRimStrength;",
    ];

    if (panelLines) {
      lines.push(
        "",
        "float plX = abs(fract(vTronWorldPos.x * 4.0 + 0.5) - 0.5);",
        "float plZ = abs(fract(vTronWorldPos.z * 1.5 + 0.5) - 0.5);",
        "float panelLine = smoothstep(0.47, 0.5, max(plX, plZ));",
        "outgoingLight += uTronRimColor * panelLine * 0.10 * uTronRimStrength;",
      );
    }

    if (energyPulse) {
      lines.push(
        "",
        "float scanPos  = fract(-vTronWorldPos.z * 0.35 + uTronTime * 0.6);",
        "float scanLine = smoothstep(0.0, 0.012, scanPos) * (1.0 - smoothstep(0.012, 0.07, scanPos));",
        "float scanGlow = smoothstep(0.0, 0.03, scanPos) * (1.0 - smoothstep(0.03, 0.16, scanPos));",
        "outgoingLight += uTronRimColor * (scanLine * 0.7 + scanGlow * 0.15) * uTronRimStrength;",
      );
    }

    lines.push("#include <opaque_fragment>");

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      lines.join("\n\t"),
    );
  };
  material.needsUpdate = true;
}

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
 * Procedural light cycle: **3×1×1** bounds, two **1×1×1** fat neon wheels (front/rear), central bridge body over the gap.
 * For a custom mesh, set `WORLD.lightCycleModelUrl` to a `.glb` (see `preloadLightCycleAsset`).
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

  /** Base emissive intensities — body mostly “normal”; thin wheel rim lines are the neon read. */
  const EMISSIVE = {
    hull: 0.18,
    stripStrong: 0.45,
    stripSoft: 0.28,
    wheelNeon: 2.0,
    glass: 0.14,
    underglow: 0.24,
    rearSlot: 0.35,
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
      color: 0x040608,
      metalness: 0.97,
      roughness: 0.22,
      emissive: emissiveDim,
      emissiveIntensity: EMISSIVE.hull * ns,
      envMapIntensity: 1.4,
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
  const wheelDarkMat = new THREE.MeshStandardMaterial({
    color: 0x050508,
    metalness: 0.75,
    roughness: 0.48,
  });
  const wheelGlowMat = new THREE.MeshStandardMaterial({
    color: primary.clone().multiplyScalar(0.06),
    metalness: 0.25,
    roughness: 0.35,
    emissive: primary.clone(),
    emissiveIntensity: EMISSIVE.wheelNeon * ns,
    side: THREE.DoubleSide,
  });
  /** Subtle halo only on rim lines (keeps post bloom from blowing out). */
  const rimBloomMat = new THREE.MeshBasicMaterial({
    color: primary,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
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
    opacity: 0.62,
    depthWrite: false,
  });
  const underglowMat = makeStripMaterial(EMISSIVE.underglow);
  underglowMat.transparent = true;
  underglowMat.opacity = 0.85;
  const rearAccentMat = makeStripMaterial(EMISSIVE.rearSlot);
  const hubGlowMat = new THREE.MeshBasicMaterial({
    color: primary.clone().multiplyScalar(0.25),
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const tronRimColorUniform = { value: primary.clone() };
  const tronTimeUniform = { value: 0 };
  /** @type {{ strength: { value: number }; k: number }[]} */
  const tronRimRows = [];

  function syncTronRim(mult = 1, neonScaleOverride) {
    const nScale =
      typeof neonScaleOverride === "number" && Number.isFinite(neonScaleOverride) ? neonScaleOverride : ns;
    const on = devHud.cycleFresnelRim !== false;
    const ri =
      typeof devHud.cycleFresnelRimIntensity === "number" && Number.isFinite(devHud.cycleFresnelRimIntensity)
        ? THREE.MathUtils.clamp(devHud.cycleFresnelRimIntensity, 0, 2)
        : 1;
    const factor = (on ? 1 : 0) * ri * nScale * mult;
    tronRimColorUniform.value.copy(primary);
    for (const row of tronRimRows) {
      row.strength.value = row.k * factor;
    }
  }

  function registerTronRim(material, k, shaderOpts = {}) {
    const strength = { value: 0 };
    installTronShader(material, tronRimColorUniform, strength, tronTimeUniform, shaderOpts);
    tronRimRows.push({ strength, k });
  }

  registerTronRim(bodyMat, 0.18, { panelLines: true, energyPulse: true });
  registerTronRim(stripMatStrong, 0.22, { energyPulse: true });
  registerTronRim(stripMatSoft, 0.15, { energyPulse: true });
  registerTronRim(wheelGlowMat, 0.48);
  registerTronRim(glassMat, 0.08);
  registerTronRim(underglowMat, 0.15, { energyPulse: true });
  registerTronRim(rearAccentMat, 0.20, { energyPulse: true });

  /**
   * Wheels occupy a true **1×1×1** cell each (no uniform “fit max” shrink on X): diameter Y/Z = 1, axle thickness X = {@link CYCLE_BOUNDS}.width.
   * Vehicle length **L** = two wheel diameters along Z + one gap: `gapZ = L - 2 * wheelDZ`.
   */
  const wheelDZ = W;
  const WHEEL = wheelDZ;
  const ringSeg = 72;
  const whROuter = H * 0.5;
  const whRInner = whROuter * 0.56;
  const whDepth = W;
  const whLineW = W * 0.035;

  /**
   * Flat annulus in XY, extruded along Z → rotate so thickness is along X (axle); hole is hubless.
   * @param {number} rInner
   * @param {number} rOuter
   * @param {number} depth
   */
  function createWasherGeometry(rInner, rOuter, depth) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      curveSegments: 24,
      bevelEnabled: false,
    });
    g.translate(0, 0, -depth * 0.5);
    g.rotateY(Math.PI / 2);
    disposableGeoms.push(g);
    return g;
  }

  /**
   * Narrow neon band between two radii, disk in YZ; normal ±X for rim lines on each side face (see Tron: Legacy ref.).
   */
  function addSideNeonLines(grp, xSign, rInner, rOuter, lineW) {
    const hx = 0.0004;
    const mk = (ri, ro, mat, order) => {
      if (ro - ri < 1e-6) return;
      const geo = new THREE.RingGeometry(ri, ro, ringSeg);
      disposableGeoms.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.y = xSign * (Math.PI / 2);
      mesh.position.x = xSign * (whDepth * 0.5 - hx);
      mesh.renderOrder = order;
      grp.add(mesh);
    };
    mk(rOuter - lineW, rOuter, wheelGlowMat, 2);
    mk(rInner, rInner + lineW, wheelGlowMat, 2);
    const bloomW = lineW * 1.55;
    mk(rOuter - bloomW, rOuter + lineW * 0.12, rimBloomMat, 1);
    mk(Math.max(0.004, rInner - lineW * 0.12), rInner + bloomW, rimBloomMat, 1);
  }

  function buildFatNeonWheel() {
    const grp = new THREE.Group();

    const gBody = createWasherGeometry(whRInner, whROuter, whDepth);
    grp.add(new THREE.Mesh(gBody, wheelDarkMat));

    const neonInset = whDepth * 0.12;
    const neonR = whRInner + (whROuter - whRInner) * 0.68;

    for (const side of [-1, 1]) {
      const xPos = side * (whDepth * 0.5 - neonInset);

      // Bold primary neon ring (single dominant circle like the Tron reference)
      const ringGeo = new THREE.RingGeometry(neonR - whLineW, neonR + whLineW, ringSeg);
      disposableGeoms.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, wheelGlowMat);
      ring.rotation.y = side * (Math.PI / 2);
      ring.position.x = xPos;
      ring.renderOrder = 2;
      grp.add(ring);

      // Wide bloom glow around the ring
      const bloomGeo = new THREE.RingGeometry(neonR - whLineW * 2.5, neonR + whLineW * 2.5, ringSeg);
      disposableGeoms.push(bloomGeo);
      const bloom = new THREE.Mesh(bloomGeo, rimBloomMat);
      bloom.rotation.y = side * (Math.PI / 2);
      bloom.position.x = xPos;
      bloom.renderOrder = 1;
      grp.add(bloom);

      // Subtle hub glow disc
      const hubGeo = new THREE.CircleGeometry(whRInner * 0.82, ringSeg);
      disposableGeoms.push(hubGeo);
      const hub = new THREE.Mesh(hubGeo, hubGlowMat);
      hub.rotation.y = side * (Math.PI / 2);
      hub.position.x = xPos;
      grp.add(hub);
    }

    return grp;
  }

  function groundAlign(obj) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;
  }

  const zFront = L * 0.5 - wheelDZ * 0.5;
  const zRear = -L * 0.5 + wheelDZ * 0.5;
  /** World-space length along Z between inner wheel faces (middle third when `L = 3` and `wheelDZ = 1`). */
  const gapZ = Math.max(0.05, L - 2 * wheelDZ);

  const wheelFront = buildFatNeonWheel();
  wheelFront.position.set(0, 0, zFront);
  groundAlign(wheelFront);
  animationRoot.add(wheelFront);

  const wheelRear = buildFatNeonWheel();
  wheelRear.position.set(0, 0, zRear);
  groundAlign(wheelRear);
  animationRoot.add(wheelRear);

  /** @type {THREE.Object3D[]} */
  const wheels = [wheelFront, wheelRear];

  // --- Full-length fuselage covering both wheels from above.
  //     Fairings ride above wheel tops; fender side-panels clamp down around each wheel.
  const bodyWidth = W * 0.92;
  const bodyExt = L * 0.5 - 0.04;
  const fairingY = H * 0.80;
  const gapBotY = H * 0.16;
  const rwi = -(gapZ * 0.5);
  const fwi = gapZ * 0.5;

  {
    const profile = new THREE.Shape();

    // Bottom edge: rear tip → over rear wheel → dip into gap → over front wheel → nose tip
    profile.moveTo(-bodyExt, fairingY + H * 0.08);
    profile.lineTo(-bodyExt * 0.68, fairingY);
    profile.lineTo(rwi + 0.05, fairingY - H * 0.10);
    profile.lineTo(rwi + 0.28, gapBotY);
    profile.lineTo(fwi - 0.28, gapBotY);
    profile.lineTo(fwi - 0.05, fairingY - H * 0.10);
    profile.lineTo(bodyExt * 0.68, fairingY);
    profile.lineTo(bodyExt, fairingY + H * 0.08);

    // Top edge: nose → cockpit peak → tail (traces back)
    profile.lineTo(bodyExt * 0.92, fairingY + H * 0.18);
    profile.lineTo(bodyExt * 0.72, H * 0.88);
    profile.lineTo(bodyExt * 0.30, H * 0.94);
    profile.lineTo(bodyExt * 0.06, H * 0.98);
    profile.lineTo(-bodyExt * 0.18, H * 0.96);
    profile.lineTo(-bodyExt * 0.48, H * 0.90);
    profile.lineTo(-bodyExt * 0.78, H * 0.88);
    profile.lineTo(-bodyExt * 0.92, fairingY + H * 0.14);

    profile.closePath();

    const fuselageGeo = new THREE.ExtrudeGeometry(profile, {
      depth: bodyWidth,
      bevelEnabled: true,
      bevelThickness: bodyWidth * 0.06,
      bevelSize: bodyWidth * 0.05,
      bevelSegments: 2,
      curveSegments: 1,
    });
    fuselageGeo.translate(0, 0, -bodyWidth * 0.5);
    fuselageGeo.rotateY(-Math.PI / 2);
    disposableGeoms.push(fuselageGeo);

    const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
    animationRoot.add(fuselage);

    const fuselageEdgeGeo = new THREE.EdgesGeometry(fuselageGeo, 22);
    disposableGeoms.push(fuselageEdgeGeo);
    fuselage.add(new THREE.LineSegments(fuselageEdgeGeo, hullEdgeMat));
  }

  // Cockpit canopy (sits on the peak of the central body)
  {
    const canopyProfile = new THREE.Shape();
    const cx0 = bodyExt * 0.30;
    const cx1 = -bodyExt * 0.15;
    const cBot = H * 0.93;
    const cTop = H * 1.02;

    canopyProfile.moveTo(cx1, cBot);
    canopyProfile.lineTo(cx0, cBot);
    canopyProfile.lineTo(cx0 - bodyExt * 0.04, cTop);
    canopyProfile.lineTo(cx1 + bodyExt * 0.03, cTop - H * 0.01);
    canopyProfile.closePath();

    const canopyW = bodyWidth * 0.58;
    const canopyGeo = new THREE.ExtrudeGeometry(canopyProfile, {
      depth: canopyW,
      bevelEnabled: true,
      bevelThickness: canopyW * 0.08,
      bevelSize: canopyW * 0.05,
      bevelSegments: 1,
      curveSegments: 1,
    });
    canopyGeo.translate(0, 0, -canopyW * 0.5);
    canopyGeo.rotateY(-Math.PI / 2);
    disposableGeoms.push(canopyGeo);

    animationRoot.add(new THREE.Mesh(canopyGeo, glassMat));
  }

  // Underglow strip (in the gap between wheels)
  {
    const underGeo = new THREE.BoxGeometry(bodyWidth * 0.85, H * 0.03, gapZ * 0.70);
    disposableGeoms.push(underGeo);
    const underglow = new THREE.Mesh(underGeo, underglowMat);
    underglow.position.set(0, H * 0.14, 0);
    animationRoot.add(underglow);
  }

  // Rear exhaust accent (at tail)
  {
    const rearSlotGeo = new THREE.BoxGeometry(bodyWidth * 0.40, H * 0.06, WHEEL * 0.06);
    disposableGeoms.push(rearSlotGeo);
    const rearAccent = new THREE.Mesh(rearSlotGeo, rearAccentMat);
    rearAccent.position.set(0, fairingY + H * 0.04, -bodyExt + 0.04);
    animationRoot.add(rearAccent);
  }

  // --- Neon accent strips following full-length body contour
  {
    function addNeonStrip(points, mat, radius, bloomRadius) {
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 24, radius, 4, false);
      disposableGeoms.push(tubeGeo);
      animationRoot.add(new THREE.Mesh(tubeGeo, mat));

      const bloomGeo = new THREE.TubeGeometry(curve, 24, bloomRadius, 4, false);
      disposableGeoms.push(bloomGeo);
      animationRoot.add(new THREE.Mesh(bloomGeo, rimBloomMat));
    }

    const nR = W * 0.018;
    const bR = W * 0.040;

    // Top spine strip (follows cockpit ridge end-to-end)
    addNeonStrip([
      new THREE.Vector3(0, fairingY + H * 0.12, -bodyExt * 0.90),
      new THREE.Vector3(0, H * 0.88, -bodyExt * 0.48),
      new THREE.Vector3(0, H * 0.96, -bodyExt * 0.18),
      new THREE.Vector3(0, H * 0.98, bodyExt * 0.06),
      new THREE.Vector3(0, H * 0.88, bodyExt * 0.72),
      new THREE.Vector3(0, fairingY + H * 0.16, bodyExt * 0.90),
    ], stripMatStrong, nR, bR);

    // Side accent strips (follow fender contour: high over wheels, dip through gap)
    for (const side of [-1, 1]) {
      const sx = side * (bodyWidth * 0.5 + bodyWidth * 0.04);
      addNeonStrip([
        new THREE.Vector3(sx, fairingY + H * 0.02, -bodyExt * 0.70),
        new THREE.Vector3(sx, fairingY - H * 0.06, rwi + 0.05),
        new THREE.Vector3(sx, H * 0.38, rwi + 0.30),
        new THREE.Vector3(sx, H * 0.38, fwi - 0.30),
        new THREE.Vector3(sx, fairingY - H * 0.06, fwi - 0.05),
        new THREE.Vector3(sx, fairingY + H * 0.02, bodyExt * 0.70),
      ], stripMatSoft, nR * 0.8, bR * 0.8);
    }

    // Under-body neon strip (in gap zone)
    addNeonStrip([
      new THREE.Vector3(0, H * 0.14, -gapZ * 0.30),
      new THREE.Vector3(0, H * 0.15, 0),
      new THREE.Vector3(0, H * 0.14, gapZ * 0.30),
    ], underglowMat, nR * 0.7, bR * 0.7);
  }

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
    wheelGlowMat.emissive.copy(primary);
    wheelGlowMat.color.copy(primary).multiplyScalar(0.06);
    underglowMat.emissive.copy(primary);
    rearAccentMat.emissive.copy(primary);
    rimBloomMat.color.copy(primary);
    hullEdgeMat.color.copy(primary);

    stripMatStrong.color.copy(primary).multiplyScalar(0.08);
    stripMatSoft.color.copy(primary).multiplyScalar(0.08);
    stripMatStrong.emissiveIntensity = EMISSIVE.stripStrong * ns;
    stripMatSoft.emissiveIntensity = EMISSIVE.stripSoft * ns;
    wheelGlowMat.emissiveIntensity = EMISSIVE.wheelNeon * ns;
    underglowMat.emissiveIntensity = EMISSIVE.underglow * ns;
    rearAccentMat.emissiveIntensity = EMISSIVE.rearSlot * ns;

    glassMat.emissive.copy(primary).multiplyScalar(0.35);
    glassMat.emissiveIntensity = EMISSIVE.glass * ns;
    hubGlowMat.color.copy(primary).multiplyScalar(0.25);
    syncTronRim(1);
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

    tronTimeUniform.value += dt;

    ns = neonScale();
    bodyMat.emissiveIntensity = EMISSIVE.hull * ns;
    stripMatStrong.emissiveIntensity = EMISSIVE.stripStrong * ns;
    stripMatSoft.emissiveIntensity = EMISSIVE.stripSoft * ns;
    wheelGlowMat.emissiveIntensity = EMISSIVE.wheelNeon * ns;
    underglowMat.emissiveIntensity = EMISSIVE.underglow * ns;
    rearAccentMat.emissiveIntensity = EMISSIVE.rearSlot * ns;
    glassMat.emissiveIntensity = EMISSIVE.glass * ns;
    syncTronRim(1);

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
    wheelGlowMat.emissiveIntensity = EMISSIVE.wheelNeon * n * emissivePulse;
    underglowMat.emissiveIntensity = EMISSIVE.underglow * n * emissivePulse;
    rearAccentMat.emissiveIntensity = EMISSIVE.rearSlot * n * emissivePulse;
    glassMat.emissiveIntensity = EMISSIVE.glass * n * emissivePulse;
    syncTronRim(emissivePulse, n);
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
    wheelDarkMat.dispose();
    wheelGlowMat.dispose();
    rimBloomMat.dispose();
    glassMat.dispose();
    hullEdgeMat.dispose();
    underglowMat.dispose();
    rearAccentMat.dispose();
    hubGlowMat.dispose();
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
