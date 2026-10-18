<!-- LIFETIME: ACTIVE_PROGRAM -->
# The playable demo — what it has to feel like, what was broken, what is left

Owner, 2026-09-20: *"it's almost ready to demo I think, but it's not quite playable … the main ship
I fly keeps jigging back and forth like it doesn't know its own location … the vfx for the attacks
is limp and a lot of times doesn't even move … asteroids pop out of existence all the time … the HUD
and gameplay visuals are a bit cheap and css-looking like a cheap web game … I envisioned most people
playing swarm mode all the time just to enjoy the gratuitous battling, using the environment as a
weapon, flinging people into things."*

This document is the owner's answer in three parts: the target (§1), what the 2026-09-20 session
found and fixed with numbers (§2), and the ordered work that remains (§3–§4). The queue packet is
[`PQ-210`](./roadmap/active/PQ-210.md). It adds no second queue and no new law; where a job already
has an owner packet it names that packet.

## 1. The target: what playing the finished game feels like

**The ship is a body, and it is yours.** Thirty seconds in, a stranger knows three things without
being told: the ship has weight, momentum is something you spend, and the picture never lies about
where you are. Everything else in the game is built on that trust. A frame that freezes the hull,
a camera that drifts off it, a rock that blinks out beside it — each one tells the player the world
is a drawing, and a physics game cannot survive that.

**Swarm is a toy box, not a shooting gallery.** The loop is *read the pack → pick a physical answer →
land it → the wreckage becomes the next answer.* Sling a rock through three hulls. Tether a raider
and swing him into his wingman. Shove a bomber back into his own blast. Ricochet off a wreck you
made last round. Guns are the floor; the skill ceiling is physics literacy, and the score chases
style (named stunts, chains, arena kills), never hit points. Rounds are short, the shop is a breath,
and "one more run" is earned by a build that changes how the ship *handles*, not by a bigger number.
This is the mode a hardcore player boots for ten minutes and closes two hours later.

**Every hit answers on four channels inside a tenth of a second:** the world dips (hit-stop), light
lands on nearby hulls, mass goes somewhere (debris, a shoved ship, a tumbling wreck), and it has a
sound. Remove any one and combat reads as limp no matter how good the other three are.

**Adventure is the same verbs at the scale of a world that remembers.** The economy is readable
enough to plan a week around, wrecks stay where they fell, people recall what you did, WANTED is a
story rather than a meter, and an upgrade is a change in mass, thrust, line rating or heat that you
feel in the first turn after leaving the dock. The story spine exists to put the verbs in
situations the sandbox would not.

**It looks like hardware, not a web page.** The HUD is an instrument bolted to the ship: one
accent, machined edges, information drawn as form. The owner's standing bar — *consistent,
high-detail, creative, interactive, non-generic* — is judged on live screenshots, never mockups.

**Determinism is the hardcore hook nobody else has for free.** A fixed-timestep, seeded sim means
verifiable replays, ghosts, daily seeds, share codes and instant kill-cams cost almost nothing.
They already exist in pieces (Crucible ghost, daily, run share code). They belong at the front of
the house.

### The five demo bars (player units; all measured on the owner's Intel iGPU)

| Bar | Number | Instrument |
|---|---|---|
| **Smooth** | 0 presents redraw an old moment; ≤ 1 frame over 50 ms per minute in a Crucible fight; first 20 s of flight ≤ 5 % of frames over 33 ms | `npm run probe:smooth-flight`, `npm run probe:smooth-flight:crucible`; `check:baseline` → `smooth-flight` |
| **Control** | hostile in frame ≥ 80 % of a fight; input to photon ≤ 50 ms | FEEL_CONTRACT B3b; `perf.readFrameSample().inputToPhotonMs` |
| **Impact** | every default-kit hit fires hit-stop + light + mass + sound within 100 ms, with effects at Full | Crucible bench seed 4242 + the event bus |
| **Solid world** | 0 meshes disposed while on the live screen; 0 rock batches blank | `state.render.asteroidInstancePool.variants[].retiredOwners`; `.03` adds the on-glass disposal counter |
| **Hardware, not CSS** | flight HUD, Crucible HUD and results screen pass the owner's bar on `ui-bench --shot=` | `node scripts/ui-bench.mjs` |

