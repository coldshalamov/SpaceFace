<!-- LIFETIME: ACTIVE_PROGRAM -->
# SpaceFace master plan — from janky web game to professional game

**Owner direction, 2026-11-06.** We have most of the pieces of a real game. The job now is to
*arrange* them into a professional experience, make it run without freezes, give the player a
ship they understand and build, give the world a journey, and stop agents doing minor tweaks on
top of the wrong architecture. **Any amount of work is allowed** — ports, rewrites, replacing a
subsystem, changing language or engine — when evidence says it is the cheaper road to the result.

This file is the map of **campaigns**: large, verifiable bodies of work, each sized for one strong
agent (or a small team) over one or more sessions. It sits above the Finish lane boards and the
SWARM program; it does not replace them. Each campaign says whether it is **NEW**, **EXTENDS** an
existing effort, **SUPERSEDES** one, or is **IN FLIGHT** elsewhere.

Evidence tags: **[V]** verified in code or measured; **[I]** inferred, the campaign must confirm.

---

## Part 0 — How agents must work on this plan (read before any campaign)

The owner has watched many agents fail the same ways. These rules exist to stop that.

### 0.1 Diagnose before you touch anything
Every campaign starts with a **diagnosis memo** (≤ 1 page, committed in the campaign folder):
1. The player-visible problem, in plain words.
2. The measured cause chain (what you measured, with numbers) — not a guess.
3. **The architecture question:** is this a bug in a sound design, or is the design itself the
   bottleneck? Write down what replacing the design would cost and what it would buy.
4. The chosen road and why it is the cheapest road to the *finished* result — not the cheapest
   next commit.

A campaign that skips the memo and starts tweaking is out of process.

### 0.2 No "the repo is in X, so the fix is in X" tunnel vision
JavaScript, Three.js, the worker transport, the flat `GameState`, the event bus, Rapier — all are
choices someone made, not laws. If the diagnosis shows the choice is the bottleneck, the campaign
may replace it (Rust/WASM, a data-oriented core, WebGPU, a native engine, Electron-first). The bar
is evidence, not comfort. Equally: don't port for its own sake — Campaign E8 exists to settle the
"port the whole game" question with a measured slice, not a slogan.

### 0.3 The 90%-correct-and-wonky rule
A system that works but is configured wrong is a **defect**, not a polish item. Placeholders
("nothing has tuned them"), self-imposed bars that keep finished work switched off, safety clamps
left at their first value, features built then disabled — every one is in scope. Campaign Q1 runs
this census for the whole repo; every other campaign fixes the ones it meets.

### 0.4 Finish lines are player-visible
"Tests green" is never the finish line. Each campaign's **Done when** names a measured number on
the owner's laptop, a route walked in the real game, or screenshots judged against a written taste
bar — usually all three.

### 0.5 Taste carriers
Every visible campaign writes (or reuses) a short taste bar: reference games and the quality to
study, a "never" list, budgets (words on screen, flash size), and before/after captures. The SWARM
program's README §4 is the model. Weak-taste agents follow written taste well; they don't invent it.

### 0.6 Shared-checkout discipline (unchanged)
`AGENTS.md` rules apply: exact-path staging, no reset/stash/clean/rebase/force-push, preserve
foreign hunks, claim paths in `design/program/NOW.md`. Publish only your own paths when local
master carries others' unpublished commits (temp index + `read-tree origin/master` +
`update-index` + `commit-tree -p origin/master`, push that, then merge back).

---

## Part 1 — The engine: why it freezes, and the architecture that won't

### 1.1 What the owner sees
The game "freezes" but planets keep rotating and lights keep blinking; the ship holds still, then
**blips** to a new place. Elsewhere: hitching, pop-in, blinking models, long loads.

