# FB-120 — Every ten-wave champion arrives with the room its note describes, installed as arena geometry

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: swarmMode.js, seam: survivalArena.js
**Write-set:** `src/data/swarmMode.js`, `src/systems/survivalArena.js`, `test/fb-champion-rooms.test.mjs`
**Neighbours (extend, never restate):** SFQ-B056, NXB-017

## The gap
`SWARM_BOSS_ROTATION` names four champions and `BOSS_ROOM_NOTES` describes a room for each; the notes are
prose nobody executes. `planArenaInstall` in `survivalArena.js` already installs rooms from a plan's arena
phase. The champion fights in whatever the wave left behind.

## Why this direction
A room is the physical question a champion poses; without it the champion is a bigger crowd. The install path
exists; the notes become plan data.

## Mechanism
- Turn each `BOSS_ROOM_NOTES` entry into an `arenaPhase` install recipe (fields, pylons, a wreck ring, a lattice
  cell set) attached to the rotation row.
- Have the wave planner attach the champion's room to `plan.arenaPhase` on the champion wave; `planArenaInstall`
  installs it and clears it with the champion.
- Pin four distinct installs on seed 4242 at waves 10, 20, 30 and 40 and that the room is gone at the next wave.

## Done when
`test/fb-champion-rooms.test.mjs`: four rooms, four distinct install records, cleared after;
`crucible-swarm-arena.test.mjs` and `pq-174-04-arena-laws.test.mjs` stay green.

## Do not
Do not add props beyond the notes. Do not raise concurrency for the champion wave. Do not persist a room past
its champion.

## Focus test starting points
- `test/crucible-swarm-arena.test.mjs`
- `test/pq-174-04-arena-laws.test.mjs`
- `test/pq-133-04-r4-boss.test.mjs`
