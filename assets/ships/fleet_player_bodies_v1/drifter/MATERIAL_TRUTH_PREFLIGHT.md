# Drifter material-truth preflight (PQ-050.02)

Class: player flyable multirole utility. Hitch untouched. Hornet identity not reused.

## C1 chase-form (2026-09-21)

Live authoring source for this leaf is `tools/blender/build_drifter_chase_form.py`
(`chase_form_v1`), not `build_drifter_mtx.py`. Principled islands only — no 512/1024
map density trap. Chase cameras only. No seats. Sockets and collision imported from
the live GLB and asserted unchanged. Hitch/Kestrel never loaded.

Cycle 1 shipped the REVISE from three chase reviews: the cargo well is a rimmed hole
(not an orange parking-lot lid), the greenhouse glass sits in the cut tub (not a roof
plate), nacelle stations grow out of the flank. Hitch still wins chase. Parent unproven.

## C2 chase-form (2026-09-21)

`chase_form_v2` on the same live sockets. Principled islands only. Hitch/Hornet untouched.

C1 remaining notes were panel language, hardware density, and stencil. C2 added chase-scale
flank plates and seam channels, outboard D2 plus starboard/dorsal 02 glyphs, thicker hoses,
fastener rows, dirt islands. Cargo well stays a rimmed hole; greenhouse stays glass in a cage
over a cut tub. Three chase reviews returned REVISE: Hitch still wins manufactured density at
D=144. Stencil now reads at close/abeam. No seats. No megatex. Parent unproven / not G7.

## C3 chase-form (2026-09-21)

`chase_form_v3` on the same live sockets. Principled islands only. Hitch/Hornet untouched.

C2 remaining note was Hitch-plus manufactured density at D=144. C3 enlarged nacelle armor tiles
and cheek plates, thickened spine/longerons/accent flanks, grew panel plates and seam channels,
bolts to 0.22, stronger hull/armor value split, split the dorsal cable tray so it no longer
spans the well mouth, and routed hoses beside the well. Cargo well stays a rimmed hole;
greenhouse stays glass in a cage over a cut tub. Three chase reviews returned REVISE: Hitch
still wins manufactured density at D=144. No seats. No megatex. Parent unproven / not G7.

## C4 chase-form (2026-09-21)

`chase_form_v4` on the same live sockets. Principled islands only. Hitch/Hornet untouched.

C3 remaining note was Hitch-plus manufactured density at D=144. C4 added a lower flank plate
course, more boolean seam channels, larger D2/02 on the winglets plus abeam hull-side D2/02,
thicker hoses, port+starboard split cable trays, vent banks, and more dirt islands. Cargo well
stays a rimmed hole; greenhouse stays glass in a cage over a cut tub. Three chase reviews
returned REVISE: Hitch still wins manufactured density at D=144. Rejected “well is a lid /
greenhouse missing / rebuild as voxel loft” (close stills show rimmed hole + cage over a cut
tub). No seats. No megatex. Parent unproven / not G7.

## C5 chase-form (2026-09-21)

`chase_form_v5` on the same live sockets. Principled islands only. Hitch/Hornet untouched.

Packet-minimum Hitch-plus close attempt. C5 cut inset panel channels into dorsal and
flank skin, added girth seams, replaced the equal-size plate carpet with mixed plate
sizes and clamp rails, thinned chevrons toward paint, added port dorsal + aft 02 and
more dirt islands. Cargo well stays a rimmed hole; greenhouse stays glass in a cage
over a cut tub. Side-by-side play_chase / abeam / close vs frozen Hitch: Hitch still
wins manufactured density at D=144. Three chase reviews REVISE. Hitch-plus chase is
not closed. No seats. No megatex. Parent unproven / not G7.

## C6 chase-form (2026-09-21)

`chase_form_v6` on the same live sockets. Principled islands only. Hitch/Hornet untouched.

Plate-stacking stalled. Before modeling, C5 stills vs Hitch named three chase-visible
failures: (1) silhouette as stacked blocks vs Hitch’s formed shell, (2) cargo well and
greenhouse not dominating as dark landmarks, (3) orange chevron/D2 bricks louder than
the hull. C6 rebuilt hull stations (fuller cargo waist, formed bow, faired nacelles),
enlarged the well and greenhouse as holes, quieted the hull, and cut hardware to three
clusters. Three chase reviews REVISE. Hitch still wins D=144. Hitch-plus chase is not
closed. No seats. No megatex. Parent unproven / not G7.

## C7 chase-form (2026-09-21)

`chase_form_v7` on the same live sockets and C6 shell. Principled islands only.
Hitch/Hornet untouched.

C6 remaining note was formed-shell / skin density at D=144. C7 kept stations, landmark
wells, and faired nacelles. It cut chase-scale girth and stringer channels into the hull,
added formed armor courses (not a plate carpet), clamp/fastener language that reads at
D=144, mixed albedo islands, and selective dirt. Three chase reviews REVISE. Close still:
well and greenhouse read as holes. Hitch still wins D=144. Hitch-plus chase is not closed.
No seats. No megatex. Parent unproven / not G7.

