<!-- LIFETIME: STABLE -->
# SpaceFace Canonical Build Map

This is the repository's implementation front door. It routes an agent to the smallest authoritative packet and the live owners it must respect. It deliberately contains no current queue snapshot, branch name, lease, test transcript, or completion history.

## 1. Start here — the one procedure (no scope words needed)

**The goal, in the owner's words (2026-09-03):** *a super-fun space adventure game with fast-paced,
physics-centric, arcade-style combat that plays optimally in swarm mode, and is super interesting and
mentally stimulating in adventure mode because of its advanced customization and economic features,
as well as the storyline; with a frontend polished massively, everything brought into the newest
version and optimized.* Product intent: [`design/VISION.md`](./design/VISION.md). Bars:
[`design/FEEL_CONTRACT.md`](./design/FEEL_CONTRACT.md). The finish line: §15–§19 below.

**You do not need to be told what to work on.** The queue is the plan, its order is the project
manager's order, and every packet says exactly what to build, which number proves it, and the specific
ways to get it wrong. An agent given nothing, or "next", or "go", or "make it better", does this:

### 1.1 The procedure

1. `git status --short`; read [`design/program/NOW.md`](./design/program/NOW.md). A dirty foreign hunk
   is protected; nothing else is.
2. `node scripts/program-dispatch.mjs --next`. That is your unit. Open the packet it names under
   [`design/program/roadmap/active/`](./design/program/roadmap/active/README.md). Do not shop around
   `--ready` for something you would rather do; the order is the plan (§1.2). If the unit's paths
   collide with a live `NOW.md` row, take the next unit, not the subsystem.
3. Read the packet's **How agents get this wrong** section before touching code. Then its Leaves row:
   the done-when is the definition of done, in player units. If a done-when is missing, unclear, or
   could be satisfied by something the owner would call thin, write the missing number into the
   packet first (one line), then build to it.
4. If the unit is feel or combat (packets `PQ-137`, `PQ-139`, `PQ-140`, `PQ-146`, `PQ-173`, `PQ-174`,
   `PQ-175`, `PQ-176`, `PQ-186` and any leaf whose done-when names a `FEEL_CONTRACT` bar), run the
   Fun Convergence Loop: [`design/program/FUN_CONVERGENCE_LOOP.md`](./design/program/FUN_CONVERGENCE_LOOP.md).
   Fixed seeds, one hypothesis, a critic that can see, before/after numbers, a plain-words report.
5. Finish the whole unit. Add a `NOW.md` row when mutation starts; release it when it stops. Run
   `npm run check:baseline` before and after; the packet's own checks; the docs checker
   (`node scripts/check-program-docs.mjs`) if you touched a packet or the queue. Commit only your
   files by pathspec; push the current branch by name.
6. Write the report in the format of §1.4. Update the unit's state through the integrator path
   (receipt, then queue). Then go to step 2 and take the next unit. Do not stop because a check is
   green, because one leaf is done, or because the context is long. Stop only for §1.5.

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
| **A · The toy works** (now) | ALPHA | `PQ-173` the fun-loop instrument · `PQ-167` telemetry and the weekly playtest · `PQ-137` the guts (`.03`–`.11`) · `PQ-189` **correct the compass** (controls contract, stale diagnoses retired) · `PQ-174` the swarm fun contract (with `.08` earned breathing room) · `PQ-139` impacts answer · `PQ-158.06` minimal action audio · `PQ-165.03` reduced motion keeps information · `PQ-138` the world reacts · `PQ-140` roster as physical problems · `PQ-146` stunt grammar · `PQ-186` the regression fortress · `PQ-180` the frontend grammar matrix · `PQ-144.01` the production baseline · `PQ-163` the first ten minutes · `PQ-141` **the 60-second proof (gate)** |
| **B · The swarm and the world** | BETA | `PQ-190` **the style slice** (stylized industrial energy, approved at the shipping camera before any fleet pass) · `PQ-175` swarm content at craft · `PQ-029` `PQ-030` `PQ-031` `PQ-026` heads and coupling · `PQ-147` field toys · `PQ-027` `PQ-028` machinery and infrastructure · `PQ-148` cargo is physics · `PQ-149` the storyteller · `PQ-150` people who remember · `PQ-151` the wanted loop · `PQ-154` wrecks as terrain · `PQ-161` readable at zoom · `PQ-169` Crucible as replay surface |
| **C · Adventure depth** | BETA | `PQ-177.06`/`.07` cargo custody and visible industrial limits · `PQ-145.01` the first durable site loop · `PQ-176` customization with consequences · `PQ-155` the verb curve · `PQ-156` three starters · `PQ-142` progression and my ship · `PQ-177` an economy you can read · `PQ-178` the story pipeline · `PQ-032` the linear spine · `PQ-152` set pieces from verbs · `PQ-153` six sectors · `PQ-143` ordinary life · `PQ-145` industry authorship · `PQ-171` content grammar |
| **D · Frontend to the newest version** | BETA | `PQ-162` the station redesign · `PQ-168` the chart finished · `PQ-181` the meta shell · `PQ-182` Crucible screens · `PQ-183` everything is a link · `PQ-184` UI performance · `PQ-185` Asteroid Works accepted (with the live `PQ-130` / `PQ-131`) |
| **E · It ships** | RELEASE | `PQ-158` audio direction · `PQ-159` camera and photo mode · `PQ-160` replay and clips · `PQ-164` input truth · `PQ-165` accessibility and options · `PQ-166` five languages · `PQ-144` density and perf guard · `PQ-033` the release closeout |
| **F · After** | POST | `PQ-170` endgame pulls · `PQ-172` mods |

Live campaigns owned by other threads (`PQ-129` hitch, `PQ-130`/`PQ-131` Asteroid Works, `PQ-050`
fleet remaster, `PQ-045` Ceres slice, `PQ-136` fielding) keep their own doors in §1B and their own
units in the queue; `--next` interleaves them by kind and priority. Do not take a unit whose paths a
live row names.

### 1.3 The law (binding on every unit; the reviewer rejects on any one)

1. **Numbers or it did not happen.** A unit closes on its done-when measured in player units (screen
   depths, seconds, hull lengths, fraction kept or lost, verbs per minute), before and after, on a
   fixed seed. "It works", "it follows the path", "check is green" are not numbers.
2. **Frames or it did not happen.** Anything player-felt ships one normal-speed capture at the shipping
   camera, default quality, no overlays. A still proves appearance; temporal claims need strips.
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

### 1.4 The report (the only thing the owner reads)

```text
DONE / NOT DONE  <unit id> — <one plain sentence naming the outcome>
WHAT I FOUND     one sentence, plain words (the fundamental, if this was feel work)
WHAT I CHANGED   one sentence, no file names
WHAT YOU WILL FEEL   two sentences: what is different when you play; what still is not
THE NUMBERS      bar | before | after | target   (only the bars this unit moved)
THE FRAMES       the before/after strip, when player-felt
NEXT             the next unit --next will return
```

### 1.5 Stop conditions (the only reasons to stop)

- A required owner seam is missing or its contract unknown → `BLOCKED` with the exact shared-change
  request, after finishing every other leaf.
- The unit's paths collide with a live `NOW.md` row → take the next unit.
- Two failed repair cycles with the same causal model → record the falsified model, narrow the
  scenario, choose another model; after three models, escalate in plain words.
- The owner said stop.

### 1.6 The reviewer's checklist

**Blockers — the integrator rejects on any "yes":**

- Did the unit close on prose, a green check, or a screenshot at a flattering angle? (LAZY)
- Does the outcome do one thing once, with no second consequence, where the law asks for two? (THIN)
- Is any number in the done-when unmeasured, or measured on a random seed? (MISCONFIGURED)
- Did it add content, shake, particles, drag, a clamp on given momentum, an NPC gyro, hit-point
  scaling, a flag-only path, a second architecture, or a dialogue tree?
- Did a test or a golden change without the vision sentence or the causal record?

**Required proofs — the integrator rejects on any "no":**

- Is the feature reachable on the default route? Does the surface pass the grammar matrix?
- Is the report in the owner's words, with the numbers and the frames?
- Does the receipt name the intended improvement AND the tradeoff it deliberately spent (a larger
  impact may cost a little fill rate; a crisper brake may change a handling curve)? A unit is judged
  on that bargain, not on every metric moving at once.

(The 2026-09-05 audit found the old single list mixing both polarities — a "yes" to reachability
could read as a rejection. Fixed here; `PQ-189.01`.)

### 1.7 If the owner names a symptom

The procedure above needs no scope. When the owner names one, route it and then continue the
procedure:

| The owner says | Start here |
|---|---|
| "Here is a taste review / an outside audit; fold it in" | Grade every recommendation in §15.9 (adopt / adopt with a guard / decline, with the ruling it agrees or conflicts with); admit each adopted item as a leaf of the packet that already owns the surface, or a new packet only when no packet does; store the review under `docs/handoffs/` as HISTORICAL evidence with a pointer back to the grade. Never a second queue, never verbatim orders |
| "it's not fun", "make it better", "it sucks", "wonky", "no control" | [`design/program/FUN_CONVERGENCE_LOOP.md`](./design/program/FUN_CONVERGENCE_LOOP.md) → `--id PQ-137`, then `--next` |
| "finish the game", "what's next for release", "the professional bar" | §15 gates → `--next` |
| "swarm mode should be more fun" | §16 → `--id PQ-174` |
| "adventure is boring / thin" | §17 → `--id PQ-176`, `PQ-177`, `PQ-178` |
| "the screens look cheap", "polish the frontend", "bring the UI up to date" | §18 → `--id PQ-180` then the red cells it assigns; grammar first |
| "it's hitching / stuttering" | §8.4 → `--id PQ-129`; measure first, never cut quality |
| "the mining board is unreadable / ugly" | `--id PQ-130` (board law) and `PQ-131` (authored objects); `PQ-185` accepts |
| "the ships / objects look like toys" | §1B graphics doors → `PQ-050`, `PQ-045`, `PQ-136` |
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
- **3D objects look like toys next to real ships** → [`design/program/GRAPHICS_3D_CAMPAIGN.md`](./design/program/GRAPHICS_3D_CAMPAIGN.md)
  (operator [`GRAPHICS_3D_GOAL.txt`](./design/program/GRAPHICS_3D_GOAL.txt)); same chase-camera bar as
  Hitch/Helios; stay off the hitch thread's renderer files; not `PQ-129`, not a quality cut.
