# Lantern Ward — G4 hostile gameplay and taste review 1

## Verdict: REJECT

**The candidate has not demonstrated the commissioned experience through ordinary Adventure play.** This review does not approve missing evidence. Native harness success establishes useful mechanical behavior, but the actual player route, save/Continue, unattended outcome, and readable service sequence remain unaccepted.

Review date: 2026-11-04. Worktree: `SpaceFace`, branch `feat/lantern-ward-empty-plinth`. G4 did not modify runtime, stage files, commit, control root's browser, or change any other agent's processes. This is a bounded handoff requested by the integration owner; it records the available evidence without waiting for all engineering to finish.

### Source and evidence scope

The initial design material identifies base `fcc4491ac44162e5e73b5a062ccc37622fe7b9d4`. The later candidate manifest supplied in `evidence/candidate-source.json` identifies base `b431c9b9d297572b00faff828bb152e0a736858f` and capture time `2026-11-04T20:37:41.053280+00:00`. Source changed during review. These are observed provenance values, **not a claim that every inspected line or capture came from that later frozen candidate**. Each source finding below requires reconciliation against the final implementation before closure.

G4 read root and applicable local instructions, `design/program/NOW.md`, `design-review.md`, `implementation.md`, art and story contracts, and the relevant hardware, actor, work, record, catch-up, and test code. G4 visually opened all seven supplementary PNGs in `.devshots/lantern-ward/art/`. Those are actual visual-factory renders, but are not gameplay acceptance. G4 did not complete an independent ordinary-route browser run or author/run an independent hostile test suite before this handoff.

The native nine-test success recorded in `evidence/native-world-life.log` is engineer/root evidence. G4 inspected its test structure and result log; G4 did not independently rerun it. Normal-camera problems and the production autosave failure below were reported by root from root's browser. G4 has **not personally opened the later normal-camera screenshots** and does not present a secondhand camera opinion as an independent visual pass.

## Findings requiring integration action

### G4-01 — Ordinary-world operation and narrow fixture diverged before player intervention

**Severity: acceptance blocker. Evidence: root's actual ordinary-route observation; cause still requires final-candidate reconciliation.**

Root reported that a fresh seed 7402 full Adventure run rendered the new harbor bodies and crew and reached the apron through public input, but the fallen mast had moved approximately 110 world units west before player intervention. The original loaded cradle drifted west and later reached roughly `(-18, +12)` velocity while Nessa remained at the service stand. No successful service route had been demonstrated in that run. A fixture in which the cradle completes the task does not close this discrepancy.

Reproduction already observed by root: start ordinary Adventure in Helios with seed 7402, fly to the Lantern Ward apron, make no Ward attachment or obstruction intervention, and observe the original mast, cradle, lamp and tug over simulation time. Capture body identities, native poses, velocities, owned forces, attachment endpoints and contact pairs at the onset of drift. Do not teleport the objects back for an acceptance recording.

Relevant implementation boundary: `lanternWardWork.js` operates native bodies and forces inside the full production graph. The focused native harness supplies a small subset of systems and two cheek colliders. Existing scenery, collision projections and environmental forces therefore remain material differences. Root subsequently reported the concrete collision root cause that the cradle and receiver's central projected solid OBBs ejected the lamp; those below-flight-plane seat projections were removed while the outer rails and well remained. That fix needs final full-world evidence, not an inference from a smaller fixture. The later full Adventure regression in the native suite is valuable closure evidence for the tested seed and duration, but still does not show the player experience.

Close when: a fresh current-source ordinary run retains a believable loaded cradle and obstruction before interaction, then completes the service through player controls with observable tether, movement, receiver seating, worker contact and departure. Preserve the original identities throughout.

### G4-02 — Production autosave produced a valid envelope with no playable state

**Severity: acceptance blocker. Evidence: root/narrative diagnosis, independently not executed by G4; repair reported in progress.**

Root observed ordinary reload/Continue rejecting an autosave with `Autosave has no playable ship`. Decoding the stored gzip envelope yielded a valid version 23 envelope with `data: {}`; root reported an approximately 137-byte decoded payload and 303-character localStorage value. A schema-valid envelope is not a valid continuation.

Root/narrative identified the precise integration cause: production `counterweightCircuit` persistence wraps `_saveCapturePlan` as a generator, while the autosave path indexed the plan numerically and used `.length`. An iterable without array length resulted in zero captured entries. The manual capture path iterated the plan and did not have that failure. This is a production save bridge contract mismatch; adding Ward fields to a unit roundtrip cannot establish its absence.

Reproduction: fresh full production New Game, await an explicit autosave acknowledgement, decode the actual stored envelope, reload the ordinary application and select Continue. Check the playable ship and original Ward hardware, custody, work state and settled reward. Repeat after interruption during transport and after service/reward settlement.

Close when: the iterable capture normalization fix is present, its actual adapter/Blob-worker regression passes, and an ordinary acknowledged autosave survives reload/Continue with the same original lamp and cradle. Report whether the source used for this reproduction includes that repair. Root's original browser was loaded during incremental integration; a fresh run is required to isolate current behavior.

### G4-03 — Live eligibility checks did not consistently enforce the complete lamp contract

**Severity: high source-level concern. Evidence: inspected source; no executed exploit claim. Recheck after final specialist changes.**

The inspected data validator checked a complete finite lamp manifest: canonical record identity, serial/lot, receiver destination, one electronics item and total quantity one. In the inspected service step, the final live manifest gate checked manifest ID, total one, a single item and quantity one, but did not itself check the item's commodity, lot ID, destination or custody. The live hardware-entity predicate also did not validate the full manifest/custody/vitals contract. Correct tags alone must not become authority for a physically unrelated cargo unit.

Negative reproduction to execute: in the native fixture, retain the canonical record ID and visible lamp serial, but independently replace (a) `electronics` with another commodity, (b) the manifest lot with another family serial, (c) destination with a different receiver, and (d) custody holder/owner with an incompatible pair. Bring the resulting live body through the same physically attended service path. Every variation must refuse to issue a service receipt or award, and must not silently rewrite the invalid unit into a valid original. Run separate variants so one rejection does not mask another missing check.

Required closure: identify one authoritative complete live eligibility predicate used at attachment adoption, service progression and receipt minting; demonstrate negative execution against the final implementation. If an earlier upstream check already makes these states unreachable, document and test that boundary rather than asserting the final gate alone is sufficient.

### G4-04 — Attachment adoption and custody validation had weaker contracts than the original-unit invariant

**Severity: high source-level concern. Evidence: inspected source; no executed exploit claim. Recheck final source.**

In the inspected work implementation, `lineBetween` could adopt a live attachment with the Ward control lease and matching endpoint IDs/generations without checking the attachment definition/mode. `activeLine` similarly established endpoint liveness/generation without checking the required clamp profile. A standard tether and a rigid transport clamp have different mechanical and release behavior; matching endpoints do not make them interchangeable.

In the inspected custody retention helper, maintenance part attachment IDs only needed to be strings, allowing an empty string; lamp/cradle retention accepted several holder/load/owner combinations without a full cross-check of holder against owner and role. Actor retention was weaker than actor spawn validation and did not validate finite pose/vitals or the invalid-record marker. These are consistency gaps in the inspected helper contracts; they are not proof of a duplicate that G4 actually spawned.

Negative reproduction to execute: create an attachment with the correct control lease and endpoint IDs/generations but the wrong definition; attempt to progress service. Separately serialize empty attachment IDs and contradictory holder/owner/load serial combinations. Release the authentic clamp, replace an endpoint entity with a reused ID and new generation, pause, and cross the sector boundary. Require explicit rejection or interruption, no authority from the stale line, no reminted lamp, and no reward.

Required closure: attachment definition/mode and complete custody relationships must be checked at the authority boundary. Preserve generation tests already present in the native and narrative suites; extend them to the wrong-profile and contradictory-custody cases rather than merely repeating the happy path.

### G4-05 — Malformed record recovery needs a persistent absence/tombstone proof

**Severity: medium source-level concern. Evidence: inspected source; consequence not independently reproduced.**

The inspected `normalizeRecord` returned null for a nonfinite/missing raw X/Z position before the Ward-specific invalid marker was attached. Other malformed Ward fields were retained with `extra.lanternWardInvalid`, preventing generic defaults from repairing them into spawnable records. These two paths differ. The persistent `spawned`/`lost` state may correctly prevent replacement after a dropped record, but that needs an explicit cross-layer test.

Negative reproduction to execute: save an original lamp with invalid or missing raw position, then normalize the world record and restore both world records and Ward state. Run enough ticks for spawn reconciliation and transition out of/into the sector. Test with the real saved Ward state and with a malformed/legacy Ward substate. The invariant is one original or an explicit missing-original outcome; never a fresh replacement, reconstructed completed service or reward.

A related consistency check is required for noncanonical `maxHull`: the inspected record validator allowed arbitrary positive maxima while spawn used canonical maxima. Ensure a valid accepted record cannot restore an over-max hull or acquire unintended repair eligibility through this normalization.

