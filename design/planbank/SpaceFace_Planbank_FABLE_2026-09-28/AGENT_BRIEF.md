# AGENT BRIEF — the Fable task-bank pass (2026-09-28)

You are the strongest planning agent this repo has. The owner has given you one job, and it is a
creative job: **read this game as it exists today and lay out a few hundred real, pre-considered,
ready-to-execute development tasks** that carry it the rest of the way to a performant,
professional, A-list game that is fun to play and has mature features.

This brief is your entire assignment. Read it fully before doing anything else.

---

## 0. Why you, and the failure you are preventing

The dispatch queue (`program-queue.json`) is drained, the INFERENCE catalog
(`design/program/INFERENCE_IDEAS.md`) has no OPEN lines, and weaker agents are now *inventing work
on the fly* when thrown at the game. The owner's judgment: the best results come from the best
creativity applied to *what to do*, before execution. If weak agents have to brainstorm the task
itself, bad ideas poison the repo all through, and the good game inside becomes hard to find.

So your output must be **the creative work, finished**: every task you write is already considered —
the alternatives were weighed, the mechanism chosen, the files named, the done-check falsifiable,
the failure modes named. An executing agent should never have to invent anything, only build. A
task a weak agent could take and complete *without design judgment* is a good task. A task that
says "improve the economy" is a failure.

Quality over quantity — but quantity is the assignment: the goal is **at least 300 distinct new
tasks** (roughly half grunt-sized inference lines, half full plan packets). Never pad: a paraphrase
of another task is worse than a hole. Distinct mechanism or nothing.

## 1. What this game is (the dream you are planning toward)

SpaceFace is a Three.js browser/Electron top-down 2.5D space game: fly, mine, trade, fight,
upgrade, build passive income in a living physical universe. Flat `GameState`, event bus, registry
of systems on a 60 Hz fixed-timestep sim decoupled from rendering. Browser and Electron run the
same game route.

The product authority is [`design/VISION.md`](../../../design/VISION.md) — **read all of it before
planning anything.** Its core, compressed:

- The fantasy: *I understand how this little universe moves, and I can use that understanding to do
  ridiculous things.* Physical agency × a living local world. Neither half is enough alone.
- The **Massline** (tether) is the signature mechanic: it changes the relationship between two
  physical bodies. Swing, tow, snare, steal, sling, turn enemies into ammunition.
- Combat is **delightfully abusive physics**, not HP-bar dogfighting. Light enemies are almost
  ammunition; heavy enemies are moving terrain; specialists threaten the player's plan.
- The world was already moving before you arrived. Every actor has the sentence *I am here because
  ______* and *if something changes, I will ______*. The player is not the center of the universe.
- Failure creates content: failure mutates the situation (wreckage, restitution, escapes, pursuit,
  changed prices) instead of "MISSION FAILED — RELOAD?"
- Progression means *what can I do now?* — physical agency, not bigger numbers. The ship becomes
  *"my fucking ship"* through scars, history, recognition.
- Deep world, arcade hands. Colorful industrial-arcade energy against dark space. Everything
  important has a silhouette. Spectacle **with** causality.
- Places are ways of life, not palette swaps. Ordinary life makes disruption legible. The game
  must breathe: work, travel, curiosity, tension, violence, aftermath, quiet.
- Never collapse into: normal shooter with a grapple, HP-bar dogfights, empire spreadsheet, loot
  ARPG, dialogue-heavy RPG, collection of minigames, particle showcase over boring events.

The owner's goal sentence (2026-09-03): *a super-fun space adventure game with fast-paced,
physics-centric, arcade-style combat that plays optimally in swarm mode, and is super interesting
and mentally stimulating in adventure mode because of its advanced customization and economic
features, as well as the storyline; with a frontend polished massively, everything brought into the
newest version and optimized.*

Owner guidance for THIS pass (2026-09-28): the game already has unique character. Where it is
weaker than any modern A-list game, matching that maturity (depth, polish, options, robustness,
content richness) is valid work — imitate the A-list's *completeness* until the game's own character
carries it further. The targets: **performant, professional, A-list, fun, mature features.** The
owner will not enumerate the weak points — that enumeration is YOUR job. It is evident on
inspection.

## 2. Repo facts you can trust (verified 2026-09-28)

