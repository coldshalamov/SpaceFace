# Ceres tender: current implementation checkpoint

Updated 2026-10-20 19:48 UTC. **Not yet published or accepted.** Historical sections below include rejected candidates and superseded proofs; do not treat their green checks as final acceptance.

## Current coherent correction

- Spawn `(-94,0)` remains within the 95 WU immediate band; berth `(-120,15)` and fallback client mark `(90,-75)` remain within the 95–125 WU mark band. Actual disabled-hulk client stays `(-65,-65)`. Original >0.5-radian heading distinction is restored. No geometry, physics, deadline or band relaxation.
- Full production factory includes actual environmental machinery and terrain anchors. Original `(-44,24)` station penetration and rejected `(-66,68)` anvil penetration are retained as negative controls. Endpoint/yaw/corridor sampling is not continuous-sweep or whole-world clearance.
- Ordinary production exposed two independent movement defects: ambient `aiPorts` overwrote the authenticated tender's FlightV3 controls; after that was excluded, generic BRAKE charged the Ironback's PulsePlate instead of safely holding station. Guard-only travel reached 6069 WU displacement and failed actual service/return.
- The narrow ordinary-tender guard authenticates existing retained actor/data/generation/entry/job/route identities, current sector, and unclaimed active job. It checks request and flush, rejects impostors without consuming genuine authority, consumes invalid retained identity/route appropriately, and yields foreign leases. Crew rescue and law response are not broadly disabled.
- The same authenticated tender now uses a physical target at the live client's radius-derived standoff or the authored berth/fallback. Existing family-aware RCS steering and existing physical-arrival gate are reused. No new saved fields, kernel changes, teleport or velocity setter. Missing clients preserve fallback semantics rather than freezing a job. FLEE/emergency controller behavior is not claimed fixed.
- Zero RCS at a settled PulsePlate berth replaces the old erroneous test expectation that BRAKE=true meant idle. Relative-speed damping remains required when moving.

## Evidence and remaining validation

- Original public a8 normal cargo: extract10161. Rejected66/68: fails12000 after anvil-fragment impact. West staging without movement correction: original cargo/custody passes7078, but tender route fails (circle minimum -62.51165, native contact minimum -17.95224, no actual service/return). Historical offending contact entity and near-minimum yaw were not captured.
- Guard-only public074: extract7078 but route fails, maxTravel6069.999, minNative2.18415, minCircle7.89228.
- Intermediate public5afd3f24729677c9af500811e987cef9158403af RCS steering: cargo/custody and ordinary service/return pass7078, zero pulse events, maxTravel32.3991, minNative2.30787, minCircle7.89228. This intermediate omitted the intended arrival-gate projection and is NOT final whole-unit evidence.
- Final candidate public source tree `ee4dfcd1e921cd0a4b39ec136e122cf354030439` includes the exact public arrival gate, direct far/fast progress regression, Continue identity/progress, request/flush and callback-escape tests. Full existing `check:ceres-workfleet` leaf passes285/285 in576.11s under unchanged256MiB/concurrency1. Exact final normal cargo/custody reaches extract7078. Ordinary tender physically reaches service(starts work2549) and returns to berth(approach6929): zero PulsePlate events, minimum native contact separation2.307874WU, conservative circle gap7.892281WU, travel32.765111WU. Physical commission correctly delays departure to449. Independent canonical authority/adjacent review passes30/30. Snapshot-driven visual review remains pending.
- Actual native contact assertions run outside native callbacks because callback exceptions can be swallowed. A focused negative regression proves the failure escapes into the Node test runner.
- Conservative circle distance is a warning metric during travel, not exact visible-mesh penetration. Renderer initially used standalone client yaw0 for a25.2665WU gap; ordinary client yaw2.942870514 differs, so that numerical result is superseded and must not be cited as exact ordinary visual clearance. Actual snapshot-driven export review remains separate from gameplay acceptance.

## Recovery and next action

