# Hawser attended repair and powered departure

## Current successor: powered departure and custody
This successor extends the attended-repair increment below without changing reward timing or adding a quest, tick handler or persistent controller. The repair receipt and 300-credit/+6-MTS reward still resolve immediately at repair. Both original ships then receive diverging assisted-propulsion packets for the ordinary 20-second expiry window, with explicit assistMode 'assisted', turnIntent 0 and no aimAngle.

Exact packet identity, original actor reference and generation bound the short-lived lease. Confirmed secure capture or a committed control-changing event clears only our packet and its matching owned expiry. Failed transfer attempts, foreign successor packets and foreign expiry are untouched. Save restore, sector/menu exit, new game and retirement remove all seven listeners. Installation is guarded when the event bus is absent. No shared AI, flight, traffic, shipControlTransfer, Save, schema or model changes.

Receipt/news copy now says drives restored and clearing the berth; it does not claim home arrival. No docking, destination routing or completed voyage is implemented.

### Current gate and qualification
```sh
npm run check:hawser-attended-repair
# node --test test/salvage-watch-encounter.test.mjs test/hawser-powered-departure-native.test.mjs
```
The existing check-chain leaf, order, classification and workflow prerequisites remain unchanged. On the preserved PR-parent graph this is static shard 2/3. The previous hawser-attended-native.test.mjs remains a historical/manual test file and is not redundantly included in this gate.

- 20 focused tests passed on final source 3b86cabc2372920d3fc4450780bbe1e6b357c1f1 and focused test 3fdc7969c004c26fe9394c20f6a32601ee9ae594. They were additionally qualified against the actual public shipControlTransfer owner d1416dce8d6e4f7b609d0cc17f67bde1dfb0bc9c.
- New portable native/owner file 001adf852d111e6af9c23a115c6b30cda50b0364: 3/3 passed. This reuses the original stock Wasp/pulse pilot and adds the 20-second departure tail, prior native Save cases and six narrow capture/custody cases.
- The initial three-test qualification used archived transfer owner 3047c9b6f0071fb20a78780891dfb10c7db3160a. Only the custody test was then rerun against actual public owner d1416dce8d6e4f7b609d0cc17f67bde1dfb0bc9c: 1/1 passed, all six custody cases. Source, test and narrow adapter were unchanged; this was not another native-pilot run.
- Thus the current local evidence comprises 23 named checks plus the current-owner custody requalification, not a claim that the entire native graph was originally current. Qualification used 1558/1557 archive fallback modules; full coherent checkout acceptance awaits hosted CI.
- The earlier source's 11 existing focused tests passed while the new powered-departure assertion failed: after repair both intents were absent despite the 20-second expiry. That measured gap motivates this follow-through.
- Preflight stdin/loader placeholder failures occurred before gameplay assertions; a later storage-write guard occurred after a passing custody check. These are qualification/persistence failures, not game defects.

### Native results and limits
Repair remains at 154.083333 seconds, minimum approach gap 33.52025 WU, with one immediate 300/+6 payment and one receipt. At one second after repair Mule speed increased from 0.315 to 18.754 WU/s and Hawser from 0.314 to 14.929 WU/s. By 19 seconds, displacement was 1536.323 WU for Mule and 1643.316 WU for Hawser; minimum departure gap 35.0081 WU, no pair contact, both alive. Both were absent by 21 seconds through normal expiry.

Actual capture APIs and registered Save owners verified secure/full-control custody for both hulls past the old 75.7667-second expiry through 78.7667 seconds, plus two foreign-successor cases. These six cases use a narrow owner adapter, not player-flown capture, and are distinct from the native propulsion/physics route. No natural scheduler admission, rendered departure, browser-playthrough or frame-performance acceptance is claimed.

This commit is a child of reviewed PR head ad9b52dd00bf8cf78e64ba3ff70f7cb12390f3c5; it does not replace or rewrite that history. The historical model preview reflects attended repair on scene 1124851, not this powered-departure tail.

## Historical attended-repair increment
The following records the prior increment at ad9b52dd00bf8cf78e64ba3ff70f7cb12390f3c5. Its 13-test hosted result is historical, not a current-successor CI result. Hosted run 40088669919 passed that named gate 13/13 on synthetic merge b1d42d3be35ef0027878a8cf5899c01add8cb808, tree 301e394c9c270d0323f12dd95ce531bcffc21665. The overall run failed; completed failure-command comparisons matched its actual parent, while browser 3 was cancelled and incompletely comparable.

## Scope
The existing salvage-watch scene now gives its original Hawser a transient civilian helm lease. Ordinary flightV3 and physics move it toward a 35 WU surface standoff from the original Mule. No shared AI, traffic, npcJobs, flight, combat, Save, schema, generator, model or workflow changes.

Repair accumulates only across continuously observed intervals no greater than 1.6 seconds, with hull-envelope gap 15–70 WU, relative speed at most 5 WU/s, and threats outside the existing 240 WU pressure boundary. Separation or pressure pauses work; a real return resumes it. Missed/offscreen time earns nothing. The existing 55-second eligible-work requirement, 170-second deadline, cargo, threats, 300-credit/+6-MTS reward, custody/loss consequences and release/expiry lifecycle remain.

