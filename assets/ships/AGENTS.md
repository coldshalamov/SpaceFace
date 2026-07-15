# assets/ships/ agent notes

This tree contains ship/place authoring inputs, release outputs, evidence, reference packages, and the
manifests that bridge them to runtime. Exact machine records outrank prose inventories.

## Before editing or exporting

- Check active lock, building, previous-release, and authoring signals. Coordinate with the active
  owner rather than deleting, rebuilding, or promoting over their work.
- Read `assets/ships/parts/parts_manifest.json`, the generated release manifest, and the relevant maps
  in `src/render/partsLibrary.js`.
- Source assets are authoring inputs; default runtime loads release assets.

## Current routing principle

Never copy the current ship roster into instructions. Inspect exact manifest IDs and the live
def/role/archetype/modular maps in `src/render/partsLibrary.js`. Never infer family status from an old
filename, file size, or prose summary.

## Promotion contract

- Require substantive geometry, correct transforms, semantic materials, stable sockets, provenance,
  reproducible source/build steps, and player-camera evidence.
- Geometry, texture density, material count, and LOD are screen-space/profile decisions—not global
  quality ceilings.
- Run asset status/reachability/live-load/visual-stability checks and inspect the normal game route.
- Never edit generated release metadata by hand or wire an unaccepted candidate to make a check pass.
