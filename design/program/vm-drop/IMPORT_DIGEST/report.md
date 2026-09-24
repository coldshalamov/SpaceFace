# IMPORT_DIGEST report — 20260924dw (post-#159; **#160 ship** faction-presence-quiet-latch)

Master tip: **`97c88f92b`** (fetched; unchanged since #159 / digests 20260924dv).

## Stack refresh

Portable scour branch `vm-work/hillclimb-20260924t` @ bare `origin/master`
`97c88f92b` + #160 (`/workspace/spaceface-scratch/hillclimb-20260924p` tip
`bc2d41734`). Prior #159 scratch tip `9c3a979ea` remains historical on the same
branch lineage. Stacked WIP remains on `vm-work/hillclimb-20260924o` @
`2911f4458` (trust-sleep — not packaged) `/workspace/spaceface-scratch/hillclimb-20260924h`.
No restack needed (master tip unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (+ `settled-20s-stacked-20260924ad`
cross-check; Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–159 | (unchanged — see digest 20260924dv / du / dt / …) |
| **160** | **`faction-presence-quiet-latch`** (~7.92–8.23× median / ≥6.01× floor idle empty presence) |

Including already-packaged but **not yet on master** (do not re-ship):
`combat-table-pose-incremental` (~4.78×), `stamp-near-work-awake-cache`,
`stamp-near-work-budget-early-exit`, `prestep-movables-trust`,
`lifetime-sweep-quiet-clocks-skip` (#143), customs cones / sanctuary /
combat pre+postPhysics (#145–#155), classify flying-rock / frame / early
parked latches, `sync-entity-views-closure-gate`, `micromotion-settled-skip`,
`hull-scorch-quiet-live-skip`, `countermeasures-quiet-empty-latch`,
`overlay-quartet-quiet-empty-latch`, weapon-light / rcs-impulse / ribbon /
arcade-structural / distortion / quarks / discharge / presenter-composite,
`radar-asteroid-still-layer` (#156), `sync-entity-lod-retain` (#157),
`radar-contacts-still-layer` (#158), `shield-bubble-quiet-latch` (#159),
**`faction-presence-quiet-latch` (#160)**, etc.

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924dv / du / dt / ds / dr / dq / dp / do / … / da / cz.

**#160 pass — NEW:**
- **registry.step NEW shipped:** factionPresence quiet-latch (#160).
- fair-aiPorts / packCombat pose-incremental / stampNear / lifetime — **not
  rediscovered** (aiPorts isolation held; packCombat pose already packaged).
- classify / trust-sleep / law / traffic / bandRadio / flying residual /
  quiet-VFX / pickup far-idle magnet-skip / objective idle deepen —
  **not casually retried** (held).
- syncEntityViews updater residuals / closure-gate / micromotion / LOD /
  shield-bubble — **not rediscovered**.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#160; fair-aiPorts held; packCombat only if not pose-incremental / single-dirty; **imported packCombat/stampNear/lifetime not yet on master** |
| 269 | `classifyWorld` | residual after …+#141; **flying residual over parked ~1.3×**; flying-early-latch held; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#157+#159; closures / microMotion already packaged — hunt fresh pickup/ordnance/infra **updater** residuals only if abs clears thin band; asteroid settled + render-entity-frame retain held |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held; many quiet-live pools packaged, not on master) |
| 132 | `hud.frame` | residual after #156+#158; objective idle deepen thin; further HUD NEW only if ≥1.5× |
| 111 | `preStep` | **trust-sleep held (bare-master ~1.24×)**; remasure after packCombat+stampNear imports |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **160** | **`faction-presence-quiet-latch`** | Quiet empty presence median **~7.92–8.23×** / floor **≥6.01×** (5×11 isolated @ N=40); dirty-wake ok; focused **15/15**; am-verify `0c4d93581` |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| factionPresence quiet-empty latch (no fixed-route / pitborn) | **SHIP #160** — ~7.92–8.23× / ≥6.01× floor |
| ungated fair abs scour (ai/aiPorts/actions/packCombatPose/…) | ai/aiPorts classify-inflated; actions=combat prePhysics (packaged); packCombatPose already packaged; bandRadio/env held |
| fair-aiPorts / packCombat / stampNear / lifetime / classify / trust-sleep / law / traffic / bandRadio | **not casually retried** (held) |
| syncEntityViews updater / closure-gate / micromotion / LOD / shield-bubble rediscovery | **not rediscovered** |
| pickup far-idle magnet-skip / objective idle deepen | **held** (below bar / thin abs) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. registry.step after …+#160 — fair-aiPorts held; packCombat only if not
   pose-incremental or single-dirty / further HUD NEW only if ≥1.5×. After owner
   imports pose-incremental + stampNear + lifetime, remeasure bare-master
   preStep before retrying trust-sleep. Hunt other ungated systems with abs
   clearing thin band (encounterDirector ~2 µs was next ungated residual).
2. syncEntityViews residual after #157+#159 — fresh pickup/ordnance/infra
   **updater** residuals only if abs clears thin band (not closure-gate
   rediscovery); applySnapshotPose hold ~0.85×; asteroid settled ~1.14× +
   render-entity-frame retain ~1.21× held.
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
   **classify flying residual over parked ~1.3×**;
   **objective idle deepen ~0.37 µs thin**;
   **pickup far-idle magnet-skip ~1.35×**.

## Scratch

- Portable scour branch: `vm-work/hillclimb-20260924t`
- Portable worktree: `/workspace/spaceface-scratch/hillclimb-20260924p` @ `bc2d41734` (#160)
- Prior #159 scratch tip: `9c3a979ea`
- Stacked WIP (trust-sleep only; not packaged): `vm-work/hillclimb-20260924o`
  @ `2911f4458` / `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `97c88f92b`
