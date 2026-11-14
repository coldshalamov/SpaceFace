# Lead handoff — 2026-11-12 ~01:30 UTC (Claude Opus lead out of usage ~3 h)

You are the stand-in lead for SpaceFace (C:\Users\93rob\Documents\GitHub\SpaceFace). The owner is not a coder; you
own quality. Read, in order: `CLAUDE.md` → `design/program/fleet/README.md` → `PLAYBOOK.md` → `PROTOCOL.md` →
`QUEUE.md`. The design authority is `design/game/` (README rulings 1–5 override the docs). The owner's acceptance
card is `design/game/18_SOUND_LOOK_AND_DONE.md` §3 (five ticks: throw satisfying · nothing froze · read everything,
nothing overlapped · always knew what next · want another go).

## Hard rules (shared checkout, other agents live in it)
- Never `git reset/restore/checkout/switch/stash/clean/rebase`, never `git add -A`/`commit -a`, never force-push.
  Commit exact paths: `git add -- <p> && git commit -m "..." -- <p>`. If `.git/index.lock` exists, wait 2–10 s and retry.
- One game/browser at a time: every look/bench/gate goes through `node scripts/fleet/game-lock.mjs run -- <cmd>`.
  Never wrap a lock-waiting command in `timeout` (it counts queue time and orphans the browser).
- No full test-suite runs; run the named test files only.
- Devin never does frontend ([FE] rows). Frontend = Flash for routine, a Sonnet sub-agent where it matters, and
  YOU look at every screen yourself (open the PNGs) before calling it done.
- Workers: `node scripts/fleet/run.mjs <PACKET-ID> <devin1|devin2|devin3|flash|codex> --timeout-min=150`
  (packet file `design/program/fleet/packets/<PACKET-ID>.md` must exist; max 4 active, see `.devshots/fleet/active/`).
  Before launching, set the row to `TAKEN agentN (<backend>)` in QUEUE.md and commit that one file.
  Receipts land in `.devshots/fleet/runs/<packet>.<backend>.<stamp>/RECEIPT.md`.

## Running right now
| Worker | Packet | What to check when it lands |
|---|---|---|
| devin1 | PARK-01 (land parked tender-haul + store sentence; already committed c6fc0a8a, recorded check:sim reference **v27**) | Receipt says `npm run check:sim` passes on v27 and `npm run gate -- --quick` passes; `grep -c contextWheelOpen src/ui/hud.js` ≥ 1 (the parked copy dropped it once); no file outside the parked list changed except the v27 reference/process files |
| devin2 | SWARM-GRIND-01 (Fortify Gravity Beacon crushes light enemies on its body — must gather them in a ring) | The new Node test shows 0 beacon-impact deaths; the player's own Pull power unchanged; the throw look (`scripts/fleet/looks/throw.mjs`) kills line no longer dominated by `beacon:` impactors |
| devin3 | PERF-04 (no shader compiles mid-flight) | Before/after late-compile count (must be 0), opening not >1 s slower, no look/material changed (diff only touches *when* programs compile) |
| flash | MOB-03 (phone: `MENU` word on pause key, first-use captions per control) | **Look yourself**: `ui-bench --phone --viewports=390x844,844x390 --shot=mobile-flight,mobile-stick,mobile-wheel`. Known defect already seen: the `MENU` word spills outside the round pause key — must sit inside it. `node scripts/check-mobile-hud-area.mjs` must stay `within the 25% budget` |
| Sonnet sub-agent (lead's) | G16-04 floating text/notice plates (first commit 2adca87d) | It may die with the lead's session. If its commits don't cover: pad tags out of the top-centre Swarm column, merged SHUNTED words, glass plates on the right-hand notices, class-up plate not covering the round panel at 844x390 — re-dispatch the rest as a Sonnet agent with packet `G16-04-floating-text-and-notice-plates.md` |

## Reviewing what lands (the job)
For every commit: read the diff (`git show <sha> -w --ignore-cr-at-eol`), then check:
- **Events:** a system must not emit another owner's event (PL-02 fired the player's `dock:undocked` for an NPC — ~20 owners
  listen). Any visible effect needs a renderer listener (the sim runs in a worker; `ent.data` set in the sim does not reach
  the drawn entity — see `traffic:nearMissFlash` in `src/render/renderer.js`).
- **Counts:** does one real action fire two events that both get counted (PL-54 double-counted near misses)?
- **Tests:** a loosened bound or changed expectation must cite the deliberate commit that caused it; never edit
  `*.expected.json`/references to pass. Line-ending rewrites (whole file shows changed) → normalise back.
- **Screens:** shoot it, open it, describe it. Overlap, cut-off words, text over the world without a plate = not done.
Fix small things yourself (commit `lead-review(<ID>): ...`); send big ones back as a packet.

## Next work for free slots (in order)
1. **devin (any free):** `PRX-NEXT` (live-bug leftover PRs), then `PLANT-NEXT` (review plants hard — see above).
2. **flash:** `PLANT-RADIO` (repeat), then `MOB-04` [FE] (write its packet from `drafts/MOB.md` §MOB-04 first; phones default to `low`).
3. **When the machine is otherwise quiet (no workers on the lock):** G16-03's leftover UI-budget re-baseline —
   `node scripts/fleet/game-lock.mjs run -- npm run capture:ui-matrix -- --budgets-out`, then `node scripts/check-ui-budgets.mjs`,
   commit only the files it rewrites.
4. **Swarm rounds 1–5 look (lead/stand-in):** `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/throw.mjs .devshots/fleet/looks/throw/rN N`
   for N=1..5 after SWARM-GRIND-01 lands; judge each against the card. `C01-05` stays HOLD until this look is done.
5. Known reds still open: `comms-log-surface`, `special500-comms-backlog` (real assertion failures — diagnose before changing).

## State at handoff (all on master, not yet pushed)
Landed today: phone HUD ≤25 % (MOB-02 b0268fe6 + 5339280b), popup rules (FIX-R4a), hold line (G19-02 + lead 99978f29),
known reds cleared (KNOWN-REDS + lead fixes), plants PL-54/PL-02 with lead fixes, runner fixes, throw look (c96443a7).
**Push** when the gate is green: `npm run gate -- --quick`, then `git fetch && git merge origin/master` (never rebase) and `git push`.

Lessons file for the lead: memory `lead-loop-2026-11-12.md`.

## Stand-in log

### Commit reviews

