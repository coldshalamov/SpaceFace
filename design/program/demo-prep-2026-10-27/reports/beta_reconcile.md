# Beta plan reconciliation (2026-10-27)

Checked against HEAD `da78dddb9f1` (equal to origin/master at check time). Evidence came from `git show HEAD:` and `git grep ... HEAD`, so uncommitted foreign edits in the working tree do not count as landed.

Conventions: LANDED = fix committed in HEAD plus a matching committed test (or a deleted ledger/review row). PARTIAL = fix committed but the matching test or row closure is missing, or the done-when proof was not run. OPEN = no committed fix found. "Unverified" marks anything not checked.

Corrections to the orchestrator's note: O12 landed in `cdca310c94e` (its test is `w2d-catchup-physical-owners`), not in `c6d21662f7b`. `d1029470280` is the D130 leg and is not O12. `c6d21662f7b` landed O13, O14, O17, O21 and O22.

## 3. Build-map tasks (B) and 4. campaign tasks (O)

| id | status | evidence (≤15 words) | file |
|---|---|---|---|
| B1 | PARTIAL | 86656026fe landed; upstream merge re-drifted 47-A hash and a HUD label; re-trace open | repo gate `check:baseline` (not run) |
| B2 | PARTIAL | 0662ce76a9 cleared 13 suites; ledger D241 residue still open | design/program/DEMO_READINESS_2026-09-20.md |
| B3 | LANDED | D242 ledger row deleted in 7fcda9f4144; headed three-run proof unverified | pipelineReadiness.js (path not checked) |
| B4 | PARTIAL | D222 digest mechanism landed; clean-tree budget re-mint still pending | test/ui-frame-references/budgets.json |
| B5 | LANDED | D231 row deleted; O(n²) pick fix 1d980fcb67; F-LOAD-03/04 unverified | live-geometry pick (path not checked) |
| B6 | LANDED | D244 row deleted in 708ee6d4277; before/after number not re-measured | sharpen pass (path not checked) |
| B7 | LANDED | output dither on sky shader at uiStage.js:973 and :996; D243 row not yet deleted | src/render/uiStage.js |
| B8 | LANDED | D235 row deleted in 78bd499e3c9, "verified at HEAD" per its message | line-break voice (path not checked) |
| B9 | LANDED | D240 row deleted in 4490c524b86 (four HUD collisions); bench shots unverified | flight HUD (path not checked) |
| B10 | LANDED | R-0b0e95c row gone from review queue; closed by d22e3b808 | design/program/LANDED_REVIEW.md |
| B11 | PARTIAL | review commit 4550be621 says verified; R-ad03cd0 row still listed | design/program/LANDED_REVIEW.md |
| B12 | LANDED | R-4bff4ee row gone from queue; closed by d22e3b808 | design/program/LANDED_REVIEW.md |
| B13 | PARTIAL | fix commit ccb63def3 landed; R-954d404 row still listed | design/program/LANDED_REVIEW.md |
| B14 | LANDED | R-e9f66ef row gone from queue; closed by d22e3b808 | design/program/LANDED_REVIEW.md |
| B15 | PARTIAL | fix in cdca310c94e (assisted-speed latch); R-73a26af row still listed | design/program/LANDED_REVIEW.md |
| B16 | PARTIAL | review commit ad58048c00 verified; R-cbe1751 row still listed | design/program/LANDED_REVIEW.md |
| B17 | LANDED | R-a1074cd row gone from queue; closed by d22e3b808 | design/program/LANDED_REVIEW.md |
| B18 | LANDED | R-b87c9f1 row gone from queue; closed by d22e3b808 | design/program/LANDED_REVIEW.md |
| B19 | LANDED | R-21452bd row gone; closing commit not located by sha | design/program/LANDED_REVIEW.md |
| B20 | LANDED | R-32918b9 row gone; closing commit not located by sha | design/program/LANDED_REVIEW.md |
| B21 | LANDED | R-0749dfe row gone from queue; closed by 67cd85266 | design/program/LANDED_REVIEW.md |
| B22 | PARTIAL | market-first-loop and first-dock scripts exist; fixed-seed route to Tech upgrade not found | scripts/check-market-first-loop-runtime.mjs |
| B23 | PARTIAL | §1 holds a first-pass audit (unverified read); graded 50-point table not found | design/program/BETA_PLAN_2026-10-23.md |
| B24 | LANDED | O8, O9, O10 (code), O11, O15, O18-O20, O25, O29 all landed with committed tests | design/program/BETA_PLAN_2026-10-23.md |
| B25 | OPEN | D251 146 MB opening payload still open; no first-load byte budget found | scripts/ (no budget script) |
| B26 | PARTIAL | review queue cleared in batches; 123 table rows; Codex final pass not run | design/program/LANDED_REVIEW.md |
| B27 | LANDED | R-04fe464 row gone (closed by b7f272fcf); eight owners in update order (see O39) | src/runtime/authoritativeSystemManifest.js |
| B28 | LANDED | rock refill floor and ice sublimation present; w2d-environment-substance-tick (see O40) | src/systems/environmentMaterials.js |
| B29 | LANDED | release receipt toast emitted; w2d-massline-release-receipt (see O41) | src/ui/masslineHud.js |
| O1 | LANDED | error boundary armed without window.SF (main.js:118); test/error-boundary.test.mjs | src/main.js |
| O2 | LANDED | diagnosticsReport.js exists; failure presenter wires Copy details; diagnostics-report test | src/ui/diagnosticsReport.js, src/ui/runtimeFailurePresenter.js |
| O3 | LANDED | SG02 stall notice told once per stall (physics.js:93-104); physics-authority-stall test | src/core/physics.js |
| O4 | LANDED | render-process-gone recovery handlers present; electron-shell-resilience test | electron/main.cjs |
| O5 | LANDED | ignore-gpu-blocklist only when not safe mode (line 347); launcher reliability test | electron/main.cjs |
| O6 | LANDED | AMD_INTEGRATED_RE covers Radeon Graphics, Vega, 780M, Custom GPU; gpu-tier-detection test | src/render/adaptiveQuality.js |
| O7 | LANDED | slowFrameOffer.js once per session, never auto-applied; slow-frame-offer test | src/render/slowFrameOffer.js |
| O8 | LANDED | promotes only while both keys hold same bytes (5297); w2a-recovery-promotion-race test | src/save/saveSystem.js |
| O9 | LANDED | restore resets to player defaults; w2a-restore-player-defaults test | src/save/saveSystem.js |
| O10 | PARTIAL | defeat recovery-loss dedupe present (missions.js:5368); no sealed/personal test named | src/systems/missions.js |
| O11 | LANDED | scan runs first, toast gated on result (economy.js:5381-5389); w2b-scan-verdict test | src/systems/economy.js |
| O12 | LANDED | aiPorts and planetRuntime now table clocks (catchupPolicy.js:5); w2d-catchup-physical-owners | src/core/catchupPolicy.js |
| O13 | LANDED | damage.js changed in c6d21662f7b; w2c-damage-nested-emit test | src/combat/damage.js |
| O14 | LANDED | combat.js changed in c6d21662f7b; w2c-beam-neutral-admission test | src/systems/combat.js |
| O15 | LANDED | profile settings single list; w2a-profile-settings-roundtrip test | src/save/profileSettings.js, src/save/saveSystem.js |
| O16 | LANDED | overdue test now `!(expiresAt > at)` (economy.js:3857); w2b-market-book test | src/systems/economy.js |
| O17 | LANDED | tetherGameplay changed in c6d21662f7b; w2c-bridle-cut-history-bounded test | src/systems/tetherGameplay.js |
| O18 | LANDED | abandonMission refuses story-spine contracts with a toast (missions.js:2976-2978); career-origin-focus test matches | src/systems/missions.js |
| O19 | LANDED | settle in try/finally; debrief via _settleOptional; w2b-mission-settle test | src/systems/missions.js |
| O20 | LANDED | MAX_HULL_LOSSES = 200, newest kept (worldRecords.js:70, 234); w2b-hull-loss-cap test | src/world/worldRecords.js |
| O21 | LANDED | survivalWave.js changed in c6d21662f7b; w2c-straggler-release-count test | src/systems/survivalWave.js |
| O22 | LANDED | mass-less body guard (physics.js:2210-2215); w2c-physics-undeclared-mass test | src/core/physics.js |
| O23 | PARTIAL | version 0.2.0-beta.1, CHANGELOG and identity check present; feedbackUrl still blank | package.json, src/data/demoConfig.js:4, CHANGELOG.md |
| O24 | OPEN | no retail-smoke workflow or check-retail-boot script at HEAD | .github/workflows/retail-smoke.yml, scripts/check-retail-boot.mjs |
| O25 | LANDED | w2a-frozen-envelopes test; frozen-v01 to v22 and continue fixtures committed | test/fixtures/saves/ |
| O26 | OPEN | no first-load bytes budget script at HEAD; D251 146 MB still open | scripts/ |
| O27 | PARTIAL | New Game layout commits 61244025531, 760c263d804 landed; 1366x768 bench unverified | src/ui/orrery/newGameLayouts.js |
| O28 | OPEN | commodityNames.js absent; PERSISTENT_CARGO still supplies raw ids | src/ui/commodityNames.js (absent), src/data/narrative.js |
| O29 | LANDED | mail and calendar serialized and restored; w2a-mail-calendar-save test | src/save/saveSystem.js |
| O30 | OPEN | final Codex pass not yet run | (campaign final step) |
| O31 | OPEN | no commit found for the ~150 px header dead band; unverified | src/ui/orrery/stationLayouts.js |
| O32 | OPEN | BURIED is still only a bench detector string; no overprint fix found | scripts/ui-bench.mjs:213 |
| O33 | OPEN | "Engage Route" label unchanged; clip and disabled-reason fix not found | src/ui/map/mapControlMap.js |
| O34 | OPEN | title aside still shows raw HELP / ARCHIVE / CIRCUITS line; no descriptors | src/ui/orrery/titleAsideLayouts.js |
| O35 | PARTIAL | populated game-over fixture committed (uiBenchCatalog.mjs:42-45); shot not re-run | scripts/lib/uiBenchCatalog.mjs, src/ui/orrery/gameOverLayouts.js |
| O36 | OPEN | no scrim token in styles/hud.css; wcag checker exists but no fix | styles/hud.css |
| O37 | PARTIAL | batch timeouts bounded, but default 300 s not 120 s (uiBenchBatch.mjs:29) | scripts/lib/uiBenchBatch.mjs |
| O38 | LANDED | settlement no longer waits for update(); w2b-yard-dock-settle test | src/shipjack/yardOperations.js |
| O39 | LANDED | all eight faction owners in update order (manifest lines 143-144); w2d-manifest-update-coverage | src/runtime/authoritativeSystemManifest.js |
| O40 | LANDED | rock restock to floor of 6 (environmentMaterials.js:282-295); w2d-environment-substance-tick | src/systems/environmentMaterials.js |
| O41 | LANDED | releaseReadReceipt toast emitted (masslineHud.js:1134-1141); w2d-massline-release-receipt | src/ui/masslineHud.js |
| O42 | LANDED | assist profile latched on speed change (survivalResults.js:634-654); w2d-survival-speed-latch | src/systems/survivalResults.js |
| O43 | LANDED | freight target resolves entity to stationId (freightCausality.js:690-699); dump-journal test in w2b-market-book | src/economy/freightCausality.js, src/systems/economy.js |

