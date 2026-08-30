# Ironback MTX Cycle 33 — REVISE

Cycle 33 is the source-only D=144 crusher-pose correction from the
independent Cycle 32 REVISE. Cycle 32 closed the loaf, the three hopper
crowns, the matched pulse wells, and nameable saw / drill / hanging grab.
The one open defect was the crusher: a dark cluster under the bow, not
nameable as a mill even at tight legal zoom. This cycle keeps every other
assembly and poses only the crusher — two opposed mill plates hanging in
open negative space on the near bow shoulder so both plates and the
working gap count as one mill at native default chase, in the same visual
class as the already-readable grab. The candidate is not accepted or
promoted.

## Controller disposition

`REVISE`

Built from exact Cycle 32 source. Occupancy was legal on the first write:

- default chase: `17.45%` width (`279.3` px) — inside `8–22%`;
- abeam chase: `11.35%` width (`181.5` px) — inside `8–22%`;
- close chase: `44.32%` width (`709.1` px) — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.502` for the traced `41.28 WU` length. All three
supported views are legal and uncropped. Cycle 01–32 stills remain
byte-for-byte unchanged.

Original-resolution review of the exact-source stills:

- crusher: two opposed mill plates with ceramic inner liners hang outboard
  on the near bow shoulder, not under the cab. The working gap is a dark
  slot between the plates. At D=144 the pair is the same hanging class as
  the grab; at D=58 both plates and the mouth are countable as one mill;
- saw disc, ceramic drill, and four-tine grab are unchanged and stay off
  the pulse wells. The saw was not enlarged;
- hopper register: three hatch bays, bulkheads, crowns, apron, and throat
  unchanged;
- pulse register: two matched open wells unchanged;
- cab / hull join, materials, camera, lighting, sockets, collision, and
  occupancy envelope unchanged. ORM red was rebaked from the new mill pose.

This is an implementing candidate. It does not close Hitch-plus and does
not self-accept. The controller owns acceptance.

## Retained exact-source evidence

- LOD0: `34BCCA4B35FBE0EA3F6784DE56D172AB08413DFACC021AB26642A698E7D08361`
  (`47,808` triangles, `8` draws, hull `6,864`)
- LOD1: `FDE30F9912B3C222D1F8D5B5B37205A9C007566FE7E60DD8591A244AC0742C5B`
  (`45,007` triangles, `8` draws, hull `6,835`)
- LOD2: `5EDB1E798CB6BC1ACFB61DB548E923E469EC1D01A8D952BBB3E7604D7B116FD5`
  (`33,458` triangles, `8` draws, hull `6,810`)
- Identity and occupancy: `cycles/cycle_33/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_33/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 01–32 evidence were not modified.
