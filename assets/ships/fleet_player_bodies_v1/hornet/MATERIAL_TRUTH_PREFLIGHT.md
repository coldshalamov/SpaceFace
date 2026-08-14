# Hornet material-truth preflight (PQ-050.01)

Class: player flyable interceptor. Hitch untouched.

## Visible-zone register (supported cameras: 3/4, starboard, rear)

| Zone | Class | Fiction | Forbidden |
|---|---|---|---|
| Pressure hull | billed | Rolled/faceted interceptor shell, cool gray dielectric paint, chines | Clay tube, shared Wasp sheet |
| Armor tiles | billed | Dark teal-gray plates with gaps and thickness | Decal-thick boxes, hex stamp |
| Cockpit tub | billed | Cut dorsal well, seat + console | Sealed void, teal brick |
| Greenhouse | billed | 1–2 cm dark glass in metal frames | Solid transmission blob |
| Wings / canards | billed | Diamond airfoil, thick root fillet, flap slot | Cards |
| Side / dorsal wells | billed | Skin-breaking radiator/rack holes | Dark plates |
| Drive | billed | Unboltable casing, ceramic collar, throat, vanes | Glow disk |
| RCS / sensor / turret | billed | Hardware in bays / on gimbal | Neon hoop |
| Hoses | billed | Curves with end fittings | Long boxes |
| Repair patch / stencil | billed | One port patch; spray marking in albedo | Random cubes; raised plaque |

`allSupportedViewZonesClassified`: authoring pass; reviewer must confirm.

`componentReferenceDecision`: `native_imagegen` for canopy, wing root, radiator well.

Working scene: headless `tools/blender/build_hornet_mtx.py`. Supported cameras in that script.

## C49 construction (form rebuild)

Shape-grammar failure being repaired: tip-to-transom `Pressure_Hull` loft still read as a foam dart after C41–C48 garnish.

Assembly sequence now:
- three short gloves (`Cabin_Glove`, `Waist_Glove`, `Drive_House`) host bay booleans only
- visible skin is telescoping `add_stepped_wrap` plate bands + overlapping armor tiles
- framed greenhouse panes, plated delta wings, hoop-framed drive house, weapon spine
- identity freeze: 16.5 m needle, single aft drive, twin canards, twin guns, sockets unchanged
