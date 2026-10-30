# Whole-game integration status

Updated 2026-10-30. This is the current cross-lane outcome and risk map for the Finish Program.
Detailed packet source coverage is in [SOURCE_COVERAGE_2026-10-29.md](./SOURCE_COVERAGE_2026-10-29.md);
the adopted Swarm product target and its specific gaps are in
[SWARM_RENAISSANCE_GAPS.md](./SWARM_RENAISSANCE_GAPS.md). Lane boards own active assignments and
acceptance criteria. Source reads and focused checks do not establish ordinary-route acceptance.

## Current outcome map

| Area | Current result | Remaining material outcome |
|---|---|---|
| Connected implementation | `57686d45cac` published the 94-path Fortify, Hero 3, Borrowed Sun, worker wave DTO, Cryo and RU-7 integration. | Final current bundle and whole-game closure remain open. |
| Swarm / Foundry | Swarm observer repair `4a5e683497e` and corrected offline captures show no spawn-motion anomalies. Foundry controls, round transitions, player visibility, LOD/pop behavior, VFX and edge markers passed; 1,219 offscreen-marker samples passed. | The original whole-Swarm public gate remains **FAIL**: default pilot died in wave 2. Foundry's original route remains **FAIL** for a wave-six asteroid with missing causal identity. Its first-ten/boss route is still required; see [Swarm gaps](./SWARM_RENAISSANCE_GAPS.md). |
| Hero Maneuvers | Public M02 bank, bomb commitment and phase return passed; target survival was an allowed miss. | Actual Pinball contact remains unrun (earlier public dash reported target lost with zero contacts). Complete three-ability public experience is not accepted. |
| Adventure / station | Borrowed Sun public lease purchase, save/reload/Continue and second save passed; the lease retained eight completed beats. N8 production field-only pointer, hit testing and motion pass; Market scale 1.3 and lift -3 px were observed. Responsive prompt-deck controls pass at four viewports. | N8 was field-only, not the full station-navigation tour. The real starter delivery was accepted with eight sealed Fuel Cells, but its public settlement and Continue remain pending after actor corrections. M8's required 30-minute active Adventure plus context restore has not passed. |
| Startup / graphics recovery | `79a536e04493` preserves complete decoder buffer shapes during package restoration, skips retired queued subjects, and retries one specifically superseded startup owner within the original deadline. Startup tests pass 48/48; package texture/geometry checks pass 14/14 and 17/17, and recovery lifecycle checks pass 27/27. Public New Game, forced context restore and two minutes of authored Adventure flight pass with no presentation errors. | This route did not trigger the startup retry; injected owner/transition cases cover that branch. Ten context-delete warnings remain unattributed. The passing two-minute check is not the required M8 long session. Receipt: `.devshots/finish/integration-2026-10-29/m8-startup-owner-retry/receipt.json`. |
| Civilian work / opening sector | `e2b5567580d0` limits civilian cones to one workpiece, preserves player/combat cones, and keeps errands from replacing worker route controls. All 47 targeted cases passed across the initial and corrected-fixture runs; additional field checks pass. In matched 20-second native simulations, miner peak speed fell 257.46→5.60 WU/s and the customs cutter survived the full candidate run. | Native comparison establishes the work-control repair, not Adventure visual or performance acceptance. No global player-flight, pilot or contact-energy changes from PR657 were merged. |
| Story / authored content | `b6673fe1b3c` closed orphan-source classifications and validator issues; authored sheet corrections in `b3dbbe58bf5` are focused-green (14/14). | Source classification and validators do not replace public story-route acceptance where required by the lane board. |
| N16 shaders / N17 sector | N16 headed result: 188 programs, zero broken programs and zero page errors. N17 sector admission passes. | Preserve the single informational first-draw refusal; it is not a shader compile error. Persistent admission errors remain a failure condition. |
| N9 / N6 startup | N9 installed headed Chrome now passes first-playable and public held Accept & Track → Market callout → Mission Log. Artifact: `.devshots/finish/integration-2026-10-29/browser-current/mission-accept-headed-result.log`; trace: `scratch/check-ci-report/station-handoff/1793335429204-05a091c1-5b80-4edd-bc43-346a775147cc-market-dock.trace.json.gz`. | N9's headless 90-second startup check remains **FAIL**: two world draws, valid pre-submit validator, no admissions/shell/screens, and no first-playable stamp. Missing time-since-draw means permanent deadlock is **not proven**. N6 bar opening remains headless **FAIL / unreached**. These are distinct from the passing headed N9 interaction route. |
| Loading and startup cost | `3a868969ab2` makes loadingPresenter ignore stale progress after flight; 13 focused tests and two root Continue-veil release cases pass. `90e0d95fde4` removes dormant racing view/resources from ordinary Swarm; seven focused rendering tests pass. | Neither change establishes a loading-time win. Startup savings and the current Racing gate need direct route evidence. |
| Automatic quality / presentation | Published `f5965835272` across 16 paths. Legacy custom Manual behavior is preserved. Auto trials resolution bands only on a visible, unpaused, released first picture, reverts when it finds no benefit, and respects manual override. Actual Balanced → Auto changed only `qualityMode`; Intel D3D11 flight covered 1.0/0.9 bands, manual and restore with readable pictures and no errors. Prompt CTA wraps pass across 1440×900, 900×844, 844×390 and 390×844; Continue, C and chip raise worked with zero errors. | Workload drift (entity count 195→204) makes FPS 49.5/22.5/44.4 for Auto/Manual/Auto non-causal. No FPS gain, 60 FPS, or target-performance claim. Phone CSS fit is UI-bench evidence only; the full matrix remains open. Artifacts: `.devshots/finish/integration-2026-10-29/prompt-deck-live-corrected/` and `.devshots/finish/integration-2026-10-29/prompt-deck-live-final/`. |
| Retained batches | `c7be545a6df` refreshes animated pivots before retained instances copy matrices; 7 native freshness cases and 29 guards pass. | No FPS gain was measured. Keep this separate from visual admission and performance acceptance. |
| Baseline / final bundle | The earlier Auto candidate passed 17/17 in 73,937 ms. The current recovery/civilian integration run passed 16/17 in 179,932 ms and exceeded the 90-second budget. | Massline's physical-branches child timed out at 151,327 ms without assertions; the other 26 Massline children passed. A standalone discriminator is underway. Artifact: `baseline-after-recovery-civilian.log`. Final integrated bundle and stable checks remain open. |
| Whole game | Repairs are published and route evidence has advanced. | M8 long session/context restore, Foundry first ten/boss with per-wave force capture, active Gauntlet, current Racing gate, Pinball contact, headed UI-budget matrix, final bundle, finish build-map and the requested last-300-commit review remain open. The five ChatGPT Work conversations were the wrong product and are **REJECTED**; no Pro jobs were dispatched and no Pro artifacts are awaited. The five briefs remain unsent Pro candidates. See [portfolio](./PRO_CREATION_PORTFOLIO_2026-10-30.md). Performance bars remain **OPEN**. No completion claim. |

