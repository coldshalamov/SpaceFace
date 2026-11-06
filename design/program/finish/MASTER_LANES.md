<!-- LIFETIME: ACTIVE_PROGRAM -->
# Master plan — seven lanes and their prompts

The 29 campaigns in [`MASTER_PLAN.md`](./MASTER_PLAN.md) grouped into seven lanes that can run at
the same time. Each lane owns a distinct part of the code. The **SWARM lanes F and S**
(`swarm/LANES.md`) and the **performance work** (`PERFORMANCE_HANDOFF_2026-11-05.md`) are already
running; every lane below names where it meets them.

| Lane | Campaigns (in order) | Owns (broadly) | Agent strength |
|---|---|---|---|
| 1 PIPELINE | E10 → E1 → E5 → E9 | sim↔render transport, frame loop, platform shells, boot/loading | strongest |
| 2 SIM CORE | E3 → E2 → E4 | simulation systems, physics usage, entity store | strongest |
| 3 RENDERER | E6 → E7 | renderer, residency, materials, shaders, batching | strongest |
| 4 SHIP | P1 → P2 → P4 → P3 | ship screens, stat model, parts content, progression | strong (P3 needs owner OK) |
| 5 WORLD | W1 → W5 → W2 → W3 → W4 | story, missions, encounters, sectors, contacts, onboarding | strong for W1, medium after |
| 6 LOOK & SOUND | X1 → X2 → X4 → X3 → X5 | art direction, assets, audio/music, Adventure HUD, controls | medium + one art reviewer |
| 7 QUALITY & VERDICTS | Q1 → Q3 → Q5 → Q2 → Q4 → E8 | census, review gate, tests, route walks, razor, native-engine verdict | medium; E8 strongest |

## Collision map (read before editing)

| Lane | Must not edit | Coordinate with |
|---|---|---|
| 1 | Swarm lanes' files; renderer internals (lane 3) | lane 3 on the pose writer the playout buffer feeds; Codex perf on worker budget code |
| 2 | `src/core/sg02DynamicBodyOwner.js`, `waveMaterialization.js`, `swarmArena.js` and the rest of SWARM lane F's list **until F's S1/S7 land** — then claim in NOW.md | lane 1 (snapshot format), SWARM F (feel profile reads), Codex perf (contact-dispatch work already started) |
| 3 | SWARM lane S's render files (`broodPresentation.js`, `render/vfx/*`, `feel.js`, camera) | Codex perf: `lod.js`, `wholeShipLodPolicy.js`, `partsLibrary.js`, `rigidOpaqueBatch.js`, `precompile.js` are in flight — read their diff and NOW.md first |
| 4 | `src/ui/screens/crucible.js`, `crucibleDraft.js` (SWARM S) | SWARM S integrates lane 4's stat model into the Swarm shop/Ship & Kit |
| 5 | Swarm files | lane 4 (pilot progression hooks into the journey), lane 6 (sector look) |
| 6 | `src/ui/hud.js`, `hudAttention.js`, `bindings.js`, `orrery/*` **until SWARM S's S2/S5 land** | SWARM S (X3/X5 generalise its glass and controls), lane 3 (assets enter through residency) |
| 7 | other lanes' source (Q1/Q4 decide and hand off, or edit only with the owning lane's OK in NOW.md) | everyone: Q1 findings are filed to the owning lane |

A lane that needs a file another lane owns writes one line in `design/program/NOW.md` and moves on to
its next task.

---

## Prompt — Lane 1 PIPELINE

