# DONE — combat-prephysics-quiet-latch

## Summary

Quiet open flight still paid combat kernel `prePhysics` (via `actions.update`)
ensureCombatant + status/pending/cool/sync across every living combatant every
tick while heat, statuses, and actions were idle. Quiet latch short-circuits
that entity walk when quiet; wakes on membership/spawn/destroy, action
request, status schedule, damage, repair, scaled physics response / sink, or
0.5 s rescan. Soft-GPU fps not claimed. Picture contract ON / unchanged.

Fresh actions / combat residual outside held barkDirector #153 /
flybyFocus #152 / pirate* / bounty / salvage / sanctuary / cones / catch-nets
clusters. Abs before ~32.5–33.2 µs/call clears the thin-abs band.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `actions.update` → `kernel.prePhysics` × 60k; 49 ships (player + 48 far
neutrals); idle combat roster (no heat/statuses/actions). Before = latch OFF;
after = latch ON. Isolated Node child processes (`--expose-gc`) per package
rebench. Measured on clean master tip `97c88f92b` + this patch.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet combat prePhysics idle walk (5×11-pair floors) | **~24.8–25.4×** | **≥21.27×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~24.76 / 25.32 /
25.41 / 25.37 / 25.14; mins across those runs ≥21.27×. Floor across package
runs **≥21.27×** (clears ≥1.5× bar). Abs before ~32.5–33.2 µs/call. Dirty-wake
proved: `routeCombatDamage` with heat → latch clears (`dirtyWakeOk: true`).
Focused latch **5/5**; combat review suites **32/32**. Soft-GPU fps not
claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step residual after …+#153; #153 scour ranked
ai/aiPorts/actions abs-hot, but fair same-tick residual showed actions/
prePhysics (~4.7–33 µs depending on stack) as the true portable pole
(ai/aiPorts were classify-inflated in isolation). This pass claimed combat
prePhysics idle-walk quiet latch.

### Focused tests

`node --test test/combat-prephysics-quiet-latch.test.mjs test/combat-attachments.review.test.mjs test/combat-attackHit.review.test.mjs test/combat-trace-contract.test.mjs test/combat-inertial-shunt-regression.test.mjs`
→ **32/32** pass.

Clean master `git am --ignore-space-change` verify @ `97c88f92b` → tip
`2f1968384`; focused latch **5/5**.

## Scratch

- Branch: `vm-work/hillclimb-20260924o`
- Tip: `2f196838418d2841d4704cf56a53122a7391d88d` (master-am verify tip)
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `97c88f92b`
- Master am SHA: `2f196838418d2841d4704cf56a53122a7391d88d`
