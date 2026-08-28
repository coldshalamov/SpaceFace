# Material and shape audit — Massline Express Liner v1

Planned asset identity: `SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1`
Scope: PQ-049.01 source candidate, chase-camera evidence
Whole-asset G1/G2/G4 status: **open — Cycle 34 source candidate; implementing verdict is REVISE / evidence_ready**
Candidate LOD0: `256454E3CF02C4EB34AEE1069C6047DBF336351E94041A196DC94D818FA85208`

## Visible-zone preflight

`MATERIAL_CONTRACT.json` is the visible-zone register. Every candidate-visible zone is `billed`.
The register remains `allSupportedViewZonesClassified: false` until an independent reviewer
confirms matched-camera coverage of the exact Cycle 34 candidate hash.

## Shape grammar

| Camera-prominent form | Primitive risk | Required manufactured profile and function | Required rooted interface / later visible evidence | Disposition |
|---|---|---|---|---|
| Central passenger drum | A generic cylinder or uninterrupted deck would read as a tube/slab. | Three visibly stepped octagonal passenger sections with sharp manufactured shoulders and six paired, physically recessed deck-edge gallery wells. Cycle 34 preserves the 1.81:1 envelope while changing the legal D=144 hierarchy. | Ceramic shell bridges to five full-height hat stations, corridor/gallery frames, dock jambs, keel brackets, and dorsal well. | Billed; hierarchy improved, independent verdict pending. |
| Operations wedge | A black cuboid or fighter canopy would read as a pasted-on cockpit. | Tapered, six-plane glazed boarding/operations volume with a pressure-shoulder frame and split pane geometry. | Dark rails return into the forward bulkhead; glazing is inset inside frame planes. | Billed. |
| Service cassette | A long box would read as a container. | Low folded-shell cassette with tapered end caps, twin removable bays, latches, drain/inspection plates, and no cargo aperture. | Suspended under pressure bulkhead/keel interfaces. | Billed. |
| Keel | A rectangular bar would read as a floating slab. | Four-station forged beam with a deeper tether station and paired boom-root shoes. | Gusset cheeks visibly bridge to pressure stations; cassette seats under it. | Billed. |
| Tether collar | A torus would read as a decorative ring. | Split saddle: two forged side cheeks, bridge pad, clamp caps, and diagonal gussets. | Lower non-passenger-facing keel and drum bulkhead roots. | Billed. |
| Dock/service interfaces | A painted rectangle would be a fake hatch. | Recess floor, ceramic jamb, dark bolt frame, flush conduit cover, and small embedded indicator fixture. | Separate port and starboard bulkhead positions; roots match nearby seams/spine feeds. | Billed. |
| Dorsal spine | Repeated cubes/fins would be generic greeble. | One hat-section equipment well, two differently sized radiator modules, and one offset repair plate. | Stays on the upper pressure stations; ends enter the aft load ring. | Billed. |
| Side passenger corridors | Flat wings or cards would fake occupancy. | Hollow equatorial corridor shells grown from the passenger station, with inner wall, formed sill/header, four pane/door bays, mullions, and returns into hat-section collars. | Outer faces carry dock/service contacts; load returns through chine roots and bulkhead collars. | Billed. |
| Aft drive housings | Stick booms and hanging cans would fail. | Thick tapered cases overlap the widened aft load shoulder, cross the outboard transition in 2.75 m rather than 4.55 m, and retain thick dark-metal throats, dry refractory liners, and six rooted stator blades. Pale shoulder armor identifies the case before the bore. | Paired roots tie into the 6.40 m load ring through enlarged shoes and gussets while retaining centerline negative space. | Billed; improved but long cases remain an independent-review risk at D=144. |

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

## Defect posture after Cycle 34

Cycle 34 changes the broad parallel course into three stepped pressure sections with width/height
shoulders at 9.25, 6.50, 2.20, and -1.20 m. Six paired gallery wells move the inhabited rhythm toward
the deck edges, so the default chase and abeam frames show large dark glazing rather than tiny central
cards. Five full-height hat sections make the passenger bulkheads legible in clay. The aft body now
terminates in a 6.25 m pressure shoulder and 6.40 m dark load ring; each 2.30 m-root drive case overlaps
that shoulder, reaches its outboard line over a 2.75 m transition, and carries visible ceramic shoulder
armor before the bore.

Ceramic, anodized frame, smoked glazing, service primer, and forged keel now use separated gameplay
values. All three GLBs export the exact unsuffixed semantic material names recorded here, all 13 socket
empties, and `COLLISION_HULL`. Bounds remain 40.67 x 22.45 x 10.99 m (L/B 1.81); LOD0/1 occupancy is
17.45%, 9.80%, and 44.96%, all uncropped. Matched LOD2 evidence is also in band. Implementing review
keeps the whole asset at `REVISE`: the drive pair may still read as long prongs at D=144 and the abeam
passenger belt remains broad. Whole-asset G1/G2/G4 remain open; no technical report is a visual pass.