## Acceptance evidence still missing

All entries below remain **INCOMPLETE**, not passes. Parent implementation tests are useful supporting evidence and should be retained, but do not substitute for the requested player journey.

| Commission / failure path | Evidence required to close |
| --- | --- |
| Ordinary Adventure discovery | Fresh public-input approach from the normal launch, showing the existing Candle Fleet memorial and the work pocket in the same spatial context. |
| Help by clearing | Player releases/moves the actual obstruction, Nessa transports the original lamp, seats it in the separate receiver, visibly works, then leaves with an empty cradle. |
| Help by carrying | Player takes the loaded articulated cradle through the usable bypass while the cut stays blocked; original lamp remains loaded; Nessa can recover and service it. |
| Wrong direction | The visibly inviting route and actual passable direction agree. A failed turn produces a comprehensible physical obstruction rather than an invisible wall or ambiguous arrow. |
| Ignore | An unattended run long enough for the actual ignore threshold shows Nessa's own real clearing/route/work outcome, no fabricated cargo or player credit, and continued harbor activity. |
| Theft and return | Separate lamp and cradle theft, pursuit/custody, return/recovery, and repeated interaction after receipt all preserve identity and permit at most one reward. |
| Damage and missing original | Damage interrupts work; repair consumes actual available material once; absent/destroyed original remains missing across Continue/sector re-entry without reminting. |
| Pause / release / sector | Native physics and progression stop/interrupt coherently, release preserves plausible motion, threshold crossings do not retain stale physical authority. A direct call with unchanged simulation tick is insufficient to prove the full application pause. |
| Traffic jam | The commuter visibly yields to actual nearby obstruction and resumes actual travel/berthing/departure after clearance. No permanent yield loop, teleport or departure counter without movement. |
| Maintenance after interference | The real original bearing reaches the service face. Stealing or destroying it after a completed maintenance cycle cannot leave convincing repeated repair animation with no part/contact. |
| Continue / exact reward | Actual acknowledged production autosave and ordinary Continue before/during/after service, including already settled reward. Same original bodies, no double payment, no fresh service authority from a saved receipt. |
| Memorial | Exactly 24 lit memorial lamps plus the dark 25th remain intact and legible before and after all outcomes. The separate family lamp must not turn into a memorial replacement. |
| Normal-camera readability | The pocket, loaded cradle, separate receiver, worker hand/tool contact and intended exit are readable at normal gameplay zoom and camera. Source factories and wide beauty shots do not close this. |

## Taste and geometry observations from evidence personally viewed

The isolated assets communicate a credible civic maintenance vocabulary. The teal and cream cradle has open prongs, rails, engines and tow features; the orange family globe remains distinct. The helmeted worker's boots, cable and contact point read as purposeful in the close factory render. The receiver is a separate dark L-shaped object with three posts. Its approach direction is less immediately obvious than the cradle's open mouth; it needs a real approach shot with the player ship and moving rig to establish the intended action.

The proposed cut has an intelligible physical premise: a clear span of about 84 world units obstructed by a mast about 58 units long leaves approximately 13 units per side. That is narrower than the starter hull's approximately 28-unit diameter. A player can therefore learn why the apparent shortcut fails, provided the collider and visible silhouette agree. The bypass must remain passable for the entire loaded articulated rig, including its turning envelope; point clearance for the tug alone is not enough.

The cradle and receiver seating correction reported by root matters aesthetically as well as mechanically. An open well that behaves like a solid slab teaches the player to distrust the scene. Once that projection is removed, the remaining rails still need to catch and release the lamp as their visible geometry suggests.

The seven factory images do not contain the full ordinary-flight context, live service sequence, memorial count, commuter motion or player input. They cannot establish that the district feels inhabited. The normal route must show bodies doing work and making room for each other; a lamp icon and a countdown would not meet the commission.

Root reports that the later overhead shot near player `(1590, -566)` is occluded by an existing tall blue tower/scaffold, while the default chase apron shot gives a more readable view of the platforms. This is a **secondhand reported camera problem**, not a personal image inspection. G4 therefore withholds normal-camera visual acceptance. Check whether camera choice is freely available and useful during the actual work, rather than depending on a special reviewer camera to find the scene.

## Test assessment and handoff

The inspected native suite covers actual Rapier transfer, damage/repair, Massline bypass carriage, malformed hardware, commuter travel, recycled generation, missing originals, duplicate ticks and a full Adventure geography regression. The later nine-pass log is strong supporting evidence for those exact scenarios. Its focused fixtures and direct state placement remain different from the normal player journey. The narrative reward tests also exercise reentrancy and failures around settlement, which is the right class of test for one payment; they do not by themselves verify the production save bridge.

G4 created no optional test file. Proposed negatives above are **test prescriptions**, not results. G4 provides no invented runtime counters, timings, screenshots or approvals. There is no G4-owned running check to terminate or collect.

### Repair priority

1. Close the production save bridge and ordinary-world drift/ejection regressions with fresh-source evidence.
2. Reconcile the live manifest, clamp-profile and custody predicates; execute the malformed and generation negatives against the final candidate.
3. Record the ordinary clear or carry service route, interrupted Continue, theft/recovery and actual ignore outcome with the original lamp.
4. Obtain fresh independent ordinary-camera and gameplay review. This report contributes **zero approvals** to the required successive approval count.

**Final G4 decision: REJECT — materially incomplete gameplay and Continue acceptance, with the inspected authority-contract concerns requiring final-candidate verification.**

## G5 bounded repair-verification addendum — 2026-11-04

**Bounded repair result: PASS for the independently executed checks below. G4-03, G4-04 and G4-05 are closed for the inspected repair snapshot. Overall commissioned-experience verdict remains REJECT because this verification does not supply the outstanding ordinary-player service and visual acceptance.** This addendum supersedes the earlier status of those three source findings; it preserves the original report as the record of what was known at its handoff.

### Independence, source and execution

The same independent reviewer executed the requested commands directly in the shared checkout, inspected the repaired authority boundaries and the selected tests, and read `evidence/public-auto-continue.json`. The reviewer made no source changes and appended only this addendum. No browser run, new screenshot, nested delegation or broad visual approval formed part of this bounded task.

Checkout HEAD was `37ee2378c5de485cd976f3a5f8cb50d3afb42401`. Hardware, work, world-record and test repairs were present as working-tree changes, so HEAD alone does not identify the tested candidate. The following SHA-256 values identify the inspected post-run snapshot, captured at approximately **2026-11-04 21:06:40 UTC**:

| Path | SHA-256 |
| --- | --- |
| `src/data/lanternWardHardware.js` | `398a673f0de7a16ac654736171ffc83fcc1f78bbcd4fc8d88c45d5dddd1e825c` |
| `src/systems/lanternWardWork.js` | `535e7a2d424699af7ef1260b6343e3e0fcd5dd8609b92478b9d36f15042ac9d9` |
| `src/world/worldRecords.js` | `698830b9c4e565092214912edbe78b09aa57d9bd4532499dc83738e1921cf0d7` |
| `test/lantern-ward-authority.test.mjs` | `eeea2e84a5ebd1d59f61cc9954ecfed82a7ef41d87e5b200293fdb3f9b10c464` |
| `test/lantern-ward-save.test.mjs` | `b40517c5143bb4741758ae3f818436cca5b95a5ea897249643deb6c82a4e112f` |
| `test/m2-world-records.test.mjs` | `f0313246a3d82ab5ff79fa91a0ff9f18735686cb48b7e79f1ceefd05f3a5d024` |
| `test/world-catchup-bounded-angle.test.mjs` | `58345dffa30efd68d5cb756d2d4be356f115611458f73dd58322c6b74480f965` |
| `test/lantern-ward-world-life.test.mjs` | `dfc58c5a4d3bb47e2bf7741d6d7eb6af723c792f630bd85785c6a96ece1fec29` |

Executed command:

```sh
node --test test/lantern-ward-authority.test.mjs test/lantern-ward-save.test.mjs test/m2-world-records.test.mjs test/world-catchup-bounded-angle.test.mjs
```

**Result: exit 0; 40 tests passed, 0 failed, 0 cancelled, 0 skipped; reported duration 3868.821311 ms.** This includes the nine new authority cases, Ward save coverage and the existing world-record/catch-up checks. The two native authority cases exercised production-order physics/combat/work ownership, including actual spawn reconciliation and live original service.

Executed command:

```sh
node --test --test-name-pattern='a mast moved only halfway|removing the installed original bearing' test/lantern-ward-world-life.test.mjs
```

**Result: exit 0; 2 selected tests passed, 0 failed, 0 cancelled, 0 skipped; reported duration 4418.185639 ms.** The full world-life suite was not rerun in this addendum. These 42 passes are this reviewer's direct results, distinct from the earlier engineer/root nine-pass result.

### Reconciliation of G4-03 — CLOSED for this snapshot

