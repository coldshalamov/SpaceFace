# Cut intake courtesy

## Player-facing increment

A loaded Cut ore hauler makes one limited concession to a real remaining Hesper medicine consignment while Cut's medical stock is below its existing equilibrium. It steers to a measured exterior side point and pauses its existing job for at most 30 simulation seconds. Completing the delivery, leaving the approach, losing required cargo, restoring stock, or losing a valid context returns it to normal work. One station clearance explains the actual admission: “Cut intake: Delivery carrier, take the approach. One ore hauler is holding outside.”

This is crew supply versus refinery throughput, not universal altruism or a reward dispenser. Ossa's oreworker fiction informs the situation, but the implementation applies to an eligible existing Cut hauler. It does not bind Ossa to every hauler, invent indenture, name patients, disclose concealed contents, spawn extra bodies, or move freight/reward/reputation itself.

Canon/source anchors: `src/data/laneContacts.js` supplies Ossa's existing identity; `src/data/fences.js` supplies Hesper's medicine/food and route character; `src/data/sectorActivityPockets.js` supplies the Hyperion yard ore run; `src/systems/economyContracts.js` supplies actual Hesper route and ordinary deniable offers. These sources are unchanged.

## Changes and ownership

- New `src/world/cutIntakeCourtesy.js` checks accepted provenance, positive canonical reserved cargo, current stock, original job/body identity, safe geometry and a bounded existing AI-record token.
- `src/systems/npcJobsRuntime.js`: one import and one call at the start of `_updateBerthHold`, after its existing hold reset. Its existing pause/advance/steering logic remains authoritative.
- New `test/cut-intake-courtesy.test.mjs`: 51 focused cases.
- No mission, save, world-record, traffic, economy, HUD or dialogue source change. No parallel work clock or cargo ledger.

PR480's inspected head `ff62ac4261b4debaff798f46cbe56a6473f8cf2e` changes the Orchard tow interception import and `_stepTowAssist`; it does not change `_updateBerthHold`, serialization or deserialization. The proposed two-line runtime integration does not overlap those hunks.

## Acceptance and finite permission

Only an active, accepted, unexpired, preloaded medical cargo delivery from Nyx to Cut qualifies. Provenance must match Hesper's first route leg or the real ordinary Hesper deniable-offer shape. `acceptedAt_s` comes from the real mission acceptance owner; `releasableContractUnits` must be positive after sibling-contract reservations. A short consignment remains eligible: the existing `partialDeliverySettlement` owner accepts its real remainder and pays proportionally. The ordinary fixture generates and accepts `eco_station_nyx_march_3_deniable`, 18 medical units, at simulation time 100. Route-leg acceptance is also exercised.

The worker must already carry a valid canonical raw-ore manifest and be on its current Cut-bound hauler transit. Threats, flee/interrupted jobs, leases, tugs, specialized physical-work actors, stale identities, dead bodies, wrong sectors, invalid stock and malformed state fail closed. Eligibility changes never settle the worker's cargo.

One token lives on the same body's existing `data.ai` persistence seam. Its absolute expiry gates permission only; it does not advance or replace the job clock. It is not renewed by approach departure/return, job recommission or body restore. Same-ID replacement or an older/equal accepted obligation cannot reset it. A newer legitimate obligation can receive its own bounded concession. Other visible haulers with a token for that shipment prevent duplicate admission and repeated clearances.

## Geometry and performance

The target clears the actual station proxy, docking extent, worker hull envelope and a 48-wu margin. Both initial admission and continued/reentered use validate the current worker-to-target segment. A worker already too deep in the berth, across the station from its remembered target, or facing an occupied side path receives no courtesy diversion. On actual admission, the worker also relinquishes its old `berthWaitSince` queue claim; otherwise an earlier queued worker could block normal haulers despite physically pulling aside. A regression failed before this reset and passes afterward, exercising the other hauler through the actual berth arbitration. Admission reads the ready station map and at most 128 compact ship-lane entries, never the full world entity list; oversized contexts fail closed. Mission, route and manifest scans are capped at 32 rows.

The final bounded microbenchmark ran 10,000 existing-hold checks in 135.79 ms, 13.58 microseconds per check, in the three-body fixture. A guarded full-world array catches accidental scans. This is a local microbenchmark, not a whole-game frame-time claim.

## Qualification

Public reference: `5df6709c2ad275440229e4944450f05c18571ece`. The exercised source graph is hash-checked against public source, including the three UI modules changed since `1c3db823bd8ddc6782a676b8c459404daad2d1c1`.

Explicit shared dependency: the already-public `src/systems/cargoCustody.js` blob `2cba7df79aac728fd4a955026adefd185a4d23ad`. Current master alone lacks the `massDeclarationForTarget` export required by its existing consumers. Baseline and candidate use the same exact dependency. This is not a clean-master or blanket full-tree pass claim.

