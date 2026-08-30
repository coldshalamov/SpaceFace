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

## C186-C194 active candidate preflight

The active lane freezes the live C85 identity and interfaces before form work:

| Field | Frozen decision / evidence |
|---|---|
| Asset identity | `SF_HORNET_PRODUCTION_V1`, `hornet_production_v1`, player interceptor, +X forward; C85 remains wired/live. |
| Runtime interface | Existing parts-library path, three LOD slots, socket map, collision envelope, and display-scale contract are unchanged. |
| Source technique | Continuous chined pressure-shell loft with wing carry-through; no three-house reset, no cabin/seat kit, no Hitch/Kestrel edits. |
| Canopy | Hull Boolean excavation plus five-wall tub, enlarged/set-back raised open-bottom dark glass shell, four-sided metal frame. C192-C193 preserve the framed opening while reducing frame contrast. |
| Drive | Two hull Boolean throat openings continued into upward/rearward tapered houses, proud flange, ceramic collar, soot bore, rooted vane star; no emissive disc. |
| Wings | Closed C194 airfoil loft with a four-station mechanical root fairing, a formed lower load path, a separate dark aft flap, and a wide recessed structural channel; C188+ uses the dedicated armor role on the crown. |
| Surface | Unique per-role UV0 basecolor/ORM/tangent-normal maps at C194 4096/2048/1024 with refreshed embedded payloads and restrained UV1 detail; C192-C194 remove broad saddle sheets and generic grid contrast, carrying construction through geometry and causal role values. |
| Radiator cassette | C194 deepens and enlarges the recessed dorsal cassette, keeps the core below the five-wall rim, and adds a visible header feed plus sloped rooted mount plates before the restrained fin detail. |
| LOD ladder (final binary) | C194 contains 48,315 / 33,588 / 20,515 indexed triangles, 33,205 / 24,062 / 12,735 hull triangles, and 68 / 58 / 47 visible primitive submits (64 / 56 / 45 mesh nodes); every series is strictly reducing and every hull remains above the 12,000-triangle technical floor. |
| Historical C192 LOD ladder | C192 pre-correction report used 46,568 / 31,896 / 19,008 scene triangles, 32,992 / 24,020 / 12,634 hull triangles, and 67 / 58 / 47 scene submits; C193's final-binary row above supersedes these estimates. |
| Texel density | C194 embedded images measure 4096/2048/1024, giving 372.0 px/m on LOD0 (`4096 / 11.01 m`) and meeting MTX-17's 256–512 px/m LOD0 target. LOD1/LOD2 intentionally step down to 186.0 / 93.0 px/m. |
| Tangent basis | C194 final GLBs carry valid `TANGENT` attributes on all visible primitives (68/68, 58/58, 47/47); the normal-mapped subsets are 46/36/27 and all carry tangents, including flaps, lower load paths, and service hoses where present. The generator fails closed if any required primitive loses one. |
| Supported evidence cameras | `play_chase` D=144, `play_chase_abeam` D=144, `play_chase_close` D=58; `grazing_close` and `drive_rear` are diagnostic only. |

### Visible-zone and material bill

The pressure shell is cool steel-blue dielectric paint with faceted chines and restrained course
seams. Hull panels carry a slightly darker blue-gray role. Wings/canards use a dark teal armor role
with a deep C194 mechanical inboard fairing, formed underside load path, separated dark flap channel,
and carry-through; mechanical drive houses are dark metallic; drive collars are warm ceramic;
canopy glass is opaque near-black with a four-sided frame boundary; the dorsal radiator is a
recessed cassette with visible rim, floor/walls, lifted core, header feed, and sloped rooted mounts
rather than a black comb. Cyan and red are limited service and warning
marks. The hull, canopy, wing roots, radiator cassette, drive throats, hoses, repair patch, and
stencil are all authored zones. No DCC-default material is retained as a quality decision.

### Gate status before independent review

| Gate | Status |
|---|---|
| G0 identity/interfaces | `evidence_ready`; C85 frozen, no runtime promotion. |
| G1 proportional fiction | `evidence_ready`; continuous shell/wing carry-through, C194 mechanical root fairing/lower load path/separated flap channel, recessed cassette with header feed/root mounts, and chase-visible primary openings documented in C186-C194 records. |
| G2 material truth | `evidence_ready`; C194 per-role 4096/2048/1024 embedded maps, ORM, tangent-normal, restrained UV1 detail/values, and MTX-17 LOD0 density documented. |
| G3 technical/export | `evidence_ready`; all three C194 final binaries export, strict indexed triangle/draw reduction and hull guard pass, embedded image ladder is verified, required tangent attributes are present, final mesh validation repairs stale hull data, and drive/canopy/radiator cuts report success. |
| G4 whole-asset visual review | `blocked`; independent controller-owned chase review is still required and no self-acceptance is claimed. |
| G5 runtime admission | `blocked`; promotion is intentionally withheld pending G4 and exact candidate acceptance. |

The nine full-job cycle records are `cycle_186.md` through `cycle_194.md`. Their stills are legal
chase captures, but these records do not close G4 or authorize wiring.

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