## 2. What 2026-09-20 found and fixed

Every row was reproduced, fixed, given a test that quotes the owner, and committed.

| The owner said | The cause | Before → after |
|---|---|---|
| "keeps jigging back and forth" | The frame loop flipped its order on any frame over 33.3 ms — exactly one frame at 30 fps — and redrew the previous moment while camera/VFX/HUD advanced, then leapt two frames. On the owner's GPU 25 % of frames in the first 20 s are over 33 ms: about nine freeze-and-snaps a second. | frozen presents at 45/30 fps: **14 % / 26 % → 0**; worst snap **33 ms (5 WU) → 0** |
| "sluggish" | The same policy capped the sim to one or two steps on slow frames, so a slow GPU ran the whole game in slow motion. | game speed at 25 / 20 fps, and at 30 fps with slow draws: **83 / 67 / 63 % → 100 %** |
| (swarm-mode jig) | The "kinetic crunch" froze every drawn pose for two frames per heavy hit while the sim ran on, then snapped. The default swarm kit's concussion cannon armed it once a second. | pose holds per hit: **29.5 ms → 0**; the beat is now a real hit-stop that resumes where it stopped |
| "vfx is limp … a frozen frame moving and not spinning" | The owner's Windows has "Animation effects" off. Chromium reports that as *prefers-reduced-motion*; the game's silent `system` default inherited it and stripped hit-stop, camera trauma, FOV punch, muzzle and impact lights, haze and lensing, froze projectile shader time and froze the Well. | effects for a player who never chose: **stripped → Full** (one versioned profile migration; an explicit Reduce is kept) |
| (limp at full quality) | Three rounds were still images: the starter pulse bolt, the concussion slug, flak. | animated rounds: **4 of 7 → 7 of 7** |
| "asteroids pop out of existence all the time" | A rock batch whose buffer owner retired drew **nothing for the rest of the session** (a fifth of all common rocks at once). | retired batch: **blank forever → rebuilt next frame**, then per-rock fallback; named in the console |
| "I fly away from something and it pops out" | Mesh residency trusted a classifier that uses the requested zoom (half-depth 106 WU) while the screen is drawn at the live zoom (up to 389 WU, look-at led 400 WU). On-screen wrecks, hulls and stations were disposed by the 0.25 s poll. | on-screen objects classed unloaded: **disposed → kept** |
| "things don't load in time" | Evict radius sat *inside* prefetch while zooming out (595 vs 766 WU): the annulus was built and destroyed four times a second, starving real builds. Field rocks on screen could not build during the first 20 s of flight. | evict ≥ prefetch **always**; on-screen rows exempt from the opening hold |
| "the performance is weird" | Two 10-hour background playthroughs from another lane each pinned a core on the play machine, where CPU and iGPU share one power budget. Same build, minutes apart: 59 fps clean vs 40 fps with a freeze a second. | that harness now runs at the lowest OS priority |

### Live readings, owner's Intel iGPU, after the fixes

| Route | fps | frames > 33 / 50 / 100 ms | game speed | note |
|---|---|---|---|---|
| Open flight, settled | **60.0** | 0 / 0 / 0 | 100 % | healthy when the host is quiet |
| Open flight, first 20 s | 36 | 25 % / 7 % / 2 | 93 % | opening admission still leaks into flight → `.02` |
| Crucible swarm, 10 hostiles — before the compile-budget fix (host 50 % busy) | 42 | 11.7 % / 5.8 % / 21 in 30 s | 89 % | worst 250 ms |
| **Crucible swarm**, 10 hostiles — after it (host 32 % busy, two runs) | **57–58** | 1.3–1.9 % / 0.2–0.4 % / **1 in 30 s** | 99 % | worst 183–200 ms → `.00` |

The first Crucible reading's worst freezes were 15–20 ms of game work plus **120–146 ms of pipeline
admission**. One cause was in the loop itself: the compile drain was budgeted against the present
alone, so a 40 ms swarm frame that had already spent 24 ms was still offered six more for shader
admission. It is now offered only what truly remains of the callback, sim included. The two
readings were taken at different host loads (50 % vs 32 % busy), so the gain is the fix **and** a
quieter machine; what is solid is that two consecutive runs agree.

