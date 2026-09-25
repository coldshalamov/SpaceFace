# DONE — asteroid-field-interact-still-quiet-latch

## Summary

Quiet parked flight still paid `queryAsteroidField` on the near ram reach
(`player.radius+36`) every tick. The deferred empty latch rarely arms on quiet
Ceres (near-disc often non-empty). Dormant field rocks do not translate (vel
defaults 0; only angVel spins), so a **still-player** latch safely skips the
grid walk while parked. Wakes on `asteroidField.version`, player move beyond
~15% of reach, player unpark (speed² > 0.25), or a 0.5 s rescan. **First probe
(and any wake) still promotes rocks inside collide radius.** Soft-GPU fps not
claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `_tickAsteroidFieldInteractions` × 60k; 48 nearby non-touching rocks,
player parked. Before = latch OFF (query every tick); after = latch ON.
Isolated Node child processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| parked near-nonempty (primary+rebenches) | **~13.5–14.0×** | **≥7.2×** |

Package floor capture (primary + 5×11-pair rebenches @ 60k): medians
~13.50 / 13.78 / 13.77 / 13.68 / 13.84 / 13.99; mins across those runs ≥7.17×.
Floor across package runs **≥7.2×** (clears ≥1.5× bar). Empty-field parked
~2.4×. Flying path ~1.0× (no skip). Dirty-wake proved: field.version bump /
player move / unpark. Focused latch + asteroid-field + far/optic/decode suites
**65/65**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): world.update / `_tickAsteroidFieldInteractions` under registry.step
residual after #134.

### Focused tests

`node --test test/asteroid-field-interact-still-quiet-latch.test.mjs test/asteroid-field.test.mjs test/optic-far-quiet-latch.test.mjs test/far-empty-quiet-latch.test.mjs test/decode-runway-empty-far-quiet-latch.test.mjs test/far-actors.test.mjs test/far-shelf-promotion.test.mjs test/decode-runway-residency.test.mjs test/far-query-row-scan.test.mjs test/far-actor-cell-key.test.mjs`
→ **65/65** pass (latch / version wake / move wake / unpark wake / ram promote
on first probe / bench toggle / asteroid-field / optic / far / decode).

## Evidence

- Patch: `patches/0001-perf-world-still-player-quiet-latch-asteroid-field-ram.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ `929ae1949`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Microbench: `artifacts/asteroid-field-interact-still-quiet-latch-microbench.json`
- Floor: `artifacts/asteroid-field-interact-still-quiet-latch-floor-summary.json`
- Tests: `artifacts/focused-tests-asteroid-field-interact-still-quiet-latch-suite.log`
- Hunt probe: `artifacts/probe-next-quiet-20260924y.json`

## Apply order

After `decode-runway-empty-far-quiet-latch` (#134). Independent of classify
packages; stacks under world / registry.step residual.

## Risks

- Mid-life field insert without `asteroidField.version` bump waits up to ~0.5 s
  (or until the player moves / unparks) before rescan may promote — insert /
  promote / remove bump version and wake immediately.
- If a future path gives dormant field rocks nonzero translational vel, the
  still-player assumption breaks — re-measure before relying on this latch.
- Bench toggle off restores always-query for A/B; production default is latch on.