- ~185 system files in `src/systems/`, ~166 data files in `src/data/` (including **77 authored
  encounters** in `src/data/encounters/`), ~318 files under `src/ui/`, ~272 under `src/render/`.
- ~2,120 test files in `test/` and `tests/` — **the test names are a feature inventory**; mine them.
- ~832 scripts in `scripts/` — probes, benches, look-shooters (`fleet-look`, `flight-look`,
  `ui-bench`, `probe-frame-solid`), generators. Mine names for what already exists.
- 10 hand-authored sectors in `src/data/sectors.js` plus generated/derived space; stations, lanes,
  POIs, unique wrecks, claimable bodies, moral traps, side events, one-offs.
- Live selection: flight = `src/systems/flightV3.js` + `src/core/flight/`; AI = `src/systems/tacticalAI.js`
  + `src/ai/`; physics = `rapier-dynamic` via the physics authority. Compatibility files stay
  imported and tested.
- Node v24 is available. Focused tests: `node --test test/<file>.mjs`. `rg` (ripgrep) is available
  and is the fast way to find owners.

## 3. Current program state — what exists, what's claimed, what's parked

**Read these before planning** (in this order):

1. [`AGENTS.md`](../../../AGENTS.md) — the working agreement and hard contracts (§6 especially).
2. [`build_map.md`](../../../build_map.md) — §1 (procedure + craft floors §1.3), §1C (the numbered
   board — read every open row so you never restate one), §22 (measured gap list), §23
   (superpower campaigns), §25 (A-list demo program), §27 (the finish lanes).
3. [`design/program/FINISH_LANES.md`](../../program/FINISH_LANES.md) — the nine lanes (THE MACHINE,
   THE HAND, THE FIGHT, THE WORLD, THE LONG GAME, THE PICTURE, THE INSTRUMENT, THE EAR, THE
   RELEASE). Your tasks should be routable to a lane; name it.
