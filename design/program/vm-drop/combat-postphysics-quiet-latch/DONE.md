# DONE — combat-postphysics-quiet-latch

## Summary

Quiet open flight still paid combat kernel `postPhysics` ensureCombatant +
syncCombatantBounds across every living combatant every tick after #154
prePhysics latch already armed idle. Attachments empty-early-out; vitals clamp
at mutation sites. Quiet skip short-circuits that walk while the prePhysics
quiet latch is armed; same wake set. Soft-GPU fps not claimed. Picture
contract ON / unchanged.

Fresh combat residual after #154 prePhysics. Abs before ~11.4–11.8 µs/call
clears the thin-abs band.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `actions.update` + `kernel.postPhysics` × 60k; 49 ships (player + 48 far
neutrals); idle combat roster; empty attachments. Before = postPhysics skip
OFF (ensure+sync walk); after = skip ON. PrePhysics latch ON both arms.
Isolated Node child processes (`--expose-gc`) per pair. Measured on clean
master tip `97c88f92b` + #154 + this patch.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet combat postPhysics ensure+sync walk (5×11-pair floors) | **~13.5–14.1×** | **≥9.32×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~14.09 / 13.66 /
13.51 / 13.83 / 13.55; mins across those runs ≥9.32×. Floor across package
runs **≥9.32×** (clears ≥1.5× bar). Abs before ~11.4–11.8 µs/call. Dirty-wake
proved: `routeCombatDamage` with heat → skip clears (`dirtyWakeOk: true` on
all 5 captures). Focused latch **5/5**; latch+#154 **10/10**; combat review
suites **27/27** (37/37 combined). Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step residual after …+#154; #154 left postPhysics
ensure+sync walk as the next combat residual (~9.9 µs isolated probe).

### Focused tests

```
node --test \
  test/combat-postphysics-quiet-skip.test.mjs \
  test/combat-prephysics-quiet-latch.test.mjs \
  test/combat-attachments.review.test.mjs \
  test/combat-attackHit.review.test.mjs \
  test/combat-trace-contract.test.mjs \
  test/combat-inertial-shunt-regression.test.mjs
```
→ **37/37** pass (am-verify tip).

Clean master `git am --ignore-space-change` verify: #154 → `34f1225db`, then
this patch → tip `649b3c51a`; focused latch **10/10** + combat review **27/27**.

## Scratch

- Branch: `vm-work/hillclimb-20260924o`
- Tip: `16332ab5c62d570598593b7a7cc7ecfd723459d4`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `97c88f92b` (+ #154)
- Master am SHA: `649b3c51a13f700aa94cf7bc7f1ecd201e64bc54`