Verified cloud recovery: west source `libfile_0928d7f889188191879100b739cc897d`, SHA256 `d221bf43e3d89b48f7d9c24d515257e181b3089adb27dac25cf9627a8325a843`; historical writer/cargo diagnosis `libfile_7f27944041888191ba80ca3ab36444a1`, SHA256 `da5cebc8fd77de338ecb3897f86051fd8ab692ee03becae1b532d21450037cdc`. Both restored and byte-verified. Neither substitutes for GitHub delivery.

Local source seal: `65451b41289f18c27bab9dcc3a489ee05ca80e9f`. Current source/tests/handoff recovery: `libfile_fafbae5e4d208191ba27bf45782a00ef`, SHA256 `1657fcbe5bf2d0badef034e56129d7872d35aa15048c7c455c00714ea4c82090`, restored and verified; validation was pending at that backup.

Exact added ownership: aiPorts request/flush; npcJobsRuntime narrow predicate/physical target/admission generation; new `test/ceres-tender-flight-authority.test.mjs`; existing tender hold/aim assertion and normal cargo observer. Preserve unrelated source and private ancestry. Public projection starts from verified a8 and checks every unique replacement anchor/output. No private salvage-controller changes are imported; omission of redundant workPose selects the existing shared public RCS branch.

Next: complete actual corrected snapshot visual review and final public metadata review; seal only owned paths; preserve final source/tests/handoff; read latest remote state; create reviewed draft PR with remote commit/tree readback. No merge/deploy. All larger SF-GAME/SF-LIVING-WORLD/SF-VISUALS/SF-PUBLISH goals remain open.

---

# Historical investigation (superseded where noted)

# Ceres tender native spawn clearance — 2026-10-20

## Publication hold: attributable production regression

As of 2026-10-20 18:50 UTC, do not publish this candidate as a passing increment.
The full unchanged 256 MiB Ceres workfleet leaf passed 267/268 in 612.44 seconds.
Its complete-production-factory case remained `head_retract` at the unchanged 12000-tick
cutoff, which requires active `reacquire` to continue. The identical isolated named case
on immutable master/original spawn passed at `extract` tick 10161 (124.95 seconds),
whereas the isolated candidate failed the same `head_retract` assertion (158.62 seconds).
This establishes a placement-attributable production behavior regression, not a baseline
failure or same-file test contamination. The local clearance proof remains valid, but
the broader increment is not yet safe to publish. No deadline/physics/test budget was relaxed.
Next: inspect the actual failed production head/tender/contact state and resolve the
causal interaction within authorized scope, then repeat only the relevant changed proof.

## Scope and outcome

Move only `ceres_refinery_tender.spawnOffset` from `(-44,24)` to `(-66,68)`.
The new radius is 94.762862 WU, inside the unchanged accepted R1 immediate band (95 WU).
The berth `(-66,85)`, client mark `(10,-119)`, real client `(-65,-65)`, identities,
route timing, hulls, collision solver and all other pockets remain unchanged.

This is a physical spawn correction, not game/Orchard/living-world completion or visual acceptance.
SF-LIVING-WORLD, SF-GAME and SF-VISUALS remain open. Normal route travel, player-camera quality,
full player-truth acceptance and any unrelated ordinary-controller behavior are not established here.

## Causal evidence

Actual production actor producer, production system order, compiled Rapier hulls, seed 4242,
world ticks enabled. The tender has seven native colliders; the station has 22.
Pure shape queries reuse their native shape objects and local transforms without moving live bodies.
At the old authored zero-heading placement, tender/station collider pairs penetrate:

| Tender collider | Station collider | Signed distance WU |
| --- | --- | --- |
| 0 | 20 | -5.695009 |
| 1 | 20 | -1.853360 |
| 2 | 20 | -1.036445 |
| 3 | 19 | -9.968529 |

