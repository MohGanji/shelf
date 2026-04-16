/**
 * Gate wall objects — neon arcs, trigger volumes, open vs locked signage (plan P5.6).
 */

import * as THREE from "../vendor/three-module.js";
import { parseCampaignLevelIndex } from "../levels/loader.js";
import { GATE_WIDTH, LOBBY_LEVEL_ID } from "../levels/schema.js";

export { GATE_WIDTH };

/** @typedef {"north" | "south" | "east" | "west"} WallEdge */

/** @typedef {"entrance" | "exit" | "arena" | "garage" | "architect"} GateRole */

/** Canonical role strings (must match `levels/schema.js` validation). */
export const GATE_ROLES = Object.freeze(
  /** @type {readonly GateRole[]} */ ([
    "entrance",
    "exit",
    "arena",
    "garage",
    "architect",
  ]),
);

/**
 * @param {unknown} role
 * @returns {role is GateRole}
 */
export function isGateRole(role) {
  return typeof role === "string" && GATE_ROLES.includes(/** @type {GateRole} */ (role));
}

/**
 * Facing = wall inward normal (plan § Spawn System). Unit vector in XZ plane for stationary spawn heading.
 * @param {WallEdge} edge — which perimeter edge the gate sits on
 * @returns {{ x: number; z: number }}
 */
export function inwardNormalFromEdge(edge) {
  switch (edge) {
    case "south":
      return { x: 0, z: 1 };
    case "north":
      return { x: 0, z: -1 };
    case "east":
      return { x: -1, z: 0 };
    case "west":
      return { x: 1, z: 0 };
    default:
      return { x: 0, z: 1 };
  }
}

/**
 * @param {unknown} levelId
 * @returns {boolean}
 */
export function isLobbyLevelId(levelId) {
  return levelId === LOBBY_LEVEL_ID;
}

/**
 * After BOOT the session should use the fixed lobby JSON; the north-wall arena gate sign shows which
 * campaign arena is next (`save.progress.currentLevel`, plan § Lobby / Gate List).
 *
 * @param {Record<string, unknown> | null | undefined} level
 * @param {number} nextArenaLevelIndex — e.g. `save.progress.currentLevel` (1 = first arena)
 * @returns {Record<string, unknown> | null | undefined}
 */
export function withLobbyRuntimeGateOverrides(level, nextArenaLevelIndex) {
  if (!level || typeof level !== "object" || level.id !== LOBBY_LEVEL_ID) return level;
  if (!Array.isArray(level.wallObjects)) return level;
  const n = Math.max(1, Math.floor(nextArenaLevelIndex));
  const wallObjects = level.wallObjects.map((wo) => {
    if (!wo || typeof wo !== "object" || wo.type !== "gate") return wo;
    const g = /** @type {Record<string, unknown>} */ (wo);
    if (g.role !== "arena") return wo;
    return { ...g, signText: `ENTER ARENA ${n}` };
  });
  return { ...level, wallObjects };
}

/**
 * Lobby START gate: lock + sign when no arenas, all levels cleared, or missing level JSON (plan § Lobby / P7.2).
 * Run after {@link withLobbyRuntimeGateOverrides} so `ENTER ARENA N` remains when unlocked.
 *
 * @param {Record<string, unknown> | null | undefined} level
 * @param {Record<string, unknown>[]} validLevels
 * @param {{ progress?: { completedLevels?: unknown; currentLevel?: unknown } }} save
 * @returns {Record<string, unknown> | null | undefined}
 */
