# DONE — optic-far-quiet-latch

## Summary

Quiet idle flight still paid `queryAsteroidField` over the authored-prefetch
disc plus an entityList optic shelve scan every tick with no optic interest
nearby (far Prism Gallery / empty decode disc). Production now quiet-latches
after an empty-interest probe; wakes on `asteroidField.version`, entity-index
membership, player move beyond ~15% of enter, or a 0.5 s rescan.
**Nearby optic still promotes; live optic inside exit prevents latch.**
Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `tickOpticFieldRocks` × 60k; 280 near non-optic field rocks + 40 far
optic lattices (~4800 WU). Before = latch OFF (query + shelve walk every
tick); after = latch ON. Isolated Node child processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| far-from-optic (primary, 11 pairs) | **~20.5–21.5×** | **≥12.8×** |

Package floor capture (primary + 5×11-pair rebenches @ 60k): medians
~20.50 / 21.34 / 21.35 / 20.59 / 21.45 / 21.17; mins across those runs
≥12.76×. Floor across package runs **≥12.8×** (clears ≥1.5× bar). Dirty-wake
proved: field.version / membership bump → armedTick refreshes; player move
beyond wakeMove2 re-probes. Nearby optic promotes and refuses latch.
Focused latch + asteroid-field + optic-field + decode-runway **30/30**.
Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `queryAsteroidField` ~50 self + `tickOpticFieldRocks` ~21 self under
world.update / registry.step residual after #132.

### Focused tests

`node --test test/optic-far-quiet-latch.test.mjs test/asteroid-field.test.mjs test/optic-field.test.mjs test/asteroid-query-callers-decode-rocks.test.mjs`
→ **30/30** pass (latch / version wake / membership wake / player-move wake /
near promote refuses latch / bench toggle / asteroid field / optic field /
decode runway).

## Evidence

- Patch: `patches/0001-perf-world-quiet-latch-optic-field-tick-when-far-from.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ `e0a069c3b`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Microbench: `artifacts/optic-far-quiet-latch-microbench.json`
- Floor: `artifacts/optic-far-quiet-latch-floor-summary.json`
- Tests: `artifacts/focused-tests-optic-far-quiet-latch-suite.log`

## Apply order

After `far-empty-quiet-latch` (#132). Independent of classify packages;
stacks under world / tickOpticFieldRocks residual.

## Risks

- Mid-life optic stamp into an empty decode disc without field.version /
  membership bump waits up to ~0.5 s (or until the player moves ~15% of
  enter) before rescan may promote — spawn/field insert / membership still
  wakes immediately.
- Bench toggle off restores always-walk for A/B; production default is latch on.
