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
| DeepSeek v4.1 Flash | PL-08 applause | — | prints nothing until exit; slow |

Sizing that follows: Devin takes medium-to-large packets that name the seam and the files (2–6
files, a test, a plain receipt). Flash and DeepSeek take one written plant at a time. Nobody but the
lead looks at the screen, so every visible change needs a lead look before `DONE`.

## Stability (owner, 2026-11-10: "glitchy, freezes, doesn't load sometimes, regresses constantly")

| ID | Tier | Job | State |
|---|---|---|---|
| STAB-01-launchers-always-start | D | Both launchers reach the menu 10/10; plain-sentence errors | TAKEN devin1 |
| STAB-02-stability-gate | D | `npm run gate` = Adventure boot + Swarm boot + deterministic replay | TAKEN devin2 |
| KNOWN-REDS | D | Already failing on master (not caused by fleet work): `deep-sky-plate-pipeline` #9, `performance-dirty-ranges` (4), `render-target-pipeline-warmup` #25, `pq-204-advanced-perf` #13/#19, `anvil-orchard-motor`, `ceres-five-minute-acceptance` (2), `physics-sandbox-routes` (2), `pq-163-04-cliff` (2). Fix each cause or retire a test whose claim is obsolete, with a one-line reason | NEEDS-PACKET |
| STAB-03-import-and-boot-lint | D | Static check: every relative import resolves cleanly (the `.//` boot break); first gate step | TAKEN devin2 |
| G11-01-never-freeze | L | The freeze-and-blip: measure on a quiet machine, then one clock, adaptive playout, then a cheaper sim | READY |
| G11 one clock | L | Step 1 landed: speed-gauge ring (3167d8f6) and backdrop/parallax/post time (next commit) follow the drawn world. Still on the wall clock: per-ship idle spins, shader `uTime` uniforms outside the post route — grep `performance.now\|clock.getElapsedTime` in `src/render` | BUILT |
| PARK-01-land-overnight-lane-b | D | Land the parked tender-haul / store-sentence work without drifting `check:sim` | READY |

## Wave 0 — the floor

| ID | Tier | Job | State |
|---|---|---|---|
| G18 slice 1 one feel | L | Pull/Shove/contacts identical in both doors (commit 21a3a741) | BUILT 21a3a741 |
| G18-REVIEW | L | Before DONE: run `node --test test/al-race-1-contested-line-4242.test.mjs` on a quiet machine (with the change, two Hard circuits lost the anchored-lap margin; the run without it timed out at 7 min on a loaded host); one Adventure trace of a throw into a ship (`node scripts/agent-loop.mjs sim <scenario> --trace`) | READY |
| G18-02-one-set-of-keys | D | Same keys both doors; everything else on a Q context wheel | READY |
| G18-03-the-missing-feedback | D | Camera beat on light kill + slingshot release (both doors), boost to 2x cruise with a ring, engine feel set | READY |
| G17-01-swarm-start-at-round | D | `?swarmRound=N`, `--start-round=N` | BUILT 2f8b164a |
| G16 one glass | D | NEEDS-PACKET: Kit Page + the Stage popup host (every popup through one host, one style). Spec: EC-G16 #1024 | NEEDS-PACKET |

## Wave 1 — Swarm, finished

| ID | Tier | Job | State |
|---|---|---|---|
| G08-01-enemies-wear-their-sheet | D | Enemies drawn at sheet scale + hue | BUILT 3e94db0d |
| C01-01-swarm-can-be-won | D | Thirty rounds, Forge Regent, `THE PIT IS YOURS` | TAKEN devin3 |
| G08-02-thirty-named-rounds | D | `ROUND 7 — NAME` + twist via the existing seam | HOLD on C01-01 |
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
| PL-08-applause | S | Station lamps flash at a slingshot kill (row CLAIMED in the plant list) | TAKEN deepseek |
| PL-05-road-rage | S | A twice-shoved civilian shoves back, then runs | BUILT b34318dd |
