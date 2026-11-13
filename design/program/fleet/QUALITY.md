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

## Recorded Windows world freeze

The November 12 player recording shows Ricochet Foundry round 2 with the Supply Pod wager.
The matching unpackaged Electron launcher receipt records five full-scale, focused flight holds.
At tick 2491, 16 world draws occurred in 1.01 s while simulation time and the ship's position
stayed fixed at a reported speed of 100 WU/s. There was no pause request. The timer and ACK
values in the receipt came from the last delivered reply, so they cannot establish whether the
worker's current timer had stopped. Clip samples and the matching receipt are under
`.devshots/fleet/coordination/player-freeze/`.

- `aa5b5517ed0c` unified main and worker shared-memory layout sizing. The old main allocation
  silently prevented the envelope ring from binding. Activating the ring exposed a second issue
  in live combat, where four queued command batches could stop flight. `da56112e4fba` uses the
  ordered worker message queue for controls, retaining shared buffers for completed replies.
- `5c70500d527f` releases cumulative ACKs before queued authoritative work. `14faa9c79438`
  sends journal progress as a cumulative ACK without asking the worker for a command reply.
  `37e2ce7e8425` adds the independent worker watermark to the existing launcher freeze receipt.
- `64678c44a573` re-sends the already applied reply watermark with a foreground heartbeat
  during starvation. In the dropped-ACK regression, four credits filled while the worker kept
  stepping. Motion delivery resumed before the three-second rebuild watchdog, and incorrect
  lifecycle and future watermarks did not free credits.
- `2c0f3ecd0856` fixes a separate forward-then-backward ship snap. The same live player moved
  authoritatively from 780 to 786.5 WU. After a rebuild the drawn ship previously moved from
  838.5 back to 786.5 WU. It now advances to 839.28 WU. Reused IDs, restore, sector changes and
  explicit resets still invalidate old poses. The regression crosses the real journal,
  publisher, pose fence and renderer. The player's recording cannot tie each snap to this path.
- In a locked Foundry round 2 diagnostic entry at seed 4242, both arms cleared the round and
  reached the Armory. The largest sampled active-flight reply age fell from 522 to 158 ms and
  the recorder's reply-starvation episodes fell from three to zero. Callback and moving ship
  gap p95 were 117 → 100 ms and 120 → 100 ms. Active simulation advanced 0.61 → 0.64 s per wall
  second. Outcomes and durations differed, and the recording had a different arena event.
  The harness did not yet confirm firing in this pair.
- A second locked pair used the recorded Supply Pod event, and confirmed held thrust, turn, and
  primary fire in both arms. Neither reproduced the recorded multi-second freeze. Over the first
  27 s of active flight, world submits fell from 21.1 to 16.3/s and simulation advanced 1.00 to
  0.84 s per wall second. Peak sampled reply age fell from 242 to 167 ms. Across the complete
  samples, drawn moving-mesh gap p95 rose from 70 to 100 ms, with a maximum of 126 to 193 ms.
  Stock cleared round 2. The envelope candidate was still in combat when its window ended.
- `386eebfd9305` keeps the shared numeric journal but returns message envelopes to structured
  clone. The fixed-size JSON envelope is diagnostic opt-in. In the isolated locked comparison,
  the ordinary journal route fired 210 times in about 24 seconds, with 13.4 world submits/s and
  a 126 ms drawn-motion gap p95. The envelope arm reached Armory and timed out entering active
  flight, so that run cannot establish an FPS gain. Neither transport result closes QUAL-07.
- `6bb94413ed9d` keeps duplicate and rewind semantics while skipping repeated AI membership lookups.
  The native 240-tick Foundry replay kept its hash and contact counts. The isolated owner pass was
  about 10% faster. `f4de88a6214a` batches floor-label layout reads, preserving separate chip seats.
  Its isolated frame benefit has not been measured.
- `60cd8a4cdc35` keeps native contact fences on the simulation side, preserving all impact and
  consequence receipts. In a 480-tick Adventure replay this removed 451 of 1,754 bridge rows.
- `7dfe58b4ac73` queues cold dormant rock geometry during flight, before contact or simulation
  promotion. The real admission queue passes its focused regression with a controlled GPU port.
  The Ceres browser probe reached live flight but staged no dormant row, so its ram leg did not
  exercise this fix. Three common live rocks met its frustum-sphere check without a mesh for
  1.8–2.5 s. A remaining short episode was a separate reentry by one of the same rocks.
- `07df4340e225` keeps a rock on the direct draw path until its instance is drawable. The old
  instance batch retains only the records it covered, and releases an old matrix before its
  entity ID can be reused. The admission and pool fixtures passed. This is separate from the
  remaining meshless live-rock episodes.
- In a follow-up Ceres flight after the pool fix, all 55 observed entries drew, six with delays
  of up to 43 ms. The probe followed a different path and saw no common live or dormant rocks.
  Keep the long no-mesh case open. `13d2a084fd8c` makes the probe match the submitted instance
  to its actual draw batch and retain camera and admission data on missing meshes.