### 1.2 What the code and today's measurements say
- **[V]** The authoritative simulation runs in a worker (`src/core/wholeSimBrowserWorker.js`) on
  its own clock and publishes finished steps to the main thread, which keeps a ring of 8
  (`src/core/simLaneMain.js`). Ship poses come only from those steps; planets, lights and
  particles animate on the render clock. **When steps stop arriving, the ship stops and the scenery
  doesn't** — exactly the symptom.
- **[V]** The steps stop arriving because **the step is too expensive**: worker reply work p50
  ~8 ms, **p95 58 ms, p99 105 ms, max 458 ms**; replies reach the screen at 2–10 Hz in busy
  scenes (`PERFORMANCE_HANDOFF_2026-11-05.md`, 2026-11-06 section). Ranked drivers: Rapier
  `world.step` on contact storms and pinned-awake islands; `_captureContactImpacts` querying the
  manifold per contact then fanning out to ~35 `physics:impact` subscribers; catch-up batches;
  per-tick telemetry snapshots allocated per body; linear scans of dormant rocks; O(jobs ×
  entities) NPC threat scans; single-tick spikes in economy, NPC jobs, traffic, barks.
- **[V]** The transport is designed to survive this, not to hide it: ≤ 4 unacknowledged publishes,
  a 3 s lost-ACK rebuild ("presentation freezes at the last applied pose" — the code's own
  comment), a 24 ms work budget that turns heavy steps into slow motion, catch-up of only 2 steps.
- **[V]** There is **no playout delay, no extrapolation and no smooth correction** on the
  presentation side: a late step = a held pose; a burst = a jump.
- **[V]** Shared memory between threads is on for the local dev server (it sends COOP/COEP) but
  **not on the public deploy** (`vercel.json` sends no isolation headers) → the transfer fallback.
  Electron: nothing found that sets isolation **[I]**.
- **[V]** Main thread: ~65 MB/s allocation in flight (`getProgramCacheKey`/`getParameters` per
  material per draw, pick raycasts, HUD forced layouts); meshes made visible before GPU-ready
  (pop-in, 188–289 ms bricks); a forced heavy admission after 8 skipped frames; `unreadyDrawGuard`
  ~12.5% and `setProgram` ~7.9% of a busy frame; GPU p50 23.7 ms in a busy Crucible round on the
  laptop's integrated GPU.
- **[V]** Scale of the machine: ~1.27 M lines of JS, 261 registered systems (205 in the sim update
  order), `renderer.js` 36.7 k lines, 28 MB eager JS, 146 MB first load.

### 1.3 The architecture verdict
The game is built as **one big object graph** — a flat `GameState` of JS objects, 200+ systems
that each walk it, an event bus where every impact fans out to dozens of listeners, and a renderer
that rediscovers what to draw each frame. That design was fine for a prototype. At 150+ bodies it
is the bottleneck, and point fixes (one scan here, one cache there) will never add up to "no frame
you can feel". The professional structure is:

1. **A presentation that cannot freeze.** The renderer plays back simulation snapshots on a fixed
   delay with interpolation, short extrapolation and smooth error correction — the way every
   networked game hides a server that is 100 ms away. A slow simulation step then shows as a brief
   slow-motion at worst, never a frozen ship and a blip.
2. **A simulation that is cheap by construction.** A data-oriented core (structure-of-arrays,
   typed buffers, spatial indices, batched events, mode-scoped system sets, simulation level of
   detail for things far from the player) where the hot loops run in tight code — first in
   disciplined JS, and in **Rust/WASM** where the profile proves it pays (physics is already Rust).
3. **A renderer that knows its world.** Retained render lists, everything compiled and resident
   before it becomes visible, one budgeted upload path, no per-draw allocation — and a measured
   decision on WebGPU.
4. **A platform that gives us the fast path.** Electron-first with cross-origin isolation (shared
   memory, precise timers, GPU flags); the web build sends the same headers.
5. **An honest test of the nuclear option.** A time-boxed native-engine slice (E8) settles whether
   porting the whole game is the cheaper road, with kill criteria written before it starts.