This is actual native overlap, not an inference from bounding circles.
At the corrected placement the minimum station separation is 30.179564 WU.
A 5-degree full heading sweep gives minimum 18.517553 WU.
121 actual native ticks (2.016667 simulated seconds) give minimum separation 18.730362 WU
against every other current native collider, with no penetration or center ejection.
The test captures the authored center before the first physics step to reject an initial
solver depenetration jump. No tender/casualty pose or body teleport is used.

## Deliberate heading-contract reconciliation

The old overlapping spawn separated the live-client and fallback-mark bearings by 0.592785 rad.
The safe spawn separates them by 0.378507 rad; the unchanged berth already yields 0.349954 rad.
The data test formerly required >0.5 from the spawn. It now explicitly matches the existing
actual live-client steering test's >0.25 causal-distinction requirement, while pinning all three
unchanged target/mark offsets and requiring the spawn to remain within 10 degrees of the berth
side of the station. This reduced spawn-angle margin is intentional and disclosed, not a claim
that the old >0.5 threshold still passes. Native-produced-actor steering also verifies the owner
aims at the live client, not the fallback coordinate. Selecting that job leg is a focused steering
seam test, not evidence of completed ordinary travel.

Alternatives were evaluated, not shipped: the existing berth is outside 95 WU; a same-side
(-50,36) point preserves >0.5 but penetrates 7.518 WU when turning. An east-side alternative
would change staging geography unnecessarily. No band, route or physics relaxation was used.

## Validation and publication boundary

`node --test test/ceres-tender-clearance-native.test.mjs test/ceres-active-pockets.test.mjs test/ceres-activity-faction-tender.test.mjs test/ceres-activity-runtime-lifecycle.test.mjs test/lived-frontier-pockets.test.mjs`

Strict immutable public proposal based on master `a8a9500ab87e1bcff91c407e96f744a52202a134`:
83/83 pass on 2026-10-20 at 18:34 UTC, including the real native negative control, heading sweep,
first-step center check, neighboring contacts, unchanged durable identity and live-client aim.
Every imported repository module and synchronous source read came from the immutable proposal
(tree `0c43f230be574e33faaf73c70a4599a86ad46c6d`, before this handoff-only addition).
The regression emits execution timestamp, source SHA-256 values, actual tick/time and measurements.
Independent root review passed 25/25 native/data/producer tests and accepted the explicit
heading-contract reconciliation on 2026-10-20 at 18:35 UTC.
The independent fixture does not import or depend on the separate crew-rescue fixture/change.
The test is registered in the existing `check:ceres-workfleet` CI leaf, reached directly by
`.github/workflows/check.yml` line 104; the existing 256 MiB heap limit is unchanged.

The shared working tree's broader lifecycle test had an unrelated `_drive` mock missing `traffic`
at line 5274; reverting only the spawn reproduced it. The public proposal passes that test.
No unrelated private changes are included: reconstruct only the bounded Ceres patch and new tests
onto the verified public base. Do not publish the entire shared data/package file or local ancestry.

## Exact ownership and continuation

- `src/data/sectorActivityPockets.js`: tender spawn and truthful placement comment only.
- `test/ceres-active-pockets.test.mjs`: explicit heading-contract reconciliation only.
- `test/ceres-tender-clearance-native.test.mjs`: native clearance/steering proof.
- `test/fixtures/ceres-tender-clearance.mjs`: independent production-owner fixture.
- `package.json`: append the focused regression to `check:ceres-workfleet` only.
- This handoff.

Resolve the production hold above, review the exact public delta, then publish a draft PR and verify its
remote parent/tree/changed files. Do not merge or deploy. Existing saves retain their saved poses;
this corrects newly authored spawning and does not relocate established actors on Continue.

### 2026-10-20 19:01 UTC: native collision cause, publication still held

