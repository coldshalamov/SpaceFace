# Ironback MTX Cycle 30 — REVISE

Cycle 30 is the source-only D=144 correction from the independent Cycle 29
REVISE. It keeps the one-piece lofted barge, legal occupancies, centerline
open well, manufactured plate courses, framed dark cab tub, oxide / dry
ceramic / gunmetal separation, sockets, collision, LODs, and functional
process fiction. It rebuilds three raised hopper drums plus apron/throat so
the process is nameable at default chase, deepens and enlarges both open
pulse chambers as two distinct dorsal voids, and enlarges the four rooted
tool process masses so a stranger can tell saw, crusher, drill, and grab
apart at D=144. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

One Blender 5.1 run from exact Cycle 29 source. Occupancy was legal on the
first write; there was no second run:

- default chase: `17.45%` width (`279.3` px) — inside `8–22%`;
- abeam chase: `13.05%` width (`208.9` px) — inside `8–22%`;
- close chase: `44.32%` width (`709.1` px) — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.502` for the traced `41.28 WU` length. All three
supported views are legal and uncropped. Cycle 18–29 stills remain
byte-for-byte unchanged.

Original-resolution review of the exact-source stills:

- the hull remains one lofted barge with a dorsal cavity and a floor. Abeam
  centerline is dark well, not studio. Plate courses keep lip thickness and
  seam channels. At D=144 they still read more as value steps than a fully
  countable plate diagram; the silhouette is still a blunt barge;
- hopper process no longer collapses to one dark trough at default chase.
  Three raised Y-axis drums with ceramic bands, a fore ceramic apron, air,
  proud V-jaws, and an aft dark throat are countable on `play_chase` and
  clearer on abeam/clay. Close still shows the open well, not a filled crib;
- two pulse houses are larger open U chambers with tall gunmetal walls,
  ceramic rims, and deep dry floors. Default chase and abeam show two
  separate dorsal voids with an oxide strip between them. Starboard still
  takes more key light than port, so the pair is not perfectly matched in
  luma. Both remain genuinely open/dry, not fighter bells;
- the four tools are larger rooted process masses, not bolted corner kits.
  Default chase can name the saw disc, the long ceramic drill, the four-tine
  grab, and the opposed crusher V. Crusher remains the smallest of the four
  at D=144;
- cab remains a framed dark greenhouse over the tub;
- oxide / dry ceramic / gunmetal separation is unchanged in intent. ORM red
  was rebaked from the new geometry.

This is an implementing candidate. It does not close Hitch-plus and does not
self-accept. The controller owns acceptance.

## Retained exact-source evidence

- LOD0: `88181589F1ED01B4646942A7D143881C0DFBF05840E0D6EA9B28B2D8602D1E87`
  (`44,258` triangles, `8` draws, hull `3,920`)
- LOD1: `6BA13C33C057F290F17A007CB25090F124DE0060E0D2B905FFBC4D945F395DB1`
  (`41,464` triangles, `8` draws, hull `3,758`)
- LOD2: `5008865469A184FE339EDBF2F2F1DE04EB871551F3BD1D002610630171724169`
  (`30,202` triangles, `8` draws, hull `3,552`)
- Identity and occupancy: `cycles/cycle_30/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_30/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 18–29 evidence were not modified.
