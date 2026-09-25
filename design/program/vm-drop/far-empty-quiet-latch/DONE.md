# DONE — far-empty-quiet-latch

## Summary

Quiet idle flight still paid `ensureActivityClassified` + shipLike/wreck
shelve-candidate walk every tick with an empty far table and no S2/S3/S4 virt
candidates. Production now quiet-latches when far is empty and a probe found
no virt candidates; wakes on entity-index membership or a 0.5 s rescan.
**Restore always runs when far rows exist.** Soft-GPU fps not claimed.
Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `tickFarActors` × 60k; 48 ships/wrecks, S0/S1 only, empty far table.
Before = latch OFF (classify + shelve walk every tick); after = latch ON.
Isolated Node child processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| empty-far+no-virt (primary, 11 pairs) | **~29.3–30.0×** | **≥18.3×** |

Package floor capture (primary + 5×11-pair rebenches @ 60k): medians
~29.31 / 29.42 / 29.97 / 29.52 / 29.75 / 29.81; mins across those runs
≥18.32× (primary) / ≥24.42× (rebenches). Floor across package runs
**≥18.3×** (clears ≥1.5× bar). With-far-rows restore path ~1.0× (no skip).
Has-virt-candidates ~1.0× (full path). Dirty-wake proved: membership bump →
armedTick refreshes. Focused latch + far-actors + shelf-promotion +
decode-runway **34/34**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): farActor careful empty-far+no-virt was **held for integrate** after
synthetic ~24× — cleared by real `tickFarActors` A/B with restore preserved.

### Focused tests

`node --test test/far-empty-quiet-latch.test.mjs test/far-actors.test.mjs test/far-shelf-promotion.test.mjs test/decode-runway-residency.test.mjs`
→ **34/34** pass (latch / membership wake / bench toggle / restore with rows /
dormant shelves / rescan / far-actors suite / shelf promotion / decode runway).

## Evidence

- Patch: `patches/0001-perf-world-quiet-latch-empty-farActor-shelve-walk.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ `f73561efd`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Microbench: `artifacts/far-empty-quiet-latch-microbench.json`
- Floor: `artifacts/far-empty-quiet-latch-floor-summary.json`
- Tests: `artifacts/focused-tests-far-empty-quiet-latch-suite.log`

## Apply order

After `bombs-empty-quiet-latch` (#131). Independent of classify packages;
stacks under world / tickFarActors residual.

## Risks

- Mid-life S1→S2 tier change without membership bump waits up to ~0.5 s (30
  ticks) before rescan may shelf — spawn/membership still wakes immediately.
- Bench toggle off restores always-walk for A/B; production default is latch on.
