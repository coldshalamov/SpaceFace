# IMPORT_DIGEST report — 20260924dz (post-#162; **#163 ship** combat-outcome-quiet-latch)

Master tip: **`97c88f92b`** (fetched; unchanged since #161 / digests 20260924dx / dy).

## Stack refresh

Portable scour branch `vm-work/hillclimb-20260924t` @ bare `origin/master`
`97c88f92b` + #160 + #161 + #162 + #163 (`/workspace/spaceface-scratch/hillclimb-20260924p` tip
`f3008ec52`). Prior #162 scratch tip `4d137d720` remains on the same branch
lineage. Stacked WIP remains on `vm-work/hillclimb-20260924o` @
`2911f4458` (trust-sleep — not packaged) `/workspace/spaceface-scratch/hillclimb-20260924h`.
No restack needed (master tip unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (+ `settled-20s-stacked-20260924ad`
cross-check; Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–162 | (unchanged — see digest 20260924dy / dx / dw / …) |
| **163** | **`combat-outcome-quiet-latch`** (~2.05× @30k / ~2.38× @100k median; ≥1.80× floor quiet flee-scan) |

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
`faction-presence-quiet-latch` (#160), `ai-encounter-quiet-latch` (#161),
`difficulty-director-quiet-latch` (#162), **`combat-outcome-quiet-latch` (#163)**, etc.

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924dy / dx / dw / dv / du / dt / ds / dr / dq / dp / do / … / da / cz.

**#163 pass — NEW:**
- **registry.step NEW shipped:** combatOutcome quiet-latch (#163) — 4-tick shipLike flee-scan.
- Fresh ungated scour (probe-162c ranks after combatOutcome): masslineThreats ~0.60 µs cold → ~0.16 µs warmed (no-tether inactive early-out already; thin — not packaged), survivorPod ~0.44 µs (promotedByPoint walk + causal tick; next candidate), scanner ~0.44 µs, bulletTime ~0.42 µs (flag path; thin), fieldDepletion ~0.39 µs — **all below ~0.5 µs abs; not packaged this pass**.
- Pre-existing bare-master failures noted (not caused by #163): `civilian-freighter-recovery` 8 fail, `pq-141-03-ambush-flee-spill` 1 fail.
- mining / sectorSim / encounterDirector / economy / fair-aiPorts / packCombat / stampNear / lifetime / classify / trust-sleep / law / traffic / bandRadio / quiet-VFX / pickup magnet-skip / objective idle — **not retried** (held).

**#162 pass — NEW:**
- **registry.step NEW shipped:** difficultyDirector quiet-latch (#162).
- mining settled abs ~0.26 µs (after heat/noise cold) — **thin; not packaged**.
- sectorSim quiet-skip vs ensureState ~1.09× — **below bar; not packaged**.
- encounterDirector early ~0.4 µs thin (1 Hz) — **held** (unchanged).
- fair-aiPorts / packCombat pose-incremental / stampNear / lifetime — **not
  rediscovered**.
- classify / trust-sleep / law / traffic / bandRadio / flying residual /
  quiet-VFX / pickup far-idle magnet-skip / objective idle deepen —
  **not casually retried** (held).
- syncEntityViews updater residuals / closure-gate / micromotion / LOD /
  shield-bubble / factionPresence / aiEncounter — **not rediscovered**.
- economy 5 s cadence quiet residual ~0.1 µs — **thin**.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#162; fair-aiPorts held; packCombat only if not pose-incremental / single-dirty; **imported packCombat/stampNear/lifetime not yet on master** |
| 269 | `classifyWorld` | residual after …+#141; **flying residual over parked ~1.3×**; flying-early-latch held; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#157+#159; closures / microMotion already packaged — hunt fresh pickup/ordnance/infra **updater** residuals only if abs clears thin band; asteroid settled + render-entity-frame retain held |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held; many quiet-live pools packaged, not on master) |
| 132 | `hud.frame` | residual after #156+#158; objective idle deepen thin; further HUD NEW only if ≥1.5× |
| 111 | `preStep` | **trust-sleep held (bare-master ~1.24×)**; remasure after packCombat+stampNear imports |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **163** | **`combat-outcome-quiet-latch`** | Quiet flee-scan latch median **~2.05×** (30k) / **~2.38×** (100k warmed), floor **≥1.80×** (5×11 isolated @ N=40); dirty-wake ok (11 wake events + membership + 0.5 s rescan); focused **70/70**; am-verify `8a6d29ada` |
| 162 | `difficulty-director-quiet-latch` | (prior pass) ~2.98× / ≥2.43×; am-verify `32e14e205` |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| combatOutcome 4-tick shipLike flee-scan quiet-latch | **SHIP #163** — ~2.05–2.38× / ≥1.80× floor |
| fresh ungated scour after combatOutcome (masslineThreats / survivorPod / scanner / bulletTime / fieldDepletion) | ≤~0.6 µs abs, mostly already early-out in production — **not packaged** |
| difficultyDirector settled quiet-latch (prior pass) | SHIP #162 — ~2.98× / ≥2.43× floor |
| mining quiet early-out | settled abs ~0.26 µs thin — **not packaged** |
| sectorSim skip _ensureState between model steps | ~1.09× — **below bar** |
| encounterDirector early/1 Hz path | early ~0.4 µs thin — **held** |
| economy quiet residual (5 s cadence) | ~0.1 µs thin — **not packaged** |
| fair-aiPorts / packCombat / stampNear / lifetime / classify / trust-sleep / law / traffic / bandRadio | **not casually retried** (held) |
| syncEntityViews updater / closure-gate / micromotion / LOD / shield-bubble / factionPresence / aiEncounter rediscovery | **not rediscovered** |
| pickup far-idle magnet-skip / objective idle deepen | **held** (below bar / thin abs) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. registry.step after …+#163 — combatOutcome shipped; next ungated abs: survivorPod promotedByPoint/causal tick (~0.44 µs), scanner (~0.44 µs) — only if ≥1.5× with solid floor. fair-aiPorts held; packCombat only if not
   pose-incremental or single-dirty / further HUD NEW only if ≥1.5×. After owner
   imports pose-incremental + stampNear + lifetime, remeasure bare-master
   preStep before retrying trust-sleep. Hunt other ungated systems with abs
   clearing thin band (combatOutcome **shipped #163**; mining left thin;
   sectorSim held ~1.09×; encounterDirector early thin).
2. syncEntityViews residual after #157+#159 — fresh pickup/ordnance/infra
   **updater** residuals only if abs clears thin band (not closure-gate
   rediscovery); applySnapshotPose hold ~0.85×; asteroid settled ~1.14× +
   render-entity-frame retain ~1.21× held; pickup far-idle magnet-skip ~1.35× held.
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
   **pickup far-idle magnet-skip ~1.35×**;
   **encounterDirector early ~0.4 µs thin** (1 Hz already);
   **mining settled ~0.26 µs thin**;
   **sectorSim ensureState-skip ~1.09×**.

## Scratch

- Portable scour branch: `vm-work/hillclimb-20260924t`
- Portable worktree: `/workspace/spaceface-scratch/hillclimb-20260924p` @ `f3008ec52` (#163)
- Prior #162 scratch tip: `4d137d720`; #161: `cc826f487`
- Stacked WIP (trust-sleep only; not packaged): `vm-work/hillclimb-20260924o`
  @ `2911f4458` / `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `97c88f92b`
