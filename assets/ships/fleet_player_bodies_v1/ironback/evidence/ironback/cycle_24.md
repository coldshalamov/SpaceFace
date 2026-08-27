# Ironback MTX Cycle 24 — REVISE

Cycle 24 is a manufacture-and-role pass on Cycle 23's section-mesh foundation.
It keeps the open-well perimeter barge and formed hosts. It changes the actual
stations, hopper value hierarchy, greenhouse cage, pulse pair, tool heads, and
substance maps. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

Two Blender 5.1 runs. The first wrote stills then failed occupancy:
`play_chase_abeam` width `7.98%` (band `8–22%`) after arm roots sat too far
inboard on the new waist. Arm roots were moved onto the outer sponson half and
shoulder/drive beam was restored; the second run wrote all source/evidence
artifacts and exited 0:

- default chase: `17.51%` width — inside `8–22%`;
- abeam chase: `8.74%` width — inside `8–22%`;
- close chase: `44.65%` width — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.505` for the traced `41.28 WU` length. All three
supported views are legal and uncropped. Cycle 23 stills remain byte-for-byte
unchanged.

Original-resolution review of the exact-source stills:

- the hopper stays an open well. Cream filler is gone from the mouth
  (`~0.1%` cream pixels in the D=144 well). Default chase luma along the well
  is feed `~88` / process `~56` / exit `~40`, so the three-beat path exists as
  numbers. At D=144 the well is still a small dark rectangle; apron, Y-drums,
  and proud V jaws do not yet name themselves as three separated machines;
- the command greenhouse is no longer a solid black gem (cab crop luma `~81`,
  `~26%` dark, not Cycle 23's `~40`). Roof glass is split by a center mullion.
  Orange brow/neck still dominate the bow, so abeam/default do not yet read as
  a compact framed cage over a cut tub;
- twin pulse U-chambers exist and were built once then mirrored. Under the
  real dorsal key they still do not match: close port crop luma `~87` vs
  starboard `~52`. Dark mouths do not yet dominate the light asymmetry;
- the four arms keep Cycle-23 roots/hat booms. Head profiles are larger and
  dorsal-facing (saw arc, open V, tapered drill, separated forks). At D=144
  they remain dark side clusters; a stranger still cannot reliably name all
  four;
- sponson/fore/aft hosts keep formed section meshes. Outer beam now changes
  along +X (narrow hopper waist, wider drive bulkhead and cab shoulder, tapered
  stern). Load-path courses follow those stations with gaps. Abeam still reads
  close to a straight barge; the station changes are modest at legal size;
- oxide paint / gunmetal / dry ceramic / glass are packed as separate
  metalness/roughness roles. A large off-white ceramic rest sits on the aft
  deck, not in the hopper. ORM isolation mixes those roles in 2D crops. Normal
  isolation on the sponson is no longer a flat lavender field (R std `~76`),
  but hopper/thermal crops stay quiet (R std `~4` / `~1`). Hull AO bake
  skipped (`No active image found` on `LOD0_Hull`).

A re-render, camera change, or texture-noise pass cannot close these facts.
The controller owns acceptance.

## Retained exact-source evidence

- LOD0: `14BCCE3DEEBBB27554E824240CF6D780E3F760C69086EA53C90F6A61AA50FB0C`
  (`33,682` triangles, `8` draws, hull `3,146`)
- LOD1: `B48D5733144746B98FF19620624A83C0EF883FC0BC0C868B2E0BCDC13A487B8B`
  (`30,568` triangles, `8` draws)
- LOD2: `42BE23DC9D112F1F9285FA0A705DDA479B7DE2169E19128A361D304C36EA19BB`
  (`20,562` triangles, `8` draws)
- Identity and occupancy: `cycles/cycle_24/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_24/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 18–23 evidence were not modified.
