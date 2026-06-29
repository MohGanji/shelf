// Radial knockout bracket — geometry + SVG renderer.
//
// The qualified teams sit on the outer ring (round 0). Each match merges a pair one
// ring inward, round by round, until the Final resolves at the centre where the
// trophy sits. The bracket adapts to the tournament: a 32-team field (2026) spans
// five rings and a wide circle; a 4-team field (1930) is two rings and a small one.
// Angles, radii, badge sizes and match ids are all derived from the seeding order.

const SVG = 'http://www.w3.org/2000/svg';

// Full set of knockout-round labels (round 1 = outer ring). Re-based per tournament
// in main.js so an 8-team cup's outer ring reads "Quarter-final", not "Round of 32".
export const ALL_ROUND_LABELS = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'];

const GOLD = 'oklch(0.82 0.13 84)';
const MUTED = 'oklch(0.58 0.07 80)';
const DARK = 'oklch(0.21 0.009 70)';
const FAINT = 'oklch(1 0 0 / 0.22)';

import { flagUrl } from './fifa.js';
export { flagUrl };

// Polar -> cartesian around the 1000×1000 viewBox centre (500,500). -90° puts 0° at top.
function polar(angleDeg, radius) {
  const r = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 500 + radius * Math.cos(r), y: 500 + radius * Math.sin(r) };
}

// Geometry for a bracket of depth D (rounds) and N = 2^D leaves. Bigger fields get a
// wider outer ring; smaller fields a tighter one — but badges stay legible either way.
function geometryFor(D, N) {
  const leafRadius = { 5: 448, 4: 392, 3: 320, 2: 232, 1: 150 }[D] ?? 448;
  // Ring radius by round: leaves on the outside, the Final at the centre.
  const radii = Array.from({ length: D + 1 }, (_, i) => (leafRadius * (D - i)) / D);
  const spacing = (2 * Math.PI * leafRadius) / N; // arc gap between neighbouring badges
  const leafBadge = Math.max(16, Math.min(40, spacing * 0.34));
  const badgeR = radii.map((_, round) => {
    if (round === D) return leafBadge * 0.82; // champion at centre
    return leafBadge * (1 - (0.34 * round) / D);
  });
  return { leafRadius, radii, badgeR, innerStub: Math.max(40, leafRadius * 0.13), trophyScale: leafRadius / 448 };
}

// Build the full bracket tree from teams in seeding order. Mirrored so the bracket
// reads symmetrically left/right (matches the reference layout).
export function buildBracket(teams, mirror = true) {
  const nodes = [];
  const N = teams.length;
  const D = Math.max(1, Math.round(Math.log2(N)));
  const geo = geometryFor(D, N);
  const offset = 180 / N;

  let level = teams.map((team, t) => {
    const angle = offset + (360 * t) / N;
    const { x, y } = polar(angle, geo.radii[0]);
    const node = { id: team ? `t-${team.id}` : `t-slot-${t}`, round: 0, angle, x, y, size: geo.badgeR[0], team: team || undefined };
    nodes.push(node);
    return node;
  });

  let round = 1;
  while (level.length > 1) {
    const next = [];
    for (let t = 0; t < level.length; t += 2) {
      const left = level[t];
      const right = level[t + 1];
      const angle = (left.angle + right.angle) / 2;
      const { x, y } = polar(angle, geo.radii[round]);
      const match = { id: `m-${round}-${t / 2}`, round, angle, x, y, size: geo.badgeR[round], left, right };
      left.parent = match;
      right.parent = match;
      nodes.push(match);
      next.push(match);
    }
    level = next;
    round++;
  }

  if (mirror) {
    for (const node of nodes) {
      node.angle = (360 - node.angle) % 360;
      const p = polar(node.angle, geo.radii[node.round]);
      node.x = p.x;
      node.y = p.y;
    }
  }

  return { root: level[0], nodes, depth: D, geo };
}

// The team occupying a node: a leaf carries its own team; a match carries the
// winner once it has been played.
export function teamAt(node, winners, teamById) {
  if (!node) return undefined;
  if (node.team) return node.team;
  const id = winners[node.id];
  return id ? teamById[id] : undefined;
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.setAttribute('class', v);
    else node.setAttribute(k, String(v));
  }
  return node;
}

