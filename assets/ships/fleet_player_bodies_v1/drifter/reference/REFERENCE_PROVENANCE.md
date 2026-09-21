# Drifter component-reference provenance

Generated construction aids. Not identity. Not evidence of quality. Not a pixel target.

Frozen identity stays the factory utility: ~16 m, twin nacelle drives, short winglets,
front+rear guns, teal-grey paint, existing socket *names*. Positions follow the hull
after any form change. Do not copy Hornet's interceptor silhouette.

## 2026-08-19 (cycle 18 campaign seven-pass)

Generated with the session image tool before modeling. Construction crops, not beauty shots.

| File | Component | Tool | What it is used to decide | Selected | Rejected |
|---|---|---|---|---|---|
| `workboat_canopy_tub.png` | cockpit greenhouse | Cursor GenerateImage, 2026-08-19 | Whether the canopy sits on a cut hole with rim thickness, five interior walls, and a thin framed shell | Recessed tub; seat/console smaller than the mouth; 1–2 cm glass in a metal cage | Solid teal brick; fighter bubble; leather interior |
| `nacelle_housing_fairing.png` | drive nacelle | Cursor GenerateImage, 2026-08-19 | Nacelle grown out of the flank with a hollow bell, collar, and vanes | Fairing into the chine; flare you can see into; vanes with roots | Cylinder glued on; glowing disc; gold jewelry |
| `winglet_root_airfoil.png` | winglet root | Cursor GenerateImage, 2026-08-19 | Thick root, thinner tip, fillet into the flank, separate flap with a slot | Diamond/airfoil section; visible gap at the flap | Card of uniform thickness; Hornet interceptor delta |
| `cargo_well_rim_interior.png` | ventral cargo well | Cursor GenerateImage, 2026-08-19 | Skin-breaking well with wall thickness and a cassette inside | Hole + rim + rails below the skin | Dark plate on the skin; glowing grate |

## 2026-09-21 (C14 reference-first)

Generated with Cursor GenerateImage before modeling C14. Construction crops, not beauty
shots. Cycle-18 files listed above are provenance-only; pixels were not in-tree.

Hitch chase stills used as form-language input (nested same-value slabs), not identity.

| File | Component | Tool | What it is used to decide | Selected | Rejected |
|---|---|---|---|---|---|
| `c14/drifter_c14_workboat_planform_chase.png` | primary hull planform | Cursor GenerateImage, 2026-09-21 | Hard-chine workboat diamond: wide waist IS the hull; cargo well a hole | Single beam; well as cut; no paddle lobes | Capsule tube; dark saddlebags; glued boxes |
| `c14/drifter_c14_sideboard_as_beam.png` | chine / sideboard | Cursor GenerateImage, 2026-09-21 | Sideboard is the gunwale of the same shell | YZ hard-chine station; small deck lip | Circular tube section; paddle glued to a sausage |
| `c14/drifter_c14_cargo_well_cut.png` | dorsal cargo well | Cursor GenerateImage, 2026-09-21 | Boolean hole with rim, liner, crates, winch | Hole you can see into | Flush lid; painted rectangle |
| `c14/drifter_c14_greenhouse_framed_hole.png` | greenhouse | Cursor GenerateImage, 2026-09-21 | Framed panes in a cage over a cut tub | Thin glass in a metal cage | Solid brick; fighter bubble; seats |

## 2026-09-21 (C15 abeam leftover)

C14 play+close killed tube/paddle. Abeam still called a raised spine with darker
flanking volumes and a hard root crease. C15 refs freeze that leftover before
the loft change. Cycle-14 files stay selected for planform / well / greenhouse.

| File | Component | Tool | What it is used to decide | Selected | Rejected |
|---|---|---|---|---|---|
| `c15/drifter_c15_abeam_continuous_beam.png` | abeam hull silhouette | Cursor GenerateImage, 2026-09-21 | One continuous faceted beam from the side-top; nacelles grown from aft flanks; well a hole | Sloped topside; no saddlebag split | Raised cabin spine; dark paddle sponsons |
| `c15/drifter_c15_yz_sloped_chine.png` | YZ station | Cursor GenerateImage, 2026-09-21 | Hard-chine trapezoid: small lip, angled topside, no vertical slab | SELECTED tub/trapezoid | REJECT circular tube + paddle lobes |

## 2026-09-21 (C16 abeam silhouette)

C15 play+close stayed TUBE_PADDLE NO. Abeam still called raised spine + darker
flanks + hard root crease. C16 changes the YZ station (not more fairing on
separate sponson meshes). Separate nacelle bodies are deleted; aft hull
stations widen so the drives sit in the primary loft.

| File | Component | Tool | What it is used to decide | Selected | Rejected |
|---|---|---|---|---|---|
| `c16/drifter_c16_yz_convex_beam.png` | YZ station / abeam outline | Cursor GenerateImage, 2026-09-21 | Convex diamond: max beam at mid-height; sideboard is the slope | SELECTED convex diamond | REJECT lid+vertical walls; REJECT tube+paddles |

## 2026-09-21 (C17 clay abeam value)

C16 geometry (one diamond, nacelle bodies gone) held on shaded. Clay
`play_chase_abeam` still read a dark longitudinal spine + lighter flanks + a
hard value/seam: `paint_shell` assigned Deck to the crown (slot 2) and Armor
to the keel (slot 1), while `apply_clay` only replaced slot 0. Not a new YZ.
C16 convex-diamond ref stays selected. No generated C17 pixels.

## 2026-09-21 (C18 Hitch-plus skin)

C17 cleared clay+shaded TUBE_PADDLE on all three cameras. Remaining REVISE is
Hitch formed-shell / skin at D=144. C18 cuts chase-scale girth hoops, inset
pockets, and athwartship Course bands into the C16 diamond. No new YZ. No
generated C18 pixels. C16 convex-diamond ref stays selected.
