# DONE — radar-asteroid-still-layer (#156)

## Summary

Quiet radar.draw still paid the full asteroidSource field-cell + near-dot census
every 10 Hz tick after prior radar packages (trail-history-pool, project-scratch,
range-plate, contact-color-defer). Dormant field rocks do not translate, so a
**quantized-player still-layer** reuses the last census until the pilot moves
≥1 radar pixel (~38 wu @ 4 km), range/target/field/index changes, or a 0.5 s
rescan. `drawTrail` collapses per-segment stroke into one path at mid alpha.
Soft-GPU fps not claimed. Picture contract ON (still-layer ≤1 px identical;
trail fade → uniform 0.12).

Fresh HUD NEW after setLag already on master; radar leftovers from digest
20260924dr. Abs before parked ~8.7 µs clears the thin-abs band.

## Before / after

### Offline microbench (primary — portable CPU)

Parked `censusRadarAsteroidStillLayer` × 60k; 211 rocks (11 live + 200 field);
latch OFF vs ON. Isolated Node child processes (`--expose-gc`) per pair.
Measured on clean master tip `97c88f92b` + this patch.

| | median | floor minSpeedup |
|---|---:|---:|
| parked asteroid census still-layer (5×11-pair floors) | **~5.70–5.87×** | **≥3.95×** |

Package floor capture (5×11-pair isolated @ 60k): medians 5.828 / 5.817 / 5.864 /
5.871 / 5.697; mins across those runs ≥3.948×. Floor across package runs
**≥3.95×** (clears ≥1.5× bar). Drift ~6×; fly (40 wu/s) ~4.6× with ~81% skip
share. Dirty-wake proved: field.version bump / player move ≥1 px / rescan.
Focused latch + tactical-map + fix-f56 **17/17**. Soft-GPU fps not claimed.

Secondary: drawTrail stroke batch stand-in ~1.6–6× (canvas stroke cost dominates
live; toggle + production path shipped together).

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): hud.frame / radar.draw residual after setLag on master; digest 20260924dr
named radar still-layer / drawTrail batch as next HUD NEW.

### Focused tests

```
node --test \
  test/radar-asteroid-still-layer.test.mjs \
  test/tactical-map-second-generation.test.mjs \
  test/fix-f56-radar-range-ring.test.mjs
```
→ **17/17** pass (am-verify tip `813ef9a67`).

Clean master `git am --ignore-space-change` verify: this patch → tip `813ef9a67`.

## Scratch

- Branch: `vm-work/hillclimb-20260924q`
- Tip: `abdd2bc1b3eae2d3bb98bff55a529d2ed345bd0b`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924p`

## Apply order

Independent of combat/classify packages. After prior radar packages already on
master (trail-history-pool, project-scratch, range-plate, contact-color). Stacks
under hud.frame / radar.draw.

## Risks

- Mid-life field insert without `asteroidField.version` bump waits up to ~0.5 s
  (or until the player moves a radar pixel) before census refresh — field
  mutate paths that bump version wake immediately.
- If a future path gives dormant field rocks nonzero translational vel, the
  still-layer assumption breaks — re-measure.
- drawTrail uniform alpha 0.12 replaces per-segment 0→0.2 fade (still readable).
- Bench toggles off restore always-walk / per-segment stroke for A/B.
