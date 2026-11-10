# DONE — hitch-opening-admission (measured miss — **not shipping patches**)

## Attempt

Soft-GPU `opening.planWait` polled up to 8 s for a concurrently captured submission
plan (~2.3–2.5 s of `prepareOpeningGpuResources` wall on quiet VM). Patch: skip the
await and self-build via `buildOpeningSubmissionPlan`.

## Result on crucible seed 4242 (soft-GPU)

| Step | Before | After no-await |
|---|---|---|
| opening.planWait | **2372 ms** resolved | **0 ms** skipped (soft-gpu-self-build) |
| opening.residency | 4 ms | **571 ms** |
| opening.drainWait | 0 ms | **1888 ms** |
| wait.prepareOpeningGpuResources | 2480 ms | **2512 ms** (flat — cost moved) |
| launch to flight | 10.2 s | 10.2 s |
| hitch callbacks | 232/347 | 213/370 |
| worst frame | 1250 ms | 1233 ms |

## Judgment

**Do not import.** Killing planWait alone does not shrink the opening GPU-resource wall;
the fire-and-forget soft-GPU cook still serializes the same work under residency/drainWait.
Picture contract untouched; scratch kept local for forensics only
(`vm-work/hitch-opening-admission`).

## Next for this pole

Need a real drain/residency slice on soft-GPU (or accept fire-and-forget and stop awaiting
`prepareOpeningGpuResources` from the loading path entirely) — not a planWait rename.
