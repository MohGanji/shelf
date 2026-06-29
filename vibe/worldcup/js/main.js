import { loadSeason, loadMatchDetail, SEASONS } from './fifa.js';
import { buildBracket, renderBracket, updateSelection, teamAt, flagUrl, ALL_ROUND_LABELS } from './bracket.js';
import { renderMatchView } from './matchview.js';

const svg = document.getElementById('bracket');
const detail = document.getElementById('detail');
const subtitle = document.getElementById('subtitle');
const titleEl = document.getElementById('title');
const hostsEl = document.getElementById('hosts');
const seasonBtn = document.getElementById('season-btn');
const seasonMenu = document.getElementById('season-menu');
const overlay = document.getElementById('match-overlay');
const matchBody = document.getElementById('match-body');

// Populated each time a tournament loads.
let teams = [];
let results = {};
let info = {};
let teamById = {};
let winners = {};
let tree = { root: null, nodes: [] };
let nodeById = {};
let depth = 5;
let selectedId = null;
let season = SEASONS[0];

// An 8-team cup's outer ring is the Quarter-final, not the Round of 32 — so labels
// are re-based against the tournament's depth (the Final is always the last label).
function roundLabel(round) {
  return ALL_ROUND_LABELS[(ALL_ROUND_LABELS.length - depth) + (round - 1)] ?? '';
}

// Selection only flips styles + the detail card — the bracket itself is built once.
function select(id) {
  selectedId = selectedId === id ? null : id;
  updateSelection(svg, selectedId);
  renderDetail();
}

function draw() {
  renderBracket(svg, tree, { teamById, winners, onSelect: select });
  updateSelection(svg, selectedId);
  renderDetail();
}

// — match detail card —
function renderDetail() {
  const node = selectedId ? nodeById[selectedId] : null;
  if (!node) {
    detail.hidden = true;
    detail.replaceChildren();
    subtitle.hidden = false;
    return;
  }
  subtitle.hidden = true;
  detail.hidden = false;

  const a = teamAt(node.left, winners, teamById);
  const b = teamAt(node.right, winners, teamById);
  const res = results[node.id];
  const meta = info[node.id];
  const isFinal = node.round === depth;

  detail.className = 'detail panel-in';
  detail.replaceChildren();

  const label = document.createElement('p');
  label.className = 'detail-round';
  label.textContent = roundLabel(node.round);
  detail.append(label);

  const row = document.createElement('div');
  row.className = 'detail-teams';
  row.append(
    teamCell(a, res && res.winner === a?.id, res ? res.score?.[0] : null, false),
    centerCell(res),
    teamCell(b, res && res.winner === b?.id, res ? res.score?.[1] : null, true),
  );
  detail.append(row);

  if (meta && (meta.ground || meta.kickoff)) {
    const venue = document.createElement('div');
    venue.className = 'detail-venue';
    const when = formatKickoff(meta);
    venue.innerHTML = [meta.ground, when].filter(Boolean).join(' &middot; ');
    detail.append(venue);
  }

  if (isFinal && res) {
    const champ = teamById[res.winner];
    const banner = document.createElement('div');
    banner.className = 'detail-champion';
    banner.innerHTML = `<p class="champ-label">Champion</p><p class="champ-name">${champ?.name ?? ''}</p>`;
    detail.append(banner);
  }

  // Lineups + stats are only available once a match has been played.
  if (res && meta?.idMatch && meta?.idStage) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'detail-more';
    btn.textContent = 'Lineups & stats →';
    btn.addEventListener('click', () => openMatch(meta, roundLabel(node.round)));
    detail.append(btn);
  }
}

// — full match overlay (lineups, timeline, possession) —
let matchToken = 0;
async function openMatch(meta, heading) {
  const token = ++matchToken;
  overlay.hidden = false;
  document.body.classList.add('modal-open');
  matchBody.innerHTML = '<p class="mv-loading">Loading lineups…</p>';
  try {
    const data = await loadMatchDetail(season, meta.idStage, meta.idMatch);
    if (token !== matchToken) return; // a newer open won
    if (!data.home.players.length && !data.away.players.length) {
      matchBody.innerHTML = '<p class="mv-loading">No lineup data for this match yet.</p>';
      return;
    }
    renderMatchView(matchBody, data, heading);
  } catch (err) {
    if (token !== matchToken) return;
    console.warn('match detail failed:', err.message);
    matchBody.innerHTML = '<p class="mv-loading">Couldn’t load this match. Try again.</p>';
  }
}
function closeMatch() {
  overlay.hidden = true;
  document.body.classList.remove('modal-open');
  matchBody.replaceChildren();
}
document.getElementById('match-close').addEventListener('click', closeMatch);
overlay.querySelector('.match-backdrop').addEventListener('click', closeMatch);

