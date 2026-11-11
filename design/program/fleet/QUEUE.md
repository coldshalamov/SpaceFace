# Fleet queue

States: `READY` (anyone of that tier may take it) · `TAKEN <who>` · `BUILT <hash>` (worker says
done) · `DONE` (lead reviewed) · `REDO <one sentence>` · `HOLD <on what>` · `NEEDS-PACKET` (the lead
writes the packet first; the spec lives where the row says). Tier: **L** lead only, **D** Devin
SWE-2 Max or better, **S** any worker (DeepSeek, Flash).

Order follows `10_THE_GAME.md` §6 (on branch EC-G13): stability first, then the floor, then Swarm
finished, then the first hour, then the five towns. Take rows top-down within your tier.

**After every batch the lead runs `npm run gate`. Red gate → fix or revert before anything else.**

## Calibration results (2026-11-10)

| Backend | Packet | Time | Verdict |
|---|---|---|---|
| Devin SWE-2 Max (acct1) | G19-01 class-up moment | 5 min | DONE — clean, honest receipt, reused the existing plate |
| Devin SWE-2 Max (acct2) | G08-01 enemy sheet looks | 7 min | DONE — right seam, pure helper + test; not seen on screen |
| Devin SWE-2 Max (acct3) | G17-01 start at round N | ~35 min | DONE — and found + fixed a master boot break (`.//` import) |
| Gemini 3.8 Flash (agy) | PL-05 road rage | 16 min | DONE — wired correctly; left an unused duplicate block |
| DeepSeek v4.1 Flash | PL-08 applause | 90 min | NOTHING — timed out, no commit, no receipt; out of rotation |

Sizing that follows: Devin takes medium-to-large packets that name the seam and the files (2–6
files, a test, a plain receipt). Flash and DeepSeek take one written plant at a time. Nobody but the
lead looks at the screen, so every visible change needs a lead look before `DONE`.

## Stability (owner, 2026-11-10: "glitchy, freezes, doesn't load sometimes, regresses constantly")

| ID | Tier | Job | State |
|---|---|---|---|
| STAB-01-launchers-always-start | D | Both launchers reach the menu 10/10; plain-sentence errors | BUILT e33d7154 |
| STAB-04-worker-bundle-never-503 | D | Sim worker bundle retries/falls back instead of 503 while files change | TAKEN devin1 |
| STAB-02-stability-gate | D | `npm run gate` = Adventure boot + Swarm boot + deterministic replay | BUILT ae8333d9 |
| KNOWN-REDS | D | Already failing on master (not caused by fleet work): `deep-sky-plate-pipeline` #9, `performance-dirty-ranges` (4), `render-target-pipeline-warmup` #25, `pq-204-advanced-perf` #13/#19, `anvil-orchard-motor`, `ceres-five-minute-acceptance` (2), `physics-sandbox-routes` (2), `pq-163-04-cliff` (2). Fix each cause or retire a test whose claim is obsolete, with a one-line reason | NEEDS-PACKET |
| STAB-03-import-and-boot-lint | D | Static check: every relative import resolves cleanly (the `.//` boot break); first gate step | BUILT 77e70240 |
| G11-01-never-freeze | L | The freeze-and-blip: measure on a quiet machine, then one clock, adaptive playout, then a cheaper sim | READY |
| G11 one clock | L | Step 1 landed: speed-gauge ring (3167d8f6) and backdrop/parallax/post time (next commit) follow the drawn world. Still on the wall clock: per-ship idle spins, shader `uTime` uniforms outside the post route — grep `performance.now\|clock.getElapsedTime` in `src/render` | BUILT |
| PARK-01-land-overnight-lane-b | D | Land the parked tender-haul / store-sentence work without drifting `check:sim` | READY |

## Performance (program B — read `PLAYBOOK.md` §3B first)

| ID | Tier | Job | State |
|---|---|---|---|
| PERF-01-where-the-frame-goes | D | Seven on/off experiments on the main thread (HUD, post, render scale, shadows, skip-render, ACK limit, trace); numbers only | READY (quiet machine) |
| PERF-02a-ship-never-steps-back | D | Owner's "snake's tongue" flicker: count backward steps, then error-smooth the player ship's drawn pose | TAKEN devin1 |
| PERF-02b local prediction | L | Draw the player's ship from their input on the main thread (client-side prediction), reconciled to the worker — the full cure for input lag + flicker | HOLD on PERF-02a |
| PERF-02 decouple the sim | L | Confirmed in code: `src/core/wholeSimBrowserWorker.js` holds the sim clock after 250 ms without a main-thread heartbeat (`LOCAL_HEARTBEAT_HOLD_MS`) and stops publishing at 4 un-ACKed replies (`LOCAL_MAX_UNACKED`) — by design, to avoid post-stall teleports. So a saturated main thread slows the world itself. Loosen only after PERF-03 frees main-thread headroom; then raise the window and let PERF-02a's smoothing absorb catch-up | HOLD on PERF-01/03 |
| PERF-03 biggest main-thread owner | L→D | Cut whatever PERF-01 names as the largest waste; lead writes the packet from the numbers | HOLD on PERF-01 |
| PERF-04 late shader compiles | D | NEEDS-PACKET: 3 programs compile mid-flight (`perf:renderer-info`); prewarm them with the opening cohort | NEEDS-PACKET |

## Mobile (program C)