export function withLobbyArenaGateLock(level, validLevels, save) {
  if (!level || typeof level !== "object" || level.id !== LOBBY_LEVEL_ID) return level;
  if (!Array.isArray(level.wallObjects)) return level;
  const progress = save && typeof save === "object" && save.progress && typeof save.progress === "object" ? save.progress : null;
  const completedRaw = progress && Array.isArray(progress.completedLevels) ? progress.completedLevels : [];
  const completed = completedRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const currentRaw = progress && progress.currentLevel;
  const currentLevel =
    typeof currentRaw === "number" && Number.isFinite(currentRaw) ? Math.max(1, Math.floor(currentRaw)) : 1;

  const arenaEntries = validLevels
    .map((L) => ({ idx: parseCampaignLevelIndex(L) }))
    .filter((x) => Number.isFinite(x.idx) && x.idx >= 1);

  /** @param {() => Record<string, unknown>} patch */
  function mapArenaGate(patch) {
    const wallObjects = level.wallObjects.map((wo) => {
      if (!wo || typeof wo !== "object") return wo;
      const o = /** @type {Record<string, unknown>} */ (wo);
      if (o.type !== "gate" || o.role !== "arena") return wo;
      return { ...o, ...patch() };
    });
    return { ...level, wallObjects };
  }

  if (arenaEntries.length === 0) {
    return mapArenaGate(() => ({ locked: true, signText: "NO CAMPAIGN\nLEVELS" }));
  }

  const maxIdx = Math.max(...arenaEntries.map((x) => x.idx));
  let allDone = true;
  for (let i = 1; i <= maxIdx; i++) {
    if (!completed.includes(i)) {
      allDone = false;
      break;
    }
  }
  if (allDone && maxIdx >= 1) {
    return mapArenaGate(() => ({ locked: true, signText: "MORE ARENAS\nCOMING SOON" }));
  }

  const hasNext = arenaEntries.some((x) => x.idx === currentLevel);
  if (!hasNext) {
    return mapArenaGate(() => ({ locked: true, signText: "NO ARENA\nDATA" }));
  }

  return mapArenaGate(() => ({ locked: false }));
}

/**
 * @typedef {{ start: number; end: number }} Interval
 * @typedef {{ edge: WallEdge; position: number; width: number; role: GateRole; signText: string; locked: boolean; destination: unknown }} ParsedGate
 */

/**
 * @param {unknown[]} wallObjects
 * @returns {ParsedGate[]}
 */
export function extractGatesFromWallObjects(wallObjects) {
  if (!Array.isArray(wallObjects)) return [];
  /** @type {ParsedGate[]} */
  const out = [];
  for (const wo of wallObjects) {
    if (!wo || typeof wo !== "object" || /** @type {Record<string, unknown>} */ (wo).type !== "gate") {
      continue;
    }
    const g = /** @type {Record<string, unknown>} */ (wo);
    const edge = g.edge;
    const role = g.role;
    if (
      typeof edge !== "string" ||
      typeof role !== "string" ||
      typeof g.position !== "number" ||
      typeof g.width !== "number"
    ) {
      continue;
    }
    out.push({
      edge: /** @type {WallEdge} */ (edge),
      position: g.position,
      width: g.width,
      role: /** @type {GateRole} */ (role),
      signText: typeof g.signText === "string" ? g.signText : "",
      locked: !!g.locked,
      destination: g.destination,
    });
  }
  return out;
}

/** Plan § Spawn System — units into the arena along the wall inward normal from the gate center. */
export const ENTRANCE_SPAWN_CLEAR_DEPTH = 2;

/**
 * Player spawn at the **entrance** gate: centered on the gate width, `clearDepth` units inside the arena,
 * facing = inward normal. Matches `integratePlayerCycleMovement` (`heading = atan2(inward.x, inward.z)`).
 *
 * @param {ParsedGate[]} gates
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 * @param {{ clearDepth?: number }} [opts]
 * @returns {{ x: number; z: number; heading: number } | null}
 */
export function computePlayerSpawnFromEntranceGate(gates, arenaWidth, arenaDepth, opts = {}) {
  const clearDepth =
    typeof opts.clearDepth === "number" && Number.isFinite(opts.clearDepth)
      ? opts.clearDepth
      : ENTRANCE_SPAWN_CLEAR_DEPTH;
  const entrance = gates.find((g) => g.role === "entrance");
  if (!entrance) return null;

  const halfW = arenaWidth / 2;
  const halfD = arenaDepth / 2;
  const p = entrance.position;
  const inward = inwardNormalFromEdge(entrance.edge);

  let x = 0;
  let z = 0;
  switch (entrance.edge) {
    case "south": {
      x = -halfW + p;
      z = -halfD + clearDepth * inward.z;
      break;
    }
    case "north": {
      x = -halfW + p;
      z = halfD + clearDepth * inward.z;
      break;
    }
    case "west": {
      x = -halfW + clearDepth * inward.x;
      z = -halfD + p;
      break;
    }
    case "east": {
      x = halfW + clearDepth * inward.x;
      z = -halfD + p;
      break;
    }
    default:
      return null;
  }

  const heading = Math.atan2(inward.x, inward.z);
  return { x, z, heading };
}