- `c6fc0a8ac7fc` — fixed. Checked the parked paths and context wheel. The v27 replay passed. Corrected duty at grace settlement in `b044fc412852` and opened the Tender bench captures.
- `4f1b1cb46e51` — accepted. Package line endings normalized.
- `45c4040c59e2` — accepted for contact law. Real Rapier checks passed on Fortify structures.
- `424bab64bb32` — accepted from focused checks. Six of eight Wasps gather in the ring test. Round 1–5 looks have zero beacon kill credits. The public armory placed the beacon and spent 80 cr.
- `c59b44df23dc` — fixed in `a2bdab5386b7`. MENU now sits inside the Pause ring.
- `69a6fab63c4c` — fixed in `a2bdab5386b7`. In both orientations, first-use captions clear the tape, wheel tabs and expanded radar.
- `2adca87ddcc3` — fixed. Opened live Swarm captures with merged words and narrow-window captures of the final receipt and class-up placement. Warning plates and HUD placement started with `57a0a6790425`.
- `8867962b594c` — accepted. Continue uses a stable latest generation across consecutive saves.
- `931c4ffa37f3` — accepted. Both model census request and body reads have a bounded retryable deadline.
- `2e613ca67717` — accepted. Worker restaging invalidates latest-slot cache once on changed save keys.
- `d699dc7747de` — accepted. Decorative gate flare stays fixed and the live Swarm spawn-motion gate passed.
- `39a766463914` — accepted. Full hull and foreign contact leave repair cells for the wounded player.
- `143f7d54ab46` — accepted as instrumentation. Pinned Adventure ran eight arms before the flight crossed into Tethys. Three variants had complete neighboring baselines.
- `76863da5a26f` — accepted. Deferred collider/CCD counts preserve diagnostics. Matched Node timings were inconclusive.
- `e995bf59787f` — accepted from focused checks. Hive wall growth clears hulls and the player's short flight path. The ordinary Hive look remains open.
- `91934e41c3b8` — accepted. Market and saved state matched in 20 pairs. The median cold pass fell from 26.16 to 23.34 ms and the warm pass from 5.62 to 4.37 ms.
- `0b3e81f1f83e` — accepted from 42 focused checks. The fence learns a sustained slow stream and resumes the faster rate without a test reseat.
- `bdd1b2eec033` — accepted. 24 native force receipts avoid 48 body-center reads. Replay comparison passed.
- `6f9b48b15603` — accepted. Test now checks the deliberate paired-momentum law from `51ead0a695b1` and separately enforces the fixed-wall graze cap.
- `35d89e15725c` — accepted. One outgoing sector capture per handoff, identical matched residency and save records, v27 green. Whole-transition timing remains open.
- `d27e25933d8d` — accepted as a follow-up packet. A suspended Continue neighbor can overwrite a newer FULL sector. The experimental schedule stays off.
- `400ad062f147` — accepted. One sensor state read per observer frame, same tactical confidence and restored behavior.
- `c8306a90b07b` — focused fixture accepted. The revised finish detector counts both laps. Veil gained 2.628 s and Tethys 1.443 s. Helios gained 0.248 s against 0.800 s and stays open. The public Veil launch was seen. The anchor use remains unwitnessed on screen.
- `277b592a3f77` — accepted. Periodic autosave skips revalidating its own previous bytes, validates unseen bytes, and rotates both into recovery. 28 focused checks passed.
- `d53cba3fed8d` — accepted. The event trace keeps identical ordered snapshots after wrap, clear and teardown. At saturation the 16 matched Node pairs took 236.15 → 23.61 ms median to ingest 40,000 events. v27 passed.
- `9048c1c60335` — sent back with diagnosis. The standard-rate reel removed 59–74 WU of slack and all paired times stayed equal. Native spring load remained zero. Public damping telemetry had miscredited the stock first-lap holds.
- `656964be9a99` — accepted from focused owner checks. Scored round 30 emits one Regent score start, three acts, each plate once, and one budgeted wing. It waits for that wing before completing. Stock Swarm and v27 pass. The public Gauntlet starts at round 1, so the direct finale look uses a disposable fixture.
- `118151dd395f` — accepted from focused checks. `LANE-FWD~LOAD` failed on `achievement:unlocked` only. The main ledger now forwards its exact unlock payload to the worker Chronicle, whose replay still records one fact. Six focused checks passed.

### Launches and open work

- Launched Codex backend recon and boot deadline workers, then reassigned them to Swarm, physics, presentation, performance and race owners. Launched the Codex economy worker for market and sector lifecycle work.
- Launched Devin1 on read-only `PERF-01-ADVENTURE-RUN` and `PERF-01-SWARM-RUN`. Inherited Devin1 PARK-01, Devin2 SWARM-GRIND-01, Devin3 PERF-04 and Flash MOB-03. No Devin frontend assignment.
- Launched Devin2 on read-only `PERF-01-ADVENTURE-RENDER-RUN`. All six arms completed. Rendering off gained 11.0 fps against neighboring Adventure baselines and removed 65.5 long tasks per window. No-post lost 5.9 fps. The flight evolved between arms.
- Devin1 finished all eight Swarm 20 arms. The first matrix ran at 6–9 fps and 0.58–0.66 sim/wall at baseline. CPU stacks traced 9–11% of sampled baseline main-thread time to the title cinematic over the fight. `883a1ba367ce` retires the cinematic on leaving menu and guards the delayed mount.
- Sent back PERF-04 in `97046bf6f9fd`. The measured pass cut 10 late programs to zero and raised internal first-picture time from 8.9 to 16.1 s. The detached patch was unmeasured at review. The dirty renderer paths belong to the concurrent worker.
- Full shared-tree gate passed import lint, Adventure, Swarm and v27 replay. Exact-source quick gate passed at `366db36709a6` and that batch is on `origin/master`. Early comms and HUD-area probes accidentally ran outside the lock and were rerun through it.
- Exact `c8306a90b07b` passed the full gate (import lint 6 s, Adventure 175 s, Swarm 290 s, v27 22 s) and was pushed to `origin/master`.
- Exact `1cca4431b19e` passed the quick gate, then its full Adventure reload surfaced the missing achievement event. The corrected full gate at `7cf00f80a279` passed (import lint 6 s, Adventure 159 s, Swarm 269 s, v27 26 s), including `LANE-FWD~LOAD` with zero unforwarded events.
- Exact `bfd0978f9be4` passed the final quick gate (import lint 9 s, Adventure 207 s). Published the verified runtime and the incoming UI-reference merge as `327825782b1b` on `origin/master` before the lead's new commits.
- Lead repairs include comms backlog `6db15505ffb9`, mobile quality `94d3cf2dff90`, worker event retention/input reset `52cbcc21e35e`, squad cleanup `ed46120885ed`, idle floor labels `bb7766185116`, owed worker ticks `366db36709a6`, phone receipt/objective copy `6450485b722f`, the desktop latch press `b7ca1a06387e`, and touch tap/flick `9b6018fb3250` and `bc18ca94075d`.
- The title's Circuits verb had the wrong accessible name and subtitle. `aa5e458c669a` now describes racing and time trials. `9319f3c4e1fb` separates floor tags at the same projected position. `8e93ed933682` applies the compact opening objective when the waypoint owns navigation without a tracked mission. Focused checks and the targeted looks passed.
- Opened the inherited G16-04 844×390 captures. Merged words and the class-up plate appeared, but receipts and the voice line crossed the centre callout and the active skin removed the backing. `ac5fde80c227` seats the notices and restores the glass. `1cca4431b19e` finishes the inherited class-up placement and makes world labels respect receipts. The inherited working-tree CSS was left intact.
- In the exact follow-up, `7cf00f80a279` moved the nested Stage voice plate below FIGHT and kept it separate from the two glass receipts. `bfd0978f9be4` keeps the class-up plate clear of those receipts when the centre callout has cleared. Opened the final 844×390 Swarm captures in `.devshots/fleet/fe-pass/stand-in-g16-final-*.png`.
- The pinned Swarm 20 repeat at `1cca4431b19e` recorded no title renderer samples, 11.92 fps, 0.15% main-thread idle, and 0.677 sim/wall. The fresh title still displayed its cinematic and the Circuits button entered the public Veil race. Opened the board and grid. Live Cold Wake use remains unwitnessed.
- The separate Swarm 20 compositor capture showed an active Yardmaster round. All 97 callbacks over 10.06 s had the title cinematic closed. The Yardmaster's long lesson is still drawn directly over the world.
- The locked Tender bench showed the selected contract, preflight, completed receipt, and tracked flight objective. The opening 47-A waypoint text fits both phone orientations with no tracked mission. A settled 844×390 touch bench measured the combat warning clear of Gun and Tether.
- The public Fortify route placed a Gravity Beacon at the first socket and showed the 80 cr deduction. Round 2 reported the placed body in all 35 samples, with up to three slow hostiles in the ring and zero beacon kill credits. The beacon remained outside the captured view. The ship-scale ring look is still open.
- Opened the scored Regent fixture captures after the loading veil lifted. The authored `gauntlet:w30` score started exactly once in the run. The boss voice line crosses the left round panel at 1280×720. The scored Gauntlet still needs the measured voice lane used for Swarm. The fixture seeded round 30 in a disposable in-process run.
- Public phone Swarm reached round 1 and emitted one real tether latch. The attachment was gone at the planned flick, and the probe produced no throw receipt. Opened both captures. Current live touch throw and physical iPhone play remain open.
- `60c93d93aae0` updates the WebKit receipt fixture after the deliberate Adventure glass rule in `6db9d8455379`. Both receipts cleared all touch controls in four cases. Opened all four PNGs. The 390×664 left-handed layout at 1.6× still puts the first-use steering caption over the edge of Tether.
- Merged `9420bc6354b6` after it advanced master. The only incoming changes were the two UI-budget reference files. The separate UI-budget check remains `baseline:stale` on seven newer UI owners. A quiet re-shoot is still due. The latest unpinned PERF-04 attribution listed three late keys, including the rigid opaque specimen and keyed asteroid instances. PERF-04 remains in REDO.
- Remaining targets include ≥30% idle and ≥0.98 sim/wall in Adventure and Swarm 20, steady 30 fps on a phone, physical iPhone play, satisfying live Massline kills, and the owner's full five-item card. C01-05 stays held. Pinned Adventure settled at 0.96 sim/wall with <1% main-thread idle. The first 390×844 live route passed 33 input/UI checks and submitted about 19.5 world frames/s.
- The separate Touch Guide capture remained queued behind the active PERF workers at handback. The run was stopped while it waited for the game lock. The changed flick instruction still needs its PNG look.

