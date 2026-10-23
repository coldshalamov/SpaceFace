<!-- LIFETIME: ACTIVE -->
# Runaway Kiln visual allocation, 22 October 2026

Owner: dot, isolated authoring followed by explicitly reconciled integration.
Outcome: one independently usable unmanned molten-load body for the actual rescue actor, fitted to the unchanged native core and mounted through the existing production package route. This is not another ship, a recolor, or three models counted from LODs.

## Evidence and intent
The generic payload route in visualOverrides.js (public blob 0ca35e9ef11c38a181e95a6ee57cc546c918236c) resolves to pods/pod_cargo_container.glb, not merely the factory's 336-triangle procedural canister. Successful asynchronous admission hides that canister. With radius 23 and no explicit visual radius, the package longest axis is 46 WU.

The unchanged kilnbackBody.js blob 405cd07005a80e5b002083941b267183934864fd defines a core with X[-13.721355,13.995123], Z[-6.8,6.8]. Preserve its physics, sockets, mass and all points. Inspect the real GLB transforms after runtime-style fitting against the polygon, including its asymmetric center, not just a bounding circle.

The complete existing kilnback is a crewed furnace tug, 25,188 source triangles, 41 primitives, 14 materials and 27.74 x 7.679896 x 23.04 m. Its source recipe blob is 0ac09aa36ffc878fe9461c467a87b79996e979b4. Reuse relevant pressure hull, ceramic mouth, recessed hot louvers and seated thermal hardware; omit crew bridge/windows, drives, external coolant casks and their plumbing. Existing ruptured vessel and empty cradle do not substitute for an intact load. These are measured inputs, not costs of an unbuilt derivative.

## First authoring allocation
New paths only:
- tools/blender/forge/ships/runaway_kiln.py
- assets/ships/parts/pods/pod_runaway_kiln.glb
- assets/ships/forge/sources/runaway_kiln/measured-contract.json
- test/runaway-kiln-visual-fit.test.mjs
- test/runaway-kiln-visual-admission.test.mjs
- design/program/world-depth-2026-10-02/RUNAWAY_KILN_VISUAL_2026-10-22.md
- design/program/world-depth-2026-10-02/evidence/runaway-kiln-visual-20261022/export-top.jpg
- design/program/world-depth-2026-10-02/evidence/runaway-kiln-visual-20261022/export-oblique.jpg
- design/program/world-depth-2026-10-02/evidence/runaway-kiln-visual-20261022/export-collider-comparison.jpg

Inspect the source/release metadata contract before allocating additional new contract paths. Do not execute the old tug recipe's live/family export or mutate its source, palette, existing assets or shared export helpers.

## Integration boundary
Root retains shared integration and package/test registration. Proposed new unique identity: sf.render.pod-runaway-kiln; proposed released file: pods/pod_runaway_kiln.glb; proposed package directory: pod-runaway-kiln. Before writes, reconcile current source and existing release/manifest owners. Only this identity's additive entries may be introduced; never regenerate or replace unrelated owner rows.

The only proposed existing renderer hunk is a storyPropKind === runaway_kiln payload selector within packagedPropSpec, after explicit supplied-file handling and before the generic tow fallback, with measured fit. This is not a whole-file graphics reservation. No runtime/director/Save or kilnbackBody.js edits are allocated. Any additional fallback or fit change requires its exact hunk to be reviewed before mutation. Root separately allocates required release, pilot, generated-manifest and census entries after contract inspection; authoring alone is not production registration.

## Verification and status
State at 23 October 00:01 UTC: source exported and iterated through four revisions; eight focused native-fit checks pass locally. The current visible mesh has 11,752 triangles, six primitives/materials, a 27 WU fitted length and zero visible vertices outside the unchanged native polygon (minimum clearance 0.147885 WU). Exported top/oblique review exposed a partly buried aft panel; the fourth export replaces its cap with a closed skin-following grid. Four seated lifting eyes clarify handling purpose without introducing gameplay sockets. Final review, production packaging, publication, ordinary gameplay and acceptance remain open. Measure real reachable geometry/material/byte costs, verify no crew/casks/drives or floating attachments, compare exported top/oblique views with native polygon at the same WU scale, and inspect the final runtime package too. Pending/failed/settled override selection and initial/restored actor identity need tests. No ordinary towing or live camera acceptance is implied.

Next executable action: author and inspect the single core-derived load in an isolated output tree, then complete the registered integration and independent review. Existing Orchard/Pallas/Guide/Shard/r4/gradiometer allocations remain unchanged. All larger goals remain open.

## Scoped integration allocation after contract inspection

Root owns only the new pod-runaway-kiln identity's additive entries in assets/ships/parts/parts_manifest.json, assets/ships/release/release_manifest.json, assets/ships/render-packages/pilots.json, src/render/renderPackageManifest.js, src/render/partsLibrary.js::liveSolidGlbCatalog, and the generated src/data/modelTruthCensus.json / modelTruthCensus.generated.js rows, plus the unique focused test registration in package.json. Re-read actual current paths and preserve all unrelated Pallas/Shard entries before mutation. Generated release/package/census outputs must use verified production tools; never hand-author generated metadata. Current package tool supports --only and census supports --only plus --update-selected. No full fleet rebuild or aggregate test is allocated.

The source contains a strictly marked non-render collision prism matching kilnbackPhysicalBody([]) and planarProxyPrismHalfHeight. Its height exceeds visible geometry. Compiler/loader helper filtering must be verified for the actual mounted prop path so the hidden helper cannot silently change fit or center. Authored-origin census authority requires measured source hashes and exact native convex-part parity. No physics geometry, solver or gameplay mutation is authorized by this visual claim.

Revision 2 and 3 recipes, models and matching measurements plus the defective revision-3 top view are preserved in a seven-file, 813,505-byte recovery package, independently read back with exact member bytes and SHA256 bddccff910694019ab1d45cce72a490231ae787ef632907a0027653715a97226. Recovery is not repository delivery. The interrupted authoring resumed after an environment restart; surviving files were checked before continuation.

### Final source and admission decision, 23 October 00:10 UTC

Final eight-file authoring packet: source GLB SHA256 9aa0153fcc97a4308f7847ae4dc2d7af475ffe1527a6cdde771c28ce2b68168a, 856,124 bytes; recipe SHA256 0e5ebb707360c48058607c5e523869ea2db4dcbc8029e8ce14b0d1169151a508. Root inspected oblique/collider views and independently reran all eight fit checks. Final recovery is 679,538 bytes/nine regular members including its shipping manifest, independently read back and member-verified, SHA256 eca0a04036264675de9dab356da183b8ff1d38cc29c822321c560cdfe7059613. These are source reviews, not compiled-package or game-camera acceptance.

Use a dedicated payload/storyPropKind selector returning radius 13.5 and hideImmediately:false. Preserve explicit package, mapped story props and rescue priorities. PR #515's fresh/restored actor is payload, unlike old master. It has no authoredPayloadAssetId and does not enter the authored-cargo wrapper. The existing filtered-primitives path excludes nonrender helpers before final fitting; leaving the procedural fallback visible avoids the resolving stand-in's helper-contaminated record.bounds without changing generic renderer behavior. Test pending/failure retention, successful swap and existing selectors. Do not add a new scale mode or delete collision certificate geometry. Census uses authored-origin with exact native convex parts and sealed hashes, not authored-place-origin, which bypasses compound certification.