/**
 * @param {Interval[]} intervals
 * @returns {Interval[]}
 */
function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  /** @type {Interval[]} */
  const out = [];
  let cur = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n.start <= cur.end + 1e-6) {
      cur.end = Math.max(cur.end, n.end);
    } else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}

/**
 * Open gates remove wall collision / visuals for that span. Locked gates keep a solid wall (gate mesh layered on top).
 * @param {ParsedGate[]} gates
 * @returns {Record<WallEdge, Interval[]>}
 */
export function openGateGapsByEdge(gates, opts = {}) {
  /** @type {Record<WallEdge, Interval[]>} */
  const raw = {
    north: [],
    south: [],
    east: [],
    west: [],
  };
  for (const g of gates) {
    if (g.locked && !(opts.includeLockedEntrance && g.role === "entrance")) continue;
    const half = g.width / 2;
    raw[g.edge].push({ start: g.position - half, end: g.position + half });
  }
  /** @type {Record<WallEdge, Interval[]>} */
  const merged = {
    north: mergeIntervals(raw.north),
    south: mergeIntervals(raw.south),
    east: mergeIntervals(raw.east),
    west: mergeIntervals(raw.west),
  };
  return merged;
}

/**
 * @param {number} wallLen
 * @param {Interval[]} gaps merged
 * @returns {Interval[]}
 */
export function solidSegmentsAlongWall(wallLen, gaps) {
  const g = mergeIntervals(gaps);
  /** @type {Interval[]} */
  const solids = [];
  let cur = 0;
  for (const gap of g) {
    const gs = Math.max(0, gap.start);
    const ge = Math.min(wallLen, gap.end);
    if (gs > cur + 1e-4) {
      solids.push({ start: cur, end: gs });
    }
    cur = Math.max(cur, ge);
  }
  if (cur < wallLen - 1e-4) {
    solids.push({ start: cur, end: wallLen });
  }
  return solids.filter((s) => s.end - s.start > 1e-3);
}

/**
 * Footprints for `applyContinuousArenaWallSlide` — open gates must not get an invisible wall slide.
 * @param {ParsedGate[]} gates
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 */
export function computeOpenGateWallFootprints(gates, arenaWidth, arenaDepth) {
  const halfW = arenaWidth / 2;
  const halfD = arenaDepth / 2;
  /** @type {{ north: { x0: number; x1: number }[]; south: { x0: number; x1: number }[]; east: { z0: number; z1: number }[]; west: { z0: number; z1: number }[] }} */
  const fp = { north: [], south: [], east: [], west: [] };
  for (const g of gates) {
    if (g.locked) continue;
    const half = g.width / 2;
    const p = g.position;
    switch (g.edge) {
      case "south":
      case "north": {
        const x0 = -halfW + p - half;
        const x1 = -halfW + p + half;
        fp[g.edge].push({ x0, x1 });
        break;
      }
      case "east":
      case "west": {
        const z0 = -halfD + p - half;
        const z1 = -halfD + p + half;
        fp[g.edge].push({ z0, z1 });
        break;
      }
      default:
        break;
    }
  }
  return fp;
}

/**
 * Axis-aligned trigger volume for ride-through detection (center inside opening, slightly outside arena plane).
 * @param {ParsedGate} g
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 * @param {number} [depth=2.5]
 */