4. [`design/planbank/SpaceFace_Planbank_300/INDEX.md`](../SpaceFace_Planbank_300/INDEX.md) —
   **300 already-written packets (SF-001…SF-300)** produced by an external assessment, plus
   [`TRIAGE_2026-09-28.md`](../SpaceFace_Planbank_300/TRIAGE_2026-09-28.md) (verdicts per packet)
   and [`OVERLAP_MAP.md`](../SpaceFace_Planbank_300/OVERLAP_MAP.md) (shared seams). **Your bank
   must not restate these.** Adjacent is fine — cite the neighbor ("extends SF-136", "composes
   after PB-SLICE-E", "the offensive half of the landed defensive optic work") — duplicate is not.
5. [`design/program/INFERENCE_IDEAS.md`](../../program/INFERENCE_IDEAS.md) — the drained catalog
   whose format you will extend (all lines SHIPPED; read a few dozen to internalize the voice).
6. [`design/program/DEMO_READINESS_2026-09-20.md`](../../program/DEMO_READINESS_2026-09-20.md) §6 —
   the open defect ledger. Do not restate an open ledger row as a new task; a task may *subsume*
   one only if it visibly does more.
7. [`design/FEEL_CONTRACT.md`](../../../design/FEEL_CONTRACT.md) — the feel bars.
8. [`docs/MODULE_MAP.md`](../../../docs/MODULE_MAP.md), [`docs/ORIENTATION.md`](../../../docs/ORIENTATION.md)
   — module territory.
9. `git log --oneline -150` — what actually landed recently (themes: kinematics hardening,
   economy balance, seam closures, encounter chains, admission pacing).
10. `ls design/program/roadmap/receipts/ | tail -80` — recent completion receipts tell you what is
    freshly done and therefore NOT a gap.

**Live claims you must respect in routing (never in mechanism):**

- **ORRERY frontend overhaul lane** owns the *redesign* of everything under `src/ui/**` and
  `styles/**` (owner, 2026-09-26). Task-needed functional frontend edits are allowed for anyone,
  but a task whose substance is *visual/UI redesign* is that lane's. When your task is pure UI,
  mark `routing: ORRERY lane`. Prefer designing the **sim half** (state, events, derived data the
  UI binds to) — those are landable by anyone.
- **devin-graphics** claims the Forge/asset side (`tools/blender/forge/**`, `assets/ships/**`,
  render package manifests). Asset-authoring tasks mark `routing: graphics lane`.
- **Pre-release preparation is parked** (owner, 2026-09-27): no store shots, trailers, demo
  packaging, crash reporting, funnel, signoff leaves. The goal is a finished game to play, not a
  release. Do not write pre-release tasks.
- The old board's PB rows (§1C group G) dispatch the SF-001…300 bank; many are OPEN. Do not
  re-dispatch their content.

## 4. The hard laws every task must respect (these are what "poisoned" tasks violate)

A task that encodes a violation of these is worse than no task. Bake the relevant guardrail into
each task's **Do not** field.

1. **Never add drag.** Never clamp earned momentum, never give NPCs gyros/transform writes/instant
   counter-thrust, never scale hit points to fake difficulty. Mass and momentum decide.
2. **Never answer feel with content.** More enemies/ships/missions never close a feel gap; camera
   shake and particles never close an event.
3. **Feel claims close on numbers**: a fixed-seed scenario/bench output, or a focused test, plus
   reading the live code path. Captures/stills are not gates.
4. **Single writers:** economy→credits, factions→reputation/sector ownership, cargo→cargo,
   ships→derived stats, heat→WANTED heat. Everything else emits intents/events through the bus.
5. **Determinism:** sim uses `state.rng` and `state.simTime`, never ambient randomness or wall
   time. Every done-check names a seed (default 4242). Never edit a golden (`test/*.expected.json`)
   to pass.
6. **One game path:** browser, Electron, probes, packaged builds share gameplay/assets/entrypoint.
   No flag-only features, no parallel registries, no second physics.
7. **The default route is the only route.** A feature unreachable without a flag/URL/debug key is
   not done. Wire features through the real route.
8. **Surface before invent.** Prefer connecting/wiring what already computes over new systems;
   three of this game's biggest historical gaps were missing listeners, not missing systems.
9. **Consequences or it is thin.** A player-facing feature produces at least two further things
   (a motion, a reaction, a receipt someone consumes). Controls/confirmations/instruments are
   exempt — they do their one thing well.
10. **Visual craft laws:** judge models at the gameplay camera (`scripts/fleet-look.mjs`,
    `scripts/flight-look.mjs`); a camera-facing soft square/disc is never a designed object
    (distant background stars excepted); VFX obeys `design/VFX_TECHNIQUE_STANDARD.md`; ship bodies
    come from Forge (`tools/blender/forge/FORGE.md`); 2D surfaces obey the ORRERY direction.
11. **Performance is part of design:** optimize algorithms, allocation, batching, cadence, culling,
    residency, frame pacing — never pass gates by removing authored visuals or lowering default
    quality.
12. **Accessibility is not optional:** input reachability, reduced-motion/flash behavior,
    legibility, contrast survive every change.
13. **No new dependencies casually.** Outside resources that would make the game better are named
    in [`docs/OPEN_SOURCE_INTAKE.md`](../../../docs/OPEN_SOURCE_INTAKE.md) §0 — a task may name
    one from that list when it is the honest fix; a task never says "find a library".
14. **Never ask the owner to adjudicate technical risk.** Tasks decide.

## 5. Coverage requirement — where the depth must go

The bank must cover the whole game. The owner's frame: flesh out and polish **existing pieces**
first, add new pieces only where they would make it better. For each area below, the bank (lines +
packets combined) must contain at least 3 tasks, and at least one must be a packet-scale slice:

**The hands:** flight feel and assisted modes, the Massline (throw/tow/snare/salvage), fields
(gravity/well/optic), input truth and rebinding, stunts and the trick grammar, onboarding/teaching
of every verb. **The fight:** weapons and ordnance readability, enemy archetypes as physical
problems, specialist counterplay, swarm/Crucible wave craft, arenas, the draft, kill legibility,
wrecks-as-terrain. **The world:** sector identity and rhythm, NPC jobs and traffic chains,
ordinary life, law/heat/consequences, factions that act, places with verbs, discovery/scanning,
unique wrecks and one-offs, ambient events with evidence. **The long game:** economy you can read,
trade and market depth, industry/automation authorship, progression and build identity, fitting
with consequences, the story spine and endings, endgame pulls, the persistent personal ship.
**Presentation:** VFX grammar, audio identity (the CV-EAR signature: continuous voices, silence at
0), camera, readability at zoom, the picture on the glass (non-UI tasks; UI marks ORRERY routing).
**The machine:** boot, admission, residency, hitch death, frame pacing, memory, determinism guard.
**Professionalism:** save robustness and continuity, options/settings depth, accessibility,
localization readiness, failure recovery, input remap, statistics/codex-style receipts, QA-shaped
adversarial tests. Mature-feature parity ideas (only where they fit the vision): difficulty that is
physical not HP-scaled, gamepad depth, photo mode depth, replay/clips depth, mission-archetype
variety (escort/rescue/recover/race/investigate/heist/defend), dynamic world events with news-like
evidence, ship recognition/lore receipts.

Before finalizing coverage, do your own inspection pass and add areas this list missed — your
found gaps are the most valuable part of the bank. Mine: `ls src/systems/`, `ls src/data/`,
`ls src/ui/screens/ 2>/dev/null`, `ls test/ | head -400`, `ls scripts/`, the receipts folder, and
read the heads of the ~40 biggest owners. Look for: dead seams (events emitted with no listener,
data authored with no consumer), authored content the route never shows, systems with one instance
where the mechanism supports many, verbs with no teaching, numbers with no readout, states with no
save, sounds with no event, events with no sound.

## 6. Output contract — exactly what you produce

Write everything under `design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/` (this folder).
**You edit nothing else in the repository.** All paths in your output are repo-relative plain
paths (no GitHub URLs — you are in the repo; verify as you go).

### 6.1 Inference lines — `INFERENCE_LINES.md`

Ready-to-append rows for `design/program/INFERENCE_IDEAS.md`. Exact format (pipe table, one line
per task):

```markdown
## <GROUP>

| Id | Player-visible change | Paths | Done | Do not | Status |
|---|---|---|---|---|---|
| VERB-14 | The chaff pod you pop actually blinds the missile that is already locked, for the seeker's own lock time | `src/systems/ordnance.js`, `src/systems/missiles.js` | On seed 4242 a popped chaff makes the inbound seeker re-acquire or miss, and a focused test pins it | Add a new countermeasure system. Retune missile damage | OPEN |
```

Rules: continue existing groups' numbering (PIC-13+, VERB-14+, WORLD-21+, INST-17+; TOOL is
closed — do not extend it). You may add NEW groups with fresh 2–6 letter prefixes (e.g. FIGHT,
ECON, STORY, EAR, PERF, SAVE, TEACH) — a new group needs ≥5 lines to exist. The *player-visible
change* is one sentence in player words. *Paths* names 1–3 exact existing files. *Done* is
falsifiable on a fixed seed or by a named focused test, checked against the live owner. *Do not*
is the guardrail that keeps a weak agent from inventing around it. Scope: one sitting, one
mechanism, minutes-to-hours. Target: **≥140 lines.**

