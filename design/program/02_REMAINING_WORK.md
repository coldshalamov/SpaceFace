# Unified Remaining Work

This is the canonical roll-up of everything still required from the Full Solo Alpha and the Depth
Program. Detailed behavior remains in the linked source plans; this file owns status and next action.

## Alpha M0–M6

| ID | Present maturity | Exact remaining work | Acceptance required |
|---|---|---|---|
| M0-EVIDENCE | RED | Repair/migrate all 20 Alpha records: 13 current issues include invalid hashes, unsupported schemas/status, and missing schema data. Finish EVID-001/EVID-002. | `check:alpha:evidence:contract` and `check:alpha:evidence`; current-revision browser/Electron evidence. |
| M0-BASELINE | STALE | Replace baselines bound to `6e27aa2b+dirty` with current committed-revision public routes. | Browser and packaged Electron canonical route, current hashes, clean teardown. |
| M0-OBSERVATORY | PARTIAL | Wire Phase B browser/media/filesystem, matched media/no-media/off sessions, detectors, and natural twenty-minute route. | Observatory gates plus matched player-route evidence. |
| M0-ASSET-INTEGRITY | OPEN | Reconcile the 15 source-manifest residuals and every existing graphics candidate; remove evaluator/self-score weaknesses; enforce provenance, required views, LOD, collision, wiring, and performance receipts. | Asset-status/reachability/live checks, classification records, durable source/license evidence, and normal-route visual review. |
| M0-CALIBRATION | OPEN | Calibrate the available image/model/Blender generation and review capabilities against the professional visual bar, recording which workflows reliably produce shippable results. | Reproducible capability trials with retained inputs/outputs, independent visual verdicts, and explicit pipeline decisions. |
| M0-PRODUCTION | OPTIONAL DEBT | SAFE remains supervised/controller-waived, not accepted; automated hash-bound integration/controller machinery remains unfinished. | Only required for fully autonomous external mutation, not supervised game work. |
| M1-ROUTE | RED — **re-measured 2026-07-18, the stated cause is wrong** | The "repair ordinary autopilot / best 294.777 WU, final 324.520 WU" description no longer matches observed behavior. See the re-measurement note below this table before acting on this row. | Complete uninjected New Game→objective→map→flight→dock route. |
| M1-FOCUS | PARTIAL | Five cluttered exact-target flybys with correct 50% timing, deterministic target ownership, and escape/counterplay. | Held-out public keyboard/gamepad routes and media. |
| M1-CAMERA | PARTIAL | Capture and review current two-ship composition, ease, overflow, reduced-motion, and tether framing. | Fresh before/after media plus `check:camera`. |
| M1-TETHER | PARTIAL | Prove standard +30% limits, operational mass, non-stacking spools, and starter survivability naturally. | `check:m1:tether-mass`, tether floor, sim compare, public benchmark. |
| M1-DOCTRINES | PARTIAL | Prove three readable doctrines, player counterplay, and recovery in held-out public routes. | 23/23 remains green plus natural route evidence. |
| M1-HUD | OPEN | Remove repeated objective/action/threat instructions without removing the contact roster or protected station UI. | UI/a11y/perf checks and public screenshot review. |
| M1-VISUAL-FAMILY | PARTIAL | Finish and wire the starter/Hitch, thrusters/RCS, massline/combat feedback, Helios hub, gate, landmark, hero-rock, and environment family at or above the borrowed Kestrel reference bar. Classify current candidates instead of assuming routed assets are accepted. | Normal public route with authored assets, classification/provenance records, asset/live/visual/perf checks, and reviewed browser/Electron media. |
| M2-REVALIDATE | RED CHECK | Repair/re-run Electron after Playwright websocket reset; re-establish combined seamless-world green. | `check:m2:seamless-world`, browser+Electron full-24 route, three clean waves if retained. |
| M3-RECOVERY | RED ROUTE | Make post-Game-Over recovery settle naturally after the proven Hunter defeat. | `player:respawn`, hidden Game Over, collision-clear lawful berth, public evidence. |
| M3-CAREERS | PARTIAL | Run all three careers through complete unassisted ninety-minute routes across held-out seeds/policies. | Origins, ladders, cohorts, mining/combat/trade, save/Continue, first upgrade and recovery. |
| M3-PREVIEWS | OPEN | Replace simplified/fabricated engineering previews with truthful runtime asset/loadout presentation. | Engineering preview check plus browser/Electron comparison. |
| M3-NAV-HUD | OPEN | One objective, one immediate action, one threat; readable mission navigation and contact hierarchy. | UI checks and unassisted first-hour play review. |
| M4-ECOLOGY | RED CHECK | Fix the registry/save initialization-order assertion; current regional ecology gate is 8/9. | `check:m4:regional-ecology` 9/9 and save/reload proof. |
| M4-FAMILIES | PARTIAL | Finish fighter/interceptor, miner/hauler, weapon/impact, station, POI, and ecology visual/behavior families. | Sparse/normal/crowded public routes and accepted visual classifications. |
| M4-ASHLINE | UNWIRED | Re-evaluate and either integrate or intentionally retire the held Ashline candidate. | Normal-route reachability and visual/gameplay acceptance if integrated. |
| M5-STORY | PARTIAL | Prove B0–B7 ordinary continuity, all five endings, and post-ending sandbox. | Held-out save variants and public routes. |
| M5-OWNERSHIP | PARTIAL | Prove three visible outpost specializations, their assets/economy, and 13-role progression. | Ordinary player routes, not injected supporting setup. |
| M5-COVERAGE | OPEN | Complete retail icon, silhouette, portrait, map-mark, and visible ownership coverage. | Accessibility and visual acceptance matrix. |
| M6-WASP | UNCLASSIFIED | Add a Wasp orchestrator classification record or downgrade it to routed candidate. | Asset-classification evidence gate plus current player-route/perf review. |
| M6-PERFORMANCE | RED | Repair 49.4 ms p95, 75 hitches, 22.9 ms callback p95, 6.9 ms sim p95, launch delay, missing autosave completion, high heap trajectories, and the remaining multiple-KTX2-loader lifecycle warning without reducing quality. | Fresh headed frame/startup/memory profiles on target and floor hardware, including decoder/loader lifecycle evidence. |
| M6-VISUAL-DEFECTS | OPEN | Repair accepted-presentation defects still visible in current routes: Hitch engine glare destroys the silhouette and Helios contains opaque/unshaded geometry. | Same-framing browser/Electron captures, independent visual acceptance, asset/live/visual/perf checks. |
| M6-RELEASE | PARTIAL | Real browser/Electron store capture, parity, localization, accessibility, corrupt-save/migration, resize/alt-tab, platform soak, visual/audio coverage. | Full release matrix and, if the draft production policy is adopted, five clean waves. |

