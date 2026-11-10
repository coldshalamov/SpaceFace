# G0 pre-authoring dossier — Massline Express Liner v1

## Candidate identity

- Asset ID: `SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1`
- Source identity: `wholeship_massline_express_liner_v1`
- Role: Helios `express` presentation candidate; passenger-only civic liner
- Tier / state: Tier B / `surfaced_candidate` source only (not accepted, not wired)
- Scope: PQ-049.01 DCC candidate. Editable Blender source, authored LOD0/1/2, textures, and hash-bound chase-camera evidence live in this folder. No release, render package, runtime map, or manifest mutation.
- Source root: `assets/ships/massline_express_liner_v1/`
- Outputs: `blender/massline_express_liner_v1.blend`, `source/wholeships/massline_express_liner_v1_lod[0-2].glb`, `scripts/build_massline_express_liner_v1.py`
- Orientation: Blender long axis `+X` forward, Blender `+Z` up; glTF export is Y-up with forward axis retained as `+X`.
- Supported review cameras (only these close a cycle): live chase at 60° tilt, 50° FOV, D=144 (`play_chase`, `play_chase_abeam`) and D=58 (`play_chase_close`) via `tools/blender/spaceface_chase_camera.py`. No seats. No studio three-quarter.

The only donor is `reference/stopped_lark_iter19/`, and it is reference-only. No donor object, mesh,
material, texture, transform, socket, Blender data block, or source GLB is imported, copied, or renamed
into a future candidate. The courier Lark, Span, and Mule remain outside this source tree’s planned build
graph. Their accepted/current hashes and runtime entries are a frozen boundary; a later leaf evidence
matrix must record them before source promotion. This preflight makes no change to them.

## Fiction-development agreement

The liner is a public-facing pressure vessel in a world where paperwork is a physical weapon and clean
surfaces never mean innocent ownership. The tone constraint comes from
`docs/worldbuilding/vibe/vibe-CANONICAL.md` §§ Core Tone, Voice, and Visual Storytelling: service work
is concrete, maintenance is visible, and any warmth is brief. The interaction premise comes from
`design/VISION.md` § “The Massline is a signature mechanic”: its tether load needs a readable physical
answer, not a decorative halo. The packet supplies the Helios express role, passenger-only custody truth,
and non-goals. “Massline Express” manufacturer history, civic livery, baggage process, and component
names below are **ART EXTRAPOLATION** for the planned source candidate; they never claim a new runtime faction,
economy, cargo manifest, or story fact.

The planned liner is not a yacht that happens to carry commuters. From the front it must read as a framed
boarding and operations wedge: windshield panes are structural, not a glossy black nose; the narrow apex
must give the pilot a point of direction while the wide aft frame explains the protected
observation/boarding volume. Behind it, the planned source must place one stepped pressure drum, wide
where passenger decks need air and shouldered where the operational wedge and drive structure transfer
load. The drum must not be a smooth tube. Its stations must be a formed, faceted ceramic-painted shell
with seams at plausible bulkheads, quiet planes between service zones, and dark frame pieces that visibly
carry the join from glass, dock hatch, and dorsal spine.

The planned passenger volume must be protected from the ugly work. A low, dull-grey cassette must sit
below the drum: sealed maintenance and hand-luggage service, shallow enough to read as access equipment
rather than a freight bay. It must have latches, inspection seams, and a locally worn primer surface, but
no container stack, pallet rail, crane, cargo door, commodity marking, or manifest language. Passenger
wayfinding must remain restrained cyan boarding strips and amber caution lamps seated inside actual
frames. The colors identify doors and routes; they must not turn the hull into a neon skin.

The planned dark keel must be the liner’s honest structural line. It must carry a multi-part saddle collar
on the lower non-passenger side. The collar must root through gusseted cheeks into the pressure body and
keel, so a Massline latch has a visibly reinforced path rather than a decorative ring bolted to painted
ceramic. The lower position must keep it away from boarding glass and service hatches, while the
forged/anodized finish distinguishes it from the pressure shell. Port and starboard sides must receive
separate recessed docking/service interfaces: a dark socket floor, ceramic jamb, bolted frame, and nearby
service plate. They must be interfaces a station arm could touch, not painted rectangles.

Above the drum, the planned dorsal cooling/service spine must make the ship legible from a traffic camera.
One equipment well tied to the bulkhead rings, a few large radiator/access modules, and one restrained
asymmetric repair plate must carry the service read. Passenger glazing belongs in the corridors and
boarding. At the rear, one common tapered pressure/load envelope must carry both internal drive cases to
two separated functional throat openings. Each opening must retain a deep, dry refractory liner; the hot
surface and its low cyan core must remain recessed behind a real rim. The paired throats, common shroud,
keel, service cassette, and docking frames must create a civic machine that can be tethered, inspected,
and resumed on the same itinerary without ever pretending to be a fighter or cargo hauler.

When authored, one metre inspection must show primer only around removable cassette latches, heat bloom
only at the throat liner, and chalky abrasion only at dock frames and tether contact faces. At 120 pixels
a pilot must see the wide pale drum, dark lower keel, forward glazed wedge, dorsal ridge, and twin
separated aft throats. At 50 pixels the silhouette must still read as “stepped passenger vessel with two
drives,” not Lark, Span, Mule, a freight barge, or a luxury capsule.