- A 33-second locked Supply Pod flight on the journal path recorded 382 player shots, no
  detected multi-second holds and no drawn backtracks in 58 assessable intervals. It submitted
  20.7 world frames/s, with 77 ms p95 and 155 ms maximum drawn-motion gaps. It ended with one
  hostile still alive. This is a single flight, captured before the heartbeat recovery landed.
- The final locked Supply Pod pair overlaid the 12 changed runtime paths from the pre-fix and
  post-fix commits and opened both flight captures. Over approximately 28 seconds per arm, world
  submissions rose from 12.0 to 20.2/s. Callback gap p95 fell from 133 to 83 ms. Drawn moving-ship
  gap p95 fell from 129 to 85 ms and max fell from 177 to 113 ms. Peak sampled reply age fell
  from 482 to 199 ms, and the simulation advanced 0.66 to 0.96 s per wall second. There was one
  reply-starvation episode before and none after. Player fire was confirmed (210 and 318 shots).
  The encounter evolved differently in the two arms. The original seconds-long freeze did not
  recur, and the final candidate still hitches. Raw measurements and screenshots are
  `round2-final-pair-before*` and `round2-final-pair-after*` in the recording evidence folder.
- `1c0bc6a49b6d` removes unused per-entity slice-clock checks from synchronous rendering.
  The 13 focused pose and view checks passed. Its isolated live frame gain is unmeasured.

The Windows matrix status is in `.devshots/fleet/coordination/whole-game/pending-routes.jsonl`.
Two isolated Adventure launches reached the route's flight state but timed out before its clock
was live. A third reached full-speed play. Pause held tick 122 and minimize held tick 405.
After Resume and native Restore, both advanced ticks, resumed drawing, and accepted thrust.
Opened both captures from `flight-holds-owner.json`. The intermittent first-picture hold remains open.
The locked Circuits run used the public Time Trial route and F8 reset the same attempt in its authored
sector. Its opened screenshot still showed the campaign act heading above the race objective.
`8566b710688a` uses the temporary run's existing public launch context to hide the campaign
heading and radio, keeping gate guidance. Fifty-three focused checks passed. Scored finish,
and restart after a cleared gate remain open. The post-fix public Time Trial capture confirmed
gate guidance, the campaign heading and comms tape hidden, and a same-attempt F8 restart.
The first image still showed an Adventure yard-control line above the racing panel. `f859298abed6`
resets POI guidance on New Game and keeps its sector planner out of temporary circuits.
The regression enters a race after Adventure and continues the campaign afterward. Twenty-three
focused checks passed. A follow-up public F8 restart retained gate guidance and cleared the
yard-control line in the opened `circuits-place-isolated.png` capture.
The released checkpoints for flight restore, AI identity and Helios wash used the existing deterministic replay hash.

The previous round-20 report remains in `.devshots/fleet/coordination/quality-round20-performance.md`.
Use it as one stress route. For the separate visual lane, the Yardmaster/Line overlap reproduction
and candidate are recorded in `.devshots/fleet/coordination/whole-game/` for Opus.

## Worker ledgers, rendering, and native startup

- `0dbde54a8fc5` connects the worker's dormant asteroid deltas to the renderer's actual spatial
  table. The old path only updated the private read model. Field rows now enter the render roster
  before promotion, without becoming live bodies. The 56 focused checks include grid movement,
  promotion, reused IDs, and coalesced replies. Ceres live contact remains open.
  The production worker's Ceres entry emitted 525 dormant rows, including 27 diamond cells.
  One ordinary rock resolved in the presentation grid before the ram-promotion command, then
  transferred to the live body roster and left the field. The owner probe found no aux breaches.
  The locked Chrome probe staged 556 rows in Ceres and recorded 288 of 293 dormant metallic
  entries drawing immediately. Five drew late. One common rock was never stamped while its
  bounding sphere intersected the frustum. Its center started offscreen. Two late live entries
  started with their centers onscreen (671 ms for a rescue rock and 279 ms for a metallic rock).
  The ram target began 2,122 WU away and never reached the frustum. The probe therefore does
  not establish contact continuity. Opened `2026-11-13T12-01-28-862Z-shot0.png` and recorded its
  sibling JSON under `.devshots/asteroid-appear/`.
- `0427216c1975` drains dirty and removed IDs directly. New and replaced tables compare membership
  once. The 720-tick auxiliary probe had no reader mismatches or missing journal marks. The separate
  transport threshold failed on this host (2.54 ms p95 against the 0.5 ms per-tick threshold).
  A matched Node benchmark with 6,000 dormant rows and one change every ten replies measured
  1.66 to 0.012 ms median in the diff itself, with the same upsert and removal counts. These are
  isolated owner costs. Evidence: `aux-rock-journal-bench.mjs` and `aux-rock-journal-spike.json`
  under `.devshots/fleet/coordination/`.
