# DONE — emergent-hot-spatial

## Summary

When `emergent.hot`, radius probes (`firstAlong`, `hitEntities`, arcs, reflect,
fields, gongs, contact arcs) go through the warm spatial hash via
`queryNearbyEntities` instead of walking the full `entityList`. Sticky
soft-falloff detonation stays a full walk (no hard cutoff). Scratch arrays —
no armed-frame alloc. Picture contract untouched.

## Before / after

### Portable microbench (primary KPI)

2500-entity crowd, 24 fields + 12 gongs + 48 live projectiles, 400 hot ticks:

| | No hash (full list) | Warm spatial hash |
|---|---|---|
| wall ms | 5921 | 1481 |
| speedup | — | **~4.0×** |

Soft-GPU fps not claimed.

### Focused tests

`test/emergent-arpg-primitives.test.mjs` — **5/5 pass** (seeds 4242 / 8008, no digest drift).

## Evidence

- Patch: `patches/0001-perf-emergent-spatial-hash-nearby-probes-when-emerge.patch`
- Scratch: `vm-work/hillclimb-20260924a` @ `027aa947d`
- Bench: `artifacts/emergent-hot-spatial-bench.json` + `.mjs`
- Tests: `artifacts/focused-tests.log`
- Measured against master `568d1358e` + optic-field-resident

## Apply order

Independent of membership packages. Stacks after `#31 optic-field-resident`
(smaller lists amplify the win less; still correct). Clean on bare master too.

## Risks

- Spatial hash only indexes colliding physics bodies (same contract as
  `combat/attackHit`). Closed-form no-physics movers remain on the fallback
  full-list path when the hash is cold.
- Sticky detonation intentionally not culled (infinite soft falloff).