- Final candidate: **51/51 focused tests pass**.
- Matched baseline with the final actual-refinery fixture: **0/1** on the primary behavior, because the unmodified job never admits the medical courtesy.
- Independent review previously reproduced the 50-case seal and the existing berth-queue regression **5/5**; the additional positive partial-medicine delivery/settlement case is included in the final 51-case seal.
- Tests preserve original cargo, credits, reputation, body count and body/job identities during the hold. Real mission docking settlement pays through its existing owner once, and the original worker resumes.

### Native movement, not only intent

The bounded native witness uses the canonical 55-tonne Mule factory, Flight V3 and Rapier. It explicitly resolves `place_station_refinery` / `skin:place_station_refinery`, with station outer radius 73.17255 wu and worker envelope 15.683783 wu. A regression prevents silent fallback to the trade-hub skin.

From staged worker pose `(350, 50)`, the actual hold target is `(506.0930, -26.5246)`. Over ten seconds the native worker moves to `(458.8446, -68.7838)`, reducing target distance from 173.84 to 63.39 wu while job progress remains 0.6. The existing controller's braking stand-off is not claimed as exact point arrival.

Actual player flight input, with no post-start pose writes, moves the carrier out beyond 900 wu at time 112.8833, before the token's time-130 expiry; the original job resumes to progress 0.6004167. A separate native approach starts 1,000 wu along the refinery's real corridor, enters range through forward flight, and admits the hold at time 101.0833. These are local physical approach/steering witnesses, not a manual flight from Nyx or a full-sector playthrough.

### Persistence and the resolved fixture failure

Actual body-record capture and `spawnSpecFromRecord` preserve the same token, manifest and world-record identity. Actual Save/Continue also restores the original worker and player poses, accepted mission, stock, job and token.

The strengthened positive-resume check initially failed because this focused simulation deliberately omits the world producer: Save/Continue correctly did not recreate the static station fixture. The test now first proves missing-station refusal, then supplies only the identical static station fixture. The restored worker/player/job/cargo/mission are not rewritten. Remaining permission resumes; expiry cannot renew it. This is a body Save/Continue integration proof, not complete world rehydration or a full leave-sector/reenter-sector witness.

Earlier 47-case passes used an incorrectly under-specified station fixture that fell back to a trade-hub skin. Those results and the failed actual-refinery/reentry/Save diagnostics are preserved as historical evidence, not promoted to final physical acceptance. The corrected refinery fixture places the player along the real corridor instead of weakening collision checks.

A proposed full-original-quantity tightening was rejected after checking the exact mission owner: current `missions.js` explicitly settles partial remaining freight. The final helper retains the originally allocated positive-canonical-remainder rule. Its regression proves priority, delivered quantity, proportional pay, normal worker resumption and no duplicate receipt/payment. The superseded full-quantity test log is retained but is not the final semantics.

## Limits

No live browser or game-camera visual acceptance was performed. Any supplied asset layout is an explicitly labeled offline reconstruction from real asset bytes and measured native poses, not a live gameplay screenshot. The production traffic producer test uses real generated manifests and natural job construction in a bounded fixture, but does not claim an untouched full authored shift. No aggregate tests or excluded receiver-delivery fixture were run.

## Sealed source blobs

- Helper: `47e69c3e6e1643e4f93f92b57219fafb09a1b885`
- Focused tests: `46d2055c69d8c57c06a0b303fd6288bbb2c0632e`
- Runtime base: `cfe437e48e482ce36f2e214f9e330dfbdbbb1b05`
- Runtime with the two allocated lines: `df67b71cd5de65bf5a4095793d7affcf88a103fa`


## Delivery registration and shared dependency

The clean projection uses public master5df6709c2ad275440229e4944450f05c18571ece. It includes the identical already-public cargo helper2cba7df79aac728fd4a955026adefd185a4d23ad and contract test e33acd37c664c41c791e5c28caa08fb7fe1d0551, also present in PR545, without forking their behavior. No other Rope or clinic changes are imported.

`check:cut-intake-courtesy` and `check:cargo-mass-read-contract` are explicitly included in the existing default check chain without removing or reordering prior commands. Only the new Cut helper's modulepreload line is added. Its five imported modules already have preload entries; unrelated existing preload drift is not bulk-regenerated. No workflow, threshold or baseline digest change is made.

Independent final source review and focused51/51 plus existing berth-queue5/5 pass; the unchanged shared helper contract test also passes28/28. These are84 distinct focused checks, not84 new tests or whole-game acceptance. The saved static-station fixture, bounded native approach and offline preview limits above remain.