## 0. Frozen identity

~16.5 m overall, twin nacelle drives outboard aft, short winglets, front + rear guns,
muted teal-grey industrial paint, the eleven factory `SOCKET_*` names, `+X` forward /
`+Y` up / `+Z` starboard export contract, `SF_DRIFTER_PRODUCTION_V1` / `drifter_production_v1`.
Socket *positions* follow the hull after the form change; socket *names* and the export
contract do not move.

## 1. Visible-zone register

Supported review cameras are the live chase camera only — `tools/blender/spaceface_chase_camera.py`,
50 deg vertical FOV, 60 deg tilt, D=144 (`play_chase`, `play_chase_abeam`) and D=58
(`play_chase_close`). `drive_rear` is the bounded diagnostic for aft interfaces. Every zone
below was reclassified for cycle 28; nothing is inherited unreviewed.

| Zone | Class | Dominates a supported view | Fiction | Forbidden read |
|---|---|---|---|---|
| Pressure hull (bow → transom) | billed | yes, `play_chase` | One formed shell: rolled plate over ring frames, bow shoulder → flat working deck → cargo-well waist → machinery shoulder → transom | Three boxes; a tube with stuff on it |
| Nacelle pods + swept fairing roots | billed | yes, `play_chase` | Drive housings grown out of the flank on a continuous fairing; bolted cowl, refractory collar band, tapered aft fairing | Rectangular trailers parked alongside |
| Nacelle bill cowl + intake grille | billed | yes, `play_chase_close` | Bolted intake cowl over a louvred flank duct | A thin triangular card |
| Dorsal cargo well | billed | yes, `play_chase` | Skin-breaking two-level hold: lipped mouth, ribbed liner walls, dark lower floor, partial raised grating, deck rails, secured crates, gantry beam | A dark plate painted on the deck |
| Greenhouse / canopy | billed | yes, `play_chase_close` | Thin dark panes in a heavy alloy cage over a cut tub | A teal brick; a cockpit diorama |
| Drive throats | billed | yes, `play_chase_close` | True open alloy hoop, neutral fine-grain refractory sleeve, rooted vanes, lined bell behind | An emissive disc; capped cylinder; tan wood ring |
| Dorsal pod cooling slots | billed | yes, `play_chase` | Recessed fin banks on top of each pod | A painted rectangle |
| Deck radiator wells | billed | yes, `play_chase` | Fin cassettes in a rimmed deck well with header pipes | A glowing grate |
| Winglets + root fillet | billed | yes, `play_chase` | Short rooted stabiliser, thick root, separate slotted flap | A card of uniform thickness |
| Dorsal longerons, frames, spine beam | billed | yes, `play_chase` | The visible load path from bow through the well to the drive bulkhead | Decorative strips |
| Transom machinery face | billed | no (diagnostic `drive_rear.png` only) | Aft-shell opening with a rounded formed rim, recessed back plate, refractory fins, and header pipes | A blank wall; a rectangular box frame |
| Keel strake, ventral hatch, belly | outside_supported_view | no; `supportedViews: []` | Rubbing strake and cargo hatch | — |
| Cabin interior beyond the tub floor / console mass | outside_supported_view | no | — | Modelled seats billed as remaster work |

`allSupportedViewZonesClassified`: true. Independent original-resolution reviews returned
KEEP for the exact Cycle 28 play, close, and rear evidence listed in section 8.

## 2. Material bill

| Material | Substrate + process | Finish | Value role |
|---|---|---|---|
| `Material_Hull` | Rolled alloy plate over frames | Muted teal-grey polyurethane coat, clearcoat 0.34, dielectric; bare alloy only where the coating is lost on plate edges | Mid value, dominant area |
| `Material_Armor` | Thicker bolted plate / well liners | Dark grey-teal coat, part metallic where worn | Dark value, recesses |
| `Material_Mechanical` | Machined and brushed alloy | Metallic 0.96, directional tooling along the machine axis | Light value, frames, rims, rails |
| `Material_Ceramic` | Cast refractory | Neutral grey, non-metal, matte, almost-flat isotropic fine grain with sparse heat freckles | Quiet light ring inside the dark throat |
| `Material_Accent` | Sprayed faction stripe | Teal enamel, dielectric | Minority colour beat |
| `Material_Warning` | Sprayed hazard marking | Orange with broken diagonal chevrons, no thickness | Minority colour beat |
| `Material_Radiator` | Blackened fin stock | Dark, semi-metallic, fin-pitch structure | Dark value |
| `Material_Canopy` | Laminated dark glazing | Opaque dark dielectric with a coat; no transmission through a solid loft | Darkest value |
| `Material_Thruster` | Sooted liner inside the bell | Near-black with a recessed ember gradient | Recessed emission only |

