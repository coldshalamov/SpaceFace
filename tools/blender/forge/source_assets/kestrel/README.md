# Kestrel original collision source

`collision.glb` is the original first-party Kestrel collider extracted from the authored source pinned in `provenance.json`. It is an independent input, not a generated render tier. Keep its positions, indices and world transform intact when revising the visible hull.

Reproduce with Blender 5.1: run `tools/blender/forge/ships/kestrel.py` for the normal Forge preview, or import the recipe, call `build().finish()`, then `export(ship, out_dir=...)`. `--live` is the canonical publication entry point and also bakes the motion bank; publication must be coordinated separately. For scratch motion validation, call `ship.ani01_bank.bake([path for path, _ in written], out_path=...)` on the export result.

The recipe owns the 32-section pressure hull, 12-side guns, 32-side drive, supported vents, repair recess, lower-tier cyan spine and normal repairs. The wrapper restores shared export functions after use. Original glass, textures, sockets and motion remain intact.

## Reviewed render geometry pins

`reviewed_lod0.glb`, `reviewed_lod1.glb` and `reviewed_lod2.glb` contain only reviewed render mesh buffers, without textures, materials, transforms or collision. Across Blender processes, bevel triangulation varied on the Brow, armor cap and iris petals, propagating into lower-tier decimation and normals. The recipe therefore replaces named render buffers after export, preserving reviewed positions, normals, tangents, UVs and indices exactly. Materials, scene transforms, sockets, motion and collision still come from the recipe. Hashes and sizes are in `provenance.json`.

The parametric construction remains the editable upstream recipe. Intentional geometry edits require re-review and replacement of these pins; until then the pins are the final geometry authority. Authored outputs retain unused generated buffers; official release/package optimization removes them. Authored bytes are not a runtime cost claim.

### Intentional geometry regeneration

1. Change the parametric recipe, then use a scratch build script calling `export(ship, out_dir=<directory-below-repo-.devshots>, preview=True, review_unpinned=True)`. This explicit escape skips stale pins, retains collider/tier finishing hooks, and refuses live, default or canonical output directories. There is no CLI/environment bypass for publication.
2. Compile the scratch outputs through the official package boundary and judge them in the locked game session, including motion, player paint and all three tiers.
3. After accepting those actual outputs, run `python tools/blender/forge/source_assets/kestrel/pin_reviewed.py <reviewed-output-directory> --stem <reviewed-basename>` to replace the geometry pins and their provenance. This is an explicit authoring action, never automatic during normal builds.
4. Rebuild normally and compare the resulting mesh attributes, indices, materials, textures, sockets and motion against the reviewed outputs before publication.

## Fail-closed reviewed inputs

Normal `export()` verifies the recipe, relevant Forge construction/export/texture/motion modules, selected animation modules, fleet mapping, repinning utility and guard against `provenance.json` before any export writes. It also verifies all four pinned source hashes. Any mismatch refuses stale geometry. The explicit repinning utility records current input hashes only after the new scratch output has been reviewed; normal export never refreshes them. Because the fleet mapping is bound as a file, even an unrelated fleet mapping edit requires an explicit review of the binding before this ship exports.

## Forge publication rule

This is an automated, versioned stage inside the canonical Kestrel Forge recipe, not a hand edit of a published GLB. The normal Forge command and `publish.mjs` continue to own publication and official manifest/release/package regeneration. Pinning replaces only named render primitives using reviewed source buffers; it keeps exporter-produced scene transforms, materials, six shared textures, sockets, collider and metadata. No per-ship texture set is introduced. Exact primitive counts are returned after pinning.

A bounded Blender import/export trial of the reviewed LOD0 source changed buffers in 33 of 39 meshes (`.devshots/fleet/kestrel-astra/blender-pin-roundtrip.json`). Thus Blender-side substitution cannot carry the exact reviewed-buffer claim; the bounded serialization stage is necessary for that claim. It does not claim the trial was visibly worse. Never patch canonical GLBs by hand or skip the official release/package tools. The source guard and explicit scratch-only repinning workflow are the constraints on this stage.

## Native LOD2 drive origin contract

`drive-lod2/contract.blend` now supplies the reviewed local drive mesh and its object translation together through the optional Forge LOD override. This prevents process-dependent decimation centering from combining the pinned local coordinates with a different origin. Its small numeric source and Blender bake script reproduce it without reading mutable outputs; see `drive-lod2/README.md`. All three donor inputs are included in the fail-closed guard. Existing render pins and collider remain unchanged.

The adoption review compares the composed scratch output before updating input bindings, then repeats through normal guarded export. Evidence and commands are recorded in `.devshots/fleet/worklight-astra/protected-reproduction/KESTREL-ADOPTED.md`. This is source adoption and scratch verification, not publication.