`isLanternWardWorkpieceEligible` in `src/data/lanternWardHardware.js` now validates the workpiece's exact identity and recipe, physical custody owner, home provenance, finite pose/motion, canonical hull maximum, living hull, complete manifest and coherent custody. The manifest includes serial/lot, correct destination, exactly one line of the correct commodity with quantity one, total quantity one and a holder matching physical custody. The inexpensive identity-only predicate remains useful for capturing a corrupted original into an unavailable record; it is no longer the service authority predicate.

In `src/systems/lanternWardWork.js`, `eligibleEndpoint` guards attachment adoption, `stepLanternWard` rejects ineligible lamp progression, and `commitService` plus `lanternWardCompletionReceipt` revalidate the complete live workpiece. Native body ownership, entity object identity, generation and installed clamp remain additional requirements. Relevant inspected symbols are `eligibleEndpoint`, `lineBetween`, `stepLanternWard`, `commitService` and `lanternWardCompletionReceipt`.

Independent execution confirmed that each of 14 distinct manifest/custody/recipe/vitals/motion mutations is rejected for both lamp and maintenance bearing; invalid originals still retain a durable identity and cannot heal through record normalization. The native service case first brings the original lamp to an attended `connect` phase, applies ten independent manifest/custody substitutions, and verifies zero progress, zero service events and no authorized receipt. After restoring legitimate state, service commits once. The same substitutions then invalidate receipt access without issuing another event. This directly closes the original incomplete-live-manifest concern rather than relying solely on a serialization test.

### Reconciliation of G4-04 — CLOSED for this snapshot

`activeLine` now requires the expected attachment definition for its role, the exact Ward control mode, valid workpiece endpoints and current occupant generations. `lineBetween` applies those checks before adopting an existing attachment and requires native endpoints before creating a replacement. Clearing and maintenance towing use `tether_standard`; load, installed lamp and maintenance-seat work use `attachment_transport_clamp`.

The authority suite independently rejected empty and whitespace-only attachment IDs, inactive clamps, incorrect owners/targets, wrong definition/mode, loose-body clamp claims and inconsistent loaded-cradle records. Actor catch-up custody rejected nonfinite pose/motion, dead or over-max hull, invalid-record markers, wrong ship/provenance and absent work lease. Valid movable stolen originals preserved their Helios provenance through save/restore in another canonical sector; fixed civic sockets could not acquire a foreign location.

The native service test also broke the authentic receiver link and supplied a wrong-definition or wrong-control-mode link. It denied replacement creation to isolate the invalid candidate, then observed zero work, no service event and no receipt. When the ordinary attachment API refused a receiver-sourced standard tether, the test explicitly fault-injected the descriptor of an accepted native clamp; that portion establishes rejection of a corrupted descriptor and is not a claim that the ordinary API permits that tether. Legitimate service resumed afterward and committed once.

The record validator intentionally permits absent definition/mode fields on older version-1 saved custody descriptors. That compatibility is bounded by mandatory exact live definition/mode/generation checks before service authority. This repair verification does not convert the original report's broader public pause/release/Continue journey into an accepted gameplay result.

### Reconciliation of G4-05 — CLOSED for this snapshot

`normalizeRecord` in `src/world/worldRecords.js` now preserves the occupied Ward identity for malformed or null ledger entries, contradictory record IDs and missing/nonfinite positions. It sets `extra.lanternWardInvalid`; repeated normalization retains a permanent unavailable row. Its placeholder position is never admitted as a spawn location. `recordShouldRematerialize` rejects invalid Ward hardware and actors before the generic enemy shortcut, and `spawnSpecFromRecord` enforces the Ward-specific recipe boundary. Hardware vitals require the canonical hull maximum and a living hull at or below that maximum.

The independent authority suite covered three normalization/serialization passes, null/array/scalar ledger values, invalid pose and identity fields, and the actual world-owner rematerialization loop. The native reconciliation case restored malformed originals with valid remembered Ward state, absent legacy state and malformed state, then performed sector exit/return and a second save/restore visit. It produced no replacement lamp, installation or authorized receipt. The unrelated generic-record control retained its existing behavior. These results close both the persistent-absence concern and the noncanonical-hull inconsistency raised in G4-05.

### Targeted physical repairs — independently passed

**Downstream mast clearance:** the selected test moves the real mast using physics impulses to X between 1815 and 1835, beyond the former single-point clearance gate. Work still reports the route blocked, emits no service event and keeps the loaded cradle within two world units of its authored waiting position. Source inspection confirms `clearCutLane` checks both the entry-to-exit segment and the segment onward to the receiver against the mast's current native orientation and swept clearance. A partially shifted obstruction no longer counts as a clear procession route in this case.

**Bearing removal:** the selected test first completes the real bearing installation, then attaches a player tether and reels that same part more than 25 world units from the service face. The repaired flag clears, custody becomes loose, worker-present remains false during the displaced interval, history still records the prior one service, and exactly one original bearing remains alive. This closes the demonstrated false maintenance-after-removal behavior. The selected test exercises removal and interruption; it does not execute a subsequent player return/reinstallation.

Source inspection also confirms that an unavailable native load clamp leaves the tug waiting beside the original load instead of authorizing the empty service route. Root's separate fresh full-Adventure seed-7404 report that the original tug/cradle/mast remained coherent through 90 seconds is useful supplied diagnostic evidence; this reviewer did not independently execute that full boot during this bounded task.

### G4-02 update — supplied public Auto/Continue evidence inspected

`evidence/public-auto-continue.json` has SHA-256 `e6381c7b1c806fcef4e188eb23ba1aef4f6f00730d363c5dad4576f43e439312`. It identifies source commit `37ee2378`, seed 7404, and public reload followed by menu Continue from an acknowledged Auto slot. It records mode `flight`, simulation time approximately 415.17 seconds, 5000 credits and a version-23 autosave of length 633995 with **109 sections**. This is concrete supplied evidence that the repaired production path can save nonempty playable state and return to flight, addressing the original `data: {}` failure. The reviewer inspected the artifact but did not witness its browser execution.

The resulting state preserves the named lamp serial and loaded cradle with their shared clamp identity. It also explicitly records Ward phase `missing`, the tug's permanent record as `alive: false` / `outcome: destroyed`, the tug's object ledger as lost, zero installations and no completion receipt. The evidence therefore supports continued play with a disrupted operation and persisted absence. It does not establish successful installation, payment after installation, or the later authority repairs. The cause of that tug loss is not established by the JSON, and the artifact is not evidence that the final candidate still reproduces the earlier drift.

### Camera-caption correction

The old filename `evidence/02-continued-overhead-occlusion.png` is misleading. Root supplied the correction that the displayed button reads **Chase**. Inspection of `src/ui/racingHud.js` confirms that this button labels the **current** resolved view (`racing` becomes `Chase`, otherwise `Overhead`), rather than the view that a click would select. That capture must therefore be described as **Chase**, and any earlier attribution of its occlusion specifically to Overhead is withdrawn. The filename is preserved here; no image or earlier report text was modified. This is a source/UI-label correction using the supplied capture description, not a new independent image inspection or a visual pass.

### Remaining decision

No remaining concrete authority defect was reproduced in the bounded G4-03/04/05 checks. The original source concerns are closed for the snapshot identified above and should not be carried forward as unfixed allegations. The downstream-clearance and removed-bearing regressions also pass independently.

**Overall REJECT remains:** this addendum does not supply an ordinary-input successful service route, the complete outcome/reward journey across production Continue, or normal-camera visual acceptance. The worker-to-presentation Ward-phase bridge is a separately reported repair in another owner's paths and was outside this verification. This result contributes **zero broad gameplay/visual approvals**. Both executed test processes completed successfully; no reviewer-owned test or browser session remains running.

## Final independent visual addendum — c1ed45d8 handoff

**Visual verdict: REJECT.** The wider ordinary-flight frame makes an obstructed service cut inferable. It does **not** make the complete initial relationship—Nessa, a loaded mobile cradle, its separate destination, and a usable carry-around alternative—unambiguous enough to approve. This is a direct pixel assessment of the three requested gameplay images, not an inference from the asset factories or implementation. The specific failures are readable-object identity, visual hierarchy and explanation of the alternative through the scene.

### Evidence personally opened

Review date: 2026-11-04. The reviewer opened all three PNGs at their original 1280 × 800 resolution. The current-view button visibly reads **Overhead in all three**; the earlier Chase/Overhead caption mistake does not apply to these frames.

| Capture under `evidence/` | Provenance and scope | SHA-256 |
| --- | --- | --- |
| `03-public-apron-arrival.png` | Root's ordinary public-flight approach on `27f618f3`; apron objective is 17 units away in the image. | `47d524b5880bd0df3653fb40e57e96906a5828d15da8c9c2cae34c9f1013babb` |
| `04-public-blocked-work-pocket.png` | Root's wider ordinary view on `27f618f3`, using public minus-key zoom out; the image shows the apron objective 73 units away. This is an available gameplay view, not a factory render. | `1c97fb11cc3c0aa786e8d12e9960594b5a217309d4f273c57c830621f6391b51` |
| `hostile-2-7405-final-overhead.png` | R2's ordinary Overhead view after public Auto Continue on `a13223fa`; this is the supplied default-zoom western view after installation. | `af7f054cf0116057a74b7a0ed820861e95bab59c3476ac8b5e6f45d150e1f789` |