### M1-ROUTE re-measurement (2026-07-18, at `2a355195`, dependencies verified present)

The row above attributes the failure to autopilot and quotes a distance short of the dock. Neither
survives re-measurement. Three observations, in the order they were taken:

1. **The autopilot is not the defect.** `npm run check:autopilot` exits 0 and prints
   `--- ALL V3 AUTOPILOT CHECKS PASSED ---`. That includes the live V3 + Rapier case
   ("clears centered corridors/dense fields, reaccelerates, and arrives":
   `completionTick` 1197–1210, `maxLateral` 345–354, `finalDistance` 37.84–37.87 WU), halfway reverse
   burn, obstacle avoidance with side-commit and order-independent escape, the avoidance lifecycle,
   assisted/drift/newtonian modes, and `ui:setCourse → nav.autopilot`.
2. **The route no longer reaches flight at all.**
   `npm run check:professional-travel:public-route:browser` marks `observers-armed`,
   `intro-dismissed`, `main-menu-visible`, `new-game-visible` — then clicks Launch and dies on
   `page.waitForFunction: Timeout 150000ms exceeded` waiting for flight-ready. The next milestone,
   `authored-flight-ready`, never fires. A 294 WU distance-to-dock cannot be produced by a run that
   never enters flight, so that figure is stale, not current.
