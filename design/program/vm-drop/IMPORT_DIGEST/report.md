# Import digest — measured hitch packages (vm-drop only)

**Master tip (this refresh):** `568d1358e518f595c064986b2ad3ca18fbfeb435`  
**Prior digest tip:** `35e519ebd`  
**When refreshed:** 2026-09-23 ~23:56 EDT  

Classification = `git apply --check` on clean master tip + distinctive markers / import commits. Soft-GPU fps is noise. Picture defaults ON.

---

## Already on master (do not re-import)

- **#2** `radar-project-scratch`
- **#3** `radar-contact-color-defer`
- **#4** `radar-range-plate-cache`
- **#5** `trail-history-pool`
- **#6** `classify-pinfacts-cache`
- **#7** `classify-closed-form-scan`
- **#8** `hud-settext-cache`
- **#9** `hud-screen-transform-cache`
- **#10** `hud-glag-transform-cache`
- **#11** `threat-halo-transform-cache`
- **#14** `sync-entity-views-closure-gate`
- **#16** `flight-dormant-skip`
- **#18** `alloc-journal-churn`
- **#23** `combat-subsystem-key-cache`
- **#24** `npc-field-role-cache`
- **#25** `docking-corridor-publish-scratch`
- **#26** `customs-scan-cone-scratch`
- **#27** `hostile-for-ai-earlyout`
- **#28** `stunt-flight-range-prefilter`
- **#29** `assign-flight-frame-ref`
- **#30** `npc-jobs-id-list-cache`

Also pre-digest on master: Lane C+D hitch floor / hold prefetch / wave hull; numeric asteroid `cellKey`; `HITCH_FRAME_TICKS = 6.5`.  
Separate headed win: `f08946634` Flight HUD stop restyling ~730 elements/frame (complements #8–#11).

---

## Still import — applies cleanly on `568d1358e`

| # | Package | Evidence |
|---:|---|---|
| 1 | `far-actor-cell-key` | ~2.06× re-verified; patch applies |
| 12 | `massline-settext-cache` | patch applies; _sfText not on master masslineHud |
| 13 | `prepare-pitch-settle` | ~2.35× re-verified; patch applies |
| 15 | `sync-entity-views-submit-scratch` | patch applies; hidden short-circuit primary |
| 17 | `asteroid-query-callers` | ~9.12× REBASED for TABLE_DECODE_RUNWAY_SECONDS |
| 20 | `opening-plan-complete` | patch applies; soft-GPU opening stack |
| 21 | `hitch-opening-drain` | patch applies; soft-GPU planWait/drainWait skip |

### Apply order (portable first)

1. `#17 asteroid-query-callers` (rebased patch under `patches/`, not `archive/`) — largest offline win (~9× rock disc)
2. `#1 far-actor-cell-key` (~2×)
3. `#13 prepare-pitch-settle` (~2.3×)
4. `#15 sync-entity-views-submit-scratch`
5. `#12 massline-settext-cache`
6. Soft-GPU opening: `#20` → `#21` (then rebase `#22` before importing)

---

## Needs rebase before import

| # | Package | Note |
|---:|---|---|
| 19 | `flight-propulsion-scratch` | coolRuntime/_sfNormalized; patch drifts on propulsionKernel.js |
| 22 | `opening-residency-deadline` | soft-GPU residency deadline; patch drifts on renderer.js |

---

## SKIP (unchanged)

- `overview-contact-pool`, `radar-contact-list-reuse`, `shader-admission-slice`
- `hold-prefetch-inbound`, `hitch-opening-admission`, `midflight-wave-hull-decode`
- `combat-entity-key-cache` / syncCombatantBounds early-out, `cloneUniforms ocean`
- `hitch-asteroid-cell-key`, `hitch-shed-floor` (already on master)

Residual micro misses (&lt;~1.5×): `copyInput`, `lifetimeSweep`, `pruneEvidence`, `normalizeCraftInput`.

---

## Scour-ranked next poles (after pending imports)

1. **Import portable pending above** — covers queryFarActors / prepareFrame pitch / syncEntityViews submit / asteroid discs / massline DOM.
2. **Rebase #19 flight-propulsion-scratch** — was ~174× coolRuntime + ~10.7× body trust on older tip; still a sim-tick pole if markers absent.
3. **Table-authority Lane A** — quiet Ceres combat-list census still fails on bare master (`got 53` live asteroids). Empty `entityList` remains the crowded-frame 50% if headed confirms.
4. **`emergentPrimitives` on production clock** (`50c7668bc`) — many full `entityList` walks/update; index/living-world/spatial before micro-pooling.
5. **Fewer program keys / share unchanged ship materials** (`PERF_TOP10` #1/#6) — new-ship hitch; no dummy prewarm; picture ON.
6. Ignore soft-GPU bloom/`isProgram`/`bufferData` for shipping KPIs.

---

## This refresh artifacts

- `asteroid-query-callers/REBASE_20260923.md` + new patch
- `far-actor-cell-key/REVERIFY_20260923.md` (~2.06×)
- `prepare-pitch-settle/REVERIFY_20260923.md` (~2.35×)