## Active failures and next acceptance work

- **Foundry force identity:** the original public run cleared waves 1–8 and reached wave 9 alive in 45 minutes, but remains **FAIL** for one wave-six moving asteroid whose causal identity was not captured. The original recorder retained only the first four seconds. Its artifact is unchanged; the new per-wave recorder passed nine focused cases, but a new public first-ten/boss run with per-wave force capture is still required. Original artifacts: `.devshots/finish/integration-2026-10-29/foundry-ten-wave-current/`.
- **N9 startup:** retain the headless 90-second failure and its two-world-draw evidence. The headed public interaction pass answers a different question. Do not label the missing first-playable stamp a permanent deadlock without draw-to-deadline timing.
- **Adventure M8:** `e2180e17ed58` compares restore events with immutable pre-F9 bytes and creates at least 50 WU of ordinary-input divergence. The short route passed four warmups and one measured save/load cycle before exposing the graphics-buffer defect repaired in `79a536e04493`. Startup and two-minute post-restore flight now pass; the full 30-minute session is next after the starter delivery route. No 30-minute verdict yet.
- **Runtime aggregate:** the fresh runtime-maturity run passed 936/937; the remaining worker-clock reply test hit its five-second command watchdog. Its isolated pass does not close the aggregate failure; a bounded owner/harness correction is underway.
- **Remaining gameplay:** run active Gauntlet, the current Racing gate and actual Pinball contact. Keep optional Tethys stealth/starter haul public routes on the follow-up list.
- **Performance and finish:** perform the headed UI-budget matrix, produce the final bundle and current baseline, close the finish build-map, and conduct the requested last-300-commit review at the end. Product performance bars remain open until their direct measurements meet the Finish README targets.

## Integrated changes and measurement limits

- `57686d45cac` is the published 94-path connected implementation. `c7be545a6df` (published via
  `c1233cf7ad7`) fixes retained animated pivot freshness; 7 native cases and 29 guards pass, with
  no FPS gain claimed. `84f0fd8a230` makes B0's first-15 tracker instruction exclusive and preserves
  the optional mission-log context; 20 focused HUD cases and the public first-15 route pass.
- Browser actor fixes published as `4008404b60a`, `a9e20ef0fdf`, `9dab408f6e3`, `8440bd23037`,
  `aeac6f55936` and `1f8cc826025` support the current N17, N16, N8, N9 and first-15 results above.
- `b6673fe1b3c` fixed the 26 orphan classifications and story receipt/choice/faction validation;
  `b3dbbe58bf5` corrected authored-sheet references. The affected focused validator suites pass
  14/14; this is not a whole-game route claim.
- `3a868969ab2` handles stale startup progress after flight and releases the Continue veil in the
  covered roots. It does not resolve N9's pre-first-playable headless signature.
- `90e0d95fde4` leaves active authored racing assets available while avoiding unused racing
  view/resources in ordinary Swarm. Seven rendering tests pass; neither a load-time win nor current
  Racing acceptance is established.
- `f5965835272` publishes Auto quality behavior. The corrected prompt-deck reports and PNGs are
  under `.devshots/finish/integration-2026-10-29/prompt-deck-live-corrected/`; the final responsive
  look is under `.devshots/finish/integration-2026-10-29/prompt-deck-live-final/`.
- Earlier focused and public outcomes still relevant to current owners include the save-size repair
  (`cbb6e8e020c`, `eeef330e7dc`), RU-7 warm/preload boundary, Borrowed Sun 650-credit lease and
  Continue, Pallet Jack cargo recovery, station service consistency, and authored map/station
  presentation. Their passing checks do not close the open routes above.

## Source coverage

The durable packet matrix is [SOURCE_COVERAGE_2026-10-29.md](./SOURCE_COVERAGE_2026-10-29.md).
Source coverage for U001–U072 and the 26 orphan classifications is complete. These counts are
navigation metadata, not acceptance evidence. Packet notes and detailed captures are in the ignored
local `.devshots/finish/integration-2026-10-29/` tree and are not visible to cloud agents; current
outcomes and risks are summarized here.
