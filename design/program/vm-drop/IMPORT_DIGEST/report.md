# Import digest — measured hitch packages (vm-drop only)

**Master tip:** `35e519ebd75325e119c2c7fe61f6a234f2514c1e`  
**vm-drop tip (at digest write):** `61cb6c4c121d9ebe7410ebcdeb7d57422ec7b3e7`  
**Fresh profile:** `/workspace/spaceface-scratch/hitch-hillclimb-fresh-20260923/`  
**When profiled:** 2026-09-23 ~00:09–00:11 EDT — settled held-thrust 60937 ms; idle 57.3%; long tasks 18; soft-GPU (llvmpipe). Picture defaults ON.

Reconciled by fetching `origin/master` + `origin/vm-drop` and checking code markers (e.g. asteroid numeric `cellKey`, `HITCH_FRAME_TICKS = 6.5`, far-actor still string `` `${cx}:${cz}` `` on master).

---

## Recommended import order

Order follows fresh-profile portable self-time poles, then opening/soft-GPU cook stack, then residual alloc. Apply each package’s own `IMPORT.md` on a throwaway branch from `origin/master`; do **not** merge this digest to master.

| # | Package | Scratch SHA | One-line evidence |
|---:|---|---|---|
| 1 | `far-actor-cell-key` | `070c58394` | Integer-packed far-actor grid keys; offline 8k×400×~4700 WU **271→123 ms (~2.2×)**; tests 28/28. Covers `queryFarActors` **111.6 ms** self. |
| 2 | `radar-project-scratch` | `77064b0b5` | `projectRadarPoint` out-param + pooled hostile marks; **59.4→44.7 ms (~1.33×)**; tests 9/9. Part of `radar.draw` **398.9 ms**. |
| 3 | `radar-contact-color-defer` | `2d7bc6c71` | Defer contact colour + range-plate cache stack; plate **92.2→3.7 ms (~25×)**, contacts **41.6→22.8 ms (~1.83×)**. |
| 4 | `radar-range-plate-cache` | `81f70888d` | Cache `drawRangePlate` by `(range, expanded, metrics.size)`; **110.7→6.19 ms (~17.9×)**. Covers `drawRangePlate` **47.0 ms**. |
| 5 | `trail-history-pool` | `d352c55af` | Recycle radar trail `{x,z}`; **100.1→46.0 ms (~2.18×)**; tests 9/9. |
| 6 | `classify-pinfacts-cache` | `a23a8619e` | `rebuildPinFacts` membership/intent early-out; **54.5→1.0 ms (~54×)**. Covers `classifyWorld` **189.3 ms**. |
| 7 | `classify-closed-form-scan` | `3e798170f` | Catch-up walk only stamped physics entities; **187.2→144.3 ms (~1.3×)**. |
| 8 | `hud-settext-cache` | `941643eb8` | `setText` `_sfText` last-write; **36.5→26.2 ms (~1.40×)**; HUD suite 48/50 (2 also fail on bare master). |
| 9 | `hud-screen-transform-cache` | `792186592` | Quantized early-out for `setHudScreenTransform`; settled-path win (see package DONE). |
| 10 | `hud-glag-transform-cache` | `fe6fe56c3` | Optical G-lag translate hundredths early-out; settled-lag **106.2→8.4 ms (~12.6×)**. |
| 11 | `threat-halo-transform-cache` | `933ac2e85` | Threat-halo `setHudTransform` tenths early-out; settled **61.0→3.3 ms (~18.6×)**; tests 7/7. |
| 12 | `massline-settext-cache` | `c0718f881` | Massline `_sfText` cache (0 DOM text reads); HUD 33/33 + massline 69/69. Complements #8. |
| 13 | `prepare-pitch-settle` | `847e893e3` | Settled-idle pitch skip + middle-band cadence; stand-in **129.6→57.0 ms (~2.27×)**; crucible worst **983→200 ms**. |
| 14 | `sync-entity-views-closure-gate` | `4df3ba34f` | Cadence micro-motion with entity-view closures; **55.7→21.7 ms (~2.56×)**; tests 31/31. |
| 15 | `sync-entity-views-submit-scratch` | `364b555f2` | Hidden short-circuit + submit options scratch; hidden **~12.5×**, full **~1.24×**; tests 11/11. |
| 16 | `flight-dormant-skip` | `c2de7839b` | `entityNeedsFlightStep` shelves dormant S2/S3/S4; **264.7→104.5 ms (~2.53×)**; tests 15/15. Covers `registry.step` **170.2 ms**. |
| 17 | `asteroid-query-callers` | `2e62210f4` | Tight rock discs + drop dead decode-runway scan; **233.2→24.0 ms (~9.7×)**; tests 25/25. Residual `queryAsteroidField`. |
| 18 | `alloc-journal-churn` | `16c2a6810` | Cross-tick coalesce retained journal transform/visual; crucible worst **783→267 ms**; tests 12/12. Covers `presentationJournal.append`. |
| 19 | `flight-propulsion-scratch` | `aa6ec09ec` | coolRuntime module scratch (~**174×**) + trust `_sfNormalized` bodySnapshot (~**10.7×**); propulsion suite 52/52. Covers `_stepCraft` / `makeResult` residual pole. |
| 20 | `opening-plan-complete` | `f69e5c849` | Skip awaiting-authored markers so soft-GPU opening plan finishes; tests 24/24. Stack with #21–#22. |
| 21 | `hitch-opening-drain` | `d6a1c419e` | Soft-GPU skip planWait/drainWait; `prepareOpeningGpuResources` **874→67 ms**; tests 4/4. |
| 22 | `opening-residency-deadline` | `9fdb832df` | Soft-GPU residency stops at 750 ms deadline + receipt continue; residency wall **1254→880 ms**; tests 3/3. |
| 23 | `combat-subsystem-key-cache` | `947d06c70` | Cache sorted subsystem ids; applyPending/recompute **~7.5×** offline; tests 24/24. Covers `applyPendingSubsystemTransitions` **36.3 ms** self. |

