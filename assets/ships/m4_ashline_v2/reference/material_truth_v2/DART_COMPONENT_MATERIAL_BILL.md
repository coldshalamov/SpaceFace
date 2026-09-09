# Ashline V2 Dart — fiction/development component bill

Status: implementation contract for the existing Dart candidate; not runtime promotion authority.

The Dart remains the same Crimson Reach flyby interceptor and keeps its donor macro-hull, scale,
collision, nine sockets, +X-forward convention, and role. This pass replaces the visibly primitive
add-on hardware with assemblies that explain how the ship accelerates, turns, sheds heat, and fires.

## Vector Reaction Drive S — twin units

| Fictional part | Material | Manufacturing / history | Blender construction |
|---|---|---|---|
| cold pressure case | welded chrome-moly plate | rolled in short facets, seam-welded, repeatedly opened | faceted revolved shell; not a smooth cylinder |
| hot-section jacket | nickel superalloy | heat-darkened stepped casing around the chamber | stepped revolved profile with a distinct material |
| nozzle throat | alumina/zirconia refractory ceramic | replaceable, chipped at the rim, never glossy plastic | recessed hollow bell and ceramic lip |
| load clevis and saddle | nitrided structural steel | bolted into the aft spar; carries thrust into the hull | visible root saddle, paired gussets, and segmented clamp bands |
| feed service | braided metal hose and steel hardline | field-rerouted after repairs | short rooted lines with real start/end fittings |
| thermal shield | oxidized stainless sheet | folded, lapped, and held off the hot section | faceted cover segments with air gaps |

Both drives stay inside the established aft envelopes centered at runtime `z = ±2.15`; they do not
move the engine or trail sockets. The dark throat is recessed; any emissive cue sits inside it and
does not become a glowing plastic cap.

## RCS / drive feed spines

The former red rectangular rails become folded hat-section service spines. Their fiction is a
protected oxidizer/coolant feed with removable armor covers and three bolted mount feet. They use
painted steel over a darker pipe, with local chipped edges exposing metal. They overlap the hull at
their roots and cannot float above it.

## Fixed pulse projector S

| Fictional part | Material | Manufacturing / history | Blender construction |
|---|---|---|---|
| root saddle | nitrided structural steel | transfers aiming and firing loads into the prow frame | conforming bracket and two gussets |
| optical support body | nitrided steel | compact polygonal housing; no firearm receiver | faceted, tapered body aligned to the weapon socket |
| cooling jacket | nickel alloy | heat-stained ribbed jacket around the pulse cavity | stepped collar with cooling ribs retained at LOD0 |
| collimator / shutter | refractory ceramic and blackened metal | recessed, replaceable aperture; no glowing hoop | dark cavity, ceramic rim, internal aperture plane |
| power and coolant service | braided copper/steel flex | enters behind the saddle, never an ammo feed | two short rooted service runs |

The muzzle terminates immediately behind `SOCKET_Weapon_Front` at runtime
`(7.4, 0.15, 0.25)`. The assembly has no recoil rail, magazine, projectile accelerator, or decorative
barrel. Its geometry must still read as a pulse projector with emissive materials disabled.

## Material truth

- `Material_Hull`: oxidized or coated structural steel; bare chips are metallic, intact coating is
  not.
- `Material_Mechanical`: nitrided steel, fasteners, saddles, and cold service hardware.
- `Material_Red_Paint`: non-metallic oxide-red coating over metal; metal appears only where chipped.
- `Material_HeatMetal`: nickel superalloy hot sections and heat-darkened stainless.
- `Material_Refractory`: alumina/zirconia throats and optical collimator ceramics; non-metallic,
  dry, and slightly chipped.
- `Material_Cyan`: legacy semantic name for a restrained internal threat/energy cue, never a
  luminous exterior toy ring.

No unspecified part may inherit a generic glossy shader. Every new object must use one of the
materials above because its fiction supports that choice.

## LOD and visual acceptance

- LOD0 retains clamp breaks, gussets, feed lines, cooling ribs, shutter, access seams, and cavities.
- LOD1 retains pressure cases, hot sections, bells, load saddles, feed-spine covers, weapon body,
  and recessed aperture.
- LOD2 remains the donor macro-hull.
- At close range the hardware must not read as cylinders and boxes with bevels.
- At normal flight size the twin drive/load path and the weapon aperture must remain legible.
- A current exact-source material-truth render is required; generated reference art and historical
  contact sheets cannot close acceptance.
