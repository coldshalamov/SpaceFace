# Ironback material-truth preflight (PQ-050.04)

## Frozen identity and authority

- Runtime identity: `ship_ironback`, Tier-2 `mining_barge`, `path_industrial_stripmine`. It works
  four seams at capital scale while a winch controls fragments; it is deliberately slow and does
  not chase raiders (`src/data/ships.js`, `src/data/shipRoleLattice.js`).
- The gameplay presentation profile records 56 x 32 x 18 m, but those palette values are not the
  GLB's direct authoring scale. Freeze the established ~17 m GLB length/camera occupancy, +X forward,
  socket transforms, and runtime scale. Its current exact mesh envelope is 16.26 x 6.04 x 2.75
  authoring units; width/height massing may expand inside collision clearance because the current
  spearhead contradicts the authoritative barge role. Generated-sheet measurements are rejected.
- Frozen visible identity: wide burned-orange/brown working hull; one genuinely open central hopper;
  four mining/cutter arms; twin industrial drive houses; compact forward command cab. Not Hornet,
  Drifter, Ranger, Pelican, Atlas, or Hitch. Hitch remains untouched.
- Frozen interfaces: the 11 existing socket names and transforms, root asset/part IDs, +X forward,
  collision coverage, three separate LOD files, material-role ABI, and active runtime role. Arms,
  hopper, cab, and drives may be rebuilt inside the envelope because the current spearhead form
  contradicts the authoritative barge identity.
- Useful retained work: deterministic three-LOD exporter, unique material roles/maps, socket and
  collision metadata, authored texture-generation/bake route, and sanctioned chase-camera helper.
- Candidate/source: `assets/ships/fleet_player_bodies_v1/ironback/source/wholeships/`.
  Live/release files remain untouched until exact-candidate KEEP.

## Fiction-development agreement

Canon establishes an industrial strip-mining barge: four simultaneous mining mounts, 200 units of
cargo, pulse-plate impulse drive, high mass, and a crew that anchors the worksite instead of pursuing.
The following manufacture and service detail is **ART EXTRAPOLATION** consistent with that role:

- The pressure hull is a welded/formed steel frame under replaceable oxide-painted armor. Primary
  loads run from cutter yokes and hopper rim into deep shoulder frames, then into the aft drive beds.
- The hopper is a receiving and processing well, not cargo decoration: rolled wear rim, thick walls,
  ribs, abrasion liners, crusher/feed gates, protected floor machinery, drain/service channels, and
  replaceable impact plates. Forbidden reads: black decal, capped box, shallow tray, empty void.
- Each arm is a serviceable heavy manipulator: bolted turntable, clevis/yoke, rotary and hydraulic
  joints, forged/folded boom sections, guarded cable/fluid route, and a distinct cutter or crusher
  head. Forbidden reads: thin stick, wing, gun barrel, floating box, mirrored toy claw.
- Drive houses are pulse-plate industrial machinery bedded into the aft shoulders: formed cases,
  load saddles, clamps, recessed impulse chambers/plates, refractory throats, internal vanes, and
  heat-stained hardware. They must not inherit fighter ion-bell grammar merely because the current
  modular fallback and VFX say `engine_ion_twin`. Forbidden reads: glowing disk/torus, detached
  nozzle, conventional fighter nozzle pasted on, or painted hole.
- The cab is a compact armored greenhouse with separate black-blue panes recessed behind mullions,
  pressure tub, brow, sill, and rear bulkhead. Forbidden reads: one bubble, glossy black metal, seat
  detail that cannot read at the supported cameras.
- Material bill: burned oxide-orange dielectric paint over steel; warm off-white refractory/thermal
  panels; dark machined gunmetal frames and joints; heat-stained bronze/nickel drive hardware; dry
  ceramic throats; black-blue thin glass; dull hazard paint; causal ore abrasion, grease, heat, and
  one authored field repair. No universal noise, leather grain, toy-plastic coat, or DCC default.

## Visible-zone register

Supported whole-asset views are `play_chase` (FOV 50, D=144), `play_chase_abeam` (FOV 50, D=144),
and `play_chase_close` (FOV 50, D=58) from `tools/blender/spaceface_chase_camera.py`. Rear, grazing,
clay, material-ID, ORM, and normal isolation remain diagnostics. `allSupportedViewZonesClassified`
stays `false` until an independent reviewer confirms coverage against the exact candidate hash.

