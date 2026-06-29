// Live data layer — FIFA's own public API (no key, CORS-open).
//
// The reference app is just a baked snapshot of this same feed, so this is the
// genuine upstream source. We fetch a tournament's full match calendar and fold
// the knockout stage into the bracket model the renderer wants: the qualified
// teams in seeding order, a results map, an info map, and the champion.
//
// Two eras, two ways the knockout links up:
//   • 2022 & 2026 expose PlaceHolders ("W74" = winner of match 74) — a real tree
//     even before the matches are played.
//   • Every older (completed) cup has no such links, so we reconstruct the tree by
//     winner-matching: a match's participants are the winners of the round below.
// Either way the bracket is a perfect binary tree, walked from the Final outward to
// recover the seeding order and the m-{round}-{index} ids the renderer keys on.

import { fifaSnapshot } from './snapshot.js';

const COMPETITION = 17; // FIFA World Cup
const SNAPSHOT_ID = 285023; // 2026 — the one we bundle for offline fallback

// Every edition that resolves to a clean knockout bracket. (1934/1938 had replays
// that broke the binary tree; 1950 ended in a final group with no knockout — omitted.)
export const SEASONS = [
  { id: 285023, year: 2026, host: 'USA · Canada · Mexico' },
  { id: 255711, year: 2022, host: 'Qatar' },
  { id: 254645, year: 2018, host: 'Russia' },
  { id: 251164, year: 2014, host: 'Brazil' },
  { id: 249715, year: 2010, host: 'South Africa' },
  { id: 9741, year: 2006, host: 'Germany' },
  { id: 4395, year: 2002, host: 'Korea/Japan' },
  { id: 1013, year: 1998, host: 'France' },
  { id: 84, year: 1994, host: 'United States' },
  { id: 76, year: 1990, host: 'Italy' },
  { id: 68, year: 1986, host: 'Mexico' },
  { id: 59, year: 1982, host: 'Spain' },
  { id: 50, year: 1978, host: 'Argentina' },
  { id: 39, year: 1974, host: 'West Germany' },
  { id: 32, year: 1970, host: 'Mexico' },
  { id: 26, year: 1966, host: 'England' },
  { id: 21, year: 1962, host: 'Chile' },
  { id: 15, year: 1958, host: 'Sweden' },
  { id: 9, year: 1954, host: 'Switzerland' },
  { id: 1, year: 1930, host: 'Uruguay' },
];

// Knockout stages, ranked from the outer ring inward. Anything not here (group play,
// "second round" mini-leagues, third-place play-offs) is treated as upstream.
const STAGE_RANK = {
  'Round of 32': 1,
  'Round of 16': 2,
  'Quarter-final': 3,
  'Quarter-finals': 3,
  'Quarter Finals': 3,
  'Semi-final': 4,
  'Semi-finals': 4,
  'Semi Finals': 4,
  Final: 5,
};

const desc = (arr) => (Array.isArray(arr) && arr[0] ? arr[0].Description : undefined);
const stageName = (m) => desc(m.StageName) || '';
const teamName = (t) => (t ? desc(t.TeamName) : undefined);
const venueOf = (m) => desc(m.Stadium?.Name) || desc(m.Stadium?.CityName) || '';

// FIFA serves flags from its own CDN, keyed by the 3-letter country id (GER, BRA…).
export function flagUrl(code) {
  return code ? `https://api.fifa.com/api/v3/picture/flags-sq-4/${code}` : '';
}

function toTeam(t) {
  if (!t || !t.IdCountry) return null;
  return { id: t.IdCountry, name: teamName(t) || t.IdCountry, short: t.Abbreviation || t.IdCountry, code: t.IdCountry };
}

function played(m) {
  return m.HomeTeamScore != null && m.AwayTeamScore != null;
}

