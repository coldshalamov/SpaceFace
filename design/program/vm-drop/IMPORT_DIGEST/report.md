# IMPORT_DIGEST report — 2026-09-24b (share-unchanged-ship-materials)

Master tip: **`568d1358e`**.

## New package

| # | Package | Evidence |
|---:|---|---|
| 33 | `share-unchanged-ship-materials` | Portable census ~1.96× fewer unique materials (48 template copies); mutable isolation green; 5/5 focused tests; patch clean on `568d1358e` |

## Still import — applies cleanly on `568d1358e`

| # | Package | Evidence |
|---:|---|---|
| 33 | `share-unchanged-ship-materials` | ~1.96× unique materials; new-ship hitch lane |
| 31 | `optic-field-resident` | ~1.64× walk; census green |
| 32 | `emergent-hot-spatial` | ~4.0× crowded hot path |
| 1 | `far-actor-cell-key` | ~2.06× re-verified; patch applies |
| 12 | `massline-settext-cache` | patch applies |
| 13 | `prepare-pitch-settle` | ~2.35× re-verified; patch applies |
| 15 | `sync-entity-views-submit-scratch` | patch applies |
| 17 | `asteroid-query-callers` | ~9.12× REBASED |
| 20 | `opening-plan-complete` | soft-GPU opening |
| 21 | `hitch-opening-drain` | soft-GPU opening |

### Apply order (portable first)

1. `#31 optic-field-resident` — table-authority membership (census)
2. `#32 emergent-hot-spatial` — hot combat probes
3. `#33 share-unchanged-ship-materials` — new-ship hitch / material share
4. `#17 asteroid-query-callers`
5. `#1 far-actor-cell-key`
6. `#13 prepare-pitch-settle`
7. `#15 sync-entity-views-submit-scratch`
8. `#12 massline-settext-cache`
9. Soft-GPU opening: `#20` → `#21` (then rebase `#22`)

## Needs rebase / hold

| # | Package | Note |
|---:|---|---|
| 19 | `flight-propulsion-scratch` | integrated ~0.85× on tip — hold |
| 22 | `opening-residency-deadline` | patch drifts on renderer.js |

## Rock audit (unchanged this pass)

Quiet Ceres after #31: **11** live rocks — **8** `authoredGeologySkin`, **2** collision anchors, **1** activity object. All three pin classes are contract-required. **No legal cut**.

## Scour-ranked next poles

1. Import portable pending (esp. #31 + #32 + #33 + #17).
2. Optional quiet CPU profile on current tip to re-rank crowded-frame poles.
3. Same-material hull batch only if draw/GPU present is still the pole after table authority.
4. Ignore soft-GPU fps for shipping KPIs.
