# Ashline V2 Lode — fiction/development component bill

Status: implementation contract for the existing Lode candidate; not runtime promotion authority.

The Lode remains the same Crimson Reach `bruiser_brawler`. It preserves the Pancake donor's broad
radial hull, exact 24 m length, compound collision, nine sockets, +X-forward convention, and current
role. The yard fiction below is **ART EXTRAPOLATION** constrained by the authoritative two
`wpn_autocannon_m`, one `wpn_pulse_laser_s`, mass 70, close-run behavior, and single large
open-cycle drive.

Reach cutters converted a surplus industrial/security hull whose radial frame could survive heavy
weapon impulse. They ground off the original serials, installed two salvaged heavy autocannons in
layered side casemates, retained one compact pulse projector for ranging and light attack, and
mounted a large torch through the original load ring. The result is under-armed for its mass but
physically stubborn: Reach bravado expressed through visible reinforcement, not arbitrary spikes.

## Heavy autocannon casemates

| Fictional part | Material | Manufacture / history | Blender construction |
|---|---|---|---|
| radial load cradle | nitrided low-alloy structural steel | welded into the donor frame, repeatedly reinforced | longitudinal beams, cross-members, root saddles, and triangular gussets that visibly terminate in the hull |
| layered casemate shell | hardened armor steel | cut and lapped from mismatched yard plate | tapered plate pieces with thickness, seams, stand-off gaps, and removable roof/side access; never one beveled box |
| replacement panel | rough zinc/phosphate repair primer over steel | fitted after a port-side strike and never top-coated | dedicated non-metallic `Material_RepairPrimer`, chipped only at worked edges |
| trunnion | quenched and machined bearing steel | split caps permit field barrel/breech removal | faceted journals, split bearing caps, fasteners, and an actual pivot gap |
| breech and cassette | nitrided gun steel | faceted receiver with replaceable slug cassette | polygonal breech, rear clearance, cassette door, latches, and service panel |
| recoil system | honed steel rods, hydraulic cylinder steel, braided metal | paired dampers transfer firing impulse into the radial cradle | two rooted dampers per gun with polished rods, gland blocks, brackets, and short service flex |
| barrel and shroud | replaceable gun-steel liner and heat-darkened stainless | stepped liner under a vented replaceable thermal shroud | stepped/tapered profile, ribs or vents, muzzle collar, and a deep black bore |
| mantlet | overlapped armor and thermal plate | protects the trunnion without pretending it is sealed | layered cheeks around a recessed opening, joined continuously to shell and cradle |

The two visible weapons remain at the established port/starboard regions. Their construction may
extend forward, but socket truth stays unchanged. Runtime muzzle/VFX proof remains a separate
promotion gate because the current interface exposes one central weapon socket.

## Compact pulse projector

The `wpn_pulse_laser_s` is a rooted fixed optical/thermal assembly at
`SOCKET_Weapon_Front`. It reuses the Dart's proven language at smaller scale: a nitrided saddle,
faceted optical body, nickel cooling jacket, dry refractory collimator, recessed aperture, and
power/coolant service. It has no magazine, projectile feed, or recoil system.

## Open-cycle torch

| Fictional part | Material | Manufacture / history | Blender construction |
|---|---|---|---|
| pressure/chamber case | welded high-strength steel | rolled in facets with segmented access bands | faceted stepped shell rather than a smooth cylinder |
| hot jacket | nickel superalloy | heat-darkened around the chamber | distinct stepped profile and hot-metal material |
| bell and throat | heat-darkened nickel alloy plus alumina/zirconia refractory | replaceable liner, sooted only inside the flow path | hollow converging/diverging shell, visible inner wall, dry ceramic lip, dark cavity |
| thrust frame | nitrided structural steel | carries impulse into the radial hull | split saddles, aft truss, gussets, and shield stand-offs |
| pump/valve service | machined steel housings and rooted hardlines | asymmetric field replacement packs | unequal housings, junction blocks, collars, and lines with explicit endpoints |
| RCS cups | alloy shell with refractory liner | recessed verniers at existing lateral sockets | small cavities and shield cuts, never exterior emissive dots |

`Material_Cyan` remains a legacy semantic slot and may appear only as a small deeply recessed energy
cue. The exterior bell and throat are not luminous.

## Material truth

- `Material_Hull`: coated/oxidized armor and donor structure.
- `Material_Mechanical`: nitrided cold steel, load frames, trunnions, fasteners, and valve bodies.
- `Material_Red_Paint`: non-metallic Reach oxide-red coating over steel.
- `Material_RepairPrimer`: rough chalked dielectric repair primer over plate.
- `Material_HeatMetal`: nickel hot sections, barrel shrouds, and heat-darkened stainless.
- `Material_Refractory`: dry non-metallic ceramic in the torch throat and optical collimator.
- `Material_Cyan`: recessed internal cue only.

No visible object may inherit a generic glossy shader. There is no rubber, leather, clay, or molded
plastic exterior. A reference image can suggest assembly logic, but cannot establish a material
unless the model itself shows thickness, joints, load path, cavity, finish, and service access.

## LOD and evidence contract

- LOD0 keeps plate breaks, stand-offs, weld/seam rhythm, trunnions, breeches, recoil dampers,
  cassette access, barrel steps, thrust frame, pump packs, lines, and recessed cavities.
- LOD1 keeps the casemate silhouette, rooted load frame, weapon class, torch case/bell/throat, and
  hot-metal/refractory/primer boundaries.
- LOD2 remains the donor macro hull.
- Evidence must include neutral front/rear three-quarter, casemate, breech/recoil, torch, top
  orthographic, 120 px, and 45 px views rendered from the exact source epoch.
- The pass question is not “are there more shapes?” It is “can every visible mass be explained as a
  manufactured part with a material, load/service relationship, and plausible assembly sequence?”