Totals (72 tasks): LANDED 47, PARTIAL 15, OPEN 10.

## STILL OPEN, ranked by player impact

Ranked: save loss first, then crash or blank screen, then unreadable UI, then polish. Only OPEN or PARTIAL task rows. Not in the 15: B11, B13, B15 and B16 (stale review rows with no player impact).

1. **O10 (PARTIAL)** Defeat settlement: recovery-loss dedupe is present, but no test shows sealed and personal cargo settle correctly. Save-loss risk.
2. **O26 / B25 (OPEN)** First load streams about 146 MB (D251) with no first-load byte budget. Cellular players stall before first flight.
3. **O24 (OPEN)** No retail-bundle boot check in CI, so a blank or console-error retail build would ship unnoticed.
4. **O36 (OPEN)** Unpanelled HUD text over bright nebulae measured 2.5 to 3.6:1 contrast; no scrim token exists.
5. **O27 (PARTIAL)** New Game first-flight choice may clip at 1366x768; layout commits landed, bench not re-run.
6. **O32 (OPEN)** Shipworks controls still overprint (BURIED detector still present).
7. **O34 (OPEN)** Title words (Crucible, Archive, Circuits, Line) have no descriptor for a stranger.
8. **O33 (OPEN)** Chart "Engage Route" label clipped; disabled button gives no reason.
9. **B22 (PARTIAL)** No fixed-seed route from New Game to an affordable first upgrade; only adjacent market and dock checks exist.
10. **O35 (PARTIAL)** Game over with a real death: fixture committed, screen not re-shot.
11. **O23 (PARTIAL)** Beta identity is in, but feedbackUrl is still blank, so testers have no link to report bugs.
12. **O28 (OPEN)** First-contract text shows raw cargo ids such as "47a assay sample" (commodityNames.js absent).
13. **O31 (OPEN)** Station header carries about 150 px of dead band; no fix found (unverified).
14. **O30 (OPEN)** Final Codex pass over the campaign's landings has not run.
15. **O37 (PARTIAL)** UI bench batch timeout is 300 s, not the 120 s bound (developer tooling).

