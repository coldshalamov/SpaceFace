# Ironback MTX Cycle 20 — REVISE

Cycle 20 replaces the Cycle-19 lidded hold with a four-piece perimeter barge: port and
starboard sponsons, a forward pressure neck, an aft spine, and a genuine open hopper
well with no centerline dorsal wrap. Arms sit in recessed turntable wells with shorter
heavy booms. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

The single Blender 5.1 build wrote all source/evidence artifacts and then failed closed
on occupancy:

- default chase: `17.591%` width — inside `8–22%`;
- abeam chase: `8.951%` width — inside `8–22%`;
- close chase: `45.341%` width — outside `20–42%`;
- no supported view crops.

Runtime display scale is `2.505` for the traced `41.28 WU` length. Default and abeam stay
legal. Close width is the length axis at D=58; compacting the beam lowered close height
from `45.1%` to `34.2%` and close width only from `46.91%` to `45.34%`. A later cycle
cannot clear the 42% close band by thinning arms further without dropping abeam under 8%,
and must not change the camera, bands, or 41.28 WU scale.

Original-resolution review of the exact-source stills:

- the tan lid/circular-hole read is gone. Default and close both show a dark central well
  (close center luma ~12–29 against orange deck ~120). Hazard rim, inner ribs and a lowered
  floor are visible at D=58. Conveyor/breaker/gates still do not carry the play-size read;
- the four arms remain heavy and are packed closer (default height `13.6%` vs Cycle 19
  `17.8%`), but turntable wells and tool heads are still weak at D=144;
- the command greenhouse is larger and has roof panes, yet it still reads as a small
  isolated blue/bright mass on the forward block, not a cab at D=144;
- aft pulse wells are open structures with plate stacks rather than painted pits, but they
  still read as dark boxes with slits, not twin impulse chambers from the supported views;
- the body is no longer one solid hold, but large dorsal zones stay planar. The
  normal-isolation pass is still a uniform lavender silhouette across the ship bbox.

A re-render, camera change, or texture-noise pass cannot close these facts. Cycle 21 needs
a darker, machinery-readable hopper at D=144, a cab whose roof glass and neck dominate the
forward block, pulse chambers whose plate edges read as open beds, real plate steps on the
largest decks, and an occupancy plan that does not assume beam packing can put 41.28 WU
under 42% at D=58.

## Retained exact-source evidence

- LOD0: `AFB64F21423A28B11AE8573E90D73B8E90F1C8137DACCAA2E853A3DBF7F43FB4`
  (`49,942` triangles, `8` draws)
- LOD1: `CFD8AFF3ADFD680D1BE4CF18CB7354192ED8F40755E49856C1D3141D4ECA5F66`
  (`36,310` triangles, `8` draws)
- LOD2: `88CEEAA0AAD3199AB9CC679943B4D954A3A6E49B12E8001B7EC212730B8D718B`
  (`24,282` triangles, `8` draws)
- Identity and occupancy: `cycles/cycle_20/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_20/*.png`

No live, release, package, manifest, runtime, texture, or program-map path changed in this cycle.
Cycle 18 and Cycle 19 evidence were not modified.
