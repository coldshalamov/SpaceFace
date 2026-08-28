# Extractor — material and shape audit (Cycle 05)

Candidate `009AF84FAE250F84E218980E8F30FCDCB506B23FC7CAC2B673936D73A162658F` · root `SF_WORKS_EXTRACTOR_V1` · disposition `review_pending`.

Cycle 04's exact independent review returned REVISE. Its long pale parallel
bars read as forbidden forklift tines at 120 and 19 px. At legal works_site,
LOD1 lost the transverse head, dark belt, warm drive, and lamp hierarchy.
LOD2 popped to a generic U-frame without a stable crusher process read.

Cycle 05 preserves the same footprint, hooks, physical material families, UV
and bake corrections, and open +X process bite. It replaces the bars with
short broad-rooted splayed refractory cheek plates, adds a machined cutter
crown attached across the drum, preserves a warm service hatch in every LOD,
and roots the warm lamp hood/socket/bracket at every LOD with only restrained
lens self-light.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| Floor rails | C-channel loft at every LOD | Load-bearing C section stops before the crusher so it cannot close into a square | works_top, clay, site |
| Crossmembers | Hat-beam loft | Rooted into rails with gussets; not a box wall | works_top |
| Drive case | Waisted loft, narrower than rail span | Warm machinery-enamel gearbox with broad asymmetric service hatch retained through LOD2 | works_top / edge / site |
| Fins | Thin tall plates in a hat header | Air-gapped machined-steel heat path, not a vent grille | works_top |
| Mouth | Two cheeks, no +X wall/floor/roof; two short trapezoidal cheek plates | Open site-scale bite with strong outward splay and no parallel tine read | works_top / site |
| Drum / housings | Y-axis cylinder, bearing housings, attached transverse cutter crown and bonded hardface blocks | Bright physical segmented head under `head_face`, not an outline/card | works_top / edge / site |
| Jaws | Chunky refractory rim blocks plus broad-rooted forward cheeks | Dry replaceable plates framing the bite, not forklift bars or a grate | works_top / site |
| Belt | Long thin sagging ribbon + proud roller crowns + return | Near-black directional path from drive to crusher, with side/under void | works_top / edge / site |
| Lamp | Rooted bracket + warm cone hood + socket + recessed lens at every LOD | Warm fixture read carried by construction/material; lens emission restrained | works_edge / site |

## Material allocation

Blue-grey painted frame is dielectric (ORM metal low). Drum, rollers, fins,
and bearing housings are cool machined steel; pale bonded hardface inserts
carry the transverse diffuse head line. Jaw blocks are dry ochre
refractory, isolated from the housing. The warm drive case is machinery
enamel over steel rather than copper. The belt is near-black rubber. One warm
recessed lamp is the smallest value anchor. Rover yellow is absent. No plastic
copper, generic grid, universal edge wear, rail AO split, or emissive beacon.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited
into authored 1024² basecolor / normal / ORM. Unique non-overlapping UV0.

## LOD

LOD0 3128 / 8000. LOD1 916 / 2000.
LOD2 520 / 600. The splayed cheek mouth, cutter crown,
long belt, warm drive hatch, rooted lamp, and all three hooks survive. Exact
matched evidence is in `evidence/cycle_005/lod0_matched_120px.png` through
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

## First-render correction

The first Cycle 05 legal render showed that the honest metallic crown still
reflected too dark at LOD1/2. The final candidate adds segmented bonded dry
refractory hardface blocks attached to that crown. This is a manufactured
replaceable contact surface, not emission, outline, a card, or camera bias.

## Remaining route limits (honest)

- The candidate is not integrated, so no Browser/Electron normal-route capture
  can honestly show this hash. `works_site.png` is the best available legal
  Works-context evidence, not a substitute for G7.
- Site-scale identity is only ~22 px and must be judged at original resolution.
- Cycle 05 independent G1/G2/G4/G7 review has not run. This cycle closes none.
