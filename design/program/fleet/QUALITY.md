# Whole-game stability and performance checkpoint

Resume through the QUAL rows in [the fleet queue](QUEUE.md). The fleet queue is the current build
map. Keep route status there, with this checkpoint for measurements and commit references.

## How to keep work from disappearing

- Start from the current route result and commit. Reproduce again when code or the route changed,
  or when the previous check missed the reported symptom.
- Record the next concrete action for every failing or incomplete route. A fix can be committed
  after its focused regression passes. Close a route only after its ordinary entry point passes.
- Keep successful draws, fresh simulation poses, drawn ship movement, and hitch gaps separate.
  Compare performance within a matched locked run when feasible. A boot gate checks launch and
  controls, and whole-game acceptance still uses the authored standard in [doc 18](../../game/18_SOUND_LOOK_AND_DONE.md).
- Keep workers on disjoint owners. Codex takes backend, saves, launch and performance. Opus takes
  visuals and UI. Every game or browser uses the shared game lock. Preserve exact foreign paths.
- If the work stops mid-pass, leave the current commit, route outcome, artifact path, and the next
  runnable action here or in the relevant queue row. Keep a severe defect open when its root
  cause or normal player route is still unverified.

## Current hardware baseline

Four isolated Electron launches on Intel D3D11 used a pinned game source at 792519bd72e9 and 16 s of
held-thrust observation after flight became available. Settings and viewport match. Each route
was measured once. The runs are diagnostics on this host. Gauntlet's opening stayed near real-time
simulation, while Adventure, early Swarm and Circuits lost simulation time. No route reproduced
a signed player backtrack under straight thrust. The moving-player gaps still show visible jumps
in cadence. Raw results and opened screenshots are in the four `.devshots/main-thread-profile/whole-game-before-*/` folders.

| Route | World draws/s | Fresh poses/s | Sim/wall | Callback p95 | Moving ship gap p95 |
|---|---:|---:|---:|---:|---:|
| Adventure New Game, Helios | 15.17 | 12.35 | 0.787 | 117 ms | 84 ms |
| Swarm round 1 | 13.39 | 10.76 | 0.813 | 150 ms | 139 ms |
| Gauntlet wave 1 | 25.40 | 25.28 | 0.999 | 67 ms | 67 ms |
| Public Circuits, Textile Belt | 14.14 | 12.14 | 0.823 | 117 ms | 112 ms |

## Landed and in verification

| Route | Latest result | Next runnable action |
|---|---|---|
| Desktop launch and close | `38b32852efe3` dead renderer quit, `a082946968b5` signaled child exit, `47580244082c` save before update, `ecf7b829c450` GUI environment, `1a29bf4711d7` legacy migration, `00fe1054ceb1` cold relaunch focus. `44096fab0953` bounds first navigation and paint. `4c32805ffe3f` bounds interrupted and trickling browser-server responses. Four ordinary matrix windows closed gracefully. | Finish the queued owned crash/relaunch probe. Packaged updater acceptance needs a rebuilt artifact. |
| Adventure save and story | `497814d84c4b` Anvil hazard route, `f07646fe67a7` Chart destination, `1c905c84edfe` paid jump save boundary. `ed9a9ebe6529` restores first-berth guidance and replacement alloys through the mission owner. `a32bc900d89d` passes the current first-hour check. | Finish two public F5/F9 cycles. Continue at completed Helios berth and take Weigh-In from the live board. |
| Adventure custody and workbenches | `8c5e463e88da`, `13262e9605e5`, and `90465f6f912c` keep sealed freight out of base delivery, fabrication, and bore storage. `3576c855aa3d` lets convoys sell their own freight with market rules intact. `bf0a4ea4b093` fixes station yard, service and weight-slip projection. `ae48547c908d` applies death penalties only after recovery commits. | Check sealed cargo and recovery through the ordinary player routes. Opus has the Base display quantity follow-up. |
| Physics and input | `94ecd46689ca` native body lifetime, `966f2d70f417` clears input at Pause, `e0f8ac41727a` corrects wrapped heading, `1aa922156005` waits for the first restored flight draw, and `c3e94a199ae7` keeps AI sensor cache entries with their live hull. | Observe a powered turn on both matched arms, then exercise Pause and minimize/return while moving. |
| Early Swarm and Gauntlet | `e1512147a913` first-input protection resets per Retry. Both rulesets passed real worker launch, death and Retry regression. | Verify early Swarm combat and a real Gauntlet Retry; continue from the hardware baseline rather than starting at round 20. |
| Circuits | `276d5367de24` fixes stale dock fixtures. `2024492bf5ab`, `51cd46eb2209`, and `05ab8a839342` reset boost, ghost split and gate announcements per attempt. Focused routes passed. | Through the ordinary board choose Time Trial and press F8. Play a complete scored route before closing the row. |
| Whole-game performance | Adventure owner trace in `.devshots/main-thread-profile/whole-game-adventure-owner/`. Its biggest named single sample spans a lost sampling interval. Physics and tactical AI recur across the useful samples. `8bde9b72f7f5` reduced classification work, `ca21b36890ad` reduced isolated Adventure wire-diff time by 18%, and `6292f61ccfe4` cut manifold queries from 66 to 10 with identical native fixture outcomes. `b78c7a31cd50` cut 24,000 remote Helios wash ticks from a median 483 to 6.7 ms in the isolated fixture and preserved contact outcomes and receipts. | Finish the locked Adventure/Circuits comparison and Clips A/B. Use live cadence and draw attribution to choose the next shared cost. |

The queued Windows checks write their status to `.devshots/fleet/coordination/whole-game/pending-routes.jsonl`.
If the runner exits before it acquires the lock, resume the seven checks with `node scripts/fleet/game-lock.mjs run -- node .devshots/fleet/coordination/whole-game/run-pending-locked.mjs`.
The released checkpoints for flight restore, AI identity and Helios wash used the existing deterministic replay hash.

The previous round-20 report remains in `.devshots/fleet/coordination/quality-round20-performance.md`.
Use it as one stress route. For the separate visual lane, the Yardmaster/Line overlap reproduction
and candidate are recorded in `.devshots/fleet/coordination/whole-game/` for Opus.
