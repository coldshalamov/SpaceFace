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
| Adventure save and story | `497814d84c4b` Anvil hazard route, `f07646fe67a7` Chart destination, `1c905c84edfe` paid jump save boundary. `ed9a9ebe6529` restores first-berth guidance and replacement alloys. `280970113e27` prevents stale shared saves and deletes from replacing a newer slot, while valid recovery still repairs an unchanged primary. The real HTTP race and recovery tests passed. Two public F5/F9 cycles in locked Electron saved and returned to flight in 7.67 s and 9.26 s, then closed gracefully. Evidence is `.devshots/fleet/coordination/whole-game/adventure-save-continue-r2/evidence.json`. | Continue at the completed Helios berth and take Weigh-In from the live board. |
| Adventure custody and workbenches | `8c5e463e88da`, `13262e9605e5`, and `90465f6f912c` keep sealed freight out of base delivery, fabrication, and bore storage. `3576c855aa3d` lets convoys sell their own freight with market rules intact. `bf0a4ea4b093` fixes station yard, service and weight-slip projection. `ae48547c908d` applies death penalties only after recovery commits. `dfa4e4f95176` tracks the wreck across sectors until its freight is aboard. `5939abb2cc09` keeps partially delivered contracts when the surviving cargo covers the balance. | Check sealed cargo and recovery through the ordinary player routes. Opus has the Base display quantity follow-up. |
| Physics and input | `94ecd46689ca` native body lifetime, `966f2d70f417` clears input at Pause, `e0f8ac41727a` corrects wrapped heading, `1aa922156005` waits for the first restored flight draw, and `c3e94a199ae7` keeps AI sensor cache entries with their live hull. `91a04da72389` passes intentional turns and stops through the pose smoother, repairing about 35° of visible heading lag in a 30 Hz reproduction. `453f0992bb3a` releases an Ashfall jump handoff when the player chooses Stay. `5faee660d029` prevents the main presentation read from displacing a received worker pose or writing world records. Its production bridge reproduction moved a ship 88.5 WU before the fix. | Observe a powered turn and key release on both matched arms, then exercise Pause and minimize/return while moving. |
| Early Swarm and Gauntlet | `e1512147a913` first-input protection resets per Retry. Both rulesets passed real worker launch, death and Retry regression. | Verify early Swarm combat and a real Gauntlet Retry; continue from the hardware baseline rather than starting at round 20. |
| Circuits | `276d5367de24` fixes stale dock fixtures. `2024492bf5ab`, `51cd46eb2209`, and `05ab8a839342` reset boost, ghost split and gate announcements per attempt. Focused routes passed. | Through the ordinary board choose Time Trial and press F8. Play a complete scored route before closing the row. |
| Whole-game performance | Adventure owner trace in `.devshots/main-thread-profile/whole-game-adventure-owner/`. Its biggest named single sample spans a lost sampling interval. Physics and tactical AI recur across the useful samples. `8bde9b72f7f5` reduced classification work, `ca21b36890ad` reduced isolated Adventure wire-diff time by 18%, and `6292f61ccfe4` cut manifold queries from 66 to 10 with identical native fixture outcomes. `b78c7a31cd50` cut 24,000 remote Helios wash ticks from a median 483 to 6.7 ms in the isolated fixture and preserved contact outcomes and receipts. | Finish the locked Adventure/Circuits comparison and Clips A/B. Use live cadence and draw attribution to choose the next shared cost. |

Additional matched CPU measurements under the same inputs and owner state:

| Change | Replayed work | Before → after |
|---|---|---:|
| `4162156aef77` Massline obstruction | 1,600 previews with 100 or 400 nearby spatial hits. Acquisition receipts matched. | 95.4 → 76.3 ms and 330.8 → 239.7 ms |
| `399bb0ba24c2` Vael ledger | 8,000 Adventure owner updates in quiet Helios and in the Veil with invoices and an active lien. Ledger, actors and receipts matched. | 334.7 → 191.7 ms and 1085.4 → 384.3 ms |
| `8aef717c4fe4` plant station and cursor reads | Seven plant owners on matched production Node-host scenes. Median combined cost across Helios, Pallas, early Swarm and Gauntlet. | 37.4 → 30.3, 36.9 → 25.6, 34.9 → 30.9 and 27.8 → 22.2 µs per tick |

These owner measurements establish specific CPU savings. Live world cadence remains open. The main
thread's recurring render submission and the worker's above-budget simulation steps both need work.

## Playtest checkpoint

- Windows Electron recovered an injected renderer crash, offered Quit on the next crash, and
  relaunched to an interactive title. The two public F5/F9 cycles also returned to flight.
  The packaged updater remains unverified. Crash evidence is in
  `.devshots/fleet/coordination/electron-crash-quit/report.json`.
- The matched powered turn and release measured p95 hull-to-pose heading error at 17.8° → below
  measurement precision. Callback p95 was about 100 ms in both arms. `5faee660d029` fixes a
  worker pose overwrite, and `052899aebd10` stops a patrol's side impact from creating a false
  player warrant while preserving real player ram attribution.
- `e8cce95972ea` keeps campaign actors, ambient collision and Act I outside standalone Circuits.
  Time Trial and Pack/Cup retained zero and two authored rivals respectively in the three-format
  worker reproduction. The production restore test confirmed campaign traffic returns on Continue.
  Fifteen focused checks passed. Live F8, a completed scored run and a new Circuits capture remain open.
- `a73aee08fa79` preserved measured telemetry values and historical snapshot identity. On a matched
  360-tick native 60-ship fixture median time fell from 326.3 to 287.5 ms. The 12-ship result was
  87.4 → 85.9 ms. The deterministic replay matched v27 across 20 repeats. Live impact remains open.
- `e9fd39b0eb63` gives Retry/Back when native physics preparation refuses flight. The next desktop
  investigation is a diagnostic Adventure launch where HTML rendered with native lifecycle
  `hidden-or-minimized`, zero world draws and only the first-picture hold. Trace the native window
  state and shell command before changing the hold. Fresh-app Ceres Continue also needs to warm
  RU-7 before the worker restore publishes entities. Its cold fallback was reproduced in isolation.
- The four-arm Clips run showed no consistent frame or hitch improvement from disabling capture.
  Circuits candidate and stock drew 13.7 and 16.2 frames/s with different public seeds and world
  paths. Repeat with matched seeds only after live flight and the Circuits roster changes settle.
  Import lint and Adventure passed the fleet gate. Swarm stopped in asset preflight because six
  Works files were being edited. Those edits have since landed, so repeat Swarm through the lock.

The Windows matrix status is in `.devshots/fleet/coordination/whole-game/pending-routes.jsonl`.
The standalone hold probe timed out before live flight and closed gracefully. The F8 retry was
cancelled while queued for the user's playtest. After the playtest, start the pending Circuits check
with `node scripts/fleet/game-lock.mjs run -- node .devshots/fleet/coordination/whole-game/run-race-restart.mjs`.
The released checkpoints for flight restore, AI identity and Helios wash used the existing deterministic replay hash.

The previous round-20 report remains in `.devshots/fleet/coordination/quality-round20-performance.md`.
Use it as one stress route. For the separate visual lane, the Yardmaster/Line overlap reproduction
and candidate are recorded in `.devshots/fleet/coordination/whole-game/` for Opus.
