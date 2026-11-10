# M-07 catalog — swarm arena

Surface: `src/data/swarm{Mode,Brood,BroodLate,Ladder,Events,Juice,Catalog,Stakes,Draft,
Perks,Hangar,Threats,ThreatMark,WeaponLevels,Crossover,OpticArenas}.js` +
`src/systems/swarmArena.js` (dirty, foreign) + `src/systems/swarmBrood.js`.

## What already exists

- Wave planner (pure, seeded), boss rotation every 10th wave, 7 arenas × ladders/seeds,
  event cards (surge/pulse/mines/supply) with telegraph lines, brood families with
  `telegraph {bark,line,cue}` + `counter` + `deathLeaves`.
- `swarmJuice.js`: chain tiers, `SWARM_KILL_WORDS`, per-arena `SWARM_ARENA_KILL_WORDS`
  (7 rooms each re-voicing six kill causes), multi-kill words, hit-stop math, round
  tally, `SWARM_NEWCOMER_COUNTERS` — "body part, then verb" counter cards, one per
  roster archetype that debuts past wave 1.

## Writable seams

- `SWARM_NEWCOMER_COUNTERS` covers 14/20 roster ids; the missing six are bosses
  (no debut card) and `wasp_swarmer` (wave 1 — "needs no line", but a line is harmless
  texture if a card ever surfaces).
- Event tables/brood families shift seeded draws → not honest flavor seams.
- Kill-word maps are fixed-key → closed.

## Foreign

`swarmArena.js`, `swarmBrood.js`, `swarmArenaLadder.js` (untracked), crucible tests —
preserved.

Review: catalog ✓3 (Drifter / Archivist / Accountant) — recorded.