export function getOpenGateTriggerBounds(g, arenaWidth, arenaDepth, depth = 2.5) {
  if (g.locked) return null;
  const halfW = arenaWidth / 2;
  const halfD = arenaDepth / 2;
  const half = g.width / 2;
  const p = g.position;
  const inward = inwardNormalFromEdge(g.edge);
  switch (g.edge) {
    case "south": {
      const xc = -halfW + p;
      const zc = -halfD - depth / 2;
      return {
        min: new THREE.Vector3(xc - half - 0.3, 0, zc - depth / 2),
        max: new THREE.Vector3(xc + half + 0.3, 4, zc + depth / 2),
        inward,
        gate: g,
      };
    }
    case "north": {
      const xc = -halfW + p;
      const zc = halfD + depth / 2;
      return {
        min: new THREE.Vector3(xc - half - 0.3, 0, zc - depth / 2),
        max: new THREE.Vector3(xc + half + 0.3, 4, zc + depth / 2),
        inward,
        gate: g,
      };
    }
    case "west": {
      const zc = -halfD + p;
      const xc = -halfW - depth / 2;
      return {
        min: new THREE.Vector3(xc - depth / 2, 0, zc - half - 0.3),
        max: new THREE.Vector3(xc + depth / 2, 4, zc + half + 0.3),
        inward,
        gate: g,
      };
    }
    case "east": {
      const zc = -halfD + p;
      const xc = halfW + depth / 2;
      return {
        min: new THREE.Vector3(xc - depth / 2, 0, zc - half - 0.3),
        max: new THREE.Vector3(xc + depth / 2, 4, zc + half + 0.3),
        inward,
        gate: g,
      };
    }
    default:
      return null;
  }
}

/**
 * @param {THREE.Vector3} pos
 * @param {THREE.Vector3} min
 * @param {THREE.Vector3} max
 */
function inAabb(pos, min, max) {
  return pos.x >= min.x && pos.x <= max.x && pos.y >= min.y && pos.y <= max.y && pos.z >= min.z && pos.z <= max.z;
}

/**
 * Returns the first open gate whose trigger volume contains `worldPos`, or null.
 * @param {ParsedGate[]} gates
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 * @param {THREE.Vector3} worldPos
 */
export function queryOpenGateAtPosition(gates, arenaWidth, arenaDepth, worldPos) {
  for (const g of gates) {
    if (g.locked) continue;
    const b = getOpenGateTriggerBounds(g, arenaWidth, arenaDepth);
    if (!b) continue;
    if (inAabb(worldPos, b.min, b.max)) return { gate: g, bounds: b };
  }
  return null;
}

/**
 * @param {string} text
 * @param {number} maxWidth
 * @param {string} fillColor
 * @param {{ shadowBlur?: number; shadowColor?: string }} [glow]
 */
