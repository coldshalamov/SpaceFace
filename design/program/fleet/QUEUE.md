# The work queue — four lanes

**This is the only place work comes from.** The design it builds is `design/game/`. How work runs:
`PLAYBOOK.md`; worker rules: `PROTOCOL.md`; where things stand: `HANDOFF.md`.

## How to take work

You are told your lane: **Agent 1, 2, 3 or 4**. Take the **first `READY` row in your own lane**, top
to bottom. Change its State to `TAKEN agent<N>` and commit that one line
(`git commit -m "queue: agent<N> takes <ID>" -- design/program/fleet/QUEUE.md`), then do the job: the
packet in `packets/<ID>.md`, or, where the row says "spec:", the spec it names. When done set
`BUILT <commit hash>` and commit. If your lane has no `READY` row you may take one from a **higher-
numbered** (easier) lane — never from a lower-numbered lane. Never take a `TAKEN` row.

| Lane | Who | What lives here |
|---|---|---|
| **1** | the strongest model available (Claude Opus/Fable class) | taste, creative writing, art and 3D, architecture, diagnosis, **reviewing what others built on screen**, writing packets for lanes 2–4 |
| **2** | strong coder (Devin SWE-2 Max at its best) | large engineering packets that name the seam: performance, controls, mobile camera/HUD, landing parked work |
| **3** | solid coder (Devin SWE-2 Max, Gemini Flash) | fully specified medium packets: data tables, wiring an existing system, one world reaction, recon drafts |
| **4** | any agent (Gemini Flash) | mechanical work that cannot go wrong: exact text, exact lists, run-and-report |

States: `READY` · `TAKEN agent<N>` · `BUILT <hash>` (worker says done) · `DONE` (Lane 1 looked) ·
`REDO <one sentence>` · `HOLD <on what>` · `NEEDS-PACKET` (Lane 1 writes it first).
**Nothing is `DONE` until Lane 1 has looked at it on screen** (if it is visible). After a batch, run
`npm run gate`; red → fix or revert before anything else lands.

---

## Senior agent — Codex (GPT 6.1 Sol), called occasionally by the lead

The strongest reviewer of bugs and architecture; also does 3D/Blender work and generates images
(concept art, textures, mockups, transparent PNGs, animated GIFs). It sometimes makes bad assumptions,
so **the lead verifies every finding and signs off** before anything acts on it. Run:
`node scripts/fleet/run.mjs <PACKET> codex --timeout-min=120` (counts toward the four-worker cap).

| ID | Job | State |
|---|---|---|
| REVIEW-BATCH | Senior review of every fleet commit since the last review; findings with file:line and failure, no code edits. First run 2026-11-11: 2 HIGH fixed by lead (5a1106b9), 7 MED/LOW → FIX-R1, FIX-R2 | READY (repeat after each batch) |
| G08 silhouettes (3D) | May be given to Codex with Blender instead of Lane 1 — distinct shapes per Swarm enemy | READY |
| LOOK-00-concept-frames | Codex paints 3 concept frames of the target look over a real screenshot, for the lead to choose from | TAKEN codex |

## Lane 1 — taste, creative, 3D, architecture, review

