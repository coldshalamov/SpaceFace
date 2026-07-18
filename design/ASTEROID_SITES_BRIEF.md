# Asteroid Sites — Design Brief (working, not final)

> **Routing note (2026-07-18):** this preserves the original contact-ring thesis and early design
> exploration; it is not current status or build order. The active mechanics roadmap is
> `design/ASTEROID_OPS_VISION.md`, the implemented shell contract is `design/ASTEROID_OPS_UI_BRIEF.md`,
> and the earlier “stay 2D” assumption in this brief has been superseded by the shipped 3D playfield.

> Status: brainstorm capture. The strong spine is locked; most everything else is
> open latitude for whoever implements. Treat examples as *e.g.*, not *you must*.
> Find identity. Don't literal-copy the inspirations named at the bottom.

## 0. The thesis in one line

The drilling minigame becomes a **machine-design surface**: you sculpt negative
space inside an asteroid to grow a productive organ. Preserve geological contact
and your machines run strong; hollow everything and you trade permanent yield for
buildable floor. Drilling stops being *hold beam, number goes up* and becomes an
act of authorship — deciding how much of a rock to consume and how much to keep.

The line to keep in your head the whole build:

> **A machine-design surface where the player decides how much of an asteroid to
> consume, how much to preserve, and what kind of productive organ to grow
> inside it.**

---

## 1. The core primitive — treat this as sacred

Every machine occupies one hollowed tile. Around it is an 8-cell contact ring.
One of those neighbors must already be hollow (that's the access lane the rover
used to reach it). That leaves a **theoretical maximum of 7 solid contact cells**.

```
R R R
R M R      M = machine, A = hollow access, R = solid asteroid material
R A R
```

Each surrounding solid cell contributes according to its material:

- regolith / silicate matrix → bulk ceramic, glass, silicon feedstock
- basalt / dense matrix → general mineral mass
- metallic ore → metal extraction
- gas pocket → power, volatiles, coolant, chemical feedstock
- rare crystal / exotic → advanced fabrication or research feedstock
- empty cell → no geological contribution, but usable for movement/infrastructure

The machine continually recomputes its contact ring. Drill out two neighboring
ore cells later to make a corridor? That machine loses those contacts and its
output drops. This is the single elegant tension the whole feature rests on, and
**nothing in the build is allowed to solve this tension away** — no support beams,
no "stability," no bonus that cancels the cost. The cost *is* the game.

A rough effectiveness model (a guide, not a mandate — feel free to refine):

```
Q(machine) = base_rate * geological_multiplier * min(power_ratio, input_ratio, export_ratio)
```

