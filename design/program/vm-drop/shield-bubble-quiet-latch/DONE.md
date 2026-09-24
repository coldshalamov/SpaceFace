# DONE — shield-bubble-quiet-latch (#159)

## Summary

Quiet `syncEntityViews` still paid `setShieldShellClock` + `Math.pow` flash
decay for every ship with a `shieldBubble`, even while the bubble was not
presentable (flash cold, no contact, no collapse). Production now
**quiet-latches** that path; wakes on shield value change, shield contact, or
collapse. Soft-GPU fps not claimed. Picture contract ON (latched bubbles are
already hidden; shell clock only matters while presentable).

Fresh syncEntityViews residual after #157 LOD retain / #158 contacts
still-layer; not a rediscovery of closure-gate / micromotion-settled /
pickup·ordnance·infra updater thins. Abs before ~2.56–2.70 µs @ 40 ships
clears the thin-abs band for a quiet latch with strong relative floor.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `updateEntityShieldBubblePresentation` × 30k; 40 ships, cold flash.
Latch OFF vs ON. Isolated Node child processes (`--expose-gc`) per pair.
Measured on clean master tip `97c88f92b` + this patch.

| | median | floor minSpeedup |
|---|---:|---:|
| idle shieldBubble quiet-latch (5×11-pair floors) | **~4.74–4.97×** | **≥3.04×** |

Package floor capture (5×11-pair isolated @ 30k, N=40): medians 4.743 / 4.966 /
4.836 / 4.821 / 4.804; mins across those runs ≥3.044×. Floor across package
runs **≥3.04×** (clears ≥1.5× bar). Abs before ~2.56–2.70 µs. Dirty-wake proved:
shield value change / `addShieldContact` / shield break→collapse. Focused latch
+ ship-aux-single-pass + prepare-frame-capacity + vfx-shield-shell **14/14**.
Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `syncEntityViews` residual after #157/#158; per-entity shieldBubble path
inside the non-farSpeck micro-motion branch.

### Focused tests

```
node --test \
  test/shield-bubble-quiet-latch.test.mjs \
  test/ship-aux-single-pass-sync.test.mjs \
  test/ship-aux-prepare-frame-capacity.test.mjs \
  test/vfx-shield-shell-and-field-material.test.mjs
```
→ **14/14** pass (am-verify tip `e14b57220`).

Clean master `git am --ignore-space-change` verify: this patch → tip `e14b57220`
on base `97c88f92b`.

## Scratch

- Branch: `vm-work/hillclimb-20260924t`
- Tip: `9c3a979ea5052a0aa7a8432ffa253b8405d0a49e`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924p`

## Apply order

Independent of combat/classify packages. After prior syncEntityViews packages
already on master / awaiting import (#157 LOD retain does not cover shield
bubble). Complements (does not rediscover) micromotion-settled-skip /
closure-gate. Stacks under syncEntityViews / prepareFrame.

## Risks

- Per-entity fallback bubble stays latched while flash ≤ presentation epsilon;
  pooled aux path already hides idle bubbles — no picture change.
- Bench toggle off restores always-update for A/B.
- Mid-life contact without shield delta wakes via `hasShieldContact`.