Current checkout HEAD was independently read as `c1ed45d81e79f6ddb14352609cd31e369d9b8e57`. These are predecessor-candidate captures. Root states that relevant geometry/camera remained unchanged from `27f618f3` through the final handoff, with generic payload exclusion already present at `27f618f3` and the inherited rescue-beacon scale subsequently repaired. R2's `hostile-2-source-final-7405.json` and `hostile-2-final-continue-7405.json` identify the final image's actual `a13223fa` source boundary. This review does not relabel any image as a fresh render of `c1ed45d8`.

The reviewer performed no browser operation, test run, implementation edit or process intervention for this visual check. Read-only layout/art and HUD source inspection was used to identify likely causes after looking at the images; it does not count as visual proof.

### What each image actually communicates

**03 — arrival has a location, but the work relationship is not established.** The apron navigation text and ordinary flight HUD establish a reachable destination. The teal/cream and orange/cyan objects give the area a consistent industrial character. However, the central ship, larger bright silhouettes, traffic alert and station incident card attract attention before any household service relationship. Portions of the nearby structure extend into the lower-left HUD/crop. The `MASS 120 · HEAVY HAUL` marker tells me that a substantial object is selectable; the scene does not let me confidently identify the original lamp in a mobile cradle, locate its separate receiving socket and connect either one to Nessa. I would need earlier instructions or a different view to supply that interpretation.

**04 — a real improvement in spatial context, with only partial task readability.** Two substantial teal/cream square shoulders are visible above and below a narrow beam near the center-left. The heavy-haul selection marker sits on that beam. The pairing and transverse obstruction are enough to infer a blocked passage rather than an arbitrary isolated obstacle. There is also visible open space around the shoulders, so the frame does not suggest a fully sealed corridor. This is useful initial-scene evidence and should be retained.

The failure is the connection from that obstruction to the job. The smaller blue/dark components and orange/cyan cluster to its right do not resolve into an unmistakable loaded carrier, original globe, operator and separate receiving cup. The cradle's cargo well and retained load cannot be read confidently as two physical objects at this framing. I cannot point out the intended receiver and its entry face without relying on the authored layout. The open outside space establishes room to maneuver, but it does not visually establish a continuous route for the **loaded** carrier around the shoulder and back to a recognizable destination. A player can infer “move this heavy beam” more readily than “borrow this particular loaded platform and carry it around.” That second option remains supplied by knowledge of the design rather than explained by these pixels.

The larger gate pieces retain broad, recognizable color blocks after zooming out; the task-defining smaller parts lose silhouette and material separation. Their dark blue edges sit close to the background value, while speckled orange/cyan highlights, star points and larger nearby objects compete for attention. Zooming out improves the geometry overview while reducing the information needed to identify the load and destination. The image also includes `Mayday.` and apron navigation, but no visible local wording that resolves which body is Nessa's current workpiece. This observation does not require replacing the scene with labels: the physical relationship itself needs to survive the usable camera scale.

**R2 final Overhead — completion is not visually self-explanatory in this frame.** This image contains a large warm/cyan silhouette above the center, an overlapping colorful cluster near the center, a selected small yellow object, separate rectangular pieces and a large teal structure below. The source site's one-cargo/two-seats relationship remains difficult to reconstruct. I cannot confidently identify a now-empty cradle separately from an occupied receiver, or see a worker/contact relationship in this still. The selected `MASS 9 · SWINGS LOOSE` text is clear; a completed household installation is not equally clear. A still cannot establish the preceding transfer, articulation, work motion or departure.

### Actionable visual findings

| Finding | Observable failure | Root and repair target |
| --- | --- | --- |
| **V1 — Initial load-to-destination relationship is unreadable** | 03 does not show the useful relationship; 04 shows the gate better but does not unambiguously distinguish loaded cradle, lamp and separate receiver. | The current framing and scale preserve large shoulders more effectively than the small task objects. Improve the value/silhouette separation of the carrier, retained globe and receiving cup, and their orientation relative to ordinary arrival. Keep all parts of the causal relationship readable in one available gameplay view. Merely knowing their source coordinates does not close this. |
| **V2 — Carry-around alternative is not explained by the scene** | Open space can be seen around the gate, but the visible objects do not establish which loaded rig should take it or where that route rejoins the service destination. | The alternative needs a recognizable loaded carrier, a visible destination and a continuous outside route with enough apparent room for the rig. Connect those through ordinary framing and environmental cues. The authored bypass coordinates and a mechanical carry test are supporting evidence for feasibility, not evidence that this frame communicates the choice. |
| **V3 — Installed state has an ambiguous interaction cue** | The post-Continue frame prominently says `MASS 9 · SWINGS LOOSE`, while the associated supplied state says the Ward operation is installed. | `massPreviewRead` in `src/ui/masslineHud.js` chooses this phrase from the target/player mass ratio; it is a generic handling preview and does not inspect installed custody. This is **not evidence that the lamp is actually loose**. It is a semantic presentation conflict when the phrase is the clearest text on a completed installation. Make the physical installed state and any necessary local state cue clear enough that the mass preview cannot be mistaken for custody status. |

Read-only `lanternWardLayout.js` inspection confirms that the design intends a distinct cradle, a separate lamp, a separate receiver and an outside bypass. The art contract describes retained jaws, an open cargo well and a household installation. Those contracts identify what should be visible; they do not rebut the failures above. I cannot determine from these PNGs whether the speckled/soft edge appearance originates in shading, post-processing, temporal reconstruction or the capture host, and I do not assign an unverified renderer root cause or performance defect.

### Updated gameplay status and final scope

The earlier report's absence of successful ordinary-route evidence is now superseded by **supplied R2 evidence**. Root reports that R2 performed the real ram-clear, service, payment and both Quick/Auto Continue. The independently read final-Continue artifact records flight, phase `installed`, `playerCleared: true`, 5180 credits and a settled 180-credit receipt. This visual review acknowledges that progress. It does not reopen the three authority findings closed by the independent 42-check verification, nor infer a new custody or payment regression from a confusing image.

The remaining visual objection is narrower and concrete: **04 exposes a plausible blocked cut, but the initial loaded-work relationship and its carry alternative still do not read clearly; the final frame does not make the completed physical arrangement self-evident.** A later visual closure should show those relationships through the same ordinary controls and camera options used by the player, with distinct load, carrier and destination silhouettes and an understandable outside route. No new capture is claimed or requested from the currently blocked browser session in this handoff.

**Final independent visual decision: REJECT. Zero visual approvals.** Only this report was appended; no other file or process was changed.

## Cue-pass ordinary-flight review — 7f24ddfe, seed 7407

**Verdict: REJECT, with a visible improvement in carrier recognition and district geography.** The new frames give the carrier, load area and adjacent tug substantially clearer silhouettes. They still do not establish a reliable visual match between that loaded carrier and its separate receiver. During this review root identified a material runtime explanation: the generic payload presentation owner was applying off-axis tumble to the Ward hardware after its physical pose had been established. That diagnosis strengthens the rejection and changes the immediate repair target to the late-render motion owner. It is not a reason to waive the failed gameplay images or demand another round of decorative changes before the pose is corrected.

### Capture provenance and limits

The reviewer independently opened the following original 1280 × 800 PNGs. Each visibly labels its current view **Overhead**. Checkout HEAD was independently read as `7f24ddfe741e3b78a0ffd7fe9789b8fba8d3d934` during this review, approximately 2026-11-04 22:36 UTC.

| Capture under `evidence/` | SHA-256 |
| --- | --- |
| `05-public-cue-approach-7407.png` | `21f6971a80b98e61d03320058b0a9954d4c5c452c0e504963241628be24b77c6` |
| `06-public-cue-workcourt-7407.png` | `c1fd9f46e2bf4ad78a52014a4aa5e2488f91e33c67e31c644450250de58a7d0e` |
| `07-public-cue-service-7407.png` | `0892eb280eba8a4d0603fd7f881d729004fe723b0dec1dac65df6dba5d4bbfc1` |

Root supplied this route provenance: fresh seed 7407; Balanced settings, full motion and audio; no debug flags or pose changes; public map navigation to the apron, followed by ordinary A/D/W/S flight and public minus-key zoom to 232. The later viewing position was approximately `(1741, -711)`, with cradle/lamp around `(1769, -650)` and the receiver at `(1830, -695)`. These are supplied runtime coordinates, not positions reconstructed by this reviewer from the pixels.

**These are loaded-transit views.** The `service` filename of 07 means a view of the operation, not a completed installation. Root also reports that the mast had already moved physically to approximately `(6320, 394)` by arrival. Consequently, none of 05–07 is accepted as an initial-blockage frame, a demonstration of the untouched cut, or an installed-state frame. The cause of that mast displacement was outside this visual review. The visible ring at the bottom of 07 is the canonical Candle Fleet, not a newly added family-lamp array.