// Winning side's country id — by FIFA's Winner (an IdTeam), falling back to score/pens.
function winnerCode(m) {
  const { Home: home, Away: away } = m;
  if (m.Winner && home?.IdTeam && m.Winner === home.IdTeam) return home.IdCountry;
  if (m.Winner && away?.IdTeam && m.Winner === away.IdTeam) return away.IdCountry;
  if (m.HomeTeamScore > m.AwayTeamScore) return home?.IdCountry;
  if (m.AwayTeamScore > m.HomeTeamScore) return away?.IdCountry;
  if (m.HomeTeamPenaltyScore != null && m.AwayTeamPenaltyScore != null) {
    return (m.HomeTeamPenaltyScore > m.AwayTeamPenaltyScore ? home : away)?.IdCountry;
  }
  return undefined;
}

// Fold the raw FIFA Results array into the bracket model.
export function transform(rawResults) {
  const ko = rawResults.filter((m) => STAGE_RANK[stageName(m)]);
  if (!ko.length) throw new Error('no knockout stage in feed');

  // Re-base stages so the outer ring is round 1 and the Final is round D.
  const ranks = ko.map((m) => STAGE_RANK[stageName(m)]);
  const minRank = Math.min(...ranks);
  const D = Math.max(...ranks) - minRank + 1;
  const roundOf = (m) => STAGE_RANK[stageName(m)] - minRank + 1;

  const byNumber = new Map(ko.map((m) => [m.MatchNumber, m]));
  const final = ko.find((m) => roundOf(m) === D);
  if (!final) throw new Error('no final match in feed');

  // winners by round, indexed by country id — used to link completed older cups.
  const winnerByRound = new Map();
  for (const m of ko) {
    if (!played(m)) continue;
    const w = winnerCode(m);
    if (!w) continue;
    const r = roundOf(m);
    if (!winnerByRound.has(r)) winnerByRound.set(r, new Map());
    winnerByRound.get(r).set(w, m);
  }

  const childOf = (m, placeholder, team) => {
    const link = /^W(\d+)$/.exec(placeholder || '');
    if (link) return byNumber.get(Number(link[1]));
    const id = team?.IdCountry;
    if (id) return winnerByRound.get(roundOf(m) - 1)?.get(id);
    return undefined;
  };

  const teams = [];
  const roundMatches = {};

  // In-order walk: left subtree, this match, right subtree. For a perfect binary
  // tree this visits every round left-to-right — the indexing the geometry expects.
  (function walk(m) {
    const r = roundOf(m);
    const left = childOf(m, m.PlaceHolderA, m.Home);
    const right = childOf(m, m.PlaceHolderB, m.Away);
    if (left) walk(left);
    else teams.push(toTeam(m.Home));
    (roundMatches[r] ||= []).push(m);
    if (right) walk(right);
    else teams.push(toTeam(m.Away));
  })(final);

  const results = {};
  const info = {};
  let championId = null;

  for (let round = 1; round <= D; round++) {
    (roundMatches[round] || []).forEach((m, index) => {
      const id = `m-${round}-${index}`;
      info[id] = { kickoff: m.LocalDate || m.Date, ground: venueOf(m), idMatch: m.IdMatch, idStage: m.IdStage };
      if (played(m)) {
        const winner = winnerCode(m);
        // FIFA returns 0–0 penalties for matches that never went to a shootout, so a
        // real shootout is only one where the totals add up to something.
        const hp = m.HomeTeamPenaltyScore;
        const ap = m.AwayTeamPenaltyScore;
        const pens = hp != null && ap != null && hp + ap > 0 ? [hp, ap] : null;
        results[id] = { winner, score: [m.HomeTeamScore, m.AwayTeamScore], pens };
        if (round === D && winner) championId = winner;
      }
    });
  }

  return { teams, results, info, championId, rounds: D };
}

const cache = new Map();

async function fetchSeason(id) {
  const url = `https://api.fifa.com/api/v3/calendar/matches?idCompetition=${COMPETITION}&idSeason=${id}&count=300&language=en`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`FIFA ${res.status}`);
    const json = await res.json();
    return json.Results || [];
  } finally {
    clearTimeout(timer);
  }
}