- `base_rate` — authored per machine.
- `geological_multiplier` — from the 7 contact cells, weighted per machine
  (a matrix mill weights regolith; a metal extractor weights ore; a gas turbine
  weights gas; a pure transformer like a refinery may get little/no geology
  benefit because it's mostly a process machine).
- `power_ratio`, `input_ratio`, `export_ratio` — the limiting factors. The `min`
  is intentional: machines starve on whichever resource bottlenecks first.

Candidate-tile inspection should read like a sentence, instantly:

```
METAL EXTRACTOR
  Iron contacts: 3 · Dense matrix: 2 · Empty: 2
  Estimated output: 4.6 units/min
  Power demand: 8 MW
```

## 2. What's locked (the spine — don't break these)

- **The contact-ring adjacency mechanic** (§1) is the core. Protect it.
- **No structural integrity / stress simulation.** Explicitly rejected. A second
  hidden geometry problem on top of the one that's already interesting turns
  excavation into navigating invisible penalties. Local authored hazards (a
  "volatile" or "unstable" tile) are fine; a global stress field is not.
- **Aggregated logistics, not per-item simulation.** Belts *look* animated; the
  economy uses aggregated flow. Start with connected-component throughput
  (machines on one belt network share inventory + a network-wide throughput cap).
  Only escalate to true per-edge graph flow if playtesting shows the topology has
  no teeth. (The field is only 28×45, so a network-flow solve at ~1Hz is cheap if
  you ever need it.)
- **Power is a simple network ratio.** `power_ratio = min(1, total_generation /
  total_demand)`; machines on the same network throttle proportionally when
  short, unless the player sets priorities.
- **Cables and material lanes are two independent overlays per hollow cell**, and
  the player never manually picks corner pieces. Each overlay computes a 4-bit
  connectivity mask from neighbors (N=1,E=2,S=4,W=8); the renderer picks/draws
  the corner, T, and cross automatically. When cable + belt share a tile, offset
  them off the centerline so they read as two parallel systems.
- **The mining laser stays for raw surface extraction.** A developed asteroid
  exposes a physical cargo interface (massline transfer port / cargo socket /
  courier drones / docking collar / launch tube) — the player does **not** retrieve
  refined alloy by pointing the laser at the rock. Lasering refined output back
  into existence collapses the whole system into the original verb.
- **Transport is a ladder** with seeded *stochastic* losses, not "always lose
  exactly 4 of 10." Long-run results converge on the probability; individual
  incidents stay dramatic. Generalize the existing danger/route-hotness/escort
  loss model in `src/systems/automation.js` rather than inventing a parallel one.
- **Manual rover installation first; remote-queue construction after a
  Command/Massline Core.** The learning curve is: do it by hand → build the thing
  that removes the tedium → graduate to the next design problem. Late-game must
  not become *Rover Commute Simulator*.
- **Stay 2D for v1.** The mechanical ambition is already high; a 3D conversion
  is an irresponsible first move. A well-rendered industrial cutaway looks great
  in Canvas2D. Once stable, the same view model can feed an orthographic Three.js
  pass later.
- **Split the monolithic drill screen before/while adding construction.**
  `src/ui/screens/drill.js` is ~3155 lines with local input + animation + UI
  construction + rendering all interleaved. Adding construction into that
  monolith makes every future change radioactive.

## 3. The machines — starting set (flexible roster, these are examples)

Resist launching with refineries + microchip fabs + drone factories + freighter
yards + weapons plants + research labs all at once. Start compact, prove the
loop, then grow. These six are enough to make a real system:

- **Massline Core / Command Nexus** — makes the asteroid a *persistent site*,
  supplies command bandwidth, and is the external flight-world attachment point
  (this is what flips construction from manual to remotely-queueable).
- **Geological Extractor** — produces a raw material from its surrounding solid
  cells. Modes could prioritize metal / matrix / mixed.
- **Gas Tap / Generator** — requires adjacency to one or more gas cells. Can
  generate power, produce volatile feedstock, or split between the two. The gas
  tile is *not* excavated — the machine interfaces with it safely. (This is also
  a clean way to make gas pockets desirable instead of pure hazards.)
- **Refinery** — ore + power → refined material. Doesn't need ore adjacency if
  fed through the logistics network.
- **Fabricator** — refined material + electronics → construction kits, spare
  parts, courier drones (and later, advanced machines).
- **Cargo Port** — moves materials between the internal network and the
  asteroid's exterior storage / transport system. The honest interface the laser
  is *not* allowed to be.

Construction cost should split into local + imported parts — e.g. structural
mass (locally producible from mined matrix/metal) + a control unit (initially
purchased and hauled from a station). That gives ship upgrades direct industrial
meaning: bigger hold = import more machinery per trip; better drill = reach
harder/valuable formations; better massline = bigger construction transfers.

## 4. Power & logistics — how machines talk

Two overlays per hollow cell, both passable by the rover:

```js
tile.infrastructure = { power: true, material: true };
```

- **Power network:** connected cable cells form a network with total generation
  and total demand; ratio throttle as in §2. Upgrade paths later: higher-capacity
  cable, battery buffer, **wireless power transmitter** (valuable *because* it
  lets you preserve geological cells instead of drilling cable corridors through
  them), directed beam, local reactor, emergency-shutdown policy.
- **Material network:** connected lane cells form a network sharing input/output
  inventory + a throughput cap (e.g. 10/min base; upgraded lanes 25 or 60). v1 =
  connected components; escalate to per-edge flow only if needed.

Keep it legible. Animate the belts so they feel alive, but never simulate
hundreds of iron chunks marching.

## 5. Construction & the rover

Staged. Before a Command/Massline Core exists, installation is physical: rover
must reach the tile, the tile must be hollow, the rover installs from an
adjacent hollow cell, full machines block movement, cables/lanes don't. After
the Core, construction is remotely queueable on any hollow tile connected to the
command network, with a small construction-rover or beam animation traveling
there. Manual driving stays useful for excavation, exploration, emergencies, and
gnarly formations.

## 6. Transport progression — the automation ladder

This emerged naturally in brainstorm and it's a genuinely clean progression.
Each tier is a real architectural choice with real tradeoffs, not just "more":

- **Courier pods** — cheap, small, one-way, sold/recycled/consumed at
  destination, no return-path sim, high attrition. The easy first automation.
- **Shuttle drones** — reusable, out-and-back, bigger capacity, need fuel +
  maintenance, lost units must be replaced, efficient on stable short routes.
- **Field freighters** — large capacity, heavy armor, lower route-loss, fewer
  trips, expensive, concentrates value (a big loss if destroyed), can carry
  escorts/defensive systems.
- **Armed logistics carriers** — late-game route anchors; repair/refuel smaller
  drones, defend the cluster, possibly mobile construction bases.

**Recursive self-replacement** is the soul of the automation layer. A fabricator
should take a *policy*, not a build order:

```
Maintain courier drones: 12
  Replacement threshold: below 10
  Reserve materials: 20%
  Pause when export backlog < 30 units
```

Three couriers blown up → factory auto-builds three replacements. Idle transport
capacity → controller detects it and stops building. A clean needed-fleet estimate:

```
drones_needed = ceil( export_rate * cycle_time / drone_capacity )
```

Report it as a sentence, not a stat wall:

```
Export production: 8.2 units/min
Courier capacity: 11.0 units/min
Fleet surplus: 2 drones — production paused
```

**Risk resolution:** each route has travel time, danger exposure, cargo value,
vehicle survivability, escort strength, local sensor coverage. Expected loss
`E[L] = N * p_loss`. A dangerous route might be `p_loss = 0.4` unprotected, `0.2`
in a freighter, lower with sensors/escorts/stealth/safer routing. **Player absent
→ resolve statistically, report losses + causes.** **Player present in the
sector → spawn real pirates, materialize the couriers/freighter, let combat
decide it.** Same route, meaningful at both strategic and tactical scale.

## 7. Asteroid specialization — emergent, not a class system

Roles emerge from the excavation mechanic; no special rules needed. Likely
archetypes:

- **Resource asteroid** — preserves geology, few chambers, efficient extractors,
  exports raw.
- **Energy asteroid** — preserves gas pockets/volatiles; gas taps, power plants,
  batteries, transmitters; supplies neighbors.
- **Processing asteroid** — moderately hollow; refineries, buffers, some local
  generation; imports raw, exports refined.
- **Factory asteroid** — almost fully hollow; dense machines, fabricators, drone
  production, repair; imports nearly everything; benefits from very short
  internal paths.
- Plus plausible others: storage, defense, sensor relay, research,
  ship-construction.

**Co-location vs specialization** should be opposing *strategies*, not mandated
bonuses. Co-locating refinery + fab means no inter-asteroid trip, lower loss +
latency, shared storage/power/command, easier defense — but it eats internal
space, concentrates power/signature, and one shutdown hits multiple stages. Let
the player feel that trade; don't hardcode a "+15% synergy" buff.

## 8. The payoff loop — inner game changes the outer world

Each stage unlocks a new *verb*, not just a bigger number:

```
raw extraction
  → permanent asteroid site
  → refined materials
  → self-replacing courier network
  → specialized asteroid cluster
  → field tender / station
  → freighters + local defense
  → shipyard + fleet production
  → autonomous construction fleet
  → new settlements without manual commissioning
```

The milestone moment: a cluster with enough materials, power, drone labor, and
command capacity builds a **station frame**. Player queues it, construction
drones emerge from several asteroids and *visibly assemble the structure in the
3D flight world*. The station then consolidates cargo, reuses freighters,
repairs/refuels, defends, and expands command radius. **The interior game now
changes the exterior world in a spectacular, visible way.** That's the north star.

## 9. The first playable milestone (don't skip to freighters)

One asteroid with: silicate matrix, iron cells, two gas pockets, existing rover
drilling, Massline Core, Extractor, Gas Generator, Refinery, Fabricator, power
cable, material lane, Cargo Port. **Objective: sustain production of one courier
drone every two minutes.** The player decides how much to excavate, what to
preserve, where generation goes, how to wire machines, whether power or material
throughput is the bottleneck, refined-vs-local alloy, and the target drone
count. Then the finished asteroid shows up modified in the exterior flight view
and periodically launches couriers. Smallest version that actually proves the idea.

## 10. What's open — your call, breathe here

- **Exact machine roster** beyond the six starters; what late-game machines do
  (research, shipyard, defense, sensors) and their recipes.
- **Recipe-tree depth and naming.** The chain `silicate matrix → purified silica
  → silicon substrate → electronics` is sound; how many stages, what they're
  called, is yours.
- **Renaming "dirt."** It should stop being dirt (terrestrial dirt in an asteroid
  is odd) but keep its low-value mechanical role. Candidates: silicate matrix,
  regolith, porous/carbonaceous matrix, mineral substrate. Your taste.
- **Visual art approach** — texture atlas, procedural shading, beveled cavities,
  auto-tiled tunnel edges. The current tiles are flat SVG and read as "cheap";
  make the cutaway look *deliberate*.
- **UI/panel architecture.** The existing screen is a 3-panel CSS grid (telemetry
  / canvas / manifest). How much to keep, shrink, or make contextual-inspector is
  open. Suggested interaction *modes* (drill / build / network / inspect) +
  overlays (geology / power / material flow / drone logistics / construction /
  hazards) are a starting point, not a spec.
- **Refactor aggressiveness** vs preserving `src/systems/drill.js`. The drill sim
  can initially keep owning excavation while a new site system owns durable
  structures + production. Decide the seam.
- **File layout** — many small files or a few big ones, your call. A suggested
  shape (not a requirement):

  ```
  src/systems/asteroidSites.js      // durable site state + persistence
  src/systems/siteProduction.js     // contact-ring effectiveness, recipes
  src/systems/siteLogistics.js      // power + material networks, flow
  src/ui/asteroid/
    asteroidScreen.js               // shell + lifecycle
    asteroidController.js           // input → modes → commands
    asteroidViewModel.js            // grid → render-ready state
    asteroidRenderer2d.js           // canvas drawing only
    autoTileNetworks.js             // 4-bit masks → tiles
    buildPalette.js                 // structure picker
    inspector.js                    // contextual machine/network readout
  ```
- **When/whether to add per-edge graph flow.**
- **Overlay rendering technique.**

## 11. Where this needs more variety (watch these — they're the weak points)

- **Material variety / recipe depth.** Risk: a flat "ore in, alloy out" feeling.
  The silicate→silicon→electronics chain is a good seed; make sure the recipe
  graph has real branching, not a single trunk.
- **Asteroid composition variety.** Risk: every rock feels the same. Lean into
  gas-rich / ore-rich / crystal-rich / mixed / exotic compositions so
  specialization is a response to *what's there*, not a mood.
- **Machine variety of *function*.** Risk: machines all just "produce X." Give
  them distinct verbs — extract, generate, transform, fabricate, route, store,
  defend, sense.
- **Visual identity per material.** Risk: "samey" strata. Each geological
  material should be recognizable at a glance.
- **Risk/resolution dimensions.** Loss model is one-dimensional (danger) today.
  Room to expand: pirates, environmental hazards, stealth, escort, sensor
  coverage, cargo-value-targeting.
- **Late-game plateau.** After a station, the temptation is "bigger numbers."
  The settlement-seeding / sector-project stretch goals exist precisely to keep
  unlocking verbs. Don't let the curve flatten into idle.

## 12. File map — where this probably lands

Authoritative current code (verify before editing; the tree may have concurrent
work — check `git status` + `git diff` first):

- `src/systems/drill.js` (~1020 lines) — excavation sim: 28×45 field, tile model,
  rover avatar, drilling, gas damage, seeded RNG per asteroid, persisted bore
  memory. **Contact-ring logic reads/writes the tile grid here.**
- `src/ui/screens/drill.js` (~3155 lines) — the monolith: canvas render, local
  input, HUD, legend, sonar, particles, summary modal. **Prime split candidate.**
- `src/data/mining.js` — `ORES` table, ore→drill-tier mapping.
- `src/data/commodities.js` — 44 `cmdty_*` goods with `producedBy`/`consumedBy`.
  **New intermediates (silica, silicon substrate, etc.) go here.**
- `src/data/automation.js` — `DRONES`, `TRADERS`, `OUTPOSTS` defs + `AUTO_BALANCE`.
  **New structures / transport tiers / balance knobs here.**
- `src/systems/automation.js` (~2550 lines) — production planner
  (`planOutpostProduction`), `creditPassive` token bucket, offline catchup,
  trader route-loss model. **Generalize the loss model; respect the passive cap.**
- `src/systems/economy.js` — market model + **sole credits writer**.
- `src/economy/freightCausality.js` — NPC freight manifests/intents (owner-safe;
  never writes stock). Courier/freighter flow could hook/generalize here.
- `src/data/tech.js` — 29-node tree, 4 branches. **New gates** (Massline Core,
  construction, freighters, shipyard) here; respect `droneTierCap` progression.
- `src/data/sectors.js` — 24-sector graph, `dangerIndex`/`dangerTier`/`wealthIndex`.
  **Route-risk reads this.**
- `src/core/gameState.js` — state slices + defaults. **New `sites` slice here.**
- `src/core/registry.js` — system registration. **Register new site systems.**
- `styles/ui.css`, `styles/menu.css`, `styles/fonts.css` — styling (see
  `styles/AGENTS.md`).
- Assets: `assets/AGENTS.md` + `assets/ships/AGENTS.md` for any new art; honor
  active locks/manifests.
- Tests/determinism: `test/AGENTS.md`, `scripts/AGENTS.md`, `test/*.expected.json`
  (never edit expected JSON merely to pass), `npm run check:sim:compare`.

See `docs/MODULE_MAP.md` and the nested `AGENTS.md` files (`src/ui/AGENTS.md`,
`styles/AGENTS.md`, `src/systems/AGENTS.md`, `test/AGENTS.md`) for ownership
detail. `ARCHITECTURE.md` is the contract source.

## 13. Contracts you must honor (non-negotiable)

From `AGENTS.md` / `ARCHITECTURE.md`:

- **Single-writer ownership:** economy→credits, cargo→cargo, factions→reputation,
  ships→derived stats. New systems **emit intents/events**; they do not write
  credits or stock directly. Funnel passive income through the existing
  `creditPassive` token bucket — don't bypass the anti-idle cap.
- **Determinism:** use `state.rng` and `state.simTime`, never ambient randomness
  or wall time. Losses are seeded-stochastic. Cosmetic render/VFX randomness is
  separate and fine. Never edit `test/*.expected.json` to pass.
- **One game path:** browser, Electron, probes, and packaged builds share the
  same gameplay/assets/settings/entrypoint.
- **Wired + reachable:** player-facing work must be reachable on the default
  route. A hidden flag or local report is not completion.
- **Input contract:** preserve raw axes and `state.input.actions` semantics.
- **Performance:** optimize algorithms/allocation/batching/cadence/culling; don't
  pass gates by removing authored visuals or lowering default quality.
- **Accessibility:** preserve input reachability, reduced-motion/flash behavior,
  legibility, contrast. The existing drill screen already has a real a11y pass
  (ARIA, SR announcer, `prefers-reduced-motion`, forced-colors) — match or beat it.
- **HUD:** flight HUD stays non-diegetic; this feature lives in the drill lens /
  site screen, not cockpit framing.
- **Shared working tree:** may hold concurrent work newer than HEAD. Inspect
  `git status --short` and `git diff -- <file>` before editing. Never run
  destructive tree-wide reset/restore/checkout/clean/stash. Add new files with
  `git add -N`. Commit only a reviewed logical slice when authorized.

## 14. Verification (what proves it works)

- Sim/determinism: `npm run check:sim:compare` + a focused site/production test.
- UI/a11y: focused UI check, a11y/contrast, UI perf, a representative screenshot
  (visual acceptance needs current player-facing evidence — green source checks
  alone don't prove visual quality).
- Asset/wiring: asset reachability, live-load status, visual stability,
  player-route capture.
- Broad integration: `npm run check` after focused checks pass.

Run the narrow owning check first, then broaden in proportion to risk.

## 15. Inspiration — steal the qualities, not the pixels

- **Motherload's ant-farm view** — the drill lens already names this as its model.
  Vertical cross-section, gravity, depth-banded rarity.
- **Mindustry's restraint** — *what not to do*: don't animate individual items,
  don't force the player to pipe every stage by hand. Take the legibility, leave
  the literalism.
- **Factorio's read-at-a-glance legibility** — bottlenecks visible on the grid;
  flow, saturation, and starvation drawn directly on the world.
- **Shapez / Dyson Sphere Program cutaway beauty** — clean industrial schematics
  that feel like blueprints come alive.

The goal is an identity of its own: an asteroid as a thing you *grow a productive
organ inside*, not a factory you stamp down. When in doubt, favor the choice that
makes the contact-surface tradeoff *more* felt, not less.
