# PQ-129.06 — live shader-key census

## Result

`PQ-129.06` is complete. The Intel D3D11 route still links shader programs after the loading-shell
precompile has quiesced, and the misses are exact live Three.js cache keys rather than inferred
console warnings.

The probe now binds every retained precompile owner to its actual `currentProgram.cacheKey`, uses
cache keys rather than unstable program ids, cross-checks the production GL counters against an
independent `linkProgram` wrapper, and records live owner/key diffs at each route boundary.

## Bound evidence

- Runtime: headed Chromium on `ANGLE Intel(R) Graphics Direct3D11 vs_5_0 ps_5_0` (hardware,
  `software=false`), 1280x800, default visual quality.
- Opening + traffic artifact: `.devshots/perf/pq129-06-shader-key-census-hardware.json`, SHA-256
  `03DB30D619B975034904955A5668168A1A8652A09AB6279287E11EAE6B7623EF`.
  - 111 boot programs; 27 retained keep-alive keys; zero retained keys missing from the opening
    renderer cache.
  - Ten live traffic ships observed.
  - Fifteen post-quiescence links: fourteen draw-time misses and one late precompile link.
  - Eleven canonical keys appeared during idle flight and four during the public weapon/boost
    stimulus.
- First-combat artifact: `.devshots/perf/pq129-06-shader-key-census-combat.json`, SHA-256
  `F13AC4DB20A9F6E077D86E9D63503120C5760CBD762BB81DC007397410FCC34C`.
  - The dev-visible Combat Range card drove the real New Game pipeline and canonical spawn writers.
    Nine traffic ships, three canonically hostile ships, a hostile target lock, and player fire were
    all observed on the live renderer.
  - 111 boot programs; the same 27 retained keep-alive keys; zero missing from the opening cache.
  - Twelve post-quiescence links, all draw-time misses. Six canonical keys appeared only during the
    combat stimulus.
  - Fourteen final combat keys were absent from the ordinary opening cache.

The public New Game -> Ceres -> Throughline approach was also characterized. It admitted additional
traffic/hull/canopy/plume keys but did not acquire a hostile lock, so it is retained only as contact
and sector-admission evidence, not mislabeled as first combat.

## Decision

Promote the existing `PQ-129.07` exact-key prewarm leaf. Do not treat shader warnings as evidence,
warm the whole sector, or reintroduce the previously reverted broad BatchedMesh/shadow warmups that
made same-machine flight worse. Candidate dummies must match the measured live key owners and must
be reverted if the headed fly worsens or the cost moves into Continue.

## Verification

- `node --check scripts/probe-shader-compile-timeline.mjs`
- `node --test test/authored-precompile-residency.test.mjs` — 5/5 passed
- Both headed hardware probes exited 0; production and page-level shader-link counters agreed.
