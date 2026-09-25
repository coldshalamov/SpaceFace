# DONE — combat-postphysics-quiet-skip

## Summary

Quiet combat `postPhysics` under `registry.step` / combat system after #86:
every tick still paid `reconcilePhysics` (orphan walk + `Map.clear` +
`orderedAttachments`) and `updateTelemetryAndBreak` on empty `attachments.byId`,
then walked every combatant for a first-seen ensure that prePhysics had already
covered. Cut: early-out attachment pair when byId has no keys (for-in O(1));
skip ensure walk when sorted cache still covers this tick's roster. Soft-GPU
fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 48 combatants × 80k ticks × 11 isolated pairs.
Before = reconcile + telemetry + ensure-walk (all table hits) every tick;
after = empty byId early-out + roster-stable ensure skip.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-48-combatant-postphysics-residual-after-86 (primary, 11 isolated pairs) | **~3.28×** | **≥2.91×** |

Primary: **~3.28×** median (floor minSpeedup ≥2.91×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`registry.step` / combat kernel `postPhysics` residual after #86.

### Focused tests

combat-doctrines + seam-combat-statuses + seam-combat-subsystems +
combat-attachments.review + combat-trace-contract + combat-attackHit.review +
combat-inertial-shunt-regression + perf-combat-count-gates + momentum-sink +
orbit-cryo-reactions + mining-beam-heat-no-lockout +
inference-pic-09-starter-weapon-scar-heat + heat-wanted-victim +
pq-026-00-momentum-sink + massline-controlled-attachments → **75/75** pass.

Pre-existing unrelated miss (not this package): `pq146-tether-physics` 3/3
fail on stacked tip without this patch — do not treat as #87 regression.
Also: `dead-wire-action-lifecycle` `MINIMAL_ACTION_AUDIO.length === 10`
(actual 11) — fails on tip without this patch (noted since #86).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-combat-quiet-skip-empty-postPhysics-3.3.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/combat-postphysics-quiet-skip-microbench.json`
- Tests: `artifacts/focused-tests-combat-postphysics-quiet-skip.log`

## Apply order

Stacks under registry.step / combat kernel residual after
#39+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86. Apply after #86.

## Risks

- Empty byId early-out only; broken attachment history left in byId still runs
  the full reconcile/telemetry path (correct — orphans/prune may need them).
- Ensure walk resumes when spawn/destroy invalidates the sorted cache mid-step
  (bus `entity:spawned` / `entity:destroyed`) or index.version bumps.
- Attachment create/break paths unchanged; active lines still reconcile and
  break on threshold every postPhysics.
