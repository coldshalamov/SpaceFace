# DONE — customs-scan-cone-scratch

## Summary

Pool the returned cone object per scanner in a module WeakMap (no enumerable `_sf*` on entities). Scanner identity is still recomputed every call so patrol nets that clear role/flag correctly return `null` after break.

Focused: pq-148-02-smuggling-physics + pq-151-01-patrol-nets → **11/11** pass.

## Before / after

### Offline microbench (primary — portable CPU)

400 entities × 50k rounds; probe-all then cone-for-scanners (matches `_updateCustomsScanCones`):

| | Before (alloc cone) | After (WeakMap pool) | Speedup |
|---|---:|---:|---:|
| wall | **367.4 ms** | **265.3 ms** | **~1.38×** |

Phase A cite: hitch-hillclimb-fresh-20260923 — `customsScanConeOf` **15.0 ms** self / 60 s settled.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench. GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-law-reuse-customsScanConeOf-cone-via-WeakMap-sc.patch`
- Scratch: `vm-work/customs-scan-cone-scratch` @ `a0a063664757e008eb9f84c2a8cdafa07e22d79b`
- Microbench: `artifacts/customs-scan-cone-scratch-microbench.json`
- Tests: `artifacts/customs-scan-cone-scratch-focused-tests.log`
- Measured against master `35e519ebd`

## Apply order

Independent. Complements law long-tail; no dependency on other hitch packages.

## Risks

- Callers that retained a cone and expected a **fresh object identity** each call now see a stable per-entity object whose fields update in place. Current call sites only read `origin/heading/range/halfAngle` for the active tick.
- `lawSecurity.js` is CRLF on master — prefer `git apply --ignore-space-change` if `git am` conflicts on line endings.