3. **A second harness fails even earlier.** `npm run check:wave15-flight-boot` fails at
   `AssertionError: New Game button` — the click helper returns false.

4. **A fourth observation overturns 2 and 3.** The `G01` public pilot — written fresh against verified
   game seams and forbidden by its own static contract from injecting state — **completes the corridor
   through ordinary public input**, three times (two by its author, one independently by the lead):

   | Run | Armed from | Closest approach | Dock | Result |
   |---|---|---|---|---|
   | author, `--stop=first-station` | 1328.586 WU | **152.111 WU** | `station_helios`, 1 public KeyE hold | PASS |
   | author, `--stop=full` | 1283.341 WU | **155.158 WU** | 1 public KeyE hold | PASS, 13/13 milestones |
   | lead, independent | — | — | first-dock @78.1s | PASS, clean teardown |

   The `--stop=full` run reached `service-used` (market, 2 service events), `save-written`
   (slot `quick`), `continue-restored` (flight, `sector_helios_prime`), and `clean-teardown`, with
   0 console errors, 0 page errors, and no leaked resources. The dock is not a selector
   false-positive: the capture shows the full Helios Station UI (HELIOS STATION / Trade Hub Class L,
   FIRST DOCK HANDOFF banner, UNDOCK READY, 2 active missions).

   Both closest approaches are far **inside** the 294.777 WU the row calls a RED best.

**Revised conclusion.** The corridor route is reachable on the current tree. Observations 2 and 3 are
therefore most likely **stale harness predicates and selectors**, not a game defect — `G01`'s author
records that their own first draft guessed `KeyF` and invented selectors before being corrected
against source to `KeyE` and `.sf-alert--dock`, which is exactly the failure mode an older harness
would exhibit. That the two old harnesses fail at two *different* points supports harness drift over a
single hard break.

This is not yet proof that the old harnesses are wrong, and it is not a promotion of `M1-ROUTE`:

- All runs were on a dirty tree. `G01`'s author notes the dirty foreign map/nav files
  (`src/ui/galaxyMap.js`, `src/ui/navigation/localSpaceMapModel.js`, `src/systems/world.js`) may
  themselves be what makes the approach work, in which case the improvement belongs to the
  `MAP-2026-07-18` lane and is uncommitted.
- No run was done against a clean `bfb23570` checkout, so HEAD-vs-dirty attribution stays open.
- No Electron run was attempted.

**Required next action is measurement, not repair.** Re-measure `M1-ROUTE` with `G01` on a clean
checkout and on the dirty tree, then repair whichever of the game or the old harnesses the delta
names. Do **not** fund autopilot repair against this row: the autopilot acceptance surface is green
and the public route now docks.

`G04` is `ATTEMPTED_STILL_RED` rather than complete — the diagnosis landed and inverted the row's
stated cause, but no repair was made and no clean-tree attribution exists.

## Depth Program roll-up

`IP-CP` means implementation/check surfaces are preserved by checkpoint `850c80f3`. It does not mean
the prior focused result has been rerun at current HEAD or that the chunk is accepted. After the
repository-state reconciliation, the roll-up remains **0 DONE, 16 IP-CP, 15 TODO**.

### Enabling and M3 narrative/content track

| Chunk | State | Exact next action before DONE |
|---|---|---|
| F1 `.faction` migration | IP-CP | Rerun the full repo gate and current parity review from committed HEAD. |
| F2 validators/loader | IP-CP | Rerun the full repo gate and bad-fixture matrix from committed HEAD. |
| V1 fifteen NPCs | IP-CP | Revalidate 15 contacts; replace compressed gates with natural/unassisted contact/read-through proof; full gate. |
| V2 rumor/flavor corpus | IP-CP | Add ad-board, Quiessence, and Hush producers; finish wreck-rumor reachability and Contracts presentation; resolve Bar station identity without regressing station UI; full gate. |
| R1 unique-wreck system | IP-CP | Unassisted rumor→bearing→scan→decision→salvage route and full gate. |
| R2 twelve wrecks | IP-CP | Revalidate all 12 and surface carriers; full gate and natural sweep confirmation. |
| SP1 set-piece missions | IP-CP | Real unassisted human-duration observation for success/failure/retry routes; full gate. |
| E1 eight encounters | IP-CP | Keep the two explicitly banked follow-ons as honest stubs; finish natural, uncompressed public-route acceptance for the eight canonical encounters and run the full gate. |
| A1 The Band | IP-CP | Materialize physical Quiessence/Hush actors and canonical proximity capture; full gate. |
| A2 Ship’s Ledger | IP-CP | Verify player reachability without redesigning protected station UI; capture panel; UI/full gates. |

