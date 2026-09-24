# IMPORT_DIGEST report — 20260924ds (post-#155; **#156 ship** radar-asteroid-still-layer)

Master tip: **`97c88f92b`** (fetched; unchanged since #155 / digests 20260924do–dr).

## Stack refresh

Portable scour branch `vm-work/hillclimb-20260924q` @ bare `origin/master`
`97c88f92b` + #156 (`/workspace/spaceface-scratch/hillclimb-20260924p` tip
`abdd2bc1b`). Stacked WIP remains on `vm-work/hillclimb-20260924o` @ `2911f4458`
(trust-sleep — not packaged) `/workspace/spaceface-scratch/hillclimb-20260924h`.
No restack needed (master tip unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (+ `settled-20s-stacked-20260924ad`
cross-check; Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–155 | (unchanged — see digest 20260924do / dn / dp / dq / dr) |
| **156** | **`radar-asteroid-still-layer`** (~5.8× median / ≥3.95× floor parked census) |

Including already-packaged but **not yet on master** (do not re-ship):
`combat-table-pose-incremental` (~4.78×), `stamp-near-work-awake-cache`,
`stamp-near-work-budget-early-exit`, `prestep-movables-trust`,
`lifetime-sweep-quiet-clocks-skip` (#143), customs cones / sanctuary /
combat pre+postPhysics (#145–#155), classify flying-rock / frame / early
parked latches, `sync-entity-views-closure-gate`, `micromotion-settled-skip`,
`hull-scorch-quiet-live-skip`, `countermeasures-quiet-empty-latch`,
`overlay-quartet-quiet-empty-latch`, weapon-light / rcs-impulse / ribbon /
arcade-structural / distortion / quarks / discharge / presenter-composite,
**`radar-asteroid-still-layer` (#156)**, etc.

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924dr / dq / dp / do / dn / … / da / cz.

**#156 pass 1–3 (dp/dq/dr) — still stand** where not superseded by this ship:
- preStep trust-physicsSleeping bare-master ~1.24× (held until packCombat+stampNear import)
- packCombat / stampNear / lifetime already packaged — do not rediscover
- law ambient / traffic / bandRadio thin
- classify flying residual ~1.3× / flying-early-latch held
- bare-master thick abs already packaged (countermeasures, hull-scorch, closure-gate, micromotion, overlay, rcs/lights/ribbons/arcade/distortion/quarks/discharge/presenter)

**#156 pass 4 (this digest) — NEW:**
- **HUD NEW shipped:** radar asteroid still-layer + drawTrail batch (#156).
- Ungated fair/iso sweep (economy broken in harness; factionPresence ~2 µs;
  bandRadio ~1.4 µs held thin; environmentalMachinery ~1 µs held; others ≪1 µs)
  — no fresh ≥1.5× system latch.
- syncEntityViews residual after packaged closure-gate+settled-skip not deepened
  this pass (packages not on master; bare still shows packaged micro-motion
  thickness — do not rediscover).
- objectiveKey already text-cached; setLag already on master.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#156; preStep portable thin on bare master; **imported packCombat/stampNear/lifetime not yet on master** (already packaged); fair-aiPorts; packCombat only if not pose-incremental / single-dirty |
| 269 | `classifyWorld` | residual after …+#141; **flying residual over parked ~1.3×**; flying-early-latch held; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#142; closures / microMotion / ordnance already packaged (closure-gate + settled-skip) — hunt residual **after** those, not rediscovery; asteroid settled + render-entity-frame retain held |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held; many quiet-live pools packaged, not on master) |
| 132 | `hud.frame` | residual after #156 still-layer + trail batch; objective idle / further still-layer (contacts canvas) open if ≥1.5× |
| 111 | `preStep` | **trust-sleep held (bare-master ~1.24×)**; remasure after packCombat+stampNear imports |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **156** | **`radar-asteroid-still-layer`** | Parked census median **~5.8×** / floor **≥3.95×** (5×11 isolated); fly ~4.6×; dirty-wake ok; focused **17/17**; am-verify `813ef9a67` |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| radar asteroid still-layer (quantized player) | **SHIP #156** — parked ~5.8× / ≥3.95× floor |
| drawTrail stroke batch | shipped with #156 (secondary; stand-in ~1.6–6×) |
| ungated fair systems (wing/travel/economy/faction/…) | all ≪3 µs except broken economy harness; bandRadio/env held thin |
| classify / trust-sleep / packCombat / stampNear / lifetime / law / traffic | **not casually retried** (held) |
| sync residual rediscovery of closure-gate / micromotion | **not rediscovered** (already packaged) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81+#142 + packaged
   closure-gate + micromotion-settled — hunt fresh ordnance/infrastructure/
   pickup residuals or projection/LOD retain; applySnapshotPose hold ~0.85×;
   asteroid settled ~1.14× + render-entity-frame retain ~1.21× held.
2. registry.step after …+#156 — fair-aiPorts / packCombat only if not
   pose-incremental or single-dirty / further HUD (contacts still-layer canvas /
   objective idle deepen) if ≥1.5×. After owner imports pose-incremental +
   stampNear + lifetime, remeasure bare-master preStep before retrying trust-sleep.
3. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   — flying vs parked residual ~1.3×; NPC/ship visit deepen still thin ~1.08×;
   disc-admission visit-retain thin ~1.12×; **flying-early-latch held ~1.3×**.
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors
   held; many quiet-live pools packaged awaiting import — do not rediscover).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery far (held ~0.87×).
7. Deferred/held: hazards far; asteroid-field **empty** ~1.22×; zoneAt;
   lifetimeSweep no-movable / compact-skip / pose-rematch / sleeping-clocks /
   **quiet-compact-skip floorMin 1.30×**;
   **flying-early-latch ~1.3×**; asteroid-motion settled; render-entity-frame
   unchanged retain; projectile-evidence surface-cadence deepen ~1.0×;
   weapons quiet residual deepen ~1.3×; spatial all-sleeping sync (needs awake-set);
   impulseCharges empty; updateDockRange far; tether-web empty VFX;
   lawSecurity quiet residual after cones+sanctuary ~0.5–1.0 µs thin;
   ai/aiPorts isolation-only sketches (classify-inflated);
   **preStep trust-physicsSleeping bare-master ~1.24×**;
   **bandRadio ~2.2 µs thin**; traffic classify-inflated;
   **classify flying residual over parked ~1.3×**.

## Scratch

- Portable scour branch: `vm-work/hillclimb-20260924q`
- Portable worktree: `/workspace/spaceface-scratch/hillclimb-20260924p` @ `abdd2bc1b` (#156)
- Stacked WIP (trust-sleep only; not packaged): `vm-work/hillclimb-20260924o`
  @ `2911f4458` / `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `97c88f92b`