```text
You are Lane 1 — PIPELINE — of the SpaceFace master plan.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE PROBLEM YOU OWN: the game "freezes" while planets keep spinning, then the ship blips to a new
place; loads are long. Cause (verified): the simulation runs in a worker and publishes steps; under
load steps take up to 458 ms and arrive at 2–10 Hz, and the presentation has no playout delay,
extrapolation or smooth correction, so the ship holds its last pose and then jumps. The public
build lacks cross-origin isolation, so the shared-memory transport is off there.

READ FIRST, ALL OF EACH: design/program/finish/MASTER_PLAN.md Part 0 and Part 1 (§1.1–1.4, your
campaigns E10, E1, E5, E9 in full); design/program/finish/MASTER_LANES.md (collision map);
design/program/finish/PERFORMANCE_HANDOFF_2026-11-05.md (esp. the 2026-11-06 section);
AGENTS.md; ARCHITECTURE.md; design/program/NOW.md. Then the source: src/core/presentationRunner.js,
src/core/simLaneMain.js, src/core/wholeSimBrowserWorker.js, scripts/lib/gameServer.cjs,
vercel.json, electron/.

YOUR CAMPAIGNS, IN ORDER:
1. E10 frame-truth dashboard — one overlay + JSON trace: worker step per system, snapshot arrival
   jitter, buffer depth, main-thread long tasks, render JS, GPU per pass, allocations, pop-in.
2. E1 playout buffer — timestamped snapshots, adaptive playout delay (33–100 ms), interpolation,
   ≤150 ms velocity extrapolation, critically-damped correction over 80–120 ms, snap only on
   flagged teleports. Build the stall-injection harness FIRST and record the "before".
3. E5 shared memory everywhere / Electron-first — COOP/COEP in Electron and vercel.json, SAB lane
   on by default, Intel iGPU switch audit, signed update path.
4. E9 load in seconds — route-split the 28 MB eager JS, predictive streaming, persistent caches,
   interactive title while loading.
Each campaign's "Verify" in MASTER_PLAN is your finish line, measured on this laptop.

YOU OWN: the transport, frame loop, platform shells and boot/loading code above. YOU DO NOT EDIT:
renderer internals (Lane 3 — agree the pose-writer interface with them), SWARM lane files
(design/program/finish/swarm/LANES.md), or Codex perf's in-flight files without reading NOW.md.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/<ID>/DIAGNOSIS.md (problem;
measured cause chain with numbers; is the design the bottleneck and what replacing it costs; the
chosen road). Diagnose, don't tweak; any rewrite is allowed if the memo shows it's the cheaper road
to the finished result. Keep campaigns/<ID>/STATUS.md current. Measure with the Browser pane
VISIBLE (hidden = ~1 fps). Never re-record determinism references — version them. Shared checkout:
claim paths in NOW.md; git add/commit exact paths only; never -A, reset, stash, clean, rebase or
force-push; when local master carries others' unpublished commits, publish only your paths (temp
GIT_INDEX_FILE, read-tree origin/master, ls-tree HEAD -- <paths> | update-index --index-info,
write-tree, commit-tree -p origin/master, push that, then merge origin/master). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: all four campaigns meet "Verify". If blocked, finish everything else and name the blocker in
one plain sentence. Report to the owner in plain words — done / not done, what changed for the player.
```

## Prompt — Lane 2 SIM CORE

