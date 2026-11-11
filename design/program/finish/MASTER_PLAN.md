<!-- LIFETIME: ACTIVE_PROGRAM -->
> **HISTORY — not a source of work.** Superseded on 2026-11-11 by `design/program/fleet/QUEUE.md`
> (work) and `design/game/` (design). Read for background only; do not take tasks from this file.

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

---

## Part 2 — Your ship: a character screen you understand

### 2.1 What the owner sees
"A wall of names and no explanations." Changing a part tells you nothing about how the ship will
play until you try it. There is no screen where you look at *your* ship and feel you are building
it like an RPG character.

### 2.2 What the code says
- **[V]** Shipworks and the ship screen show engineering numbers — Agility 8.8, Inertia 18,
  Brake 78, "+12/s power", "core 0 draw", "Draws 11/s against 12 back", "turn radius 139 m",
  "1/7 systems fitted" — derived in `src/ui/panels/handlingProfile.js`, `src/ui/ship/fitReadout.js`,
  `src/ui/ship/shipBandModels.js`. They are honest numbers with no player meaning.
- **[V]** Slots read "EMPTY · S" with a size letter; parts are names ("Vector Reaction Drive M",
  "Harbor Brake Set S", "Third-Owner Patch Kit").
- **[V]** Research (`tech-tree`) is a radial credits tree that unlocks ships and modules — an
  unlock catalogue, not a character build. Crucible has its own perks; Swarm has its own draft;
  the Adventure has ranks and reputation — **four progression systems that don't add up to one
  character**.
- **[V]** The report card: "fits barely show on the hull; paint is unearned; synergies are labels".

### 2.3 Ship campaigns

#### P1 — The Ship Sheet (NEW)
- **Outcome:** one screen — the ship, big, in 3D, turning slowly in the hangar — and beside it six
  stats a player understands, each a bar from 1–10 with a one-line meaning:
  **Firepower** (damage per second you can sustain), **Toughness** (how much it takes to kill you),
  **Speed** (top and boost), **Handling** (turn and stop), **Power** (how long you can fire and use
  powers before you run dry), **Muscle** (what the Line and powers can move: tow class, throw
  weight). Hover any part, card or slot and every stat shows a **green/red delta** before you
  commit. A one-word **build identity** ("Brawler", "Hauler", "Gunship") is computed from the
  shape of the stats.
- **Approach:** one pure **stat model** that maps today's derived engineering values (from the three
  owners above — reuse, don't recompute) to the six 1–10 stats with fixed, documented curves;
  every screen (Shipworks, ship, Crucible Ship & Kit, Swarm shop, New Game) uses it. Engineering
  numbers move behind a "Details" toggle.
- **Verify:** the stat model test (monotonic: a bigger gun never lowers Firepower; every starter hull
  lands on a distinct shape); `ui-bench --walk` on all five screens; a **blind comprehension
  check**: given two ship sheets, a reviewer who has never seen the game predicts which one wins a
  drag race, a slug-fest and a tow job — and is right.
- **Wrong ways:** a seventh, eighth, ninth stat; percentages; a second calculator that drifts from
  flight; hiding the 3D ship behind panels.
- **Size:** L.

#### P2 — Parts that explain themselves (NEW)
- **Outcome:** every part has a role icon, a plain one-sentence "what it does", its stat deltas on
  the sheet, a **tier** (Mk I/II/III — the owner allowed loot rarity on 2026-10-21) and a 3–5 s
  looping preview of it in action. The catalogue is organised by **what you want to do**, not by
  slot letter.
- **Approach:** a content pass over `src/data/weapons.js`, `modules.js`, `ships.js`: write the
  sentence and role for each; merge near-duplicates (the catalogue synthesises ~140 defs — many
  are variants nobody can tell apart); retire parts that do nothing distinct. Previews come from a
  scripted capture rig in the Range (the "TAKE IT TO THE RANGE" button already exists).
- **Verify:** a coverage test (every purchasable def has role, sentence, tier, preview id); the
  comprehension check from P1 extended to "which part makes my ship better at X".
- **Wrong ways:** sentences that restate the name; keeping duplicates "for content"; previews that
  are text.
- **Size:** L (content-heavy; medium agents with this spec).

#### P3 — One pilot, one progression (SUPERSEDES the four separate systems)
- **Outcome:** the player has a **pilot** that levels up from everything they do (Adventure,
  Crucible, Swarm), and a **skill tree** of 4–5 branches tied to verbs — Gunnery, Line Work,
  Piloting, Engineering, Salvage & Trade — where each node changes what you can *do* (VISION:
  "progression means increasing physical agency"), not +3%. Research becomes the **blueprint
  catalogue** (where parts come from); Crucible perks and Swarm draft stay run-scoped but read the
  same skill vocabulary.
