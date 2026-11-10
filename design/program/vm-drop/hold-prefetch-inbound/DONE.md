# DONE — hold-prefetch-inbound (measured miss — **not shipping patches**)

## Attempt

On master tip (already has Lane C hold-prefetch + rock-collect + wave-hull Choice B
+ hitch floor 6.5), unwire `onBus('run:wavePlanned' → _kickWaveHullDecodeRunway)` and
stop prefer-sorting `kickDecodeRunwayAssets` by wave-catalog keys. Keep
`isHoldExemptMeshBuild` inbound approach + `kickDecodeRunwayAssets` for contacts on
the approach runway. No `#24` yield-after-present. Focused tests **30/30**.

Scratch kept local: `vm-work/hold-prefetch-inbound` @ `730e76ecb`.

## Soft-GPU crucible seed 4242 (30 s) vs master `a57d7036d`

| Metric | Before (master, wave kick ON) | After (inbound-only) | Notes |
|---|---|---|---|
| hitch callbacks | **37 / 384** | **33 / 375** | mild hitch win |
| worst frame | **350 ms** | **733 ms** | **miss** |
| p99 | 200 ms | 166.6 ms | mild win / noise |
| game speed | **70.4 %** | **69.7 %** | flat / slight miss |
| long-frame peak admission | **13 ms** | **27 ms** | **miss** |
| novelty NOVEL | **14** | **16** | miss |
| typical admission | 0.6 ms | 0.6 ms | flat |

## Judgment

**Do not import as a hitch package.** Hitch count edged down, but worst frame, peak
admission, and novelty moved the wrong way — spawn-cohort decode cost returns when
the wave-catalog kick is removed. On this soft-GPU host, master's stacked wave kick
+ hitch floor is already the better balance. Keep scratch for forensics only.

## Note

Hold-prefetch inbound approach (`2e3da7ff3` / rock-collect) is **already on master**
via the C+D merge. This job only tested *removing* the wave-catalog half.

## Next poles

- Owner-GPU re-check of wave-hull Choice B alone (prior midflight miss was on older tip).
- Portable CPU: more `syncEntityViews` / `prepareFrame` cuts from cpu-profile-flight.
- `cloneUniforms` pooling deferred — not a small safe cut (Three internal / material clone ocean).
