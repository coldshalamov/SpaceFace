# DONE — difficulty-director-quiet-latch (#162)

## Summary

Quiet open flight still paid `difficultyDirector.update`'s full pacing eval
every tick (protection / window damage / credit trend / scores / stance /
mult ramp / publish / pin tick) even when mults had already settled at the
current stance targets and damage books + flee holds were empty. Production
now **quiet-latches** that path; wakes on combat:damage / new-game / save /
sector enter / 0.5 s simTime rescan. Soft-GPU fps not claimed. Picture
contract ON (no pacing churn while latched).

Fresh registry.step residual after #161; not a rediscovery of packCombat /
stampNear / lifetime / classify / trust-sleep / bandRadio / traffic / law /
combat pre+post / factionPresence / aiEncounter packages. Abs before
~0.45–0.58 µs clears a quiet latch with solid relative floor (≥2.43×).

Mining / sectorSim probed this pass and stayed thin (sectorSim quiet-skip
~1.09×; mining settled abs ~0.26 µs).

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `difficultyDirector.update` × 30k–40k; healthy player, no damage books,
settled surge/steady mults. Latch OFF vs ON. Isolated Node child processes
(`--expose-gc`) per pair. Measured on clean master tip `97c88f92b` + this patch
(am-verify).

| | median | floor minSpeedup |
|---|---:|---:|
| settled difficultyDirector quiet-latch (5×11-pair floors) | **~2.98×** (medians 2.81–3.89) | **≥2.43×** |

Package floor capture (5×11-pair isolated @ 30k): medians 2.813 / 2.858 /
2.976 / 3.138 / 3.889; floorMin **2.425×**. Abs before ~0.45–0.58 µs. Dirty-wake
proved: combat:damage clears latch; survival run refuses to arm. Focused latch
+ difficulty-director suite **16/16**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `registry.step` residual; after #161 digest named mining /
difficultyDirector / sectorSim as next ungated abs poles.

### Focused tests

```
node --test \
  test/difficulty-director-quiet-latch.test.mjs \
  test/difficulty-director.test.mjs
```
→ **16/16** pass (am-verify tip `32e14e205`).

Clean master `git am --ignore-space-change` verify: this patch → tip `32e14e205`
on base `97c88f92b`.

## Scratch

- Branch: `vm-work/hillclimb-20260924t`
- Tip: `4d137d7205db436fd4a8874a84ae87408afa1d07`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924p`

## Apply order

Independent of combat/classify/sync/factionPresence/aiEncounter packages.
After prior registry.step packages already on master / awaiting import.
Stacks under registry.step.

## Risks

- Quiet latch stays armed while mults match stance targets and books/holds
  empty; 0.5 s simTime rescan + combat:damage / save / sector / new-game wakes
  keep pacing honest (including credit-trend → surge transitions in tests that
  only advance simTime).
- Bench toggle off restores always-eval for A/B.
- Survival runs refuse to latch (arena continuous-publish contract).