## Production translation

### Five macro imperatives

1. A forward +X glazed operations wedge must lead the ship; color alone may not establish direction.
2. The central ceramic pressure drum must have stepped sections, shoulders, and negative-space breaks—not a continuous tube.
3. The lower maintenance cassette must remain visibly shallow, sealed, and service-scaled; never a cargo stack.
4. The dark keel and tether saddle must form one rooted lower load path distinct from the passenger shell.
5. Twin recessed aft throats must preserve a stable two-drive silhouette across every authored LOD.

### Construction zones

| Zone | Assembly and load/service logic | Rest/detail rule |
|---|---|---|
| Operations wedge | Forged frame rails bridge the nose to the forward pressure shoulder; smoked panes sit inside the frame. | Framed glazing is dense only at the nose. |
| Forward shoulder | Ceramic bulkhead transitions the wedge to the drum through a dark frame station. | Broad quiet ceramic planes. |
| Passenger drum | Formed pressure-shell stations, bulkhead seams, and small safety panels. | Largest visual rest area. |
| Port dock interface | Recess floor, jamb, removable conduit plate, rooted bolt pattern. | Cyan strip only at the actual hatch. |
| Starboard service interface | Mirrored role but not copied labels; separate service plate and amber caution fixture. | No fake cargo handling. |
| Low service cassette | Galvanized/primer enclosure with latches, seam, and small drain/inspection face. | Below passenger glazing; shallow depth. |
| Keel | Dark load beam with multiple thickness stations. | Carries tether brackets and boom roots. |
| Tether saddle | Forged side cheeks, bridge pad, and gussets into both keel and drum frame. | Lower/non-passenger-facing; no decorative ring. |
| Dorsal spine | One equipment well, two differently sized radiator modules, one offset repair plate. | Not a row of identical lids. |
| Common drive shroud/throats | Tapered pressure/load envelope, internal case roots, hollow pressure bands, and two deep ceramic/refractory throat liners. | Only the functional throat openings split; emission is recessed and low. |

### Material and LOD intent

The material bill is `MATERIAL_CONTRACT.json`. The future source build must generate portable base-color,
ORM, and normal PNGs under `textures/` per role and connect them through semantic glTF materials;
deterministic UV projection is a planned candidate strategy, not an automatic G3 pass. Planned LOD0 must
retain framed glazing, dock jambs, keel saddle, cassette latches, cooling slots, and throat depth. Planned
LOD1 must retain the wedge/frame hierarchy, docking recess blocks, keel/tether load path, dorsal spine,
and twin throat cavities. Planned LOD2 must retain the stepped drum, forward wedge, lower keel/cassette
line, and one common aft mass terminating in two throat openings through the `probe_32px` far band.

### Explicit exclusions

- No cargo bay, cargo container, freight rail, pallet, commodity label, or economy/manifest invention.
- No Lark derivative, Mule/Span clone, fighter, luxury yacht, generic cylinder/tube/ring body, exposed stack, floating greeble, DCC default, global grime, or full-hull emissive skin.
- No release files, manifests, render packages, runtime selection maps, traffic, custody, AI, physics, camera, save, or Electron changes in this leaf.

## Gate posture

G0 is written and the Cycle 36 source candidate exists. Exact hashes are:

- LOD0 `AAF714ABF24EF5F7B92AE47818C9CEF2C0512065F405AE9A4BFF0E2D43E1AFEB`
- LOD1 `7FBB3B272962C17D07396CBB90A7594C111CD621431B7955F4AD796A0780158E`
- LOD2 `B201060C52819F9F0B2A9416A8FE4915E41D19D2263BFE32EF76E221D141CA50`
- editable Blend `A7AB8524935C312F8550ED70DF99593CBDD3C6D74FA87EF69296B2B9A88FAC36`

Matched exact-source evidence is bound under `cycles/cycle_36/`, with labeled `lod1/` and `lod2/`
subsets. Cycle 36 retains three stepped pressure sections and six paired deck-edge gallery wells while
tucking the passenger galleries inside an 18.96 m beam and extending the longitudinal civic crown from
the operations shoulder into the aft load region. A four-station common pressure/load shroud encloses
both near-axial drive cases until their open throat rims, so the plant reads as one civic afterbody and
splits only at the dry bores. The aft diagnostic shows real hollow pressure bands rather than an end cap.
Blue-grey glazing has 0.30 transmission in all three exported LODs and set-back interior datum plates.
All recorded semantic contract names are the exact unsuffixed exported glTF material names.

Implementing-agent original-resolution review records `KEEP` for controller review: the former swept
pincer pair, cross/arrow abeam silhouette, opaque-black glazing, and out-of-band LOD evidence are
materially corrected. Whole-asset G1/G2/G4 and independent acceptance stay open. G3, G5, G6, and G7
belong to later PQ-049 leaves. No P0/P1 is hidden by a new camera. Source bounds are
40.27 x 18.96 x 11.11 m (length-to-beam 2.12). Default occupancy is 17.19%, abeam 8.33%, and close
43.93%, all uncropped. LOD1 and LOD2 default/abeam evidence is inside the authored 90–220 px and
<=90 px bands; their matched far transition pair measures 89.0 px.