Every generator is separate: plate carries seams and edge wear, machined alloy carries
directional tooling, refractory carries isotropic fine mineral variation, hazard carries
chevrons, glass carries neither. Plate and tooling periods are specified in **metres** and converted to pixels with
the measured texel density, so all nine materials share one physical surface scale.

## 3. Shape-grammar and close/rear failures repaired

Cycle 25 built `Cabin`, `Workshop` and `Drive_House` as three separately capped, separately
solidified lofts, parked two more lofts at `y = ±1.68` as nacelles, and bridged the gap with
2 m folded-sheet gloves plus a 2.40 m-chord winglet. The failure was construction, not finish.

Cycle 26 replaces the sequence: one continuous twelve-station loft (intermediate stations
interpolated at LOD0) with `flat` / `box` / `keel` morphing along the run; nacelle lofts whose
first three stations sit *inside* the hull so the root is a swept fairing; the gloves deleted;
the winglet cut to a 1.74 m root chord with a flared root fillet; wells cut through both skins
and lined; plates checkered along the length and around the girth so the shell is plated
rather than corrugated.

Cycle 28 retains that identity but repairs the actual close/rear causes: the lower aft rings
are softened while staying above the hull-triangle floor; the delete targets the separated
aft shell and exposes a rounded recessed machinery grille; thruster caps are true annuli;
aft deck covers hide the stretched whole-shell projection; and the hold has a lipped second
depth plane and partial grating. The Cycle 27 rear review still read the refractory map as
wood, so Cycle 28 reduces it to an almost-flat isotropic grey mineral surface.

## 4. `componentReferenceDecision`

`not_needed` for cycle 28. The four bounded component references generated for cycle 18 —
`reference/workboat_canopy_tub.png`, `nacelle_housing_fairing.png`, `winglet_root_airfoil.png`,
`cargo_well_rim_interior.png` — already cover every component this pass rebuilt, and their
construction logic (fairing into the chine, hoop-and-liner throat, rimmed well with ribbed
walls and secured cargo, thick root into a fillet, panes in a heavy cage) is what the new
geometry implements. No new generation was requested, and no generated pixels were used as
albedo, normal, AO or ORM data.

## 5. Reference-quality parity

Frozen: silhouette envelope class, ~16.5 m length, twin outboard nacelles, winglets, gun
positions, socket names, runtime role. Judged quality axes: rooted interfaces, section and
cavity depth, macro/meso/micro hierarchy, material differentiation, causal wear, supported-camera
surface response. Scored on the exact candidate by the independent reviewer, not here.

## 6. Inherited / retained zones

None. Every camera-visible zone is new geometry in this pass; the cycle-25 mesh was not
carried forward. The source texture generators were rewritten; nothing inherits a DCC default.

## 7. Working scene and supported cameras

The authoring source is `tools/blender/build_drifter_mtx.py` (deterministic, idempotent).
Every still in `evidence/drifter/cycles/cycle_28/` is rendered from the **finalised exported
LOD0 GLB**, re-imported into a clean scene — no working-scene beauty shots. The three
load-bearing stills are `play_chase`, `play_chase_abeam`, `play_chase_close` from
`spaceface_chase_camera.py`, at 2400x1800; the same three at the live 16:9 1600x900 aspect are
in `live_aspect_1600x900/`. Measured frame-width fractions are recorded in `cycle_28.json`.

## 8. Gate scope and evidence

Cycle 28 is the accepted authored candidate. G1/G2/G4 are KEEP on the exact original-resolution
evidence below. Reviewers had no edit authority; play/chase and close returned KEEP, Cycle 27
rear returned one mandatory refractory correction, and the corrected Cycle 28 rear returned KEEP.

| Evidence | SHA-256 | Verdict |
|---|---|---|
| `cycles/cycle_28/play_chase.png` | `5764C1042664811E0C9F3A197F86319EDF9761702AB49BD901752A1FFC935087` | KEEP |
| `cycles/cycle_28/play_chase_abeam.png` | `E11DDBEF09B4AE02DA0C79BC9A9619657DD43473BB2950FDF573D25346486B04` | KEEP |
| `cycles/cycle_28/play_chase_close.png` | `4633916F82B95CB46308428B1860696D9159E839C7739934DC71ED7B480226F3` | KEEP |
| `cycles/cycle_28/drive_rear.png` | `635295AD691B651F43FF1193386794A61B22D937047F9971D4EF85EF71FC6BCD` | KEEP |

The accepted GLB hashes are `CB3CB57979DB776FC608AC2C083B4000AEC54A8072E3ADC8861458F2A9AC1C41`
(LOD0), `76AE368D562AD71E0ABF9E548E1F1EF639BBD42A142884AE3C342CF162CEFECE`
(LOD1), and `E8A28E392CA52BFB1CC6A4416864435744B558406CAA347FDBC87FB65E22E0CB`
(LOD2). The authored ladder is 102154 / 41178 / 26046 triangles; LOD0 hull geometry is
56166 triangles, above the 49710 anti-regression floor.