### 1.4 Engine campaigns

#### E1 — The playout buffer: the ship can never freeze or blip again (NEW, top priority)
- **Outcome:** with the simulation deliberately slowed (inject 60–400 ms worker stalls), the ship
  and every body still move smoothly; at worst the world slows down, never holds and jumps.
- **Approach:** every published step carries its sim timestamp. The presentation keeps a
  **jitter buffer** and renders at `latestSimTime − playoutDelay` (start 50 ms; adaptive 33–100 ms
  from measured arrival jitter), interpolating between the two bracketing snapshots. When the
  buffer runs dry, **extrapolate** with velocity and angular velocity for ≤ 150 ms; when the
  real step arrives, **correct the error over 80–120 ms** (critically damped), never snap — except
  teleports flagged by the sim (respawn, jump gate, rebuild). Player input stays responsive: the
  player's own ship may use a short local prediction with reconciliation (classic client-side
  prediction) if the delay is felt — measure first.
  Rip out: the "hold last pose" behaviour and any path where a coalesced burst moves a body in one
  frame. Keep: the worker, the journal, the ring (it becomes the snapshot source).
- **Where:** `src/core/presentationRunner.js`, `src/core/simLaneMain.js` (snapshot timestamps,
  ring → buffer), the per-entity pose writer in the renderer.
- **Verify:** a stall-injection test harness (`?simStall=` or a test-only worker hook) with a
  recorded pose trace: max per-frame position jump ≤ 2× the body's speed × frame time; no frame
  where the player ship's pose repeats while its velocity is non-zero for more than 2 frames;
  before/after video of the same stall pattern on the laptop.
- **Wrong ways:** raising the ring capacity; adding more catch-up steps; "fixing" by lowering
  quality; extrapolating forever (rubber-banding); hiding stalls under a loading spinner.
- **Size:** L. **Depends:** none. Do first.

#### E2 — Diagnose-and-replace the simulation hot path (EXTENDS the 2026-11-06 hitch campaign)
- **Outcome:** worker step p95 ≤ 8 ms, p99 ≤ 12 ms, max ≤ 25 ms in the Crucible ≥ 150-body round
  and the Adventure busy route, measured on the laptop.
