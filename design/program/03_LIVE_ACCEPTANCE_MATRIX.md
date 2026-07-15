# Live Acceptance Matrix

**Audit date:** 2026-07-14

**Purpose:** prevent implemented code or focused checks from being mistaken for a finished milestone.

| Track | Implementation | Fresh focused/current check | Public-route truth | Evidence truth | Conditional clean waves | Exit status |
|---|---|---|---|---|---:|---|
| M0 | Broad evidence/observatory foundations | Contract self-test green; live corpus RED: 13 issues / 20 records | Current-revision baseline not rerun | Old baselines exist; corpus invalid | 0 recorded | NOT EXITED |
| M1 | Focus, camera, tether, doctrines, autopilot substantially built | Doctrines 23/23; tether/mass green | Strict Helios route RED before dock; Focus/camera/counterplay incomplete | Partial/stale media | 0 recorded | NOT EXITED |
| M2 | 24-region/global-coordinate architecture substantially built | Combined run RED on Electron websocket reset; browser portion reached save/Continue | Browser path passed during run; Electron incomplete | Existing receipt present but current combined result red | 0 recorded | REVALIDATION REQUIRED |
| M3 | Origins, cohorts, Hunter intent, damage/death substantially built | Career origins green | Natural damage/Game Over proven; recovery and three full 90-minute routes open | Damage/after-action images exist | 0 recorded | NOT EXITED |
| M4 | Regional ecology/POI foundations built | RED 8/9 on registry/save initialization order | Sparse/normal/crowded diversity routes open | Art/classification incomplete | 0 recorded | NOT EXITED |
| M5 | Story/endings/outposts/role foundations built | Role continuity green | Supporting injected role route only; ordinary story/ownership routes open | Partial | 0 recorded | NOT EXITED |
| M6 | Capture/release/localization/perf foundations and Wasp routing built | Capture contract/self-test green; perf RED | Real store route absent | Wasp has no accepted classification; localization/capture incomplete; Hitch glare and Helios material defects remain | 0 recorded | NOT EXITED |
| Depth | Focused implementations for 16 chunks after W1 correction | Aggregate green in dirty tree | Many routes compress state/timing; final unassisted routes open | All Depth `.devshots` ignored; no chunk DONE | N/A | 0 / 31 DONE |

## Fresh audit details

### Green

- `npm run check:alpha:evidence:contract`
- Asset classification gate: 19 valid records, 0 accepted.
- Observatory Phase-A contract/passive/rates/health checks.
- `npm run check:m1:combat-doctrines` — 23/23.
- `npm run check:m1:tether-mass`.
- `npm run check:m3:career-origins`.
- `npm run check:m5:role-continuity`.
- Release-capture contract 4/4 and no-browser self-test.
- `npm run check:depth-program:contracts` in the current dirty tree.
- S4/W1 isolated tests — 18/18.

### Red or incomplete

- `npm run check:alpha:evidence` — 13 issues across 20 records.
- Strict M1 Helios route — best 294.777 WU, final 324.520 WU, no dock prompt.
- `npm run check:m2:seamless-world` — browser section completed, Electron websocket reset,
  process exited 1.
- `npm run check:m4:regional-ecology` — 8/9; registry/save initialization-order assertion.
- M3 public recovery — Game Over proven, respawn settlement unproven.
- Performance artifact — 49.4 ms p95, 75 hitches, 22.9 ms callback p95, 6.9 ms sim p95,
  zero autosaves completed during capture.
- Real store capture and release clean waves — absent.

## Route qualification

`npm run check:demo-opening` and the strict M1 route are different acceptance surfaces. The demo route
has previously docked and opened the station. The stricter M1 route currently fails its ordinary
Helios approach. A green demo must never be used to close M1-ROUTE.

Depth captures that use `window.SF` to compress travel, eligibility, timing, or story gates are useful
integration evidence, but they do not close an unassisted player-route requirement.

## Clean-wave rule

The clean-wave proposal in `design/production/01_BUILD_PROGRAM.md` is not automatically binding
because the document exists. Only when the controller explicitly adopts it for a named release run:

- M0–M5 require three consecutive clean waves over their named held-out matrices.
- M6 requires five consecutive clean waves.
- Any P0/P1 regression resets the affected milestone’s counter.
- A wave must record commit/tree identity, route matrix, checks, evidence, and reviewer verdict.

No current consolidated record demonstrates these counters, so this matrix records zero rather than
inferring success from historical prose.
