# INV-13 — Is flight GPU-bound or CPU-bound on this laptop? (READ-ONLY, one lock hold)

You change no tracked file. Files only under `.devshots/fleet/inv13/`. Reuse your INV-05 probe (`.devshots/fleet/inv05/`)
and Swarm round 1 + the Adventure opening. In ONE lock hold (never kill a holder you did not start):
1. Before each run, time a fixed JS workload (e.g. 50 ms of a deterministic loop measured with performance.now — report
   how long it actually took) so loaded vs quiet machine states are comparable across runs.
2. A/B on the same scene, 20 s each, interleaved: (a) shipped settings; (b) `renderScale` 0.5; (c) bloom off; (d) both.
   Set them through the game's own settings API/state the way the settings screen does. Record mean fps, rAF p50/p95,
   render phase p50, GPU pass times if the bloom-cost probe's timer queries work here (`scripts/fleet/looks/bloom-cost.mjs`).
3. In steady flight (shipped settings), count per frame: `renderer.info.render.calls`, programs switched
   (`setProgram` calls), `getProgram` calls, and time in `canonicalizeSurfaceProgramFamilyKey` /
   `canonicalizeInstalledSurfaceProgramKey` (`src/render/illustratedSurface.js:173,192`) — they should be ~0 in steady
   flight.
## Receipt
The A/B table, the workload calibration per run, the per-frame counts, and a verdict: GPU-bound (frame time falls with
renderScale/bloom) or CPU-bound (it doesn't), with the top 3 levers for this laptop and their evidence.
