# DONE — combat-kernel-profile-reuse

## Summary

Quiet combat kernel residual under `registry.step`: every tick
`coolCombatHeat` re-resolved the combat catalog profile for dissipation,
`prePhysics` always trailing-synced bounds (with another profile resolve), and
`postPhysics` re-ran `ensureCombatant` + sync + resolve after prePhysics had
already done both. Physics does not mutate vitals/heat. Cut: stash
`heatDissipationPerTick` on the runtime at create/ensure backfill, cool from
the stash, gate trailing sync on `statusChanged`, and skip postPhysics ensure
when `state.combat.entities[entityKey]` already exists. Soft-GPU fps not
claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 48 combatants × 40k ticks. Before = cool
resolve + trailing sync+resolve + post ensure+sync+resolve; after = stash +
status-gated sync + post skip when runtime exists.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-48-combatant-pre-post-heat-bounds (primary, 9 isolated pairs) | **~2.50×** | **≥2.18×** |

Primary: **~2.50×** median (floor minSpeedup ≥2.18×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`syncCombatantBounds` / `resolveCombatProfile` / `prePhysics` under
`registry.step` after #82.

### Focused tests

seam-combat-statuses + seam-combat-subsystems + combat-attachments.review +
combat-trace-contract + orbit-cryo-reactions + mining-beam-heat-no-lockout +
inference-pic-09-starter-weapon-scar-heat + combat-attackHit.review +
combat-inertial-shunt-regression + perf-combat-count-gates +
heat-wanted-victim → **62/62** pass (51 + 11 across two runs).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-combat-reuse-heat-dissipation-skip-quiet-postPh.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/combat-kernel-profile-reuse-microbench.json`
- Tests: `artifacts/focused-tests-combat-kernel-profile-reuse.log`

## Apply order

Independent of #82. Stacks under registry.step / combat kernel residual after
#39+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82.

## Risks

- postPhysics skips ensure when runtime already exists; a combatant that first
  becomes eligible only after physics still gets ensureCombatant (table miss).
- Trailing vitals sync runs only when `statuses.advance` reports a change;
  coolCombatHeat already clamps heat with Math.max(0, …).
- Saved runtimes without `heatDissipationPerTick` get a one-time backfill on
  the next ensureCombatant.
