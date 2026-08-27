# Extractor Cycle 03 — original-resolution inspect

Candidate `3321E047FB1D4158FB805C733D31C167BE337D406EB6AF7B791F5D011E6AFB0D`.
Disposition **`review_pending`**. Independent reviewers were not launched.
G1/G2/G4/G7 remain open.

Inspected once at 1920×1080 (`works_top`, clay, edge, grazing, site, normal, ORM,
material ID, hook identity) plus centre crops. Cycle 01 and Cycle 02 evidence
are byte-frozen. Cycle 02 `works_site` at 19 px/cell remains a KEEP.

## Cycle 02 defects vs this still

| Cycle 02 review | Cycle 03 still |
|---|---|
| +X closed black pit / vent box | Open aperture; tan pad through the bite |
| Drum lost in the well | Y-axis tool-steel drum on rail-top circular housings |
| Jaw tiles too small | 3–4 chunky dry-refractory blocks on the rim |
| Belt as filled trough | Thin ribbon over proud roller crowns, side/under void |
| Fins as vent grille | Fewer, thinner, taller air-gapped plates |
| Paint/ORM metal + rail AO split | Dielectric frame, isolated ceramic, restrained gearbox heat |

## Pixel / camera facts

- Legal cameras only: `works_top` / `works_edge` / `works_site`, 31° PERS, 1920×1080.
- `works_top` machine bbox ≈ [130, 130] px at 120 px/cell.
- `works_top` tan bite px: 10 (target 8–10).
- `works_site` pad+machine bbox ≈ [22, 22] px at 19 px/cell.
- Hooks `head_face`, `belt`, `lamp` present. Root `SF_WORKS_EXTRACTOR_V1`.
- LOD0 2776 / 8000 · LOD1 820 / 2000 · LOD2 416 / 600.
- Envelope [1.865, 1.5952, 0.8] wu, underside z=0, +X feed.
- Hidden-face dry-run: 3975 / 4012 hidden (per LOD).

## Remaining risk (honest)

- Site register is a handful of pixels; U-rails vs bite will still be the identity.
- Jaw blocks are faceted refractory, not a lofted jaw profile.
- This is a source candidate. Not wired, not released, not accepted.
