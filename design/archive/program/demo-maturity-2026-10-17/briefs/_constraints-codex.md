# Shared worker constraints (prefixed onto every codex job in this campaign)

You are working in the SpaceFace repo (Three.js top-down space game; flat GameState, event bus,
60 Hz fixed-timestep sim). Read `AGENTS.md` at the repo root first and obey it.

## Hard constraints

- Do NOT run any `git add`, `git commit`, `git stash`, `git checkout`, `git restore`, or `git reset`.
  Edit files only; the orchestrator reviews, tests, and commits.
- Touch only files this fix needs. Do NOT touch foreign-dirty paths: `artifacts/moment-machine/**`,
  `design/alien-ecology-program/**`, `design/program/inference-memory.json`,
  `src/data/environmentalMachinery.js`, `src/data/newGameDefaults.js`,
  `src/data/sectorWayOfLife.js`, `src/localization/catalogs/en-US.generated.js`,
  `test/cr-feed-sector-machines.test.mjs`, `test/hud-g-lag.test.mjs`,
  `test/infer-cruise-hit-drop.test.mjs`, or `design/program/vm-drop/`.
- Standing guards: do not retune mass, thrust, weapon numbers, dock-assist, or camera governors;
  do not edit Hitch's mesh or `test/*.expected.json`.
- Sim determinism: `state.rng`/`state.simTime`, never `Math.random()` or wall time. Focused tests
  pin on seed 4242 unless the task names another seed.
- One writer per state slice (economy→credits, factions→reputation, cargo→cargo, heat→WANTED).
  Other systems emit intents/events.
- Match the existing code style of each file you edit; no drive-by refactors.

## Deliverable (final message, always)

- What you built, in player-visible words, one sentence per unit.
- Root cause / design choice in two or three sentences.
- Files changed (exact paths).
- Focused test names + their pass summary lines.
- Any adjacent defect you saw but did not fix (report, don't fix).