```text
You are Lane 2 — SIM CORE — of the SpaceFace master plan.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE PROBLEM YOU OWN: the authoritative simulation step is too expensive (worker p50 ~8 ms, p95
58 ms, p99 105 ms, max 458 ms) because the game is one big object graph: a flat GameState of JS
objects, 261 registered systems walking it every tick, an event bus where each impact fans out to
~35 listeners, linear scans, per-tick telemetry allocation. Point fixes will not reach "no frame you
can feel". Your target: worker step p95 ≤ 8 ms, p99 ≤ 12 ms, max ≤ 25 ms in the ≥150-body Crucible
round and the Adventure busy route, with 2× the bodies after E4.

READ FIRST, ALL OF EACH: design/program/finish/MASTER_PLAN.md Part 0 and Part 1 (your campaigns
E3, E2, E4 in full); design/program/finish/MASTER_LANES.md (collision map);
design/program/finish/PERFORMANCE_HANDOFF_2026-11-05.md (the 2026-11-06 root-cause map — your
starting evidence); design/FEEL_CONTRACT.md §A (what was fixed and why — don't undo it);
AGENTS.md; ARCHITECTURE.md; docs/SYSTEM_REGISTRY.md; design/program/NOW.md. Study
src/systems/swarmBrood.js as the in-repo proof of the data-oriented pattern you will generalise.

YOUR CAMPAIGNS, IN ORDER:
1. E3 mode-scoped simulation + simulation LOD — a system manifest per mode with rates; far-field
   bookkeeping at low rate; no `if (mode === ...)` scattered through systems.
2. E2 the hot path — finish a permanent per-system profiler in the worker (time + allocation per
   tick), then: batched impact buffer replacing the physics:impact fan-out, physics shape (joints,
   islands, CCD, collision groups), scans → indices, telemetry off the hot path, spikes → slices.
3. E4 data-oriented core — structure-of-arrays entity store with stable indices + generations, a
   facade over state.entities during migration, hottest systems first, delete the facade at the end.
   Port a loop to Rust/WASM only when it is still ≥ 1 ms/tick after the buffer rewrite.

COORDINATION: SWARM lane F owns src/core/sg02DynamicBodyOwner.js, waveMaterialization.js,
swarmArena.js and other files listed in design/program/finish/swarm/LANES.md — do not edit them
until F's S1 and S7 have landed, then claim them in NOW.md and keep F's Swarm feel profile working.
Codex perf has already started contact-dispatch work — read NOW.md and build on it, don't redo it.
Agree the snapshot buffer format with Lane 1 (PIPELINE).

HOW YOU WORK: before any edit, write design/program/finish/campaigns/<ID>/DIAGNOSIS.md (problem;
measured cause chain with numbers; is the design the bottleneck and what replacing it costs; the
chosen road). Optimise only what the profiler ranks top-5. Never change results to save time:
determinism suites must pass; where behaviour legitimately changes, add versioned references —
never overwrite. Keep campaigns/<ID>/STATUS.md current. Shared checkout: claim paths in NOW.md;
git add/commit exact paths only; never -A, reset, stash, clean, rebase or force-push; when local
master carries others' unpublished commits, publish only your paths (temp GIT_INDEX_FILE, read-tree
origin/master, ls-tree HEAD -- <paths> | update-index --index-info, write-tree, commit-tree -p
origin/master, push, merge back). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: the step bars above, measured on this laptop with the profiler export before/after. If
blocked, finish everything else and name the blocker in one plain sentence. Report to the owner in
plain words — done / not done, what changed for the player.
```

## Prompt — Lane 3 RENDERER

