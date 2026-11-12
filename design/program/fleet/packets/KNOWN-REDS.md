# KNOWN-REDS — Make master's failing tests honest

**Lane 2.** These tests fail on master today and are not caused by current work:
`deep-sky-plate-pipeline` #9, `performance-dirty-ranges` (4 cases), `render-target-pipeline-warmup` #25,
`pq-204-advanced-perf` #13/#19, `anvil-orchard-motor`, `ceres-five-minute-acceptance` (2),
`physics-sandbox-routes` (2), `pq-163-04-cliff` (2), `wave-c6-sky-luminance` (sky count 7 ≠ 6).
(The ~30 Swarm/survival reds are a separate later job — leave them.)

## For each test, one at a time
1. Run it alone: `node --test test/<name>.test.mjs`. Read the failing assertion and the code it checks.
2. Decide which is wrong, with evidence:
   - **the code regressed** → fix the code (smallest change; keep single writers and determinism);
   - **the test pins something the game deliberately changed** (e.g. a sky was added on purpose, so 7 skies is
     right) → update the test's *expectation* with a one-line comment naming the commit that changed it
     (`git log -S` finds it);
   - **the test's whole claim is obsolete** (the feature it guards was removed) → delete only that case, with a
     one-line reason in the commit message.
   Never edit an expected/golden *data* file (`*.expected.json`, reference sets) to pass.
3. Commit that one test: `fix(KNOWN-REDS): <test> — <code fixed | expectation follows <sha> | retired: reason>`.

A test that needs a browser or the game runs through the lock: `node scripts/fleet/game-lock.mjs run -- …`.
If one test takes more than ~40 minutes of investigation, write what you found in the receipt and move on.

## Checks
Each test green on its own; `npm run gate -- --quick` at the end. The receipt lists each test with its verdict.
