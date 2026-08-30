# Ironback MTX Cycle 31 — REVISE

Cycle 31 is the source-only D=144 structural pivot from the independent
Cycle 30 REVISE. Attachment-size nudges had failed: hopper, pulse pair, and
crusher still collapsed because small process kits were fighting an
uninterrupted dorsal hull. This cycle cuts one integrated process spine
through the manufactured shell so the hull itself frames three macro
registers — an open hopper bay with three drum crowns, a matched pulse
pair with a narrow oxide bridge, and a tool yard with four distinct heads
in negative space. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

One Blender 5.1 run from exact Cycle 30 source. Occupancy was legal on the
first write; there was no second run:

- default chase: `17.45%` width (`279.3` px) — inside `8–22%`;
- abeam chase: `13.44%` width (`215.1` px) — inside `8–22%`;
- close chase: `44.32%` width (`709.1` px) — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.502` for the traced `41.28 WU` length. All three
supported views are legal and uncropped. Cycle 18–30 stills remain
byte-for-byte unchanged.

Original-resolution review of the exact-source stills:

- the dorsal half is now one process spine cut into the barge shell, not a
  loaf with kits on top. Abeam centerline is a dark well, not studio. Bow
  and cab remain a blunt salvage barge. Clay reads hopper bay, pulse pair,
  and four tool silhouettes as the same manufactured body;
- hopper register: a hull-cut receiving bay with proud rim, ceramic apron,
  and open dark floor. Three Y-axis drum crowns sit in wall saddles and
  remain countable at D=144, with visible gaps and throat beyond the last
  drum. It does not collapse to one painted trough;
- pulse register: two open dry wells cut into the aft hull, shared ceramic
  rim language, visible dark floors, separated by one narrow oxide bridge.
  They read as a pair at default chase without relying on key-light match.
  Starboard still takes more fill, but both holes stay dark and open;
- tool register: shoulder waist, rail, and end-frames. Saw disc, ceramic
  drill, four-tine grab, and opposed crusher jaws are nameable in negative
  space. Crusher is now a dual-plate mill of the same visual class as the
  other three; the saw disc remains the largest silhouette;
- cab remains a framed dark greenhouse over the tub;
- oxide / dry ceramic / gunmetal separation is unchanged in intent. ORM red
  was rebaked from the new geometry.

This is an implementing candidate. It does not close Hitch-plus and does not
self-accept. The controller owns acceptance.

## Retained exact-source evidence

- LOD0: `F3ED1A64484197E6146DCAFCAE879FE102A506E397FFB38FD7D32C7A38B19F4E`
  (`44,654` triangles, `8` draws, hull `4,124`)
- LOD1: `E427F4D506DD3B843A740F3EF6B7EA39C6DBF0AE00C03499C864417B6B1E864C`
  (`41,796` triangles, `8` draws, hull `4,006`)
- LOD2: `1092933A0C093FD99AE8157F6F1CE95D4354DAA5B457C43CC4030CEE9494F2EC`
  (`29,970` triangles, `8` draws, hull `3,508`)
- Identity and occupancy: `cycles/cycle_31/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_31/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 18–30 evidence were not modified.
