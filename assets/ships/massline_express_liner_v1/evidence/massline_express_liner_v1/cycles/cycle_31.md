# Cycle 31 — Massline Express Liner v1

LOD0 hash: `CC243E8499EBF2D6FA451CB30F9A369CFE9B1C8191737FF9B434633A3ADF4827`

Stills from the exported LOD0 GLB, live chase helper (60° tilt, FOV 50, D=144 / D=58, no yaw follow).

Source bounds 40.67 x 22.41 x 11.05 m. Length-to-beam 1.81.

| Still | Occupancy | Band |
|---|---:|---|
| play_chase.png | 17.47% width, uncropped | in 8–22% (packet target 13–18%) |
| play_chase_abeam.png | 9.77% width, 27.2% height, uncropped | in 8–22% (packet target 9–12%) |
| play_chase_close.png | 45.74% width, uncropped | in close ratio band |

What this cycle changed:

- Cycle 30's legal 1.81:1 envelope still read as a flattened ivory capsule. Cycle 31 rebuilds the pressure vessel as three manufactured stations: a directional boarding/operations bow with a framed vestibule, a parallel octagonal passenger span with two proud bulkhead rings, and an aft service taper whose load ring carries the outboard plant.
- Width comes from the occupied octagon plus equatorial corridor shells with wall thickness, framed smoked glass over a dark cavity, bulkhead returns, and a human-scale pane/door rhythm. The black I-beam galleries are gone.
- Boarding is a vestibule with threshold, framed door/transom, side panes, landing lip, and necks into the corridors. Direction reads from the bow at default, not only from the drives.
- Twin drives grow from the aft load ring through dark forged cheeks and tapered booms with gussets. Cases are octagonal manufactured profiles. Throats are hollow refractory bells with a dark metal rim and rooted stator vanes. Stay-cables, pale slabs, tan lids, and pizza-slice vanes are gone.
- Dorsal identity is one equipment well tied to the bulkheads, two differently sized radiator modules, and one offset repair plate. The row of identical roof boxes is gone.
- Unique maps were rebuilt per role. Isolation shows signed meso at frames, rings, boarding, wells, saddles, and throat; ORM keeps open shell bright and darkens cavities. Yellow normal wedges are gone.

LOD0 30036 tris / 5076 hull / 9 draws. LOD1 24984 / 5076 / 9. LOD2 9036 / 1428 / 8.

Implementing-agent verdict: `review_pending` / `evidence_ready`. Whole-asset G1/G2/G4 stay open. Source candidate only. Not wired.

Remaining risk: at D=144 the hull can still read as a large warm painted volume; corridor glass is smoked dielectric, not transmissive; drive vanes are rooted but still blocky stator blades. Independent review owns KEEP.
