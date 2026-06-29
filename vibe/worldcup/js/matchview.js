// Full match view — both starting XIs on a formation pitch, plus a goal/card/sub
// timeline and possession. Fed by loadMatchDetail() in fifa.js.

import { flagUrl } from './fifa.js';

// Split a team's starting XI into rows from its own goal line outward, using the
// formation string ("4-1-2-3"). Falls back to grouping by position if it doesn't fit.
function formationRows(team) {
  const starters = team.players.filter((p) => p.starter);
  const gk = starters.find((p) => p.pos === 0) || starters[0];
  const outfield = starters.filter((p) => p !== gk).sort((a, b) => (a.pos - b.pos) || (a.num - b.num));
  const nums = (team.formation || '').split('-').map(Number).filter((n) => n > 0);

  const rows = [[gk]];
  if (nums.length && nums.reduce((a, b) => a + b, 0) === outfield.length) {
    let i = 0;
    for (const n of nums) rows.push(outfield.slice(i, (i += n)));
  } else {
    for (const pos of [1, 2, 3]) {
      const line = outfield.filter((p) => p.pos === pos);
      if (line.length) rows.push(line);
    }
    const placed = rows.flat().length;
    if (placed < starters.length) rows.push(outfield.filter((p) => !rows.flat().includes(p)));
  }
  return rows;
}

function chip(player, side) {
  const el = document.createElement('div');
  el.className = `pitch-chip ${side}`;

  // The number/captain badges live outside the (overflow-hidden) photo disc so they
  // sit on top and aren't clipped by the circle.
  const wrap = document.createElement('div');
  wrap.className = 'chip-photo';

  const disc = document.createElement('div');
  disc.className = 'chip-disc';
  disc.dataset.num = player.num ?? '';
  // FIFA serves a full-body cutout, so we frame it to the face via background crop.
  // The shirt number shows underneath until (and unless) the photo actually loads.
  if (player.photo) {
    disc.style.setProperty('--photo', `url("${player.photo}")`);
    const probe = new Image();
    probe.addEventListener('load', () => disc.classList.add('has-photo'));
    probe.src = player.photo;
  }
  wrap.append(disc);

  if (player.captain) {
    const c = document.createElement('span');
    c.className = 'chip-capt';
    c.textContent = 'C';
    wrap.append(c);
  }
  if (player.num != null) {
    const num = document.createElement('span');
    num.className = 'chip-num';
    num.textContent = player.num;
    wrap.append(num);
  }

  const name = document.createElement('span');
  name.className = 'chip-name';
  name.textContent = player.surname;
  el.append(wrap, name);
  return el;
}

function half(team, side) {
  const wrap = document.createElement('div');
  wrap.className = `pitch-half ${side}`;
  let rows = formationRows(team);
  // Home defends the bottom goal: render its rows reversed so the GK sits at the base.
  if (side === 'home') rows = [...rows].reverse();
  for (const row of rows) {
    const r = document.createElement('div');
    r.className = 'pitch-row';
    for (const p of row) r.append(chip(p, side));
    wrap.append(r);
  }
  return wrap;
}

function teamHeader(team, side) {
  const el = document.createElement('div');
  el.className = `mv-team ${side}`;
  el.innerHTML = `
    <img class="mv-flag" src="${flagUrl(team.code)}" alt="">
    <div class="mv-team-text">
      <div class="mv-team-name">${team.name}</div>
      <div class="mv-team-meta">${[team.formation, team.coach].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="mv-score">${team.score ?? ''}</div>`;
  return el;
}

const EVENT_ICON = { goal: '⚽', yellow: '🟨', red: '🟥', sub: '🔁' };

function eventRow(ev) {
  const row = document.createElement('div');
  row.className = `mv-event ${ev.side}`;
  const text = ev.kind === 'sub'
    ? `<span class="ev-on">${ev.on}</span> <span class="ev-off">${ev.off}</span>`
    : `${ev.text}${ev.assist ? ` <span class="ev-assist">(${ev.assist})</span>` : ''}`;
  row.innerHTML = `
    <span class="ev-min">${ev.minute || ''}</span>
    <span class="ev-icon">${EVENT_ICON[ev.kind] || ''}</span>
    <span class="ev-text">${text}</span>`;
  return row;
}

// Build the whole match view into `container`.
export function renderMatchView(container, detail, heading) {
  container.replaceChildren();

  const head = document.createElement('div');
  head.className = 'mv-head';
  if (heading) {
    const round = document.createElement('p');
    round.className = 'mv-round';
    round.textContent = heading;
    head.append(round);
  }
  const teams = document.createElement('div');
  teams.className = 'mv-teams';
  teams.append(teamHeader(detail.home, 'home'), document.createElement('div'), teamHeader(detail.away, 'away'));
  teams.children[1].className = 'mv-vs';
  teams.children[1].textContent = '–';
  head.append(teams);

  if (detail.possession) {
    const poss = document.createElement('div');
    poss.className = 'mv-poss';
    poss.innerHTML = `
      <span class="poss-val">${detail.possession.home}%</span>
      <span class="poss-bar"><span class="poss-fill" style="width:${detail.possession.home}%"></span></span>
      <span class="poss-val">${detail.possession.away}%</span>`;
    head.append(poss);
    const lbl = document.createElement('p');
    lbl.className = 'mv-poss-label';
    lbl.textContent = 'Possession';
    head.append(lbl);
  }
  container.append(head);

  // Pitch
  const pitch = document.createElement('div');
  pitch.className = 'mv-pitch';
  pitch.append(half(detail.away, 'away'), half(detail.home, 'home'));
  container.append(pitch);

  // Timeline
  if (detail.events.length) {
    const tl = document.createElement('div');
    tl.className = 'mv-timeline';
    const h = document.createElement('p');
    h.className = 'mv-section';
    h.textContent = 'Timeline';
    tl.append(h);
    for (const ev of detail.events) tl.append(eventRow(ev));
    container.append(tl);
  }
}
