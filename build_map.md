<!-- LIFETIME: STABLE -->
# SpaceFace Build Map

This is the repository's implementation front door. It routes an agent to the smallest authoritative packet and the live owners it must respect. It deliberately contains no current queue snapshot, branch name, lease, test transcript, or completion history.

Completed work moves to [build_map_done.md](./build_map_done.md): strike the entry from the live board, land the record there with its commit and receipt, and reviews read it there.

## 1. Start here — the one procedure (no scope words needed)

**The goal, in the owner's words (2026-09-03):** *a super-fun space adventure game with fast-paced,
physics-centric, arcade-style combat that plays optimally in swarm mode, and is super interesting and
mentally stimulating in adventure mode because of its advanced customization and economic features,
as well as the storyline; with a frontend polished massively, everything brought into the newest
version and optimized.* Product intent: [`design/VISION.md`](./design/VISION.md).
Expansion alignment is retained in the non-dispatching [`EXPANSION_MASTER_BLUEPRINT.md`](./design/program/roadmap/active/EXPANSION_MASTER_BLUEPRINT.md)
and the story/place concept companion [`EXPANSION_STORY_AND_PLACES.md`](./design/spec3/EXPANSION_STORY_AND_PLACES.md).
Those syntheses do not add queue IDs or replace packet ownership. Existing owners stay compactly mapped here:
kinetic combat and the Massline → `PQ-137`, `PQ-026`–`PQ-031`, `PQ-140`, `PQ-146`; readable swarms and
world reactions → `PQ-140`, `PQ-174`, `PQ-175`, `PQ-138`, `PQ-143`, `PQ-151`, `PQ-144`; readable trade
and progression → `PQ-177`, `PQ-155`, `PQ-148`, `PQ-151`; visual hierarchy and impact presentation →
`PQ-190`, `PQ-134`, `PQ-023`, `PQ-144`. Bars:
[`design/FEEL_CONTRACT.md`](./design/FEEL_CONTRACT.md). The finish line: §15–§19 below.

**Two kinds of agent (owner, 2026-09-22).** A strong agent is given a feeling and invents a better
foundation than a planner would write. A grunt pass is given a specific change and does that change.
The build map's open work for the strong pass is [§23](#23-superpower-campaigns--admitted-2026-09-22).
The specific work for the grunt pass is
[`design/program/INFERENCE_IDEAS.md`](./design/program/INFERENCE_IDEAS.md).
[§22](#22-the-gap-between-the-description-and-the-build--admitted-2026-09-21) stays the measured gap
list: a known number, a fixture, a file list. Do not hand a strong agent a G-row and call it a
campaign. Do not hand a grunt pass a feeling and ask it to invent the system.

**You do not need to be told what to work on.** A named unit, "next", or "go" follows the queue.
The queue is the plan, its order is the project manager's order, and every packet says exactly what
to build, which number proves it, and the specific ways to get it wrong. An A-list pass with no
packet follows §23. An INFERENCE pass follows the catalog. "Make it better" when the ship feels
wrong still starts at the fun loop (§1.7), then returns here.

### 1.1 The procedure

1. Glance at `git status --short` and [`design/program/NOW.md`](./design/program/NOW.md) so you do
   not collide with another agent's live, exact paths. A dirty foreign hunk is protected.
2. If this sitting is a finishing or A-list pass with no named packet — "make it better", "finish
   the game", "polish", a long build session — take a lane from
   [§27](#27-the-finish-in-lanes--admitted-2026-09-24) / [`FINISH_LANES.md`](./design/program/FINISH_LANES.md):
   the first lane whose files are free, worked in order. A lane is an open-ended area assignment —
   you own the named work still open there **and** the review and tuning of that area to the
   A-list bar; the queue units inside it are its checklist, not a script. The A2 actualize lane
   (§23.4) is committed and closed. If this sitting is INFERENCE, take one OPEN catalog line.
   Otherwise `node scripts/program-dispatch.mjs --next`. That is your unit. Open the packet it
   names under [`design/program/roadmap/active/`](./design/program/roadmap/active/README.md). Do
   not shop around `--ready` for something you would rather do; the order is the plan (§1.2).
3. On a queue unit, read the packet's **How agents get this wrong** section before touching code.
   Then its Leaves row: the done-when is the definition of done, in player units. If a done-when is
   missing, unclear, or could be satisfied by something the owner would call thin, write the missing
   number into the packet first (one line), then build to it. A §23 campaign has no leaf: invent the
   mechanism, ship a slice the player can feel, and leave the campaign open until the feeling is
   ordinary. A catalog line's done sentence is the whole job.
4. If the unit is feel or combat (packets `PQ-137`, `PQ-139`, `PQ-140`, `PQ-146`, `PQ-173`, `PQ-174`,
   `PQ-175`, `PQ-176`, `PQ-186` and any leaf whose done-when names a `FEEL_CONTRACT` bar), run the
   Fun Convergence Loop: [`design/program/FUN_CONVERGENCE_LOOP.md`](./design/program/FUN_CONVERGENCE_LOOP.md).
   Fixed seeds, one hypothesis, before/after numbers.
5. Build it, then **iterate on it like a developer.** Play it yourself at the shipping camera, judge
   it, and fix what you would not ship; the first version that merely meets the bar is a draft. When
   you are about to close, have another agent look at the actual work for three things: is it
   finished, what is buggy, and what would make it better. Fix what is real. Do not write review
   files or store stills. Then run the checks that would catch this change's real failure modes
   (§7 and the packet's own checks) — you are trusted to know which those are. If other agents are
   live in the tree, leave a checkpoint row (`node scripts/agent-checkpoint.mjs start`) and release
   it when you stop; otherwise skip the ceremony. Commit your files by pathspec.
6. Set the unit's queue state. A short note for the next engineer only if you learned something
   they could not see from the code. Write the report in §1.4's format. Then go to step 2 and take
   the next unit. Do not stop because a check is green, because one leaf is done, or because the
   context is long. Stop only for §1.5.

Broad, unnamed quality work still goes through the Central Brain manager loop
([`design/program/CENTRAL_BRAIN.md`](./design/program/CENTRAL_BRAIN.md); ranked selector in
`tools/agentic/select_next_work.py`, campaign slate in `tools/agentic/manager_cycle.py`). It ranks
inside the same queue; it never admits, mutates queue truth, or replaces this procedure.

### 1.2 The order (why `--next` returns what it returns)

Dispatch order is kind first (build before proof), then unit priority. The units of the finishing
program carry priorities that encode this sequence, and their dependencies name the exact units they
wait for, so content cannot be handed out before the ship handles.

| Phase | Gate it serves (§15.1) | Packets, in order |
|---|---|---|
| **0 · The playable demo** (first; owner, 2026-09-20) | DEMO | `PQ-210` smooth, solid, answering, hardware: `.00` Crucible roster prewarm · `.01` a fight fits the frame · `.02` the first 20 seconds · `.03` nothing on screen unloads · `.04` every hit answers, with sound · `.05` the demo HUD · `.06` a quiet machine · `.07` ask once about motion · `.08` the fifteen-minute demo. Target, evidence and bars: [`DEMO_READINESS_2026-09-20.md`](./design/program/DEMO_READINESS_2026-09-20.md) |
| **A · The toy works** (now) | ALPHA | `PQ-173` the fun-loop instrument · `PQ-167` telemetry and the weekly playtest · `PQ-137` the guts (`.03`–`.11`) · `PQ-189` **correct the compass** (controls contract, stale diagnoses retired) · `PQ-174` the swarm fun contract (with `.08` earned breathing room) · `PQ-139` impacts answer · `PQ-158.06` minimal action audio · `PQ-165.03` reduced motion keeps information · `PQ-138` the world reacts · `PQ-140` roster as physical problems · `PQ-146` stunt grammar · `PQ-186` the regression fortress · `PQ-180` the frontend grammar matrix · `PQ-144.01` the production baseline · `PQ-163` the first ten minutes · `PQ-141` **the 60-second proof (gate)** |
| **A2 · Picture, light, ear** | BETA | In order, [§23.4](#234-actualize-the-tools): `AQ-CAS` · `AQ-LOD` · `AQ-LIGHT` · `AQ-SURFACE` · `AQ-VOICE` · `AQ-HIT`. Each waits until the one before it is committed. This lane is how the outside tools become the picture. |
| **B · The swarm and the world** | BETA | `PQ-190` **the style slice** (stylized industrial energy, approved at the shipping camera before any fleet pass) · `PQ-193` **the 3D picture never looks broken** (complete bodies, opening flyby, tubes, shelf, places) · `PQ-175` swarm content at craft · `PQ-029` `PQ-030` `PQ-031` `PQ-026` heads and coupling · `PQ-147` field toys · `PQ-027` `PQ-028` machinery and infrastructure · `PQ-148` cargo is physics · `PQ-149` the storyteller · `PQ-150` people who remember · `PQ-151` the wanted loop · `PQ-154` wrecks as terrain · `PQ-161` readable at zoom · `PQ-169` Crucible as replay surface |
| **C · Adventure depth** | BETA | `PQ-177.06`/`.07` cargo custody and visible industrial limits · `PQ-145.01` the first durable site loop · `PQ-176` customization with consequences · `PQ-155` the verb curve · `PQ-156` three starters · `PQ-142` progression and my ship · `PQ-177` an economy you can read · `PQ-178` the story pipeline · `PQ-032` the linear spine · `PQ-152` set pieces from verbs · `PQ-153` six sectors · `PQ-143` ordinary life · `PQ-145` industry authorship · `PQ-171` content grammar · `PQ-195` the Third Shift finished |
| **D · Frontend to the newest version** | BETA | `PQ-162` the station redesign · `PQ-168` the chart finished · `PQ-181` the meta shell · `PQ-182` Crucible screens · `PQ-183` everything is a link · `PQ-184` UI performance · `PQ-185` Asteroid Works accepted (with the live `PQ-130` / `PQ-131`) |
| **E · It ships** | RELEASE | `PQ-158` audio direction · `PQ-159` camera and photo mode · `PQ-160` replay and clips · `PQ-164` input truth · `PQ-165` accessibility and options · `PQ-166` five languages · `PQ-144` density and perf guard · `PQ-033` the release closeout |
| **F · After** | POST | `PQ-170` endgame pulls · `PQ-172` mods |

**§25 is the A-list demo program (owner, 2026-09-23): *see the body*.** Nearly every Phase 0 and
finish leaf reads `done`, and the live frame still fails a stranger: your own hull is a speck, the
kill is invisible, and the sky, the arena and the HUD out-shout the fight. §25 sequences CV-GLASS,
CV-PAINT, CV-HAND/CV-AMMO, CV-KIT (ORRERY) and `PQ-210.08` into seven phases with the bars nobody
had written down. A long "make it A-list / finish the demo" session starts there.

Residual packets minted from program sweeps — `PQ-191` (the deferred independent passover),
`PQ-204` (deterministic smoothness algorithms), `PQ-205`–`PQ-209` (ordnance, combat-variety,
people-who-remember, build-identity and actual-game-defect residuals) — carry no phase row; they
dispatch through `--next` / `--id` like any unit.

**§23 is the superpower front (owner, 2026-09-22).** The sequential lane is **A2** in the table
above: [§23.4](#234-actualize-the-tools), `AQ-CAS` then `AQ-LOD` then `AQ-LIGHT` then `AQ-SURFACE`
then `AQ-VOICE` then `AQ-HIT`. Take the first of those that is not yet committed. Do not start a
later one while an earlier one is open. A campaign in
[§23](#23-superpower-campaigns--admitted-2026-09-22) names the feeling for the task you are on.
You invent the mechanism. A better foundation than the paragraph is the point. That outranks a
soak, a capture, a closeout unit, and a §22 micro-row.

**§22 is the measured gap list (owner, 2026-09-21).** Take a row there when the job is a known
number, a fixture, and a file list. Wave G is grunt-shaped: small, already specified. `--next`
still returns the queue. Neither section cancels it. Grunt-sized work that is not already a §22
row lives in [`design/program/INFERENCE_IDEAS.md`](./design/program/INFERENCE_IDEAS.md). Do not
promote a catalog line into a campaign. Do not shrink a campaign into a catalog line and call the
feeling done.

Live campaigns owned by other threads (`PQ-129` hitch, `PQ-130`/`PQ-131` Asteroid Works, `PQ-050`
fleet remaster, `PQ-045` Ceres slice, `PQ-136` fielding, `PQ-193` 3D picture) keep their own doors
in §1B and their own units in the queue; `--next` interleaves them by kind and priority. Do not take
a unit whose paths a live row names. The remaster machine does not take §22 rows or §23 campaigns; it fills
[`design/program/vm-drop/`](./design/program/vm-drop/README.md) under [`VM_LANES.md`](./design/program/VM_LANES.md).

### 1.3 The craft (floors, not a script)

1. **Numbers or it did not happen.** A unit closes on its done-when measured in player units (screen
   depths, seconds, hull lengths, fraction kept or lost, verbs per minute), before and after, on a
   fixed seed. "It works", "it follows the path", "check is green" are not numbers.
2. **Numbers and the live owner — not a capture campaign.** Player-felt claims close on numeric
   measurements printed by the deterministic scenario or bench on a fixed seed, plus reading the
   code path that produces them (the listener, the bind, the spawn). A headed still is **not** the
   review method and **not** a close gate (owner, 2026-09-16). Use a still only when the claim is
   purely visual (silhouette, material, “one game”) and no structural check can falsify it; look
   in-session and delete it. Headed recordings happen only on the owner's explicit request.
   Timed-out Chromium, a missing GPU, or a capture-harness red never blocks `implemented`. Packet
   prose that says “scenario + capture” means the scenario; the capture is optional. Art remaster
   KEEP/REVISE is the exception because that claim is the picture.
3. **Consequences or it is thin.** A new player-facing action or feature produces at least two further
   things (a motion, a reaction, a receipt someone consumes). One thing once is content, not a feature.
   A control, a confirmation, a selection, a brake or an instrument is exempt: it must do exactly its
   one thing well, and demanding noisy secondary events from it is the wrong law (audit 2026-09-05).
4. **Never answer feel with content.** More enemies, ships, stations or missions never close a feel
   unit. Camera shake and particles never close an event.
5. **Never add drag.** Never clamp given momentum. Never give an NPC a gyro, a transform write, or
   instant counter-thrust. Mass and momentum decide; hit points never scale.
6. **Never edit a test or a golden to pass.** A test assertion quotes the vision sentence it serves. A
   golden moves only with the causal record (`docs/COMMON_BUGS.md` §8/§10d).
7. **Fixed seeds.** Every scenario, bench and capture names its seed and tape. Randomness in a bench is
   how agents lose the ability to test.
8. **Crucible first.** Combat and flight feel converge in the Crucible bench; adventure inherits the
   numbers, never a copy of the system.
9. **Surface before invent.** List what already computes the thing (the packet's *What exists*) and
   connect it before writing anything new. Three of the biggest gaps in this game were missing
   listeners, not missing systems.
10. **One architecture.** Browser, Electron, Sandbox, Crucible, the lab: one game path. No flag-only
    features, no parallel registries, no second physics.
11. **The default route is the only route.** A feature the player cannot reach on the default route
    without a flag, a URL or a debug key is not done.
12. **Grammar before pixels.** Every 2D surface obeys `design/frontend/INSTRUMENT_GRAMMAR.md` and is
    measured by the matrix (`PQ-180`); a screen that looks fine and fails the matrix is not done.
13. **Finish the unit.** Half a unit looks identical to a finished one and never gets finished. If part
    is blocked, finish every other part and say the exact blocker in one sentence.
14. **Never ask the owner to adjudicate technical risk, and never ask in jargon.** Decide it. If a
    product judgment is genuinely theirs, ask in plain words with a default.
15. **Report in the owner's words** (§1.4). No file paths, hashes or check names in the summary.
16. **Iterate like a developer.** The done-when is the floor, not the target. Play your own work,
    judge it, and fix what you would not ship before closing. Ship the second or third attempt, not
    the first blind one that happened to go green.
17. **Judgment over litany.** These laws are floors and honest-work defaults, not a script to
    execute. Run the checks and measurements that would catch your change's real failure modes and
    skip the rest; nothing here replaces looking at the work and using taste.
18. **Use the named outside resources.** The ones that would make this game better are listed in
    [`docs/OPEN_SOURCE_INTAKE.md`](./docs/OPEN_SOURCE_INTAKE.md) §0. Use the one that matches the
    job. Do not open a search for a substitute, and do not copy Unreal Engine code. A catalog line
    still stays inside its files.

### 1.4 The report (the only thing the owner reads)

```text
DONE / NOT DONE  <unit id> — <one plain sentence naming the outcome>
WHAT I FOUND     one sentence, plain words (the fundamental, if this was feel work)
WHAT I CHANGED   one sentence, no file names
WHAT YOU WILL FEEL   two sentences: what is different when you play; what still is not
THE NUMBERS      bar | before | after | target   (only the bars this unit moved)
THE FEEL         one sentence on whether it plays better; committed capture strips are never required
NEXT             the next unit --next will return
```

### 1.5 Stop conditions (the only reasons to stop)

- A required owner seam is missing or its contract unknown → `BLOCKED` with the exact shared-change
  request, after finishing every other leaf.
- The unit's paths collide with a live `NOW.md` row → take the next unit.
- Two failed repair cycles with the same causal model → record the falsified model, narrow the
  scenario, choose another model; after three models, escalate in plain words.
- The owner said stop.

### 1.6 Before you call it done

There is no standing integrator gate and no approval step. These are the questions a good developer
asks themselves before closing; use judgment, and iterate until the answers are yes:

- Would you ship this? If it is thin, ugly, half-wired, or only green because a check passed, fix it
  and play it again — that iteration is the job, not overhead.
- Is the outcome measured in the done-when's player units, on a fixed seed? "It works" and a green
  check are not numbers.
- Is it reachable on the default route, with no flag, URL or debug key?
- Did you add content, shake, particles, drag, a clamp on given momentum, an NPC gyro, hit-point
  scaling, or a dialogue tree where the packet asked for feel? Take it back out.
- Did a test or a golden change without the vision sentence or the causal record? Then find the cause.
- Does the report say what moved and what it plays like now, in the owner's words?

A second pair of eyes for unfinished work, bugs, and cheap bits is how you catch a lazy first try.
It is a look at the actual work, then a fix — not a JSON wave, not a stored still, not a receipt
novel. When the owner asks for a taste pass, do the same (§1.7).

### 1.7 If the owner names a symptom

The procedure above needs no scope. When the owner names one, route it and then continue the
procedure:

| The owner says | Start here |
|---|---|
| "Here is a taste review / an outside audit; fold it in" | Grade every recommendation in §15.9 (adopt / adopt with a guard / decline, with the ruling it agrees or conflicts with); admit each adopted item as a leaf of the packet that already owns the surface, or a new packet only when no packet does; store the review under `docs/handoffs/` as HISTORICAL evidence with a pointer back to the grade. Never a second queue, never verbatim orders |
| "review what just landed", "second pair of eyes", "taste passover before those units are finished" | Play the named surfaces yourself or hand them to one agent, **fix** what is real (taste and bugs), and report in §1.4 words. Incoming written audits grade through the row above and §15.9. There is no standing review queue |
| "it's not fun", "make it better", "it sucks", "wonky", "no control" | **§27** → [`FINISH_LANES.md`](./design/program/FINISH_LANES.md) lane **THE HAND**; the loop method is [`design/program/FUN_CONVERGENCE_LOOP.md`](./design/program/FUN_CONVERGENCE_LOOP.md) |
| "finish the game", "what's next for release", "the professional bar", "batch the work into lanes" | **§27** → [`FINISH_LANES.md`](./design/program/FINISH_LANES.md) — take the first lane whose files are free and own that area to its bar |
| "swarm mode should be more fun" | §16 → `--id PQ-174` |
| "adventure is boring / thin" | §17 → `--id PQ-176`, `PQ-177`, `PQ-178` |
| "the screens look cheap", "polish the frontend", "bring the UI up to date", "A-list / bold / expressive frontend" | **§20.15** (admitted 2026-09-10: [`FIELD_HARDWARE_PROGRAM.md`](./design/frontend/direction/FIELD_HARDWARE_PROGRAM.md)) → `--id PQ-194` (style frames → asset kits → the stage → the title live as the veto point → surfaces). §20.14 / `PQ-187` is superseded. `PQ-180` is the floor, not the gate |
| "the ship jigs / jitters / doesn't know where it is", "it's not smooth" | **§21** → run `npm run probe:smooth-flight` and read `SHIP LOST ITS PLACE` (must be 0) before anything else. The loop has ONE order — simulate, then present (`check:baseline` → `smooth-flight`). Never reintroduce a draw-first frame, a pose hold against a running sim, or a sim step cap on slow frames |
| "the attacks are limp / frozen / a swirl that doesn't spin" | **§21** → first read `state.settings.video.motionReduce`: on 2026-09-20 the owner's Windows "Animation effects: off" had silently stripped every combat effect. Then `--id PQ-210.04` (four channels, with sound) |
| "things pop out of existence", "asteroids vanish", "it doesn't load in time" | **§21** → `--id PQ-210.03` when it is the known retired asteroid buffer; read `state.render.asteroidInstancePool.variants[].retiredOwners` and the console for `[asteroid-pool]`. A class of pop — ships, wrecks, stations, empty locks, the glass lying — is campaign **CV-GLASS** in §23, not another prefetch constant |
| "zero to hero", "make the demo A-list", "I can't see my ship", "the fight is unreadable", "long build session" | **§25** → [`ZERO_TO_HERO_2026-09-23.md`](./design/program/ZERO_TO_HERO_2026-09-23.md). Take the first phase without a visible slice; close each phase on its stranger pass, not a green check |
| "unify the picture", "one art direction", "graphics aren't one game", "convergence", "creative campaigns", "superpower pass", "make it A-list" | **§27** → the lane that owns the area (the §23 campaigns are absorbed into the lanes); §23 stays the detailed wording. §22 is the measured list, not this door |
| "it's hitching / stuttering" | **§21** → `npm run probe:smooth-flight:crucible` names each freeze and what paid for it, with the whole-machine CPU line; then `--id PQ-210.00`–`.02`. §8.4 / `PQ-129` holds the earlier campaign; measure first, never cut quality |
| "the mining board is unreadable / ugly" | `--id PQ-130` (board law) and `PQ-131` (authored objects); `PQ-185` accepts |
| "the ships / objects look like toys" | **§13D** → `--id PQ-193`; flyable remaster stays `PQ-050`; unused packs stay `PQ-136` |
| "NPC ships look like another game / floating parts / reverse jets are needles" | **§13D** → `--id PQ-193` leaves `.01` / `.02`. Law: [`design/program/VISUAL_WORLD_CLEANUP.md`](./design/program/VISUAL_WORLD_CLEANUP.md). Hitch stays frozen. |
| "ships don't render / pieces missing / empty targeting lock" | **§13D** → `--id PQ-193` leaf `.00`. Complete packaged body, not a procedural fallback. Do not unhide a box while waiting. Process: [`design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md`](./design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md). |
| "the world feels dead / nobody reacts" | §13C `PQ-138`, then §15 `PQ-149`–`PQ-151` |
| "I can't tell what anything is" | `PQ-161` readable at zoom, `PQ-153` sectors, `PQ-162` station |
| "the sound is bad / there's no music" | `PQ-158` (after the ALPHA gate) |
| "it crashed / my save is gone / it won't start" | integrity first: §7, `PQ-033`, the save checks |

Do not sweep `design/`, `.campaign/`, assets, transcripts, or screenshots for an ordinary unit.

## 1A. Central Brain quality-convergence layer

For the full architecture behind broad autonomous development, read
[`docs/agentic-development/AGENTIC_GAME_DEVELOPMENT_OS.md`](./docs/agentic-development/AGENTIC_GAME_DEVELOPMENT_OS.md)
and its focused plans for
[observability/replay](./docs/agentic-development/OBSERVABILITY_REPLAY_AND_PLAYTEST_ARCHITECTURE.md),
[quality scorecard](./docs/agentic-development/QUALITY_SCORECARD.md),
[plan convergence](./docs/agentic-development/PLAN_CONVERGENCE_PROTOCOL.md),
[content factory](./docs/agentic-development/CONTENT_FACTORY_AND_COMPLETENESS.md),
[bounded INFERENCE](./docs/agentic-development/INFERENCE_PROTOCOL.md),
[visual/VFX direction](./docs/agentic-development/VISUAL_DIRECTION_AND_VFX_SYSTEM.md),
[performance governance](./docs/agentic-development/PERFORMANCE_GOVERNANCE.md), and the
[implementation roadmap](./docs/agentic-development/IMPLEMENTATION_ROADMAP.md).

The manager loop is `observe -> reduce -> rank -> assign -> implement -> replay -> compare -> keep/revert`.
It consumes the **existing** PQ graph. It never replaces `program-queue.json`, active packets, receipts,
or user priority. Use screenshots for appearance, deterministic/lifecycle telemetry for temporal truth,
and one cold reviewer only where subjective judgment adds information. Unknown evidence is not a green
quality claim. Fixed pass/reviewer counts are not universal quality gates.

For broad unnamed development, start at
[`design/program/CENTRAL_BRAIN.md`](./design/program/CENTRAL_BRAIN.md); the ranked selector over the
existing dependency-ready PQ graph is
`python tools/agentic/select_next_work.py --format prompt` (one unit) or
`python tools/agentic/manager_cycle.py --refresh --limit 3` (a campaign slate). It ranks; it does not
admit, mutate queue truth, or replace the routing doors in this map.

## 1B. Named campaigns and their laws (reference; not the default door)

These campaigns are live or resumable and keep their own laws. `--next` already interleaves their
units; open the door below only when the owner names the campaign.

- **Hitching / stuttering** → §8.4, [`design/program/PERF_HITCH_CAMPAIGN.md`](./design/program/PERF_HITCH_CAMPAIGN.md),
  `--id PQ-129`. Measure with `npm run probe:runtime-witness` first. Never cut quality or delete
  off-screen actors.
- **3D objects look like toys next to real ships** → **§13D** `--id PQ-193` leaves `.03`–`.05`. Bar and
  hitch-collision law: [`design/program/GRAPHICS_3D_CAMPAIGN.md`](./design/program/GRAPHICS_3D_CAMPAIGN.md)
  (operator [`GRAPHICS_3D_GOAL.txt`](./design/program/GRAPHICS_3D_GOAL.txt)). Not `PQ-129`, not a quality cut.
- **Asteroid Works unreadable / undrivable / ugly** → [`design/ASTEROID_WORKS_DESIGN_LAW.md`](./design/ASTEROID_WORKS_DESIGN_LAW.md),
  [`ASTEROID_WORKS_PLAYFIELD.md`](./design/program/ASTEROID_WORKS_PLAYFIELD.md), `--id PQ-130`; the
  procedural stand-ins → [`ASTEROID_WORKS_ART_CAMPAIGN.md`](./design/program/ASTEROID_WORKS_ART_CAMPAIGN.md),
  `--id PQ-131`. The board is the game. `PQ-185` wraps acceptance.
- **Any 2D / HUD / menu / screen work** → §18 and [`design/frontend/INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md)
  before designing or building anything; §11 records the sixteen jobs that already landed.
- **Crucible / swarm / combat lab / arenas / attack modifiers** → §12 (`PQ-133`, engineering complete),
  §16 (`PQ-174`, `PQ-175`, fun and content), §13 (`PQ-134` VFX pool).
- **`INFERENCE`** (no spec) → copy [`INFERENCE_GOAL.txt`](./design/program/INFERENCE_GOAL.txt);
  law [`INFERENCE_LANES.md`](./design/program/INFERENCE_LANES.md). Five units: look at play,
  infer a real weakness, complete it, rotate to a different kind. Detect is an optional
  count hint, not the assignment. `INFERENCE <N> [scope]` is the same loop with a named
  count or domain. Thin rows do not count. That door does not run the fleet remaster and
  does not replace §1.1. When the deficit is a busy sim with no designed moment, also
  [`INFERENCE_INTENTIONAL_FUN.md`](./design/program/INFERENCE_INTENTIONAL_FUN.md)
  (prompt [`INFERENCE_INTENTIONAL_FUN_GOAL.txt`](./design/program/INFERENCE_INTENTIONAL_FUN_GOAL.txt)).
- **Jules / cloud agents** → [`design/program/jules/README.md`](./design/program/jules/README.md);
  a directed candidate bank, not the live queue. Validate with `node scripts/jules-dispatch.mjs --validate`;
  select or render exact work with `node scripts/jules-dispatch.mjs --next` or `--id JULES-XXXX --format prompt`.
  One task per cloud branch or PR; a stronger local integrator reviews, rebases, proves and merges. Jules tasks
  never edit the bank, the queue, the NOW board, root authority, or expected telemetry envelopes.
- **Campaign / overnight / "do all of it"** → the procedure in §1.1 with no stop after one unit; the
  order in §1.2; acceptance leaves that need a headed machine you do not have are recorded `unproven`
  and skipped, never stalled on.
- **Non-Hitch flyable fleet remaster** → `--id PQ-050` and its packet
  [`PQ-050.md`](./design/program/roadmap/active/PQ-050.md), which owns the chase-camera law, the
  technique contract, the review workflow and the one-ship-at-a-time rule. Hitch stays frozen.
  A factory loft with boxes, a zoomed gray crop, or a seat nobody can see from the chase camera
  does not close a ship.
- **The 3D picture never looks broken** → **§13D** `--id PQ-193`. Complete bodies, opening flyby,
  tubes, shelf hulls, places. Flyable remaster stays `--id PQ-050`. Hitch stays frozen.
- **Audit every 3D model / plan A-list quality from the shelf we already have** → copy
  [`MODEL_STOCKTAKE_GOAL.txt`](./design/program/MODEL_STOCKTAKE_GOAL.txt). Law:
  [`MODEL_STOCKTAKE.md`](./design/program/MODEL_STOCKTAKE.md). Research and a plan only. Folds
  into §13D / `PQ-193`. Do not model. Do not open a second queue.
- **Live-route visual cleanup (mixed-game NPCs, floating parts, needle retros)** →
  `--id PQ-193` leaves `.01` / `.02`. Law: [`design/program/VISUAL_WORLD_CLEANUP.md`](./design/program/VISUAL_WORLD_CLEANUP.md).
  Taste-led. Do not pre-solve the look. Hitch stays frozen. `PQ-190` remains the style-slice owner.


### 1B.1 Retained campaign laws (verbatim from the previous front door)

Moved to [build_map_done.md](./build_map_done.md) — completed/historical, kept verbatim for review. Does not dispatch work.

## 2. Product north star

SpaceFace is an open-source systemic space game with the legible economic and navigational base of games such as Endless Sky, but its distinctive play is physical. Gravity, inertia, collision, Massline attachment, boost, payload mass, fields, recoil, orbital geometry, and improvised physical tricks should produce tactics that are visible, learnable, and surprising.

A strong implementation therefore does all of the following:

- creates a meaningful player decision rather than merely another data row;
- lets existing physical systems interact instead of scripting a decorative imitation;
- keeps cause and consequence readable at the normal game camera;
- preserves deterministic simulation, single-writer state ownership, save/Continue, and Browser/Electron parity;
- treats ambitious graphics as part of the feature, not a luxury to suppress;
- pays for new spectacle through structural performance work—LOD/HLOD, batching, instancing, culling, cadence, admission, compression, pooling, and bounded queries—not through silent quality cuts;
- leaves one coherent game path rather than a second implementation for probes, Electron, or a special mission.

When a plan and live evidence disagree, preserve the intended player outcome and repair the execution path. Do not preserve a stale technique merely because prose once named it.

For cross-system game-direction expansion, start at
[`design/vision/GAME_DIRECTION_EXPANSION.md`](./design/vision/GAME_DIRECTION_EXPANSION.md). It owns
durable portfolio axes and player-story coherence, never priority, leases, implementation, status, or
acceptance. Shape one bounded slice, then return to §1 and admit it through the normal program route;
graphics-only work still follows the standing graphics route above.
The optional
[`design/vision/INFERENCE_CONVERGENCE_METHOD.md`](./design/vision/INFERENCE_CONVERGENCE_METHOD.md)
captures the useful PR #92/ChatGPT research loop for comparing alternatives and cutting weak ideas;
it supplies no task, ownership, gate, quota, or acceptance authority.

## 3. Authority and truth

**The plan-family index is [`design/PLAN_REGISTRY.md`](./design/PLAN_REGISTRY.md).** It names which
plan family owns what, and which are ACTIVE, FUTURE or subordinate evidence. It correctly points at
THIS file as the agent front door, but nothing here pointed back at it — so an agent entering
through the front door could not find the index. That gap is closed here. If you are looking for a
plan and it is not in this document, look there before assuming it does not exist.


Use this order when sources disagree:

1. the user's current direction;
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) for technical invariants and owner boundaries;
3. [`design/VISION.md`](./design/VISION.md) for the owner's fantasy and UVP — wins on product emphasis;
4. [`design/GDD_2_0.md`](./design/GDD_2_0.md) for product intent;
5. `design/program/` for admitted work, live status, and acceptance;
6. the selected active packet or activated spec;
7. supporting plans and references;
8. historical handoffs and archives, for archaeology only.

A lower source cannot impose a palette, layout recipe, asset ceiling, implementation technique, process quota, permanent ownership lane, or gameplay prohibition that contradicts a higher source.

Live code, current checks, and player-route evidence determine whether descriptive claims and packet
seam maps are true. They do not overrule a higher architectural or product contract merely because a
buggy implementation is current.

## 4. The five control surfaces

| Surface | Lifetime | Owns | Must not own |
|---|---|---|---|
| [`NOW.md`](./design/program/NOW.md) + local checkpoints | volatile | threads actually mutating now, exact dirty hunks, brief publication windows, per-task todo progress, and up-to-five-task lookahead intent | history, task-long ownership, subsystem lanes, dependencies, completion, test transcripts, heartbeats, permanent queue claims |
| `scripts/program-dispatch.mjs` + [`program-queue.json`](./design/program/roadmap/program-queue.json) | compact read view + durable machine index | exact dispatch units, parent identity, integration dependencies, broad checks/evidence, coarse parent state | active mutation windows, implementation prose, acceptance transcripts |
| [`active/`](./design/program/roadmap/active/README.md) | active packet | executable outcome, live seams, phases, write budget, proof budget, stop conditions | global status, unrelated backlog, permanent architecture |
| `receipts/` and acceptance pages | evidence | exact-revision proof and honest residuals | future requirements or dispatch state |
| module/event/system maps | generated or maintained reference | low-context code navigation | product priority or completion claims |

Status is two-dimensional:

- **Lifecycle:** `planned → ready → claimed → implemented → integrated`, with `deferred` and
  `historical` as explicit dispositions. The legacy `blocked` enum remains only for schema
  compatibility. Human/owner-verdict wording is legacy: use an independent agent review against the
  named evidence; only an explicit user-requested external action may remain `deferred`. Internal
  dependencies, another thread, dirty files, tools, reviews, or hardware never become blockers.
- **Acceptance:** `unproven → focused_green → route_accepted → milestone_accepted`.

These axes do not imply each other. Integrated code may still lack route acceptance; a source asset may be implemented but not runtime-wired; a focused-green packet is not automatically fun, readable, or complete.

The existing queue's `state` field is transitional and can contain legacy acceptance labels. Treat it only as a coarse index value. The active packet and exact-revision receipts own the separate lifecycle and acceptance claims until the queue schema is migrated.

## 5. Selecting and shaping work

Choose the first dependency-front dispatch unit, or an exact unit named by the user, and reduce it to
the smallest coherent slice that can reach its declared terminal state. `--ready` is the preferred
integration order, not a list of the only work that exists. `program-dispatch --next` skips fresh
lookahead reservations and `--ready` annotates them; those reservations cover at most the current
unit plus four next units and are not queue lifecycle claims. `NOW.md` prevents one dirty hunk from
being overwritten: if that exact hunk is actively changing, continue the task's disjoint work or take
the next unreserved unit. If a future reservation is stale or another agent has taken it, re-plan the
remaining horizon; never contest or revert the other agent. Never turn the overlap into a blocked
packet, subsystem, or roadmap.

An executable packet must name:

- one player outcome and one normal route;
- current owner modules and the events/APIs they expose;
- integration dependencies and any exact live handoff needed at mutation time;
- exact or bounded write surfaces;
- explicit non-goals;
- deterministic/save/single-writer invariants;
- graphics and accessibility semantics;
- expected entity, query, allocation, draw, texture, and residency growth;
- a focused test ladder and an expensive-probe launch budget;
- review convergence rules;
- checkoff and receipt updates;
- conditions that require stopping and returning a shared-change request.

If the packet still needs several unrelated owners, several visual families, or several independently releasable player outcomes, split it. Queue rows such as a graphics overhaul may remain portfolio containers; agents implement leaf packets, not the umbrella in one heroic blur.

## 6. Implementation posture

Prefer owner reuse and new narrow seams over parallel authorities. Characterize the current behavior before changing it. Write a failing seconds-scale regression before debugging through a browser route. Keep public behavior and state transitions deterministic; wall time and callback order may observe or present state, never decide simulation truth.

For physics-heavy work, ask four questions early:

1. What physical state is authoritative?
2. Which existing systems can couple to it without a special case?
3. What counterplay or failure mode keeps it from becoming a button that wins?
4. What cue makes mass, force, risk, and ownership legible without requiring hidden telemetry?

For visual work, do not instruct agents to make less. Require the exact authored identity, stable transforms and sockets, appropriate LOD/HLOD, bounded residency, normal-camera review, and one measured route. Placeholder clay is diagnostic only; it is not a shipping style.

## 7. Verification that converges

**A check that runs a `node:test` file with `await import()` CANNOT FAIL.** Found 2026-08-23 in a
brand-new check whose own header promised "a `count > 0` rule is expressly rejected". Importing a
`node:test` module registers its tests and the runner executes them, but a failing assertion is
reported to the REPORTER — it does not reject the import. The block had a `try`/`catch`, an error
message and a failure counter, and still exited **0** with a deliberately failing test injected.

Run the suite as a child process and honour its exit code:

```js
const suite = spawnSync(process.execPath, ['--test', join(ROOT, 'test/x.test.mjs')], { cwd: ROOT });
if (suite.status !== 0) { /* fail */ }
```

This is the §11.10a rule in its sharpest form: **reading that block would never have revealed it —
mutating it took one minute.** A check that cannot fail is worse than no check, because it converts
"unverified" into "verified" in everyone's mind. Before trusting any new gate, inject a failure and
watch it go red.


Choose the proof layer through [`docs/VALIDATION_WORKFLOW.md`](./docs/VALIDATION_WORKFLOW.md). The
finite review and validation state machine lives in
[`00_EXECUTION_PROTOCOL.md`](./design/program/roadmap/00_EXECUTION_PROTOCOL.md). Its essential rules
are:

- focused deterministic checks precede broad or live probes;
- every packet names its lab scenario and executor before L3, or records why the claim is not
  representable headlessly and what smallest lab/schema gap prevents it;
- a broker manifest uses `requiresScenario` when an eligible lab scenario already exists, binding
  that scenario's fresh pass to the current candidate before a Browser/Electron claim is minted;
- each predeclared acceptance cell receives at most one attempt per candidate digest, while a campaign
  claim may contain several distinct cells;
- a product, harness, or nondeterminism failure must be reduced to a seconds-scale regression before
  another affected acceptance attempt;
- retain unchanged failure fingerprints as evidence; change the candidate or approach instead of rerunning them;
- evidence review closes with discovery, repair, and a causal re-review rather than a succession of
  open-ended fresh audits; use a separate reviewer when one exists, but the finishing agent may issue
  the verdict from retained evidence and must disclose that it is a self-review;
- unrelated new ideas become follow-ups, not reasons to reopen the packet indefinitely;
- every execution ends `PASS`, `FAIL`, `UNPROVEN`, or `DEFERRED` with an exact-revision receipt,
  then reports plain `DONE` or `NOT DONE` to the user.

Certification remains fail-fast. A diagnostic route may collect several independent recoverable
failures in one run, but it must abort when boot, navigation, or observation authority is lost and
its aggregate report cannot promote acceptance.

The repository already contains a validation broker. New expensive routes should add a manifest and
use it instead of inventing another retry loop.

## 8. Performance is part of design

Every packet that can add per-frame work, entities, colliders, DOM, particles, materials, textures, asset admission, save payload, or queries must declare a cost model before implementation and report matched before/after evidence at acceptance.

Use [`design/PERF_BUDGET.md`](./design/PERF_BUDGET.md). Preserve the target and floor profiles. Optimize invisible work first. Do not pass by lowering default render scale, effects, shadows, particles, asset detail, or content density. The durable multi-approach tradeoff board lives in [`design/PERFORMANCE_OPTIMIZATION_CONSTELLATION.md`](./design/PERFORMANCE_OPTIMIZATION_CONSTELLATION.md). The exhaustive same-picture option space — including investigations, scaffolding, tabletop-correct cuts, and large Worker/WASM/WebGPU/native/Rust jobs — lives in [`design/PERF_OPTION_SPACE.md`](./design/PERF_OPTION_SPACE.md) and is reserved as §8.2.

Feature code should be naturally bounded:

- no unbounded per-frame scans or append-only journals;
- no unmeasured or avoidable per-frame allocation in hot paths;
- no hidden screen continuing expensive render or DOM work;
- no duplicated asset loads or material programs for equivalent roles;
- no gameplay entity published before its authored identity and interaction envelope are ready;
- no save serializer whose cost grows without an explicit cap and evidence.

### 8.1 Later performance PQ sequence

The existing modernization series remains authoritative for its current scopes:
`PQ-038` dense `PresentationWorld`, `PQ-040` dirty GPU ranges, `PQ-041` Electron modernization,
`PQ-042` evidence-selected GPU correction, `PQ-043` the conditional simulation Worker, and
`PQ-044` the conditional WebGPU/TSL vertical slice. Do not duplicate those packets or treat their
implementation state as player-route acceptance.

The following later PQ identities are reserved by the owner for the remaining smoothness program.
They are durable plan routes, not current leases or a queue snapshot. Before implementation, admit
the exact parent and its smallest executable leaves into `program-queue.json`, create its active
packet, refresh live code and ownership, and keep the outcome inside the scope below. A packet closes
on the direct player result, not on counters, reports, test volume, or lower default quality.

| Later plan | Player outcome | Production scope | Direct done condition and dependencies |
|---|---|---|---|
| **`PQ-051` / `PERF-11-FRAME-LIVENESS`** | Continue and ordinary flight never leave a permanently frozen 3D picture behind a still-moving HTML HUD. | Repair the actual renderer/presentation latch on the real player path: authoritative entity identity, frame/draw exceptions, WebGL context recovery, presentation scheduling, and canvas present. Promote the bounded runtime witness only as the failure classifier needed to fix the owner. Never clear/catch/skip work merely to keep the HUD alive. | On the owner's real save in Browser and Electron: leave loading, fly for 30+ seconds, and observe simulation, movement, renderer frames, and canvas pixels continuing together with no repeating frame error or unrecovered context loss. This is the release-blocking prerequisite for every later performance claim. |
| **`PQ-052` / `PERF-12-RIGID-OPAQUE-BATCHING`** | Crowded fleets keep their authored appearance while materially reducing GPU submission cost. | Adopt, repair, or reject the existing material-keyed heterogeneous `THREE.BatchedMesh` candidate. Pool only rigid opaque render-package surfaces behind exact material identity; preserve owner release, LOD, damage, semantic proxies, pipeline/residency admission, context recovery, and bounded geometry capacity. Keep canopies, plumes, fans, nav lights, decals, animated surfaces, and transparency-sorted work out of this lane. **2026-09-15:** a retained-slot rewrite (stable instance ids, dirty matrix/color only) exists and is covered by leaf tests; shipping `_opaqueBatchEnabled` stays **false** until `PQ-197` / `PQ-202` name draw-count as the pole. Do not re-enable the old per-frame repack (Intel bloomScene 11 ms → 114 ms). | A clean same-scene before/after shows a material GPU-frame reduction and fewer opaque submissions/chunks with identical geometry, materials, transforms, animation, damage, and visible pixels. Depends on `PQ-051`, the `PQ-034` measurement seam, `PQ-197`/`PQ-202` census, and current render-package authority; do not wire the older generic batcher merely because it exists. |
| **`PQ-053` / `PERF-13-LIVE-LOD-HLOD-IMPOSTORS`** | Near ships and places retain full authored quality. Distant contacts may hide fasteners only. | **Paper row, not a queue id. Do not dispatch as a hull-swap or impostor campaign.** Live `hlod.js` already hides tagged flourishes at a speck and forbids a silhouette proxy. Whole-GLB swap bails unless the sibling is packaged-live; Hitch/player stay LOD0. After Wave A (`PQ-193.00`), the only allowed shave is garnish hide a stranger cannot name. Far impostors, cheaper species of ship, and Hitch dump are banned. Process: [`DYNAMIC_GRAPHICS_INVESTIGATION.md`](./design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md). | Same picture at chase size; specks may lose a fastener; no blank lock, no box-then-ship, no identity drift. Depends on `PQ-193.00` being true first. |
| **`PQ-054` / `PERF-14-BOUNDED-GPU-ADMISSION`** | Continue, New Game, sector entry, and first combat no longer move the same unbounded shader/upload stall between loading and flight. | **Paper row, not a live queue id.** Opening cohort is already finite (`openingAdmission.js`). Leftover *hitch* work was rejected as `PQ-129.09` (zero admission-owned hitches). Leftover *picture* (blank lock, late pop, kitbash stand-in) is `PQ-193.00` / `.01`. Do not reopen this as a cheaper-hull or “show a box while loading” leaf. Process: [`DYNAMIC_GRAPHICS_INVESTIGATION.md`](./design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md). | Changing playable canvas; blocking slices stay inside the budget; late roots cannot grow the opening watermark; first visible identity is the authored complete body, not a substrate or modular junk. |
| **`PQ-055` / `PERF-15-IMMUTABLE-ASSET-TRANSPORT`** | Boot, Continue, hub opening, and sector entry stop repeatedly transferring, hashing, decoding, and shipping the same large asset bytes. | Give immutable release assets content-derived cache identity and headers; retain no-cache only for mutable documents and saves. Remove duplicate package/source encodings from the retail bundle where the package is canonical, split the largest places into opening shell plus independently resident detail, and add validators/range or packaged-file transport only where a boot trace justifies them. Keep KTX2 and meshopt; use Brotli for code/text rather than recompressing already-compressed GLBs. | Warm launch and repeat-sector entry reuse immutable bytes; cold entry presents the bounded shell first; installed/runtime bytes fall without missing fallback/dev sources or visual drift; the largest package no longer has to decode as one monolith before useful presentation. Depends on `PQ-037` and coordinates with `PQ-053`/`PQ-054`. |
| **`PQ-056` / `PERF-16-PRESENTATION-AND-AA-CONSOLIDATION`** | The default image pays once for anti-aliasing and presentation while retaining bloom, grade, grain, vignette, exposure, shadows, and authored detail. | After `PQ-042` selects the real GPU owner, maintain one default present path; prove whether canvas MSAA is dead work behind the single-sampled HDR/fullscreen-composite route, integrate one quality-preserving post-AA solution when needed, and perform only the selected shadow, transparency, opaque-order, depth, or post fusion. Do not promote the optional render graph, add a global depth prepass, or clamp supersampling without a net same-image win. | Same-camera image/temporal parity holds at default settings and the selected GPU scope plus aggregate frame time improves on Browser and Electron. Depends on terminal `PQ-042`; if its evidence selects another owner, this plan narrows to that result or closes with no product mutation. |
| **`PQ-057` / `PERF-17-DETERMINISTIC-ACTIVITY-SCHEDULER`** | World density can grow without every registered system, AI cohort, query owner, and physics body paying 60 Hz work while inactive. | Remeasure after the civilian-threat cadence change, then add deterministic tick-quantized schedules and active-owner wake/sleep rules. Keep input, flight, weapons, collisions, and required physics authority at 60 Hz; cadence or sleep slow AI perception, traffic planning, remote economy/story, inactive world owners, and eligible Rapier bodies. Reuse the spatial hash and dirty journals rather than replacing working indices. | Fixed-seed/save parity remains exact; player response and combat authority remain 60 Hz; simulation p95 meets its 5 ms budget in crowded flight and query/candidate work scales with active cohorts rather than total registered systems. Depends on `PQ-039`; completion decides whether existing `PQ-043` is still causally necessary. |
| **`PQ-058` / `PERF-18-LONG-SESSION-RESOURCE-GOVERNOR`** | Repeated sector travel and long sessions do not accumulate RAM, GPU resources, decoder state, render targets, or stale pools until the game hitches or loses its context. | Extend the existing ref-counted asset residency and context-resource lifecycle only where a bounded travel/restore trace shows retained growth. Add explicit CPU/GPU byte and owner budgets, deterministic eviction priority, previous-sector warmth, pooled-resource retirement, and context-rebuild accounting without evict/reload thrash. | A bounded multi-sector/Continue/context-restore soak reaches a stable memory/resource plateau, releases unowned generations, keeps the next required shell resident, and introduces no recurring decode/upload hitch. Depends on `PQ-054`/`PQ-055`; if the trace is already flat, close with the retained evidence and no new governor. |
| **`PQ-059` / `PERF-19-WEBGPU-GPU-DRIVEN-SCALEOUT`** | A larger fleet or place scene gains substantial headroom from GPU-owned visibility and submission without becoming a visually different game. | Execute only if `PQ-044` adopts WebGPU. Move one representative RenderWorld slice from CPU draw enumeration to stable render bundles, compute visibility/instance compaction, indirect draws, texture-array material families, and offline cluster/meshlet LOD while retaining the WebGL2 rollback path. | At least the backend-decision gain floor holds over the required representative frames with zero visual/gameplay parity regressions, improved p99/hitches, and bounded pipeline/device recovery. A failed or marginal `PQ-044` ends this route without implementation. |
| **`PQ-060` / `PERF-20-NATIVE-RENDERER-TRIGGER`** | The project has an evidence-based final platform decision if browser/Electron rendering still cannot meet the low-end floor after structural work. | Apply the existing backend trigger only after batching, LOD/HLOD, admission, asset transport, scheduling, and the WebGPU slice are exhausted. If triggered, produce one narrow native presentation vertical slice against the same RenderWorld/input/save contracts before authorizing a port; otherwise retain the browser/Electron architecture. | Native work begins only when repeated quiet-machine p99 remains beyond the declared ceiling, the work families are actually exhausted, and the representative slice beats the supported web path without product divergence. Otherwise this PQ closes `not-triggered`; it is never a reward for skipping unfinished optimizations. |

Execution order is outcome-driven, not merely numeric: `PQ-051` first; then `PQ-052` through
`PQ-055` where their exact paths are free; `PQ-042` selects the scope that permits `PQ-056`;
`PQ-057` determines whether existing `PQ-043` should run; `PQ-044` determines whether `PQ-059`
exists as implementation; and `PQ-060` remains the final conditional boundary. Use one clean matched
player-route comparison per candidate and pivot on a repeated failure fingerprint instead of turning
the sequence into an audit or capture campaign.

### 8.2 Full same-picture option space (`PQ-061`–`PQ-128`)

SpaceFace is a tilted top-down table. Later work must optimize **the glass plus a short approach
runway**, not a horizon. Huge jobs stay listed. A plan is legal only if the player-facing game is
unchanged. Full protocols, investigation scaffolds, and implement-after-census rules:
[`design/PERF_OPTION_SPACE.md`](./design/PERF_OPTION_SPACE.md).

These identities are reserved, not admitted. Admit a parent and its smallest leaves into
`program-queue.json` before implementation. `PQ-094` may mint new reserved leaves when a sweep
finds a pole this table does not name. `PQ-196`–`PQ-203` were minted 2026-09-15 from the
table-authority leftover sweep (shader-family collapse outside `partsLibrary`, retained-slot
batch still shipping-off, fat-list walks that must stay).

| Plan | Horizon | Player outcome |
|---|---|---|
| **`PQ-061` / `PERF-21-TABLETOP-CENSUS`** | Near INV | Glass vs fake-visible vs resident vs sim counts on a fixed-seed fly. |
| **`PQ-062` / `PERF-22-HITCH-CLASSIFIER`** | Near INV | Every >32 ms frame named (compile, upload, compose, shadow, GC, save, …). |
| **`PQ-063` / `PERF-23-PHASE-TIMERS`** | Near INV | Honest sim / prep / submit / present / UI / VFX clocks on the bloom path. |
| **`PQ-064` / `PERF-24-SHADER-VARIANT-CENSUS`** | Near INV | Live program keys vs precompile keep-alives. |
| **`PQ-065` / `PERF-25-ALLOC-GC-SOAK`** | Near INV | Long-session heap/GPU retainers named or declared flat. |
| **`PQ-066` / `PERF-26-DETERMINISM-LAB`** | Near INV | Cadence/Worker/WASM candidates rejected if hashes move. |
| **`PQ-067` / `PERF-27-PLATFORM-SPIKE-MATRIX`** | Mid INV | Worker, WASM, WebGPU, native spikes; keep/reject each with picture parity. |
| **`PQ-068` / `PERF-28-GLASS-BOX-SUBMIT`** | Near IMPL | Off-glass ships not drawn; on-glass picture identical. |
| **`PQ-069` / `PERF-29-APPROACH-RESIDENCY`** | Near IMPL | Meshes exist just before they can enter the glass. Loading compose uses glass + the immediate authored runway, not a leftover 2400 WU ship horizon. The Helios starting hub is still an exact exception. |
| **`PQ-070` / `PERF-30-OFFSTAGE-WORK-FREEZE`** | Near IMPL | LOD, shadows, closures, pools do not run for unsubmitted roots. |
| **`PQ-071` / `PERF-31-OFFGLASS-LANDMARKS`** | Mid IMPL | Far stations are map facts until approach, not live 3D residents. |
| **`PQ-072` / `PERF-32-EXACT-KEY-PREWARM`** | Mid IMPL | First sight of a live shader key is not one display callback. |
| **`PQ-073` / `PERF-33-COMPOSE-PART-SLICE`** | Mid IMPL | Building a ship cannot drop a 40–250 ms present brick. |
| **`PQ-074` / `PERF-34-UPLOAD-AFTER-PRESENT`** | Mid IMPL | First texture/buffer upload does not share the present beat. |
| **`PQ-075` / `PERF-35-NEXT-CONTACT-WARM`** | Mid IMPL | Only hulls about to enter the glass are warmed. |
| **`PQ-076` / `PERF-36-ONGLASS-LANES`** | Mid IMPL | Shared-program canopy/plume/transparent lanes collapse on-glass. |
| **`PQ-077` / `PERF-37-SHADOW-GLASS-SET`** | Near IMPL | Only casters that can fall on the visible table pay a depth pass. Live radius is `tableShadowCastRadius` (tilted glass + skirt); 280 is the no-camera fallback. |
| **`PQ-078` / `PERF-38-PRESENT-FUSION`** | Mid IMPL | One bloom/HDR present; extra AA only if present is the pole. |
| **`PQ-079` / `PERF-39-BUFFER-POLICY`** | Mid IMPL | Instance/batch buffers do not hitch-grow or leak VRAM. |
| **`PQ-080` / `PERF-40-TABLE-CADENCE`** | Mid IMPL | 60 Hz is the table and the fight; off-table owners sleep. Traffic/bark use `tableSimAuthorityWuFromState` (requested zoom + settings FOV + fixed 48:9, not liveZoom/viewport). Hostiles stay awake. |
| **`PQ-081` / `PERF-41-SNAPSHOT-FENCE`** | Mid IMPL | Present reads a dense snapshot, not live entity objects. |
| **`PQ-082` / `PERF-42-SIM-WORKER`** | Long IMPL | Sim tick on another core; implements `PQ-043` when sim is the pole. |
| **`PQ-083` / `PERF-43-WASM-SIM-ISLAND`** | Long IMPL | One hot CPU island in Rust/WASM; snapshot in/out; not Three.js. |
| **`PQ-084` / `PERF-44-PHYSICS-SLEEP`** | Mid IMPL | Far Rapier bodies sleep; table collisions stay authoritative. |
| **`PQ-085` / `PERF-45-PLACE-SHELL`** | Mid IMPL | Large places decode a table-visible shell first. |
| **`PQ-086` / `PERF-46-TEXTURE-RESIDENCY`** | Mid IMPL | Off-glass maps evict; on-glass maps never thrash. |
| **`PQ-087` / `PERF-47-AUTOSAVE-HITCH`** | Mid IMPL | Autosave cannot occupy a display callback. |
| **`PQ-088` / `PERF-48-HUD-AUDIO-CADENCE`** | Mid IMPL | HUD/audio do not full-tick hidden or off-glass work. |
| **`PQ-089` / `PERF-49-WEBGPU-BACKEND`** | Long IMPL | Same game on WebGPU with WebGL rollback. |
| **`PQ-090` / `PERF-50-NATIVE-PRESENT`** | Long IMPL | Native present slice on the same snapshot/input/save. |
| **`PQ-091` / `PERF-51-RUST-ISLANDS`** | Long IMPL | Further Rust/WASM islands; full engine rewrite only as a `PQ-090` successor. |
| **`PQ-092` / `PERF-52-ELECTRON-PRESENT`** | Mid IMPL | Electron hitch/p95 matches the browser on the same save. |
| **`PQ-093` / `PERF-53-SHARED-ARRAY-SNAPSHOT`** | Long IMPL | Worker/WASM publish through SharedArrayBuffer. |
| **`PQ-094` / `PERF-54-POLE-SWEEP`** | Standing | Recurring census; mint new reserved leaves when a pole has no plan. |
| **`PQ-095` / `PERF-55-SKY-ON-A-TABLE`** | Near INV→IMPL | Sky/parallax/deep-field cost what a tabletop uses. |
| **`PQ-096` / `PERF-56-EVENT-LIGHT-CARDINALITY`** | Mid INV→IMPL | Event lights do not bake extra program variants. |
| **`PQ-097` / `PERF-57-BLOOM-RESOLVE`** | Mid INV→IMPL | Cheaper bloom/HDR at the same halo. |
| **`PQ-098` / `PERF-58-SPEEDLINE-OFFTHREAD`** | Mid INV→IMPL | Boost lines do not hitch the 3D present. |
| **`PQ-099` / `PERF-59-SCENE-GRAPH-FLATTEN`** | Mid INV→IMPL | Matrix/child walks do not scale with off-glass graphs. |
| **`PQ-100` / `PERF-60-ORIGIN-REBASE-HITCH`** | Mid INV→IMPL | Floating-origin rebase is not a hitch. |
| **`PQ-101` / `PERF-61-CATCHUP-SPIRAL`** | Near INV→IMPL | One late frame does not cascade extra sim steps. |
| **`PQ-102` / `PERF-62-MENU-WORLD-UNLOAD`** | Mid INV→IMPL | Station/map/pause do not keep submitting the flight world. |
| **`PQ-103` / `PERF-63-DECODE-WORKER`** | Mid INV→IMPL | GLB/KTX2/Basis decode is off the present thread. |
| **`PQ-104` / `PERF-64-BINARY-SHADER-CACHE`** | Mid INV→IMPL | Repeat boots reuse driver program binaries. |
| **`PQ-105` / `PERF-65-AUDIO-TABLE-CULL`** | Near INV→IMPL | Audio follows the table, not a 900 WU horizon. |
| **`PQ-106` / `PERF-66-HOT-ALLOC-SHAPES`** | Mid INV→IMPL | Per-frame allocation is not the hitch owner. |
| **`PQ-107` / `PERF-67-STATE-CHANGE-SORT`** | Mid INV→IMPL | On-glass draws minimize program binds. |
| **`PQ-108` / `PERF-68-TINY-ONGLASS-LOD`** | Mid INV→IMPL | 30-pixel on-glass fighters are cheap; close ships stay full. |
| **`PQ-109` / `PERF-69-GL-CONTEXT-FLAGS`** | Near INV→IMPL | Canvas/GL flags add no hidden copy. |
| **`PQ-110` / `PERF-70-ANGLE-BACKEND`** | Mid INV→IMPL | Fastest legal ANGLE backend on this GPU. |
| **`PQ-111` / `PERF-71-PIXEL-PARITY-GATE`** | Near INV | Glass still-diff for every same-picture A/B. |
| **`PQ-112` / `PERF-72-THERMAL-NOISE`** | Standing | Noisy A/B pairs cannot pass a leaf. |
| **`PQ-113` / `PERF-73-PROD-PROBES-OFF`** | Near INV→IMPL | Production default pays no debug-probe tax. |
| **`PQ-114` / `PERF-74-IDLE-ADMISSION`** | Mid INV→IMPL | Next-contact compile in true idle, never stacked on rAF. |
| **`PQ-115` / `PERF-75-VFX-ONGLASS`** | Near IMPL | Trails/lights/flipbooks follow the table. Station-side, seam, NPC job-signature, loot-magnet, and NPC engine-trail draw use `tableVfxDrawWuFromState` (live glass), not a 1500/640/300/580/2200/3600 WU horizon. Loot-magnet trails keep a separate 580 WU player-centered tractor cap. Station-side, seam, NPC, loot-magnet, and NPC engine-trail glass culls use `tableLookAtDelta` (frame-local focus + frameOrigin). Station side-event planning anchors on `tableSimAuthorityWuFromState` plus that station type's farthest eligible mover path, not a 1400 WU horizon. Player and current-target trails stay full. |
| **`PQ-116` / `PERF-76-HDR-BUFFER-FORMAT`** | Mid INV→IMPL | Cheapest HDR target that keeps the default halo. |
| **`PQ-117` / `PERF-77-HIDDEN-SYSTEM-SKIP`** | Near INV→IMPL | Registry systems do not full-tick when 3D is hidden. |
| **`PQ-118` / `PERF-78-REPLAY-PERF-BISECT`** | Mid INV | A hitch is reproducible from input+seed. |
| **`PQ-119` / `PERF-79-TABLE-MAP-SPEC`** | Near IMPL | Off-table contacts stay map/radar facts, never live 3D. |
| **`PQ-120` / `PERF-80-TABLE-READABLE-REMASTER`** | Near INV→IMPL | Remaster budget goes to mid-scale openings that read at default zoom, not micro-greeble stacks. |
| **`PQ-121` / `PERF-81-VFX-FOCUS-ORIGIN`** | Near IMPL | Cosmetic VFX cull from the live look-at, not only the player pin, so a combat/tether camera shove does not drop on-glass lights. Seams, station lamps, NPC signatures, and loot-magnet glass checks share `tableLookAtDelta`. Tractor cap stays player-centered. Sim traffic/bark still use requested zoom. |
| **`PQ-122` / `PERF-82-TABLE-ASPECT-CLAMP`** | Near INV | If a live window is wider than three 16:9 panes, either letterbox the camera to that bound or accept that far side-edge civilians sleep. Do not grow sim authority back into a horizon. |
| **`PQ-123` / `PERF-83-INSTANCE-FAR-CULL`** | Near IMPL | Instance far cull follows the live camera table (`tableInstanceFarCullWu`), not a leftover 9000 WU horizon. Default covers the supported 90° / 330 WU 16:9 table as 3D camera distance. The 420 WU owner-sphere pad stays so a large on-glass station cannot vanish. Submit still drops off-table roots first. |
| **`PQ-124` / `PERF-84-HAIL-HUD-HORIZON`** | Near INV | Leftover `CONTACT_HAIL_RANGE` / scanner / HUD-overview `5200` is hail and radar range, not a 3D submit box. Do not shrink who the player can hail. The 5 Hz overview hypot is cheap. Only admit a leaf if a census names that list as a hitch; then keep hail gameplay and cull only 3D/VFX work. |
| **`PQ-125` / `PERF-85-REGION-CROSSFADE`** | Near INV | `REGION_CROSSFADE_WU = 1500` is the authored sector-boundary sky/ambient fade, not leftover mesh tax. Shrinking it would change when the next region reads. Do not touch unless a census names the fade math as a hitch. |
| **`PQ-126` / `PERF-86-NPC-TRAIL-TABLE`** | Near IMPL | NPC engine trails follow `tableNpcTrailTier` (live look-at + `tableVfxDrawWuFromState`). Leftover 2200/3600/2800 player-camera horizons are retired. Player and current-target ribbons stay full. Off-glass NPC ribbons are map facts. |
| **`PQ-127` / `PERF-87-NON-SUBMIT-HORIZONS`** | Near INV | Leftover large numbers that are **not** 3D submit: camera shake 1200, director threat compose 600, pair-frame 280, planet/sun sky dressing at 2800–6000 with parallax below the horizon, and the unused 300 NPC-signature comment. Live signature draw already uses the table. GPU timers and hitch rings stay default-off. Do not shrink these as a cull. |
| **`PQ-128` / `PERF-88-HEADLESS-VFX-TABLE`** | Near IMPL | Headless/no-camera VFX “on-screen” fallbacks follow `TABLE_HEARING_FAR_WU`, not a leftover 900 WU pin. Live play already projects to the camera. Doctrine-tell cues near the player still fire; off-table headless cues stay map facts. Do not shrink hail, missile-threat, or faction gameplay 900s. |
| **`PQ-196` / `PERF-90-PACKED-ORM-FAMILY-KEY`** | Near INV | First sight of a painted hull does not mint a unique GPU program from leftover `onBeforeCompile` source. Family-key canonicalize already drops compile-source fragments and UUID tokens outside `partsLibrary`. Investigate whether the in-file packed-ORM concatenation still wins the first compile when PQ-193.09 / PQ-193.12 release that file. Dummy prewarm stays illegal. |
| **`PQ-197` / `PERF-91-RETAINED-SLOT-CROWDED-CENSUS`** | Near INV | Crowded Intel bloom stays ~11 ms, not 114 ms, while drawing fewer unique plates. Retained-slot BatchedMesh (stable ids, dirty matrix/color only) is written and shipping OFF. Headed crowded fly must name draw-count as the pole before enabling. Do not re-enable the old per-frame repack. |
| **`PQ-198` / `PERF-92-FIRST-SIGHT-LINKPROGRAM`** | Near INV | A new NPC entering the glass is not a 40+ ms `linkProgram` brick. Empty admission slots still compose in flight. Census live program keys vs family stamps after authored upgrade. Route leftover keys through after-present compile, never dummy meshes. |
| **`PQ-199` / `PERF-93-FAT-LIST-MUST-STAY`** | Near INV | Typed indexes never drop a real interaction. Keep the fat list for world despawn indexes, fields save rebuild, claim-sling NPC boost, scanner distress beacons, hangar occupancy (dormant spawn-obstacle rocks). Investigate only walks that still allocate on the 60 Hz table after those exceptions. |
| **`PQ-200` / `PERF-94-FX-BEACON-BUCKET`** | Near INV | Journal / chart leftover `fx` and `beacon` walks cost table size, not the historic 408-body list. Quiet Ceres is 56 live / 279 field rocks. A type bucket for `fx`/`beacon` is legal only if membership stays 56 and dressing rows stay off the combat list. |
| **`PQ-201` / `PERF-95-SECTOR-PREWARM-PLACEFILE`** | Near INV | Sector prewarm does not miss a place-bearing body, and does not scan the fat list when the index is ready. `placeFile` can sit on `massSeed` / `fieldEmitter` / `fx`. Typed census must cover those types or stay on the fat list. Hitch path, not 60 Hz. |
| **`PQ-202` / `PERF-96-INTEL-BLOOM-BATCH-AB`** | Near INV | Same crowded still, bloom on, shadows on: prove whether draw-count or bloom resolve is the missed-vsync tax. Pair `PQ-197` with `PQ-097`. If bloomScene p95 is the pole with batching off, do not enable batches. If draw-count is the pole and retained-slot keeps bloomScene, admit `PQ-052`. |
| **`PQ-203` / `PERF-97-QUIET-CERES-FIVE-MS`** | Standing | Quiet Ceres warm-sim p50 stays ≤ 5 ms on this host. Membership island is 56 live. Do not weaken the gate. Re-census after any calendar→table clock move or after re-enabling opaque batch. |

Every leaf uses the investigate → invalidate → implement loop in
`PERF_OPTION_SPACE.md` §3. Default order when no campaign is named: `PQ-061` → `PQ-062` → `PQ-063`
→ then §7 of that file. Long platform leaves wait until that table points at them, unless the owner
starts that campaign.

**Investigate next (2026-09-15 leftover sweep):** `PQ-196` packed-ORM family key once
`partsLibrary` is free; `PQ-197`+`PQ-202` headed crowded draw-count vs bloom A/B before
enabling retained-slot batches; `PQ-198` first-sight `linkProgram`; `PQ-199`–`PQ-201`
fat-list exceptions vs leftover typed scans; `PQ-203` keep the quiet Ceres 5 ms gate.

### 8.3 Exhaustive same-picture technique inventory

This is the full list of performance optimizations that may later be investigated or implemented.
Each line is a legal leaf under the parent in parentheses. Admit via `PQ-094` minting if it has no
row yet. Size of the job is not a reason to omit it. **Illegal** as a win: default quality cuts,
emptying the glass, camera-facing soft cards for fly-past objects, or editing sim goldens.

**Loop for every line:** measure the live pole → census glass / runway / beyond → **invalidate**
if it is not the pole, A/B worsens, pixels change, the stall moves, or copy costs more than it
saves → else implement the smallest leaf → tests of real functions → matched A/B → keep or revert.

#### Glass vs off-stage (this camera)

- Shrink query/cull margin from multi-screen to glass + measured approach seconds (`PQ-061`, `PQ-068`)
- Do not submit roots outside glass + runway (`PQ-068`)
- Do not LOD-resolve off-glass roots (`PQ-070`)
- Do not run shadow policy off-glass (`PQ-070`, `PQ-077`)
- Do not run damage/drive/site closures off-glass (`PQ-070`)
- Do not instance-pool or BatchedMesh plates that will not submit (`PQ-070`)
- Mesh prefetch/evict = top-speed × fraction of a second, not 5200/6400-as-horizon (`PQ-069`)
- Whole-sector stations/planets/fx are map facts until approach (`PQ-071`, `PQ-119`)
- Neighbor-sector meshes never constructed (`PQ-069`)
- Authored-upgrade prefetch follows approach, not sector (`PQ-075`)
- VFX/trails/lights/flipbooks only on-glass + runway (`PQ-115`)
- Audio voices follow table hearing, not 900 WU (`PQ-105`)
- Layers / bitmasks so off-glass graphs are not in the walk (`PQ-099`)
- Scissor / viewport to the glass if a leftover pass still covers unused pixels (`PQ-078`)
- On-glass tiny-contact LOD (30 px fighter cheap; 120 px full) (`PQ-108`)
- Pixel-floor remaining VFX under N px (`PQ-115`)
- Skip decals / greebles / nav-light meshes under N projected px (`PQ-108`, `PQ-053`)
- Freeze animation/morph/skin off-glass (`PQ-070`)
- Sleep Rapier bodies off-table (`PQ-084`)
- Sleep AI/perception/path off-table; hostiles on-table stay 60 Hz (`PQ-080`)

#### Submit / GPU state (on-glass)

- Material-keyed instancing and BatchedMesh for rigid opaque (`PQ-052`, `PQ-197`, `PQ-202`)
- Packed-ORM / illustration family keys without UUID or `onBeforeCompile.toString()` leftovers (`PQ-064`, `PQ-196`, `PQ-198`)
- Separate legal lanes: canopy, plume, decal, ribbon, sprite, beam (`PQ-076`)
- Multi-draw / `WEBGL_multi_draw` (`PQ-052`)
- Indirect / multi-draw-indirect / count buffers (`PQ-059`, `PQ-089`)
- GPU compaction of instance lists (`PQ-059`)
- Texture arrays / atlas for same-role maps (`PQ-089`)
- Bindless / bindless-like grouping when WebGPU (`PQ-089`)
- Program-bind sort; optional front-to-back opaque (`PQ-107`)
- Reduce Three.js light/program churn; exact light cardinality (`PQ-096`)
- VAO reuse; avoid per-draw attribute setup (`PQ-076`)
- UBO / uniform packing vs many setUniform calls (`PQ-089`)
- Avoid geometry shaders / tessellation on this path (`PQ-064` census)
- 16-bit indices; quantized positions/normals; oct normals; half-float verts (`PQ-037`, `PQ-079`)
- Quantized instance matrices / quaternion+scale (`PQ-079`)
- Persistent / orphan / unsynchronized buffer maps (`PQ-040`, `PQ-079`)
- Ring buffers for dynamic ranges (`PQ-040`)
- Don’t grow BatchedMesh on the present beat (`PQ-079`)
- Shadow set = glass + skirt; cheaper PCF/ESM/VSM only if stills match (`PQ-077`)
- Cached static shadow for unmoving casters; atlas packing; one cascade (`PQ-077`)
- Contact/blob shadows only where directional cannot matter (`PQ-077`)
- Skip receiveShadow on transparents (`PQ-077`)
- Overdraw / fill-rate census; limit transparent layers (`PQ-063`, `PQ-076`)
- OIT / weighted blend / dithered alpha / A2C only if picture holds (`PQ-076`)
- Force single-pass canopy (already a policy) (`PQ-076`)
- Visibility buffer / deferred / forward+ / clustered lights — INV only (`PQ-067`, `PQ-089`)
- Depth prepass — INV only; close with no-mutation if not a net win (`PQ-078`)
- Occlusion / Hi-Z / small-primitive cull — INV; likely weak on a table (`PQ-061`)
- Meshlets / cluster LOD / virtual geometry — Long, same picture (`PQ-089`, `PQ-090`)
- Virtual / sparse / streamed textures (`PQ-086`)
- Format pick: BC7 / ASTC / ETC2 / UASTC / ETC1S per GPU (`PQ-055`, `PQ-086`)
- Anisotropy / mip bias only off-glass or if stills match (`PQ-086`)
- Skip mipgen when mip chain exists (`PQ-074`)

#### Present / post / HDR

- One bloom/HDR path; canvas MSAA dead behind it (`PQ-056`, `PQ-078`)
- Bloom resolve: fewer mips, dual-Kawase, half/quarter res, Karis — stills must match (`PQ-097`)
- HDR target: HalfFloat vs R11G11B10 vs RGBM (`PQ-116`)
- Memoryless / transient / aliased / pooled render targets (`PQ-078`)
- Don’t store unused attachments; correct load/store (`PQ-078`)
- Compute bloom / async compute when WebGPU (`PQ-089`, `PQ-097`)
- Grain/vignette/grade/LUT cost; skip identity ops (`PQ-078`)
- Optional SMAA/FXAA/TAA only if present is the pole and stills keep (`PQ-078`)
- FSR/XeSS/dynamic res are **illegal** as a default quality cut; INV only if same internal res (`PQ-078`)
- AO/SSGI/SSR/volumetrics/DoF/motion-blur/godrays — INV; do not add passes to “optimize”
- Speed-lines: stroke cache, OffscreenCanvas worker, GPU polyline (`PQ-098`)
- Canvas flags: `alpha:false`, `preserveDrawingBuffer:false`, `desynchronized`, `powerPreference` (`PQ-109`)
- ANGLE backend D3D11/D3D12/Vulkan (`PQ-110`)
- Mailbox vs FIFO vs low-latency swap (`PQ-092`)
- Exclusive fullscreen / compositor copies in Electron (`PQ-092`)

#### Admission / first use / hitch

- Exact-key dummy prewarm (lights, HDR, batching, shadow depth) (`PQ-072`) — **illegal** as a hitch fix; family-key collapse (`PQ-196`) and after-present compile (`PQ-114`, `PQ-198`) only
- One new program per present after present; never whole-root on rAF (`PQ-054`, `PQ-072`, `PQ-198`)
- `KHR_parallel_shader_compile` / own readiness timer (`PQ-054`)
- Binary program cache / WebGPU pipeline cache (`PQ-104`)
- Idle/`scheduler.yield` admission **after** present; never `setTimeout(0)` on the next rAF (`PQ-114`)
- Next-contact warm from traffic intent (`PQ-075`)
- Compose yield between parts; merge cache; no sync compose on combat thread (`PQ-073`)
- Upload after present; one tex/buffer per beat (`PQ-074`)
- Decode GLB/KTX2/Basis/meshopt/Draco on a worker (`PQ-103`)
- `createImageBitmap` / ImageBitmap (`PQ-103`)
- Autosave slice / after-present / worker serialize (`PQ-087`)
- Floating-origin rebase dirty-only (`PQ-100`)
- Catch-up cap so one hitch does not force extra sim steps (`PQ-101`)
- Context restore retries, force-new-context, named terminal park (`PQ-051`)
- Opening cohort watermark; late roots cannot extend it (`PQ-054`)

#### Scene graph / CPU prep

- `matrixAutoUpdate` off for static children (`PQ-099`)
- Flatten merged station/place graphs (`PQ-099`)
- Don’t `updateMatrixWorld` the off-glass tree (`PQ-070`, `PQ-099`)
- Presentation snapshot / SoA columns; no entity-object walk on present (`PQ-081`)
- Dirty journals / bitsets / monomorphic hot functions (`PQ-106`)
- Pool events, avoid per-frame `{}` / strings (`PQ-106`)
- Event-bus coalesce; no unbounded journals (`PQ-106`)
- Skip registry systems when 3D is hidden (`PQ-117`)
- Unload or freeze flight world in station/map/pause (`PQ-102`)
- Production default: probes/timers/debug traversals off (`PQ-113`)

#### Simulation / AI / physics

- Tick-quantize inactive owners (`PQ-057`, `PQ-080`)
- Spatial hash / dirty broadphase; don’t rebuild every tick if unchanged (`PQ-039`, `PQ-080`)
- Query/candidate work scales with the table (`PQ-039`)
- Rapier island sleep; solver iterations scale with the table (`PQ-084`)
- Time-sliced path / steering / perception (`PQ-080`)
- Sim Worker after snapshot fence (`PQ-082`, `PQ-043`)
- WASM/Rust island for queries, scheduler, snapshot pack, traffic — not Three.js (`PQ-083`, `PQ-091`)
- SharedArrayBuffer snapshot; measure copy vs gain (`PQ-093`, `PQ-067`)
- SIMD / bulk-memory / threads in WASM (`PQ-083`)
- Determinism lab before any cadence change (`PQ-066`)

#### Assets / I/O / boot / long session

- Immutable / ETag / content-hash cache (`PQ-055`)
- Brotli for code/text; don’t recompress GLB (`PQ-055`)
- HTTP range / packaged-file transport if a boot trace asks (`PQ-055`)
- Place/ship opening shell + later detail (`PQ-085`)
- Texture residency / evict off-glass without thrash (`PQ-086`, `PQ-058`)
- GPU/CPU byte budgets; previous-sector warmth (`PQ-058`)
- Code-split menus vs flight; V8/Electron bytecode cache (`PQ-055`, `PQ-092`)
- Service worker only if it helps warm launch (`PQ-055`)
- COOP/COEP if SAB is chosen (`PQ-093`)

#### Audio / HUD

- Voice cull to the table (`PQ-105`)
- HRTF/convolution/reverb only if cheap or off-glass silent (`PQ-105`)
- Decode/resample off the present thread (`PQ-103`, `PQ-088`)
- HUD: one rAF-aligned write; virtualize lists; contain/layout isolation (`PQ-088`)
- MSDF/atlas vs DOM for hot numbers if DOM is the pole (`PQ-088`)
- Don’t run full HUD/audio when overlays are hidden (`PQ-088`, `PQ-117`)

#### Platform / language / engine (large jobs stay listed)

- WebGPU backend + rollback (`PQ-044`, `PQ-089`)
- Render bundles, GPU cull, meshlets (`PQ-059`)
- Native present slice, same snapshot/input/save (`PQ-060`, `PQ-090`)
- Further Rust islands; full engine (Bevy/Fyrox/custom) only as `PQ-090` successor (`PQ-091`)
- Electron GPU process, vsync, swap, hardware accel, process priority (`PQ-092`)
- OffscreenCanvas / WebGL-in-worker for overlays only (`PQ-098`)
- Dual-queue / copy-engine / timestamp queries on WebGPU (`PQ-089`)

#### Sky / background (tabletop-priced)

- Starfield / parallax / deep-field / sky planets cost what a table uses (`PQ-095`)
- Don’t update sky animation off-glass or when paused (`PQ-095`, `PQ-117`)
- Background stars remain the only camera-facing exception (`PQ-095`)

#### Lighting / variants

- Event-light pool cardinality matches compile (`PQ-096`)
- Intensity-only flashes; don’t add/remove visible lights mid-fight (`PQ-096`)
- IBL/PMREM size; rebuild off the present beat (`PQ-072`, `PQ-054`)
- Env / SH / probes only if they don’t add first-use keys (`PQ-064`)

#### Measurement / scaffolding (not outcomes)

- Glass-band census (`PQ-061`)
- Hitch owner ring (`PQ-062`)
- Phase + GPU timers on the real bloom path (`PQ-063`)
- Shader-key dump (`PQ-064`)
- Alloc/GC/VRAM soak (`PQ-065`)
- Hash pair lab (`PQ-066`)
- Platform spike matrix + interop bench (`PQ-067`)
- Glass still-diff parity gate (`PQ-111`)
- Thermal/clock pair discard (`PQ-112`)
- Replay + seed hitch bisect (`PQ-118`)
- Shell pair Browser vs Electron (`PQ-092`)
- Restore/TDR drill (`PQ-051`)
- Spector / RenderDoc / PIX / Intel GPA / Chrome trace / GC (`PQ-063`, `PQ-065`)
- Pole sweep that mints missing leaves (`PQ-094`)

A line with no parent yet is minted under `PQ-094` rather than invented ad hoc. Investigation-first
is the default. Implementation is only what a census selected and an A/B kept.

### 8.4 Hitch campaign (`PQ-129`) — admitted execution order

`PQ-051`–`PQ-128` remain reserved catalog identities. They do not dispatch until a campaign
admits them. **`PQ-129` is that campaign** for the owner-visible hitching problem.

Law: [`design/program/PERF_HITCH_CAMPAIGN.md`](./design/program/PERF_HITCH_CAMPAIGN.md).
Packet: [`design/program/roadmap/active/PQ-129.md`](./design/program/roadmap/active/PQ-129.md).
Dispatch: `node scripts/program-dispatch.mjs --id PQ-129`. `--next` still returns `PQ-050`.

**Live smoothness work is `PQ-204`.** Quiet-machine census is not a gate. Deterministic algorithms
(always-on grid, combat SoA, dirty journal, NEAR token budget, save-safe Rapier sleep, off-glass
NPC outcomes, packed-ORM family keys, after-present compile, lean snapshot columns) ship under
`--id PQ-204`. Law: [`design/program/PERF_ADVANCED_CAMPAIGN.md`](./design/program/PERF_ADVANCED_CAMPAIGN.md).
Prompt: [`design/program/PERF_ADVANCED_GOAL.txt`](./design/program/PERF_ADVANCED_GOAL.txt). Same
picture; no dummy prewarm; GPU batching stays off until a crowded fly names draw-count.

**2026-08-20 headed Electron witness (Intel iGPU, real GPU, not SwiftShader):** Continue/new-game
flight verdict was hitching. Eight of the last eight samples were hitches. Biggest bucket
presentation (tail p95 ~99 ms, max ~515 ms). First-flight admission max ~2 s; one present max
~13 s. Shader programs still linked during the fly. Lifecycle reported `foreground-occluded`
(probe confounder for steady time, not for multi-second bricks). Live reviews the same day:
sync `buildComposedShip` still runs in flight via the empty-slot exception; hitch classifier is
default-off; off-glass 3D horizons are mostly retired; crowded p95 is still GPU submit once
bricks die; sim is not the hitch owner.

**CONFIRMED THE SAME DAY BY AN INDEPENDENT CLEAN-MACHINE RUN.** The first reading below was taken while a delegated lane was still live, so it was flagged as unconfirmed. **The reason given for that flag was wrong and is corrected here:** I read the frame-interval vs callback-interval disagreement (mean -220.4 ms) as a contention signature. It is not — the two quiet baseline runs show -259.6 ms and -234.4 ms, so that disagreement appears in EVERY run and is an artefact of how the witness measures, not evidence of a busy machine. **Do not use it to judge whether a run was contended.** A second lane then measured the same route twice on a quiet machine before changing anything, and **reproduced the brick**: `presentation` p95 **5.5 ms** / max **3237.5 ms**, 787 frames, **13 hitches**. Two independent runs, one contended and one not, both find a ~3.2-3.6 s stall at `stage entering-flight`. **The brick is real.** It is also highly REPRODUCIBLE — the two quiet runs peak at 3237.5 ms and 3248 ms, within 10 ms of each other on a 3.2 s stall, so an A/B against it is meaningful rather than chasing noise. Prefer the clean figures (p95 5.5, max 3237.5, 13/787 hitches) over the contended ones below.

**2026-08-23 gate reading (same instrument, same machine, real Intel GPU — `npm run probe:runtime-witness`, New Game seed 47, 20 s).** Wave C says *promote only after hitch count is halved or the classifier names that owner*, so this is the measurement that decides whether `.11`-`.18` dispatch at all. **Waves A and B are all ten DONE.** What the witness now sees:

- **Steady state is no longer the problem.** `presentation` p95 **5.8 ms**, `render` p95 4.4 ms, `sim` p95 4.5 ms, 182 draw calls. That is comfortably 60 fps with headroom.
- **One brick remains, and it is at `stage entering-flight`.** `presentation` max **3610 ms**, `render` max 3609 ms, `bloomScene` max 3607 ms. Read the distribution, not the average: 180 `bloomScene` samples with p95 5.1 ms but avg 22.9 ms means a SINGLE sample carries ~87 % of the total. This is one event, not a slow renderer. The 2026-08-20 baseline's *"one present max ~13 s"* is down to ~3.6 s but is not gone.
- 815 frames, 17 hitches, named coverage 0.824; owners bloom 8, unknown 3, sim 2, externalScheduling 2, present 1, vfx 1.
- Opening cost: 43 textures / 55.6 ms blocking upload; scene delta programs 40->41, geometries 19->39, textures 20->58.
- Also caught, unrelated to hitching: a **404 during ordinary flight**, and a shader warning (`use of potentially uninitialized variable (f_surfaceColor)`).

**2026-08-23 — THE GATE IS ANSWERED, AND WAVE C IS NOT WHAT THIS MACHINE NEEDS.**

Waves A and B are all ten done. Measured on a real Intel GPU with the campaign's own instrument:

- **Steady state already holds 60 fps.** presentation p95 **5.5 ms**, 182 draw calls, 15 hitches in
  830 frames. Wave C is "crowded 60 fps" work; the crowd is not the problem here.
- **One brick remains: ~3.2-3.7 s at entering-flight**, with the player in control. Four runs:
  3164, 3237, 3291, 3654 ms. That is Wave B's *kill bricks* business, not Wave C's.

**The obvious fix for it was built, measured, and REJECTED** — recorded here so it is not retried
blind. Moving authored compose off the display callback during flight, clean A/B, instrument held
constant, two runs per arm (p95 / max ms / hitches per frames):

| arm | run 1 | run 2 |
|---|---|---|
| with the change | 6.7 / **10** / **80** of 760 | 7.5 / **3164** / 14 of 849 |
| without | 5.5 / 3291 / 15 of 830 | 5.8 / 3654 / 15 of 819 |

It is **unreliable** — it killed the brick in one run of two, because the gate reads `mode` at
SCHEDULE time and a compose queued just before handover still takes the old path. And when it did
apply it took hitches from 15 to 80, which **this table's own promotion law forbids**. A prior
attempt had left a warning ("the scheduler must not turn some hitches into a 30 fps floor"); the
attempt deleted it, and it is now restored on `scheduleUpgradeFrame` with these numbers beside it.

**Next attempt should defer only the ONE huge first compose, not every flight upgrade frame** — the
display callback is right for the queue and wrong for that single job — and must gate on something
that cannot race flight handover. Do not promote `.11`-`.18` on the strength of this brick.

**2026-08-23, LATER THE SAME DAY — THE CAUSE IS NAMED, AND BOTH EARLIER GUESSES WERE WRONG.** The
instrumentation committed with the rejection immediately paid for itself. It logs what changes
whenever the bloom scene pass exceeds 80 ms:

```
[GPU brick] bloomScene 3229.3ms  programs 63 -> 70   geometries 116 -> 116   textures 127 -> 127
[GPU brick] bloomScene  806.6ms  programs 45 -> 47   geometries  55 ->  60   textures  60 ->  60
```

**Seven shader programs link inside a single scene render, ~460 ms each.** Geometry count does not
move; texture count does not move. **It is not upload, and it is not compose** — it is the first
DRAW of materials whose program has never been linked. `KHR_parallel_shader_compile` is absent on
this Intel/ANGLE part, so every link is a blocking wait.

That retires the "defer the first compose" hypothesis above: compose was never the cost. The opening
path already works (`exact opening plan: complete; admitted programs 3`); **the gap is everything
admitted AFTER the opening** — an NPC entering the glass mid-flight brings materials no opening plan
ever saw, and they link on first draw. The fix is to route those through the same precompile /
admission path the opening uses, spread across frames because parallel compile is unavailable here.
`precompile.js`, `pipelineReadiness.js` and `admissionSliceBudget.js` already exist for this shape.

**2026-08-24 (LATER) — THE BRICK IS FIXED, AND WAVE C's GATE IS NOW OPEN.** Opening GPU admission
(`e7c6dffd`) gets the opening's programs linked and geometry uploaded before the first presented
frame. Re-measured independently on a quiet machine, twice:

| | before | after |
|---|---|---|
| worst frame | 3237-3654 ms | **5-6 ms** |
| presentation p95 | 5.5 ms | **3.1 ms** |
| hitches | 13-15 of ~800 | **1 of ~1215** |
| `[GPU brick]` lines | several per run | **none** |

Typical frames got FASTER, so nothing was traded. **Hitch count 13 -> 1 clears the promotion law
("promote only after hitch count is halved") by a wide margin**, which is the law attempt 1 died on.

**But read what that means before dispatching `.11`-`.18`.** Wave C is *crowded 60 fps* work. The
machine now holds **p95 3.1 ms** — roughly a 5x margin on a 16.7 ms frame — with one hitch in 1,215
frames. The gate opening does NOT establish that the crowd is a problem; it establishes that the
brick that made everything look like a problem is gone. **Re-measure the actual crowded case before
admitting any of `.11`-`.18`, and close as no-op whatever the measurement does not justify.** §8.2's
own rule applies: these are reserved identities, and a plan is legal only if the player-facing game
is unchanged.

Still open, deliberately out of scope for that job: Continue/load logs two ~730 ms bricks
(programs 14 -> 17, geometries 13 -> 19). New Game is clean. **Admitted 2026-08-24 as
`PQ-129.19`** (Continue/load geometry residency). The donor is the 452-line
`startupGpuResidency.js` rewrite on `origin/perf/exact-opening-geometry-residency` (PR #100,
closed as superseded for the opening path by `e7c6dffd`) — port its geometry-cohort admission to
the Continue route rather than re-merging the branch. The promotion law applies: a hitch rise is
disqualifying, and only a clean matched A/B on the real Continue route justifies keeping it.

**2026-08-24 — THE COMPILE-ON-ADMISSION FIX DID NOT REMOVE THE BRICK. Measured, not assumed.**
Two runs on a quiet-ish machine (one UI lane, no GPU work):

```
run 1   p95 6.1   max 3387   hitches 28 of 923
run 2   p95 8.4   max 3173   hitches 17 of 902
baseline p95 5.5  max 3237-3654  hitches 13-15 of 787-830
```

The max is unchanged. **What DID improve is the part the instrumentation catches**: the logged
`[GPU brick]` events fell from 3229 ms / +7 programs to ~215 ms / +3 programs. So late admission is
compiling *something* earlier — it is simply not the thing that costs 3.2 s.

**And the 3.2 s is still inside `bloomScene`** (`bloomPhases` 180-sample max 3167.6 ms) while the
`[GPU brick]` warning never fired for it. That is an INSTRUMENTATION BLIND SPOT: the warning is gated
on `renderWorkEnabled`, and the costly event lands outside the window where that gate is true. **Fix
the blind spot before the next attempt** — three rounds have now been aimed by partial evidence, and
each time the evidence that was actually available pointed slightly wrong.

Also note `hitches` rose (13-15 → 17-28) and `p95` rose (5.5 → 6.1/8.4). Those runs were contended
by one active lane, so the rise is NOT established — but PQ-129's promotion law makes a hitch rise
disqualifying, so this needs a clean A/B before the change is defended, not after.

**This is why the instrumentation was kept when the fix was reverted.** One 20-second run then named
in a single line what two rounds of reasoning had guessed wrong twice.
**Reading:** the classifier DOES name an owner, so the gate's second clause is satisfied — but the honest conclusion is that Wave C's crowded-60-fps work is not what this machine needs next. Steady state already holds 60 fps; the remaining owner-visible cost is one ~3.6 s freeze entering flight, which is Wave B's *kill bricks* business, not Wave C's. Chase the brick before promoting `.11`-`.18`.

**The instrumentation was then extended to name the programs, and that narrowed it again.** Counts
said a brick happened; identities say which spawn caused it. The seven are one `depth,…` program plus
six `physical,STANDARD,…` variants differing only in which UV/map channels are bound — i.e. authored
SHIP materials. The smaller 843 ms brick adds two more map-less `physical` variants alongside
+5 geometries.

Two consequences:

1. **It is a PREDICTION MISS, not a missing mechanism.** `shipSpecsForSector` in
   `src/render/precompile.js` compiles a predicted population — traffic roles, ONE enemy pool chosen
   by `security`/`tier` via `enemyPoolForSector`, plus a boss if a `poi_boss` exists. Anything that
   spawns outside that prediction (another pool, a faction squad, a mission or story spawn) reaches
   its first draw uncompiled.
2. **One of the seven is a DEPTH program** — the shadow-map variant, a separate program from its
   colour twin. `SF_Precompile_ShadowDepth_KeepAlive` already exists for exactly this class, so that
   variant is escaping it.

So the fix is either to compile on ADMISSION (the ship is admitted before it is drawn; the seam is
`createPipelineAdmissionTracker` in `pipelineReadiness.js`) or to stop the prediction from missing.
Compiling on admission is preferred: broadening the prediction pays the cost for ships that may never
spawn, and the opening budget is already spoken for.


| Wave | Leaves | Reserved work | Player outcome |
|---|---|---|---|
| **A · name it** | `.01`–`.03` | `PQ-061` census, `PQ-062` live hitch classifier, `PQ-063` phase timers | Every >32 ms frame has a named owner on the real present path |
| **B · kill bricks** | `.04`–`.10` | `PQ-073` compose slice, `PQ-075` next-contact, `PQ-064`/`PQ-072` shader keys, `PQ-074` upload, `PQ-054` leftover admission, `PQ-101` catch-up | First hostile and Continue no longer drop 40–250+ ms bricks |
| **C · crowded 60 fps** | `.11`–`.18` planned | `PQ-068` submit, `PQ-052` batching, `PQ-076` lanes, `PQ-108` tiny LOD, `PQ-080` cadence, `PQ-097` bloom-if-pole, `PQ-087` autosave, `PQ-094` sweep | Promote only after hitch count is halved or the classifier names that owner |

**2026-08-24 — WAVE C IS MEASURED AND SEVEN OF EIGHT LEAVES ARE CLOSED AS NO-OPS.** A crowded scene
was built deliberately (218 draw calls, 12 nearby contacts) rather than an idle fly, and every phase
came in under the 16.7 ms budget: **render p95 7.4 ms, presentation p95 9.4 ms, sim p95 7.7 ms.**
The poles these leaves assume do not exist on this machine.

| Leaf | Disposition | The number that decided it |
|---|---|---|
| `.11` glass/runway submit | **CLOSE — NO-OP** | 39-43 submitted objects; render p95 7.4 ms. Submission was not the pole. |
| `.12` rigid opaque batching | **CLOSE — NO-OP** | 218 draw calls and render still 7.4 ms. No evidence to replay the rejected candidate. |
| `.13` canopy/plume lanes | **CLOSE — NO-OP** | No canopy or plume lane was ever named as an owner. |
| `.14` tiny-fighter LOD | **CLOSE — NO-OP** | Crowded contacts were CLOSE, not 30-pixel fighters. |
| `.15` off-table AI sleep | **CLOSE — NO-OP** | tacticalAI 3.0 ms p95, physics 1.2 ms; off-table sleep is already wired. |
| `.16` cheaper bloom/HDR | **CLOSE — NO-OP** | bloom scene/downsample/composite p95 5.8 / 0.2 / 0.1 ms. Post was not the pole. |
| `.17` autosave off the callback | **CLOSE — NO-OP** | Autosave owned **0** of 122 hitches. |
| `.18` pole sweep | **JUSTIFIED — and this review IS it** | Only 71.3 % of hitches got a named owner. |

**What the sweep found instead.** 122 hitch frames (11.7 %) remain, and the largest bucket is
**external scheduling (55) plus unknown (35)** — outside the measured game phases. The strongest
in-game lead points back at Wave B territory, not Wave C: four more `bloomScene` bricks of
**219-496 ms**, each accompanied by new shader-program or geometry activity, while an authored
background job was still running. **Compile / upload / admission again, in the crowded and
Continue paths this time.**

**Instrument limits, stated so the next reader does not over-trust this:** no GPU timestamp queries,
so compilation, upload and driver stalls cannot be separated precisely; 35 hitches remain unowned;
the crowd was synthetic, not an organic playthrough; the 30-pixel fighter case was never exercised;
and the authored-settlement gate would not complete, so this reflects the live fallback/admission
state rather than a fully settled fleet.


Illegal here: default quality cuts, headless hitch-budget as acceptance, replaying the rejected
BatchedMesh candidate, starting Worker/WebGPU because Wave B is hard, shrinking hail 5200 as a
cull.

### 8.5 Open defect — a valid ship asset is rejected at load and NOTHING is drawn

**2026-08-23. `check:playable` passes 15/15 while warning that a ship renders as nothing.**

```
[partsLibrary] authored composition failed; no substitute visual published
Error: release mode requires .../wholeships/ashline_rig.glb for ship_wasp;
       it did not pass the live authored-asset loader
```

"No substitute visual published" means an **invisible enemy**. It is player-visible and was
untracked; no asset check flags it, and `check:playable` reports it as a WARNING and still passes —
the exact "a green check is not proof" pattern this document warns about.

Already ruled out, so nobody redoes it: the file is **not missing** (7,867,164 bytes, tracked) and
**not corrupt** (valid GLB, version 2, declared length == actual, JSON 55696 + BIN 7811440). It is in
`PACKAGED_LIVE_WHOLE_SHIP_FILES` and in `release_manifest.json` with the same entry count as its
sibling `ashline_dart.glb`, which loads fine. **The rejection is a live-loader policy, not the file.**

**The mapping lead was chased and DISPROVEN — do not repeat it.** `wholeShipVisualForEntity`
always takes the file and the assetId from the SAME map, so no cross-map mismatch is possible. The
four hostile ids that use `ashline_rig.glb` (`reaver_pirate`, `mine_layer_jackal`, `corsair_raider`,
`tether_control_raider`) all resolve to `SF_WHOLESHIP_ASHLINE_RIG`, and every one of the 12 hostile
file entries has a matching assetId — zero missing.

**So the record is simply not in `records` at lookup time.** `resolveRequiredWholeShipRecord`
(`partsLibrary.js:1365`) throws when no loaded record ends with the wanted file. The asset is
listed in `spawnableShipArchetypePrewarmUrls()`, so the sector prewarm is supposed to cover it —
which makes this a **prefetch/timing** defect, not a data-mapping one. The next step is to capture
the untruncated error, whose tail lists the whole-ships that DID load; that list is the evidence.

The fix must also add a check that **FAILS** when a whole-ship required by a live entity does not
load and no substitute is published. This class currently reports as a passing warning, which is
precisely why it survived.

## 9. Documentation and instruction hygiene

Documentation has a declared lifetime:

- `STABLE` files route and define durable contracts; they contain no live snapshots.
- `DURABLE` files preserve long-lived research, evidence, or rationale. They may inform planning,
  but never grant a lease, dispatch authority, acceptance, or priority over an admitted packet.
- `VOLATILE` files contain current mutation/status facts, a refresh base, and an expiry condition.
- `ACTIVE_PACKET` files guide one admitted packet and retire into evidence when done.
- `GENERATED` files are rebuilt from code.
- `HISTORICAL` files can explain a decision but cannot direct implementation unless explicitly reactivated.

An agent's preference is not a repository rule. New automatic instructions or checks are admitted only when they protect determinism, save compatibility, state ownership, security, accessibility, licensing/provenance, a measured performance invariant, or a demonstrated player-facing contract. Do not fossilize taste through CSS-property bans, palette allowlists, fixed technique counts, arbitrary geometry ceilings, source-string scans, or “never do X” prose that lacks an observed failure.

Run `node scripts/check-program-docs.mjs` after changing the program control surfaces.

## 10. Checkoff

The agent that finishes a unit updates that unit's packet checklist, receipt, queue row, and shared
status in the same bounded transaction after verifying the exact candidate revision. No separate
coordinator is required. A named human or independent-review gate remains a separate task only when
the packet explicitly requires that evidence.

A receipt must say what changed, what passed, what route was observed, what performance profile was measured, what remains unproven, and which follow-ups were deliberately excluded. “Tests pass” is not a substitute for those facts; neither is a screenshot a substitute for simulation truth.

## 11. The frontend is the strategic half of the game

The screens and the HUD are not connective tissue between the fun parts. They are where the player
understands the world, understands their ship, and decides what to do next. Owner direction,
2026-08-15:

> "The frontend screens and HUD **ARE** the gameplay… the home of the strategic experience that's
> symbiotic with the fast combat and spaceflight and keeps it grounded and understood. The map,
> menus, everything… The player needs to be able to understand the systems of the game through these
> screens, and understand the world outside the immediate view by the map, their ship by the ship
> menu."

> "I keep having agents working on the frontend and it's very cheap and uninspired… the moment to
> moment experience is weak right now partially because of the frontend and menu experiences."

**Design authority for every 2D surface is [`design/frontend/`](./design/frontend/README.md).**
Read [`INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md) before designing or building
any screen; it is binding.

### 11.1 Why frontend work keeps coming back cheap

It is a **specification** failure, not a talent failure. "Make the ship screen good" produces slop
from any author, human or agent. The grammar removes the guesswork — type roles with a hard 12 px
floor, colour assigned by meaning, a motion contract, one layout skeleton, three disclosure tiers,
and class-naming rules that survive the accessibility sanitisers. A per-screen document then only
supplies the *idea*, because everything else is already decided.

Three rules carry most of the weight:

1. **Screens differ by centerpiece and manipulation verb, never by styling.** The Ship is a *stage
   you orbit*; the Chart a *table you push things around on*; the Footprint a *board you trace*; the
   Range a *box you play in*. **If two screens share a silhouette, one of them has no idea in it.**
2. **No motion ships without a named state variable behind it.** Overshoot amplitude is your hull's
   inertia; power beams reverse when you overdraw. Anything that cannot name its variable is
   decoration and is cut in review.
3. **The UI never invents.** Explanatory phrases come from an enumerated bank; an unknown tag renders
   *nothing*. Already the discipline in `src/ui/causeLedger.js`; promoted here to house law.

### 11.2 The finding that sizes the work

**SpaceFace is a very large simulation with almost no windows into it.** Verified by audit of every
system in `src/systems/` and dataset in `src/data/`, cross-checked by reverse-import map, `state.*`
subtree grep, and event emit ∩ subscribe:

| Running now | What the player sees |
|---|---|
| **183 KB** of NPC careers (hauler, miner, salvor, surveyor, patrol, tender) with full phase machines | `state.npcJobs` read by **0 UI files** |
| **350 KB** of traffic simulation moving real prices — the largest file in the repo | `state.traffic` read by **0 UI files** |
| **124 KB** encounter director deciding what attacks you and when | no read on accumulating danger |
| **78 KB** law system — incidents, witnesses, warrants, custody, sanctuary | a **5-second banner** |
| **73 KB** claims — 15 sites, 6 buildable modules, raids, defenses | undifferentiated dots on a map |
| **53 KB** surrender & custody — capture, prisoners, escape | **a mercy outcome is indistinguishable from a kill** |
| **28 KB** ace memory — 12 named pilots who remember your fights and adapt | **nothing ever names them** |

> **Spot-checked 2026-08-23, and the table has partly aged. Verify a row before acting on it.**
> Three rows were re-tested against the current tree: traffic is now read by three UI files
> (`commsRadial`, `dockArrival`, `worldSiteMapLayer`), so "read by 0 UI files" is stale; and a
> mercy outcome is no longer indistinguishable from a kill — `combatOutcome` speaks four distinct
> lines ("fled the fight", "disabled; capture window open", "surrendered", "destroyed").
> The ace-memory row is stale too, and I got that wrong on the first pass: a returning ace speaks
> its own name (`"<name>: you should have finished me."`), sets `ai.name` on every ship it
> spawns, and `src/ui/targetPanel.js` reads `ai.name` — so targeting one shows who it is. My
> first grep searched for `ace`-shaped identifiers and missed the field the UI actually reads.
> All four rows re-tested have aged, which makes the point below stronger, not weaker.
>
> This is a diagnosis from a point in time, not a live status board. Rebuilding something that
> already exists because a row still says it does not is the failure mode to avoid here — the same
> one that left §13 claiming the arcade structural FX had zero consumers long after it had four.
| `player.bounty`, which decides who hunts you | appears in **zero** UI files |
| `getDerivedStats` returns **~35** ship fields | the ship screen shows **6** |
| Living hull already accrues kill tallies, patches, scorch, grime, graffiti | its only UI reader is **dead code** |
| Five physics powers already bound to keys `4`–`8` | `clearingCone` / `skimCollector`: **zero** HUD refs |

**The MMO depth the owner asked for does not need inventing — it needs revealing.** This is also the
literal answer to *"I can't look at the HUD and see the big game that it will become"*: the game is
already bigger than the HUD admits.

### 11.3 The surface manifest

Four instruments, one non-pausing quick tier, the docked station, and the meta layer. **Everything in
the invisible-simulation inventory is absorbed into one of these — four surfaces, not twenty screens.**

| Surface | Key | Archetype · verb | Absorbs |
|---|---|---|---|
| **THE SHIP** | `F2` | a stage you **orbit** | condition, living-hull scars, handling, energy budget, capability/tech, insurance |
| **THE CHART** | `M`/`N` | a table you **push** | economy pressure, risk, living-world traffic, live events, holdings, sector dossiers, history |
| **THE FOOTPRINT** | `F3` | a board you **trace** | crime, bounty, faction standing + spillover, ledgers, surrender outcomes, named rivals, titles |
| **THE RANGE** | `F4` | a box you **fly in** | systems teaching, recoverable onboarding, bestiary, weak points |
| **Verb wheel** | `Alt` held | non-pausing radial | Massline head, fleet orders, consumables |
| **Power Bar** | `1`–`9` | HUD, permanent | the number-key abilities — see §11.4 |
| **Docked station** | dock rail | 7 pinned destinations | market, contracts, industry, bar, factions, ledger, shipworks |
| **Meta** | — | — | title, pause, settings, save/load, codex, mission log, game over |

Owner ruling: **menus pause the world, Skyrim-style.** Full-depth full-viewport strategic screens in
flight are legitimate; the four instruments join `PAUSING_SCREENS`. Quick mid-combat verbs stay on
the non-pausing radial. Pause is for *thinking*; the radial is for *doing*.

### 11.4 The Power Bar

The owner's headline request — *"boxes for the different powers you could accumulate on the HUD,
activated by the number keys"* — is **already half-built at the input layer.** `src/systems/input.js`
`VERB_BINDINGS` binds `Digit4` Mass Seed · `Digit5` Well (pull) · `Digit6` Repulsor (shove) ·
`Digit7` Clearing Cone · `Digit8` Skim Collector. `Digit0` is brake, `Digit1`–`3` answer modal
prompts only, `Digit9` is free repo-wide. **Two of those five powers have zero references anywhere in
`src/ui/`.**

So the work is *surfacing what exists and defining how the rest of the bar fills*, not inventing an
ability system. An empty socket is a promise, not clutter; **a filling bar is the only progression
display that needs no explanation.** Slot map, states, and the hour-1/10/50 densification are
specified in [`SCREENS_A_FLIGHT.md`](./design/frontend/SCREENS_A_FLIGHT.md); a rendered prototype of
all three stages is in `_uilab.html`.

Icons follow [`ICON_PIPELINE.md`](./design/frontend/ICON_PIPELINE.md): one fixed style anchor and one
parameterised template, because the hard problem with an AI icon set is generating twenty that look
like **one set**. Generated raster is concept reference only — the shipped artifact is authored
24 × 24 `currentColor` stroke SVG, because `currentColor` carries ready/cooling/locked state and
`forced-colors` strips `background-image` outright. Sixteen ready-to-run prompts are committed at
[`design/frontend/icon-prompts/`](./design/frontend/icon-prompts/).

### 11.5 Sequencing

Phase 0 is not optional; every later phase depends on the shell and the motion contract, and doing it
late means rebuilding.

| Phase | Work | Payoff |
|---|---|---|
| **0 · Foundation** | **add the `--sf-you/foe/goal/calm/paper` role tokens to `styles/ui.css`** (they do not exist yet); **build the entity resolver** (id → dossier + label + route) that ideas 1/3/7 of `ADDITIONS.md` all share; screen shell with `onEnter`/`onExit` + per-screen backdrop; motion contract as shared helpers; adopt `uiPrimitives`; hover audio; type scale; add the four ids to `PAUSING_SCREENS`; **plus the A-list properties every screen must inherit rather than remember** — state memory, the empty/loading/error/denied state set, the responsive scalar (incl. the ultrawide HUD safe box), and text-expansion-safe layout primitives (see §11.7) | nothing visible — but every screen after is faster, consistent, cross-linkable, and does not fall over in pseudo-loc, on ultrawide, or when its data set is empty. **Retrofitting the tokens or the resolver into finished screens costs several times more than emitting them as you build.** |
| **1 · THE SHIP** | promote `shipEngineeringStage` into live shipworks; mount `handlingProfile` + `massDelta`; power budget with beam reversal; **living-hull scars projected onto the hull**; capability sentences | biggest visible win, mostly assembly of code that already exists |
| **2 · THE FOOTPRINT** | append-only `provenanceLedger` listening to already-emitted events; rap sheet + bounty; standing with spillover edges; queryable log; named rivals | the world visibly remembers what you did |
| **3 · THE CHART** | pressure flows; real risk in route ranking; living-world traffic layer; live events; holdings; sector dossiers; history | the world outside the window becomes legible and actionable |
| **4 · THE RANGE** | three drills first, not thirty; then bestiary and weak-point passes | the game finally teaches itself |
| **5 · HUD + Power Bar** | slot bar, capacitor headroom, contextual bands, retained craft rulings | sequenced late deliberately — this is where the live performance work sits |
| **6 · Station interiors** | flatten `station-workbench.css` with appearance held constant, **then** redesign | success test is "looks identical, file is half the size" |
| **7 · Cleanup** | retire ~10,780 lines of dead station UI after repointing `check-ui-screen-imports.mjs` and `check-command-deck-ui.mjs` at `src/ui/station/` | both checks currently require the dead files to exist, and neither lints the live station |

### 11.5a Asteroid Works is a playable inset, not a HUD with a tiny board

Owner playtest 2026-08-20 failed the live mining screen, and the same-day owner
design session replaced the old console with a **ground-up design**:
[`design/ASTEROID_WORKS_DESIGN_LAW.md`](./design/ASTEROID_WORKS_DESIGN_LAW.md) —
the game reduced to four visible laws (mine-once/farm-forever, machines feed
through faces, geology is the tech tree, tunnels are streets + rock is the
radiator), a perfect axis-aligned chess grid, **fog of war removed**, a warm
"field equipment at dusk" art direction replacing the gray/tracked-caps console
voice (owner: "gray, bleak, and vibe-coded, harsh fonts"), events on the board
with sound instead of a text tape, and instruments that mount only when they
first have data. Defects and bans stay in
[`design/program/ASTEROID_WORKS_PLAYFIELD.md`](./design/program/ASTEROID_WORKS_PLAYFIELD.md);
chrome idea in [`design/frontend/SCREENS_E_ASTEROID_WORKS.md`](./design/frontend/SCREENS_E_ASTEROID_WORKS.md);
execution is `PQ-130` (leaves `.01`–`.10`; deeper sim laws — seam scaling, the
parked thermal model, gas-tap power, import complements, the economy curve,
drones/field — are future packets listed in the law's §12).

**Art (2026-08-21 owner review): `PQ-130` is implemented, not accepted.** Every object in
the mine is a procedural stand-in — "the rover is like this 8-bit NES model inside this 3d
world … you're intentionally cutting corners." The authored-asset campaign is
[`design/program/ASTEROID_WORKS_ART_CAMPAIGN.md`](./design/program/ASTEROID_WORKS_ART_CAMPAIGN.md)
(`PQ-131`: a works-context release loader + works camera first, then rover, Core, extractor,
refinery, derrick, conduit kit, gas tap, fabricator, port/crates/pod, inclusions — each
reference-first, Blender, PBR, LOD, KTX2 via the canonical builder, three reviews at play size
beside a flight still). `PQ-130`'s acceptance is blocked on its units `.00`–`.06`.

The cutaway is the STAGE. The verb is **BORE**. Manifest tape, site-systems trivia,
and hover paragraphs are deleted per the law's §10, their jobs relocated onto the
board and into drawers. `SCREENS_D` B.10 (“leave the drill screen alone
and use it as the bar”) is void — owner playtest outranks it.

Do not fold this into Phase 5 HUD work or into Asteroid Ops Waves 1–4.

**Out of scope by owner ruling: progression rebalancing.** The pacing defects are real and recorded
(start 5,000 cr vs cheapest node 6,000; the Massline's top tier behind a 2,500,000 cr capital node;
research points have exactly one writer) but the numbers are not changed under this program —
presentation only.

### 11.6 Verification

Standard UI suite plus a **capture matrix**, not a single screenshot: every new surface captured in
**default · reduced-motion · `forced-colors` · pseudo-localized**, at **2560×1080 · 1920×1080 · 1280×720**.
Pseudo-loc and ultrawide are where this design is most likely to silently degrade, and both harnesses
already exist. Reference frames are diffed in CI (§11.7 item 13) — otherwise "a green check is not
proof" stays permanently true. A screen is not done until its silhouette is distinguishable from every other screen with
the text removed, its APRON holds at least one verb, and it has been *looked at* in a captured frame.

**A green check is not proof, demonstrated three times here:** the clipped Mission Log card passes
every check in the suite; `check:ui-frame-sleep` inspects `rAF` and cannot see compositor-side
`infinite` CSS keyframes; and `src/ui/screens/techTree.js` renders in browser-default 10 px sans on
every frame because Canvas 2D silently ignores `var()` in `ctx.font` — with nothing reporting it.

### 11.7 A-list standards — properties every screen must have

Beyond the per-screen designs, a top-tier frontend is defined by the screens that **do not fall over**
in conditions the author was not thinking about. Full detail:
[`design/frontend/A_LIST_GAPS.md`](./design/frontend/A_LIST_GAPS.md). The four that will visibly
break this build if ignored:

| # | Standard | Status | The rule |
|---|---|---|---|
| 1 | **Text expansion** | **missing from every spec** | The game has a live localization system and a pseudo-loc capture harness — every `.devshots/alpha/m6-*` frame is pseudo-localized. No spec mentions it, while the specs are full of fixed widths and `nowrap`. **No fixed-width text container; design against +40 %; never concatenate a sentence; capture in pseudo-loc, not just English.** |
| 2 | **Empty / loading / error / denied states** | unspecified | A correct-but-blank screen reads as broken (the Chart's Economy tab returning empty until you have priced two stations is the live symptom). Every pane defines all four, each naming *what would fill it* and carrying a verb. |
| 3 | **Screen state memory** | **verified missing** | `galaxyMap.js` persists no layer toggle, commodity, zoom or tab — every open is a fresh open. Every instrument restores the state the player last chose, per save. Invisible when present, infuriating when absent. |
| 4 | **Responsive strategy** | **verified missing** | Exactly one breakpoint exists (`max-width:900px`). Ultrawide must **clamp the HUD to a centred safe box** rather than stretch to unreadable corners; 4K scales by `--ui-scale`; handheld gets a reduced-density variant. Capture at 2560×1080 / 1920×1080 / 1280×720. |

Tier-2 and tier-3 standards in the same document cover: skill-tree needs an A-list tree has and this
plan lacks (search, "what leads to this?", a planned path, preview-before-commit, branch comparison,
and an explicit respec decision); Chart gaps (measurement, route comparison, authored fog-of-war,
layer presets); data-presentation conventions; list virtualization and a UI frame budget;
destructive-action policy; key-rebinding conflict display; a notification priority ladder across all
transient channels; returning-player re-establishment; **visual regression testing** (the only real
answer to "a green check is not proof"); text scaling; and the three absent meta screens — credits,
lifetime statistics, and photo mode.

### 11.8 Candidate additions

Ranked backlog in [`design/frontend/ADDITIONS.md`](./design/frontend/ADDITIONS.md), each verified as
genuinely absent from the codebase, with a deliberately-rejected list so they are not re-proposed.

The three that would most change how the game feels:

1. **Everything is a link.** Every entity name rendered anywhere — faction, commodity, station, hull,
   captain, sector, module — is clickable and opens that entity's dossier in place. **This is what
   makes a large game feel like one system rather than twelve menus**, and it is the cheapest answer
   to "the player needs to understand the systems through these screens": rather than a screen per
   system, every mention of a thing becomes a door into it.
2. **Loadout presets.** Customisation only produces *different kinds of gameplay* if switching is
   cheap enough to experiment with. Each preset is labelled by playstyle, never by stats.
3. **The watch list.** Pin a price, a rival, a deadline, a faction; it follows you onto the HUD. The
   game tracks far more than a player can hold in their head — let the player choose the slice.

**All three share one entity resolver**, which is why it sits in Phase 0.

**Rejected and recorded:** a separate stats screen (folds into the Footprint), a fleet-management
screen (VISION.md forbids the empire manager — the player never orders anything but their own ship),
a player market, skill *points* to allocate (progression grants verbs, not sliders), a second
minimap, tutorial popups (THE RANGE replaces them), and floating damage numbers (the HP-bar
dogfighting VISION.md forbids).

### 11.9 The one scheduling law

Three separate reviews reached the same conclusion by different routes:

> **Anything every screen needs must exist before the first screen is built.**

The colour token block, the canonical entry-key table, the entity resolver, state memory, the four
required states, the responsive scalar and text-expansion-safe layout are all in this class. Each was
discovered as a *defect* — a divergence between parallel authors, or a gap only visible once
rendered. Retrofitting any of them means touching every screen a second time.

That is what Phase 0 is for, and it is why Phase 0 is not optional.

### 11.10 Implementation status

| Phase | State | Evidence |
|---|---|---|
| **0 · Foundation** | **NEARLY DONE.** Role/type/motion tokens, the CREST/STAGE/APRON/DRAWER skeleton, text-expansion base rules and delegated hover audio landed (`8adcd339`, `65b81ee8`). **J3 the four data states, J5 the entity resolver + drawer, and J4 screen state memory have now landed** (`09111881`, `61497eab`, `16067c5e`). **Responsive / ultrawide safe frame landed (`0996a2e4`).** J01 named adoption set and J03 named tagging set are encoded and negative-tested in `check:data-states` / `check:entity-links` (`c571c478`). | `styles/ui.css` §11/§13/§14; `src/ui/entityResolver.js`; `src/ui/screenMemory.js` |
| **1 · THE SHIP** | **DONE.** Pausing in-flight screen (`F2`), shared WebGL mount, polish pass (`c01e55c4`); bands 2–3 handling/power/condition/capability landed as J09 (`0f503607`); loadout presets J13 (`4dbd0257`). | `src/ui/ship/shipScreen.js`, `src/ui/ship/loadoutPresets.js` |
| **2 · THE FOOTPRINT** | **DONE** — J10 (`583f7893`): provenance ledger + rap sheet / standing / log (`F3`). | `src/ui/screens/footprint.js`, `src/systems/provenanceLedger.js` |
| **3 · THE CHART** | **DONE** — J12 (`06a8161c`): pressure flows, route risk, traffic layer, dossiers. | `src/ui/galaxyMap.js`, `src/ui/map/` |
| **4 · THE RANGE** | **DONE** — J11 (`9d242df7`): three drills + weak-point passes (`F4`). | `src/ui/screens/range.js` |
| **5 · HUD + Power Bar** | **DONE** — J05 icons/crests (`e23a9ba9`), J06 Power Rail (`79e56c06`), J07 tactical HUD (`ad4764b5`…`f94a3368`), J08 reticle + threat halo (`bea90b47`), J14 tactile feedback (`f85507a9`), J15 quick-comms (`6cd90065`), responsive/ultrawide safe frame (`0996a2e4`). | `src/ui/hud.js`, `src/ui/powerRail.js`, `src/ui/threatHalo.js`, `src/ui/commsRadial.js` |
| **6 · Station interiors** | **Stage 0 repair DONE** (`376fcc8f`: `translate` instead of `transform` on `button:active`, popover anchor exemption, `resolveTarget`). **Flatten DONE** (`9b424bbe`: 982 cascade-dead declarations removed with an independent cascade proof, 0.0000 % pixel diff on the pure-DOM tabs at three bands, Kimi vision IDENTICAL; 2,905 → 2,496 lines — "half the size" was not honestly reachable without changing appearance). **Stage 2 DONE** (`cff8fa37`): the sub-12 px declarations were taken to the grammar floor by layout rather than by shrinking anything else, and every figure now binds `--sf-data-face`. Verified 2026-08-23 against the file, not the commit message: the smallest `font-size` in `station-workbench.css` is 12 px (43 declarations sit at 13 px, none below 12), and `--sf-data-face` is bound 29 times. | `styles/station-workbench.css`, `src/ui/station/` |
| **7 · Cleanup** | **Premise refuted 2026-08-21.** A resolved reverse-import walk reaches **27 of 27** files in `src/ui/screens/`; `stationHub.js` (4,057 lines) is imported by the live `stationApp.js`/`stationScreen.js`, and the live station screens import shared logic from the legacy `market.js`/`bar.js`/`services.js`/`shipLedger.js`/`factions.js`. Nothing is deletable without first refactoring the live station. What was wrong is fixed: both checks now lint the LIVE station (`30be9b1d`). A future Phase 7 is a refactor (lift shared logic out of the legacy modules), not a deletion. | `scripts/check-ui-screen-imports.mjs`, `scripts/check-command-deck-ui.mjs` |

**Phase-0 addendum — three rulings the build produced, binding on every job below.**

1. **`--sf-data-face` is not optional.** It was declared "numerals only, tabular-nums" and used **zero
   times**, while the Chart's own inspector — directly behind the first drawer built on it — already
   sets its numbers in mono. Every figure on every new surface binds it. This one change did more
   for "reads as an instrument, not a web component" than any other in the pass.
2. **No motion without a state variable — enforce by subtraction.** J3's LOADING sweep shipped as
   `animation: … infinite`, which §5 forbids (nothing supplied progress) and which
   `check:ui-frame-sleep` structurally cannot see, because it inspects rAF and this is a compositor
   keyframe. It was **deleted**, not tuned. The state is carried by the word, the glyph, `aria-busy`
   on the host, and the skeleton's shape. `check:data-states` now fails any `infinite` in the block.
3. **Shape tokens exist now — use them, don't re-declare.** `--sf-rail-w`, `--sf-goal-edge`,
   `--sf-track-micro`. Sections 13 and 14 had already drifted apart on rail width, radius and micro
   tracking before a second screen adopted anything; three overrides in the first two consumers is
   how `station.css` became a 202-selector override pile.

### 11.10a What the reviews changed, and what they cost

Moved to [build_map_done.md](./build_map_done.md) — completed/historical, kept verbatim for review. Does not dispatch work.

### 11.11 What inhibits the player's best experience

Measured, not asserted. Ranked by cost to the player. This table is the *why* behind §11.12.

| # | Inhibitor | Verified evidence |
|---|---|---|
| 1 | **The simulation is invisible** | `state.npcJobs` (183 KB of career sim) and `state.traffic` (350 KB, largest file in the repo) are read by **0 UI files**. `player.bounty` — the number deciding who hunts you — appears in **0** UI files. |
| 2 | **You cannot read your own ship** | `getDerivedStats` returns ~35 fields; the ship screen shows **6**. Every module advertises a power `DRAW` against a capacity never displayed. Condition/damage absent. |
| 3 | **Nothing explains a rule** | `screens/help.js` = four blocks of keybindings. `screens/codex.js` = 8 story-gated *narrative* tabs. `systems/onboarding.js` speaks one 6-second line, unrecoverable. Station tooltips: factions 0, industry 0. |
| 4 | **The world does not remember you** | `heat` is a 0..1 scalar that decays. `factions.js` overwrites rep by scalar. Both emit a `reason` and discard it. No crime log, no standing history. |
| 5 | **The good powers are unreachable** | Start = 5,000 cr; cheapest of 29 tech nodes = 6,000. `mod_massline_spool_l` (the signature mechanic's ceiling) requires `tech_flagship_command` = 2,500,000 cr behind Capital Hulls. RP has exactly one writer. |
| 6 | **The HUD hides what you can already do** | Keys `4`–`8` fire five physics powers today. `clearingCone` and `skimCollector` have **zero** references in `src/ui/`. |
| 7 | **Screens forget everything** | `galaxyMap.js` persists no layer toggle, commodity, zoom or tab. |
| 8 | **Correct-but-blank reads as broken** | Fixed once by hand (THE SHIP showed an empty bay for 12 s cold). No shared state policy, so the next screen repeats it. |
| 9 | **The UI would break in translation** | A live localization system and pseudo-loc harness exist; no spec accounted for +40 % string growth. |
| 10 | **One breakpoint** | `@media (max-width:900px)` is the only one. No ultrawide, 4K or handheld strategy. |

> **The through-line: this is a surfacing problem, not a content problem.** Nearly every inhibitor is
> *"the game already computes this and never shows it."* Several jobs below are therefore assembly,
> not invention.

### 11.12 + 11.13 The sequenced jobs (J01–J16) and their execution order

Moved to [build_map_done.md](./build_map_done.md) — completed/historical, kept verbatim for review. Does not dispatch work.

## 12. Crucible — Survival, Combat Lab, and arcade-physics convergence (`PQ-133`)

**Source:** [`design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`](./design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md)
(**updated to v2 on 2026-08-24: 6,875 → 9,299 lines**; §30 is the phase roadmap, §31 the 69 provisional
packets `CRU-000`–`CRU-068`, Appendix A the schemas, Appendix E the owner map, Appendix F the open
product decisions with recommendations).

**What that file IS, in its own words (§32.1): a DURABLE DESIGN PROPOSAL / EXPERIMENT BANK — NOT
ADMITTED WORK.** It "does not establish queue order, status, implementation, or acceptance", and must
not be called active scope unless the owner admits the whole program. Its labels separate **CORE**
(durable decision) from **FIRST SLICE** (narrow candidate, still needs admission) from **EXPERIMENT**
/ **CONTENT BANK** / **FAR FUTURE**. Its own agent contract warns: *"Never turn this file into a
giant checklist whose unchecked boxes imply a blocked game."* Read it as a quarry; admit work through
a queue ID and an active packet, as `PQ-133` was.

### 12.0 The v2 delta — a CORE CORRECTION that reorders the program

The entire v2 addition is **one new section, §21A "Flight, formation, and enemy-motion convergence"**
(2,095 lines, 30 subsections). Everything else is unchanged. It carries a **CORE CORRECTION dated
2026-08-23**, and it is directional for anything touching flight or enemy motion:

> Crucible cannot deliver the intended experience if the ships themselves remain mushy, indecisive,
> or visually incoherent. Survival is a forcing function for combat density, and **density magnifies
> every flaw in flight control and enemy movement.** The movement layer therefore becomes a
> **prerequisite shared program, not post-launch Survival polish.**

Its one-line target: **"Every ship should look like it meant to do what it just did."** Not faster —
*intentional*. Speed without intention is pinball noise.

The dependency order it asserts:

```text
Motion Lab → player handling convergence → hull-relative enemy actuator
→ virtual formation + attack choreography → cheap coherent swarm motion
→ ten-wave Survival shell → attack/modifier expansion → arena and boss breadth
```

**This reframes what "PQ-133 done" means.** The leaves below shipped their SYSTEMS and are correctly
stamped; §21A adds a gate they were never measured against — *"no Survival vertical slice should be
called representative until the motion-convergence gate passes."* That is a NEW bar from a newer
document, not a defect in the delivered work, and it is not admitted work until the owner says so.

Its named first slice (§21A.28) is deliberately small and is the obvious admission candidate: player
Hitch and Wasp selectable; ONE four-ship wing that enters in wedge, widens to fan, sends two ships
down distinct crossing lanes while two screen, extends without instant turn-back, and reforms through
merge corridors; ONE twelve-body fodder cohort that reads as a river and stays physically throwable;
ONE heavy brawler with a pressure corridor and a clean breakaway. Proof is deterministic scenarios
M1/M4/M6/M8/M11 plus capture at the shipping camera — with **no new direct position/velocity writes,
no campaign AI fork, and no performance regression hidden by cutting entity count or quality.**

§21A explicitly does not prescribe permanent tuning values: every number in it is a candidate
experiment band until an admitted packet promotes it.
**Admitted 2026-08-21 as `PQ-133`.** Packet: [`design/program/roadmap/active/PQ-133.md`](./design/program/roadmap/active/PQ-133.md).
Dispatch: `node scripts/program-dispatch.mjs --id PQ-133`.

The thesis in one line: *Crucible discovers what is fun. Adventure makes it matter. Combat Lab explains why
it worked or failed.* The central move is a **shared attack algebra** (emitter · trajectory · propagation ·
payload · trigger · constraint) so one Pulse Laser can become a bank shot, a chain primer, a returning
cutter, or a clean gun without a bespoke code path for each.

**Binding architecture rulings from the plan (§27), restated because every leaf below depends on them:**

- `state.mode` stays `'flight'`. Survival is an **orthogonal** `state.run` envelope (`kind:'survival'`),
  never a mode value that stops flight systems updating.
- A run starts from **fresh ephemeral state through the real New Game path**. It never mutates the live
  Adventure save, shares campaign credits, shares inventory by reference, or writes run modifiers into
  persistent fittings. `A.8` campaign-contamination test is mandatory from Phase 2 onward.
- Phases are **explicit and validated** (`inactive → loadout → arena_intro → wave_intro → active →
  cleanup → draft → … → refit → … → victory | ended`). No UI infers phase from whether enemies exist.
- The wave planner is a **pure function** (`planWave({seed, arenaId, wave, act, difficulty, mutators,
  buildSummary})` → intent). Runtime owners materialize it through `spawnBudget` and the canonical
  materializer. No cap bypass; `DEFAULT_MAX = 24`, `HARD_MAX = 40` are re-audited, not overridden.
- Attack modifiers compile into an **immutable `AttackSpec`** with lineage (root/descendant, generation,
  visited targets) and a **shared proc budget**. Containment invariants (§9.7) are tests, not prose.
- Crucible **consumes** Physics-as-Spectacle (contact provenance, kill receipts, priority-aware VFX) and
  never closes that program's gates by using its code.
- One game path: Browser, Electron, Sandbox, Crucible and the deterministic Lab share registry, input,
  data, physics, combat, rendering, settings, assets. Wrappers select setup and rules; they never fork.

### 12.1 Phases → dispatch leaves

> **Status stamped 2026-08-23.** This table previously carried no status at all, so a reader could
> not tell a finished phase from an unstarted one — the truth lived only in
> `design/program/roadmap/program-queue.json`. Every leaf now says where it stands, in the canonical
> document, with the commit.
>
> **Phases 0-12 are complete as engineering.** Phase 13 is not engineering: the plan's own text calls
> it "a separate product decision with infrastructure, security, moderation, determinism, and cost
> implications", so it is the owner's call rather than outstanding work.
>
> Where a leaf says SYSTEMS DONE, what remains is art or a screen — boss hulls, prop meshes, VFX —
> and is named on the row. Those need the GPU lane and, in several cases, owner acceptance; nothing
> self-promotes.


| Leaf | Plan phase | Player outcome | Exit gate (verbatim from §30) | `CRU` packets absorbed |
|---|---|---|---|---|
| `PQ-133.00` **[DONE]** | **0 · Assimilation + seam audit** | Plan registered; seam map names exact owners, files, reusable code, missing seams, tests, perf limits, first packet | Seam map exists and the first two packets are shaped against live code | CRU-000, CRU-001 |
| `PQ-133.01` **[DONE]** | **1 · Combat Lab extension** | Launch a real-path combat setup with chosen hull, weapons, physics loadout, enemy package, seed, arena prototype; same-seed restart; speed/debug toggles; telemetry overlay; build-code v0; one deterministic physics-swarm scenario | Same build+seed launches repeatedly in Browser and Electron and the deterministic scenario agrees | CRU-002 … CRU-008 |
| `PQ-133.02` **[DONE]** | **2 · Ten-wave shell** | Complete replayable ten-wave run with existing weapons/enemies/fields/pickups and one greybox arena: run state, phases, pure wave planner, spawning through canonical materialization, run XP + Arena Credits, physical credit pickup, three-choice draft, wave-10 boss from an existing enemy, results screen, build code, contamination checks | Start → play → die or win → results → restart same seed; Adventure state unchanged | CRU-009 … CRU-018 |
| `PQ-133.03` **[DONE]** | **3 · AttackSpec compiler + lineage** | Existing projectile weapons accept bounded deterministic topology modifiers: trait schema, compiler, lineage, shared proc budget, child inheritance, multishot/pierce/split, owner-seam metrics, Lab inspector | Pulse Laser + one projectile weapon produce ≥3 distinct legal compiled forms with repeatable metrics and bounded descendants | CRU-019 … CRU-024 |
| `PQ-133.04` **[DONE]** | **4 · Surface receipt + Ricochet Foundry slice** | Authoritative surface-contact receipt (point/normal/material/velocity), material compatibility, reflection through physics, Bank Shot + Smart Bank, greybox Foundry with moving shutters and a loose reflective plate, ten Foundry recipes, Mirrorjaw Foreman, causal VFX/audio, route + perf acceptance | Same Pulse Laser supports direct, bank, and smart-bank; all three finish the ten-wave block; bounce cause is visible and deterministic | CRU-025 … CRU-031 |
| `PQ-133.05` **[SYSTEMS DONE]** | **5 · Chain, payload, bridge modifiers** | Deterministic chain selection; Ion Payload, Relay Arc, Gravity Tag, Incendiary Payload; bridge traits (bounce→chain, tether→payload, status→propagation); causal score tags; draft compatibility/exclusions; results causal distribution | ≥3 mature build identities viable in Foundry with measurably different causal distributions | CRU-032 … CRU-038 |
| `PQ-133.06` **[DONE incl. 06b]** | **6 · Orbit fields, Cryo Lock, reactions** | Bounded orbiting field nodes; Cryo Lock (momentum preserved, control authority reduced); Thermal Shock; Cryo Gyro Rack prototype; active-positioning requirement for orbit efficacy; grammar, Lab controls, perf metrics, one thermal pocket | Orbit builds require movement; Cryo preserves translational momentum; Thermal Shock is repeatable and understandable | CRU-039 … CRU-042 |
| `PQ-133.07` **[SYSTEMS DONE (e948066f)]** | **7 · Thirty-wave Foundry** | Acts I–III, wave-20 system event, wave-30 boss variant, refit cadence, build evolutions, difficulty composition, score/style, results history, unlock scaffolding, swarm AI tiering + spawn-scale profile, run HUD, refit/draft polish | Early identity, mid-run resistance, late spectacle, complete victory arc without HP inflation | CRU-043, CRU-049 … CRU-054 |
| `PQ-133.08` **[SYSTEMS DONE (de5f17cb)]** | **8 · Lagrange Crucible + Cinder Sluice** | Gravity arena and current arena with their controllers, bosses, recipes, props; existing builds cross-tested | The strongest Foundry build is not automatically strongest in both, but stays intelligibly viable | CRU-044, CRU-045 |
| `PQ-133.09` **[SYSTEMS DONE (b49d65a6)]** | **9 · Cryo Drift + Storm Lattice** | Thermal quadrants, coolant/heat props, conductivity graph, movable relays, Massline conduction, two bosses, act coverage, cross-arena tuning | All five arenas express distinct laws with the same combat owners and data grammar | CRU-046, CRU-047, CRU-048 |
| `PQ-133.10` **[DONE]** | **10 · Meta, challenges, endless** | Unlock catalog (possibility, not stats), local records, mutators, boss circuit, deterministic endless after wave 30, one-hull/one-weapon trials, run history, versioned build codes | Reasons to replay beyond score; a fresh account stays competitively viable | CRU-055, CRU-056, CRU-057 |
| `PQ-133.11` **[DONE (bca4c34e)]** | **11 · Adventure migration** | Proven traits mapped to modules/Rigs/variants/tech/salvage; arena laws as authored sites; enemy doctrines from wave roles; acquisition arcs; law/collateral | Adventure combat shows the same combinatorial grammar without run economy or random drafts | CRU-058, CRU-059, CRU-060 |
| `PQ-133.12` **[DONE (f4814182)]** | **12 · Content factory** | Schemas, validators, compatibility lint, preview tools, wave-recipe simulator, arena module library, localization-ready text, balance dashboards | A new legal modifier or wave recipe can be authored, validated, previewed and tested without editing the combat kernel | CRU-061, CRU-062 |
| `PQ-133.13` **[NOT ENGINEERING]** | **13 · Community / network** | **Research only** — daily seeds, ghosts, leaderboards, co-op feasibility | Explicitly *not implied* by local completion; separate product decision | CRU-063 … CRU-068 |

Order is `.00 → .01 → .02 → .03 → .04` strictly (the plan's §32.7 admission order), then `.05/.06` may
run in parallel on disjoint files, `.07` after both, `.08/.09` in parallel after `.07`, `.10`–`.12`
after `.09`. `.13` is deferred research and never blocks anything.

### 12.2 Product decisions adopted (Appendix F recommendations, binding until the owner overrides)

Umbrella **Crucible**, scored ruleset **Survival**, experiment surface **Combat Lab**, existing surface
**Sandbox**. Direct main-menu entry, fiction later. Manual aim default; auto-fire only as accessibility.
Full pause during drafts. Hull changes only at ten-wave refits. Physical collisions and arena hazards hurt
enemies; ordinary enemy projectile friendly fire stays limited. No mid-run save in the first slices.
Seeded offers and waves, deterministic build-code reproduction, a draftless control ruleset. Meta
progression unlocks possibility, never permanent stats. Victory at wave 30; endless optional. No campaign
material reward in v1. Five authored arenas before any generation. No architectural distortion for
hypothetical network play.

### 12.3 Anti-patterns that fail a leaf on sight (§33)

Generic bullet-heaven drift (passive auras that clear screens), a second-game architecture (parallel
combat registry, alternate physics), modifier soup (stat-only drafts), proc explosion (unbounded
descendants), visual soup, HP inflation as difficulty, hard-counter director, physics as garnish (no
causal participation) or as chaos (unreadable), campaign contamination, debug divergence (Lab path that
is not the game path), harness treadmill (validation machinery instead of a better playable game),
content-before-foundation, boss immunity theater.

## 13. Arcade VFX foundation (`PQ-134`)

The orphan branch `feat/arcade-vfx-foundation` (one commit, `20216c9c`) was pulled to master as
`ce340812`: [`src/render/combat/arcadeStructuralFx.js`](./src/render/combat/arcadeStructuralFx.js) — a
pooled, instanced structural-FX primitive set (**blades** 128, **broken arcs** 48, **shards** 64) with
priority-aware slot admission, no camera-facing sprites, no radial alpha fields, no full shock rings. It
had **zero consumers** when this was written and no longer does (see the leaf table). `PQ-134`
wires it and becomes the VFX half of Crucible's causal grammar
(`CRU-051`): family / generation / material / status must read under saturation.

| Leaf | Outcome | Done when |
|---|---|---|
| `PQ-134.00` | File on master, lint/import green | **DONE `ce340812`** |
| `PQ-134.01` | `ArcadeStructuralFx` mounted in the presentation adapter behind `cueArbitration`; kill, hard-collision, and bank-shot cues request blades/arcs/shards with priority; capacity never grows on the present beat | **DONE** — mounted in `src/render/vfx.js`, admitted through `admitStructuralFxCue`, and driven by four live cue paths (`entity:killed`, `combat:collisionConsequence`, the bank-shot cue, and `presentation:vfxCue`). 16 tests green across `arcade-structural-fx-mount` and `vfx-arcade-structural-fx`, with a live probe wired as `check:arcade-structural-fx` |
| `PQ-134.02` **[DONE - accepted by capture]** | Causal VFX/audio grammar (`CRU-051`): direct, bank, chain, collision, terrain, tether, field, reaction each own a readable family/colour/shape; hero events survive saturation; reduced-motion and forced-colors variants | Four-way capture (Crucible wave 8, Foundry boss, Adventure fight, reduced-motion) reviewed at play size |

**2026-08-23 — the grammar is now actually fed (`357eb134`).** `.02` was accepted by capture, but
three of the eight families could not fire in ordinary play: `projectile:hit` carried no causal
information, so `chain`, `field` and `reaction` only appeared when a receipt already happened to
carry the flag. The hit path now stamps `causalTags` using the SAME tokens
`causalKindsFromAttackSpec` produces — one frozen array per spec in a WeakMap, so a hit allocates
nothing — plus `hops`/`chain`, `hasBounced`, and `family` for field and reaction payloads. Real
emitted payloads were fed to `classifyCausalVfxFamily` and route to `chain`, `field` and `reaction`.
Both 47-A goldens hold: this adds information to an event and does not move the simulation.

### 13.1 Effect quality improvements — owner-directed, 2026-09-09

The purpose of `PQ-190.01` is a better visual language for physical play, not preservation of the
current implementation. Its eight classes are construction routes, not eight effects to stamp onto
everything. The [technique standard](./docs/visual-assets/VFX_TECHNIQUE_STANDARD.md) owns the recipes
once. This is the execution plan for improving them; it does not reopen the accepted `.00` slice.

**Order: causal clarity → material character → richer atmosphere.** Select one bounded row through
its existing packet owner, preserve current dirty work, and carry that row's outcome into the exact
queue leaf before mutation. Already implemented work is reviewed/adopted, never rebuilt in parallel.
No new post pipeline, palette law, HUD redesign or fleet remaster is implied.

| Work / existing packet owner | Why it would be more fun and beautiful | Concrete implementation and owned seam | Done condition / deliberate spend |
|---|---|---|---|
| **One stream, a long bright flight snake** — `PQ-190` / live visual-world cleanup | The owner wants long, bright snake-like history as a distinctive signature, but says the individually attractive jet and history feel disconnected. Unify that handoff first; fast nimble turns should draw one satisfying stream. Length, brightness and crossing the sky are intentional. | Inspect current `src/render/thruster/recipes/plasmaStreamRecipe.js`, `src/render/thruster/ribbon/plasmaRibbons.js`, `src/render/thruster/ribbon/contrailTrail.js`, `src/render/thruster/ribbon/driveEnvelope.js` and `src/render/thruster/systems/plasmaStream.js`. Define a shared visual handoff from jet to history: matching cross-section/width, continuous colour-temperature and radiance progression, compatible flow speed and fold/strand structure, with a short complementary overlap rather than two additive full-strength heads. Keep separate objects and true world-space history samples: blend appearance, never fabricate a path or drag old samples with the nozzle. Then improve tight bends and self-crossing readability. | Seed 190001, coast/burn/boost/brake, S-turn and figure-eight: no gap, width step, brightness spike or contradictory flow at the seam; the generous bright trace matches the flown curve and old bends remain after rotation. At rest the jet may flow but no false full-length history appears. Keep actionable bodies legible through local structure/depth, not global trail dimming or shortening. Spend shared appearance parameters and bounded interpolation/art work, never weaker force, a dimmer/shorter signature or lower quality. |
| **A hit points to the body it moves** — `PQ-023` with the existing `PQ-134` causal family owner | The .00 combat critique could identify engagement but not who fired or was struck. Better contact provenance makes ricochets, shoves and chain reactions satisfying to learn instead of anonymous fireworks. | Keep `src/render/vfx.js` event provenance and `src/render/combat/arcadeStructuralFx.js` admission. Author a brief contact-facing compression shape, material spall and a separating aftermath around the actual struck surface; let the body's real displacement finish the event. Use existing `src/render/vfxProfiles.js` and weapon presenters to distinguish launch, travel and contact within the heavy-impact class. No invented force direction from an unsigned axis, no duplicate all-purpose ring. | Seed 4242 `shove_light`, then a fixed-seed bank/chain case at combat density: a reviewer follows source → contact → displaced body from chronological shipping-camera stills without diagnostic labels. Repeat with reduced motion/flash and retain that information. Spend contrast and a short event-priority window, not more screen shake or particles hiding the motion. |
| **Shield, field and work signal have different silhouettes** — `PQ-023`, guided by `PQ-190` | All route through “shield response” today, but a protective contact, a volume that changes motion and a machine's work lamp promise different player actions. One glowing-bubble recipe would erase those decisions. | Keep the eight matrix classes but use three explicit subrecipes: surface contact follows the hull and decays; field extent follows its actual influence geometry and exhibits affected trajectories; a work signal belongs to an aperture/tool. Use `src/render/weapons/shieldContacts.js`, shield materials, `src/render/momentumSinkVfx.js` and the existing field/job controllers. Adapt each live owner rather than building a universal aura renderer. | In a fixed-seed frame containing a shielded body, a field and a working machine, the reviewer distinguishes protection, influence and work without relying on hue alone; endpoints/target bodies remain visible. Shield-00/03/07 supplies the approved panel-recovery reference, not approval for every field. Spend authored local structure and separate envelopes; keep the protected body legible throughout. |
| **Aftermath tells you what was struck** — `PQ-023`, then regional work under `PQ-153` | Metal, ice and dusty rock should leave different useful-looking traces. Cooling fragments and dispersing matter make violence feel physical and leave space for the next action. | First inspect the pending migration in `src/render/combat/instancedSpritePool.js` and any live `src/render/vfx/quarksSystem.js` consumer; adopt working pieces. Use the existing material/provenance hooks for opaque tumbling spall, colder brittle chips and lobed dusty dispersal. Prototype authored/simulated texture detail on shaped surfaces or volumes where it improves the result. Keep material identity through LOD and reuse current sector structure profiles instead of recolouring the entire sky. | Show metal/ice/rock impacts side by side at the shipping scale on a fixed seed: each material is distinguishable by breakup/motion/form, contact stays visible, smoke does not expose a rotating square or blanket adjacent targets. .00 has no accepted smoke study: this row must earn its own visual pass. Spend varied art and bounded residency, paid for through pooling/batching; no blanket quality reduction. |

For each row, take the smallest before/after witness that can reveal its cost; no new top frame-time
bucket. Record the intended improvement and what it spent. A method name, green inventory scan or
procedural sophistication is not the visual outcome. Fresh `.01` observations may refine the row's
first candidate; the .00 images provide references and limitations, not a claim that old defects are
still live.

**Concrete field starting point:** `field_skim` exists in `src/data/fields.js` but the inspected live
VFX field branches have no dedicated skim geometry. Start the shield/field differentiation row here:
surface the existing influence as a directional sheet matching its actual support, with entry/exit
edges and affected motion readable; do not reuse a spherical well fallback. The live `well`, `seed`,
`anchor_snare` and `field_cone` remain separate recipes. This is a presentation gap, not authority to
change field forces, ranges or counterplay.

**Concrete jet/history starting point:** the live owner constructs `ContrailTrail` with empty
options, while the plume reads its own ribbon recipe. The older recipe's `snake` layer is hidden;
tuning it will not repair the visible history. Start in `PlasmaStream` with one small appearance
handoff for the plume exit and the youngest history segment: radius/width, radiance progression and
structural motif. Read the actual history tangent through `headAftDirection()` when choosing the
local join orientation. Never rotate old world samples to the current exhaust axis. If needed, apply
a head-local factor that is stored at birth and ages out of the short handoff; changing a global
history uniform with today's throttle would repaint yesterday's path. Compare before/after at the
seam, including sideways drift: match visual continuity, not two arbitrary numeric radiance values.
A jet without two history samples at rest is legitimate; do not fabricate history merely to make
the effects appear together. Preserve the current trail duration and bright tail as explicit controls.

## 13A. Flight and movement convergence (`PQ-135`) — ADMITTED 2026-08-24

**Source:** [`design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`](./design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md)
§21A, the v2 addition. **Admitted here by the owner on 2026-08-24** after playtest.

The source file calls itself an experiment bank and asks not to be treated as a checklist. That
caution is about not turning 9,299 lines of brainstorm into 9,299 blocked boxes — it is **not** a
reason to leave real work out of the plans. The concrete, owner-confirmed slices are admitted below
with stable IDs. Everything NOT listed here stays a quarry.

### Why it is admitted: the owner played it

> "it's not possible to fly in this game in a way that's nimble, every ship is heavy like underwater
> or something and the auto-target flight system just kind of lazily inches along the line like a
> Waymo in a school-zone which isn't useful in combat either"

§21A independently reaches the same verdict — ships that are *"mushy, indecisive"* — and sets the
target: **"Every ship should look like it meant to do what it just did."** Not faster. *Intentional.*
Speed without intention is pinball noise.

§21A's dependency order, which this section adopts:

```text
Motion Lab → player handling convergence → hull-relative enemy actuator
→ virtual formation + attack choreography → cheap coherent swarm motion
```

### The leaves

| Leaf | Outcome | Done when |
|---|---|---|
| **`PQ-135.00`** **[DONE]** | **The draw-to-fly speed governor stops crawling.** MEASURED DEFECT: ships cruise at **112-133 WU/s**; `PATH_CORNER_FLOOR_SPEED` is **14**, about one eighth. `worstCurvatureAhead` takes the MAX curvature over the lookahead, and a hand stroke sampled every 8 screen px reads its own jitter as a hairpin — so a gentle curve pins the hull to the floor for the whole stroke. | A drawn stroke is flown at a speed a player would choose, AND still tracked. **The existing tracking test measures cross-track and never measures SPEED — it would pass at 1 WU/s.** Add the speed bar to it. |
| **`PQ-135.01`** **[DONE]** | **Player flight feel: crisp low-speed response, honest momentum, strong brake/yaw settle, and a hull you can FEEL the difference between.** (§21A.5) | A repeatable slalom and reversal course, Hitch vs Wasp visibly different, no loss of honest momentum. |
| **`PQ-135.02`** **[DONE]** | Motion Lab: deterministic movement scenarios and motion telemetry, so feel is measured rather than argued. (§21A.23-.25) | Scenarios M1, M4, M6, M8, M11 run deterministically and produce comparable numbers. |
| **`PQ-135.03`** **[DONE]** | Hull-relative enemy capability envelopes and desired-state trajectory control. (§21A.6-.7) | Enemy motion derives from the hull it is flying, not a shared constant. |
| **`PQ-135.04`** **[DONE]** | **One four-ship wing with real choreography**: enters in wedge, widens to fan, two ships take distinct crossing lanes while two screen, attackers extend without instant turn-back, and the wing reforms through merge corridors. (§21A.9-.13) | A player impulse can break the sequence, and disrupted members do not instantly snap back. |
| **`PQ-135.05`** **[DONE]** | **One twelve-body fodder cohort that reads as a river or crescent and stays physically throwable.** (§21A.14) | It flows as a shoal rather than a dozen independent seekers jittering at the same point. |

### Binding constraints (§21A.28, §21A.30)

- **No new direct position/velocity writes.** Motion comes through the canonical physical control
  path or it does not ship.
- **No campaign AI fork.** One game path.
- **No performance regression hidden by cutting entity count or quality.**
- Proof is normal-speed capture at the SHIPPING camera plus deterministic scenarios — not a clip
  recorded at a flattering angle.
- Every tuning number in §21A is a candidate experiment band, not law, until a leaf promotes it.

### Sequencing note

`PQ-135.00` is small, contained, and immediately felt — do it first. `.01` and `.02` are the real
"nimble" work and belong together, because feel that is not measured is feel that regresses.
`.03`-`.05` are the enemy half and depend on `.01` landing first, per §21A's own order.

## 13B. Field the authored assets we already own (`PQ-136`) — ADMITTED 2026-08-24

**Owner, 2026-08-24, after playtest:** *"if there was ever restarted or abandoned graphics work,
there should not be abandoned and unused files like that... we already have a dearth of variety in
this game for most things so we need to have everything utilized if we can."*

### The measurement

`check:asset-reachability` reports **276 referenced runtime assets** routed correctly — the runtime
wiring is healthy. The problem is not broken routing, it is **authored work that was never routed at
all.** Counted 2026-08-24:

| Pack | Models | Referenced by `src/` | Unused |
|---|---|---|---|
| `assets/incubator/wreck_aftermath_pack` | 44 | **0** | **44 — the entire pack** |
| `assets/incubator/everyday_space_kit` | 62 | 32 | 30 |
| `assets/incubator/npc_activity_pack` | 15 | 9 | 6 |

**Eighty authored models the player never sees.** The wreck pack is hero wreck hulls plus component
and fragment kits built to an authored-fracture grammar (truss versus plated); the space kit is
infrastructure props; the activity pack is occupational craft.

**Do not measure this with a filename grep.** A first pass reported "852 of 1,412 models unused" and
was WRONG — models resolve through manifests and LOD families, not literal paths, so most of those
were LODs, source files, and third-party kits. `check:asset-reachability` is the instrument.

### The leaves

| Leaf | Outcome | Done when |
|---|---|---|
| **`PQ-136.00`** **[DONE]** | **The wreck pack reaches the player.** 44 models, currently zero. Wrecks are the cheapest variety in the game — they need no AI, no balance pass, and no new systems; they need routing and placement. | A player flying an ordinary sector encounters authored wreck hulls and fragments that are not the same three shapes. |
| **`PQ-136.01`** **[DONE]** | The 30 unused `everyday_space_kit` props are placed where infrastructure belongs — stations, lanes, work sites. | Sectors read as inhabited rather than decorated with the same prop repeated. |
| **`PQ-136.02`** **[DONE — 4 fielded, 3 held for still review]** | The 6 unused `npc_activity_pack` craft become fielded NPCs with a job, reusing the existing traffic and jobs systems. | New occupational craft appear in traffic without a new AI path. |
| **`PQ-136.03`** **[DONE]** | **Half-finished or superseded hulls are triaged, not abandoned.** For each: field it, alter it into a variant (a different faction, a damaged version, a wreck), or record why it genuinely cannot be used. Deleting is the last option, not the first. | Every authored hull has a disposition on the record. |

### Rules

- **Reuse before authoring.** No new model is commissioned for a slot an existing unused asset can
  fill; that is the whole point of this plan.
- Runtime visual-continuity defects (ships publishing partially, sky/debris jumping across
  floating-origin rebases) are NOT this plan: they belong to
  [`design/program/FLEET_VISUAL_INTEGRITY.md`](./design/program/FLEET_VISUAL_INTEGRITY.md)
  (landed with PR #102, 2026-08-24), which defers model production to `PQ-050` and
  orphan/variant fielding back here.
- A variant (repaint, damage pass, faction kit, wreck conversion) counts as fielding.
- The asset pipeline contract and reachability checks stay green — this adds routing, not exceptions.
- **Preserve valuable future work** (`PLAN_REGISTRY.md` rule 6): mark `FUTURE` or `PARTIAL` rather
  than deleting because no implementation exists yet.

## 13C. The box of dangerous toys — feel and consequence convergence (`PQ-137` … `PQ-145`) — ADMITTED 2026-09-03

**Source:** [`design/VISION.md`](./design/VISION.md) Part II (the owner's full statement of what
the game is supposed to feel like, 2026-09-03) and
[`design/FEEL_CONTRACT.md`](./design/FEEL_CONTRACT.md) (the same-day audit of the live route plus
the measurable bars). **Admitted by the owner on 2026-09-03** after playtest.

### Why it is admitted: the owner played it, again

> "the gameplay is wonky, it's not fun to play, the physics weapons blast things really slow and
> cumbersome, when I blast enemies away it makes stupid vfx and just barely does anything, I don't
> feel like I'm in control of anything that's going on in this game really … agents always just
> keep expanding the turd instead of fixing the turd"

The audit agreed with the owner's own guess ("a bad configuration or something … not enough
attention on the guts of the physics"). **Seven rules, each added by a different agent for a locally
sane reason, stacked into "nothing I do sticks"**: the default flight mode braked every speed the
pilot earned (pressing *forward* after a slingshot slowed the ship); the physics layer deleted every
shove that pushed an NPC past its own top speed; terrain was defined as never taking the helm; the
per-contact momentum bound made a 150 WU/s rock slam a 40 WU/s scratch; thrust authority against
fighting speed against screen depth gave the ship a 7–20-screen turn radius while it crossed the
screen in under a second; the starter gun's shove was 0.5 momentum and the one real shove weapon was
tech-gated; and the tests pinned all of it green. Full table: `FEEL_CONTRACT.md` §A.

**Three of the seven were fixed the same day** (earned speed kept in the default mode; given
momentum survives the NPC cap; hard slams take the helm). The rest, and everything the vision asks
of the world around the physics, is this program.

### The door

**"The game isn't fun / combat and flight feel wonky / agents keep adding content instead of fixing
the feel"** → this section → `design/FEEL_CONTRACT.md` → `node scripts/program-dispatch.mjs --id
PQ-137`. Do not answer that complaint with more enemies, more ships, more stations, or camera
shake. Answer it with a bar from the contract and the number that moved.

### The rule that makes this program different

Every packet below closes on **numbers in units an agent cannot tune away** — screen depths,
seconds, hull lengths, fraction of hull lost, fraction of speed kept — measured on the default route
at the shipping camera, before and after. "It follows the path" is not a number; PQ-135.00's own
done-when admits its tracking test never measured speed, and that is the pattern this program ends.
A test that pins behaviour `VISION.md` forbids is a defect: rewrite it with the vision's sentence in
the assertion message (`FEEL_CONTRACT.md` §D).

### Order

```text
PQ-137 the guts (feel contract)  ──┬─> PQ-139 impacts answer (weight you hear and feel)
                                   ├─> PQ-138 the world reacts (three missing listeners first)
                                   └─> PQ-140 roster as physical problems
PQ-138 + PQ-139 + PQ-140 ─────────────> PQ-141 THE 60-SECOND PROOF (program acceptance gate)
second wave, in parallel after PQ-137: PQ-142 progression + my ship · PQ-143 places + ordinary life
                                        PQ-144 density layers + perf guard · PQ-145 industry → authorship
```

### The packets

| Packet | Outcome | The bar it moves |
|---|---|---|
| **`PQ-137`** **The guts** — [`active/PQ-137.md`](./design/program/roadmap/active/PQ-137.md) | Two speeds in one default mode; shoves throw; hitstun is one law for guns, throws, flings and collisions; terrain is lethal; the rope is a rope; draw-to-fly rips; chains go off; every bar measured on the route. `.00`–`.02` **[DONE 2026-09-03]**. | B1–B8, B11 |
| **`PQ-138`** **The world reacts** — [`active/PQ-138.md`](./design/program/roadmap/active/PQ-138.md) | The patrol chooses stay-or-chase; spilled cargo attracts NPCs; civilians flee gunfire; wrecks drift and tumble; failure mutates the mission; one site keeps evidence. Audit: all nine consequence beats are registered systems already — three events have zero listeners. Connection, not construction. | B10 |
| **`PQ-139`** **Impacts answer** — [`active/PQ-139.md`](./design/program/roadmap/active/PQ-139.md) | Collisions get hitstop and trauma by momentum; collision audio by mass; the Massline release snaps; deaths sized to mass; impulse hits are cones not spheres; tumbling trails corkscrew; wells bend space. Audit: the feel layer never subscribed to collisions; audio ignores the momentum physics hands it; release is hard-coded to never snap. | B9 |
| **`PQ-140`** **Roster as physical problems** — [`active/PQ-140.md`](./design/program/roadmap/active/PQ-140.md) | Interceptor = positioning problem; heavy = moving terrain; four specialists that each break a plan; fodder is ammunition. | B5/B6/B11 in the Crucible |
| **`PQ-141`** **The 60-second proof** — [`active/PQ-141.md`](./design/program/roadmap/active/PQ-141.md) | The VISION sequence happens naturally and repeatedly at the reference site: deterministic scenario (≥ 9 of 11 beats) + headed capture + "every actor has a sentence." **The acceptance gate for the whole program.** | B12 |
| `PQ-142` Progression = "what can I do now" + my ship — [`active/PQ-142.md`](./design/program/roadmap/active/PQ-142.md) | Capabilities as verbs (tow class, slam survival, line load, field deploy); scars, repairs, recognition by hull. | — |
| `PQ-143` Places with a way of life + ordinary life — [`active/PQ-143.md`](./design/program/roadmap/active/PQ-143.md) | Helios/Ceres recognisable from 30 s of activity; routine work visible between incidents; six texture one-offs. | — |
| `PQ-144` Density layers + perf guard — [`active/PQ-144.md`](./design/program/roadmap/active/PQ-144.md) | Foreground real / midground coherent / background implied, as a budget table; runtime witness before and after every packet here. | §8 |
| `PQ-145` Industry becomes authorship — [`active/PQ-145.md`](./design/program/roadmap/active/PQ-145.md) | A player-built depot creates persistent NPC traffic and the crime that follows it. | — |

### Binding constraints (in addition to §13A's)

- **Never add drag.** Control comes from thrust authority, assist that lets go above the cap, and
  camera — never from velocity decay.
- **Never clamp given momentum.** A speed cap bounds a body's own drive; shoves, throws, flings and
  contacts survive every cap.
- **NPCs obey the player's physics.** No gyros, no transform writes, no instant counter-thrust.
- **Do not scale knockback with victim HP.** It would reintroduce the HP grind by the back door.
- **Make existing features collide before adding one.** `PQ-138` is three listeners, not three
  systems.
- Proof is a normal-speed capture at the shipping camera plus the deterministic scenario — never a
  clip at a flattering angle, never "the check is green."

### Outside opinions, graded (2026-09-03)

Gemini 3.8 Flash (`agy`) and Kimi K3 (`opencode`, clinepass) were asked the flight and combat
questions with the live numbers. They agreed with the audit on the load-bearing points — delete the
NPC velocity clamp, never add drag, blend the auto-brake to zero above the cap, hitstun as one law of
ΔV/cruise and mass ratio, terrain damage from pre-solve closing speed, corridor-based corner cutting
for draw-to-fly — and each contributed one guard worth keeping: Kimi's *"keep a 1–3 s intent-to-
velocity lag or 'drift when I choose to' stops meaning anything"* and *"do not scale knockback with
HP %"*; Gemini's *"no cheating gyros."* Their numbers are recorded as experiment bands in
`FEEL_CONTRACT.md` §C, not as law.

## 13D. The 3D picture never looks broken (`PQ-193`) — ADMITTED 2026-09-09

**Owner, 2026-09-09:** what models have missing pieces, what does not meet the bar, what sits unused,
why ships sometimes do not render, and the ordered work so the world never looks broken.

Packet: [`PQ-193.md`](./design/program/roadmap/active/PQ-193.md). Dispatch:
`node scripts/program-dispatch.mjs --id PQ-193` and take the first ready leaf (`.00` first). Flyable
remaster stays `PQ-050`. Unused-pack fielding stays `PQ-136` (`.00`–`.03` done). Liner G7 stays
`PQ-049.05`. Hitch stays frozen. Stocktake tables:
[`MODEL_STOCKTAKE_MANIFEST.md`](./design/program/MODEL_STOCKTAKE_MANIFEST.md). Order:
[`MODEL_STOCKTAKE_PLAN.md`](./design/program/MODEL_STOCKTAKE_PLAN.md). Admission / runway / LOD
process (blank lock, box-then-ship, “shave a little”):
[`DYNAMIC_GRAPHICS_INVESTIGATION.md`](./design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md).

### The bar

1. **One game.** A stranger shown Hitch and the nearest NPC does not ask which title each is from.
2. **Complete hulls.** No floating engine, wing, socket, or glow blob. An empty targeting lock is a
   defect, not a style.
3. **Jets are jets.** Reverse/brake is force leaving a nozzle, the same family as the main drive.
4. **A valid file is not accepted art.** Packaged and wired is not Hitch-plus.

Hitch is the floor, not the photocopy. Do not dump Hitch. Do not paste Hitch panels onto NPCs.
Chase camera only. No seats.

### What is true now (live census 2026-09-09)

Three different failures get mixed together. Treat them as three queues, not one "graphics" pile.

| Failure | What the player sees | Cause | First leaf |
|---|---|---|---|
| **Invisible** | Targeting locks empty space | Live slot asked for a body the loader will not admit (no package, or not on the empty-admission allowlist). Hitch and Wasp are the only *required* whole-ships. Pelican, Mule, Drifter, the nine factory hulls, and the liner have packages and maps but are **not required** and are omitted from that allowlist — they do not publish on the player path. | `PQ-193.00` |
| **Falls apart** | Engine / wing / glow hanging in space | Accessory-only file, or modular kit with no meeting hull. Legacy Pelican/Wasp wholeships are blocked forever. Default New Game parks 47-A ships far; the opening kitbash is modular **smuggler / pirate** traffic. The official **recovery tug** is modular Mule when it arrives. | `PQ-193.01` |
| **Wrong game / plastic** | Draws, but toy, unpainted, or another title | Factory player hulls (Hornet→Leviathan) are mapped, not published. They have not closed Hitch-plus. Hornet burned dozens of cycles and still failed (fragmentary form; maps ~30 px/m where the bar wants hundreds). Reverse still reads as two needles even though a volumetric retro path exists. | `PQ-193.01` / `.02`, then `PQ-050` |

Also true:

- All 13 roster ships have dedicated models and render packages. Only Wasp is `accepted`. Mapped
  factory hulls are not published until `PQ-193.00` requires them.
- Code-built cans, drone *entities*, mines, generic wrecks, and mass seeds have **no model file**
  ([`WORLD_VISUAL_CENSUS.md`](./design/program/WORLD_VISUAL_CENSUS.md) A). **Gates have**
  `place_gate_jump_ring.glb`. The hoop is leftover fallback.
- Factory remasters of already-live Ashline / Helios / work boats sit on disk. An earlier remap
  onto them made traffic invisible. **Do not remap** until that exact body is packaged and beats live.
- Corsair still shares the pirate Rig. Arclight has no route. Tanker and inspection cutter are held.
  **Yard tug is live.** Faction kits exist; nothing reads them. Dock / hulk / debris remaster is
  stuck at live presentation. Station fallback is still a fat cylinder plus hoops.
- Distant cheap LODs exist for every player hull and are never switched in. That is Wave F
  below, not Waves A–E. Zoom-out does not swap hulls today. Do not show a box
  or modular kit while a body decodes. Garnish hide at a speck is the ceiling — not a cheaper
  species of ship, not an impostor. See the dynamic-graphics investigation.
- `needed-assets.md` is stale (still calls Hitch / Pelican / Wasp blocked). Do not dispatch from it.

### The order (law)

Do not start Waves C–E until Wave A is true on the Helios / Kessler opening flyby. Do not start a
second buyable-ship remaster until Hornet's chase-camera form closes (`PQ-050.01` residual). Never
commission a new hull for a slot an unused authored body already fills.

### Wave A — opening flyby never broken

| Leaf | Outcome | Done when |
|---|---|---|
| **`PQ-193.00`** | **Every ship the player can lock publishes a packaged complete body.** Put all 13 roster hulls and the liner on the empty-admission allowlist **and require them**. Accessory-only modular junk (smuggler / pirate included) never substitutes. | Default-route targeting never sits on blank space for those hulls. `check:live-whole-ship-admission` and `test/live-ship-visual-package-coverage.test.mjs` cover them. Hitch freeze untouched. |
| **`PQ-193.01`** | **Opening NPCs belong in Hitch's world.** No floating parts on the Helios / Kessler flyby. Includes modular smuggler / pirate and the official 47-A recovery tug. Taste-led ([`VISUAL_WORLD_CLEANUP.md`](./design/program/VISUAL_WORLD_CLEANUP.md)). | A stranger shown Hitch and the nearest NPC says they are the same game. Nothing structural floats. Hitch frozen. |
| **`PQ-193.02`** | **Reverse / brake is a jet.** One honest path from the existing volumetric retro; delete or stop the leftover needle trail. | A stranger can tell, HUD hidden, that the player is braking. Same family as the main drive. No second needle stacked on a failed volume. |

### Wave B — tubes next to ships

Bar and hitch-collision law: [`GRAPHICS_3D_CAMPAIGN.md`](./design/program/GRAPHICS_3D_CAMPAIGN.md).
Upgrade the existing object. Do not invent a parallel prop.

| Leaf | Outcome | Done when |
|---|---|---|
| **`PQ-193.03`** | Lane buoy, lane beacon, and cargo pod look manufactured at chase size. | Same-slot replace. Stranger can name the job at 144 WU. Not a tube-plus-ring next to Hitch. |
| **`PQ-193.04`** | 47-A spindle, rescue capsule, Kessler beacon, Bourse wreck, and the generic TOW can are designed objects. | Code-built family gone from that mission slot. Model first if hitch still owns the 47-A wiring file. |
| **`PQ-193.05`** | Mining-drone entity, jump gate, disc mine, generic wreck, and mass seed stop being primitives. Gate: upgrade live `place_gate_jump_ring.glb`. Drone entity: point at `place_mining_drone.glb` after it looks like hardware. | Default route no longer shows those census-A shapes as cylinder stacks. |

### Wave C — buyable ships to Hitch-plus (already queued)

Do not duplicate these as `PQ-193` leaves. One ship at a time. Chase camera. No cabins.

| Leaf | Ship | Note |
|---|---|---|
| `PQ-050.01` | Hornet | Wired candidate, Hitch-plus unmet. Next: form + texture density, not garnish. |
| `PQ-050.02` | Drifter | After Hornet closes. |
| `PQ-050.03`–`.09` | Ranger, Ironback, Bastion, Atlas, Warden, Colossus, Leviathan | Factory bodies are mapped and packaged; they are not required and not accepted. |
| `PQ-050.10`–`.12` | Pelican, Mule, Wasp | Dedicated packages, not factory clones. Wasp is the only accepted non-Hitch hull; still in the sequence if Hitch still wins on matched stills. |
| `PQ-050.13`–`.22` | Ashline Dart/Lode/Rig, Helios Lark/Cradle/Span, ore barge, tender, salvage cutter, survey pin | Remaster the **live** body. Do not swap the unused factory `*_production_v1` files onto traffic until packaged and better. |

### Wave D — shelf that beats live

Reuse before authoring. A variant counts.

| Leaf | Outcome | Done when |
|---|---|---|
| **`PQ-193.06`** | Corsair raiders no longer share the pirate Rig. | Distinct Corsair body on the live corsair slot. Existing foundry kit if it beats live. |
| **`PQ-193.07`** | Helios Arclight appears as a rare heavy. | Player can find it. Does not steal Span or Atlas. |
| **`PQ-193.08`** | Volatiles tanker and inspection cutter spawn only after they read as ships. | Chase stills pass; then the existing roles roll. Tug is already live. |
| **`PQ-193.09`** | Live Span and Wasp carry faction kits; the three trade-hub overlays on disk are readable. | Faction-distinct stations/traffic without a new faction system. |

### Wave E — places

| Leaf | Outcome | Done when |
|---|---|---|
| **`PQ-193.10`** | Opening dock, dead hulk, and debris chunk pass **in the game**, not only in Blender. | G5–G7 of [`REMASTER_HANDOFF_dock_hulk_debris.md`](./assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md). Military/grit dock variants were never in that slice; name a follow-up rather than pretending they closed. |
| **`PQ-193.11`** | The four Helios lane marks wired 2026-09-09 hold at chase camera. | No cube foot/deck on tally, claim, ash pin, whistle. |
| **`PQ-193.12`** | The fat-cylinder station fallback never appears on the default route. | Every station the player can reach loads its authored body. |

### Wave F — every stand-in and every distant body is the same ship (owner, 2026-09-24) — PLANNED

**Owner, 2026-09-24:** "things will load but they'll just be LOD so it'll load some box — not a
weaker ship or the same ship at fewer polygons, literally a box — and it'll turn into a ship and back
into a box." The same day's fix made the world stop *thrashing* (an entity the player flew away from
and came back to was never re-admitted: no collider, no glass membership, so its mesh was evicted,
rebuilt, and passed through the stand-in again — `test/activity-runtime.test.mjs` "rediscovers a
station and a rock", `npm run probe:frame-solid`). What remains is the stand-in itself: whenever a
body is legitimately still decoding, or a far LOD file is the right choice, what the player sees
must read as that ship. This is a large asset + integration job; cut it into a packet before
dispatch. Law: [`DYNAMIC_GRAPHICS_INVESTIGATION.md`](./design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md)
(no box, no cheaper species, no blank lock).

**Direction (owner, 2026-09-24, same day):** this is a top-down chase camera — a body is either in
the picture or it is not, and on-screen hulls all sit in a narrow size band. Distance LOD swapping
buys little here and costs a second load per hull. So LOD files serve one job: **an instant
stand-in** that is that same ship while the full body loads; once the full body is resident it
stays. Measured the same day (`probe:frame-solid --census`, 8 resident NPC hulls): the whole-ship
LOD swap controller was installed on none of them and zero on-screen LOD swaps occurred — the "box"
the owner saw was the pending-body resolving marker, not a LOD file. F4 below is therefore parked,
not queued.

| Leaf | Outcome | Done when |
|---|---|---|
| **F1 — inventory** | One table of every stand-in the live route can draw: the authored-admission resolving marker (`visualOverrides.js`), `partsLibrary.js` procedural fallbacks, modular-kit identities, station fat-cylinder fallback, and each whole-ship `_lod1`/`_lod2` file (Colossus, Ironback and Leviathan LOD1/LOD2 carry the identical triangle count — ~4–5k against a ~43–57k LOD0 — so LOD2 is not a distinct step). | Each row names where it draws, how often on a 10-minute default flight (`probe:frame-solid` offender log), and whether it reads as its ship at chase and 330 WU zoom-out. |
| **F2 — honest LOD bodies** | Every `_lod1`/`_lod2` file is the same silhouette, paint and damage language as its LOD0 at the distance it serves; equal-count LOD1/LOD2 pairs get a real LOD1 step between. Blender material-truth preflight applies. | Matched stills at the switch distance: a stranger cannot name which is the LOD. Only then may a family join the live LOD allowlist. |
| **F3 — no box while decoding** | The pending-body stand-in is a low-cost version of *that* hull (its own LOD2, preloaded with the sector), not a generic marker or kit. | On a cold New Game, no on-screen hull ever shows a shape that is not its own ship; `probe:frame-solid` regressions/rootSwaps stay 0. |
| **F4 — distance swap (PARKED)** | Only if a measured zoom-out battle shows triangle/draw cost is the bottleneck: LOD1/LOD2 switching for families that closed F2, with hysteresis and no swap on the chase frame's hero band. | Not dispatched without that measurement. Would need: CPU/GPU frame time down, zero visible identity changes, zero blink/root-swap counters. |

### Later — not this packet

- Distant cheap LODs: now Wave F above.
- Massline liner independent G7: `PQ-049.05`.
- Hitch remaster: frozen.
- New hull commissions while a shelf body can fill the slot.

### How agents get this wrong

Wiring an unpackaged factory remaster and calling the blank lock a renderer bug. Starting Corsair
or Arclight while the opening NPC is still a kitbash. Hornet interiors. Lowering texture size to
dodge a Blender crash. Dispatching from `needed-assets.md`. Filename-grep "unused" counts. A glow
blob or a second needle trail. Editing Hitch. Cutting default quality.

## 14. Fleet orchestration law for the 2026-08-21 final run

Who does what, recorded so a later session does not reinvent it.

| Role | Surface | Invocation that works (verified 2026-08-21) |
|---|---|---|
| **Primary implementer** | `cursor-agent` with Grok 4.6 | `cursor-agent -p --force --trust --output-format text --model cursor-grok-4.6-xhigh --workspace <repo> "<packet>"` |
| **Primary implementer (alt)** | `grok` CLI 1.0.4, grok-4.6 | `grok --model grok-4.6 --reasoning-effort xhigh --prompt-file <packet.md> --output-format plain --max-turns N --no-plan --no-memory --disable-web-search --permission-mode auto --cwd <repo>` |
| **Reviewer / auditor** | `codex` npm build (0.149.0 as of 2026-08-23), GPT-5.6 Sol xhigh | `C:\Users\93rob\AppData\Roaming\npm\codex.cmd exec --ignore-user-config -m gpt-5.6-sol -c 'model_reasoning_effort="xhigh"' -s read-only -C <repo> - < packet.md` (the app-managed 0.130 build on PATH is too old; `-s workspace-write` for audits that write one file) |
| **Frontend implementer** | `opencode` 1.18.18, GLM 5.3 Max (Z.ai coding plan) | `opencode run --dir <repo> --model zai-coding-plan/glm-5.3 --variant max --format json "<packet>"` — **GLM has no vision**; never accept its visual output on mechanical checks |
| **Frontend visual reviewer** | `opencode` Kimi K3 xhigh (clinepass); `kimi` CLI k3-256k for small reviews | `opencode run --dir <repo> --model cline-pass/cline-pass/kimi-k3 --variant xhigh --format json "<packet>"`. Slow, silent first token; never kill on stdout silence |
| **Fallback for frontend when every lane is out of quota** | Claude Opus 5 subagents | Agent tool, `model: opus` |
| **Lane orchestrators** | Claude Opus 5 subagents | One per lane; they dispatch the CLIs above, diff-gate, and report. They are given exact file partitions and NO-GO lists |
| **Master orchestrator + final reviewer** | Claude Fable 5 (this session) | Judges every deliverable beside real evidence; never accepts prose as proof |

Rules: usage renews every five hours — a lane that dies on quota is retried a few tasks later, not
abandoned. Implementers and reviewers are always different models. Every lane partitions writes by
**file**; two agents never hold the same file. Every leaf commits immediately after review, scoped to
its exact paths. `npm run check:playable` is run before any "done".

## 15. Finishing SpaceFace — the A-list program (`PQ-146` … `PQ-173`, plus eight reactivated packets; §16–§20 extend it to `PQ-188`) — ADMITTED 2026-09-03

**Source:** the owner's direction of 2026-09-03 (*"plan out the finish of this game … creative,
fun, fast-paced, nuanced, and performant"*), [`design/VISION.md`](./design/VISION.md) Parts I and II,
[`design/FEEL_CONTRACT.md`](./design/FEEL_CONTRACT.md), a same-day read-only audit of audio, meta,
progression, story, and surfaces, and two outside brainstorms graded in §15.9. This section is the
**finish line**: it sequences every existing program into three release milestones with measurable
gates, reactivates the eight deferred packets that already own parts of the finish, and adds only the
plans that no existing source owns. It does not restate §8, §11, §12, §13, §13A–§13C, the depth
program, SPEC3, or the Alpha rows; it points at them.

### 15.0 What "finished" means

A stranger buys it, plays twenty-five hours, and tells someone a story that starts with "so then".
Everything below is in service of that sentence. The three properties the owner named — the world is
**alive enough to surprise**, **solid enough to understand**, **permissive enough to abuse** — are the
three columns of the release gate table in §15.1, and every packet in §15.2 names which column it
moves.

**The pattern-matched verdict.** Measured against the games this one is compared to (Hades, Deep Rock
Galactic, Everspace 2, Rebel Galaxy Outlaw, Sea of Thieves, Just Cause, Rocket League, Noita, Spelunky,
Starsector, Endless Sky, Star Control 2, Highfleet, Hardspace: Shipbreaker, Subnautica), this build has
**more simulation than most of them and less *answer* than any of them**: ~160 sim systems, a wired
job loop, an economy with price pressure, factions with wars and named aces, law with witnesses, a
deterministic replayable sim, five endings with post-ending chains — and impacts that make no sound by
weight, a world that does not flinch at violence, a first hour that never teaches boost, the path
autopilot or the fields and never points at its own playground, a starter gun that cannot shove, and an
ending gated at four percent of the money curve behind an empire-stake paywall. The finish is therefore mostly **surfacing, connecting, and tuning what exists**, plus a short
list of genuinely missing things (audio content, the first ten minutes as a power fantasy, a campaign spine
re-cut around the toys, replay/clips, the wanted loop as a game, six sectors with a way of life). §11.11's through-line
— *"this is a surfacing problem, not a content problem"* — holds for the whole game, not only the UI.

### 15.1 The release gates (the finish line, in numbers)

Three milestones. A milestone is reached when every gate in its row is green on the default route on
a clean checkout, at the shipping camera, with the evidence class named. Gates reuse the existing
instruments (`FEEL_CONTRACT.md` §B bars, `docs/agentic-development/QUALITY_SCORECARD.md` floors,
`design/spec2/08_RELEASE_READINESS.md`, the Motion Lab, the runtime witness, `check:all`).

| Milestone | Alive enough to surprise | Solid enough to understand | Permissive enough to abuse | Evidence |
|---|---|---|---|---|
| **ALPHA — "The Toy Works"** | The 60-second proof (`PQ-141`, bar B12) occurs in ≥ 9 of 11 beats across 5 seeds, printed from the deterministic scenario. The three world-reaction listeners (`PQ-138.00–.02`) fire on the route. | First ten minutes: a new player performs one swing-release, one shove, one grab-and-run without reading a wall (`PQ-163`); playtest completion ≥ 80 % unaided. Every bar B1–B8, B11 measured on the route (`PQ-137.10`). | B2/B3 nimble regime, B4 shove magnitudes, B6 terrain lethality, B9 impacts answer, B11 hitstun law: **met**. Stunt grammar detects ≥ 12 named tricks (`PQ-146`). | Motion Lab numbers, deterministic scenarios, captures, owner verdict on B12 |
| **BETA — "The World Works"** | Six sectors each recognisable from 30 s of unlabeled activity (`PQ-153`); the storyteller sustains the rhythm work→tension→violence→aftermath→quiet over a 90-minute unaided session (`PQ-149`); named aces hunt the player with counter-loadouts (`PQ-150`); the wanted loop has four tiers with a physical escape at each (`PQ-151`). | Campaign spine with an ending and NG+ (`PQ-032` + `PQ-152`): 20–25 h authored, 10 set pieces built from verbs; economy curve: first upgrade ≤ 15 min, a new verb every hour for ten hours (`PQ-155`); three starters = three verbs (`PQ-156`); the station redesigned and the Chart finished (`PQ-162`, `PQ-168`); save/continue trust: 0 dead-ends over 200 save/load cycles. | Massline heads and field toys fielded as unlockable toys with Range drills (`PQ-029/030/031/026/147`); machinery and hazards participate (`PQ-027/028`); cargo is physics (`PQ-148`); wrecks are terrain (`PQ-154`); Crucible daily seed + ghosts (`PQ-169`). | 90-minute held-out routes (`PQ-025` pattern, unattended numeric invariants), blind reviews, economy sim printout |
| **RELEASE — "It Ships"** | Audio direction complete: impact ladder by mass × speed, adaptive score, radio, mix hierarchy (`PQ-158`). Camera as art direction + photo mode (`PQ-159`); replay + clip export (`PQ-160`). | Accessibility checklist green (`PQ-165`); pseudo-loc +40 % with zero clipped strings and five launch languages (`PQ-166`); controller parity in every screen, Deck verified (`PQ-164`); telemetry funnels + weekly playtest loop (`PQ-167`). | `PQ-033` release matrix: 60 fps median / ≤ 1 hitch per minute above 50 ms at min-spec, boot ≤ 10 s on the target GPU, heap growth < 30 MB over a 30-min soak, 2-hour crash-free soak on Browser and Electron; Steam build, cloud saves, achievements; store assets cut from the deterministic replay. | `check:all` green, soak logs, min-spec numeric runs, store page assets, owner sign-off |

Post-launch is a fourth row, not a gate: mods and data-driven content (`PQ-172`), Crucible seasons,
territory wars (`PQ-170` second half).

### 15.2 The order

```text
ALPHA   PQ-137 guts ─┬─> PQ-139 impacts answer ──┐
                     ├─> PQ-138 world reacts ─────┼─> PQ-141 60-SECOND PROOF (gate)
                     ├─> PQ-140 roster ───────────┘
                     ├─> PQ-146 stunt grammar ──> PQ-160 replay/clips (Release)
                     └─> PQ-163 first ten minutes (needs 137.03–.05)
BETA    PQ-138 ──> PQ-149 storyteller ──> PQ-150 people who remember ──> PQ-151 wanted loop
        PQ-137 ──> PQ-029/030/031/026 heads & coupling ──> PQ-147 field toys ──> PQ-027/028 machinery & infrastructure
        PQ-138 ──> PQ-148 cargo is physics ──> PQ-154 wrecks as terrain
        PQ-143 ──> PQ-153 six sectors ──> PQ-032 + PQ-152 campaign & set pieces ──> PQ-170 endgame pulls
        PQ-142 ──> PQ-155 the curve ──> PQ-156 three starters
        PQ-133 ──> PQ-169 Crucible as replay surface
        §11 ───> PQ-162 the station redesign · PQ-168 the Chart finished · PQ-161 readable at zoom
        always:    PQ-171 content grammar (anti-repetition budget), PQ-144 density/perf guard
RELEASE PQ-158 audio ─┐
        PQ-159 camera ├─> PQ-033 release matrix ──> PQ-167 Steam/telemetry/playtest ──> ship
        PQ-164/165/166┘
POST    PQ-172 mods; Crucible seasons; PQ-170 territory wars
```

Three rules of order. **Crucible first**: combat and flight feel converge in the Crucible bench and adventure inherits the numbers (the owner: *"if you get the crucible mode to be optimally fun, then it would make the goals for adventure combat more obvious"*); the operational loop is [`design/program/FUN_CONVERGENCE_LOOP.md`](./design/program/FUN_CONVERGENCE_LOOP.md) and its prompt is `MAKE IT BETTER`. **Feel before content**: nothing in BETA starts a sector, a set piece, or a toy
until `PQ-137.03–.05` are met, because content built on a ship that cannot turn is content that will
be rebuilt. **Surface before invent**: every BETA packet first lists what already computes the thing
it needs (the audit tables in each packet) and connects it before writing a new system.

### 15.3 The packets (twenty-seven new, eight reactivated)

Every row is a queue task with dispatch units; `node scripts/program-dispatch.mjs --id <ID>` returns it. Reactivated packets (`PQ-026`–`PQ-033`) were deferred one-line briefs; they now carry leaves and packet files. Wave = the milestone whose gate the packet moves. The queue rows AND their dispatch units carry the dependencies of §1.2/§15.2, so `--ready` cannot hand out content before the ship handles.

| Packet | Pillar | One line | Wave |
|---|---|---|---|
| **`PQ-146`** Stunt grammar and the trick economy — [`active/PQ-146.md`](./design/program/roadmap/active/PQ-146.md) | A · The toys | Named tricks detected from physics receipts, a combo meter, style titles, and the moment detector that feeds clips and slow-mo. | ALPHA |
| **`PQ-029`** Practical Massline heads as toys: tractor, elastic whip, frame coupler — [`active/PQ-029.md`](./design/program/roadmap/active/PQ-029.md) | A · The toys | Reactivated. The three practical heads already in the data become unlockable toys with a Range drill, a sentence, and NPC use. | BETA |
| **`PQ-030`** Advanced Massline combat heads: monofilament sweep, transverse snare — [`active/PQ-030.md`](./design/program/roadmap/active/PQ-030.md) | A · The toys | Reactivated. The two combat heads become late-game toys with counterplay and a specialist enemy that carries them. | BETA |
| **`PQ-031`** Twin Bridle: the bolas and tether-two — [`active/PQ-031.md`](./design/program/roadmap/active/PQ-031.md) | A · The toys | Reactivated. Object-to-object tether as the signature abuse: tie two enemies together and watch physics finish the fight. | BETA |
| **`PQ-026`** Mass-coupling tactics: inertial shunt, gravity mark, momentum sink — [`active/PQ-026.md`](./design/program/roadmap/active/PQ-026.md) | A · The toys | Reactivated. The three mass tools in the data become readable tactics with the momentum-bungee joust as the showcase. | BETA |
| **`PQ-147`** The field toy chest and the Power Bar filled — [`active/PQ-147.md`](./design/program/roadmap/active/PQ-147.md) | A · The toys | All five number-key powers become real, physical, legible toys with NPC counterplay; the Power Bar is the progression display. | BETA |
| **`PQ-027`** Environment as weapon: machinery and timed hazards that participate — [`active/PQ-027.md`](./design/program/roadmap/active/PQ-027.md) | A · The toys | Reactivated. Crushers, furnaces, conveyors, mass drivers, debris currents, storms and timed access become physical actors the player can feed enemies into. | BETA |
| **`PQ-028`** Manufactured travel and physics infrastructure you can ride — [`active/PQ-028.md`](./design/program/roadmap/active/PQ-028.md) | A · The toys | Reactivated. One sling ring or mass driver per region that launches ships (and thrown enemies) — the anchor-ski and catapult toys. | BETA |
| **`PQ-148`** Cargo is physics: pods with mass, volatility and a story — [`active/PQ-148.md`](./design/program/roadmap/active/PQ-148.md) | A · The toys | Spilled cargo is real mass on the field: shield, projectile, prize; volatile cargo detonates, corrodes or drags; smuggling is a physics problem. | BETA |
| **`PQ-149`** The storyteller: a session-rhythm director over the directors that exist — [`active/PQ-149.md`](./design/program/roadmap/active/PQ-149.md) | B · The world and its people | One pacing owner sustains work→travel→curiosity→tension→violence→aftermath→quiet and seeds 'so then' escalations on a budget. | BETA |
| **`PQ-150`** People who remember: aces, rivals, the mechanic, the radio — [`active/PQ-150.md`](./design/program/roadmap/active/PQ-150.md) | B · The world and its people | Named aces hunt you with counter-loadouts and taunts, rivals escalate, a mechanic narrates your scars, and the radio talks about what you did. | BETA |
| **`PQ-151`** Crime is a game: the WANTED loop with a physical escape at every tier — [`active/PQ-151.md`](./design/program/roadmap/active/PQ-151.md) | B · The world and its people | Four tiers (fine → bounty → hunters → impound), patrol nets and checkpoints, corrupt ports, laundering, insurance and restitution, impound recovery as play. | BETA |
| **`PQ-032`** Campaign spine: one linear story that builds to an ending you earned with the toys — [`active/PQ-032.md`](./design/program/roadmap/active/PQ-032.md) | B · The world and its people | Reactivated. One building story, no branch investment: beats 1–3 stop being errands, the ending gate moves to where the toys are, NG+ carries a legacy. | BETA |
| **`PQ-152`** Set pieces built from verbs: ten missions whose headline is physical — [`active/PQ-152.md`](./design/program/roadmap/active/PQ-152.md) | B · The world and its people | Tow, sling, demolish, rescue, jam, siege: mission TYPES, not contract clauses. The Massline becomes a job. | BETA |
| **`PQ-153`** Six sectors with a way of life: Helios Prime, Ceres Belt, Tethys Junction, Vesta Forge, Pallas Drift, Sker Haven — [`active/PQ-153.md`](./design/program/roadmap/active/PQ-153.md) | B · The world and its people | Six of the ten authored core sectors get a verb, a rhythm, a law, a hazard geometry, a landmark and a signature toy (the owner named the first three; the next three are proposed by tier spread and existing content); the frontier stays texture. | BETA |
| **`PQ-154`** Wrecks as terrain and the death economy — [`active/PQ-154.md`](./design/program/roadmap/active/PQ-154.md) | B · The world and its people | Dead capital hulls become arenas with ambush ecology; hulls fracture along authored seams on extreme impact; dying seeds your wreck, pod and reputation. | BETA |
| **`PQ-155`** Money means toys: the economy tuned as a verb curve — [`active/PQ-155.md`](./design/program/roadmap/active/PQ-155.md) | C · Economy, progression, identity | First upgrade in 15 minutes, a new verb every hour for ten hours, the ending at the heavy-verb tier, sinks and faucets balanced by a deterministic ten-hour economy simulation. | BETA |
| **`PQ-156`** Three starters, three verbs, and a save-file identity — [`active/PQ-156.md`](./design/program/roadmap/active/PQ-156.md) | C · Economy, progression, identity | Brawler, skater, tug as starting hulls that are three ways to play, and a load screen that shows your ship, scars, rap sheet and grudges. | BETA |
| **`PQ-161`** Readable at max zoom: silhouettes, telegraphs, force colours — [`active/PQ-161.md`](./design/program/roadmap/active/PQ-161.md) | D · Presentation | Role-readable hulls and liveries, danger telegraphs you die to on purpose, a colourblind-safe force palette, and a teaching-only trajectory overlay. | BETA |
| **`PQ-162`** The station as a place: the redesign the flatten was waiting for — [`active/PQ-162.md`](./design/program/roadmap/active/PQ-162.md) | D · Presentation | Seven station screens adopt the instrument grammar skeleton and data states for real; the owner review findings close; docking reads as arriving somewhere. | BETA |
| **`PQ-168`** The Chart finished: traffic layer, hierarchy, one answer per question — [`active/PQ-168.md`](./design/program/roadmap/active/PQ-168.md) | D · Presentation | The strategic centrepiece stops reading as an admin screen: the deferred traffic layer lands, duplicated navigation answers merge, tabs get a hierarchy, heat and contracts pin. | BETA |
| **`PQ-158`** Audio direction: the game that sounds heavy — [`active/PQ-158.md`](./design/program/roadmap/active/PQ-158.md) | D · Presentation | Authored samples replace the oscillator stack, an impact ladder by mass and speed, the Massline as an instrument, composed adaptive themes, voice for the 271-line script, a reverb bus, and a weight-first mix. | RELEASE |
| **`PQ-159`** Camera as art direction, and a photo mode — [`active/PQ-159.md`](./design/program/roadmap/active/PQ-159.md) | D · Presentation | Speed opens the frame, impacts kick by delta-V, two-body moments auto-frame as tension diagrams, signature kills get a beat, and a photo mode sells the game. | RELEASE |
| **`PQ-160`** Replay, clips and sharing — [`active/PQ-160.md`](./design/program/roadmap/active/PQ-160.md) | D · Presentation | The deterministic sim replays the last thirty seconds in-game; rated moments become clips; GIF/MP4 export; Crucible seeds and ghosts share. | RELEASE |
| **`PQ-163`** The first ten minutes: the power fantasy, honest — [`active/PQ-163.md`](./design/program/roadmap/active/PQ-163.md) | E · First hour, UX, platform | A stranger performs a swing-release, a shove and a grab-and-run in minute five without reading a wall; boost, draw-to-fly and wells are taught by doing; the 47-A opener stays the climax. | ALPHA |
| **`PQ-167`** Telemetry funnels and the weekly playtest loop — [`active/PQ-167.md`](./design/program/roadmap/active/PQ-167.md) | E · First hour, UX, platform | Designer-readable funnels from the telemetry that already exists, a weekly owner playtest with captured sessions, and the numbers that gate ALPHA and BETA. | ALPHA |
| **`PQ-173`** The fun-loop instrument: bench, measure, critic, report, translator — [`active/PQ-173.md`](./design/program/roadmap/active/PQ-173.md) | E · First hour, UX, platform | The tooling that makes "MAKE IT BETTER" executable: a fixed-seed Crucible and verb bench, a bar-and-fun-metrics printer, frame strips for a vision critic with the ten-question rubric, the one-page owner report, and the verdict-to-bar translator protocol. | ALPHA |
| **`PQ-164`** Input truth: controller, Deck, trackpad, haptics — [`active/PQ-164.md`](./design/program/roadmap/active/PQ-164.md) | E · First hour, UX, platform | Full gamepad in every screen with device-aware glyphs and remapping, Steam Deck verified, trackpad gestures honest, haptics by line tension. | RELEASE |
| **`PQ-165`** Accessibility and options depth — [`active/PQ-165.md`](./design/program/roadmap/active/PQ-165.md) | E · First hour, UX, platform | Graphics presets and a frame cap, subtitles for every voice line, audio cues for visual events, assist options, and the accessibility checklist green. | RELEASE |
| **`PQ-166`** Localization at launch: five languages and the growth test — [`active/PQ-166.md`](./design/program/roadmap/active/PQ-166.md) | E · First hour, UX, platform | The existing 9,530-key runtime carries five launch languages; every screen survives +40 % growth; fonts fall back. | RELEASE |
| **`PQ-033`** Final platform, save, performance, accessibility, legal and store closeout — [`active/PQ-033.md`](./design/program/roadmap/active/PQ-033.md) | E · First hour, UX, platform | Reactivated. The release matrix: legal and credits (the only hard blocker today), crash reporting, auto-update, version string, min-spec floors, soaks, Browser/Electron parity, store readiness. | RELEASE |
| **`PQ-169`** Crucible as the replay surface: daily seed, ghosts, mutators, cosmetics home — [`active/PQ-169.md`](./design/program/roadmap/active/PQ-169.md) | F · Modes and replayability | A daily seed with a leaderboard and ghosts, weekly mutators (gravity slalom), stunt scoring; the Crucible is the combat lab that adventure inherits from. | BETA |
| **`PQ-171`** Content grammar and the anti-repetition budget — [`active/PQ-171.md`](./design/program/roadmap/active/PQ-171.md) | F · Modes and replayability | A written grammar for encounters, microevents and contracts so twenty-five hours do not repeat, and a check that measures repetition. | BETA |
| **`PQ-170`** Endgame pulls: territory, mega-heists, capital bosses, legendary lines, station growth — [`active/PQ-170.md`](./design/program/roadmap/active/PQ-170.md) | F · Modes and replayability | After the ending: territory wars you tilt, two mega-heists, capital boss set-pieces, the Ace's trophy line, a station that expands and a faction that depends on you. | POST |
| **`PQ-172`** Mods and data-driven content — [`active/PQ-172.md`](./design/program/roadmap/active/PQ-172.md) | F · Modes and replayability | Content directories loadable as JSON (weapons, ships, encounters, sectors) with validation; Workshop later. | POST |

### 15.4 The plans, in detail

Each block is the packet file in brief: the gap it closes, what the audit found already exists, the write surfaces, the leaves with their done-when bars, and the ways agents get it wrong. The packet files under `design/program/roadmap/active/` carry the same text plus entry conditions, work breakdown, budgets, review questions, stop conditions and checkoff.

#### Pillar A · The toys

**`PQ-146` — Stunt grammar and the trick economy** · *ALPHA* · after `PQ-137`

The game names what the player just did. A rope release already grades itself razor/clean/good/messy; the same receipt stream can recognise a bolas, a wrecking-ball kill, a clothesline, a collateral chain, a near-miss, a tow-kill and a rock discovery. A combo meter scores them in the Crucible, the ledger and titles record them in adventure, and a moment detector fires the slow-mo and the clip. This is the missing DEMAND for physics play: nothing in the build today asks the player to compose a chain. Per the Crucible-first law, the scoring lands in the Crucible bench before adventure inherits the ledger and titles.

- **Gap:** Tony Hawk, Rocket League and Bulletstorm made a physics toy legible by naming the tricks; the audit found every link of the 60-second chain exists and nothing rewards composing them. **Reference:** Tony Hawk's Pro Skater, Rocket League, Bulletstorm skillshots, Just Cause.
- **Exists:** `tether:releaseRated` (razor/clean/good/messy) in `src/systems/tetherGameplay.js`; `combat:collisionConsequence` receipts with exchangedMomentum/deltaV; `massline:throw`, `tether:whipImpact`, `combat:collisionDebris`; `src/systems/titles.js`, `shipLedger.js` (240 entries), `survivalRecords.js`, `bulletTime.js`; `src/combat/impulseKernel.js` provenance history per entity.
- **Routes through:** GDX-A04 combat causality; §12 Crucible scoring.
- **Writes:** `src/combat/`, `src/systems/titles.js`, `src/systems/shipLedger.js`, `src/systems/survivalRun.js`, `src/systems/survivalResults.js`, `src/systems/bulletTime.js`, `src/render/feel.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Trick taxonomy and detectors.** One pure module turns the receipt stream into named tricks with a cause chain (who threw, what hit, what it hit next): bolas, wrecking ball, clothesline, collateral ×N, near-miss, tow-kill, rock discovery, well golf, dead man's mass, razor release. | ≥ 12 tricks detected deterministically in scenarios; false-positive rate < 5 % on ordinary flight tapes. |
| `.01` | **Combo meter and scoring in the Crucible.** Chain window, multiplier by trick rarity and mass ratio, banked on quiet; scoring feeds survivalRecords and the results screen. | A physics run outscores a gun run of equal kills by ≥ 2×; the free Pulse cannot top the board. |
| `.02` | **Titles and ledger entries in adventure.** Tricks write ledger lines and earn titles NPCs use in barks; the rap sheet cites them. | A witnessed bolas kill produces a ledger line and a bark within one session; save round-trips. |
| `.03` (after PQ-139.00) | **The moment detector.** A rated 'holy shit' event (rarity × momentum × collateral) exposed on the bus for slow-mo (bulletTime), camera, audio stingers and the clip recorder. | Fires on ≥ 3 distinct moments in the 60-second proof scenario and never on ordinary traffic. |

- **Not:** No score popups in adventure flight (the HUD attention pass stands); no trick that requires a new input.
- **How agents get this wrong:** Detecting tricks from what the player pressed instead of what the physics produced: receipts only; Popping score text in adventure flight: the HUD attention pass stands; tricks go to the ledger and titles; Rewarding a trick nobody saw: a trick without a consequence chain is not a trick.

**`PQ-029` — Practical Massline heads as toys: tractor, elastic whip, frame coupler** · *BETA* · after `PQ-137`

Each head answers 'what can I do now?' in one sentence the fitting screen shows: the tractor picks things up and throws them; the elastic whip stores energy and snaps; the frame coupler locks two frames so a tow feels rigid. Each has a Range drill, a counterplay, and at least one NPC occupation that uses it in the world (a tug couples, a scavenger tractors).

- **Gap:** Seven heads exist as ordinary purchasable modules with no arc; a player can finish the campaign using the rope as a tractor beam only. **Reference:** Just Cause tether upgrades, Bionic Commando, Hardspace: Shipbreaker tools.
- **Exists:** `src/data/modules.js:115-141` seven heads; runtime flags `masslineHeadTractor`, `masslineHeadElasticWhip`, `masslineHeadFrameCoupler` (ON in production); `src/core/sg02DynamicBodyOwner.js` spring modes incl. `frame_coupler`; `src/ui/screens/range.js` three drills.
- **Routes through:** SPEC3-17 tether & momentum verbs; GDX-A02.
- **Writes:** `src/data/modules.js`, `src/systems/tetherGameplay.js`, `src/core/sg02DynamicBodyOwner.js`, `src/ui/screens/range.js`, `src/systems/npcJobsRuntime.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Tractor head as a throw toy.** Pick up, spin, throw with the release rating; works on cargo, debris, drones, light hulls. | A Range drill teaches it in ≤ 60 s; throw speed ≥ 1.2× cruise on a light payload. |
| `.01` | **Elastic whip as stored energy.** Stretch stores energy, release snaps the payload or the player; readable strain glow; break by load. | A whip snap moves a light hostile ≥ 40 % of its cruise; the drill exists. |
| `.02` | **Frame coupler as the tow you can trust.** Rigid tow for the long haul; the coupled pair reads as one body in the physics and the camera. | A 200-mass tow holds through a 180° turn at 60 % cruise without oscillation. |
| `.03` | **NPCs use the heads.** Tugs couple, scavengers tractor, patrols net; the player sees the verbs in the world before buying them. | Each head is seen in ordinary traffic within 10 minutes at the reference site. |

- **Not:** No new head models until PQ-050 fielding rules are met; no head that needs a second input scheme.
- **How agents get this wrong:** A head that is a stat bonus: each head is a verb with a Range drill and an NPC user.

**`PQ-030` — Advanced Massline combat heads: monofilament sweep, transverse snare** · *BETA* · after `PQ-137`, `PQ-140`

The sweep cuts lines and clips light hulls in a swing arc; the snare catches a ship crossing the line and yanks it. Both are late unlocks, both have a specialist NPC (the tether-cutter of PQ-140) so the player meets the counter before owning the verb.

- **Gap:** Combat heads exist in data with no arc, no enemy use, no drill. **Reference:** Just Cause 3 tether combat, Worms ninja rope.
- **Exists:** `modules.js` monofilament_sweep, transverse_snare; flags ON; `src/systems/masslineThreats.js`, `masslineSnares.js` seams.
- **Routes through:** SPEC3-17; PQ-140.02 specialists.
- **Writes:** `src/data/modules.js`, `src/systems/tetherGameplay.js`, `src/systems/masslineThreats.js`, `src/systems/masslineSnares.js`, `src/ui/screens/range.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Monofilament sweep.** Swing arc cuts lines and staggers lights; visible blade-line; costs line integrity. | Cuts an NPC tether in one pass; scenario + capture. |
| `.01` | **Transverse snare.** A line across a lane catches the first crosser and yanks it into the anchor; the clothesline toy. | A pursuer at full burn is caught and tumbled (B11) in the scenario. |
| `.02` | **The counter arrives first.** The tether-cutter specialist uses the sweep against the player two hours before the head unlocks. | Blind reviewer names the specialist's threat from silhouette and behaviour. |

- **Not:** No head that trivialises heavies; heavies are terrain.
- **How agents get this wrong:** Shipping the head before its counter exists: the specialist arrives first.

**`PQ-031` — Twin Bridle: the bolas and tether-two** · *BETA* · after `PQ-137`

Fire a bridle that couples two bodies. Two light pirates orbit each other and lawn-dart into a rock; two haulers jackknife; a pirate hitched to a passing freighter loses its engines. The pair shares helm loss and inertia (PQ-137.09). This is toy T1 and T4 of §15.5.

- **Gap:** Twin Bridle exists behind a flag with setup time and no gameplay arc; the most-requested verb in the vision ('tether them together so they yank each other') is unreachable in practice. **Reference:** Just Cause 2 tether, Bolo physics.
- **Exists:** `TWIN_BRIDLE_HEAD_ID`, `TWIN_BRIDLE_SETUP_S = 10` in `src/systems/tetherGameplay.js`; `attachments.listControlledBy`; `masslineHeadTwinBridle` flag ON.
- **Routes through:** SPEC3-17; PQ-137.09 chains.
- **Writes:** `src/systems/tetherGameplay.js`, `src/core/sg02DynamicBodyOwner.js`, `src/systems/tumbleStates.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Bolas throw in one input.** Setup time drops to a throw: latch A, latch B, the bridle exists; setup ≤ 2 s at combat range. | Two lights bridled within 3 s of the first latch in a scenario; the pair tumbles (B11). |
| `.01` | **Coupled-pair physics.** Shared inertia, shared helm loss, bounded line load, break by load rating; the pair reads as one system in the camera. | Pair orbits and impacts terrain in ≥ 4 of 5 seeds. |
| `.02` | **NPC counterplay.** Aces cut bridles; heavies ignore them; the specialist carries a line-cutter. | Scenario shows one cut and one ignore. |

- **Not:** No bridling of stations or planets as a cheese; large bodies stay anchors only.
- **How agents get this wrong:** A ten-second setup: the bolas is a throw.

**`PQ-026` — Mass-coupling tactics: inertial shunt, gravity mark, momentum sink** · *BETA* · after `PQ-137`

The gravity marker makes a target heavier to fields; the momentum sink stores and returns momentum (plant it on a rock, burn away, release, slingshot back through the pursuer); the inertial shunt trades your momentum for theirs on contact. Each is a decision, each is legible, each has an NPC user.

- **Gap:** `wpn_gravity_marker_s` and `wpn_momentum_sink_s` exist in weapons data with status effects and no play arc. **Reference:** Highfleet burner tricks, Rocket League demo timing.
- **Exists:** `src/data/weapons.js` gravity_marker_s / momentum_sink_s; `src/render/momentumSinkVfx.js`; statuses in `src/data/combatDefs.js`.
- **Routes through:** SPEC3-17; GDX-A03.
- **Writes:** `src/data/weapons.js`, `src/data/combatDefs.js`, `src/systems/weapons.js`, `src/render/momentumSinkVfx.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Momentum sink as the bungee.** Plant, tension, release: the player exits at ≥ 2× cruise (earned speed kept, B1). | Scenario measures exit speed ≥ 2× cruise; capture. |
| `.01` | **Gravity mark as a field multiplier.** A marked target is pulled 3× harder by wells and sinks; marked heavies bend toward wells they would ignore. | Well golf on a marked medium works in the scenario. |
| `.02` | **Inertial shunt.** On contact, swap momentum with the target (bounded by mass ratio); the ram that stops you and launches them. | A shunt ram on a light hostile sends it ≥ 1 screen; the player stops within 20 WU. |

- **Not:** No stat-only status effects; every effect must be visible as motion.
- **How agents get this wrong:** Status effects without visible motion: every mass tool changes a trajectory the player can see.

**`PQ-147` — The field toy chest and the Power Bar filled** · *BETA* · after `PQ-137`, `PQ-139`

Well (pull), Repulsor (shove), Clearing Cone, Skim Collector and Mass Seed are the five powers already bound to keys 4–8; two have zero UI references. Each becomes a field that visibly bends motion, has a counter (fly out, cut, mark), and is used by at least one enemy role. Well golf, gravity bowling and cluster-and-detonate are the showcases.

- **Gap:** The Power Bar (§11.4) is half-built at the input layer; the powers themselves are uneven and unteachable. **Reference:** Noita wand synergies, Spelunky item interactions, Magicka.
- **Exists:** `src/data/fields.js` Well/Repulsor/Cone (`deployRange 520`); `src/systems/fields.js`, `src/core/fields/fieldKernel.js`; `src/systems/input.js` VERB_BINDINGS Digit4–8; `src/ui/powerRail.js`.
- **Routes through:** §11.4 Power Bar; GDX-A03; PQ-139.05 well distortion.
- **Writes:** `src/data/fields.js`, `src/systems/fields.js`, `src/core/fields/`, `src/ui/powerRail.js`, `src/ui/screens/range.js`, `src/ai/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Five powers, five sentences, five drills.** Each power gets its fitting-screen sentence, a Range drill, and a legible field volume (cone/ring/sheet, never a sphere). | All five appear on the rail with real state; drills exist; VFX grammar test covers them. |
| `.01` | **Fields participate in physics for everyone.** NPCs, cargo, debris and wrecks obey fields; NPCs deploy them (an anchor specialist wells, a scavenger cones). | A well bends ≥ 5 bodies in the scenario; one NPC role deploys a field in ordinary traffic. |
| `.02` | **Counterplay.** Fly out, cut the emitter, mark it, or out-mass it; the player is never trapped without a verb. | Each field has one deterministic escape in a scenario. |
| `.03` (after PQ-137.09) | **Cluster and detonate.** A well plus a primed light (PQ-137.09) produces the chain; the moment detector rates it. | ≥ 3 secondary consequences from one action in 4 of 5 seeds. |

- **Not:** No passive auras; no field that clears the screen without a player decision (§12.3).
- **How agents get this wrong:** Shipping a field as a damage volume or an aura: every field bends motion visibly and has a counter; Rendering a field as a glowing sphere: cone, ring or sheet by the VFX standard; Letting NPC fields trap the player without a verb: the counterplay leaf is not optional.

**`PQ-027` — Environment as weapon: machinery and timed hazards that participate** · *BETA* · after `PQ-137`, `PQ-147`

Industrial machinery finishes what the player started: the ore-crusher trap, the station-door jam, the debris reef that pinballs mines, the furnace that melts a shield, the storm that bends shots. Machinery is on a schedule (the ordinary-life rhythm), so timing is part of the trick.

- **Gap:** `environmentalMachinery.js` exists as a system with dressing; nothing in it takes a hull. **Reference:** Just Cause chaos objects, Hardspace: Shipbreaker hazards, Outer Wilds mechanisms.
- **Exists:** `src/systems/environmentalMachinery.js`, `src/data/environmentalMachinery.js`; `src/data/everydaySpaceKitDressing.js`; `src/systems/terrainAnchors.js`; `src/data/hazardLanguage.js`.
- **Routes through:** GDX-A06 encounter geometry; SPEC3-31 anomalies; PQ-136 fielded props.
- **Writes:** `src/systems/environmentalMachinery.js`, `src/data/environmentalMachinery.js`, `src/data/hazardLanguage.js`, `src/systems/terrainAnchors.js`, `src/systems/world.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Three machines that kill.** Excavator jaws, refinery furnace mouth, mass-driver breech: each a legible danger volume with a schedule and a slam-law payoff (PQ-137.06). | A shoved light dies in each; a capture per machine. |
| `.01` | **Debris currents and reefs.** Authored flows that carry loose mass; mines and pods ride them; the reef pinball. | Mine pinball cascades in a scenario. |
| `.02` | **Weather that shapes fights.** One storm and one radiation belt per affected sector: shots bend, sensors shrink, fields amplify; ordinary traffic avoids them. | Blind reviewer names the hazard from motion alone. |
| `.03` | **Timed access.** Gates, locks and doors on schedules; the station-door jam. | A jammed aperture holds reinforcements for ≥ 20 s in the scenario. |

- **Not:** No hazard that is only a damage volume; every hazard moves mass.
- **How agents get this wrong:** Hazards that are damage volumes: every hazard moves mass; Machines with no schedule: the rhythm makes timing part of the trick.

**`PQ-028` — Manufactured travel and physics infrastructure you can ride** · *BETA* · after `PQ-137`, `PQ-145`

A manufactured acceleration structure the world uses for freight and the player uses for stunts: ride it for free speed (earned, kept), throw an enemy into its breech, or hitch a convoy through it. It does not replace Atlas travel; it is a local toy with a schedule.

- **Gap:** Travel between sectors is Atlas; nothing in a sector launches mass. **Reference:** Kerbal launch structures, Sonic loops, Just Cause 3 wingsuit rings.
- **Exists:** `src/systems/travelLanes.js`, `cruise.js`, `orbitNodeRuntime.js`; `mod_throughline_sling` in base modules (`src/ui/screens/base.js`).
- **Routes through:** SPEC3-16 travel grammar; PQ-145 authorship (player-built sling).
- **Writes:** `src/systems/travelLanes.js`, `src/systems/orbitNodeRuntime.js`, `src/ui/screens/base.js`, `src/systems/claims.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **One authored sling ring.** A ring on the reference site's route that accelerates aligned bodies; NPC haulers use it on schedule. | Player exit speed ≥ 2× cruise and kept (B1); haulers ride it in ordinary traffic. |
| `.01` | **Throw something into it.** Bodies entering off-axis are flung; a thrown enemy becomes a long-range projectile. | Scenario: a thrown light exits the ring at ≥ 3× cruise and slams terrain (B6). |
| `.02` | **The player-built sling.** `mod_throughline_sling` becomes this structure at a claim, creating NPC traffic (PQ-145). | A built sling is used by ≥ 1 NPC route within one session. |

- **Not:** No rebuild of sector-to-sector travel.
- **How agents get this wrong:** Rebuilding sector-to-sector travel: this is a local toy with a schedule.

**`PQ-148` — Cargo is physics: pods with mass, volatility and a story** · *BETA* · after `PQ-137`, `PQ-138`

A cargo pod is a body: it shields, it can be shoved as a shotgun shell, it is a prize NPCs race for. Volatile classes (explosive, corrosive, superdense) change what a throw does. Contraband hides in blind spots and is smuggled by momentum through customs cones. The freighter that breaks up spills pods that keep its velocity.

- **Gap:** Cargo spills exist as TTL pickups that NPCs ignore; mass on the field is inventory. **Reference:** Deep Rock Galactic canisters, Noita liquids, Hardspace hazards.
- **Exists:** `src/systems/cargo.js`, `fragileCargo.js`, `jettisonImpulse.js`, `lootShards.js` (payload pods), `src/data/commodities.js`, `commodityMoralTags.js`; `freight:cargoSpilled` producer.
- **Routes through:** PQ-138.01 spilled cargo noticed; GDX-A14 hauling; SPEC3-12 black markets.
- **Writes:** `src/systems/cargo.js`, `src/systems/fragileCargo.js`, `src/systems/jettisonImpulse.js`, `src/systems/lootShards.js`, `src/data/commodities.js`, `src/systems/lawSecurity.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Pods are bodies.** Every spilled/jettisoned pod is a dynamic body with mass by contents, inherits velocity, collides, can be tethered and shoved. | Ore shotgun: a shoved pod moves a light hostile ≥ 30 % cruise; pods persist across save. |
| `.01` | **Volatile classes.** Explosive (radial impulse on slam), corrosive (hull tick on contact), superdense (pull on fields, cannot be thrown far). | Three scenarios, three distinct outcomes, readable by silhouette/lamp. |
| `.02` | **Smuggling physics.** Customs scan cones; contraband hidden in a hauler's blind spot or drop-kicked at cruise through a cone into an outlaw catch net. | A drop-kick through a cone succeeds in the scenario; a scanned pod raises heat (PQ-151). |
| `.03` | **Cargo with a name.** Pods carry origin/destination/owner; a spilled pod's owner reacts (restitution, bounty, thanks). | Ledger and bark cite the owner after a spill. |

- **Not:** No inventory Tetris; cargo mass is felt in flight (already true) and seen on the field.
- **How agents get this wrong:** Keeping pods as pickups with a timer: a pod is a body with mass that collides and can be tethered; Inventory Tetris: cargo mass is felt in flight and seen on the field, never managed in a grid; Smuggling as a dice roll: the scan is a cone; the run is physics.

#### Pillar B · The world and its people

**`PQ-149` — The storyteller: a session-rhythm director over the directors that exist** · *BETA* · after `PQ-138`

The game breathes. Ordinary life is guaranteed between incidents, tension is telegraphed, violence has aftermath and quiet, and escalations ('the patrol you fled now has your name') are seeded by a budget, not by chance. The player never sits in a dead sector and never drowns in noise. A story-so-far ledger reads it back.

- **Gap:** Three directors exist (encounter, campaign pressure decks, station side events) with no owner of rhythm; ambient tier exists but nothing guarantees quiet or seeds escalation. **Reference:** RimWorld storytellers, Left 4 Dead director, Sea of Thieves world events.
- **Exists:** `src/systems/encounterDirector.js` (ambient tier, MAX_AMBIENT_PER_DAY), Campaign Director 2.0 (two-deck pressure, phases, receipts), `stationSideEventDirector.js`, `src/ai/director.js`, `barkDirector.js`, microevent library (58), `shipLedger.js`.
- **Routes through:** SPEC3-21/29 directors; GDX-S04 consequence loop; PQ-138.
- **Writes:** `src/systems/encounterDirector.js`, `src/ai/director.js`, `src/systems/stationSideEventDirector.js`, `src/systems/shipLedger.js`, `src/systems/telemetry.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The rhythm model.** A phase machine (work, travel, curiosity, opportunity, tension, violence, aftermath, quiet) with dwell budgets and telegraphs, read by the existing directors as a gate. | A 90-minute unaided session shows every phase and no phase > 12 min; telemetry prints the timeline. |
| `.01` | **Escalation seeds.** Consequence tokens from PQ-138 (witness, spill, flee) become future beats: a bounty, an ace, a shortage, a rumor; each with a delay and a place. | ≥ 3 escalations traceable to player acts per session; each cites its cause in the ledger. |
| `.02` | **Guaranteed ordinary life.** Quiet phases spawn routine work (inspections, transfers, repair, waiting, a slow tug) at the camera. | 5-minute quiet capture shows ≥ 4 routine behaviours; activity telemetry confirms. |
| `.03` | **Story so far.** The ledger renders the session as 'I was doing X, then Y, so I Z' with the causes. | Blind reader retells the session correctly from the ledger alone. |

- **Not:** No scripted spawns at the player; no hard-counter director (§12.3).
- **How agents get this wrong:** Spawning at the player to keep things interesting: escalations arrive from a place with a delay and a cause; A hard-counter director that punishes the player's build: forbidden by §12.3; Filling quiet phases with combat: quiet is guaranteed, not tolerated.

**`PQ-150` — People who remember: aces, rivals, the mechanic, the radio** · *BETA* · after `PQ-138`, `PQ-149`

The universe is audible and it knows you. Twelve named aces escalate their kit against your habits (line-cutters after your third fling-kill), rivals hold grudges across sectors, haulers whine and pirates negotiate on comms, and a mechanic at your berth reads the hull's history back to you. The 271-line bark corpus is the script; this packet gives it delivery and memory.

- **Gap:** Aces and memory exist; nothing escalates against the player's style, no character lives anywhere, and barks are text after a squelch. **Reference:** Shadow of Mordor (lite), Hades Olympians, Rebel Galaxy Outlaw radio, Mount & Blade lords.
- **Exists:** `src/data/namedAces.js` (12), `aceMemory.js`, `moralMemory.js`, `pirateRumor.js`, `barkDirector.js` + `src/data/barks.js` (271 lines, 8 factions × 8 situations), `bandRadio.js`, depth program V1 fifteen NPCs, `shipLedger.js`, `livingHull.js`.
- **Routes through:** Depth V1/V2, ADD-1 The Band, ADD-2 Ledger, ADD-3 Living Hull; SPEC3-22 named enemies.
- **Writes:** `src/data/namedAces.js`, `src/systems/aceMemory.js`, `src/systems/barkDirector.js`, `src/data/barks.js`, `src/systems/bandRadio.js`, `src/ui/station/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Aces escalate against your style.** Ace memory reads the stunt grammar: fling-kills bring line-cutters and sinks, gun-kills bring armour, rock-kills bring rock-avoiders; they taunt the specific act. | Third same-style kill changes the ace's next loadout deterministically; bark names the act. |
| `.01` | **The mechanic.** A named voice at the home berth who reads scars, repairs, and rap sheet back as one line each; the ship becomes 'my fucking ship' through them. | Every scar class has a line; the berth screen shows the mechanic with the hull. |
| `.02` | **Radio that reacts.** The Band and comms chatter keyed to world events and player acts: haulers whine, pirates negotiate, patrols threaten, stations report. | ≥ 8 distinct reactive chatter classes audible in a session; captions on. |
| `.03` | **Fifteen people, placed.** The depth program's named NPCs live at places, with a sentence and a reaction set. | All fifteen reachable on the route with ≥ 1 reaction each. |

- **Not:** No dialogue trees; a bark is one line and a consequence.
- **How agents get this wrong:** Dialogue trees or menus: a bark is one line and a consequence; forbidden by ruling; Aces that escalate by stats: they escalate by kit and behaviour against the player's habits; A mechanic who narrates nothing real: every line reads a scar, a repair or a rap-sheet entry.

**`PQ-151` — Crime is a game: the WANTED loop with a physical escape at every tier** · *BETA* · after `PQ-138`, `PQ-149`

Being wanted is a game with verbs, not a number. Tier one is a fine and a scan cone to slip; tier two posts a bounty and hunters with your name; tier three brings tether-net checkpoints and patrol wedges you must break physically; tier four impounds and the recovery is a heist. Corrupt ports launder cargo and heat for a price; insurance and restitution make 'oh fuck, I did that' recoverable.

- **Gap:** Heat is a decaying scalar; incidents chase always; custody/surrender/recovery systems (54 KB) are rich but unadvertised; no tiers, no nets, no laundering. **Reference:** Elite Dangerous crime, GTA wanted stars, Watch Dogs escapes.
- **Exists:** `src/systems/lawSecurity.js`, `heat.js`, `custodyConsequences.js`, `surrenderRecovery.js`, `recoveryEncounter.js`, `pirateDisguise.js`, `bountyHunters.js` data, `dockDeny.js`, `contraband:scanned`.
- **Routes through:** GDX-A07 collateral and law; PQ-138.00 witness choice; SPEC3-12.
- **Writes:** `src/systems/lawSecurity.js`, `src/systems/heat.js`, `src/systems/custodyConsequences.js`, `src/systems/surrenderRecovery.js`, `src/systems/pirateDisguise.js`, `src/data/bountyHunters.js`, `src/ui/galaxyMap.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Four tiers with a verb each.** Fine/scan, bounty/hunters, nets/wedges, impound/heist; heat shown on the chart; each tier's escape is physical. | Scenario per tier with a deterministic escape; blind reviewer names the tier from the world. |
| `.01` | **Patrol nets and checkpoints.** Tether-net roadblocks and scan cones on lanes; break them by mass, speed, or a thrown decoy. | Three break methods verified in scenarios. |
| `.02` | **Corrupt ports and laundering.** Outlaw stations launder cargo and heat for a cut; reputation pays the cut down. | A laundered pod clears a scan; the ledger records the cut. |
| `.03` | **Insurance, restitution, impound recovery.** Collateral has a bill; paying, working it off, or stealing the ship back are all play. | Each path completes in a scenario; save round-trips mid-path. |

- **Not:** No instant-teleport police; every responder flies from somewhere.
- **How agents get this wrong:** Police that teleport or spawn on the player: responders fly from somewhere; A tier without a physical escape: every tier's escape is a verb, never a purchase; Heat as a hidden number: the tier is visible on the chart and in the world.

**`PQ-032` — Campaign spine: one linear story that builds to an ending you earned with the toys** · *BETA* · after `PQ-137`, `PQ-143`, `PQ-152`

The 47-A opener is the best twelve minutes in the game; the next three beats are inventory errands and the ending fires at ~4 % of the money curve behind an empire-stake paywall. The owner ruled: no dialogue trees, one linear story that builds, and replay value is not a goal. This packet re-cuts the spine as ONE through-line: each beat is a set piece built from verbs (PQ-152), the ending gate sits where the player has heavy-class verbs, the empire stake accepts a combat stake, and NG+ carries the ship's history. The five endings and five post-ending chains that already exist stay as they are; no new branching work is admitted.

- **Gap:** Authored content ~10–14 h; sharpest cliff at minute 12; ending at 100k cr vs 4.5M hulls. **Reference:** Freelancer campaign gating, Hades run narrative, Outer Wilds discovery.
- **Exists:** 8 beats `src/data/missions.js:1001-1016`; `src/story/campaign47a/`; 5 endings `src/story/endings/endingDefs.js`; `postEndingReplayChains.js`; `newGamePlus.js`; eligibility gates `eligibility.js:152-168`.
- **Routes through:** WB-B0-B7, WB-WORLD-AFTER, RV-STORY, SPEC3-32; depth P2 story-beat embodiment; retired plan superseded by this packet: design/program/roadmap/retired/PQ-032.md.
- **Writes:** `src/data/missions.js`, `src/story/`, `src/core/newGamePlus.js`, `src/data/postEndingReplayChains.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Beats 1–3 become set pieces.** honest_work → the wrecking-ball contract; first_blood → pod rescue under fire; bigger_boat → the long tow. | Each beat is a PQ-152 set piece with a physical headline verb. |
| `.01` | **The gate moves and widens.** Ending eligibility at the heavy-verb tier (tow class ≥ medium, one field, one ace beaten) with a combat stake alternative to the empire stake; the linear spine reaches it without a branch choice. | A combat-only run reaches an ending; a builder run reaches one; both in ≤ 25 h by telemetry. |
| `.02` | **The climax is a toy.** Each ending's final set piece requires the verbs of the branch (siege by wrecking ball, evidence tow, blockade run). | Owner plays each ending's climax; verdict recorded. |
| `.03` | **NG+ carries a legacy.** Ship scars, titles, ace grudges, one head, and the ending's world facts carry; everything else resets. | Save migration test; the mechanic names the carried history. |

- **Concept companion:** Candidate B0–B7 beat treatments remain in [`EXPANSION_STORY_AND_PLACES.md`](./design/spec3/EXPANSION_STORY_AND_PLACES.md#1-campaign-spine-candidate-beats). They fill the existing spine and route through `.00`–`.02`; they do not add beats, branches, endings, numeric gates, or asset acceptance.

- **Not:** No new endings, no new branches, no dialogue trees; existing endings stay untouched.
- **How agents get this wrong:** Adding a branch or a choice menu: one linear story, by ruling; Moving the ending gate without a combat stake: a combat-only run must reach an ending.

**`PQ-152` — Set pieces built from verbs: ten missions whose headline is physical** · *BETA* · after `PQ-137`, `PQ-138`

Ten authored set pieces and three new procedural mission types whose headline verb is physical: the wrecking-ball demolition, pod rescue under fire, the long tow, convoy defence with real cargo, the station-door jam, the prison-break (impound recovery), the ace duel, the capital boss with sub-systems, the reef clearance, the heist that goes loud. Each is a puzzle made of momentum with two solutions.

- **Gap:** Ten procedural verbs, eight are fly-there; physical play lives only in optional clauses (`no_slack` applies to bulk_haul only). **Reference:** Hitman set pieces, Just Cause missions, Star Control 2 melee bosses.
- **Exists:** `missions.js` OFFER_MIX and 5 SET_PIECE_MISSIONS; `missionConditions.js` 13 terms; `heistMission.js`, `landmarkMissions.js`, `setPieceMissionOffers.js`; depth SP1; SPEC3-22 bosses.
- **Routes through:** Depth SP1, P4 set-piece types; SPEC3-22; GDX-A19.
- **Writes:** `src/data/missions.js`, `src/data/missionConditions.js`, `src/systems/missions.js`, `src/systems/heistFacilities.js`, `src/data/encounters/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Three physical procedural types.** tow_recovery, demolition, rescue_under_fire join the OFFER_MIX with station-type weights. | Each appears on boards on the route; each completes in a scenario by two methods. |
| `.01` | **Ten authored set pieces.** Authored once each with actors, a place, a twist clause and two solutions; the 47-A craft level. | Ten playable on the route; owner verdict per piece. |
| `.02` | **The capital boss.** A heavy with sub-systems (thrusters, bays, turrets) vulnerable to thrown mass; no immunity theatre. | Killable by physics alone in a scenario; the tumble law applies to its sub-systems. |
| `.03` | **Clauses that twist.** Contract terms that fire mid-mission (the escort turns, the cargo is volatile, the buyer is the law). | ≥ 5 twist clauses live; each mutates rather than fails (PQ-138.04). |

- **Concept companion:** Candidate briefs `SM-01`–`SM-08` in [`EXPANSION_STORY_AND_PLACES.md`](./design/spec3/EXPANSION_STORY_AND_PLACES.md#2-eight-candidate-briefs-for-existing-set-piece-slots) are proposals for eight of the ten existing `.01` slots. They add no missions or leaves; mass, timing, survivability, and outcomes remain packet-owned, and no brief promises a forced fatal collision.

- **Not:** No mission that is 'fly there and hold fire'.
- **How agents get this wrong:** A mission whose headline is 'fly there and hold fire': the headline verb is physical or the mission is not admitted; One solution per set piece: two solutions, both reachable on a trackpad; A boss with immunity phases: physics is the fast way, guns the slow way, immunity never.

**`PQ-153` — Six sectors with a way of life: Helios Prime, Ceres Belt, Tethys Junction, Vesta Forge, Pallas Drift, Sker Haven** · *BETA* · after `PQ-137`, `PQ-143`

A player recognises each of six sectors from thirty seconds of unlabeled activity: Helios (the tutorial harbour), Ceres (the working belt), Tethys, plus three chosen from the ten by what they can physically offer — an ice-shear field, a debris reef, a foundry. Each has hazard geometry that changes fights, a landmark you screenshot, and one toy that is best there. The frontier fourteen carry stations and rumours, not story.

- **Gap:** 24 sectors exist (10 authored + 14 frontier); identity is palette; the frontier has no beats. **Reference:** Subnautica biomes, Hollow Knight areas, Starsector systems.
- **Exists:** `src/data/sectors.js` (10 core), `src/data/frontierRegions/` (14), `authoredPlaces.js`, `regionalEcology.js`, world-identity `SECTOR_STYLE_INDEX.md`, depth landmarks H1a–H1h, W1/W2 planet states, `PLACE_REGISTRATION.md`.
- **Routes through:** PQ-143 identity tables; WI-SECTOR-FAMILIES; SPEC3-30; depth H1/W1/W2; PQ-136 props.
- **Writes:** `src/data/sectors.js`, `src/data/frontierRegions/`, `src/data/authoredPlaces.js`, `src/systems/regionalEcology.js`, `design/world-identity/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Confirm the six and their sentences.** Proposed: Helios Prime (the harbour: law, tutorial, calm), Ceres Belt (the working belt: mining, haulers, the Cathedral), Tethys Junction (the trade hub: traffic, customs, the black market), Vesta Forge (the foundry: furnace hazards, industry), Pallas Drift (the debris reef: wrecks, scavengers, reef pinball), Sker Haven (the outlaw port: the wanted loop's home, corrupt docks). A table per sector: verb, rhythm, law, crime, ships, structures, hazard geometry, landmark, signature toy. | Table committed; the owner may swap any of the last three by name. |
| `.01` | **Hazard geometry per sector.** Ice shear, debris reef, foundry heat, storm lane, gravity knot, wreck field: each an authored physical situation (PQ-027 hazards). | Blind reviewer names the sector from a 30 s capture with labels hidden, 5 of 6. |
| `.02` | **Landmarks fielded.** The depth program's hero landmarks placed where the six need them; screenshot composition checked at the shipping camera. | Six landmarks reachable; still review passes. |
| `.03` | **The frontier as texture.** Fourteen frontier sectors get rumours, one texture one-off each, and no story promise; the stale 'not wired' comment corrected. | Atlas integrity green; each frontier sector has one memorable object. |

- **Not:** No new sectors; no palette-swap identity.
- **How agents get this wrong:** New sectors: six of the ten, then the frontier as texture; no new sectors; Identity by colour grade: a way of life is verbs, rhythm, law, crime, ships, structures and hazards.

**`PQ-154` — Wrecks as terrain and the death economy** · *BETA* · after `PQ-138`

A wreck is a place: cover, anchor, loot, and an ecology (scavengers, a squatter, a trap). Extreme impacts fracture hulls along a few authored seams, so the aftermath of a wrecking-ball hit is pieces, not a swap. Your own death leaves your wreck and pod in the world; the surrender/custody systems already make it a story.

- **Gap:** Wrecks spawn flat and static; fracture is a swap; unique wrecks exist as one-shots. **Reference:** Everspace 2 wreck fields, Hardspace: Shipbreaker, Hades death economy.
- **Exists:** `aftermathWrecks.js` (persistent markers), `uniqueWrecks.js` (12 reservations), `salvage.js`, `survivorPod.js`, `surrenderRecovery.js`, wreck pack (44 models, PQ-136.00 fielded), `PQ-138.03` drift/tumble.
- **Routes through:** PQ-138.03; depth R1/R2 unique wrecks; GDX-A08/A13.
- **Writes:** `src/systems/aftermathWrecks.js`, `src/systems/uniqueWrecks.js`, `src/systems/salvage.js`, `src/systems/survivorPod.js`, `src/render/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Authored fracture seams.** Three to five seams per hull class; a slam above a threshold splits along one; pieces inherit motion and mass. | A wrecking-ball hit on a medium produces ≥ 2 pieces in the scenario; frame budget unchanged. |
| `.01` | **Wreck ecology.** Persistent wrecks attract scavengers (PQ-138.01), squatters, and traps; the field is an encounter place. | A wreck field older than one day has ≥ 2 inhabitants on the route. |
| `.02` | **Your own wreck.** Death leaves your hull and pod; recovery, surrender and custody paths reach them; NG+ can find them. | Save round-trip of the player wreck; one encounter references it. |

- **Not:** No general destruction solver; seams are authored.
- **How agents get this wrong:** A general fracture solver: seams are authored, few, and pooled; Wrecks that respawn scavengers forever: ecology has a budget and decays.

#### Pillar C · Economy, progression, identity

**`PQ-155` — Money means toys: the economy tuned as a verb curve** · *BETA* · after `PQ-137`, `PQ-142`

The curve is designed, not accreted: start-to-first-upgrade ≤ 15 min; hour by hour a new physical verb (tow class, head, field, slam survival); the Massline's ceiling is not behind a 2.5 M capital-hull tech; sinks (repairs, fines, insurance, restitution) and faucets (salvage, contracts, industry, stunts) balance; a headless ten-hour simulation prints the curve and the check gates it.

- **Gap:** Start 5,000 cr vs cheapest tech 6,000; spool ceiling behind 2.5 M; ending at 100 k of a 4.5 M curve; the 100 k → 4.5 M canyon is 40+ hours of repetition. **Reference:** Subnautica pacing, Endless Sky, Slay the Spire unlock cadence.
- **Exists:** `src/data/tech.js` (32 nodes), `ships.js` (14 hulls), `modules.js` (72), `economy.js`, `economyCycles.js`, `killRewards.js`, `careerContracts.js`, telemetry aggregates.
- **Routes through:** S2-05 long ladder; SPEC3-F1; GDX-A15/A17; PQ-142 verbs.
- **Writes:** `src/data/tech.js`, `src/data/modules.js`, `src/data/ships.js`, `src/data/killRewards.js`, `src/systems/economy.js`, `scripts/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The verb ladder.** A table of hour → verb → cost → gate; every tech node either unlocks a verb or is folded. | Table committed; ≤ 12 stat-only nodes remain, each justified. |
| `.01` | **The ten-hour simulation.** Headless economy sim with three player archetypes prints net worth, verbs unlocked and sinks per hour; a check asserts the ladder. | `check:economy:curve` green for all three archetypes. |
| `.02` | **Sinks that tell stories.** Repairs, fines, insurance, restitution, impound: each a receipt with a cause. | Each sink appears in a session ledger with its cause. |
| `.03` | **Stunts pay.** Trick receipts pay in reputation and salvage rights, never in raw credits (no grind-by-stunt). | A physics run earns ≥ the reputation of a gun run; credits equal. |
| `.04` | **Mining is a skilled verb.** The in-flight loop — pulse-scan, seams, the vent rhythm, magnet collect, tether-haul — reads and pays like the other verbs, with a measurable gradient (the Asteroid Works board is `PQ-130`'s separate surface). | A fixed-seed run shows ore-per-minute separates a clean pass from a sloppy one ≥ 2× on the same seam; a blind read names the vent bonus. |

- **Not:** No premium currency; no loot rarity.
- **How agents get this wrong:** Tuning credits by feel: the ten-hour deterministic simulation prints the curve and the check gates it; Paying stunts in credits: stunts pay reputation and salvage rights, never raw money (no grind-by-stunt).

**`PQ-156` — Three starters, three verbs, and a save-file identity** · *BETA* · after `PQ-137`, `PQ-142`

Confirmed by the owner 2026-09-03. New Game offers three starters that are verbs: the brawler (ram plate, shove gun), the skater (light, fast, the best swinger), the tug (heavy line, tow class, slow). Each has a distinct first ten minutes. The load screen is a portrait of the save: hull with scars, titles, rap sheet, the ace who hates you.

- **Gap:** One starter; the load screen is a list. **Reference:** Slay the Spire characters, Mount & Blade save cards.
- **Exists:** `src/data/newGameDefaults.js`, `ships.js` (Hitch/Wasp/Pelican), `src/ui/screens/newGame.js`, `saveLoad.js`, `livingHull.js`, `titles.js`.
- **Routes through:** PQ-142; GDX-A16.
- **Writes:** `src/data/newGameDefaults.js`, `src/data/ships.js`, `src/ui/screens/newGame.js`, `src/ui/screens/saveLoad.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Three starters.** Hitch (skater), a tug variant of Pelican, a brawler variant of Wasp; each with a kit and a sentence. | Three New Game routes complete the first ten minutes with distinct verbs; telemetry shows distinct funnels. |
| `.01` | **The save portrait.** Load screen renders hull + scars + titles + rap sheet + grudge. | Capture; save round-trip. |

- **Not:** No classes with locked abilities; any hull can buy any verb later.
- **How agents get this wrong:** Locking verbs to a starter: any hull can buy any verb later; starters are starting points; A load screen that lists files: it renders the ship's portrait and history.

#### Pillar D · Presentation

**`PQ-161` — Readable at max zoom: silhouettes, telegraphs, force colours** · *BETA* · after `PQ-137`, `PQ-140`

At the shipping camera and at max zoom-out, a miner looks like it mines, a customs ship looks official, a heavy communicates mass; danger is telegraphed (heat shimmer on guns, engine pitch on pursuers, a taut line glows); force colours (rope, wells, impulses) are distinct for every colour-vision type; a trajectory/force overlay exists only in the Range and the draw-to-fly preview.

- **Gap:** Silhouette identity routes through asset programs; telegraphs and force palette have no owner. **Reference:** Overwatch silhouettes, Hades telegraphs, Everspace 2 exhaust readability.
- **Exists:** PQ-050 fleet remaster, depth L1 livery, `src/data/palettes.js`, `factionPaletteClaims.js`, `SEMANTIC_PALETTE`, `threatHalo.js`, `intentGlyphs.js`.
- **Routes through:** PQ-050, depth L1/K1, GDX-A24, PQ-140.02 specialists.
- **Writes:** `src/data/palettes.js`, `src/data/factionPaletteClaims.js`, `src/ui/threatHalo.js`, `src/render/`, `src/ui/screens/range.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Role silhouettes.** Nine occupational roles with distinct silhouette rules checked at the shipping camera; livery per faction. | Blind reviewer names 8 of 9 roles from stills. |
| `.01` | **Telegraphs.** Every lethal thing announces itself 0.5–1 s ahead in motion, light or sound. | Death-cause telemetry shows ≥ 90 % of deaths preceded by a telegraph. |
| `.02` | **Force palette.** Rope, wells, repulsors, impulses, shields: five hues distinct under deuteranopia/protanopia/tritanopia; brightness order preserved. | Contrast check green under all three simulations. |
| `.03` | **Teaching overlay.** Trajectory and force ribbons in the Range and the stroke preview only. | Never rendered in ordinary flight (test). |

- **Not:** No floating labels as identity.
- **How agents get this wrong:** Solving identity with labels or recolours: silhouettes and behaviour; Showing the trajectory overlay in ordinary flight: Range and stroke preview only.

**`PQ-162` — The station as a place: the redesign the flatten was waiting for** · *BETA* · after `PQ-137`

The docked station is the second most used surface and the only one an owner-commissioned review called cheap screen by screen. Phase 6 flattened the stylesheet and borrowed tokens; the CREST/STAGE/APRON/DRAWER skeleton and the data-state and entity-link contracts have zero adoption across all seven screens. This packet is the redesign: one grammar, one hierarchy, the bar with a transcript, the industry tiers legible, orange doing one job, and docking that feels like arriving at a place with people (the mechanic of PQ-150 lives here).

- **Gap:** Flatten happened, redesign did not; zero skeleton adoption; review findings unverified (orange doing four jobs, bar transcript void, italic flavour outranking data). **Reference:** Hades hub, Hardspace: Shipbreaker hab, Starsector colony screens.
- **Exists:** src/ui/station/ (7 screens via stationApp.js), styles/station-workbench.css (34 --sf-* refs, 12 px floor), design/frontend/INSTRUMENT_GRAMMAR.md, design/frontend/reviews/STATION-TASTE-KIMI-2026-08-23.md, src/ui/entityResolver.js, screenMemory.js, whyReveal.js (17 adopters).
- **Routes through:** §11 Phase 6/7; RV-COMMAND-DECK (extract one interaction only); S2-06.
- **Writes:** `src/ui/station/`, `styles/station-workbench.css`, `src/ui/screens/stationHub.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Skeleton and data states adopted.** All seven station screens render through CREST/STAGE/APRON/DRAWER with the four data states and entity links; the legacy stationHub helpers are lifted out (Phase 7 as a refactor). | check:data-states and check:entity-links cover the station; zero legacy imports from stationHub.js. |
| `.01` | **Hierarchy and colour discipline.** One primary per screen, orange means one thing, italics never outrank data, the bar has a transcript, industry tiers read. | A cold reviewer verdict per screen; the Kimi findings closed one by one in the receipt. |
| `.02` | **Arriving somewhere.** Docking is a place: the berth with your hull, the mechanic, ambient work, one line of local news; screens open from the place, not from a tab strip. | Blind reviewer names the station from the docked view; capture. |

- **Concept companion:** Four nonbinding place briefs for the existing station route are retained in [`EXPANSION_STORY_AND_PLACES.md`](./design/spec3/EXPANSION_STORY_AND_PLACES.md#3-four-candidate-place-briefs). They inform `.02`'s sense of arrival without adding station types, approving assets, or redesigning the flight HUD.

- **Not:** No new station types; no redesign of the flight HUD.
- **How agents get this wrong:** Repainting the station again: the skeleton and the data-state and entity-link contracts must be adopted, measured by the checks; Redesigning the flight HUD on the way: out of scope; the attention pass stands; Deleting legacy modules before the live station stops importing them.

**`PQ-168` — The Chart finished: traffic layer, hierarchy, one answer per question** · *BETA* · after `PQ-137`, `PQ-151`

The Chart already answers routes, risk, prices, pressure, dossiers and route comparison. It still renders the same four navigation answers twice, gives nine tabs one size, keeps ~80 sub-12 px nodes, and has no traffic layer, so the living world the map is supposed to show is invisible on it. This packet finishes it: traffic density and convoys as a layer, heat (PQ-151) and contract pins as layers, one hierarchy, one inspector.

- **Gap:** J12b traffic layer deferred; duplication; single tab size; sub-12 px nodes; the strategic reviewer called it cheap admin. **Reference:** Starsector map, Endless Sky map, Highfleet strategic layer.
- **Exists:** src/ui/galaxyMap.js (routes, waypoints, risk, prices, layers, dossiers, comparison), src/ui/map/mapNavContext.js, mapAuthority.js, design/frontend/reviews/CHART_POLISH_REVIEW_2026-08-23.md, state.traffic (350 KB read by 0 UI files).
- **Routes through:** §11 J12/J12b; RV-MAP; WI-NAV-PLACES; GDX-A10/A27.
- **Writes:** `src/ui/galaxyMap.js`, `src/ui/map/`, `src/ui/mapAuthority.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Traffic and heat layers.** Convoys, traffic density and patrol presence from state.traffic; heat tiers from PQ-151; contract pins as a layer. | Toggling layers shows live traffic; layer state persists (screen memory). |
| `.01` | **One answer per question.** Merge mapNavContext and the Overview inspector; nine tabs get primary/secondary tiers; sub-12 px nodes to the floor by layout. | Zero duplicated answers; smallest text 12 px; cold review verdict. |

- **Not:** No second map; no fog-of-war rewrite.
- **How agents get this wrong:** A second map: one chart, one inspector; Adding layers without memory: layer state persists per save.

**`PQ-158` — Audio direction: the game that sounds heavy** · *RELEASE* · after `PQ-141`, `PQ-139`

The game currently ships muted by default because every sound is synthesised and the team knew it. The bus topology, adaptive-music matrix, ducking, voice cap and determinism isolation are already A-list; this packet supplies the content: a recorded/designed sample library for every cue family, an impact ladder (hull/rock/station × light/medium/heavy), the Massline as an instrument (tension to pitch, release snap, reel whine), boost stop, composed themes for the four states plus per-sector and per-faction identity through the Band, directed synthetic voice for the barks (eight faction registers; agents produce it, no recorded actors), a convolver reverb bus so a hangar and a void differ, and a mix that ducks music under weight.

- **Gap:** Zero authored audio files; 167 synth recipes share one timbre; no reverb; one collision sound; boostStop empty; Massline reel/release silent; barks are text. **Reference:** Hades, Deep Rock Galactic, Everspace 2, Rebel Galaxy Outlaw, Sea of Thieves mix.
- **Exists:** `src/audio/audioSystem.js` (8 buses, limiter, 68 subscriptions, 4-state stem matrix), `cuePriorityBus.js`, `audioActiveSet.js`, `bandBeds.js`, `src/data/audioRecipes.js` (171), `barks.js` (271 lines), settings 8 sliders; dead `reverbMix` params.
- **Routes through:** S2-07 audio identity; SPEC3-39 procedural audio; GDX-A26; PQ-139.01 sound by mass.
- **Writes:** `src/audio/`, `src/data/audioRecipes.js`, `assets/audio/`, `src/ui/screens/settings.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The sample library pipeline.** A licensed/authored sample library (recorded or designed offline) per cue family, encoded and residency-gated like assets; recipes become sample+synth hybrids. | ≥ 120 cues sample-backed; default unmute; frame-sleep counters unchanged. |
| `.01` (after PQ-139.01) | **The impact ladder, sample-backed.** Extends PQ-139.01 (which chooses pitch and gain from dp and mass on the synth path): the same 3×3 ladder (hull/rock/station × light/medium/heavy) gets layered transient/body/tail samples; scout-on-rock vs freighter-on-station stays ≥ 1 octave and ≥ 12 dB apart. | B9b table test; A/B capture. |
| `.02` | **The Massline as an instrument.** Tension to pitch, strain to grit, reel whine, release snap distinct from break, bridle chord. | All massline events audible and distinct; captions name them. |
| `.03` | **Composed themes.** Four state themes with motifs, per-sector beds, faction stings via the Band; the adaptive matrix drives authored stems. | A stranger hums the travel theme; per-sector bed identified blind. |
| `.04` | **Voice for the barks (directed synthetic voice; no recorded actors).** Eight faction registers produced by a directed text-to-speech pipeline agents can run (design/production/09 generated-media rules), radio-processed, with captions; the mechanic's voice the same way. No recorded actors are assumed anywhere in the plan. | All 271 lines delivered through the agentic pipeline; subtitles; determinism untouched; a stranger identifies the eight registers blind. |
| `.05` | **Space and mix.** Convolver reverb bus per environment class; weight-first ducking; audio cues for visual events (accessibility). | Hangar vs void audibly different; ducking table test. |

- **Not:** No audio in the sim; no cue without a cause.
- **How agents get this wrong:** Assuming recorded actors or a composer: directed synthetic voice and agent-produced samples; the pipeline must be runnable by agents; Adding audio to the sim: audio is presentation; determinism is untouched; Leaving the default mute in place after samples land: the unmute is part of done.

**`PQ-159` — Camera as art direction, and a photo mode** · *RELEASE* · after `PQ-141`, `PQ-139`

The camera is part of the art direction. Exceptional speed opens it toward 3× (B3); impacts kick in proportion to delta-V, not damage; a taut line between two bodies frames both; a rated moment gets a 150 ms beat and a bass drop; death gets a cam; photo mode with free camera, filters off by default and the composition ramp tuned so every screenshot sells the game.

- **Gap:** Speed zoom tops out at 1.55×; kicks are damage-driven; no auto-framing for two-body moments; no photo mode. **Reference:** Rocket League replay cam, Just Cause, Hades death cam, Everspace 2 photo mode.
- **Exists:** `src/render/camera.js`, `cameraDirector.js`, `velocityLanguage.js`, `feel.js` (FOV punch, trauma), `masslineReleaseArc.js`, `bulletTime.js`.
- **Routes through:** SPEC3-18 camera & juice; S2-02; PQ-139.00; PQ-146.03 moment detector.
- **Writes:** `src/render/camera.js`, `src/render/cameraDirector.js`, `src/render/feel.js`, `src/ui/screens/pause.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-137.03) | **Impacts kick and reduced motion holds.** Extends PQ-137.03 (which owns the speed-opens zoom curve): kick and trauma from exchanged momentum rather than damage, rate-limited, honouring reduce-motion; the zoom curve is not re-tuned here. | Kick magnitude table by momentum; reduce-motion capture shows none. |
| `.01` | **Two-body framing.** When a line is taut or a bridle exists, frame both bodies with the line as the diagonal. | Capture of a swing shows both bodies ≥ 90 % of the time. |
| `.02` | **The beat.** Rated moments get a 150 ms time dip, a camera hold, and a stinger; death gets a cam. | Fires on the moment detector only; headless sims unchanged. |
| `.03` | **Photo mode.** Pause, free camera, hide HUD, exposure, no filters by default; a capture path for store assets. | Reachable from pause; captures are used for the store page. |

- **Not:** No shake as feel; no cinematic camera in ordinary flight.
- **How agents get this wrong:** Re-tuning the speed-zoom curve here: PQ-137.03 owns it; this packet owns kicks, framing, the beat and photo mode; Shaking the camera on hits: kicks scale with momentum and honour reduce-motion.

**`PQ-160` — Replay, clips and sharing** · *RELEASE* · after `PQ-141`, `PQ-146`

Because the sim is deterministic, the last thirty seconds can be replayed from the input tape with a free camera. Rated moments (PQ-146) become clips automatically; the player exports a GIF or MP4; Crucible runs share a seed code and a ghost. This is the marketing engine and the community engine, and it costs little because determinism is already paid for.

- **Gap:** Replay exists only in the lab; no photo, clip or share surface. **Reference:** Rocket League, Halo theatre, Trackmania ghosts.
- **Exists:** `src/testing/lab/differentialReplay.js`, `src/core/simSnapshot.js`, input command snapshot, `survivalRecords.js` build codes, Electron packaging.
- **Routes through:** GDX-A30 determinism; §12 Crucible.
- **Writes:** `src/core/simSnapshot.js`, `src/core/inputCommandSnapshot.js`, `src/testing/lab/differentialReplay.js`, `src/ui/screens/`, `electron/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Ring buffer and replay.** Keep 30 s of snapshots + inputs; replay in-game with the photo-mode camera. | Replay matches live to the hash; UI reachable from pause. |
| `.01` | **Auto-clip.** Moment detector marks a window; the clip list shows it; export GIF/MP4 via the packaged host. | A bolas kill produces an exportable clip in Electron and a downloadable one in browser. |
| `.02` | **Seeds and ghosts.** Crucible runs export a seed/build code; a ghost of a shared run renders as a translucent hull. | Two machines reproduce the same run from the code. |

- **Not:** No cloud service; sharing is files and codes.
- **How agents get this wrong:** Recording video instead of replaying the sim: the sim is deterministic; replay the tape; A cloud service: sharing is files and codes.

#### Pillar E · First hour, UX, platform

**`PQ-163` — The first ten minutes: the power fantasy, honest** · *ALPHA* · after `PQ-137`

The onboarding rail already teaches thrust, brake, latch, winch, cut and dock in-world with a verb-then-silence rhythm; it never teaches boost, draw-to-fly or wells, and the first shove is impossible with the starter gun. This packet re-cuts the opening around the store-page sentence — light ships are ammunition, swing a rock, keep the speed — as a scripted-but-honest rescue: you are a tow rig, a scout is chasing a tug, you swing a rock into a derelict for scrap, fling the scout into an asteroid, grab the pod and run. Then the 47-A scene plays as the climax it already is.

- **Gap:** Boost/draw-to-fly/wells untaught; starter gun cannot shove; the quality cliff after 47-A. **Reference:** Portal, Half-Life, Doom (2016) intro, Subnautica.
- **Exists:** `src/onboarding/flightDrill.js`, `src/systems/onboarding.js`, `src/ui/hudAttention.js` hints, `src/ui/screens/range.js`, `scripts/check-first-15-runtime.mjs`, 47-A scenario.
- **Routes through:** S2-03 first hour; M3-CAREERS/M3-NAV-HUD; GDX-S03/A28; PQ-137.05 starter force.
- **Writes:** `src/onboarding/`, `src/systems/onboarding.js`, `src/ui/hudAttention.js`, `src/ui/screens/range.js`, `src/data/scenarios/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-137.05) | **The rescue.** A tow-rig opening at the reference site with one swing-release, one shove, one grab-and-run, in play, no walls. | ≥ 80 % of unaided testers complete it in ≤ 10 min; telemetry funnel. |
| `.01` | **The Range is the door.** Onboarding points at the Range (F4) after the first latch; the SWING, DO NOT PULL rung is the first drill; the empty Power Rail slots explain themselves. | Funnel shows ≥ 60 % of new players open the Range in hour one. |
| `.02` | **Teach the missing three.** Boost, draw-to-fly and the well enter the rail in the first hour, each as a verb-then-silence beat with a Range fallback. | Funnel shows each used unprompted within the hour by ≥ 70 %. |
| `.03` | **The sentence, proven.** The store-page sentence is shown once and each clause is performed by the player before minute ten. | A stranger states the fantasy back correctly after playing. |
| `.04` | **The cliff.** Beat 1 after 47-A is a set piece (PQ-152), never an errand. | Session-2 retention in playtests ≥ 60 %. |

- **Not:** No mentor dialogue; no tutorial text longer than one line.
- **How agents get this wrong:** Teaching with text: every verb is taught by doing with silence after; the Range is the fallback; A mentor with dialogue: the rescue is fiction, the teaching is play; Leaving boost, the stroke and the fields untaught because the rail 'works': the funnel proves each is used unprompted.

**`PQ-167` — Telemetry funnels and the weekly playtest loop** · *ALPHA* · after nothing

Telemetry already captures onboarding milestones, kills, deaths by cause, trade and credits locally; nobody can read it. This packet exports a session report (funnel: first flight, first swing, first shove, first dock, first heat; session length; death causes; verbs used per hour), runs a weekly owner playtest with captures and a one-page findings sheet, and makes the ALPHA/BETA gates in §15.1 computable from it.

- **Gap:** Telemetry is local-only, reachable via a window global; no export, no funnel, no playtest ritual. **Reference:** Any shipped indie's playtest cadence; Supergiant's weekly plays.
- **Exists:** `src/systems/telemetry.js`, `src/observability/sessionObserver.js` (unwired), `motionTelemetry.js`, receipts machinery.
- **Routes through:** SPEC3-41; PROD-OBS-CAP; §1A observability.
- **Writes:** `src/systems/telemetry.js`, `src/observability/`, `scripts/`, `design/program/roadmap/receipts/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Session report.** Export a JSON + one-page Markdown report per session from the existing aggregates; opt-in upload later. | Report renders for any saved session; funnel fields present. |
| `.01` | **The weekly playtest.** A protocol: owner plays 45 minutes on a clean build, capture + report + three findings routed to packets. | Four consecutive weeks recorded in receipts. |
| `.02` | **Gates from data.** ALPHA/BETA numeric gates computed from reports (completion %, verbs/hour, session-2 return). | `check:playtest:gates` prints the §15.1 rows. |

- **Not:** No PII, no network without opt-in.
- **How agents get this wrong:** Uploading anything by default: local, opt-in, no PII; A playtest without a report: forty-five minutes, a capture, three findings routed to packets.

**`PQ-173` — The fun-loop instrument: bench, measure, critic, report, translator** · *ALPHA* · after nothing

Agents can run the Fun Convergence Loop end to end without a human: one command plays the bench on fixed seeds (headless for numbers, headed for frames), prints every FEEL_CONTRACT bar plus the fun metrics (verbs per minute, consequences per action, time to first consequence, moments per minute, nothing-happened seconds, deaths by cause, knock budget on the player), writes frame strips at the shipping camera, feeds a vision critic the ten-question rubric, and renders the one-page plain-words report. The translator protocol turns the owner's weekly verdict into a scenario, a fundamental and a bar. This packet is the answer to "I don't know what else to prompt but make it better."

- **Gap:** Nineteen deterministic scenarios, a sixty-second capture script, a fixed-seed Crucible route check and a manager loop exist; nothing chains them into play → measure → judge → fix → compare → report, and no fun metric is printed anywhere. **Reference:** Supergiant's weekly plays, Rocket League telemetry, RimWorld storyteller tuning.
- **Exists:** tools/agentic/scenarios.json (flight-slalom, flight-reversal, flight-accel-brake, collision-recovery, duel-1v1, mixed-wing, swarm-12, vfx-*), scripts/capture-gameplay-60s.mjs, scripts/check-crucible-route.mjs (fixed seed, real browser), scripts/check-crucible-run.mjs, Motion Lab src/testing/lab/ (runScenario, inputTape, replay, metricRegistry), src/systems/motionTelemetry.js, src/systems/telemetry.js, tools/agentic/manager_cycle.py, design/production/04_GAMEPLAY_OBSERVATORY.md capture contract.
- **Routes through:** design/program/FUN_CONVERGENCE_LOOP.md (the law); CENTRAL_BRAIN.md; PQ-167 telemetry; PQ-146 moment detector; PROD-OBS-CAP.
- **Writes:** `scripts/`, `tools/agentic/`, `src/testing/lab/`, `src/systems/motionTelemetry.js`, `design/program/roadmap/receipts/fun-loop/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The bench.** One command runs the Crucible feel bench (swarm ruleset, three arenas × three loadouts incl. the shove weapon and the rope kit, first three waves, three fixed seeds each), the flight bench and the verb benches, headless; a --headed flag records frame strips at the shipping camera with HUD text off. | Two runs of the same seed hash identical; strips land under receipts/fun-loop/. |
| `.01` | **The measurer.** Prints every reachable FEEL_CONTRACT bar and the fun metrics per run as JSON + Markdown; a before/after diff mode compares two runs on the same seeds. | Every §B bar the bench can reach appears with a number; the knock budget on the player is measured. |
| `.02` | **The critic.** A prompt + harness that hands frame strips and metrics to a vision-capable model with the ten-question rubric and returns yes/no with frame indices and the ONE fundamental in the §A audit format; runs with a model that did not make the change. | The critic reproduces the 2026-09-03 audit findings on a pre-fix build (governor brake, NPC clamp, terrain helm) from frames alone. |
| `.03` | **The report and the translator.** Render the one-page owner report (found / changed / what you will feel / numbers / frames / next) and encode the verdict-to-bar translator protocol as a checklist the agent must fill before touching code. | One real cycle run end to end and committed with its report; the owner reads it without asking what a term means. |

- **Not:** No new game systems; no detector promoted to a hard gate without the observatory calibration rule; the critic never proposes content.
- **How agents get this wrong:** A bench with random seeds: fixed seeds, or the run is an anecdote; A critic that made the change: the critic is a different model that can see; A report in engineering terms: the owner reads it; no file names, no jargon; Turning the instrument into a harness treadmill: one real cycle committed is the done-when, not more tooling.

**`PQ-164` — Input truth: controller, Deck, trackpad, haptics** · *RELEASE* · after `PQ-141`

Every player verb and every screen works on gamepad with glyphs that follow the active device; remapping persists; Steam Deck is verified at its resolution; the trackpad (the owner's stated hand) has honest gestures for the Massline and draw-to-fly; haptics carry line tension and slams.

- **Gap:** Fixed pad map, no remap, keyboard-only glyphs, menu coverage unverified per screen, no Deck work. **Reference:** Hades controller parity, Steam Deck Verified.
- **Exists:** `src/systems/gamepad.js`, `touch.js`, `src/ui/input.js` roving focus, `bindings.js` promptLabel, settings 24-action rebind.
- **Routes through:** GDX-A28; S2-08 input completeness.
- **Writes:** `src/systems/gamepad.js`, `src/systems/touch.js`, `src/ui/input.js`, `src/ui/bindings.js`, `src/ui/screens/settings.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Every screen on a pad.** Per-screen verified navigation for all 27 screens and the station; a check walks them. | `check:gamepad:screens` green. |
| `.01` | **Glyphs and remap.** Device-aware prompt glyphs; gamepad remapping with conflict detection; persists through save/profile. | Settings-profile check green; capture on both devices. |
| `.02` | **Deck and trackpad.** Deck resolution/scale verified; trackpad gestures for latch/reel/throw and stroke. | Deck capture at 1280×800; trackpad route completes the first ten minutes. |
| `.03` | **Haptics.** Line tension, slams and boost on gamepad rumble/triggers; off by default in reduce-motion. | Table test of intensity by momentum. |
| `.04` | **The twin-stick scheme.** Top-down twin-stick is this game's natural home: left stick drives, right stick aims — a controller-first pass over flight, rope and fire, not only menus. | The 60-second proof scenario completes on twin-stick alone; the scheme is selectable and suggested on pad connect. |

- **Not:** No touch-only UI path.
- **How agents get this wrong:** Verifying gamepad on the HUD only: every screen in the manifest, walked by a check; Keyboard glyphs on a pad: glyphs follow the active device.

**`PQ-165` — Accessibility and options depth** · *RELEASE* · after `PQ-141`

One-click Low/Medium/High presets and a frame cap join the existing per-toggle settings; every voice line has captions; visual events have audio cues; assists (auto-aim as accessibility, release assist, orbit assist) are discoverable; colourblind, motion, flash, dyslexia and UI-scale options already exist and are verified on every screen.

- **Gap:** No presets or frame cap; no subtitles for audio; no audio cues for visual events; gamepad remap missing (PQ-164). **Reference:** Celeste assist mode, Hades accessibility, Xbox Accessibility Guidelines.
- **Exists:** `src/ui/screens/settings.js` (5 tabs, colourblind/contrast/flash/dyslexia/captions/UI-scale), `adaptiveQuality.js`, `check-wcag-contrast.mjs`, `check-ui-a11y.mjs`.
- **Routes through:** GDX-A29; RV-POLISH; S2-06.
- **Writes:** `src/ui/screens/settings.js`, `src/render/adaptiveQuality.js`, `src/audio/audioSystem.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Presets and frame cap.** Low/Medium/High map to the adaptive-quality tiers; frame cap 30/60/120/off; VSync honoured. | Preset switch captured; frame cap measured. |
| `.01` | **Captions and audio cues.** Captions for all voice; audio cues for wells, tethers taut, telegraphs when 'audio cues' is on. | Every voiced bark captioned; cue table test. |
| `.02` | **The checklist.** An accessibility statement in-app and the checklist (contrast, motion, remap, text scale, assists, captions) verified per screen. | Checklist green; statement reachable from settings. |
| `.03` | **Reduced motion keeps the information** (phase A). With reduce-motion on, every directional cue, state transition and readable timing survives without FOV punch, shake or time distortion. | A strip pair (motion on / reduce-motion) of the same seed at the shipping camera; a critic names the same events from both. |

- **Not:** No universal visual style; accessibility does not flatten the art.
- **How agents get this wrong:** Presets that cut content: presets map to the adaptive-quality tiers, never to fewer actors; Captions for some voice: all of it.

**`PQ-166` — Localization at launch: five languages and the growth test** · *RELEASE* · after `PQ-141`

Localization is ahead of a typical indie already: a real runtime, a generated catalog and a pseudo-locale in CI. This packet ships it: five languages (EN, FR, DE, ES, PT-BR or per market data), a language setting, font fallback for the display face, and a +40 % growth pass that clips nothing.

- **Gap:** Locale only via URL; default route English-only by assertion; no language setting; growth unverified on the station. **Reference:** Standard Steam launch matrix.
- **Exists:** `src/localization/gameLocalization.js`, pseudo-locale, placeholder-parity tests, `test/localization-reachability.test.mjs`.
- **Routes through:** §11.11 #9.
- **Writes:** `src/localization/`, `src/ui/screens/settings.js`, `test/localization-reachability.test.mjs`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Language setting and default-route bridge.** Settings language picker; the DOM bridge installs for any locale; the reachability test flips to 'default stays English unless chosen'. | Switching language live re-renders every screen. |
| `.01` | **Growth pass.** Pseudo-locale at +40 % on every screen and the HUD; fix clipping by layout. | Zero clipped strings in the capture sweep. |
| `.02` | **Five languages.** Translation pipeline (machine first, human review for the bark corpus and store copy); fonts. | Five catalogs ship; store page in five languages. |

- **Not:** No VO localization at launch; captions only.
- **How agents get this wrong:** Machine-translating the bark corpus without review: registers need a human-quality pass by an agent with the register sheet; Testing growth in English: +40 % pseudo-locale on every screen.

**`PQ-033` — Final platform, save, performance, accessibility, legal and store closeout** · *RELEASE* · after `PQ-141`, `PQ-158`, `PQ-164`, `PQ-165`, `PQ-166`

The game ships. There is a LICENSE, third-party notices and a credits screen (three.js and Rapier notices are required; asset licenses exist on disk but are not packaged); the Electron build reports crashes, updates itself, and shows its version; min-spec floors are met (60 fps median, ≤ 1 hitch > 50 ms per minute, boot ≤ 10 s, heap growth < 30 MB / 30 min); a two-hour crash-free soak passes on both hosts; save/continue never dead-ends over 200 cycles; store page, trailer and screenshots exist.

- **Gap:** No root LICENSE/NOTICE/credits; no crashReporter; no auto-updater; no version in UI; presets/frame cap missing (PQ-165). **Reference:** spec2/08 release readiness; Steam launch checklist.
- **Exists:** electron-builder targets, `build/web/spaceface-release-build.json` (unread), save system (5 slots, checksum, migration, rollback), `check:all`, runtime witness, adaptive quality.
- **Routes through:** S2-08; M6-PERFORMANCE/M6-RELEASE; §8; PQ-144; retired plan superseded by this packet: design/program/roadmap/retired/PQ-033.md.
- **Writes:** `electron/`, `package.json`, `build/`, `src/ui/screens/mainMenu.js`, `src/ui/screens/pause.js`, `LICENSE`, `NOTICE`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Legal and credits.** Root LICENSE, third-party NOTICE bundled into the packaged files list, an in-app credits screen, privacy and accessibility statements. | Packaged build contains every required notice; credits reachable from the title. |
| `.01` | **Crash reporting, auto-update, version.** Electron crashReporter to a store or file, electron-updater, version/build string in the title and pause screens. | A forced crash produces a report with the build hash; an update applies. |
| `.02` | **Min-spec floors and soak.** Named min-spec GPU; floors measured; two-hour soak on both hosts; 200 save/load cycles. | Floors green on min-spec; soak logs attached. |
| `.03` | **Store readiness.** Steam build, cloud saves, achievements (from telemetry aggregates and survivalRecords), store page assets from PQ-159/160. | Store page live in test; achievements unlock in a session. |

- **Not:** No feature work inside the gate; a measured blocker is repaired, never hidden.
- **How agents get this wrong:** Feature work inside the release gate; Hiding a measured blocker or lowering default quality to pass a floor.

#### Pillar F · Modes and replayability

**`PQ-169` — Crucible as the replay surface: daily seed, ghosts, mutators, cosmetics home** · *BETA* · after `PQ-133`, `PQ-146`

The Crucible becomes the one-more-run surface: a daily seed everyone plays, local and Steam leaderboards, ghost replays of shared runs, weekly mutators (three wells bend the arena; heavy-only; no guns), stunt scoring from PQ-146, and, only if it earns its place, cosmetics that carry home under §12.2's rule (crossover is optional, not a goal).

- **Gap:** Records and build codes exist; no daily, no board, no ghosts, no stunt score. **Reference:** Spelunky daily, Slay the Spire, Vampire Survivors, Trackmania.
- **Exists:** `survivalRecords.js`, `survivalMutators.js`, `survivalDraft.js`, `survivalSwarm.js`, `survivalUnlocks.js`, build codes.
- **Routes through:** §12 PQ-133; PQ-135; PQ-146; PQ-160 ghosts.
- **Writes:** `src/systems/survivalRecords.js`, `src/systems/survivalMutators.js`, `src/systems/survivalDraft.js`, `src/systems/survivalUnlocks.js`, `src/ui/screens/crucible.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Daily seed and board.** Date-seeded run; local board; Steam board when PQ-033 lands. | Two machines get the same daily; board persists. |
| `.01` | **Ghosts.** A shared run's input tape renders as a translucent ghost hull in your run. | Ghost matches the shared hash. |
| `.02` | **Weekly mutators.** Gravity slalom, heavies only, weapons cold, reef arena; rotate by week. | Four mutators live; each changes the top strategy (telemetry). |
| `.03` | **The hangar feed (optional; cosmetics only).** If it earns its place: draft unlocks carry cosmetics into adventure and adventure titles show in the Crucible. The owner ruled crossover optional, not a goal; §12.2 stands (unlocks carry no power). | Either one cosmetic round-trips, or the leaf is closed as not needed with the owner's word. |

- **Not:** No online multiplayer; asynchronous only.
- **How agents get this wrong:** Feeding stats into adventure: cosmetics only unless the owner overrides §12.2; Network play: asynchronous only.

**`PQ-171` — Content grammar and the anti-repetition budget** · *BETA* · after `PQ-138`

Depth from combination, not count: an encounter grammar (situation × place × twist × actor) with variation axes, the 58-microevent catalogue and eight chance encounters scheduled by the storyteller, and a repetition meter over telemetry that flags any encounter shape seen more than N times per hour. The warehouse-of-features guard is a check.

- **Gap:** Ten verbs and 65 one-shots; nothing measures repetition. **Reference:** Spelunky level grammar, Hades encounter variety, Sea of Thieves world events.
- **Exists:** microevent library (58), `encounterScripts.js`, `encounters/` (48), `chanceEncounters` (8), `ambushSignatures.js`, `attackTraits.js`.
- **Routes through:** GDX-A23; depth E1; SPEC3-29.
- **Writes:** `src/data/encounters/`, `src/systems/encounterScripts.js`, `design/incubator/microevent_library/`, `scripts/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The grammar.** Document + data: axes and constraints; every encounter declares its shape. | All encounter files carry a shape; validator green. |
| `.01` | **The repetition meter.** Telemetry counts shapes per hour; a check fails when any shape exceeds its budget over a 10-hour sim. | `check:content:repetition` green. |

- **Not:** No procedural sprawl.
- **How agents get this wrong:** Measuring variety by count: the meter counts shapes per hour against a budget; Procedural sprawl to 'add variety'.

**`PQ-170` — Endgame pulls: territory, mega-heists, capital bosses, legendary lines, station growth** · *POST* · after `PQ-033`

The post-ending sandbox has pulls that are verbs: territory wars where your wrecking-ball and blockade skills tilt fronts; two mega-heists at the campaign's craft level; capital bosses as physics puzzles; legendary Massline heads with a lineage; and the two vision promises with no system yet — a station that visibly expands because of you, and a faction that depends on something you built.

- **Gap:** No faction endgame; no station growth; no faction dependency; post-ending chains reuse ten verbs. **Reference:** Starsector late game, Mount & Blade wars, Hades heat.
- **Exists:** `factions.js` wars without the player, `conflictReactions.js` (2 sets), `claims.js` convoys, `postEndingReplayChains.js`, SPEC3-F6 territory, SPEC3-22 bosses, unique wrecks.
- **Routes through:** S3-F6-BASES; RV-BASES; WB-WORLD-AFTER; PQ-145.
- **Writes:** `src/systems/factions.js`, `src/data/conflictReactions.js`, `src/systems/claims.js`, `src/data/postEndingReplayChains.js`, `src/data/sectors.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Fronts you can tilt.** War fronts as physical situations (blockade lanes, siege a bastion by wrecking ball) with visible ownership change. | A player action flips one sector's owner in a scenario; reactions for 8 factions (not 2). |
| `.01` | **Station growth and dependency.** A station gains a module because of player-supplied throughput; a faction's patrols depend on your depot. | Both visible on the route within one session of play; save round-trip. |
| `.02` | **Two mega-heists and two capital bosses.** Authored at 47-A craft; physics-solvable. | Owner verdict per piece. |
| `.03` | **Legendary lines.** Ace trophy heads with lineage and recognition. | One trophy head per ace tier; NPCs bark about it. |

- **Not:** No empire spreadsheet; numbers measure, never replace.
- **How agents get this wrong:** An empire spreadsheet: fronts are physical situations the player tilts with verbs; Reusing the ten procedural verbs for the endgame: heists and bosses at 47-A craft.

**`PQ-172` — Mods and data-driven content** · *POST* · after `PQ-033`

The community can add a ship, a weapon, an encounter or a sector by dropping JSON that the same validators check; determinism and save schema are protected by the loader. Workshop integration follows the Steam build.

- **Gap:** All content is compiled ES modules; one JSON scenario. **Reference:** Starsector, RimWorld modding.
- **Exists:** `src/data/` (135 modules), `47a.scenario.json`, data validators (`check-data.mjs`, `check-data-refs.mjs`).
- **Routes through:** GDX-A23; S3-F9.
- **Writes:** `src/data/`, `scripts/check-data.mjs`, `src/main.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **JSON content loader.** Weapons, modules, encounters and places load from a user content directory through the existing validators; mods are listed in-app. | A sample mod adds a weapon and an encounter; determinism hash unaffected without the mod. |
| `.01` | **Workshop.** Steam Workshop publish/subscribe for the same directory. | One mod round-trips through Workshop. |

- **Not:** No script mods at launch.
- **How agents get this wrong:** A loader that bypasses the validators or the save schema; Script mods at launch.

### 15.5 The toy chest — the funnest things this premise can do that it does not do yet

Each toy is a combination of verbs that already exist or are in `PQ-137`; none needs a new system.
The physics that makes it work and the story it produces are the acceptance test: if a toy cannot be
described as "I did X and Y happened, so then Z", it is content, not a toy. Owner of each is named.

| # | Toy | The physics | The story it produces | Owner |
|---|---|---|---|---|
| T1 | **The bolas** | Twin Bridle ties two light hostiles; their coupled inertia makes them orbit each other; the pair lawn-darts into the nearest rock. | "I solved a three-on-one with one throw." | `PQ-031` |
| T2 | **The wrecking ball** | Rope a house-sized rock, two orbits of spin-up (reel in to speed up), release into a pirate outpost or a capital's flank. | The belt's favourite tall tale; a scripted contract and an emergent habit. | `PQ-137.07`, `PQ-152` |
| T3 | **The clothesline** | Anchor a line across a seam chokepoint (anchor bolt head); a pursuer at full burn clotheslines it. | Geometry as a weapon, zero ammo spent. | `PQ-029`, `PQ-027` |
| T4 | **Anchor ski / convoy parasite** | Latch a heavy hauler, kill thrust, ride through its escort screen; release into a slingshot attack; or tether two haulers so their autopilots fight the coupling and the convoy jackknifes. | Hitchhiker piracy without firing a shot. | `PQ-137.09`, `PQ-031` |
| T5 | **Well golf / gravity bowling** | Drop a well behind a fleeing target so its escape vector curves into your minefield; or shove an asteroid into a well's centre so it accelerates through a cluster. | "He escaped straight into my trap." | `PQ-147`, `PQ-137.09` |
| T6 | **Ore shotgun / cargo as ammunition** | Concussion-shove a full cargo pod; its mass makes it a scattergun shell. Volatile cargo detonates, corrodes, or drags. | The cargo you were hired to protect is what killed the pirates. | `PQ-148` |
| T7 | **The ore-crusher trap / station-door jam** | Pull a latched target backward into an excavator's jaws; shove a burning hull into a station's hangar aperture to jam reinforcements. | Industrial machinery finishes what you started. | `PQ-027` |
| T8 | **Momentum-bungee joust / ram-plate duels** | Momentum sink on a rock, burn away until the line is critical, release: you slingshot back through the pursuer at triple engine speed; named aces answer with head-on ram passes. | A duel the radio talks about for days. | `PQ-026`, `PQ-150` |
| T9 | **Dead man's mass** | Wrecks keep momentum; shove a fresh kill's hulk into its own reinforcements. | "His own wingman finished him." | `PQ-138.03`, `PQ-154` |
| T10 | **Pod rescue under fire** | Survivor pods drift through a live firefight; tow them out while their inertia betrays you; rescue the faction that wants you and watch heat decay. | The save you brag about. | `PQ-138`, `PQ-151` |
| T11 | **The long tow** | Haul a derelict capital hulk across two sectors for salvage rights; its mass attracts pirates the whole way. | The slowest, tensest hour in the game. | `PQ-152`, `PQ-154` |
| T12 | **Mine pinball** | Radial mines chained in a debris reef; one detonation cascades the reef into a kill-box. | "Twenty minutes to set up and worth it." | `PQ-137.09`, `PQ-027` |
| T13 | **Ace's trophy line** | Beat a named ace and salvage their reinforced Massline head; it holds heavier loads and NPCs recognise it. | Your rope has a lineage. | `PQ-150`, `PQ-142` |
| T14 | **Draw-path ambush** | Sketch a loop around a rock, release the autopilot, man the guns while the ship flies the trick; towing a rock while doing it makes the rock a moving shield. | You choreograph the kill; the sim performs it. | `PQ-137.08` |
| T15 | **Decoy pod / contraband drop-kick** | Jettison a pod packed with an impulse mine for a greedy ace; or decouple contraband at cruise and ram-plate it through a customs cone into an outlaw station's catch net. | Smuggling as physics. | `PQ-148`, `PQ-151` |

### 15.6 The collisions — existing systems that should talk (the cheapest depth in the game)

`PQ-138` owns the first three (audited zero-listener events). The rest are assigned below; each is a
listener and a rule, never a new system. The trigger and the consequence are the acceptance test.

| # | Collision | Trigger → consequence | Owner |
|---|---|---|---|
| C1 | Law × spilled cargo | A hauler breaks up in a firefight → the patrol prioritises securing the spill over chasing you; an escape vector opens. | `PQ-138.00/.01` |
| C2 | Wreck × scavenger | A wreck appears → scavenger jobs dispatch on the event; mines on a wreck become an emergent ambush. | `PQ-138.01`, `PQ-154` |
| C3 | Violence × civilians | Gunfire within 300 WU → haulers flee/re-route, workers hold, a tug keeps its tow. | `PQ-138.02` |
| C4 | Ace memory × tether abuse | Your third fling-kill of a faction → its ace spawns with line-cutters and a momentum sink, and says so. | `PQ-150` |
| C5 | Well × route hauler | A well on a lane pulls a heavy off-axis → escort pile-up → the station's trade volume dips for a day. | `PQ-147`, `PQ-155` |
| C6 | Mass slam × station | A shoved wreck through a docking ring → dock fines, repair services down ten minutes, insurance premium up. | `PQ-151`, `PQ-138.05` |
| C7 | Pods × pirate hunt | Damaged pirates break off to capture ejected pods for ransom → sacrificing a pod drops aggro. | `PQ-150`, `PQ-138` |
| C8 | Economy × seam smashing | Shatter a platinum seam with a slam → local ore floods, metal prices drop, haulers reroute. | `PQ-155` |
| C9 | Draw-path × towing | Sketch while towing → the follower accounts for the coupled mass; the rock becomes a perimeter shield. | `PQ-137.08` |
| C10 | Tumble × faction battle line | Tumble a destroyer → its point defence rakes its own fleet for the duration. | `PQ-140.01`, `PQ-137.04` |
| C11 | Heat × contracts | WANTED → the board offers double-pay deniable jobs with ambush clauses. | `PQ-151`, `PQ-138.04` |
| C12 | Mining × pirates | A depleted seam's output drops → ambush frequency on that route rises with scarcity. | `PQ-149`, `PQ-155` |

### 15.7 What this game will NOT build (ruled by the owner, 2026-09-03; binding on every packet)

The owner answered the proposed list in plain words. The rulings, in the owner's terms:

- **No multiplayer.** Asynchronous sharing only: daily seeds, ghosts, clips.
- **No walking around and no ship interiors.** The ship is the character.
- **The view stays top-down.** The ships already tumble in 3D on screen; the flying stays on the plane.
- **Random or procedural content is neither wanted nor banned.** What is banned is anything agents
  cannot test: every bench and every scenario uses fixed seeds (`FUN_CONVERGENCE_LOOP.md` §2).
- **Wingmen stay small.** The Z wheel that exists is enough; no bigger fleet layer. The "fleet
  command" wording the owner sees on the regular UI is a candidate for the surface passes (`PQ-162`,
  `PQ-168`).
- **The owner's own ship is never knocked around.** Bumps and scrapes must not shove or spin the
  player's hull; only a deliberate big event may, and it must be legible (`FEEL_CONTRACT.md` B13,
  `PQ-137.11`).
- **Enemies do not become damage sponges,** and hits never scale with a level. Mass and momentum decide.
- **Loot rarity is allowed** if it ever earns its place; a crafting grind is not a goal either way.
- **No dialogue trees. One linear story that builds.** Branching and "replay value" are not goals; the
  endings that exist stay, and no new branch work is admitted (`PQ-032`).
- **Camera shake is not a fix** and never was the point; the problems are fundamental. Spectacle is
  never a substitute for the event underneath.
- **One architecture for every mode.** Crucible, sandbox, campaign: one game path.

### 15.8 Session shape (what pulls the player forward, by hour)

| Window | What happens | The pull |
|---|---|---|
| **0–10 min** | Wake in a tow rig with a Massline. A scripted-but-honest rescue makes you swing a rock into a derelict, grab the scrap, and fling a pursuing scout into an asteroid. Credits land; the hangar opens. No exposition. (`PQ-163`) | "The rope is real and I want more." |
| **10–60 min** | Three verbs mastered (line, shove, tow); first paid contract; first accidental heat; first scar on the hull; the map opens; the rap sheet begins. (`PQ-163`, `PQ-155`, `PQ-151`) | The map and the rap sheet. |
| **1–10 h** | Hull two; two sector biomes; first ace rivalry; first capital tow; the Crucible unlocks at hour three as the one-more-run slot; stronger lines, heavier ram plates, deployable wells — never "+10 %". (`PQ-153`, `PQ-150`, `PQ-142`, `PQ-169`) | Rivalry and gear lineage. |
| **10–25 h** | Heavy-class verbs (moving terrain, fields), faction wars you tilt, a campaign climax built from the toys, an ending that changes the sandbox's facts. (`PQ-032`, `PQ-152`, `PQ-170`) | Legacy and mastery. |
| **After** | The post-ending sandbox with your scarred hull and notoriety; Crucible seasons; territory. (`WB-WORLD-AFTER`, `PQ-170`, `PQ-172`) | "So then…" |

Three modes, one save identity: the campaign ends with a set piece you built toward and unlocks the
post-war sandbox state rather than replacing it; Crucible drafts feed the hangar with possibility, never
stats (§12.2 stands).

### 15.9 Outside opinions, graded (2026-09-03)

Gemini 3.8 Flash and Kimi K3 were asked, independently, what an A-list version of this game has that
this build lacks, the funnest toys, the collisions, the session shape, and what not to build.

- **Agreement with the audit (adopted):** hitstop and an impact-sound ladder by mass are the highest-
  ROI presentation fixes (both #1/#2); the world must flinch (patrol chooses, civilians scatter,
  scavengers swarm spills); cargo as physics; aces as recurring rivals with counter-loadouts; six dense
  authored sectors over procedural sprawl; a first ten minutes that hands the player a Massline kill;
  wrecks as terrain; a death economy that seeds your wreck, pod, and reputation; readable telegraphs;
  the refusals list. Both graded **strong**.
- **Adopted with a guard:** Gemini's trajectory/force-vector ghost ribbons — only as a Range/teaching
  overlay and the draw-to-fly preview, never a permanent HUD layer (`VISION`: if you cannot see the
  state it does not exist, but a diagram is not the state). Gemini's DualSense haptics — after
  controller parity, not before. Kimi's "Crucible drafts feed the hangar" — cosmetics and possibility
  only, §12.2's "never permanent stats" holds.
- **Declined:** Gemini's "pressurised hull vs void sound dampening" (there is no interior); Gemini's
  procedural multi-part fracture as a system (wrecks fracture along a few authored seams in
  `PQ-154`, not a solver); Kimi's mentor-character tutorial as a dialogue vehicle (the rescue is
  fiction, the teaching stays in play).
- **The one thing they both said that the map had not:** the game needs a **12-word fantasy the store
  page promises and hour one proves** — "light ships are ammunition; swing a rock; keep the speed" —
  and `PQ-163`'s done-when is that sentence, verified by a stranger.

### 15.9b The Studio Recovery Audit (2026-09-05), graded

Moved to [build_map_done.md](./build_map_done.md) — completed/historical, kept verbatim for review. Does not dispatch work.

### 15.10 Dispatch

- **Numbering:** `PQ-157` is deliberately unassigned (its draft, player bases and territory, folded into `PQ-170` and the existing `S3-F6-BASES` / `RV-BASES` rows). Do not fill it.
- **Door, feel:** "make it better" / "it sucks" / "it's not fun" → [`design/program/FUN_CONVERGENCE_LOOP.md`](./design/program/FUN_CONVERGENCE_LOOP.md) → copy [`FUN_CONVERGENCE_GOAL.txt`](./design/program/FUN_CONVERGENCE_GOAL.txt) → `PQ-173` builds the instrument; the loop answers with a bar and a number, never with content.
- **Door:** "finish the game / what's next for release / professional bar" → this section →
  `node scripts/program-dispatch.mjs --id PQ-146` (or any ID in §15.2). The eight reactivated packets
  (`PQ-026`–`PQ-033`) are `ready` with fresh leaves; their old one-line briefs are superseded by their
  packet files.
- Every packet here closes on the same law as §13C: **numbers in player units, measured at the
  shipping camera, before and after.** A packet that adds content without naming the gate row it
  moves is not admitted.
- Feel before content; surface before invent; collide before add.


## 16. Swarm mode: the arcade survival showcase — OWNER REVISION 2026-09-10

**Owner-directed arcade revision — 2026-09-10.** The complete design is
[Crucible master plan](./design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md), especially its opening
owner revision. This is authorized implementation, not a request to produce another admission pack.

The default door promises an immediate arcade survival run: fly fast, bank gunfire off rock, stitch
enemies together, leave an armed repulsion trap in a choke point, and use the resulting collisions
to escape the pack. Clear a finite round, collect its cash, buy/refit or save, then launch again.
Death is frequent and retry is quick; the main record is the farthest round reached. Adventure
earns the same advanced toys over a longer acquisition arc and then lets you use them everywhere.

### 16.1 Required pieces and implementation order

| Piece | Plans and owners | Player outcome |
|---|---|---|
| Flight and forced motion | PQ-135 motion work; PQ-137; physical play grammar/build plan; flightV3, propulsionKernel, Rapier and impulseKernel | Immediate steering response, deliberate drift/braking, retained boost/slingshot speed, useful shove and honest collision consequences. |
| Trick arsenal and combinations | PQ-133 attack algebra/status/lineage; PQ-137.09; PQ-146; PQ-147; weapons, attachments, fields, impulseCharges | Strong guns alongside bank, web, trap, well, ram, release, cryo/heat and chain builds. The environment amplifies their combinations. |
| Round pressure and enemies | PQ-174.01/.03/.07/.08; PQ-140; survivalWave, planner, fodderCohort and tacticalAI | Finite cohorts, growing pressure, earned gaps, readable entry lanes, specialist counters, no wave-number HP inflation. |
| Arenas and champions | PQ-175.00/.01/.03; PQ-174.04/.05; survivalArena and the four law owners | Five usable arenas, useful terrain from round one, evolving machinery, champions with commitment and several answers, mutators that change decisions. |
| Fast experimentation | PQ-174; PQ-175.02; PQ-182; survivalDraft, ships, runSession | Cash shop and refit every clear; multiple purchases or saving; known prices; no accidental launch; all run funds and gear isolated from Adventure. |
| Visual and audio response | PQ-139; PQ-161; physical-play presentation; shared VFX/feel/audio owners | Bright shaped projectiles, directional hit flashes, actual cables and traps, readable damage totals, mass-scaled explosions and force cues. Keep the flight window clear. |
| Door, combat HUD and death | PQ-182; survivalHud, powerRail, Crucible screens | Distinct starter strategies and arena descriptions, current bindings/resources, honest fatal cause, useful results, same-seed and fresh-run retry. |
| Breadth and transfer | PQ-133 retained content; Gauntlet/circuit/endless/records; Adventure fitting owners | Keep thirty-wave Gauntlet, five laws, challenge/replay systems and advanced acquisition; Swarm is their fast showcase, not a separate combat implementation. |

### 16.2 How to judge the game

Enter the ordinary Crucible route with a starter. The first encounter must already let the player
shoot, maneuver and use a signature trick. Complete a round, buy or save, refit, launch, die and
retry. Play the bank runner and web controller against a chase, then inspect an advanced combination
and an arena/champion change. Test the real force/attachment and wallet seams where errors matter.
Inspect motion for motion claims and pictures for visual claims. Improve the observed weak point.

Do not substitute a quota of screenshots, input verbs, rated moments, required deaths at minute N,
artificial physics-to-gun score ratios or unmeasurable retention figures for this outcome. Initial
timing targets remain tuning guides: quick first contact, a useful early purchase, short cleanup,
fast retry. A player can finish a round unusually fast or survive unusually long without failing
the design. A boring but statistically compliant run fails it.

### 16.3 Completion and preservation

PQ-174 owns the integrated survival experience; PQ-175 retains the full content breadth; PQ-182
owns its visible route. Shared physics, weapons and presentation dependencies above are part of
this campaign, even if a ready-queue row is missing. Existing implementation is reused and checked
in play; no blanket rebuild. Capture only when it resolves a real visual/temporal question. Keep
focused deterministic, save-isolation, fitting and runtime checks. An unrelated baseline failure
is recorded and bounded, not a reason to abandon the arcade work or rewrite golden snapshots.

The September 3 descriptions and unmeasured tables were a historical tuning proposal. This section
replaces their one-menu-in-five rule, forced physics ranking, compulsory verb counts, fifteen-minute
session target and capture-per-leaf bureaucracy. It preserves product scope and increases emphasis
on meaningful player choice, readable force and rapid experimentation.

## 17. Adventure mode: interesting and mentally stimulating (`PQ-176`–`PQ-178`) — ADMITTED 2026-09-03

**Source:** the owner, 2026-09-03: *"super interesting and mentally stimulating in adventure mode
because of its advanced customization and economic features, as well as the storyline."* The audit
found the material already computed and rarely surfaced: thirty-five derived ship fields with six
shown, a production graph and price forecasts that are never drawn, a 271-line script with no
delivery, and five endings gated at four percent of the money curve. Adventure depth here is three
systems made legible and consequential — the fit, the market, the story — plus the packets in §15
that give the world reasons to be interesting (`PQ-149`–`PQ-155`).

### 17.1 What "mentally stimulating" means, in numbers

| Bar | Statement |
|---|---|
| M1 Decisions | ≥ 6 interesting decisions per hour on the reference route (≥ 2 viable options, a visible tradeoff), counted by the fun-loop measurer. |
| M2 Predictable fit | A player predicts handling (turn radius, reversal time, top speed, tow class) from the fit screen and is right within 20 % on the bench. |
| M3 Felt builds | Two builds of one hull differ in reversal time by ≥ 25 %; a fast-clumsy and a nimble-slow build are both viable in the Crucible. |
| M4 Readable economy | A player who reads the forecast cone out-earns one who does not by ≥ 30 % over a seeded hour; every ticker line traces to a sim event. |
| M5 Story that builds | One linear spine, 20–25 hours, every beat with a physical headline verb, the ending reachable by a combat-only run and by a builder run; no dialogue trees. |
| M6 A ship that is mine | Scars, repairs, titles and a grudge on the load screen; the mechanic reads them back. |

### 17.2 The rulings that shape this section

No dialogue trees; one linear story that builds; replay value is not a goal; rarity loot is allowed
if it earns its place; crafting grind is not a goal; everything is produced by agents.

### 17.3 The packets

| Packet | Pillar | One line | Wave |
|---|---|---|---|
| **`PQ-176`** Customization with consequences: a fit you can feel and predict — [`active/PQ-176.md`](./design/program/roadmap/active/PQ-176.md) | A · Adventure depth | Mass is the law, budgets have shape, drives and thrusters split, mounts gate by size, every module is visible and has a sentence, and the fit screen predicts handling before you commit. | BETA |
| **`PQ-177`** An economy you can read and play: ticker, charts, forecasts, contracts that twist, a black market — [`active/PQ-177.md`](./design/program/roadmap/active/PQ-177.md) | A · Adventure depth | The living economy becomes a strategy surface: a one-line ticker of real events, per-commodity charts with a forecast cone, supply-chain glyphs, event cards on arrival, profit felt on sale, contracts whose clauses twist, and a black market reached by smuggling physics. | BETA |
| **`PQ-178`** The story pipeline: one linear spine, produced by agents at 47-A craft — [`active/PQ-178.md`](./design/program/roadmap/active/PQ-178.md) | A · Adventure depth | How agents write, voice and stage the linear story: canon sheets, faction registers, one-line barks, set-piece scripts with physical headline verbs, synthetic voice, and a craft bar equal to the 47-A opener. | BETA |
| **`PQ-195`** The Third Shift: a recovery you can see, sell out, and lose — [`active/PQ-195.md`](./design/program/roadmap/active/PQ-195.md) | A · Adventure depth | The physical recovery job is live and pays; it still has no art, no choice of destination, no pressure, no visible local consequence and no player who has played it. | BETA |

### 17.4 The plans, in detail

#### Pillar A · Adventure depth

**`PQ-176` — Customization with consequences: a fit you can feel and predict** · *BETA* · after `PQ-137`, `PQ-142`

Building a ship is a mental game with a physical answer. Nested capacity budgets give each hull a shape (the scout's engine pool is fat, the hauler's gun pool is thin); every module's mass feeds the flight model so a gun boat flies like one; drive and manoeuvring thrusters are separate parts so fast-but-clumsy and nimble-but-slow are real builds; mounts gate weapons by size and type; energy and heat are flows the fit screen shows as a sustained-fire margin; any module worth fifteen percent of the budget is visible on the hull; presets switch play styles; and the fit screen shows the handling deltas (turn radius, reversal time, top speed, tow class) before the player pays.

- **Gap:** Six-type slot grid; module mass barely matters; nothing makes a max-gun build feel different in the hands; the ship screen shows six of thirty-five derived fields; the signature mechanic's ceiling sits behind a 2.5 M tech. **Reference:** Endless Sky outfit space, Starsector OP and mounts, X4 engine/thruster split, FTL power routing.
- **Exists:** SPEC3-23/24 (designs written), `src/data/ships.js` (outfitSpace/weaponCapacity/engineCapacity fields), `modules.js` (72), `weapons.js` (25), `src/systems/ships.js` getDerivedStats (~35 fields), `src/ui/ship/shipScreen.js` + loadout presets (J13 done), `src/ui/screens/outfitting.js`, `livingHullPresentation.js`, parts hot-swap in `partsLibrary.js`.
- **Routes through:** S3-F5-OUTFITTING, RV-OUTFITTING, PQ-142, PQ-155, PQ-156, §11.4 Power Bar.
- **Writes:** `src/data/ships.js`, `src/data/modules.js`, `src/data/weapons.js`, `src/systems/ships.js`, `src/ui/screens/outfitting.js`, `src/ui/ship/`, `src/render/partsLibrary.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-137.03) | **Nested budgets and mass as the law.** Master pool plus weapon and engine sub-pools per hull; ship mass = hull + modules + current cargo, fed to the propulsion profile; a migration check proves every current default fit still fits. | A full-gun fit and a full-cargo fit of the same hull differ in reversal time by ≥ 25 % on the flight bench; migration check green. |
| `.01` | **Drive and thruster split.** Drive owns forward thrust and top speed; manoeuvring thrusters own turn torque, strafe and brake; each hull gets a default thruster part. | Two builds of one hull: fast-clumsy and nimble-slow, both viable on the Crucible bench; numbers printed. |
| `.02` | **Mounts gate by size and type; fixed vs turret.** S/M/L mounts with type classes; fixed hardpoints get more output than turrets so aim skill is paid. | Fit screen refuses illegal mounts with a sentence; a fixed-mount build out-damages its turret twin by the authored margin. |
| `.03` | **Flows on the fit screen.** Energy draw, heat and cooling as sustained-fire margin; the screen predicts turn radius, reversal time, top speed and tow class before commit; every module has a one-line sentence. | Blind test: a player predicts handling from the screen and is right within 20 % on the bench. |
| `.04` | **Visible builds.** Any module ≥ 15 % of the budget is visible on the hull (parts hot-swap); drives change nacelle glow; big guns bristle. | Stills at the shipping camera show the build; the asset reachability check stays green. |

- **Not:** No rarity tiers; no set bonuses; no crafting grind; nothing that makes the fit screen a spreadsheet without a prediction.
- **How agents get this wrong:** Adding budgets as UI-only numbers that the flight model never reads: leaf .00's bar is a flight-bench number, not a screen; Letting mass changes bypass the propulsion profile (writing to velocity or drag): mass enters only through the kernel's body mass; Hiding the prediction behind a tooltip: the handling deltas are the screen's primary content.

**`PQ-177` — An economy you can read and play: ticker, charts, forecasts, contracts that twist, a black market** · *BETA* · after `PQ-138`, `PQ-155`

The player learns the economy is real by watching it move and profits by understanding it: a rotating ticker of real events, a market chart with the last ten minutes and a forecast cone, supply-chain glyphs that teach what feeds what, an event card when docking under a shortage or blockade, a profit readout on sale, contracts whose clauses fire mid-mission, and a black market whose entrance is a smuggling run. Six interesting decisions an hour is the bar.

- **Gap:** Price cycles are computed but chartless; events fire silently; the production graph exists only as data; forecasts exist and are never drawn; contract twists exist only as static clauses. **Reference:** Endless Sky trade, Starsector markets, FTL event beats, X4 supply chains, Escape Velocity news.
- **Exists:** SPEC3-10/11/12 (designs written), `src/systems/economy.js` (predictPriceCurve, regimeLabel, price pressure), `economyCycles.js`, `economyContracts.js`, `src/data/commodities.js` (33, producedBy/consumedBy), `newsTemplates.js`, `contractClauses.js`, `src/ui/screens/market.js`, `galaxyMap.js` pressure layer, `pirateDisguise.js`, `dockDeny.js`.
- **Routes through:** S3-F1-ECONOMY, RV-ECONOMY, PQ-155 curve, PQ-148 cargo, PQ-151 wanted loop, PQ-168 chart.
- **Writes:** `src/systems/economy.js`, `src/systems/economyCycles.js`, `src/data/newsTemplates.js`, `src/ui/screens/market.js`, `src/ui/hud.js`, `src/data/contractClauses.js`, `src/systems/missions.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The ticker and event cards.** One-line rotating feed from real events (blockade, shortage, war tension, flips, hunter sightings) at the arbiter's chatter tier; a single card on docking under an event. | Every ticker line traces to a sim event; capture of a blockade line and its card. |
| `.01` | **Charts with a forecast cone.** Per-commodity sparkline of the last ten minutes plus the forecast band and regime label; profit readout on sale from cost basis. | A player who reads the cone beats one who does not by ≥ 30 % profit over a seeded hour (telemetry archetypes). |
| `.02` | **Supply-chain glyphs.** Each commodity shows producedBy → consumedBy station glyphs; hovering a station explains what it buys and sells and why. | Blind test: a player names where to sell ore and why after one screen. |
| `.03` (after PQ-138.04) | **Contracts that twist.** Clauses fire mid-mission (the escort turns, the buyer is the law, the cargo is volatile); every twist mutates rather than fails (PQ-138.04). | ≥ 5 twist clauses live on boards; each has a scenario. |
| `.04` (after PQ-148.02, PQ-151.02) | **The black market.** Reached by a smuggling run (PQ-148.02 physics), sells what stations refuse, launders heat for a cut (PQ-151.02); prices move with your own supply. | A seeded smuggling loop completes; laundering shows in the ledger. |
| `.05` (after PQ-173.01) | **Interesting decisions per hour.** Telemetry counts decisions with ≥ 2 viable options and a visible tradeoff; the bar is ≥ 6 per hour in adventure. | Metric printed by the fun-loop measurer; ≥ 6 on the reference route. |

- **Not:** No spreadsheet screens; no economy rewrite; every feature reads existing events and caches.
- **How agents get this wrong:** Inventing news that is not a sim event: every ticker line must cite the event it came from; Drawing a forecast that the sim does not compute: use predictPriceCurve; never fake a trend; Making the black market a menu: its door is a physical smuggling run.

**`PQ-178` — The story pipeline: one linear spine, produced by agents at 47-A craft** · *BETA* · after `PQ-152`

Every story beat is produced the same way and to the same bar as the twelve minutes that already work: a canon sheet says who wants what; a register sheet says how each faction talks; a set-piece script names the place, the actors, the physical headline verb, the twist clause and two solutions; barks are one line each; voice is directed synthetic; the beat is played on a fixed seed and captured before it ships; the story ledger reads the session back. No dialogue trees, no branching, one story that builds.

- **Gap:** 47-A is bespoke and everything after it is thinner; there is no written standard for how an agent produces a beat, so quality falls off a cliff at minute twelve. **Reference:** Hades bark discipline, Freelancer campaign staging, Half-Life scripted sequences without cutscenes.
- **Exists:** `src/data/scenarios/47a.scenario.json` (the bar), `src/story/campaign47a/`, `src/data/narrative.js`, `barks.js` (271 lines), `docs/worldbuilding/` canon (sheets, STORY-STRUCTURE B0–B7), `src/data/encounters/` (48), `postEndingReplayChains.js`, `shipLedger.js`.
- **Routes through:** PQ-032 spine, PQ-152 set pieces, PQ-150 people, PQ-158 voice, WB-B0-B7, depth P2/V1/V2.
- **Writes:** `docs/worldbuilding/`, `src/data/scenarios/`, `src/data/narrative.js`, `src/data/barks.js`, `src/story/`, `design/program/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The beat standard.** A written standard and a template: canon sheet, register sheet, set-piece script (place, actors, headline verb, twist, two solutions, the frame that proves it), bark rules (one line, one consequence), voice direction notes; a validator checks the template. | Standard committed; the 47-A opener re-expressed in the template without loss. |
| `.01` (after PQ-152.01) | **Beats 1–3 re-cut in the standard.** The wrecking-ball contract, pod rescue under fire, the long tow — written, staged, seeded, captured (PQ-152). | Three beats at 47-A density; owner verdict per beat. |
| `.02` (after PQ-158.04) | **Registers and voice.** Eight faction registers as writing rules with examples; the synthetic-voice direction sheet per register (PQ-158.04). | A blind reader assigns a bark to its faction 7 of 8 times. |
| `.03` | **The story ledger.** The session and the campaign read back as 'I was doing X, then Y, so I Z', from receipts, with the mechanic's voice at the berth. | Blind reader retells the campaign so far from the ledger alone. |

- **Not:** No dialogue trees, no branch choices, no new endings, no cutscenes that take the stick away.
- **How agents get this wrong:** Writing a beat as text the player reads: a beat is a place, actors and a physical verb, or it is not a beat; Adding a choice menu to 'give agency': agency is in the physics; the story is linear by ruling; Shipping a beat that was never played on a fixed seed and captured.


**`PQ-195` — The Third Shift: a recovery you can see, sell out, and lose** · *BETA* · after `PQ-019` (integrated), `PQ-022.heist-receivers-promote`

A voice says Berth Three is down a flywheel and the replacement is in transit. You can see it: a caged spindle off the catcher line, a receiving machine with its rails open, and a queue of work that cannot proceed. You tow it, shove it or fight over it; you bring it through the fork and watch the machine arrest a moving mass; or you take it to the Quiet and leave the legitimate operation waiting. Berth Three either starts working or does not, and that is visible the next time you fly past.

- **Gap:** The delivery works and nothing around it does. The assembly is drawn as a 6 WU cargo pod inside a 16 WU collision body, the fork has no visual and no rail colliders, there is no instrument, no fence choice, no pressure, no consequence, no recovery after loss, no suspension on sector exit, no transport clamp, and no player has played it. **Reference:** the packet's own specification under [`active/PQ-195-design/`](./design/program/roadmap/active/PQ-195-design/01_FEATURE_SPEC.md).
- **Exists:** `src/systems/heistFacilities.js` (schedules, capture fork, two-phase handoff, custody proof), `src/missions/heistMissionRuntime.js` (arbiter, cues, save reconciliation), `src/physicalCargo/breakaway/` (capture kernel, payload math, settlement gate), `src/data/heistFacilities.js`, `src/data/heistMission.js`, `src/systems/missions.js`; unwired art candidates in `assets/ships/breakaway_v1/source_candidates/`.
- **Routes through:** PQ-019 surface heist loop (integrated); PQ-022 the catcher and fence bodies; PQ-148 cargo is physics; PQ-151 the wanted loop; PQ-194 Field Hardware frames.
- **Writes:** `src/systems/heistFacilities.js`, `src/missions/heistMissionRuntime.js`, `src/data/heistFacilities.js`, `src/data/heistMission.js`, `src/systems/missions.js`, `src/physicalCargo/breakaway/`, `src/ui/` (contextual EDGE surface only), `assets/ships/breakaway_v1/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The assembly and the fork are objects you can read.** Authored bodies through the material-truth preflight, wired on the ordinary route. | A fresh reviewer at the chase camera finds the load, its tow point and the receiver entrance unaided; the silhouette fills its 16 WU body instead of the 6 WU pod it wears today. |
| `.01` | **The rails are solid.** The two rails and the rear arrestor are colliders. | A 155 WU/s entry is deflected by real colliders, the load stays recoverable, and the player is never knocked around. |
| `.02` | **The instrument says what the machine is doing.** Approach speed, alignment and settle on the contextual EDGE surface. | A player aborts a too-fast approach because the instrument said so in words; no fourth HUD anchor. |
| `.03` | **Two destinations for one body.** Lawful receiver or fence over one object and one mechanical receiver. | Both complete on the route from one contract; never paid twice by relabelling; latching alone never raises WANTED. |
| `.04` | **One visible local consequence.** The lawful receipt restarts the stalled work once; the fence leaves it unresolved. | Three outcomes, three visible states at Berth Three; bound to the receipt; survives save/load. |
| `.05` | **Someone else wants it.** At most two light hulls and one optional specialist on the ordinary spawn budget. | A raider commits to an intelligible run, can be crossed with the spindle, and abandons a bad attack. |
| `.06` | **Losing it leaves something to do.** One bounded reduced-value recovery through existing aftermath ownership. | Offered once per destruction; a reload never duplicates it; never a second full reward. |
| `.07` | **Leaving suspends the job instead of ending it.** | Leaving and returning resumes the same run with the same body. Facility state is not in the save plan: raise the key, do not add a second writer. |
| `.08` | **The breakaway.** An authored transport clamp on a moving carrier releases a real body when disabled. | The release keeps the motion that was already there and adds no cinematic impulse; ordinary Masslines stay unbreakable. |
| `.09` | **A player has actually played it.** | Three distinct completions unaided on the route; frame time named with hardware, seed and commit; a fresh player finishes it without being taught. |

- **Not:** No second physics for the fork; no rebuild of the Capsule Run; no new mission framework; no galactic consequence simulation.
- **How agents get this wrong:** Wiring the small cargo pod stretched to 16 WU; a glowing goal circle instead of a machine that arrests a mass; touch-to-delete custody; secretly slowing a fast body so the capture test passes; paying twice for one assembly by relabelling its destination; answering the pressure leaf with more enemies or the consequence leaf with a bigger reward; importing the packet's lab runtime into the game.



## 18. Frontend: every surface to the newest version, optimized (`PQ-180`–`PQ-185`) — ADMITTED 2026-09-03

> **DIRECTION OVERRIDE — 2026-09-05.** The owner ruled that the frontend design authority this
> section builds on was written by agents and "will keep reverting the frontend back to cheap if
> you rely on them as an authority." [`design/FRONTEND_DIRECTION.md`](./design/FRONTEND_DIRECTION.md)
> now outranks the grammar, the per-screen specs and every "to the grammar" clause below on
> anything aesthetic. New packets: **`PQ-187`** (reference board → three rendered directions → the
> owner's pick → the kit → the blind proof) and **`PQ-188`** (the HUD and the three instruments
> marked done in §11, rebuilt on the kit). `PQ-162`, `PQ-168`, `PQ-181`, `PQ-182` and `PQ-185` are
> gated on `PQ-187.03` in the queue; their done-when is the owner's contact-sheet yes. `PQ-180`'s
> matrix and the reference frames remain the measurable **floor** — a prerequisite for an owner
> review, never a substitute for one. The phase table is the direction file's §8, mirrored in §20.8.

**Source:** the owner, 2026-09-03: *"The frontend of the game needs to be polished massively too,
everything about it needs to be brought into the newest version and optimized."* §11 landed sixteen
jobs on the four instruments and the flight HUD; the station, the Crucible screens, Asteroid Works,
the meta shell and the legacy modules were never held to the same grammar, and nothing measures
adoption per surface. "The newest version" means: every surface obeys
[`design/frontend/INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md) and the fifteen
A-list standards in [`A_LIST_GAPS.md`](./design/frontend/A_LIST_GAPS.md), proven by a generated
matrix, not by taste. "Optimized" means a UI frame budget and a node budget per surface, measured.

### 18.1 The definition of done, per surface (the matrix columns)

| Column | Rule | Floor |
|---|---|---|
| Type | grammar type roles; every figure in the data face with tabular numerals | smallest text 12 px |
| Colour | neutral base; colour spent only on state; one primary per screen | contrast check green |
| Motion | the three motion verbs; nothing infinite; reduce-motion authored | `check:data-states` rejects `infinite` |
| Skeleton | CREST / STAGE / APRON / DRAWER | adopted (structural check) |
| Disclosure | exactly three tiers | no fourth tier |
| Names | load-bearing names, never decorative | naming lint |
| Data states | empty / loading / error / denied, each with a verb | `check:data-states` |
| Links | every entity mention is a door | `check:entity-links` |
| Memory | the screen restores what the player last chose, per save | `screenMemory` adopted |
| Responsive | safe frame at 1280 / 1920 / 2560; handheld density variant | capture matrix |
| Localization | +40 % pseudo-locale clips nothing | capture matrix |
| Forced colours | readable | capture matrix |
| Input | keyboard and gamepad reach everything; device glyphs | `check:gamepad:screens` (PQ-164) |
| Performance | UI frame cost ≤ 2 ms; ≤ 1,500 DOM nodes; no per-frame allocation; long lists virtualised | `check:ui:perf` + matrix |
| Regression | reference frames committed; diff on change | `check:visual-regression` |

### 18.2 The surfaces (the matrix rows) and their owners

This table mirrors `scripts/ui-grammar-surfaces.mjs` row for row (PQ-180 .02, 2026-09-05): the
surface id the matrix prints, the archetype, how the probe reaches it (`public-route` is the
player's own way in; `fixture` is a harness opener that can be measured but never greens
reachability), and the packet that owns every red cell on that row. Links and UI frame cost are
always `PQ-183` and `PQ-184` whatever packet owns the screen; a red on a row marked done falls to
`PQ-180` .02. Regenerate from the manifest; never edit one side alone.

| Surface | What it is | Archetype | Reached by | Owner packet |
|---|---|---|---|---|
| `flight` | The flight HUD | FLIGHT-HUD | public-route | done (§11); a red falls to `PQ-180` .02 |
| `power-rail` | The Power Rail | OVERLAY | public-route | done (§11); a red falls to `PQ-180` .02 |
| `comms-radial` | The comms fan | OVERLAY | public-route | done (§11); a red falls to `PQ-180` .02 |
| `wingman-radial` | The wingman command radial | OVERLAY | public-route | done (§11); a red falls to `PQ-180` .02 |
| `ship` | THE SHIP | INSTRUMENT | public-route | done (§11); a red falls to `PQ-180` .02 |
| `footprint` | THE FOOTPRINT | INSTRUMENT | public-route | done (§11); a red falls to `PQ-180` .02 |
| `range` | THE RANGE | INSTRUMENT | public-route | done (§11); a red falls to `PQ-180` .02 |
| `chart` | THE CHART — local focus | INSTRUMENT | public-route | `PQ-168` |
| `chart-galaxy` | THE CHART — galaxy focus | INSTRUMENT | public-route | `PQ-168` |
| `title` | The title screen | META-SHELL | public-route | `PQ-181` |
| `new-game` | New game | META-SHELL | public-route | `PQ-181` |
| `pause` | Pause | META-SHELL | public-route | `PQ-181` |
| `settings` | Settings | META-SHELL | public-route | `PQ-181` |
| `save-load` | Load and save | META-SHELL | public-route | `PQ-181` |
| `help` | Help | META-SHELL | public-route | `PQ-181` |
| `codex` | Codex | META-SHELL | public-route | `PQ-181` |
| `mission-log` | Mission log | META-SHELL | public-route | `PQ-181` |
| `tech-tree` | Tech tree | META-SHELL | public-route | `PQ-181` |
| `game-over` | Game over | META-SHELL | fixture | `PQ-181` |
| `credits` | Credits | META-SHELL | none | `PQ-181` |
| `statistics` | Statistics | META-SHELL | none | `PQ-181` |
| `photo-mode` | Photo mode | META-SHELL | none | `PQ-181` |
| `achievements` | Achievements | META-SHELL | public-route | `PQ-033` |
| `replay` | Replay viewer | META-SHELL | public-route | `PQ-160` |
| `clips` | Clip gallery and export | META-SHELL | public-route | `PQ-160` |
| `motion-ask` | First-boot motion choice | META-SHELL | public-route | `PQ-210` |
| `station-dock` | The Command Dock (berth fascia) | STATION | fixture | `PQ-162` |
| `station-market` | Station · Market | STATION | fixture | `PQ-162` |
| `station-shipworks` | Station · Shipworks | STATION | fixture | `PQ-162` |
| `station-industry` | Station · Industry | STATION | fixture | `PQ-162` |
| `station-contracts` | Station · Missions | STATION | fixture | `PQ-162` |
| `station-factions` | Station · Factions | STATION | fixture | `PQ-162` |
| `station-bar` | Station · Bar | STATION | fixture | `PQ-162` |
| `station-ledger` | Station · Ledger | STATION | fixture | `PQ-162` |
| `crucible-door` | The Crucible door | CRUCIBLE | public-route | `PQ-182` |
| `crucible-draft` | The Crucible draft | CRUCIBLE | fixture | `PQ-182` |
| `crucible-refit` | The Crucible refit | CRUCIBLE | fixture | `PQ-182` |
| `crucible-results` | The Crucible results | CRUCIBLE | fixture | `PQ-182` |
| `crucible-lab` | The Crucible lab | CRUCIBLE | none | `PQ-182` |
| `sandbox` | The physics lab (ships as §22-B11) | CRUCIBLE | public-route | `PQ-182` |
| `asteroid-works` | Asteroid Works | WORKS | public-route | `PQ-130` |
| `base` | The base / claims board | WORKS | public-route | `PQ-130` |
| `automation` | Automation | WORKS | public-route | `PQ-130` |
| `localmap-legacy` | Local map (legacy) | INSTRUMENT | none | `PQ-168` |
| `starmap-legacy` | Star map (legacy) | INSTRUMENT | none | `PQ-168` |

The coarse view, for reading: the meta shell (title, new game, load/save, settings, pause, help,
codex, mission log, tech tree, game over, credits, statistics, photo mode) is `PQ-181`; the station
screens are `PQ-162`; the chart and the two legacy maps are `PQ-168`; the Crucible screens are
`PQ-182`; Asteroid Works, base and automation are `PQ-130`; the flight HUD, the rails and radials,
and the three instruments were verified done in §11 and are re-checked by the matrix.

### 18.3 The order inside the frontend program

`PQ-180` first (the matrix, so every red cell has a number and an owner), then `PQ-162` and `PQ-168`
(the two surfaces the owner's reviews called cheap), then `PQ-181`–`PQ-185` in parallel by mutex.
Nothing in this section starts a redesign without a red cell to clear.

### 18.4 The packets

| Packet | Pillar | One line | Wave |
|---|---|---|---|
| **`PQ-180`** The frontend definition of done, applied to every surface: the grammar matrix — [`active/PQ-180.md`](./design/program/roadmap/active/PQ-180.md) | F · Frontend | One generated matrix: every 2D surface × every rule of the instrument grammar and the A-list standards, with a check that fails any surface below the floor; the list of what 'brought into the newest version' means, surface by surface. | ALPHA |
| **`PQ-181`** The meta shell: title, new game, load, settings, pause, game over, credits, statistics, photo mode, version — [`active/PQ-181.md`](./design/program/roadmap/active/PQ-181.md) | F · Frontend | Every shell screen to the grammar with the three missing meta screens added, the save portrait, a returning-player digest, a version string, and keyboard/gamepad parity. | BETA |
| **`PQ-182`** Crucible screens to the grammar: door, draft, refit, results, lab — [`active/PQ-182.md`](./design/program/roadmap/active/PQ-182.md) | F · Frontend | The swarm mode's screens become instruments: a door that sells the run in five seconds, drafts readable in one line, a results screen that tells the story, and lab controls that are a toy. | BETA |
| **`PQ-183`** Everything is a link, the watch list, global find: the game feels like one system — [`active/PQ-183.md`](./design/program/roadmap/active/PQ-183.md) | F · Frontend | Every entity name anywhere opens its dossier in place; a watch list pins prices, rivals, deadlines and factions onto the HUD; global find jumps to anything; the chart takes player notes. | BETA |
| **`PQ-184`** UI performance and optimisation: frame budget, virtualisation, DOM and layout discipline, the legacy refactor — [`active/PQ-184.md`](./design/program/roadmap/active/PQ-184.md) | F · Frontend | Every surface inside a 2 ms UI frame budget and a DOM node budget; long lists virtualised; layout thrash and per-frame allocations removed; the four-thousand-line legacy station hub lifted out; measured by the matrix. | BETA |
| **`PQ-185`** Asteroid Works to the grammar and the owner's design law, accepted — [`active/PQ-185.md`](./design/program/roadmap/active/PQ-185.md) | F · Frontend | The one surface with an explicit owner fail is finished under its own design law and the frontend matrix: warm board, perfect grid, authored objects, ≤ 15 visible words, board ≥ 88 % of the glass. | BETA |

### 18.5 The plans, in detail

#### Pillar F · Frontend

**`PQ-180` — The frontend definition of done, applied to every surface: the grammar matrix** · *ALPHA* · after nothing

There is one table, generated from the running game, that says for every surface — title, new game, load and save, settings, pause, game over, help, codex, mission log, the flight HUD, the Power Rail, the comms and wingman radials, THE SHIP, THE FOOTPRINT, THE RANGE, THE CHART, the seven station screens, the Crucible door, draft, refit, results and lab, Asteroid Works, base and claims, credits, statistics and photo mode — whether it meets each rule: type roles and the 12 px floor, tabular numerals on every figure, colour spent only on state, the motion contract and reduce-motion, the layout skeleton, three disclosure tiers, load-bearing names, the four data states, entity links, screen memory, responsive at three widths, pseudo-localised at +40 %, forced-colours, keyboard and gamepad reachability, and the UI frame budget. A check fails when any surface is below the floor, so 'polished' is a column of greens, not an opinion.

- **Gap:** The grammar exists and sixteen jobs landed for the four instruments and the HUD, but the station, Crucible screens, Asteroid Works, the meta shell and the legacy modules were never held to it; nothing measures adoption per surface. **Reference:** Design-system audits at studios that ship on consoles; the repo's own J16 visual-regression matrix.
- **Exists:** `design/frontend/INSTRUMENT_GRAMMAR.md` (§12 definition of done per screen), `A_LIST_GAPS.md` (15 standards), `scripts/capture-ui-matrix.mjs` + `check:visual-regression` (60 reference frames), `check:data-states`, `check:entity-links`, `check:ui-a11y`, `check:wcag-contrast`, `check:ui:perf`, `check:ui-frame-sleep`, `src/ui/screenMemory.js`, `entityResolver.js`, the localization pseudo-locale.
- **Routes through:** §11 (J01–J16 done), §11.7, PQ-162 station, PQ-168 chart, PQ-130/131 Asteroid Works, PQ-165 accessibility, PQ-166 localization.
- **Writes:** `scripts/`, `test/`, `design/frontend/`, `src/ui/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The surface manifest.** A data file listing every surface with its entry route, owner file, archetype and the checks that can reach it; the matrix script boots the game, opens each surface and measures the rules it can measure (smallest font, numeral face, data states present, memory restored, safe-frame at three widths, pseudo-loc clipping, contrast, reduce-motion, DOM node count, frame cost). | `check:ui:grammar-matrix` prints the matrix for ≥ 30 surfaces and fails any below the floor; committed baseline. |
| `.01` | **The floor, written.** The exact thresholds per rule (12 px, +40 %, 1280/1920/2560, ≤ 1,500 DOM nodes per surface, ≤ 2 ms UI frame cost, four data states named) recorded once in the grammar and read by the check. | Thresholds live in one file; the check reads them; a deliberate violation goes red. |
| `.02` | **Ownership and order.** Every red cell is assigned to a packet (PQ-162 station, PQ-168 chart, PQ-181 meta shell, PQ-182 Crucible screens, PQ-130 works, PQ-183 links, PQ-184 UI perf) with the leaf that clears it; the matrix is the frontend's queue. | No red cell without an owner; the map §18 table mirrors the matrix. |
| `.03` | **Reference frames for every surface.** Extend the visual-regression matrix from 60 frames to every surface × default/reduced-motion/forced-colours/pseudo-loc × three widths; diff on change. | `check:visual-regression` covers every surface in the manifest. |

- **Not:** No redesign inside this packet; it measures and assigns. No new screens.
- **How agents get this wrong:** Reviewing surfaces by eye and calling it a matrix: the matrix is generated from the running game or it is an opinion; Measuring in English only: pseudo-loc at +40 % is a column, not a footnote; Passing a surface because a check is green: three defects in this program were invisible to every check and visible on screen; the reference frames are the proof.

**`PQ-181` — The meta shell: title, new game, load, settings, pause, game over, credits, statistics, photo mode, version** · *BETA* · after `PQ-180`

The first and last things a player sees read as a finished product: a title with a version string and credits; New Game with the three starters as three ways to play; Load as portraits of saves; Settings with presets, frame cap, remap and accessibility; Pause and Game Over that answer 'what happened and what now'; a returning-player digest when a save is older than a day; lifetime statistics from the telemetry aggregates; photo mode from pause.

- **Gap:** Credits, statistics and photo mode absent; no version string; settings lacks presets, frame cap and pad remap; load is a list. **Reference:** Hades shell, Celeste settings depth, Everspace 2 photo mode.
- **Exists:** `src/ui/screens/mainMenu.js`, `newGame.js`, `saveLoad.js`, `settings.js` (5 tabs), `pause.js` (10 entries), `gameOver.js` (recovery grid), `src/systems/telemetry.js` aggregates, `build/web/spaceface-release-build.json` (unread).
- **Routes through:** §11.7 tier 3, PQ-156 starters, PQ-159 photo mode, PQ-164 input, PQ-165 options, PQ-033 legal/version, ADDITIONS §4 digest.
- **Writes:** `src/ui/screens/mainMenu.js`, `src/ui/screens/newGame.js`, `src/ui/screens/saveLoad.js`, `src/ui/screens/settings.js`, `src/ui/screens/pause.js`, `src/ui/screens/gameOver.js`, `src/ui/screens/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-180.00) | **Title, credits, version.** Title to the grammar; credits screen with third-party notices (PQ-033.00); version and build hash visible. | Matrix green for title and credits; version visible in a capture. |
| `.01` (after PQ-156.00) | **New Game and Load.** Three starters as three ways to play with a sentence each (PQ-156); Load renders save portraits (hull, scars, titles, rap sheet, grudge). | Matrix green; save round-trip; capture. |
| `.02` (after PQ-165.00) | **Settings depth.** Presets, frame cap, pad remap, language, accessibility statement (PQ-164/165/166 leaves land here). | Matrix green; every setting round-trips through the profile check. |
| `.03` | **Pause, Game Over, digest, statistics.** Pause with photo mode entry; Game Over that names the cause and the telegraph; returning-player digest; lifetime statistics from aggregates. | Matrix green; digest appears after a day-old save; statistics match telemetry. |

- **Not:** No cinematic title sequence; no account system.
- **How agents get this wrong:** Building statistics as a new tracker: the aggregates exist in telemetry; surface them; A credits screen without the third-party notices the licences require; A version string that is typed by hand rather than read from the release build file.

**`PQ-182` — Crucible screens to the grammar: door, draft, refit, results, lab** · *BETA* · after `PQ-180`, `PQ-174`

The Crucible's screens match the quality of its fights: the door shows the seed, the arenas and the hulls as a choice a stranger can make in five seconds; a draft card is one line and one picture of the verb it changes; refit is the ship screen, not a second fitting UI; results tell the run as a story with the moments, tricks, best chain and build code; the lab's controls are a toy, not a debug panel.

- **Gap:** Crucible screens were built during engineering phases and never held to the grammar; results list numbers; the draft explains itself in paragraphs. **Reference:** Slay the Spire card clarity, Hades run summary, Trackmania results.
- **Exists:** `src/ui/screens/crucible.js`, `crucibleDraft.js`, `crucibleLabControls.js`, `crucibleLabTelemetry.js`, `crucibleResults` (per PQ-133.02), `src/ui/ship/shipScreen.js` (refit host).
- **Routes through:** §12, PQ-174 results story, PQ-146 tricks, PQ-180 matrix.
- **Writes:** `src/ui/screens/crucible.js`, `src/ui/screens/crucibleDraft.js`, `src/ui/screens/crucibleLabControls.js`, `src/ui/screens/crucibleLabTelemetry.js`, `src/ui/screens/crucibleResults.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-180.00) | **The door.** Seed, ruleset, arena and hull as one choice a stranger makes in five seconds; the daily seed (PQ-169.00) is the default. | Matrix green; a new tester launches a run in ≤ 10 s without reading. |
| `.01` | **Draft and refit.** Cards are one line plus one glyph of the verb; refit reuses the ship screen bands. | Matrix green; a tester describes every card after one use. |
| `.02` (after PQ-146.01) | **Results as a story.** Moments, tricks, best chain, cause of death and its telegraph, build code, one-click retry same seed. | Matrix green; results capture reviewed; retry ≤ 5 s. |
| `.03` | **The lab is a toy.** Lab controls to the grammar with the range's teaching voice; telemetry overlay is an instrument, not a debug dump. | Matrix green; frame cost ≤ 2 ms. |

- **Not:** No second fitting UI; no debug text on player screens.
- **How agents get this wrong:** Explaining a draft card in a paragraph: one line, one glyph, or redesign the card's effect; A results screen of totals: the story (moments and tricks) is the primary content; totals are the drawer.

**`PQ-183` — Everything is a link, the watch list, global find: the game feels like one system** · *BETA* · after `PQ-180`, `PQ-162`

A large game feels like one system: every faction, commodity, station, hull, captain, sector and module mentioned anywhere is a door into that thing; the player pins what matters onto the HUD; one key finds anything; the chart remembers the player's own notes. All of it rides the entity resolver that already exists.

- **Gap:** The resolver and drawer exist with seventeen adopters; the station and legacy screens have zero; no watch list, no global find, no notes. **Reference:** Paradox tooltips-of-tooltips, Crusader Kings 3 links, EVE watch lists.
- **Exists:** `src/ui/entityResolver.js`, `whyReveal.js` (17 adopters), `screenMemory.js`, `galaxyMap.js` bookmarks, `check:entity-links`.
- **Routes through:** §11.8 tier 1–2 (ADDITIONS §1, §3, §6, §7), PQ-162 station adoption, PQ-168 chart.
- **Writes:** `src/ui/entityResolver.js`, `src/ui/whyReveal.js`, `src/ui/hud.js`, `src/ui/galaxyMap.js`, `src/ui/station/`, `src/ui/screens/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-162.00) | **Every mention is a door.** Entity links adopted on every surface in the manifest, including the station and legacy modules; the check fails an unlinked entity name. | `check:entity-links` covers ≥ 30 surfaces with zero unlinked mentions. |
| `.01` | **The watch list.** Pin a price, a rival, a deadline, a faction standing; pins render on the HUD in the receipts channel within the attention rules. | Three pin types live; HUD attention contract still green. |
| `.02` | **Global find and chart notes.** One key opens find across entities and screens; the chart accepts player notes that persist per save. | Find reaches every entity class; notes round-trip through save. |

- **Not:** No wiki screen; no notification firehose (the priority ladder holds).
- **How agents get this wrong:** Adding links by hand per screen: adoption goes through the resolver, and the check enforces it; Letting the watch list become a second HUD: it lives in the receipts channel under the attention pass rules.

**`PQ-184` — UI performance and optimisation: frame budget, virtualisation, DOM and layout discipline, the legacy refactor** · *BETA* · after `PQ-180`

The frontend is as optimised as the renderer: each surface stays inside a two-millisecond UI frame cost and a node budget at 1080p, long lists (market, contracts, ledger, codex) virtualise, no surface allocates per frame or thrashes layout, the legacy station hub's shared logic is lifted into modules and the dead renderers deleted, and the matrix reports the numbers so a regression is red the day it lands.

- **Gap:** One breakpoint until recently; no list virtualisation; no UI frame budget enforced per surface; a 4,057-line legacy hub still imported for helpers; the chart carries ~80 sub-12 px nodes. **Reference:** Any console-shipped UI with a frame budget.
- **Exists:** `check:ui:perf`, `check:ui-frame-sleep`, `src/ui/screens/stationHub.js` (legacy helpers), `station-workbench.css` (flattened), the matrix (PQ-180).
- **Routes through:** §11.7 tier 3 #8, §11.10 Phase 7 refactor, PQ-162, PQ-168, PQ-180.
- **Writes:** `src/ui/`, `styles/`, `scripts/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-180.00) | **The budgets, measured.** Per-surface UI frame cost and DOM node count in the matrix; thresholds in the grammar; regression fails red. | Matrix columns live; baseline committed. |
| `.01` | **Virtualise the long lists.** Market, contracts, ledger, codex and results lists render only visible rows. | A 2,000-row list stays under budget; keyboard navigation still reaches every row. |
| `.02` | **No per-frame allocation, no layout thrash.** Audit hot surfaces (HUD, chart, station) for per-frame DOM writes and forced reflows; fix by batching and state variables. | Frame cost under budget on all three; frame-sleep counters 0 when idle. |
| `.03` | **Lift the legacy hub.** Shared logic out of stationHub.js, market.js, bar.js, services.js, shipLedger.js, factions.js into modules; delete dead renderers; the import check confirms. | stationHub.js gone or < 300 lines of pure helpers; check:ui-screen-imports green. |

- **Not:** No framework migration; no rewrite of the HUD.
- **How agents get this wrong:** Optimising by removing content or density: the budget is met by structure, never by showing less; Deleting legacy modules before the live station stops importing them (the Phase 7 refutation).

**`PQ-185` — Asteroid Works to the grammar and the owner's design law, accepted** · *BETA* · after `PQ-180`

The mining board is a game a player can see, read and drive: the owner's design law (warm UI, axis-aligned grid, no fog, events on the board with sound, fifteen visible words, the board owning the glass) is met, the procedural stand-in objects are replaced by authored ones through the ship pipeline, and the surface passes the frontend matrix like every other.

- **Gap:** PQ-130 implemented but not accepted; PQ-131 art blocked on its units; the 2026-08-20 playtest remains the defect list. **Reference:** Into the Breach board clarity, Dorfromantik warmth.
- **Exists:** `src/ui/screens/drill.js` (2,988 lines), `design/ASTEROID_WORKS_DESIGN_LAW.md`, `design/program/ASTEROID_WORKS_PLAYFIELD.md`, `ASTEROID_WORKS_ART_CAMPAIGN.md`, PQ-130/PQ-131 packets and units.
- **Routes through:** PQ-130, PQ-131 (this packet is the acceptance and matrix wrapper; the work stays in those leaves).
- **Writes:** `src/ui/screens/drill.js`, `src/render/`, `design/program/roadmap/receipts/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **Design-law checklist as a check.** The law's twelve statements become assertions the works capture can verify (word count, board fraction, grid alignment, fog absent, event sound). | `check:asteroid-works-render` asserts the law; red on the current build where the law is unmet. |
| `.01` (after PQ-180.00) | **Matrix and acceptance.** The surface passes the grammar matrix; PQ-130 acceptance re-run with the owner after PQ-131 art lands. | Owner verdict KEEP recorded; matrix green. |

- **Not:** No second mining UI; the board is the game.
- **How agents get this wrong:** Polishing the gunmetal console: the owner said a polished copy of it also fails; Accepting on stills: the defect list came from play; acceptance is play.



## 19. How agents get SpaceFace wrong — the catalogue, and the rule that stops each — and the regression fortress (`PQ-186`)

Every packet's *How agents get this wrong* section cites entries here. These are the ways the work
actually goes wrong — judge your own work against them before closing. Where a check exists, its
name is given; where none exists, `PQ-186` builds
it.

| # | The failure | What it looks like | The rule | The check |
|---|---|---|---|---|
| W1 | **Literal satisfaction** | "See, it follows the path" at walking speed; the test measured cross-track and never speed. | Done-when in player units; speed is the pass criterion, track the constraint. | bar checks (`PQ-186.00`) |
| W2 | **Content instead of feel** | Answering "not fun" with more enemies, ships, stations, missions. | §1.3 rule 4; the Fun Loop's forbidden moves. | self-review (§1.6) |
| W3 | **Camera shake as the fix** | Trauma and particles on a boring event. | Spectacle never substitutes for the event underneath. | self-review (§1.6) |
| W4 | **Stacked clamps** | Each agent adds a local safety rule (governor brake, neutral brake, velocity clamp, contact bound) until nothing the player does sticks. | Never add drag; never clamp given momentum; every clamp names the bar it serves. | `PQ-186.01` guards |
| W5 | **Test-to-pass** | Rewriting an assertion or re-recording a golden because it went red. | Assertions quote the vision sentence; goldens move only with the causal record. | anti-vision assertion lint (`PQ-186.02`), §8/§10d |
| W6 | **Prose as proof** | "Verified", "works", a green check, a flattering still. | Numbers, frames, consequences. | self-review (§1.6) |
| W7 | **Half-finished** | A leaf that looks done and is not; a feature behind a flag; a screen wired but unreachable. | Finish the unit; default route only; wired-feature policy. | `check:gate-reachability`, the matrix |
| W8 | **Jargon questions to the owner** | "Should I use a spring or a distance constraint?" | Decide it; ask only product judgments, in plain words, with a default. | — |
| W9 | **Random seeds** | Tuning on a run nobody can reproduce. | Fixed seeds or it did not happen. | bench refuses unseeded runs |
| W10 | **Second architecture** | A parallel combat registry, alternate physics, a mode-only path. | One game path. | `check:sg02`, registry order constraints |
| W11 | **Stand-in visuals** | A glowing sphere, a soft disc, a billboard for a designed object. | VFX technique standard; cones, sheets, rings, ribbons. | `check:vfx-techniques` |
| W12 | **HP as difficulty** | Enemies that take longer to kill on later waves. | Mass, count, anchors, hazards and angles; never hull values. | `PQ-174.07` no-inflation assertion |
| W13 | **Hidden NPC advantages** | Gyros, transform writes, instant counter-thrust, perfect aim. | NPCs obey the player's physics. | `PQ-186.01` guards |
| W14 | **Menus between fights** | A draft after every wave; a pause for thinking placed in the middle of doing. | Swarm menus at most every fifth wave; the radial for doing, pause for thinking. | S4 |
| W15 | **Dialogue trees** | "Give the player agency" with a choice menu. | No dialogue trees; one linear story; agency is in the physics. | `PQ-186.01` data-shape guard |
| W16 | **Spreadsheet depth** | A fit screen or economy screen full of numbers with no prediction and no decision. | Every figure predicts or decides something; M1–M4. | the matrix, M-bars |
| W17 | **Repainting instead of redesigning** | Tokens sprinkled on an old screen; skeleton and data states unadopted. | Grammar matrix columns; structural checks. | `check:ui:grammar-matrix` |
| W18 | **Optimising by removing** | Fewer actors, lower default quality, deleted effects to meet a budget. | Structure only; never default-quality reduction. | §8, runtime witness |
| W19 | **A check that cannot fail** | A gate that imports a `node:test` file and exits 0. | Run suites as child processes; inject a failure and watch it go red. | §7 |
| W20 | **Cheating the golden hash** | Repinning on a moved motion field without a cause. | `sim-golden-diff` verdict before any repin. | §10d |
| W21 | **Feature flags as done** | A flag OFF in production with the feature "implemented". | Production profile is the route; flags-off features are not done. | `runtimeProfiles.js` audit |
| W22 | **Ignoring the wrong-way list** | Building the packet without reading its *How agents get this wrong*. | Step 3 of the procedure. | self-review (§1.6) |
| W23 | **Scope creep as rescue** | A unit that could not close its bar closes something else instead. | New findings become ranked debt, never scope. | self-review (§1.6) |
| W24 | **Asking the owner to test** | "Please check if it feels better." | The bench, the critic, the report; the owner plays weekly on their own terms. | — |
| W25 | **Teaching with text** | A tutorial wall; a hint longer than one line. | Verb-then-silence; the Range is the fallback. | `PQ-163` funnel |
| W26 | **Anecdotal balance** | "The physics kit felt strong." | Twenty seeded runs per kit; the balance dashboard. | `PQ-174.02` |
| W27 | **Humans in the pipeline** | A plan that assumes a voice actor, a composer, a human tuner. | Directed synthetic voice; agent-run media pipelines; the owner's weekly play is the only human step. | — |
| W28 | **Deleting to tidy** | Removing an unwired module, a legacy screen or a retired plan because it looks unused. | Retain valuable future work; refactor before delete; the import check decides. | `check:ui-screen-imports`, `PLAN_REGISTRY` rule 6 |
| W29 | **Tree-wide git operations** | `checkout -- .`, `reset --hard`, `stash` in a shared checkout. | Pathspec-only; `git add -N` new files; never tree-wide. | `docs/AGENT_OPERATIONS.md` |
| W30 | **Stopping** | Ending the turn after one leaf, a green check, or a long context. | Take the next unit; stop only for §1.5. | — |

### 19.1 The packet

| Packet | Pillar | One line | Wave |
|---|---|---|---|
| **`PQ-186`** The regression fortress: every bar, every ruling and every refusal becomes a check — [`active/PQ-186.md`](./design/program/roadmap/active/PQ-186.md) | Q · Quality | Every feel bar, owner ruling and refusal in this map is encoded as a deterministic check with the vision sentence in its assertion, so a future agent cannot quietly undo the game. | ALPHA |

### 19.2 The plan, in detail

#### Pillar Q · Quality

**`PQ-186` — The regression fortress: every bar, every ruling and every refusal becomes a check** · *ALPHA* · after nothing

The game cannot regress silently. Each FEEL_CONTRACT bar has a scenario check; each owner ruling (no drag, no clamp on given momentum, no NPC gyros, no HP scaling, no dialogue trees, the player never knocked around) has a static or runtime check whose message quotes the ruling; and the refusals in §15.7 have grep-level guards where a grep can catch them.

- **Gap:** The 2026-09-03 audit found anti-vision behaviour pinned green by tests; nothing prevents it happening again. **Reference:** The repo's own §7 rule: inject a failure and watch the check go red.
- **Exists:** `test/flightV3.spec.mjs`, `test/travel-drive.test.mjs` (rewritten with vision sentences), `check:baseline`, the Motion Lab, `check:sim` goldens, `scripts/check-*.mjs` pattern.
- **Routes through:** FEEL_CONTRACT §D/§E, §7 verification, PQ-137.10 scenarios, PQ-173 bench.
- **Writes:** `test/`, `scripts/`, `src/testing/lab/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-137.10) | **Bars as checks.** One check per FEEL_CONTRACT bar the lab can reach, assertion message = the bar's sentence; wired into check:all:smoke. | Every reachable bar has a check; injecting the old governor brake turns B1 red. |
| `.01` | **Rulings as guards.** Static guards: no linear damping calls in sim, no velocity writes outside the physics owner, no `Math.random`/`Date.now` in sim, no HP-scaled knockback, no dialogue-tree data shapes; runtime guards: player knock budget, NPC no-gyro invariant. | Each guard has a fixture that fails it; all green on master. |

- **Not:** No fixed pass/reviewer counts as gates; no check that cannot fail (§7).
- **How agents get this wrong:** Writing a check that imports a node:test file and cannot fail (§7): run suites as child processes and honour exit codes; Encoding a bar with a tolerance so wide it never fails: inject the old defect and watch it go red before committing.

## 20. The frontend direction — the A-list plan (`PQ-187`, `PQ-188`; re-gates `PQ-162`, `PQ-168`, `PQ-181`, `PQ-182`, `PQ-185`) — ADMITTED 2026-09-05

**Source:** the owner, 2026-09-05, verbatim:

> "I'm not sure I support the decision to build everything on existing design authority, less
> design-oriented agents wrote all of that and the frontend is stubbornly cheap, I think there have
> been essentially poisoned frontend instructions that will keep reverting the frontend back to
> cheap if you rely on them as an authority."

> "Think of the timeline: I tell an agent to make the game, it makes a cheap frontend, I then employ
> you to fix it, you then read its notes and consider them to be an authority, capping the frontend
> quality at the same level of cheapness because the less-smart agent came first."

> "If I wanted an optimally clean and sleek A-list bold and expressive frontend that exceeds most
> games we need a plan for that."

**Authority.** The plan is [`design/FRONTEND_DIRECTION.md`](./design/FRONTEND_DIRECTION.md). It
sits in the *user direction* tier (`AGENTS.md` §4), directly under `design/VISION.md`, and on
anything aesthetic — type, colour, tone, composition, imagery, motion, sound, what "polished" means
— it outranks every document in `design/frontend/`, every per-screen spec, every "to the grammar"
clause in §18, and every review. Those files remain valid for engineering facts and for the
measurable floor in §20.3 only. **Prose written by an agent, this section included, is never the
final authority on taste. The authority is the set of rendered frames the owner approved**, kept at
`design/frontend/direction/approved/` once `PQ-187.02` locks. Where this section and the direction
file disagree, the direction file wins; where either disagrees with the approved frames, the frames
win.

### 20.1 The answer in one paragraph

The frontend is cheap because its design law was written by agents and prescribes a neutral admin
dashboard — charcoal panels, hairline borders, one blue, display type capped at 28 px, "80 % neutral
at rest", "polished is a column of greens". Any agent that obeys that law regenerates the same look
however skilled. The 2026-09-05 repair pass (`e86f4be8`–`81253f60`) made every screen obey it
consistently; **that was hygiene, not direction.** The way out is not better prose from another
agent. It is to put three genuinely different, fully rendered directions in front of the owner, lock
the one they pick as the authority, build a kit from it, migrate every surface onto the kit with an
owner checkpoint at the end of each phase, and prove the result blind against the best games'
actual screens.

### 20.2 The mechanism that breaks the loop

1. **The sheet is the authority; the first live frames confirm it.** *(Revised 2026-09-06, §20.14.)*
   `design/frontend/direction/DIRECTION_SHEET.md` — every screen as a picture in plain words plus
   the rules — and, once the title is live, its captures under `direction/approved/`.
2. **Nobody picks between options.** *(Revised 2026-09-06.)* The owner declined to choose between
   stylesheets and delegated the decision; the sheet decides. Enforced in the queue: every surface
   packet's units depend on `PQ-187.03` (the title live on the kit), so `program-dispatch --next`
   cannot hand out surface work before the direction is visible in the game.
3. **Every leaf closes on its own rendered frames.** Play the surface at the shipping camera, answer
   the sheet's §9 checklist yourself, and iterate until it genuinely passes; study stills when
   useful and delete them after. The owner's veto is exercised in the game, never on a form.
4. **The proof is blind and comparative** (§20.10).
5. **Agents are told, by name, what not to reach for** (§20.9).

### 20.3 Floor and ceiling

**Kept, because each is measurable — not because the old documents said so:** no text below 12 px;
EMPTY / LOADING / ERROR / DENIED declared with a verb on every pane; every screen restores what the
player last chose, per save; every label survives +40 % and no sentence is concatenated; every
surface holds at 1280 / 1920 / 2560 and clamps to a safe box on ultrawide; legible under
`forced-colors`, complete under reduced motion; keyboard and gamepad reach everything; ≤ 2 ms UI
frame cost, ≤ 1,500 DOM nodes per surface, no per-frame allocation; reference frames committed and
diffed; no first-person visor / cockpit / helmet / pilot-portrait motif; no neon halos, glass blur
stacks or gradient button fills.

**Voided:** the 28 px display cap and "two faces only" (grammar §3); "one interaction accent" and
"80 % neutral at rest" (grammar §4); "flat translucent dark panels, 1 px hairline edges, calm
off-white type" as *the identity* (grammar §4); "screens differ by centerpiece and verb, never by
styling" (grammar §2); "polished is a column of greens" and matrix-green as a gate (`PQ-180`, §18);
every "to the grammar" done-when in `PQ-162`, `PQ-168`, `PQ-181`, `PQ-182`, `PQ-185`; and
"consolidate the stylesheets first" — build the kit fresh, migrate screens onto it, delete old CSS as
each screen moves.

**Still binding from the grammar:** the motion contract (§5: a named state variable behind every
motion, three verbs, nothing infinite, ≤ 180 ms, reduced motion authored), the techniques (§9), reuse
before invention (§10), entry keys (§10.5). They constrain how things move, not what the game looks
like.

### 20.4 What "bold and expressive" means here

Owner taste record, in order: neon cyan rejected; "refined readable shadcn-like surfaces" requested
and delivered; that result judged cheap; the warm "field equipment at dusk" direction for Asteroid
Works liked; "gray, bleak, vibe-coded, harsh fonts" rejected; cockpit motifs out permanently. So
**bold is not loud, and sleek is not neutral.** Boldness comes from five sources and only these:

| Source | The rule |
|---|---|
| **Scale contrast** | one thing on the screen is enormous, the rest small and exact; the type scale runs to 96–160 px on hero surfaces |
| **A display face with a point of view** | paired with a quiet text face and a tabular numeral face; chosen from rendered comps, never from a name |
| **Composition** | asymmetric, edge-anchored, full-bleed, with deliberate emptiness; never a centred card in a dark field |
| **The game's own imagery** | the player's hull with its scars, the sector's sky, faction crests, station art, the wreck you just made — the hangar-rig render already exists and is never used as a picture |
| **Choreographed motion with sound** | screens cut and slide like editing, type arrives, numbers count, every action has a sound; still state-bound, still ≤ 180 ms; the game ships zero recorded audio today and a UI sound palette is part of the bar |

Colour is spent at screen scale as mood and state (the shell warms when docked, the Footprint goes
cold and red when wanted, the Crucible has its own temperature), never as chrome on widgets.

### 20.5 The three candidate directions (Phase 0)

Rendered on the title, the station market and THE SHIP at 1920×1080 and 1280×720, each with one
dense pane, one empty state, one focus state, reduced-motion noted, and a ten-second title→market
transition with placeholder sound. They must differ on face, scale, temperature, composition and
imagery; tints of one layout are rejected. Candidate faces are named so the comps can be built; the
owner's pick is the decision.

| Direction | In one line | Candidate faces | Risk the comps must answer |
|---|---|---|---|
| **A · Editorial Industrial** | the frontier's own printed matter: condensed display type set enormous, bone on warm graphite, one signal orange, broadsheet rules, columns hung from the top edge; hard cuts, type that stamps in; relays and heavy switches | Big Shoulders Display Black · Archivo Expanded Black | drifts to military stencil — prove warmth |
| **B · Cinematic Minimal** | almost nothing on screen and what is there is huge; the sky and the hull fill the frame; a few large words, one signal colour, cursor-led composition; slow-fast easing; low tonal sound | Archivo Black · Syne ExtraBold · Unbounded | dense panes need a second register — include one |
| **C · Warm Instrument** | "field equipment at dusk" extended to the whole game: worn amber, oxblood, brass on slate; a humanist display face with nerve (a serif is on the table); illustrated crests and hull art; controls that read as built objects; mechanical settle; latches and relays | Bricolage Grotesque · Fraunces | the most work to make sleek — prove it can be quiet |

### 20.6 The reference board

Ten interfaces that bracket the space; the owner reacts love / like / hate with a line each, and the
reactions steer which comps get built and how: **Persona 5** (type as hero, asymmetric cut-outs),
**NieR: Automata** (stark, sleek, a sound on every action), **Destiny 2** (hierarchy through scale,
the world as backdrop), **Control** (editorial type at giant size, no chrome), **Hades** (warm,
handmade, the run as a story), **Hardspace: Shipbreaker** (warm industrial, tactile), **Death
Stranding** (ritual and big numerals), **Alan Wake 2** (photographic, layered paper), **Highfleet**
(the boldest genre-adjacent UI; sets the ceiling for *expressive*), **Into the Breach** (nothing on
screen that is not information). Two genre baselines the result must beat: **Everspace 2** and
**Starsector**. If a blind reviewer cannot tell SpaceFace from Everspace 2, the plan has failed.

### 20.7 The thirteen signature moments

Each is built as a composition with a transition and a sound, captured as a ten-second clip, and
signed off by the owner individually: cold open and title · new game (three starters as three ways
to play) · first undock (the HUD arrives element by element) · docking (arriving somewhere; the shell
warms) · undocking · going wanted (temperature, not text) · death and game over (a still, not a
form) · Crucible results (the run as a story) · first upgrade (an earned reveal) · load (saves as
portraits) · pause (the world held, not hidden) · photo mode · every screen open and close (one
transition system, never a uniform fade).

### 20.8 The program — phases, packets, owner checkpoints

| Phase | Packet · leaf | Delivers | Evidence |
|---|---|---|---|
| **0 · Direction** | `PQ-187.00` board · `.01` the decision and the sheet | *(revised 2026-09-06)* the board; `DIRECTION_SHEET.md` — decided, §20.14 | done |
| **1 · The kit, then the title live** | `PQ-187.02` the kit · `.03` the title on the kit on the default route — the gate for every surface packet | tokens, the type scale to hero size, the faces, colour-as-mood rules, the transition system, the UI sound palette, every component on one kit page | the kit page |
| **2 · Shell and signature moments** | `PQ-181` (moments 1, 2, 7, 10, 11, 12, 13) | title, new game, load portraits, pause, game over, settings, credits, statistics, photo mode, the transition system live | contact sheet + seven clips |
| **3 · The flight HUD** | `PQ-188.00` (moments 3, 6) | hero scale where it matters, the arrival choreography, temperature on wanted; the attention pass kept | contact sheet at three widths + two clips |
| **4 · The station as a place** | `PQ-162` (moments 4, 5) | seven screens on the kit; docking and undocking as arrival and departure | contact sheet + two clips |
| **5 · The four instruments** | `PQ-188.01` THE SHIP · `.02` FOOTPRINT + RANGE · `PQ-168` THE CHART | rebuilt on the kit with their centerpieces kept (orbit, trace, fly, push) | contact sheet |
| **6 · Crucible and the Works** | `PQ-182` (moment 8) · `PQ-185` | door, draft, refit, results; Asteroid Works accepted under its own warm law, reconciled with the direction | contact sheet + the results clip |
| **7 · One system, fast** | `PQ-183` · `PQ-184` | every name a link, the watch list, global find; budgets met; the legacy hub gone; dead CSS and dead fonts deleted last | the numbers |
| **8 · Proof** | `PQ-187.04` | the blind side-by-side, thirteen sign-offs, the regression baseline reshot on the new look, a ninety-second reel | **the reel** |

*A "contact sheet" in this table is the set of captures the reviewer judges against `DIRECTION_SHEET.md`, not an owner checkpoint (revised 2026-09-06).*

Sequencing: `PQ-187.01`–`.03` are strictly serial and none needs a human pick — `.01` is decided
(§20.14), `.02` and `.03` close on a visual review against the sheet. Once `.03` lands, phases 2–6
and `PQ-192` run in parallel by mutex. `PQ-180`'s matrix and the reference
frames stay as the **floor**, re-measured after every phase; the current baseline (`PQ-180.03`) is
a floor tool for the current look and is reshot after phase 2 — that lane is not blocked by this
section. `PQ-183` and `PQ-184` are unchanged in scope and run after migration.

### 20.9 How agents get this wrong — the cheapness generators

Judge your surface against these lines, the §1.6 self-review and the §19 W-list; they are how frontend work goes cheap.

- **Reaching for glow to be bold.** A halo, a gradient fill, a glass panel or a tracked-out label is
  an automatic reject; boldness is scale, face, composition, imagery, motion.
- **Building the comps as mock-ups.** Phase 0 comps are real HTML in the lab at real size with real
  data.
- **Three directions that are three tints of one layout.**
- **Writing a direction sheet from prose, or before the owner has picked.** The sheet describes
  the approved frames; frames outrank it.
- **Citing grammar §3/§4, a per-screen spec or a review as a reason to keep something.** Void on
  aesthetics.
- **Centring a card in a dark field.** The default composition is edge-anchored and asymmetric.
- **A settings-page voice on a hero surface.** Title, load, death, results are compositions, not
  lists.
- **Consolidating the old CSS before the kit exists.** Build fresh; migrate; delete.
- **Calling a phase done on a green matrix.** Done is the surface genuinely matching the sheet when
  you look at it in the game and answer the sheet's §9 checklist honestly — iterate until it is.
- **Any first-person motif.** Permanent.
- **Motion with no state variable, over 180 ms, or without a reduced-motion authoring.** The motion
  contract is floor.

### 20.10 Proof — what "exceeds most games" means, measurably

1. **Blind side-by-side.** For eight screen types (title, load, pause, results, map, ship, market,
   HUD) put the SpaceFace frame beside the reference board's frame of
   the same type, unlabeled, and judge honestly which is the more polished, more distinctive
   interface. Target:
   SpaceFace chosen in ≥ 50 % of pairings across the board and 100 % against the two genre baselines.
   If it is not, iterate — that finding is the work.
2. **The owner's thirteen.** Every signature moment has a clip the owner signed off.
3. **The floor is green** across the matrix at three widths, pseudo-localised, forced-colours,
   reduced-motion, inside the budgets, with the regression baseline reshot on the new look.
4. **The reel.** Ninety seconds of the frontend alone, cut to its own UI sound, that a stranger
   would mistake for a shipped title's trailer.

### 20.11 The packets

| Packet | Pillar | One line | Wave |
|---|---|---|---|
| **`PQ-187`** The direction, decided: the sheet, the kit, the title live, the proof — [`active/PQ-187.md`](./design/program/roadmap/active/PQ-187.md) | F · Frontend | *(revised 2026-09-06)* The direction is decided and written as `DIRECTION_SHEET.md`; the kit is built from it; the title goes live first so the owner sees the direction in the game after one unit; a blind side-by-side against A-list games proves the result. | ALPHA |
| **`PQ-192`** The reading screens on the kit — [`active/PQ-192.md`](./design/program/roadmap/active/PQ-192.md) | F · Frontend | Missions log, codex, help and tech tree migrate onto the kit to the sheet's pictures, shedding their old style blocks. | BETA |
| **`PQ-188`** The flight HUD and the instruments to the direction — [`active/PQ-188.md`](./design/program/roadmap/active/PQ-188.md) | F · Frontend | The HUD and the three instruments §11 marked done, rebuilt on the kit with their centerpieces kept; the HUD gains its arrival choreography and its wanted temperature. | BETA |
| `PQ-181` meta shell · `PQ-162` station · `PQ-168` chart · `PQ-182` Crucible · `PQ-185` Works | F · Frontend | Unchanged in scope; re-gated on `PQ-187.03` (packetRevision bumped, direction-override note under the yaml); done is the surface matching the sheet at the shipping camera, iterated until it does. | BETA |

### 20.12 The plans, in detail

#### Pillar F · Frontend

**`PQ-187` — The direction, decided** · *ALPHA* · after nothing · *(revised 2026-09-06, §20.14)*

The frontend has one decided direction — Cinematic Minimal, tuned for SpaceFace — written as a
sheet a builder can work from and a non-designer can picture; the title goes live on it first.

- **Gap:** every frontend authority in the repo was written by agents and prescribes a neutral
  dashboard; the owner has only ever been asked to reject, never to choose. **Reference:** how an
  art director works when the client delegates — a decision, a sheet, and the first live frame that confirms it.
- **Exists:** `_uilab.html` + `scripts/probe-frontend-snapshot.mjs`; `src/ui/shipPreviewMount.js`
  (the hull in a hangar rig); `src/ui/station/icons.js` (stroke icons + 14 crests); vendored faces in
  `styles/fonts/` incl. `bricolage-grotesque-600`, `instrument-sans-var`, `spline-sans-mono-500`
  (unused); the `audio:cue` vocabulary with zero samples; `scripts/capture-ui-matrix.mjs`.
- **Routes through:** the direction file §2, §5, §6, §8, §11; §18 (floor); `PQ-158` (audio
  direction) for the sound palette's samples.
- **Writes:** `design/frontend/direction/`, `_uilab.html`, `styles/`, `src/ui/uiPrimitives.js`,
  `src/ui/effects/`, `scripts/`.

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The reference board.** Done 2026-09-06. | Present. |
| `.01` | **The decision and the direction sheet.** Done 2026-09-06. `DIRECTION_SHEET.md`: every screen as a picture in plain words, then faces, scale, temperature, the dense register, motion, sound, the review checklist, what survives and what retires. The comparison round is void. | The sheet exists and every frontend packet cites it; the receipt quotes the owner verbatim. |
| `.02` (after `.01`) | **The kit.** The variable Bricolage vendored (OFL) beside Instrument Sans; tokens and the 12→160 px scale; the temperature states; the transition helper (cut + ≤ 160 ms settle, state-bound, reduced-motion = cut); ≤ 8 UI sounds through `audio:cue`; every component on one kit page. Old stylesheets untouched. | The kit page at three widths matches the sheet; `check:type-floor`, `check:wcag-contrast` green; no owner decision required. |
| `.03` (after `.02`) | **The title and main menu live on the kit.** The hull in the hangar rig fills the frame against the sky; the game's name at hero scale; a column of words down the left edge; the menu plate and its CSS deleted; open/confirm sounds live. | Booting the game shows it; captures at three widths match the sheet; `check:title-continue-runtime` green; the owner has seen it in the game and not vetoed. **The gate every surface packet depends on.** |
| `.04` (after every surface packet) | **The proof.** §20.10 in full; the thirteen signature moments as clips reviewed against the sheet; the reel. | ≥ 50 % / 100 % on the side-by-side; thirteen clip reviews; matrix and regression green; the reel under `receipts/`. |
- **Not:** no comps; no second direction; no owner pick or sign-off form; no CSS cleanup.
- **How agents get this wrong:** §20.9, plus: asking the owner to choose between stylesheets; treating a green matrix as a match to the sheet.

**`PQ-188` — The flight HUD and the instruments to the direction** · *BETA* · after `PQ-187.03`

The surfaces §11 marked done were built to the superseded grammar; they are rebuilt on the kit with
their centerpieces and manipulation verbs kept, and the HUD gains its two signature moments.

- **Gap:** the HUD and three instruments pass the floor and look like nothing; no packet could
  revisit surfaces marked done. **Reference:** Ace Combat's arrival choreography; Red Dead 2's
  wanted temperature.
- **Exists:** `src/ui/hud.js` (three anchors, Power Rail, right dock, hull mark, comms tape);
  `src/ui/ship/` bands; the FOOTPRINT board and provenance ledger; THE RANGE integrator and rungs;
  `design/HUD_FLIGHT_ATTENTION.md` (still binding); `check:hud-j07`, `check:one-voice`.
- **Routes through:** the direction file §7 (moments 3, 6) and §8 (phases 3, 5); §11.4 Power Bar;
  `HUD_FLIGHT_ATTENTION.md`.
- **Writes:** `src/ui/hud.js`, `src/ui/uiRoot.js`, `src/ui/ship/`, the footprint and range modules,
  `styles/`.

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The flight HUD.** Hero scale where it matters (speed, heat, the target); the display face on the few words that deserve it; the arrival choreography on first undock; the temperature change on wanted; the attention rules kept. | Contact sheet at 1280 / 1920 / 2560 matching the sheet; two ten-second clips; `check:hud-j07` and `check:one-voice` green; the receipts channel unchanged. |
| `.01` | **THE SHIP.** The hull as the picture at full bleed with labels pinned to it; the four bands re-set on the kit; orbit kept. | Contact sheet matching the sheet; every band still answers "why does my ship fly like this". |
| `.02` | **THE FOOTPRINT and THE RANGE.** The consequence board with its wanted temperature; the Range's teaching voice on the kit without changing the drills. | Contact sheet matching the sheet; the four rungs still complete under real input. |

- **Not:** no change to what the instruments do; no second receipts channel; no restyle before the
  kit exists.
- **How agents get this wrong:** breaking the attention pass; glow for speed or threat; calling a
  leaf done on a green check.

### 20.13 The first question for the owner

Phase 0 starts with the reference board. The one answer that most improves the comps: **which of
the ten games in §20.6 do you love, which do you hate, and why in a line each?** Add any game not on
the board whose interface you admire. The answer is recorded verbatim at the top of
`design/frontend/direction/REFERENCE_BOARD.md`, and `PQ-187.01` is built against it. The
owner-facing rendering of this plan, with the three directions set in their own type, is the
published page "SpaceFace Frontend Direction".

**Answered 2026-09-06.** The owner declined to review a board or stylesheets and delegated the
decision; see §20.14. The question is closed.

### 20.14 The decision and the task series — 2026-09-06 *(SUPERSEDED 2026-09-10 on aesthetics — see §20.15)*

**Decided: Cinematic Minimal, tuned for SpaceFace — the world is the interface.** The owner looked
at the three direction cards and said (verbatim in
[`receipts/PQ-187-01-REPORT.md`](./design/program/roadmap/receipts/PQ-187-01-REPORT.md)) that none
of them looked like a game, that they could not picture the result from a stylesheet, that they
leaned cinematic minimal, and: *"You'll just have to decide what the game being described in the
docs would look best like, and make it into a series of frontend tasks we could tackle."* The
decision was made under that delegation and is written as
[`design/frontend/direction/DIRECTION_SHEET.md`](./design/frontend/direction/DIRECTION_SHEET.md) —
a picture in plain words of every screen, then the rules (faces, scale, colour and temperature,
composition, the dense register, motion, sound, a review checklist, what survives, what retires,
the never-list). The why is the direction file §13. §20.2's owner pick, §20.8's Phase 0 comparison
round, the "owner's yes" done-whens and §20.13 are superseded by this section.

**The mechanism now.** The sheet is the authority. A leaf closes when the agent plays it at the
shipping camera, answers the sheet's §9 checklist honestly, and iterates until the surface
genuinely matches the sheet. No unit waits on a human choosing between options; a unit that would is
a defect. The owner's veto is exercised by looking at the game, and the title goes live first so
that look happens after one unit.

**Gut it or not?** Not. The bones stay: the screen manager and screen memory, the three-anchor HUD
and the Power Rail, the station OS and its six instruments, the instruments' centerpieces and verbs,
the icon set and the crests, the hangar-rig hull render, the chart's star-system drawing, the
accessibility and performance floors. The skin retires screen by screen as each migrates: the menu
plate, every panel and card and border, chips and badges, Saira and the Plex trio, monospace as a
look, the uniform fade, the filled buttons, the tile grids.

**The task series.** In order; each line is what the owner sees in the game when it lands. After
task 2, tasks 3–10 run in parallel under their own packets and mutexes.

| # | Unit | What lands | What you will see |
|---|---|---|---|
| 1 | `PQ-187.02` | **The kit.** The variable display face vendored, tokens and the 12→160 px scale, the temperature states, the transition helper, eight UI sounds, every component on one lab page. | Nothing in the game yet. One lab page showing every button, row, table, title and number in the new look, captured at three widths. |
| 2 | `PQ-187.03` | **The title, live.** The first real screen, on the default route; the menu plate and its CSS deleted. | Boot the game: your hull in the hangar rig fills the frame against the sky, the game's name enormous top-left, a column of words down the left edge, the focused one bright with a short gold rule. **This is the veto point** — say so here and nothing else moves until it is right. |
| 3 | `PQ-181` | **The shell.** New game, load, settings, pause, game over, photo mode, credits and version on the kit. | New game is three lit hulls with a sentence each. Load is portraits of your ships, not timestamps. Pause holds the world instead of hiding it. Game over is a still that names what killed you and the telegraph you missed. |
| 4 | `PQ-188.00` | **The flight HUD.** Hero-scale speed and heat, the rail as words, the arrival choreography, the wanted temperature; the attention rules kept. | Speed huge in the bottom-left corner, everything else quiet at the edges. On your first undock the instruments come online one by one with a low tone each. When you go wanted the whole frame turns cold and the gold turns red. |
| 5 | `PQ-162` | **The station as a place.** Docking as arrival; the six instruments on the kit; the market as the dense-register proof. | Docking shows the berth with your hull in it and the station's name enormous; the six instruments are six words along the bottom. The market is three enormous numbers, a sentence and a half-width table. No tiles, no panels. |
| 6 | `PQ-188.01` · `.02` | **THE SHIP, THE FOOTPRINT, THE RANGE** on the kit with orbit, trace and fly kept. | The hull full-bleed with labels pinned to it and four big numbers along the bottom. The consequence graph drawn on the sky. The drill box with one teaching sentence. |
| 7 | `PQ-168` | **The chart** finished on the kit. | The star system full-bleed; the selected place named in the corner with one sentence and the route time; pins as hairline marks, not a legend. |
| 8 | `PQ-182` | **The Crucible** door, draft, refit, results on the kit. | The door is four words a stranger reads in five seconds, the signal colour white. Results tell the run as a story with the best chain as a hero number and Retry as one word. |
| 9 | `PQ-185` | **Asteroid Works** reconciled with the sheet under its own accepted warm law. | The Works looks as it does, with the sheet's composition and motion; nothing boxed. |
| 10 | `PQ-192` | **The reading screens.** Missions, codex, help, tech tree on the kit. | Missions as a column of sentences with the chosen one opened large on the right. The codex reads like a book. Help is rows of action and key. The tech tree's lanes drawn on the sky. |
| 11 | `PQ-183` · `PQ-184` | **One system, fast.** Every name a link, the watch list, global find; budgets met; the legacy hub, dead CSS and dead fonts deleted last. | Any name anywhere is clickable and takes you there. Nothing hitches. The old fonts and stylesheets are gone. |
| 12 | `PQ-187.04` | **The proof.** The blind side-by-side against the best games' screens, the thirteen signature-moment clips reviewed against the sheet, the regression baseline reshot, a ninety-second reel. | A ninety-second reel of the game's interface cut to its own sounds, and a tally showing SpaceFace chosen at least half the time against A-list screens and every time against the genre baselines. |

**How the owner uses this.** Say "do the frontend" — the router row in `AGENTS.md` sends that to `PQ-187`, and an agent runs `--id PQ-187` for task 1, then task 2 (a bare "next" hands out whatever unit is highest in the whole queue, which may be another lane's). After
task 2, play the title screen. If it is wrong, say what is wrong in plain words; the sheet's title
picture is revised and task 2 is redone before anything else. If it is right, say nothing — the
rest proceeds in parallel and each surface arrives in the game as it lands.

#### 20.14.1 The four handoffs — specifics for a less able agent (added 2026-09-06)

The twelve steps above are grouped into **four handoff tasks**, each with its own file giving the
order of work, the exact files, per-screen geometry tables, the checks and the review handoff, all
built on one implementation spec. A starter prompt for each is in
[`design/frontend/direction/HANDOFF_PROMPTS.md`](./design/frontend/direction/HANDOFF_PROMPTS.md).
Task A is serial and gates the rest; B, C and D run in parallel; D's sweep and proof wait for B
and C.

| Task | Covers (steps above) | Queue units | File |
|---|---|---|---|
| **A** The kit and the title | 1, 2 | `PQ-187.02`, `PQ-187.03` | [`tasks/TASK_A_KIT_AND_TITLE.md`](./design/frontend/direction/tasks/TASK_A_KIT_AND_TITLE.md) |
| **B** The shell and the flight HUD | 3, 4 | `PQ-181.00`–`.03`, `PQ-188.00` | [`tasks/TASK_B_SHELL_AND_HUD.md`](./design/frontend/direction/tasks/TASK_B_SHELL_AND_HUD.md) |
| **C** The station, the instruments, the chart | 5, 6, 7 | `PQ-162.00`–`.02`, `PQ-188.01`–`.02`, `PQ-168.00`–`.01` | [`tasks/TASK_C_STATION_INSTRUMENTS_CHART.md`](./design/frontend/direction/tasks/TASK_C_STATION_INSTRUMENTS_CHART.md) |
| **D** The modes, the reading screens, the sweep, the proof | 8, 9, 10, 11 (the CSS/font sweep and the floor reshoot), 12 | `PQ-182.00`–`.03`, `PQ-185.00`–`.01`, `PQ-192.00`–`.01`, `PQ-184` (sweep leaves), `PQ-187.04` | [`tasks/TASK_D_MODES_READING_SWEEP_PROOF.md`](./design/frontend/direction/tasks/TASK_D_MODES_READING_SWEEP_PROOF.md) |

The spec they all build on: [`design/frontend/direction/KIT_SPEC.md`](./design/frontend/direction/KIT_SPEC.md)
— the vendored variable display face and the command that vendors it, the complete token block,
the type scale, the temperature attribute and its derivation from real state fields, every
component's CSS and markup, the transition helper, the eight sound recipes re-tuned in the game's
own synthesiser, the geometry conventions, the banned-CSS table, the capture and review protocol,
and the integration seams with file and line references (audited 2026-09-06: no base screen class,
one starter hull, the world canvas frozen while docked, one shared ship stage, the chart is
`galaxyMap.js`). `PQ-183`'s link/find/watch-list features are feature work outside the four tasks
and keep their own packet. The sheet was amended the same day to match the audited facts.

### 20.15 Field Hardware — the UI production program (`PQ-194`) — ADMITTED 2026-09-10

**Supersedes §20.14 on aesthetics.** The Cinematic Minimal series landed (Tasks A–D, 2026-09-07) and
the owner judged the result generic: *"we've taken about 10 shots at this and it's equally bad each
time … agents … choose this sort of simple generic HTML/CSS UI because that's what they think they
can do in one session … [the docs] are poisoning the frontend development."* The finding behind it:
every pass was CSS styled in one session against a prose target with no produced assets; and no
screen has a lit world behind it by design (rendering freezes on any screen stack; the second WebGL
preview context is refused on Intel GPUs), so "the world is the interface" never had machinery.

**The program:** [`design/frontend/direction/FIELD_HARDWARE_PROGRAM.md`](./design/frontend/direction/FIELD_HARDWARE_PROGRAM.md) — style frames
rendered first (ChatGPT 6 Pro, self-contained zip packets), produced assets second (transparent-PNG
kits, an SVG icon family and marks, Blender sets and hull renders), code that assembles the assets to
match the frames third, and a picture-comparison review at every step. Direction: **Field Hardware** —
manufactured, backlit, hand-worn equipment over a lit living world; three registers POSTER / BENCH /
EDGE; two tests (the Asteroid Works material-and-light test; the Shipbreaker equipment test). Frames
under `design/frontend/direction/approved/` outrank every prose document. five development
sessions under `design/frontend/direction/sessions/` (S1 design system → S2 bench register → S3 prototype
app → S4 engine port → S5 QA), each a phased sprint with ChatGPT 6 Pro that uses image generation, SVG,
code and 3D together and returns one runnable artifact, built from 28 phase specs under `packets/`;
local lanes between sessions do the engine work. Build one with `node scripts/build-ui-packet.mjs S1`. Packet:
[`active/PQ-194.md`](./design/program/roadmap/active/PQ-194.md).

| Leaf | What lands | What you will see |
|---|---|---|
| `.00` | **S1** the design system | Nothing in the game; open the returned kit page and the title, Crucible door and HUD prototypes in a browser: the new interface, real materials, moving. |
| `.01` | L-A the UI stage (P20) | Boot the game: a lit hangar with your hull turning behind the title, on one GPU context, an authored plate when the GPU cannot draw it. |
| `.02` · `.03` | **S2** the bench register; L-B Blender sets (P16) | Every docked screen, THE SHIP, the chart, settings and load as prototypes; then the finished hangar and berth sets. |
| `.04` | **S3** the prototype app | The whole interface, playable in a browser end to end, before any engine code changes. |
| `.05` | **S4** the engine port; L-C the kit runtime and **the Title live — the veto point** | The approved frame, running in the game. Look at it. Say what is wrong in plain words, or say nothing. |
| `.06` | L-C the surfaces (P30–P38) | Screen by screen, each matching its frame. |
| `.07` | **S5** QA; L-D sweep and proof (P40–P42) | Everything corrected, moving and sounding like one instrument; the old skin gone; a blind tally against Everspace 2 and A-list frames; a ninety-second reel. |

**How the owner uses this.** Say "build session S1", hand the zip in `.devshots/ui-packets/` to
ChatGPT 6 Pro with the prompt in `design/frontend/direction/sessions/README.md`, drop the return back,
say "review S1"; repeat through S4. The only moment that needs your eyes is `.05`.

## 21. The playable demo — smooth, solid, answering, hardware (`PQ-210`) — ADMITTED 2026-09-20

Owner, 2026-09-20: *"it's almost ready to demo I think, but it's not quite playable … the ship must
fly smooth and the player have complete control over what's happening."* This is the front of the
queue until the owner signs the five demo bars. Target, evidence, bars and the wider A-list list:
[`design/program/DEMO_READINESS_2026-09-20.md`](./design/program/DEMO_READINESS_2026-09-20.md).
Packet: [`PQ-210`](./design/program/roadmap/active/PQ-210.md).

### 21.1 What the session of 2026-09-20 established (do not re-derive)

| The owner felt | The cause, now fixed | Guard |
|---|---|---|
| The ship jigging back and forth | The frame loop drew first on any frame over 33.3 ms (one frame at 30 fps) and redrew an old moment: 14 % of presents at 45 fps, 26 % at 30 fps, each followed by a ~5 WU snap | `check:baseline` → `smooth-flight`; live counter `duplicateMomentPresents` |
| Sluggish on a slow GPU | Sim step caps on slow frames ran the game at 63–83 % speed | same; game speed is 100 % down to 15 fps |
| A jig on every heavy hit in swarm | The kinetic crunch held poses for two frames while the sim ran, then snapped | `test/feel-kinetic-crunch.test.mjs`; the beat is a hit-stop |
| Limp, frozen effects | Windows "Animation effects: off" → `prefers-reduced-motion` → the silent `system` default stripped hit-stop, trauma, lights, haze, bolt time and field motion | Motion defaults to Full; one versioned profile migration; `test/graphics-profile-bootstrap.test.mjs` |
| Asteroids vanishing | A retired rock batch drew nothing for the rest of the session | `test/asteroid-pool-retired-owner.test.mjs` |
| Objects popping out on screen | Residency trusted the requested-zoom classifier over the live screen; evict sat inside prefetch while zooming | `test/presentation-residency.test.mjs` |

### 21.2 The law this adds

1. **The pilot lives in the frame.** A feel claim about motion closes on the frame — the
   smooth-flight witness on the owner's GPU — never on the sim alone.
2. **One loop order.** Simulate the time that passed, then present that moment. Only a restore
   frame presents without advancing. No presentation path holds poses while the sim runs; weight
   is a time dip.
3. **A slow frame rate is not a hitch.** Steady frames keep the full catch-up ceiling (real time
   down to 15 fps). Only a callback over 4.5 ticks late sheds, to two steps.
4. **The live screen outranks every classifier.** Nothing on the live glass loses its mesh, waits
   out a hold, or blanks with its batch.
5. **Nothing follows the operating system silently.** Motion is Full unless the player chose.
6. **Every perf number carries the machine's load beside it.** The same build read 59 fps and
   40 fps minutes apart while other lanes ran batteries. Harnesses that run over two minutes lower
   their own OS priority.
7. **A test that pins what the owner forbids is the defect.** Three of the six rows above were
   held in place by green tests. New feel tests quote the owner sentence they serve.

### 21.3 The review's NEW items, admitted

The five items the 2026-09-20 review marked NEW have owners: the front-of-house daily seed, ghost
and share code, plus the five-second skippable kill replay, are §22-B9; the muzzle-discharge flow
wired to zero is §22-A7; the physics lab toy is §22-B11; the art-directed iGPU-60 preset is
§22-E8; the controller-first pass rides `PQ-164` (twin-stick admitted as `.04`).

### 21.4 Hitch, low FPS and late loading are one mechanism (owner, 2026-09-25)

Owner's plan: loading anything costs three kinds of main-thread work — shader preparation (up to
~0.5 s each on Intel/ANGLE), GPU upload, and model assembly. Hiding a body until that work is done
trades the hitch for pop-in; showing it sooner trades it back. The trade-off cannot be tuned away.
The work has to get cheaper, earlier, or move off the frame. Ten systems, biggest win first.

**Guard rail (system 9, landed 2026-09-25).** `node scripts/probe-frame-solid.mjs` flies away from
and back to a station and reports longest frame, frame p99, time-to-appear, blinks, every in-flight
shader link (named, diffed against the nearest existing program), admission lane depths, and
per-job composition time. Each run writes `.devshots/frame-solid/<stamp>.json`;
`--compare=<baseline.json>` fails any change that raises a count. Compare every change in this
section against a baseline taken back to back on the same machine.

**Baseline, owner's laptop (Core Ultra 7 155U, Intel Graphics, CPU 85–95 % busy from other
agents), 2026-09-25:** frame p50 44–78 ms, longest 0.5–3.4 s; 54–74 % of bodies drawn the frame
they enter the screen, late ones 1–8 s; 9–19 shader links per 60 s flight, all behind the hide
latch (pop-in, not in-frame hitch). Long pole: the serial authored composition lane (ledger D38).

**End of 2026-09-25, same laptop (CPU 99 % busy from other agents):** in-flight shader links 19 →
4–8, links inside a drawn frame 0 in every run since fe6dfd778 (the first-thrust freeze), on-time
appearance 0.58–0.87 with 0 late arrivals in the best runs, buffer uploads ~242 → ~21 KB per frame.
Frame times on this host swing ±50 % run to run and are not evidence either way; a 1.8–2.8 s frame
with zero in-frame links still occurs — next: `--cpu-profile` on a quieter host to name it. Other
next cuts named by the profile: `_publishAssetResidencyDiagnostics` → `canonicalDiagnostics`
(~0.8 s per flight, rebuilt every 0.25 s poll — memoize on a residency mutation epoch).

| # | System | What exists | Gap | Next |
|---|---|---|---|---|
| 1 | Fixed shader catalogue, prepared at startup | Material ABI metadata (`materialAbi.js`, `sharedMaterialRoles.js`); boot precompile; in-session program-binary cache; the desktop app's Chromium GPU shader disk cache is live (verified 2026-09-25: 11 MB in `%APPDATA%/spaceface/GPUCache`), so repeat launches reuse prepared shaders | Program identity still varies per material: measured in-flight links differ from an existing program by one parameter — dithering, one texture slot present/absent, side (Front vs Double), clearcoat, alphaTest | LANDED 2026-09-25 (`programCanon.js`): authored PBR materials get neutral 1×1 textures in empty slots and dithering on before admission; A/B in-flight links 17→13 and 13→11, on-time 62→81 % and 47→78 %. Residual variants: side (Front vs Double), clearcoat, alphaTest, instancing — need a perf call. Then a check that fails on a new in-flight program |
| 2 | Baked, ready-to-use model packages | 267 render packages with collisions, LODs, HLODs, clusters; off-thread digest worker | Composition runs per instance on the main thread | PROFILED 2026-09-25 (`probe:frame-solid --cpu-profile`): 79 % of `buildComposedShip` was `attachRetroMounts` brute-force raycasting the hull skin 28× per ship. LANDED: one analytic pass (`retroSkinSeat.js`), bit-identical seats; 1993 → 506 ms per 60 s flight. Next: bake the seats into the render package so assembly does no geometry work at all |
| 1b | No shader ever prepares inside a drawn frame | Unready-drawable guard hides still-linking programs | Its scene walk exits once all programs are ready, so a never-compiled material drawn mid-flight linked in the frame: the first-thrust 1.4–2.4 s freeze (engine-bell heat skin cloned with `Material.clone()`, dropping shader hooks) | LANDED 2026-09-25: bell heat skins keep hooks (`materialClone.js`); draw-time net skips + admits any never-compiled authored material. Three probes: 0 in-frame links |
| 3 | Load by ship type per sector | Every sector prefetch decodes all spawnable combat/traffic hulls (`spawnableShipArchetypePrewarmUrls`); Crucible warms its roster | Decode only; exemplar compile warm was measured an iGPU regression and stays unwired | Revisit after 1 shrinks the catalogue |
| 4 | One predictive loading director | Time-to-glass runways (`tabletopPolicy.js`), on-glass urgent lanes, wave-plan hull decode | Composition is FIFO-serial behind a 20 s first-flight hold; known future spawns feed decode, not composition | After D38: one deadline-sorted queue across composition, compile and upload |
| 5 | Strict per-frame budget | `admissionSliceBudget.js` (3 ms target, 8 ms hard), heavy-admission present gate, one compile per present | Composition in flight is serial through its GPU gate. Overlapping it was tried twice 2026-09-25 (before and after the 4× cheaper assembly): throughput up, on-time appearance flat (0.56 → 0.54), parked (`.devshots/parked/flight-compose-overlap-2026-09-25-v2.patch`) | The wait is per-body GPU prep, not queue order — the answer is system 6 (a stand-in on screen while it prepares). Per-frame scans: `kickDecodeRunwayAssets` 422 → 90 ms per flight (linear pick); hold-exempt glass test hoist proposed |
| 6 | Always something correct on screen | Each hull has LOD1/LOD2 files; pending bodies stay hidden | No instant stand-in; §13D Wave F3 is planned | §13D F2 then F3 |
| 7 | Draw less | Package instance pools, asteroid instance pool, static batch cache, shadow present cadence | MEASURED 2026-09-25 (probe `gpu submission` / `draw census`): ~155–167 draws, ~100 program switches, ~390 texture binds per frame; 135 programs, 1174 geometries. Draw count is modest; per-object CPU bookkeeping is not: `updateMatrixWorld` 2.2 s per 64 s flight, 96 % of its auto-updating nodes never move | In progress: bounded warm roots stay parked in flight (was 51 % of those nodes). Then freeze static authored-boundary interiors except animated bells/fans/gimbals |
| 8 | Simulation off the drawing thread | Fixed-step sim with flat state, decoupled from render | MEASURED 2026-09-25: the fixed-step sim is ~24 % of the main thread on the laptop (15 s of a 64 s flight: physics 3.5 s, flight 2.0 s, AI 1.6 s). Design exists: `design/PERFORMANCE_OPTIMIZATION_CONSTELLATION.md` L4 (three-thread), with M9 coarse read-only worker slices and M4 packed physics membranes as the incremental path | First slice after 6: an M9 read-only AI-scoring or physics membrane worker, with a synchronous deterministic fallback |
| 9 | Measurement guard rail | `probe:frame-solid` above; `probe:shader-timeline`, `probe:runtime-witness`, smooth-flight | An idle-machine run is still owed | Run on a quiet machine and save that baseline |
| 10 | WebGPU | `webgpuPresent.js` gate, off | Needs 1–7 first | Later |

## 22. The gap between the description and the build — ADMITTED 2026-09-21

The owner asked for the work that turns the live game into the game the docs describe, and for a
backend that stays smooth on an ordinary machine. This section is that measured list: a number, a
fixture, a file list. It is ahead of soak and closeout. It does not add a second queue.

A strong agent making the game A-list does not start here. The open feelings are §23. Take a row
below when the job is one of these known gaps, or when you are clearing little quality. Wave G is
grunt-shaped.

**Read the live code before starting a row.** If the done-when is already true on seeds 4242 and
8008, skip the row and say so. If the files are already dirty, finish that diff. Do not start a
parallel copy.

### 22.0 What the description promises, and what A-list games make obvious

[`design/VISION.md`](./design/VISION.md) promises a fast physics sandbox where a miner, a hauler, a
pirate, a rock, a patrol, and a rope are one situation, and a simple action keeps producing a
bigger story. Compared with the games this finish line already names:

| The other game makes this obvious | This build's own promise | Where the live game is thinner |
|---|---|---|
| Just Cause, the grapple | The Massline is the signature, and it stays on | The throw can kill. The opening still does not hand you a body worth throwing. |
| Rocket League, one readable verb at 60 | The fight is on the glass and the frame never lies | Guns still reach ~520–680 while the chase view is ~130 deep. The 60 Hz list is still fat. |
| Deep Rock / Hardspace Shipbreaker, the job is already happening | You arrive in the middle of someone else's day | The systems exist. The first minutes do not yet show the chain without a test. |
| Hades / Spelunky, the run is the toy | Swarm is fling, wreck, fling again | Stunts are detected. The wreck is not yet the next answer you can see. |
| Starsector / Rebel Galaxy, the world keeps the receipt | Failure becomes salvage, a price, a person | Heat and witnesses exist. A stranger still cannot fly back to one consequence. |
| Everspace 2, the picture and the instruments are one game | Hardware over a living picture | Flight HUD was repainted. Station, map, and pause, and several hulls, still read as a kit. |

The sim is ahead of the session. Polishing means connecting what already simulates. Adding means
the few things that are still absent as play, listed below as **build**. A new lock, an overheat
that stops the starter beam, ammo starvation, or a tool that quits after a second is not a row.

### 22.1 Already at the bar — do not rebuild

Cruise in under a second. Earned speed kept. Ordinary bumps do not steal the helm. Terrain kills a
light hull and spares a heavy one. A taut throw can be a killing crash. A shove puts a light hull
about a screen off its line and keeps it from firing through that coast. Hits answer with a dip, a
light, moved mass, and a sound. Sound is on. The starter beam does not lock. Swing Drive is on the
Helios shop at a first-haul price. The first two minutes keep one instruction. The ship no longer
jigs, and a slow GPU no longer runs the game in slow motion. Shadows are not redrawn every frame.
Physics is cheap. Do not reopen these to "improve" them with a limitation.

### 22.2 How a row closes

A row closes when its fixture or probe prints the number on seeds 4242 and 8008, and the change is
committed by pathspec. There is no playtest, no owner signature, and no "looks done." A visual row
closes on the chase-camera Hitch-plus loop already used for fleet leaves, or on a grammar/structure
test of the kind that pinned the flight HUD. A perf row closes on the quiet-machine probe named in
the row. If the files are dirty, finish that diff. If the number is already met, skip the row.

Take the first open row in the wave you are in. Rows in the same wave run together when their file
lists do not overlap. The remaster machine does not take these rows. It fills `vm-drop/` from
[`VM_LANES.md`](./design/program/VM_LANES.md). Local agents import a drop only after `DONE.md`.

Starter tools stay on. A row that adds an overheat lock, ammo starvation, or a tool that quits is
a failed row. Delete that change.

### 22.3 Wave A — the opening is the game

This is the vertical slice. Ship it before Wave B content.

| Id | The player gets | Done when | Files |
|---|---|---|---|
| **A1** | A hauler is already under attack within three minutes of a new game, inside about two screen-depths. A camper comes into grab range or a patrol arrives in view. The camper does not despawn and does not lose health by fiat. | One fixture, seeds 4242 and 8008, asserts spawn range, time, and the commitment event. | `src/systems/encounterDirector.js`, `src/data/pirateDoctrines.js`, `src/data/encounters/`. Finish `015-opening-hauler-raid.js` if it is already in the tree. |
| **A2** | A cargo-ship kill becomes salvage, a sale, and one new job. | Fixture: kill → salvage pickup → commodity sale → one new contract or price move. Not a fine. Not a failed mission. | `src/systems/economy.js`, `src/systems/missions.js`. |
| **A3** | The next rocks are a few minutes of cruise past a used-up starter field, with rocks between. | Fixture asserts distance ≤ a few minutes at cruise and at least one field on the way. Beam rate, hold size, and tax unchanged. | `src/systems/fieldDepletion.js`, `src/systems/world.js`. |
| **A4** | A witnessed kill puts one responder on the wreck and one chaser inside the composed frame within 10 seconds. | Fixture, both seeds, asserts frame membership and the stay-versus-chase split. No new heat formula. | `src/systems/lawSecurity.js`. |
| **A5** | Small and medium shots are born inside the composed frame and live ≥ 0.7 s on screen. | Fixture prints range and time-to-exit. Damage, rate of fire, and impulse byte-compare equal except range and projectile life. | `src/data/weapons.js`. |
| **A6** | The default route runs the slice: raid, a throw or a shove that kills, cargo or a wreck, patrol in frame, dock, Swing Drive purchased from the first-haul offer, undock with that module fitted. | One scenario, seed 4242, asserts each beat in order. No debug spawn. No mission-fail. Depends on A1–A5 being in the tree. | `src/testing/lab/` or `tools/agentic/`. |
| **A7** | Default-kit muzzles move. | Discharge flow for the starter weapons is non-zero for the life of the shot. No new particle family. | `src/render/forceLanguage/weaponDischargePool.js`. |
| **A8** | A swarm kill by shove, throw, slam, or field prints that stunt's name on the results. | Fixture reads the results model and asserts the name. No timer that clears the name. | `src/ui/screens/crucible.js`, `src/systems/survivalResults.js`. |

### 22.4 Wave B — the world keeps going, and the toy has a ceiling

A studio ships the slice, then the systems that make hour ten different from hour one, and the
combat toys the description already names. Build these. Do not wait for a person to play Wave A.

| Id | The player gets | Done when | Files |
|---|---|---|---|
| **B1** | Hours 1 through 10 still pay. Income is a curve. Encounters still spawn after hour 4. | A derived-model fixture, not a ten-hour battery: income in a post-hour-1 window is > 0, and encounter supply in hours 5–9 is > 0 on both seeds. Hour-5 supply already landed once; re-assert it, do not retune the pilot. | `src/systems/economy.js`, `src/systems/encounterDirector.js` only if the fixture is red. |
| **B2** | One pirate who escapes is back in the same sector later, with a line, and is a body you can fight. | Fixture: escape event, advance sim time, same identity spawns, bark or comms payload is non-empty. No stat debuff on the player. | `src/systems/aceMemory.js`, `src/data/namedAces.js`, `src/systems/barkDirector.js`. |
| **B3** | A wreck you made in swarm is a grabbable body in the next round. | Fixture: kill leaves a durable wreck id; the next round's Massline can latch it; latch survives the shop transition. | `src/systems/aftermathWrecks.js`, `src/systems/survivalRun.js`. |
| **B4** | The four specialist problems each break one plan: tether cut, field disrupt, anchor, cargo screen. | Four Crucible cells, seed 4242. Each specialist negates exactly its plan and does not also negate the other three. | `src/systems/tacticalAI.js`, `src/ai/`. |
| **B5** | A 150-unit-per-second slam is not the same answer as an 8-unit nudge. | Fixture: hit-stop and trauma are strictly increasing across three closing speeds, using pre-solve closing speed. Audio pitch differs by ≥ 1 octave between the light kiss and the heavy slam. | `src/render/feel.js`, `src/audio/`. |
| **B6** | Six sectors each run one job chain with nobody accepting a mission, and each has one physical number that is not Helios's. | Per sector, a fixture: miner or hauler or patrol completes one handoff, and one of {rock mass, patrol response time, gravity, traffic speed} differs from Helios by a named ratio. | `src/data/` sector profiles, `src/systems/traffic.js`. One sector per agent. |
| **B7** | Three set pieces, each a situation the sandbox verbs already solve: a convoy loss that becomes salvage, a heist that becomes an escape, a disabled ship that becomes a tow. | Three scenarios. Each ends in a new entity or contract, never in a fail-and-reload flag. | `src/data/encounters/`, `src/systems/missions.js`. |
| **B8** | A new verb every hour of the first ten hours of the tech curve, and the first one is Swing Drive inside the first haul. | `check:progression:verbs` stays green. A curve fixture lists ten purchases, each adding a verb key that has a live consumer, prices summing inside the income curve from B1. | `src/data/modules.js`, `src/data/tech.js`. |
| **B9** | Crucible's first screen offers the daily seed, the ghost, and the share code. Round end can replay the last kill for five seconds from the sim seed and can be skipped. | Fixture: those three controls exist on the entry model; the replay resim matches the kill's positions at t+5 s within a hull length; skip leaves the results model intact. | `src/ui/screens/crucible.js`, `src/systems/survivalResults.js`. |
| **B10** | The rope's combat result is the same class of outcome on both seeds. | The throw fixture from the landed taut-release work passes on 4242 and 8008 with a kill, not a 1-versus-45 split. If it already does, skip. | `src/systems/masslineThrow.js`, `src/systems/tetherGameplay.js`. |
| **B11** | A physics lab on the front door: the sandbox ships as a toy — spawn bodies, grab and throw them with the rope, slow time — for streamers and the curious. | Fixture on the default route, no dev flag: spawn → latch → throw → time-scale all work from the lab controls, and the input tape replays the same positions. | `src/ui/screens/sandbox.js` (today dev-only), `src/ui/screens/crucibleLabControls.js`, `src/testing/lab/`. |

### 22.5 Wave C — presentation a studio would not ship without

Every screen in the surface manifest, the sound of every verb, the sky, and the fleet. Close on
tests and on the chase loop. Do not close on an opinion.

| Id | The player gets | Done when | Files |
|---|---|---|---|
| **C1** | Station uses the same structural kit as the flight HUD: one accent, machined bezels, no second card language. | A test of the same shape as the flight-HUD pin: bezel present, one accent variable, no raw default button chrome. Every control has a label from the binding map. | `src/ui/station/`, `styles/station-workbench.css`, `src/ui/screens/stationHub.js`. |
| **C2** | The map, same kit, same label law. | Same class of test. Route engage is reachable from the keyboard and the pad. | `src/ui/galaxyMap.js`, `src/ui/map/`. |
| **C3** | Pause, same kit. The return-after-absence block stays. | Same class of test. Resume, save, and settings are in the tab order. | `src/ui/screens/pause.js`. |
| **C4** | Every remaining screen in §11.3 passes the same structural pin and the control-label check. | One screen per agent. The pin fails if a second accent or a default browser button is the primary control. | That screen only. |
| **C5** | Every combat verb has a sound. The list is fire, hit, shield, hull, shove, throw release, latch, break, slam, kill, dock, undock. | A table test: each verb id maps to a recipe, and the hit-answer harness counts a `play` for that recipe. Missing recipe fails the test. | `src/audio/`, `src/data/`. |
| **C6** | Six skies. Luminance of the sky plate is below the muzzle and the engine in a fixture of the profile numbers. Exactly one profile uses a galaxy plate. | The numbers are in `sectorVisualProfiles`. Art files come from `vm-drop/sector-skies/` when `DONE.md` is there; until then the row sets the luminance multipliers and the single-galaxy flag. | `src/data/sectorVisualProfiles.js`. |
| **C7** | Each remaining player hull in the PQ-050 order reaches the same chase-camera pass Drifter closed: three stills, three reviews, Hitch does not win on mass or skin. | The other machine writes the candidate to `vm-drop/<ship>-chase/`. The local row imports one ship when `DONE.md` exists and the review file says the chase pass holds. Hitch and Kestrel are not rows. | That ship's package only. |
| **C8** | The untextured wreck pieces and the missing mining-barge wreck are materials, then placed on the two Ceres wreck slots. | Drop folders `wreck-piece-textures` and `mining-barge-wreck` have `DONE.md`. The local row references seven pieces plus the barge in the existing place slots. No new wreck system. | Place data for those two slots. |

### 22.6 Wave D — the machine holds 60 with the picture on

Bar, on a quiet machine, default picture, bloom and shadows on, ten hostiles: 60 fps, at most one
frame over 50 ms per minute, zero frames over 100 ms, sim p95 ≤ 5 ms, boot to first control ≤ 10 s,
first 20 s of flight ≤ 5 % of frames over 33 ms. The quiet machine writes the probes into `vm-drop/`.
A local row changes code only to move a red number. Picture stays.

| Id | Work | Done when |
|---|---|---|
| **D1** | Only the glass and a short runway tick at 60 Hz. Dormant rocks, far traffic, and far wrecks are ledger rows and wake on approach, still there when you return. Plan: [`design/perf/TABLE_AUTHORITY_PLAN.md`](./design/perf/TABLE_AUTHORITY_PLAN.md). | Crowded-flight sim p95 ≤ 5 ms. Entity count on the 60 Hz list is the glass set, asserted by a counter. Picture flags unchanged. |
| **D2** | A new hull does not link a shader on the frame it appears. Share programs. Do not prewarm dummy meshes. | Probe prints zero new program links across the first draw of each hull in the Crucible roster. |
| **D3** | Same-material hulls batch. | Only if D1 is green and the probe names draw count as the pole. One mixed mega-batch is forbidden. |
| **D4** | The picture reads a packed snapshot, not live entity objects. | A counter proves present does not walk `entityList`. This row is the door to a sim thread. Do not start the thread in this row. |
| **D5** | Opening admission finishes before first control. | First-20 s frames over 33 ms ≤ 5 % on the quiet probe. |
| **D6** | Save bytes stop growing in a fixed cluster. | Fixture or the quiet two-hour report: bytes at 120 min ≤ bytes at 60 min plus a named ceiling. |
| **D7** | Boot to first control. | Three quiet runs, each ≤ 10 s. The row edits only the stage the report names as the longest. |
| **D8** | Crucible fight budget. | Quiet `probe:smooth-flight:crucible`, seed 4242: the bar in the paragraph above. |

Forbidden as a performance row: bloom off, shader-prewarm retries, a low preset, a Rust port, a
WebGPU swap, a sim worker before D1 and D4 are green.

**vm-drop import ledger (2026-09-24).** Imported to master: #166 zero-copy render-package digest,
#167 single-copy embedded KTX2, #168 in-place GLB body + its after-#167 companion, #169 readiness
polling without `isProgram`, #170 retail vendored-GLTFLoader alias. Still packaged and pending in
`design/program/vm-drop/*/patches/`: the quiet-latch series #31–#165 (~135 folders; each folder's
`IMPORT.md` gives apply order and `DONE.md` is the gate). Twelve unvetted VM scratch candidates the
VM never packaged were archived to `design/program/vm-work-archived/` when `vm-work/*` was deleted.
Owner calls open: (a) whether retail aliases the whole vendored `three` so the two dev-only
`three.module.js` SpaceFace fixes (empty shadow-sampler depth texture; destroyed-program readiness)
reach players — the #170 alias map would carry it; (b) the Rapier call-frequency experiment the VM
shelved at ~1.1–1.2×. `origin/vm-drop` is permanent; `vm-work/*` scratch is gone.

### 22.7 Wave E — the rest of a ship

A studio does not leave input, language, accessibility, or the front door unscheduled. These close
on checks.

| Id | The player gets | Done when | Files |
|---|---|---|---|
| **E1** | Pad: thrust, brake, rope, shove, fire, dock. No chord required for those six. | A binding-map test lists the six on the default pad layout with unique buttons. The flight fixture drives them through `state.input` the same way the keyboard fixture does. | `src/systems/gamepad.js`, the bindings screen. |
| **E2** | Reduced motion keeps every gameplay fact. Juice may drop. Hit direction, objective, law change, and stunt name stay. | The existing reduced-motion information test covers those four. Extend it if a channel is missing. | `src/ui/`, `src/render/feel.js` only for the juice gate. |
| **E3** | Strings survive a 40 % longer pseudo-locale with nothing clipped in the structural layout test. | The loc check fails on overflow. One screen family per agent. | That screen's strings and layout. |
| **E4** | Five launch languages ship from the catalogs. | The catalog check is green for all five, and a boot fixture in each language renders the title and the first objective from the catalog, not from a hardcoded fallback. | `src/localization/`. |
| **E5** | Browser and Electron read and write the same save. | The existing paired save fixture is green. If it is already green, skip. | `src/save/`. |
| **E6** | A content repetition budget: the same encounter shape cannot be the only combat offer for three hours. | Fixture over the director's hour buckets: at least three shape ids in hours 0–3 and in hours 5–9. | `src/systems/encounterDirector.js`, encounter data. |
| **E7** | Mods can add a weapon and a module by dropping data, without editing `src/`. | A fixture loads one extra weapon JSON and one extra module JSON from the user-content path and fires the weapon once. | The existing user-content loader. |
| **E8** | An "iGPU 60" preset art-directed for integrated graphics — which effects stay and which substitute is a designed list, not "everything low"; the owner's machine is min-spec. Rides `PQ-165`'s preset table. | The quiet-machine probe at iGPU-class hardware holds 60 fps median on the demo route with authored content intact; the substitution list is named in settings. | `src/render/adaptiveQuality.js`, `src/ui/screens/settings.js`. |

### 22.8 Wave F — the signature minute, made readable

Admitted with the rest of §22. These are the extra toys on top of Waves A–E. Each one makes a
verb the game already has easier to aim, or gives that verb another body. None of them add a
meter that runs out. Close on the fixture named in the row. Skip the row if that fixture already
passes.

Do not take a Wave F row whose files are in a live dirty diff or in an open Wave A–E row. The
collisions that matter: F3 and F11 share the encounter director with A1. F5 shares barks with B2.
F8 shares law with A4. F9 shares feel with B5. F2 and F6 share audio or the rope with B5 and B10.

#### F1 — The release ghost

**What.** While the player's rope is taut on a lighter body, draw the path that body will take if
they release this instant: a short arc along the current tangent, long enough to see the next rock
or hull it will meet, gone the moment the rope goes slack. It is a prediction from the live
velocity, not a guided shot. The player still chooses the instant.

**Why it's fun.** The throw already kills, and it feels like luck until you can see the cut. A
ghost turns "I mashed the button" into "I waited until the line crossed his wingman." That is the
whole Massline fantasy: a complicated outcome from a simple, visible rule. Rocket League's ball
line and a grappling game's swing arc are the same kindness.

**Done when.** A fixture latches a light hull, swings to a known tangent, and asserts the ghost's
first segment matches the post-release velocity within a small angle. Releasing clears the ghost
on that tick. The ghost does not add speed and does not steer the body.

**Mistakes.** Steering the victim onto the ghost after release. Drawing a homing line that bends
toward a target the player did not create. Showing the ghost for heavy anchors, where the player
is the one who moves. Leaving it up after the cut. Drawing it in screen space so it lies at the
wrong depth. Using it as an autopilot.

**Files.** The Massline presentation and the throw solver's read-only exit velocity. Do not change
release impulse.

#### F2 — The rope sings

**What.** A continuous tone while a line is taut. Pitch and loudness follow load: slack is quiet
and low, a hard swing climbs, the cut is the snap that already exists. One voice. It ducks under
weapons, it does not stack a second melody.

**Why it's fun.** The eye is on the body you are about to throw. The ear should say "now." A
rising tone is how you learn a swing without staring at a number. The snap on release is the
joke landing.

**Done when.** A fixture drives three loads and asserts the playing cue's pitch is strictly
increasing, and that silence returns within a tick of release. The snap cue still fires.

**Mistakes.** A numeric load label instead of the tone. A loop that ignores load and just hums.
Restarting the sample every tick so it crackles. Playing it for every NPC tether in a swarm until
the mix is a chord. Cutting the tone when the Windows motion setting is on; this is information,
and it stays under reduced motion as a quieter tone, not as silence.

**Files.** `src/audio/` and the tether load value it already publishes. Do not retune the rope's
break point. There is no break point to add.

#### F3 — The opening trio fits in one well

**What.** The first pirate group in the opening raid spawns inside one gravity-well diameter of
each other, and inside the composed frame from A5. They are still three ships with mass. They are
not a stacked spawn on one point.

**Why it's fun.** A well, a shove, and a throw are jokes about neighbors. Three ships at gun range
but hundreds of units apart are three duels. Three ships who can be gathered are one trick. This
is the difference between a shooter encounter and a SpaceFace encounter.

**Done when.** The A1 fixture, once it exists, also asserts the pairwise distance of the opening
raiders is below the starter well's diameter and above a hull length. If A1 is not in yet, this
row waits. Do not invent a second opening encounter.

**Mistakes.** Spawning them on the same coordinate so they explode apart. Spawning them "in a
well" by secretly pulling them together after spawn. Shrinking the well until only this one group
fits and every later fight breaks. Moving the player to the group instead of the group to the
player's neighborhood.

**Files.** The opening encounter authored for A1. No change to well force, well radius, or weapon
damage.

#### F4 — The pod is the color of what is inside it

**What.** A loose cargo pod's body color comes from its commodity: one readable hue per cargo
family (ore, food, contraband, and the rest of the live families). The hue is on the pod, stable
for the life of that pod, and the same hue the station uses for that commodity.

**Why it's fun.** Stealing is a decision only if you can see the prize. A white crate is a
pickup. A green food pod next to a hot contraband pod is a choice, and a choice you can make at
speed. It also makes a spilled hold readable after a crash: the wreck tells you what was lost.

**Done when.** A fixture spills two commodities and asserts the pod presentation ids differ and
match the commodity table. A third pod of the same commodity matches the first.

**Mistakes.** Tinting the whole ship. Randomizing color per spawn so the code lies. Encoding
price in the color. Adding a floating text label and calling the color done. Using red versus
green as the only pair.

**Files.** Cargo pod presentation and the commodity color table. Do not change prices or pod mass.

#### F5 — A near miss talks

**What.** When a thrown or shoved body passes within a short distance of a civilian or a patrol
and does not hit them, that witness emits one bark. One bark per pass, not per frame. The bark
names the danger in plain words.

**Why it's fun.** The fantasy includes "oh no, almost." A silent near miss is a geometry event.
A shout makes the player grin and sets up the real hit, which A4 and the law already know how to
punish. The world feels awake without taking the shot for you.

**Done when.** A fixture throws a light hull past a civilian inside the bark radius and asserts
exactly one bark. A second pass after the cooldown may bark again. A hit does not also fire the
near-miss bark.

**Mistakes.** Barking every tick of a long fly-by. Barking for the player's own hull just flying
through traffic. Using the bark as a tutorial popup with a button. Applying heat or a fine on the
miss. Sharing B2's files in the same breath; if `barkDirector.js` is already being edited, wait.

**Files.** `src/systems/barkDirector.js` and the throw/shove receipt. Do not edit law heat.

#### F6 — Credit chips can be thrown

**What.** The credit chips that already tumble out of a kill are Massline-latchable bodies for a
short life. Latch, swing, release. They still pay out when collected. They are light.

**Why it's fun.** Money that is also a projectile is the game's joke about greed. You can bat a
chip into a scrap field, or tow a fat chip out of a fight you do not want to stay in. It makes
the kill's reward part of the physics instead of a vacuum animation.

**Done when.** A fixture kills a light hostile, latches one chip, releases it, and asserts the
chip's speed changed and the credit amount is unchanged until collection.

**Mistakes.** Letting the chip duplicate credits when latched. Making chips heavy enough to swing
the player. Auto-collecting the moment the rope touches them so the throw is impossible. Persisting
every chip in the save.

**Files.** The chip body and the Massline target filter. Do not change kill-reward amounts.

#### F7 — A hot arrival spills the bay

**What.** Docking always works. If the player's speed at the dock threshold is above a published
cruise fraction, one or two pods from the hold appear as loose bodies in the bay. Below that
speed, the hold stays shut. The pods are the F4 bodies. The player can rope them back or sell
them if they pick them up.

**Why it's fun.** Coming in hot is a story, not a failure screen. The bay becomes a tiny physics
puzzle you made yourself. Clean flying is rewarded with convenience. Reckless flying is rewarded
with a mess you can still profit from. Both are success.

**Done when.** A fixture docks above the threshold and asserts a pod spawned and the hold count
dropped by that amount. A fixture docks below the threshold and asserts the hold is unchanged.
Neither fixture sets a fail flag.

**Mistakes.** Refusing the dock. Damaging the hull for speed. Spilling the entire hold. Spilling
pods outside the station where they delete. Adding a "docking grade" letter. Applying this to
NPC docks.

**Files.** The dock transition and cargo spill. Do not add a minigame or a timer.

#### F8 — The search is a volume

**What.** When the player is WANTED, the search is a radius already in the heat system, drawn as
patrol lights or a faint ring in the world, centered on the last witnessed crime or the searching
patrol. Flying outside it and staying out drops a tier by the rule heat already uses. The HUD
meter may remain. The volume is the truth.

**Why it's fun.** Escaping a number is homework. Escaping a ring of lights you can see is a
flight. Players will skim the edge on purpose, which is a skill, and they will understand why a
patrol turned around.

**Done when.** A fixture sets heat above the wanted line, asserts a search volume exists at the
authored radius, moves the player outside it for the existing clear time, and asserts the tier
dropped. No new heat math.

**Mistakes.** A second heat system. A wall at the radius. Damage for being inside. Hiding the
volume in a menu. Drawing the ring in HUD pixels so it does not match the patrol's actual range.
Editing A4's chase assignment in the same change.

**Files.** Heat's existing radius, and the presentation that reads it. `lawSecurity.js` only if
the volume has no reader and A4's editor is done.

#### F9 — A chain holds a beat

**What.** When a player shove or throw causes a third body to be hit within a short window, the
existing hit-stop dips once more, long enough to see the chain, then time resumes. It fires once
per chain. It is not a resource.

**Why it's fun.** The best moment in this game is three bodies agreeing. If time does not
acknowledge it, the player finds out from a log line. A single dip is the game pointing at the
joke they just made. Hades and Rocket League both freeze the frame on the event that mattered.

**Done when.** A fixture causes a three-body contact from one player release and asserts exactly
one extra hit-stop. A two-body hit does not get the extra dip. A second chain later does.

**Mistakes.** A combo meter that decays. A player-charged bullet-time pool. Stacking the dip on
every subsequent contact so a scrap field freezes the game. Applying it to NPC-only collisions.
Doing this in the same edit as B5's slam curve.

**Files.** `src/render/feel.js` and the collision receipt. Wait until B5 is committed.

#### F10 — The three starters are jobs

**What.** New game offers the three starter hulls that already exist in `newGameDefaults`. Each
card says what the hull is for in the air: the one that anchors, the one that throws, the one
that lives on the line. The stats on the card are mass, thrust, and line load in words, matching
the live derived numbers.

**Why it's fun.** A starter is a playstyle. "Interceptor" is nothing. "This one can swing a
hauler" is a reason to pick it and a reason to learn the rope. The player feels the choice in
the first minute because the hull actually differs.

**Done when.** A fixture reads the three new-game offers and asserts three different hull ids,
three non-empty verb sentences, and that each sentence's mass or line number matches that hull's
derived stats. Selecting one equips that hull on the default route.

**Mistakes.** Adding a fourth hull. Rewriting handling. Locking two of them behind credits.
Describing them with DPS. Changing the 47-A default hull used by goldens.

**Files.** `src/data/newGameDefaults.js` and the new-game screen. Do not edit `ships.js` handling.

#### F11 — The winner flies off with the pod

**What.** If the opening raiders take the hauler's cargo and the player does not stop them, the
raider that holds the pod flies a real route to a fence or a drop point in-sector. The pod is on
that ship. Catching or killing them spills it. They do not despawn at a timer while the pod is
unrecovered.

**Why it's fun.** A raid you ignored should still change the sky. Chasing a thief who has your
prize is a second scene with the same verbs: catch, tether, spill, run. It is the "so then" the
description asks for. A raid that deletes itself when you look away is a cutscene.

**Done when.** A fixture lets the raid resolve in the pirates' favor and asserts the pod's host
id is the fleeing raider, the raider's destination is a finite in-sector point, and destroying
that raider spills the pod. A second fixture where the player spills the pod first asserts the
raiders do not grow a new pod.

**Mistakes.** A mission-fail flag. Despawning the raider at the map edge with the loot. A
scripted cutscene of the getaway. Making the raider immortal until a trigger. Spawning this on
top of a half-finished A1 encounter; extend A1, do not add encounter number 016 for the same beat.

**Files.** The A1 encounter and the cargo-custody handoff. Start only after A1 is committed.

#### F12 — The mining beam opens a pod

**What.** The starter beam never locks, which is already law. Aimed at a cargo pod, the same beam
splits that pod and spills its commodity as F4 bodies. Aimed at a rock, it mines, as now. It does
not consume ammo and it does not overheat into a lock.

**Why it's fun.** One tool, two crimes. The player who already learned "hold the beam on the
shiny thing" can open a stolen pod without a new button. The rope remains how you throw the pod.
The beam is how you open it. That split is easy to teach and hard to forget.

**Done when.** A fixture aims the beam at a pod for a bounded time and asserts the pod is gone
and its commodity exists as loose bodies. A fixture aims at a rock and asserts ore still arrives
and the rock path did not gain a lockout.

**Mistakes.** A second fire mode. A heat lock "just for pods." Instantly vaporizing the pod with
no spill. Letting the beam open stations, ships, or wrecks in this row. Changing mining yield.

**Files.** `src/systems/mining.js` and the pod split. Do not edit the rope.

#### F13 — One machine in the first field

**What.** The starter field contains one authored machine: a cracker, a furnace mouth, or a mass
driver. It is a body with a mouth. A ship or a pod that enters the mouth is thrown or broken by
the machine's existing force, and the result is loot or a fast exit vector. It runs whether or
not the player is on a mission.

**Why it's fun.** The first place you mine should also be the first place you can feed an enemy
to the scenery. That is the description's "environment is a weapon," delivered once, beautifully,
instead of as a list of later hazards. Players will convoy a pirate into it on purpose.

**Done when.** A fixture pushes a light hull into the mouth and asserts a velocity change or a
break, plus a loot or debris receipt. The machine's position is inside the starter field's
radius. It does not target the player by itself.

**Mistakes.** A damage volume with no visible mouth. A scripted instant-kill on enter. A turret.
Building a new hazard system when a placed force volume will do. Putting it a sector away from
the starter rocks.

**Files.** Starter-field placement and the existing force or crusher path. Do not build PQ-027's
whole catalog in this row.

#### F14 — One hauler is worth catching

**What.** Hitchhiking is already on in the production profile and off on the legacy 47-A profile.
Leave 47-A alone. In the opening, one live hauler is heavier than the player, has a destination,
and can be latched. While latched, the player is towed. On release, the player keeps the speed
they had, which earned-speed already does. A single cue, the F2 tone or a one-word comms, marks
the tow. No new force.

**Why it's fun.** Catching a ride is the rope used for travel, which is half of why the rope
exists. A hauler going somewhere interesting turns the map into a moving train you can grab.
Players who learn it cross the sector faster than anyone who only holds thrust, and they feel
clever.

**Done when.** A production-profile fixture latches that hauler, asserts the player's speed rises
toward the hauler's without the player's thrust, and asserts speed after release stays at the
earned-speed rule. The 47-A feature pin stays `hitchhiking: false`.

**Mistakes.** Flipping the 47-A flag and re-recording goldens. A second tow mode. A speed boost
that ignores mass. Auto-latch when you fly near traffic. Killing the player's control for the
duration of the tow.

**Files.** Opening traffic composition and the existing hitchhiking path. Do not edit
`runtimeProfiles.js` legacy pins.

#### F15 — A few wrecks are still there tomorrow

**What.** Each sector remembers a capped list of the player's significant wrecks: position, hull
family, and commodity hint. Cap is small and constant. Loading the sector respawns those wrecks
as the durable wrecks the game already has. Older wrecks past the cap drop off. This is the same
cap spirit as D6.

**Why it's fun.** A world that forgets your explosion forgets your story. Coming back to the
hauler you cracked, still lying on the lane, is how the game becomes "my sector." The cap keeps
it a memory, not a junkyard that costs a frame.

**Done when.** A fixture destroys two ships, saves, loads, and asserts both wrecks exist near
their death positions. A fixture past the cap asserts the count equals the cap and the save's
wreck bytes do not grow on a third, fourth, and fifth kill.

**Mistakes.** Unbounded history. Restoring wrecks as live hostile ships. Restoring them inside
the player. A new wreck system beside `aftermathWrecks`. Skipping the cap because "it's just a
few."

**Files.** `src/systems/aftermathWrecks.js` and the save slice that sector already owns. Do not
raise the far-actor cap.

#### F16 — The route is a ribbon

**What.** When the player has a flight destination, a faint ribbon exists in the world along the
path the autopilot already uses. It is dimmer than engines and muzzles. Flying along it is
ordinary flight. Releasing a hitchhike or a swing while on the ribbon does not snap you onto it.

**Why it's fun.** A HUD marker is a hint. A line in space is a piece of track you can play with:
sling along it, cut across it, watch a hauler follow it. The map and the sky agree, which is how
a place becomes understandable at speed.

**Done when.** A fixture sets a destination and asserts a ribbon polyline exists in world space
from the player toward that point, with a max brightness below the engine plume's authored
intensity. Clearing the destination removes the ribbon. The ribbon applies no force.

**Mistakes.** A rail the ship sticks to. A bright ribbon that hides targets. Drawing it only on
the map UI and claiming the world has it. Rebuilding pathfinding. Making it mandatory to follow.

**Files.** Route presentation. Do not edit the autopilot's steering.

#### F17 — Repair is staying attached

**What.** A disabled friendly or a derelict the player is allowed to help repairs while the
player's rope stays taut on it, or while a live tender stays taut on it. Hull ticks back up only
during the latch. Break the latch and progress stops where it is. Finishing the repair frees the
ship. No reload, no fail timer.

**Why it's fun.** Rescue becomes a flight problem: hold the line, drag them out of the rocks,
don't get hit. Letting go is a choice with a visible cost, not a game over. The tender in the
description finally does its job as a body.

**Done when.** A fixture latches a disabled hull, advances time, and asserts hull increased. A
fixture that releases early asserts hull froze at the partial value and the ship is still
disabled. A fixture that holds to full asserts the ship can thrust again.

**Mistakes.** A repair bar in a menu. A timer that fails the mission. Healing any enemy you
tether. Healing the player for free by tethering a rock. Instant full repair on contact.

**Files.** The tether latch receipt and the disabled-ship state. Do not add a med-beam.

### 22.9 Wave G — little quality

These are the small jobs. One row is one agent and one sitting. Take any row whose files are not
dirty and not listed on an open Wave A–F row. Do not widen the row. Close on the fixture. If the
fixture already passes, skip.

`PQ-155.04` already owns in-flight mining skill. A clean aim pays more ore than a sloppy aim, at
least 2× on the same rock. That gradient is yield. The starter beam still never locks. A vent
bonus may pay extra. A pegged gauge must not shut the tool off. Do not take G-rows in
`src/systems/mining.js` while that leaf is in progress.

| Id | What the player gets | Why it is fun | Done when | Mistakes that fail the row | Files |
|---|---|---|---|---|---|
| **G1** | The Massline bracket says one state: CAN, OUT OF RANGE, or DENIED, plus a three-word reason when denied. The words sit on the bracket, never on the player's hull. | You learn the rope by looking at the thing you want, not by reading a paragraph under your ship. | Fixture cycles range, a valid target, and a denied target. The three strings are distinct. No bracket node overlaps the player hull's screen rect. | A sentence. A tutorial modal. A state that lies (CAN while the latch will fail). Drawing it in world units that drift off the target. | Massline HUD only. Not the throw solver. |
| **G2** | A denied latch has its own short sound, different from the taut tone and the release snap. | A silent refusal feels like the button is broken. A dull tick feels like the world said no. | Fixture: denied attempt fires one cue id; a successful latch fires a different id; neither fires on hover. | Reusing the hit sound. Playing it every frame while you hold the button on a bad target. | `src/audio/` cue table and the deny receipt. Not F2's continuous tone in the same edit. |
| **G3** | A shield hit, a hull hit, a shove, and a dock do not appear as sentences on screen. | The picture and the sound already happened. A caption in the middle of the fight is the game talking over itself. | Fixture emits those four events and asserts the toast list gained nothing. Law and objectives may still use text. | Deleting the objective line. Routing the ban through a hidden log the player still sees. | The toast router. Not `hudAttention.js` if another row has it. |
| **G4** | A hostile that can shoot the player and is outside the frame gets one directional marker on the screen edge. It dies with the hostile. | Off-screen damage feels like a bug. An edge mark makes it a bearing. | Fixture places an attacker outside the composed frame and asserts one marker whose side matches the attacker's quadrant. An in-frame attacker gets none. | A marker per projectile. A marker that covers the center. A second radar. | HUD threat marker. Not `weapons.js` (that is A5). |
| **G5** | Primary labels are fully visible: title continue line, pilot name, dock status, station mission title, map route control. | Clipped words are how a game looks unfinished in the first five screens. | A layout fixture at 1280×720 and 1920×1080 asserts each named node's text is fully inside its box (`scrollWidth` ≤ client width, no mid-word ellipsis on those nodes). | Shrinking the font until it passes and becomes unreadable. Hiding the label. | The one screen that fails. One screen per agent. |
| **G6** | An impulse hit reads as a cone along the hit direction. A shield tick and a hull hit are different shapes. | You can tell what you did to the target without a damage number. Direction is the skill. | Fixture: the impact descriptor's axis matches the impulse vector within a small angle, and shield versus hull select different shape ids. | A camera-facing soft disc. A sphere burst for both. More particles instead of a different shape. | `src/render/vfx.js` or the impact presenter. Not a new family. |
| **G7** | The contacts list stays hidden until the player locks something. | A list of names during the first minute is homework. The lock is when the list becomes useful. | Fixture: before any lock, the list is not in the flight HUD tree; after a lock, it is. | Removing target lock. Showing the list at half opacity and calling it hidden. | Flight HUD contacts only. |
| **G8** | Sector law is a single badge until the law changes, then one line, then the badge again. | Three sentences of law during a fight are a poster. A badge you already understand is enough, and the change is the moment that matters. | Fixture: steady law renders one badge node; a law-change event reveals one line for a bounded time; the line retires. | Deleting the law. Leaving the full panel up. A modal that must be clicked. | Law HUD presenter. Not `lawSecurity.js` if A4 has it. |
| **G9** | The current objective can be brought back with one key after it has left the screen. | Players dismiss text and then feel lost. One key is the whole recovery. | Fixture dismisses the objective and asserts the bound key restores the same string. | A new tutorial. A key that opens the whole mission log on top of flight. | Objective HUD and the binding map. |
| **G10** | Thrust audio and the plume follow the throttle. Zero throttle is silence and a dark engine within a quarter second. Full throttle is the loud cue and a grown plume within 120 ms. | The ship should answer the hand on the same breath. A plume that lags, or a engine that moans at idle, makes the hull feel like a recording. | Fixture steps throttle 0 → 1 → 0 and asserts cue gain and plume parameter cross the authored thresholds inside those windows. | A looping engine at idle. A plume that only changes color. Restarting the sample every tick. | Thruster audio and plume parameter. Not flight thrust curves. |
| **G11** | The module card and the fitting screen show no number the sim does not read. | A dead stat is a lie, and players build around lies. | Fixture walks advertised numeric fields on the starter cards and asserts each has a live consumer in the derived-stat or verb audit. A planted dead field fails. | Deleting real stats to go green. Hiding the whole card. | Outfitting presentation. Not `modules.js` balance. |
| **G12** | The dock prompt, the speed readout, and the weapon name do not occupy the same pixels. | Overlapping instruments look like a web page that failed to load. Each number needs a place. | Fixture at both resolutions asserts the three nodes' boxes are disjoint. | Moving them off-screen. Combining them into one cramped string. | Dock HUD layout only. |
| **G13** | The player's own hull is not a caption surface. No payload, route, or law string is anchored to the ship sprite. | The hull is the thing you steer. Text on it hides the turn and the shot. | Fixture asserts no HUD string node is parented to the player billboard or placed within a hull-length of the player screen point, except the bracket from G1. | Removing the bracket too. Pinning the text to the nose "just above" so it still covers the ship at zoom. | HUD anchors. |
| **G14** | A selected target's bracket is on that target. Friendly, hostile, and cargo use three shapes, not three sentences. | You should know what you are about to rope before you press the button. Shape is faster than a word. | Fixture locks a hostile, a civilian, and a pod, and asserts three bracket shape ids at those entities' positions. | Color-only distinction. A floating name as the only difference. | Target bracket. Shares no file with G1 if both are in progress; otherwise one agent may take G1 and G14 together. |
| **G15** | Help text for a verb shows the key the player actually bound. | A prompt that says the wrong key is a defect, not flavor. | Fixture rebinds rope and shove and asserts the flight prompt strings contain the new labels and not the old defaults. | Hardcoding the new keys. Only fixing one screen. | Binding-label helper and the flight prompts. Not the pad map (E1 / `PQ-164.04`). |

### 22.10 Order

Wave A first, and its rows in parallel where the file lists differ. Wave D in parallel with Wave A
on the quiet machine and on the perf files, which do not include economy, encounters, or weapons.
Wave B starts when A6's scenario is committed, and its rows run in parallel by the file lists.
Wave C and Wave E start as soon as their files are free; they do not wait on a person. C7 waits
on the drop folder, not on a play session.

Wave F starts when the row's files are free. F3 waits on A1. F11 waits on A1. F9 waits on B5.
F14 does not touch the legacy 47-A profile. Otherwise Wave F does not wait on a play session.

Wave G is the little-quality pile. Any G row may be taken immediately when its files are free.
One row per agent. G6 waits if B5 holds `feel.js`. G2 waits if C5 or F2 holds `src/audio/`.
Mining skill is `PQ-155.04`, not a G row, and it must not lock the beam. Twin-stick flight is
`PQ-164.04`. The physics lab is B11. The integrated-graphics preset is E8.

### 22.11 Not scheduled

A scarred personal ship. An empire management screen. A loot-rarity ladder. A dialogue campaign.
A starter-tool limit. A second renderer. Those are refusals, not deferred rows.

## 23. Superpower campaigns — ADMITTED 2026-09-22

This is the work that needs taste, world knowledge, or a system the planner should not finish.
Each campaign is a feeling. The implementation is yours. A better foundation than this section is
the success, not a miss.

**Since 2026-09-24 these campaigns live inside the §27 lanes** — each lane brief names which
campaigns it absorbs, and the campaign text below remains the detailed wording for that part of
the lane. A lane session takes the campaign's spirit over its exact letter: the feeling is the
assignment; the lane's open-ended review is how you find the rest of it.

The game already simulates more than the session shows. Convergence campaigns make that simulation
feel like one finished game. Creative campaigns invent a new situation out of bodies and verbs
that already exist. Both are aimed at the fantasy in [`design/VISION.md`](./design/VISION.md):
a fast, colorful, physical sandbox where a simple action keeps becoming a bigger story, inside a
world that was already working when you arrived.

### 23.0 How to take one

1. Read the feeling. Then read the live owners it names, and the ordinary route a stranger hits.
   If the feeling is already true there, skip the campaign and say so.
2. Invent the mechanism. Do not split the feeling into a new packet, a fixture list, or a catalog
   line before a stranger can feel the first slice.
3. One campaign at a time. One slice is a commit the player can perceive. The campaign stays open
   until the feeling is ordinary on the default route.
4. Skip a campaign whose owners a live `NOW.md` row is already editing.
5. A grunt-sized lie you trip over can be fixed on the way, or written into
   [`design/program/INFERENCE_IDEAS.md`](./design/program/INFERENCE_IDEAS.md) as a specific line.
   It is not a reason to abandon the feeling.
6. The remaster machine does not take these. It fills `vm-drop/`. You may art-direct the live
   picture without waiting for a drop.
7. Feel guts still obey [`design/program/FUN_CONVERGENCE_LOOP.md`](./design/program/FUN_CONVERGENCE_LOOP.md).
   A campaign that answers "the ship ignores you" with content has failed.
8. Laws that every campaign inherits: one game path; no second physics, cargo, heat, or AI; no
   drag, no momentum clamp, no NPC gyro; starter tools stay on; no overheat lock, no ammo
   starvation, no tool that quits; no camera-facing soft card as a designed object; nothing on
   the live glass loses its mesh; do not buy a frame by turning the picture off; reduced motion
   keeps the facts; failure mutates the situation instead of reloading it.
9. Outside resources are already in the tree. Actualize them with the tasks in §23.4.
   Do not open a search for a substitute. Unreal source stays out.

A thin version is a label, a tint, a toast, a new meter, or a second system beside the one that
already computes the thing. Connect the listener. Then make it beautiful. A private system that
duplicates a better library is the same kind of thin.

**Order.** If the complaint is the picture, start at CV-GLASS or CV-PAINT. If the complaint is
the session, start at CV-THROW or CV-DAY. Creative campaigns start when you can point at a place
that already has bodies and the feeling is still a rumor. Take the first open campaign in that
spirit whose owners are free.

### 23.1 Convergence — the game that is already here, made one thing

These converge on the polished game. They do not add a genre.

#### CV-GLASS — The picture arrives with you

**The feeling.** Whatever is on the glass is the real object, at the quality of the thing next
to it, and it was ready before it crossed into view. Flying away, the world stays solid in the
head even while the machine lets go of what it no longer has to draw. Nothing pops into being
on screen. Nothing winks out while you are still looking at it. A lock is never sitting on
empty air. Far traffic may be quieter. It may not become a cheaper species, a box, or a blank.

**What is lying.** Residency, submit, and the asteroid pools already try to follow the table.
The historical failures are still the right fear: rocks vanishing for the session, bodies
popping because the picture and the budget disagreed about what "on screen" meant, a dock or
a lock with nothing in it, a wreck you just made sitting invisible while the opening hold
parks work. Off-screen cost and on-screen lateness have not been one calibrated story.

**You invent.** The system that makes identity, residency, and the live camera agree — including
how far work stays cheap without ever showing that cheapness on the glass. Radii in the current
policy are evidence, not the design. The outside piece for a far hull is `meshoptimizer` simplify,
already in the repo, with a small error so the result is still that ship. The outside piece for a
frame rendered under resolution is FidelityFX CAS, on the canvas only. Both are named in
[`docs/OPEN_SOURCE_INTAKE.md`](./docs/OPEN_SOURCE_INTAKE.md) §0. A bounds library does not fix a pop.

**Read.** `src/render/tabletopPolicy.js`, `src/render/entityMeshVisibility.js`,
`src/render/authoredAdmissionPolicy.js`, `src/render/assetResidency.js`,
`src/render/asteroidInstancePool.js`, `src/render/renderer.js`, `docs/COMMON_BUGS.md` on
pop-in and unpackaged hulls. The known retired-buffer bug stays a §21 / `PQ-210.03` fix if
that is the only hole. This campaign is the class of hole.

**Thin.** Another prefetch constant. A fade that hides a missing mesh. A silhouette proxy that
swaps the body. Cutting bloom, shadows, or draw distance and calling the pop fixed.

#### CV-PAINT — Industrial machinery at arcade energy

**The feeling.** One still frame, paused, and a stranger can name the job of the thing they
are looking at. The world is dark so the action can explode. Hulls are painted working
vessels, not toy plastic, not children's animation, not gray sci-fi, not a tasteful navy kit
with a cyan rim. Ceramics, rubber, glass, paint, and exposed mechanism stay different
substances. Weapons and thrust are the brightest events. Faction is posture and theft and
silhouette, not a recolor of the same hull. From the chase camera — overhead, not a beauty
orbit — occupation reads as light, motion, and shape. Detail the camera cannot see does not
count.

**What is lying.** The player, the Massline, and some Helios places are authored. NPC plumes,
the mining beam, wreck fallbacks, common rocks, and several hulls still read as a different
product. Some sectors are a tint on the same sky. The standard already says "think painted
working vessels under warm starlight." The live picture does not yet obey it as one culture.

**You invent.** The art direction that makes every family — hull, rock, station, wreck, tool,
sky, impact — look like the same game without chasing hyperreal materials. Hyperreal is not
the goal. Beautiful, readable, and physical is. The source maps and the lighting environment to
start from are named in [`docs/OPEN_SOURCE_INTAKE.md`](./docs/OPEN_SOURCE_INTAKE.md) §0: the
foundry HDRI as light, not as the sky, and the painted-metal, rubber, and tile sets graded into
the illustrated families. A raw photo on a hull is a failed slice.

**Read.** `design/VISION.md` (the visual fantasy), `docs/visual-assets/ILLUSTRATED_GRAPHICS_STANDARD.md`,
`docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`, `src/render/illustratedSurface.js`,
`src/render/materialLibrary.js`, `src/render/thruster/`, `src/data/sectorVisualProfiles.js`.
Fleet remaster stays `PQ-050` / `PQ-193` and the other computer. You unify what the chase
camera already shows.

**Thin.** A global color grade. Scratch noise on a bland object. Glow instead of a substance.
A caption that says "miner." Recoloring one GLB and calling the faction done.

#### CV-HAND — The hull answers the hand

**The feeling.** Throttle, plume, brake, rope, shove, and fire are one breath. The picture,
the sound, and the instrument agree inside a fraction of a second. Zero is silence and a dark
engine. A hard swing is a rising voice. A denied latch feels like the world said no, not like
a dead button. A hit has a direction you can see. Nothing in that breath is a menu click.

**What is lying.** Pieces of this exist — plumes, hit-stop, brackets, some recipes — and they
do not share a clock. Several weapons still look frozen at the muzzle. Several cues collapse
to the starter gun or to a UI tick. The hand moves and the ship answers late, or answers with
the wrong species of effect.

**You invent.** The attention system: which channel carries the verb, how the others duck, how
reduced motion keeps the fact when the juice drops. §22 Wave G names some of the lies one at
a time. This campaign is the breath they belong to. The rope and the engine, because they follow
a live number, are Elementary Audio. One-shots that are simply missing come from the Sonniss
picks or a single Kenney file, as named in
[`docs/OPEN_SOURCE_INTAKE.md`](./docs/OPEN_SOURCE_INTAKE.md) §0.

**Read.** `src/render/feel.js`, `src/render/shipMicroMotion.js`, `src/render/forceLanguage/`,
`src/audio/audioSystem.js`, `src/ui/hudBrackets.js`. Do not retune thrust curves to fake the
answer.

**Thin.** More particles. A caption. Camera shake with no moved mass. A loop that hums at idle.

#### CV-THROW — A throw is a decision you made

**The feeling.** You understand the line, you wait, you cut, and the body goes where your cut
sent it. Afterward it looks complicated. In the moment it was a few honest rules. The game
does not secretly fly the cool move. A light hull is something you can turn into a projectile.
A heavy hull is something you swing around. Missing is allowed, and missing is readable.

**What is lying.** A taut throw can already kill, and the solver will still steer the victim
onto a meeting. That is why it can feel like luck or a cutscene. The signature mechanic is
doing the player's authorship for them.

**You invent.** How a player learns the cut — by eye, by ear, by the body — without a homing
aid and without a tutorial modal. Prediction is welcome if it never becomes steering.

**Read.** `design/VISION.md` on the Massline, `src/systems/masslineThrow.js`,
`src/systems/tetherGameplay.js`, `src/ui/masslineHud.js`. Release impulse is not yours to
nerf. There is no break point to add.

**Thin.** A guided shot. A damage buff on release. A diamond that auto-scores. Teaching it
with a paragraph.

#### CV-AMMO — Lights are ammunition, heavies are terrain

**The feeling.** A small ship is a positioning problem you can end with a shove, a well, or a
throw. A medium ship asks for commitment. A heavy ship changes the room. A specialist ruins
one plan — the tether, the field, the anchor, the cargo — and does not also ruin the other
three by having more health. You grin because you got to be unfair in a way you earned.
Swarm and the adventure opening are the same toy at two densities.

**What is lying.** The verbs exist. The opening still spreads bodies out to gun range and
then deletes them. Fields are on the keyboard and untaught. The roster's physical problems
live in data more than in the first fights you actually get.

**You invent.** How a fight becomes a cluster of bodies the sandbox can abuse, in adventure
and in the Crucible, without adding hit points or a combo meter. Detection of stunts is not
the feeling. The wreck you can still use is.

**Read.** `src/systems/fields.js`, `src/systems/stuntGrammar.js`, `src/ai/specialistPlans.js`,
`src/systems/survivalSwarm.js`, the opening encounter. Do not answer this with more enemy types.

**Thin.** A combo counter. More wasps at the same spacing. A specialist that is only a DPS skin.

#### CV-DAY — You arrived in the middle of their day

**The feeling.** A miner is on a seam. Material is coming off it. A hauler is coming or
going. Someone wants that cargo. A patrol has a route. You did not press accept to make
this true. You can interfere anywhere in the chain, or you can watch it, and the chain
continues either way. The first hour and the tenth hour are both somebody's shift.

**What is lying.** The chain is real in the sim, and it is choreographed where the player
is not standing yet. The harbour you start in is calm water: beacons, passive traffic, a
raid that can wait for a prompt and then despawn. Ceres already knows how a pocket works.
Helios does not yet feel like a job in progress.

**You invent.** How the opening neighbourhood shows one living chain — without a mission
accept, without a new director, and without cloning the whole Ceres catalog onto the
starter field. Later sectors should differ by what the job *is*, not by a density slider.

**Read.** `design/VISION.md` ("the world is not scenery"), `src/systems/traffic.js`,
`src/systems/npcJobs.js`, `src/data/sectorActivityPockets.js`, `src/data/sectors.js`,
`src/systems/encounterDirector.js`. §22 A1 is the measured raid. This is the shift around it.

**Thin.** Decorative ships in orbit. A briefing. A second pocket system. Raising
`trafficPerMin` and calling the place alive.

#### CV-SO — Failure leaves a body with a job

**The feeling.** You can tell the story in "so then." The convoy died, so there is salvage.
The pod spilled, so someone wants it. The pirate got away, so that person can be back. You
docked too hot, or you missed, or you hit the wrong hull, and the sky changed. Nobody
reloaded the mission. The wreck, the price, the patrol, and the name are still out there
when you come back, inside a cap the machine can hold.

**What is lying.** Heat, witnesses, wrecks, chronicles, and prices all exist. A stranger
still cannot fly back to one consequence and find it doing something. Timeouts delete the
scene. A wreck is often a kit, not the ship you killed.

**You invent.** How one failure becomes the next situation the same verbs can solve, and
how the sector remembers a few of those situations without becoming a junkyard. §22 already
measures several single beats (salvage into a sale, a search volume, wrecks tomorrow). This
campaign is the habit: the world keeps going.

**Read.** `src/systems/aftermathWrecks.js`, `src/systems/lawSecurity.js`,
`src/systems/economy.js`, `src/systems/aceMemory.js`, `src/systems/custodyConsequences.js`.
No new heat formula. No mission-fail flag.

**Thin.** A fine. A reload. A log line. An unbounded graveyard of every kill forever.

#### CV-KIT — One temperature on the glass

**The feeling.** Flight, dock, map, pause, prompt, and the Crucible door are the same ship.
Manufactured plates, one accent, smoked glass, legends you can read at a glance. Not a
cockpit. Not a webpage. Not a second product that appears when you open the map. The live
picture of the world stays the bright thing; the instrument sits on it and does not shout
over it. Cheap is the current failure. Consistent, detailed, and specific is the bar.

**What is lying.** Title, pause, station, and map have been pulled toward one kit, and the
flight frame still mixes cyan glass, a warm lamp, aerospace chrome, and pill cards. Prompts
and a few benches still look like a different game. The owner rejected a fake-approved
folder; the picture you open is the evidence.

**You invent.** The register that can survive every surface, including the ones that have a
right to look different (a mine, a bay, a wanted state) without breaking the family. Then
retire the registers that lose.

**Read.** `docs/UI_VISUAL_ITERATION.md`, `design/frontend/direction/FIELD_HARDWARE_PROGRAM.md`,
`styles/kit.css`, `src/ui/views/hudStyles.js`, `styles/hud.css`, `styles/prompt-deck.css`.
Shoot the real screen, open it, fix what you see, and walk the controls. A structural pin
that is green while the screen looks cheap is not the feeling.

**Thin.** A token rename. A new font. A screenshot left for later. Restoring a wood HUD or
treating `design/frontend/direction/approved/` as law.

#### CV-EAR — The ear has a signature

**The feeling.** You can tell the rope from the gun from the dock from the station with your
eyes shut. A crowded fight has a mix: something can drown, something can vanish, and there
is a silence before the thing that matters. The chain you just made is audible. The station
is a room, not a mute menu. Reduced motion may thin the picture; it does not delete the cue
that is information.

**What is lying.** Many recipes exist. Unknown guns, doctrine phases, cargo-full, and some
deaths collapse onto one sting or onto a menu click. The station has a room tone that never
starts. Shove, well, and cone are visible force with a borrowed explosion.

**You invent.** The mix and the identities. Not a longer sample list for its own sake. A
stranger should learn a verb by ear the way they learn weight by hand. Continuous voices are
Elementary. The few recordings worth keeping are the Sonniss picks in
[`docs/OPEN_SOURCE_INTAKE.md`](./docs/OPEN_SOURCE_INTAKE.md) §0, committed as part of the game,
not as a sound library.

**Read.** `src/audio/audioSystem.js`, `src/data/audioRecipes.js`, `src/render/vfx.js`. §22 C5
is the table of verbs that must have a cue. This is the reason those cues must not sound
like each other.

**Thin.** One new looping music track. Reusing the UI click at a different pitch and calling
it a weapon. A caption that says what the ear should have said.

#### CV-MOTION — The world is alive when nothing is exploding

**The feeling.** Motion is part of the art direction. A station ring, a wreck's drift, a
pod's tumble, a nozzle's kick, a rock being worked, a patrol's lamps: the place looks
occupied at the chase camera before anyone shoots. When something huge happens, time and
the camera acknowledge it once, then give you the stick back. The graphics get more
impressive when the scene moves, not less.

**What is lying.** Micro-motion, infrastructure, pickups, hit-stop, and the camera director
are separate clocks. Some of them follow the sim. Some follow the wall clock. A silent OS
setting has already proven it can freeze the show. Distant traffic can look dead because
its motion was the first thing discarded, which is correct for cost and wrong for identity
if the glass still shows that ship.

**You invent.** One living-machine score: what stays in motion on the glass, what may sleep
off it, and how a chain or a slam earns a single beat without a bullet-time pool.

**Read.** `src/render/shipMicroMotion.js`, `src/render/infrastructureMotion.js`,
`src/render/flightOverheadPresentation.js`, `src/render/feel.js`, `src/render/cameraDirector.js`.
Do not add a player-charged slow-motion meter.

**Thin.** A fan that spins for its own sake. Shake with no contact. Freezing a scrap field
because every contact wants a close-up.

#### CV-QUIET — Ordinary life, so the disruption means something

**The feeling.** The game breathes. Work, travel, a weird thing on the way, a quiet wreck,
a liner that is actually going somewhere, a patrol that is not yet angry. Then something
goes wrong and you can see what changed. Without the ordinary minutes, every event is
noise. Without the danger, the ordinary minutes are wallpaper. The three minutes between
jobs should be a place, not a loading corridor.

**What is lying.** Roles, lane contacts, side events, and broadcasts exist. The flight
between them is still mostly empty glass and a marker. High-security and frontier sectors
can both read as the same dead apron for opposite reasons.

**You invent.** What a detour is worth in this universe — a body, a signal, a job already
underway, a joke the physics tells — repeated often enough that travel has texture, rare
enough that it stays specific. Not every oddity needs seven systems. Some of them just need
to be memorable. See also the creative campaigns; this one is the rhythm.

**Read.** `design/VISION.md` ("the game needs ordinary life", "not everything needs to be
systemically important"), `src/systems/traffic.js`, `src/data/laneContacts.js`,
`src/data/stationSideEvents.js`. Do not fill the gap with hostile spawns in a harbour whose
law is that it is calm.

**Thin.** Random barks on a timer. A minimap full of icons. Copy-paste ambushes on every lane.

### 23.2 Creative — new situations the premise still has room for

These are not a content quota. Each one is a fantasy the current world almost supports and
does not yet play. Invent the form. Extend the owners. If the idea needs a new genre, a
dialogue campaign, an empire screen, or a loot ladder, it is the wrong idea — keep the
fantasy and change the mechanism.

The weak variation, so you do not invent a sixth copy of the same shape: early play recycles
ambush, patrol, and convoy; trade, yard, archive, and escort are almost unique; six factions
have a voice and no place you can return to; kill machines and weather exist and the opening
neighbourhood never meets them; most "places" in the first sector are beacons. New work
should be a kind the player has not already been served.

#### CR-CHAIN — Verbs that braid

**The feeling.** Two or three things the player can already do combine into a story they did
not accept. Latch, shove, well, spill, hitch, jettison, tow, dock hot, feed a mouth, swing
a planet. The anecdote writes itself: I was doing X, then Y, so I tried Z. The chain is
visible on the glass. It can go wrong. Going wrong is still a story.

**You invent.** The next chain the measured list did not already specify. §22 Wave F and B7
already name several single toys (a ghost line, a hot dock, a thief with a pod, three set
pieces). Do not rebuild those. Pick a braid that is still only a rumor — a volatile pod as
a moving mine, a hitch on a working miner, a wreck towed through a search, a clothesline
on rocks that are already there, a planet well and a field well as one curve — and make
that braid a situation with people in it.

**Read.** `src/systems/tetherGameplay.js`, `src/systems/fields.js`, `src/systems/lootShards.js`,
`src/systems/impulseCharges.js`, `src/systems/planetRuntime.js`. No new button if an old
button will do. No meter that runs out.

**Thin.** A mission that says "hold E." A combo UI. Three more pirates on the same rock.

#### CR-FEED — The scenery wants a body

**The feeling.** Industry is a verb. A mouth, a breech, a sluice, a furnace, a mass driver:
it is already working, it has a cycle you can learn, and a hull or a pod that enters it
becomes loot, a throw, or a problem. You discover this by being curious, not by reading a
hazard label. The first field deserves one. The rest of the map deserves ones that are not
copies of the first.

**You invent.** The next machine-as-toy, in a place that already has a job, with a visible
mouth and a force the field kernel already understands. The single starter-field machine is
the measured row F13. If that row is open, you may make it the first slice of this feeling.
You do not place every Ceres jaw into Helios and call the campaign done.

**Read.** `src/data/environmentalMachinery.js`, `src/systems/environmentalMachinery.js`,
`src/systems/fields.js`, `src/data/sectorActivityPockets.js`.

**Thin.** A damage sphere. A turret. A scripted instant kill. A new hazard system.

#### CR-CHOIR — A neighbour, not a rumor

**The feeling.** Someone in licensed space is not Concord, not a pirate, and not a shop.
They leave wrecks, they tend the hurt, they have a place you can go back to, and they
remember what you did with their dead. The tragedy in the core is a site, not a news item
you cannot fly to.

**You invent.** How a living congregation uses the hull and the faith that are already in
the data. Not a new faction screen. Not a sermon. A place, a person, a physical choice.

**Read.** `src/data/factions/` Choir, `src/data/uniqueWrecks.js` (`wreck_choir_tender`),
the Helios rumor, `station_depot3`. The depot selling only fuel is a grunt line, not this
campaign. This is the neighbour.

**Thin.** A refuel pump with a new logo. A dialogue tree. A second unique-loot table.

#### CR-WEIR — Law you can fly

**The feeling.** Customs is geography. A corridor, a cone, a gate, a weir of lights. You
can run it, tow through it, bribe it with a body rather than a menu, or stay inside it and
be seen. Escaping a number is homework. Escaping a volume you can see is a flight. The
same idea should not be copied as a toast in every sector; Helios and the Tethys gate are
enough to prove it, and they should not feel like the same disc.

**You invent.** The physical weir, using the scan and the heat radius that already exist.
§22 F8 is the search ring for WANTED. This campaign is customs as a place, including the
named corridor that is currently an empty disc far from where you start.

**Read.** `src/systems/lawSecurity.js`, `src/systems/heat.js`, Helios customs zone,
`station_customs`, the customs encounters. No second heat system. No wall. No damage for
standing in the volume.

**Thin.** A modal puzzle. A fine popup. A HUD ring that does not match where the patrol
actually looks.

#### CR-BERTH — Factions you can return to

**The feeling.** A faction with a voice has an address. You leave, you do something that
touches them, you come back, and the berth is different — a ship, a price, a closed door,
a person who was not there. Archive, Pitborn, Fulfillment, Understory, Helix, and the
layers that currently exist as one-shot encounters are the opportunity. They do not all
need capitals. They need somewhere the memory can stand.

**You invent.** One berth, completely: why it is there, who works it, what you can
physically do, what changes if you interfere. Then it is a place in the chart, not a
codex entry. Do not build six capitals in one slice. One honest address teaches the pattern.

**Read.** `src/data/factions/`, the K1 encounter band, `src/systems/factions.js`,
`src/data/stationContacts.js`. §22.11 still refuses a dialogue campaign and an empire
screen. Receipts and bodies, not a relationship web UI.

**Thin.** A new faction. A reputation number with no door. An encounter that despawns
the address when the timer ends.

#### CR-ANVIL — A world that is a toy

**The feeling.** A planet, a well, a storm, a slag field: it is not a map stain. You can
sling it, wait it out, harvest it, hide in it, or feed it a ship. Haulers already know
the cycle. You learn it by joining them. Weather belongs to a job the way a sluice belongs
to a tide. A gravity well is a curve you can play, not a disc you avoid.

**You invent.** How one of the existing big places — the Tethys mass, a Vesta belt, a Veil
lane — becomes a toy the rope and the fields already know how to use. Teach it with bodies
that are waiting, not with a tooltip.

**Read.** `src/data/authoredPlaces.js`, `src/data/planets.js`, `src/systems/planetRuntime.js`,
weather volumes in `src/data/environmentalMachinery.js`, Cinder Sluice staging in traffic.
Do not add a third renderer for the surface. Do not put a damage cone in the starter
harbour and call it weather.

**Thin.** A tinted fog volume. A minimap icon. A gravity number that never moves a hull.

#### CR-HOLLOW — Two kinds of empty

**The feeling.** A lawless bazaar and a quiet observatory must not both be a bare apron.
Busy-illegal means ships that should not be together, docked anyway, with something to
steal or join. Occupied-quiet means work that is hushed: dishes, tenders, a wreck nobody
is hurrying. The player can tell which emptiness they entered before anyone shoots.

**You invent.** The occupation. Who is there, what they are doing with their hands, what
happens if you touch it. Density is the last knob, not the first.

**Read.** `src/data/sectors.js` traffic and hazard scalars, `src/data/regionalEcology.js`,
Sker, Veil, Ashfall, and any station whose services are a single verb. Do not raise
`enemyDensity` in a harbour that is calm by law. Do not spawn a combat encounter to
fill the silence.

**Thin.** `trafficPerMin` bumped and nothing else. The same courier mesh painted a new color.

#### CR-TEXTURE — A sector should be able to surprise you once

**The feeling.** Not every interesting thing is a system. A tug spinning by a refinery. A
courier going absurdly fast through traffic. A shrine welded to a machine. A memorial that
is a destination, with sightseers and a thief who is quiet. A tanker whose only job is to
make your ship feel small. A cleaner who is paid to un-find a wreck you just found. You
remember the place because it was specific.

**You invent.** One such thing, in a sector that already has a name, wired so a stranger
can fly to it from a rumor or a skyline. It may touch cargo, heat, or a person. It does
not have to touch all three. Humor comes from the physics, not from joke dialogue.

**Read.** `design/VISION.md` ("not everything needs to be systemically important",
"humor without becoming a comedy"), `src/data/worldOneOffs.js`, `src/data/uniqueWrecks.js`,
Helios memorial and the Silver-Draft pair. Joining a rumor to a wreck that already exists
can be the whole slice if the join is a situation and not a map pin.

**Thin.** A beacon with flavor text. A prop scatter. A joke line with nobody standing there.

### 23.3 What these campaigns refuse

A scarred personal ship as a character creator. An empire screen. A loot-rarity ladder. A
dialogue campaign. A second renderer. A starter-tool limit. Hyperreal materials as the
definition of beauty. A cheaper hull on the live glass. Content as the cure for feel.

When a campaign's feeling is ordinary on the default route, say so in the §1.4 report and
leave the heading here with one line: the feeling, and the commit that made it ordinary.
Do not delete the heading; the next agent needs to know it is no longer the hole.

### 23.4 Actualize the tools

Lane **A2** in §1.2. The order below is the sequence. `AQ-LOD` starts when `AQ-CAS` is
committed. `AQ-LIGHT` starts when `AQ-LOD` is committed. `AQ-SURFACE` starts when
`AQ-LIGHT` is committed. `AQ-VOICE` starts when `AQ-SURFACE` is committed. `AQ-HIT` starts
when `AQ-VOICE` is committed. One agent, one task. If that task's files are dirty, wait or
take a queue unit. Do not jump ahead.

The feeling in §23.1 decides taste: `AQ-CAS` and `AQ-LOD` and `AQ-HIT` serve CV-GLASS,
`AQ-LIGHT` and `AQ-SURFACE` serve CV-PAINT, `AQ-VOICE` serves CV-HAND and CV-EAR. A catalog
line may polish a result only after the task it names is committed. It does not do the wiring.

Import map entries, already on the game page: `three-mesh-bvh`, `@elemaudio/web-renderer`.

| Id | The player gets | Use | Done when | Do not |
|---|---|---|---|---|
| **AQ-CAS** | A frame drawn below the display resolution stays sharp. Full resolution is left alone | `vendor/fidelityfx-cas/` after the composite in `src/render/bloom.js`. Read that folder's README. Sharpen the canvas only | A below-res frame runs `CasFilter`. A full-res frame does not. The DOM HUD is unchanged. Authored content is still in the picture | Rewrite the filter. Sharpen twice. Use it as an excuse to drop bloom, shadows, or draw distance |
| **AQ-LOD** | A far ship is that ship, with the fasteners gone | `meshoptimizer` through `@gltf-transform` `weld` then `simplify`. Small error, borders locked. The existing whole-ship LOD path | One non-player hull has a simplified LOD that still reads as that hull at the chase camera, and the player hull stays full detail | `meshopt_simplifySloppy`. A box, an impostor, or a different mesh. Hiding an on-screen hull to save a draw |
| **AQ-LIGHT** | Paint, rubber, and bare metal separate under one industrial light, while the sky you see stays the painted plate | `assets/reference/cc0/polyhaven/industrial_workshop_foundry/industrial_workshop_foundry_2k.hdr` as image-based light | Metals pick up the foundry light. `scene.background` is still the sector plate, not this HDRI | Replace the sky. Crank the light until it outshines muzzles and engines |
| **AQ-SURFACE** | The three substances are different materials, graded from the scans, not photographs stuck on the hull | `rusty_painted_metal`, `ambientcg/Rubber004`, `ambientcg/Tiles132C`. OpenGL normals only. Families already named in `src/render/industrialMaterialFamilies.js`: painted shell, `matte_seal`, `thermal_ceramic` | Each of those three families shows a graded use of its scan (roughness, normal, or a tuned match to the scan). A stranger can tell seal from paint from ceramic at the chase camera | Assign the color photo as the hull albedo. Add a second material system |
| **AQ-VOICE** | The rope's pitch follows the load, and the engine follows the throttle, as one continuous voice each | `@elemaudio/web-renderer`, driven by the tether load and the throttle the sim already publishes | Three loads give three rising pitches. Throttle 0 is silent within a quarter second. Throttle 1 is the voice within 120 ms. Weapons duck both | Restart a sample every tick. Move hits, UI, or dock into Elementary. A second audio clock |
| **AQ-HIT** | A lock, a beam, or a camera clearance against a big mesh tests the triangles that are there | `three-mesh-bvh` on the query that currently walks those triangles | The same hit, on a fixed seed, lands on the same body, and the walk is no longer the cost the probe named | Use the BVH to hide an on-screen mesh. Build one for every rock in the sector if the probe did not name that cost |

Sonniss stays a local download for a signature recording the Kenney set cannot carry
(a capital death, a room tone). Do not commit the bundle. Kenney is the audition set
already in `assets/reference/cc0/kenney/`. Small uses of it are inference lines, not
these tasks.

## 24. Optic asteroids — follow-on plans

Live now: an energy bolt that hits a tagged asteroid is absorbed (dull stone), reflected
(bright metal), or split into eight splinters (pale diamond). A diamond fires once per shot,
so a line of them burns like a fuse and a block of them opens as one blast. Stone on the
neighbor cells eats the splinters that would otherwise leave. The bodies are a lattice, not
hand-placed pebbles: `src/data/opticStructures.js` expands a recipe, `src/combat/opticField.js`
resolves the hit, and `src/systems/world.js` spawns the live colliders when that sector is
fully resident. The first stamp is the Prism Gallery in the Ceres belt
(`zone_ceres_prism_gallery`, sector-local centre 1968, -2100). The starter pulse laser is
enough. Mining does not eat these rocks. Kinetic rounds and missiles ignore the grammar.

These rows are plans. They are not queue packets and `--next` does not dispatch them.
Place new structures by adding a recipe to `OPTIC_STRUCTURES`. Do not copy forty
coordinates into a sector table.

| Plan | What the player gets | Where it should land | Done when |
|---|---|---|---|
| **More stamps, same compiler** | Fuses, closed fields, and bank mouths at places people already fight | Gate mouths, wreck sites, ambush zones, and belt pockets. One recipe id and a sector-local origin per site. Ceres stays the reference layout | A stranger can fly to two more sectors and find a different arrangement, each built by `wickCells` / `murderFieldCells` / `stoneRingCells` |
| **Seeded scatter** | Ordinary belts grow a few small lattices from the sector seed, so authorship is not required for every field | The field spawner, after the existing rock draw, without consuming that draw's RNG | The same seed always grows the same lattices. A field with no recipe still gets a short fuse or a three-crystal cluster, not a hand-authored list |
| **Beams and missiles** | A mining beam and a missile join the same three responses | Beam impact in `src/systems/mining.js` stays ore-only. Weapon beams and missiles get their own contact in the optic owner | An energy beam on a diamond throws the ring. A missile on stone dies without splitting. Ore rocks are unchanged |
| **The picture and the sound** | Stone, metal, and diamond read as those things at the chase camera, and each response has its own hit | The three tints in `OPTIC_MATERIALS` are the stand-in. A real pass replaces the tint with a matte rock, a mirror, and a clear prism, plus three cues on `optic:contact` | At the gallery, a stranger can name the three kinds before firing, and can hear which response happened |
| **Spent crystals** | A field that has burned goes dark and will not burn again until it recovers | A sim-time recharge on the diamond, saved with the sector, not a permanent mute | The same diamond eats the second shot, then splits again after the authored recovery. A save in the middle restores the dark or the live state |
| **Enemies use the room** | Pilots and hostile ships treat the lattice as terrain, not scenery | Doctrine near an optic structure: kite a pursuer across a fuse, refuse to shoot a diamond at point-blank, bank a shot off metal | On a fixed seed, an enemy shot into the Ceres fuse reaches a target that was not on the original line, or the enemy breaks off instead of lighting the field in its own face |
| **Arenas** | Live swarm rooms each carry one lattice (`compileSwarmOptic` in `swarmArena`, not the Ceres gallery). Helios: a fuse on the rear lane. Lagrange: two mirrors for the kinetic bank gun. Cinder: a stone pocket with a door. Cryo: a short east fuse. Storm: a closed 2×2 prism box | Further arena recipes only. Do not add these to `OPTIC_STRUCTURES` | A swarm wave-1 stamp matches `compileSwarmOptic(arenaId)` and a second wave does not double it |
| **Your own grenade** | A prism you light can hit you | Friendly-fire rule for splinters only, called out before the gallery teaches it | A fixed-seed shot into a surrounding field damages the shooter. A shot down the Ceres fuse does not, because the stone wall holds the ring |
| **Focus and shelter** | Metal banks several shots into one cell. A stone shell with one gap protects the inside | New recipes next to the wick: a mirror lane and a closed ring with a one-cell door | Rays into the mirror lane arrive at one diamond. Rays into the shell die in stone except through the door |
| **Collider cost** | More galleries do not become a hitch | Measure before the seeded-scatter row stamps every belt. The Ceres set is 42 live bodies | A Ceres entry trace names the optic bodies' cost. Scatter stays off until that cost fits the frame |

The lattice spacing is 64. Splinters leave on the eight compass headings, so a cell that is not on that grid will not chain. New recipes stay on the grid. Stone radius overlaps its neighbors so a bolt cannot slip between the wall.

## 25. Zero to hero — the A-list demo program — ADMITTED 2026-09-23

The plan, the evidence and the bars: [`design/program/ZERO_TO_HERO_2026-09-23.md`](./design/program/ZERO_TO_HERO_2026-09-23.md).

**The diagnosis.** SpaceFace simulates bodies better than almost any game in its class and then
does not show them. On the owner's iGPU at the shipping camera the player's hull is ~15–20 px long
in a Crucible fight and lost at the head of its own plume at cruise; hostiles are specks; 400 ms
after a kill nothing visible has happened; one Crucible frame holds a galaxy, a ringed gas giant, a
blue planet, a nebula and arena ribbons across a third of the glass; the HUD carries a permanent
sentence card, a seven-line target card and cut-off labels. No bar anywhere measured any of this.

**The feel: see the body.** Visual weight on the glass runs: your hull → the body you are acting
on → the consequence → the threat → the world → the instrument → the sky. A frame where a lower
rank out-shouts a higher one fails, whatever the numbers say.

| Phase | Springboards | Closes on |
|---|---|---|
| **1 · The body** — camera and hull presentation | CV-GLASS, `PQ-159`, §22 G4, B3b | `probe:body-scale`: player hull p10 ≥ 48 px calm / 36 px fight / 28 px top speed; plume never covers the hull; B3b still holds |
| **2 · The frame** — one sky, arena lines at rest, substances | CV-PAINT, `AQ-LIGHT`, `AQ-SURFACE`, §22 C6, `PQ-190.01` | ≤ 1 hero celestial body per profile; sky below muzzle and engine |
| **3 · The hit you can see** | CV-HAND, CV-AMMO, `PQ-210.04`, §22 A7, B3, B5, B9, F1, F5 | A kill leaves ≥ 2 moving, lit wreck bodies within 250 ms at readable size |
| **4 · The instrument** | ORRERY Phases 1 and 3, CV-KIT, §22 G1/G3/G5/G7/G8/G13/G14, ledger D14 | 0 persistent sentence cards in flight; no truncated primary label; results is replay + stunts + Again |
| **5 · The demo path** — demo flag, live title, round zero, load, end card (mostly NEW) | `PQ-160`, `PQ-163`, `PQ-210.08` | Crucible launch → control ≤ 15 s quiet; the fifteen-minute path plays |
| **6 · The world on the way** | CV-DAY, CV-QUIET, §22 A1–A6, ORRERY Phase 4 (hub, market) | A6 slice scenario |
| **7 · Ship the demo** | `PQ-033.02`, `PQ-033.03`, §22 E1, E8, `PQ-167` | Electron demo package, photo-mode store shots, a replay-cut trailer |

Every phase ends with a **stranger pass**: the path played at the shipping camera and the frames
opened and judged against the order above. **What is still open, in order, is the program file's §7** (refreshed 2026-09-24: the fifteen-minute path in one clean pass, the quiet-host load reading, the belt tail, the D24 leak, and every Phase 7 ship-the-demo item); progress lines live in its §8.

## 26. Use what we already have

A full second checkout of this repo is not a way to work. If one is left behind, keep any commits
that are not already on master by leaving them on their branch, then remove the checkout. Do not
merge that branch into master just to retire the checkout, and do not merge it while master has
someone else's uncommitted work. A checkout touched since 2026-09-22 stays until that work lands
or goes quiet. The record of which branches were kept, and why they were not merged, is
[`design/program/UTILIZATION.md`](./design/program/UTILIZATION.md).

**Models.** The buyable roster is the live list in `src/data/ships.js`. Hitch stays frozen. Every
other authored hull already has a disposition: field it, turn it into a faction kit or a wreck, or
record why it cannot be used. That record is the hull triage and the stocktake plan, and the order
is still §13B (`PQ-136`) and §13D (`PQ-193`), with flyable remasters on `PQ-050`. A byte-for-byte
copy of a live release, with no source role and no plan, is the case for deletion. A filename
search is not that test. `check:asset-reachability` is. Do not commission a new hull while a shelf
body can fill the slot.

**One picture, at the current settings.** Hulls stay Lacquer & Starlight. The glass stays the
Orrery. The next work is already ordered, and it is not a new art direction:

1. `PQ-193.00` — every ship the player can lock on the opening flyby is a complete packaged body.
2. `PQ-193.01` — the opening smuggler, pirate, and recovery tug belong in Hitch's world.
3. `PQ-193.02` — reverse thrust is one jet, not a leftover needle.
4. §25 phase 2 — common rocks and the remaining sky join that same illustrated world.
5. `PQ-193.03` — the lane buoy, beacon, and cargo pod are recognizable at chase distance.

Corsair, Arclight, the Span and Wasp faction kits, and the tanker are the variety we already paid
for. They wait until that flyby is one world. Shelf bodies that are only a repaint of a live hull
do not get a second production pass. Captures, tool caches, and old checkouts are not the game.

## 27. The finish in lanes — ADMITTED 2026-09-24

Owner direction, 2026-09-24: batch the granular plans into a few logical lanes, with open-ended
instructions — the agent owns an *area*, lands the named work still open there, and reviews and
tunes that area to the A-list bar while already working in it. **The game is finished when the
lanes are finished** — features, polish and fun are one lane, not three passes. The full program:
[`design/program/FINISH_LANES.md`](./design/program/FINISH_LANES.md).

| Lane | The area | Absorbs |
|---|---|---|
| **THE MACHINE** | boots fast, holds 60 with the picture on, never hitches or leaks, nothing pops | PQ-129, PQ-204, §22 Wave D, vm-drop imports, §8.4 |
| **THE HAND** | the ship answers the hand — flight, rope, fields, verbs, input | PQ-135–137/139/141/146/147/163/189, PQ-026–031, §22 feel rows, CV-HAND/CV-THROW |
| **THE FIGHT** | swarm is the showcase — waves, arenas, the draft, the kill you can see | PQ-133/140/160/169/174/175/205/206, §22 combat rows, CV-AMMO, §16 |
| **THE WORLD** | you arrived in the middle of their day — sectors, jobs, consequences | PQ-138/143/145/148–151/153/154/171, §22 world rows, CV-DAY/CV-SO/CV-QUIET + all CR-*, §24 |
| **THE LONG GAME** | the fit, the market, the story — decisions an hour, a spine to an ending | PQ-032/142/152/155/156/170/172/176–178/195, §22 economy rows, §17 |
| **THE PICTURE** | one game on the glass — hulls, rocks, skies, residency, the camera | PQ-049/050/134/136/159/161/190/193, §22 art rows, CV-GLASS/CV-PAINT/CV-MOTION, §13B/§13D |
| **THE INSTRUMENT** | every 2D surface is the same instrument of light — ORRERY | PQ-130–132/162/168/180–185/187/188/192/194, §22 screen rows, CV-KIT, §11/§18/§20 |
| **THE EAR** | a signature by ear — verb voices, the mix, room tone | PQ-158, §22 audio rows, CV-EAR |
| **THE RELEASE** | the demo path and the package — title to end card to store | PQ-033/164–167/191/210, §22 E2/E4/E5/E7, §25 Phases 5/7 |

A finishing session takes a lane, not a leaf: play the area first, work the absorbed checklist in
any order, and fix whatever else in the area falls short — the open-ended review is part of the
lane, not a phase after it. Acceptance batches at the area level. The queue still owns unit
truth; grunt-sized sittings still take `--next` or an INFERENCE line; §22 and §23 remain the
lanes' detailed wording. Lane order, briefs, gates and the coverage map live in the program file.
