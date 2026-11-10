# Warden and Helios hostile geometry pass

Candidate authoring: `warden.py`; pinned inputs: `warden.sources.json`.
Output: `.devshots/helios-remaster/warden/<source-name>/<source-name>.glb` and
the complete surfaced `<source-name>.blend`. No source GLB, release or gameplay map
is written by this script. The root lane reviews and promotes exact hashes.

## Material-truth preflight

The current source models, their authored livery, collision, sockets, animated
gun/drive/spool nodes, axes and silhouette limits are the retained design.
Warden is the production armored gunship; Dart, Lode and Corsair are the exact
hostile variants selected by `partsLibrary`, including native LOD groups.
The assembly explanations below are ART EXTRAPOLATION, consistent with the existing
roles; they do not establish new manufacturer or faction canon.
No external component reference is needed: the actual models and the accepted
hero-fleet construction pass supply the adjacent manufacturing language.

| Model / visible zone | Scope and construction | Material bill and intended response | LOD |
| --- | --- | --- | --- |
| Warden casemate/deck | Billed: physically recessed paired service galleries interrupt the broad flat upper deck. Stepped sill, flanged rim, folded cooling leaves and rooted returns. | Retain armored painted shell/maps; new oxidized steel well, brushed nickel flanges and heat-darkened copper plumbing. Sharp highlights on joints with deep cool inner walls; no luminous decals pretending to be recesses. | Openings retained; folded leaves and pipe sections reduced. |
| Warden bridge | Billed: framing and buttress construction for the retained raised glazing, with a small sheltered signal. | Existing canopy stays optical glass; metal framing uses actual manufacture and gasket separation, not a solid blue brick. | Broad frame survives; small signal omitted in far LOD. |
| Warden transom/drives | Billed: deck-rooted cradles and thrust load paths connect the retained three bells to the hull. | Retain nozzle ceramic and machinery maps. New metal members and heat lines must remain attached at both ends. | Reduced supports, no new far material batches. |
| Warden bow, keel, chine, RCS and authored wear | Retained reviewed against source assembly and supported view; the long tapered armored outline and collision are frozen. | Retain existing Hull/Armor/Accent/Warning/Mechanical/Ceramic/Radiator/Thruster textures and response. Every material receives geometry-remaster flag so synthetic runtime decoration is disabled. | Existing native files retained. |
| Dart center fuselage / wing roots | Billed: continuous paired cheek shells join the drive block, canard roots and nose collar around a narrow open thermal spine; original canard tips remain. | Retain hostile paint/livery; nickel edges, dark steel roots and exposed exchanger. Fine hardware is omitted. | Geometry simplifies within all three existing LOD groups; no extra far draws. |
| Dart nose, guns, drive fan/core, glazing | Retained reviewed: authored pointed prow, drive silhouette and animated nodes remain. | Existing maps/glass/emissive roles retained; new work is joined only to static groups. | Preserve animated node identity. |
| Lode broadside pods / dorsal ridge | Billed: continuous fabricated keel and swept casemate shoulders link drive, side cassettes and neck; the unsupported dorsal bar is replaced by a broad open mechanism trough. | Existing paint with oxidized interiors, ceramic exchanger and metal hoop/support interfaces. Avoid a generic flat slab with tiny decorative bolts. | Broad recesses survive; cassette count and subdivisions drop. |
| Lode prow, battery, bridge and engine | Retained reviewed: blunt armored silhouette, gun pivots and authored livery retained. | Existing textured roles; changes do not replace weapon assembly or glass with glow cards. | Preserve existing nodes and native simplification. |
| Corsair deck / exposed drive chassis | Billed: actual recessed service pack and retained Rig language of longerons, diagonal thrust bracing and rooted shoes. | Existing hostile paint; new fabricated members use dark steel and small copper returns. | Fewer diagonals and omitted shoes at distance. |
| Corsair blade / boarding hardware | Billed: a formed central keel, cast root shoulders and thick triangular open-web shoes connect the existing raised variant structure to the main chassis. Silhouette and blade tips stay fixed. | Retained blade paint; load-bearing metal struts with joined ends, not floating ornaments. | Native variant LOD visibility remains. |
| Corsair gun, spool, fan/core, optical parts and keel | Retained reviewed: animation, tether sockets, asymmetric boom and original wear remain. | Source maps and authored colored emission retained. | Animation hooks stay separate; static additions are batched. |

All supported whole-asset zones are covered by the register, but coverage remains
`allSupportedViewZonesClassified: false` until independent visual review. The root
reviews both 60-degree / FOV50 chase views D144 and D58 using the actual Three rig.
Component work alone does not assert whole-asset quality. Each candidate receipt
records source and candidate hashes, geometry counts and exact helper preservation.
G0 is the pinned source/preflight, G1/G2/G4 are the root's hash-bound visual judgment,
G3 is the authored surface/material and mesh receipt; runtime reachability, packages
and performance remain root-owned integration work.

Reproduce:
`blender --background --threads 3 --python tools/blender/helios_remaster/warden.py -- --build`