- **Approach:** a per-system, per-tick profiler in the worker (it exists in parts — make it
  complete and permanent: every system's time and allocations per tick, rolling p50/p95/max,
  exportable). Then, in order of measured cost:
  1. **Contacts:** dedupe manifold queries per pair; replace the ~35-subscriber `physics:impact`
     fan-out with **one batched impact buffer per tick** that consumers read (a typed array of
     pairs, impulses, points); consumers that only need "did X hit hard" read a per-entity summary.
  2. **Physics shape:** fewer joints (springs as forces where possible), island sleeping that
     towed bodies don't pin awake, CCD only for fast small bodies, collision groups so debris and
     Brood don't pair with everything.
  3. **Scans → indices:** every "for all entities" in a per-tick path becomes a spatial-hash or
     index query (dormant rocks, threats, anchors, recoil records).
  4. **Telemetry off the hot path:** SG-02 snapshots/telemetry built lazily on request, never per
     tick by default.
  5. **Spikes → slices:** economy, NPC jobs, traffic, barks run sliced across ticks with a budget
     (they're world bookkeeping; nobody sees them within one tick).
- **Verify:** profiler export before/after on the two routes; determinism suites green (versioned
  references where behaviour legitimately changes); no gameplay regression on the S-lane captures.
- **Wrong ways:** optimising a system that isn't in the top five; caching that changes results;
  turning systems off instead of making them cheap.
- **Size:** L. **Depends:** E3 helps but isn't required.

#### E3 — Mode-scoped simulation and simulation LOD (NEW)
- **Outcome:** a Swarm round runs only the systems Swarm needs; Adventure ticks far-away world
  bookkeeping at low rate.
- **Approach:** a **system manifest per mode** (Swarm, Adventure, race, station) listing which of
  the 261 systems run and at what rate; systems declare `{ rate: 'every' | 'hz:10' | 'sliced',
  modes: [...] }`. Adventure gets **simulation LOD**: full rate near the player, reduced rate for
  sectors/agents beyond N screens (traffic and jobs advance in coarse steps). Rip out: implicit
  "every system every tick".
- **Verify:** the profiler shows Swarm's tick touching ≤ the manifest; an Adventure soak shows no
  behaviour change in visible space (determinism references for near-field unchanged; far-field
  references versioned).
- **Wrong ways:** hard-coding `if (mode === 'swarm') return` inside 100 systems — use the manifest.
- **Size:** M. **Depends:** none.

#### E4 — Data-oriented core: from object graph to buffers (NEW, big)
- **Outcome:** the hot entity state (position, velocity, rotation, radius, mass, team, flags,
  health) lives in **structure-of-arrays typed buffers** owned by one store; systems iterate
  buffers; the per-tick allocation in the worker drops to near zero; snapshots to the presentation
  are a buffer copy (or a shared-memory triple buffer).
- **Approach:** the Brood engine (`src/systems/swarmBrood.js`) already proves the pattern in this
  repo — flat typed arrays, a retained spatial hash, zero per-step allocation, one draw call for
  400 bodies. Generalise it: an entity store with stable indices + generation counters; component
  columns; the existing `state.entities` API becomes a **facade** over the store during migration
  so 1.27 M lines don't break at once. Migrate the hottest systems first (from E2's profile), keep
  the facade until nothing on the default route needs it, then delete it.
- **Rust/WASM gate:** once the hot systems iterate buffers, porting a loop to Rust/WASM is
  mechanical. Port a system to Rust only when the profiler shows it's still ≥ 1 ms/tick after the
  buffer rewrite; the shared buffers make the JS↔WASM boundary free (no marshalling).
- **Verify:** worker allocation per tick ≤ 50 KB in the busy round; E2's step bars hold with 2×
  the bodies; determinism suites green.
- **Wrong ways:** a big-bang rewrite with no facade (the game stops booting for weeks); a second
  parallel store that drifts from the first; porting to Rust before the data layout is fixed.
- **Size:** XL (multi-session). **Depends:** E2's profiler.

#### E5 — Shared memory everywhere: Electron-first platform (NEW)
- **Outcome:** the shipped game (Electron) and the public web build are cross-origin isolated:
  shared-memory transport, precise timers, and the GPU flags the laptop needs.
- **Approach:** Electron sets COOP/COEP on its session (`webRequest.onHeadersReceived` or a custom
  protocol) and enables the shared-memory lane by default; `vercel.json` adds
  `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless` for
  the game routes (check every third-party resource still loads). Make **Electron the primary
  platform** for the owner's laptop (packaged, signed, auto-updated), with web as the demo channel.
  Audit Electron GPU switches for the Intel iGPU (ANGLE backend, `ignore-gpu-blocklist`,
  `enable-zero-copy` etc. — measure each).
- **Verify:** `crossOriginIsolated === true` and the SAB lane active in both shells (probe);
  matched A/B frame interval with shared memory on vs off; the signed update path works.
- **Size:** M. **Depends:** none.

#### E6 — Nothing appears before it's ready: the residency and pop-in rebuild (EXTENDS Lane 1)
- **Outcome:** no visible pop-in, no blinking models, no 100–300 ms "admission bricks"; first
  flight frame arrives with everything near the player compiled and resident.
