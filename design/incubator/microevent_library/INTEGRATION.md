<!-- LIFETIME: DURABLE -->
# Microevent library — integration notes (DATA ONLY, imported by nothing)

Additive design data for the low-interference world-depth brief: **58 ambient events**
(10 s – 2 min) that make the existing role/job/world systems produce visible situations.
Nothing in `src/**` references this tree; wiring belongs to a later integration task.

## The tree

- `catalog/*.json` — the machine-readable source of truth, one file per category,
  validated against `microevent.schema.json` (14 required fields per event, controlled
  vocabularies for roles/systems/signals drawn from the 2026-08-08 audit).
- `build-microevent-bible.mjs` — validator + doc generator. Run directly with node;
  deliberately NOT in package.json. Same catalog → byte-identical docs.
- `EVENT_BIBLE.md` / `DEPENDENCY_MAP.md` / `TIERS.md` — GENERATED. Edit the catalog,
  rerun the script; never edit these by hand.
- `SYSTEMS_AUDIT.md` — hand-written. Resolves every live `systems` id to real code in
  `src/**`, so the dependency map's "this already exists" claim is verified rather
  than asserted. Re-run it before the integration task; `src/**` moves underneath
  the catalog.

## What the integration task will need (in order)

1. **A choreography runner** — the one genuinely new piece. A small system that owns
   `state.ambientEvents`: picks an event whose start conditions hold, binds
   participants from live traffic (never spawning dedicated actors when a matching
   idle hull exists), steps timed phases, retargets waypoints, and releases actors
   back to their ordinary cycles on completion/interrupt/fallback. Every phase's
   *visible* column maps to signals and steering that already exist. Follow the
   UPDATE_ORDER + golden-safety recipe (47a curated-subset ruling) — the runner must
   stay out of `sf-sim`'s curated system list exactly like `traffic`/`npcJobsRuntime`.
2. **The first15 tier** needs only that runner plus existing systems.
3. **The next20 tier** additions are named per event in TIERS.md: new TRAFFIC_ROLES
   entries (tanker/tug/customs/sweeper run degraded on existing hulls), the
   parented-drift carry link (tow/push; the Massline tether proves the read), a
   manifest-transfer helper, spawn-on-impact props.
4. **Blocked events** each name their missing mechanic (`future.*` in the dependency
   map): lane-graph closures, structure weapons, gravity/weather volumes, drone
   swarms. Do not build these for the events' sake; the events are ready when the
   mechanics arrive.

## Composability is deliberate

Events chain by aftermath: rich seam → crowding → collision → disabled → recovery OR
tow-theft; probe line → anomaly weighting; spot closure → toll siting; battlefield →
muster → salvage economy. The ten-minute-watch acceptance comes from these chains plus
category variety, not from any single event.

## Donor packs

`donor.*` systems mark OPTIONAL dressing from `assets/incubator/npc_activity_pack`
(hulls), `everyday_space_kit` (props), and `lane_furniture` (markers). Every event
runs without them on live hulls/props; the donors upgrade legibility when promoted.

## The ten-minute watch — where the acceptance actually rests

The brief's bar is: watch one busy region for ten minutes and repeatedly see
different believable things, without accepting a mission. Catalog arithmetic
(counted from `catalog/*.json`, not estimated):

- **53 runnable events** (58 minus the 5 blocked), spread across all eight
  categories — 8 work, 8 logistics, 8 crime, 8 accident, 7 civilian, 6 law,
  4 construction, 4 environmental.
- **Mean window 58–112 s**; shortest 15 s, longest 180 s. A 600 s watch is
  therefore roughly **seven sequential slots per concurrent track**.
- The `first15` tier alone is 15 events over five categories (work, logistics,
  law, crime, accident) with a 52–104 s mean window.

So seven draws come from a pool of 15 at the very first milestone, and from 53
once the backlog lands. **Repetition inside ten minutes is not a catalog problem
at any tier** — even the day-one subset cannot exhaust itself in the window.

That relocates the risk, and this is the part worth carrying into the runner's
design: the limiting factor is **concurrency and gating, not content**.

- With one event live at a time, ten minutes shows ~7 situations — believable but
  sparse for a "busy region". Target **2–3 concurrent** events in a populated
  sector, which is what makes the region read as busy rather than staged.
- Without a **per-event-id cooldown**, a cheap event whose start conditions hold
  continuously (`ev_patrol_shift_change`, `ev_liner_schedule_pass`) will win the
  draw repeatedly and become the wallpaper the brief is trying to avoid. Cooldown
  by id, not by category.
- Bias selection toward events whose participants are **already live** in the
  region. An event that needs a spawn to start is the one most likely to fizzle,
  and fizzles are invisible — they read to the player as an empty sector.

The variety argument is chains, not just count: rich seam → crowding → collision →
disabled → recovery OR tow-theft. A chain spends several slots on causally linked
situations, which reads as one region having a bad afternoon rather than seven
unrelated vignettes. Prefer chain continuation over a fresh draw when both are
eligible.

Note what this section is: a projection from authored durations and tier counts.
It bounds the content side of the acceptance. The runner side — that phases
actually land at the authored timings against live traffic — can only be measured
once the choreography runner exists.