### Follow-up after the owner asked Codex to continue

- Codex used its three existing workers for launch and renderer reliability, authoritative control and physics, and gate and world integrity. Claude stayed open. The paused renderer, plants, and fleet work stayed with their owners. Shared coordination is in `.devshots/fleet/coordination/CODEX-SWARM20.md`.
- `2a3a200a227e` — accepted. Reproduced Windows optional Electron migration spawn failure. Browser launcher continues to the server.
- `d2246916c4ce` — accepted. One pre-commit desktop navigation retry on the original window and save origin. Opened the public desktop route in an isolated profile. All 18 checks passed, including Save and Continue.
- `e8731ad46467` — accepted. A drill losing its Line on transfer, recovery, or Anchor Kick sends terminal cancellation and releases the input block.
- `9ebd205fdf1c` — accepted. Recovery clears the defeated hull’s queued taps and Travel Burn. Ordinary focus-loss taps still work.
- `c0a339da2876` — accepted. A returning heartbeat discards the hidden interval even when it arrives before the throttled timer.
- `398cffbec9f2` — accepted. A superseded jump stops without a false arrival or autosave. Tested re-entry on exit and on enter.
- `c959e151f352` — accepted. Circuits player-truth requires the chosen active race in its own sector.
- `754a74c0d275` — accepted. Both authority lanes share the racing grid operation and check world and mission ownership before relocation.
- `7eca31f33910` — accepted. A stale grid exception preserves the newer flight and its mission. A still-owned failure retains the ordinary rollback and exit.
- `945a87218199` — accepted. The quarantine check now goes through actual restore and New Game completion. A receipt alone still leaves it armed.
- `9bbf1639535e` — accepted. The Swarm gate reads a fresh verdict from its own invocation. Missing or invalid boot evidence fails closed.
- `886cc544d2d9` — accepted. Fixed a reproduced Windows standalone gate spawn failure. Normal failure receipts survive synchronous spawn errors.
- `9328b3f2a727` — accepted. Manifest declarations and runtime parity run in static CI. All reachability failures in the dirty tree were untracked plants. The tracked inventory passed.
- `cf8c6a428ac8` — accepted. Time-scale audit recognizes diagnostic scratch writes while rejecting direct and aliased live writes. Launch policy passes.
- `d16117f5a7c6` and `bee71fa361dd` — fighter retro housings instance through existing pools on fresh and cached ships. Stock neutral metal and independent heat parts stay intact.
- `6e5b34502629` — accepted. One stale material key leaves that leaf direct while safe peers can publish. Focused guard and lifetime tests passed. Separate live gain remains unmeasured.
- `8861ea0e89ce` — opened both round-20 captures. Pad labels cleared the speed dial’s overflow labels in the captured frame.
- `ca5b22cc2cea` and `5339959fff62` — paired probe reports successful world submissions and hitch tails. The steady worker route honors stationary input.
- `9a72a8f926d9` — accepted. Conservative rejection skips distant spine checks. All 720 native queries matched, and focused median time fell from 81.09 to 25.12 ms.
- `597688dd0250` — target combat runtime reads fell from 17,280 to 2,592 across 12 dense sensor batches. Contact hashes matched and 28 focused checks passed.
- `1751dcdc1dd6` — accepted. Inactive Lantern Ward stops scanning for its obstruction during Swarm. Ordinary Ward contact credit is unchanged.
- `7433695cfdf8` — accepted. Swarm run validation stays off receipts without owned debris. Valid endpoint order and fracture rules passed.
- `b3efc6569a71` — accepted. Field admission skips force coupling reads until needed. Matched Node CPU fell 14.8–15.6% for the force fixture. Commands, order, and native physics frames matched.
- The locked same-flight A/B/B/A at round 20 measured 9.39 → 11.71 successful world submissions/s, 150.2 → 116.7 ms rAF p95, and 48.9 → 25.2 gaps over 100 ms per 10 s. One 249.6 ms gap remained. Source was stable. Opened both captures in `.devshots/main-thread-profile/codex-swarm20-retro-neutral-ab/`.
- The worker’s median simulation step was 25.14 ms. Its 15-second window showed no heartbeat hold or backpressure. Physics was about 42% of the sampled simulation work and tactical AI about 24%. The paired worker follow-up isolates the later changes.
- The paired worker follow-up used two launches under one lock with stable sources and matching starting populations. Sim/wall rose from 0.743 to 0.783 and median step time fell from 17.61 to 16.45 ms. Shed ticks fell from 304 to 257. World submissions stayed near 13/s, p95 callback gap stayed at 100 ms, and p99 rose from 117 to 133 ms. See `.devshots/main-thread-profile/codex-swarm20-worker-after/backend-comparison.md`.
- Locked full gate passed Adventure, Swarm, and v27 at the integration checkpoint. The Circuits public route confirmed Practice — Textile Belt in its authored sector, steering, and 12.5 sim seconds of play. Overall player-truth was INCOMPLETE on SwiftShader frame time, readability, backdrop coverage, and edge markers. Opened the race capture.
- After the later backend changes, import lint and all 20 v27 replay repeats passed with the original hash.
- A later bracketed diagnostic put the remaining HUD cost at roughly 4.13 world submissions/s. Lowering the internal render scale gained 0.95 submissions/s and worsened the p95 gap by 16.56 ms. Both diagnostic arms restored shipped display settings. See `.devshots/main-thread-profile/codex-swarm20-remaining/report.md`.