- **Approach:** design doc first (the tree, ~40 nodes, every node a verb change with a preview),
  owner-approved; then one progression owner with a save migration; the Ship Sheet shows pilot
  level and skills beside the ship.
- **Verify:** a fresh save reaches pilot level 5 in the first hour; every node's effect is
  visible in a capture; old saves migrate.
- **Wrong ways:** stat-percentage nodes; a fifth parallel system bolted next to the four.
- **Size:** XL. **Owner decision:** approve the tree before implementation.

#### P4 — Fits you can see (EXTENDS asset work)
- **Outcome:** every fitted part shows on the hull model (guns on hardpoints, drives change the
  engine glow and plume, shields change the hull sheen, heavy plating adds armour panels); paint
  and decals are earned and visible in flight.
- **Approach:** the hull models already carry sockets/hooks (the Forge pipeline); add a part-visual
  table and a socket mounter; paint unlocks from pilot milestones.
- **Verify:** a lineup capture of one hull in five fits — an independent reviewer can tell the fits
  apart from the picture.
- **Size:** L (art + code).

---

## Part 3 — The world: a journey, not a pile of content

### 3.1 What exists
- **[V]** A campaign spine (`src/story/campaign47a/storySpine.js`), endings A–E
  (`src/story/endings/`), story facts and ledger, 370 encounter files (`src/data/encounters/`),
  mission/contract systems, factions with grudges, a bar with contacts and a voice arc.
- **[V]** The report card: "10 sectors are a name plus a hazard circle"; "211 lived vignettes from
  one template"; "12 of 15 contact counters never move"; "the finale names 2 of 15 contacts";
  "439 per-line voice WAVs go unused"; "three heists, one door".
- **[I]** There is no single document a player-journey designer can read that says: act 1 happens
  here, teaches this, ends with that set piece.

### 3.2 World campaigns

#### W1 — The Journey: arrange the game into acts (NEW, strong agent, owner reviews)
- **Outcome:** a player who starts a new game is pulled along a clear critical path through
  3–4 acts across the sectors, each act with a goal, a new verb or system unlocked, a signature
  set piece, and a cliffhanger; side content hangs off the path; the endings A–E are reachable and
  foreshadowed.
- **Approach:** (1) inventory what exists (spine beats, encounters, sectors, contacts, endings) into
  one table; (2) write the **Journey doc** — acts, beats, where each existing piece goes, what is
  cut, what few pieces must be built; owner approves; (3) implement the pacing director (gating,
  hooks, what the mission board recommends), reusing the spine/ledger; (4) walk it.
- **Verify:** an agent plays a fresh save through act 1 on the ordinary route and the act's beats
  happen in order with no dead ends; a "what do I do next?" check at ten random moments always has
  a visible answer.
- **Wrong ways:** writing new lore; adding a quest system beside the spine; more vignettes from the
  same template.
- **Size:** XL.

