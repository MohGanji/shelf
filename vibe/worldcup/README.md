# World Cup — Radial Knockout Bracket

A radial knockout bracket for **every FIFA World Cup, 1930–2026**. The qualified teams
sit on the outer ring; each match merges a pair one ring inward until the Final resolves
at the centre, where the trophy sits. Tap any flag badge to open the matchup: the two
teams, the score (or `vs` if it hasn't kicked off yet), penalties where they happened,
and the host venue + kickoff time.

For any played match, **Lineups & stats** opens a full match view: both starting XIs on
a formation pitch (player photos, shirt numbers, captain marks — falling back to numbers
for the pre-photo eras), plus a goal/card/substitution timeline and possession. It works
right back to the 1970 final.

The whole title card is a **selector** — click it to jump between editions. The bracket
re-scales to the field: 2026's 32 teams span five rings and a wide circle; 1930's four
teams are two rings and a small one. Round labels re-base accordingly (an 8-team cup's
outer ring is the Quarter-final, not the Round of 32).

Started as a faithful rebuild of [v0-football-worldcup-2026.vercel.app](https://v0-football-worldcup-2026.vercel.app/)
— same radial layout, gold-on-pitch palette, draw-in connectors, breathing glow, and
floating trophy — then extended across every tournament.

## How it works

- **Live data on load.** `js/fifa.js` fetches a tournament's full match calendar from
  FIFA's own public API when you open or switch editions (results cached per session),
  so the in-progress 2026 bracket is always current — not a frozen snapshot. If the
  network fails on 2026 it falls back to a bundled `js/snapshot.js` capture.
- **Two eras, two ways to link the tree.** 2022 & 2026 expose PlaceHolders (`"W74"` =
  winner of match 74), a real tree even before matches are played. Older completed cups
  have no such links, so the tree is rebuilt by **winner-matching**: a match's two
  participants are the winners of the round below. Either way `fifa.js` walks from the
  Final outward to recover the seeding order and the `m-{round}-{index}` ids;
  `js/bracket.js` lays it out from the seeding order alone — nothing is hand-written.
- **The bracket adapts to the field.** Depth `D` = number of knockout rounds (5 for
  2026 down to 1 for 1974/78). `geometryFor(D, N)` picks a smaller outer radius and
  fewer rings for smaller fields, and scales badges and the trophy to match. Stages are
  re-based so each tournament's outer ring is its real first knockout round.
- **Results fill in over time.** Only played matches carry a result; the winner advances
  inward and its connector lights up gold. Everything else shows `vs`. (FIFA returns
  0–0 penalties for matches that never went to a shootout, so those are filtered out.)
- **Editions covered:** 1930–2026, excluding 1934 & 1938 (replays broke the binary
  tree) and 1950 (ended in a final group, no knockout).

## Data source

Everything comes from **FIFA's official public API** — the same upstream the reference
app baked its snapshot from (its results match FIFA's match-for-match):

- `https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason={SEASON}` —
  fixtures, scores, penalties, venues, kickoff times, and bracket linkage, per edition.
- `https://api.fifa.com/api/v3/live/football/17/{SEASON}/{STAGE}/{MATCH}` — lineups,
  formations, goals, cards, substitutions and possession for the match view.
- `https://api.fifa.com/api/v3/picture/flags-sq-4/{COUNTRY}` — flag badges (with an
  abbreviation fallback for defunct nations whose flag is missing).
- `https://digitalhub.fifa.com/...` — player headshots (number fallback when missing).

No API key, and the endpoint sends `Access-Control-Allow-Origin: *`, so it's fetched
directly from the browser with no proxy.

## Stack

Static ES modules — no build, no keys. Open `index.html`, or serve the folder over any
static HTTP server (e.g. `live-server .`).
