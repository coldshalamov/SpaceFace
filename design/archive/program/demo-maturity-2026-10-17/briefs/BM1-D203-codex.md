# Task BM1 — fix demo defect D203 (Ceres production Second Measure factory)

You are working in the SpaceFace repo (Three.js top-down space game; flat GameState, event bus,
60 Hz fixed-timestep sim). Read `AGENTS.md` at the repo root first and obey it.

## The defect (demo defect ledger row D203)

`test/ceres-workfleet-runtime.test.mjs` — the seed-47 "complete production factory commissions"
scenario stays in the `head_retract` state at the normal 12,000-tick cutoff instead of reaching
`extract`. The same test with PR419's solid-payload contact classification removed also ends at
`head_retract`, so this failure predates PR419.

Run: `node --test --test-name-pattern='complete production factory commissions' test/ceres-workfleet-runtime.test.mjs`

Evidence: `.devshots/asset-experience-validation/ai-ceres.log` and
`.devshots/asset-experience-validation/ceres-pr419-baseline.log`.

## Your job

1. Diagnose the production cutter-head return path: why does a commissioned production factory's
   cutter head never complete `head_retract` → `extract` within the 12,000-tick cutoff?
2. Fix it with the minimal correct change. Preserve the 12,000-tick cutoff and the finite
   recovery policy — do not "fix" it by removing the bound.
3. Make the focused test green without weakening its assertions. Do NOT edit
   `test/*.expected.json` files.

## Hard constraints

- Do NOT run any `git add`, `git commit`, `git stash`, `git checkout`, `git restore`, or `git reset`.
  Edit files only; the orchestrator commits.
- Touch only files this fix needs (expected: the workfleet/production system code and possibly the
  test's tolerance — justify any test edit in your final message).
- Sim determinism: use `state.rng`/`state.simTime`, never `Math.random()` or wall time.
- Do not retune mass, thrust, weapon numbers, dock-assist, or camera governors.
- Do not touch: `artifacts/moment-machine/**`, `design/alien-ecology-program/**`,
  `design/program/inference-memory.json`, `src/data/environmentalMachinery.js`,
  `src/data/newGameDefaults.js`, `src/data/sectorWayOfLife.js`,
  `src/localization/catalogs/en-US.generated.js`, `test/cr-feed-sector-machines.test.mjs`,
  `test/hud-g-lag.test.mjs`, `test/infer-cruise-hit-drop.test.mjs` (another agent's live work),
  or `design/program/vm-drop/`.

## Deliverable (final message)

- Root cause in two or three sentences.
- The fix and why it is the correct layer.
- Files changed (exact paths).
- The focused test result (paste the summary line).
- Any adjacent defect you saw but did not fix (report, don't fix — orchestrator decides).