// Has this node's occupant advanced past its match (i.e. is it the winner)?
function hasAdvanced(node, winners, teamById) {
  if (!node.parent) return false;
  const t = teamAt(node, winners, teamById);
  return !!t && winners[node.parent.id] === t.id;
}

// Build the whole bracket into `svg` once. `onSelect(matchId)` fires on badge clicks;
// selection visuals are applied separately via updateSelection (no rebuild on click).
export function renderBracket(svg, tree, { teamById, winners, onSelect }) {
  const { root, nodes, geo } = tree;
  svg.replaceChildren();

  // — glow + trophy core, scaled to the bracket size —
  const ts = geo.trophyScale;
  const defs = el('defs');
  const grad = el('radialGradient', { id: 'glow', cx: '50%', cy: '50%', r: '50%' });
  grad.append(
    el('stop', { offset: '0%', 'stop-color': GOLD, 'stop-opacity': '0.42' }),
    el('stop', { offset: '40%', 'stop-color': GOLD, 'stop-opacity': '0.12' }),
    el('stop', { offset: '100%', 'stop-color': GOLD, 'stop-opacity': '0' }),
  );
  defs.append(grad);
  svg.append(defs);
  svg.append(el('circle', { cx: 500, cy: 500, r: 330 * ts, fill: 'url(#glow)', class: 'glow-anim' }));
  const tw = 140 * ts;
  const th = 200 * ts;
  svg.append(el('image', {
    href: './assets/world-cup-trophy.png', x: 500 - tw / 2, y: 500 - th / 2, width: tw, height: th,
    preserveAspectRatio: 'xMidYMid meet', class: 'trophy-anim', 'aria-hidden': 'true',
  }));

  const matches = nodes.filter((n) => n.round >= 1);
  const leaves = nodes.filter((n) => n.round === 0);

  // — connector lines: child -> parent, radial spoke then arc along the parent ring —
  // Tagged with the parent match id so selection can re-style them without a rebuild.
  const lines = el('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  for (const m of matches) {
    const isRoot = m === root;
    const radius = geo.radii[m.round];
    const parentPt = polar(m.angle, radius);
    for (const child of [m.left, m.right]) {
      if (!child) continue;
      const occ = teamAt(child, winners, teamById);
      const advanced = !!occ && winners[m.id] === occ.id;

      let d;
      if (isRoot) {
        const u = polar(child.angle, geo.innerStub);
        d = `M ${child.x.toFixed(2)} ${child.y.toFixed(2)} L ${u.x.toFixed(2)} ${u.y.toFixed(2)}`;
      } else {
        const ring = polar(child.angle, radius);
        const sweep = child.angle < m.angle ? 1 : 0;
        d = `M ${child.x.toFixed(2)} ${child.y.toFixed(2)} L ${ring.x.toFixed(2)} ${ring.y.toFixed(2)} ` +
            `A ${radius} ${radius} 0 0 ${sweep} ${parentPt.x.toFixed(2)} ${parentPt.y.toFixed(2)}`;
      }

      const path = el('path', { d, class: 'path-draw' });
      path.dataset.parent = m.id;
      path.dataset.win = advanced ? '1' : '0';
      path.style.setProperty('--len', '500');
      path.style.animationDelay = `${(m.round - 1) * 0.14}s`;
      lines.append(path);
    }
  }
  svg.append(lines);

  // — match-node badges (everything inward of the teams, except the final/centre) —
  for (const m of matches) {
    if (m === root) continue;
    const occ = teamAt(m, winners, teamById);
    if (occ) svg.append(badge(m, occ, m.size, m.id, true, () => onSelect(m.id)));
    else svg.append(placeholder(m.x, m.y, 0.42 * m.size));
  }

  // — outer ring: the qualified teams —
  for (const leaf of leaves) {
    if (leaf.team) {
      const selMatch = leaf.parent ? leaf.parent.id : null;
      svg.append(badge(leaf, leaf.team, leaf.size, selMatch, hasAdvanced(leaf, winners, teamById), () => onSelect(selMatch)));
    } else {
      svg.append(placeholder(leaf.x, leaf.y, 0.5 * leaf.size));
    }
  }

  // — champion badge at centre, once the final is decided —
  const champ = teamAt(root, winners, teamById);
  if (champ) svg.append(badge({ ...root, x: 500, y: 500 }, champ, root.size, root.id, true, () => onSelect(root.id)));

  updateSelection(svg, null);
}