The lease requires the original actor identities, generations, bodies, encounter/sector/role ownership and its exact intent packet. Missing or foreign living ownership ends neutrally as watch_over; retained evidence of genuine original-actor death preserves the existing loss ladder. Terminal, abort, Save restore, sector exit, menu exit and new-game cleanup release only this watch's intent, restoring the previous packet without clobbering a successor. Terminal latches prevent duplicate payout.

This does not implement or claim physical return-home/docking after repair beyond the unchanged release/expiry behavior.

## Historical reproduction
Run only the named gate:
```sh
npm run check:hawser-attended-repair
```
It invokes exactly:
```sh
node --test test/salvage-watch-encounter.test.mjs test/hawser-attended-native.test.mjs
```

The package alias is appended once to the existing check chain and is reachable through check:ci. On the publication graph it is command check-hawser-attended-repair, static shard 2 of 3 (311 commands total; 233 static). All pre-existing command relative order and workflow prerequisites remain unchanged. No broad local aggregate was executed.

## Historical reviewed local qualification
- Focused scene suite: 11/11 passed. Covers spawn/escalation, repaired/lost outcomes, distance/speed/overlap/pressure, separation and return, skipped time, reward reentrancy, foreign identity/body/role ownership, actor disappearance/death, terminal lifecycle, revival and malformed geometry.
- Conventional native suite: 2/2 passed, zero failed, skipped or cancelled, on the final frozen scene. Thirteen named tests total. Approximately 15 seconds wall time is an observation, not performance acceptance.
- Before the change, a passive tug 100000 WU away still repaired the Mule to full hull and awarded 300/+6 after 55.7667 seconds. This is the measured defect, not a valid successful route.
- Native fixed seed 4242 uses forced authored admission, actual Hawser/Mule factories and Rapier, ordinary flightV3 and stock Wasp/pulse player inputs. Original raiders die from actual player projectiles; no immunity, teleport, enemy removal or suppression is used.
- Repair completed at 154.083333 seconds, below 170, with 55.5 qualifying work seconds and 300/+6 paid exactly once. Minimum hull-envelope gap was 33.52025 WU.
- 55 physical impacts were recorded: 48 Mule–raider and 7 raider–raider, zero Hawser contacts. The Hawser still took combat damage to 342.2605/380 hull.
- Native Save/Continue during approach (1 second) and work (103.083 seconds, 4.5 work seconds) uses actual serialize → JSON → load. The active cast and live scene are abandoned, sole-player intent is null, and no offline work or payout appears. Pre-existing combat reputation 24 persists without another +6.
- Separate registered-owner Save fixtures cover approach/work abandonment and completed receipt/reward persistence. They reposition actors only at initial setup and omit physics; they are not native-combat route evidence.

The final runtime blob is 1124851e124186666d26d14bd8561b28599fd38c; focused test 29c69e20abda5ae114bbeee3ce8242a664ca4b93; native test 8f83938a6e5416b0ffa90eb845dc9f4c816a221f. An intermediate candidate exposed a genuine-death roster-pruning regression; retained original-death evidence corrected it before final qualification. The final foreign-ownership fixtures exercise both original actors.

## Provenance and limits
Qualification used public base ee049a838cff81446865cd8bbb46d056391f9965, the final exact scene, named public production-owner pins and 1560 fallback modules from archive snapshot 34310c83, plus installed Rapier. It was not a complete exact-current-head graph run. The portable test imports production modules normally and is committed for hosted full-checkout execution.

Publication parent: a3c49d376fc7734c41ea218ceb63a4c4c9afd262. Source/test and all eleven native owner pins were refreshed and unchanged. Newer Chart layout and station-life changes are preserved. No natural scheduler admission, browser/rendered gameplay, visual quality or frame-performance acceptance is claimed. Hosted results must identify the actual synthetic-merge checkout and tree, and must be compared with the actual publication parent's run rather than assuming baseline green.

### Native owner pins
- src/data/modelTruthCensus.generated.js: 69a90c28e12a8259f7d57ce278934f637e4bd363
- src/localization/catalogs/en-US.generated.js: 0eda860fc650a58a961b7c451eac8074b84ef63d
- src/systems/encounterDirector.js: 2677466a6185ce101181fe94b868d7b38ac18d41
- src/systems/tacticalAI.js: 2b037cb89c21dfaa3463b1b3f6cdd7bacfdfbfb7
- src/core/physics.js: 5100dae2f2f10bbcd452c464024530096c43f52f
- scripts/lib/bench/realPath.mjs: 93c5ad1caa8cf0392c2f6e033b18d2ae441c75b6
- src/combat/damage.js: c4196346428330f3ad23eabc538ff7eafbd9a2f8
- src/systems/flightV3.js: ee5cd5a87c0264b1a200037f9d031ef1643709f6
- src/save/saveSystem.js: 3927c4b7f8dc195b99525cf51ea646be398999c0
- src/systems/aiPorts.js: 72f838463067e20186e3125dfa8e461da4b64bb3
- src/systems/combat.js: f0dc041f7ad4e592a919de69b72bf25867deb9f0

## Original handoff
Keep this as a draft. Inspect the native trace output, focused assertions and hosted named-gate result before expanding scope. The next acceptance layer is natural admission and visual/browser inspection, not a replacement for these causal tests. No merge or deployment is part of this increment.

