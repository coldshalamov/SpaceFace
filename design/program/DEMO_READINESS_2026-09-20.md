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
| D38 | First arrival of a body can sit on screen undrawn while it loads / links shaders | RESHOT 2026-09-25 after the on-glass priority fix (`.devshots/frame-solid/2026-09-25T07-04-34-074Z.json`, same heavily contended host, ~141 ms p50 frames): missingFrames 203→11, stuckMissing 180→6, on-time appearance 0.29→0.75; the earlier ship offenders (pelican/atlas/mule, 32–94 stuck on `pipelinesPending` / `noMesh` / `compiling-pipelines`) are gone and no on-glass wait now carries a queue-starvation signature — the single residual offender is asteroid id 4, six stuck frames of `asset:loading`, i.e. its own GLB fetch (~0.9 s at this frame rate). What changed: a strict deadline-glass lane on every arrival queue — `pipelineReadiness` urgent compiles serialize ahead of still-queued ambient work (same-subject requests fold/join, `skipSharedBatch` keeps an urgent link out of foreign readiness batches), the authored upgrade queue re-grades R0_GLASS above target/hostile/ambient on every pick, `residencyOptionsForBoundary` marks on-glass compile + residency urgent, and the mesh-build drain hoists arrivals that crossed the glass between queue polls and admits them through a refused late-present gate. Fixture `test/frame-solid-glass-priority.test.mjs` pins each lane | Flight, first sight of a ship/station/rock | open — ordering is fixed and proven, but the authored composition lane is still serial through compile + upload (MEASURED 2026-09-25, owner's Intel laptop: queue mean 14 / busy 100 %, 1.3–7.9 s per ship job, `overlapAuthoredPipelineCompile` false in flight), so a first arrival's residual wait is its own compose/link/upload time, not other work. TRIED and parked 2026-09-25: letting flight composition overlap its GPU gate (cap 3) raised lane throughput but cost ~15 ms frame p50 in both back-to-back A/B pairs with no on-time gain (0.59 → 0.60), so one composition job is itself too heavy for a frame budget (patch `.devshots/parked/flight-compose-overlap-2026-09-25.patch`). Next: build_map §21.4 system 2 — profile one ship composition job and make it cheaper, then retry the overlap |
| D44 | Crucible: the wave-1 pack arriving after round zero still promotes its hulls into `GLTFKit_InstancePool` chunks inside the fight | ~18 × 4 KB `instanceMatrix` full uploads (+ chunk activation) land at the round-zero → pack boundary, seed 4242 (`.devshots/smooth-crucible-run9*.txt`). The launch warm builds one exemplar per hull, and a package candidate promotes only on the SECOND same-key owner, so the first live twin pays it. A twin-witness warm was tried 2026-09-25 and reverted: the second witness's async authored commit resolved after the pool census, so promotion still landed in-round, and it doubled launch warm work. Retro-pack uploads at the same boundary (~60) are fixed | Crucible round 1, the pack arriving | open — repro: `npm run probe:smooth-flight:crucible` with `SPACEFACE_SMOOTH_SETTLE_MS=40000`; count `InstancePool` bufferFullUploads after sim 45 s. Needs an owner-mapped admit trace of warm-exemplar commit order vs the pool census |
| D48 | The original minutes-long authored backend stall still lacks an identified decode/GPU site | Historical trade-hub `critical-hub:2` admission stayed running for 371–708 s. The 2026-09-30 hardening now bounds admitted waits, actually releases the serial slot and decode-budget leases, allows fresh admission, and rejects late retired-owner results; focused timeout/cancellation regressions prove those safeguards. They do not identify the backend site behind the historical stall or make an already-issued native graphics call preemptible. Evidence: `.devshots/runtime-witness/freeze-hunt-1790759343-before/{consolidated-green.log,owner-lifetime-corr-green.log}` | Authored asset admission on a loaded host | open — on recurrence retain the exact prepare phase, asset/root identity, renderer generation and graphics-context state; distinguish a rejected bounded job from a native main-thread stall before attributing the cause |


| D84 | First-arrival bodies can sit on glass with `noMesh` for tens of frames under a contended host — the mesh-build drain starves behind the serial authored queue | Two `probe-frame-solid` runs 2026-09-28 (`.devshots/frame-solid/2026-09-28T07-06-25-947Z.json`, `…T07-08-55-149Z.json`, compare vs `…2026-09-25T07-04-34-074Z.json`): run 1 — asteroids 35/17 stuck `noMesh` 1079/1075 frames at R0_GLASS+S0_EXACT+inGlassSet; run 2 — ships 320 (atlas) 57, 319 (mule) 50, 321 (mule) 13 stuck `noMesh` on glass. Distinct from retired D38: these entities never receive a mesh at all, so the visibility gate never sees them — a first-arrival mesh-BUILD starvation signature (upgradePending mean 8.5/max 24, busyShare 0.73–0.87 on this host), not a visible-but-undrawn window. wrecks 316/348 additionally show `rootHidden`+`asset:compiling-pipelines` which is the designed substrate-not-ready hold | Flight, first sight of traffic on a loaded machine | open — owner surface is the arrival mesh-build drain / live geometry admission in `renderer.js` (~13140–13260 + `_liveGeometryAdmissions`), adjacent to but separate from the retired D38 visibility gate; repro: `node scripts/probe-frame-solid.mjs --compare=<baseline>` on a contended host and read `noMesh` offenders |
| D85 | M3 career-gate residual reds that are NOT the hauler band (post-D80 state) | `check-m3-career-cohorts`: all 9 cells green after D80 (hauler 381/771/1330, hunter 40/64/39, prospector 111/135/130 cpm) but `multiSeedOk` stays false — hunter held-out seeds `c0b0b012`/`c0b0b022` die at 30m (-34.7/-57.1 cpm): sparse bounty boards on those seeds (`no_bounty_board`,`bounty_accept_failed`), tolls ~2.4-2.6k vs missionProceeds ~1.6-2.9k, `countered` outcomes paying 0. Same seeds were red at HEAD (-30.1/-72.4). `check-career-earnings-benchmark`: all per-career asserts green at 30m AND 90m, but the July-era `elapsedMs < 15000` budget cannot hold on this host (economy ticks profile ~50-240s under load; pre-D80 run was already 90s) | Gates stay red for non-hauler reasons; hunter seed fragility is a balance question (bounty density vs toll exposure), runtime is host/economy-tick weight | open — hunter half wants a balance ruling (is dead-seed bounty income the intended risk profile, or should dead<30 hold per-seed?); runtime half wants either a quiet host or an honest budget  **2026-09-30 sweep evidence:** dedicated writ walls (station_io_merc, station_expanse) are dockable at rep 0 but destination-rolled riskTier ≥3 rep-gates most offers a fresh hunter can see (+30/+150); hunterPublicRoute.js also lists stale station ids, so no_bounty_board conflates missing boards with gated offers. Direction: pin ≥1 low-risk offer per writ-wall epoch or add low-danger destinations **2026-09-30 polish-pass evidence + partial fix:** the "stale station ids" claim is wrong — all five route ids exist in SECTORS and get boards; the real structure is that `station_io_merc`/`station_expanse` are the game's only `missionProfile: bounty_board` stations (anchor `bounty_hunt`, dockable at rep 0) and neither is on the hunter route lists. LANDED: anchored boards now pin their defining job inside the Neutral standing band while the board faction has not Accepted the player (missions.js `_rollOffer` anchor risk cap) — a rep-0 operator always has one acceptible writ per writ-wall epoch; measured byte-identical on every cohort number (hunter seeds 116.33/-34.73/-57.1 unchanged), pure production gain. MEASURED, NOT landed: adding the walls to both HUNTER_BOARD_STATIONS lists resurrects the dead seeds (c0b0b012 -34.7→+334 cpm, c0b0b022 -57.1→+644) but overfeeds — default-seed hunter cells 416/457 cpm and c0b0b022 644 all breach the 400 implausible-dominant ceiling; wall pay/travel tuning belongs with the ruling, so the lists stay as they are. Also confirmed red at clean HEAD (pre-existing, same surface): `bounty-mark-posting` mark golden drift and the m3 `first15kAtMin` 51.69 pin (actual 45.79); `charon-bounty-board`'s lead+mix pins were re-scoped to procedural rows (authored Lung Run rows may lead/dilute a board) — values HEAD-identical |
| D90 | Broad CI red beyond `sim` — 12 more check commands fail on clean `master` | `static`: program-docs, check-ui-budgets, check-src-reachability, check-encounter-voice, depth-program-e1-encounters, depth-program-gt1-loot-audit, check-title-attract; `feel`: check-camera-director, check-gameplay-core. Second run also failed check-command-deck-ui + check-type-floor — the failing set appears to rotate between runs. All reproduced locally on `origin/master` c5b388008 via `node scripts/...` — no PR diff involved. Combined with D89 the whole `check` workflow is red, so new regressions land invisibly. **2026-09-28 progress:** check-sg05-runtime (already green at HEAD — fixed by interim landings), check-sg08-render-vfx (re-pinned overflow thrust to OverflowRibbonJets, `d33e5fd66`), check-phase0-slice-contract (classified crucible seed-counter `Math.random`, `196151ad9`), check-arcade-structural-fx (restored tumble collision shear burst suppressed by `583d7e248`, `5f57aa92a`) — all four verified green on a clean-HEAD worktree. **2026-09-28 feel group resolved:** check-gameplay-core re-pinned to landed behavior (volatile-bucket cadence wait `d75759b9e`, flight-mode gate-toll fixture `a483a6970`, combat-stick toast `98dcd2e68` — `b4057487b`) and a genuine nozzle regression fixed (`5d0729001` published empty nozzle slots — `cf67d62a0`); check-camera-director green locally (was not reproducible). `node scripts/check-ci-report.mjs --group=feel` → 27/27 PASS on this tree. **2026-09-29 wave-2/3 resolved:** static-3 — miningHud DOM crash (`a6e831ba5`), sf.mjs JSON stdout truncation (`9f2cb70d5`), mission deadline-expiry clientless fix (`3d1c3054e`), R2/S3 test re-pins (`b339de8c7`), K1 env-machinery mouth crash (`d9ba5c266`); static-1 — place_release encode pipeline (`34e8a05f9`), automationPanel native titles (`b6d7447ce`); browser — serial-route GPU-queue starvation during boot admission paced (`c48d13648`), signal.cue lane budget (`5a06e86ce`), dock pointer-field latency (`def5cd899`), authored-assets probe browser discovery (`5f3c898d3`); workflow — browser sharded 2× (`6980d12d8`), blobless full-history fetch (`7e9d5d638`), headed-capture occlusion throttling (`a7694369d`). **Structural race on `check-ui-budgets`:** `baseline:stale` compares `uiSourceDigest` (src/ui+styles+src/core+src/render) against the committed baseline — any commit to those roots by ANY lane re-reds static-2 until someone re-shoots headed (`capture-ui-matrix --headed --budgets-out=test/ui-frame-references/budgets.json`, ~25min filtered). UI/render committers must carry the re-shoot or CI flaps. 2026-09-30 five-unit batch: baseline still fails Ceres topology and legacy/V3 golden paths on pre-batch history as well as the working tree; V3 continuation remains D109. Focused five-unit tests and production bundle pass. Logs: scratch/build3-inference2-baseline.log and scratch/build3-inference2-bundle.log. | Demo build health — standing red CI masks real breakage ahead of the demo | open — remaining: bar-mission-readiness (Rook bounty) in flight; ui-budgets stale race is per-commit convention, not fixable by gate |
| D99 | Ship collider shape derives from `visuals.proportions`, so a "visual-only" hull re-proportioning silently changes hitboxes | `rapierCollisionWorld.js:136-139` builds the Rapier collider from `resolveCraftProportions(entity)` — the same `visuals.proportions` a 2026-09-30 foreign lane shrank on the starter hulls (`length` 1.72→1.35 etc.). Consequence on the dirty tree: `pq206-01-swarm-pass` "a burst must land" — first seen on seed 8008, now failing on seeds 4242/13502/47 as well (2026-10-01 sitting) — (smaller player collider → the opening pass misses more), plus `crucible-swarm-bars`/`crucible-swarm-handling` stat pins red at clean HEAD `e2a850c39` and `massline-elastic-whip-head` (manual cut 43.77 launch) riding the same package — the massline red was separately adjudicated 2026-09-30 as a stale test pin (the whip's designed player-cut energy spend), not this package | Swarm opening threat + every hull's effective hitbox vs its visible silhouette | open — either decouple collider dims from `visuals.proportions` (author `collisionRadius`/shape explicitly) or the PQ-176 lane confirms the new hitboxes are intended and re-derives the burst/stat pins with a ruling |
| D102 | Render admission during opening/save/Continue or teardown | Caught late color-pipeline compile: null `compileScenePipelines` at `renderer._compilePostRoute` (2026-09-29). Additional 2026-09-30 evidence: native seed-47 launch exact-target touch reaches null `geometry.id` in Three `WebGLGeometries.get` via `openingGpuAdmission.touchSubjectOnExactTarget`; browser save/Continue smoke also warns `liveState.render.prepareAuthoredGpuResidency is not a function`. Native flight/fire/pause/F5/F9 completed with zero frame errors and both playable routes passed 16/16; player impact and whether these failures are stale-owner cancellation remain unconfirmed. Evidence: `.devshots/runtime-witness/freeze-hunt-1790759343-before/{lead-stability-after.json,gate-playable.log}` | Opening or late asset admission | open — trace the exact subject/geometry and renderer-generation provenance at the failed touch/admission; do not equate these distinct warning fingerprints or claim a frozen picture from a warning alone |
| D104 | Remaining cold save/Continue timeout after source-framing correction | `gameServer.cjs`'s stat/stream length race is corrected: controlled browser probes now receive complete growing/shrinking modules and automatically finish boot. The real-game run reached menu, flight, controls and save without exceptions or parse failures, but Continue timed out while module requests remained pending | Cold save/Continue | open — the remaining timeout's cause is unconfirmed; inspect the captured pending requests and boot phase before changing budgets. Evidence: `.devshots/startup-reliability/playable-observed.txt` and `observer.json`; framing red/green proof is in `browser-race-{red,green-observed}.json` |
| D109 | Live v3 save/Continue during active contact does not resume bit-identical — the rebuilt Rapier world lacks engine history the live world carries | Reproduced on the real sim path: `node scripts/sf-sim.mjs compare 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.v3.expected.json --reload-at 60 --flight-system v3` → `firstDivergentTick 60`. Verified: saved entities, rebuilt bodies and the tick-61 command are bit-identical, yet the first post-rebuild `world.step` differs by exactly one f32 ulp (`vel.x` 5.845751762390137 vs 5.845752239227295 on both the player and the payload it pushes); as the tape's steering input changes the contact geometry the in-step gap reaches ~7.6e-5 and amplifies under sustained contact. World snapshot ~122 KB rebuilt vs ~202 KB live proves accumulated narrow-phase state is absent after rebuild; the leading hypothesis — unverified — is that the missing warm-start/contact-manifold history is what shifts the first step. A 1e-4 planar canonicalization attempt pinned ticks 61–64 but was rejected (cannot reach manifold divergence, adds per-tick cost). Context, not the defect: the economy market cache (`lastMid`/`lastBuy`/`lastSell`) also differs ±1 at the reload tick from a restore-time recompute — a pre-existing serialize-fidelity artifact that heals at the next economy pulse | Save/Continue while a body is in contact — resumed motion can drift from the uninterrupted run over seconds | open — investigate what engine metadata the snapshot/rebuild path retains vs loses and whether manifold reconstruction or an accepted restart is the right answer; do not mask it with compare tolerance |
| D111 | Owner-reported permanent Adventure freeze near the Nav Beacon, first tether lesson (2026-09-30) | Owner screenshot holds at speed 216, tutorial 1/12, Training Derelict 249 WU. Exact permanent freeze did not recur in isolated native Intel seed-47 flight/fire/pause/save/load: 61 samples, zero frame errors, no simulation quarantine or context loss; Browser and Electron playable routes each passed 16/16. The separately reproduced extreme-spin SG02 hang and environment-size shader relink are fixed, but neither is attributed to this screenshot without the frozen state's evidence. Capture host was 62% CPU busy, 30,673/32,277 MiB RAM used. Evidence: `.devshots/runtime-witness/freeze-hunt-1790759343-before/lead-checked-verdict.json` | Ordinary Adventure flight | open — on recurrence retain `window.SF.loop.getDiagnostics()` (original `simulation.closeCauseSite`), witness, time-effect requests and graphics-context state at the frozen moment; discriminate a stopped scheduler, simulation exception, native stall and intentional pause rather than adding catch-and-continue or silently resetting the world |
| D112 | Shipworks and Settings at a 390px viewport overlap navigation, labels and readouts; Shipworks rack also lies beyond the initial viewport | Reproduced in real screen benches; desktop controls usable. ORRERY responsive layout follow-up, not bomb or assist logic. Evidence: `.devshots/ui-bench/nxb-009-shipworks-ready-mobile.png`, `.devshots/ui-bench/verb-15-settings-gameplay-mobile.png` | Station Shipworks / Settings responsive layout | open — ORRERY lane |
| D113 | `scripts/flight-look.mjs --aim=station_helios` (and `--aims=station_helios,…`) hangs after `queue drained` | Twice on 2026-09-30 on the real-GPU capture path: the next `page.evaluate` (`centreOn`) never returns, so the page's main thread stopped answering once the player was parked 260 WU off Helios Station. A frame probe that parks 140 WU off the same hub kept rendering (37–87 ms frames), and `--sector=` captures without an aim work. Unknown whether this is the capture tool or the D111 freeze reproduced by a relocate | `scripts/flight-look.mjs` aim path; possibly the same cause as D111 | open |
| D116 | Cold parallax materials still cause a long native graphics hitch during startup | Settled desktop play and native recovery both complete, but their diagnostics record `bloomScene` taking 1418.6–1715.4 ms on `Parallax_FarDust_Instances`; the native material census includes UV-bearing program keys and UV-less sibling keys. This is an observed startup hitch, not evidence of the owner's permanent freeze, and its exact program-state transition remains unconfirmed. Evidence: `.devshots/runtime-witness/freeze-hunt-1790759343-before/{final-playable-desktop-settled.log,hardening-recovery-final.json}`. | Native startup / first parallax draw | open — trace first-draw material and geometry state against the warmed program keys; warm the actual variant without reducing parallax quality |
| D117 | The UI budget baseline capture wedges instead of minting, leaving `check:ui:budgets` red as baseline:stale | The ui-budgets-remint workflow (run 36995027056, cancelled at ~3h) and its re-dispatch (37005862872) both sat in "Mint the budget baseline (headed Chromium under xvfb)" past an hour with no progress; a local headed `node scripts/capture-ui-matrix.mjs --budgets-out=test/ui-frame-references/budgets.json` on the owner's Windows host also produced no output for 40+ minutes. Something since the Oct-1/2 boot-and-screen commits changed a surface's settle so the capture matrix never finishes. Every other check group is green on master as of 2026-10-02; this one check is the remaining red, and the digest cannot be updated without a real mint (editing the digest alone would assert old numbers were shot on new sources). | `check:ui:budgets` / the remint workflow | open — run capture:ui-matrix with per-screen progress logging to find the surface that never settles (suspect a boot/settle handshake broken by the Oct-2 boot-slicing or screen work), fix the wedge or add the capture a settle deadline, then re-mint |
| D117 | Sim telemetry goldens drifted from their envelopes on 2026-09-30 evening tree | `npm run check:baseline` fails `sim`, `sim-v3`, `sim-v3-compare`, `pq020-ceres-topology`; the 47-A authoritative hash reads `e517a97b…` against expected `8b15ec7f…`. The only sim-relevant commit in the window is 4fcc66a4d (fix(flight): a damaged drive still steers, with less thrust, 16:49); the dirty tree's own hunks are render/bootstrap-only, so either the flight change moved the envelope and the goldens await a deliberate re-pin, or the drift has another cause. A PIC-13 render unit (glow transport) ran green beside these failures and cannot reach the sim hash | `src/core/flight/driveAuthority.js` (4fcc66a4d) vs `test/*.expected.json` 47-A / sim-v3 envelopes | open — owning flight lane: re-pin the envelopes deliberately if the new authority is intended, or fix the drift; do not treat a silent golden as green ; 2026-10-02 sweep adds a candidate for another cause: untracked src/data/scanClues.js was already imported by HEAD scanner.js and onboarding.js carried uncommitted sim-path hunks — both can move sim-derived digests while the dirty tree is in flight; recheck this row once those lanes land |
| D126 | World-site adjacent suite red ×5: asset pins, hull roster, and a render-animation check | `node --test test/world-site-*.test.mjs` (2026-10-01): `world-site-assets.test.mjs` fails twice on pinned GLB bytes/sha256 (`place_helios_relay.glb` reads 1013152 vs expected 12970876 bytes; `place_landmark_wreck_cathedral.glb` hash drifted, same 18890564-byte class) — local asset files differ from release-manifest pins. `world-site-map-traffic.test.mjs` fails twice on "every canonical player-selectable hull participates" — roster reads 15 against a pinned 14, so a hull was added without re-running the corridor assertions. `world-site-presentation.test.mjs` fails on "full presentation animates from simulation time" — `relay_status` fixture scale identical (0.72) at t=0.0 and t=0.25 under full motion. Reproduced with NXB-024 hunks stashed; none of the failing files touch kernel receipts/projection, descriptors, or the map history layer | World-site asset pins / Cathedral corridor hull roster / presentation animation | open — owning lanes: re-pin GLB hashes if the rebuilt assets are intended, add hull 15 to the corridor tables, and check the `relay_status` pulse amplitude on the render path |
| D129 | Native seed-47 Adventure flight on the owner's Intel GPU | Short no-screenshot CPU witnesses still report continuous hitching: 168/168 frames at 66% whole-machine CPU, then 153/153 at 41% CPU. Physics is the largest measured simulation contributor; presentation/render/UI also consume the frame. The conservative picking prune avoids impossible-to-win triangle work but did not establish a frame-pacing fix. Evidence: .devshots/runtime-witness/demo-sweep-physics/ and demo-sweep-picking-after/ (report.json, report.md, flight.cpuprofile) | Sustained demo flight | open — profile and reduce the live physics/catch-up and presentation costs without dropping visual quality; do not attribute the owner's permanent freeze to these hitch samples |
