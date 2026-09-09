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

## C52 approaches (brainstorm 3x)

1. Rib-and-skin: hoop ribs at every station, small tiles between them — Hitch language, interceptor silhouette.
2. Faceted closed diamond: more stepped wrap only — rejected as the C49–C51 failure mode (cardboard bands).
3. Component-ref density: plate-course gaps + wing-root tiles translated onto C51 form.

C52 implements 1 + 3.

## C67 construction (face wells, no Exact boolean)

C66 is **not counted**. Exact booleans on the solidified loft deleted the
pressure hull (0 shells). C67 opens roof/flank wells by deleting faces and
aborts if hull verts collapse. Dark liners, thin canopy, airfoil wings stay.

## C66 construction (cutters actually hit the skin)

Shape-grammar failure being repaired: C65 canopy sat on unbroken skin (roof
cutter was above the loft), side wells missed the beam, join-then-AO-bake
blacked the upper half, and bells inherited light mechanical albedo so the
throats read as white cones.

This cycle:
- roof / flank cutters start outside the 10 cm wall and eat inward
- thin framed canopy over a lined tub; seat/console below the rim
- dark inner liner + ceramic vanes in each bell
- airfoil wing without leading-edge cards
- shade after triangulate; no overlapping-mesh AO bake
- armor is darker gray metal, not black

## C59 construction (closed interceptor, real openings)

Shape-grammar failure being repaired: C54 closed loft was a blank dart (no hole,
no throat, 6.36:1 missile). C56 hit the height/opening numbers with a black tent
and a washer and got worse. This cycle raises the *hull stations* (~1.8x mid
section), cuts three wells that start outside the skin, lines them with five-wall
tubs, puts a low framed glass shell on the canopy rim, and gives each drive one
spun bell with an opaque dark plug and rooted vanes. Dorsal slab kit removed.
Texture ladder unchanged (1024/512/512).

## C56 construction (section + openings + drive)

Shape-grammar failure being repaired: C54 closed loft traded the cage for a blank —
no hole, no throat, a 6.36:1 dart.

Assembly sequence this cycle:
- same continuous loft; station rings scaled on Z about each ring median
  (×1.45 canopy, ×1.55 mid, ×1.60 drive; bow left alone)
- three skin-breaking Exact booleans (canopy tub, port avionics, starboard radiator)
  plus a starboard shoulder bay so the profile camera can count rims
- five-wall tubs, framed near-black glass (transmission 0, coat 1.0), no liner plug
- spun bells on a full transom bulkhead; closed dark bore; no plume
- dorsal/flank plates cut into the skin; one unmirrored repair plate
- maps at 2048

## C49 construction (form rebuild)

Shape-grammar failure being repaired: tip-to-transom `Pressure_Hull` loft still read as a foam dart after C41–C48 garnish.

Assembly sequence now:
- three short gloves (`Cabin_Glove`, `Waist_Glove`, `Drive_House`) host bay booleans only
- visible skin is telescoping `add_stepped_wrap` plate bands + overlapping armor tiles
- framed greenhouse panes, plated delta wings, hoop-framed drive house, weapon spine
- identity freeze: 16.5 m needle, single aft drive, twin canards, twin guns, sockets unchanged
