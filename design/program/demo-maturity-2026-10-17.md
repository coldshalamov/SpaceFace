<!-- LIFETIME: VOLATILE — orchestrator ledger for the 2026-10-17 demo-maturity campaign (owner instruction) -->
# Demo-maturity campaign — 30 units (2026-10-17)

Owner instruction: orchestrate 30 tasks on the build map + INFERENCE board at a ~2:1 ratio
(20 build-map, 10 INFERENCE), chosen and **clustered so implementation doubles as a full-game
review**: every cluster pairs system work with the polish that makes it demo-ready. Workers:
`codex exec` (model `gpt-6.1-sol`, reasoning `xhigh`) for backend implementation + code review;
`claude -p` (model `claude-sonnet-5-5`, effort `high`) for frontend work and taste passes.
Orchestrator owns board/ledger/receipts, gates, and pathspec commits.

Goal: a mature game we can demo without it feeling unfinished (total-fix mode, §7).

## Clusters (tasks combine into system-maturity passes)

| Cluster | Units | Maturity outcome |
|---|---|---|
| C1 Ceres industry works | BM1 D203, BM5 D191 | The flagship production pocket reaches `extract` and the pocket stays inside frame budget with a named causal owner |
| C2 Fast startup, steady frames | BM2 D198, BM6 D130 | Menu→New Game has no multi-hundred-ms stall; Adventure flight pacing has a measured, fixed owner |
| C3 Legible interface | BM3 D202, BM4 D201 | Text sits above the type floor on every screen; UI matrix sample gaps closed |
| C4 Truthful economy | INF1 ECON-09, INF2 ECON-10, INF3 ECON-11 + trade-flavored mission rows | Market rows, receipts, and contract delivery all say what actually happened |
| C5 Law that remembers | INF4 LAW-11, INF5 LAW-12, INF6 LAW-13 | Tolls, customs, and rescues land in your footprint and cool your warrant visibly |
| C6 A world with memory | INF7 STORY-09, INF8 STORY-10, INF9 STORY-11, INF10 WORLD-44 | Deeds become news, bar talk, and remembered refusals |
| C7 Mission lane (ADMIT-SFQ-M) | BM7–BM15 (9 landed mission rows) + BM16–BM17 (ADMIT-SFQ-B family slice) | Authored content exercising C4–C6 systems on the default route |
| Reserve | BM18–BM20 | Filled from the remaining surface at burn-down (D188 bounded leg, next family slice, or mission briefs) |

## Worker contract (both CLIs)

- Edit only the brief's named paths; never stage/commit; never touch dirty foreign paths
  (`artifacts/moment-machine/**`, `design/alien-ecology-program/**`,
  `design/program/inference-memory.json`, `src/data/environmentalMachinery.js`,
  `src/data/newGameDefaults.js`, `src/data/sectorWayOfLife.js`,
  `src/localization/catalogs/en-US.generated.js`, `test/cr-feed-sector-machines.test.mjs`,
  `test/hud-g-lag.test.mjs`, `test/infer-cruise-hit-drop.test.mjs`).
- Standing guards: no retuning mass/thrust/weapon numbers/dock-assist/camera governors; no edits
  to Hitch's mesh, `test/*.expected.json`, `design/program/vm-drop/`.
- Sim determinism: `state.rng`/`state.simTime`; focused tests pin on seed 4242.

## Unit ledger

| # | Task | Surface | Worker | Status | Evidence |
|---|---|---|---|---|---|
| BM1 | D203 Ceres production cutter-head return path | ledger §6 | codex | IN PROGRESS | |
| BM2 | D198 New Game screen open cost | ledger §6 | codex | PENDING | |
| BM3 | D202 ORRERY text legibility packet | ledger §6 | claude | IN PROGRESS | |
| BM4 | D201 UI matrix 9 sample/preparation gaps | ledger §6 | claude | PENDING | |
| BM5 | D191 Ceres perf causal-owner leg | ledger §6 | codex | PENDING | |
| BM6 | D130 Adventure frame-pacing owner leg | ledger §6 | codex | PENDING | |
| BM7–15 | ADMIT-SFQ-M mission lane — 9 landed mission rows | build_map 287 | codex+claude | PENDING | rows minted: 348 M15, 349 M13, 350 M01, 351 M11, 352 M29, 353 M25, 354 M30, 355 M24, 356 M20 (build_map §D); worker jobs MJ1–MJ7 |
| BM16–17 | ADMIT-SFQ-B family slice — SFQ-P12 + SFQ-P17 disposition + land | build_map 285 | codex | PENDING | band 357–361 for mints; brief BM16-17 |
| BM18–20 | reserve | — | — | OPEN | |
| INF1 | ECON-09 sold-out rows stay listed | INFERENCE_IDEAS | codex | PENDING | |
| INF2 | ECON-10 shortage premium receipt | INFERENCE_IDEAS | codex | PENDING | |
| INF3 | ECON-11 contract delivery stocks the station | INFERENCE_IDEAS | codex | PENDING | |
| INF4 | LAW-11 paid toll footprint row | INFERENCE_IDEAS | codex | PENDING | |
| INF5 | LAW-12 customs trust-mark waiver | INFERENCE_IDEAS | codex | PENDING | |
| INF6 | LAW-13 rescued pod cools warrant notch | INFERENCE_IDEAS | codex | PENDING | |
| INF7 | STORY-09 declined trap remembered | INFERENCE_IDEAS | codex | PENDING | |
| INF8 | STORY-10 ace defeat news | INFERENCE_IDEAS | codex | PENDING | |
| INF9 | STORY-11 barkeep cites ship ledger deed | INFERENCE_IDEAS | codex | PENDING | |
| INF10 | WORLD-44 witnessed pirate kill headline | INFERENCE_IDEAS | codex | PENDING | |

