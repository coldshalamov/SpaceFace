# DONE — decode-runway-empty-far-quiet-latch

## Summary

Quiet idle flight still paid `authoredPrefetchRadius` + wide `queryFarActors`
grid walk every tick with an empty far table (after #132 latched
`tickFarActors` shelve/restore). `far-query-row-scan` only helped
`rows.length > 0`; empty tables fell through to the empty-cell grid walk.
Production now early-returns empty rows in `queryFarActors` and quiet-latches
`requestDecodeRunwayPromote`; wakes on `farActors.version`, player move beyond
~15% of decode enter, or a 0.5 s rescan. **Promote still runs when far rows
exist.** Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `requestDecodeRunwayPromote` × 60k; empty far table, player maxSpeed 160
(decodeR 640). Before = latch OFF (empty grid walk + prefetch every tick);
after = latch ON. Isolated Node child processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| empty-far decode-runway (primary+rebenches, 11 pairs) | **~8.4–10.0×** | **≥2.4×** |

Package floor capture (primary + 5×11-pair rebenches @ 60k): medians
~8.38 / 9.17 / 9.34 / 9.56 / 9.98 / 9.17; mins across those runs ≥2.40×.
Floor across package runs **≥2.4×** (clears ≥1.5× bar). With-far-rows path
~1.0× (no skip). Dirty-wake proved: farActors.version bump → armedTick
refreshes; player move beyond wakeMove2 re-probes. Focused latch + far-actors
+ shelf-promotion + decode-runway + far-query-row-scan + cell-key **45/45**.
Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `queryFarActors` / `requestDecodeRunwayPromote` under world.update /
registry.step residual after #132+#133.

### Focused tests

`node --test test/decode-runway-empty-far-quiet-latch.test.mjs test/far-empty-quiet-latch.test.mjs test/far-actors.test.mjs test/far-shelf-promotion.test.mjs test/decode-runway-residency.test.mjs test/far-query-row-scan.test.mjs test/far-actor-cell-key.test.mjs`
→ **45/45** pass (latch / version wake / player-move wake / far-rows refuse
latch / bench toggle / empty early-return parity / far-actors / shelf
promotion / decode runway / row-scan / cell-key).

## Evidence

- Patch: `patches/0001-perf-world-quiet-latch-decode-runway-promote-when-far.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ `8ba219286`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Microbench: `artifacts/decode-runway-empty-far-quiet-latch-microbench.json`
- Floor: `artifacts/decode-runway-empty-far-quiet-latch-floor-summary.json`
- Tests: `artifacts/focused-tests-decode-runway-empty-far-quiet-latch-suite.log`

## Apply order

After `optic-far-quiet-latch` (#133). Independent of classify packages;
stacks under world / requestDecodeRunwayPromote residual.

## Risks

- Mid-life far insert without `farActors.version` bump waits up to ~0.5 s (or
  until the player moves ~15% of decode enter) before rescan may promote —
  insertFarActor / removeFarRecord bump version and wake immediately.
- Bench toggle off restores always-walk (empty grid + no latch) for A/B;
  production default is latch on.
