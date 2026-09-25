# DONE — fields-idle-quiet-latch

## Summary

Quiet idle flight still paid cadenced NPC discover (`_syncNpcFields`) + empty
`_publish` every tick with no cone/deployed/anchored/npc/skim and an empty
kernel. Production now quiet-latches when idle **and** no awake NPC field roles
(scavenger/sweeper/salvor/anchor); wakes on entity-index membership, 0.5 s
rescan, or leaving idle (player deploy / skim / live field). Awake scavenger
roles refuse the latch so PQ-147.01 cadenced cones still arm. Soft-GPU fps not
claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet fields.update × 60k; 64 ships, idle kernel, sleeping scavengers only.
Before = latch OFF (cadenced discover + publish every tick); after = latch ON.
Isolated Node child processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| idle-quiet-latch (primary, 11 pairs) | **~2.57–2.71×** | **≥1.85×** |

Package floor capture (5×11-pair runs @ 60k): medians ~2.57–2.71; mins
~1.85–2.44. Floor across package runs **≥1.85×** (clears ≥1.5× bar). Dirty-wake
proved: membership bump → latch clears / rescan runs. Focused latch + PQ-147
fields suite **31/31**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `fields.update` / `_syncNpcFields` under `registry.step` residual after
#129.

### Focused tests

`node --test test/fields-idle-quiet-latch.test.mjs test/pq-147-01-fields-physics.test.mjs test/fields-integration.test.mjs test/npc-miner-shared-field.test.mjs test/field-anchor-controller.test.mjs`
→ **31/31** pass (latch / membership wake / cone clears latch / bench toggle /
rescan hold / PQ-147 sweeper cone / well bend / integration).

## Evidence

- Patch: `patches/0001-perf-fields-quiet-latch-idle-when-no-NPC-field-roles.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ `8b020a817`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Microbench: `artifacts/fields-idle-quiet-latch-microbench.json`
- Floor: `artifacts/fields-idle-quiet-latch-floor-summary.json`
- Tests: `artifacts/focused-tests-fields-idle-quiet-latch.log` + suite log

## Apply order

After `countermeasures-quiet-empty-latch` (#129). Independent of classify
packages; stacks under registry.step / fields residual after npc-plan-cadence.

## Risks

- Mid-life scavenger wake without membership bump waits up to ~0.5 s (30 ticks)
  before rescan refuses latch — spawn/membership still wakes immediately.
- Bench toggle off restores always-walk idle path for A/B; production default
  is latch on.
