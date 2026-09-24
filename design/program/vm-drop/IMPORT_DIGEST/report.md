# IMPORT_DIGEST report — 20260924dq (post-#155; #156 miss-only, scour 2)

Master tip: **`97c88f92b`** (fetched; unchanged since #155 / digests 20260924do–dp).

## Stack refresh

Scratch `vm-work/hillclimb-20260924p` @ bare `origin/master` `97c88f92b` for
portable abs; stacked WIP remains on `vm-work/hillclimb-20260924o` @
`2911f4458` (trust-sleep — not packaged). No restack needed (master tip
unchanged). Profile cite remains `settled-45s-stacked-20260924ac` (+
`settled-20s-stacked-20260924ad` cross-check; Picture ON, soft-GPU; tip
through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–155 | (unchanged — see digest 20260924do / dn / dp) |

Including already-packaged but **not yet on master** (do not re-ship as #156):
`combat-table-pose-incremental` (~4.78×), `stamp-near-work-awake-cache`,
`stamp-near-work-budget-early-exit`, `prestep-movables-trust`,
`lifetime-sweep-quiet-clocks-skip` (#143), customs cones / sanctuary /
combat pre+postPhysics (#145–#155), classify flying-rock / frame / early
parked latches, etc.

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924dp / do / dn / … / da / cz.

**#156 pass 1 (dp) — still stands:**
- **preStep trust-physicsSleeping** stacked ~1.97–2.01× / floor ≥1.78× but
  bare-master full preStep combo ~1.24× (non-walk ~22–24 µs dominates with
  packCombat+stampNear still unimported). Not packaged.
- Orphaned trust-movables-lane ~1.04× noise.

**#156 pass 2 (this digest) — NEW fair-residual notes / holds:**
- **packCombat pose-dirty on bare master** ~8.8–9.9 µs/call (quiet retain
  0.08 µs). Already packaged as `combat-table-pose-incremental` (~4.78×) —
  **do not rediscover as #156**.
- **stampNearWorkBudget** ~4.9–5.4 µs on bare master. Already packaged
  (`stamp-near-work-awake-cache` / `budget-early-exit`) — do not rediscover.
- **lifetimeSweep** ~6.1 µs on bare master. Already #143 — do not rediscover.
- **lawSecurity** bare ~6.9–10 µs dominated by customsCones ~3.7 µs +
  sanctuary ~2.3 µs (both shipped). **wanted/ambient/weir/inspection/warrant
  fair residual ≤0.15 µs/call** — too thin; deepen held.
- **traffic** isolation ~22 µs is **ensureActivityClassified tax**; fair
  same-tick residual with freighters empty **~0.32 µs** — not a portable pole.
- **bandRadio** fair residual ~2.2 µs (landmark proximity already 0.2 s
  cadence) — below preferred ≥~3 µs abs band; not casually cut for ≥1.5×.
- **envMachinery** ~1.9 µs on Ceres quiet — far-hold ~0.87× still stands.
- **ai/aiPorts** fair residual still classify-adjacent / isolation-held.
- Prior holds unchanged: flying-early-latch ~1.3×; packCombat single-dirty;
  quiet-VFX floors; NPC visit; spatial stub; asteroid settled;
  render-entity-frame; weapons residual deepen; quiet-compact-skip;
  impulseCharges; updateDockRange; spatial all-sleeping; tether-web; etc.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#155; preStep portable thin on bare master; **imported packCombat/stampNear/lifetime not yet on master** (already packaged — next import clears them); packCombat NEW beyond pose-incremental / single-dirty held; law wanted·ambient thin; HUD NEW; aiPorts fair (not isolation) |
| 269 | `classifyWorld` | residual after …+#141; flying-early-latch held ~1.3×; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#142; closures / microMotion / ordnance; asteroid settled + render-entity-frame retain thin |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held) |
| 132 | `hud.frame` | radar.draw + setLagTranslate — prefer NEW HUD angles |
| 111 | `preStep` | residual after #56+#59+#61+#82; **trust-sleep held (bare-master ~1.24×)**; bare abs ~23–24 µs until packCombat+stampNear imports land |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| — | **none (#156 miss-only)** | See scour / holds below. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| preStep part breakdown on bare master | full ~23.9 µs = packCombat ~9.0 + movableWalk ~5.2 + stampNear ~4.8 + clocks; trust-walk alone ~5.3× but projected full only ~1.21× — confirms dp hold |
| packCombat pose-dirty fair | **~8.8 µs** — already `combat-table-pose-incremental`; do not re-ship |
| stampNear / lifetimeSweep bare abs | already packaged; do not re-ship |
| lawSecurity sub-path fair | cones+sanctuary own the abs; wanted/ambient/weir ≤0.15 µs — thin hold |
| traffic / bandRadio / env / mining / npcJobs fair | traffic residual ~0.32 µs; bandRadio ~2.2 µs thin; env held far |
| classify toggle A/B on stacked tip | flying-rock retain ~3× (shipped); early/frame under flying ~1.0× (early is parked-only; flying-early held ~1.3×) |
| ai / aiPorts / impulse / dockRange / spatial all-sleep / packCombat single-dirty / quiet-VFX / weapons deepen / pirate* / bark / combat pre/post / trust-sleep | **not casually retried** |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   (NPC/ship visit deepen still thin ~1.08×; disc-admission visit-retain thin
   ~1.12×; **flying-early-latch held ~1.3×**; id-replay ~1.16×; rock context ~1.09×).
   Prefer angles that still move residual under flying retain without replaying
   the early-latch skip of extents+selectClassify.
2. registry.step after …+#155 — **prefer HUD NEW / syncEntityViews
   closures·microMotion·ordnance / fair-aiPorts / packCombat only if not
   pose-incremental or single-dirty**. After owner imports pose-incremental +
   stampNear + lifetime packages, remeasure bare-master preStep residual before
   retrying trust-sleep. law wanted·ambient stays thin.
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81+#142 (closures /
   microMotion / ordnance / applySnapshotPose hold ~0.85×; query pose-dirty shipped;
   asteroid settled ~1.14× + render-entity-frame retain ~1.21× held).
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors held).
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
   **preStep trust-physicsSleeping bare-master ~1.24×** (#156 miss);
   **bandRadio ~2.2 µs thin**; traffic classify-inflated.

## Scratch

- Portable scour branch: `vm-work/hillclimb-20260924p`
- Portable worktree: `/workspace/spaceface-scratch/hillclimb-20260924p` @ `97c88f92b`
- Stacked WIP (trust-sleep only; not packaged): `vm-work/hillclimb-20260924o`
  @ `2911f4458` / `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `97c88f92b`
