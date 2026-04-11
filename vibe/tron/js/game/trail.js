/**
 * Tron: Light Cycles — Trail System
 *
 * CatmullRom spline trail walls spawned behind cycles.
 * Tile-based collision map for fast, deterministic hit detection.
 * Fading oldest segments, near-miss detection, self-immunity.
 *
 * Usage:
 *   const trailManager = new TrailManager(scene);
 *   const trail = trailManager.createTrail(cycleId, color, maxSegments);
 *   // Each frame while cycle moves:
 *   trail.update(cyclePosition, cycleHeading, speed, dt);
 *   // Check collision:
 *   const hit = trailManager.checkCollision(cycleId, tileX, tileZ);
 *   // Near-miss:
 *   const nearMiss = trailManager.checkNearMiss(cycleId, position, distance);
 *   // On derez:
 *   trailManager.removeTrail(cycleId);
 */

import * as THREE from 'three';

// ─── Default Config ─────────────────────────────────────────
// These mirror the plan's devHud defaults. When config.js exists,
// the game state machine will pass overrides via TrailManager options.
const DEFAULTS = {
  trailOpacity: 0.8,
  trailFadeSpeed: 1.0,
  defaultTrailLength: 40,
  trailImmunitySegments: 4,
  nearMissDistance: 1.5,
  trailWallHeight: 0.6,
  trailWallThickness: 0.1,
  spawnDistance: 1.0, // new segment every 1 unit traveled
  pulseSpeed: 3.0,
  pulseAmplitude: 0.15,
};

// ─── Tile Collision Map ─────────────────────────────────────
// Tracks which tiles are occupied by trail segments.
// Key format: "x,z" where x,z are integer tile coordinates.
// Value: Set of { cycleId, segmentIndex } for querying ownership.

class TileCollisionMap {
  constructor() {
    // Map<string, Array<{cycleId, segmentIndex}>>
    this._tiles = new Map();
  }

  /** Convert world position to tile coordinate (floor). */
  static worldToTile(x, z) {
    return { tx: Math.floor(x), tz: Math.floor(z) };
  }

  /** Get tile key string. */
  static key(tx, tz) {
    return `${tx},${tz}`;
  }

  /**
   * Register a segment's tile occupancy.
   * A single segment can span multiple tiles (diagonal/curved paths).
   * @param {number} cycleId
   * @param {number} segmentIndex
   * @param {Array<{tx,tz}>} tiles - tiles this segment passes through
   */
  register(cycleId, segmentIndex, tiles) {
    for (const { tx, tz } of tiles) {
      const k = TileCollisionMap.key(tx, tz);
      if (!this._tiles.has(k)) {
        this._tiles.set(k, []);
      }
      this._tiles.get(k).push({ cycleId, segmentIndex });
    }
  }

  /**
   * Unregister a segment from specific tiles (O(tiles) instead of O(all tiles)).
   * @param {number} cycleId
   * @param {number} segmentIndex
   * @param {Array<{tx,tz}>} tiles - the tiles this segment occupies
   */
  unregister(cycleId, segmentIndex, tiles) {
    for (const { tx, tz } of tiles) {
      const k = TileCollisionMap.key(tx, tz);
      const entries = this._tiles.get(k);
      if (!entries) continue;
      const filtered = entries.filter(
        (e) => !(e.cycleId === cycleId && e.segmentIndex === segmentIndex)
      );
      if (filtered.length === 0) {
        this._tiles.delete(k);
      } else {
        this._tiles.set(k, filtered);
      }
    }
  }

  /**
   * Remove ALL entries for a given cycle (used on derez).
   */
  removeAll(cycleId) {
    for (const [k, entries] of this._tiles) {
      const filtered = entries.filter((e) => e.cycleId !== cycleId);
      if (filtered.length === 0) {
        this._tiles.delete(k);
      } else {
        this._tiles.set(k, filtered);
      }
    }
  }

  /**
   * Check if a tile is occupied by any trail.
   * Returns null if empty, or { cycleId, segmentIndex } of the first occupant.
   */
  query(tx, tz) {
    const k = TileCollisionMap.key(tx, tz);
    const entries = this._tiles.get(k);
    if (!entries || entries.length === 0) return null;
    return entries[0];
  }

  /**
   * Get all occupants of a tile.
   * @returns {Array<{cycleId, segmentIndex}>}
   */
  queryAll(tx, tz) {
    const k = TileCollisionMap.key(tx, tz);
    return this._tiles.get(k) || [];
  }

