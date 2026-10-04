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
| `.08` **The fifteen-minute demo** | A stranger plays it end to end | The scripted path in §5 plays without a freeze over 100 ms and the owner signs the five bars |

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

The screen rows below were each seen on a real screen (`node scripts/ui-bench.mjs --shot=<id>`,
real DOM over a still). Rows marked **bench** may be fixture-only; the owner of the row proves
which before closing it.

| # | Where (shot id / route / system) | What a stranger sees | Demo step | State |
|---|---|---|---|---|
| D24 | renderer resource residency across save/load/dock cycles | DIAGNOSED + FIXED 2026-09-25 (`4365769c6`), pending a host that can complete the browser re-soak. Retained class named by the `.devshots/dock-leak-{warm,end}.heapsnapshot` diff: `LoadedRenderPackage` dead generations — 27→54 while the content-hash loader cache held only 22 entries (≈39 orphaned generations ≈ the +749 MB of `JSArrayBufferData` decoded geometry/compressed-texture payloads; `CompressedTexture` +867, `Group` 160→377 riding the same trees). Retaining path: `runtime.assets` (`url::slot` task map) → fulfilled Promise → assembled record → package — residency evicts by content hash via the sector-exit/in-sector `releaseUnreferencedCacheOwners` sweep, but a stale task cleared only on a same-URL re-request, so every generation evicted between requests stayed pinned for the session. Fix: `LoadedRenderPackage.onStale()` fires at markReleased/markEvicted; `loadAuthoredRenderPackagePilot` registers a listener dropping its exact `runtime.assets` task, and the late-observer retry also covers released-but-cached generations. Headless A/B over the real loader/residency/pilot path (8 evict/reload cycles of distinct ~8 MB packages, `.devshots/probe-d24-stale-package{,-head}.mjs`): dead generations collected 0/8 → 7/8, stale `runtime.assets` keys 8 → 0, retained `arrayBuffers` 64 → 8 MB. Regression: `test/render-package-loader.test.mjs` D24 evict/release rows + `test/asset-runtime-disposal.test.mjs` released-generation retry. Original slope evidence: `.devshots/browser-soak-200` +411 MB post-GC (~2 MB/cycle), geometries 1090→1519, textures 811→929 | Long play session | fixed-pending-resoak — `SF_SOAK_HEAP_SNAPSHOTS=1 node scripts/check-release-soak-browser.mjs --cycles=40` on an uncontended host (this box's authored-visual gate flakes at the F9 load-retry — d24-heap-verify/-b runs both landed `load-retry-start-failed`); when the start/end heapsnapshot diff shows `LoadedRenderPackage`/`JSArrayBufferData` flat, delete this row. Residual suspects if a smaller slope survives: dynamic-buffer owner records retaining VFX sprite buckets (`uDensityFilm` uniform-held Data3DTexture), the ShaderMaterial.uniforms texture-disposal gap in renderer/precompile teardown |
| D48 | The original minutes-long authored backend stall still lacks an identified decode/GPU site | Historical trade-hub `critical-hub:2` admission stayed running for 371–708 s. The 2026-09-30 hardening now bounds admitted waits, actually releases the serial slot and decode-budget leases, allows fresh admission, and rejects late retired-owner results; focused timeout/cancellation regressions prove those safeguards. They do not identify the backend site behind the historical stall or make an already-issued native graphics call preemptible. Evidence: `.devshots/runtime-witness/freeze-hunt-1790759343-before/{consolidated-green.log,owner-lifetime-corr-green.log}` | Authored asset admission on a loaded host | open — on recurrence retain the exact prepare phase, asset/root identity, renderer generation and graphics-context state; distinguish a rejected bounded job from a native main-thread stall before attributing the cause |


| D85 | M3 career-gate residual reds that are NOT the hauler band (post-D80 state) | `check-m3-career-cohorts`: all 9 cells green after D80 (hauler 381/771/1330, hunter 40/64/39, prospector 111/135/130 cpm) but `multiSeedOk` stays false — hunter held-out seeds `c0b0b012`/`c0b0b022` die at 30m (-34.7/-57.1 cpm): sparse bounty boards on those seeds (`no_bounty_board`,`bounty_accept_failed`), tolls ~2.4-2.6k vs missionProceeds ~1.6-2.9k, `countered` outcomes paying 0. Same seeds were red at HEAD (-30.1/-72.4). `check-career-earnings-benchmark`: all per-career asserts green at 30m AND 90m, but the July-era `elapsedMs < 15000` budget cannot hold on this host (economy ticks profile ~50-240s under load; pre-D80 run was already 90s) | Gates stay red for non-hauler reasons; hunter seed fragility is a balance question (bounty density vs toll exposure), runtime is host/economy-tick weight | open — hunter half wants a balance ruling (is dead-seed bounty income the intended risk profile, or should dead<30 hold per-seed?); runtime half wants either a quiet host or an honest budget  **2026-09-30 sweep evidence:** dedicated writ walls (station_io_merc, station_expanse) are dockable at rep 0 but destination-rolled riskTier ≥3 rep-gates most offers a fresh hunter can see (+30/+150); hunterPublicRoute.js also lists stale station ids, so no_bounty_board conflates missing boards with gated offers. Direction: pin ≥1 low-risk offer per writ-wall epoch or add low-danger destinations **2026-09-30 polish-pass evidence + partial fix:** the "stale station ids" claim is wrong — all five route ids exist in SECTORS and get boards; the real structure is that `station_io_merc`/`station_expanse` are the game's only `missionProfile: bounty_board` stations (anchor `bounty_hunt`, dockable at rep 0) and neither is on the hunter route lists. LANDED: anchored boards now pin their defining job inside the Neutral standing band while the board faction has not Accepted the player (missions.js `_rollOffer` anchor risk cap) — a rep-0 operator always has one acceptible writ per writ-wall epoch; measured byte-identical on every cohort number (hunter seeds 116.33/-34.73/-57.1 unchanged), pure production gain. MEASURED, NOT landed: adding the walls to both HUNTER_BOARD_STATIONS lists resurrects the dead seeds (c0b0b012 -34.7→+334 cpm, c0b0b022 -57.1→+644) but overfeeds — default-seed hunter cells 416/457 cpm and c0b0b022 644 all breach the 400 implausible-dominant ceiling; wall pay/travel tuning belongs with the ruling, so the lists stay as they are. Also confirmed red at clean HEAD (pre-existing, same surface): `bounty-mark-posting` mark golden drift and the m3 `first15kAtMin` 51.69 pin (actual 45.79); `charon-bounty-board`'s lead+mix pins were re-scoped to procedural rows (authored Lung Run rows may lead/dilute a board) — values HEAD-identical |
| D102 | Render admission during opening/save/Continue or teardown | Caught late color-pipeline compile: null `compileScenePipelines` at `renderer._compilePostRoute` (2026-09-29). Additional 2026-09-30 evidence: native seed-47 launch exact-target touch reaches null `geometry.id` in Three `WebGLGeometries.get` via `openingGpuAdmission.touchSubjectOnExactTarget`; browser save/Continue smoke also warns `liveState.render.prepareAuthoredGpuResidency is not a function`. Native flight/fire/pause/F5/F9 completed with zero frame errors and both playable routes passed 16/16; player impact and whether these failures are stale-owner cancellation remain unconfirmed. Evidence: `.devshots/runtime-witness/freeze-hunt-1790759343-before/{lead-stability-after.json,gate-playable.log}` | Opening or late asset admission | open — trace the exact subject/geometry and renderer-generation provenance at the failed touch/admission; do not equate these distinct warning fingerprints or claim a frozen picture from a warning alone |
| D111 | Owner-reported permanent Adventure freeze near the Nav Beacon, first tether lesson (2026-09-30) | Owner screenshot holds at speed 216, tutorial 1/12, Training Derelict 249 WU. Exact permanent freeze did not recur in isolated native Intel seed-47 flight/fire/pause/save/load: 61 samples, zero frame errors, no simulation quarantine or context loss; Browser and Electron playable routes each passed 16/16. The separately reproduced extreme-spin SG02 hang and environment-size shader relink are fixed, but neither is attributed to this screenshot without the frozen state's evidence. Capture host was 62% CPU busy, 30,673/32,277 MiB RAM used. Evidence: `.devshots/runtime-witness/freeze-hunt-1790759343-before/lead-checked-verdict.json` | Ordinary Adventure flight | open — on recurrence retain `window.SF.loop.getDiagnostics()` (original `simulation.closeCauseSite`), witness, time-effect requests and graphics-context state at the frozen moment; discriminate a stopped scheduler, simulation exception, native stall and intentional pause rather than adding catch-and-continue or silently resetting the world |
| D112 | Shipworks and Settings at a 390px viewport overlap navigation, labels and readouts; Shipworks rack also lies beyond the initial viewport | Reproduced in real screen benches; desktop controls usable. ORRERY responsive layout follow-up, not bomb or assist logic. Evidence: `.devshots/ui-bench/nxb-009-shipworks-ready-mobile.png`, `.devshots/ui-bench/verb-15-settings-gameplay-mobile.png` | Station Shipworks / Settings responsive layout | open — ORRERY lane |
| D130 | Sustained Adventure flight still has simulation/render work to reduce | Owner 2026-10-02: other agents run on this machine, so wall-clock performance reads are not authoritative; use code judgment for optimizations and prioritize overall bugs/playability. Useful qualitative changes now landed: sleeping bodies skip post-step WASM readback (7a66422e0), off-camera bodies stop drawing, bloom readiness skips invisible subtrees, canceled admissions release capacity, and shader variants warm before visible draws. Prior runtime witness identifies simulation/Rapier, bloom scene work and submission as investigation sites; its shared-host timings do not establish a capacity verdict or before/after speedup. | Sustained demo flight | open — reduce unnecessary solver/synchronization, traversal, allocation and submission work while preserving authored quality. No smooth-60-Hz or measured-speedup claim from these shared-host runs. |
| D143 | `test/pq-029-03-npc-heads.test.mjs` — the boot half is fixed; two Ceres-ecology assertions remain | First failure layer was `resolveRuntimeManifest: missing system "swarmJuice" for init order` — SWARM-02 (`259e0cf9c`) registered `swarmJuice`/`swarmJuiceHud` in the authoritative manifest + registry but not in `nodeSystemFactoryTable.js`, so every Node production-fidelity boot threw before tick 1. That layer is fixed (table rows added, Node boot materializes clean). What remains is real sim behavior: `Ceres salvage and its scavenger spawn at the authored field in global space` (the wreck-field ecology supplies no scavenger — `actual: undefined`) and `Ceres ordinary traffic uses tractor, whip, and coupler within 10 min` (tractor + frame_coupler `MISSING` across 600 s; census shows jobs running but only one `att_000001` elastic_whip tow, `role: null` on most). `src/world/farActorTable.js` + `src/systems/world.js` carry in-flight foreign edits in the tree — the residuals may be mid-landing; whoever closes this should re-run at a clean far-actor HEAD before bisecting deeper. Repro: `node --test test/pq-029-03-npc-heads.test.mjs` (the census test takes ~6 min of sim) | Ordinary Ceres traffic — the PQ-029 head census: a demo player flying Ceres sees NPCs that never tow | open — adjudicate after the in-flight farActorTable/world edits land whether the scavenger spawn + tractor/coupler traffic gaps are real regressions or mid-refactor dirt |
| D155 | `test/pq019c-heist-mission.test.mjs` 'no patrol in range is a recorded outcome' + `test/pq019-facility-embodiment.test.mjs` 'Tethys exposes three ordinary delegated Atlas POIs' — both red at clean HEAD | Found 2026-10-06 while landing row 85; both reproduce identically on a detached clean-HEAD worktree (junctioned `node_modules`), so they are landed regressions, not in-flight dirt. (a) `no patrol`: `entityList.length <= before + 1` fails — entities beyond the capsule appear between scene boot and the theft latch on committed code. (b) `Tethys exposes`: `world.activeSector.pois` contains a runtime-owned projection whose `poiId` matches a delegated PQ-019 facility POI — the "no second marker" contract `world.js` documents. Repro: `node --test test/pq019c-heist-mission.test.mjs test/pq019-facility-embodiment.test.mjs` | Heist-sector world composition — a duplicated marker beside a physical facility is a map/HUD artifact a demo player can notice | open — neither is in the row-85 diff family; bisect the entity-count growth and the `runtimeOwned` poi projection against committed history |
| D157 | `opening.plan` skips with `productionBoundary:missing-or-unverified-blocking-content-hash` on every New Game boot (drawLeaves=88) | Seen 2026-10-03 while verifying the live-sector-cook boot fix; `blockingRootsHaveVerifiedBoundaryHashes` fails in `openingSubmissionPlan.js` (~line 1053), meaning at least one blocking root admits without `contentHashVerified === true`. `src/render/renderPackageManifest.js` carries a 578-line foreign in-flight rewrite (288+/288-); the flag is minted from manifest/package admission info upstream of this file, so the rewrite is the prime suspect — not independently reproducible at clean HEAD yet (worktree probe could not boot for environmental 404s on junctioned node_modules). Non-blocking in practice: New Game reaches `mode: 'flight'` regardless; the skip only disables the opening-submission fast path. Repro: `node scripts/probe-runtime-witness.mjs` → opening ledger `opening.plan 0ms skipped` | Opening frame quality — the plan skip means the production boundary's blocking roots are not hash-verified, so first-flight draws land unverified | open — re-check after the renderPackageManifest lane lands; if the flag still fails, find which blocking root's boundary lacks `contentHashVerified` and whether the manifest stopped publishing it |
| D160 | Crucible: the materializing pack still pays ~60 authored-geometry full uploads inside the fight | Live-covered sample 2026-10-03, seed 4242, Intel D3D11: the wave-1 `wasp_swarmer` twins materialized inside the measured window (+26.6 s ×4, +27.3 s ×5) with `shaderLinks +0` and zero `InstancePool`/`instanceMatrix` uploads (D44's signature is gone), but ~60 `bufferData` uploads land at +29 s — `GLTFKit_ship_wasp` `Retro_*` position/normal/uv/index attributes plus `GLTFKit_BoundsProxy` pieces. Same size class and same boundary as the ~60 retro-pack uploads the D44 row marked fixed, reappearing on the current roster. The crucible warm's keep-set instantiation is by design (`records:16, instantiated:11`); the residual is the live twins' own geometry objects uploading at first draw rather than reusing the warmed package's resident buffers. Evidence: `.devshots/smooth-crucible-d38d44-verify-2.txt` | Crucible round 1, the pack arriving | open — decide whether live pack twins should share the warm package's resident geometry (buffer residency is per-object) or whether the retro attribute set is simply missing from the warm's buffer census; measure the +29 s frame cost on a quiet host before sizing a fix |
| D162 | `scripts/check-market-chart.mjs` — `cmdty_scrap_metal opening history has visible integer-price movement` red | Seen 2026-10-03 during the INFERENCE batch: two independent sittings verified the identical failure on unmodified `economyCycles.js`/HEAD, so it is landed behavior, not in-flight dirt. The seeded station-history check asserts the scrap-metal opening series shows integer-price movement; it currently does not. Repro: `node scripts/check-market-chart.mjs` | Market price history — a chart the demo player opens showing a flat/quantized opening series | open — adjudicate whether the opening history generation lost its integer-movement term or the pinned expectation drifted; do not repin to hide it |
| D164 | `test/pq022-relay-reauthor-h1-manifest.test.mjs` — 'the relay selector retains only three prescribed shots and gates each runtime before launch' red | Seen 2026-10-03 during the INFERENCE batch; fails on clean HEAD at the `RELAY_ONLY` assertion (line 131). Sibling tests (paired manifests resolve, commandArgs alter digests, consumed-claim ledger, cross-runtime drift) all pass. Repro: `node --test test/pq022-relay-reauthor-h1-manifest.test.mjs` | Relay re-author path — the prescribed-shot retention gate, an h1 manifest contract | open — adjudicate whether the selector's retained-shot census grew (new legitimate shot) or the three-shot bound broke |
| D166 | `news:headline` has no consumer — eight systems publish into the void | Found by the cross-area polish pass (2026-10-03): `news:headline` is emitted by aceMemory.js:617/:1324, aftermathWrecks.js:804, custodyConsequences.js:198, e1EncounterRuntime.js:225, nemesisSignals.js:25, pirateRumor.js:264/:308, but the only news consumer, `src/ui/marketNews.js`, subscribes only `news:publish`, and `news:headline` is absent from the chronicler FACT_EVENTS table. Three sites treat it as live: missions.js:861 maps `news:` onto it, economy/freightCausality.js:425 says "for marketNews / news:headline consumers", and encounterDirector.js:1948 avoids publishing it to prevent "double-publishing the same intentId". Verified by emit/listen cross-grep over src+test | Station news board / the storyteller — faction victories, pirate comebacks, nemesis resolutions and aftermath headlines never reach the player's news surface | open — decide the consumer: subscribe `news:headline` in marketNews (dedupe by intentId) or migrate the emitters to `news:publish` after checking the payload shape; both marketNews and aftermathWrecks carry protected in-flight work |
| D167 | `field:richSeamMissed` has no consumer — a missed rich seam is silent | Found by the cross-area polish pass (2026-10-03): emitted from fieldDepletion.js:717 and traffic.js:2039/:11047 (owner_invalidated/owner_lost) with zero listeners in src/ or test/; the sibling `field:depletedChanged` IS consumed. Verified by emit/listen cross-grep | Mining loop — a rich seam expiring unclaimed passes without any player-visible consequence | open — add the intended consumer (a comms/bark line or chronicler fact when a seam is missed) or delete the three emits; traffic.js is claimed by grok-oct3 |
| D168 | hullFracture pending-slam residual — a stale note can still suppress one aftermath shard | Partial fix landed by the polish pass (`10360a9ff`: insert-time eviction at `PENDING_SLAM_KEY_CAP=512` + age-out by the note's own tick, both with focused test). The remaining edge is the raw read at aftermathWrecks.js:1470 — `peekPendingSlam(marker.victimId)` without a freshness gate, so in a quiet sector a 12-tick-stale note from an unrelated earlier slam can eat one arena shard at kill time (the anonymous wreck still spawns; presentation-only). Repro: read the hullFracture.js:25-28 contract against the aftermathWrecks call | Aftermath wreck shard spawn — a gun kill right after an unrelated slam can miss its fracture-shard dress | open — freshness-gate or consume-if-fresh at the aftermathWrecks call site (file claimed by grok-oct3; the hullFracture.js side is ready and unprotected) |
