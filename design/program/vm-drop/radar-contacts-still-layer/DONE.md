# DONE — radar-contacts-still-layer (#158)

## Summary

Quiet `radar.draw` still paid projection + `isHostileToPlayer` across every
contact every 10 Hz tick after prior radar packages (and after #156 asteroid
still-layer). Dormant/parked contacts do not translate, so a **quantized-player
+ contact-pose still-layer** reuses the last mark lists until the pilot moves
≥1 radar pixel (~38 wu @ 4 km), a contact moves ≥1 wu, range/target changes, or
a 0.5 s rescan. Glyph paint always runs from retained marks so pickup pulses
keep live `now`. Soft-GPU fps not claimed. Picture contract ON (still-layer
≤1 px / ≤1 wu identical).

Fresh HUD NEW after #156 asteroid still-layer; digest 20260924dt named contacts
still-layer canvas as next HUD open if ≥1.5×. Abs before ~9.0–9.2 µs clears the
thin-abs band.

## Before / after

### Offline microbench (primary — portable CPU)

Parked `censusRadarContactsStillLayer` × 50k; 48 contacts (quiet mix). Latch
OFF vs ON. Isolated Node child processes (`--expose-gc`) per pair. Measured on
clean master tip `97c88f92b` + this patch.

| | median | floor minSpeedup |
|---|---:|---:|
| parked contact census still-layer (5×11-pair floors) | **~4.26–4.34×** | **≥2.78×** |

Package floor capture (5×11-pair isolated @ 50k): medians 4.263 / 4.341 / 4.281 /
4.309 / 4.309; mins across those runs ≥2.776×. Floor across package runs
**≥2.78×** (clears ≥1.5× bar). Abs before ~9.0–9.2 µs. Dirty-wake proved: player
move ≥1 px / contact pose change / targetId / rescan. Focused latch +
tactical-map + fix-f56 **18/18**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): hud.frame / radar.draw residual after #156; digest 20260924dt named
contacts still-layer canvas as next HUD NEW.

### Focused tests

```
node --test \
  test/radar-contacts-still-layer.test.mjs \
  test/tactical-map-second-generation.test.mjs \
  test/fix-f56-radar-range-ring.test.mjs
```
→ **18/18** pass (am-verify tip `083db86d1`).

Clean master `git am --ignore-space-change` verify: this patch → tip `083db86d1`
on base `97c88f92b`.

## Scratch

- Branch: `vm-work/hillclimb-20260924s`
- Tip: `7bc4701bda1d9c81a2b6ade271ca9514e0c7ae0a`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924p`

## Apply order

Independent of combat/classify packages. After prior radar packages already on
master (trail-history-pool, project-scratch, range-plate, contact-color).
Complements (does not rediscover) `radar-asteroid-still-layer` (#156). Stacks
under hud.frame / radar.draw.

## Risks

- Mid-life contact insert without pose/signature change waits up to ~0.5 s
  (or until the player moves a radar pixel) before census refresh — spawn/
  destroy already mark contactsDirty for the list path; signature includes
  contact count so length changes wake.
- Sub-wu contact drift stays latched (signature quantizes to 1 wu) — trails
  need ~20 wu to add a point anyway.
- Bench toggle off restores always-walk for A/B.