#### W2 — Levels with shape: forty hand-crafted missions (NEW)
- **Outcome:** the best 40 encounters become **levels**: a place, a physical problem, a twist, a
  climax, a consequence — each one built around the physics verbs (VISION's "complex-looking
  outcomes from simple rules"). The other ~330 are cut, merged or become procedural filler with
  variety rules.
- **Approach:** rate all 370 against a 5-point rubric (verb use, readability, twist, consequence,
  uniqueness); upgrade the top 40 with authored geometry and set pieces; turn repeated templates
  into a small set of procedural job generators with real variety.
- **Verify:** each of the 40 has a 60–90 s capture of its climax judged against the rubric by an
  independent reviewer; the procedural jobs pass a "20 in a row don't feel the same" check.
- **Size:** XL (parallelisable by sector).

#### W3 — Sectors with identity (EXTENDS sector work)
- **Outcome:** every sector reads as a place in one screenshot and plays differently: a landmark,
  a resident faction doing its job visibly, a hazard that is a verb (a current you can ride, a field
  you can use), its own music and palette.
- **Verify:** a 10-screenshot lineup where an independent reviewer names each sector without
  labels; a capture per sector of its hazard used as a tool.
- **Size:** L.

#### W4 — Characters who remember you (EXTENDS story/bar)
- **Outcome:** the 15 contacts each have a short arc that reacts to what you did (the counters
  move); the unused voice lines are wired where they fit; the finale names what you did.
- **Size:** M–L.

#### W5 — The first hour, Gold (EXTENDS onboarding)
- **Outcome:** a stranger plays the first hour without confusion: one verb at a time, a hook in the
  first minute that doesn't need sound, the first dock teaches the ship sheet, the first choice
  splits into the three loops. Uses W1's act 1.
- **Verify:** a recorded first hour by an agent following only on-screen guidance; zero "what now"
  moments longer than 15 s.
- **Size:** L.

---

## Part 4 — The look and the sound

#### X1 — One art direction (NEW, owner reviews)
- **Outcome:** a one-page style bible and a lineup proving it: one rendering style and one scale
  system. Today flat painted 2D planets sit beside blocky/voxel props beside detailed ships **[V]**.
- **Approach:** decide (with the owner) the planet treatment (3D shaded bodies vs. painted
  backdrops behind parallax), the prop style (match the Forge ships' detail level), the scale rules;
  produce a census of assets that break it.
- **Verify:** owner approves the lineup; census table committed.
- **Size:** M.

#### X2 — Asset production campaign (NEW, image-verified)
- **Outcome:** the assets the plans need, built through the Forge/Blender route
  (`docs/visual-assets/README.md`), each judged by image review against X1:
  enemy silhouettes for every Swarm archetype (SWARM S7 sheet); boss break-up chunks; arena kits
  for the 7 Swarm arenas; 3D planets or new backdrops per X1; props that replace the voxel crates;
  part visuals for P4; the ship sheet's hangar scene.
- **Verify:** per asset, a lineup capture at the gameplay camera + a turntable; an independent
  image review against X1; runtime manifest rows; no frame-time regression (E10).
- **Size:** XL (many medium agents; one art-direction reviewer).

#### X3 — Adventure glass (carries SWARM S2 to the whole game)
- **Outcome:** Adventure flight shows the fight, the objective and the ship — not prose. Today:
  atmospheric lines over the action, a jargon stack, a permanent seven-row power list, chatter with
  no priority **[V]**. One persistent set, ≤ 3 short transients, plain words.
- **Size:** M. **Depends:** SWARM S2 landed.

#### X4 — Sound and music (EXTENDS audio)
- **Outcome:** a score that follows the game (exploration, tension, combat, boss, station), impact
  sound with mass and material, voice where it fits. Today ~36 s of authored music **[V]**.
- **Approach:** an adaptive music system on the existing score engine (phases, keys, bar
  quantisation) with authored stems; a sound-design pass on the 30 most frequent events.
- **Verify:** a 10-minute recording of play judged against a written audio brief; the most frequent
  events each have ≥ 3 variants.
- **Size:** L.

#### X5 — Controls and input contexts (carries SWARM S5 to the whole game)
- **Outcome:** a context system (flight, combat, station, map) with a short, visible control set
  per context; gamepad parity; rebinding stays. Today every letter key is bound **[V]**.
- **Size:** M.

---

## Part 5 — Campaigns that fix the process

#### Q1 — The switched-off and placeholder census (NEW, run early)
- **Outcome:** a committed table of every feature flag, opt-in, placeholder comment ("nothing has
  tuned them", "placeholder", "TODO tune"), self-imposed bar and disabled built feature in `src/` —
  each with a decision: **turn on**, **tune**, **delete**, or **keep off (why)** — and the decisions
  executed. Known examples: tumble materials untuned; BatchedMesh off; `mergeGroups` on 1 of 414
  packages; quality tiers never auto-applied (later ruled); worker held to a self-imposed bar.
- **Verify:** the table; each "turn on/tune" has a before/after; nothing left "unknown".
- **Size:** M.

#### Q2 — Route walkers (NEW, recurring)
- **Outcome:** every player journey (new game → first hour; each act; Swarm 1–15; each station
  screen; save/continue; settings) walked end-to-end by an agent on the laptop, with captures and a
  defects list filed to the owning campaign. Repeats after each wave lands.
- **Approach:** a written route list with expected beats; walkers play with the pane visible and
  file only material defects with a capture.
- **Size:** M per pass.

#### Q3 — The taste gate (NEW, standing)
- **Outcome:** every visible change lands with before/after captures judged by an independent agent
  against the relevant taste bar (SWARM README §4, X1 style bible, P1 comprehension check). One
  rubric, one review, findings fixed before landing.
- **Size:** S (a document and a habit).

#### Q4 — The razor: fewer, deeper systems (EXTENDS Lane 3's razor)
- **Outcome:** dead systems, unreachable content, duplicate mechanisms and their tests are deleted;
  the 261 systems, ~430 data files, ~4,850 test files and 774 npm scripts shrink to what the game
  uses. Breadth without connective tissue is cut (owner 2026-10-21: depth, not bolt-ons).
- **Verify:** counts before/after; the game boots and every Q2 route passes.
- **Size:** L.

#### Q5 — Tests that protect the game, not the code (NEW)
- **Outcome:** three tiers — **fast** (< 2 min, behaviour), **route** (real boot, real input),
  **reference** (determinism, versioned by a tool so intentional changes are one command, never a
  hand-edit). The ~365 source-text pin tests become behaviour tests or go.
- **Size:** M.

---

## Part 6 — In flight elsewhere (do not re-plan)

- **SWARM program** (`design/program/finish/swarm/`): lanes F (the fight) and S (the show), plans
  S1–S16. Engine campaigns must not touch the files those lanes own (see `swarm/LANES.md`).
- **Performance work** (Codex, `PERFORMANCE_HANDOFF_2026-11-05.md`): LOD admission, retained
  batches, effects tiers, ship package consolidation, the 2026-11-06 hitch fixes. E2 and E6 extend
  it; coordinate in `NOW.md`.
- **Velocity program** (`design/program/velocity/`): stern-camera free flight.
- **Finish lanes 1–3** boards remain the backlog of record for items not covered here.

---

## Part 7 — Order, staffing and how to launch

### 7.1 Waves

| Wave | Campaigns | Why first |
|---|---|---|
| 1 — stop the bleeding | **E10**, **E1**, **E5**, **Q1**, **E3** | the freeze/blip ends; the fast path turns on; switched-off work is found |
| 2 — the cheap core | **E2**, **E6**, **P1**, **X1**, **W1** (doc phase), **X3** | the sim and renderer stop hitching; the ship makes sense; the art and journey get a direction |
| 3 — the big rebuilds | **E4**, **E7**, **P2**, **P3**, **W2**, **X2**, **E9** | data-oriented core, renderer rebuild, parts and progression, levels, assets |
| 4 — the decision and the finish | **E8**, **W3**, **W4**, **W5**, **P4**, **X4**, **X5**, **Q4**, **Q5** | port verdict on a fair baseline; the world and the first hour reach Gold |
| always | **Q2** after each wave, **Q3** on every visible change | |

### 7.2 Staffing (to spend usage where it matters)

- **Strongest agents, one at a time:** E1, E4, E7, E8, P3, W1. These need judgment; a weak
  agent will tweak instead of rebuild.
- **Medium agents with this document:** E2 (after the profiler exists), E3, E5, E6, E9, E10, P1,
  P2, P4, W2–W5, X1–X5, Q1–Q5. The specs are detailed so taste is in the text.
- **Strong reviewer, cheap habit:** Q3 reviews run on a strong model but are short.
- Give every campaign **one folder** `design/program/finish/campaigns/<id>/` with its diagnosis
  memo, decisions, captures index and status — so a fresh agent resumes without re-deriving.

### 7.3 The launch prompt (copy, fill the two blanks)

```text
You are running campaign <ID — NAME> of the SpaceFace master plan.

Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

READ FIRST, ALL OF EACH: design/program/finish/MASTER_PLAN.md Part 0 (how to work) and your
campaign's section; design/VISION.md; AGENTS.md; ARCHITECTURE.md; design/program/NOW.md. If your
campaign touches Swarm, also design/program/finish/swarm/README.md and LANES.md (never edit a
SWARM lane's files). Then read only the source your campaign names.

YOUR JOB: deliver the campaign's Outcome and meet its "Verify" on the owner's laptop. Any amount of
work is allowed — rewriting or replacing a subsystem, changing language or engine — when your
diagnosis shows it is the cheaper road to the finished result.

STEP 1, BEFORE ANY EDIT: write design/program/finish/campaigns/<ID>/DIAGNOSIS.md (≤ 1 page): the
player-visible problem; the measured cause chain with numbers; is the design itself the
bottleneck (what replacing it would cost and buy); the road you chose and why it is cheapest to
the FINISHED result. Commit it.

RULES: diagnose, don't tweak. A 90%-correct system configured wrong is a defect — fix it. Visible
changes need before/after captures (Browser pane VISIBLE — hidden = ~1 fps) judged against the
taste bar your campaign names, plus one independent review. Determinism references are versioned,
never overwritten. Shared checkout: claim paths in NOW.md; git add/commit exact paths only; never
-A, reset, stash, clean, rebase or force-push; publish only your paths when local master carries
others' unpublished commits. End commits with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

KEEP design/program/finish/campaigns/<ID>/STATUS.md current (what's done, what's next, evidence) so
a fresh agent can resume. If truly blocked, finish everything else and name the blocker in one
plain sentence. Report to the owner in plain words — done / not done, what changed for the player.
```
