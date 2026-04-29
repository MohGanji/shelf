/**
 * Trail lookahead and peer separation (shared with legacy AI surface).
 */

/**
 * True if any trail tile map reports dangerous trail in the lookahead cone.
 * @param {object} opts
 * @param {number} opts.x
 * @param {number} opts.z
 * @param {number} opts.heading
 * @param {string} opts.selfId
 * @param {number} opts.immunitySegments
 * @param {number} opts.steps
 * @param {number} opts.halfWidth
 * @param {Array<{ map: { hasTrailAhead: Function }; ownerId: string; edgeCount: number }>} opts.sources
 */
export function hasDangerousTrailAhead(opts) {
  const { x, z, heading, selfId, immunitySegments, steps, halfWidth, sources } = opts;
  for (const s of sources) {
    const map = s.map;
    const oid = s.ownerId;
    const edges = s.edgeCount;
    const imm = oid === selfId ? immunitySegments : 0;
    const numSelfEdges = oid === selfId ? edges : 0;
    if (
      map.hasTrailAhead({
        x,
        z,
        heading,
        selfId,
        numSelfEdges,
        immunitySegments: imm,
        steps,
        halfWidth,
      })
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Lateral bias in [-1, 1] to separate from the player and other cycles within avoidance range.
 * @param {object} opts
 * @param {number} opts.px
 * @param {number} opts.pz
 * @param {number} opts.heading
 * @param {string} opts.selfId
 * @param {number} opts.avoidRange
 * @param {Array<{ id: string; x: number; z: number }>} opts.peers
 * @param {number} [opts.playerPeerSepScale=1]
 */
export function computePeerSeparationSteer(opts) {
  const { px, pz, heading, selfId, peers, avoidRange, playerPeerSepScale = 1 } = opts;
  const r = Math.max(1.2, avoidRange);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let acc = 0;

  for (const p of peers) {
    if (!p || p.id === selfId) continue;
    const relX = p.x - px;
    const relZ = p.z - pz;
    const dist = Math.hypot(relX, relZ);
    if (dist < 0.08 || dist > r) continue;
    const cross = fx * relZ - fz * relX;
    const sgn = cross === 0 ? 0 : cross > 0 ? 1 : -1;
    let w = (1 - dist / r) ** 1.35;
    if (p.id === "player") w *= Math.max(0, Math.min(1, playerPeerSepScale));
    acc += sgn * w;
  }

  if (acc === 0) return 0;
  return Math.max(-1, Math.min(1, acc * 0.82));
}
