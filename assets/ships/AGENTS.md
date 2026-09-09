# assets/ships/ agent notes

Ship/place authoring inputs, release outputs, evidence, and the manifests that bridge them to
runtime. Exact machine records outrank prose inventories.

## Before editing or exporting

- Check active lock, building, previous-release, and authoring signals. Coordinate rather than
  deleting, rebuilding, or promoting over live work.
- Read `assets/ships/parts/parts_manifest.json`, the generated release manifest, and the maps in
  `src/render/partsLibrary.js`. Source is authoring input; default runtime loads **release**.
- For visual authoring or remaster work, read `docs/visual-assets/README.md` and
  `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` (G0–G7 is the definition of done).
- For every Blender/GLB form or surfacing change, load
  `.grok/skills/spaceface-blender-material-truth/SKILL.md` and complete its **preflight** before
  modeling. Follow `docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md` and fill a
  `TECHNIQUE_LEDGER.json`. When the packet cites
  `docs/visual-assets/MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md` (including PQ-050), run its required
  cycles. A factory loft, tinted shared sheet, zoomed gray crop, or script success does not
  implement an MTX row. No changed visible zone may inherit a DCC default. The skill may add
  techniques but never weaken G0–G7.

Never copy the current ship roster into instructions. Inspect exact manifest IDs and live
def/role/archetype/modular maps. Never infer family status from an old filename or prose summary.

Canonical states: `blockout`, `design_candidate`, `production_model`, `bake_candidate`,
`surfaced_candidate`, `integration_candidate`, `accepted`, `blocked`, `deprecated`.
`done` / `finished` / `production-ready` / `shippable` mean `accepted`.

## Promotion contract

Technical validity, performance validity, and visual acceptance are separate proofs. A valid GLB or
green exporter cannot set final visual acceptance. A technical receipt may mark `evidence_ready`; it
cannot close G1, G2, or G4. Every gate result names its scope (`component`, `zone`, or
`whole_asset`). A **component-scoped** pass never implies a **whole-asset** pass.

For remasters, generated references are quality targets under a frozen identity contract — not
replacement blueprints. A visual mismatch authorizes revision of the deficient axis, never wholesale
deletion. Whole-asset G1/G2/G4 needs an exact-candidate, hash-bound visual review of
original-resolution matched views, including dominant inherited/retained zones;
`keep|revise|revert|blocked`.

Geometry, texture density, material count, and LOD are screen-space/profile decisions, not global
ceilings. Tier A/B needs independent G7 review against the exact candidate hash. Never edit
generated release metadata by hand, weaken a check to ship a candidate, or wire an unaccepted
candidate merely to make a check pass. Missing evidence → mark the exact gate `blocked`.