### New cues: what improved in the actual pixels

**05 — clearer surfaces, but arrival still crops the useful relationship.** The central ship and large teal/cream structural panel are substantially more sharply separated from the background than in the earlier captures. The carrier-like assembly near the lower left has recognizable mechanical structure, but much of that work area lies behind the flight HUD or near the frame edge. This arrival does not yet provide a complete carrier-to-destination view. The visible Candle Fleet discovery text gives geographical context without establishing the specific household job.

**06 — the strongest improvement in recognizing the carrier and nearby tug.** The platform to the left of the player now has a visible open frame, a round load area with a raised central component, an exposed forward rail and broad yellow/brass markings. An adjacent elongated tug is visibly a separate body rather than being lost in the same colored cluster. This is meaningful progress: the image supports a small working rig with a load more readily than the earlier 04 did. The broad rail markings survive the gameplay scale, although I cannot confidently trace an identical family mark on the carried unit and a separate receiver in this frame. They still read primarily as visible industrial striping until the matching destination is identifiable.

The larger service-cheek surfaces are less visually busy, and the broader working court contains appreciable open maneuvering space. However, the receiving cup remains unresolved among the small, dark or edge-on structures. A clear nearby rig plus an unidentified endpoint is insufficient to explain where the finite load is going. The appearance of the `MASS 9 · SWINGS LOOSE` selection elsewhere in the frame does not identify that object as the carried family lamp, and I do not assume that identity from its mass alone.

**07 — the district reads better, while the working faces become less reliable.** The selected `MASS 54 · HEAVY HAUL` carrier and the nearby tug can be located in the upper-left part of the frame. Much of the carrier is now presented narrowly or edge-on, reducing the readability of its cargo well and matching mark. I still cannot confidently point out the separate receiving cup from the pixels without importing the provided world coordinates.

The canonical Candle Fleet foreground is clear: large glowing globes on repeated pedestals form a recognizable curved memorial structure, with the smaller work court beyond it. This is a stronger piece of district geography than the earlier captures. It establishes that the work is near an existing place with its own spatial identity. Only part of the ring is shown, so this is not a count verification of 24 lit plus the dark 25th. The larger teal gate shoulders and the surrounding open space also read as physical boundaries, but the displaced mast means the original clear-versus-carry problem is absent from this sequence.

These are observations of the new captures. The earlier shots used different circumstances/presentation settings, so the entire improvement in image clarity is not attributed quantitatively to the three-stroke cue patch.

### V4 — Runtime presentation rotates physically oriented Ward bodies off-axis

**Material visual defect; exact runtime measurements supplied by root, source mechanism independently inspected.** While viewing 07, root reported a read-only root-transform diagnostic at tick 37453:

| Body | Supplied physical/render observation |
| --- | --- |
| Receiver | Entity `rot` was `0`, while render-root rotations were approximately `x = 8.5347`, `z = -6.2016`. |
| Cradle | Render-root rotations were approximately `x = -6.983`, `z = -6.849`. |
| Lamp | Render-root rotations were approximately `x = -13.707`, `z = 15.286`. |

The reviewer did not execute that diagnostic and does not claim an independent runtime transform measurement. Read-only inspection did locate the relevant generic mechanism in `src/render/ordnanceMotionPresentation.js`: the payload configuration assigns a tumble rate, the presentation loop accumulates off-axis angles, and the late mesh update writes `mesh.rotation.x` and `mesh.rotation.z`. Its stated pose contract leaves those axes to this tracker while the snapshot fence owns position and Y rotation. Root identified Ward cradle, lamp, receiver and service-face payloads as being admitted into that generic treatment.

This supplied diagnosis is consistent with the failed pixels: surfaces carrying the family marks and the receiving cup can turn away, become edge-on or present a dark underside even while the physical job operates in the intended flight plane. A larger mark on a top face cannot establish a dependable visual match if another presentation owner subsequently turns that face away. Earlier isolated factory/top-view checks did not exercise this later mutation in the ordinary render sequence.

The immediate closure target is the already commissioned narrow motion-owner repair, preserving the physical pose and intended local articulation of these authored bodies. **No approval follows from the source fix or a factory rerender alone.** A new ordinary-flight frame after the late presentation pass must show the loaded carrier and the empty receiving cup in a coherent relationship. The present reviewer did not alter that owner, reset any pose, open a browser or run a test.

### Status of the earlier visual findings

| Finding | Updated status from 05–07 |
| --- | --- |
| **V1 — Load-to-destination relationship** | **Improved but OPEN.** Carrier/load-area and tug recognition are better in 06. The complete match to the separate receiver is still unreadable, and the off-axis presentation defect makes the exposed working faces unreliable. |
| **V2 — Initial cut and carry-around alternative** | **Not re-established by this sequence.** The mast is already displaced. Open court space and the memorial's relationship to the ward are clearer, but an original blockage and a continuous loaded-carry alternative are not demonstrated here. This is an evidence limit, not a claim that the physical bypass is impossible. |
| **V3 — Installed-state presentation** | **Not assessed by these transit frames.** The operation is not installed in them. No new custody conflict is inferred from a generic mass preview, and no installed-state approval is added. |
| **V4 — Late off-axis rotation** | **OPEN; repair assigned separately.** Source inspection supports root's supplied runtime diagnosis. Fresh ordinary-flight pixels after that repair are required for visual reassessment. |

The previous authority closures, independent 42-check result and supplied R2 service/reward/Continue success remain recorded. This visual follow-up neither reran those checks nor reopens them.

**Final cue-pass decision: REJECT.** The carrier cues and memorial geography are visibly stronger, but the final rendered operation still fails to make its load-to-receiver relationship dependable. The existing rejection remains intact while the late-render pose defect is repaired. This turn appended only this report; no browser, process, test or implementation file was changed.

## Post-motion repair checkpoint — 95a775e, captures 09–12

**Visual verdict on 09–12: REJECT for insufficient unobstructed composition. The diagnosed cradle/lamp/receiver pitch-and-roll mismatch has supporting closure evidence at the recorded live checkpoint and is not carried forward as an observed current defect.** The installation and credit evidence is materially stronger than before; the remaining failure of these four images is their framing or overlay coverage, not a demonstrated continuation of the tumble bug.

The reviewer personally opened all four original 1280 × 800 gameplay PNGs and read `evidence/post-motion-public-continue-7407.json` and `evidence/post-motion-source-7407.json`. The latter records runtime `95a775e283a3936523b0db493ac2a4e4eb67fdc4`, source tree `bf509818d6a098e03d66b53ada2b9568a06c1f2f`, and a source snapshot before the public Quick Continue input. Checkout HEAD during review was `dee4757cfaba8e069a6f270fa80c8199aa9f06f2`; root identifies that later commit as adding a commuter test. The screenshots and runtime artifact remain attributed to the source actually loaded, 95a775e. No browser, test, runtime edit or independent transform diagnostic was performed by this reviewer.

### Source-specific supplied runtime evidence

The Continue artifact describes public reload, Load Game, the Quick slot and Load confirmation, without hidden flags or simulation mutation. Root identifies the resumed seed-7407 save as the earlier approximately 557-second service-route jam. At tick 37703 the recorded phase is `installed`:

| Recorded object/outcome | Evidence in the supplied artifact |
| --- | --- |
| Original lamp | ID 603, record `lantern-ward:lamp`, serial `venn-family-lamp:01`, holder `receiver`, hull 90, lit, at approximately `(1829.987, -695.004)`. |
| Receiver | ID 604, record `lantern-ward:receiver`, at `(1830, -695)`, hull 1400, lit. |
| Cradle | ID 602, record `lantern-ward:cradle`, at approximately `(1829.985, -649.990)`, hull 280, holder `ward`; root reports the hold is now empty. |
| Late render pose | Cradle, lamp and receiver each record pitch `0`, roll `0` and scale `[1, 1, 1]`. These are actual supplied runtime readings after the motion repair, not factory values. |
| Other movement | Tug 608 is recorded west of the work court and interpreted as returning after service; commuter 609 is recorded away from the earlier jam and interpreted as moving again. The still images do not independently establish those trajectories. |
| Player credit | Credits remain 5000 at tick 37828; player-clear/carry/repair help flags are false and the reward journal is absent. This is supplied evidence of crew completion without awarding the player help credit. |

The artifact also has `history.ignored: false`. Therefore this result is **not** labeled a completed timed-ignore branch. It supports autonomous completion of this resumed operation without player-help payment. The supplied JSON is a transcription of selected exact read-only values, not a complete raw browser reply or an independently witnessed replay by this reviewer.

### Pixel assessment of 09–12

