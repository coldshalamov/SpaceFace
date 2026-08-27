# Extractor — material and shape audit (Cycle 03)

Candidate `D3635431D2A68FF811AAB443AEBB5CC1EE233EC2B3F4E455B6841C874823729C` · root `SF_WORKS_EXTRACTOR_V1` · disposition `review_pending`.

Cycle 02 site still at legal 19 px/cell is a KEEP and is frozen. Top, edge and
material reviews returned REVISE: the mouth was still a black pit, the drum
was lost in that pit, jaws were stud-scale, the belt still read as a trough,
fins packed into a grille, and paint/ORM treated the frame as metal with a
rail AO split.

Cycle 03 cuts the remaining +X floor/wall so tan pad shows through the bite,
plants a lit Y-axis tool-steel drum on circular housings rooted on the rail
tops, puts 3–4 chunky dry-refractory jaw blocks on the rim, thins the belt
to a ribbon over roller crowns, air-gaps the fin plates, and restores
dielectric paint / isolated ceramic / restrained gearbox heat.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| Floor rails | C-channel loft at every LOD | Load-bearing C section, open +X, pad feet at z=0 | works_top, clay, site |
| Crossmembers | Hat-beam loft | Rooted into rails with gussets; not a box wall | works_top |
| Drive case | Waisted loft, narrower than rail span | Gearbox with restrained heat, access cover, ochre lip | works_top / edge |
| Fins | Thin tall plates in a hat header | Air-gapped machined-steel heat path, not a vent grille | works_top |
| Mouth | Two cheeks, no +X wall, no floor in the bite, no roof | Open aperture; tan pad through 8–10 px at 120 px/cell | works_top, site |
| Drum / housings | Y-axis cylinder + Z-up circular housings on rail tops | Lit tool-steel crusher under `head_face` | works_top / edge |
| Jaws | 3–4 chunky refractory blocks on the rim | Dry tiles facing the bite, not a grate | works_top |
| Belt | Thin sagging ribbon + proud roller crowns + return | Side and under void; UV1 along +X | works_top / edge |
| Lamp | Cone hood + socket + recessed lens | One fixture; hood/socket readable; not a beacon | works_edge |

## Material allocation

Painted frame is dielectric (ORM metal low). Drum, rollers, fins and bearing
housings are worn machined steel. Jaw blocks are dry refractory, isolated
from the housing. Gearbox carries restrained heat stain only. Belt is rubber.
One ochre accent, one warm recessed lens. Rover yellow is absent. No plastic
copper, generic grid, universal edge wear, rail AO split, or unreadable bolt
rows.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited
into authored 1024² basecolor / normal / ORM. Unique non-overlapping UV0.

## LOD

LOD0 2776 / 8000. LOD1 820 / 2000.
LOD2 416 / 600. Open mouth, bearing-rooted head,
belt gap, rails/fins, and all three hooks survive. Hidden faces per LOD only.

## Pixel facts (original 1920×1080)

- works_top machine size px: [130, 130]
- works_top tan bite px: 10 (target 8–10)
- works_site machine size px: [22, 22]
- works_site +X dark span px: 0
- works_site well darker than rails: True

## Remaining visual risk (honest)

- Site register (~19 px/cell) still cannot resolve the drum as a separate
  cylinder; identity depends on the U-rails, the open +X bite, and the darker
  inboard ribbon.
- Jaw blocks are faceted refractory, not a lofted jaw profile.
- Independent G1/G2/G4 review has not run. This cycle does not close them.
