# Earn and file rope evidence: native acceptance BLOCKED
Base: integrated commit 0888974a1130c2869bd1743390cdca19c89278e8, tree 93ea8c5444cf978253545ac504469fc3e6051660.
Parents: 30bf3d57f416a9482f4ca565d20e0c7444da0846 + 94b6b07f69be601acba62da8dcd748030767bb16.

Production scope: src/systems/masslineTelemetry.js and src/systems/lawSecurity.js only.
Tests: test/al-story-1-rope-scale-4242.test.mjs and test/rope-scale-native-evidence.test.mjs.
No economy, missions, physics, tether, Save, navigation, HUD or stationApp changes. Package registration is additive as described below.
All original 17 contract cases/assertions retained. The reload fixture now reacquires the mission owner's actual replacement target and additionally rejects the old target. Six adversarial cases added.

Result: matched 0889 contract baseline 6 pass/17 fail; candidate 23/23 pass.
Actual 0889 + candidate native test remains RED (0 events instead of 1).
Explicit in-memory diagnostic mission-adoption composition passes native 1/1.
No tests skipped or conditionally weakened. The native test contains no diagnostic flag: only the private loader optionally substitutes the proposed mission dependency. Do not publish a claim of current-game acceptance or green native CI.

Institutional meaning: an earned slip establishes actual body mass differs from an issuer's declaration. Helios records that discrepancy; Ceres records a dispute against its issuer. Neither result identifies contents, intent, criminal guilt, or grants immunity. Existing Oriel fence and Kessler story owners remain intact. The helper/unit contracts cover sealed-slip fence offers, not a native courier flight. Prior report correction: native mission completion and rewards already exist; the remaining defect is target adoption, not missing mission completion.

Telemetry: validates live canonical mission target, positive native physical mass, finite moving body, loaded/overload line and positive strain for 0.5 simulation seconds. Identity includes attachment, body, mission, declaration and mass. Repeated time cannot accrue. Release/break/attachment replacement, invalid/slack/inactive input, clock rollback/gap, save, sector, death and both new-game events reset. Unrelated NPC breaks do not reset player dwell. Own projection precedes the synchronous event; economy remains the sole durable slip owner.
Law: files before the clean-hold heat early return; matches exact issuer station/kind/slip identity; existing economy acknowledgment must accept before law receipt. Guards reentrant/duplicate filing. Changes no heat, cargo or rewards; preserves customs compliance and held notices.

Native evidence: fixed seed4242, actual Rapier ready, actual cursor-aim latch input and native attachment, queued impulses, 30 consecutive loaded observations, live Rapier body.mass()/linvel() assertions, actual physics dock range, createUiInput.doDock including CHARGING refusal, dock identity commit, native mission berth settlement, exact one wallet reward, one filing and Kessler line. Full catalog-equivalent Helios compound collider is present. Positions are staged at its real berth before body creation: not proof of flying from the authored remote spawn. Native asteroid body mass is1598, not its pre-physics spawn hint40; evidence uses native mass without forcing a value.

Blocking dependency: missions.js blob92a8161edeadaebe37012cb6a032eba35c3431a9 retries _ensureMissionTargets every15 ticks. _adoptLiveMissionTargets uses an actor view that excludes asteroids and replaces targetEntityIds; tow targets are asteroids. Actual run remains latched to body2 while canonical targetIds advances to16, so legitimate provenance correctly refuses evidence. Proposed diagnostic adds only live promoted tow slag cores from forEachFieldRock before existing mission/durable-slot filtering. PR459 fresh patch affects restored local navigation only, not this adoption seam. Missions remains actively owned and unmodified. Owner must integrate/review its repair before native acceptance can close.

Independent review: a separate reviewer reproduced23/23, actual native RED and diagnostic native PASS. Also independently checked ordinary quarantine refusal without settlement/payment/filing.


## Clean publication base and dependency

