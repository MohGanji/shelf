/**
 * P9.3 — gameplay particles: nitro exhaust, derez bursts, portal warp, shield shatter/shimmer,
 * power-up collection burst (shared with `powerups.js`).
 */

import * as THREE from "three";

/**
 * @param {string} h
 * @returns {number}
 */
export function hexColorToInt(h) {
  if (typeof h !== "string" || h[0] !== "#") return 0xffffff;
  const n = parseInt(h.slice(1), 16);
  return Number.isFinite(n) ? n : 0xffffff;
}

/**
 * @param {number} em
 * @returns {{ r: number; g: number; b: number }}
 */
function intToRgb(em) {
  return {
    r: ((em >> 16) & 255) / 255,
    g: ((em >> 8) & 255) / 255,
    b: (em & 255) / 255,
  };
}

/** P3.7 / P9.3 — pickup burst lifetime (seconds). */
export const PICKUP_BURST_DURATION = 0.38;

/**
 * @typedef {object} GameplayParticlesOpts
 * @property {import('three').Scene} scene
 * @property {import('../config.js').DEFAULT_DEV_HUD} devHud
 */

/**
 * @typedef {object} NitroEmitter
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} heading
 * @property {number} strength — 0–1
 * @property {number} colorHex — emissive color
 */

/**
 * @typedef {object} GameplayParticlesTickOpts
 * @property {NitroEmitter[]} [nitroEmitters]
 * @property {boolean} [shieldShimmer]
 * @property {{ x: number; y: number; z: number } | null} [shieldShimmerPos]
 */

/**
 * @param {GameplayParticlesOpts} opts
 */