### M4/M5 world, identity, art, and doctrine track

| Chunk | State | Exact next action before DONE |
|---|---|---|
| L1 faction livery | TODO | Implement distinct runtime liveries and accepted captures. |
| K1 five factions live | IP-CP | Revalidate live behavior/data; full repo gate and unassisted faction exposure review. |
| PR1 props 1–8 | TODO | Author, optimize, wire, classify, and capture props 1–8. |
| PR2 props 9–15 | TODO | Author, optimize, wire, classify, and capture props 9–15. |
| H1a Wreck Cathedral | TODO | Author landmark, place it, give it a readable interaction/history, and accept it in play. |
| H1b Obelisk + Shard Sphere | TODO | Author/place/wire both landmark identities and accept in play. |
| H1c Candle Fleet + Quiessence | TODO | Author/place/wire both and connect Band/story producers. |
| H1d Lung + Funnel | TODO | Author/place/wire both with distinct behavior and accepted captures. |
| H1e Flight Deck + Caved Shaft | TODO | Author/place/wire both with navigation/gameplay use. |
| H1f Arc + Watcher + Metronome | TODO | Author/place/wire all three and implement readable rites/timing. |
| H1g Vault Maw + Iron Maw | TODO | Author/place/wire both with distinct combat/world interaction. |
| H1h five capitals | TODO | Build and accept five distinct faction-capital identities. |
| S1 Vael bio line | TODO | Build Vael ship family, behavior, assets, natural carriers, and acceptance. |
| S2 Fulfillment + Understory kit | TODO | Build both ship/attachment families, behaviors, carriers, and acceptance. |
| S3 Reach sub-cultures | IP-CP | Add browser/Electron frames, unassisted 60–90s intro review, B11–B15 hulls, and Maw-volley proof. |
| S4 Authority + Thunderchild | IP-CP | Add B16–B20 assets, real hold producer, registry/package wiring, morale/decal/news consumers, forced succession, and public fleet proof. |
| W1 planet states 1–4 | IP-CP | Corrected from TODO: revalidate committed data groundwork; add shaders/runtime visuals, state transitions, save continuity, `check:visual-stability`, four orbital plus four combat-distance captures, and a deterministic Scrawl ace-challenge sector-entry route. |
| W2 planet states 5–8 | TODO | Implement second planet-state wave and acceptance. |
| A3 Living Hull | TODO | Implement bounded persistent hull history/decal/wash loop and public before/after series. |
| D1 doctrine audit | IP-CP | Give original nine/Helix natural fleet carriers; complete S1–S4 adoption/assets and player-route differentiation. |

### M6 Depth closeout

| Chunk | State | Exact next action before DONE |
|---|---|---|
| GT1 Golden Thread + Gallery | IP-CP | Rerun the loot-leak audit, then archive full `npm run check`, build ~40-shot gallery, and run unassisted first-hour Candle Fleet→ticker→bearing→unique→Band route. |

## Cross-program work that must not disappear

1. Audit the broad `850c80f3` checkpoint by coherent subsystem; recoverable does not mean reviewed or accepted.
2. Create durable evidence manifests because `.devshots/depth-program/**` remains ignored.
3. Review telemetry-golden changes included in `850c80f3` as an explicit re-record decision; a bulk
   commit is not acceptance evidence.
4. Keep `src/systems/input.js`, station UI, render/assets, and active lease paths under their named
   ownership rules.
5. Keep residual concurrent WIP separate, re-run status counts, and update
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md) after every checkpoint or
   integration batch.
