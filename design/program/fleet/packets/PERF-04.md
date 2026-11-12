# PERF-04 — No shader compiles mid-flight

**Lane 3.** Owner: flying hitches. A shader program compiled during flight stalls the main thread for tens of
milliseconds — a visible blip. The opening already prewarms a cohort of programs; some still compile late.

## Job
1. Measure, through the lock: `node scripts/fleet/game-lock.mjs run -- npm run perf:renderer-info -- --duration=30`.
   It reports programs compiled after the opening and the frame each appeared on (`.devshots/renderer-info/`).
2. For each late program, find what first drew it (a material on a pickup, a hit effect, a freight light, …) —
   `src/render/pipelineReadiness.js`, `src/render/liveSceneCook.js` and `src/render/assetLoader.js` own the
   opening prewarm cohort; read how an existing material is enrolled and enrol the late ones the same way.
3. Re-measure. The late-compile count must be **0** in the 30 s run, and the opening must not get more than
   ~1 s slower (report both numbers before/after).

Do not change how anything looks: no material swaps, no shader edits — only *when* a program is compiled.
Also run `npm run perf:renderer-info` once in Swarm if the probe supports a mode/URL flag (`?swarmRound=3`);
report its late-compile count too.

## Checks
`node --test` for every file you touch's tests; `npm run gate -- --quick` at the end (it takes the lock itself).
Commit: `fleet(PERF-04): <n> late shader programs now compile in the opening`.
