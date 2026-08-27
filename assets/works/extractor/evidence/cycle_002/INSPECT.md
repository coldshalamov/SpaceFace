# Extractor Cycle 02 — original-resolution inspect

Candidate `83195A4138464004C6F80C7730EDFCEBAD0E2174A930CE22AEF51DCF6C203178`.
Disposition **`review_pending`**. Independent reviewers were not launched.
G1/G2/G4/G7 remain open.

Inspected once at 1920×1080 (`works_top`, clay, edge, grazing, site, normal, ORM,
material ID, hook identity) plus centre crops. One geometry correction after the
first build (LOD1/2 over budget; mouth flanges; 2-station C-rails). No third pass.

## Cycle 01 defects vs this still

| Cycle 01 review | Cycle 02 still |
|---|---|
| +X closed diagonal grate/brick | Open rectangular well on +X. No hatch, no saw-grate. |
| No yoke / drum read | Clay: drum and yoke arms in the well. Textured: steel drum is quiet in the shadow. |
| Belt as filled trough box | Thin dark ribbon between rails; clay shows rollers and a return gap. |
| Aft frame/drive as one slab | Separate C-rails, waisted case, fin comb with air. |
| Site cavity in the wrong place | +X well is the dark bite; belt is the darker inboard ribbon. |

## Pixel / camera facts

- Legal cameras only: `works_top` / `works_edge` / `works_site`, 31° PERS, 1920×1080.
- `works_top` machine bbox ≈ 130×130 px at 120 px/cell.
- `works_site` pad+machine bbox ≈ 22×22 px at 19 px/cell. The pad is the 2.4 wu
  cell floor; the machine is smaller inside it. Automatic dark-span on that pad
  bbox is not the bite. Visual: darker +X extension between the two rails.
- Hooks `head_face`, `belt`, `lamp` present. Root `SF_WORKS_EXTRACTOR_V1`.
- LOD0 3192 / 8000 · LOD1 944 / 2000 · LOD2 436 / 600.
- Envelope 1.865 × 1.595 × 0.78 wu, underside z=0, +X feed.

## Remaining risk (honest)

- The well floor is near-black, so the drum is easy to lose in the textured top.
- Site register is a handful of pixels; U-rails vs bite will be a review call.
- Jaw tiles are still faceted blocks on the rim.
- This is a source candidate. Not wired, not released, not accepted.