- **Asteroid Works unreadable / undrivable / ugly** → [`design/ASTEROID_WORKS_DESIGN_LAW.md`](./design/ASTEROID_WORKS_DESIGN_LAW.md),
  [`ASTEROID_WORKS_PLAYFIELD.md`](./design/program/ASTEROID_WORKS_PLAYFIELD.md), `--id PQ-130`; the
  procedural stand-ins → [`ASTEROID_WORKS_ART_CAMPAIGN.md`](./design/program/ASTEROID_WORKS_ART_CAMPAIGN.md),
  `--id PQ-131`. The board is the game. `PQ-185` wraps acceptance.
- **Any 2D / HUD / menu / screen work** → §18 and [`design/frontend/INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md)
  before designing or building anything; §11 records the sixteen jobs that already landed.
- **Crucible / swarm / combat lab / arenas / attack modifiers** → §12 (`PQ-133`, engineering complete),
  §16 (`PQ-174`, `PQ-175`, fun and content), §13 (`PQ-134` VFX pool).
- **`INFERENCE <N> [scope]`** → [`design/vision/INFERENCE_CONVERGENCE_METHOD.md`](./design/vision/INFERENCE_CONVERGENCE_METHOD.md)
  and [`INFERENCE_LANES.md`](./design/program/INFERENCE_LANES.md); production units only. That door does
  not run the fleet remaster and does not replace §1.1.
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


### 1B.1 Retained campaign laws (verbatim from the previous front door)

**PQ-050 campaign law:** Hitch/Kestrel stays frozen. Stay off INFERENCE, the
dock/hulk remaster, and the expansion-research brief. A live copy is not a
quality-close.

**The player camera is the only close camera.** SpaceFace is a 60° tilted
top-down chase (`src/render/camera.js`, default 144 WU, tightest legal zoom
58 WU). Capture cycle stills with
[`tools/blender/spaceface_chase_camera.py`](./tools/blender/spaceface_chase_camera.py).
How to chunk one ship, when to generate reference (or call Codex for imagen), and
how hidden glued-on faces get handled by the computer:
[`docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md`](./docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md).
Studio three-quarter, starboard beauty, rear hero, and `bay_interior` crops
do not count. Seats, consoles, and walkable cabins that only exist in a crop
are not remaster work. That is why the Hornet loop stopped: many cycles, little
change the chase camera could see.

- **Hornet (`PQ-050.01`)** is a **wired candidate, not quality-closed**. Resume
  only as a chase-camera form pass. Do not model another seat.
- **Drifter (`PQ-050.02`)** is a wired pancake-dart. **Not accepted art.** Same
  camera law. After Hornet actually closes at chase size, this is next.
- **Remaining ships** have not had a chase-camera close. Ranger
  (`PQ-050.03`) through Survey pin (`PQ-050.22`). One ship at a time.
- Quality remaining on every unfinished leaf: silhouette, wells, canopy, and
  drive throats that read at 144 WU; lofted wings/nacelles; unique surfaces;
  MTX ledger bound to the close hash with chase-camera proof; five valid
  reviewed chase cycles; then wire only that ship. A factory loft with boxes
  still does not close a leaf. A walkable interior does not close a leaf.
- Do not run the all-fleet promote script. Do not overwrite Hitch.

Remaining PQ-050 leaves (one ship at a time; Hitch/Kestrel frozen):

| Leaf | Ship | This campaign |
|---|---|---|
| `.01` | Hornet | wired candidate, **not quality-closed**. Chase-camera form remaining. An orange seat is not progress. |
| `.02` | Drifter | seven form attempts this campaign (C18–24). Three volumes + ringed throats in candidate. C20 still live. **Not quality-closed.** |
| `.03` | Ranger | not started |
| `.04` | Ironback | not started |
| `.05` | Bastion | not started |
| `.06` | Atlas | not started |
| `.07` | Warden | not started |
| `.08` | Colossus | not started |
| `.09` | Leviathan | not started |
| `.10` | Pelican | not started |
| `.11` | Mule | not started |
| `.12` | Wasp | not started (live production body is already mapped; it still fails the authored loader) |
| `.13`–`.15` | Ashline dart / lode / rig | not started |
| `.16`–`.18` | Helios lark / cradle / span | not started |
| `.19` | Ore barge | not started |
| `.20` | Repair tender | not started |
| `.21` | Salvage cutter | not started |
| `.22` | Survey pin | not started |

**Graphics / place-asset remaster (resume):** if the task is continuing the interrupted remaster of
`place_dock_interior`, `place_dead_hulk`, and/or `place_debris_chunk` (Blender/EEVEE form work, not a
queue packet), start at
[`assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`](./assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md)
before touching those GLBs. That handoff owns live residuals, bans, KEEP/RESTORE rules, and player-route
meaning (dock = shipyard UI backdrop; hulk/debris = freeflight landmarks). For ordinary admitted
roadmap work, still use `program-dispatch` above—do not substitute this handoff for a PQ packet.

**Orphan harvest / unused models / leftover `C:\sf-agents` copies:** if the task is to mine
orphaned agent checkouts, finish near-done work, wire unused models that already beat live,
or stop finished work rotting on a side copy, start at
[`design/program/ORPHAN_HARVEST_GOAL.txt`](./design/program/ORPHAN_HARVEST_GOAL.txt)
and follow [`design/program/ORPHAN_HARVEST_PLAYBOOK.md`](./design/program/ORPHAN_HARVEST_PLAYBOOK.md).
The checkpoint is [`ORPHAN_HARVEST_LEDGER.md`](./design/program/ORPHAN_HARVEST_LEDGER.md).
This campaign may rebuild the live Hitch *release* from the later polish that never reached
the compressed file; it still must not overwrite KTX2 with uncompressed source, and it must
not dump factory remasters that lose to Hitch. It is not INFERENCE and not a default PQ-050
overnight.

**3D world-object / same-bar remaster:** if the owner wants models in the world brought up to
the Hitch/Helios chase-camera bar (beacons, pods, 47-A tube+ring, then Hornet skin) without
colliding with hitch work, start at
[`design/program/GRAPHICS_3D_CAMPAIGN.md`](./design/program/GRAPHICS_3D_CAMPAIGN.md)
(operator: [`GRAPHICS_3D_GOAL.txt`](./design/program/GRAPHICS_3D_GOAL.txt)). Packaged GLBs
live in `assets/ships/release/release_manifest.json`; live loaders in `partsLibrary.js`;
47-A spindle/beacon/pod are procedural in `src/render/scenarioProps47a.js` and are **not**
in the manifest. Do not edit hitch-owned renderer files. Do not touch Hitch.

**Asteroid Works playfield:** if the owner cannot see the mining board, tell cells
apart, find the rover, move it one cell on purpose — or the screen still looks like
a gray vibe-coded console — start at
[`design/ASTEROID_WORKS_DESIGN_LAW.md`](./design/ASTEROID_WORKS_DESIGN_LAW.md)
(the 2026-08-20 owner design session's positive target: ground-up warm UI, perfect
axis-aligned chess grid, fog of war removed, events on the board with sound, ≤15
visible words, board ≥88% of the glass), then
[`design/program/ASTEROID_WORKS_PLAYFIELD.md`](./design/program/ASTEROID_WORKS_PLAYFIELD.md)
(operator: [`ASTEROID_WORKS_PLAYFIELD_GOAL.txt`](./design/program/ASTEROID_WORKS_PLAYFIELD_GOAL.txt))
and the admitted packet
[`design/program/roadmap/active/PQ-130.md`](./design/program/roadmap/active/PQ-130.md).
Dispatch `node scripts/program-dispatch.mjs --id PQ-130` (leaves `.01`–`.10`). The
2026-08-20 playtest remains the defect list; a polished copy of the gunmetal console
also fails. Chrome idea:
[`design/frontend/SCREENS_E_ASTEROID_WORKS.md`](./design/frontend/SCREENS_E_ASTEROID_WORKS.md).
This is not INFERENCE, not `PQ-050`, not `PQ-129`, and not Waves 1–4.

**Performance hitch campaign:** if the owner reports hitching, stutter, or the game not playing
smoothly, start at
[`design/program/PERF_HITCH_CAMPAIGN.md`](./design/program/PERF_HITCH_CAMPAIGN.md)
and the admitted packet
[`design/program/roadmap/active/PQ-129.md`](./design/program/roadmap/active/PQ-129.md).
This is not INFERENCE and not `PQ-050`. Reserved identities `PQ-061`–`PQ-128` stay the catalog;
`PQ-129` is the executor that finally admits them as leaves. Wave A names every >32 ms frame.
Wave B removes compose/compile/upload/admission bricks. Wave C crowded 60 fps waits until hitch
count is halved. Default quality stays on.

**Flight HUD attention pass:** if the task is the windshield-keys / toast-over-HUD / ship-instrument
work the owner authorized, start at
[`design/HUD_FLIGHT_ATTENTION.md`](./design/HUD_FLIGHT_ATTENTION.md)
(operator: [`design/HUD_FLIGHT_ATTENTION_GOAL.txt`](./design/HUD_FLIGHT_ATTENTION_GOAL.txt)).
That plan owns success criteria, flight order, bans, and process-artifact cleanup. It does not
replace VISION/GDD. Do not revive `HUD_THREE_ANCHOR` or `GEMINI_HUD_BRIEF` as layout law.

**Graphics / non-Hitch flyable fleet remaster:** remaining work to make every player and NPC flyable
ship except Hitch/Kestrel honestly better than live Hitch is admitted as `PQ-050`
(`GFX-FLEET-REMASTER-HITCHPLUS`). Start at
[`design/program/roadmap/active/PQ-050.md`](./design/program/roadmap/active/PQ-050.md), then
`node scripts/program-dispatch.mjs --id PQ-050` or `--next` for the first ready ship. One leaf is
one ship: apply [`docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`](./docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md)
(form, unique UVs, mesh bakes, authored surfaces, LOD), fill that ship’s technique ledger, then
wire only that ship. A factory loft with boxes or a tinted shared sheet does not close a leaf.
Do not resume this campaign on studio cameras or cabin interiors. Hornet is a wired candidate
that stalled on seats the chase view cannot see; Drifter is unfinished. One ship at a time.
Do not touch Hitch.

**Graphics / expansion research (A-list parity):** when planning work that spans graphics,
animation, VFX, variety, or world density — as opposed to one admitted asset packet — the durable
research brief is
[`design/program/EXPANSION_PROGRAM.md`](./design/program/EXPANSION_PROGRAM.md). Its §1 records twelve
controlled experiments against one scene and scoring harness; use those results to avoid repeating
the exact disconfirmed hypotheses, not as proof that every renderer or composition axis is closed.
Its §2 records the production loop (research → worldbuild → concept → build → adversarial review)
and §5 records measurement traps that have already cost real time. The repository performance
contract remains [`design/PERF_BUDGET.md`](./design/PERF_BUDGET.md): target-profile p95 ≤16.7 ms,
p99/hitch protection, and no quality reduction; the measured 16.80 ms Intel-iGPU route is an
additional guardrail, never a relaxation. Pair the brief with
[`design/graphics-sprints/GRAPHICS_ORPHAN_CENSUS.md`](./design/graphics-sprints/GRAPHICS_ORPHAN_CENSUS.md),
which preserves a historical plan/literal-source-reference screen and withdrawn-claim evidence.
Refresh its named manifest, bundle, catalog, route, and ownership checks before treating any captured
disposition as current. The current research ranking is
[`design/graphics-sprints/TOP10_ROI_ASSET_PLAN.md`](./design/graphics-sprints/TOP10_ROI_ASSET_PLAN.md).
It grants no lease, priority, or dispatch authority: implementation still requires an admitted
packet from the queue, and any overlapping Physics-as-Spectacle row remains downstream of that
packet's R5/five-minute-Ceres/R8 gates. Craft and acceptance still belong to
`docs/visual-assets/` below.

**Material flatness (G0-2 is DONE; ROI items 3-5 are part-finished).** The corrected roughness
audit has been run and its tooling is committed. Measure with
`node scripts/measure-orm-roughness.mjs <glb...>` — it resolves ORM maps through the glTF material
graph, never by filename, which is what invalidated the earlier audit. Its reference check:
`engine_ion_small` reads 0.2015 against the independently derived 0.2011.

Measured state, superseding the withdrawn "twenty assets at stdev exactly zero" headline:

| Asset | Roughness stdev | Reading |
|---|---:|---|
| Ten kit hulls (`hull_*.glb`) | **0.0000** | 1024² textures holding one constant |
| `wholeship_kestrel` | 0.05–0.07 | not flat, but ~3x under reference |
| `engine_ion_small` | 0.2015 | healthy — **ROI item 4 is largely a non-issue** |

Root cause for the hulls: the ORM is packed correctly and six hulls carry a real per-material AO
bake in R, matching their authored source PNGs to four decimals. The geometry-derived data was
authored, baked and shipped into the channel that only modulates ambient light, while the channel
deciding specular response got a flat class value. The other four (frigate, capital, multirole,
gunship) had no AO anywhere because each GLB carries LOD0/LOD1/LOD2 as **coincident meshes at
identical bounds**, so the bake self-occluded to black. `tools/blender/bake_hull_ao.py` removes the
coincident shells first; all four are now repaired at source and committed.

**Remaining work — RESOLVED 2026-08-10** (commits `ebebc2d2`, `ceae0456`..`5e494efe` on master):

1. **Repack applied (ROI item 5) — DONE at `ebebc2d2`.** All 29 hull materials left stdev 0.0000,
   landing 0.088–0.172 **proportional to each material's real AO signal** (the earlier "0.15–0.17"
   line was an aggregate approximation; dry-run == apply byte-parity was verified independently).
   Releases republished through `scripts/build-hull-release-assets.mjs` — the canonical hull lane
   (ETC1S color/ORM + UASTC normals, GLBs + `release_manifest.json` in one transaction; 31.77 MiB
   source → 5.65 MiB release). The generic `tools/art/build_release_parts.mjs` named here before
   encodes UASTC-everything (~10x release size) and refreshes no manifest — do not use it for hulls.
2. **Kestrel hull (ROI item 3) — no repack applicable; measured and closed 2026-08-10.** The tool's
   `FLAT_G_STDEV = 0.02` gate correctly skips every Kestrel material (0.049–0.072 — authored
   variation present, not the flat-defect class). Forcing amplification on the hero ship without an
   art verdict was declined. The real remaining Kestrel surface work is the
   `assets/ships/foundry/spacepunk_markings_v1/` integration (32 authored cells,
   `runtimeWired: false`, Blender + KTX2 release work). Live player ship remains
   `assets/ships/parts/wholeships/kestrel.glb`; `kestrel_borrowed_time_v4/` is not loaded.
3. **Receipts coverage extended — DONE at `5e494efe`.** `check:graphics:asset-receipts` now
   verifies manifest-vs-disk SHA/byte truth for all three rocks, the ten hulls, and the live player
   ship, with per-asset diagnostics and a corruption-detection test. On its first run it caught and
   forced repair of twelve stale `parts_manifest.json` rows (rockB/rockC family-source bytes and
   LOD0-only tris; ten pre-repack hull byte counts). Still uncovered, recorded honestly: the ~37
   other release-manifest assets, Kestrel LOD1/LOD2 rows, `stats().bakedTexMB`, and all G1–G7
   visual gates.

No independent G7 art verdict has been obtained for any of the above — the codex image-generation CLI
remains unrepaired (G0-3), and per `docs/visual-assets/README.md` that substitution is recorded here
rather than left implicit.

**Graphics / visual assets:** every player-facing graphics task starts at
[`docs/visual-assets/README.md`](./docs/visual-assets/README.md), which routes authored 3D, portraits,
concept/reference generation, cinematics, VFX, and UI art to their owning quality contract. For
repository-wide asset recovery, then use the current
[`VISUAL_ASSET_CATALOG.md`](./design/graphics-sprints/VISUAL_ASSET_CATALOG.md) to distinguish live
assets from candidates, legacy donors, rejected evidence, and protected foreign work. Any
Blender/GLB form or surfacing pass uses
[`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`](./docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md)
and
[`.grok/skills/spaceface-blender-material-truth/SKILL.md`](./.grok/skills/spaceface-blender-material-truth/SKILL.md)
and completes its proportional material-truth preflight before modeling, whether or not a reviewer
has already named a plastic/clay/primitive defect. Tier C/D may group a repeated manufactured family,
but no changed visible zone may inherit a DCC default. Claim
the exact source/candidate paths first. The catalog is routing evidence, not permission to merge old
branches, promote candidates, or bypass G0-G7 acceptance.

**Physics as Spectacle (graphics / VFX / Massline program):** the user-authorized R8 program starts at
[`design/program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md`](./design/program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md).
Its hierarchy is bright force against colored, materially varied hulls: deep space remains darkest;
world geometry uses varied industrial materials; ships retain strong faction paint and identity;
engines and machinery are bright; Massline, fields, weapons, and destruction are brightest. The
unchanged [`MASSLINE_PRESENTATION_UVP.md`](./design/program/roadmap/active/MASSLINE_PRESENTATION_UVP.md)
is its implemented foundation and focused receipt, not a new route-acceptance claim. Execute the
recovery dependency chain and five-minute Ceres gate before R8 showcase work; only after that
showcase is also accepted, use the active packet for the gated five-cell, asset-promotion, and
technical-finish rollout. Do not rewrite physics, tumble immunity, damage ownership, or renderer
authority.

**Orphaned worktree / branch recovery:** when the explicit task is evaluating stopped-agent work,
harvests, orphan refs, or a corrupt local clone, start at
[`design/program/WORKTREE_RECOVERY.md`](./design/program/WORKTREE_RECOVERY.md). Current master,
accepted receipts, exact manifests, and exact live-path writers outrank the recovered bytes and their
historical prose. The 2026-08-17 closeout of the external `SpaceFace-archives` parking lot is
[`SPACEFACE-ARCHIVES-2026-08-17-REPORT.md`](./design/program/roadmap/receipts/SPACEFACE-ARCHIVES-2026-08-17-REPORT.md).
The 2026-08-08 `_recovery` transaction remains durable in
[`WORKTREE-RECOVERY-2026-08-08-REPORT.md`](./design/program/roadmap/receipts/WORKTREE-RECOVERY-2026-08-08-REPORT.md).
Do not recreate `SpaceFace-archives`. Do not treat repeated exports as separate projects, and do not
keep a safe disjoint unit idle because one exact path has a live writer.

That archives folder hid **no new ship or place**. Unfinished look-dev from it is already admitted:

- Ashline dart / lode / rig → `PQ-050.13`–`PQ-050.15` from current factory bodies and `m4_ashline_v2`.
  Do not restore the rejected July 21 v1 depth polish.
- Helios lark / cradle / span → `PQ-050.16`–`PQ-050.18`. The civilian family on master already
  matches the scratch byte-for-byte.
- Other flyable remasters → remaining `PQ-050` leaves. Hitch stays frozen.
- Stopped-Lark express liner → `PQ-049` (already tracked; not in that folder).
- Dock / hulk / debris → the place remaster handoff above.

Recovery effort uses `XS` (up to 30 minutes), `S` (0.5-2 hours), `M` (2-4 hours), `L` (4-8 hours),
and `XL` (multi-day) only as scheduling metadata. Finish `XS` through `L` in the active recovery
campaign; preserve inputs and defer only a genuinely `XL` authored/cross-owner outcome with an
executable route. `GFX-MASSLINE-EXPRESS-LINER` is now admitted as `PQ-049`; its parent remains
`ready` / `unproven` until its ordered route-acceptance leaf closes:

| Stable route | Size | Required outcome |
|---|---:|---|
| `PQ-049` / `GFX-MASSLINE-EXPRESS-LINER` | `XL`, about 4-8 focused artist-engineer days plus independent review | Adapt the tracked stopped-Lark donor into a **separate** express-only ship through five ordered leaves: fresh DCC/LOD candidate; source/candidate/release/manifests; render package; express-only runtime maps; then Browser/Electron route/tether/save/performance and exact-hash G7. Never replace accepted courier Lark or fold it into the Massline presentation showcase. |
| `PQ-018.cathedral-reauthor` | existing multi-day active packet | Use the current packet for Cathedral DCC/release and exact route/art acceptance. Recovered Cathedral GLBs are rebuild variants, not alternative art, and no standalone PQ-018 broker harness should return. |

`PQ-049` is the admitted execution of `GFX-MASSLINE-EXPRESS-LINER` and executes in this order:

1. **`PQ-049.01` — Freeze identity, preflight, and reauthor; do not rename.** Keep accepted
   `wholeship_helios_lark` and its hashes/runtime maps unchanged. Admit
   `SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1` / `wholeship_massline_express_liner_v1` with a
   passenger/drive/service fiction, supported views, component/material bill, and explicit
   tether/dock/service load paths. The two files under
   `assets/ships/massline_express_liner_v1/reference/stopped_lark_iter19/` remain reference-only. Own
   `assets/ships/massline_express_liner_v1/blender/massline_express_liner_v1.blend`, its source GLB,
   bakes, matched-view evidence, and authored LOD0/1/2. Repair macro/meso construction, material
   zones, floating parts, and plastic/clay response before integration work.
2. **`PQ-049.02` — Build and promote.** Produce `wholeships/massline_express_liner_v1.glb` through the normal source,
   candidate, optimized release, source-manifest, generated release-manifest, and conditional
   release transaction. Do not hand-edit generated metadata or borrow the accepted Lark release slot.
3. **`PQ-049.03` — Generate the render package.** Build the conditional
   `assets/ships/release/render-packages/massline-express-liner-v1/` transaction and regenerate its
   runtime table through the sanctioned package pipeline.
4. **`PQ-049.04` — Wire sequentially after current writers release.** Add only the `express` entries in
   `WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE` and `WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE` in
   `src/render/partsLibrary.js`, consuming the already-generated render-package runtime table. Existing
   `src/systems/traffic.js` express behavior remains authoritative; this is presentation identity, not
   an AI/route rewrite.
5. **`PQ-049.05` — Accept.** Prove Browser and Electron natural express spawn, label, route,
   dock/service context, passenger-only custody with no invented freight manifest, boost, tether
   latch/reel/release, and save/Continue itinerary; run a matched dense-pocket
   and tether-close performance comparison; finish with independent exact-hash G7 and whole-asset
   G1/G2/G4. Any missing gate leaves the mapped asset unproven and non-accepted.

Do not begin from an old handoff, screenshot directory, review transcript, archived plan, raw whole-queue dump, or broad repository grep—**except** the place remaster handoff linked above when that is the explicit task, the massline presentation UVP packet when that is the explicit task, or the tracked worktree-recovery playbook when leftover agent work is the explicit task.

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
| [`NOW.md`](./design/program/NOW.md) | volatile | threads actually mutating now, exact dirty hunks, brief publication windows, unassigned dirty work | history, task-long ownership, subsystem lanes, dependencies, completion, test transcripts |
| `scripts/program-dispatch.mjs` + [`program-queue.json`](./design/program/roadmap/program-queue.json) | compact read view + durable machine index | exact dispatch units, parent identity, integration dependencies, broad checks/evidence, coarse parent state | active mutation windows, implementation prose, acceptance transcripts |
| [`active/`](./design/program/roadmap/active/README.md) | active packet | executable outcome, live seams, phases, write budget, proof budget, stop conditions | global status, unrelated backlog, permanent architecture |
| `receipts/` and acceptance pages | evidence | exact-revision proof and honest residuals | future requirements or dispatch state |
| module/event/system maps | generated or maintained reference | low-context code navigation | product priority or completion claims |

Status is two-dimensional:

- **Lifecycle:** `planned → ready → claimed → implemented → integrated`, with `deferred` and
  `historical` as explicit dispositions. The legacy `blocked` enum remains only for schema
  compatibility and has no current queue rows. Named human-only work uses `deferred`; internal
  dependencies, another thread, dirty files, tools, reviews, or hardware never become blockers.
- **Acceptance:** `unproven → focused_green → route_accepted → milestone_accepted`.

These axes do not imply each other. Integrated code may still lack route acceptance; a source asset may be implemented but not runtime-wired; a focused-green packet is not automatically fun, readable, or complete.

The existing queue's `state` field is transitional and can contain legacy acceptance labels. Treat it only as a coarse index value. The active packet and exact-revision receipts own the separate lifecycle and acceptance claims until the queue schema is migrated.

## 5. Selecting and shaping work

Choose the first dependency-front dispatch unit, or an exact unit named by the user, and reduce it to
the smallest coherent slice that can reach its declared terminal state. `--ready` is the preferred
integration order, not a list of the only work that exists. `NOW.md` prevents one dirty hunk from
being overwritten: if that exact hunk is actively changing, continue the task's disjoint work or take
the next returned unit. Never turn the overlap into a blocked packet, subsystem, or roadmap.

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
- every execution ends `PASS`, `FAIL`, `NEEDS HUMAN`, or `DEFERRED` with an exact-revision receipt,
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
| **`PQ-052` / `PERF-12-RIGID-OPAQUE-BATCHING`** | Crowded fleets keep their authored appearance while materially reducing GPU submission cost. | Adopt, repair, or reject the existing material-keyed heterogeneous `THREE.BatchedMesh` candidate. Pool only rigid opaque render-package surfaces behind exact material identity; preserve owner release, LOD, damage, semantic proxies, pipeline/residency admission, context recovery, and bounded geometry capacity. Keep canopies, plumes, fans, nav lights, decals, animated surfaces, and transparency-sorted work out of this lane. | A clean same-scene before/after shows a material GPU-frame reduction and fewer opaque submissions/chunks with identical geometry, materials, transforms, animation, damage, and visible pixels. Depends on `PQ-051`, the `PQ-034` measurement seam, and current render-package authority; do not wire the older generic batcher merely because it exists. |
| **`PQ-053` / `PERF-13-LIVE-LOD-HLOD-IMPOSTORS`** | Near ships and places retain full authored quality while distant fleets, stations, and landmarks become genuinely cheap. | Repair the Wasp separate-file demotion, generalize safe projected-pixel LOD0/1/2 selection to every valid ship family, spawn distant traffic at the appropriate resident level, and produce authored station/place HLOD clusters and far impostors through the offline package pipeline. Bound far greebles, animation, decals, and realtime shadow casting by projected contribution without reducing close detail. | Moving through the same route changes actual resident/drawn geometry and scales triangles, meshes, shadows, and GPU time with projected size without blank frames, visible popping outside the declared transition band, identity/socket drift, or extra LOD0 residency. Depends on `PQ-037`, `PQ-051`, and coordination with `PQ-052`. |
| **`PQ-054` / `PERF-14-BOUNDED-GPU-ADMISSION`** | Continue, New Game, sector entry, and first combat no longer move the same unbounded shader/upload stall between loading and flight. | Finish the finite identity-bound opening pipeline/residency cohort, context-restore fail-closed behavior, low-LOD/opening-shell-first admission, and bounded post-paint draining. Compile and upload only exact critical roots before handoff; later roots use the normal per-root gate. Do not wait on a growing pending set, render the whole live scene as warmup, skip shaders, or raise timeouts as a fix. | The owner's real Continue and a heavy sector entry reach a changing playable canvas; every blocking slice stays within the performance budget's target/hard limits, late admissions cannot extend the opening watermark, and first-use combat/traffic produces no permanent freeze or seconds-scale shader/upload hitch. Depends on `PQ-051` and the live `PQ-037`/pipeline-residency seams. |
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
finds a pole this table does not name.

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

Every leaf uses the investigate → invalidate → implement loop in
`PERF_OPTION_SPACE.md` §3. Default order when no campaign is named: `PQ-061` → `PQ-062` → `PQ-063`
→ then §7 of that file. Long platform leaves wait until that table points at them, unless the owner
starts that campaign.

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

- Material-keyed instancing and BatchedMesh for rigid opaque (`PQ-052`)
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

- Exact-key dummy prewarm (lights, HDR, batching, shadow depth) (`PQ-072`)
- One new program per present after present; never whole-root on rAF (`PQ-054`, `PQ-072`)
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

Four independent design reviews ran against the shipped J3/J5 code and captured frames. They are
recorded here because several findings **generalise to every job below**, and two of them were
defects in the *verification*, not the feature.

**The checks were wrong in the same way the repo has been bitten before — twice, in one session.**

- `check-data-states` asserted a `forced-colors` branch existed by substring, and **matched the
  words in a comment** while the `@media` rule was gone. Its reduced-motion assertion read a
  fixed-size window that **spilled into the next block** and was satisfied by *that* block's rule.
  Both now parse the brace-balanced at-rule with comments stripped.
- It scanned `font-size:` only, so an **11px keycap shipped inside the block whose own comment
  claims a 12px floor**. It reads the `font:` shorthand now too.
- `probe-data-states` captured every frame at ~535px while the live sites render in a **~287px
  inspector column**, and no fixture passed `verb.key`, so the offending keycap was never
  instantiated in any of 12 frames. **The worst case was the common case, and nobody had looked at
  it.** Adding the real column immediately exposed prose wrapping **one character per line** — which
  violated none of the type-floor, clipping or focus measures and reported green.
- `check-screen-memory` had two rules that **passed their own mutation**: an LRU test that a frozen
  clock satisfied by accident, and deny-list keys compound enough that three rules matched each, so
  removing one changed nothing. Both rewritten.

> **The generalised rule, now the standard for every job below: negative-test every rule you write.
> A check that has never been seen to fail is a check you have not written yet.** Four of the
> fourteen rules added this session were too weak to catch the defect they existed to catch, and all
> four were found by mutation, not by reading.

**Findings that change the plans below** are folded into J1, J2, J6–J10 directly. The two worth
stating once, globally:

- **Adoption is the deliverable, not the primitive.** J3 shipped with three EMPTY sites in one tab
  of one screen; LOADING, ERROR and DENIED had zero production consumers. J5 shipped with three
  tagged nouns. A `tagged > 0` check passes both and proves nothing. **Every job below states a
  named minimum adoption set, and its check asserts that set — not a non-zero count.**
  **`check:data-states` and `check:entity-links` do NOT yet do this** — they still fail only on a
  zero/near-zero count. Encoding the named sets is part of finishing each job's adoption pass, not a
  separate task; until then the rule binds J1 onward and those two are explicitly grandfathered.
- **Tier 2 does not exist yet.** `[data-why]` has one match in `src/ui/` and it is a *comment*. The
  disclosure ladder runs 1 → 3 across every surface built so far, and §7 calls tier 2 "the mechanism
  that lets this game be deep without being a spreadsheet." It is cheap — `causeLedger`'s enumerated
  phrase bank is the pattern — and it is now a line item in J2, J6 and J8.

**Also landed from the earlier direction document:** the live-overlay fix (`body.ui-live-screen #hud { opacity: .5 }`) so a non-pausing screen no longer blinds the player, and an `sf-select` primitive. **Adoption is complete** — verified 2026-08-23 by call site, not by reading for `<select>`: all three named files (`galaxyMap.js`, `screens/automationPanel.js`, `screens/starmap.js`) import `enhanceSelects` and call it, which swaps the node in place. The native `<select>` still in the markup is the SOURCE the widget is built from, not a surviving OS dropdown — grepping for the tag reports a false gap.

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

### 11.12 The sequenced jobs (J01 – J16)

Each job states the A-list pattern it borrows, the player outcome, the exact seams, the build steps,
how it is verified, and the traps that will bite. Full narrative in
[`design/frontend/NEXT_JOBS.md`](./design/frontend/NEXT_JOBS.md).

---

#### J01 · The four data states, as a shared primitive — *short* — **LANDED `09111881`, NAMED ADOPTION SET ENCODED `c571c478`**

**Pattern:** the skeleton/empty-state discipline of every shipped consumer app.
**Player outcome:** never a blank screen that is technically correct.

**Shipped:** `dataState` / `dataStateHtml` / `mountDataState` / `settleDataState` in
`src/ui/uiPrimitives.js` + `styles/ui.css` §13. `headline`, `fills` and `verb` are **required and
throw** — optional arguments get omitted, and this decays back into the dead `.sf-empty` with more
ceremony. A **string form** exists because most screens here assemble `innerHTML`; a DOM-only
primitive could not be adopted where the defect lives.

**Named minimum adoption set:** the Chart's market-feed path (ERROR), THE SHIP's hull-resolve gate
(LOADING, replacing `sx-sw__acquiring`), and the station dock-refusal path (DENIED — `dockDeny.js`
already enumerates the reasons).

**Verify:** `check:data-states` (contract, statically) + `probe-data-states` (the capture matrix).

---

#### J02 · Screen state memory — *short* — **LANDED `16067c5e`**

**Pattern:** universal. Invisible when present, infuriating when absent.
**Player outcome:** the map, ship and station open where they were left.

**Shipped:** `src/ui/screenMemory.js`, a bag on `state.ui.screenMemory` persisted per save under
`data.uiScreenMemory` (schema **v13** + migration). Adopted by the Chart for tab, commodity, layer
set and bookmarks; `screenManager` owns scroll generically via `[data-sf-scroll]`.

---

#### J03 · Everything is a link — *medium* — **LANDED `61497eab`, NAMED TAGGING SET ENCODED `c571c478`**

**Pattern:** EVE Online "Show Info", Destiny inspect — every noun is a door.
**Player outcome:** twelve menus stop being twelve menus. Read a contract naming a company → click →
standing, doctrine, territory, your history → click a sector → the Chart opens focused there.

**Shipped:** `src/ui/entityResolver.js` (all eight nouns, `null` for anything unknown) and
`src/ui/entityLinks.js` (delegated handler + tier-3 drawer). `check:entity-links` exercises the
resolver for real; `probe-entity-drawer` drives it in the running game.

**Tagging pass owed:** the Chart inspector's Jurisdiction value, mission-log rows, station market
and contract rows, and the codex.

---

#### J04 · Fast Component Snapshot & Visual Iteration Lab (`probe-frontend-snapshot.mjs`) — *short* — **LANDED `c571c478`**

**Pattern:** Storybook / Component isolation testbed with instant headless visual capture.
**Player / Developer outcome:** agents and developers can iterate on frontend styling, icons, and cards with sub-second visual feedback without booting full 60 FPS Three.js gameplay.

**Build steps.**
1. Create `scripts/probe-frontend-snapshot.mjs` and wire `package.json` (`npm run probe:frontend-snapshot`).
2. Extend `_uilab.html` with component isolation fixtures for HUD anchors, cards, gauges, and faction roundels.
3. Output clean `.devshots/frontend/<component>.png` and side-by-side visual diffs.

**Seams:** `scripts/probe-frontend-snapshot.mjs`, `_uilab.html`, `package.json`.
**Verify:** standalone probe executes in <1s and outputs sharp PNGs into `.devshots/frontend/`.

---

#### J05 · Unified Vector Iconography, Faction Crests & Asset Purge — *short* — **LANDED `e23a9ba9`**

**Pattern:** Homeworld / Wipeout precision aerospace vector standard (`currentColor` 24×24 stroke SVG).
**Player outcome:** zero cartoonish OS emojis; distinct heraldic vector crests for all 14 galactic factions; unified aerospace symbols across station, outfitting, and flight.

**Build steps.**
1. Replace all Unicode emoji symbols (`fitTree.js` ⛴, `accessibility.js` 🛡, ⚡, ♨, ⛔) with dedicated 24×24 `currentColor` stroke SVGs.
2. Author 14 distinct geometric vector heraldic crests/roundels for factions (SCN, MTS, DMC, Reach, Quiet Choir, Vael, etc.) to replace `<rect><text>S</text></svg>`.
3. Consolidate competing metaphors (`uiPrimitives.js` balance scale, coffee mug, knight shield) into `src/ui/station/icons.js`.
4. Purge unreferenced raster reference sheets (`assets/ui/icons_atlas.jpg`, `assets/ui/reticle.jpg`).

**Seams:** `src/ui/station/icons.js`, `src/ui/fitTree.js`, `src/ui/accessibility.js`, `src/ui/uiPrimitives.js`, `src/data/factions/`, `src/ui/station/screens/factions.js`, `src/ui/galaxyMap.js`, `assets/ui/`.
**Verify:** `check:ui-identity`, `check:asset-reachability`, `check:wcag-contrast`, headless snapshot audit.

---

#### J06 · The Power Rail — *short* — **LANDED `79e56c06`**

**Pattern:** the MMO/looter action bar (WoW, Destiny) — permanent, numbered, fills as you grow.
**Player outcome:** *"I can see what I can do, and I can see it growing."* The direct answer to
*"I can't look at the HUD and see the big game."*

**Build steps.**
1. Render the rank bottom-centre in three bands of three — **ORDNANCE** (1–3, instantaneous, leaves
   nothing behind), **FIELDWORK** (4–6, spawns a persistent bounded object), **RIG** (7–9,
   ship-attached sustained toggle).
2. Slot states: ready · cooling (radial) · armed · locked · unaffordable · empty socket.
3. Implement the **slot-claim contract**: `hud:slotClaim { claimId, slots[], answers[], expiresAt, mode }`
   on prompt open, `hud:slotRelease { claimId }` on close. Modes `SINGLE` / `PARTIAL` / `FULL`.
4. Icons: generate from the 16 committed prompts, author to 24 × 24 `currentColor` stroke SVG per
   `ICON_PIPELINE.md`.

**Seams:** `src/ui/hud.js`, `injectHudCss` in `src/ui/uiRoot.js`, `src/systems/input.js`,
`src/ui/bindings.js`, new `src/ui/powerIcons.js`.
**Verify:** slot fires verb; claim/release round-trips through encounter prompt; capture at hour-1/10/50.

---

#### J07 · Tactical HUD Overhaul — "Ink on Vacuum", Column Grid & Wireframe Ship Condition — *medium* — **LANDED `ad4764b5 … f94a3368`**

**Pattern:** DCS / Elite Dangerous high-glancability non-diegetic HUD telemetry.
**Player outcome:** instantaneous combat parsing without reading text paragraphs; no misaligned staggered cards; dynamic ship damage wireframes matching the active hull.

**Build steps.**
1. **Right Dock Alignment**: lock `.sf-target`, `.sf-overview`, and `.sf-radar` into a unified 220px column width, eliminating the 232px staggered card overhang.
2. **De-box the UI ("Ink on Vacuum")**: strip heavy semi-transparent glass cards, 1px/2px harsh borders, and generic box-shadows. Replace with open-frame hairline corner brackets.
3. **Target Panel Streamlining**: move primary combat health into 3D in-world reticle arcs around the enemy target; condense the 8-line monospace paragraph into a compact visual threat badge + range bar.
4. **Enlarge & Upgrade Radar**: expand compact radar diameter from 180px to 220px (matching the dock width); replace 4px dots with directional heading chevrons, double-stroke capital ship silhouettes, and high-threat pulsation rings.
5. **Dynamic Vector Ship Condition**: replace static Scout PNG (`ship-condition-scout.png`) with dynamic SVG wireframes of the active player hull (`SHIP_SILHOUETTES`) with localized damage flashing.
6. **Comms Ribbon**: reposition the floating top-left comms button into a quiet, integrated frequency tape above the left contextual stack.

**Seams:** `src/ui/hud.js`, `src/ui/uiRoot.js`, `src/ui/targetPanel.js`, `src/ui/radar.js`, `src/ui/comms.js`, `styles/ui.css`.
**Verify:** `check:ui:perf`, `check:wcag-contrast`, visual snapshot capture of Cruise, Fight, Latch, and Low-Hull states.

---

#### J08 · Dynamic Combat Reticle & 3D Off-Screen Threat Halo — *medium* — **LANDED `bea90b47`**

**Pattern:** Ace Combat / Project Wingman dynamic targeting reticle and spatial threat awareness.
**Player outcome:** fluid dogfighting without looking away from the crosshair; intuitive reaction to flanking hostiles and incoming missile locks.

**Build steps.**
1. Dynamic aim reticle with weapon lead calculation pips, projectile convergence arcs, and lock-on bloom.
2. 360° off-screen threat halo: subtle screen-edge arc showing incoming missiles, flanking interceptors, and high-threat attack vectors without requiring eye movement down to the radar.

**Seams:** `src/ui/uiRoot.js` (`RETICLE_SVG`), `src/ui/hud.js`, `src/ui/targetPanel.js`, `src/systems/flightV3.js`.
**Verify:** combat lab scenario capture, lead pip convergence test.

---

#### J09 · Ship bands 2–3: handling, power, condition, capability — *short* — **LANDED `0f503607`**

**Pattern:** Elite Dangerous outfitting comparison + Warframe ghost-preview on hover.
**Player outcome:** the answer to *"why does my ship fly like this"*, a power budget with a capacity
to draw against, visible damage, and progression stated as capability.

**Build steps.**
1. **HANDLING** — mount `handlingProfile` verbatim. Bars kick and settle in proportion to their own
   value. Hovering a fitted module runs `massDelta` and **ghosts the bars to where they would go**.
2. **POWER** — headroom = `capRegen − continuousDrain` against `capMax`. `routeBeam` runs reactor → each
   drawing slot with dash velocity ∝ headroom; over budget the dashes march backwards.
3. **CONDITION** — mount `src/core/livingHull.js` scars (kill tally, repair patches, heat scorch).
4. **CAPABILITY** — every tech node's headline is the physical act it grants, second person.

**Seams:** `src/ui/station/screens/shipworks.js`, `src/ui/shipPreviewMount.js`, panels.
**Verify:** probe assertions on handling, power beam reversal, condition scars.

---

#### J10 · THE FOOTPRINT — *medium* — **LANDED `583f7893`**

**Pattern:** Red Dead 2's wanted system + Crusader Kings' *"why does this person hate me"* causal chain.
**Player outcome:** the world visibly remembers. A hostile patrol is traceable back to the collision
that caused it. Key `F3`.

**Build steps.**
1. Append-only `provenanceLedger` listener for `law:incidentReceipt`, `faction:repChanged`, `faction:repSpillover`.
2. Three linked panes: **Rap sheet** (crimes, sector, bounty) · **Standing** (nodes + spillover edges) · **Log** (queryable ship history + 12 named aces).
3. Verbs: pay bounty, bribe, find accuser, take amends contract, jump to sector on Chart.

**Seams:** `src/ui/screens/footprint.js`, `src/systems/lawSecurity.js`, `src/systems/factions.js`.

---

#### J11 · THE RANGE — *medium* — **LANDED `9d242df7`**

**Pattern:** Titanfall 2's gauntlet, Hitman training, Deep Rock tutorial bays — teaching by doing.
**Player outcome:** learns the physics toolkit by flying it, and can return to the lesson. Key `F4`.

**Build steps.**
1. Three playable drills: Massline swing with asteroid/drone; mass-vs-turn slalom; energy-budget hold.
2. Weak-point passes per enemy class (absorbs bestiary: `src/data/enemies.js`, `encounters.js`, `weakPoints.js`).

**Seams:** `src/ui/screens/range.js`, flight physics harness.

---

#### J12 · THE CHART as a dispatch console — *long* — **LANDED `06a8161c`**

**Pattern:** X4's map, Total War's campaign layer, Death Stranding route planning.
**Player outcome:** answers *"where should I take this cargo, and is that route survivable?"* in
seconds — and lets the player act on the answer without leaving the map.

**Build steps.**
1. Economic pressure flows (computed from surplus vs equilibrium).
2. Real route risk calculation (`dangerModel` + `securityReadout` + `factionPresence`).
3. Pure function traffic layer (`trafficRoleMixForSector`).
4. Live conflict zones and sector dossiers.

**Seams:** `src/ui/galaxyMap.js`, `src/ui/map/`.

---

#### J13 · Loadout presets and build identity — *long* — **LANDED `4dbd0257`**

**Pattern:** Destiny loadouts, Monster Hunter equipment sets.
**Player outcome:** *"different kinds of gameplay"* becomes real, because switching is cheap enough
to experiment with.

**Build steps.** Save named fits; swap at any station; a preset rail in THE SHIP's APRON.
Labelled by playstyle — *"Tow & Swing"* vs *"Skirmish"*.

**Seams:** `src/ui/station/screens/shipworks.js`, save schema.

---

#### J14 · Atmospheric Audio-Visual Feedback & Haptic Micro-Animations — *medium* — **LANDED `f85507a9`**

**Pattern:** Alien: Isolation / Dead Space analog-tactile interface feel.
**Player outcome:** physical, living instruments with inertial needle settling, CRT phosphor decay on capacitor discharge, sound-synced frequency visualizers on comms, and tactile click audio.

**Build steps.**
1. Physics-based gauge easing (subtle spring/mass easing).
2. Sound-synced audio frequency visualizer on incoming comms transmissions.
3. Tactile switch and chip click audio integration.

**Seams:** `src/ui/audio.js` / `src/audio/`, `styles/ui.css`, `src/ui/comms.js`, `src/ui/hud.js`.
**Verify:** `check:ui-frame-sleep` (zero CPU/rAF leaks at rest), `check:ui-effects`.

---

#### J15 · Contextual Quick-Comms Radial & Tactical Hail Deck — *medium/long* — **LANDED `6cd90065`**

**Pattern:** Mass Effect / Star Wars Squadrons tactical comms and faction diplomacy wheel.
**Player outcome:** in-flight dynamic interaction with NPC traffic (demanding surrender, paying bribes, requesting docking clearance) without breaking flight flow.

**Build steps.**
1. Non-pausing tactical hail radial (`Alt` or `H` key).
2. Integrated low-bandwidth holographic frequency visualizers and faction-crested pilot badges.

**Seams:** `src/ui/contactHailPrompt.js`, `src/ui/wingmanRadial.js`, `src/ui/comms.js`, `src/data/contactHail.js`.
**Verify:** `check:one-voice`, browser hail interaction test.

---

#### J16 · Visual regression in CI — *long, start early* — **LANDED `scripts/check-visual-regression.mjs, thresholds calibrated 2026-08-20`**

**Pattern:** standard practice at every A-list studio — reference frames diffed automatically.
**Player outcome:** nothing silently regresses.

**Build steps.** Extend the probes into a **capture matrix**: default · reduced-motion ·
`forced-colors` · pseudo-localized, at 2560 × 1080 · 1920 × 1080 · 1280 × 720. Commit reference
frames; diff on change; fail on threshold.

---

### 11.13 Sequential Execution Order (J01 ➔ J16)

```
PHASE 0: FOUNDATIONS & LAB TOOLING
  J01 (Four Data States) ──┐
  J02 (State Memory)     ──┼─► J04 (Visual Snapshot Lab) ──► J05 (Vector Icons & Crests)
  J03 (Entity Links)     ──┘

PHASE 1: FLIGHT HUD & TELEMETRY
  J05 (Icons) ──► J06 (Power Rail) ──► J07 (Tactical HUD Overhaul) ──► J08 (Combat Reticle & Threat Halo)

PHASE 2: STRATEGIC SCREENS
  J07 (HUD) ──► J09 (Ship Bands) ──► J10 (The Footprint) ──► J12 (The Chart)
                                └──► J11 (The Range)
                                └──► J13 (Loadout Presets)

PHASE 3: POLISH, DIPLOMACY & CI
  J08 (Reticle) & J09 (Ship) ──► J14 (Tactile Haptics & Audio)
                             └──► J15 (Quick-Comms Radial)

  J16 (Visual Regression in CI) diffs reference frames continuously from J06 onward.
```

**Key Execution Rules:**
1. **J01–J03 (Properties) & J04 (Visual Lab) come first**: every screen built after them inherits state safety, linking, and instant visual verification without rework.
2. **J05 & J06–J08 deliver the immediate high-visibility flight upgrade**: eliminating emojis, de-boxing the HUD, and establishing combat glancability.
3. **J09–J13 reveal the deep simulation**: surfacing ship handling, crime history, gauntlet drills, economic flows, and playstyle fits.
4. **J14–J16 finish sensory feedback, diplomacy, and automated regression safety**.

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

## 15. Finishing SpaceFace — the A-list program (`PQ-146` … `PQ-173`, plus eight reactivated packets; §16–§19 extend it to `PQ-186`) — ADMITTED 2026-09-03

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
| **ALPHA — "The Toy Works"** | The 60-second proof (`PQ-141`, bar B12) occurs in ≥ 9 of 11 beats across 5 seeds and in one headed capture. The three world-reaction listeners (`PQ-138.00–.02`) fire on the route. | First ten minutes: a new player performs one swing-release, one shove, one grab-and-run without reading a wall (`PQ-163`); playtest completion ≥ 80 % unaided. Every bar B1–B8, B11 measured on the route (`PQ-137.10`). | B2/B3 nimble regime, B4 shove magnitudes, B6 terrain lethality, B9 impacts answer, B11 hitstun law: **met**. Stunt grammar detects ≥ 12 named tricks (`PQ-146`). | Motion Lab numbers, deterministic scenarios, captures, owner verdict on B12 |
| **BETA — "The World Works"** | Six sectors each recognisable from 30 s of unlabeled activity (`PQ-153`); the storyteller sustains the rhythm work→tension→violence→aftermath→quiet over a 90-minute unaided session (`PQ-149`); named aces hunt the player with counter-loadouts (`PQ-150`); the wanted loop has four tiers with a physical escape at each (`PQ-151`). | Campaign spine with an ending and NG+ (`PQ-032` + `PQ-152`): 20–25 h authored, 10 set pieces built from verbs; economy curve: first upgrade ≤ 15 min, a new verb every hour for ten hours (`PQ-155`); three starters = three verbs (`PQ-156`); the station redesigned and the Chart finished (`PQ-162`, `PQ-168`); save/continue trust: 0 dead-ends over 200 save/load cycles. | Massline heads and field toys fielded as unlockable toys with Range drills (`PQ-029/030/031/026/147`); machinery and hazards participate (`PQ-027/028`); cargo is physics (`PQ-148`); wrecks are terrain (`PQ-154`); Crucible daily seed + ghosts (`PQ-169`). | 90-minute held-out routes (`PQ-025` pattern), blind reviews, economy sim printout, capture reel |
| **RELEASE — "It Ships"** | Audio direction complete: impact ladder by mass × speed, adaptive score, radio, mix hierarchy (`PQ-158`). Camera as art direction + photo mode (`PQ-159`); replay + clip export (`PQ-160`). | Accessibility checklist green (`PQ-165`); pseudo-loc +40 % with zero clipped strings and five launch languages (`PQ-166`); controller parity in every screen, Deck verified (`PQ-164`); telemetry funnels + weekly playtest loop (`PQ-167`). | `PQ-033` release matrix: 60 fps median / ≤ 1 hitch per minute above 50 ms at min-spec, boot ≤ 10 s on the target GPU, heap growth < 30 MB over a 30-min soak, 2-hour crash-free soak on Browser and Electron; Steam build, cloud saves, achievements; store assets cut from the deterministic replay. | `check:all` green, soak logs, min-spec captures, store page assets, owner sign-off |

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
- **Exists:** `src/data/tech.js` (32 nodes), `ships.js` (13 hulls), `modules.js` (72), `economy.js`, `economyCycles.js`, `killRewards.js`, `careerContracts.js`, telemetry aggregates.
- **Routes through:** S2-05 long ladder; SPEC3-F1; GDX-A15/A17; PQ-142 verbs.
- **Writes:** `src/data/tech.js`, `src/data/modules.js`, `src/data/ships.js`, `src/data/killRewards.js`, `src/systems/economy.js`, `scripts/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` | **The verb ladder.** A table of hour → verb → cost → gate; every tech node either unlocks a verb or is folded. | Table committed; ≤ 12 stat-only nodes remain, each justified. |
| `.01` | **The ten-hour simulation.** Headless economy sim with three player archetypes prints net worth, verbs unlocked and sinks per hour; a check asserts the ladder. | `check:economy:curve` green for all three archetypes. |
| `.02` | **Sinks that tell stories.** Repairs, fines, insurance, restitution, impound: each a receipt with a cause. | Each sink appears in a session ledger with its cause. |
| `.03` | **Stunts pay.** Trick receipts pay in reputation and salvage rights, never in raw credits (no grind-by-stunt). | A physics run earns ≥ the reputation of a gun run; credits equal. |

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

An independent ~22,000-word source-grounded review of `571659e8` (stored under
[`docs/handoffs/STUDIO_RECOVERY_AUDIT_2026-09-05/`](./docs/handoffs/STUDIO_RECOVERY_AUDIT_2026-09-05/README.md);
its four analytical reference modules live under `tools/reference/`, diagnostic only). Its thesis —
that the repo keeps promoting an implementation, a diagnosis or a convenient surrogate into binding law
and then optimises the law — is right, and it is the failure §1.3 law 9 and §19 exist to catch. Graded
by the integrator; nothing below is an owner ruling until the owner says so.

- **Adopted, done in place (`PQ-189.01`):** §1.6 split into blockers and required proofs (a polarity
  error); law 3 exempts controls and instruments; the fun loop's critic count is a coverage score
  with a hard blocker for a stand-in, not a yes-count verdict; KEEP/REVERT compares the intended bar
  against a declared tradeoff instead of demanding every bar move; the quiet-window metric is scoped
  to combat benches; `FEEL_CONTRACT` §A rows A6–A13 read what landed (they still said OPEN); B8 names
  admissible stroke geometry (a universal ≥ 70 % promise is infeasible on short strokes); the perf
  operator no longer orders the shipped scheduler (`PQ-129.15` is deferred as shipped); the README no
  longer says Space fires.
- **Adopted as leaves:** the control contract generated from the bindings (`PQ-189.00`, pulls the
  `PQ-164` slice forward); minimal action audio in the first playable (`PQ-158.06`); reduced motion
  keeps information (`PQ-165.03`); the production baseline route matrix on named hardware
  (`PQ-144.01`, with the audit's frame-audit tool); the critic's verdict as blockers + intent result +
  play judgment (`PQ-173.04`); Swarm's earned breathing room / pressure reservoir (`PQ-174.08`);
  explicit cargo custody and one-commit transactions (`PQ-177.06`); visible operational limits
  replacing the passive-income haircut, with a save migration (`PQ-177.07`); forecast quality judged by
  calibration, not a 30 % uplift (`PQ-177.01` rewritten); the first durable site loop with an exterior
  consequence (`PQ-145.01`); the style slice and the effect-class VFX matrix (`PQ-190` — world art and
  effects only; screens, HUD and type belong to the frontend direction, `design/FRONTEND_DIRECTION.md`).
- **Adopted with a guard:** "mutate, never fail" (`PQ-138.04`) becomes a bounded policy — recovery
  where meaningful, clean failure and partial success allowed, never recursive busywork; the first-ten-
  minutes candidate sequence is attached to `PQ-163` as a candidate, not a script; industrial danger
  stays chosen and visible (no periodic raids as balancing); "never add drag" keeps its meaning — an
  explicit brake, a drive family, authored angular damping and a visible thruster correction are not
  drag, a hidden velocity clamp is.
- **Declined:** a new independent backlog (the audit itself says so); an engine or worker migration as
  recovery; treating the paperwork ratchets (single writers, goldens with causal records, normal-route
  evidence, independent acceptance) as waste; a global bloom increase as art direction.
- **Provenance conflict surfaced, owner's call:** the audit found `VISION_ALIGNMENT_PLAN.md` Big-Five
  item 4 (2026-08-10) recording the owner's REJECTION of a hull scar / recognition system, while §15
  (2026-09-03) admitted `PQ-142.01` from VISION Part II and it landed on 2026-09-05 as a record and
  words (no paint on the hull). The later admission stands until the owner rules; the packet carries
  the note.

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


## 16. Swarm mode: the Crucible plays optimally (`PQ-174`, `PQ-175`) — ADMITTED 2026-09-03

**Source:** the owner, 2026-09-03: *"fast-paced physics-centric arcade-style combat that plays
optimally in swarm mode"* and *"if you get the crucible mode to be optimally fun, then it would make
the goals for adventure combat more obvious."* §12 built the Crucible's engineering (phases 0–12
complete); §13A gave it a swarm ruleset; this section makes it the game's best fifteen minutes and the
lab every combat number is tuned in first.

### 16.1 What "plays optimally" means, in numbers

Measured by the fun-loop bench (`PQ-173`) on fixed seeds, starter loadout, swarm ruleset, at the
shipping camera. These are the swarm bars; `PQ-174` owns them.

| Bar | Statement | Live value at writing |
|---|---|---|
| S1 First blood | First hostile within 8 s of launch; first kill possible within 20 s with the starter kit. | Unmeasured |
| S2 Hands alive | ≥ 4 distinct verbs used per minute by wave 3 (thrust, brake, boost, latch, reel, release, throw, shove, well, stroke). | Unmeasured |
| S3 Something happens | ≥ 2 rated moments per minute after wave 2; zero nothing-happened seconds (> 4 s with no input change and no world event) after wave 1. | Unmeasured |
| S4 Waves breathe | Waves last 45–90 s; cleanup ≤ 4 s; a menu at most every fifth wave. | Menu frequency by ruleset: 1 in 5 (met); durations unmeasured |
| S5 Physics wins | A shove-and-rock run outscores a gun-only run of equal skill by ≥ 2×; the free Pulse cannot top the board; the starter kit shoves. | Free Pulse out-damages the physics kit (recorded) |
| S6 Deaths are fair | ≥ 90 % of deaths telegraphed ≥ 0.5 s ahead; every death named with its cause and the telegraph missed. | Cause named; telegraph unmeasured |
| S7 Roles are problems | A blind reviewer names each role's physical counter from a 12 s strip; median time to resolve a light under physics ≤ under guns. | Roles exist as spawn slots |
| S8 Arenas are laws | Each arena changes the top build and the top verbs (telemetry over seeds). | Five arenas with laws; effect on strategy unmeasured |
| S9 Bosses are puzzles | Each boss dies to physics alone within 90 s in a scenario; no immunity theatre. | Unmeasured |
| S10 Run shape | A competent player's first death lands between 8 and 14 minutes; retry on the same seed in ≤ 5 s; session-2 return ≥ 60 %. | Unmeasured |
| S11 No inflation | Wave N+10 has the same enemy hull values as wave N; difficulty rises by count, mass, anchors, hazards and angles. | Recipes pinned at 1/5/10; not asserted |

### 16.2 The order inside the swarm program

```text
PQ-173 bench ──> PQ-174.00 bars printed ──> PQ-174.01 pacing ──┐
PQ-137.05 force table + PQ-146.01 scoring ──> PQ-174.02 physics wins ──┼─> PQ-174.03–.07 ──> PQ-175 content at craft
PQ-140.02 specialists ──────────────────────────────────────────┘
```

Every combat number lands in the Crucible first. Adventure combat (`PQ-140`, `PQ-152`, `PQ-141`)
inherits the numbers by reading the same data, never by a copy.

### 16.3 The packets

| Packet | Pillar | One line | Wave |
|---|---|---|---|
| **`PQ-174`** Swarm mode fun contract: the Crucible plays optimally — [`active/PQ-174.md`](./design/program/roadmap/active/PQ-174.md) | S · Swarm mode | The Crucible becomes the game's best fifteen minutes: bars for pacing, verbs, moments, deaths and builds; the physics kit is the strongest kit; every arena and boss is a physics problem. | ALPHA |
| **`PQ-175`** Swarm mode content at craft: waves, arenas, drafts and mutators that create decisions — [`active/PQ-175.md`](./design/program/roadmap/active/PQ-175.md) | S · Swarm mode | Thirty waves that each ask a different physical question, five arenas whose props participate, drafts that change how you fly (never only how hard you hit), and mutators that are new games. | BETA |

### 16.4 The plans, in detail

#### Pillar S · Swarm mode

**`PQ-174` — Swarm mode fun contract: the Crucible plays optimally** · *ALPHA* · after `PQ-137`, `PQ-173`

A stranger presses the Crucible button and has the best fifteen minutes the game offers, on the first try, with the starter loadout. The swarm streams (no menu four waves out of five), the first kill lands inside twenty seconds, four verbs are in use by wave three, something worth watching happens twice a minute, no second passes with nothing happening after wave one, every death was telegraphed and named, the physics kit outscores the free gun, and a competent player dies between eight and fourteen minutes in with a story to tell. Difficulty comes from geometry, mass and numbers, never from enemy hit points.

- **Gap:** Phases 0–12 of the Crucible are engineering-complete and the swarm ruleset exists; nothing measures whether a run is fun, the free Pulse out-damages the physics kit (owner ruling recorded in the Crucible memory), and the owner's verdict is that combat 'just sucks'. **Reference:** Vampire Survivors pacing, Nova Drift builds, Geometry Wars readability, Rocket League scoring, Slay the Spire drafts.
- **Exists:** `src/systems/survivalSwarm.js` (streaming ruleset, draft every N waves), `survivalWavePlanner.js`, `src/data/survivalWaves.js` (roles Support/Anchor/Disruptor/Elite; waves 1/5/10 pinned), five arenas with laws (Foundry, Lagrange Crucible, Cinder Sluice, Cryo Drift, Storm Lattice), `survivalDraft.js`, `survivalMutators.js`, `survivalRecords.js`, `survivalResults.js`, `scripts/check-crucible-route.mjs` (fixed seed, real browser), `check-crucible-run.mjs`, content-factory balance dashboards (PQ-133.12).
- **Routes through:** §12 (PQ-133 phases 7–10 already built the material), §13A PQ-135 swarm cohort, PQ-137.05 force table, PQ-140 roster, PQ-146 stunt grammar, PQ-173 bench.
- **Writes:** `src/systems/survivalSwarm.js`, `src/systems/survivalWavePlanner.js`, `src/data/survivalWaves.js`, `src/data/swarmMode.js`, `src/systems/survivalDraft.js`, `src/systems/survivalResults.js`, `src/systems/survivalRun.js`, `src/data/survivalArenas.js`, `src/systems/swarmArena.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-173.01) | **The swarm bars, printed.** With PQ-173's bench: time-to-first-kill, verbs per minute, moments per minute, nothing-happened seconds, deaths by cause with telegraph flag, build identity per run, wave duration, menu frequency, run length to first death — printed per seed for the three loadouts. | Every bar below has a number on three seeds before any tuning; the numbers are committed as the before. |
| `.01` | **Pacing: the first minute and the wave curve.** First hostile within 8 s of launch, first kill possible within 20 s with the starter kit, waves 45–90 s, cleanup ≤ 4 s, a menu at most every fifth wave, the quota curve rising by count and geometry, never by hit points. | Time-to-first-kill ≤ 20 s on all seeds; wave durations inside the band; menu frequency ≤ 0.2 per wave. |
| `.02` (after PQ-137.05, PQ-146.01) | **The physics kit wins.** With PQ-137.05's force table landed in the Crucible first: a shove-and-rock run outscores a gun-only run of equal skill by ≥ 2× (stunt scoring, PQ-146.01); the free Pulse cannot top the board; the starter kit includes a shove. | Telemetry over 20 seeded runs per kit; the balance dashboard shows the ordering. |
| `.03` (after PQ-140.02) | **Roles in the swarm are physical problems.** Support/Anchor/Disruptor/Elite each pose a positioning problem the player solves with a verb (rope the anchor, shove the disruptor into the elite, well the support cluster); the cohort flows and stays throwable (PQ-135.05). | Blind reviewer names each role's counter from a 12 s strip; median time-to-resolve a light under physics ≤ under guns. |
| `.04` | **Arena laws change the top strategy.** Each of the five arenas measurably changes which build and which verbs win (telemetry over seeds): the gravity arena rewards wells and slings, the current arena rewards riding, the foundry rewards banks and machinery kills. | For each arena, the top build differs from the Foundry's; the difference is visible in the results screen. |
| `.05` | **Boss waves are physics puzzles.** Wave 10/20/30 bosses die to thrown mass, machinery or their own tumbling sub-systems; guns alone are the slow way, never the only way; no immunity theatre. | Each boss killed in a scenario by physics alone within 90 s; capture. |
| `.06` | **Death, retry, and the story.** Death names its cause and the telegraph the player missed, retry on the same seed in ≤ 5 s, and the results screen tells the run as a story: the tricks, the moments, the best chain, the build code. | Session-2 return in playtests ≥ 60 %; results capture reviewed. |
| `.07` | **Difficulty by geometry, verified.** Wave N+10 has the same enemy hull values as wave N and is harder because of count, mass, anchors, hazards and angles; a check asserts no HP inflation across the arc. | `check:crucible:arc` gains the no-inflation assertion; it fails when a wave recipe raises hull values. |

- **Not:** No new arenas before the five express their laws; no draft that is a stat-only modifier; no HP or damage scaling by wave; no second combat path for the Crucible.
- **How agents get this wrong:** Making it 'fun' by adding enemies or waves: the count is a symptom lever; the fix is pacing, verbs and consequences (bars .00–.02); Balancing the physics kit up by nerfing the gun down to nothing: the gun stays useful; physics must WIN, not be the only option; Tuning on a random seed: every number in this packet is per fixed seed and loadout, or it is an anecdote; Reading 'difficulty' as hit points: a wave that is harder because enemies take longer to kill fails leaf .07 on sight; Shipping a boss with an invulnerable phase to 'force' the mechanic: physics must be the fast way, guns the slow way, immunity never.

**`PQ-175` — Swarm mode content at craft: waves, arenas, drafts and mutators that create decisions** · *BETA* · after `PQ-174`

Every wave asks a question in physics ('you are surrounded', 'the anchor is behind the elite', 'the current runs against you'), every arena's props are toys (crushers, shutters, relays, currents), every draft card changes a verb (a heavier line, a wider well, a faster reel, a ram plate) with at most one in three being a number, and each weekly mutator is a distinct game (gravity slalom, heavies only, weapons cold, reef).

- **Gap:** Waves are pinned recipes with roles; drafts include stat modifiers; arena props are mostly dressing; mutators exist as a list. **Reference:** Spelunky level grammar, Hades boons that change verbs, Risk of Rain stages.
- **Exists:** `src/data/survivalWaves.js` (schema, roles, room phases), `survivalActs.js`, `arenaModuleLibrary.js`, `survivalMutators.js`, `survivalDraft.js`, the content factory validators (PQ-133.12), five arena controllers (lagrangeCrucible.js, cinderSluiceArena.js, cryoDriftArena.js, stormLatticeArena.js).
- **Routes through:** §12 PQ-133.05–.10; PQ-027 machinery; PQ-171 content grammar.
- **Writes:** `src/data/survivalWaves.js`, `src/data/survivalActs.js`, `src/data/arenaModuleLibrary.js`, `src/systems/survivalMutators.js`, `src/systems/survivalDraft.js`, `src/systems/lagrangeCrucible.js`, `src/systems/cinderSluiceArena.js`, `src/systems/cryoDriftArena.js`, `src/systems/stormLatticeArena.js`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-174.01) | **Every wave asks a question.** Each of the thirty wave recipes declares its physical question and the verb that answers it; the planner never schedules two consecutive waves with the same question. | Validator asserts a question per recipe and no repeats in a row; a blind reviewer names the question from a strip for 8 of 10 waves. |
| `.01` (after PQ-027.00) | **Props are toys.** Each arena's props participate: shutters cut lines, plates bank shots, crushers kill, relays conduct, currents carry; at least three throwable or usable props per arena. | Per arena, three props used in a scenario to kill or escape; capture. |
| `.02` | **Drafts change verbs.** At most one card in three is a number; every other card changes a verb's shape (line load, well radius, reel speed, ram plate, whip snap); cards are legible in one line. | Draft catalog audit: ≥ 66 % verb cards; a playtester describes each card's effect after one use. |
| `.03` (after PQ-169.02) | **Mutators are games.** Four weekly mutators shipped as distinct games with their own best build (telemetry): gravity slalom, heavies only, weapons cold, reef. | Top strategy differs per mutator over 10 seeds each. |

- **Not:** No sixth arena; no draft rarity tiers; no wave that is a bullet-hell screen fill.
- **How agents get this wrong:** Writing waves as spawn lists: a wave without a stated physical question is rejected by the validator, not by taste; Filling drafts with +10 % cards because they are easy to author; Dressing arenas with props that cannot be touched; a prop that does not move mass is scenery, not content.



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



## 18. Frontend: every surface to the newest version, optimized (`PQ-180`–`PQ-185`) — ADMITTED 2026-09-03

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

Every packet's *How agents get this wrong* section cites entries here. The integrator rejects a unit
on any entry it matches. Where a check exists, its name is given; where none exists, `PQ-186` builds
it.

| # | The failure | What it looks like | The rule | The check |
|---|---|---|---|---|
| W1 | **Literal satisfaction** | "See, it follows the path" at walking speed; the test measured cross-track and never speed. | Done-when in player units; speed is the pass criterion, track the constraint. | bar checks (`PQ-186.00`) |
| W2 | **Content instead of feel** | Answering "not fun" with more enemies, ships, stations, missions. | §1.3 rule 4; the Fun Loop's forbidden moves. | reviewer checklist |
| W3 | **Camera shake as the fix** | Trauma and particles on a boring event. | Spectacle never substitutes for the event underneath. | reviewer checklist |
| W4 | **Stacked clamps** | Each agent adds a local safety rule (governor brake, neutral brake, velocity clamp, contact bound) until nothing the player does sticks. | Never add drag; never clamp given momentum; every clamp names the bar it serves. | `PQ-186.01` guards |
| W5 | **Test-to-pass** | Rewriting an assertion or re-recording a golden because it went red. | Assertions quote the vision sentence; goldens move only with the causal record. | anti-vision assertion lint (`PQ-186.02`), §8/§10d |
| W6 | **Prose as proof** | "Verified", "works", a green check, a flattering still. | Numbers, frames, consequences. | reviewer checklist |
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
| W22 | **Ignoring the wrong-way list** | Building the packet without reading its *How agents get this wrong*. | Step 3 of the procedure. | reviewer checklist |
| W23 | **Scope creep as rescue** | A unit that could not close its bar closes something else instead. | New findings become ranked debt, never scope. | reviewer checklist |
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

The game cannot regress silently. Each FEEL_CONTRACT bar has a scenario check; each owner ruling (no drag, no clamp on given momentum, no NPC gyros, no HP scaling, no dialogue trees, the player never knocked around) has a static or runtime check whose message quotes the ruling; the refusals in §15.7 have grep-level guards where a grep can catch them; and a test that pins behaviour the vision forbids is itself detected by a lint on assertion messages against a banned-phrase list.

- **Gap:** The 2026-09-03 audit found anti-vision behaviour pinned green by tests; nothing prevents it happening again. **Reference:** The repo's own §7 rule: inject a failure and watch the check go red.
- **Exists:** `test/flightV3.spec.mjs`, `test/travel-drive.test.mjs` (rewritten with vision sentences), `check:baseline`, the Motion Lab, `check:sim` goldens, `scripts/check-*.mjs` pattern.
- **Routes through:** FEEL_CONTRACT §D/§E, §7 verification, PQ-137.10 scenarios, PQ-173 bench.
- **Writes:** `test/`, `scripts/`, `src/testing/lab/`

| Leaf | Outcome | Done when |
|---|---|---|
| `.00` (after PQ-137.10) | **Bars as checks.** One check per FEEL_CONTRACT bar the lab can reach, assertion message = the bar's sentence; wired into check:all:smoke. | Every reachable bar has a check; injecting the old governor brake turns B1 red. |
| `.01` | **Rulings as guards.** Static guards: no linear damping calls in sim, no velocity writes outside the physics owner, no `Math.random`/`Date.now` in sim, no HP-scaled knockback, no dialogue-tree data shapes; runtime guards: player knock budget, NPC no-gyro invariant. | Each guard has a fixture that fails it; all green on master. |
| `.02` | **Anti-vision assertion lint.** A lint over test assertion messages against a banned-phrase list ('should decay toward the cap', 'must not stagger', 'brake survives'), maintained in the feel contract. | Lint green; the 2026-09-02 phrases would have been caught. |

- **Not:** No fixed pass/reviewer counts as gates; no check that cannot fail (§7).
- **How agents get this wrong:** Writing a check that imports a node:test file and cannot fail (§7): run suites as child processes and honour exit codes; Encoding a bar with a tolerance so wide it never fails: inject the old defect and watch it go red before committing.


