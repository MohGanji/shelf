/**
 * Gate wall objects — neon arcs, trigger volumes, open vs locked signage (plan P5.6).
 */

import * as THREE from "three";
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
export function openGateGapsByEdge(gates) {
  /** @type {Record<WallEdge, Interval[]>} */
  const raw = {
    north: [],
    south: [],
    east: [],
    west: [],
  };
  for (const g of gates) {
    if (g.locked) continue;
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
 * @param {string} color
 */
function makeSignTexture(text, maxWidth, color) {
  const canvas = document.createElement("canvas");
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const pad = 24;
  const lineH = 34;
  const lines = text ? text.split("\n") : [" "];
  canvas.width = 2048;
  canvas.height = 512;
  ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
  let w = 120;
  for (const line of lines) {
    w = Math.max(w, Math.min(maxWidth, ctx.measureText(line).width + pad * 2));
  }
  const tw = Math.ceil(w);
  const th = Math.ceil(lines.length * lineH + pad);
  canvas.width = Math.max(64, tw);
  canvas.height = Math.max(64, th);
  ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = color;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], canvas.width / 2, pad + lineH * (i + 0.5));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Neon arch + optional sign for one gate. Y-up; group positioned at wall anchor.
 * @param {ParsedGate} g
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 */
function buildSingleGateGroup(g, playCfg) {
  const group = new THREE.Group();
  const h = playCfg.arenaWallHeight;
  const w = g.width;
  const neon = 0.35 + playCfg.devHud.neonIntensity * 0.55;
  const open = !g.locked;
  const colorHex = open ? 0x00fff0 : 0x335566;
  const emissive = open ? 0x00ddff : 0x112233;
  const pulse = open ? 1 : 0.35;

  const pillarGeo = new THREE.BoxGeometry(0.22, h * 0.92, 0.22);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive,
    emissiveIntensity: neon * pulse,
    metalness: 0.35,
    roughness: 0.35,
    transparent: true,
    opacity: open ? 0.96 : 0.72,
  });
  const left = new THREE.Mesh(pillarGeo, pillarMat);
  left.position.set(-w / 2 + 0.15, h * 0.46, 0);
  const right = new THREE.Mesh(pillarGeo, pillarMat);
  right.position.set(w / 2 - 0.15, h * 0.46, 0);
  group.add(left, right);

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(w / 2 - 0.2, 0.09, 10, 24, Math.PI),
    new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive,
      emissiveIntensity: neon * pulse * 1.1,
      metalness: 0.4,
      roughness: 0.3,
    }),
  );
  torus.rotation.z = Math.PI;
  torus.position.y = h * 0.88;
  group.add(torus);

  if (g.signText && g.signText.trim() !== "") {
    const tex = makeSignTexture(g.signText, 720, open ? "#9fffff" : "#88aabb");
    const aspect = tex.image.width / tex.image.height;
    const sh = 1.1;
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
    sign.position.set(0, h * 0.55, 0.18);
    group.add(sign);
  }

  group.userData.gateRole = g.role;
  group.userData.gateLocked = g.locked;
  group.userData.pillarMaterials = [pillarMat];
  group.userData.torusMaterial = torus.material;
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
      const z = -halfD - t * 0.35;
      return { position: new THREE.Vector3(x, 0, z), rotationY: 0 };
    }
    case "north": {
      const x = -halfW + p;
      const z = halfD + t * 0.35;
      return { position: new THREE.Vector3(x, 0, z), rotationY: Math.PI };
    }
    case "west": {
      const x = -halfW - t * 0.35;
      const z = -halfD + p;
      return { position: new THREE.Vector3(x, 0, z), rotationY: -Math.PI / 2 };
    }
    case "east": {
      const x = halfW + t * 0.35;
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
    if (grp.userData.pulse) {
      animatables.push({
        update: (t) => {
          const pulse = 0.75 + 0.25 * Math.sin(t * 2.6);
          for (const m of mats) {
            m.emissiveIntensity = (0.35 + playCfg.devHud.neonIntensity * 0.55) * pulse;
          }
          if (torMat && "emissiveIntensity" in torMat) {
            torMat.emissiveIntensity = (0.35 + playCfg.devHud.neonIntensity * 0.55) * pulse * 1.15;
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

    const neon = 0.35 + playCfg.devHud.neonIntensity * 0.55;
    const colorHex = 0x00fff0;
    const emissive = 0x00ddff;
    const mats = /** @type {THREE.MeshStandardMaterial[]} */ (obj.userData.pillarMaterials || []);
    for (const m of mats) {
      if (!m || !("color" in m)) continue;
      m.color.setHex(colorHex);
      m.emissive.setHex(emissive);
      m.emissiveIntensity = neon;
      m.opacity = 0.96;
      m.transparent = true;
    }
    const torMat = obj.userData.torusMaterial;
    if (torMat && "color" in torMat && "emissive" in torMat) {
      torMat.color.setHex(colorHex);
      torMat.emissive.setHex(emissive);
      torMat.emissiveIntensity = neon * 1.1;
    }
    obj.userData.pulse = true;
    obj.userData.gateLocked = false;

    const pillarMats = mats;
    animatables.push({
      update: (t) => {
        const pulse = 0.75 + 0.25 * Math.sin(t * 2.6);
        for (const m of pillarMats) {
          m.emissiveIntensity = (0.35 + playCfg.devHud.neonIntensity * 0.55) * pulse;
        }
        if (torMat && "emissiveIntensity" in torMat) {
          torMat.emissiveIntensity = (0.35 + playCfg.devHud.neonIntensity * 0.55) * pulse * 1.15;
        }
      },
    });
    return;
  }
}
