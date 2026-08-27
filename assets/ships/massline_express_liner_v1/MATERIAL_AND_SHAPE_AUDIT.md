# Material and shape audit — Massline Express Liner v1

Planned asset identity: `SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1`
Scope: PQ-049.01 source candidate, chase-camera evidence
Whole-asset G1/G2/G4 status: **open — cycle 31 source candidate; independent review required; implementing verdict is review_pending / evidence_ready**
Candidate LOD0: `CC243E8499EBF2D6FA451CB30F9A369CFE9B1C8191737FF9B434633A3ADF4827`

## Visible-zone preflight

`MATERIAL_CONTRACT.json` is the visible-zone register. Every candidate-visible zone is `billed`.
The register remains `allSupportedViewZonesClassified: false` until an independent reviewer
confirms matched-camera coverage of the exact cycle-31 candidate hash.

## Shape grammar

| Camera-prominent form | Primitive risk | Required manufactured profile and function | Required rooted interface / later visible evidence | Disposition |
|---|---|---|---|---|
| Central passenger drum | A generic cylinder would read as a tube. | An 8-point octagonal pressure shell with three longitudinal beats: boarding bow, parallel occupied span, and tapered drive transfer. Cycle 31 keeps 1.81:1 by inhabited section and corridor volume, not a scaled egg. | Ceramic shell bridges to dark bulkhead stations, corridor roots, dock jambs, keel brackets, and dorsal well. | Billed; clay and grazing evidence required. |
| Operations wedge | A black cuboid or fighter canopy would read as a pasted-on cockpit. | Tapered, six-plane glazed boarding/operations volume with a pressure-shoulder frame and split pane geometry. | Dark rails return into the forward bulkhead; glazing is inset inside frame planes. | Billed. |
| Service cassette | A long box would read as a container. | Low folded-shell cassette with tapered end caps, twin removable bays, latches, drain/inspection plates, and no cargo aperture. | Suspended under pressure bulkhead/keel interfaces. | Billed. |
| Keel | A rectangular bar would read as a floating slab. | Four-station forged beam with a deeper tether station and paired boom-root shoes. | Gusset cheeks visibly bridge to pressure stations; cassette seats under it. | Billed. |
| Tether collar | A torus would read as a decorative ring. | Split saddle: two forged side cheeks, bridge pad, clamp caps, and diagonal gussets. | Lower non-passenger-facing keel and drum bulkhead roots. | Billed. |
| Dock/service interfaces | A painted rectangle would be a fake hatch. | Recess floor, ceramic jamb, dark bolt frame, flush conduit cover, and small embedded indicator fixture. | Separate port and starboard bulkhead positions; roots match nearby seams/spine feeds. | Billed. |
| Dorsal spine | Repeated cubes/fins would be generic greeble. | One hat-section equipment well, two differently sized radiator modules, and one offset repair plate. | Stays on the upper pressure stations; ends enter the aft load ring. | Billed. |
| Side passenger corridors | Flat wings or cards would fake occupancy. | Hollow equatorial corridor shells with wall thickness, framed smoked glass over a cavity, bulkhead returns, and a human-scale pane/door rhythm. | Outer faces carry dock/service contacts; load returns through chine roots and bulkhead collars. | Billed. |
| Aft drive booms | Smooth tubes and glowing disks would fail. | Tapered load-bearing booms from the aft load ring, dark forged cheeks, octagonal manufactured cases, hollow refractory bells, dark metal rims, and rooted stator vanes. | Paired roots tie into the load ring with intentionally visible centerline negative space. | Billed. |

## Edge and normal policy

- Ceramic pressure shell: broad formed breaks, controlled flat/faceted planes, no universal smoothing.
- Forged keel/frame: narrow machined chamfers and stronger hard-surface transitions at load faces.
- Folded service cassette/spine: crisp fold language with smaller seams and latch radii.
- Glass: thin, planar framed panes; no inflated bevel or opaque black substitute.
- Refractory throat: dry, faceted interior rim with visible depth; emission remains recessed and is reviewed with emission disabled.

The future builder must use intentional mesh edge segmentation and
`Auto Smooth`/weighted-normal-compatible output where the current Blender runtime supports it. A grazing
render remains required because node names and modifier presence are not visual proof.

## Material response audit

| Semantic material | Substance / manufacture | Optical target | Localized history | Forbidden read |
|---|---|---|---|---|
| `MAT_SF_Massline_CeramicPaint_WarmIvory` | Ceramic-painted pressure alloy | Warm low-sheen dielectric with broad broken highlights | Small dock-frame and seam abrasion only | Plastic yacht gelcoat / globally dirty white |
| `MAT_SF_Massline_Frame_DarkAnodized` | Forged and anodized frame alloy | Satin dark metal with directional response | Clean where sheltered; contact polish only at interfaces | Black plastic / rubber |
| `MAT_SF_Massline_Glazing_SmokedSafety` | Laminated smoked safety glazing | Blue-grey partial transmission and hard framed edge | Clearer at central panes, no dirt mask | Painted black cockpit |
| `MAT_SF_Massline_ServicePrimer_Galvanized` | Folded galvanized maintenance enclosure | Dull galvanized/primer response, not cargo paint | Latch/inspection handling only | Shipping container / freight pod |
| `MAT_SF_Massline_Keel_ForgedDark` | Forged tether/load hardware | Dark, denser and more directional than frame | Restricted tether-contact polish | Decorative hoop / black plastic |
| `MAT_SF_Massline_RefractoryHeatAlloy` | Dry refractory/heat-alloy throat liner | Rough dark brown-grey with a local heat shift | Heat only inside/rear of throats | Smooth chrome nozzle / glowing disk |
| `MAT_SF_Massline_WayfindingCyan` / `MAT_SF_Massline_WayfindingAmber` | Protected indicator inserts | Low-luminance colored fixtures | No dirt; physically framed | Neon skin / unmotivated stripe |

## Planned LOD preservation

| LOD | Intended band | Preserved identity | Intentionally removed or merged |
|---|---:|---|---|
| LOD0 | 220–540 px, tether/dock | Must retain glazing frame, separate docking jambs, saddle gussets, latches, cooling slots, and deep throat liner. | May omit only sub-pixel fasteners. |
| LOD1 | 90–220 px, ordinary traffic | Must retain wedge/frame hierarchy, stepped drum, cassette/keel relation, dock recess blocks, dorsal spine, and twin cavities. | May merge latch/bolt and narrow cooling repetition into broader construction planes. |
| LOD2 | ≤90 px, including `probe_32px` far traffic | Must retain wedge, stepped pressure drum, lower dark keel/cassette line, and two aft drive masses. | May collapse internal throat facets and small docking fixture detail while drive separation remains. |

## Defect posture after cycle 31

Cycle 30's legal 1.81:1 barrel still read as a flattened ivory capsule with card
galleries, a black boarding bite, stay-cabled cans, identical roof boxes, and
beige/black plastic maps. Cycle 31 rebuilds a stepped octagonal inhabited body
(40.67 x 22.41 x 11.05 m, L/B 1.81) with hollow corridors, a boarding vestibule,
rooted drive plant, and a civic dorsal well. Default occupancy 17.47%, abeam 9.77%,
close 45.74%, all uncropped. Unique maps show meso and cavity AO; yellow normal
wedges are gone. Whole-asset G1/G2/G4 stay open until an independent hash-bound
review of those chase stills. No technical build report is treated as a pass.