### 6.2 Plan packets — `plans/<NN-domain>/FB-NNN-<slug>.md`

Full packets, IDs **FB-001…FB-150+** (never collide with SF-*). Domains mirror the 300-bank
naming where useful (`01-hand`, `02-massline`, …) but you may define your own domain folders —
just be consistent. Compact format, ~30–50 lines each:

```markdown
# FB-041 — The patrol that actually patrols (a sector's law has a route, not a radius)

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: traffic.js, seam: lawResponse.js
**Write-set:** `src/systems/traffic.js`, `src/systems/lawResponse.js`, `src/data/sectors.js`, `test/fb-041-patrol-route.test.mjs`

## The gap
Today a patrol is presence inside a radius; the vision sentence "a patrol occasionally passes
through" wants a route with a rhythm the player can learn, intercept, or avoid. A stranger
cannot currently plan around law in a sector.

## Why this direction
Patrol density (more ships) was rejected — feel is not content. A patrol AI skill tree was
rejected —surface-before-invent: lanes and schedules already exist in traffic.js; the missing
piece is binding law response to the patrol's actual route position.

## Mechanism
- Patrol contacts follow sector-authored loop/waypoint routes (extend the existing lane contact
  stamping, do not add a second traffic system).
- WANTED response time derives from the nearest patrol's route position, not sector center.
- Intercepts spawn from the patrol body itself (the ship you saw is the ship that answers).

## Done when
Seed 4242: a crime committed 3000 WU from the patrol's current route position answers measurably
later than the same crime on the route; focused test `test/fb-041-patrol-route.test.mjs` pins
both numbers; the patrol is visible on the chart as a moving law presence.

## Do not
Raise enemyDensity. Give patrols gyros or instant turns. Make law omniscient.

## Focus test starting points
- `test/lane-contacts.test.mjs`
- `test/heat-wanted.test.mjs` (locate the real nearest suites with rg and name what you verified)
```