```text
You are Lane 3 — RENDERER — of the SpaceFace master plan.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE PROBLEM YOU OWN: pop-in, blinking models, 100–300 ms "admission bricks", and a main thread
that allocates ~65 MB/s in flight. Verified causes: meshes become visible at bind time, before GPU
residency; VFX/tether/prop roots bypass the residency stamp; a forced heavy admission after 8
skipped frames; getProgramCacheKey/getParameters per material per draw; unreadyDrawGuard ~12.5% and
setProgram ~7.9% of a busy frame; renderer.js is 36.7 k lines with a 10.9 k-line init(); GPU p50
23.7 ms in a busy round on the laptop's Intel iGPU.

READ FIRST, ALL OF EACH: design/program/finish/MASTER_PLAN.md Part 0 and Part 1 (your campaigns
E6, E7 in full); design/program/finish/MASTER_LANES.md (collision map);
design/program/finish/PERFORMANCE_HANDOFF_2026-11-05.md (pop-in pipeline + churn sections);
design/program/finish/LANE_1_MACHINE_AND_PICTURE.md (Traps section — measured and rejected, don't
repeat); docs/visual-assets/LOOK.md; AGENTS.md; ARCHITECTURE.md; design/program/NOW.md.

YOUR CAMPAIGNS, IN ORDER:
1. E6 nothing appears before it's ready — one residency manager (requested → loading → uploading
   (budgeted) → compiled (all variants warmed off-screen) → visible) for every drawable including
   VFX/tether/props; predictive pre-admission replaces the 8-frame forced admission; build-time
   shader variant enumeration + parallel compile during loading; persistent program cache in Electron.
2. E7 the renderer that knows its world — split renderer.js into owned modules with a retained
   render list, memoised program keys, instancing/batching as the default path for same-family
   ships, one material director; then a measured WebGPU (three.js WebGPURenderer) spike, kept only
   if the laptop A/B says so.

COORDINATION: Codex perf has these files in flight: lod.js, wholeShipLodPolicy.js, partsLibrary.js,
rigidOpaqueBatch.js, precompile.js, renderer ship-LOD callsite — read NOW.md and their live diff,
build on their work, never revert it. SWARM lane S owns broodPresentation.js, src/render/vfx/*,
feel.js and the camera files — don't edit them; route their drawables through your residency
manager by interface. Lane 1 (PIPELINE) feeds you interpolated poses — agree the pose-writer
interface with them.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/<ID>/DIAGNOSIS.md (problem;
measured cause chain with numbers; is the design the bottleneck and what replacing it costs; the
chosen road). No fades to hide pop-in, no raised budgets, no new special-case gates. Preserve the
look: before/after captures at the gameplay camera (Browser pane VISIBLE) judged against
docs/visual-assets/LOOK.md plus one independent review. Keep campaigns/<ID>/STATUS.md current.
Shared checkout: claim paths in NOW.md; git add/commit exact paths only; never -A, reset, stash,
clean, rebase or force-push; when local master carries others' unpublished commits, publish only
your paths (temp GIT_INDEX_FILE, read-tree origin/master, ls-tree HEAD -- <paths> | update-index
--index-info, write-tree, commit-tree -p origin/master, push, merge back). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: pop-in counters read 0 on the busy routes; no main-thread task > 50 ms after load; render
JS ≤ 4 ms and ≤ 100 KB allocation per frame — measured on this laptop. If blocked, finish
everything else and name the blocker in one plain sentence. Report in plain words.
```

## Prompt — Lane 4 SHIP

```text
You are Lane 4 — SHIP — of the SpaceFace master plan.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE PROBLEM YOU OWN: the owner says the ship's parts are "a wall of names and no explanations" — he
can't tell what a change does until he tries it, and there's no "character screen" where he sees his
ship and feels he's building it like an RPG. Verified: ship screens show engineering numbers
(Agility 8.8, Inertia 18, Brake 78, "core 0 draw", "turn radius 139 m"); slots read "EMPTY · S";
four separate progression systems (research credits tree, Crucible perks, Swarm draft, ranks) don't
add up to one character; fits barely show on the hull.

READ FIRST, ALL OF EACH: design/program/finish/MASTER_PLAN.md Part 0 and Part 2 (your campaigns
P1, P2, P4, P3 in full); design/program/finish/MASTER_LANES.md; design/VISION.md ("progression
means increasing physical agency"); design/frontend/ORRERY.md (frontend direction);
docs/UI_VISUAL_ITERATION.md (ui-bench); AGENTS.md; design/program/NOW.md. Then the owners:
src/ui/panels/handlingProfile.js, src/ui/ship/fitReadout.js, src/ui/ship/shipBandModels.js,
src/ui/station/screens/shipworks.js, src/data/ships.js, weapons.js, modules.js, the tech tree.
Look at the current screens first: node scripts/ui-bench.mjs --shot=station-shipworks,ship,tech-tree

YOUR CAMPAIGNS, IN ORDER:
1. P1 the Ship Sheet — the ship big in 3D; six 1–10 stats (Firepower, Toughness, Speed, Handling,
   Power, Muscle) from ONE pure stat model built on the existing derived values; green/red deltas on
   hover of any part/card/slot; a computed build identity; engineering numbers behind "Details".
   Used by Shipworks, the ship screen, New Game — and provided to SWARM lane S for the Crucible
   Ship & Kit and Swarm shop.
2. P2 parts that explain themselves — role, one plain sentence, tier (Mk I/II/III), stat deltas, a
   3–5 s preview per part; merge near-duplicates; organise by what you want to do.
3. P4 fits you can see — part visuals mounted on hull sockets; earned, visible paint.
4. P3 one pilot, one progression — write the design doc first (4–5 verb branches, ~40 nodes, each a
   verb change with a preview) and STOP for the owner's approval before implementing; then one
   progression owner with a save migration.

COORDINATION: never edit src/ui/screens/crucible.js or crucibleDraft.js (SWARM lane S) — publish
the stat model and tell lane S in NOW.md. Lane 5 (WORLD) hooks pilot levels into the journey; Lane 6
(LOOK & SOUND) builds the part visuals' art through the Forge route if you need new meshes.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/<ID>/DIAGNOSIS.md. One source of
truth — no second calculator. No seventh stat, no percentages, no sentence that restates a name.
P1's finish line includes a BLIND COMPREHENSION CHECK: a reviewer who has never seen the game
predicts from two ship sheets which wins a drag race, a slug-fest and a tow job — and is right.
Every screen you change: ui-bench before/after, --walk every control, open every PNG, one
independent review. New words through the localization catalog. Keep campaigns/<ID>/STATUS.md
current. Shared checkout: claim paths in NOW.md; git add/commit exact paths only; never -A, reset,
stash, clean, rebase or force-push; publish only your paths when local master carries others'
unpublished commits (temp GIT_INDEX_FILE, read-tree origin/master, ls-tree HEAD -- <paths> |
update-index --index-info, write-tree, commit-tree -p origin/master, push, merge back). End commits
with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: P1, P2, P4 meet "Verify"; P3 approved and shipped (or awaiting the owner's approval with
the design doc ready). Report in plain words — done / not done, what changed for the player.
```

