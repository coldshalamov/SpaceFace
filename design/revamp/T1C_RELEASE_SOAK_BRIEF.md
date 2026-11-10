# T1c Release-Soak Check — reference detail

> Reference for the T1c goal prompt. The goal itself is <3000 chars (success criteria only).

## What this is
Create `scripts/check-release-soak.mjs` — a long-run (up to 30 min, configurable) headless soak that
boots the real game sim and asserts it stays within budget with no drift, leaks, or untelegraphed
spawns. This is SPEC2/08 release-readiness verification scaffolding. It is genuinely MISSING
(`CURRENT_BUILD_STATUS.md:55` confirms; verified the file does not exist).

## Why it's safe to run while BP-12 is in flight
- **Pure new file in `scripts/`** — zero overlap with BP-12's `src/` files. BP-12's packet spec names
  only `src/` newFiles; it references `scripts/` zero times. A file collision is impossible.
- **Read-only on the sim** — the soak boots the game, advances the sim, and asserts. It writes nothing
  the BP-12 agent could be editing.
- T1a (encounter-director) is already DONE — skip it. T1b (one-voice) touches 20+ `src/` toast callers
  and WOULD conflict with BP-12 — defer it. T1c is the isolated one.

## What "release soak" verifies (SPEC2/08 — the release-readiness bar)
A 30-minute (default; `--minutes N` flag) deterministic headless run of the real sim that asserts:
1. **Heap/scope growth bounded** — no unbounded array growth on state (entities, masslineTelemetry,
   sectorSim impulses, encounter receipts, voiceArbiter log, mission boards). Cap: linear growth in
   sim time is fine (logs); unbounded accumulation of per-tick records is a leak. Sample state size
   at intervals; assert growth rate is sub-linear or bounded.
2. **Entity cap held** — `spawnBudget.max()` (MAX 12) never exceeded; total live entities stays within
   a sane ceiling (e.g. <200). No orphaned entities (dead but never removed).
3. **No sim drift** — the sim stays deterministic: same seed → same state hash at sampled ticks. Run
   twice (or re-seed), compare state digests at intervals. Any divergence = a Math.random/wall-clock
   leak. (This complements `check:sim` which gates a fixed golden; the soak catches drift over long
   runs the golden can't cover.)
4. **No untelegraphed spawns** — every hostile that appears was announced (encounterDirector
   telegraph window, mission target spawn, or scripted scenario). Assert: no entity with a hostile
   team appears without a recent `encounter:telegraph` / mission-accept / scenario event in the log.
5. **Budgets held** — sim tick cost stays under budget (sample `state.physicsRuntime.diagnostics` +
   any per-system cost counters); no single tick spikes > N ms sustained.
6. **No softlock** — the sim advances simTime at ~60Hz throughout; no stall, no exception that halts
   the loop (catch + count, don't crash the soak).

## How to build it (pattern)
- It's a `scripts/` Node script (`.mjs`), like the other `check-*.mjs` files.
- Reuse the sim harness pattern from `scripts/sf-sim.mjs` (the deterministic sim driver — READ IT).
  The soak is a long-form sf-sim run with assertions sampled across time, not a fixed-tape golden.
- Boot `createGameState(seed)`, init the registry (`createRegistry`), advance `DT` per tick for the
  configured duration, sample state at intervals (e.g. every 60s of simTime), assert the 6 invariants.
- Headless: the sim never imports Three.js; no browser needed. If a path needs `typeof window`
  guards, the sim already has them (don't add new ones).
- Deterministic seed (fixed default, `--seed` override). Same seed + duration → same pass/fail.
- `--minutes N` (default 30), `--seed 0xNN`, `--quick` (shortens to ~2 min for CI smoke).
- Output: one line per sampled interval (simTime, entity count, heap-ish size, spawnBudget.current,
   tick cost), then a PASS/FAIL summary with the failing invariant if any.

## Wiring
- Add to `package.json`: `"check:release-soak": "node scripts/check-release-soak.mjs"` and a
  `"check:release-soak:quick": "node scripts/check-release-soak.mjs --quick"` CI-smoke variant.
- This unblocks T9c (world-alive release gate) and is the SPEC2/08 evidence artifact.

## Guardrails
- NEVER run `git checkout .` / `reset --hard` / `stash` / `clean` / `restore` on tracked files
  (~17k lines uncommitted — AGENTS §3). `git add -N` the new file IMMEDIATELY.
- New `scripts/` file only — do NOT edit `src/` (BP-12 agent is active there), `test/*.expected.json`,
  or existing checks. If you need a sim helper that doesn't exist, add it to `scripts/lib/` (new file),
  not into `src/`.
- No new runtime deps. The sim is zero-dependency; the soak must be too.
- Determinism: no `Math.random`, no wall-clock in the sim-driving code (use `state.simTime`). The soak
  ITSELF may read wall-clock for the `--minutes` cutoff and for sampling cadence (it's test tooling,
  not sim code — exempt per AGENTS §6).
- Commit only if asked. Master only, no branches.
- Non-vacuous: the soak must actually FAIL when injected (e.g. temporarily seed an unbounded push to
  an entity list, confirm the heap-growth assertion trips; restore). A soak that can't fail is useless.

## Acceptance
`npm run check:release-soak:quick` runs a ~2-min smoke and PASSes; the full `npm run check:release-soak`
runs ~30 min and PASSes; all 6 invariants are asserted and the soak is control-verified (an injected
leak/drift/untelegraphed-spawn makes it FAIL). PROGRESS.md T1c stamped DONE.
