# DONE — classify-frame-quiet-retain

## Summary

After #127 per-rock republish, quiet parked Ceres still cleared and rebuilt
every id list / physics partition / glass set each classify tick. Production
now retains the full frame when globals match and every visit entity keeps a
stable stamp + pose key, skipping clear+visit. Soft-GPU fps not claimed.
Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet classifyWorld full-frame retain × 8k; before = #127 path (frame retain
OFF → per-entity rock republish); after = frame retain ON. Isolated Node child
processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-frame-retain (primary, 11 pairs) | **~2.06–2.19×** | **≥1.61×** |

Package floor capture (5×11-pair runs @ 8k): medians ~2.04–2.19; mins
~1.61–2.02. Floor across package runs **≥1.613×** (clears ≥1.5× bar). Dirty-wake
proved: rock pose / player speed → `incremental` (not `frame-retain`). Focused
frame+rock-retain+activity-runtime+classification **44/44**. Soft-GPU fps not
claimed.

Phase A cite: classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127;
extends #127 full-visit retain by skipping republish when the whole visit is
stable. Held visit-loop / stamp-reuse are different angles (cadence / inert).

### Focused tests

`node --test test/classify-frame-quiet-retain.test.mjs test/classify-rock-visit-quiet-retain.test.mjs test/activity-runtime.test.mjs test/activity-classification.test.mjs`
→ **44/44** pass (frame retain + pose/speed/mining wakes + bench toggle + prior
rock retain + activity runtime/classification).

## Evidence

- Patch: `patches/0001-perf-activity-quiet-retain-full-classify-frame.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ `03613271d`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Microbench: `artifacts/classify-frame-quiet-retain-microbench.json`
- Floor: `artifacts/classify-frame-quiet-retain-floor-summary.json`
- Tests: `artifacts/focused-tests-classify-frame-quiet-retain.log`

## Apply order

After `classify-rock-visit-quiet-retain` (#127).
Stacks under classifyWorld residual.

## Risks

- One-tick stale `lastObservedT` on retained stamps while parked (wakes still
  force a full visit). Far/shelved catch-up does not read live stamp cadence.
- Bench toggle off restores #127 per-entity republish for A/B; production
  default is frame retain on.