## Prompt — Lane 5 WORLD

```text
You are Lane 5 — WORLD — of the SpaceFace master plan.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE PROBLEM YOU OWN: the game has lots of story and mission content but no journey. Verified: a
campaign spine (src/story/campaign47a/storySpine.js), endings A–E (src/story/endings/), story facts
and ledger, 370 encounter files (src/data/encounters/), factions, a bar with contacts. The report
card: "10 sectors are a name plus a hazard circle", "211 lived vignettes from one template",
"12 of 15 contact counters never move", "the finale names 2 of 15 contacts", "439 voice lines
unused", "three heists, one door". Your job is to ARRANGE what exists into a professional
experience — acts, levels, places, characters — and build only the few missing pieces.

READ FIRST, ALL OF EACH: design/program/finish/MASTER_PLAN.md Part 0 and Part 3 (your campaigns
W1, W5, W2, W3, W4 in full); design/program/finish/MASTER_LANES.md; design/VISION.md (all — "failure
should make better stories", "the world is not scenery"); design/GDD_2_0.md §8 (first fifteen
minutes); design/program/REPORT_CARD.md; src/story/AGENTS.md; AGENTS.md; design/program/NOW.md.
Then inventory before designing: the spine, endings, encounters, sectors, contacts.

YOUR CAMPAIGNS, IN ORDER:
1. W1 the Journey — inventory everything into one table; write the Journey doc (3–4 acts: goal,
   verb unlocked, signature set piece, cliffhanger; where each existing piece goes; what's cut; the
   few pieces to build); STOP for the owner's approval; then implement the pacing director by
   reusing the spine/ledger and walk act 1.
2. W5 the first hour, Gold — act 1's opening: one verb at a time, a silent-readable hook, the first
   dock teaches the ship sheet (Lane 4), the first choice splits into the three loops.
3. W2 levels with shape — rate all 370 encounters on the 5-point rubric; upgrade the top 40 into
   hand-crafted physical levels; turn repeated templates into a few procedural generators with real
   variety; cut the rest.
4. W3 sectors with identity — landmark, a resident faction visibly at work, a hazard that is a verb,
   own music and palette (art through Lane 6).
5. W4 characters who remember you — the 15 contacts' arcs react, unused voice lines wired, the
   finale names what you did.

COORDINATION: never edit Swarm files. Lane 4 owns pilot progression — hook into it, don't build a
parallel one. Lane 6 owns art direction/assets/music — request sector looks there.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/<ID>/DIAGNOSIS.md. No new lore
for its own sake; no quest system beside the spine; no more vignettes from the same template.
Verify by PLAYING: a fresh save through act 1 on the ordinary route (Browser pane VISIBLE); the
"what do I do next?" check at ten random moments; 60–90 s climax captures for each of the 40 levels
judged by an independent reviewer. Keep campaigns/<ID>/STATUS.md current. Shared checkout: claim
paths in NOW.md; git add/commit exact paths only; never -A, reset, stash, clean, rebase or
force-push; publish only your paths when local master carries others' unpublished commits (temp
GIT_INDEX_FILE, read-tree origin/master, ls-tree HEAD -- <paths> | update-index --index-info,
write-tree, commit-tree -p origin/master, push, merge back). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: every campaign meets "Verify" (W1 after owner approval). Report in plain words.
```

