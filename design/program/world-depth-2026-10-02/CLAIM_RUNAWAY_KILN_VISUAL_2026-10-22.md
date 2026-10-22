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
- test/runaway-kiln-visual-fit.test.mjs
- design/program/world-depth-2026-10-02/RUNAWAY_KILN_VISUAL_2026-10-22.md
- design/program/world-depth-2026-10-02/evidence/runaway-kiln-visual-20261022/export-top.jpg
- design/program/world-depth-2026-10-02/evidence/runaway-kiln-visual-20261022/export-oblique.jpg
- design/program/world-depth-2026-10-02/evidence/runaway-kiln-visual-20261022/export-collider-comparison.jpg

Inspect the source/release metadata contract before allocating additional new contract paths. Do not execute the old tug recipe's live/family export or mutate its source, palette, existing assets or shared export helpers.

## Integration boundary
Root retains shared integration and package/test registration. Proposed new unique identity: sf.render.pod-runaway-kiln; proposed released file: pods/pod_runaway_kiln.glb; proposed package directory: pod-runaway-kiln. Before writes, reconcile current source and existing release/manifest owners. Only this identity's additive entries may be introduced; never regenerate or replace unrelated owner rows.

The only proposed existing renderer hunk is a storyPropKind === runaway_kiln payload selector within packagedPropSpec, after explicit supplied-file handling and before the generic tow fallback, with measured fit. This is not a whole-file graphics reservation. No runtime/director/Save or kilnbackBody.js edits are allocated. Any additional fallback or fit change requires its exact hunk to be reviewed before mutation. Root separately allocates required release, pilot, generated-manifest and census entries after contract inspection; authoring alone is not production registration.

## Verification and status
State: implementation starting; no derivative exported, reviewed, published, integrated or accepted yet. Measure real reachable geometry/material/byte costs, verify no crew/casks/drives or floating attachments, compare exported top/oblique views with native polygon at the same WU scale, and inspect the final runtime package too. Pending/failed/settled override selection and initial/restored actor identity need tests. No ordinary towing or live camera acceptance is implied.

Next executable action: author and inspect the single core-derived load in an isolated output tree, then complete the registered integration and independent review. Existing Orchard/Pallas/Guide/Shard/r4/gradiometer allocations remain unchanged. All larger goals remain open.
