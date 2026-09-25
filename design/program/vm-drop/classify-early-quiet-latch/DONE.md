# DONE — classify-early-quiet-latch

## Summary

Quiet parked flight still paid `classifyWorld`'s extents / `rebuildPinFacts` /
`selectClassifyEntities` / frame-retain re-arm every tick after #128 already
proved the visit set stable. Early quiet latch short-circuits before that work
when parked + prior frame-retain armed; pose-key verify keeps rock teleports
honest. **Different angle from held selectClassify id-replay (~1.16×)** and
rock visit-context (~1.09×). Soft-GPU fps not claimed. Picture contract ON /
unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `ensureActivityClassified` × 20k; 48 parked rocks. Before = early latch
OFF (frame-retain still ON); after = early latch ON. Isolated Node child
processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| early-quiet-latch (5× isolated 11-pair floors) | **~2.78–2.87×** | **≥2.31×** |
| primary in-process (supporting) | ~2.88× | ≥2.49× |

Package floor capture (5×11-pair isolated @ 20k): medians ~2.78–2.87; mins
across those runs ≥2.31×. Floor across package runs **≥2.31×** (clears ≥1.5×
bar). Dirty-wake proved: move / membership / mining pin / rock pose → latch
clears (`dirtyWakeOk: true`). Focused classify + prior latch suites **96/96**.
Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): classifyWorld residual after #127+#128.

### Focused tests

`node --test test/classify-early-quiet-latch.test.mjs test/classify-frame-quiet-retain.test.mjs test/classify-rock-visit-quiet-retain.test.mjs test/docking-corridor-far-quiet-latch.test.mjs test/station-docking-corridor.test.mjs test/poi-scan-all-identified-quiet-latch.test.mjs test/asteroid-field-interact-still-quiet-latch.test.mjs test/far-empty-quiet-latch.test.mjs test/optic-far-quiet-latch.test.mjs test/decode-runway-empty-far-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/fields-idle-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs`
→ **96/96** pass (early latch / move wake / membership wake / mining wake /
pose wake / bench toggle / flying refuse + prior latch suites).

## Scratch

- Branch: `vm-work/hillclimb-20260924k`
- Tip: `1d86cef4a379873c7dc43103683864302e227ae7`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
