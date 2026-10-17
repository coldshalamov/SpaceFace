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