| ID | Job | State |
|---|---|---|
| L1-REVIEW | Look at every visible `BUILT` row on screen (ui-bench shots; `npm run player-truth -- --mode=swarm --start-round=N --out=<dir>`; fly it) and mark `DONE` or `REDO <sentence>`. Today: G19-01, G08-01, C01-01, G18-03, G18-04, PERF-02a, the plants. Repeat every session. | READY (repeat) |
| LOOK-01 one grade | Bright, warm, readable: one exposure/grade/bloom budget for the whole game, judged on five places side by side (`design/game/README.md` ruling 2) | READY |
| PERF-03 biggest main-thread owner | Read PERF-01's numbers; write the packet that cuts the largest main-thread waste (Lane 2 builds it) | HOLD on PERF-01 |
| PERF-02b local prediction | Draw the player's ship from their own input on the main thread (client-side prediction), reconciled to the worker — the cure for input lag and flicker | HOLD on PERF-02a review |
| PERF-02 decouple the sim | `src/core/wholeSimBrowserWorker.js` holds the sim clock after 250 ms without a main-thread heartbeat (`LOCAL_HEARTBEAT_HOLD_MS`) and stops at 4 un-ACKed replies (`LOCAL_MAX_UNACKED`), so a saturated main thread slows the world. Loosen after PERF-03 frees headroom | HOLD on PERF-03 |
| G11-01-never-freeze | The freeze plan end to end (measure quietly → one clock → adaptive playout → cheaper sim); steps 1 and PERF-02a landed | READY |
| G18-REVIEW | On a quiet machine: `node --test test/al-race-1-contested-line-4242.test.mjs` (two Hard circuits lost the anchored-lap margin after one feel); one Adventure trace of a throw into a ship | READY |
| G08 silhouettes | Distinct shapes per Swarm enemy (3D; the Forge route in `docs/visual-assets/README.md`) | READY |
| WRITE G16 one glass | Written: G16-01 (Lane 2), G16-02 (Lane 3) from Devin's recon | DONE |
| WRITE G20 the Rig | Write the packet(s): one loadout screen for both doors (EC-G20, PR #1032; `design/game/11`) | READY |
| WRITE G21 the Chart | Write the packet(s): full-screen live map, layers, timetable, routes (EC-G21, PR #1033) | READY |
| WRITE G10 first ten minutes | Write the packet(s): keep the throw, cut the drills, stage the Skim on screen (EC-G10; `design/game/16` "Cold Start") | READY |
| WRITE A01 Foundry floor | Written: A01-03 drops (Lane 3), A01-04 wall guns + Crate (Lane 2). A01-05 Forge + Taps (Lane 2). Still to write: A01-06 doors + traps; the five other Forged forms; Volatile Wake + Second Reel | READY |
| WRITE A01 freight lanes | Written: `packets/A01-02-freight-lane.md` (Lane 2) | DONE |
| WRITE G09 one next | Write the packet: one guidance voice (EC-G09) | READY |
| WRITE G19-02 honest hold | Written: `packets/G19-02-honest-hold.md` (Lane 2) | DONE |
| WRITE S01 Helios | Write the town packets for Helios (`design/game/13`, `09` Town Recipe, EC-S01) | READY |

## Lane 2 — large engineering with a named seam

| ID | Job | State |
|---|---|---|
| FIX-R2-reactions-respect-job-owners | Review finding: road rage / tailgater / rubberneckers must lease job-owned hulls through npcJobs, not overwrite them | BUILT 824b9b9b |
| G18-02b-the-wheel-opens | REDO: holding Q must open the context wheel on the real route; prove with `scripts/fleet/looks/context-wheel.mjs` | TAKEN agent2 (devin2) |
| PERF-01-where-the-frame-goes | Seven on/off experiments on the main thread; numbers only. **Only with no other game instance running** | READY |
| PARK-02 boot movie changes | An outside agent left uncommitted edits in `index.html`, `src/ui/bootEntry.js`, `src/ui/bootMediaPlayback.js`, `styles/boot-visualizer.css`, `test/boot-media-playback.test.mjs` (the boot waits for in-memory movie playback; hold raised 9 s → 20 s). Park them byte-for-byte on `parked/boot-media-2026-11-11` (recipe: `PLAYBOOK.md` §1), clear the folder, then land them only if `npm run gate -- --quick` passes **and** the main menu still appears within 12 s of launch on this machine (3 cold launches); otherwise leave parked and say why | READY |
| PARK-01-land-overnight-lane-b | Land the parked tender-haul / store-sentence work without drifting `check:sim` | READY |
| A01-02-freight-lane | A container string crosses the Foundry every 40 s: amber lights, horn, crushes, ride it, cut one loose | BUILT 09b4fd4c (lead looked: string + amber band visible at round 3) |
| A01-04-wall-guns-and-the-crate | Buy on the floor: two wall guns (500) and the Crate (950, moves after 3 pulls) in the Foundry | TAKEN agent2 (devin3) |
| A01-05-the-forge-and-taps | The Forge (5000, Forged forms, Wrecking Ball) and ten Taps with exact trades — after A01-04 | HOLD on A01-04 |
| G16-01-the-stage-exists | One Stage hosts every transient popup; priority queue per slot; nothing overlaps | TAKEN agent2 (devin1) |
| G19-02-honest-hold | Cargo bar shows the hold's worth; towed cargo counts; fake SCAN RISK removed; plain labels | READY |
| G18-02-one-set-of-keys | Same keys in both doors; everything else on a Q context wheel | REDO: the Q wheel never opens in a real game (lead look 2026-11-11) → G18-02b |
| MOB-01 pinch zoom | spec: `drafts/MOB.md` §MOB-01 + `design/game/README.md` ruling 3 (aspect-aware default zoom; pinch 0.6×–1.5×) | READY |
| MOB-02 phone HUD | spec: `drafts/MOB.md` §MOB-02 + ruling 3 (HUD ≤ 25 % of 390×844, measured ≈ 50 % today; contrast in scope); prove with `ui-bench --phone` shots | READY |
| MOB-05 flick to throw | On a phone, drag-and-release while the Line holds a body throws it along the flick (`drafts/MOB.md` §7 q1) | READY |
| KNOWN-REDS | Tests already failing on master (list in `HANDOFF.md` §5): fix each cause, or retire a test whose claim is obsolete with a one-line reason. One commit per test | READY |
| PRX-NEXT | Finish the next leftover PR from `.dev/pr-expansion/HANDOFF.md` — only rows marked "live bug" or "top priority" (#994, #988, #978, #955) | READY (repeat) |
| DOC-02 archive the old plans | Move superseded plan banks (list from DOC-01) into `design/archive/program-2026/` with `git mv`; first `grep -rn` every moved path across `scripts/ src/ test/ tools/` and leave any file a script reads in place; update links in live docs | READY |
| LOOK-02 sectors on the grade | Each sector's lights and palette onto LOOK-01's grade | HOLD on LOOK-01 |

## Lane 3 — fully specified, medium

| ID | Job | State |
|---|---|---|
| A01-03-swarm-drops | Eight drops on the repair-cell seam (Full Rack, Heavy Hands, Dead Weight, Magnet, Big Bang, Double Scrap, Loose Cannon, Free Forge) | BUILT 777d78d5 + lead fix (Heavy Hands restore); not seen on screen |
| G16-02-every-popup-through-one-door | Migrate 16 straggler popups onto the Stage and the kit frame, text unchanged | HOLD on G16-01 |
| FIX-R1-review-2026-11-11 | Five verified review findings: rubberneckers' payload, held Shove counted twice, release camera pull, near-miss lamps, two seed tests | BUILT 015fbf27..772f8067 (lead checked real payloads) |
| G17-02-start-in-any-sector | `?sector=<id>` + a script that photographs every sector (needed by LOOK-01 and the towns) | READY |
| MOB-04 phone quality tier | spec: `drafts/MOB.md` §MOB-04 + ruling 3: phones default to the `low` preset; prove 30 fps steady in the opening on a 390×844 emulated phone | READY |
| MOB-03 touch controls you can read | spec: `drafts/MOB.md` §MOB-03: every touch control labelled on first use; show what a tap does | READY |
| G08-02-thirty-named-rounds | `ROUND 7 — NAME` + twist via the existing seam; fold in the best late content C01-02 listed | READY |
| G11 one clock, the rest | Per-ship idle spins and shader `uTime` uniforms outside the post route still run on the wall clock: multiply their time step by `presentedAdvanceRatio()` from `src/render/presentedClock.js` (see how `renderer.js` does `_bgTime`); find them with `grep -rn "performance.now\|clock.getElapsedTime\|uTime" src/render` | READY |
| PERF-04 late shader compiles | Three programs compile mid-flight (`npm run perf:renderer-info` names them by frame); add them to the opening prewarm cohort so the count is 0 | READY |
| PLANT-NEXT | Build the next OPEN physical world reaction in `INFERENCE_PLANTS.md` exactly as written | READY (repeat) |
| PL-03 scavenger half | PL-03's scavenger is only an event (review 2026-11-11): dispatch a real salvor hull through the traffic/job seam within a minute of a wreck, checking the wreck still exists | READY |
| PL-08-applause | Station lamps flash at a slingshot kill | BUILT 1ff73ce9 |
| RECON-NEXT | Draft code facts for the next `NEEDS-PACKET` row (none open now; use for any `WRITE` row Lane 1 asks for) | READY (repeat) |

## Lane 4 — mechanical, cannot go wrong

| ID | Job | State |
|---|---|---|
| DOC-01 label the old plans | 88 files bannered, readers pass (10483e2e) | DONE |
| PLANT-RADIO | Build the next OPEN **section E** (radio line) row of `INFERENCE_PLANTS.md`: the exact line, one data row, one event key — copy the pattern of PL-52 (`src/data/flavor/040-band.js`, `src/systems/bandRadio.js`). Max one per two physical plants shipped | READY (repeat) |
| GATE-RUN | With no other game instance running: `npm run gate`; paste the output into `HANDOFF.md` §1 under "last gate" with the date and `git rev-parse --short HEAD` | READY (repeat) |

---

## Done or built (history — do not take)

| ID | State |
|---|---|
| STAB-01 launchers 10/10 · STAB-02 the gate · STAB-03 import lint · STAB-04 bundle never 503 | BUILT e33d7154 · ae8333d9 · 77e70240 · fbf37258 |
| G18 one feel (21a3a741) · G18-03 feedback (739a85eb) · G18-04 pins + puffs (ffc5b618) | BUILT |
| G17-01 start at round (2f8b164a) · G08-01 enemy looks (3e94db0d) · G19-01 class-up (3c7e8338) | BUILT |
| C01-01 win at 30 (ca74e15f) · C01-02 tests follow the course (478a068a) · C01-03 keep going (0e0cb5d0) | BUILT |
| PERF-02a ship never steps back (849ea0da) · G11 one clock: gauge (3167d8f6), backdrop (9349afb6) | BUILT |
| Plants PL-01 (89470617), PL-03 (half), PL-05, PL-06, PL-52 | BUILT |
| RECON-MOB (`drafts/MOB.md`) | DONE |