function makeSignTexture(text, maxWidth, fillColor, glow = {}) {
  const canvas = document.createElement("canvas");
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const pad = 28;
  const fontPx = 64;
  const lineH = Math.round(fontPx * 1.12);
  const lines = text ? text.split("\n") : [" "];
  canvas.width = 2048;
  canvas.height = 512;
  ctx.font = `bold ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  let w = 120;
  for (const line of lines) {
    w = Math.max(w, Math.min(maxWidth, ctx.measureText(line).width + pad * 2));
  }
  const tw = Math.ceil(w);
  const th = Math.ceil(lines.length * lineH + pad);
  canvas.width = Math.max(64, tw);
  canvas.height = Math.max(64, th);
  ctx.font = `bold ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const blur = typeof glow.shadowBlur === "number" ? glow.shadowBlur : 7;
  const shCol = glow.shadowColor ?? "rgba(0, 200, 175, 0.38)";
  ctx.shadowColor = shCol;
  ctx.shadowBlur = blur;
  ctx.fillStyle = fillColor;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], canvas.width / 2, pad + lineH * (i + 0.5));
  }
  ctx.shadowBlur = 0;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Gate = one neon arc on the ground (half-torus) + optional floating sign — no pillar box / wall slab.
 * Y-up; group origin on floor at wall anchor.
 * @param {ParsedGate} g
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 */
function buildSingleGateGroup(g, playCfg) {
  const group = new THREE.Group();
  const w = g.width;
  const h = (playCfg.devHud.wallHeight ?? playCfg.arenaWallHeight) || 3.0;
  const wallT = 1.0;
  const open = !g.locked || g.role === "entrance";

  /** Dark metal body + saturated teal emissive (not white) — intensity drives “neon” read. */
  const colorHex = open ? 0x061018 : 0x0a1018;
  const emissiveHex = open ? 0x00997a : 0x1a3044;
  const pulse = open ? 1 : 0.42;
  const arcNeonBase =
    (open ? 1.25 : 0.32) + playCfg.devHud.neonIntensity * (open ? 0.75 : 0.12);

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x04080c,
    metalness: 0.9,
    roughness: 0.2,
  });

  const neonMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: emissiveHex,
    emissiveIntensity: arcNeonBase * pulse,
    metalness: 0.2,
    roughness: 0.5,
    transparent: true,
    opacity: open ? 1 : 0.55,
  });

  const pillarW = 0.8;
  const pillarD = wallT + 0.6; // 1.6, protrudes 0.3 on each side
  const lintelH = 0.8;

  // Frame Archway
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(-w / 2, h);
  shape.lineTo(w / 2, h);
  shape.lineTo(w / 2, 0);

  const hole = new THREE.Path();
  hole.moveTo(-w / 2 + pillarW, 0);
  hole.lineTo(-w / 2 + pillarW, h - lintelH);
  hole.lineTo(w / 2 - pillarW, h - lintelH);
  hole.lineTo(w / 2 - pillarW, 0);
  shape.holes.push(hole);

  const frameGeo = new THREE.ExtrudeGeometry(shape, {
    depth: pillarD,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.05,
    bevelThickness: 0.05,
  });
  frameGeo.translate(0, 0, -pillarD / 2);
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  group.add(frameMesh);

  // Neon Inner Trim
  const neonW = 0.15;
  const neonD = pillarD + 0.1; // Protrude slightly from the frame

  const neonShape = new THREE.Shape();
  neonShape.moveTo(-w / 2 + pillarW, 0);
  neonShape.lineTo(-w / 2 + pillarW, h - lintelH);
  neonShape.lineTo(w / 2 - pillarW, h - lintelH);
  neonShape.lineTo(w / 2 - pillarW, 0);

  const neonHole = new THREE.Path();
  neonHole.moveTo(-w / 2 + pillarW + neonW, 0);
  neonHole.lineTo(-w / 2 + pillarW + neonW, h - lintelH - neonW);
  neonHole.lineTo(w / 2 - pillarW - neonW, h - lintelH - neonW);
  neonHole.lineTo(w / 2 - pillarW - neonW, 0);
  neonShape.holes.push(neonHole);

  const neonGeo = new THREE.ExtrudeGeometry(neonShape, {
    depth: neonD,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  });
  neonGeo.translate(0, 0, -neonD / 2);
  const neonMesh = new THREE.Mesh(neonGeo, neonMat);
  group.add(neonMesh);

  if (g.signText && g.signText.trim() !== "") {
    const tex = makeSignTexture(
      g.signText,
      720,
      open ? "#5effd4" : "#7a9aaa",
      open
        ? { shadowBlur: 6, shadowColor: "rgba(0, 190, 160, 0.45)" }
        : { shadowBlur: 4, shadowColor: "rgba(80, 120, 140, 0.35)" },
    );
    const aspect = tex.image.width / tex.image.height;
    const sh = 1.75;
    const sw = sh * aspect;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(sw, sh),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    sign.position.set(0, h - lintelH / 2, pillarD / 2 + 0.06);
    group.add(sign);
  }

  group.userData.gateRole = g.role;
  group.userData.gateLocked = g.locked;
  group.userData.pillarMaterials = [];
  group.userData.torusMaterial = neonMat;
  group.userData.frameEmissiveBase = arcNeonBase;
  group.userData.pulse = open;

  return group;
}

