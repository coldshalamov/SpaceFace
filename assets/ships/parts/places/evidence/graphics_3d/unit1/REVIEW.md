# GRAPHICS_3D unit 1 — chase review

Hornet mill is parked. This is nav buoy + lane beacon at the live chase camera.

## Live (before this unit)

| Object | D=144 width | D=58 width | Read |
|---|---:|---:|---|
| Hitch (bar) | 10% | — | manufactured hull, mixed materials |
| Nav buoy | 1% (22px) | 3% | charcoal needle, cyan slit, orange stamp, four fins |
| Lane beacon | 5% | 11% | post + arm + cube |

The buoy envelope is only ~3 m across, so it stays a speck at default chase. Close (D=58) is the size where manufacturing has to read.

## Candidate (surgical remaster of the live Helios meshes)

Did not replace PQ-022 / gantry construction with a primitive stack. Kept sockets, collision empties, mapped materials, and live envelopes.

- Buoy: opened the head cap and put a dark metal floor just under the rim. Roof is a hollow crown, not a cyan coin. Orange daymark band wraps the spine. Cage, spine, and four-azimuth optics remain.
- Beacon: removed the solid boom (a groove in that slab does not read at 60°) and put two Y-separated rails. Close chase shows backdrop between the rails (one enclosed region, ~21% of the silhouette) and a circular well on the outbound pod.

Chase cameras: `play_chase`, `play_chase_abeam`, `play_chase_close`.

Disposition: **KEEP**. Promote same-slot over the live source and release rows.