export function createGameplayParticles(opts) {
  const { scene, devHud } = opts;

  /** @type {{ t: number; group: THREE.Group; geo: THREE.BufferGeometry; vel: Float32Array; mat: THREE.PointsMaterial; dur: number }[]} */
  const bursts = [];

  const NITRO_CAP = 520;
  const nitroPos = new Float32Array(NITRO_CAP * 3);
  const nitroVel = new Float32Array(NITRO_CAP * 3);
  const nitroLife = new Float32Array(NITRO_CAP);
  const nitroCol = new Float32Array(NITRO_CAP * 3);
  let nitroCount = 0;

  const nitroGeo = new THREE.BufferGeometry();
  nitroGeo.setAttribute("position", new THREE.BufferAttribute(nitroPos, 3).setUsage(THREE.DynamicDrawUsage));
  nitroGeo.setAttribute("color", new THREE.BufferAttribute(nitroCol, 3).setUsage(THREE.DynamicDrawUsage));
  const neonBase = typeof devHud.neonIntensity === "number" ? devHud.neonIntensity : 1;
  const nitroMat = new THREE.PointsMaterial({
    size: 0.055 + neonBase * 0.028,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
  });
  const nitroPoints = new THREE.Points(nitroGeo, nitroMat);
  nitroPoints.frustumCulled = false;
  scene.add(nitroPoints);

  let shimmerAcc = 0;

  /**
   * @param {number} wx
   * @param {number} wy
   * @param {number} wz
   * @param {number} em
   * @param {number} neon
   */
  function spawnPickupBurst(wx, wy, wz, em, neon) {
    const n = 40;
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const sp = 1.85 + Math.random() * 2.55;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * sp;
      velocities[i * 3 + 1] = Math.max(0.15, Math.cos(phi)) * sp * 0.55 + 0.75 + Math.random() * 0.65;
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: em,
      size: 0.085 + neon * 0.045,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    const group = new THREE.Group();
    group.position.set(wx, wy, wz);
    group.add(pts);
    scene.add(group);
    bursts.push({ t: 0, group, geo, vel: velocities, mat, dur: PICKUP_BURST_DURATION });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {string | number} color — `#rrggbb` or packed hex
   */
  function spawnDerezBurst(x, y, z, color) {
    const base =
      typeof color === "string"
        ? hexColorToInt(color)
        : typeof color === "number" && Number.isFinite(color)
          ? color
          : 0xff6600;
    const br = intToRgb(base);
    const n = 96;
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const sp = 2.2 + Math.random() * 5.5;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * sp;
      velocities[i * 3 + 1] = Math.max(0.2, Math.cos(phi)) * sp * 0.65 + 1.1 + Math.random();
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * sp;
      const mix = Math.random();
      const wr = mix * 0.85 + (1 - mix) * br.r;
      const wg = mix * 0.95 + (1 - mix) * br.g;
      const wb = mix * 1 + (1 - mix) * br.b;
      colors[i * 3] = wr;
      colors[i * 3 + 1] = wg;
      colors[i * 3 + 2] = wb;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09 + neonBase * 0.035,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.add(pts);
    scene.add(group);
    bursts.push({ t: 0, group, geo, vel: velocities, mat, dur: 0.52 });
  }

  /**
   * @param {{ x: number; z: number; colorHex: number }} from
   * @param {{ x: number; z: number; colorHex: number }} to
   */
  function spawnPortalWarp(from, to) {
    const em = from.colorHex;
    const rgb = intToRgb(em);

    function discBurst(cx, cz, boostY) {
      const n = 48;
      const positions = new Float32Array(n * 3);
      const velocities = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const r = 0.15 + Math.random() * 0.55;
        positions[i * 3] = Math.cos(a) * r * 0.1;
        positions[i * 3 + 1] = boostY + Math.random() * 0.15;
        positions[i * 3 + 2] = Math.sin(a) * r * 0.1;
        const sp = 2.8 + Math.random() * 2.2;
        velocities[i * 3] = Math.cos(a) * sp;
        velocities[i * 3 + 1] = (Math.random() - 0.3) * 1.2;
        velocities[i * 3 + 2] = Math.sin(a) * sp;
        colors[i * 3] = rgb.r;
        colors[i * 3 + 1] = rgb.g;
        colors[i * 3 + 2] = rgb.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.075 + neonBase * 0.03,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        sizeAttenuation: true,
      });
      const pts = new THREE.Points(geo, mat);
      const group = new THREE.Group();
      group.position.set(cx, 0.62, cz);
      group.add(pts);
      scene.add(group);
      bursts.push({ t: 0, group, geo, vel: velocities, mat, dur: 0.42 });
    }

    discBurst(from.x, from.z, 0);
    discBurst(to.x, to.z, 0);

    const zipN = 36;
    const zipPos = new Float32Array(zipN * 3);
    const zipVel = new Float32Array(zipN * 3);
    const zipCol = new Float32Array(zipN * 3);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.max(0.5, Math.hypot(dx, dz));
    const ux = dx / len;
    const uz = dz / len;
    for (let i = 0; i < zipN; i++) {
      const u = i / Math.max(1, zipN - 1);
      const wobble = (Math.random() - 0.5) * 1.1;
      const px = from.x + ux * len * u + (-uz) * wobble;
      const pz = from.z + uz * len * u + ux * wobble;
      zipPos[i * 3] = px;
      zipPos[i * 3 + 1] = 0.55 + Math.sin(u * Math.PI) * 0.35;
      zipPos[i * 3 + 2] = pz;
      const sp = 18 + Math.random() * 14;
      zipVel[i * 3] = ux * sp;
      zipVel[i * 3 + 1] = (Math.random() - 0.5) * 3;
      zipVel[i * 3 + 2] = uz * sp;
      const f = 0.65 + Math.random() * 0.35;
      zipCol[i * 3] = rgb.r * f;
      zipCol[i * 3 + 1] = rgb.g * f;
      zipCol[i * 3 + 2] = rgb.b * f;
    }
    const zipGeo = new THREE.BufferGeometry();
    zipGeo.setAttribute("position", new THREE.BufferAttribute(zipPos, 3));
    zipGeo.setAttribute("color", new THREE.BufferAttribute(zipCol, 3));
    const zipMat = new THREE.PointsMaterial({
      size: 0.065 + neonBase * 0.025,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    });
    const zipPts = new THREE.Points(zipGeo, zipMat);
    const zipGroup = new THREE.Group();
    zipGroup.add(zipPts);
    scene.add(zipGroup);
    bursts.push({ t: 0, group: zipGroup, geo: zipGeo, vel: zipVel, mat: zipMat, dur: 0.35 });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  function spawnShieldShatter(x, y, z) {
    const n = 64;
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const sp = 1.8 + Math.random() * 4.2;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * sp;
      velocities[i * 3 + 1] = Math.max(0.1, Math.cos(phi)) * sp * 0.8 + 0.6;
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * sp;
      const pur = i % 3;
      if (pur === 0) {
        colors[i * 3] = 0.85;
        colors[i * 3 + 1] = 0.45;
        colors[i * 3 + 2] = 1;
      } else if (pur === 1) {
        colors[i * 3] = 0.55;
        colors[i * 3 + 1] = 0.95;
        colors[i * 3 + 2] = 1;
      } else {
        colors[i * 3] = 0.95;
        colors[i * 3 + 1] = 0.75;
        colors[i * 3 + 2] = 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.08 + neonBase * 0.03,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.add(pts);
    scene.add(group);
    bursts.push({ t: 0, group, geo, vel: velocities, mat, dur: 0.45 });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  function spawnShieldSpark(x, y, z) {
    const n = 3;
    for (let k = 0; k < n; k++) {
      if (nitroCount >= NITRO_CAP - 4) return;
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * 0.85;
      const rx = Math.cos(a) * 1.05;
      const rz = Math.sin(a) * 1.05;
      const ry = Math.sin(el) * 0.35;
      const i = nitroCount;
      nitroPos[i * 3] = x + rx;
      nitroPos[i * 3 + 1] = y + 0.45 + ry;
      nitroPos[i * 3 + 2] = z + rz;
      nitroVel[i * 3] = (Math.random() - 0.5) * 0.6;
      nitroVel[i * 3 + 1] = 0.35 + Math.random() * 0.55;
      nitroVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      nitroLife[i] = 0.12 + Math.random() * 0.1;
      nitroCol[i * 3] = 0.75 + Math.random() * 0.2;
      nitroCol[i * 3 + 1] = 0.55 + Math.random() * 0.25;
      nitroCol[i * 3 + 2] = 1;
      nitroCount++;
    }
  }

  /**
   * @param {NitroEmitter} em
   */
  function pushNitroParticles(em) {
    const s = Math.sin(em.heading);
    const c = Math.cos(em.heading);
    const str = THREE.MathUtils.clamp(em.strength, 0, 1);
    const rgb = intToRgb(em.colorHex);
    const count = Math.min(6, Math.max(2, Math.floor(2 + str * 7)));
    for (let k = 0; k < count; k++) {
      if (nitroCount >= NITRO_CAP) return;
      const i = nitroCount;
      const bx = em.x - s * (0.38 + Math.random() * 0.12);
      const bz = em.z - c * (0.38 + Math.random() * 0.12);
      const by = em.y + 0.06 + Math.random() * 0.08;
      nitroPos[i * 3] = bx;
      nitroPos[i * 3 + 1] = by;
      nitroPos[i * 3 + 2] = bz;
      const sp = 2.4 + Math.random() * 4.5;
      nitroVel[i * 3] = -s * sp + (Math.random() - 0.5) * 1.1;
      nitroVel[i * 3 + 1] = 0.35 + Math.random() * 1.8;
      nitroVel[i * 3 + 2] = -c * sp + (Math.random() - 0.5) * 1.1;
      nitroLife[i] = 0.11 + Math.random() * 0.11;
      const flick = 0.75 + Math.random() * 0.25;
      nitroCol[i * 3] = Math.min(1, rgb.r * flick + 0.25);
      nitroCol[i * 3 + 1] = Math.min(1, rgb.g * flick + 0.35);
      nitroCol[i * 3 + 2] = Math.min(1, rgb.b * flick + 0.45);
      nitroCount++;
    }
  }

  /**
   * @param {number} dt
   * @param {GameplayParticlesTickOpts} [tickOpts]
   */
  function tick(dt, tickOpts) {
    const g = 5.5;
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      const posAttr = b.geo.attributes.position;
      const arr = /** @type {Float32Array} */ (posAttr.array);
      for (let p = 0; p < arr.length; p += 3) {
        arr[p] += b.vel[p] * dt;
        arr[p + 1] += b.vel[p + 1] * dt;
        arr[p + 2] += b.vel[p + 2] * dt;
        b.vel[p + 1] -= g * dt;
      }
      posAttr.needsUpdate = true;
      const u = b.t / b.dur;
      b.mat.opacity = Math.max(0, 1 - u * u * 1.12);
      if (b.t >= b.dur) {
        scene.remove(b.group);
        b.geo.dispose();
        b.mat.dispose();
        bursts.splice(i, 1);
      }
    }

    if (nitroCount > 0) {
      let i = 0;
      while (i < nitroCount) {
        nitroLife[i] -= dt;
        if (nitroLife[i] <= 0) {
          const last = nitroCount - 1;
          if (i !== last) {
            nitroPos[i * 3] = nitroPos[last * 3];
            nitroPos[i * 3 + 1] = nitroPos[last * 3 + 1];
            nitroPos[i * 3 + 2] = nitroPos[last * 3 + 2];
            nitroVel[i * 3] = nitroVel[last * 3];
            nitroVel[i * 3 + 1] = nitroVel[last * 3 + 1];
            nitroVel[i * 3 + 2] = nitroVel[last * 3 + 2];
            nitroLife[i] = nitroLife[last];
            nitroCol[i * 3] = nitroCol[last * 3];
            nitroCol[i * 3 + 1] = nitroCol[last * 3 + 1];
            nitroCol[i * 3 + 2] = nitroCol[last * 3 + 2];
          }
          nitroCount--;
          continue;
        }
        nitroPos[i * 3] += nitroVel[i * 3] * dt;
        nitroPos[i * 3 + 1] += nitroVel[i * 3 + 1] * dt;
        nitroPos[i * 3 + 2] += nitroVel[i * 3 + 2] * dt;
        nitroVel[i * 3 + 1] -= g * dt * 0.85;
        i++;
      }
      const posA = /** @type {THREE.BufferAttribute} */ (nitroGeo.attributes.position);
      const colA = /** @type {THREE.BufferAttribute} */ (nitroGeo.attributes.color);
      for (let i = 0; i < nitroCount; i++) {
        posA.array[i * 3] = nitroPos[i * 3];
        posA.array[i * 3 + 1] = nitroPos[i * 3 + 1];
        posA.array[i * 3 + 2] = nitroPos[i * 3 + 2];
        colA.array[i * 3] = nitroCol[i * 3];
        colA.array[i * 3 + 1] = nitroCol[i * 3 + 1];
        colA.array[i * 3 + 2] = nitroCol[i * 3 + 2];
      }
      posA.needsUpdate = true;
      colA.needsUpdate = true;
      nitroGeo.setDrawRange(0, nitroCount);
    } else {
      nitroGeo.setDrawRange(0, 0);
    }

    const emitters = tickOpts?.nitroEmitters;
    if (emitters && emitters.length > 0) {
      for (const em of emitters) {
        if (em.strength > 0.035) pushNitroParticles(em);
      }
    }

    if (tickOpts?.shieldShimmer && tickOpts.shieldShimmerPos) {
      const p = tickOpts.shieldShimmerPos;
      shimmerAcc += dt;
      while (shimmerAcc > 0.05) {
        shimmerAcc -= 0.05;
        spawnShieldSpark(p.x, p.y, p.z);
      }
    } else {
      shimmerAcc = 0;
    }

    nitroMat.size = 0.055 + (typeof devHud.neonIntensity === "number" ? devHud.neonIntensity : 1) * 0.028;
  }

  function dispose() {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      scene.remove(b.group);
      b.geo.dispose();
      b.mat.dispose();
      bursts.splice(i, 1);
    }
    scene.remove(nitroPoints);
    nitroGeo.dispose();
    nitroMat.dispose();
  }

  return {
    tick,
    spawnPickupBurst,
    spawnDerezBurst,
    spawnPortalWarp,
    spawnShieldShatter,
    dispose,
  };
}
