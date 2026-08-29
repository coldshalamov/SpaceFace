# Material and shape audit — Massline Express Liner v1

Planned asset identity: `SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1`
Scope: PQ-049.01 source candidate, chase-camera evidence
Whole-asset G1/G2/G4 status: **open — Cycle 35 source candidate; implementing iteration decision is KEEP / evidence_ready; controller review pending**
Candidate LOD0: `8D0668D2131B7C27ED2612B052F162C2B573F97FA2E7E7709D2FBD054A5F978C`

## Visible-zone preflight

`MATERIAL_CONTRACT.json` is the visible-zone register. Every candidate-visible zone is `billed`.
The register remains `allSupportedViewZonesClassified: false` until an independent reviewer
confirms matched-camera coverage of the exact Cycle 35 candidate hash.

## Shape grammar

| Camera-prominent form | Primitive risk | Required manufactured profile and function | Required rooted interface / later visible evidence | Disposition |
|---|---|---|---|---|
| Central passenger drum | A generic cylinder or uninterrupted deck would read as a tube/slab. | Three visibly stepped octagonal passenger sections with sharp manufactured shoulders and six paired, physically recessed deck-edge gallery wells. Cycle 35 keeps a civic 1.94:1 pressure-vessel envelope while changing the legal D=144 hierarchy. | Ceramic shell bridges to five full-height hat stations, corridor/gallery frames, dock jambs, keel brackets, and dorsal well. | Billed; hierarchy improved, independent verdict pending. |
| Operations wedge | A black cuboid or fighter canopy would read as a pasted-on cockpit. | Blunt, six-plane glazed boarding/operations volume with a pressure-shoulder frame and split pane geometry. | Dark rails return into the forward bulkhead; glazing is inset inside frame planes. | Billed. |
| Service cassette | A long box would read as a container. | Low folded-shell cassette with tapered end caps, twin removable bays, latches, drain/inspection plates, and no cargo aperture. | Suspended under pressure bulkhead/keel interfaces. | Billed. |
| Keel | A rectangular bar would read as a floating slab. | Four-station forged beam with a deeper tether station and paired boom-root shoes. | Gusset cheeks visibly bridge to pressure stations; cassette seats under it. | Billed. |
| Tether collar | A torus would read as a decorative ring. | Split saddle: two forged side cheeks, bridge pad, clamp caps, and diagonal gussets. | Lower non-passenger-facing keel and drum bulkhead roots. | Billed. |
| Dock/service interfaces | A painted rectangle would be a fake hatch. | Recess floor, ceramic jamb, dark bolt frame, flush conduit cover, and small embedded indicator fixture. | Separate port and starboard bulkhead positions; roots match nearby seams/spine feeds. | Billed. |
| Dorsal spine | Repeated cubes/fins would be generic greeble. | One hat-section equipment well, two differently sized radiator modules, and one offset repair plate. | Stays on the upper pressure stations; ends enter the aft load ring. | Billed. |
| Side passenger corridors | Flat wings or cards would fake occupancy. | Hollow equatorial corridor shells grown from the passenger station, with inner wall, formed sill/header, four pane/door bays, mullions, and returns into hat-section collars. | Outer faces carry dock/service contacts; load returns through chine roots and bulkhead collars. | Billed. |
| Aft drive housings | Stick booms and hanging cans would fail. | A tapered central afterbody overlaps both case roots and ends before their bores. Two short near-axial dark-alloy cases retain thick dark-metal throats, dry refractory liners, and six rooted stator blades; pale structural bands identify each case before the bore. | The central bridge and paired saddles tie into the 6.40 m load ring through enlarged shoes and gussets while retaining two distinct throat cavities. | Billed; Cycle 35 eliminates the long swept prongs. Independent review still owns the residual twin-throat separation decision. |

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

## Defect posture after Cycle 35

Cycle 35 retains the three stepped pressure sections with width/height
shoulders at 9.25, 6.50, 2.20, and -1.20 m. Six paired gallery wells move the inhabited rhythm toward
the deck edges, so the default chase and abeam frames show large dark glazing rather than tiny central
cards. Five full-height hat sections make the passenger bulkheads legible in clay. The aft body now terminates in a 6.25 m pressure shoulder and 6.40 m dark load ring. A tapered central propulsion afterbody overlaps both near-axial case roots and reaches x=-16.55 m before splitting into two short manufactured cases. Each case carries visible ceramic structural bands before its dry bore.

Ceramic, anodized frame, smoked glazing, service primer, and forged keel now use separated gameplay
values. All three GLBs export the exact unsuffixed semantic material names recorded here, all 13 socket
empties, and `COLLISION_HULL`. Bounds are 40.27 x 20.75 x 11.11 m (L/B 1.94); LOD0/1 occupancy is 17.19%, 9.08%, and 43.92%, all uncropped. LOD1 default/abeam evidence measures 187.4/98.1 px inside its 90–220 px band; LOD2 measures 81.4/42.2 px inside its <=90 px band, with a matched 89.0 px transition pair. Implementing review records `KEEP` for controller review: the former pincer, cross/arrow, opaque-black glazing, and out-of-band evidence defects are materially corrected. Whole-asset G1/G2/G4 remain open until independent review; no technical report is a visual pass.
