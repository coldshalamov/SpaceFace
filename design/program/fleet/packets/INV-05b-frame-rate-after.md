# INV-05b — Frame rate after the perf batches (READ-ONLY, measured)

You change no tracked file. Re-run your INV-05 probe (`.devshots/fleet/inv05/`) on current HEAD through the lock (never
kill a holder you did not start): 30 s of the Adventure opening and 30 s of Swarm round 1, same flags and settings
as INV-05. Since INV-05, these landed: PERF-HOT-01/02/03 (per-frame allocations, threat-plate handles, credit chips
instanced, brood pods removed, exemplar kits parked), VFX LOD (sprite volumes 768 -> 144 tris when small), PUBLISH-01.
Report next to the INV-05 numbers: mean fps, rAF p50/p95/max, long tasks > 50 ms, draw calls and triangles median
(and first-third vs last-third for Swarm, which decayed 24 -> 14 fps before), programs, visible meshes, and the
render / UI / VFX phase p50/p95. Then the top 15 self-time functions in a 10 s Swarm profile and what changed vs
INV-05. Say plainly whether Swarm still decays over the 30 s.