  /**
   * Find the closest trail-occupied tile within a radius of a world position.
   * Used for near-miss detection.
   * @param {number} wx - world x
   * @param {number} wz - world z
   * @param {number} radius - search radius in world units
   * @param {number|null} excludeCycleId - cycle to exclude (null = none)
   * @param {number} immuneSegments - number of recent segments to ignore for excludeCycleId
   * @param {number} totalSegments - total segments the excluded cycle has
   * @returns {{ distance: number, cycleId: number, segmentIndex: number }|null}
   */
  findNearest(wx, wz, radius, excludeCycleId, immuneSegments, totalSegments) {
    const { tx: centerTx, tz: centerTz } = TileCollisionMap.worldToTile(wx, wz);
    const r = Math.ceil(radius);
    let best = null;
    let bestDist = Infinity;

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const tx = centerTx + dx;
        const tz = centerTz + dz;
        // Distance from world position to tile center
        const tileCenterX = tx + 0.5;
        const tileCenterZ = tz + 0.5;
        const dist = Math.sqrt(
          (wx - tileCenterX) ** 2 + (wz - tileCenterZ) ** 2
        );
        if (dist > radius || dist >= bestDist) continue;

        const entries = this.queryAll(tx, tz);
        for (const entry of entries) {
          // Skip self-immunity: own cycle's most recent N segments
          if (
            entry.cycleId === excludeCycleId &&
            entry.segmentIndex >= totalSegments - immuneSegments
          ) {
            continue;
          }
          if (dist < bestDist) {
            bestDist = dist;
            best = { distance: dist, cycleId: entry.cycleId, segmentIndex: entry.segmentIndex };
          }
        }
      }
    }

    return best;
  }

  clear() {
    this._tiles.clear();
  }
}

// ─── Trail Segment ──────────────────────────────────────────
// Each segment is a short wall panel between two spline-interpolated points.

/**
 * Compute tiles that a line segment from (x0,z0) to (x1,z1) passes through.
 * Uses a simple grid traversal (DDA / Bresenham-like).
 */