## Prompt — Lane 6 LOOK & SOUND

```text
You are Lane 6 — LOOK & SOUND — of the SpaceFace master plan.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE PROBLEM YOU OWN: the game doesn't look or sound like one product. Verified: flat painted 2D
planets beside blocky/voxel props beside detailed ships, in different styles and scales in one
frame; Adventure flight overlays prose on the action ("The desk is open. The stacks already know
what you carry."), a jargon stack ("BAND OFF", "IMPACT LOGGED — 214"), a permanent seven-row power
list; about 36 s of authored music; every letter key bound to a flight verb.

READ FIRST, ALL OF EACH: design/program/finish/MASTER_PLAN.md Part 0 and Part 4 (your campaigns X1,
X2, X4, X3, X5 in full); design/program/finish/MASTER_LANES.md; design/VISION.md ("industrial
machinery pushed to arcade levels of energy"); design/program/finish/swarm/README.md §4 (the taste
bar model you'll generalise); docs/visual-assets/README.md and LOOK.md (the Forge/Blender route);
design/frontend/ORRERY.md; AGENTS.md; design/program/NOW.md. Look at the baseline pictures in
design/program/finish/swarm/baseline/.

YOUR CAMPAIGNS, IN ORDER:
1. X1 one art direction — a one-page style bible + a lineup proving it (planet treatment, prop
   style matched to the Forge ships, scale rules) and a census of assets that break it. STOP for the
   owner's approval of the lineup.
2. X2 asset production — through the Forge route, each judged by image review against X1: Swarm
   enemy silhouettes (from SWARM lane F's character sheet), boss break-up chunks, arena kits for the
   7 Swarm arenas, planets/backdrops per X1, props replacing the voxel crates, part visuals for
   Lane 4, the ship sheet's hangar scene.
3. X4 sound and music — adaptive music on the existing score engine with authored stems
   (exploration, tension, combat, boss, station); a sound pass on the 30 most frequent events.
4. X3 Adventure glass — generalise SWARM lane S's quiet-glass policy to Adventure flight.
5. X5 controls and input contexts — generalise SWARM lane S's control set into contexts (flight,
   combat, station, map) with gamepad parity.

COORDINATION: X3 and X5 touch src/ui/hud.js, hudAttention.js, bindings.js, src/ui/orrery/* — SWARM
lane S owns those until its S2 and S5 land; start X3/X5 only after, and claim in NOW.md. New assets
enter the game through Lane 3's residency path. Lane 4 and Lane 5 send you asset requests via NOW.md.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/<ID>/DIAGNOSIS.md. Every asset:
lineup capture at the gameplay camera + turntable, independent image review against X1, runtime
manifest rows, and no frame-time regression (E10 dashboard). Big means big in the world, never a
screen-wide flash. Keep campaigns/<ID>/STATUS.md current. Shared checkout: claim paths in NOW.md;
git add/commit exact paths only; never -A, reset, stash, clean, rebase or force-push; publish only
your paths when local master carries others' unpublished commits (temp GIT_INDEX_FILE, read-tree
origin/master, ls-tree HEAD -- <paths> | update-index --index-info, write-tree, commit-tree -p
origin/master, push, merge back). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: every campaign meets "Verify" (X1 after owner approval). Report in plain words.
```

