# Ironback MTX Cycle 25 — REVISE

Cycle 25 is one integrated form/material correction of Cycle 24's visible
defects. It keeps the open-well perimeter barge, legal scale, and formed hosts.
It rebuilds the cab tub/cage, hopper three-beat, mirrored pulse pair, four tool
silhouettes, station plates, and map/AO response. The candidate is not accepted
or promoted.

## Controller disposition

`REVISE`

Three Blender 5.1 runs. The first wrote legal occupancy, but an experimental
inset on the formed hosts exploded the hull into brick plates (`12,370`
triangles). That inset was removed. The second run crashed: a one-station
thermal sponson is illegal (`need >= 2 section stations`). Two stations were
restored. The third run wrote all source/evidence artifacts and exited 0:

- default chase: `17.45%` width (`279.1` px) — inside `8–22%`;
- abeam chase: `11.16%` width (`178.5` px) — inside `8–22%`;
- close chase: `44.26%` width (`708.1` px) — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.511` for the traced `41.28 WU` length. All three
supported views are legal and uncropped. Cycle 24 stills remain byte-for-byte
unchanged.

Original-resolution review of the exact-source stills:

- the hopper stays an open well. Mid-well cream filler is gone. Along +X at
  D=58 the well reads apron `~81` / process `~35` / exit `~56`, then a bright
  jaw lip `~118`. The three-beat path exists as numbers, and the thick rim
  remains. At D=144 the well is still a small dark rectangle; the three Y-drums
  and proud V jaws do not yet name themselves as three separated machines;
- the command greenhouse is a framed dark grid over a recessed tub, not a solid
  black gem. Close cab crop luma `~79`, `~54%` dark (Cycle 24 was `~81` /
  `~26%` dark). Orange brow/sill still own the bow at D=144, so the 1–3 cm
  panes and tub volume do not yet read as a compact pressure greenhouse;
- twin pulse U-chambers exist and were built once then mirrored, with dark
  inner chambers and ceramic vanes in the case. Under the real dorsal key they
  still do not match: close pulse crop luma `~117` vs `~52`. Dark mouths do not
  yet dominate the light asymmetry, and the stern still shares the beat with
  the hull plates around it;
- the four arms keep rooted turntable/yoke/boom load paths. Saw is a horizontal
  disk and drill is an outboard spike; those two are countable from the camera.
  Crusher V and grab forks remain dark cousins at D=144;
- sponson/fore/aft hosts keep formed section meshes. Load-path courses are two
  larger plates with a skipped mid gap. Thermal rest is a smaller ceramic beat
  off the pulse mouths, not a blown-out aft patch. Abeam still reads close to a
  straight barge; remaining brick/card facets are modest at legal size;
- oxide paint / gunmetal / dry ceramic / glass stay packed as separate
  metalness/roughness roles. Glass has no emission. Hull AO bake ran on all
  eight LOD0 materials (no skip). ORM isolation now has real cavity AO in R
  (ship range `43–237`). Normal isolation on the sponson is signed (R std
  `~78`), but hopper/thermal crops stay quiet (hopper R std `~6`). Broad
  bevel/panel variation is not yet visible on those islands.

A re-render, camera change, or texture-noise pass cannot close these facts.
The controller owns acceptance.

## Retained exact-source evidence

- LOD0: `643024E906371A31BABC58106B4E33285F635A78264DF41FFF0EDF868E8ACA18`
  (`34,344` triangles, `8` draws, hull `2,870`)
- LOD1: `51BC74B5ABDF6FEAB99DD0253B3A1863DA5DA9485CE882887B147C477B72C15F`
  (`31,714` triangles, `8` draws, hull `2,686`)
- LOD2: `FC90DFA0C8AAE79BBF7B29B065A032105F0903E249BEA3322D89E1641E7116D4`
  (`21,040` triangles, `8` draws, hull `2,258`)
- Identity and occupancy: `cycles/cycle_25/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_25/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 18–24 evidence were not modified.
