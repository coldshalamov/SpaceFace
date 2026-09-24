# DONE — combat-actions-advance-quiet-skip

## Summary

Quiet combat `actions.advance` under `registry.step` / `prePhysics` after #85:
every tick still paid `processRequests` (fresh `due`/`future` arrays +
`requests` rebind) and `Object.keys(activeByActor).sort()` with nothing queued
and no active instances. Cut: early-out when requests empty and activeByActor
has no keys (for-in O(1)); reuse due/future scratch; retain requests array
in place when work is pending. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Empty requests + empty activeByActor × 800k
ticks × 11 isolated pairs.
Before = processRequests alloc + Object.keys.sort every tick;
after = production empty early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-actions-advance-empty-path (primary, 11 isolated pairs) | **~2.37×** | **≥1.71×** |

Primary: **~2.37×** median (floor minSpeedup ≥1.71×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`registry.step` / combat kernel `prePhysics` → `actions.advance` residual
after #85.

### Focused tests

combat-doctrines + seam-combat-statuses + seam-combat-subsystems +
combat-attachments.review + combat-trace-contract + combat-attackHit.review +
combat-inertial-shunt-regression + perf-combat-count-gates + momentum-sink +
orbit-cryo-reactions + mining-beam-heat-no-lockout +
inference-pic-09-starter-weapon-scar-heat + heat-wanted-victim +
pq-026-00-momentum-sink → **71/71** pass.

Pre-existing unrelated miss (not this package): `dead-wire-action-lifecycle`
`MINIMAL_ACTION_AUDIO.length === 10` (actual 11) — fails on stacked tip
without this patch.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-combat-quiet-skip-empty-actions.advance-2.4.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/combat-actions-advance-quiet-skip-microbench.json`
- Tests: `artifacts/focused-tests-combat-actions-advance-quiet-skip.log`

## Apply order

Stacks under registry.step / combat kernel residual after
#39+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85. Apply after #85.

## Risks

- Early-out only when both queues are empty; a queued notBefore request or any
  active instance still runs the full path. for-in emptiness matches #84
  statuses pattern (own enumerable keys only).
- processRequests now mutates the requests array in place instead of replacing
  it; callers that held a stale array reference across advance would already
  have been wrong under the prior rebind.
