# DONE — combat-prephysics-quiet-residual

## Summary

Quiet combat prePhysics residual under `registry.step` after #83+#84: every
tick `ensureCombatant` still paid `ensureCombatState` + `resolveCombatProfile`
+ `syncCombatantBounds` on warm runtimes, `prePhysics` walked
`isDynamicPhysicsBodyEntity` twice (plus a momentum-sink miss) on identity
response fleets, and `coolCombatHeat` ran dissipation arithmetic at heat 0.
Cut: warm ensure quiet-hit on stable `profileId`; gate dynamic/sink on scaled
response or active sink status; early-out cool when `heat <= 0`. Soft-GPU fps
not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 48 combatants × 50k ticks.
Before = ensure resolve+sync + isDynamic×2 + sink miss + cool always;
after = production ensure quiet-hit + cool heat0 skip + dynamic/momentum gated.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-48-combatant-prephysics-residual-after-84 (primary, 9 isolated pairs) | **~2.81×** | **≥2.61×** |

Primary: **~2.81×** median (floor minSpeedup ≥2.61×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`syncCombatantBounds` / `resolveCombatProfile` / `prePhysics` /
`isDynamicPhysicsBodyEntity` under `registry.step` after #84.

### Focused tests

seam-combat-statuses + seam-combat-subsystems + combat-attachments.review +
combat-trace-contract + orbit-cryo-reactions + mining-beam-heat-no-lockout +
inference-pic-09-starter-weapon-scar-heat + combat-attackHit.review +
combat-inertial-shunt-regression + perf-combat-count-gates +
heat-wanted-victim + momentum-sink + pq-026-00-momentum-sink → **70/70** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-combat-quiet-hit-ensure-cool-dynamic-residual-2.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/combat-prephysics-quiet-residual-microbench.json`
- Tests: `artifacts/focused-tests-combat-prephysics-quiet-residual.log`

## Apply order

Stacks under registry.step / combat kernel residual after
#39+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84. Apply after #84.

## Risks

- Warm ensure skips vitals clamp; statusChanged still syncs (#83), and
  damage/actions clamp at mutation sites. Profile id changes (explicit or
  type) fall through to full ensure+sync.
- Dynamic body / momentum-sink work resumes when mass/inertia scales leave
  identity or a momentum-sink status is present.
- Saved runtimes without `heatDissipationPerTick` still get a one-time
  backfill on the quiet hit or cold ensure.