// Load one edition, fetched live (cached per session). The bundled 2026 snapshot is
// the offline fallback for the default tournament only.
export async function loadSeason(season) {
  if (cache.has(season.id)) return cache.get(season.id);
  let results;
  let live = true;
  try {
    results = await fetchSeason(season.id);
  } catch (err) {
    if (season.id === SNAPSHOT_ID) {
      console.warn('FIFA live fetch failed, using snapshot:', err.message);
      results = fifaSnapshot.Results;
      live = false;
    } else {
      throw err;
    }
  }
  const out = { ...transform(results), live, season };
  cache.set(season.id, out);
  return out;
}

// — single-match detail (lineups, goals, cards, subs) —

export function playerPhoto(p) {
  return p?.PlayerPicture?.PictureUrl || p?.PictureUrl || '';
}

const POSITIONS = { 0: 'GK', 1: 'DEF', 2: 'MID', 3: 'FWD' };
const minuteNum = (s) => parseInt(String(s || '').replace(/\D/g, ''), 10) || 0;

function parseTeam(t, nameById) {
  const players = (t.Players || []).map((p) => {
    const name = teamName({ TeamName: p.PlayerName }) || (desc(p.ShortName)) || '';
    nameById.set(p.IdPlayer, name);
    return {
      id: p.IdPlayer,
      num: p.ShirtNumber,
      name,
      surname: surnameOf(name),
      pos: p.Position,
      posLabel: POSITIONS[p.Position] || '',
      captain: p.Captain === true,
      starter: p.Status === 1,
      photo: playerPhoto(p),
    };
  });
  return {
    id: t.IdTeam,
    code: t.IdCountry,
    name: teamName(t) || t.IdCountry,
    score: t.Score,
    formation: t.Tactics || '',
    coach: desc((t.Coaches || [])[0]?.CoachName) || '',
    players,
    _goals: t.Goals || [],
    _subs: t.Substitutions || [],
    _bookings: t.Bookings || [],
  };
}

// Surname = the run of CAPITALISED words FIFA uses, e.g. "Raul RANGEL" -> "RANGEL".
function surnameOf(name) {
  const caps = name.split(/\s+/).filter((w) => w.length > 1 && w === w.toUpperCase());
  return (caps.length ? caps.join(' ') : name.split(/\s+/).slice(-1)[0]) || name;
}

const GOAL_SUFFIX = { 3: ' (P)', 4: ' (OG)', 5: ' (OG)' };

// Fetch and flatten one match into teams + a single chronological event timeline.
export async function loadMatchDetail(season, idStage, idMatch) {
  const url = `https://api.fifa.com/api/v3/live/football/${COMPETITION}/${season.id}/${idStage}/${idMatch}?language=en`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  let d;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`FIFA ${res.status}`);
    d = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const nameById = new Map();
  const home = parseTeam(d.HomeTeam || {}, nameById);
  const away = parseTeam(d.AwayTeam || {}, nameById);
  const nameOf = (id) => nameById.get(id) || '';

  const events = [];
  for (const [team, side] of [[home, 'home'], [away, 'away']]) {
    for (const g of team._goals) {
      events.push({ kind: 'goal', side, minute: g.Minute, sort: minuteNum(g.Minute), text: nameOf(g.IdPlayer) + (GOAL_SUFFIX[g.Type] || ''), assist: nameOf(g.IdAssistPlayer) });
    }
    for (const b of team._bookings) {
      events.push({ kind: b.Card === 2 ? 'red' : 'yellow', side, minute: b.Minute, sort: minuteNum(b.Minute), text: nameOf(b.IdPlayer) });
    }
    for (const s of team._subs) {
      events.push({ kind: 'sub', side, minute: s.Minute, sort: minuteNum(s.Minute), on: desc(s.PlayerOnName), off: desc(s.PlayerOffName) });
    }
  }
  // Unknown minutes (0) sort to the end rather than the top.
  events.sort((a, b) => (a.sort || 999) - (b.sort || 999));

  const poss = d.BallPossession?.Intervals?.slice(-1)[0] || d.BallPossession || null;
  const possession = poss && poss.HomePercentage != null
    ? { home: Math.round(poss.HomePercentage), away: Math.round(poss.AwayPercentage) }
    : null;

  return { home, away, events, possession, attendance: d.Attendance };
}