### Optional / separate backlog (not in top portable poles)

| Package | Note |
|---|---|
| `dynres-target-pool` | PERF #89 — zero realloc on scale sweep; picture default unchanged (`dynamicResolution` opt-in). |
| `guard-the-wins` / `integrated-quality-preset` | Quality/guard series; import only with an explicit picture/perf plan. |

---

## SKIP list (do not import)

| Package / miss | Why |
|---|---|
| **overview-contact-pool** | Microbench ~**1.04×** (643→618 ms); never shipped patches to vm-drop outbox. |
| **radar-contact-list-reuse** | `.length=0` reuse ~**0.94×**; **no patches**. |
| **shader-admission-slice** | Soft-GPU crucible hitch regress (e.g. 65→94 class); keep forensics only. |
| **hold-prefetch-inbound** | Measured miss (worst frame / peak admission up); lane-c inbound **already on master** via `1198e70e7`. |
| **hitch-opening-admission** | planWait skip alone moved cost to residency/drainWait; wall flat — **no patches**. |
| **midflight-wave-hull-decode** | Hitch + game-speed miss on soft-GPU; Choice B already partially on master via lane-c. |
| **combat-entity-key-cache** / syncCombatantBounds early-out | Offline: key cache ~0.98×; bounds early-out **slower** (~0.60×). |
| **cloneUniforms ocean** | Avoid per brief (alloc-profile noise, not a portable win). |
| **hitch-asteroid-cell-key** | **Already on master** (numeric `cellKey` in `asteroidField.js`). |
| **hitch-shed-floor** | **Already on master** (`HITCH_FRAME_TICKS = 6.5`). |

---

## Apply quirks

1. **`flight-propulsion-scratch` — CRLF on master**  
   `src/core/flight/propulsionKernel.js` is CRLF on `origin/master`. Prefer:

   ```bash
   git apply --ignore-space-change design/program/vm-drop/flight-propulsion-scratch/patches/*.patch
   ```

   (Also documented in that package’s `IMPORT.md`.)

2. **Radar / classify stacks** — Prefer the order above (#2→#5 and #6→#7). Some older contact-color patches also touched range-plate; if `git am` conflicts, take the later specialized package’s hunks and re-run the package’s focused tests.

3. **Opening stack** — Import **#20 → #21 → #22** together on soft-GPU; measuring any one alone understates the cook wall.

4. **HUD caches** — Independent; safe in any order relative to radar/classify. `massline-settext-cache` complements `hud-settext-cache` (different file).

5. **Do not** `git merge` `vm-drop` into master. Copy/am each job folder on purpose.

---

## Fresh-profile portable poles → package map

| Pole (self) | Covered by |
|---|---|
| `radar.draw` 398.9 ms | #2–#5 |
| `classifyWorld` 189.3 ms | #6–#7 |
| `registry.step` 170.2 ms | #16 |
| `queryFarActors` 111.6 ms | #1 |
| `syncEntityViews` 69.2 ms | #14–#15 |
| `prepareFrame` 63.9 ms | #13 |
| `hud.frame` 61.5 ms | #8–#11 (+ #12 massline) |
| `_stepCraft` 45.0 / `makeResult` 40.3 ms | #19 (+ further propulsion leftovers still open) |
| `queryAsteroidField` residual | #17 (cellKey already on master) |
| `presentationJournal.append` | #18 |
| `applyPendingSubsystemTransitions` 36.3 ms | #23 |
| Soft-GPU `bufferData` / `isProgram` / bloom | **Ignore** for portable hillclimb |

---

## How this folder was produced

Report-only under `design/program/vm-drop/IMPORT_DIGEST/`. No `src/` changes. Push is limited to this folder on branch `vm-drop`.

## Hillclimb follow-ups (this session)

- **Shipped:** `combat-subsystem-key-cache` (above).
- **Tried / miss:** `makeResult` / `normalizeInput` pooling on `propulsionKernel.js` — V8 short-lived alloc beat pooled fill+clear (~0.4–1.0×); travel-drive byte-identical fixture also forbids private result keys. Left for later only if a non-pool approach appears.
- **Tried / miss earlier:** `combat-entity-key-cache` / syncCombatantBounds early-out (see SKIP).
