# Whole-game integration status

Updated 2026-11-01. This is the compact current outcome map for the Finish Program, not a game-complete claim. The lane boards own active work and acceptance criteria: [Lane 1](./LANE_1_MACHINE_AND_PICTURE.md), [Lane 2](./LANE_2_FIGHT_AND_SIM.md), and [Lane 3](./LANE_3_WORLD_GLASS_HOUSE.md). The [dated archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md) preserves the previous detailed receipts and failure history. Source coverage U001–U072 is recorded in [the coverage ledger](./SOURCE_COVERAGE_2026-10-29.md).

## Current outcome map

| Area | Current outcome | Open work / boundary |
|---|---|---|
| Ordinary gameplay routes | Racing, Gauntlet, Pinball, Swarm round-three functionality, and the Adventure Ceres delivery/save/Continue route have scoped passes. | These do not establish full-game completion, broad performance, or all public-story routes. Foundry first-ten/boss and Last Shift story routes remain open. |
| Ceres and RC458 | Native Ceres ambush opportunity/lifecycle and the selective staged-pilot RC458 case pass. The map search fix and bounded public-route helper are ready. | The public Ceres toolkit route remains unverified. Native outcomes do not substitute for that route. |
| Kraken | Candidate native combat, authored-art, and worker-cue checks pass. | Public Swarm wave-seven-plus progression, targeting/portrait, boss progression, and performance remain unrun or unverified. |
| M8 recovery and stability | Focused context, resource-lifetime, cancellation, and save-recovery repairs have targeted checks. Public Adventure settlement and persistence have passed in earlier scoped routes. | No qualifying final 30-minute soak has passed. Preserve earlier full/short soak failures. Long-session retention, forced-context recovery, and performance remain open. |
| Renderer / recovery | Batch24 packaged startup, visible authored flight/input, and F5 save succeeded. Batch25 F9 exhausted staging/retry and showed “Authored visuals unavailable”: nine jobs queued, none running, with the previous first-flight hold still active. The loading/flight handoff repair is integrated; its focused queue and composition checks pass 17/17 without a retail debug global. | Batch26 is rebuilding the repair for packaged F5/F9, context restore, and a 120-second tail. No packaged recovery pass yet. Earlier source-route tick-zero, F9-deadline and startup failures remain failures at their original layer. |
| M10 shader ownership | GL issue and render-state restoration remain serialized; capable backends can settle four independent actual-program readiness sets outside that reservation. Timeout receipts retain ownership of unfinished work. Focused owner, cancellation, delayed-stamp and fallback checks pass. | No matched live speedup has been established. This repair and the loading-queue handoff do not establish loading or runtime performance acceptance. |
| M9 loading | Batch23 main static closure: 11,544,487 raw bytes, 3,604,071 summed-gzip bytes, 134 outputs; below the 12 MB floor. Bundle and both worker graphs pass. Capture/playback, spawn specifications and mirrored prop-motion readers now have separate owners; focused checks and 42 main + 1,061 source preloads pass. | The 6 MB target, total preflight transfer, and smooth-loading/runtime bars remain open. Batch23 includes concurrent edits and predates the M10 queue change. |
| Baseline | Batch24 completed 16/17 links; Massline hit its 210-second outer timeout with no assertion output. A later isolated Massline aggregate passed all 27 checks in 114,872 ms. One physical-branches CPU profile found the long prefix shared correctly and no demonstrated redundant pass to repair. | Full-run cause remains UNKNOWN and total timing FAIL against the unchanged 90,000 ms budget. The isolated pass and instrumented profile do not establish a default baseline pass or an environmental cause. Automatic cap4 and coverage remain unchanged. |
| Responsive UI | Narrow Market headers, vitals, controls and stock rows are repaired. The actual 375px fixture shows the full commodity/quotes; selecting and buying emits the same 9-credit total the player sees. The rolling intermediate-price bug is removed. Reviewed menu/keyboard changes and focused UI checks also pass. | Market fixture/action evidence is scoped; the combined ordinary-route UI batch remains open. Earlier 481/650px captures predate the final stock-row adjustment. Remaining affected screens still need their relevant public routes. |
| Pro creation | Correct Pro dispatch count: 0. The Browser connects to ChatGPT Chat with Pro selected; the model menu reports “Usage limit reached.” | Five briefs remain queued for ChatGPT Pro. Work and alternate models are not authorized. See the [Pro portfolio](./PRO_CREATION_PORTFOLIO_2026-10-30.md). |

## M9 measured checkpoint history

The current measured point is the batch23 main closure above. Earlier checkpoints, methodology, receipts, and non-comparable measurements remain in the [dated archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md). Do not infer total transfer or runtime smoothness from the static-closure number alone.

## Active failures and next acceptance work

- Verify the loading-queue handoff repair through packaged F5/F9 and context recovery, then complete a qualifying M8 30-minute run with the required post-context observation. Focused repairs do not establish soak acceptance.
- Run the public Ceres toolkit route after the ready map/actor changes, preserving the native Ceres and RC458 passes as separate evidence.
- Run the public Foundry first-ten/boss route and verify Kraken wave-seven-plus progression through ordinary play.
- Finish the remaining public UI and story routes recorded on the lane boards. Do not turn fixture or owner checks into ordinary-route claims.
- Close the remaining performance and long-session stability work with a relevant matched measurement. Current source size, host contention, and focused test timing do not establish a performance verdict.
- Perform the final build-map review and requested last-300-commit review only at the end; neither has started.
- Resolve the five unsent Pro briefs only if the user’s intended provider becomes available; current correct dispatch remains zero.

### Current integration candidate — sector epoch, CSS and renderer ownership

The latest integrated changes and their exact receipts are preserved in the [dated archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md). Active ownership, dependencies, and next actions belong on the lane boards. No source, native, or fixture result by itself closes the public-route or final-soak items above.

## Integrated changes and measurement limits

This section is retained as an anchor for older links. The detailed change history, measured values, route artifacts, and failure chronology are in the [archive](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md). Read each result at its evidence layer: native behavior, UI fixture, ordinary public route, packaged smoke, and performance qualification are distinct claims.

## Source coverage

Source coverage U001–U072 and orphan classifications are complete as a source-coverage activity. That does not certify all systems, visual quality, ordinary routes, retention, or performance. See the [source coverage ledger](./SOURCE_COVERAGE_2026-10-29.md) and the [full historical integration record](../../archive/finish-integration/INTEGRATION_COVERAGE_2026-10-31.md).
