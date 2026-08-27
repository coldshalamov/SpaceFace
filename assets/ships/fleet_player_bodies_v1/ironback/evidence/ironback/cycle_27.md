# Ironback MTX Cycle 27 — REVISE

Cycle 27 is the minimum shared correction from the three Cycle 26 visual
reviews. It keeps the open-well salvage-barge identity, framed cab, four rooted
arm stations, drill cone, four-tine grab, flank seam continuity, aft U-pockets,
and exact-source evidence machinery. It replaces the catamaran sponson gap with
one lofted barge shell and a real hopper cavity, builds chase-countable process,
matches the pulse pair, rebuilds saw/crusher heads, and reclassifies oxide /
ceramic / gunmetal maps. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

Two Blender 5.1 runs. The first wrote legal occupancy and closed the through-gap,
but ceramic floor sheets left the hopper a bright ORM island. Those sheets were
replaced with hull floor bars, drums were enlarged, and AO samples raised. The
second run wrote all source/evidence artifacts and exited 0:

- default chase: `17.46%` width (`279.3` px) — inside `8–22%`;
- abeam chase: `11.43%` width (`182.8` px) — inside `8–22%`;
- close chase: `44.26%` width (`708.1` px) — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.511` for the traced `41.28 WU` length. All three
supported views are legal and uncropped. Cycle 25 and Cycle 26 stills remain
byte-for-byte unchanged.

Original-resolution review of the exact-source stills:

- the hull is one lofted barge with a dorsal cavity and a floor. Clay has no
  studio through the center. Abeam centerline is dark well/cavity, not the
  studio. Side armor is stepped plate on that shell, not a pair of chamfered
  sponson boxes;
- the hopper stays an open well. The cream 2x2 pillow is gone. Close and clay
  show a sloped ceramic apron in the fore third, three Y-axis drums with gaps
  and hubs, proud V-jaws, and a near-black throat. At D=144 those beats exist
  as value steps (apron `~72–83`, process `~45–53`, darker exit `~43`) but the
  three drums still compress into one dark rectangle from a stranger glance;
- twin pulse U-houses are one manufactured case mirrored, with gunmetal jacket,
  recessed void and an internal dry collar. Close pulse crops `~52` vs `~70`.
  Dark mouths are present; the dorsal key still lights one side more than the
  other. No blown-white U-caps;
- the four arms keep rooted turntable/yoke/boom load paths. Saw is a gunmetal
  open disc with C-guard and hub; crusher two opposed plan-view wedges; drill
  the long ceramic cone; grab four fanned tines. Close and clay can name all
  four. Default/abeam still shrink some of that into corner clusters;
- cab remains a framed dark greenhouse over the tub;
- oxide paint is matte dielectric (close hull plate luma `~59`, no copper-plastic
  coat). Ceramic is dry and darker; pulse/tool metal is gunmetal. Normal
  isolation on hopper/drums is signed (R std `~19–22`; Cycle 26 hopper was `~9`).
  ORM has real cavity AO in the pulse voids (min R `43`). Hopper ORM is darker
  than open plate (`204` vs `215`) but is not yet a deep well of contact AO.

A re-render, camera change, or texture-noise pass cannot close the remaining
D=144 process naming or the pulse lighting mismatch. The controller owns
acceptance.

## Retained exact-source evidence

- LOD0: `CD726F5A61792D9036BA2D0410E332A584A0F462A2CBC4CF4A10D8ACC80B21FC`
  (`37,838` triangles, `8` draws, hull `3,072`)
- LOD1: `ADFD2016A8C390D9700D40AE88687DEDD3DAE1376E08D36C23401EC867D754ED`
  (`35,053` triangles, `8` draws, hull `2,943`)
- LOD2: `8D3EF4571CD76E3A3B6FDC802A0B97882F61F7BF75D2DB365C792520153FF198`
  (`24,409` triangles, `8` draws, hull `2,627`)
- Identity and occupancy: `cycles/cycle_27/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_27/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 18–26 evidence were not modified.