- `03f6df649fb1` — accepted. Successful redraws, authoritative snapshot age, and moving mesh staleness now have separate counters.
- `9e4b263427ba` — accepted. Same-time worker snapshots keep an earlier distinct pose for interpolation. Recovery within one scene can no longer rewind the playout clock after a long frame.
- `47dea7b2bb15` — accepted. The mesh no longer invents a 5.79 WU lead and retreats during a measured forward slowdown. The focused checks preserve real reversals, turns, teleports, and stopped convergence.
- `6bd5472f4ad0` — accepted. The next uncovered world submission releases the launch clock. Real pipeline readiness and the existing shell cleanup receipt still govern their original steps.
- Matched locked Adventure New Game launches with held thrust put the first new tick after visible reveal at 800 → 117 ms and the intervening HUD updates at 15 → 2. Successful world submissions were 14.53 → 13.78/s, callback p95 remained 117 ms, and post-reveal fresh tick p95 was 150 → 133 ms. Both straight flights showed zero signed backtracks. Opened both captured PNGs. See `.devshots/main-thread-profile/codex-adventure-motion-after/paired-report.md`.
- Remaining sustained motion limit: the healthy Adventure worker delivered 280 of 325 pose advances in four-tick groups. Median batch work was 63.75 ms, main apply 1.59 ms, with no heartbeat hold or ACK backpressure. An additional wake diagnostic is in progress. The earlier pad-layout diagnostic stopped at round 19 rearm and produced no measurement or source changes.

### Follow-up on the sustained turn

- `bded829e61e4` — accepted. The smoother now limits only visual correction offsets. It preserves powered acceleration and turning and absorbs a backward correction after a slow frame. All 79 focused motion checks passed.
- `f583ad97a8bf` — accepted. The ordinary Electron motion probe records the actual authority, effective origin, fence pose, and rendered mesh. Opened the locked candidate PNG.
- The locked Adventure turn comparisons showed drawn travel rise from 20.3% to 99.8% of simulation travel during the powered turn. Apparent reverse steps fell from 24/431 to 0/378. Moving samples after straightening showed median separation fall from 1008.6 to 22.3 world units. The worst callback gap grew from 417 to 467 ms. The tether did not latch. See `.devshots/world-motion/codex-motion-turn-fixed/paired-report.md`.
- No new Devin workers launched after the lead resumed dispatch. Codex's three workers above also inspected worker scheduling, native contact/proxy cost, and activity classification. The latter two proposed savings were small in the stored profile and stayed out. The ignored worker wake A/B passed Node marker and task-delivery checks. The live run was deferred while the three-viewport First Hour walk held the shared lock. Run it with `node scripts/fleet/game-lock.mjs run -- node .devshots/fleet/coordination/run-worker-wake-ab.mjs`. No scheduling change landed.
- `f70afee6f6bf` — accepted. A live game-lock owner keeps its lease beyond 30 minutes. Focused regression proved the old timeout would call a live capture stale. An exited owner is still recoverable. Six fleet gate checks passed.
- The active First Hour walk kept its original process and label. Its ignored lock timestamp was extended once to protect it from the seven pre-fix waiters until their own 60-minute caps. Those wrappers still use their loaded code. New invocations use f70afee6f6bf.

### Full-game quality pass after Opus paused

- `7276bf03b3b6` — accepted. NPC contact leaves Swarm perks for the eligible player.
- `0d5cef7d5fe7` — accepted. A held-enemy throw survives both mouse edges arriving in one worker step.
- `31abed5f77d1` — accepted. Current saves store onboarding beat keys. Old numeric saves use the original ordering.
- `5eefa7b4f1e4` — accepted. Both Asteroid Mill grinders render at the active cone fields.
- `458437e01bcc` — accepted. Legacy 47-A guidance returns in Helios and stays out of Ceres.
- `4c7ddc8e8995` — accepted. The stunt fixture exercises the callback wired by `9dec955de450`.
- `67da11dea453` — accepted. Docking at the deadline fails expired delivery before cargo or rewards settle.
- `e59f0a736dd9` — accepted. First berth defers flight drills while paused and retains completed-beat progression.
- `6eb815abf04e` — accepted. The production worker bridge delivers the complete Cryo and Storm room.
- `223a1e915e42` — accepted. Gauntlet off-frame samples fell from 88 of 629 to 0 of 631 on the matched route.
- `036f4e7bd8a9` — accepted. Arena machines and Storm cues track floating-origin changes.
- `a721496a9d1f` — accepted. One real round-three enemy throw produced one QUICK THROW receipt and zero self-slings. Opened the PNG.
- `6531c294c20e` — accepted. Fast initial latch and rock cut clicks retain both edges and the intended attachment.
- `237f27f6d70e` — accepted. The Adventure Star Map hint stays out of survival and remains available in Adventure.
- `43a250ad1db8` — accepted. The five-seed Cliff fixture follows the current first berth without changing the retention assertions.
- `16f714003237` — accepted in 25 focused lifecycle, pool and residency checks. Delayed death removes only the predecessor root and preserves the successor's admission and pool claims.

- Reused Codex workers `backend_recon`, `boot_deadline`, and `economy_perf` for independent owner investigations and focused repairs. No new Devin launch. Claude stayed open and paused renderer and content changes stayed intact.
- The locked fleet gate before the recycled-root repair passed import lint, Adventure boot, Swarm boot and the v27 deterministic replay. The public Gauntlet camera comparison passed camera and controls but failed on seven first presentations. The existing trace cannot distinguish late admission from projection or sampling for those seven. SwiftShader frame time and readability were ungraded.
- `3b5000fd86b4` — accepted. Swarm 20 default HUD obstacle scans fell from 94 to 46 per 20 s and measured selector work fell from 1,165 to 513 ms. Submissions stayed at about 12.3/s and callback p95 grew from 117 to 133 ms in this pair. Opened both screenshots. Yardmaster text clipping and overlap with the grab cue remain.
- `7bba7e4a80dd` — accepted. Already-owed worker ticks use bounded task wakes while the heartbeat is fresh. Future deadlines, timer fairness, and generation cancellation are preserved. The Node worker uses the raw token to avoid its DOM accessor failure. The unchanged real slow-physics test and four other focused clock checks passed.
- Swarm round 20, one locked Intel D3D11 Electron flight, timer/message/message/timer. Mean world submissions rose from 13.39 to 13.93/s, fresh poses from 11.18 to 12.82/s, and sim/wall from 0.786 to 0.887. Callback p95 fell from 116.7 to 100.0 ms and gaps over 100 ms fell from 19.1 to 7.0 per ten seconds. Moving-mesh gap p95 fell from 110.9 to 93.8 ms. The fight evolved between windows. The separate pinned before/after pair also improved motion and hitches. Both diagnostics still show substantial cadence loss. See `.devshots/fleet/coordination/quality-round20-performance.md`.
- Opened live screenshots for Asteroid Mill, Cryo Drift, and Storm Lattice. The worker mounted the correct room parts and applied the inverse floating origin, and the Adventure hint was absent. The shortened public Gauntlet follow-up kept the ship in all 198 graded frames and recorded a Wasp death with raw-ID reuse. That reuse went to a projectile between samples, so the exact recycled-credit-chip case is covered by the focused lifetime test. The shortened run leaves completion and software frame time ungraded.
- Open work includes whole-game hardware cadence and physical phone play, the seven first-presentation pops from the full Gauntlet run, the Yardmaster instruction collision, and B1 retiring the post-berth drills. B1 still gets immediate acceptance and the sole objective and voice lane. The design calls for contextual practice later in the first hour. The two pre-existing Racing fixture failures and full Circuits validation remain open. No publication.
- Final locked gate at `7bba7e4a80dd` passed import lint (9 s), Adventure boot (192 s), Swarm boot (247 s) and the v27 replay (19 s). Adventure passed all 18 playable checks. The Swarm gate covers boot-critical checks. No game-lock holder remained.

