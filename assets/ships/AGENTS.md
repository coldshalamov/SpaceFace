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
  `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`; use its craft principles, G0-G7 gates,
  and execution protocol as the canonical definition of done.
- For every Blender/GLB form or surfacing change, also load
  `.grok/skills/spaceface-blender-material-truth/SKILL.md` and complete its preflight before
  modeling. Follow `docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md` and fill a
  `TECHNIQUE_LEDGER.json`. When the activated packet cites
  `docs/visual-assets/MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md` (including PQ-050), run its required
  full-job cycles, subagent still reviews, and cleanup. A factory loft with boxes, a tinted shared
  sheet, a zoomed gray crop, or a script success does not implement any MTX row. Tier C/D may group
  one repeated manufactured family, but no changed visible zone may inherit a DCC default. This
  prevents plastic/clay, LEGO-like primitive stacks, glowing
  disks/toruses, generic greebles, and fiction/material contradictions instead of diagnosing them
  after export. The skill may add techniques but never weaken G0-G7.

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
- A technical receipt may mark `evidence_ready`; it cannot close G1, G2, or G4. Every gate result
  names its scope (`component`, `zone`, or `whole_asset`), and a component-scoped pass never implies
  a whole-asset pass.
- For remasters, generated references are reference-quality targets under a frozen identity
  contract—not replacement blueprints. Preserve silhouette envelope, proportions, sockets,
  interfaces, role, and useful existing work. A visual mismatch authorizes revision of the deficient
  quality axis, never wholesale deletion or redesign.
- Whole-asset G1/G2/G4 requires an exact-candidate, hash-bound visual review recording original-
  resolution matched views, dominant inherited/retained-zone coverage, reference-parity evidence when
  used, unresolved P0/P1 defects, and `keep|revise|revert|blocked`. An inherited zone that dominates
  a supported view remains inside the whole-asset veto even when it was not edited.
- Require role-readable primary form, plausible construction, correct transforms, deliberate UV/bake
  work where applicable, physically coherent materials, authored screen-space LODs, stable sockets,
  provenance, reproducible source/build steps, measured representative-scene cost, and current
  player-camera evidence.
- Geometry, texture density, material count, and LOD are screen-space/profile decisions - not global
  quality ceilings. A historical count is a diagnostic only when tied to an exact scene and profile.
- Use the G0-G7 records in `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`. Tier A/B assets
  require an independent G7 review against the exact candidate hash.
- Run asset status/reachability/live-load/visual-stability checks and inspect the normal game route.
- Never edit generated release metadata by hand, weaken a check to ship a candidate, or wire an
  unaccepted candidate merely to make a check pass.
- When required evidence or tooling is unavailable, mark the exact gate `blocked`; do not translate the
  missing proof into completion prose.
