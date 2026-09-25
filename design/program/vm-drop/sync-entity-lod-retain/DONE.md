# DONE — sync-entity-lod-retain (#157)

## Summary

Quiet `syncEntityViews` still paid `updateLod` every visible root every frame.
Ships already self-retained inside `updateLod`; asteroid/station
`applyProjectedDetailLod` still re-traversed far-detail surfaces every frame
while hysteresis held the same band. Central retain stamp skips `updateLod`
until the band changes; asteroid + station `updateLod` mirror shipKit lastLod.
Bind clears the stamp so rebound meshes re-apply. Bench toggle restores
always-call for A/B. Soft-GPU fps not claimed. Picture contract ON.

Fresh sync residual after packaged closure-gate + micromotion-settled (those
not on master — this cut does not rediscover them). Abs before ~9.5 µs clears
the thin-abs band.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet mix 36 ship (self-retain) + 11 asteroid (always-traverse before) + 3
station × 20k frames. Before = always call updateLod; after = central retain.
Isolated Node child processes per pair (`--expose-gc`).

| | median | floor minSpeedup |
|---|---:|---:|
| quiet mix LOD path (5×11-pair floors) | **~3.87–4.19×** | **≥3.33×** |

Package floor capture: medians 4.189 / 4.107 / 3.865 / 4.122 / 3.987; mins
across those runs ≥3.328×. Floor across package runs **≥3.33×** (clears ≥1.5×
bar). Dirty-wake proved: camera jump across hysteresis → updateLod calls resume.
Focused suites **23/23**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): syncEntityViews residual after #142; digest 20260924ds named
projection/LOD retain as next sync hunt.

### Focused tests

```
node --test \
  test/sync-entity-lod-retain.test.mjs \
  test/hlod-projected-detail.test.mjs \
  test/lod-selector-guards.test.mjs \
  test/entity-view-sync-band.test.mjs \
  test/entity-mesh-visibility.test.mjs
```
→ **23/23** pass (am-verify tip `956734569`).

Clean master `git am --ignore-space-change` verify: this patch → tip `956734569`
on base `97c88f92b`.

## Scratch

- Branch: `vm-work/hillclimb-20260924r`
- Tip: `105574052ed1caff2b6ce595c42f4a101101ebaf`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924p`

## Apply order

Independent of combat/classify packages. Complements (does not rediscover)
`sync-entity-views-closure-gate` + `micromotion-settled-skip`. Stacks under
`syncEntityViews`.

## Risks

- If a future `updateLod` must run every frame for non-LOD side effects, the
  retain stamp would skip it — LOD callbacks must stay band-driven (ships
  already follow this contract).
- Bench toggle off restores always-call for A/B.
