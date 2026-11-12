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

**Frontend rule (owner, 2026-11-11):** rows marked **[FE]** are screens/HUD/popups/visuals — never Devin. They go to a
Sonnet sub-agent (lead-run) or, if routine, Gemini Flash; the lead looks at every one on screen.

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
| LOOK-00-concept-frames | Three frames in `design/game/look/concepts/`; lead chose A (B = brightest a place may go, C = darkest) | DONE |

## Lane 1 — taste, creative, 3D, architecture, review

| ID | Job | State |
|---|---|---|
| L1-REVIEW | Look at every visible `BUILT` row on screen (ui-bench shots; `npm run player-truth -- --mode=swarm --start-round=N --out=<dir>`; fly it) and mark `DONE` or `REDO <sentence>`. Today: G19-01, G08-01, C01-01, G18-03, G18-04, PERF-02a, the plants. Repeat every session. | READY (repeat) |
| LOOK-01 one grade | Concept A applied and tuned on screen in 4 passes (771c32c1, 37c9ddcd, 5b11ca4c, ca53d481, 4f828c87): warm key, blue shadows, ambient/fill restored, darkest moods floored, bloom only on true lights, exposure ~+3%, empty space deep indigo. Capture: `design/game/look/captures/2026-11-11-after-look-pass.png` | BUILT (owner to judge) |
| PERF-03 biggest main-thread owner | Read PERF-01's numbers; write the packet that cuts the largest main-thread waste (Lane 2 builds it) | HOLD on PERF-01 |
| PERF-02b local prediction | Draw the player's ship from their own input on the main thread (client-side prediction), reconciled to the worker — the cure for input lag and flicker | HOLD on PERF-02a review |
| PERF-02 decouple the sim | `src/core/wholeSimBrowserWorker.js` holds the sim clock after 250 ms without a main-thread heartbeat (`LOCAL_HEARTBEAT_HOLD_MS`) and stops at 4 un-ACKed replies (`LOCAL_MAX_UNACKED`), so a saturated main thread slows the world. Loosen after PERF-03 frees headroom | HOLD on PERF-03 |
| G11-01-never-freeze | The freeze plan end to end (measure quietly → one clock → adaptive playout → cheaper sim); steps 1 and PERF-02a landed | READY |
| G18-REVIEW | On a quiet machine: `node --test test/al-race-1-contested-line-4242.test.mjs` (two Hard circuits lost the anchored-lap margin after one feel); one Adventure trace of a throw into a ship | READY |
| G08 silhouettes | Distinct shapes per Swarm enemy (3D; the Forge route in `docs/visual-assets/README.md`) | READY |
| WRITE G16 one glass | Written: G16-01 (Lane 2), G16-02 (Lane 3) from Devin's recon | DONE |
| WRITE G20 the Rig [FE] | Write the packet(s): one loadout screen for both doors (EC-G20, PR #1032; `design/game/11`) | READY |
| WRITE G21 the Chart [FE] | Write the packet(s): full-screen live map, layers, timetable, routes (EC-G21, PR #1033) | READY |
| WRITE G10 first ten minutes [FE] | Write the packet(s): keep the throw, cut the drills, stage the Skim on screen (EC-G10; `design/game/16` "Cold Start") | READY |
| WRITE A01 Foundry floor | Written: A01-03 drops (Lane 3), A01-04 wall guns + Crate (Lane 2). A01-05 Forge + Taps (Lane 2). Still to write: A01-06 doors + traps; the five other Forged forms; Volatile Wake + Second Reel | READY |
| WRITE A01 freight lanes | Written: `packets/A01-02-freight-lane.md` (Lane 2) | DONE |
| WRITE G09 one next | Write the packet: one guidance voice (EC-G09) | READY |
| WRITE G19-02 honest hold | Written: `packets/G19-02-honest-hold.md` (Lane 2) | DONE |
| WRITE S01 Helios | Write the town packets for Helios (`design/game/13`, `09` Town Recipe, EC-S01) | READY |

## Lane 2 — large engineering with a named seam

| ID | Job | State |
|---|---|---|
| FIX-R2-reactions-respect-job-owners | Review finding: road rage / tailgater / rubberneckers must lease job-owned hulls through npcJobs, not overwrite them | BUILT 824b9b9b |
| G18-02b-the-wheel-opens | REDO: holding Q must open the context wheel on the real route; prove with `scripts/fleet/looks/context-wheel.mjs` | BUILT 321ab601 (lead looked: wheel opens mid-fight with FULL STOP / WINCH / STRAFE) |
| PERF-01-where-the-frame-goes | Seven on/off experiments on the main thread; numbers only. **Only with no other game instance running** | READY |
| PARK-02 boot movie changes | An outside agent left uncommitted edits in `index.html`, `src/ui/bootEntry.js`, `src/ui/bootMediaPlayback.js`, `styles/boot-visualizer.css`, `test/boot-media-playback.test.mjs` (the boot waits for in-memory movie playback; hold raised 9 s → 20 s). Park them byte-for-byte on `parked/boot-media-2026-11-11` (recipe: `PLAYBOOK.md` §1), clear the folder, then land them only if `npm run gate -- --quick` passes **and** the main menu still appears within 12 s of launch on this machine (3 cold launches); otherwise leave parked and say why | READY |
| PARK-01-land-overnight-lane-b | Land the parked tender-haul / store-sentence work without drifting `check:sim` | TAKEN agent2 (devin1) |
| A01-02-freight-lane | A container string crosses the Foundry every 40 s: amber lights, horn, crushes, ride it, cut one loose | BUILT 09b4fd4c + lead-review d0d7e438, baaddae2 (crush through shields/armor via a freight-only structuralHull flag; no direct velocity writes; leftover bodies retired) + 5b975a1a (a passive ride never cuts loose; reel/swing/haul-back does; east exit releases the Line through the attachments owner) — lead accepted |
| A01-04-wall-guns-and-the-crate | Buy on the floor: two wall guns (500) and the Crate (950, moves after 3 pulls) in the Foundry | BUILT 3e15a433 (lead looked: Crate pad + label visible at round 3) |
| A01-05-the-forge-and-taps | The Forge (5000, Forged forms, Wrecking Ball) and ten Taps with exact trades — after A01-04 | BUILT 07dd5ac1 (review 2026-11-11-38b31504: six findings fixed a642a272..b644a18d by a lead-review fixer) |
| G16-01-the-stage-exists | One Stage hosts every transient popup; priority queue per slot; nothing overlaps | BUILT 72c45b9f + lead-review 5ba27322 (the Swarm centre callouts now share one column, one big beat at a time; a refreshed item keeps its seat; banner/feed join the alert/toast columns) |
| G19-02-honest-hold [FE] | Cargo bar shows the hold's worth; towed cargo counts; fake SCAN RISK removed; plain labels | TAKEN agent4 (flash; lead looks after) |
| G18-02-one-set-of-keys | Same keys in both doors; everything else on a Q context wheel | BUILT b931aac8 + 321ab601 (wheel fixed and seen) |
| MOB-01-pinch-zoom | spec: `drafts/MOB.md` §MOB-01 + `design/game/README.md` ruling 3 (aspect-aware default zoom; pinch 0.6×–1.5×) | BUILT 9c0a921e + lead acaec5ff (default halfway to desktop width; pinch 0.5–2.0×) |
| MOB-02-phone-hud [FE] | Phone flight HUD ≤ 25 % of the screen: compact vitals, one-line objective, mini radar, contrast plates | TAKEN lead (devin2 timed out with the work uncommitted; lead finishes and looks) |
| MOB-05 flick to throw | On a phone, drag-and-release while the Line holds a body throws it along the flick (`drafts/MOB.md` §7 q1) | READY |
| KNOWN-REDS | Tests already failing on master (list in `HANDOFF.md` §5): fix each cause, or retire a test whose claim is obsolete with a one-line reason. One commit per test | TAKEN agent2 (devin2) |
| SWARM-GRIND-01 | The Fortify Gravity Beacon gathers enemies into a ring instead of crushing them on its body (10 free kills in 5 s, lead look) | READY |
| PRX-NEXT | Finish the next leftover PR from `.dev/pr-expansion/HANDOFF.md` — only rows marked "live bug" or "top priority" (#994, #988, #978, #955) | READY (repeat) |
| DOC-02 archive the old plans | Move superseded plan banks (list from DOC-01) into `design/archive/program-2026/` with `git mv`; first `grep -rn` every moved path across `scripts/ src/ test/ tools/` and leave any file a script reads in place; update links in live docs | READY |
| LOOK-02 sectors on the grade [FE] | Each sector's lights and palette onto LOOK-01's grade | HOLD on LOOK-01 |

## Lane 3 — fully specified, medium

| ID | Job | State |
|---|---|---|
| A01-03-swarm-drops | Eight drops on the repair-cell seam (Full Rack, Heavy Hands, Dead Weight, Magnet, Big Bang, Double Scrap, Loose Cannon, Free Forge) | BUILT 777d78d5 + lead-review dca33eb8 (registered in the runtime manifest + worker; Free Forge no longer breaks the run; Dead Weight/Big Bang/Magnet/Double Scrap/Loose Cannon go through their real owners; drops have their own crystal look) — not seen on screen |
| FIX-R4a-stage-findings [FE] | Review b14da677: persistent pills swallow timed announcements; refresh breaks FIFO; dialogs bypass admission — Sonnet after G16-03, together with a visual pass on G16-02/03 | BUILT 8e46d845 (pill yields to timed voice + FIFO refresh), 0d225464 (comms/recap dialogs admitted) — banner path not yet seen on screen |
| G16-04-floating-text-and-notice-plates [FE] | Floating world text merges (`FRIENDLY FIRE ×4`) and caps at 4; notice lines on readable plates; pad labels yield to HUD | HOLD on G16-03 (shares files) |
| G16-03-the-stage-enforces [FE] | Alerts/toasts/prompts/dialogs go through `stage.show()` (one visible, priority, FIFO); prompt seat fixed; dialogs wait for open screens; UI budgets re-baselined once | BUILT 73194aeb, 1fcd2dc8, 8ae45a1c, 2386f2c0 (4 defects; devin timed out before the UI-budget re-baseline — lead does it on a quiet machine) |
| G16-02-every-popup-through-one-door | Migrate 16 straggler popups onto the Stage and the kit frame, text unchanged | BUILT deaae6ca (12 popups on the Stage; most not yet seen staged on screen) |
| FIX-R1-review-2026-11-11 | Five verified review findings: rubberneckers' payload, held Shove counted twice, release camera pull, near-miss lamps, two seed tests | BUILT 015fbf27..772f8067 (lead checked real payloads) |
| G17-02-start-in-any-sector | `?sector=<id>` + a script that photographs every sector (needed by LOOK-01 and the towns) | BUILT 7040bd2c |
| FIX-R4b-invalid-sector | Review b14da677: an invalid `?sector=` must leave the ordinary boot alone | BUILT d396d7c4 |
| MOB-04 phone quality tier [FE] | spec: `drafts/MOB.md` §MOB-04 + ruling 3: phones default to the `low` preset; prove 30 fps steady in the opening on a 390×844 emulated phone | READY |
| MOB-03 touch controls you can read [FE] | spec: `drafts/MOB.md` §MOB-03: every touch control labelled on first use; show what a tap does | READY |
| G08-02-thirty-named-rounds | `ROUND 7 — NAME` + twist via the existing seam; fold in the best late content C01-02 listed | BUILT aad98992 (names + twist lines; 7 twists wired — the rest are C01-04/05) |
| C01-04-each-round-fields-its-cast | Every round's cast matches its name (formations, enemy mix) | BUILT 4757ab20 (lead looks at round 7 next) |
| C01-05-the-room-does-the-twist | Nine round mechanics (Delivery, Lights Out, Highway Robbery theft, The Law, Yardmaster, Chain Gang, Everything Must Go, Black Friday, Quiet) | HOLD on the lead's Swarm 1–5 look |
| G11-02-one-clock-the-rest | World decoration (idle spins, lamps, shader time) follows `presentedAdvanceRatio()` | BUILT 7b137486 + lead fix 2c54dea0 (sim-timed lamps stay on the sim clock) |
| PERF-04 | Three programs compile mid-flight (`npm run perf:renderer-info` names them by frame); add them to the opening prewarm cohort so the count is 0 | TAKEN agent3 (devin3) |
| PLANT-NEXT | Build the next OPEN physical world reaction in `INFERENCE_PLANTS.md` exactly as written | READY (repeat) |
| PL-03 scavenger half | Real salvor hull dispatched from the nearest yard through the existing salvor/job seam; turns back if the wreck is emptied | BUILT 7c744edb (lead-review) |
| PL-08-applause | Station lamps flash at a slingshot kill | BUILT 1ff73ce9 |
| RECON-NEXT | Draft code facts for the next `NEEDS-PACKET` row (none open now; use for any `WRITE` row Lane 1 asks for) | READY (repeat) |

## Lane 4 — mechanical, cannot go wrong

| ID | Job | State |
|---|---|---|
| DOC-01 label the old plans | 88 files bannered, readers pass (10483e2e) | DONE |
| PLANT-RADIO | Build the next OPEN **section E** (radio line) row of `INFERENCE_PLANTS.md`: the exact line, one data row, one event key — copy the pattern of PL-52 (`src/data/flavor/040-band.js`, `src/systems/bandRadio.js`). Max one per two physical plants shipped | READY (repeat; last: PL-54 a753e2f6 + lead fix b7df23fb) |
| UI-DIGEST | `node scripts/check-ui-budgets.mjs` reports `baseline:stale` (digest changed by G18-02, A01-04, G16-01). After G16-01 is BUILT, with no other game running: re-baseline exactly as the failure line says (`node scripts/fleet/game-lock.mjs run -- npm run capture:ui-matrix -- --budgets-out`), rerun the check, commit only the budget files it rewrites | DONE (re-baselined inside G16-01) |
| KEYS-TESTS-labels | Two UI tests still expect the old key labels (`4` vs `4/Y`) | BUILT f90f0f3f |
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
