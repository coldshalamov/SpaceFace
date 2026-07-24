# assets/ships/ agent notes

This tree contains ship/place authoring inputs, release outputs, evidence, reference packages, and the
manifests that bridge them to runtime. Exact machine records outrank prose inventories.

## Before editing or exporting

- Check active lock, building, previous-release, and authoring signals. Coordinate with the active
  owner rather than deleting, rebuilding, or promoting over their work.
- Read `assets/ships/parts/parts_manifest.json`, the generated release manifest, and the relevant maps
  in `src/render/partsLibrary.js`.
- Source assets are authoring inputs; default runtime loads release assets.
- For substantive visual authoring or remaster work, read `docs/visual-assets/README.md` and
  `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`; use its craft principles, G0ΓÇôG7 gates,
  and execution protocol as the canonical definition of done.

## Current routing principle

Never copy the current ship roster into instructions. Inspect exact manifest IDs and the live
def/role/archetype/modular maps in `src/render/partsLibrary.js`. Never infer family status from an old
filename, file size, or prose summary.

The canonical authored-asset production states are:

- `blockout`
- `design_candidate`
- `production_model`
- `bake_candidate`
- `surfaced_candidate`
- `integration_candidate`
- `accepted`
- `blocked`
- `deprecated`

`done`, `finished`, `production-ready`, and `shippable` mean `accepted`. Do not use them for an earlier
candidate state.

## Promotion contract

- Technical validity, performance validity, and visual acceptance are separate proofs. A valid GLB,
  green exporter, socket/collision report, or triangle count cannot set final visual acceptance.
- Require role-readable primary form, plausible construction, correct transforms, deliberate UV/bake
  work where applicable, physically coherent materials, authored screen-space LODs, stable sockets,
  provenance, reproducible source/build steps, measured representative-scene cost, and current
  player-camera evidence.
- Geometry, texture density, material count, and LOD are screen-space/profile decisionsΓÇönot global
  quality ceilings. A historical count is a diagnostic only when tied to an exact scene and profile.
- Use the G0ΓÇôG7 records in `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`. Tier A/B assets
  require an independent G7 review against the exact candidate hash.
- Run asset status/reachability/live-load/visual-stability checks and inspect the normal game route.
- Never edit generated release metadata by hand, weaken a check to ship a candidate, or wire an
  unaccepted candidate merely to make a check pass.
- When required evidence or tooling is unavailable, mark the exact gate `blocked`; do not translate the
  missing proof into completion prose.