What remains is **one reproducible freeze of 183–200 ms about 22 s into seed 4242**: a 22–26 ms
sim frame (a wave spawning) followed by ~200 ms outside the game's callback (the driver linking
and uploading hull types the GPU has never drawn). That single event is leaf `.00`.

## 3. The ordered work (`PQ-210`)

One change at a time, the same instrument before and after, keep only what moves the felt number
(owner directive 2026-09-13). No long runs in session (2026-09-15): every instrument below is a
minute.

| Leaf | The player feels | Done when (owner's iGPU) |
|---|---|---|
| `.00` **Crucible roster prewarm** | No wave ever freezes the fight | The reproducible wave-arrival freeze (183–200 ms, ~22 s into seed 4242) is gone: **0** frames over 100 ms in a 30 s Crucible sample, worst frame ≤ 60 ms |
| `.01` **A fight fits the frame** | 60 fps with ten hostiles on screen, even on a busy machine | Typical callback in the Crucible ≤ 10 ms at **50 %** host load (read 9.3–9.6 ms at 32 %, 13.2 ms at 50 %); frames over 33 ms ≤ 1 % |
| `.02` **The first 20 seconds** | The opening is as smooth as minute two | First-20 s frames over 33 ms **25 % → ≤ 5 %** |
| `.03` **Nothing on screen unloads** | The world is solid | New counter `onGlassDisposals` reads 0 over a Crucible run and a 3-minute belt flight; on-screen `geometryPending` roots show within 0.25 s |
| `.04` **Every hit answers** | Combat has weight and sound | The four-channel audit passes for every default-kit weapon with effects Full; minimal action audio is on by default (`PQ-158.06`) |
| `.05` **The demo HUD** | Hardware, not a web page | Flight HUD, Crucible HUD and results screen accepted on live `ui-bench --shot=` (`PQ-194`) |
| `.06` **A quiet machine** | Performance is the same every time | Every harness that runs longer than two minutes lowers its own priority; rule lands in `docs/AGENT_OPERATIONS.md` |
| `.07` **Ask once about motion** | Players who need calm get it without losing anyone else's game | First boot with the OS hint shows one plain choice (Full / Reduce); never silent |
| `.08` **The fifteen-minute demo** | A stranger plays it end to end | The scripted path in §5 plays without a freeze over 100 ms and the five bars' numbers are recorded as data — played and fixed agentically (QH-6 play-and-fix); no signature gate (owner 2026-10-04) |

### `.00` in detail — the largest remaining defect

*What exists:* `PQ-129.05` warms next-contact hulls on **approach**; a Crucible wave has no
approach — it arrives on the glass. The roster is knowable at launch (ruleset + seed), and the
between-round shop is an earned pause.

*Design:* (1) Prove causality first: print wave-start times beside freeze times in
`probe-smooth-flight --crucible`. (2) At run launch, behind the loading shell, enumerate every hull,
projectile family and VFX family the ruleset can spawn and route **one real exemplar of each
through the production admission path** — real authored material, real geometry upload, real
program link. (3) In the shop, admit whatever the next round adds. (4) Count, do not time: the exit
is *zero post-launch program links and zero first-draw uploads during a round*.

*How agents get this wrong:* warming synthetic stand-in materials (measured 2026-08-28: the live
key differs in five fields and stand-ins never converge — use the actual authored material, as
`addCommonRockPipelineWarmup` does); spawning sim entities to warm them (determinism); cutting hull
detail or lights to hide the link; declaring victory on a quiet-host run without the CPU line.

### `.01` in detail — where the frame goes

Measured split in a Crucible fight: sim 4.8 ms, render 6.2 ms, UI 1.1 ms (peaks of 3–5 ms on the
worst frames), VFX 0.7 ms. Take a CPU profile of the same route and name the top three owners before
touching anything. Known suspects from earlier audits, each unverified on this route: 22 point
lights permanently enabled at intensity 0 and baked into every lit program (16 weapon + 6 VFX);
HUD DOM writes every frame rather than on change; per-tick allocation in the flight kernel and AI.
Never lower default quality to pass.

## 4. Beyond the demo: what an A-list version still needs

Grouped by what the player gets. Existing owner packets are named; **NEW** marks ideas with no
packet yet, to be admitted through §1.7's grading row when their turn comes — not a second queue.

**The toy (swarm).** Stunt grammar as the scoring language with on-screen names (`PQ-146`); roster
as physical problems, not hit-point sponges (`PQ-140`); field toys and arena hazards that read at a
glance in one Force Language (`PQ-147`); wrecks as terrain and ammunition (`PQ-154`). **NEW: instant
kill-cam** — a 5-second deterministic re-sim of the last arena kill on round end, skippable.
**NEW: front-of-house seeds** — daily seed, ghost race and share code on the Crucible's first screen
rather than behind it. **NEW: a physics lab toy mode** for streamers and the curious: spawn, grab,
throw, slow time.

**Feel.** Mass-aware Massline handling and a line load rating the player can read (`PQ-137`);
damage from pre-solve closing speed so a 150 WU/s slam is not a 40 WU/s nudge (`PQ-137.06`);
camera that keeps the fight in frame (`PQ-159`, bar B3b); input truth and a controller-first pass —
top-down twin-stick is this game's natural home (`PQ-164`). **NEW: an "iGPU 60" preset** that is
art-directed for integrated graphics rather than merely degraded; the owner's machine *is* min-spec.

**The picture.** The style slice approved at the shipping camera before any fleet pass (`PQ-190`);
complete bodies, no floating parts (`PQ-193`); readable at zoom (`PQ-161`); muzzle discharge flow is
hard-wired to zero (`weaponDischargePool` descriptor 16) so every gun's muzzle is a static shape in
an envelope — a small, visible win.

**Sound.** Audio is muted by default until the authored pass; a physics combat game without sound
is judged limp however good it looks. Minimal action audio is a demo blocker (`PQ-158.06`), full
direction follows (`PQ-158`).

**The world (adventure).** First ten minutes that reach a choice inside five (`PQ-163`); an
economy you can read and plan against (`PQ-177`); customization with physical consequences
(`PQ-176`, `PQ-142`, `PQ-155`); the storyteller, people who remember, the WANTED loop (`PQ-149`,
`PQ-150`, `PQ-151`); the story spine (`PQ-032`, `PQ-178`); six sectors with their own physical
character (`PQ-153`).

**The frame around it.** Station redesign, chart, meta shell, Crucible screens, everything a link
(`PQ-162`, `PQ-168`, `PQ-181`–`PQ-183`) under Field Hardware (`PQ-194`); replay and clips — the
marketing of a physics game is its players' clips (`PQ-160`); accessibility and options with motion
asked, never assumed (`PQ-165`, leaf `.07` here); five languages (`PQ-166`); min-spec floors and
soak (`PQ-033.02`); mods (`PQ-172`).

**The process, so this does not recur.** Three of today's five defects were *pinned green by
tests* that asserted the broken behaviour (present the stale snapshot first; hold poses without
touching time; follow the OS motion hint). `FEEL_CONTRACT` §D already says a test pinning what the
vision forbids is a defect; every new feel test quotes the owner sentence it serves. And the bench
measured the sim while the player lives in the frame: the witness added today measures the frame.

## 5. The fifteen-minute demo path

1. Cold boot to the title in under ten seconds; **Crucible** is the first button.
2. Launch to flight in under ten seconds; the first input moves the ship inside two.
3. Sixty seconds to the first physics kill (a thrown rock or a shove into a hazard), and it answers
   on four channels.
4. Rounds one to five escalate the *problems*, not the hit points; the shop offers a build that
   changes handling; no frame over 100 ms.
5. Results screen with the seed, the ghost and "run it again"; then **Adventure**: undock, take one
   job, solve one physical problem, get paid, fit one upgrade, feel it on the way out.

## 6. The demo defect ledger — everything a demo player will hit (live, opened 2026-09-22)

Owner, 2026-09-22: *"total-fix mode … if you see bugs somewhere that aren't related that would hurt
the demo experience fix them … documented or fixed issues when you find them rather than letting it
go by."* This table is the ONE place a noticed-but-not-yours defect goes; root `AGENTS.md` §7 is
the law, this is the ledger. Any defect a demo player would meet qualifies — screen, gameplay,
performance, audio, save, flow — not just pixels.

- **Add** one row when a defect is real but you are not fixing it this session: what a stranger
  sees, where (bench shot id, route, or system), the demo step it hurts, and the cheapest known
  repro. If you cannot write a repro, log what you did see and how.
- **Remove** the row in the same commit that fixes it (screen rows: re-shot through the bench
  first). Rows are never struck through, marked done, or moved to an archive — the ledger holds
  only open defects, so its length is the honest count of what a player will hit.
- **Burn it down:** any sitting may claim any row, and a sitting dispatched into files carrying an
  open row handles that row as part of its unit. If the table grows past one screen, clearing rows
  outranks new queue units.
- **Owner ruling 2026-10-04 — the consumer law:** clean-machine captures, soaks and perf
  measurements are consolidated in [`QUIET_HOST_PROGRAM.md`](./QUIET_HOST_PROGRAM.md); a capture
  exists only to close a row, validate a landed fix, or serve as the before/after of an
  optimization made in the same sitting. No row holds open on host weather ("needs quiet host")
  or recurrence luck as its close condition — such a row closes with its evidence instead
  (D48/D85/D111/D131 closed on this ruling 2026-10-04). Freeze evidence is collected only during
  the program's general playtest block (QH-7); no sitting is dispatched to reproduce a historic
  freeze at its reported place.

The screen rows below were each seen on a real screen (`node scripts/ui-bench.mjs --shot=<id>`,
real DOM over a still). Rows marked **bench** may be fixture-only; the owner of the row proves
which before closing it.

| # | Where (shot id / route / system) | What a stranger sees | Demo step | State |
|---|---|---|---|---|
| D188 | Physical-phone startup and renderer recovery | Production `7ac10849f2` is READY on Vercel. Its frozen source passes public New Game, touch controls, rotation, manual Save, reload and Continue in iPhone14-profile WebKit with zero JS/WebGL/critical HTTP errors. Required uploads no longer use optional budgets; mounted pod packages retain residency; cancelled first-picture work cannot publish; failures retain the original cause and Retry/Back. | Phone New Game / Continue; rotation; interrupted startup | OPEN for physical-handset compatibility: iPhone14 Chrome has not been directly exercised. Windows WebKit profile is functional browser evidence, not handset/GPU timing acceptance. Earlier isolated8a failed after Save at reload; published7ac passes that route. Evidence: `.devshots/mobile-deployment/oct16-published-mobile/report.json`, frozen digest `ed6ff8adaaa66b1d630a0cb01c6cdb43271af4cefcfa87efc9d749398c1aba57`; PR436 superseded by published master. |
| D191 | Ceres refinery pocket population; `test/ceres-table-authority-census.test.mjs`, `test/ceres-active-pockets.test.mjs` | Same-sector re-entry payload churn is fixed by `0e71b4baf0`; `d062a50e6b` removes 35 temporary arrays and 20 Sets per tick without changing traffic population. Current seed 14920 CPU attribution (111 live entities, 240 warm/120 sample ticks) places physics 4.42 ms, tacticalAI 2.13 ms and FlightV3 1.19 ms/tick; these busy-host inclusive values route repairs, not FPS acceptance. A separate physics phase sample places 3.07/4.11 ms in the native solve/guard step without isolating safely removable work. | Enter Ceres and fly the refinery pocket | OPEN for overall simulation performance. Traffic normalization passes 45 focused checks including deterministic Ceres behavior and save/Continue; authored population stays intact. Next work needs a causal owner within the dominant solve/guard or AI phases; repeating the same top-level census adds no material evidence. See MATURITY_2026_10_15.md. 2026-10-17 orch-demo-m30: real-body attribution names Rapier `stepWithEvents` dominant (2566 ms inclusive over a 30 s weave, 170 live entities) with tactical-AI `_sensorFrameFor → entityContacts` next; a sensor-loop hoist candidate was tried and REJECTED (entityContacts sampled 164.6 → 257.7 ms; .devshots/bm5-bm6/). The dominant cost is the native solve step itself — the open question is now scoped to it. OPEN. |
| D199 | Asteroid/background contrast and player-truth ownership | Three native ownership diagnostics measured no submitted-rock contrast. The atomic attempt has 17 bitmap timeouts and one JPEG whose asteroid pixels remain unknown because a vertex-deformed painted stellar-light draw may cover them. Radius-square contrast is diagnostic. The unsuccessful capture candidate is preserved as a patch and withdrawn from source. | New game, starter seam; Swarm Ricochet Foundry seed4242 | OPEN. No brightness or threshold change is justified. Do not repeat the unchanged diagnostic or grow the capture system during the current performance campaign. Evidence: MATURITY_2026_10_15.md, .devshots/oct16-d199-swarm-atomic/, and .devshots/oct16-d199-withdrawn.patch. |
| D198 | New Game screen open; `src/ui/screens/newGame.js` (`onShow`, `setLaunching`), startup census/compile scheduling in `src/render/startupGpuResidency.js` | Historical Menu → New Game capture froze the picture for about a second: 1.2 s of main-thread work with 250 ms stalls; current residual cost is unverified. | Menu → New Game | OPEN. The rect-loop allegation is repaired: `f3bcb16f8e` caches hull-ring geometry and reuses nodes, `7b2d9c9675` batches yard measurements before writes, skips unchanged builds, rests the position watch and defers name focus until after paint; `088c183cca` preserves 0.01 px layout signatures. Current yard/ring fixtures pass 40/40, including unchanged-trigger coalescing, resize invalidation and zero layout reads during spins. Historical remaining measurements — 245 ms GL command-buffer waits, 1104 microtask checkpoints (104 ms), and 138 ms forced style/layout under `ui/kit/dom.js` button activation — do not establish current costs or a missing paint yield. The current candidate also schedules embark decode requests through the existing post-present arm, preserving coalescing and bounded fallback while cancelling hidden/retired owners; six focused regressions pass. Its effect on the historical spike remains unmeasured, so D198 stays open pending current-route attribution. 2026-10-17 orch-demo-m30: current-route attribution done; two legs landed (hidden-screen prewarm style/layout 83 ms → 0 ms; a 3.06 s covered-title warm-up draw now waits until the title is requested again; evidence `.devshots/bm2-d198/RESULT.md`). Remaining: the visible-title shader warm-up and the final click cost, measured at 190 ms under 82 % host CPU contention (campaign workers were running) — attribution continues on a quiet host. OPEN. |


| D130 | Sustained flight and frame pacing | The whole-game 3x hitch target remains unmet. Current frozen 3eed versus 337b: Adventure early 36.5→34.3 submissions/s and 35→28 actual pose gaps over 50 ms; settled 35.3→38.1/s and 50→30 gaps (p99 65.0 ms). No missing eligible player meshes or stale-sim samples; early canvas content remains UNKNOWN after one decoder error. Swarm improved substantially in the prior eight-cell comparison, but this is not whole-game acceptance. | Ordinary flight; station interactions | OPEN: identify the current Adventure main-thread/GPU owner, optimize it without reducing authored quality, then directly compare. Other applications remain running; report contention rather than inventing a quiet-host result. Evidence: MATURITY_2026_10_15.md and .devshots/performance-campaign/oct15-shadow-hud/. 2026-10-17 orch-demo-m30: one Adventure owner leg LANDED — `cameraRoofAt → clearanceNeighborhoodRaw` pruned by conservative world-space upper-Y (exact heights preserved; dense-raster test visits under 1% of triangles): clearance query 1.648 → 0.139 ms/frame, `cameraRoofAt` inclusive 3157 → 422 ms, p99 130.9 → 73.1 ms, submissions/s 27.5 → 38.8 under recorded host contention (.devshots/bm5-bm6/). Row stays open for the whole-game 3x target. OPEN. 2026-10-18 real route on the owner laptop (Core Ultra 7 155U, Intel integrated graphics, headed Chromium, browser/Devin/other apps running, so contended): New Game reaches flight and renders; `probe-frame-solid --cpu-profile` adventure seed 4242: frame p50 48 ms, p95 98 ms, p99 145 ms, 46% of frames over 50 ms, longest 3.6 s; 102 draw calls and 50 program switches per frame; self CPU is (program) 24%, three.js 25%, renderer.js 5%, vfx.js 3%. Draw-call/state-change bound, not sim bound; another agent has uncommitted render batching work in the tree (rigidOpaqueBatch, opaqueMaterialBatch, staticChildMatrices). OPEN. |
| D175 | vm-drop `classify-*` patch jobs — five landed jobs under `design/program/vm-drop/` still carry the D173/D174 dead-location hunks (`player.data.miningTargetId`, `player.data.dockTargetId`, `state.comms.*` reads) | Their diffs reintroduce dead pins if imported after the HEAD fixes | next vm-drop import review | VERIFIED CLEAN 2026-10-07: all 12 `classify-*` folders are DONE+IMPORT; `activityRuntime.js` reads `state.player.miningTargetId` and documents the dead `player.data.*`/`state.comms.*` locations as writerless — zero live reads remain. The row stays as a standing guard: on import of any *future* `classify-*` job, drop dead-location hunks — HEAD's `playerIntentPins` + `state.player.miningTargetId` are the contract |
| D213 | Swarm empty-wave hole and motion-lab behavior reds: `test/pq-174-01-harvest-waves.test.mjs`, `test/motion-lab-scenarios.test.mjs` | The 2026-10-17 red-test sweep re-pinned 30 stale tests and left five reds. M8 formation recovery was FIXED 2026-10-18 (squadFrame kick detection and a local rendezvous; `test/r2-d213b-motion-lab.test.mjs`). The Swarm first-wave pin was re-pinned 2026-10-18 (empty seconds are allowed only inside the announced breathing hold, bounded to one breath). Still open: (1) M11 swarm river has 14 contacts after a shove (cause in `FodderCohortDirector`, `src/ai/fodderCohort.js` prediction-to-actuation, seed 13502); (2) the shared-envelope and impulse-cancel mutation hooks no longer turn red (planning scales are identity but `aiPorts.js` still applies each hull's own actuator authority, so the oracle needs a different mutation, not a hull-physics change) | Swarm wave 1; the motion lab | OPEN 2026-10-17, narrowed 2026-10-18. Do not retune mass, thrust or weapon numbers to pass. |
| D222 | UI budget baseline: `scripts/check-ui-budgets.mjs`, `test/ui-frame-references/budgets.json` | CI `static (2)` is red because the digest of the UI source no longer matches the baseline (333 files drifted by 2026-10-18; it re-drifts on every UI-source commit). | CI only | OPEN: re-shoot from a clean tree once the UI wave settles (`node scripts/capture-ui-matrix.mjs --headed --mode=default --viewport=1920x1080 --budgets-out=test/ui-frame-references/budgets.json`); consider digesting only the files the matrix renders so it stops re-drifting. |
| D223 | Station screens in windows 760 wide or narrower: Shipworks (700x460 6 tangled / 6 cut; 760x420 also 6 off-frame), Missions (passenger legend overlaps the dossier title), Factions (CURRENT STATION AUTHORITY overlaps NEUTRAL), Ledger (cycle / BOUGHT SOLD NET labels cut) | Found 2026-10-18 by the new control-reachability bench (tools/ui-bench-controls.js); Market and Shipworks at 960x540 to 1366x768 were fixed the same day, see docs/ui-polish/REVIEW.md. | Station at 700x460 .. 760x420 | OPEN: scoped desktop-only fixes per tab, re-run `node scripts/ui-bench.mjs --shot=<tab> --viewports=700x460,760x420` until 0 findings. |
| D224 | CI browser checks that only fail by timeout on the software-GL runner: `check:assets:live` (no CDP reply within 5.4 s), `check:market-first-loop` (Market instrument wait 8 s), `probe-flight-visual` (flight-ready 70 s, sg02DynamicReady), `probe-ship-visual-stability` | On 2026-10-18 the sibling checks `station-tabs`, `shader-compile`, `47a-live-cold-open` and `mission-handoff` passed on CI after the real fixes, and New Game reaches flight and renders on the owner laptop GPU (headed Chromium, Intel integrated). These four still fail on SwiftShader with wait budgets sized for a faster host; a local real-GPU rerun was not conclusive because the machine was at 80-90% CPU from other agents. | CI browser shards 2, 3, 4 | OPEN: rerun each locally on a quiet real-GPU host; if green, give the four waits a serial-route allowance (like the mission-handoff boot allowance) or move them to a GPU runner; if any is red, it is a product defect. |
