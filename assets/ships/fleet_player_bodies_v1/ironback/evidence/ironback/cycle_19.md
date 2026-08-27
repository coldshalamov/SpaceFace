# Ironback MTX Cycle 19 — REVISE

Cycle 19 materially improves the retained pressure-frame candidate. It adds measured camera
occupancy, much heavier turntables/yokes/booms/hydraulics and tool heads, a larger framed command
cage, deeper authored hopper geometry, and more explicit pulse-bed parts. The exact LOD0 source was
re-imported for every still. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

The single Blender 5.1 build wrote all source/evidence artifacts and then failed closed on the first
occupancy fingerprint:

- default chase: `17.903%` width — inside `8–22%`;
- abeam chase: `11.836%` width — inside `8–22%`;
- close chase: `46.914%` width — outside `20–42%`;
- no supported view crops.

The traced `41.28 WU` runtime presentation length and shared D=144/D=58 camera are correct and must
not be changed. Cycle 20 must reduce the transverse/outboard envelope through real source
construction while keeping the default barge read.

Original-resolution review found additional material failures:

- the heavier four-arm load path is a real improvement, but the close envelope remains too wide;
  fold/package the arms closer without returning to thin antenna chains;
- the hopper still presents as a flat tan rectangle with a circular hole. Its lowered floor, liner,
  grizzly and breaker geometry do not create visible depth or a believable material route in any
  supported chase view;
- the blue multi-pane object on the shoulder still reads as a service box, not an armored forward
  command cage integrated into the pressure frame;
- the new pulse-bed parts do not resolve as twin impulse chambers/plates. The aft shoulders remain
  generic dark blocks from the supported views;
- the dominant body remains a large rectangular slab with broad unexplained plate fields. The
  normal-isolation pass is still almost flat over those zones despite the added detail geometry.

A re-render, per-view scale, camera change, recolor, or texture-noise pass cannot close these facts.
Cycle 20 needs a more readable open hopper section, an integrated command/processing hierarchy,
visible dorsal pulse beds, stepped load-bearing sponsons, and a narrower but still broad working
envelope.

## Retained exact-source evidence

- LOD0: `BA931E69956FC563CD096AFDCBECDCAF41E2D8F59711E3B735501C452C541417`
  (`46,582` triangles, `8` draws)
- LOD1: `8BEC3E5DF08715189CA67AAF8FDCDEDEE28E0FD6AA06FB94CA4413CEEE37EA43`
  (`33,390` triangles, `8` draws)
- LOD2: `BF608201CADA4FBAFFFA41C5C338FD178C00676FC6729AFA2C8B8A4C6258E3A9`
  (`21,158` triangles, `8` draws)
- Identity and occupancy: `cycles/cycle_19/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_19/*.png`

No live, release, package, manifest, runtime, texture, or program-map path changed in this cycle.
