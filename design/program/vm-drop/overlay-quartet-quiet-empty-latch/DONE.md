# DONE — overlay-quartet-quiet-empty-latch

## Summary

Quiet settled flight still paid `_updateWantedSearchRing` /
`_updateCustomsWeirLines` / `_updateRouteRibbon` /
`_updatePayloadReleaseGhost` (four truth readers + mesh hide writes) every
tick while all four overlays were inactive. Production now latches after the
first empty observe and wakes on a cheap identity/ref snapshot (heatZone
flags, customsWeir ref, nav/autopilot/waypoint/target refs, tether
phase/targetId, payloadReleaseGhost ref) — not a full truth re-read.
Different angle from held truth-reread wake / overlay-bundle ~0.99–1.03×.
Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet inactive overlay quartet × 200k; before = four updates unlatched;
after = identity-wake latch. Isolated Node child processes per mode.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-overlay-quartet-empty (primary, 13 pairs) | **~16.5×** | **≥6.55×** |

Package floor capture (5×13-pair runs @ 200k): medians 16.48 / 16.64 / 17.88 /
16.74 / 16.40; mins 6.55 / 14.87 / 15.80 / 16.04 / 12.69. Floor across package
runs **≥6.55×** (clears ≥1.5× bar). Dirty-wake proved: heatZone / customsWeir
ref / nav waypoint / payloadReleaseGhost ref. Focused latch+customs+route
33/33. Soft-GPU fps not claimed.

Phase A cite: prepareFrame / VFX residual after #122 projectile-trails.

### Focused tests

`node --test test/overlay-quartet-quiet-empty-latch.test.mjs test/customs-weir.test.mjs test/map-route-ribbon.test.mjs`
→ **33/33** pass (empty latch + heat/customs/nav/ghost wakes + frame update + related suites).

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-overlay-quartet.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
- Microbench + 5 package rebench floors in `artifacts/`
- Focused logs in `artifacts/`
