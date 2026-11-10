# DONE — classify-flying-rock-retain

## Summary

Production quiet flight still paid classifyWorld's visit clear + resolvePins /
classifyActivity / applyStamp on every tick while flying, because #138 early
latch / #128 frame-retain / #127 rock-visit retain are parked-only (player
vel² > 0.25). Flying frame retain short-circuits when the visit set is unchanged
and every rock's glass/runway membership, pin bits, sim tier, and pose stay
stable; per-rock flying retain covers partial disc churn. Soft-GPU fps not
claimed. Picture contract ON / unchanged.

Different angle from held rock context-only resolvePins (~1.09×) and from
parked retain family (#127/#128/#138).

## Before / after

### Offline microbench (primary — portable CPU)

Quiet flying `ensureActivityClassified` × 20k; 48 rocks + player @ vel.x=40.
Before = flying retain OFF (early latch + frame/rock retain still ON); after =
flying retain ON. Isolated Node child processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| rocks48 flying (5×11-pair floors) | **~2.39–2.49×** | **≥2.03×** |
| primary in-process cite | ~2.39× | ≥2.32× |

Package floor capture (5×11-pair isolated @ 20k flying): medians ~2.43 range;
package floor minSpeedup **≥2.03×** (clears ≥1.5× bar). Dirty-wake proved:
pose jump / mining pin (`dirtyWakeOk: true`). Long cruise correctness soak:
0 stale-glass flips across 6000 flying ticks. Focused latch + prior suites
**95/95**. Functional tumble/snare/ace **7/7**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): classifyWorld residual after #138; flying/rescan path under
that residual.

### Focused tests

`node --test test/classify-flying-rock-retain.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/tactical-ai-production-cadence.test.mjs test/classify-early-quiet-latch.test.mjs test/classify-frame-quiet-retain.test.mjs test/classify-rock-visit-quiet-retain.test.mjs test/docking-corridor-far-quiet-latch.test.mjs test/poi-scan-all-identified-quiet-latch.test.mjs test/asteroid-field-interact-still-quiet-latch.test.mjs test/far-empty-quiet-latch.test.mjs test/optic-far-quiet-latch.test.mjs test/decode-runway-empty-far-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/fields-idle-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/inf-027-tumble-recovery.test.mjs`
→ **95/95** pass.

Functional: `inf-027-tumble-recovery` + `pq-031-02-npc-counterplay` +
`pq-030-01-snare` → **7/7** pass.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `c2a9bf1733560e100a43e285845823bebd91523a`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323` through #140 tip `bed5a3fa9`