The shipping projection is based directly on public master `30bf3d57f416a9482f4ca565d20e0c7444da0846` (tree `957c4ea233128e4b735c6a0c6c02db2eb00b19de`). It imports exactly the already-reviewed cargo helper `2cba7df79aac728fd4a955026adefd185a4d23ad` and its existing test `e33acd37c664c41c791e5c28caa08fb7fe1d0551` from PR532, without modifying either. No other clinic changes or private recovery ancestry are included. If PR532 merges first, these identical dependency files should reconcile unchanged.

Matched clean-base qualification: 23/23 observer/filing contracts pass; the native acceptance test remains RED 0/1. The explicitly gated in-memory mission proposal yields native PASS 1/1. Shared cargo helper tests pass 28/28, including an independent root rerun. These are 51 distinct passing non-native cases, not 52 currently accepted cases. The earlier integrated0889 paired evidence is retained separately.

The clean exercised-module manifest covers 998 contract and 1,027 native modules; SHA256 `69f03d76b66058489815c8b1f97b726ba8023c394c2fca186f7dd89c46547943`. Public master economyContracts remains blob `10ee18253edc6725a82d1284a4ed8fe17ead7985`; clinic runtime data is not loaded. This qualification applies to exercised modules, not every file or an untested Bar conversation.

## Explicit commands and remaining acceptance

- `npm run check:cargo-mass-read-contract`: shared 28-case dependency contract.
- `npm run check:rope-scale:contracts`: 23 observer/filing cases. Both this and the cargo command are explicitly registered in the existing default check chain; all prior commands remain in order.
- `npm run check:rope-scale:native`: native acceptance regression, currently expected to FAIL on this shipping tree. It is available by name but deliberately NOT included in default check until the owned mission-adoption dependency is repaired. It is not skipped, marked expected-failure, weakened, or supplied the diagnostic patch by its npm command. A passing ordinary CI run would not establish native acceptance.

No aggregate suite was executed during this increment. There is no new browser, gameplay-camera, long-flight, frame-rate or whole-game acceptance evidence. The fixture stages positions at the actual berth before physics initialization. The owner-coordinated mission adoption repair, unmodified native regression, ordinary recovery flight, visual review and Save/Continue route remain open.

## Proposed dependency repair, not shipped production

The following isolated diagnostic change demonstrates the ownership defect; it is a proposal for the active mission owner, not a missions.js edit in this increment. It must be reviewed against the owner's newer work and independently qualified before adoption.

```diff
--- a/src/systems/missions.js
+++ b/src/systems/missions.js
@@ -275 +275 @@
-import { bumpCollidesFlipEpoch, entityIndexVersion, forEachLivingWorldActor, forEachJobInteractable, isLivingWorldActor, registerEntityWorldRecordId } from '../world/livingWorldViews.js';
+import { bumpCollidesFlipEpoch, entityIndexVersion, forEachLivingWorldActor, forEachJobInteractable, forEachFieldRock, isLivingWorldActor, registerEntityWorldRecordId } from '../world/livingWorldViews.js';
@@ -10294,5 +10294,11 @@
     const visitMissionTargets = isCampaign47aB2Rescue(m)
       ? forEachJobInteractable : forEachLivingWorldActor;
     visitMissionTargets(this.state, (e) => { list.push(e); });
+    // Tow recovery cores live in the rock domain, outside the actor/job views.
+    // Retain only live promoted slag cores; the shared filter below proves mission identity.
+    if (m.type === 'tow_recovery') forEachFieldRock(this.state, (e) => {
+      if (e?.type === 'asteroid' && this.state.entities.get(e.id) === e
+          && physicalRoleOf(e) === PHYSICAL_ROLE.SLAG_CORE) list.push(e);
+    });
     if (follow) {
       const exact = list.filter((e) => e && e.alive && !e.isPlayer && e.data
```


## Hosted CI artifact diagnosis, 2026-10-23

At PR544 head `16479eb5804a4e12aed7cf770f0f054d066dd9a1`, hosted run 39946811936 static-2 artifact 12498418671 reports two separate artifact failures. This diagnosis does not claim the whole static shard passes.

### Preload delta and narrow repair