function teamCell(team, won, score, reverse) {
  const cell = document.createElement('div');
  cell.className = 'team-cell' + (reverse ? ' reverse' : '') + (won ? ' won' : '') + (team && !won ? ' dim' : '');
  if (!team) {
    cell.innerHTML = '<span class="team-tbd">TBD</span>';
    return cell;
  }
  const flag = document.createElement('img');
  flag.className = 'team-flag';
  flag.src = flagUrl(team.code, 80);
  flag.alt = '';
  const name = document.createElement('span');
  name.className = 'team-name';
  name.textContent = team.name;
  const sc = document.createElement('span');
  sc.className = 'team-score';
  sc.textContent = score == null ? '' : String(score);
  cell.append(flag, name, sc);
  return cell;
}

function centerCell(res) {
  const c = document.createElement('span');
  c.className = 'detail-vs';
  c.textContent = res && res.pens ? `${res.pens[0]}–${res.pens[1]} pen` : 'vs';
  return c;
}

// "Sun, Jun 28 · 12:00" from FIFA's local kickoff ISO. We read the date and time
// parts straight off the string so the displayed time is the stadium-local one,
// regardless of the viewer's timezone.
function formatKickoff(meta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(meta.kickoff || '');
  if (!m) return '';
  const [, y, mo, da, hh, mm] = m;
  const d = new Date(Date.UTC(+y, +mo - 1, +da));
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${date} &middot; ${hh}:${mm}`;
}

// Deselect on background click / Escape; Escape also closes the season menu.
svg.addEventListener('click', (e) => {
  if (e.target === svg) select(null);
});
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!overlay.hidden) closeMatch();
  else if (seasonBtn.getAttribute('aria-expanded') === 'true') closeMenu();
  else if (selectedId) select(null);
});

// — season selector (the whole top-left card opens it) —
function buildMenu() {
  seasonMenu.replaceChildren();
  for (const s of SEASONS) {
    const item = document.createElement('button');
    item.className = 'season-item';
    item.type = 'button';
    item.dataset.id = s.id;
    item.setAttribute('aria-current', s.id === season.id ? 'true' : 'false');
    item.innerHTML = `<span class="season-year">${s.year}</span><span class="season-host">${s.host}</span>`;
    item.addEventListener('click', () => { closeMenu(); if (s.id !== season.id) load(s); });
    seasonMenu.append(item);
  }
}

function openMenu() {
  buildMenu();
  seasonMenu.hidden = false;
  seasonBtn.setAttribute('aria-expanded', 'true');
}
function closeMenu() {
  seasonMenu.hidden = true;
  seasonBtn.setAttribute('aria-expanded', 'false');
}
seasonBtn.addEventListener('click', () => {
  if (seasonBtn.getAttribute('aria-expanded') === 'true') closeMenu();
  else openMenu();
});
document.addEventListener('click', (e) => {
  if (seasonBtn.getAttribute('aria-expanded') === 'true' && !e.target.closest('.hud')) closeMenu();
});

async function load(s) {
  season = s;
  selectedId = null;
  titleEl.innerHTML = `WORLD&nbsp;CUP&nbsp;<span class="yr">${s.year}</span>`;
  hostsEl.textContent = s.host;
  detail.hidden = true;
  detail.replaceChildren();
  subtitle.hidden = false;
  subtitle.textContent = `Loading ${s.year}…`;
  svg.replaceChildren();

  let data;
  try {
    data = await loadSeason(s);
  } catch (err) {
    console.warn('season load failed:', err.message);
    subtitle.textContent = `Couldn't load ${s.year}. Check your connection and try another.`;
    return;
  }
  if (season.id !== s.id) return; // a newer selection won the race

  teams = data.teams;
  results = data.results;
  info = data.info;
  depth = data.rounds;
  teamById = Object.fromEntries(teams.filter(Boolean).map((t) => [t.id, t]));
  winners = Object.fromEntries(Object.entries(results).map(([id, r]) => [id, r.winner]));
  tree = buildBracket(teams, true);
  nodeById = Object.fromEntries(tree.nodes.map((n) => [n.id, n]));
  subtitle.textContent = 'Tap any badge to see the matchup and result.';
  draw();
}

load(season);
