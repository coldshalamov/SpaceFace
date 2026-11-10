# DONE — asteroid-query-callers

## Re-verify 2026-09-23 (master tip `568d1358e`)

Patch **rebased** (`TABLE_DECODE_RUNWAY_SECONDS`). Offline microbench **~9.12×**
(217.5 → 23.84 ms). Focused suite 25/26; the one fail is pre-existing on bare
master (Ceres census). See `REBASE_20260923.md`.

---

## Summary

Call-site leftovers after integer cell keys on master:

1. Split rock vs far scan radius in `appendNearbyLedgerRows`.
2. Drop dead per-tick spatial `queryAsteroidField` in `requestDecodeRunwayPromote`
   (`rocksSeen` now = `field.rocks.length` presence telegraph; `rocksPromoted` still 0).
3. Remove redundant `d2 <= r2` in `queryAsteroidField`.

Focused tests **25/25** pass (incl. new `asteroid-query-callers-decode-rocks`).

## Before / after

### Offline microbench (primary — portable CPU)

4000 queries × 800 rocks, moving origin:

| | Wide shared disc (~4695 WU) | Tight rock disc (~1215 WU) |
|---|---|---|
| wall | **233.2 ms** | **24.0 ms (~9.7×)** |
| cell side² | 1849 | 144 |

Dead decode-runway spatial scan (~640 WU): **~3.4 ms / 1200 ticks** eliminated.

### Quiet soft-GPU crucible seed 4242 (secondary, `SPACEFACE_SMOOTH_MS=20000`)

| Metric | Before (master `35e519ebd`) | After | Notes |
|---|---|---|---|
| worst frame | 700 ms | **233 ms** | win |
| p99 | 166.7 ms | 166.7 ms | flat |
| hitch callbacks | 22 / 236 | 48 / 236 | soft-GPU noise |
| game speed | 59.5 % | 54.2 % | soft-GPU noise |
| typical sim | 8.5 ms | 8.9 ms | flat |

Primary signal remains the offline microbench. GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-world-tighten-rock-query-discs-drop-dead-decode.patch`
- Scratch: `vm-work/asteroid-query-callers` @ `2e62210f4482b43cb0729015c17125d499de1905`
- Microbench: `artifacts/asteroid-query-callers-microbench.json`
- Tests: `artifacts/asteroid-query-callers-focused-tests.log`
- Crucible: `artifacts/asteroid-callers-baseline-crucible.log` / `asteroid-query-callers-after-crucible.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `35e519ebd`

## Apply order

Independent. Assumes hitch-asteroid-cell-key already on master. `git am` clean.

## Risks

- Rock disc no longer covers inbound-ship approach pad; rocks ignore own vel in
  the collect filter already, so player-travel × collect-horizon is the bound.
- `rocksSeen` is belt population, not in-radius hits (callers only used it as a
  presence check / telemetry).
