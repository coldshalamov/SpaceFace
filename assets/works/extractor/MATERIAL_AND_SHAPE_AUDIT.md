# Extractor — material and shape audit (Cycle 04)

Candidate `305E23833198CDA9EB1BBFDCAEA47E9C070B25049A31EA9A079F1DD1536A9A4B` · root `SF_WORKS_EXTRACTOR_V1` · disposition `review_pending`.

Cycle 03's exact independent review returned REVISE. At legal 19 px/cell it
collapsed to a dim square/U-frame; feed direction, belt/head hierarchy, and
the lamp anchor did not read. At 120 px/cell paint, steel, refractory, rubber,
and the drive case collapsed into the same dark value family. The supported-
view zone register and matched LOD/normal-route evidence were incomplete.

Cycle 04 preserves the same footprint, hooks, and crushing process while
giving the +X mouth two pale splayed refractory noses, lengthening the dark
inboard belt, enlarging the bright crosswise drum, rooting the hooded lamp,
and separating cool painted frame, bare steel, dry refractory, black rubber,
and warm drive enamel by value as well as physical response.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| Floor rails | C-channel loft at every LOD | Load-bearing C section stops before the crusher so it cannot close into a square | works_top, clay, site |
| Crossmembers | Hat-beam loft | Rooted into rails with gussets; not a box wall | works_top |
| Drive case | Waisted loft, narrower than rail span | Warm machinery-enamel gearbox with broad asymmetric service hatch | works_top / edge / site |
| Fins | Thin tall plates in a hat header | Air-gapped machined-steel heat path, not a vent grille | works_top |
| Mouth | Two cheeks, no +X wall/floor/roof; two splayed feed noses | Open 2–3 px site-scale bite and explicit +X feed direction | works_top / site |
| Drum / housings | Y-axis cylinder + Z-up circular housings on rail tops | Bright crosswise tool-steel head under `head_face` | works_top / edge / site |
| Jaws | Chunky refractory rim blocks plus paired forward noses | Dry replaceable tiles framing the bite, not a grate | works_top / site |
| Belt | Long thin sagging ribbon + proud roller crowns + return | Near-black directional path from drive to crusher, with side/under void | works_top / edge / site |
| Lamp | Rooted bracket + cone hood + socket + recessed lens | One warm port-side fixture; readable without becoming a beacon | works_edge / site |

## Material allocation

Blue-grey painted frame is dielectric (ORM metal low). Drum, rollers, fins,
and bearing housings are cool bright machined steel. Jaw blocks are dry ochre
refractory, isolated from the housing. The warm drive case is machinery
enamel over steel rather than copper. The belt is near-black rubber. One warm
recessed lamp is the smallest value anchor. Rover yellow is absent. No plastic
copper, generic grid, universal edge wear, rail AO split, or emissive beacon.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited
into authored 1024² basecolor / normal / ORM. Unique non-overlapping UV0.

## LOD

LOD0 2908 / 8000. LOD1 844 / 2000.
LOD2 440 / 600. The forked mouth, crosswise head,
long belt, warm drive mass, rooted lamp, and all three hooks survive. Exact
matched evidence is in `evidence/cycle_004/lod0_matched_120px.png` through
`lod2_matched_120px.png`. Hidden faces are evaluated per LOD only.

## Pixel facts (original 1920×1080)

- works_top machine size px: [130, 130]
- works_top tan bite px: 10 (target 8–10)
- works_site machine size px: [22, 22]
- works_site +X dark span px: 0
- works_site well darker than rails: True

## Supported-view coverage

`SUPPORTED_VIEW_ZONE_REGISTER.json` bills every visible zone in works_top,
works_edge, and works_site. Coverage is author-complete but
`allSupportedViewZonesClassified` remains false until an independent exact-hash
reviewer confirms it, as required by the material-truth contract.

## Remaining route limits (honest)

- The candidate is not integrated, so no Browser/Electron normal-route capture
  can honestly show this hash. `works_site.png` is the best available legal
  Works-context evidence, not a substitute for G7.
- Site-scale identity is only ~22 px and must be judged at original resolution.
- Cycle 04 independent G1/G2/G4/G7 review has not run. This cycle closes none.
