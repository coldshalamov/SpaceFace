# Extractor Cycle 06 — original-resolution inspect

Candidate `3E071A9A7A143480AF6A09088F032207153D441D4A0D3E0409BD5EBA21D92BA8`.
Disposition **`review_pending`**. Independent reviewers were not launched.
G1/G2/G4/G7 remain open.

Inspected once at 1920×1080 (`works_top`, clay, edge, grazing, site, matched
LOD0/1/2, LOD2 switch band, normal, ORM, explicit material ID, hook identity)
plus centre crops. Cycle 01 through Cycle 05 evidence are byte-frozen. Cycle
05's exact-hash verdict remains REVISE; this is the correction candidate.

## Cycle 05 independent REVISE vs this candidate

| Cycle 05 review | Cycle 06 candidate evidence |
|---|---|
| Paired pale free ends still read as forklift prongs | Broad painted lateral shoulders carry short refractory liners on their inward faces; no pale longitudinal free ends remain |
| Material-ID image was grayscale fallback | Unlit exact-export UV0 ID-atlas render; role counts `{'structure': 3117, 'cutting': 1100, 'drive': 606, 'ceramic': 393, 'belt': 307, 'lamp': 42, 'accent': 141}` and missing roles `[]` |
| No honest LOD2 projected-size proof | LOD2 switch-band still measures [42, 42] px against target [34, 45] |
| Current source/producer binding incomplete | Epoch records exact source/parts/image hashes, renderer path/hash, camera, ID roles, and frozen Cycle 05 hashes |
| Exact route still absent | Honest Works-context evidence plus explicit integration limitation; G7 stays open |

## Pixel / camera facts

- Legal cameras only: `works_top` / `works_edge` / `works_site`, 31° PERS, 1920×1080.
- `works_top` machine bbox ≈ [130, 130] px at 120 px/cell.
- `works_top` tan bite px: 10 (target 8–10).
- `works_site` pad+machine bbox ≈ [22, 22] px at 19 px/cell.
- `lod2_switch_band` machine bbox ≈ [42, 42] px at 37.0 px/cell.
- Material-ID all roles visible: True.
- Hooks `head_face`, `belt`, `lamp` present. Root `SF_WORKS_EXTRACTOR_V1`.
- LOD0 3112 / 8000 · LOD1 916 / 2000 · LOD2 544 / 600.
- Envelope [1.675, 1.5952, 0.8] wu, underside z=0, +X feed.
- Hidden-face dry-run: 4535 / 4572 hidden (per LOD).

Cycle 06 keeps the non-emissive bonded refractory hardface from Cycle 05 and
changes only the intake shoulder/liner construction plus evidence binding.
Cameras and lighting are unchanged except for the explicit LOD2-distance still.

## Remaining risk (honest)

- Site register is still only ~22 pixels; original-resolution judgment is required.
- Author-side zone coverage and matched evidence do not replace independent review.
- The source candidate is not on the Browser/Electron route; G7 remains open.
- This is a source candidate. Not wired, not released, not accepted.