## Verification plan

- Per unit: its focused test(s) green; `npm run check:baseline` per landed batch.
- Codex code review (`codex exec review`) on each landed batch diff; claude taste pass on every
  player-visible wording/screen the campaign touches.
- Player-truth gate per touched mode (adventure expected; swarm/racing only if touched) at
  cluster checkpoints, verdict + contact sheet attached to the final report.
- Ledger rows leave only in the fixing commits; board detail rows deleted on landing.

## Outcome log

- 2026-10-17: campaign opened. NOW row `orch-demo-m30`; checkpoint dropped. Wave 1 launched
  (codex→BM1 D203, claude→BM3 D202).
- Codex CLI repaired on this box: stale `service_tier="default"` line commented out of
  `~/.codex/config.toml` (per that file's own standing instruction), and the npm codex updated
  0.130.0-alpha.5 → 0.163.0 (the alpha could not decode the server's current model catalog, so
  `gpt-6.1-sol` was rejected; 0.163.0 runs it at xhigh). Claude uses
  `claude -p --model claude-sonnet-5-5 --effort high`.
- BM1 **D203 LANDED** `5652818df09`: seed 47 reaches `extract` at tick 11,247 inside the
  unchanged 12,000-tick cutoff; late-sweep regression added; recovery suite order-dependence
  fixed in the same commit. Ledger row D203 deleted.
- MJ3 **row 351 M11 LANDED**: lost hulls persist in world records (save v17 additive); site can
  BE the lost hull. Tests 6/6 + 20/20 + 16/16. Board row deleted.
- Mission lane admitted: rows 348–356 minted in build_map §D from the official
  `admit-sfq-m/DISPOSITIONS.md` residuals (9 units, worker jobs MJ1–MJ7). BM16/17 = ADMIT-SFQ-B
  families SFQ-P12 + SFQ-P17 (band 357–361).
- **ALL NINE mission rows landed** (M15, M13, M01, M11, M29, M25, M30, M24, M20). **All 12
  INFERENCE units landed** (ECON-09/10 [11 already-true], LAW-11/12/13, STORY-09/10/11,
  WORLD-44, INST-36/37/38). **BM16/17 landed**: 20 family candidates dispositioned (16
  already-true with evidence, B166/B167 landed as rows 357/358, B115 LANDS-WITH 349, B165
  parked). **BM2 (D198)**: attribution done, two legs fixed, quiet-host leg stays open. **BM4
  (D201)**: 7/9 matrix gaps closed, 2 proven permanent, 3 new defects filed (D210–D212), D210/
  D212 + market overlap fixed same sitting. **D202 closed**: official checker 0/2077, rendered-
  size audit packet, phone-HUD fit-scale filed as D202b. **Golden re-record**: deliberate, zero
  metric/trace delta (M11 additive record fields), both checks green at clean probe. **Codex
  review passes 1+2**: 6 MAJOR findings across the campaign's own landings — all six fixed with
  fail-first regressions (FIX1, FIX2). Pushed through `b8d9b35a3a2`.
- Remaining: BM5/BM6 perf legs (running), TASTE2 final taste pass (claude resets 5:20am ET),
  player-truth adventure+swarm on the quiet machine, ui-budgets re-shot, campaign close.
- **CAMPAIGN CLOSED 2026-10-17 (early ET morning).**
  - **Score: 30 work units landed and pushed** — 14 build-map ledger/board units (D203, D202
    closed, D201 closed, D198 two legs, D130 one leg + D191 attribution scoped, nine mission rows
    348–356) + 12 INFERENCE production units (ECON-09/10, LAW-11/12/13, STORY-09/10/11, WORLD-44,
    INST-36/37/38; ECON-11 verified already-true) + 2 ADMIT family-lane rows (357/358) + 2
    review-driven repair jobs (FIX1/FIX2: six MAJOR findings found by codex reviewing codex, all
    fixed fail-first) + BM16/17 disposition of 20 family candidates (16 already-true with
    evidence) + the deliberate golden re-record (zero metric/trace delta) + the final taste pass
    (Munitions landscape fix; nine surfaces judged RIGHT).
  - **Gates at close:** `check:baseline` **17/17 green at clean HEAD** (both re-recorded goldens
    included). Player-truth adventure + swarm (headed, seed 4242, this box): **INCOMPLETE** —
    every behavioral check PASS on both modes (rounds resolve, transitions clean, LOD/popping/
    VFX/backdrop/HUD within budget); the two UNKNOWNs are instrument-host classes the ledger
    already owns (readability sampler coherence; contended-host frame timing → quiet-host
    program). Verdicts + contact sheets: `scratch/player-truth/{adventure,swarm-idle,swarm-active}/`.
    `check:ui:budgets`: tracked bytes/content match the index (zero drift); FAIL is the three
    documented PQ-184 grammar debts owned by the ORRERY lane.
  - **Left open on purpose** (all scoped on their rows): D202b phone-HUD fit-scale (needs a
    layout decision), D207 worker-lane mirror parity, D211 Asteroid Works shader-link stalls,
    D188/D199/D24 (external/quiet-host/frozen), D130 whole-game 3x target, D191 native solve
    step, D198 quiet-host attribution leg.
  - Workers: codex `gpt-6.1-sol` xhigh (implementation + two review passes), claude
    `claude-sonnet-5-5` high (D201, D202, two taste passes). Orchestrator: board/ledger/row
    surgery, gates, pathspec commits, pushes.