### Whole-game quality pass with Opus on visuals

- `38b32852efe3` accepted. A crashed renderer can quit through native recovery without waiting for a dead save callback.
- `497814d84c4b` accepted. Continue preserves the Anvil approach route around the hazard in the native physics fixture.
- `f07646fe67a7` accepted. Chart courses survive Continue and mission refresh.
- `94ecd46689ca` accepted. Recycled Rapier IDs discard the predecessor's body and velocity.
- `a082946968b5` accepted. A signaled Electron child exit stops the wrapper's readiness poll.
- `276d5367de24` fixed. Circuits fixtures use the live mission dock owner.
- `2024492bf5ab` accepted. Restart re-arms race precision and boost awards.
- `1c905c84edfe` accepted. Save requests during a paid, uncommitted jump preserve the last coherent slot.
- `51cd46eb2209` accepted. Restart clears old ghost splits while retaining the best recording.
- `47580244082c` accepted. Installer restart waits for the normal save acknowledgement.
- `ecf7b829c450` accepted. The desktop launcher removes the inherited Electron CLI mode flag.
- `a32bc900d89d` fixed. The first-hour check runs the shipped onboarding owner and pacing.
- `1a29bf4711d7` accepted. Legacy browser save migration launches Electron in app mode.
- `00fe1054ceb1` accepted. Duplicate desktop launch retains its focus request until readiness.
- `966f2d70f417` accepted. Opening a modal clears queued action edges and held gestures.
- `05ab8a839342` accepted. Circuits Restart retires stale gate announcements.
- `e1512147a913` accepted. Same-seed Swarm and Gauntlet Retry re-arm first-action protection.
- `bab29f9ac002` accepted. The active fleet board now tracks whole-game quality by route.
- `e8ad2e96653f` fixed. The stock Circuits profiler answers First Light through the shared player route.
- `8bde9b72f7f5` accepted. Activity classification collects canonical pins once in all modes.
- `ed9a9ebe6529` accepted. Continue after the first berth directs the player to Weigh-In, and Helios replaces the remaining sealed alloys.
- `ca21b36890ad` accepted. Unchanged scalar leaves reuse wire signatures, with byte parity.
- `8c5e463e88da` accepted. Base storage can take only loose freight.
- `44096fab0953` accepted. The desktop shell recovers when navigation or the first paint misses its deadline.
- `13262e9605e5` accepted. Base fabrication checks loose materials before it spends credits.
- `e0f8ac41727a` accepted. The hull and its anchors interpolate wrapped headings along the short arc.
- `6292f61ccfe4` accepted. Compound contacts read the final receipt point once per body pair.
- `4c32805ffe3f` accepted. Browser launcher probes settle interrupted or trickling responses.
- `bf0a4ea4b093` accepted. The worker keeps bounded station projections atomic.
- `90465f6f912c` accepted. Asteroid workbench construction and lane deposits leave sealed cargo aboard.
- `2f5c69e3b39d` accepted. The locked profiler can use a real held-turn input.
- `f5ecc154d26e` accepted. The fleet board records the current route outcomes and pending checks.
- `1ba4013322e4` accepted. Oversized save batches reject before deleting or writing any slot.
- `3576c855aa3d` accepted. Relay freight settles from the convoy's custody, with normal market refusals intact.
- `6c50040217fe` accepted. A replaced desktop document cannot reuse its predecessor's quit receipt.
- `1aa922156005` accepted. Return to uncovered flight waits for a submitted picture before waking the worker.
- `ae48547c908d` accepted. Death recovery commits the destination before applying any penalty.

- Codex workers `backend_recon`, `boot_deadline`, and `economy_perf` covered shared simulation and save transport, desktop and browser launch, and Adventure progression and custody. No new Devin run. Opus owns visual and UI work. Claude stayed open.
- The four locked Intel Electron runs and screenshots cover Adventure, early Swarm, Gauntlet, and public Circuits. Their moving-world cadence and next checks are in `QUALITY.md`. The turn, foreground return, F5/F9, Circuits Restart, desktop crash and matched performance runs are pending behind Opus's first-hour walk. The stale-write reproduction and recovery-safe repair remain open.

### Backend, flight, and performance follow-up

- `f1ad79d2f8b0` accepted. Defeat and insurance fixtures use normal same-sector berth placement.
- `b78c7a31cd50` accepted. Helios wash retains swept contact results and skips remote geometry.
- `c3e94a199ae7` accepted. Tactical sensor caches follow the live hull through numeric ID reuse.
- `07ce0fff5c04` accepted. A delayed DOM focus cannot override native window blur.
- `ef4e43cbd680` accepted. A listener resetting the bus cannot discard the first new presentation event.
- `280970113e27` accepted. Live HTTP checks cover late upload, late delete, recovery and a dead writer.
- `dfa4e4f95176` accepted. Recovery tracks the correct wreck and waits for the full lot aboard before guiding home.
- `5939abb2cc09` accepted. Defeat preserves partially delivered freight when the remaining units survive.
- `453f0992bb3a` accepted. Staying in Ashfall releases the waiting gate handoff and retains the route.
- `4162156aef77` accepted. Massline skips obstacle preparation for unreachable attachments and preserves the selected target, denials and blockers.
- `91a04da72389` accepted in focused motion checks. Powered turns no longer trigger a long heading lag or continue rotating after release.
- `399bb0ba24c2` accepted. Vael uses one normalized ledger per tick, preserving serialized state and receipts in matched trials.
- `8aef717c4fe4` accepted. Seven plant owners share bounded cursor or station lookups, preserving canonical iteration order.
- `8fd052a4363c` accepted. A disabled stranger can now reach a live station and keeps its rescue receipt while scenery comes and goes.
- `fe46207e4035` accepted for probe wiring. The launcher check answers First Light, the Circuits actor can choose Time Trial, and the turn probe releases its held key.

Codex used `economy_perf`, `backend_recon` and `sim_hotpath` for separate navigation, new plant, and simulation/presentation owners. No Devin launches. Opus retained visual ownership and the live lock during his captures. The main-thread and worker route evidence, patch measurements, and runnable pending checks are in `QUALITY.md`. Node tests confirmed the owner changes. Live acceptance and sustained cadence remain open.

### Playtest pause

- 5faee660d029 accepted. The main presentation read no longer shifts worker-owned poses or writes world records.
- 2be4e430d105 accepted. The interruption fixture uses the shipped Space boost binding.
- e9fd39b0eb63 accepted. Refused native physics startup now reaches Retry/Back.
- 052899aebd10 fixed. A patrol side impact cannot file a player warrant. A real ram still does.
- a73aee08fa79 accepted. Matched 60-ship native steps took 326.3 to 287.5 ms over 360 ticks. Replay v27 matched.
- e8cce95972ea fixed. Temporary Circuits skip Adventure story and traffic and restore campaign rules on Continue. Fifteen focused checks passed.
- Workers in this slice were the existing Codex backend_recon, economy_perf and sim_hotpath agents. No Devin worker was launched.
- Windows crash recovery, Quit and relaunch passed, as did two public F5/F9 cycles and the live turn/release comparison. The next work is the intermittent native hidden/minimized first-picture hold, cold Ceres Continue asset admission, Swarm gate rerun, and post-fix Circuits F8 and finish. The active board and QUALITY.md carry the evidence and commands. Codex game probes have stopped for the owner's playtest.

