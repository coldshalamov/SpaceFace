# Verified Done and Implemented Work

**Audit date:** 2026-07-14

**Rule:** this document separates accepted outcomes from implemented components. The whole Alpha and
the whole Depth Program are not finished.

## Milestone-exit truth

No M0–M6 milestone currently has a fully current route-and-evidence exit that survives the fresh
audit. No milestone has a current clean-wave record either; clean-wave counts become an exit
requirement only if the controller explicitly adopts the draft production policy for a release run.
M2’s architecture was previously marked complete, but its current combined browser/Electron check
exited red during Electron launch and must be revalidated.

## Freshly verified foundations and packets

| Area | Verified result | Acceptance level |
|---|---|---|
| Alpha evidence validator contract | `npm run check:alpha:evidence:contract` passes its rejection/self-test matrix. | Focused green; live corpus remains red. |
| Asset classification corpus | Gate passes with 19 records: 3 candidate, 8 missing-evidence, 8 rejected, 0 accepted. | Classification machinery green; no visual asset accepted by this corpus. |
| Gameplay Observatory Phase A | Contract, passive determinism, rates, and recording-health checks pass; recorder commit `14bfed98` exists. | Focused green; browser/media Phase B open. |
| M1 combat doctrines | `npm run check:m1:combat-doctrines` passes 23/23. | Focused green. |
| M1 tether/mass | `npm run check:m1:tether-mass` passes. | Focused green; natural player benchmark open. |
| M3 career origins | `npm run check:m3:career-origins` passes the three origins, 22 aggregate tests, Hunter’s 14 sections, and live Hunter check. | Focused green. |
| M5 role continuity | `npm run check:m5:role-continuity` passes 13 roles and New Game/Continue/hull-switch delivery. | Focused green; ordinary player-route ownership acceptance open. |
| Release capture machinery | Release-capture contract passes 4/4; ffmpeg/ffprobe self-test plus 23 hostile cases passes without a browser. | Tooling green; real store capture open. |
| Depth focused aggregate | `npm run check:depth-program:contracts` passes in the current dirty worktree. | Working-tree focused green; not reproducible from committed `master`. |
| S4/W1 isolated groundwork | Thunderchild and W1 data tests pass 18/18 combined; W1 contributes 7 green data/placement tests. | Dirty-tree groundwork only. |

## Major committed implementation now on `master`

| Commit(s) | Implemented outcome | What remains before final acceptance |
|---|---|---|
| `7b0ad557` | Autopilot retains its course after obstacle avoidance. | Strict Helios approach/dock route is still red. |
| `4a6b3f56` | Authored Wasp full/LOD runtime routing, Shipyard/Undock/save/Continue path. | Add canonical asset-classification record and re-run visual/performance acceptance. |
| `ae1813c9` | Rook Nine uses accepted-mission intent outside sanctuary; interceptor cycles cannot stall forever. | Natural recovery and held-out counterplay route. |
| `62231ecf` and related career commits | Measured career cohorts, starter builds, origins, and progression infrastructure. | Three complete unassisted ninety-minute routes. |
| `eed065ae`, `f4ba6a91`, `a4cc2e8c`, `228ce7b0`, `dc627198`, `f9dab574` | Global coordinates, floating origin, continuous handoff, full region data, and map/persistence foundations. | Restore current Electron acceptance and, if adopted for release, record clean waves. |
| `f4678c42`, `b64a91e2`, `31a45bb6`, `dbca66a7` | Story/outpost foundations, 13-role lattice, visible role packet continuity. | Ordinary story, ending, sandbox, and visible ownership routes. |
| `8e849a01` | Evidence-bound release capture pipeline. | Real browser/Electron store capture. |
| `1da7e102` | Crowded-flight autosave work is bounded. | Fresh profile remains red overall and recorded capture completed no autosave. |
| `f05997d6`, `a099f327` | Dedicated playable-opening check and checkpoint report. | This demo route does not close the stricter M1 route. |

Additional committed categories include the restored station command shell, objective search, unified
map scales, localization groundwork, cargo ownership, platform/release tests, living-galaxy tests,
combat-doctrine wing work, claims, and role ownership. Their milestone acceptance remains governed
by the matrix in [`03_LIVE_ACCEPTANCE_MATRIX.md`](./03_LIVE_ACCEPTANCE_MATRIX.md).

## Depth Program: what is preserved on committed master

No Depth chunk is fully DONE. The committed foundations include:

- F1 modular faction migration (`bb18f79c`).
- F2 authored encounter loader/catalog foundation (`8d31c20f`).
- R1/R2 core unique-wreck discovery and salvage foundation (`58ef888c`).
- Depth plan/research documents (`48758795`, `d5e4e7ae`, `e4cc5621`).

The July-14 validators, content corpus, set pieces, factions, encounters, Band, Ship’s Ledger,
Thunderchild, doctrine matrix, W1 data, and most evidence are not yet safely represented by those
commits. They are catalogued in the remaining-work and worktree documents.

## Explicitly not counted as done

- A focused or synthetic green check without a natural player route.
- A browser capture that compresses travel, eligibility, timing, or story gates through `window.SF`.
- A routed GLB without a current accepted classification record.
- Ignored `.devshots` evidence that is absent from a clean checkout.
- A dirty implementation that committed `master` cannot reproduce.
- A milestone without its required route/evidence record, or without clean waves when the controller
  has adopted the draft production policy.
