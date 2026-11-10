# Director CPU diagnostic

`cpu-report.json` measures the production NOCTURNE registry and director on a stationary grid of logical point sources, with the camera, source parameters, Node version, CPU model, exact Three revision, and source SHA-256 recorded in the report. It does not create a WebGL context. Each run warms 200 updates and measures 2,000 updates at a simulated 60 Hz, with selection scheduled at 8 Hz. GPU structure remains eight point lights and three spots; this CPU diagnostic disables shadow-map updates.

| Logical sources | Mean update | p95 update | p99 update | Maximum update |
| --- | --- | --- | --- | --- |
| 128 | 0.01390 ms | 0.05875 ms | 0.16847 ms | 0.99608 ms |
| 512 | 0.01857 ms | 0.07717 ms | 0.21559 ms | 0.49759 ms |
| 1,024 | 0.03545 ms | 0.16329 ms | 0.24966 ms | 3.12628 ms |

The report separately records updates that recompute selection and updates that retain it. These are wall-clock samples on a shared AMD EPYC host, not a quiet target-hardware comparison. Scheduling and garbage-collection outliers are retained. The uncollected process-heap delta includes benchmark sample arrays and JIT activity; it does not establish transient allocation cost or retained memory.

Reproduce from the repository root:

```sh
node scripts/nocturne-director-bench.mjs --sources=128,512,1024 --frames=2000 --warmup=200 --out=.devshots/nocturne/director-cpu.json
```

This is synthetic CPU evidence only. It establishes neither full-game frame time nor GPU lighting cost, dynamic-shadow cost, volumetric cost, shader compilation behavior, visual acceptance, or integrated-GPU acceptance. The measured working-source digest is authoritative for this report; its recorded Git HEAD predates the uncommitted implementation.

## Focused runtime regressions

`regression-results.json` records 77 passing tests across nine directly executed Node test files for the director, private depth admission, real VFX/weapon adapters, lifecycle, settings persistence, and existing headlight/shadow/settings contracts. The final bridge follow-up adds the actual `game:exitToMenu` subscription and the existing VFX decay path: a live event's CPU envelope must retire, so the next menu update cannot republish its light. That regression failed before the boundary list was fixed and passed afterward. It also checks that an intentionally retained runtime handle releases old scene and candidate references, unsubscribes from boundaries, and disposes each GPU resource at most once, including a lost-context teardown followed by another disposal call. Only the affected bridge file was rerun for these final lifecycle changes; the earlier per-file outputs remain recorded.
