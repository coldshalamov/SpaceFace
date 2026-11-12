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

- `c6fc0a8ac7fc` — fixed. Parked paths and context wheel checked; v27 replay passed. Duty at grace settlement corrected in `b044fc412852`; tender screen review pending.
- `4f1b1cb46e51` — accepted. Package line endings normalized.
- `45c4040c59e2` — accepted for contact law. Real Rapier checks passed on Fortify structures.
- `424bab64bb32` — code accepted. Six of eight Wasps gather in the focused ring test; round 1–5 looks have zero beacon kill credits. Live placement still needs a look.
- `c59b44df23dc` — fixed in `a2bdab5386b7`. MENU now sits inside the Pause ring.
- `69a6fab63c4c` — fixed in `a2bdab5386b7`. Opened both orientations; first-use captions clear the tape, wheel tabs and expanded radar.
- `2adca87ddcc3` — partial. Opened live Swarm captures with merged words; warning plates and HUD placement improved in `57a0a6790425`. The rest of the notice and discovery-plate changes still need the small-window look.
- `8867962b594c` — accepted. Continue uses a stable latest generation across consecutive saves.
- `931c4ffa37f3` — accepted. Both model census request and body reads have a bounded retryable deadline.
- `2e613ca67717` — accepted. Worker restaging invalidates latest-slot cache once on changed save keys.
- `d699dc7747de` — accepted. Decorative gate flare stays fixed and the live Swarm spawn-motion gate passed.
- `39a766463914` — accepted. Full hull and foreign contact leave repair cells for the wounded player.
- `143f7d54ab46` — accepted as instrumentation. Pinned Adventure ran eight arms before the flight crossed into Tethys; three variants had complete neighboring baselines.
- `76863da5a26f` — accepted. Deferred collider/CCD counts preserve diagnostics; matched Node timings were inconclusive.
- `e995bf59787f` — accepted from focused checks. Hive wall growth clears hulls and the player's short flight path; ordinary Hive look pending.
- `91934e41c3b8` — accepted. Identical market and saved state in 20 matched pairs; median cold pass 26.16 to 23.34 ms, warm pass 5.62 to 4.37 ms.
- `0b3e81f1f83e` — accepted from 42 focused checks. The fence learns a sustained slow stream and resumes the faster rate without a test reseat.
- `bdd1b2eec033` — accepted. 24 native force receipts avoid 48 body-center reads; replay compare passed.
- `6f9b48b15603` — accepted. Test now checks the deliberate paired-momentum law from `51ead0a695b1` and separately enforces the fixed-wall graze cap.
- `35d89e15725c` — accepted. One outgoing sector capture per handoff, identical matched residency and save records, v27 green. Whole-transition timing remains open.
- `d27e25933d8d` — accepted as a follow-up packet. A suspended Continue neighbor can overwrite a newer FULL sector; the inactive schedule stays off.
- `400ad062f147` — accepted. One sensor state read per observer frame, same tactical confidence and restored behavior.
- `c8306a90b07b` — focused fixture accepted. The revised finish detector counts both laps; Veil gained 2.628 s and Tethys 1.443 s. Helios gained 0.248 s against 0.800 s and stays open. Veil launch and on-screen anchor witness pending.
- `277b592a3f77` — accepted. Periodic autosave skips revalidating its own previous bytes, validates unseen bytes, and rotates both into recovery. 28 focused checks passed.
- `d53cba3fed8d` — accepted. The event trace keeps identical ordered snapshots after wrap, clear and teardown. At saturation the 16 matched Node pairs took 236.15 → 23.61 ms median to ingest 40,000 events. v27 passed.
- `9048c1c60335` — sent back with diagnosis. The standard-rate reel removed 59–74 WU of slack and all paired times stayed equal; native spring load remained zero. Public damping telemetry had miscredited the stock first-lap holds.
- `656964be9a99` — accepted from focused owner checks. Scored round 30 emits one Regent score start, three acts, each plate once, and one budgeted wing; it waits for that wing before completing. Stock Swarm and v27 pass. The public Gauntlet starts at round 1, so the direct finale look needs a disposable fixture.

### Launches and open work

- Launched Codex backend recon and boot deadline workers, then reassigned them to Swarm, physics, presentation, performance and race owners. Launched the Codex economy worker for market and sector lifecycle work.
- Launched Devin1 on read-only `PERF-01-ADVENTURE-RUN` and `PERF-01-SWARM-RUN`. Inherited Devin1 PARK-01, Devin2 SWARM-GRIND-01, Devin3 PERF-04 and Flash MOB-03. No Devin frontend assignment.
- Launched Devin2 on read-only `PERF-01-ADVENTURE-RENDER-RUN`. All six arms completed. Rendering off gained 11.0 fps against neighboring Adventure baselines and removed 65.5 long tasks per window. No-post lost 5.9 fps. The flight evolved between arms.
- Devin1 finished all eight Swarm 20 arms. The first matrix ran at 6–9 fps and 0.58–0.66 sim/wall at baseline. CPU stacks traced 9–11% of sampled baseline main-thread time to the title cinematic over the fight. `883a1ba367ce` retires the cinematic on leaving menu and guards the delayed mount. The route needs a post-fix look.
- Sent back PERF-04 in `97046bf6f9fd`. The measured pass cut 10 late programs to zero but raised internal first-picture time from 8.9 to 16.1 s. The detached patch was unmeasured at review; the dirty renderer paths belong to the concurrent worker.
- Full shared-tree gate passed import lint, Adventure, Swarm and v27 replay. Exact-source quick gate passed at `366db36709a6` and that batch is on `origin/master`. Early comms and HUD-area probes accidentally ran outside the lock and were rerun through it.
- Exact `c8306a90b07b` passed the full gate (import lint 6 s, Adventure 175 s, Swarm 290 s, v27 22 s) and was pushed to `origin/master`.
- Lead repairs include comms backlog `6db15505ffb9`, mobile quality `94d3cf2dff90`, worker event retention/input reset `52cbcc21e35e`, squad cleanup `ed46120885ed`, idle floor labels `bb7766185116`, owed worker ticks `366db36709a6`, phone receipt/objective copy `6450485b722f`, the desktop latch press `b7ca1a06387e`, and touch tap/flick `9b6018fb3250` and `bc18ca94075d`.
- The title's Circuits verb had the wrong accessible name and subtitle. `aa5e458c669a` now describes racing and time trials. `9319f3c4e1fb` separates floor tags at the same projected position. `8e93ed933682` applies the compact opening objective when the waypoint owns navigation without a tracked mission. Their focused checks passed; the narrow screenshots are pending.
- Opened the inherited G16-04 844×390 captures. Merged words and the class-up plate appeared, but receipts and the voice line crossed the centre callout and the active skin removed the backing. `ac5fde80c227` seats the notices and restores the glass. `1cca4431b19e` finishes the inherited class-up placement and makes world labels respect receipts. The inherited working-tree CSS was left intact.
- Open: ≥30% idle and ≥0.98 sim/wall in Adventure and Swarm 20, steady 30 fps on a phone, physical iPhone play, satisfying live Massline kills, and the owner's full five-item card. C01-05 stays held. Pinned Adventure settled at 0.96 sim/wall with <1% main-thread idle. The first 390×844 live route passed 33 input/UI checks and submitted about 19.5 world frames/s.