- `f7294f59cb55` packs Nocturne probe uniforms once per frame. Isolated vendored Three.js uploads
  with four probes took 3,995 to 313 ms across 720,000 material uploads. The 21 focused tests
  preserve shader values. `81f1eb4c31ef` reuses measured compact-hull bounds, preserving the native
  200-tick combat hash and mutable authored hulls. Its isolated benefit was about 0.03 ms per tick.
  Neither result measures the effect on live frame time.
- `2562d286fd30` republishes actual Electron window visibility after the first show. An injected
  missing native `show` event previously left a visible window marked hidden, which cancels
  presentation and simulation. The regression failed before and passed after. The earlier live
  Adventure stalls did not record enough native state to attribute them to this race.
  The `ledger-shell` follow-up captured a different failure. Native Electron was actually
  minimized while the Chromium document reported visible and focused. The game was at tick 0
  with four draws, the first-picture hold active, and a black playfield under the HUD. Its
  isolated teardown needed the exact-child fallback. The opened screenshot and native receipt
  are `flight-holds-timeout-ledger-shell.png` and `flight-holds-owner-ledger-shell.json` under
  `.devshots/fleet/coordination/whole-game/`. Capture native state on any future opening stall.
  The next public launch was already visible and focused at flight entry. Pause held tick 66
  and native minimize held tick 178. Both advanced simulation, drew the world and accepted
  thrust after return. Both PNGs were opened. Cleanup passed. See `flight-holds-owner-native-resume.json`.
  This route deliberately introduces two holds, so its aggregated cadence is not a steady-flight
  comparison. In its active samples it still recorded 1.73 s maximum simulation staleness.
- `64092aa260a1` and `15f2694cd228` capture the same held thrust, turn and primary-fire workload
  in cadence, worker CPU and Chrome scheduling traces. Use `combined-input-trace.mjs` under
  `.devshots/fleet/coordination/` with the locked steady-flight probe. Keep the timing of actual
  moving poses distinct from successful draws and validate that player fire occurred.
  The source-stable Intel D3D11 Foundry round 2 diagnostic recorded 101 player shots in the
  21.34 s controlled input window. Over the full observer interval it submitted 5.45 world
  draws/s, with a 267 ms callback p95, 259 ms drawn-motion p95, and 0.38 s of simulation per wall
  second. No intervals supported a signed reversal verdict. The renderer trace reported no data
  loss. The capture ran Chrome tracing and a worker CPU sampler together, so compare only with a
  matched run and establish absolute live cadence without these observers. The raw worker report
  assigned its first unsampled 4.21 seconds to squad merge. Correctly timed samples give that
  function 265 ms (0.89%). Artifacts are in `.devshots/main-thread-profile/combined-input-trace/`.
- `b30d3e7d4070` gives each posted catch-up wake a one-shot timer for the same pending operation.
  In a deterministic loss injection, the old worker remained on one tick through two seconds of
  foreground heartbeats with no outstanding ACK. The fixed clock recovered after two fixed-step
  periods. The delayed task could not step again, and pause and shutdown still cancel pending work.
  This mechanism has not been attributed to the retail recording.
- `44aa8f37f041` fixes a second Ceres visibility gap at dormant-to-live handoff. In the locked
  diagnostic, rock 299 had an admitted root and its center was on screen, yet the root hid for
  279 ms across four samples. Its live row was in the newest completed pack while the displayed
  bracket still preceded its spawn. The existing visible root now keeps the dormant pose through
  that interval for the verified promotion and exact occupant only. The pose, visibility, bridge,
  and pool checks passed. The production worker reported the expected promotion receipt and field
  removal with no journal breaches. Live contact verification is queued under the game lock.
  The separate Helios rescue rock first-build delay remains open.
- `14d03ddb7252` rejects distant compound bodies before precise spawn overlap checks. Four matched
  Foundry worker runs made the same 319 guard decisions, including seven nudges, and finished with
  the same state hash. Mean guard cost was 218 to 154 ms over 144 ticks. Host contention varied
  substantially, so this gives directional owner timing only. The rotated offset-body check
  confirms the guard still detects reachable compound children.
- `63dc0d82086f` reuses CSS viewport dimensions for projection, verified across a high-DPI resize.
  `5be2cb0782a6` reuses the static run schema during validation. `3287b160abe1` aligns arena tests
  with the staged Foundry banks and checks terrain identity, duplicate prevention, and sweep timing.
- Desktop startup source review found no request to minimize during launch, and the isolated probe
  did not load remembered window state. The failed screenshot shows the window already minimized
  at timeout. A subsequent native probe passed Pause and minimize/restore from active flight.
  The timing of the unexpected startup minimize remains unknown.
- `23fa79612f51` reuses the physics owner's snapshot for its pooled impact receipt. The final
  retail hold recorded 20,464 cumulative shed background impact events. Those events had already
  paid recursive serialization before being dropped. A same-payload copy benchmark measured
  72–73 ms versus 5–10 ms for 20,464 snapshots. The traced workload attributed about 118 ms of
  29.8 s of worker CPU samples to this bridge path. Preserve all effect and gameplay receipts
  under the existing policy. The measured cost cannot account for the original freezes by itself.
