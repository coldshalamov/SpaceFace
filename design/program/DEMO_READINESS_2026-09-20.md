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
| D191 | Ceres refinery pocket population; `test/ceres-table-authority-census.test.mjs`, `test/ceres-active-pockets.test.mjs` | Same-sector re-entry payload churn is fixed by `0e71b4baf0`; `d062a50e6b` removes 35 temporary arrays and 20 Sets per tick without changing traffic population. Current seed 14920 CPU attribution (111 live entities, 240 warm/120 sample ticks) places physics 4.42 ms, tacticalAI 2.13 ms and FlightV3 1.19 ms/tick; these busy-host inclusive values route repairs, not FPS acceptance. A separate physics phase sample places 3.07/4.11 ms in the native solve/guard step without isolating safely removable work. | Enter Ceres and fly the refinery pocket | OPEN for overall simulation performance. Traffic normalization passes 45 focused checks including deterministic Ceres behavior and save/Continue; authored population stays intact. Next work needs a causal owner within the dominant solve/guard or AI phases; repeating the same top-level census adds no material evidence. See MATURITY_2026_10_15.md. 2026-10-17 orch-demo-m30: real-body attribution names Rapier `stepWithEvents` dominant (2566 ms inclusive over a 30 s weave, 170 live entities) with tactical-AI `_sensorFrameFor → entityContacts` next; a sensor-loop hoist candidate was tried and REJECTED (entityContacts sampled 164.6 → 257.7 ms; .devshots/bm5-bm6/). The dominant cost is the native solve step itself — the open question is now scoped to it. OPEN.  2026-10-24 lane-A triage: no new causal owner without an uncontended capture; the scoped question (Rapier stepWithEvents native solve) needs the quiet host (QUIET_HOST_PROGRAM, row 284). No capture produced on this shared box by rule. Stays OPEN. |
| D199 | Asteroid/background contrast and player-truth ownership | Three native ownership diagnostics measured no submitted-rock contrast. The atomic attempt has 17 bitmap timeouts and one JPEG whose asteroid pixels remain unknown because a vertex-deformed painted stellar-light draw may cover them. Radius-square contrast is diagnostic. The unsuccessful capture candidate is preserved as a patch and withdrawn from source. | New game, starter seam; Swarm Ricochet Foundry seed4242 | OPEN. No brightness or threshold change is justified. Do not repeat the unchanged diagnostic or grow the capture system during the current performance campaign. Evidence: MATURITY_2026_10_15.md, .devshots/oct16-d199-swarm-atomic/, and .devshots/oct16-d199-withdrawn.patch.  2026-10-24 lane-A triage: per this row, no unchanged diagnostic repeated and no brightness/threshold change made; needs a new evidence source (quiet-host native capture). Stays OPEN. |
| D198 | New Game screen open; `src/ui/screens/newGame.js` (`onShow`, `setLaunching`), startup census/compile scheduling in `src/render/startupGpuResidency.js` | Historical Menu → New Game capture froze the picture for about a second: 1.2 s of main-thread work with 250 ms stalls; current residual cost is unverified. | Menu → New Game | RESOLVED 2026-10-24. The rect-loop allegation is repaired: `f3bcb16f8e` caches hull-ring geometry and reuses nodes, `7b2d9c9675` batches yard measurements before writes, skips unchanged builds, rests the position watch and defers name focus until after paint; `088c183cca` preserves 0.01 px layout signatures. Current yard/ring fixtures pass 40/40, including unchanged-trigger coalescing, resize invalidation and zero layout reads during spins. Historical remaining measurements — 245 ms GL command-buffer waits, 1104 microtask checkpoints (104 ms), and 138 ms forced style/layout under `ui/kit/dom.js` button activation — do not establish current costs or a missing paint yield. The current candidate also schedules embark decode requests through the existing post-present arm, preserving coalescing and bounded fallback while cancelling hidden/retired owners; six focused regressions pass. Its effect on the historical spike remains unmeasured, so D198 stayed open pending current-route attribution. 2026-10-17 orch-demo-m30: current-route attribution done; two legs landed (hidden-screen prewarm style/layout 83 ms → 0 ms; a 3.06 s covered-title warm-up draw now waits until the title is requested again; evidence `.devshots/bm2-d198/RESULT.md`). RESOLVED 2026-10-24: the defect legs are landed (hidden-screen style/layout 83 ms to 0 ms; covered-title warm-up deferred until requested). The residual leg is only a current-route measurement on a quiet host — quiet-host work cannot hold a demo row open per the 2026-10-04 consumer law, so that attribution moves to QUIET_HOST_PROGRAM as a measurement request, not a defect. |


