# C01-04 — Each of the thirty rounds fields the cast its name promises

**Lane 2.** Follows G08-02 (commit aad98992): the thirty rounds have names and twist lines
(`src/data/swarmCourse.js`), but only 7 twists are wired. Most of the rest are **who comes through the
gates** — and the round must actually field them.

## The design (exact, from `design/game/12_SWARM_THE_PIT.md` "The Course" and `src/data/swarmCourse.js`)
For every round 1–30, read its twist line and make the wave composition match it. Examples:
round 1 *ten Wasps, one gate*; 2 *Wasps from two gates*; 3 *Detonator Darts*; 6 *Bruisers*; 7 *Lancers at
the edges, Wasps in the middle*; 8 *Jackals*; 9 *Tether Raiders*; 11 *a Warden shielding gunners*;
13 *Ghosts*; 14 *Anchor Controllers*; 17 *Point-Defense Screens*; 18 *Reavers*; 19 *Lawmen and Cutters*;
21 *heavies, shoulder to shoulder*; 23 *Zealots in rings*; 26 *two Wardens covering each other*; bosses on
5/10/15/20/25/30 (already wired by C01-01 — keep them).

## Build
1. Find where a round's composition comes from today (`src/data/swarmMode.js` / `swarmLadder.js` /
   `survivalWaves.js` / `waveMaterialization.js` — trace from the round number to the enemy ids it
   spawns). Add a per-round **cast table** for rounds 1–30 that names the enemy ids (from
   `src/data/swarmCharacter.js` `SWARM_CHARACTER_SHEET`) and counts per gate, matching each twist line.
   Keep the existing difficulty curve: total threat per round may stay as today's; the **mix** follows the
   line. Formations the line names ("at the edges", "in the middle", "shoulder to shoulder", "in rings",
   "from two gates") go through the existing spawn-gate/formation seam; if a formation does not exist, use
   the closest gate arrangement and list it in your receipt.
2. An enemy the line names that has no entry in the sheet (e.g. "Ghosts", "Point-Defense Screens") —
   use the closest existing enemy whose `abilityId`/`tellId` matches and list it; do not invent enemies.
3. Rounds past 30 (Keep going) keep today's endless composition.

## Checks
- `test/swarm-course-cast.test.mjs`: for each round 1–30 the spawned ids (through the real materialization
  path, real seed) match the cast table; every id exists in the sheet.
- `node --test test/swarm*.test.mjs test/survival*.test.mjs test/seed-sw-*.test.mjs` — report failures vs
  the known reds; update a seed test only when its assertion pins the old composition, with a one-line reason.
- One look through the lock: `node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=7 --rounds=1 --duration=40 --out=.devshots/fleet/cast-r7`
  — say whether Lancers are at the edges and Wasps in the middle.

Commit: `fleet(C01-04): every round fields the cast its name promises`.