| ID | Tier | Job | State |
|---|---|---|---|
| MOB-01 pinch zoom | D | NEEDS-PACKET: pinch zooms the flight camera out to desktop framing; default phone zoom wider | NEEDS-PACKET |
| MOB-02 phone HUD | D | NEEDS-PACKET: flight HUD covers ≤ 25 % of a 390×844 screen (`ui-bench --phone`) | NEEDS-PACKET |
| MOB-03 touch controls you can read | D | NEEDS-PACKET: every touch control labelled on first use; what a tap does is shown | NEEDS-PACKET |
| MOB-04 phone quality tier | D | NEEDS-PACKET: phones default to the low tier; 30 fps steady in the opening | NEEDS-PACKET |

## The look (program D)

| ID | Tier | Job | State |
|---|---|---|---|
| LOOK-01 one grade | L | Bright, warm, readable: global exposure/grade/bloom budget, judged on five places side by side | READY |
| LOOK-02 sectors on the grade | D | HOLD on LOOK-01: each sector's lights and palette onto the one grade | HOLD |

## Wave 0 — the floor

| ID | Tier | Job | State |
|---|---|---|---|
| G18 slice 1 one feel | L | Pull/Shove/contacts identical in both doors (commit 21a3a741) | BUILT 21a3a741 |
| G18-REVIEW | L | Before DONE: run `node --test test/al-race-1-contested-line-4242.test.mjs` on a quiet machine (with the change, two Hard circuits lost the anchored-lap margin; the run without it timed out at 7 min on a loaded host); one Adventure trace of a throw into a ship (`node scripts/agent-loop.mjs sim <scenario> --trace`) | READY |
| G18-02-one-set-of-keys | D | Same keys both doors; everything else on a Q context wheel | READY |
| G18-03-the-missing-feedback | D | Camera beat on light kill + slingshot release (both doors), boost to 2x cruise with a ring, engine feel set | BUILT 739a85eb |
| G18-04-boost-pins-and-puffs | D | Re-pin the two boost tests to 2.0 via their re-freeze process; ignition cough + turn puffs | TAKEN devin2 |
| G17-01-swarm-start-at-round | D | `?swarmRound=N`, `--start-round=N` | BUILT 2f8b164a |
| G16 one glass | D | NEEDS-PACKET: Kit Page + the Stage popup host (every popup through one host, one style). Spec: EC-G16 #1024 | NEEDS-PACKET |

## Wave 1 — Swarm, finished

| ID | Tier | Job | State |
|---|---|---|---|
| G08-01-enemies-wear-their-sheet | D | Enemies drawn at sheet scale + hue | BUILT 3e94db0d |
| C01-01-swarm-can-be-won | D | Thirty rounds, Forge Regent, `THE PIT IS YOURS` | BUILT ca74e15f |
| C01-02-tests-follow-the-thirty-round-course | D | ~67 endless-course assertions rewritten or retired; list content now unreachable | TAKEN devin3 |
| G08-02-thirty-named-rounds | D | `ROUND 7 — NAME` + twist via the existing seam; fold in the best content C01-02 lists as unreachable | HOLD on C01-02 |
| G19-01-class-up-moment | D | The rope's class-up is an event | BUILT 3c7e8338 |
| A01 the Foundry floor | D | NEEDS-PACKET: wall guns + buy pads, the moving crate, the forge, doors (docs 12 "What is on the floor", 15 Foundry) — split in three | NEEDS-PACKET |
| A01 freight lanes | D | NEEDS-PACKET: timetabled freight crossing the arena, horn + lights (doc 12 "Traffic") | NEEDS-PACKET |
| G08 silhouettes | L | Distinct shapes per enemy (3D; Forge route) | READY |
| G20 the Rig | D | NEEDS-PACKET: one loadout screen for both doors (EC-G20 #1032) | NEEDS-PACKET |
| G19-02 honest hold | D | NEEDS-PACKET: the hold shows prices; the fake scan-risk number goes (EC-G19 #1029) | NEEDS-PACKET |

## Wave 2 — the first hour

| ID | Tier | Job | State |
|---|---|---|---|
| G10 first ten minutes | D | NEEDS-PACKET: keep the throw, cut the drills, stage the Skim in front of the ship (EC-G10, doc 16 "Cold Start") | NEEDS-PACKET |
| G21 the Chart | D | NEEDS-PACKET: full-screen live map, five layers, timetable (EC-G21 #1033) | NEEDS-PACKET |
| G09 one next | D | NEEDS-PACKET: one guidance voice (EC-G09) | NEEDS-PACKET |
| S01 Helios | D | NEEDS-PACKET: town recipe for Helios (doc 13, EC-S01) | NEEDS-PACKET |

## Always available (repeatable — run as many as you like)

| ID | Tier | Job | State |
|---|---|---|---|
| PLANT-NEXT | S | Build the next OPEN world reaction in `INFERENCE_PLANTS.md` (96 open) | READY (repeat) |
| PRX-NEXT | D | Finish the next leftover PR from `.dev/pr-expansion/HANDOFF.md` — only rows marked "live bug" or "top priority" (#994, #988, #978, #955); the rest wait for wave 4–5 | READY (repeat) |
| PL-08-applause | S | Station lamps flash at a slingshot kill — DeepSeek timed out with nothing; back to READY | READY |
| PL-05-road-rage | S | A twice-shoved civilian shoves back, then runs | BUILT b34318dd |