### Stand-in log — recorded flight freeze and obstacle visibility

- `60cd8a4cdc35` accepted. Native contact fences stay with the worker, with unchanged impact consequences.
- `5c70500d527f` accepted. Shared-memory reply acknowledgements release before queued authoritative work.
- `aa5b5517ed0c` fixed by `da56112e4fba` and `386eebfd9305` after a live ring overflow. The diagnostic ring binds consistently, and ordinary controls and replies use ordered messages with shared numeric journal slots.
- `da56112e4fba` accepted. Active input bursts no longer fill the four-cell command ring.
- `11d52c8c7608` accepted. Deterministic trace allocation stays out of the release runtime.
- `37e2ce7e8425` accepted. World motion holds record a live worker watermark when it is available.
- `7dfe58b4ac73` accepted in the dormant admission fixture. A direct live pre-contact draw for a dormant obstacle remains open.
- `14faa9c79438` accepted. Journal cursor progress uses a cumulative ACK without requesting another command reply.
- `6bb94413ed9d` accepted. The native Foundry replay kept the original hash and sensor contacts after the perception change.
- `386eebfd9305` accepted. The regular flight route retains shared numeric data without the fixed-size JSON message ring.
- `6a82e2bf459b` accepted. Clock hold and stale ambient backlog tests now observe the intended behavior directly.
- `f4de88a6214a` accepted. Floor chips measure before placement and keep separate seats. Opened the live Foundry capture.
- `07df4340e225` accepted in focused checks and a Ceres flight. Rocks keep a direct draw path during pool growth and release their retired instance before ID reuse.
- `4496a4a001a7` accepted. Piggybacked clock ACKs update the same diagnostic watermark as standalone ACKs.
- `13d2a084fd8c` accepted. The asteroid probe matches draw receipts to the old or current batch and records missing-root projection inputs.
- `2c0f3ecd0856` accepted. The drawn player no longer jumps backward when the same live occupant survives a journal rebuild. Hard pose boundaries still reseat.
- `64678c44a573` accepted. A foreground heartbeat recovers valid lost reply credits before the three-second watchdog. Wrong lifecycle and future watermarks remain rejected.
- `1c0bc6a49b6d` accepted. Synchronous entity view updates avoid redundant slice-clock polling.
- `8566b710688a` accepted in focused checks. Temporary Circuits retain gate guidance and suppress campaign tracker and radio UI.

Codex used `sim_hotpath` for perception and worker regression fixtures, `backend_recon` for the pose rebuild and dormant-rock review, and `economy_perf` for projectile-order investigation and asteroid pool ownership. No Devin workers launched. Opus-owned working changes are still separate.

The locked Supply Pod pair confirmed thrust, turn, and primary fire. Draws rose from 12.0 to 20.2/s and drawn ship gap p95 fell from 129 to 85 ms. The original multi-second freeze did not recur in the comparison. Sustained cadence, long missing-root cases, live dormant contact, and complete save/flight, Circuits, and mobile acceptance remain open. See [the checkpoint](QUALITY.md) for exact runs and artifacts.

### Stand-in log — world ledger and desktop runtime

- `0dbde54a8fc5` fixed. Dormant asteroid poses reach the production render table before contact; identity, grid movement, retirement, and worker reply coalescing passed focused checks.
- `0427216c1975` accepted. Direct dirty-ID drain replaces repeated roster walks. The 720-tick aux parity probe was clean. Its independent transport budget remains red. A 6,000-row matched owner benchmark measured 1.66 to 0.012 ms median.
- `994adcf6e5de` fixed. Paused ACK housekeeping publishes any newly observed ledger deltas instead of consuming them silently.
- `2562d286fd30` fixed. Electron reports the ready window's current state even when native show is absent. The injected regression failed before and passed after. Real intermittent startup stalls remain open.
- `f7294f59cb55` accepted. Pack shader probe uniforms once; live FPS effect unmeasured.
- `81f1eb4c31ef` accepted. Reuse immutable compact collision bounds. Native Foundry combat parity held.
- `64092aa260a1` accepted. The existing profiler can capture the same workload in renderer cadence, worker CPU, and Chrome scheduling.
- `15f2694cd228` accepted. The profiler can hold the public fire control alongside thrust and turn.
- `006b297c58d0` accepted. The active queue and quality checkpoint retain the commit IDs and incomplete routes.

Workers were Codex backend_recon (Three.js hot path), sim_hotpath (Rapier and domain mirror), economy_perf (shared-clock tracing), and boot_deadline (Electron startup and SwiftShader fixture). No Devin worker launched. Next live checks use the shared lock for Ceres pre-contact, combined-input motion cadence, and Adventure startup, pause and restore. The original seconds-long freeze, sustained cadence, full load/Continue coverage, and broader route acceptance remain open.

### Stand-in log — clock wake recovery

- `b30d3e7d4070` fixed. Dropping one accepted catch-up message held the old worker on one tick through repeated heartbeats. The same wake now has a two-tick fallback, and late delivery cannot execute it again.
- `3cf7ffb44e01` accepted. Records clock fault injection and its proof boundary.
- `f2c2f8b2f9f5` accepted. The production Ceres worker supplied 525 dormant rows and verified one transfer from field projection to a live body.
- `28bf6c3d3d76` accepted in syntax and scope review. The dedicated locked Ceres ram route collects the before-contact PNG.

The 47-A deterministic replay matched its baseline over all 20 repetitions, and source imports passed. The native Adventure follow-up, combined-input trace, Ceres ram picture and SwiftShader fixture use the existing game lock. Opus's visual/UI batches continued. The recorded retail freeze and cross-mode frame pacing remain open.

### Stand-in log — stress playback and Ceres promotion

- `e3623802e1d6`, `e40e745c7fe0`, and `70a2beea992e` accepted. The failed Adventure run had a genuinely minimized native window. The next run entered flight and resumed from Pause and native minimize. Startup minimize timing remains open.
- `14408fb59bef` fixed. Warm the fixture through the real HDR target. All three locked pixel checks passed at the original tolerance.
- `ce512bc3625e` fixed. Drop the first unsampled worker profiler interval from owner timing.
- `8e07e2006e4e` accepted. Record combined-input trace and initial Ceres frame visibility.
- `b53f3b894584` accepted. Stage the diagnostic within ordinary flight range and use live controls to reach contact.
- `63dc0d82086f` accepted. Projection reads the current CSS viewport without repeated layout dimension reads.
- `5be2cb0782a6` accepted. Validate runs using the reusable schema key set.
- `3287b160abe1` fixed. The arena fixtures now test staged growth, retained rocks and release clocks against authored Foundry behavior.
- `14d03ddb7252` accepted. Compound overlap screening preserved all 319 guard outcomes and the final simulation hash in each of four Foundry arms. Average isolated guard time fell 218 to 154 ms under variable host load.
- `44aa8f37f041` fixed. The already-visible Ceres rock remains drawn until the delayed presentation bracket reaches the exact live promotion.
- `d99ec3d67d1b` accepted. The worker bridge distinguishes a real field promotion from a reused numeric ID.
- `e1c8bd6314a2` accepted. Current quality ledger links the fixes and unfinished routes.

Codex used sim_hotpath for matched physics guard runs, backend_recon for the staged terrain fixtures and the delayed fence reproduction, and boot_deadline for the native startup owner review. No Devin workers launched. Opus continued the visual and UI capture batches.

