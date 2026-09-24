# IMPORT_DIGEST report — 2026-09-24n (post-import hillclimb)

Master tip: **`2e7ec656b`** (fetched; unchanged).

## Stack refresh

Scratch `vm-work/hillclimb-20260924h` already on `2e7ec656b` through #48; +#49 measured
on stacked tip. vm-drop catch-up: #40 `stunt-threat-index-lanes` source was docs-only
and is now landed with #49.

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31 | `optic-field-resident` |
| 32 | `emergent-hot-spatial` |
| 33 | `share-unchanged-ship-materials` |
| 34 | `hud-credits-pulse-no-reflow` |
| 35 | `prune-evidence-cadence` |
| 36 | `projectile-surface-distance-first` |
| 37 | `classify-closed-form-index` (rebased) |
| 38 | `classify-signature-prune-membership` |
| 39 | `registry-step-dispatch` |
| 17 | `asteroid-query-callers` |
| 1 | `far-actor-cell-key` |
| 13 | `prepare-pitch-settle` |
| 15 | `sync-entity-views-submit-scratch` |
| 12 | `massline-settext-cache` (rebased) |
| 40 | `stunt-threat-index-lanes` (**source catch-up this pass**) |
| 41 | `far-query-row-scan` |
| 42 | `hud-objective-plate-cache` |
| 43 | `fields-npc-plan-cadence` |
| 44 | `sync-entity-views-middle-policy-cadence` |
| 45 | `classify-signature-record` |
| 46 | `snapshot-fence-yaw-quat-cache` |
| 47 | `composition-threat-prefilter` |
| 48 | `classify-rock-body-context` |
| + | sync-entity-views-closure-gate, opening-plan-complete, hitch-opening-drain, opening-residency-deadline |

### SKIP / hold (unchanged)

`flight-propulsion-scratch`, `classify-closed-form-scan` (superseded by #37),
physics S1-idle sleep, spatial-hash surface@600, hitch-opening-admission,
midflight-wave-hull-decode, combat-entity-key-cache, syncCombatantBounds (prior miss),
classifyWorld visit-loop cadence (prior under bar), stamp-reuse/inert/near-disc (under bar),
imminent-collision earlyout (~1.22× under bar), rock-resolvePins-only (~1.02×).

## Quiet CPU / hitch profile (stacked tip pre-#47/#48 cite)

Tool cite: prior `settled-45s-stacked-20260924h` (Picture ON, soft-GPU). Idle **61.4%**.
Soft-GPU / native GL / bloom admission owners ignored for portable ranking.

### Top portable src/ self (aggregated) — climb targets

| ms | owner | notes |
|---:|---|---|
| 100 | `registry.step` | residual after #39+#43; **#49** cuts stuntFlightEvidence child (~92 hits) |
| 66 | `prepareFrame` | residual after #13+#44+#46+#47 |
| 61 | `classifyWorld` | residual after #37+#38+#45+#48 |
| 45 | `syncEntityViews` | residual after #15 + closure-gate + #44 |
| 22 | `_stepCraft` | HOLD propulsion |
| 19 | `_stepFixed` | physics sleep residual |

Profile children under `registry.step`: preStep, **stuntFlightEvidence.update**, input,
_stepCraft, lifetimeSweep, fields, world, physics, weapons…

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| 49 | `stunt-threat-lock-prefilter` | Portable quiet threat scan **~2.04×** (lock-before-hostility + cadence2 when no tracks / empty projectiles). Combat active-tracks lock-only ~1.63×. Stunt suites 20/20. |

## Scour attempts / misses

| Attempt | Result |
|---|---|
| classify rock-only resolvePins | ~1.02× — under bar |
| selectClassify empty-projectile skip | ~1.11× indexed — under bar |
| imminentCollision earlyout | prior ~1.22× — under bar |
| Physics S1-idle / spatial-hash@600 / visit-loop / stamp-reuse | Holds — not retried |
| prepareFrame non-composition leftovers | Not shipped (pack/residency/bg under investigation) |
| classifyWorld non-rock visit | Not shipped this pass |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47 (non-composition: pack/residency/spaceBg).
2. classifyWorld residual after #37+#38+#45+#48 (non-rock visit / selectClassify).
3. registry.step after #39+#43+#49 (physics / flight / AI / remaining combat-island).
4. syncEntityViews residual (micro-motion / pose) after #15+#44.
5. Soft-GPU fps is not a KPI.