| Zone | Class | Supported views / dominance | Construction and material obligation |
|---|---|---|---|
| pressure hull, bow, shoulders, stern | billed | all; dominant all | Broad stepped pressure frame and quiet formed plate, blunt bow, massive shoulders, load paths into hopper/arms/drives; oxide paint with causal wear. |
| hopper rim and outer shell | billed | all; dominant play/close | Thick rolled/faceted rim, shoulder ties, wall section, replaceable armor and impact lips. |
| hopper interior and processing floor | billed | play/abeam/close; dominant close | Real negative volume, ribs, abrasion liners, dark floor, gates, guarded machinery and service channel. |
| four arm roots/yokes | billed | all; dominant abeam/close | Turntables, saddles, clevis pins, gussets and shoulder load transfer; no stuck-on boxes. |
| four booms, joints, cable runs, tool heads | billed | all; dominant play/abeam | Authored sections, joint gaps, actuators, protected hoses, distinct work heads, functional asymmetry. |
| twin drive beds/houses | billed | all; dominant abeam/close | Pressure cases rooted into stern, saddles, clamps and heat-zone separation. |
| twin pulse chambers/throats/vanes | billed | play/abeam/close; dominant close | Deep cavities, wall thickness, impulse-plate recesses, collars, internal vanes, refractory and heat-stained metal; no fighter-ion copy. |
| command tub, cage and separate panes | billed | play/abeam/close; dominant close | Recessed multi-pane glazing, armored brow/sill/mullions and dark pressure tub. |
| keel, landing skids, cargo hardpoints | billed | abeam/close | Broad load-bearing underside, replaceable skid shoes, gaps and attachment frames. |
| radiator banks and thermal plumbing | billed | play/abeam/close | Protected cassettes tied to machinery, fine fins only where screen-space permits. |
| winch/cable spool and service rack | billed | play/abeam/close | One asymmetric operational cluster with drum, fairlead, guards and rooted service interfaces. |
| catwalks, hatches, work lights, RCS, fasteners | billed grouped family | close; secondary | Repeated manufactured service family, restrained and rooted at real access/force/visibility points; no generic greeble field or soft cards. |
| LOD1 semantic body | billed | normal play | Preserve hopper opening, arm/yoke load paths, cab cage, drive houses/bells and material boundaries. |
| LOD2 silhouette body | billed | far play | Preserve broad barge footprint, central void, four arm beats, twin-drive stern and blunt bow at ~40 px. |

## Shape-grammar failure and assembly sequence

Cycle 32 rebuilds the dorsal half as three separately readable process registers on one chassis,
not one dark slot through an oxide loaf. Sequence: blunt barge envelope and closed keel -> hopper
register as three hull-cut hatch bays with oxide bulkheads between them, proud drum crowns,
ceramic apron, and a short feed throat -> closed split deck -> pulse register as two matched open
wells with low rims, dark floors, and a deck-height oxide strip (no roof over port) -> tool yard
as one hopper-shoulder rail with four equal-class heads in negative space, clear of the wells ->
cab tub/cage -> underside/thermal/service -> unique UV/bake/material response -> meaning-preserving
LODs. If clay at D=144 still shows one trough, one pulse hole, or a saw that outclasses crusher
and grab, change the register cuts rather than enlarging attachments.

## Generated component reference

- `componentReferenceDecision: native_imagegen`.
- Reference: `reference/ironback_salvage_barge_components_v1.png`, SHA-256
  `0086E4DE033472503E1462D310B075936B1646327B50B0AC6C256F803F80CFB8`.
- Frozen identity comes from live code and the existing asset contract, never from generated pixels.
  Selected quality axes are the reference's hopper depth/rib logic, heavy arm joint language, rooted
  twin drive houses, multi-pane cab cage, manufactured material separation, and causal wear. Its
  pictured dimensions, exact proportions, tool geometry, markings, labels, and implied manufacturer
  are rejected as non-authoritative inspiration.
- The image is construction reference only. It is never projected or used as albedo, normal, ORM,
  AO, collision, or bake source. Reference parity will be recorded per selected axis as
  `met|partial|miss|not_applicable` against the exact-source chase views.

## Working scene and acceptance

- Reproducible surfaced scene: `tools/blender/build_ironback_mtx.py` building and re-importing
  `source/wholeships/ironback_production_v1_lod0.glb` with all neighboring components and authored
  materials visible. Source LOD0/1/2 remain the editable generated outputs.
- G0-G7 evidence: exact source hashes and GLB metadata; legal chase trio plus clay/grazing/material-ID/
  ORM/normal views rendered from exact LOD0; component-reference parity record; LOD/socket/collision/
  asset checks; package/release checks after promotion; normal Browser/Electron flight route.
- Whole-asset G1/G2/G4 remains open until a hash-bound original-resolution review names every
  dominant zone, changed zone, open P0/P1 defect, and `keep|revise|revert|blocked`. G7 requires an
  independent reviewer. No technical receipt, cycle count, or review volume can promote the ship.