function rasterizeSegmentToTiles(x0, z0, x1, z1) {
  const tiles = [];
  const { tx: tx0, tz: tz0 } = TileCollisionMap.worldToTile(x0, z0);
  const { tx: tx1, tz: tz1 } = TileCollisionMap.worldToTile(x1, z1);

  // Always include start and end tiles
  tiles.push({ tx: tx0, tz: tz0 });
  if (tx0 === tx1 && tz0 === tz1) return tiles;

  // DDA traversal
  const dx = Math.abs(tx1 - tx0);
  const dz = Math.abs(tz1 - tz0);
  const sx = tx0 < tx1 ? 1 : -1;
  const sz = tz0 < tz1 ? 1 : -1;

  let cx = tx0;
  let cz = tz0;
  let err = dx - dz;

  const maxSteps = dx + dz + 2;
  for (let i = 0; i < maxSteps; i++) {
    if (cx === tx1 && cz === tz1) break;
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cz += sz;
    }
    tiles.push({ tx: cx, tz: cz });
  }

  // Deduplicate
  const seen = new Set();
  return tiles.filter(({ tx, tz }) => {
    const k = `${tx},${tz}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── CatmullRom Interpolation ───────────────────────────────

/**
 * Evaluate a CatmullRom spline point at parameter t (0..1) between p1 and p2,
 * using p0 and p3 as tangent control points. Returns a new THREE.Vector3.
 * Only interpolates x and z; y is kept at 0 (ground plane).
 */
function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

  const z =
    0.5 *
    (2 * p1.z +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);

  return new THREE.Vector3(x, 0, z);
}

// ─── Trail (per-cycle) ──────────────────────────────────────

class Trail {
  /**
   * @param {number} cycleId - unique identifier for this cycle
   * @param {THREE.Color|string} color - trail color (hex string or THREE.Color)
   * @param {number} maxSegments - max trail segments (from Trail Length attribute)
   * @param {THREE.Scene} scene - Three.js scene to add meshes to
   * @param {TileCollisionMap} tileMap - shared tile collision map
   * @param {object} config - merged config/devHud values
   */
  constructor(cycleId, color, maxSegments, scene, tileMap, config) {
    this.cycleId = cycleId;
    this.color = new THREE.Color(color);
    this.maxSegments = maxSegments;
    this.scene = scene;
    this.tileMap = tileMap;
    this.config = config;

    // Trail segments: array of { mesh, tiles, birthTime, index }
    // Index 0 = oldest, last = newest
    this.segments = [];
    this._nextSegIndex = 0;

    // Position tracking for distance-based spawning
    this._lastSpawnPos = null;
    this._distAccum = 0;

    // Control point buffer for CatmullRom interpolation
    // We keep the last 4 spawn positions for smooth curves
    this._controlPoints = [];

    // Shared material (cloned per-segment for individual opacity)
    this._baseMaterial = new THREE.MeshStandardMaterial({
      color: this.color,
      emissive: this.color,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: config.trailOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this._pulseTime = 0;
    this._alive = true;
  }

  /**
   * Update trail: spawn new segments if cycle has moved far enough.
   * @param {THREE.Vector3} position - current cycle center position
   * @param {number} heading - cycle heading in radians (unused for spawn logic, but useful for perpendicular)
   * @param {number} speed - current cycle speed (units/s)
   * @param {number} dt - delta time in seconds
   */
  update(position, heading, speed, dt) {
    if (!this._alive) return;

    this._pulseTime += dt;

    // No trail at speed 0
    if (speed <= 0.01) {
      this._lastSpawnPos = null;
      this._distAccum = 0;
      // Still update visuals (fading, pulse) even when stationary
      this._updateSegmentVisuals(dt);
      return;
    }

    const pos = position.clone();

    if (!this._lastSpawnPos) {
      this._lastSpawnPos = pos.clone();
      this._controlPoints = [pos.clone()];
      return;
    }

    // Accumulate distance from previous position to current
    const prevPos = this._lastSpawnPos.clone();
    const dist = pos.distanceTo(prevPos);
    this._distAccum += dist;
    this._lastSpawnPos.copy(pos);

    // Spawn segments every spawnDistance units traveled
    if (this._distAccum >= this.config.spawnDistance && dist > 0.001) {
      // Direction of travel (prevPos → pos)
      const dir = new THREE.Vector3().subVectors(pos, prevPos).normalize();

      while (this._distAccum >= this.config.spawnDistance) {
        this._distAccum -= this.config.spawnDistance;

        // Walk back from current position by remaining accumulation
        const spawnPoint = pos
          .clone()
          .addScaledVector(dir, -this._distAccum);

        this._addControlPoint(spawnPoint);
        this._spawnSegment();
      }
    }

    // Update existing segment visuals (fading, pulse)
    this._updateSegmentVisuals(dt);
  }

  _addControlPoint(point) {
    this._controlPoints.push(point.clone());
    // Keep only the last 4 for CatmullRom
    if (this._controlPoints.length > 4) {
      this._controlPoints.shift();
    }
  }

  _spawnSegment() {
    const pts = this._controlPoints;
    if (pts.length < 2) return;

    let startPt, endPt;

    if (pts.length >= 4) {
      // CatmullRom: smooth the endpoint using the surrounding control points.
      // p0=pts[-4], p1=pts[-3], p2=pts[-2], p3=pts[-1]
      // We interpolate at t=1 on the p1-p2 segment using p0,p3 for tangents.
      // The start point is the previous segment's end (pts[-2], already placed).
      // The end point is smoothed via CatmullRom.
      const p0 = pts[pts.length - 4];
      const p1 = pts[pts.length - 3];
      const p2 = pts[pts.length - 2];
      const p3 = pts[pts.length - 1];
      startPt = p2;
      endPt = catmullRomPoint(p0, p1, p2, p3, 0.5);
    } else {
      startPt = pts[pts.length - 2];
      endPt = pts[pts.length - 1];
    }

    // Build wall geometry between startPt and endPt
    const mesh = this._buildWallMesh(startPt, endPt);
    this.scene.add(mesh);

    // Rasterize to tiles
    const tiles = rasterizeSegmentToTiles(
      startPt.x,
      startPt.z,
      endPt.x,
      endPt.z
    );

    const segIndex = this._nextSegIndex++;

    // Register tiles
    this.tileMap.register(this.cycleId, segIndex, tiles);

    this.segments.push({
      mesh,
      tiles,
      birthTime: performance.now() / 1000,
      index: segIndex,
    });

    // FIFO: remove oldest if over max
    while (this.segments.length > this.maxSegments) {
      this._removeOldest();
    }
  }

  /**
   * Build a wall panel mesh between two points.
   * Wall is oriented perpendicular to the travel direction, facing outward.
   */
  _buildWallMesh(startPt, endPt) {
    const height = this.config.trailWallHeight;
    const thickness = this.config.trailWallThickness;

    // Direction from start to end
    const dx = endPt.x - startPt.x;
    const dz = endPt.z - startPt.z;
    const length = Math.sqrt(dx * dx + dz * dz);

    if (length < 0.001) {
      // Degenerate segment — make a tiny placeholder
      const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      const mat = this._baseMaterial.clone();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(startPt);
      mesh.position.y = height / 2;
      mesh.visible = false;
      return mesh;
    }

    // Create a box geometry: length along the segment, height vertical, thin
    const geo = new THREE.BoxGeometry(length, height, thickness);
    const mat = this._baseMaterial.clone();
    const mesh = new THREE.Mesh(geo, mat);

    // Position at midpoint, raised to half-height
    mesh.position.set(
      (startPt.x + endPt.x) / 2,
      height / 2,
      (startPt.z + endPt.z) / 2
    );

    // Rotate to align with segment direction (around Y axis)
    const angle = Math.atan2(dz, dx);
    mesh.rotation.y = -angle;

    return mesh;
  }

  _removeOldest() {
    if (this.segments.length === 0) return;
    const seg = this.segments.shift();
    this.scene.remove(seg.mesh);
    seg.mesh.geometry.dispose();
    seg.mesh.material.dispose();
    this.tileMap.unregister(this.cycleId, seg.index, seg.tiles);
  }

  /**
   * Update visual effects: fading on oldest segments, pulse on all.
   */
  _updateSegmentVisuals(dt) {
    const total = this.segments.length;
    if (total === 0) return;

    const baseOpacity = this.config.trailOpacity;
    const fadeSpeed = this.config.trailFadeSpeed;
    const pulseSpeed = this.config.pulseSpeed;
    const pulseAmp = this.config.pulseAmplitude;

    // Pulse: global emissive intensity oscillation
    const pulse = 1.0 + Math.sin(this._pulseTime * pulseSpeed) * pulseAmp;

    for (let i = 0; i < total; i++) {
      const seg = this.segments[i];
      const mat = seg.mesh.material;

      // Age-based fade: oldest segments (low index) fade out
      // Fade the oldest 25% of segments
      const fadeZone = Math.max(1, Math.floor(total * 0.25));
      let opacity;
      if (i < fadeZone) {
        // Linearly fade from 0 (oldest) to baseOpacity
        opacity = baseOpacity * ((i + 1) / fadeZone);
      } else {
        opacity = baseOpacity;
      }

      mat.opacity = opacity;
      mat.emissiveIntensity = 0.8 * pulse * (opacity / baseOpacity);
    }
  }

  /**
   * Increase max trail length (e.g., from Trail Extend power-up).
   */
  extendMaxSegments(amount) {
    this.maxSegments += amount;
  }

  /**
   * Instantly remove all trail segments (used on derez).
   */
  destroy() {
    this._alive = false;
    for (const seg of this.segments) {
      this.scene.remove(seg.mesh);
      seg.mesh.geometry.dispose();
      seg.mesh.material.dispose();
    }
    this.tileMap.removeAll(this.cycleId);
    this.segments = [];
    this._controlPoints = [];
  }

  /**
   * Get the total number of active segments.
   */
  get segmentCount() {
    return this.segments.length;
  }

  /**
   * Check if this trail is still active.
   */
  get alive() {
    return this._alive;
  }
}

// ─── Trail Manager ──────────────────────────────────────────
// Manages all trails and the shared tile collision map.

class TrailManager {
  /**
   * @param {THREE.Scene} scene - Three.js scene
   * @param {object} [configOverrides] - override default config values
   */
  constructor(scene, configOverrides = {}) {
    this.scene = scene;
    this.config = { ...DEFAULTS, ...configOverrides };
    this.tileMap = new TileCollisionMap();

    /** @type {Map<number, Trail>} */
    this.trails = new Map();
  }

  /**
   * Update config at runtime (e.g., from DevHud changes).
   */
  updateConfig(overrides) {
    Object.assign(this.config, overrides);
    // Propagate to existing trails
    for (const trail of this.trails.values()) {
      trail.config = this.config;
    }
  }

  /**
   * Create a new trail for a cycle.
   * @param {number} cycleId - unique cycle identifier
   * @param {string|THREE.Color} color - trail color
   * @param {number} [maxSegments] - max segments (defaults to config.defaultTrailLength)
   * @returns {Trail}
   */
  createTrail(cycleId, color, maxSegments) {
    const max = maxSegments || this.config.defaultTrailLength;
    const trail = new Trail(
      cycleId,
      color,
      max,
      this.scene,
      this.tileMap,
      this.config
    );
    this.trails.set(cycleId, trail);
    return trail;
  }

  /**
   * Get the trail for a specific cycle.
   * @param {number} cycleId
   * @returns {Trail|undefined}
   */
  getTrail(cycleId) {
    return this.trails.get(cycleId);
  }

  /**
   * Remove a cycle's trail (e.g., on derez). Instantly clears all visuals and tiles.
   * @param {number} cycleId
   */
  removeTrail(cycleId) {
    const trail = this.trails.get(cycleId);
    if (trail) {
      trail.destroy();
      this.trails.delete(cycleId);
    }
  }

  /**
   * Check if a cycle at tile (tx, tz) collides with any trail.
   * Respects self-immunity: a cycle is immune to its own N most recent segments.
   *
   * @param {number} cycleId - the cycle to check
   * @param {number} worldX - cycle center world X
   * @param {number} worldZ - cycle center world Z
   * @returns {{ hit: boolean, ownerCycleId?: number, segmentIndex?: number }}
   */
  checkCollision(cycleId, worldX, worldZ) {
    const { tx, tz } = TileCollisionMap.worldToTile(worldX, worldZ);
    const entries = this.tileMap.queryAll(tx, tz);

    if (entries.length === 0) {
      return { hit: false };
    }

    const immuneCount = this.config.trailImmunitySegments;

    for (const entry of entries) {
      // Self-immunity: skip own most recent N segments
      if (entry.cycleId === cycleId) {
        const trail = this.trails.get(cycleId);
        if (trail) {
          const totalSegs = trail.segments.length;
          // Immune segments are the most recent ones (highest index)
          // entry.segmentIndex is absolute; trail.segments[last].index is the newest
          if (totalSegs > 0) {
            const newestIndex = trail.segments[totalSegs - 1].index;
            const cutoff = newestIndex - immuneCount + 1;
            if (entry.segmentIndex >= cutoff) {
              continue; // immune
            }
          }
        }
      }

      return {
        hit: true,
        ownerCycleId: entry.cycleId,
        segmentIndex: entry.segmentIndex,
      };
    }

    return { hit: false };
  }

  /**
   * Check for near-miss: is any trail segment within nearMissDistance
   * of the given world position? Respects self-immunity.
   *
   * @param {number} cycleId - the cycle to check
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {{ nearMiss: boolean, distance?: number, ownerCycleId?: number }}
   */
  checkNearMiss(cycleId, worldX, worldZ) {
    const nearMissDistance = this.config.nearMissDistance;
    const immuneCount = this.config.trailImmunitySegments;

    const trail = this.trails.get(cycleId);
    const totalSegments = trail ? trail.segments.length : 0;

    const result = this.tileMap.findNearest(
      worldX,
      worldZ,
      nearMissDistance,
      cycleId,
      immuneCount,
      totalSegments > 0 ? trail.segments[totalSegments - 1].index + 1 : 0
    );

    if (!result) {
      return { nearMiss: false };
    }

    // Exclude if it's a direct collision (distance ~ 0, handled by checkCollision)
    const { tx, tz } = TileCollisionMap.worldToTile(worldX, worldZ);
    const directEntries = this.tileMap.queryAll(tx, tz);
    for (const entry of directEntries) {
      if (
        entry.cycleId === result.cycleId &&
        entry.segmentIndex === result.segmentIndex
      ) {
        // This is a direct collision tile, not a near-miss
        return { nearMiss: false };
      }
    }

    return {
      nearMiss: true,
      distance: result.distance,
      ownerCycleId: result.cycleId,
    };
  }

  /**
   * Remove all trails (e.g., on level transition).
   */
  clearAll() {
    for (const trail of this.trails.values()) {
      trail.destroy();
    }
    this.trails.clear();
    this.tileMap.clear();
  }

  /**
   * Update all trails. Call once per frame.
   * @param {number} dt - delta time in seconds
   * @param {Map<number, {position: THREE.Vector3, heading: number, speed: number}>} cycleStates
   */
  updateAll(dt, cycleStates) {
    for (const [cycleId, trail] of this.trails) {
      const state = cycleStates.get(cycleId);
      if (state) {
        trail.update(state.position, state.heading, state.speed, dt);
      }
    }
  }
}

export { TrailManager, Trail, TileCollisionMap, DEFAULTS as TRAIL_DEFAULTS };