| Capture under `evidence/` | Directly observed result | SHA-256 |
| --- | --- | --- |
| `09-public-native-pose-continue-7407.png` | A dark red damage/intercept presentation covers the flight view. The memorial and surrounding geometry remain faintly visible, but the service relationship cannot be assessed reliably. | `955458439b32c0b9f8ae86111a47249580bff83e66eb7745caffea2c70fd45af` |
| `10-public-installed-native-pose-7407.png` | The ship-loss screen dominates the image, explicitly showing destruction by a Solar Concord Navy ship and a 500-credit recovery cost. Despite the filename, this is not an installed-scene acceptance view. | `c6fee0966148e6d75de1e845364c80bfafd610c0b253cc942b4d0f7464223b40` |
| `11-public-installed-return-7407.png` | The mass-54 carrier's exposed round well and marked rail are recognizable near the lower edge. The neighboring arrangement continues out of the bottom of the frame, preventing an unambiguous empty-carrier/occupied-receiver comparison. This is useful partial evidence that the top-facing hardware can now be seen. | `13734deafa0c2b15a4fe0d48672020ed3c3a5e0cb1b59a7736294499107a86ca` |
| `12-public-family-light-return-7407.png` | Navigation explicitly names the Venn household receiver, but a large Aftermath panel and combat-target UI cover the middle/right scene. The foreground memorial is prominent; the small remote work objects do not establish the required relationship. | `8adbb61305a78c542f9febdb778972a64bc13fb070745a4598da61114326a66b` |

The Continue artifact inspected here has SHA-256 `aa44f34a31d83c594de2f8fc1e1f52bad5053592ad490984147023e31ed1beac`.

Root reports a later public recovery and ordinary map-target return, with the installation preserved and credits reduced from 5000 to 4500 by the displayed recovery charge. This is not treated as a Ward payment or reset. Although the intercept UI alleges an attack on a protected civilian, neither the pixels nor this artifact establish the initiating event. This reviewer does not assign that incident to the Ward, clear a law state, or introduce a new causal gameplay finding from it.

### Latest closure and open criteria

- **V4, off-axis presentation:** the supplied 95a775e live readings close the specific previously measured mismatch for cradle, lamp and receiver at this checkpoint. The previous 7f images remain valid failures of the earlier runtime. The new data must not be described as an independent reviewer execution or a universal proof for every body and frame. A readable ordinary frame can now assess the corrected scene on its merits.
- **V1, carrier-to-receiver relationship:** still open on 09–12. The required image must show the carrier and receiving cup fully, with enough visible detail to distinguish the loaded or empty carrier from the separate installed or unoccupied destination. Frame 11 is partial progress; a cropped comparison cannot close it.
- **V2, initial blockage and outside alternative:** still unproven in this sequence. The starting mast was already displaced. Later installation does not establish that an arriving player can read the original choice between clearing the cut and carrying around it.
- **V3, installed-state readability:** still open on 09–12. The runtime says installed, but none of these images gives an unobstructed view of the lit original seated in its receiver alongside the empty carrier. No new contradictory custody claim is inferred from generic targeting text.

The next clean ordinary view can close only what its pixels actually show. A post-installation composition may close recognition of the completed arrangement while leaving the initial loaded choice and work-contact sequence unproved. The existing authority closures, independently executed 42-check result and supplied R2 help/payment/Continue success remain intact.

**Checkpoint decision: REJECT for the four supplied visual frames; positive runtime evidence for the pose repair and uncredited installation is acknowledged.** Only this report was appended.

### Additional capture 13 and seed-provenance qualification

The reviewer subsequently opened `evidence/13-public-installed-receiver-7407.png` at its original resolution (SHA-256 `f389d74663037d9c4e053f964b30c28f74906758579f228d11801807011b33ef`). It is another failed acceptance capture: the image shows `HULL CRITICAL`, 17% hull, an active Navy intercept, weapons/trails and a dense combat-target panel. The memorial is recognizable, but the small work arrangement at the left is not a clear load/carrier/receiver comparison. No visual finding is closed by 13, and the reviewer does not infer the initiating law event from the intercept allegation.

Root also reported that a later public pause footer displayed effective `state.meta.seed = 683623714`, while the capture sequence and supplied session metadata had been labeled `7407`. **Pending reconciliation with the saved Quick envelope, 7407 is treated here as the entered/run/capture label, not an independently verified effective simulation seed.** Earlier references in this report to this sequence's seed should be read with that qualification. The filenames are retained for provenance. This discrepancy does not by itself establish a seed reset, reroll or Continue defect, and no such allegation is made. Root is checking the envelope metadata; this reviewer did not mutate or reload the save.

**Decision remains REJECT for the latest visual evidence.** The narrower pose-repair and installation findings above remain unchanged.

## G6 failure handoff — ordinary F9 Quick Load admission

**New acceptance blocker: REJECT. Evidence supplied by root from an ordinary F9 Quick Load; this reviewer did not execute that reload or its diagnostics.** Root reported that the main application stopped with its opening submission plan incomplete. The read-only rejection reason was `missing-or-unverified-blocking-content-hash`.

The reported admission diagnostics identify **five unverified procedural roots**:

| Root name | Unverified count |
| --- | --- |
| `LanternWard_shore_spine` | 2 |
| `LanternWard_service_cheek` | 2 |
| `LanternWard_cradle` | 1 |

Root reported **zero empty roots**, a matching resource census, and `firstPlayableComplete: true`. Those facts do not close the admission failure: present geometry and a playable-completion flag do not establish that the blocking content hashes have been verified. The observed application still failed to complete the ordinary opening submission plan. The exact loaded-source hash for this particular failed F9 attempt was not independently captured by this reviewer and is not inferred from the preceding screenshots.

The integration owner assigned repair of the procedural content-hash/admission contract, retaining the startup gate. Required closure is an independently observed ordinary F9 Quick Load that completes the opening submission plan with valid verification for these same procedural roots, retains their authored content, reaches controllable flight, and supplies the relevant source/admission evidence. A relaxed gate, missing roots, a matching census alone or an isolated factory render would not establish that result. This failure is separate from the previously diagnosed off-axis tumble and the earlier empty-autosave-data problem; those findings are not relabeled as its cause.

**Final handoff: REJECT.** The report is current through captures 09–13, the seed-provenance qualification and this newly reported G6 admission failure. The specific live pose-repair checkpoint and supplied uncredited installation evidence remain acknowledged; broad visual approval is still absent. No further checks were started after the handoff request. This reviewer releases `docs/validation/lantern-ward/hostile-review-1.md` for integration; no reviewer-owned browser, test or tool process remains running.

## Seed clarification and attempted independent public closure

Root subsequently supplied a narrower, authoritative seed comparison after the failed F9 attempt: read-only `laneRpc('probeState', {}).result.seed` returned **7407**, and the original Quick envelope also contained **7407**, while the presenting main-thread `state.meta.seed` showed **683623714**. This resolves the preceding provenance hold at that reported checkpoint: the worker retained the saved seed; the main metadata was stale or mismatched. The reviewer did not execute that probe, does not claim continuity at every earlier tick, and infers no recovery reseed. The 7407 capture/run label is consistent with the reported worker and original Quick-envelope seed.

Root then authorized this reviewer to take exclusive ordinary UI control of the existing harness PTY session **99934**, reload the repaired procedural-admission source, and exercise public Load Game → Quick → Load confirmation, with read-only observations and ordinary flight only. The reviewer read `.devshots/lantern-ward/browser-session.mjs` and attempted an **empty** `tools.write_stdin` read against 99934 before sending any UI command.

**Access result: `write_stdin failed: Unknown process id 99934`.** The session is inaccessible from this agent's execution context. This is not evidence that root's browser terminated or that the repaired game failed. No reload, load, key, screenshot, state probe or browser mutation ran through the assigned harness. No replacement browser was spawned, no other session was tried, and no foreign process was touched. Root was notified immediately and the UI claim was released.

**Independent public closure is BLOCKED BY SESSION ACCESS, not passed.** The repaired admission contract, successful opening-plan completion, original custody and the new ordinary-frame visual outcome remain unverified by this attempted closure. The existing G6 admission failure and visual REJECT remain pending independent closure; no new runtime defect is alleged from the inaccessible tool session. This pass appended only this report and releases both the report path and the UI claim for integration.

## Independent public Import & Load — 9c7bb900

**Verdict: REJECT. A new, independently observed public-import failure prevents flight before the repaired opening gate can be verified.** This attempt resolves the earlier tool-access limitation by using one separately authorized reviewer browser. It does not close the G6 admission finding or provide a gameplay/visual approval.

The reviewer started one isolated browser with an ignored copy of the existing harness at `.devshots/lantern-ward/hostile-review-1-import-session.mjs`, adding only the authorized native file-input action using Playwright `setInputFiles`. The new harness is session **18311**, with a 1280 × 800 viewport and Chromium/SwiftShader. No other browser or process was touched. The loaded source was the independently checked commit `9c7bb9006b5dffee7fc39487277ad8f411feba10`.

### Exact public reproduction