Compared all production paths in public master `30bf3d57f416a9482f4ca565d20e0c7444da0846` to this head. The exact generator `scripts/sync-modulepreload.mjs` (blob ed4078b9a1c45a589eca874307600cd8499f5d69), index.html (30e86f03ce7ee723c96fa823da7ca5fe3acd6c8b), and all other unchanged source paths are identical. Applied that generator's static-import regex to every changed production module. No import edges are removed. Added edges are:
- masslineTelemetry → cargoCustody;
- barContacts → massSlipConversation;
- massSlipConversation → cargoCustody.

cargoCustody already belongs to the base closure: public registry ab927adefa7e3aa848bf802cad1a7d5ebf6d568e imports economyContracts 10ee18253edc6725a82d1284a4ed8fe17ead7985, which imports cargoCustody. The new helper's only import is cargoCustody. Consequently the paired graph difference has exactly one newly reachable module, massSlipConversation.js; its importer barContacts is already reachable. This is a bounded source-graph proof, not a fresh full generator execution against a complete checkout.

The repair inserts only its sorted registry-wave preload line before missionDockAttention. Removing that exact line reproduces the original public index blob byte-for-byte. No old preload, manual wave, threshold, workflow, or held historical hunk is changed.

Hosted output contains 145 missing registry imports and 16 stale preloads. This repair addresses our one introduced missing node; the other 144 missing imports and 16 stale entries remain inherited drift. The full preload check is therefore still expected RED. Do not bulk-regenerate that drift as part of this unit.

### UI budget baseline remains open

The budget checker, budgets.json (6130689ad60b32f976aabfd0e8b4dc2f2281d276), source-manifest.json (0c14eefc0016b9b2af879fd6eab0046d707071d9), and index are unchanged from public master. Inherited source staleness is independently demonstrated by index: current/base SHA256 9c0ad2b37bbea7acfa6a2cd5bf9f6d5cc58c3a83add010fc8d09465481432f87 differs from captured bf066ce07e1521476f134c560011fe39031771213c60e53f916a8f486ff24574. Likewise unchanged accessibility.js c465f65323ae21ea0803767f160c457c67a2c4b9 hashes to 43e22e22f3d37dedf859ed62c16b3a038e6144d3718a3d87716b6df52b448657, not captured f1decf95b3e617cb64be26c417110de02f28983e39e60ab6a5ad776bc726677f.

Our Bar changes also alter rendered source, and the new preload line changes the document seed again. Inherited staleness is not permission to ignore those changes or stamp a new digest. Hosted head computes eb992b575c0009dfd974f0b4db28fec4ca264262dc1a8884ed161bc1c391b187 against baseline 3f560347c50f39b6e2ff044a8da7b3cf41d4a707455a2b6fbdb89aeec7d7183e. A real headed matrix capture and review remain necessary; none was run in this lane. Reported non-strict chart/range timing and flight DOM grammar debts are not newly measured regressions from this patch. No budget numbers, digest, thresholds, tests, or checker behavior are changed.

The earlier run 39945980680 uploaded artifact 12498208423, but that artifact did not contain either command, so it is not paired executable baseline evidence. No aggregate suite or excluded anvil receiver test was run.


### Adjacent acquisition fixture attribution

Hosted `check-massline-acquisition-contract` passed59/60. Its T04 section5 fixture expected hostile50 but acquired station52. A focused paired control reproduces the same failure with the exact public-master cargo helper82f937 and the PR helper2cba, and with the telemetry/law proposal disabled or enabled. Telemetry/law are not loaded by this test. Public master and PR use identical test/tether/scoring blobs fee0ad2d/0862fec0/fa4a41e9. This is not attributed to the Rope evidence producer or helper addition.

The fixture supplies aimWorld but no active aim-intent/pointer flag, so current acquisitionCursorActive disables cursor scoring and uses general precision selection. The intended hostile and asteroid are also placed inside the station envelope. Do not merely change the expected target or weaken the assertion. A separate owner-aligned fixture correction should represent real active cursor input and physically valid target geometry. No acquisition production or test file was changed in this increment.