| D130 | Sustained flight and frame pacing | The whole-game 3x hitch target remains unmet. Current frozen 3eed versus 337b: Adventure early 36.5→34.3 submissions/s and 35→28 actual pose gaps over 50 ms; settled 35.3→38.1/s and 50→30 gaps (p99 65.0 ms). No missing eligible player meshes or stale-sim samples; early canvas content remains UNKNOWN after one decoder error. Swarm improved substantially in the prior eight-cell comparison, but this is not whole-game acceptance. | Ordinary flight; station interactions | OPEN: identify the current Adventure main-thread/GPU owner, optimize it without reducing authored quality, then directly compare. Other applications remain running; report contention rather than inventing a quiet-host result. Evidence: MATURITY_2026_10_15.md and .devshots/performance-campaign/oct15-shadow-hud/. 2026-10-17 orch-demo-m30: one Adventure owner leg LANDED — `cameraRoofAt → clearanceNeighborhoodRaw` pruned by conservative world-space upper-Y (exact heights preserved; dense-raster test visits under 1% of triangles): clearance query 1.648 → 0.139 ms/frame, `cameraRoofAt` inclusive 3157 → 422 ms, p99 130.9 → 73.1 ms, submissions/s 27.5 → 38.8 under recorded host contention (.devshots/bm5-bm6/). Row stays open for the whole-game 3x target. OPEN. 2026-10-18 real route on the owner laptop (Core Ultra 7 155U, Intel integrated graphics, headed Chromium, browser/Devin/other apps running, so contended): New Game reaches flight and renders; `probe-frame-solid --cpu-profile` adventure seed 4242: frame p50 48 ms, p95 98 ms, p99 145 ms, 46% of frames over 50 ms, longest 3.6 s; 102 draw calls and 50 program switches per frame; self CPU is (program) 24%, three.js 25%, renderer.js 5%, vfx.js 3%. Draw-call/state-change bound, not sim bound; another agent has uncommitted render batching work in the tree (rigidOpaqueBatch, opaqueMaterialBatch, staticChildMatrices). Follow-up the same day: the 3.6 s longest frame is the first frame of the run (3.5 s of native program time at t=0, startup) and is not a flight freeze, but the profile shows two real in-flight freezes of about 1.2 s at 39 s (native program time) and 62 s (setProgram / getAttributes); two in-flight shader links on the Yard Tug come from a one-bit material variant mismatch (index 51, 8421457 versus 8421456), a small compile hitch the program census misses. Against the 2026-10-17 frame-solid run every load-independent count improved or held (stuck-missing 39 to 0, missing frames 88 to 4, in-flight links 15 to 2, undrawn 1 to 0, late-appear p95 1960 to 403 ms; blinks, root swaps and in-frame links stay 0); only the timing rows warn (p99 73 to 145 ms), which is host contention (CPU 80-90% from other agents). 2026-10-19 second leg (batch-cohort + shader-link prewarm): the retained rigid-opaque cohort now covers generic authored traffic ships (24-49 rigid leaves per hull collapse into per-material BatchedMesh groups; canopies/plumes/turrets/morphs/transparents stay direct via the planner battery); canonical specimen clones keep material userData so the batch program key no longer misses illustrated surfaces; the planner honors minGroupSize 1 for singleton canon specimens (the 2-member floor was silently dropping every warm specimen); mid-flight ship families mint a throwaway USE_BATCHING twin inside their own admission compile, session-deduped by (material, geometry, lane) key and skipped during the loading cook; shadow-lane flips park a source on its authored direct draw after one strike and a 45-sync quiet window coalesces flip sweeps into one replan instead of one dispose+replan per flipper (rollbacks 10-13 per 70 s window to active-and-stable). Also guarded a foreign half-landed `runGlassSweptMeshDiscovery` call site in the mesh-build drain whose missing helper was throwing ReferenceError inside the drain generator and silently wedging the authored-visuals boot gate. Measured on the same contended box, adventure seed 4242 (.devshots/frame-solid/2026-10-19T01-45-29-149Z.json vs the 2026-10-18 baseline): in-flight shader links 27 to 24, batch-activation links 7-12/run to 2/run, in-frame links stay 0; p99 145 to 132 ms; frame pacing in the lower-contention same-code runs reached p50 18-28 ms. The probe still fails its stuckMissing/blinks gate (167 stuck-missing, 1 blink this run) — those counts swing 6 to 167 across identical code with host CPU contention and the foreign anti-blink lane in flight; the two residual batch links are families the specimen/twin paths do not yet reach. Row stays open for the whole-game 3x target. OPEN.  2026-10-24 lane-A triage: frame-pacing acceptance is a quiet-host capture (row 284 QH-1 baselines); D231 landed 1d980fcb67 (live-geometry pick derives the admission env once per pick instead of per entry — removes an O(n^2) env recompute on dense arrivals) but makes no FPS claim. Stays OPEN. |
| D175 | vm-drop `classify-*` patch jobs — five landed jobs under `design/program/vm-drop/` still carry the D173/D174 dead-location hunks (`player.data.miningTargetId`, `player.data.dockTargetId`, `state.comms.*` reads) | Their diffs reintroduce dead pins if imported after the HEAD fixes | next vm-drop import review | VERIFIED CLEAN 2026-10-07: all 12 `classify-*` folders are DONE+IMPORT; `activityRuntime.js` reads `state.player.miningTargetId` and documents the dead `player.data.*`/`state.comms.*` locations as writerless — zero live reads remain. The row stays as a standing guard: on import of any *future* `classify-*` job, drop dead-location hunks — HEAD's `playerIntentPins` + `state.player.miningTargetId` are the contract |
| D222 | UI budget baseline: `scripts/check-ui-budgets.mjs`, `test/ui-frame-references/budgets.json` | CI `static (2)` is red because the digest of the UI source no longer matches the baseline (333 files drifted by 2026-10-18; it re-drifts on every UI-source commit). | CI only | OPEN narrowed 2026-10-18: digest mechanism landed (rendered-UI-layer-only set, self-maintaining manifest). Remaining: headed re-mint node scripts/capture-ui-matrix.mjs --headed --mode=default --viewport=1920x1080 --budgets-out=test/ui-frame-references/budgets.json on a clean tree, then delete this row.
| D224 | CI browser checks that only fail by timeout on the software-GL runner: `check:assets:live` (no CDP reply within 5.4 s), `check:market-first-loop` (Market instrument wait 8 s), `probe-flight-visual` (flight-ready 70 s, sg02DynamicReady), `probe-ship-visual-stability` | On 2026-10-18 the sibling checks `station-tabs`, `shader-compile`, `47a-live-cold-open` and `mission-handoff` passed on CI after the real fixes, and New Game reaches flight and renders on the owner laptop GPU (headed Chromium, Intel integrated). These four still fail on SwiftShader with wait budgets sized for a faster host; a local real-GPU rerun was not conclusive because the machine was at 80-90% CPU from other agents. | CI browser shards 2, 3, 4 | OPEN narrowed 2026-10-18: serial-route allowances applied (market 8-45s, flight-visual 70-180s, ship-stability 90-180s, authored-assets stage budgets widened so probe no longer races the game authored-visual gate it must out-wait; harness caps raised). Close on a green SwiftShader browser shard; a red wait after this is a product defect.
| D229 | Metallic-asteroid draw during the rock-family decode rewarm on sector entry (found by the asteroid-appear probe, 2026-10-18; adjacent to commit `183df8f983a`) | Right after entering a belt sector, metallic rocks near the route spent up to ~1 s drawn-then-invisible-then-drawn (single-frame blinks across ~6 rocks, `poolNotRegistered` verdicts) while their leaf materials rode `authoredAssetState: 'loading'` through the rock-family decode rewarm (`_runRockFamilyDecodeRewarm`, `rockFamilyLibraryReady`). Same signature in the pre-fix baseline run (id 131, 968 ms) and both post-fix runs (worst 1063 ms), so pre-existing, not a regression of the appear-latency fix. | Enter sector_ceres_belt and watch metallic rocks during the first seconds | NARROWED 2026-10-18 (`0df2ec6bca1`): the pool's adopt-into-pending-bucket rekick (flight-urgent, once per mesh) removed the bucket-admission half of the window; the latest probe run shows 0 metallic undrawn/blinks (was 13-21 frames). Remaining suspicion is the release-to-reregister gap around the authored material swap itself. Repro: `node scripts/probe-asteroid-appear.mjs` then read `blinkCounts` / `summaryByKind['rock:ast_metallic|live']` and each undrawn episode's `firstUrgency` in the newest `.devshots/asteroid-appear/*.json`. Row stays open until two consecutive runs show zero metallic blink frames with the decode window exercised. 2026-10-19 wave-3 run (seed 4242, contended host, `.devshots/asteroid-appear/2026-10-19T09-11-53-948Z.json`): metallic live still blinked 7 frames on `poolNotRegistered` — a leaf marked adopted whose record is absent from the pool, consistent with the release-to-reregister gap during the decode rewarm — plus 14 dormant `poolNotSubmitted` frames. The pending-bucket leaf fallback (wave 3) does not cover an unregistered leaf, and leaf-program FIFO depth under load still gates its redraw. Row stays OPEN. |