## Prompt — Lane 7 QUALITY & VERDICTS

```text
You are Lane 7 — QUALITY & VERDICTS — of the SpaceFace master plan.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

THE PROBLEM YOU OWN: the process that keeps the game janky. Agents leave 90%-correct systems
configured wrong; finished work sits switched off behind self-imposed bars; placeholders are never
tuned; ~1.27 M lines, 261 systems, ~4,850 test files and 774 npm scripts carry breadth without
depth; ~365 tests pin source text and block refactors; nobody walks the whole game. And one big
open question: should the game be ported to a native engine?

READ FIRST, ALL OF EACH: design/program/finish/MASTER_PLAN.md Part 0, Part 5 (Q1–Q5) and campaign
E8 in Part 1; design/program/finish/MASTER_LANES.md; design/program/finish/swarm/AUDIT.md (the model
for a configuration audit: setting, why it was set, proposed value, risk, measure);
design/FEEL_CONTRACT.md §A; design/program/REPORT_CARD.md; AGENTS.md; test/AGENTS.md;
scripts/AGENTS.md; design/program/NOW.md.

YOUR CAMPAIGNS, IN ORDER:
1. Q1 the switched-off and placeholder census — every feature flag, opt-in, placeholder comment,
   self-imposed bar and disabled built feature in src/, each with a decision (turn on / tune /
   delete / keep off and why) and the evidence. File each decision to the owning lane in NOW.md;
   execute the ones in no lane's files yourself.
2. Q3 the taste gate — one rubric and a short review procedure every lane uses for visible changes.
3. Q5 tests that protect the game — fast / route / reference tiers; a tool that versions determinism
   references in one command; convert or delete source-text pin tests.
4. Q2 route walkers — a written route list (new game → first hour, each act, Swarm 1–15, every
   station screen, save/continue, settings); walk each on the laptop with the Browser pane VISIBLE;
   file only material defects with a capture to the owning lane. Repeat after each wave lands.
5. Q4 the razor — delete dead systems, unreachable content, duplicate mechanisms and their tests
   (coordinate with owning lanes; Lane 3 of the Finish Program already owns doc archiving).
6. E8 the native-engine verdict — ONLY after Lane 1's E1 and Lane 2's E2 land: rebuild Swarm waves
   1–10 (one arena, three enemy types, five powers, the Line, Brood) in Bevy (or Godot if you argue
   it's cheaper) in a separate folder, from the same data files, in ≤ 3 sessions. Kill criteria,
   fixed now: recommend the port only if frame interval on this laptop is ≥ 3× better than the fixed
   web build in the same scene, feel reaches parity in a blind side-by-side, and the content-port
   estimate is cheaper than finishing the engine lanes. Write the verdict either way.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/<ID>/DIAGNOSIS.md. You
mostly decide and hand off — edit another lane's files only with its agreement in NOW.md. A
"keep off" decision needs a measured reason. Keep campaigns/<ID>/STATUS.md current. Shared
checkout: claim paths in NOW.md; git add/commit exact paths only; never -A, reset, stash, clean,
rebase or force-push; publish only your paths when local master carries others' unpublished
commits (temp GIT_INDEX_FILE, read-tree origin/master, ls-tree HEAD -- <paths> | update-index
--index-info, write-tree, commit-tree -p origin/master, push, merge back). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: every campaign meets "Verify"; E8's verdict written. Report in plain words — done / not
done, what changed for the player, and the port verdict in one sentence.
```
