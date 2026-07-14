# 01 — Current State (unified truth map)

**Checkpoint:** 2026-07-14 on `master` (`ae1813c9`; visual checkpoint `4a6b3f56`)

This is a resumable production checkpoint, not an alpha-complete claim. The default game route boots,
release assets resolve, Flight V3's generated/sim floors pass, and the focused features below are
committed. Player-route failures remain open wherever the public route did not complete naturally.

| Domain | Checkpoint result | Player-facing truth |
|---|---|---|
| Flight V3 | `check:launch-policy`, generated flight checks, flight-lab sim, and focused autopilot regression pass | Default browser/Electron path remains one game; focused course capture works. The full M1 Helios approach is still red: best 294.777 WU, final 324.520 WU, no dock prompt. |
| Combat fairness / Hunter | `check:m1:combat-doctrines` 23/23; Hunter-origin 14/14; SG-06 100 seeds × 600 ticks deterministic (`ae1813c9`) | Rook Nine spawns at the outer yard, waits while the player is in Helios sanctuary, then intentionally attacks only after the accepted writ and sanctuary exit. Repeated interceptor passes and natural player damage/death are proven; the public recovery click did not settle within 30 seconds and remains open. |
| Wasp production ship | Runtime routing, asset reachability, New Game → Shipyard → Undock → save/Continue route, and visual review accepted (`4a6b3f56`) | Authored Wasp full/LOD assets are live with a readable arrowhead/twin-nacelle silhouette and consistent persistence across hull switch and Continue. |
| HUD / station | Contact roster and current objective remain player-facing; station UI is protected | Do not refactor the restored station UI without a new explicit request. Objective hierarchy is improved, but the broader one-objective/one-action/one-threat pass is not complete. |
| Seamless world | Milestone 2 focused contracts and parity receipt remain accepted | 24-region global-coordinate world, continuous handoff, map cutover, and save/reload foundations are checkpointed. |
| Release / performance | Launch parity and asset reachability pass; capture harness self-test and 4/4 capture contracts pass | Real store capture is absent. The latest recorded crowded-flight profile is red (49.4 ms p95, 75 hitches); a fresh quality-preserving performance pass remains required. |

## Resume order

1. Repair the M1 public Helios approach so ordinary autopilot reaches and holds the physical dock
   prompt; keep the focused avoidance regression green.
2. Close the M3 public recovery seam after the accepted natural Hunter defeat, then retain the
   after-action evidence pair in `.devshots/alpha/m3-player-facing-public-route/`.
3. Run and repair a fresh crowded-flight performance profile without reducing visual quality, then
   complete the real browser/Electron release capture.
4. Reconcile the preserved deep dirty asset/source corpus into reviewed logical commits; do not
   delete or bulk-stage it. The checkpoint commits were exact-staged specifically to preserve it.

## Authority

`design/vision/ALPHA_PROGRAM.md` is the milestone ledger. Live `check:*` output and player-facing
evidence override older prose. `WAKE_REPORT.md` remains historical evidence, not this checkpoint's
completion claim.
