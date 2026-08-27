# Extractor — material and shape audit (Cycle 02)

Candidate `83195A4138464004C6F80C7730EDFCEBAD0E2174A930CE22AEF51DCF6C203178` · root `SF_WORKS_EXTRACTOR_V1` · disposition `review_pending`.

Cycle 01 reviews converged on a closed +X grate/brick, a filled trough box, an
aft slab, and a site silhouette that put the cavity in the wrong place. Cycle 02
deletes the hatch/grate and the roof plate, opens a five-wall well toward +X,
roots a Y-axis drum in yoke bearings, replaces the pan with a ribbon belt, and
keeps the aft as open C-channel, a serviceable case, and a rooted fin comb.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| Floor rails | C-channel loft at every LOD | Load-bearing C section, open +X, pad feet at z=0 | works_top, clay, site |
| Crossmembers | Hat-beam loft | Rooted into rails with gussets; not a box wall | works_top |
| Drive case | Waisted loft, narrower than rail span | Heat-stained gearbox, access cover, ochre lip | works_top / edge |
| Fins | Thin plates in a hat header | Rooted comb with air between plates | works_top |
| Mouth | Five-wall shell, no +X wall, no roof plate | Near-black well open to the feed cell | works_top, site |
| Drum / yoke | Cylinder + lofted arms + round bosses | Aimable head under `head_face`, forward +X | works_top / edge |
| Jaws | Chunky ceramic tiles on the rim only | Dry tiles facing into the well, not a grate | works_top |
| Belt | Thin sagging ribbon + rollers + return | Open trough space; UV1 along +X | works_top / edge |
| Lamp | Cone hood + socket + recessed lens | One fixture; exists with emission off | works_edge |

## Material allocation

Dark painted structure, worn cutting/roller metal, heat-stained drive, dry
ceramic jaws on the rim only, rubber belt, near-black well interior, one ochre
accent, one warm recessed lens. Rover yellow is absent. No plastic copper,
generic grid, universal edge wear, or unreadable bolt rows.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited
into authored 1024² basecolor / normal / ORM. Unique non-overlapping UV0.

## LOD

LOD0 3192 / 8000. LOD1 944 / 2000.
LOD2 436 / 600. Open mouth, bearing-rooted head,
belt gap, rails/fins, and all three hooks survive. Hidden faces per LOD only.

## Pixel facts (original 1920×1080)

- works_top machine size px: [130, 130]
- works_site machine size px: [22, 22]
- works_site +X dark span px: 0 (target 4–6)
- works_site well darker than rails: True

## Remaining visual risk (honest)

- Site register (~19 px/cell) can still merge the drum into the well; identity
  depends on the open +X bite between the two U rails and the darker inboard ribbon.
- Jaw tiles are faceted blocks; a later cycle may loft a true jaw profile if
  reviewers still read a rim stud row.
- Independent G1/G2/G4 review has not run. This cycle does not close them.
