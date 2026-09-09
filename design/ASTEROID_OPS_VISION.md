# Asteroid Ops — Vision & Groundwork

**Status:** governing vision doc, 2026-07-17. Extends `design/ASTEROID_SITES_BRIEF.md` (the
shipped contact-ring feature) into the full automation-strategy arc. Companion doc:
`design/ASTEROID_OPS_UI_BRIEF.md` (the operator console that hosts all of this — its visual
voice is void as of 2026-08-20; see below).

**2026-08-20 owner design session addendum** (presentation + framing; the law stack here
stands): the refactor's binding design is
[`ASTEROID_WORKS_DESIGN_LAW.md`](./ASTEROID_WORKS_DESIGN_LAW.md). Three deltas to this file:
**(1) Fog of war is removed** — "survey fog-of-war" below and Wave 1's "survey reveals
extent" are superseded; every cell's material is visible from the first frame, and
prospecting depth comes from geometry (law 2/formations), not information hiding.
**(2) Wave 0's "reserves visible slots for every later wave" is void** — instruments mount
only when they first have data (empty reserved bays are what the owner rejected).
**(3) The economic frame is sharpened into the money ladder** — laser skim < drill runs <
farming < refining < drone export, each a strictly higher income slope, with endgame ship
prices tuned to meet the drone-field curve; imports become a designed complement
(generation guarantees every asteroid lacks something; buildings cost a local majority +
an imported minority hauled in the player's hull, later by two-way drones).

---

## North star

> The drill screen is a **machine-design surface**. The player decides how much of an asteroid
> to consume, how much to preserve, and what kind of productive organ to grow inside it.
> A field of asteroids, worked well, becomes a settlement.

This is not "a mining minigame with upgrades." It is the game's industry layer, built from a
small number of spatial laws that compose into deep strategy — Mindustry's satisfaction,
StarCraft's legibility, none of either's simulation weight.

## What is already true (shipped, uncommitted 2026-07-17)

The foundation is real and verified — see `ASTEROID_SITES_BRIEF.md` for detail:

- 28×45 cell field; drive/bore rover; survey fog-of-war; gas pockets as sealed hazards.
- **The contact ring**: every machine reads its 8 neighbors; hollowing a neighbor destroys
  that contact **permanently**. This is the sacred primitive. Nothing may compensate it away.
- Six machines (`data/sites.js`): Massline Core / Extractor / Gas Tap / Refinery / Fabricator
  / Cargo Port. Power cables + material lanes as auto-connecting overlay networks
  (`systems/siteLogistics.js` connected components; the lane *is* the storage).
- Aggregate flow economics (`systems/siteProduction.js`): output = base × geology ×
  min(power, input, export). No per-item simulation.
- **The Core is persistence**: unanchored claims die with the sector; an anchored asteroid
  survives, produces on ship time, and launches courier pods that bank credits.
- Real 3D playfield (`ui/asteroid/asteroidRenderer3d.js`) carved live from the sim.

## The law stack

Each law is one sentence a player can hold. Strategy comes from their intersection, not from
any law being complicated. Laws 1–2, 5, 7–8 are shipped; 3, 4, 6 are the growth.

1. **Contact ring** — a machine feeds on the 8 cells around it; a hollowed cell feeds nothing,
   forever.
2. **Two extraction verbs** — the drill *consumes* geology (instant, one-time, destructive,
   makes floor); machines *work* geology (slow, forever, preserving). Every valuable cell asks:
   spend it now or farm it forever.
3. **Formations** *(new, Wave 1)* — contiguous same-material cells form a named body
   ("Iron seam · 9 cells", "Gas pocket · 4 cells"). A machine contact is worth more when the
   cell belongs to a larger **intact** formation; drilling any cell of a seam shrinks — or
   splits — it permanently. Consequence: prospecting becomes *reading* the rock, and drilling
   becomes *surgery* (enter a seam from its dead end; never sever the middle). Implementation
   is the connected-components pass we already run for networks, over geology instead.
4. **Thermal mass** *(new, Wave 2)* — machines shed heat only into solid contact rock (rock is
   the heatsink) or into dedicated cooling; an overheated machine throttles, then faults.
   Consequence: the fully-hollow factory asteroid stops being a free win — dense machine halls
   are an engineering achievement (radiators, coolant runs to gas pockets), while a
   conservative mine runs cool by nature. Heat is already the antagonist of the hand drill;
   this makes it the antagonist of industry too.
5. **Aggregates, not items** — networks carry rates and buffers, never individual chunks.
   Belts animate; the economy is arithmetic. (Per-edge flow solving only if playtests prove
   the topology lacks teeth.)
6. **Signature** *(new, Wave 3)* — production and heat emit signature; signature × sector
   danger = pressure on courier routes and, eventually, the site itself. Answers: escorts,
   armor tiers, turret pylons, or *quiet running* (deliberately throttling output to stay
   dark). Reuses the automation system's existing route-risk math; statistical when absent,
   materialized pirates when the player is present.
7. **Persistence is physical** — no claim without a Core; no output without a cargo interface.
   The mining laser never collects refined goods. Engineered systems export through engineered
   ports (pods now; shuttles, freighters, launch drivers later).
8. **Roles emerge from geometry** — resource / energy / processing / factory asteroids are
   consequences of laws 1–4, never a class the player picks from a menu.

## The player arc

Each stage automates the previous stage's manual verb and opens a new design verb.

| Stage | You spend attention on | What got automated |
| --- | --- | --- |
| **Prospector** | reading rock, surgical drilling, hand-carrying ore | — |
| **Foreman** | first machines, contact-ring placement, unanchored risk | extraction (per cell) |
| **Engineer** | networks, thermal budgets, policies, export mix | logistics, collection |
| **Magnate** | cluster specialization, routes, defense, station assembly | whole asteroids |

The end of the arc is the §8 north star from the sites brief: a cluster with enough material,
power, drone labor and command capacity **assembles a station in the flight world** — the
interior game visibly changes the exterior universe.

## Machine roster growth

Current six stay the spine. Additions land with their law, never before it:

- **Wave 2 (thermal):** Radiator Mast (surface-cell cooling), Coolant Loop (pipes heat to a
  gas pocket), Battery Bank (buffer + brownout smoothing).
- **Wave 3 (logistics/defense):** Shuttle Dock (reusable two-way drones), Turret Pylon,
  Sensor Mast (route risk reduction), Power Transmitter (wireless radius — expensive,
  research-gated; exists to let players *preserve* geology instead of drilling cable runs).
- **Wave 4 (cluster):** Transfer Beam (asteroid→asteroid goods/power), Launch Driver (bulk
  export artillery), Assembly Frame (station construction anchor).

## The cut list (standing rulings)

- **No structural integrity / cave-in simulation.** The contact ring already prices
  over-excavation. A second hidden geometry tax would punish without teaching.
- **No per-item belt simulation.** Aggregate flow with visible animation.
- **No manual junction/corner sprites.** Connectivity masks auto-tile; the computer does
  corners.
- **No mining-laser collection of refined output** (law 7).
- **No in-asteroid drone pathing.** Interior logistics are the lane network; exterior couriers
  are statistical with witnessed materialization.
- **"Dirt" stays dead.** It is silicate matrix / regolith everywhere a player can read it —
  low-value feedstock (glass, ceramic, silicon → electronics), never worthless, never "dirt".

## Wave plan

Groundwork rule: every wave keeps the golden telemetry untouched (sf-sim curated list), ships
with its own check script + test file, and proves itself with headed-Chrome captures of the
real screen. The UI (Wave 0) reserves visible slots for every later wave so features land in
prepared sockets, not bolted-on panels.

- **Wave 0 — Operator console (this build).** `ASTEROID_OPS_UI_BRIEF.md`. The StarCraft-shaped
  frame: top status strip, full-bleed viewport with manifest rail, bottom command deck
  (site systems / context+contact-ring instrument / command card with printed hotkeys).
  Gritty-industrial render pass on the rock. No sim changes.
- **Wave 1 — Formations & prospecting.** Formation detection + naming in the sim; survey
  reveals extent; inspector and a geology overlay speak formation language ("severing this
  cell splits Iron seam α: 9 → 4+4"); extractor contact values scale sublinearly with intact
  size. The moment-to-moment drill loop becomes strategic without a single new mechanic
  elsewhere.
- **Wave 2 — Thermal.** Heat per machine, rock-as-heatsink, cooling machines, throttle/fault
  states, thermal overlay in the deck's overlay row.
- **Wave 3 — Logistics tiers & signature.** Shuttle tier above pods, route ledger receipts,
  signature model + defense/quiet-running answers.
- **Wave 4 — Cluster & station assembly.** Specialization across asteroids, transfer
  structures, the visible station build.

## Verification stance

- Sim laws: `test/asteroid-sites.test.mjs` grows a section per wave (formation splitting,
  heat throttle determinism, signature math) — deterministic, seeded, no DOM.
- Screen: `scripts/capture-drill-3d.mjs` pattern — headed system Chrome against the real
  game, screenshots as the review artifact, zero-page-error gate.
- The pre-existing reds (`check:drill-smooth`, `check-gameplay-core` combat-lane packet
  assert) are documented in memory and are not gates for this track.