The reproduction file was root's ordinary-UI export, `.devshots/lantern-ward/public-quick-7407.json`. Before use, the reviewer independently verified **2,388,721 bytes** and SHA-256 **`d010d23e939dcbc6aa61e090913dd5b23026d7a65b72a8495f23aed0e283f3ed`**. Its envelope is version 23, slot `quick`, saved at `2026-11-04T22:35:37.741Z`, playtime 557 seconds, checksum `a00db65c`, and `data.meta.seed: 7407`. A second SHA-256 after the attempted import and recovery was identical. The source export was never edited or overwritten.

1. Choose **Play** on the observed First light prompt, retaining the standard presentation setup.
2. Open the main menu's **Load Game** screen. Its initial Quick slot is empty in this fresh browser context.
3. Select the unchanged exported JSON through the observed native `input[type=file]`.
4. Observe **Import save file?** and the explicit message that importing into Quick will validate and load the save immediately.
5. Click the observed **Import & Load** confirmation.

The console immediately reported:

```text
SimulationRunner is closed — sim worker directive failed: Failed to execute 'postMessage' on 'DedicatedWorkerGlobalScope': #<Promise> could not be cloned.
```

The resulting ordinary UI displayed **Import failed** and **Flight interrupted**, stating that the simulation stopped before another frame could be completed. A bounded read observed main mode `menu`, tick `0` and simulation time `0`. No flight input, F5 save, F9 load, opening-plan diagnostic or live Ward custody inspection occurred before this failure. The observed error establishes a Promise serialization failure in the import route; this reviewer did not change source or claim an independently diagnosed exact handler beyond that reported failure.

### Public recovery and retained-slot observation

The reviewer clicked the displayed **Restart to main menu**, then opened **Load Game** again. The normal screen read **No saves yet**, with **Quick — Empty slot**. Thus the failed import left no visible/selectable Quick save for an ordinary subsequent load. This is a public-menu observation, not a claim to have inspected every underlying storage record.

The reproduction and direct output are preserved in `evidence/independent-public-import-failure-9c7bb9.json`, including the unedited harness action results. Two screenshots were captured and personally opened:

| Evidence | Direct observation | SHA-256 |
| --- | --- | --- |
| `evidence/14-independent-public-import-failure-7407.png` | The actual Flight interrupted recovery screen after Import & Load. | `736f4c1c26de79e8bee3211c7de2b1f71db05feaf08b009cd5ad0700a63b3e79` |
| `evidence/15-independent-empty-quick-after-import-7407.png` | The actual public Load screen after recovery, with No saves yet and Quick Empty slot. | `7bd460dcd1995af02ba8f104312ba7a9d5f7cb71963399793f4f4eb41fadc54d` |

This failure is separate from the preceding procedural content-hash admission failure: the new attempt did not reach a point where that repaired gate could be assessed. Passing the specialist's admission tests therefore remains supporting implementation evidence, not this reviewer's runtime closure. It is also separate from the earlier empty-autosave-data defect. The import used a complete unchanged public export; no localStorage write, simulation-state API load, pose change, hidden flag or cinematic camera was used by the reviewer.

### Integration checkpoint and remaining closure

Root requested a source-update hold for an upstream merge. The reviewer finished the recovery observation and parked harness **18311 alive at the public Load screen**, mode `menu`, tick `0`, with no active load. Root was told that source could safely change. No further import, load or reload will be issued until root supplies the new source pin. Keeping this process alive is explicitly requested; it supersedes earlier handoffs in which no reviewer process remained running.

Required next closure remains concrete: the unchanged export must complete its public Import & Load path; then the imported run must reach controllable flight with the opening plan complete, the Ward roots verified, and the original identities/custody observable. A subsequent ordinary F9 round trip, or the supported public load of that imported slot, must be recorded separately. Root has authorized an ordinary F5/Save in this isolated browser if necessary to create a new Quick slot, with that new save's tick/custody distinguished from the source export. None of those later results is claimed here.

**Checkpoint handoff: REJECT.** The reviewer releases this report, screenshots 14/15 and `independent-public-import-failure-9c7bb9.json` for root's exact-path evidence commit. The browser remains alive and idle at menu under this reviewer's control while awaiting the new source pin; no foreign session or runtime source file was changed.

## Independent repaired Import, F5/F9 and installation — runtime 8cf0034e

**Mechanical verdict: PASS for the exercised public import, new Quick save/reload, native restored custody and subsequent uncredited installation. Visual verdict: REJECT / unproven because the required trio is not adequately framed. No new shape-legibility defect is inferred from subjects outside the image.** These are deliberately separate conclusions.

This reviewer executed the route below. The loaded production source was `8cf0034e814ef18af14dcc52f26485e637820e57`, including the import-bridge repair after upstream integration. Final checkout HEAD was `8c66b48500d475e48518118293b810dab589e4fc`; an independent `git diff --name-only 8cf0034e814ef18af14dcc52f26485e637820e57 HEAD` listed only `SAVE_SCHEMA.md`, the two 47-A expected-telemetry JSON files and the import-bridge test. No production source or asset changed during this browser run, and no reload for those metadata/test-only commits occurred.

### Infrastructure boundary and exact public route

After the earlier interruption and sparse reapplication, the old session binding/known endpoint could not be recovered. Root expressly authorized one replacement reviewer harness, preserving every inaccessible or foreign process. The replacement was **session 44212**, URL `http://127.0.0.1:37073/`, a fresh 1280 × 800 Chromium/SwiftShader context using the canonical game server in the same Node process. This is an infrastructure boundary, not a game failure.

The ignored harness is `.devshots/lantern-ward/hostile-review-1-import-retry-session.mjs`. From the repository, its launch command is:

```sh
LD_LIBRARY_PATH=/workspace/scratch/3a00c06b9899/browser-bin node .devshots/lantern-ward/hostile-review-1-import-retry-session.mjs
```

Root's unchanged public export was recovered by lossless decompression of the committed gzip into `.devshots/lantern-ward/reviewer1-public-quick-7407.json`. Its **2,388,721 bytes**, SHA-256 **`d010d23e939dcbc6aa61e090913dd5b23026d7a65b72a8495f23aed0e283f3ed`**, v23, seed 7407, original Quick timestamp `2026-11-04T22:35:37.741Z`, playtime 557 seconds and checksum `a00db65c` match the prior reproduction. The same SHA-256 was independently checked again after this pass. No source save field was edited.

1. Choose **Play** on the ordinary First light prompt and open main-menu **Load Game**.
2. Select that unchanged file through the native `input[type=file]`; observe **Import save file?**, then click **Import & Load**.
3. Reach ordinary live flight. No Promise-clone failure or Flight interrupted screen occurs. Public Escape pauses the run.
4. Resume, press public `-` four times, take frame 16, and pause.
5. Press **F5** once while paused at tick **35867**, simulation time **597.7833333331183**. The ordinary UI says **Saved Quick**. This creates a new Quick checkpoint in the isolated browser; it does not overwrite the exported reproduction file.
6. Press **F9** once. The UI shows **Restoring Quick** and the normal handover; after admission, click the observed **Back to the run** recap button and pause. This F9 is a reload of the new in-progress checkpoint, not a claim to have reloaded the unchanged 557-second export directly.
7. Resume ordinary live simulation with public zoom and short A/W/brake inputs. The original operation reaches installation. Later choose public Settings → Video → **Balanced**, then use public map search and **Track Target** for the borrowable cradle. Make one ordinary D/W/brake approach attempt and capture its result. No further flight follows the final projection diagnostic.

All browser commands and original tool responses are retained in [the independent raw evidence artifact](evidence/independent-public-import-f9-8cf0034e.json). No localStorage write, save-state API import, simulation mutation, teleport, hidden flag, injected steering or camera rewrite occurred. No new tests were run in this public closure pass.

### Direct admission closure

The first imported opening plan completed with 18 roots, zero unverified blocking hashes, a matching resource census and first-playable completion. That first cohort contained no named Ward roots and **was not used by itself to close the specific Ward admission failure**.

The subsequent ordinary **F9** plan completed with **36 roots**, `firstPlayableComplete: true`, `resourceIdentityCensusMatches: true`, no opening capture failure and **zero unverified blocking roots**. Six blocking Ward roots were actually included and verified:

| Actual blocking root | Asset identity | Verified content hash |
| --- | --- | --- |
| `LanternWard_cradle` | `place_lw_lantern_cradle` | `0f0ed65092fda69331508d25d28ee14331a66a320389a1424af0c62ffc91d3a0` |
| `LanternWard_lamp` | `place_lw_family_lamp` | `7840d606467d08f42d3241103be6c91cbb1ddfc1fe6a1d1d9597f9855aceb733` |
| `LanternWard_receiver` | `place_lw_family_receiver` | `718c79a0cd4640b8162cc13cd534257a97c0dc8a63505225f52bfc930897c0a5` |
| `LanternWard_shore_spine` | `place_lw_shore_spine` | `02c00721ef3b6d0bbcc782f5608e6de765a01fcb94fbbda75cb3f8fe8778d149` |
| `LanternWard_service_cheek` | `place_lw_service_cheek` | `4ba25d053f22a7289aaee3301f54b1bc34158d519488d2a4b5e2b7b032cf8067` |
| `LanternWard_service_cheek` | `place_lw_service_cheek` | `52244298b6c66b589468555a1e623469c420adf0f7fcd1d1cb42e5b9d3e18ccc` |