/**
 * World placement + rotation for a gate group sitting on the inner arena edge, facing inward.
 * @param {ParsedGate} g
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 */
export function placeGateGroupOnWall(g, arenaWidth, arenaDepth) {
  const halfW = arenaWidth / 2;
  const halfD = arenaDepth / 2;
  const p = g.position;
  const t = 1;
  switch (g.edge) {
    case "south": {
      const x = -halfW + p;
      const z = -halfD - t * 0.5;
      return { position: new THREE.Vector3(x, 0, z), rotationY: 0 };
    }
    case "north": {
      const x = -halfW + p;
      const z = halfD + t * 0.5;
      return { position: new THREE.Vector3(x, 0, z), rotationY: Math.PI };
    }
    case "west": {
      const x = -halfW - t * 0.5;
      const z = -halfD + p;
      return { position: new THREE.Vector3(x, 0, z), rotationY: -Math.PI / 2 };
    }
    case "east": {
      const x = halfW + t * 0.5;
      const z = -halfD + p;
      return { position: new THREE.Vector3(x, 0, z), rotationY: Math.PI / 2 };
    }
    default:
      return { position: new THREE.Vector3(0, 0, 0), rotationY: 0 };
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {ParsedGate[]} gates
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 * @returns {{ root: THREE.Group; animatables: { update: (t: number) => void }[] }}
 */
export function buildGateMeshes(scene, playCfg, gates, arenaWidth, arenaDepth) {
  const root = new THREE.Group();
  root.name = "tron-gates";
  /** @type {{ update: (t: number) => void }[]} */
  const animatables = [];

  for (const g of gates) {
    const grp = buildSingleGateGroup(g, playCfg);
    const { position, rotationY } = placeGateGroupOnWall(g, arenaWidth, arenaDepth);
    grp.position.copy(position);
    grp.rotation.y = rotationY;
    root.add(grp);

    const mats = /** @type {THREE.MeshStandardMaterial[]} */ (grp.userData.pillarMaterials || []);
    const torMat = grp.userData.torusMaterial;
    const frameBase =
      typeof grp.userData.frameEmissiveBase === "number" ? grp.userData.frameEmissiveBase : 0.1;
    if (grp.userData.pulse) {
      animatables.push({
        update: (t) => {
          const pulse = 0.92 + 0.08 * Math.sin(t * 2.6);
          for (const m of mats) {
            m.emissiveIntensity = frameBase * pulse;
          }
          if (torMat && "emissiveIntensity" in torMat) {
            torMat.emissiveIntensity = frameBase * pulse * 1.05;
          }
        },
      });
    }
  }

  scene.add(root);
  return { root, animatables };
}

/**
 * @param {{ update: (t: number) => void }[]} animatables
 * @param {number} timeSeconds
 */
export function updateGateAnimations(animatables, timeSeconds) {
  for (const a of animatables) {
    a.update(timeSeconds);
  }
}

/**
 * When a locked exit opens mid-level (P5.7), swap dim materials for neon and attach pulse animation
 * (locked exits were built without an animatable entry).
 *
 * @param {THREE.Group} gatesRoot — `buildGateMeshes` root
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {{ update: (t: number) => void }[]} animatables — mutated (new pulse updater appended)
 */
export function applyExitGateRuntimeOpenVisual(gatesRoot, playCfg, animatables) {
  if (!gatesRoot) return;
  for (const obj of gatesRoot.children) {
    if (!(obj instanceof THREE.Group)) continue;
    if (obj.userData.gateRole !== "exit") continue;

    const frameBase = 1.25 + playCfg.devHud.neonIntensity * 0.75;
    const colorHex = 0x061018;
    const emissive = 0x00997a;
    const mats = /** @type {THREE.MeshStandardMaterial[]} */ (obj.userData.pillarMaterials || []);
    for (const m of mats) {
      if (!m || !("color" in m)) continue;
      m.color.setHex(colorHex);
      m.emissive.setHex(emissive);
      m.emissiveIntensity = frameBase;
      m.opacity = 0.96;
      m.transparent = true;
    }
    const torMat = obj.userData.torusMaterial;
    if (torMat && "color" in torMat && "emissive" in torMat) {
      torMat.color.setHex(colorHex);
      torMat.emissive.setHex(emissive);
      torMat.emissiveIntensity = frameBase * 1.05;
    }
    obj.userData.pulse = true;
    obj.userData.frameEmissiveBase = frameBase;
    obj.userData.gateLocked = false;

    const pillarMats = mats;
    animatables.push({
      update: (t) => {
        const pulse = 0.92 + 0.08 * Math.sin(t * 2.6);
        for (const m of pillarMats) {
          m.emissiveIntensity = frameBase * pulse;
        }
        if (torMat && "emissiveIntensity" in torMat) {
          torMat.emissiveIntensity = frameBase * pulse * 1.05;
        }
      },
    });
    return;
  }
}