Every field is mandatory except that a CHECK-kind packet (reproduce-before-build) replaces
Mechanism with a Reproduction gate. Ground every file/symbol you name — open it first. Target:
**≥140 packets**, each a coherent slice a strong agent could own for a session or two.

### 6.3 The catalog and routing aids (same folder)

- `INDEX.md` — one row per FB packet: id, title, lane, kind, seam tags, one-line done digest,
  routing (open / ORRERY lane / graphics lane / parked-expansion).
- `OVERLAP_MAP.md` — which FB packets serialize on shared seams (mirror the 300-bank's style).
- `FIRST_BATCHES.md` — your recommended first 10 batches (which packets/lines to dispatch first
  and why, considering dependencies and seam serialization).
- `FOUND_GAPS.md` — the honest findings list from your inspection: dead seams, unwired data,
  untaught verbs, missing receipts — everything you found that did not become a task, and why.
  This is evidence, not a queue; keep it tight.
- `SELF_AUDIT.md` — the audit run + results (see §7).

### 6.4 Board rows proposal — `BOARD_ROWS.md`

The rows you propose adding to `build_map.md` §1C group G. Format exactly:

```markdown
| 159 | FB-041+FB-052 | Patrol routes bind law response + chart shows moving law presence | PB | OPEN — seam traffic.js |
```

Batch packets that must share a sitting (same seam / one write-set) into one row; rows carry the
next free numbers after the current board's highest (check §1C; today that is 158 — start at 159).

## 7. Self-audit (mandatory before you finish)

Write a small Node script in this folder (`tools/audit.mjs` is fine — this folder only) that:

1. Extracts every repo path referenced in `INFERENCE_LINES.md`, `plans/**`, `INDEX.md`,
   `BOARD_ROWS.md` and checks each exists on disk (allow the exception of *new* files the task
   itself creates, e.g. `test/fb-*.test.mjs` — those must match the `fb-`/`FB-` prefix rule).
2. Checks FB IDs are unique and sequential; inference IDs continue the existing numbering with no
   collisions (read the live `INFERENCE_IDEAS.md` for taken IDs).
3. Flags any packet/line whose title or done-check is a near-duplicate of another in this bank.

Fix everything it flags, then record the final pass output in `SELF_AUDIT.md` with counts per
domain. If a check fails against live code (a file you named does not exist, a symbol you cited
isn't there), fix the task — the executing agent must never discover your fiction.

## 8. Process constraints

- **You are read-only outside this folder.** The working tree carries live foreign hunks (check
  `git status --short`); read the working tree as truth, never edit or revert it. No commits, no
  branches, no pushes, no `npm install`, no servers, no long captures. Focused `node --test` runs
  are allowed when a CHECK claim needs grounding, but this is a planning session: budget your
  time for reading and writing, not verification rituals.
- Do not implement any task. Do not modify `src/`, `test/`, `scripts/`, `styles/`, or any policy
  file. Your only writes are inside
  `design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/`.
- No web access needed or expected; everything you need is in the repo.

## 9. Definition of done for this session

1. `INFERENCE_LINES.md` with ≥140 quality lines, groups well-formed.
2. ≥140 packet files under `plans/` plus `INDEX.md`, `OVERLAP_MAP.md`, `FIRST_BATCHES.md`,
   `FOUND_GAPS.md`, `BOARD_ROWS.md`, `SELF_AUDIT.md`.
3. Audit script passes; every named path exists; IDs clean; no internal near-duplicates.
4. Coverage check: every area in §5 has ≥3 tasks, ≥1 packet-scale.
5. Final message: a short summary — counts per domain, the ten highest-leverage tasks in your
   judgment, and the three weakest areas of the game you found. Plain words.

Then stop. Do not integrate anything into live queue files — the dispatcher session that launched
you performs the integration.
