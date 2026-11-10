# DONE — stunt-flight-history-quiet-skip

## Summary

Quiet `registry.step` → `StuntFlightObserver.update` residual after #49+#40:
nearby-body history still walked `spatialDynamics`/`movables` and allocated a
frame (+ up to 32 body pts) every tick while tracks were empty. History only
serves needle-gap detection, which needs open tracks.

Production now:
1. Odd quiet ticks (no tracks, empty projectile lane): early-out after pressure
   — skip `bodyLife` + threat scan (already deferred by #49) + history.
2. Even quiet ticks after discovery still empty: skip history only.
3. Active tracks or live projectiles keep every-tick history recording.

Bench-only `setStuntFlightHistoryQuietSkipForBench(false)` restores always-
record history. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

120 ships + 40 near dynamics × 8000 ticks; 0 attackers / 0 projectiles (quiet
Ceres-shaped). Isolated Node child processes. Before = bench toggle off
(always-record history); after = quiet history skip on.

| | Before | After | |
|---|---:|---:|---|
| wall (median) | 77.1 ms | 16.6 ms | **~4.66×** |

Floor minSpeedup **≥3.91×** across seven isolated pairs.
Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `StuntFlightObserver.update` ~52 self under `registry.step`.

### Focused tests

`stunt-flight-history-quiet-skip` + `stunt-combo` + `stunt-taxonomy` +
`pq-155-03-stunts-pay` + `stunt-projectile-evidence-quiet-iter` +
`pq146-projectiles` → **31/31** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-combat-quiet-skip-stunt-flight-history.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/stunt-flight-history-quiet-skip-microbench.json`
- Tests: `artifacts/focused-tests-stunt-flight-history-quiet-skip.log`

## Apply order

After `stunt-threat-lock-prefilter` (#49) and `stunt-threat-index-lanes` (#40).
Stacks under registry.step residual after #39+#43+#49+#50+#55+#56+#58+#59+#61+#66+#67+#69.

## Risks

- Needle-gap detection needs ~30 prior history frames of an open track episode;
  history starts when the first track opens (within the 0.2–1.2 s stunt window).
- Hosts without a ready entityIndex never take the quietNoAmmo path
  (`projectiles` lane null) — history keeps recording (same as #49 fallback).
- Bench-only `setStuntFlightHistoryQuietSkipForBench` must stay default-on in prod.
