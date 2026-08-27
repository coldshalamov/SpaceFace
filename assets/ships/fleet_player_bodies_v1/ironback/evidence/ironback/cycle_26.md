# Ironback MTX Cycle 26 — REVISE

Cycle 26 is the minimum shared correction from the three Cycle 25 visual
reviews. It keeps Cycle 25's real ORM cavity AO, legal open well, framed cab
direction and aft U-pockets. It integrates the barge skin, beds pulse hardware,
separates the four tool heads, exposes a dark cab tub behind thin glass, spaces
hopper process, and raises signed normal/material response. The candidate is not
accepted or promoted.

## Controller disposition

`REVISE`

One Blender 5.1 run. Occupancy was legal on the first write; there was no
second run:

- default chase: `17.45%` width (`279.1` px) — inside `8–22%`;
- abeam chase: `10.91%` width (`174.6` px) — inside `8–22%`;
- close chase: `44.26%` width (`708.1` px) — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.511` for the traced `41.28 WU` length. All three
supported views are legal and uncropped. Cycle 25 stills remain byte-for-byte
unchanged.

Original-resolution review of the exact-source stills:

- the hopper stays an open well. Mid-well cream filler is still gone. Along +X
  at D=58 the well reads dark `~38` / warm apron `~88–134` / process `~90` /
  near-black throat `~30`. At D=144 the same path is apron `~108` / process
  `~87` / exit `~37`. The three-beat exists as numbers and the rim stays open.
  At D=144 the well is still a small dark rectangle; the three drums and proud
  V jaws do not yet name themselves as three separated machines from a stranger
  glance;
- the command greenhouse is a framed dark grid over a deeper recessed tub. Close
  cab crop luma `~55`, `~51%` dark (Cycle 25 was `~79` / `~54%` dark). Orange
  neck/brow fill is reduced to a metal cage, but at D=144 the bow still reads
  mostly as a compact dark rectangle, not a full pressure greenhouse;
- twin pulse U-chambers remain and are now bedded in aft pockets with saddle,
  clamp, ceramic collar and rooted vanes. Under the real dorsal key they still
  do not match: close pulse crop luma `~116` vs `~74`. Dark mouths do not yet
  dominate the light asymmetry;
- the four arms keep rooted turntable/yoke/boom load paths with slimmer common
  kit. Saw is a tilted open arc with guard, crusher two opposed standing wedges,
  drill a long ceramic cone with collar, grab four fanned tines with pads. At
  D=144 the heads are countable in close; default/abeam still compress some of
  that into dark corner clusters;
- sponson/fore/aft hosts are one continuous barge skin with shoulder, waist and
  transom stations. Separate orange load-path/top sheets are gone. Abeam is no
  longer a straight beam with boxes stuck on it, but clay still shows faceted
  station changes rather than a single rolled plate;
- oxide paint / gunmetal / dry ceramic / glass stay packed as separate
  metalness/roughness roles. Glass has no emission. Hull AO bake ran on all
  eight LOD0 materials. ORM isolation keeps real cavity AO (whole-ship R std
  `~84`). Normal isolation on hull/sponson stays signed (R std `~76`) and aft
  thermal is no longer dead (R std `~64`); hopper UV islands stay quiet
  (R std `~9`). Broad bevel/panel variation is not yet visible on the well
  floor.

A re-render, camera change, or texture-noise pass cannot close these facts.
The controller owns acceptance.

## Retained exact-source evidence

- LOD0: `6DA964B4A212A7C8677D431B0DFB8B555E2084BA3AFAEE261F53668D005DFC42`
  (`34,611` triangles, `8` draws, hull `1,993`)
- LOD1: `3E1736020E58580645B6D56C3B1785C40841B98BF76CE5AF1FC42E4D66C3A68A`
  (`32,081` triangles, `8` draws, hull `1,909`)
- LOD2: `5BCC093F9725F67BF86D3A443B4171296CEA678A2C3CFCBE62177E9E886E3457`
  (`21,927` triangles, `8` draws, hull `1,785`)
- Identity and occupancy: `cycles/cycle_26/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_26/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 18–25 evidence were not modified.