Source imports passed and the 47-A deterministic replay matched the expected hash in 20 of 20 runs. The locked Ceres contact and lightweight combined-input checks are queued behind Opus captures. The original retail freeze, motion cadence across modes, startup minimize timing, Helios first-build delay, live load/Continue, and full hardware acceptance remain open. See [QUALITY.md](QUALITY.md) and [QUEUE.md](QUEUE.md).

### Stand-in log — retained reply recovery

- `23fa79612f51` accepted. Serialize the pooled native impact through its own snapshot. The nine contact checks passed with the same wire fields.
- `01707c0e6cc7` accepted. Retain impact copy and live-profile costs.
- `1c7225d24604` fixed. The Ceres diagnostic previously counted remote activation at 1,230 WU as contact. The opened PNG and empty target timeline disproved contact. Stage against the live drift position and classify remote activation separately.
- `617dae1b6f3a` accepted. The locked lightweight run fired 189 shots at 8.23 draws/s, 188 ms p95 moving hull gap and up to 600 ms stale ticks. Worker advanced 20 ticks during a 717 ms presentation reply gap. Opened flight PNG and confirmed graceful Electron cleanup. Opus's Adventure diagnostic measured 10.5 FPS outside captures and did not reach docking.
- `db9ecd228b47` fixed. The first freed reply credit can send a provably contiguous, same-lifecycle retained reply immediately. Regression failed before and passed after. The 32-test worker clock suite passed.
- `13cd60aa8784` accepted. Record the first-credit fix and its separate live comparison.

Codex used sim_hotpath for impact projection and backend_recon for the production worker reply-credit reproduction. No Devin workers launched. The corrected Ceres run and matched native reply comparison are queued under the existing game lock. The latest stress route still fails the smoothness target. The onset of the 717 ms reply gap, original retail freeze, Adventure docking, live load/Continue, and wider release acceptance remain open.

The earlier handoff commit `33def1ced2dc` also included two Opus-owned paths that entered the shared index during the commit. The files remain intact in history. Opus's coordination note is in `.devshots/fleet/coordination/CODEX-SWARM20.md`.

### Stand-in log — matched flight result

- `ec45a1f5f3d2` accepted. Opened both matched Electron pictures. During 204 and 208 shots the combat windows drew 9.72 and 10.55 frames/s. Maximum moving hull gap fell 525 to 248 ms. p95 stayed near 150 ms. Both runtimes closed cleanly.
- `1a37fa62f9bb` fixed. Check the nested world RPC relocation receipt.
- `c6c147bdd3b4` accepted. Keep sustained cadence and ordinary-route checks open in the fleet queue.
- `de41835f905e` accepted. The corrected Ceres run observed target activation at 63 WU. No target draw was stamped and no before-contact PNG was produced. The contact PNG was opened. This does not close Ceres visibility.

Completed the two previously queued game-lock checks. No workers launched during these captures. The next work is the main-thread and worker step budget across Adventure, Swarm, Gauntlet and Circuits, the Ceres target's actual draw ownership, and live load/Continue. See [QUALITY.md](QUALITY.md).

### Stand-in log — relocation continuity

- `9dc2491bfc1d` fixed. An authored same-sector relocation advances the render pose epoch. The real fence fixture confirmed the relocated ship reseats immediately while ordinary same-life recovery remains continuous. Ten focused tests passed.
- `3bf8ef3490ff` accepted. The locked Ceres run did not establish contact visibility. The target activated 1,227 WU away and was never stamped in view. Helios still showed an 891 ms rescue rock admission gap.

No workers launched during this final capture. Continue from the measured reply and pose timing in [QUALITY.md](QUALITY.md).

### Stand-in log — shared flight performance

- `1e66a7186520` accepted. Shared radius query replay retained exact output and reduced query cost. Locked Adventure did not establish a live FPS gain.
- `fa30330f4048` accepted. Retained opaque batches reuse geometry and skip absent texture checks while still refreshing changed sources.
- `68fb41cd6a98` fixed. Flying rocks classify by their visible footprint. The new boundary check failed on the old code and passed with the fix. Live approach remains open.
- `395256f5ff06` accepted. Foreign cargo stops at the Circuit impact owner filter. Native damage and custody checks passed.
- `745f433d3b66` accepted. Ineligible collision proxy requests skip measured-skin work. Forty-three focused tests passed.
- `9a4c3b27e2da` fixed. A repeated journal acknowledgement cannot restart paused maintenance. Locked Gauntlet Rearm fell from 387 to 63 worker directives/s. Both arms fired more than 270 shots and reached Rearm.
- `aee1b488efe5` sent back to the look owner. Fifteen paired composite cases matched every pixel. GPU timing drifted. `b6735b6bf4c5` restored the active LOOK-04 file after the ownership note was identified.
- `8276b9524eba` accepted. The weapon effects bridge reads the typed projectile lane. The worker fixture verified publication and retirement.
- `ef197109382d` reviewed. The fin capture shows panel detail and readable trim in the isolated view. The compiler removes marked neutral defaults; asset and manifest hashes changed together. Ordinary in-game fitting is the visual owner's check.
- `5d2ef99c92eb` reviewed. Valve UVs cover both triangles and preserve shared texture lifetimes. The available flight capture is too dark to establish the authored texture read.

Launched Codex `shared_sim` (spatial hash and activity), `shared_render` (retained batches and bloom fixture), and `cross_mode_probe` (public flight harness and Circuit impacts). No Devin launches. The ongoing cadence defect affects Adventure and Gauntlet. Continue with fixed-step physics and tactical AI, plus the HDR world draw and admission work. Open items include the original retail freeze, drawn rock approach/contact, Circuits scored finish, Gauntlet Retry, and packaged launch. See [QUALITY.md](QUALITY.md) for measurements and exact captures.

### Stand-in log — shared flight follow-up

- `1c5e7bdfa661` fixed. Native physics and projectile sweeps now keep separate static dressing rosters even when their version numbers match. The regression reproduced the wrong roster on baseline.
- `a8762fb12660` accepted. Helios traffic resolves the claim face by authored slot. The 47-A replay and reload matched 20 times.
- `f09dfb9255bb` accepted. Authored instance pools reuse their per-owner frustum result and retain their submitted range. No live cadence gain established.
- `cf1508fed30a` fixed. Background admissions now yield to flight and input at the task scheduler. Adventure p95 moving-mesh gap fell from 170 to 150 ms, with a worse maximum gap in that pair.
- `2daf823dbc0a` fixed. The existing buffer test now verifies the 30 Hz field surface owner at both skipped and active callbacks. All 59 related tests passed.
- `5105aa79edac` reviewed. Casket Worm geometry and material ownership were inspected and the lock-protected production camera PNG was opened. Fine surface detail remained hard to see at the production camera distance. Visual acceptance belongs to the lead.

Reassigned Codex `shared_sim` to fixed-step and economy profiling, `shared_render` to shared render traversal, and `cross_mode_probe` to the dressing roster fix. No Devin launches. See [QUALITY.md](QUALITY.md) for pinned comparisons and unfinished routes. The fixed-step and renderer costs still block sustained smoothness.

### Stand-in log — contact receipt follow-up

- `ba792dafb6ff` accepted. Each compound contact pair keeps one private receipt through the native event drain, preserving the strongest closing normal and latest impact normal and point. Forty-six focused checks passed. The live cadence effect is unmeasured.
- `0508cfe642e0` reviewed. The Lark's release GLB and render package dropped by roughly 87 kB apiece. The locked close and chase PNGs show the panel seams and distinctive cyan bands. The lead owns the visual sign-off.