function placeholder(x, y, r) {
  return el('circle', { cx: x, cy: y, r, fill: DARK, stroke: MUTED, 'stroke-opacity': 0.55, 'stroke-width': 1.5 });
}

// One circular flag badge: dark backing, slice-fit flag, plus a ring whose colour is
// set later by updateSelection. `selMatchId` is the match this badge selects/highlights.
function badge(node, team, size, selMatchId, winner, onClick) {
  const clip = `clip-${node.id}`;
  const g = el('g', { class: 'badge-interactive node-pop cursor-pointer', role: 'button', 'aria-label': `View ${team.name}'s match`, tabindex: '0' });
  g.style.animationDelay = `${0.5 + 0.12 * node.round}s`;
  g.dataset.sel = selMatchId || '';
  g.dataset.win = winner ? '1' : '0';
  g.dataset.cx = node.x;
  g.dataset.cy = node.y;
  g.dataset.size = size;

  const clipPath = el('clipPath', { id: clip });
  clipPath.append(el('circle', { cx: node.x, cy: node.y, r: size }));
  g.append(clipPath);
  g.append(el('circle', { cx: node.x, cy: node.y, r: size + 2, fill: DARK }));
  const img = el('image', { href: flagUrl(team.code), x: node.x - size, y: node.y - size, width: 2 * size, height: 2 * size, 'clip-path': `url(#${clip})`, preserveAspectRatio: 'xMidYMid slice' });
  // Older editions occasionally lack a flag for a defunct nation — drop the broken
  // image and let the abbreviation show on the dark backing instead.
  img.addEventListener('error', () => {
    img.remove();
    const label = el('text', { x: node.x, y: node.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#cdbb8e', 'font-size': size * 0.7, 'font-family': 'ui-monospace, monospace', 'font-weight': '700' });
    label.textContent = (team.short || team.code || '').slice(0, 3);
    g.insertBefore(label, g.querySelector('.b-ring'));
  });
  g.append(img);
  g.append(el('circle', { cx: node.x, cy: node.y, r: size, fill: 'none', class: 'b-ring' }));

  g.addEventListener('click', onClick);
  g.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
  });
  return g;
}

// Re-style connectors and badge rings for the current selection — no DOM rebuild,
// so entrance animations never replay on click.
export function updateSelection(svg, selectedId) {
  for (const path of svg.querySelectorAll('path[data-parent]')) {
    const win = path.dataset.win === '1';
    const active = win && path.dataset.parent === selectedId;
    path.setAttribute('stroke', win ? GOLD : MUTED);
    path.setAttribute('stroke-opacity', active ? 1 : win ? 0.85 : 0.55);
    path.setAttribute('stroke-width', active ? 4 : win ? 2.5 : 1.5);
  }
  for (const g of svg.querySelectorAll('.badge-interactive')) {
    const selected = !!selectedId && g.dataset.sel === selectedId;
    const win = g.dataset.win === '1';
    const ring = g.querySelector('.b-ring');
    ring.setAttribute('stroke', selected || win ? GOLD : FAINT);
    ring.setAttribute('stroke-width', win || selected ? 3 : 1.5);
    ring.setAttribute('opacity', win || selected ? 1 : 0.85);

    let pulse = g.querySelector('.ring-pulse');
    if (selected && !pulse) {
      const cx = +g.dataset.cx, cy = +g.dataset.cy, size = +g.dataset.size;
      pulse = el('circle', { cx, cy, r: size + 6, fill: 'none', stroke: GOLD, 'stroke-opacity': 0.5, 'stroke-width': 2, class: 'ring-pulse' });
      g.insertBefore(pulse, g.firstChild.nextSibling);
    } else if (!selected && pulse) {
      pulse.remove();
    }
  }
}