| D250 | Adventure boot cannot fetch the game module under browser resource exhaustion | Native headed player-truth stopped before the main menu: three `net::ERR_INSUFFICIENT_RESOURCES` resource errors and `Failed to fetch dynamically imported module: /src/main.js`. No page exception, gameplay samples, renderer identity or initialized runtime; 4377 MiB free of 32277 MiB. The underlying exhausted browser/host resource is unassigned; this does not establish a feature import defect. | Fresh public Adventure boot; `scratch/player-truth/pro-experiences-settled/verdict.json` and `trace.json.gz`, 2026-10-23T16:06Z | OPEN. Preserve the failed gate; no unchanged full-run retry, gate relaxation or quality reduction.  2026-10-24 lane-A triage: host-resource exhaustion, not a feature import defect; gate preserved, no unchanged retry. The owner phone lane changes to fetch walls (e1fa699094) touch the same startup path; re-run belongs to the next player-truth pass on a host with free resources. Stays OPEN. |
| D251 | Opening-route boot payload: the deployed release route streams ~146 MB (76 render packages, 84.7 MB of GLB) before first flight | Measured 2026-10-23 on production `chj5nr38k` with the deployed-mobile probe (desktop WebKit, fresh context): 269 `/assets/` requests totalling 146.4 MB, 76 of them `render-packages/*/render.glb` (largest helios-trade-hub 5.4 MB, candle-fleet 4.9 MB, jump-ring 3.5 MB); desktop New Game launch 43.9 s. The Oct 16 D188 evidence ran against a local dev-server route (0 package GLBs, 48.6 MB total), so this is the first honest measurement of the deployed route. Handsets pass it now via the D188 scaled budgets + byte-progress fetch stalls, but a fresh phone pays a multi-minute first load and a cellular day can still exceed even the scaled library window. The opening should ship a lean required set and stream the rest (the FlightReadySet gate already exists; the eager staging storm is the cost). Evidence: `.devshots/mobile-deployment/oct23-prod-webkit/report.json` (payload), sizes mapped from local release trees; `.devshots/mobile-deployment/oct16-published-mobile/report.json` (dev-route baseline) | First New Game on any fresh device; cellular users | open (2026-10-24) |
| D241 | Residual sim-driven reds after the 2026-10-24 stale sweep (0662ce76a9 cleared 13 named suites; swarm-270-room-legendaries-4242, m3-career-cohorts and pq206-00-dreadnought-wing-cell green on re-run — pq206 needed the pooled-payload tap fix 81aa69d3c6 since a3b359bf0f recycles one combat:damage scratch per packet) | OPEN residue: (1) ceres ambush camera corridor — cohort holds ~1k WU out; entangled with in-flight foreign AI diffs (Row 491 intent cycle in src/ai/*), diagnose on a clean tree; (2) ceres Massline relatch kill ceiling — latch/lead/off-frustum-fire contract provable after the T1-line pin, but the 1120-tick kill window predates months of solution-gating physics; needs a bounded public-equivalent steering pilot or an honest retune, not a weakened assert. 2026-10-25 bisect evidence (rc-458-round1-budget, same family): FAILS on clean-HEAD git-archive export and PASSES at f175abc66d~1 — the regression is the landed X-02 raid wing itself. Instrumented probe: the now-live wing's fire morale-breaks the towed raider mid-lesson; the 33-hull fugitive then fled unlatched and was never restaged — a permanent stall, not a lost race. Fixed: _resolveRaidDone now restages an unlatched fleeing raider exactly like the >3000-WU drift case (latched fleeing = lesson in progress, untouched). Verified on the instrumented run: fresh raider respawned at ~150s. RESIDUAL still open: the scripted pilot still does not land the slam inside the 181s budget under live wing fire — the documented bounded-pilot/retune item; (3) 47-A authoritative hash — RESOLVED 2026-10-25: deliberate re-record landed. Field-by-field leaf diff on clean git-archive exports (golden 86656026fe vs HEAD) confirms the bisect attribution — 5a3c1298f0 (missions giverId/clientId null leaves) + save bumps 5f5dc3387e..v21 + dda2c2cc96 row-482 pulse retune (dmg 8->5, packet x5/8, warden regen reaches cap). 45 leaf diffs, ZERO pos/vel/rot drift; evidence in expected-envelope notes |
| D242 | Crucible swarm launch on this box's real GPU (`npm run player-truth -- --mode=swarm --gate --headed`, Intel D3D11; also the Browser pane on `sf-observe`) | Loading reaches 96% "Handing over flight control", then GAME START FAILED: "The first world picture could not be presented" (`holdOpeningPresentationUntilPaint` timed out with no world submit after handover; `openingFirstPictureReady` true, no console errors, adventure launches fine). Software-GL swarm runs reached play on 10-18; today's software-GL attempt stalled at the menu with the host at 211 MiB free, so the cause is unknown: GPU link stalls, host pressure, or a render-residency change | Every Crucible start on this hardware | open (2026-10-22) 2026-10-23 14:57Z: a separate Adventure seed4242 route handled FirstLight and exact NewGame/Launch, then returned to menu with the player-visible refusal: The opening flight materials did not finish preparing. Retry Launch; saved games are unchanged. opening first-picture preparation timed out. No pageerror; no picture accepted. This is a new current observation, not proof of the old swarm cause. Earlier same-day common Adventure route flew153.2simsec; no unchanged retry or performance claim. 2026-10-24: the Adventure first-picture refusal leg of this row is fixed — root cause was the fixed 20s/90s/120s startup walls meeting a 146MB opening payload (D251); startupPacing.js device-scaled budgets + byte-progress fetch stalls landed with the D188 fix, and the same public route now reaches flight at handset-class CPU throttle (.devshots/mobile-deployment/oct24-local-cpu4-green). The swarm real-GPU "first world picture could not be presented" leg stays open.  2026-10-24 lane-A triage: the owner phone lane is live on this row (883c55831f opening-gate budgets openingGateBudgetMs + first-picture preparationStage diagnostics now name the failing leg); no parallel fix. Stays OPEN until the next Crucible gate run reads the new stage diagnostic. |
| D243 | UI stage sky dome: `src/render/uiStage.js` `buildSky` (L960-1009; fragment shader includes `tonemapping_fragment` + `colorspace_fragment` at L1005-1006, no `dithering_fragment`; the `ShaderMaterial` has no `dithering: true`), drawn by `drawStage` (L1338) straight to the backbuffer for the title, station/berth, results and killcam stages | The smooth zenith-to-horizon sky gradient on those stages is written to the 8-bit canvas with no output dither at all: the new post-composite dither (`POST_DITHER_LSB`, `bloom.js`, 3eed312e0a) only covers the bloom/composite route, and these stages never go through it. Whether this shows as visible banding is UNPROVEN: nobody has shot it. | Title screen, station/berth, results, killcam | RESOLVED 2026-10-24 (`c87d4bcb18`). Verified on the real route via `probe-title-attract.mjs`: pre-fix amplified sky showed rectangular step artifacts and a gapped tonal histogram (157 levels); post-fix 240 distinct levels with zero histogram gaps, smooth gradient at 8x amplification. Fix: `dithering: true` plus the full include chain — `#include <common>` + `#include <dithering_pars_fragment>` before `main`, `#include <dithering_fragment>` after `<colorspace_fragment>` (the fragment chunk needs the helpers; the flag alone does nothing). Landed via filtered index patch — `uiStage.js` still carries a foreign lane's uncommitted bayTraffic hunks, untouched. |
| D252 | Deployed production menu: WebKit renderer stops answering before the menu becomes playable (`probe-deployed-mobile.mjs`, engine=webkit, iPhone 14 profile, no throttle) | On 2026-10-25 ~05:23-05:35Z, three consecutive probes of `https://spaceface-play-demo.vercel.app/` — including one on the identical webkit-2311 binary the earlier pass used — failed identically: the page boots, the boot ring draws, a new-game button appears in DOM at ~20-22 s behind the cinematic, then the renderer stops answering for 5 s at a stretch (intermittent at 12 s/47 s/67 s, permanent from ~110 s) and the menu never becomes playable inside 180 s; zero page errors, zero failed/critical requests. Chromium on the same URL an hour earlier passed the full route under cpu:4 throttle. Confound: the same probe passed `startupAndControls` at 04:21Z on the same deployment URL (`.devshots/mobile-deployment/oct24-prod-webkit/report.json`), so either the deployed artifact changed (deploys are manual) or the refusal is session-environment-sensitive on the WebKit-on-Windows port. Attribution unresolved. | First menu on iPhone-class WebKit — if real on-device this is a boot-loop refusal on Safari | OPEN 2026-10-25. Evidence: `.devshots/mobile-deployment/oct24-prod-webkit-r2`, `-r3`, `-r4` report.json. Next: run the identical probe from the owner/user session where the 04:21 pass was produced; if it refuses there too, bisect the deployed artifact, not the probe. |
| D253 | Swarm player-truth `vfx_coverage` — threats hidden p95 86% on the headed real-GPU gate (`npm run player-truth -- --mode=swarm --gate --headed`, run `scratch/player-truth/swarm-active-gate456/`) | In a live swarm fight the reader's offscreen VFX-hidden vs VFX-shown splits attribute p95 86% of on-screen threat pixels as covered by combat VFX (threshold ≤30%), while total VFX coverage stays low (p95 1% of screen, peak 7% with 70 combat layers lit) — VFX are sparse but sit directly on the brood/tracers. The same check read 0% on the historical software-GL `swarm-active` verdict, so this is either an emergent swarm readability defect (tracers/explosions riding the pack) or a real-GPU per-pixel-reader artifact; the working tree also carries a large uncommitted render-lane diff (`src/render/vfx*.js`, `vfxColorLightDirector`, `massline*`, `visualFactory`) that reaches the same layers. Unattributed between those three; not reachable by the RC-456 DOM/hit-stop diff. | Every Swarm firefight — threats obscured behind weapon/explosion pixels hurts the brood read | OPEN 2026-10-25. Evidence: `scratch/player-truth/swarm-active-gate456/verdict.md` (`vfx_coverage` FAIL, 167 splits), `trace.json.gz`, contact-sheet frames around sim 97.7 s. Next: grade the same run's `vfx_coverage` after the in-flight render-lane diff lands or on a clean tree — if it still reads ~86% p95, the cause is the swarm VFX itself (tracer/explosion sprites on threat positions) and the fix is coverage reduction, not a reader change. |
| D255 | Helix is the only faction without a house sting — `FACTION_STINGS` (src/audio/themeMatrix.js:181-195) covers 13 of 14 `BARK_FACTIONS` | `resolveFactionSting('faction_helix')` returns null and `_applyFactionSting` early-returns, so a Helix bark plays no house sting where every other faction's voice arrives with its signature. Silent audible asymmetry for exactly one house; surfaced by the D254 consensus review and routed here per §7 (themeMatrix.js is outside that packet's ownership). | Every Helix bark moment — the faction read loses its audio signature | RESOLVED 2026-10-25 — landed `sting('faction_helix', 'numbers_station', 523, 'sine', 'Helix')`: the numbers-station profile matches the house's uncanny-transmission ledger identity, 523 Hz sits clear of the existing 440/494 entries, and `themeMotifsAreDistinct().stings` stays true (pq-158-03 green). |
| D256 | `test/pq-166-02-five-catalogs.test.mjs` is red: `barkParityErrors()` returns 112 errors — `src/localization/barks.js` `T`/`HULL` rows cover only the 4–6 pre-fill base lines per cell while merged BARKS cells run 12–16 deep | Every fill-tail line shipped by the fill merge (PULSE-08, made fully live by D254) has no localized row, so non-English locales silently fall back to English radio text for most of every bark cell. The check went red when the fill corpus merged and is ungated (not in check:bundle or the check chain), which is how it stayed red unnoticed. The `|| line` English fallback is deliberate, so the defect is the missing localized rows and/or an oracle that cannot distinguish "untranslated tail" from "missing row". | Every localized player hears English radio on most bark lines — the parity contract is broken in the direction that hides it | OPEN 2026-10-25. Surfaced by the D254 consensus review round 29. Options: localize the fill tails per locale, amend `barkParityErrors` to tolerate deliberately-untranslated tails (and gate the test), or scope the parity contract to base lines only. Localization coverage is a content call, not a gate tweak. |
| D257 | `test/pq146-narrative.test.mjs` red at clean HEAD — 2 of 16 fail: the stunt-recognition bark submits at tick ~85 but surfaces at tick ~104 behind the `hullGhost:maera` commentary; the test asserts `delivered` at tick 90 | `8c4039e39d` (foreign merge, "chain-ear + hull-ghost") added Maera commentary that voiceArbiter serializes ahead of the stunt bark — the bark still delivers, just ~19 ticks later than the test's assertion window. Confirmed identical with the D254 packet's changes reverted; `src/ui/voiceArbiter.js` and the test are outside that packet's ownership. | Live stunt-recognition barks land ~19 ticks later than before when Maera commentary is queued — a timing/priority question, not a lost voice | OPEN 2026-10-25. Surfaced by the D254 consensus review round 41. Either re-time the test's assertion window to the arbiter's serialization or give recognition barks a priority lane ahead of ambient commentary — whichever matches the intended mix order. |