Open performance work remains in the fixed-step owners and the world draw. The shorter worker budget and alternate graphics backend did not meet the motion target. The original retail freeze, packaged launch, and outstanding player routes remain open on [QUALITY.md](QUALITY.md).

### Stand-in log — fixed-step, AI, render and retail motion

- `58a04236c4cb` fixed. Later foreground beats can recover applied worker reply credit without repeating the diagnostic request.
- `125b067d3fc0` accepted. Matching native poses and contacts with 15–18% lower measured step cost in two 112-body fixtures.
- `424f02858011` accepted. One optic scan and pilot-only squad contact pruning preserve firing and squad outcomes in focused checks.
- `b6c33eff608c` accepted. Warm VAO validation and clip-Z sort do less work. The direct vendored render fixtures passed.
- `f0b392fabbef` fixed. A server-only UI bench no longer occupies the exclusive browser gate. Released its lease after confirming no browser clients and left both server processes and Claude running. The FIFO resumed, and the server still answered HTTP.
- `d8c809bcd1fb` fixed. The Gauntlet probe uses the current public title action behind More.
- `315783bb183a` accepted. Normal worker replies no longer clone and replay full per-tick input data. The live worker fixture preserved scalar attribution and the observer fixture still delivered input rows.
- `b401c3a7dea3` accepted in focused tests. Exact-target pipeline admission skips the full-scene visibility rewrite on its eligible path. Live timing is pending.
- `9b375798426e` accepted. Aligned the worker note with the optional input stream.
- `b93310058ff0` accepted. Pooled live AI contacts reuse the canonical copy schema. All 42 focused checks passed.
- `772c5cb9a60f` accepted. Recorded fixture numbers and remaining acceptance in [QUALITY.md](QUALITY.md).

Codex launched `physics_cut`, `ai_cut`, and `render_cut` for disjoint owners. No Devin launches. The second perception candidate that fused expiry and snapshot walks was dropped when it showed no measurable win. The before/after Electron command is queued under the game lock for normal Adventure, Swarm and Gauntlet entry using immutable overlays for changed runtime files and default Chromium throttling. The multi-second retail freeze, sustained flight cadence, Ceres contact visibility and full release acceptance remain open.

### Stand-in log — locked flight and probe repairs

- `81eb6607562d` fixed the obsolete Adventure text selector. The next locked attempt found the painted title door has a zero-height native button.
- `5a232f785fe0` accepted. Locked Swarm and Gauntlet confirmed simultaneous thrust, turn and fire, advancing simulation, and actual mesh travel. Reviewed both Armory and both Rearm captures. Swarm active draws went 7.47 to 8.54/s. Gauntlet went 15.30 to 13.20/s.
- `eabff4d97c84` accepted. The locked Supply Pod candidate fired 342 shots and drew 10.76/s in active round two. Opened the flight PNG. Baseline was blocked by the loading overlay.
- `5ef7f502fe2f` accepted. Meshless projectiles keep the existing weapon VFX stream and no longer duplicate impossible-to-apply vitals rows. Seven focused checks passed.
- `995d9b18c46f` accepted. Updated the three quality queue rows with the player-route evidence.
- `9581f70f192c` fixed the probe to reach the native Adventure action by keyboard when its rendered hit box collapses. Reported the title layout and clickability defect to Opus with locked before/after screenshots. The lead owns its in-game repair.
- `387aef15e727` fixed a race in the First light playtest actor when its control vanished during the bounds request.
- `1a5f67b71bb5` accepted. Regression covers the closing-confirmation race.

No additional workers launched. The ordinary Adventure and diagnostic Foundry before/after retry is `shared-work-cuts-adventure-keys`, queued under the normal lock. Current path and results are in [QUALITY.md](QUALITY.md). The seconds-long retail freeze and stable cross-mode frame pacing remain open.

### Stand-in log — overdue reply recovery and final cross-mode pair

- `be33993428a6` accepted. Recorded worker step saturation with an independent worker sample.
- `513bd2cd3a19` fixed. Resume Adventure launch after a late First light prompt.
- `80381af86296` fixed. Foreground beats claim overdue fixed-step wakes and invalidate the delayed callback.
- `a82d2b3f97b7` accepted. Recorded the matched Supply Pod results and their motion/cadence trade-off.
- `1af30d8c0b99` accepted. Deferred run validation path formatting until invalid values.
- `167a58ad83c2` fixed. Wait for an animated First light control to become actionable.
- `0b0c636cbdc3` accepted. Recorded public Adventure flight and updated the active quality rows.
- `bda9a1b2fa2f` accepted. Field particles publish once with identical packed output in the focused fixture.
- `24dd46889364` fixed. A foreground beat can expire lost reply credits while the watchdog timer queue is delayed. All 35 worker clock tests passed.
- `ed036f7a2fe7` accepted. Check moving craft before rechecking rocks when a retained activity view might be invalid.
- `14f449de0654` accepted. Recorded the latest bundled Foundry playtest and the focused work reductions.
- `50e4420b91af` accepted. Recorded the matched Adventure and Gauntlet pair. Personally opened all four captures and the final Foundry flight PNG.

Reassigned the Codex workers `ai_cut` and `render_cut` for a second pass. No additional worker accounts launched. The retail reproduction used the default profile, while all locked interventions used disposable profiles. The original multi-second continuing-draw freeze remains unconfirmed after the fixes. Measured worker throughput and live rendering costs still exceed budget. The lead has the title door and overlay observations. See [QUALITY.md](QUALITY.md) for the latest before/after movement and footage receipts.

### Stand-in log — worker hot paths, launcher recovery, and flight holds

- `87e3cb31bfc2` accepted. Read live collision material and body mode without allocating a full substance record. Matched deterministic poses, collider choices, and contacts.
- `7617ae84a1d1` fixed. Reused worker domain metadata and repaired the expanded-to-collapsed-to-expanded lifecycle crash.
- `857afa9d90eb` accepted. Native impact receipts skip reference traversal. Synthetic events, storage ordering, and listener context retain their existing behavior.
- `123143341f73` sent back after the locked Adventure pair drew slower. `3ba59ed7f8cd` fixed the regression by removing the candidate.
- `c4da41846047` fixed. Retry a renderer death before navigation settles once within the same deadline and wait for fresh first paint.
- `abb428bcdcd5` fixed. Stop drawing field auras beyond authored contact reach.
- `32d2c479cbef` fixed. Measure synchronous asset admission work and cancel the unused wait callback.
- `1e845a6433c9` accepted. Recorded matched locked motion, focused backend checks, and the withdrawn render candidate.
- `1377d0994a92` accepted. Recorded successful public Adventure Resume and native restore with fresh steering.

Reassigned Codex `physics_cut`, `ai_cut`, and `render_cut`. No Devin launches. A second physics worker experiment disabling CCD just for ghost projectiles was discarded because it changed solid-body contacts and movement.

The original retail freeze is still open. The combined-input Adventure and Gauntlet pair measured ticks and visible hull positions alongside draw rate. After changes those routes drew about 8.5 and 15.3 times per second. Adventure's p95 ship-motion gap improved to 178 ms and Gauntlet's worst gap improved to 220 ms, with a worse Gauntlet p95. Opened the flight captures. The post-minimize run moved 129 world units while thrusting and turning. A separate run moved 1.44 units under straight thrust beside a large rock, with ticks and draws running. The cause of that earlier case remains open. The packaged launcher/updater, the two concurrent plant callback errors, and sustained cross-mode cadence still need work. See [QUALITY.md](QUALITY.md) for baselines and capture locations.