## Ledger: 19 open rows in DEMO_READINESS_2026-09-20.md section 6

Five are look-stale (the row is already fixed or resolved in HEAD and should be deleted); fourteen are still open.

| row | verdict | evidence |
|---|---|---|
| D191 | still-open | fixes 0e71b4baf0 and d062a50e6b committed; remaining cost needs a quiet-host capture |
| D199 | still-open | row says new evidence source needed; no unchanged diagnostic repeat |
| D198 | look-stale | row itself says RESOLVED 2026-10-24; delete it |
| D130 | still-open | 3x hitch target unmet; quiet-host capture pending; D231 landed without an FPS claim |
| D175 | look-stale | zero dead-location reads at HEAD (activityRuntime.js now under src/world/); verified clean, keep as the import guard |
| D222 | still-open | clean-tree budget re-mint still pending (B4) |
| D224 | still-open | CI software-GL timeouts; current CI state unverified |
| D229 | still-open | last evidence 2026-10-19 (seven-frame metallic blink); no later proof |
| D250 | still-open | host-resource boot failure; no re-run since 2026-10-23 |
| D251 | still-open | 146 MB opening payload; no first-load byte budget at HEAD |
| D241 | still-open | Ceres corridor and 181 s budget residue; its 47-A leg is resolved in the row but not narrowed out |
| D243 | look-stale | fix at HEAD: dithering true and dither include at uiStage.js:973 and :996; row not deleted |
| D252 | still-open | iPhone WebKit menu refusal; probe-only evidence, unresolved |
| D255 | look-stale | faction_helix sting at themeMatrix.js:195 on HEAD; row not deleted |
| D261 | still-open | phone390 HUD overlap per 2026-10-26 shots; not re-measured |
| D262 | still-open | three portrait files absent at HEAD; uncommitted lane, not on master |
| D263 | look-stale on HEAD | capture now writes key `frontier` (saveSystem.js:921), matching restore at :6809; working-tree lane not re-checked |
| D264 | still-open (uncommitted only) | not reproducible on HEAD; pirateDisguise.js has one dock:docked registration; lane not re-run |
| D265 | still-open | failing test named in 2026-10-27 row; not re-run |

Ledger items that matter most for a stranger's first hour: D252 (iPhone menu refuses), D250 (Adventure boot cannot fetch the module), D261 (phone HUD overlap), D251 (payload), D130 (hitch). D262, D263 and D264 are uncommitted foreign-lane issues and do not affect master.
