# Hawser attended repair

## Scope
The existing salvage-watch scene now gives its original Hawser a transient civilian helm lease. Ordinary flightV3 and physics move it toward a 35 WU surface standoff from the original Mule. No shared AI, traffic, npcJobs, flight, combat, Save, schema, generator, model or workflow changes.

Repair accumulates only across continuously observed intervals no greater than 1.6 seconds, with hull-envelope gap 15–70 WU, relative speed at most 5 WU/s, and threats outside the existing 240 WU pressure boundary. Separation or pressure pauses work; a real return resumes it. Missed/offscreen time earns nothing. The existing 55-second eligible-work requirement, 170-second deadline, cargo, threats, 300-credit/+6-MTS reward, custody/loss consequences and release/expiry lifecycle remain.

The lease requires the original actor identities, generations, bodies, encounter/sector/role ownership and its exact intent packet. Missing or foreign living ownership ends neutrally as watch_over; retained evidence of genuine original-actor death preserves the existing loss ladder. Terminal, abort, Save restore, sector exit, menu exit and new-game cleanup release only this watch's intent, restoring the previous packet without clobbering a successor. Terminal latches prevent duplicate payout.

This does not implement or claim physical return-home/docking after repair beyond the unchanged release/expiry behavior.

## Reproduction
Run only the named gate:
```sh
npm run check:hawser-attended-repair
```
It invokes exactly:
```sh
node --test test/salvage-watch-encounter.test.mjs test/hawser-attended-native.test.mjs
```

The package alias is appended once to the existing check chain and is reachable through check:ci. On the publication graph it is command check-hawser-attended-repair, static shard 2 of 3 (311 commands total; 233 static). All pre-existing command relative order and workflow prerequisites remain unchanged. No broad local aggregate was executed.

## Reviewed local qualification
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

## Handoff
Keep this as a draft. Inspect the native trace output, focused assertions and hosted named-gate result before expanding scope. The next acceptance layer is natural admission and visual/browser inspection, not a replacement for these causal tests. No merge or deployment is part of this increment.
