# Charon: an evacuated workplace, not just a conveyor

## Outcome and boundaries

Actual exported-model inspection found coherent cargo and cutter silhouettes, but the Abandoned Mining Colony appeared only as a generic conveyor platform. This increment gives the existing place a sealed, dark habitat capsule and attached service annex, physically supported beside the bridge. Shared Forge finishes, framed airlock, dark windows, saddles and service connections connect its appearance to the finite habitat scrubber kits already recovered by visiting salvage workers. No residents, new stock, rewards, damage story or mission are introduced. Existing navigation lamps remain; habitation windows are dark.

One new composition is registered as place_charon_colony_service_barge. Its three LODs are not three new models. Generic conveyor, habitat and utility donors remain unchanged. The new builder is reproducible; source GLB, compressed release, compiled render package, manifests and measured collision census accompany it. Independent review verifies old 199 parts, 356 release entries, 354 pilots and 219 census rows are preserved, with one new row each.

## Scale and physical identity

The final sector catalog applies anchors before claim-site overrides. Charon's size-S claim site explicitly supplies radius 20, overriding the fallback 48. The donor reference remains 48, so raw 73.300003 WU X extent draws 30.541668 WU. Both exact Charon pointers now select the variant; generic colony defaults and claimed-appearance precedence are unchanged. Earlier studio overview using raw 73.30 as final draw size was incorrect and superseded. No 2.4x enlargement is implemented.

Full authored bounds remain min[-1,0,-8.30000019], max[72.30000305,11.10000038,8.30000019]. The new source-derived native hull has a tiny max-X difference of about0.00024WU within the visible envelope; it is not asserted bit-identical. Ten donor sockets retain their transforms/extras, while asset/root identity is the new colony's.

Normal POIs regenerate through existing world/save owners; no broad saved-record rewrite is added. Changed collision contracts may trigger the existing native-snapshot fallback. Independent old-to-new and new-to-new claimed/unclaimed production checks preserve original semantic crew identities, poses, velocities, hulls, finite six-unit lot/book/manifests and claim state. Existing baseline saves also exercise fallback. Exact native-byte continuation across changed geometry is not claimed; isolated owner tests distinguish old-to-old/new-to-new exact adoption from old-to-new rejection.

## Geometry and exported visual review

Shipped donor LOD0 is 7,756 triangles. First annex draft was 14,840, not the initially miscompared 12,232 manifest figure. Removing unnecessary rounded-ring bevels and tiny surface tessellation produced 11,976 / 4,790 / 1,692 triangles across LOD0 / 1 / 2. Final compressed release is 498,992 bytes, with actual six embedded KTX2 textures and shared material roles; studio before/after views retain the rounded silhouette and cream/dark contrast. This is not a measured GPU/FPS cost claim.

Exporter optional contract_source transfers explicit donor sockets/extras without donor root identity. Missing option preserves previous behavior; invalid donor headers fail. New census append-selected mode requires an explicit single new catalog ID, preserves previous rows and rejects ambiguous/duplicate/existing selection or failed new-row evidence without mutation. Actual validators and collision/quality thresholds are unchanged. Forge-shared declarations describe genuinely textured finishes, not substitutes for texture payloads.

## Related real route defect and correction

A bounded native probe on the prior public platform found the original finite-supply hauler crossing the fixed colony during collect, with no generic job, player 300 WU away and original stock unchanged. Sparse sampling first found -0.494398 WU penetration; every-tick sampling refined minimum to -0.593479 WU across 40 contact samples. The new model alone produced essentially the same inherited contact, not an enlargement regression.

The route correction changes only steering intent, using the current canonical colony POI, actual fixed native pose and existing hull/model-truth proxy envelopes. It selects local arc/chord approach points around that one fixed obstacle; native contact, pickup, handoff, claims, stock and lifetime rules remain intact. Conservative repositioned stock inside the clearance region may hold rather than solve arbitrary retrieval; that broader recovery experience is not accepted.

Independent 46 focused and 32 adjacent checks pass. A single bounded production native completion run on route-only 7d9f313523389343b8a93eb2ea5ecbdf03e55b84 with the ORIGINAL platform delivers 6 at tick 6068 and consumes 6 at 6069 (~101.15 simulation seconds).6,069 every-tick colony observations have minimum 20.671799 WU and no penetrations; original hulls 200 / 180 and identities remain. Its actual terminal Save and prior failed guard/probe are preserved. This is not a final combined-model ordinary-flight proof. Asset review separately passes 170 existing collision/save/custody tests and matched geometry probes.

## Observation and remaining acceptance

Actual ea1cc game-camera diagnostics ended with hidden PREPARING authored roots, no recorded load/boundary errors, and all original subjects in R0_GLASS. The 15.197-second diagnostic's between-image simulation advance was 0.3 seconds; its initial transition snapshot was 1.8 and final 2.633. Do not attribute the whole diagnostic interval to the between-image delta. Captures occurred before the observed residency hold expired. This establishes unresolved in-flight preparation, not absent asset files or permanent starvation.

One optional observation is now capped at 90 seconds including capture/persistence reserve, stops early on real readiness or legitimate original-subject loss, and records the initial state, actual mesh scale and raw gameplay radius separately from conservative framing bounds. It does not advance simulation time, override quality/admission, spawn replacements or force stock. A second image requires actual presented-frame advance. Twenty-six focused diagnostic tests pass. This is evidence collection, not a renderer fix.

Source/export/package review and isolated tests do not close ordinary gameplay, actual-camera composition, hardware performance or user acceptance. Keep SF-GAME, SF-ORCHARD, SF-ASSETBANK, SF-ASSET-QUALITY, SF-VISUALS and the other shared goals open. No master merge or deployment is part of this increment.