A validation-only immutable-tree prefix trace stops at tick 4583, immediately after the first breaker displacement, rather than changing the production cutoff. At tick 4582 breaker entity 516 collider 2 receives three nonzero native manifold impulses (44435.21484375, 1942.1788330078125 and 83.43347930908203) from entity 547 collider 0. Its expected and commanded linear velocity/force were zero; actual Z velocity becomes 14.5190095901 WU/s. All 90 retained control writes originate from FlightV3 with source `ceres-workfleet`; actual native force agrees. This disproves a competing breaker AI writer at this event. A null owned-control receipt is expected because this existing owner uses generic control writes.

The second bounded identity trace identifies 547 as `ast_common_rock`, mass 2750, radius 15.1190525987, slot `533:shard:0`, `materialFragment/isChunk/fractured=true`, with inherited `killMachineId=furnace_mouth` and `killMachineAnvilId=furnace_mouth_anvil`. This is a Furnace Mouth anvil fragment, not the tender or returning cutter. `environmentMaterials._fracture` is the unique source of that slot shape and imparts the measured 45 WU/s diagonal fragment velocity. Its recorded despawnAt 148.9333333333 minus the producer's 90-second lifetime implies birth at simTime 58.9333333333; a spawn call stack was not captured and this inference is not a native birth receipt.

The original anvil is authored at radius 24/mass 11000, and fracture divides it into four matching fragments. Existing machine shutdown gameplay permits plate destruction; making all anvils immune or suppressing the impact would change gameplay rather than fix a proven controller fault. The candidate-specific upstream causal path to parent 533's fracture still requires investigation. No controller, physics, deadline, or route change has been made. The full production regression remains blocking and the candidate remains unpublished/unaccepted.

Evidence: `first-displacement.log`, `displacement-loader.mjs`, `first-breaker-event.json`, `impact-identity.log`, `impact-identity-loader.mjs`, and `impact-identity.json` in the isolated public validation workspace. These instrument source for logging only and are distinct from the unmodified original-pass/candidate-fail tests.

### 2026-10-20 19:03 UTC: rejected candidate and fixture coverage defect

Full production initialization reveals the focused clearance fixture omitted `environmentalMachinery` and `terrainAnchors`. Consequently its neighboring-collider proof was incomplete. Furnace Mouth's authored anvil center is (-13445.591425871424, 8883.95116397708), only about 9.3 WU from the candidate tender center (-13454, 8880). A validation-only full production seed47 prefix at tick4 measures **38 penetrating tender499/anvil533 collider pairs**, deepest **-10.4742336273 WU** at tender3/anvil6. This query uses the actual native produced bodies without pose edits.

The (-66,68) candidate is therefore rejected: it fixes station penetration but introduces anvil penetration. Do not publish it, weaken the 12000-tick gate, tune recovery around this bad placement, or claim its earlier neighbor test covers the whole production world. The initial causal chain between this overlap and later parent533 fracture is not yet fully recorded, but the initial geometry alone disqualifies the placement. Next action is complete production-producer fixture coverage and geometric feasibility against every nearby authored hull; any corrected staging/route choice needs separate native and ordinary full-production evidence.


### Current integration outcome — 2026-10-27

The rejected 2026-10-20 `(-66,68)` placement and its incomplete fixture remain historical evidence above; that candidate is not being rehabilitated. The newer integration corrects the actual authored actor source and reconciles crew/tender ownership at the common activity writer, including held AI maneuver replay. Native impulses and route ownership remain with their existing authorities; the correction does not teleport established actors or relax collision rules.

The accepted PR470/474 integration has 36 passing focused contracts and passing actual native rescue cases on final production sources for ordinary operation and Continue. The original strict Second Measure native service/return finishes at tick 6929, with minimum native separation +2.308178 WU and zero PulsePlate. This is the strict cell supporting that bounded clearance claim.

A separate station +500 observation returns at tick 7357 after trader contact, with 521 contact ticks, maximum 129 continuous and minimum native separation −7.130128 WU. It is not the strict original cell and does not establish universal clearance. No tolerance or production authority was changed for that observation. The Continue fixture uses scalar restoration followed by resumed Rapier, not exact native-snapshot adoption. These focused/native outcomes do not establish browser readability, performance or whole-world completion.
