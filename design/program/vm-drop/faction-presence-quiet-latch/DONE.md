# DONE — faction-presence-quiet-latch (#160)

## Summary

Quiet open flight still paid `factionPresence.update`'s full `shipLike` walk
every tick for fulfillment fixed-route anchors and (via `||` short-circuit)
pitborn-gone probes, even when no fixed-route / pitborn markers existed.
Production now **quiet-latches** that path; wakes on entity-index membership,
presence wake seq (sector enter / spawn / combat / boarding / save / conflict
flip), or 0.5 s rescan. Soft-GPU fps not claimed. Picture contract ON (no
presence work while latched).

Fresh registry.step residual after #159; not a rediscovery of packCombat /
stampNear / lifetime / classify / trust-sleep / bandRadio / traffic / law /
combat pre+post packages. Abs before ~3.02–3.17 µs @ 40 ships clears the thin
abs band for a quiet latch with strong relative floor.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `factionPresence.update` × 30k; 40 idle ships, no fixed-route / pitborn
markers, no boarding. Latch OFF vs ON. Isolated Node child processes
(`--expose-gc`) per pair. Measured on clean master tip `97c88f92b` + this patch.

| | median | floor minSpeedup |
|---|---:|---:|
| idle factionPresence quiet-latch (5×11-pair floors) | **~7.92–8.23×** | **≥6.01×** |

Package floor capture (5×11-pair isolated @ 30k, N=40): medians 8.228 / 7.917 /
7.977 / 8.193 / 8.232; mins across those runs ≥6.012×. Floor across package
runs **≥6.01×** (clears ≥1.5× bar). Abs before ~3.02–3.17 µs. Dirty-wake proved:
fixed-route presence spawn (route anchor written) / boarding. Focused latch +
depth-program K1 runtime/fulfillment/reset/verge **15/15**. Soft-GPU fps not
claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `registry.step` residual; `factionPresence` ungated abs ~3.6 µs on bare
master scour (above thin band).

### Focused tests

```
node --test \
  test/faction-presence-quiet-latch.test.mjs \
  test/depth-program-k1-runtime.test.mjs \
  test/depth-program-k1-fulfillment.test.mjs \
  test/depth-program-k1-reset.test.mjs \
  test/depth-program-k1-verge.test.mjs
```
→ **15/15** pass (am-verify tip `0c4d93581`).

Clean master `git am --ignore-space-change` verify: this patch → tip `0c4d93581`
on base `97c88f92b`.

## Scratch

- Branch: `vm-work/hillclimb-20260924t`
- Tip: `bc2d417347053c2ea3faa57b499736575d65f47e`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924p`

## Apply order

Independent of combat/classify/sync packages. After prior registry.step packages
already on master / awaiting import. Complements (does not rediscover)
customs/sanctuary/combat pre+post empty latches. Stacks under registry.step.

## Risks

- Quiet latch stays armed while no fixed-route / pitborn markers and no boarding;
  0.5 s rescan + membership/wake-seq keep presence work honest.
- Bench toggle off restores always-scan for A/B.
- Mid-life fixed-route spawn / boarding / sector enter wakes via wake seq.
