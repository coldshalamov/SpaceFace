# IMPORT_DIGEST report — 20260924dr (post-#155; #156 miss-only, scour 3)

Master tip: **`97c88f92b`** (fetched; unchanged since #155 / digests 20260924do–dq).

## Stack refresh

Portable scour branch `vm-work/hillclimb-20260924q` @ bare `origin/master`
`97c88f92b` (`/workspace/spaceface-scratch/hillclimb-20260924p`). Stacked WIP
remains on `vm-work/hillclimb-20260924o` @ `2911f4458` (trust-sleep — not
packaged) `/workspace/spaceface-scratch/hillclimb-20260924h`. No restack
needed (master tip unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (+ `settled-20s-stacked-20260924ad`
cross-check; Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–155 | (unchanged — see digest 20260924do / dn / dp / dq) |

Including already-packaged but **not yet on master** (do not re-ship as #156):
`combat-table-pose-incremental` (~4.78×), `stamp-near-work-awake-cache`,
`stamp-near-work-budget-early-exit`, `prestep-movables-trust`,
`lifetime-sweep-quiet-clocks-skip` (#143), customs cones / sanctuary /
combat pre+postPhysics (#145–#155), classify flying-rock / frame / early
parked latches, `sync-entity-views-closure-gate`, `micromotion-settled-skip`,
`hull-scorch-quiet-live-skip`, `countermeasures-quiet-empty-latch`,
`overlay-quartet-quiet-empty-latch`, weapon-light / rcs-impulse / ribbon /
arcade-structural / distortion / quarks / discharge / presenter-composite,
etc.

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924dq / dp / do / dn / … / da / cz.

**#156 pass 1 (dp) — still stands:**
- **preStep trust-physicsSleeping** stacked ~1.97–2.01× / floor ≥1.78× but
  bare-master full preStep combo ~1.24× (non-walk ~22–24 µs dominates with
  packCombat+stampNear still unimported). Not packaged.

**#156 pass 2 (dq) — still stands:**
- packCombat pose-dirty / stampNear / lifetimeSweep bare thickness already
  packaged — do not rediscover.
- law wanted·ambient ≤0.15 µs; traffic fair ~0.32 µs; bandRadio ~2.2 µs.

**#156 pass 3 (this digest) — NEW scour notes / holds:**
- **classify residual under flying retain (stacked tip with #127/#128/#138/#141):**
  rocks48 flying+retain ~4.6 µs vs no-fly-retain ~6.1 µs (~1.33× of the
  packaged cut itself in this harness); flying vs parked ~1.27×. rocks11
  flying ~1.5 µs vs parked ~0.9 µs. Absolute residual over parked early-latch
  is ~1 µs — **no new ≥1.5× angle** without replaying held flying-early-latch
  (~1.3×) or thin NPC/disc-admission (~1.08–1.12×). Prefer angles that still
  move residual under flying retain without skipping extents+selectClassify.
- **Bare-master classify flying** ~37 µs (packaged flying-rock-retain owns
  that thickness — do not rediscover as #156).
- **Bare-master thick abs that look like poles but are already packaged**
  (confirmed this pass; do not rediscover): countermeasures iso ~6.2 µs
  (`countermeasures-quiet-empty-latch` ~40×); HullScorchPool / contactMarks
  (`hull-scorch-quiet-live-skip` ~5.8×); syncEntityViews micro-motion every
  frame (`sync-entity-views-closure-gate` + `micromotion-settled-skip`);
  overlay quartet / weapon-presenter-composite / rcs / weapon-light / ribbon
  / arcade-structural / distortion / quarks / discharge. Soft-GPU fps not a KPI.
- **HUD:** `setLagTranslate` quantized cache already on master; profile
  residual is cache hit cost. Radar leftovers (drawTrail stroke batching /
  objectiveKey) still open from earlier radar notes — **not proven ≥1.5× this
  pass**. Prefer NEW HUD quiet/empty/idle paths not yet latched.
- Fair residual of autoTargetAssist / claims / beacons / cloak / cruise /
  chronicler / aceMemory / mines / bombs / fields on quiet roster: iso ≪1 µs
  except countermeasures (packaged). No fresh ≥1.5× system latch found.
- Prior holds unchanged: flying-early-latch ~1.3×; packCombat single-dirty;
  quiet-VFX floors; NPC visit; spatial stub; asteroid settled;
  render-entity-frame; weapons residual deepen; quiet-compact-skip;
  applySnapshotPose; impulseCharges; updateDockRange; spatial all-sleeping;
  tether-web; trust-sleep; bandRadio; traffic classify-inflated; ai/aiPorts
  isolation; law wanted·ambient; etc.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#155; preStep portable thin on bare master; **imported packCombat/stampNear/lifetime not yet on master** (already packaged); HUD NEW; fair-aiPorts; packCombat only if not pose-incremental / single-dirty |
| 269 | `classifyWorld` | residual after …+#141; **flying residual over parked ~1.3× (this pass)**; flying-early-latch held; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#142; closures / microMotion / ordnance already packaged (closure-gate + settled-skip) — hunt residual **after** those, not rediscovery; asteroid settled + render-entity-frame retain held |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held; many quiet-live pools packaged, not on master) |
| 132 | `hud.frame` | radar.draw + setLagTranslate — prefer NEW HUD angles (radar drawTrail batch / still-layer / objective idle not yet proven) |
| 111 | `preStep` | **trust-sleep held (bare-master ~1.24×)**; remasure after packCombat+stampNear imports |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| — | **none (#156 miss-only)** | See scour / holds below. |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| classify flying vs parked under #141 stack | flying/parked ~1.27–1.38×; abs residual ~1 µs — no ≥1.5× deepen without held early-latch |
| classify flying retain A/B (rocks48/11) | fly retain itself ~1.3–2.1× in this harness (packaged #141) — do not re-ship |
| bare-master classify flying abs | ~37 µs — owned by packaged flying-rock-retain |
| bare-master fair/iso system sweep | countermeasures ~6 µs iso (packaged); others iso ≪1 µs |
| rediscovery audit (hull-scorch / closure-gate / micromotion / overlay / rcs / lights / ribbons / arcade / distortion / quarks / discharge / presenter) | all already on vm-drop — **do not rediscover** |
| HUD setLag / radar project / travel-tape | setLag already on master; travel-tape already early-outs when burn off; radar leftovers not measured to ≥1.5× |
| aiPorts / trust-sleep / packCombat pose / stampNear / lifetime / law ambient / traffic / bandRadio | **not casually retried** (held) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   — **flying vs parked residual ~1.3× this pass**; NPC/ship visit deepen still
   thin ~1.08×; disc-admission visit-retain thin ~1.12×; **flying-early-latch
   held ~1.3×**; id-replay ~1.16×; rock context ~1.09×. Prefer angles that
   still move residual under flying retain without replaying the early-latch
   skip of extents+selectClassify (e.g. cheaper flying-eligibility / visit
   identity without full pinFacts+extents skip, if ≥1.5× can be proven).
2. registry.step after …+#155 — **prefer HUD NEW** (radar still-layer /
   drawTrail batch / objective idle / other unlatched quiet paths) /
   syncEntityViews residual **after** closure-gate+settled-skip (not
   rediscovery) / fair-aiPorts / packCombat only if not pose-incremental or
   single-dirty. After owner imports pose-incremental + stampNear + lifetime,
   remeasure bare-master preStep before retrying trust-sleep.
3. syncEntityViews residual after #15+#44+#57+#74+#76+#77+#81+#142 + packaged
   closure-gate + micromotion-settled — hunt fresh ordnance/infrastructure/
   pickup residuals or projection/LOD retain; applySnapshotPose hold ~0.85×;
   asteroid settled ~1.14× + render-entity-frame retain ~1.21× held.
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
   **classify flying residual over parked ~1.3× (this pass)**.

## Scratch

- Portable scour branch: `vm-work/hillclimb-20260924q`
- Portable worktree: `/workspace/spaceface-scratch/hillclimb-20260924p` @ `97c88f92b`
- Stacked WIP (trust-sleep only; not packaged): `vm-work/hillclimb-20260924o`
  @ `2911f4458` / `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `97c88f92b`
