# DONE — stunt-flight-range-prefilter

## Summary

Prefilter `StuntFlightObserver.update` threat walk: only `ship`/`projectile`/`drone` inside **2400 WU** reach `hostileThreat` → `isHostileForAI`. Needle/history body sampling unchanged (still distance-gated for colliders).

Focused: stunt-combo + stunt-taxonomy + pq-155-03-stunts-pay → **20/20** pass.

Note: `test/pq146-flight-evidence.test.mjs` classify→kickstart assert also fails on bare master (pre-existing); observer still emits the escape receipt under this patch.

## Before / after

### Offline microbench (primary — portable CPU)

350 entities × 1500 threat-scan iterations (mix of near/far ships, projectiles, asteroids, pickups):

| | Before (hostile first) | After (type+range first) | Speedup |
|---|---:|---:|---:|
| wall | **46.4 ms** | **9.1 ms** | **~5.1×** |

Phase A cite: hitch-hillclimb-fresh-20260923 — `StuntFlightObserver.update` **~116 hits** self; `isHostileForAI` **39.6 ms** / `pruneEvidence` residual still open.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench. GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-combat-type-range-prefilter-before-stunt-flight.patch`
- Scratch: `vm-work/stunt-flight-range-prefilter` @ `342fde89b06265324d30a85b41f573ee8a9e4185`
- Microbench: `artifacts/stunt-flight-range-prefilter-microbench.json`
- Tests: `artifacts/stunt-flight-range-prefilter-focused-tests.log`
- Measured against master `35e519ebd`

## Apply order

Independent.

## Risks

- Threats beyond 2400 WU are ignored for new track admission (2s intercept window at generous relative speed). Existing tracks still age out on their own timers.
- Non ship/projectile/drone types never entered useful hostileThreat paths for intercept tracking.
