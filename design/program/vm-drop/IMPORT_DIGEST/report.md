# IMPORT_DIGEST report — 2026-09-23c (optic-field-resident)

Master tip: **`568d1358e`**.

## New package

| # | Package | Evidence |
|---:|---|---|
| 31 | `optic-field-resident` | Census 96→54 / rocks 53→11; walk microbench ~1.64×; 51 focused tests; patch clean on `568d1358e` |

## Still import — applies cleanly on `568d1358e`

| # | Package | Evidence |
|---:|---|---|
| 31 | `optic-field-resident` | ~1.64× walk; census green |
| 1 | `far-actor-cell-key` | ~2.06× re-verified; patch applies |
| 12 | `massline-settext-cache` | patch applies |
| 13 | `prepare-pitch-settle` | ~2.35× re-verified; patch applies |
| 15 | `sync-entity-views-submit-scratch` | patch applies |
| 17 | `asteroid-query-callers` | ~9.12× REBASED |
| 20 | `opening-plan-complete` | soft-GPU opening |
| 21 | `hitch-opening-drain` | soft-GPU opening |

### Apply order (portable first)

1. `#31 optic-field-resident` — table-authority membership (census)
2. `#17 asteroid-query-callers`
3. `#1 far-actor-cell-key`
4. `#13 prepare-pitch-settle`
5. `#15 sync-entity-views-submit-scratch`
6. `#12 massline-settext-cache`
7. Soft-GPU opening: `#20` → `#21` (then rebase `#22`)

## Needs rebase / hold

| # | Package | Note |
|---:|---|---|
| 19 | `flight-propulsion-scratch` | integrated ~0.85× on tip — hold |
| 22 | `opening-residency-deadline` | patch drifts on renderer.js |

## Scour-ranked next poles

1. Import portable pending (esp. #31 + #17).
2. Remaining 11 live rocks (geology/collision/activity pins) — only shrink if pins allow.
3. `emergentPrimitives` hot-path spatial / batch when `emergent.hot` (cool already early-outs).
4. Fewer program keys / share unchanged ship materials — new-ship hitch; no dummy prewarm.
5. Ignore soft-GPU fps for shipping KPIs.