The raw JSON preserves each exact UUID, package identity, hash and verification flag. This independently closes the observed procedural-hash failure mechanism **for the exercised F9 cohort**; it does not assert that the old camera's exact five-instance census was reproduced. The present cohort includes one shore spine, both service cheeks, the cradle, lamp and receiver. Absence of an additional off-camera spine is not offered as verification of that absent instance.

The application subsequently accepted ordinary flight controls. This is runtime evidence through the unchanged gate, not only a unit-test result. The earlier 9c7bb900 public Promise-clone failure is also closed for this unchanged export on 8cf. Import-slot durability before the later F5 was not separately tested; the successful new F5/F9 round trip is recorded explicitly.

### Native custody and actual live completion

Both presenting metadata and the authoritative read-only worker probe returned **seed 7407** at the observed checkpoints. This resolves the previous main/worker seed discrepancy for this run without rewriting the historical evidence.

After F9, IDs and world-record/serial identities are preserved. Runtime occupant generations legitimately renew from **89–97** before F9 to **371–379** after F9; this report does **not** claim that those transient generation numbers remained numerically unchanged.

At the paused post-load checkpoint, tick **36568**, simulation time **609.466666666441**, the phase is `connect`. Read-only `probeState` calls independently confirmed matching entity/native poses and real Rapier bodies for cradle 602, lamp 603, receiver 604, bearing 607, Nessa 608, commuter 609 and maintenance crew 610. The native backend reports ready. In particular:

| Body | Observed post-F9 state and subsequent outcome |
| --- | --- |
| Cradle 602, generation 371 | Original `lantern-ward:cradle`, hull 280, native mass 54, near `(1829.985, -649.990)`; remains empty, unlit and held by the Ward after installation. |
| Lamp 603, generation 372 | Original `lantern-ward:lamp`, serial `venn-family-lamp:01`, hull 90, native mass 9, receiver custody; native pose near `(1829.987, -695.004)` during connection, then lit. |
| Receiver 604, generation 373 | Original `lantern-ward:receiver`, hull 1400, fixed native body at `(1830, -695)`; becomes lit with the original lamp. |
| Bearing 607, generation 376 | Original serial `lantern-ward:shutter-bearing:01`, hull 90, native mass 9, retained in `service_face` custody. |
| Nessa 608, generation 377 | Real native tug, hull 200, mass 55, near the work at connection; later moves away toward the service side after completion. |
| Commuter 609 and maintenance crew 610 | Original records/IDs remain alive with native bodies. Subsequent snapshots show actual movement after the operation, rather than replacement actors appearing at a final pose. |

At tick **37439**, simulation time **623.9333333330945**, the live phase is **installed**. Lamp 603 and receiver 604 are lit, the cradle is empty, and Nessa has begun departing. The UI says **The family lamp relay closes.** Installation remains present at the final paused boundary, tick **40589**, simulation time **674.3333333330487**.

Credits stay **5000** throughout these recorded checkpoints, with player-clear, carry, repair, theft, damage and borrow history flags false. This is autonomous completion without observed help payment. The `ignored` flag also remains false, so this is **not** renamed a completed timed-ignore branch. The mast was already far from the cut in the imported save; this pass cannot prove first-arrival blockage or the player's original alternative. A second F9 of the completed state was not repeated: this pass proves in-progress Quick continuity followed by real installation, while the earlier independent rewarded Continue evidence remains separately attributed.

### Normal-camera evidence and quality qualification

Every new PNG 16–21 was personally opened. Camera mode was read from the actual runtime as **Overhead**, not inferred from a filename or button expectation. It remained at tilt 60 and FOV 50. Frame 16 followed four public minus presses, configured zoom 176; later frames used seven more public minus presses, configured zoom 232. Ordinary camera composition produced smaller displayed zoom values, including approximately 204.55 at the final checkpoint.

Frames 16/17 used `qualityMode: auto`, stored `qualityPreset: medium`, render scale 1 and adaptive-resolution toggle off. The public Video UI explicitly explains that **Automatic** trials resolution bands. Selecting its **Balanced** button changed quality mode to `manual`; the ensuing ordinary frame 19 was substantially sharper. At frame 19 and the final boundary, canvas and viewport were 1280 × 800 and `dynResScale: 1`. Full motion, audio, bloom and ordinary gameplay presentation were retained.

The earlier actual transient resolution band was not measured. Therefore the report records a real presentation confound and a visibly improved fixed-quality result, without inventing an exact earlier scale or treating all blur as an authored-material defect.

| Frame | Independent assessment |
| --- | --- |
| [16](evidence/16-independent-public-ward-overhead-7407.png) | Actual unpaused imported flight, Automatic quality. Memorial geography is apparent, but the required load/receiver comparison is not established. |
| [17](evidence/17-independent-public-ward-post-f9-7407.png) | Actual unpaused post-F9 flight. The immediately following pause confirms installed state; the picture remains aliased and does not identify the trio dependably. |
| [18](evidence/18-independent-public-installed-balanced-7407.png) | **Failed capture: full PAUSED menu.** An exact-role Back locator timed out; a subsequent Escape returned to pause rather than flight. The filename does not make this gameplay evidence. |
| [19](evidence/19-independent-public-installed-balanced-flight-7407.png) | Actual unpaused Balanced/manual-quality flight, visibly much sharper. Clear scenery does not by itself identify the family lamp and empty cradle. |
| [20](evidence/20-independent-public-cradle-tracked-7407.png) | Actual unpaused view after public map tracking. The HUD identifies the cradle at 242 u; the memorial occupies the main frame. The redundant Close Map locator timed out after Track Target had already closed the map. |
| [21](evidence/21-independent-public-installed-approach-7407.png) | Final unpaused attempt; HUD cradle range 249 u, with law/combat UI and effects elsewhere. The attempt did not bring the required trio into the frame. No cause or player culpability is inferred from that unrelated incident display. |

Full SHA-256 values and precise command ordering are preserved in the JSON artifact.

### Final bounded projection diagnostic — no steering from it

Only after frame 21 and public Escape pause, root requested a read-only diagnostic of the exact three existing roots. It used their cached world matrices, cloned vectors and the current camera; no geometry traversal, live transform update or camera write occurred. **No subsequent flight was steered from these coordinates.**

| Exact root | Screen center in 1280 × 800 | Center within frustum | Root visible flag | Scale / pitch / roll |
| --- | --- | --- | --- | --- |
| Cradle 602 | `(-22.54, 29.96)` | No | true | `1,1,1 / 0 / 0` |
| Lamp 603 | `(-82.20, 130.45)` | No | true | `1,1,1 / 0 / 0` |
| Receiver 604 | `(-82.24, 130.43)` | No | false | `1,1,1 / 0 / 0` |

These are **all outside the left edge**. A center outside the frustum does not determine every pixel of a large mesh, and the root visibility flag alone is not an occlusion proof. Nevertheless this diagnostic decisively prevents misidentifying unrelated small fittings near the upper center as the installed trio. Frame 21 is missing-subject evidence, not a valid test of the corrected lamp/receiver shapes. The receiver's visibility flag in this off-screen case is not promoted to a new renderer defect.

### Final closures and remaining requirements

- **Public import / G6 admission:** closed for this exact source, unchanged export and successful new F5/F9 route, with the cohort qualification above.
- **Native continuation and uncredited installation:** independently observed. No latest-source empty-save, Promise-clone, native-body-loss or duplicate-lamp failure was observed in this route.
- **V4 pitch/roll defect:** the specific trio now has independent live checkpoint evidence of upright unit-scale roots, including the final installed state.
- **V1/V3 visual load/receiver and installed-state distinction:** **remain unproven**. This reviewer did not obtain a properly framed comparison. Do not use this failed capture to demand another shape repair without seeing the actual subjects.
- **V2 first-arrival obstruction and outside alternative:** **remain untested by this resumed campaign**. The correct remaining public cell is a fresh ordinary arrival with the original blockage, fixed Balanced quality and a normal view containing the actual work.

**Final bounded verdict: mechanical PASS for the exercised route; visual REJECT / unproven.** The raw evidence and this addendum preserve both results. No runtime source, shared test, other review report or foreign process was altered. The browser was publicly paused with no pending command at the evidence boundary; the normal shutdown receipt is recorded below after closing only this reviewer's authorized process.

**Normal shutdown and release:** after writing the report/evidence, the reviewer sent only own harness session **44212** the ordinary `{ "action": "quit" }` command. It exited normally with **exit code 0**. No foreign or inaccessible session was touched. This report, PNGs 16–21 and `evidence/independent-public-import-f9-8cf0034e.json` are released for integration. The ignored harness path/API above remains available for a separately commissioned fresh-save public pilot.