- **Approach:** one **residency manager** owns the lifecycle of every drawable: requested →
  loading → uploading (budgeted per frame) → compiled (all shader variants warmed off-screen) →
  **visible**. Nothing becomes visible at bind time. VFX, tether and prop roots go through it too
  (today they bypass it). Replace the "forced heavy admission after 8 frames" with predictive
  pre-admission (what will be on screen in 2 s, by velocity and route). Shader variants are
  enumerated at build time and compiled during loading (`KHR_parallel_shader_compile`), with a
  persistent program cache in Electron.
- **Verify:** a pop-in detector (visible-unready count, first-visible-to-resident delay) reads 0
  on the busy routes; no main-thread task > 50 ms after load on the laptop.
- **Wrong ways:** hiding pop-in with fades; raising budgets; another special-case gate.
- **Size:** L. **Depends:** none (coordinate with Lane 1's in-flight LOD work).

#### E7 — The renderer that knows its world (NEW, with a WebGPU decision)
- **Outcome:** main-thread render cost ≤ 4 ms and ~0 allocation per frame in the busy round; GPU
  time within budget on the iGPU at the auto-selected quality tier.
- **Approach:** split `renderer.js` (36.7 k lines, 10.9 k-line `init()`) into owned modules with
  a **retained render list** (things register once, update dirty transforms/uniforms only); memoise
  program keys (the `getProgramCacheKey` churn); instancing/batching as the default path for ships
  of the same family (the BatchedMesh path exists and is off); one material director. Then a
  **measured WebGPU spike**: three.js WebGPURenderer on the same scene — pipeline caching removes
  most of `setProgram`; keep it only if the laptop A/B says so.
- **Verify:** profiler: render JS ≤ 4 ms, allocation ≤ 100 KB/frame; GPU timer queries per pass;
  look check at the gameplay camera (identity preserved).
- **Size:** XL. **Depends:** E6 helps.

#### E8 — The native-engine slice: settle "should we port the whole game?" (NEW, time-boxed)
- **Outcome:** a written, measured verdict.
- **Approach:** in a separate repo folder, rebuild **Swarm wave 1–10** (one arena, three enemy
  types, the five powers, the Line, Brood) in **Bevy (Rust)** — or Godot if the agent argues it's
  cheaper — reading the same data files (ships, enemies, weapons) exported to JSON. Two to three
  agent-sessions maximum.
- **Kill criteria, written now:** port is recommended only if (a) frame interval on the laptop is
  ≥ 3× better than the post-E1/E2 web build in the same scene, (b) the slice reaches feel parity
  in a blind side-by-side, and (c) the estimated cost to port the content (ships, 370 encounters,
  screens) is less than finishing E2–E7. Otherwise the slice is archived and the web stack wins.
- **Wrong ways:** starting the full port before the verdict; comparing against today's unfixed
  web build; a slice without the physics feel.
- **Size:** L (time-boxed). **Depends:** run after E1 and E2 land, so the comparison is fair.

#### E9 — Load in seconds (EXTENDS Lane 1 load work)
- **Outcome:** launch → controllable flight ≤ 5 s warm on the laptop; web first load ≤ 35 MB.
- **Approach:** split the 28 MB eager closure by route (title, Swarm, Adventure, station); stream
  assets by predicted need; KTX2/meshopt everywhere; a persistent asset + shader cache in Electron;
  the title screen is interactive while the game loads behind it.
- **Verify:** timed launches (cold/warm) on the laptop; bytes before first flight.
- **Size:** M.

#### E10 — Frame-truth instrumentation: a permanent dashboard (NEW, small, enabling)
- **Outcome:** any agent can see, live and recorded, where a frame went: worker step per system,
  snapshot arrival jitter, playout buffer depth, main-thread tasks, render JS, GPU per pass,
  allocations, pop-in counters.
- **Approach:** one overlay (dev hotkey) + one JSON trace export used by every campaign's
  before/after. Consolidate the existing scattered probes.
- **Verify:** E1/E2/E6/E7 cite it in their diagnosis memos.
- **Size:** S–M. **Depends:** none. Run first, alongside E1.
