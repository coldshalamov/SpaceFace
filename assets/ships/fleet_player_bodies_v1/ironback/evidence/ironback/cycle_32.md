# Ironback MTX Cycle 32 — REVISE

Cycle 32 is the source-only D=144 hierarchy correction from the independent
Cycle 31 REVISE. Cycle 31's one dorsal cut had become a darker slot through
an oxide loaf: three hopper drums collapsed to one trough, the pulse pair
read as one hole, and the saw outclassed crusher and grab. This cycle keeps
one industrial chassis but rebuilds three separately readable process
registers — three hopper hatch bays with hull bulkheads between proud drum
crowns, two matched open pulse wells cut through the aft dorsal deck, and
one hopper-shoulder tool rail with four equal-class heads clear of the
wells. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

Built from exact Cycle 31 source. Original-resolution inspection of the
four named reads found the near pulse well still roofed; one in-cycle
hierarchy correction moved both wells onto the open dorsal deck and
stripped the aft-plate lids. Occupancy was legal on the final write:

- default chase: `17.45%` width (`279.3` px) — inside `8–22%`;
- abeam chase: `11.33%` width (`181.3` px) — inside `8–22%`;
- close chase: `44.32%` width (`709.1` px) — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.502` for the traced `41.28 WU` length. All three
supported views are legal and uncropped. Cycle 01–31 stills remain
byte-for-byte unchanged.

Original-resolution review of the exact-source stills:

- hopper register: three hatch bays with oxide bulkheads and raised
  coaming caps between them. Three drum crowns remain countable at D=144
  with hull-colored gaps, a ceramic apron forward of the first drum, and a
  short feed throat aft of the last. The continuous trough wall is gone;
- pulse register: two hull-cut dorsal wells of the same cavity class, dark
  floors, low rims, no bridge roof or aft-plate lid. Default chase still
  favors the far well as a hole because the camera sits on the near
  shoulder; the near well is an open dorsal recess of the same class,
  easier to miss at 17% width. Both recesses are present in clay;
- tool register: one hopper-shoulder rail/yard. Saw disc, ceramic drill,
  opposed mill plates, and four thick grab claws sit in negative space
  beside the hopper, not over the pulse wells. The saw remains the
  loudest silhouette but no longer dwarfs the other three;
- cross-ribs and stepped bays break the one-slot loaf. Cab, hopper, and
  pulse are separate registers. A cab/hopper join seam is still visible
  as a dark line in close chase;
- cab remains a framed dark greenhouse over the tub;
- oxide / dry ceramic / gunmetal separation is unchanged in intent. ORM
  red was rebaked from the new geometry.

This is an implementing candidate. It does not close Hitch-plus and does
not self-accept. The controller owns acceptance.

## Retained exact-source evidence

- LOD0: `7288FC4B45AD2666D278BC389F132C58D146AB6F84758313E06BECF355F45789`
  (`47,712` triangles, `8` draws, hull `6,864`)
- LOD1: `102BECF933F448C593821E466FDEBD0C670741EBD30F1CE42760654AEC629E30`
  (`44,911` triangles, `8` draws, hull `6,835`)
- LOD2: `DF4968DD400F827A55AB5944D8F1B2E4CF8D90C18AECD7AD25CEB0528C2A6827`
  (`33,410` triangles, `8` draws, hull `6,810`)
- Identity and occupancy: `cycles/cycle_32/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_32/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 01–31 evidence were not modified.
