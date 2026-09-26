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
| D36 | Works-screen tab can stop scheduling entirely under host contention — timers AND frames for 60 s+ | `check:asteroid-theater` §7 runs today: while the harness's own `page.evaluate` polling kept returning (CDP interjects), the works tab serviced neither `setTimeout` nor the rAF frame loop for the full 60 s settle window — the conduit mount sat at `{"generation":4,"phase":"loading"}` with the D34 watchdog armed but unrunnable twice (runs at ~11:20 and ~13:10Z), and in the same window the §7 crate stage froze mid-read and §11.7 measured keyboard bursts (one tap scrolling 4 cells) in other runs. D34's watchdog now drives off both `setTimeout` and the frame tick, so when EITHER scheduler lives the mount retries and fails loudly — but a tab that runs no scheduler at all defeats any in-page remedy. Suspects: Chromium main-thread task starvation from GPU/compositor backpressure on this heavily contended host (Devin/claude/Cursor build agents + two orphaned `chrome-headless-shell` processes were live), or a long rAF callback never returning. A player on an overloaded machine sees a frozen mine screen with no recovery | Mining screen (and any screen) under heavy host load | open — repro: `node scripts/check-asteroid-theater.mjs` repeatedly on the contended host until §7 reports the mount stalled in `loading` with the watchdog unheard (intermittent, ~2 of 12 runs today); green runs prove the tree is sound, so re-run rather than re-fixing D34. A page-side liveness probe (e.g., a heartbeat the screen can surface when neither timers nor frames advance) would make this visible on glass FALSIFIED MODEL 2026-09-25 (do not retry): renderer backgrounding by the harness. `check:asteroid-theater` now launches with the shared background-execution switches plus `--disable-features=CalculateNativeWinOcclusion`, and §7 still stalled in 3 of 8 runs (2 with the watchdog unheard); an instrumented run read `visibilityState=visible`, `hasFocus=true` at the §7 wait. Next model: renderer main-thread / timer starvation under CPU contention (logs `.devshots/d36-{baseline,fix}-*.log`). |
| D38 | First arrival of a body can sit on screen undrawn while it loads / links shaders | RESHOT 2026-09-25 after the on-glass priority fix (`.devshots/frame-solid/2026-09-25T07-04-34-074Z.json`, same heavily contended host, ~141 ms p50 frames): missingFrames 203→11, stuckMissing 180→6, on-time appearance 0.29→0.75; the earlier ship offenders (pelican/atlas/mule, 32–94 stuck on `pipelinesPending` / `noMesh` / `compiling-pipelines`) are gone and no on-glass wait now carries a queue-starvation signature — the single residual offender is asteroid id 4, six stuck frames of `asset:loading`, i.e. its own GLB fetch (~0.9 s at this frame rate). What changed: a strict deadline-glass lane on every arrival queue — `pipelineReadiness` urgent compiles serialize ahead of still-queued ambient work (same-subject requests fold/join, `skipSharedBatch` keeps an urgent link out of foreign readiness batches), the authored upgrade queue re-grades R0_GLASS above target/hostile/ambient on every pick, `residencyOptionsForBoundary` marks on-glass compile + residency urgent, and the mesh-build drain hoists arrivals that crossed the glass between queue polls and admits them through a refused late-present gate. Fixture `test/frame-solid-glass-priority.test.mjs` pins each lane | Flight, first sight of a ship/station/rock | open — ordering is fixed and proven, but the authored composition lane is still serial through compile + upload (MEASURED 2026-09-25, owner's Intel laptop: queue mean 14 / busy 100 %, 1.3–7.9 s per ship job, `overlapAuthoredPipelineCompile` false in flight), so a first arrival's residual wait is its own compose/link/upload time, not other work. TRIED and parked 2026-09-25: letting flight composition overlap its GPU gate (cap 3) raised lane throughput but cost ~15 ms frame p50 in both back-to-back A/B pairs with no on-time gain (0.59 → 0.60), so one composition job is itself too heavy for a frame budget (patch `.devshots/parked/flight-compose-overlap-2026-09-25.patch`). PROFILED 2026-09-26 (permanent per-job phase instrument: `finishUpgradeDiagnostic` records decode/compose/pipeline/commit plus policies/compile/residency per job, the frame-solid probe prints the `job phase split`, and `test/frame-solid-glass-priority.test.mjs` pins the gate instrument): one ship job is 100 % its own GPU gate — decode 0 ms (prefetched), compose 10–96 ms (the §21.4 system 2 analytic-seat fix holds), commit ≤2 ms, policies ≤1 ms, residency ~0 (chained inside the compile promise); the gate is the boundary compile promise (max 3.6 s of a 7.0 s job) plus its pool-chunk compiles serialized behind it on the shared tail (the remainder). The reducible residue is named: 5 of 8 in-flight links were `GLTFKit_InstancePool_*` programs differing from an already-linked program by exactly the instancing bit (cache-key diff `8421457` vs `8421456`) — the direct draw path links a shared material non-instanced first, then the ship's pool admission re-links the same material instanced, and both links sit inside the first-sight job. Overlap retry not warranted (the job did not get cheaper; the gate is driver link time, not lane order). Next: the §21.4 system 1 residual perf call — one draw path per material family (or drop the direct non-instanced twin) so a first family admission links each material once; until then system 6 (a stand-in on screen) is the owner-named answer |
| D46 | 2026-09-25 `check:all` sweep — foreign red classes new since the 2026-09-23 receipt set | Full triage of all 46 ids 2026-09-25 late: every id re-run on the dirty main tree AND in a throwaway clean-HEAD worktree at `b9b0199ad`; each remaining red re-run once before being called real. **Green at HEAD and on the tree — 10** (fixed by the 57 commits since the sweep): depth-program-k1-ui-runtime, time-effects, sg05-runtime, sg06-tether-resilience, save-load-slot-trust, station-departure, recommended-next, localmap-routes, sg08-mix-profile, map-information-depth. **Contention flakes — 3** (pass quiet on both trees; the sweep reds were load artifacts): check-sg06-ai, check-sg05-branch-policies, check-sg06-production-ports. **(a) dirty-WIP artifact — 8** (red on the dirty tree, green at clean HEAD): check-bundle, check-perf-packets, check-src-reachability, check-authored-place-runtime, check-camera-shake-scope, check-sg08-golden-trace, check-47a-counterplay, check-title-continue-runtime. **WIP-resolved — 5** (red at clean HEAD, green on the tree because the uncommitted WIP *is* the fix; land with their owners): depth-program-authored-salvage (weapons `range 240` vs fixture `520` — dirty `src/data/weapons.js`), depth-program-k1 (k1-runtime production-fitting/ports), check-depth-program-k1-behavior (faction_understory combat fire — dirty `combatDoctrine`/`factionDoctrines`), check-47a-tactics + check-47a-live-branch (surrender_evidence — uncommitted 47-A work). **(b) fixed this sitting, commit `ec7ce0306`**: check-market-nav — stale check thresholds re-pinned to live data (Economy Pulse `ff6a0cae9` food basePrice 40→73; INF-085 `0efc5e5cf` intel label "scan · Nm old") — green now; check-sg08-render-vfx — partially (stale `trailSampleProcedural` token re-pinned to the landed `e0b3b820c` shard-sliver shader), still red on "fleet overflow ships should show procedural streak mesh" → VFX lane. **(c) owned elsewhere — 14**: HUD/ORRERY lane: check-type-floor (275 sub-12px declarations, all 13 ORRERY-refactor files), check-ui-budgets (baseline:stale + PQ-184 grammar debt; re-capture after the WIP settles), check-station-tabs (deterministic waitForResponse timeout at HEAD), check-mission-cargo-loading (buy-affordance label vs `orrery/marketLayouts.js`), check-first-15-runtime (sweep assertion names the HUD tracker). asset-pipeline lane: check-graphics-asset-receipts, check-kestrel-wholeship, check-parts-manifest, check-sg04-release-assets, check-station-archetype-glb-load (167 ok / 3 generator mismatches), check-shipworks-dock-composition (`place_dock_interior.glb` extension drift) — re-verified this sitting. depth/encounter lanes: depth-program-encounter-loader-test + -2 (committed `015-opening-hauler-raid` sits inside the append-only migration-era prefix; the seeded 60-schedule golden hash also drifts — goldens, not re-recordable per law). 47-A lane: check-47a-live-cold-open (Kessler comms assertion, red on both trees). **Environment, unresolved — 4**: probe-flight-visual (GPU browser capture cannot finish on this host; attempted twice again), check-mission-handoff (`page.goto` stall ×2, never reaches an assertion — needs a quiet host), check-bar-mission-readiness (timeout stage unstable across runs — needs a quiet host), check-assets-live (publish-ratchet: requires HEAD == origin/master; HEAD holds unpushed commits — resolves on push). D48 re-verified once this sitting: `node --test test/bounded-autosave.test.mjs` red with exactly the ledgered signature (6.2 ms-floor siblings, blocking spikes 424.8/72/63/22.5/17 ms inside `encode_part_dispatch`) — claim holds. | Demo build health — each red hides regressions in its own area | open — classification complete; 24 ids still red at clean HEAD, each named to its owning lane above; none is a mechanical D46 fix. Do not re-record receipts/goldens to silence |
| D54 | Hero landmarks at the shipping camera (`scripts/capture-sector-identity.mjs --sectors=six --anchor=landmark`, seed 4242; probe `.devshots/landmark-diag/`) | Standing beside a named wonder you see a prop the size of your own ship, or nothing: the Candle Fleet (`place_memorial_array`, 14.8 m), the Resonant Cathedral (`place_maintenance_gantry`, 20.1 m, lore says twin spires and an arch) and the Skerris Throne (`place_dead_hulk`, lore says a fortress of welded hulls) all draw at or below the player hull (26.5 WU); the Quiessence's seventeen freighters spawn as `fx` with no place model, so only a 5 px buoy shows; the Tethys Anvil planet is ~2,200 WU off-frame from anywhere outside its pull, so its well has no visible presence at its edge; and under the untracked place-scale work (`modelTruthPlaceDrawScale` / `modelTruthMounts.js`) the Wreck Cathedral draws at ~18,300 WU, 30× its authored 609 WU | PQ-153.02 still review; any "go see it" beat | open — art/scale call: proposed targets Candle Fleet ~90–110 WU, Resonant Cathedral ~100–120, Skerris Throne ~140–160 (`_spawnPOIs` passes only `visualRadius` today; it must pass `placeScale`/`placeTargetRadius`), an intact dark-freighter place model for the Quiessence band, and the ×30 Cathedral fixed inside the place-scale lane before it lands |
| D60 | A6 opening-slice driver seed 4242 — `tools/agentic/a6OpeningSlice.mjs` `fly_dock` phase | One run teleported the player (1254,−401) → (2249823,−252490) in a single sim tick with velocity preserved (v≈92 before and after) — no watched event, no physics impulse reaches 118k u/s, and every bounded frame is eliminated (sector lattice ±50k, frontier origins ≤70k, frameOrigin quantum 4096, blink 240, sling endpoints, law custody — all checked). A prior uninstrumented run landed at (2248871,−252614) — within ~1k, i.e. a deterministic far position like a drifted world-record or route-itinerary point, not a random ejection. The driver now taps every bus emit plus `world.frameOrigin`/`player.activity` stamps each tick, so the next recurrence self-identifies | Any flight — a silent ~2.25 M-unit relocation strands the player in empty space | open — instrumented; not reproduced in 4 subsequent full runs (≈40 min of sim). If it recurs, the tick dump names the writer |
| D61 | sector jump arrival — `[render] sector authored prewarm invariant failed; residency was not rotated` console error on `sector_ceres_belt` arrival | One READY boundary record failed `publish()`'s revalidation (`renderer.js:3540-3562`, `publish` returns false when a record went inactive/aborted/superseded between the READY snapshot and the `publishRecords` await — `renderer.js:3941-3946`). Fail-closed path ran: residency NOT rotated, prewarm released, error rethrown into the pipeline promise (`renderer.js:10360-10377`) where `preparation.catch(()=>{})` swallows it — so the sector drew with procedural boundary fallbacks and the player saw no failure, only the console error. Fired once on the first real probe jump (`probe-playtest l06`, 2026-09-26); a dedicated `--only=l06-jump` repro did NOT recur — intermittent generation race, not deterministic | Any jump arrival: an unlucky player lands in a sector missing authored boundary meshes (procedural fallback only) and carries a console error | open — candidate minimal fix is narrowing the snapshot's loss detection to records still claiming this generation at publish time (a superseded record is withdrawal, not loss), but the abort/generation semantics are deep — owner should be the render lane that wrote the prewarm invariants. Imported from the vm playtest audit 2026-09-26 (their D59); per-candidate publish diagnostics landed with 9e119fd55, so the next occurrence names whether the lost record was superseded/aborted or unclaimed. Repro: `node scripts/probe-playtest.mjs --route=loop --only=l06-jump` until the console error appears in `report.json` |
| D63 | Regression sweep inside the PQ-153.02 landmark lane blast radius — four red tests at HEAD | (1) depth-program-w1-planet-states: sector_vesta_forge semantic hash drifted 3339003051→1659813738 (POI/topology fingerprint moved with the lane's landmark edits); (2) lung-of-charon-rescue:95 — insertDressingRow→allocateDressingId NPE on table.byId when _spawnPOIs is driven by a bare fixture state (the dirty world.js hunk now routes memorial hulls through insertDressingRow; ensureDressingTable yields no byId-bearing table outside full sim); (3) lung-of-charon-rescue:281 — Continue respawns 3 entities where the test pins 2; (4) ceres-table-authority-census:124 — quiet Ceres entityList 96 vs pinned <70 (the dirty world.js population work re-inflated the live combat list the census shelves off) | Charon boarding/rescue flow on the demo path — if the null-table path can be reached outside the fixture, boarding the Lung POI throws; the Ceres census fail is perf/shape (quiet pocket reads busy) | open — lane-owned: PQ-153.02 still-review row is LIVE (files: world.js/dressing machinery). Any sitting dispatched into those files handles that row as part of its unit. Raised by the INFERENCE-26 regression set; (4) raised by the INFERENCE-30 review verification |
| D62 | Import lane, not live code: `design/program/vm-drop/weapons-npc-quiet-latch/patches/0001-*.patch` calls the pre-INFERENCE-23 `_tickLock(player, dt)` signature | The mount-role unit changed `_tickLock` to `(e, dt, state)`; the pending patch file still issues the 2-arg call (`patch line ~262`). Benign once applied because `_tickLock` now falls back to `this.state`, but the patch is remote-authoritative vm-drop content — the importing lane must carry this note, not a local edit | On import: any occasional mount would evaluate its window against the bound-state simTime — correct after the fallback, but a silently-stale patch is the import-failure class this ledger exists for | open — flag inside `vm-drop/IMPORT_DIGEST/` or the job's `IMPORT.md` when the patch is imported; no local write under `vm-drop/` (remote-authoritative). Raised by the INFERENCE-23 implementation review |
| D65 | Wrecks shed momentum at the kill (`test/world-reaction-bars.test.mjs` "B10 the world reacts", clause PQ-138.03) | Measured 2026-09-26 on the real path: 2 s after the kill a wreck carries 70.9 % of the victim's speed, below the contract. The clause was unmeasurable earlier today while the headless runtime could not boot (`noFireAdvisory` missing from the Node system table, fixed alongside this row); not yet attributed to committed vs in-flight work (`collisionConsequences.js`, `killReplay.js` carry uncommitted foreign hunks) | Every kill: the wreck visibly brakes instead of tumbling on the dead ship's line — weakens "wrecks as terrain and ammunition" | open — repro: `node --test --test-name-pattern="B10 the world reacts" test/world-reaction-bars.test.mjs`; attribute on a clean HEAD worktree first |
| D64 | Courier + prospector public routes red at HEAD (found 2026-09-26 re-running the sibling route checks per the D59 fix plan; shared `quoteMissionEconomics`, so attribution was proven first) | Both fail byte-identically on the dirty tree AND in a clean-HEAD worktree at `dadab0165` — pre-existing, NOT the D59 bounty-only pricing change. Courier `node --test test/m3-courier-route.test.mjs`: `repair_cost_missing; dead_income -5.83 < 50; thirty_minute_capital_progress_missing 4825 < 15000` (60/90 cells: `dead_income -76.33/-50.14`, `role_hull_not_affordable 487 < 35000`) — the starter freight loop nets negative and never repairs. Prospector `node scripts/check-m3-prospector-route.mjs`: `repair_cost_missing; repair_service_authority_missing; inventory_not_conserved end=80 expected=79` (off-by-one mined unit per cell) — its reporter also crashed (`ReferenceError: endU is not defined`, `prospectorPublicRoute.js:1569`). PROSPECTOR HALF FIXED 2026-09-26 (D59 sitting, total-fix): reporter typo repaired to the real `receipt.inventoryEndU/inventoryExpectedU`; hull wear now repeats bounded combat packets until the measured hull damage lands (`5507700e0` made the damage router force shieldBypass 0, so the old single packet was eaten by shields); inventory conservation snapshots the authored Thread-B fragment `newGame` installs as start stock — `node scripts/check-m3-prospector-route.mjs` now prints PASS with `assertionFails: []`. The COURIER half is still open (fingerprint above). The dirty foreign fixture `test/fixtures/m3-career-cohorts/cohort-report.v2.json` already records dead-income rows for these careers — likely the same regression | Courier/prospector careers: the starter freight and mining loops lose credits within 30 minutes on the demo path (prospector loop repaired; freight loop still nets negative) | open — courier owner is the freight economy lane: reproduce with `node --test test/m3-courier-route.test.mjs`; the dirty cohort fixture suggests a live cohort lane may already hold context |
| D57 | `test/camera-clearance-ceiling.test.mjs` ΓÇö 2 of 3 red at clean HEAD `d225c6222` | "Ships keep their own colliders" changed what the clearance floor reads: the fixture's structure roof now reports ~116ΓÇô118 instead of the expected 300, so "a sane floor still snaps up" and "broken floor after a sane lift clears it" both fail identically on a detached clean worktree. Either the camera no longer clears a real roof (player regression ΓÇö hull hidden under station tops) or the floor contract legitimately narrowed to exclude ship-scale colliders and the fixture's expectation is stale | Chase camera can park inside station geometry / mid-flight structure roofs ΓÇö the exact class that hid the hull on approach before the corridor fix | open ΓÇö repro: `node --test test/camera-clearance-ceiling.test.mjs` at clean `d225c6222`. A sitting in `cameraClearanceFloorAt` / the ship-collider commit decides which; if the floor intentionally excludes ships, re-derive the fixture's structure to a roof the new contract still clears rather than weakening the assert |

| D66 | Hitch (starter) fails two measured FEEL_CONTRACT clauses at committed HEAD — B2 turn radius at cruise 1.26 screen depths (contract <=1), B3 seconds-to-cross-visible-depth at cruise 0.68 s (contract >=1.2 s) | Both clauses divide by the same quantity — cruise visible depth — so one shrink explains both reds. Deterministic sim measurements (not load noise); the only dirty files are economy/balance and cannot move hull turn rate or camera zoom. Suspects: the 2026-09-25 camera commits `4420db897` (camera no longer leaves for orbit), `b0806baf1` (camera still while stations load), `4f102db53`/`6ff452c31` (measured skins drive camera slide) — a tighter cruise frame would raise both numbers exactly as observed. Found by the 2026-09-26 check:all:smoke feel-scenarios run | The starter hull reads tamer than the contract it is sold on: less sky ahead at cruise, wider-feeling turns — the first ten minutes of the demo | open — repro: `node --test test/fun-bench-flight-scenarios.test.mjs`; attribute against the 9/25 camera commits first (if the tighter frame is intentional, the contract clause moves with owner sign-off, not a silent fixture edit) |
| D67 | Station calibration smokes from the PQ-025 calibration sitting: `check-gold-corridor-public-pilot --career={hauler,hunter} --stop=full` (2026-09-26) | Clicking the station Market tab hangs the renderer: the button passes actionability, dispatch never completes, and there is no console or page error. Reproduced on hauler and hunter at service-used; prospector passed the same stage | Blocks the save + cold-Continue checkpoint on the affected career routes — Continue is the demo's front door | open — owner surface `src/ui/station/dock.js` / `stationApp.js`; full repro facts in the PQ-025 packet's routed defects (`design/program/roadmap/active/PQ-025.md`, routed defect D1) |
| D68 | Same pilot runs, cold-Continue leg | `goldCorridorPublicPilot` reports pass:false with blocker:null and failureStage:null when a cold-Continue reload aborts an in-flight render.glb fetch (net::ERR_ABORTED) after full completion — an unclassified verdict state in `scripts/lib/goldCorridorPublicPilot.mjs` | Every red corridor run of this shape gets triaged by hand from scratch — the hours-to-isolate class the ledger exists to stop | open — HARNESS class, not player-facing: repair in `scripts/lib/goldCorridorPublicPilot.mjs` and mint a new harness hash (PQ-025 packet routed defect D2) |
| D69 | `test/m3-hunter-balance.test.mjs` red 3/5 at committed HEAD — stale pins from the Economy Pulse family | Found in the D59 review (2026-09-26); verified pre-existing, NOT caused by the D59 change: identical fingerprint in clean worktrees at `b2d867d1d` and `cf3f8272f`, and the D59 BASE reconciliation (552→303 via `generate-economy.mjs`) leaves the same 3/5 (re-measured before and after). (1) `:29` pins `MISSION_TUNING.BASE.bounty_hunt === 110` — stale since `b65ad1f40` (2026-09-19) landed 552; the honest re-pin is the model-derived 303 (combat pay above the dead-freight floor still holds: 303 > 80) with the premise rewritten, not a silent number swap; (2) 'civilian boards carry a denser bounty column' — OFFER_MIX density assertion drifted from the generated mixes; (3) 'cohort Hunter 30/60/90 clear the healthy band' — the cohort income instrument (`careerCohorts.js:182` missionRewardCrAdapter reads `MISSION_TUNING.BASE.bounty_hunt`) now reads the reconciled 303 and still fails against the dirty fixture `test/fixtures/m3-career-cohorts/cohort-report.v2.json` (see D64) | Demo build health — stale pins red every `check:all` and hide real regressions in the same assertion lists | open — owner is the missions/economy balance lane: re-pin (1) to the model-derived 303 with a live premise, re-derive (2) from the current generated OFFER_MIX, and (3) resolve the cohort fixture with its owning lane (D64's freight/mining economy work). Repro: `node --test test/m3-hunter-balance.test.mjs` |
