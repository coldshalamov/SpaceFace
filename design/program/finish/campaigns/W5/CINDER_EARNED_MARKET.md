# Cinder field report and earned market approach

## Candidate and player-facing change

Unpublished candidate against PR #939 head `841a3d9711909b25b7ac9bdc5572065964e0ca73`, branch `dot/scale4-freight-return-20261108`. Remote head was rechecked on 2026-11-11 UTC and remained open, draft and unmerged. Nothing in this increment was pushed, merged or deployed.

The Journal's current command now explains the actual Cinder account: clearances, ships driven off, destroyed or consumed marked hulls, pending evidence, and Rook's receipt. It names the surviving original hull, warns before the last recorded proof is sold elsewhere or stripped, and distinguishes missing streamed material from a confirmed loss. The report reaches the ordinary tracked and untracked recommendation renderer without adding a competing command or displacing unrelated tracked work.

Rook's intake guidance gives WANTED refusal priority both near and far from the pad. A wanted pilot no longer receives “Inside and slow enough — hold for Rook” alongside an impossible sale. Contract settlement remains distinct from the booth's ordinary hull price. This is a read-only guidance increment; it does not change combat, towing, market prices, law, mission settlement, wreck retention or Compost custody.

## Exact source scope and isolation

Changed paths:

- `src/missions/cinderRoute.js`
- `src/ui/screens/missionLog.js`
- `test/cinder-field-report.test.mjs` (new)
- `design/program/finish/campaigns/W5/CINDER_EARNED_MARKET.md` (new)

The shared checkout was dirty and was not edited. A sparse overlay reconstructs the exact remote parent from the available immutable base plus 81 verified parent overlay files. Module imports and filesystem reads are routed through the exact-source harness. The source audit checks raw Git blob identity against parent tree `de56beaee5af6bec18c236690e36aab6be9e3ada`, plus observed executed hashes. The existing `src/features/breakwaterSpur/freight.js` contains non-UTF-8 bytes: its raw blob matches the parent and its executed import hash is checked after Node-compatible UTF-8 replacement decoding. This is disclosed rather than presented as raw-byte execution equivalence.

The denied mission, starter-workday conversation, scanner, power rail, traffic, world-site manifest and progression-audit paths are unchanged. The candidate patch applies cleanly against its exact parent files. Per-file hashes and full imported/read-source closure are supplied separately with the review handoff.

## Earned production-runtime evidence

These routes start from the previously earned Ceres/Furnace/Charon handoff save, not from a newly completed New Game campaign. The production runtime uses native Rapier, normal input events and existing route/menu commands. No debug kills, hull-position writes, replacement wrecks, money, health, fuel, cargo or progression grants were used to earn the results. The title/Continue UI is a controller seam, not a rendered browser interaction. Temporary load protection expires before the fight. Unit fixtures below are separate from this evidence.

### Clear all marks, then recover the last original

All three original Cinder targets cleared through actual weapon/physics outcomes over 281.5 simulated seconds. Player hull stayed at 140; shields fell to 122.86. Two marked hulls were genuinely destroyed. The surviving Cinder Two hull retained marker `aft_3yua56` across Save/Continue. Its physical position had crossed into Vesta, so recovery required the real sector route rather than treating its absence in Charon as loss.

The pilot recovered and latched that same original, then towed it 6,923.32 WU over 6,104 held frames. A real collision destroyed it before sale. The canonical mission completed `clearance_only_hulls_lost` with zero contract reward and no Rook delivery. The resulting save is retained as a legitimate failed-material outcome, not repaired or replayed into success.

The fight logger's `shots` counter uses the wrong event field and is not valid evidence of shot count. Combat events and actual clearance results are the evidence; the zero counter must not be interpreted as “no shots.”

### Recover early, approach the actual market

A separately labeled alternate branch starts from the same original handoff save and stops pursuit after the first genuine kill. It latches original Cinder Three marker `aft_1pgx7p8` while other targets remain. The remaining clearances occur during towing, including a driven-off target. Rook's WANTED refusal and Quiet Line's warning both fire through their actual owners.

The original hull reaches the physical Quiet Line approach, but its orbit remains roughly 65–110 WU/s. The intake correctly withholds payment above its 8 WU/s limit. After 5,625 held frames and 7,897.79 WU of travel, including substantial orbiting, an actual collision destroys that hull. No sale occurred. The final 250-credit balance is not a market receipt and must not be credited to this hull. One other original marked hull remains unresolved in the preserved save.

A final attempt to recover that remaining original could not get through the station approach with the current ordinary-input pilot controller. The pilot stalled around 2.54 kWU from the target, and pressing F latched a nearby object rather than the requested original. The identity assertion correctly failed. The cause is not isolated: geometry, input gating and controller behavior require further diagnosis. A proposed corridor retry was prepared but not executed. Repeated attempts were stopped to preserve a bounded, honest handoff.

**Earned market sale is not demonstrated.** The physical handling and safe slowdown experience remain an unresolved player-experience issue. The evidence supports genuine combat, same-original recovery after Continue, long-distance towing, meaningful material loss and truthful refusal, not a completed playable market loop.

## Checks and independent review

The combined exact-overlay suite passes 92 tests with no failures or skips. It includes 13 new field-report tests plus receiving-scene, departure conversation, retained wreck, escape clearance, intake readout, Rook booth, booth expansion and Journal continuity/truthfulness coverage. Player-facing label polish and JavaScript typefloor checks also pass.

The new tests exercise the actual Journal recommendation renderer for tracked and untracked states, no-hull opening/pending states and unrelated tracked work. Production-owner fixtures separately verify loss/stripping accounting, WANTED refusal, Quiet consumption without contract proof, Rook completion, mission serialization, once-only settlement, and unresolved marked-proof protection from Compost. In the fixture, the ordinary 25-credit Rook hull payment and 700-credit contract reward are distinct. These staged fixtures are not claimed as earned flight or a whole-runtime Continue acceptance.

Independent review caught and corrected a suppressed Journal action and false towing instructions before any hull existed. A final edge review also corrected retained identities without a finite physical location: the guide now explains that evidence is pending instead of promising a recoverable position. The final review also checks actual rendered HTML selection, receipt-under-fire and WANTED/Continue states. A `check:cinder-route` harness run aborts on the undeclared module port `src/missions/cinderReceivingScene.js`; the exact parent fails identically. This baseline harness gap is reported, not hidden or “fixed” by changing unrelated ownership.

## Acceptance limits and next work

No browser/GPU rendering, screenshots, audio, frame pacing, full CI or full New Game campaign acceptance was performed. HTML controller tests establish selection and text, not visual fit. The narrow 91-test suite and exact-source audit are not a replacement for those checks.

Next acceptance work should inspect the preserved early-recovery save with a rendered ordinary pilot route, diagnose the station-approach stall, and demonstrate a stable original-hull approach below intake speed. Verify the actual market receipt and Save/Continue without replaying payment. Keep the separate all-hulls-lost save intact. Publication of the independently reviewed guidance can be considered separately from claiming the whole market loop playable.
