# GOLD PACKETS — Lane G: 47-A / Story / Evidence / Map & Navigation

> **Clusters curated:** Q (47-A / story / evidence / the mass motif, brainstorm §Q) + N (map & navigation, §N).
> **Destinations:** 47-A/evidence → **BP-05** (story wire); map/nav → **BP-03** (one map) + **BP-12** (route-risk from `dangerModel`).
> **The one filter applied to every item:** *SEE it, PREDICT it, or CHANGE it — else it's cost, not detail.*
>
> **Grounding read before authoring (what already ships):**
> - `src/systems/story.js` + `src/data/narrative.js` — the 47-A spine is BUILT: cold-start comms, ambient migraine, trap comms, beat graffiti, HUD-phase meta-arc, the Kurtz ledger, endgame Choices A–E, the Elroy civilian-tag flicker. **This is the flagship and it is already wired.**
> - `src/ui/hudMeta.js` — the HUD lies already RENDER: `STABLE LOAD` persistent line, `CIVILIAN VESSEL — REGISTERED` flicker, phase-freeze. Listens to `hud:phase` / `hud:tagFlicker`.
> - `src/ui/galaxyMap.js` — the ONE map (LOCAL/SYSTEM/GALAXY zoom), fog for uncharted, `ui:setCourse` / `world:requestRoute`. **Keep-two-maps is a HARD CUT (§N #257).**
> - `src/systems/sectorSim.js` — `sectorSignalFor` (danger/pricePressure/dominantFaction/**driver+trend**), `forecastTransitFor` (danger/incidentChance/expectedDamage/survivalMargin/fuel via `computeRoute`), `effectiveDangerFor`. Route-risk math is DONE — the map just doesn't show it yet.
> - `src/ui/missionPreflight.js` — already surfaces `forecastTransitFor` PER MISSION. The map preview reuses the same read, no new math.
>
> **Consequence for triage:** most of cluster Q is **VALIDATED (already shipped, reframed)** or **SURFACE** (a read the player can't see yet). Very little is genuinely new machinery. Cluster N is mostly SURFACE onto the shipped `galaxyMap` + shipped `sectorSim` reads.

---

## Ranking — the 3 highest-impact packets in this lane

By **(distance from shipped) × (first-15 / 47-A visibility)**:

1. **`route_risk_preview`** (BP-12) — the map's biggest hole. `forecastTransitFor` already computes danger/fuel/damage/survival-margin; the map shows NONE of it. Pure surface of a shipped system, visible the first time a player plots any course (minute ~5). Highest leverage.
2. **`ledger_corruption_readout`** (BP-05) — the 47-A "Mass Discrepancy" slice made perceptible: names briefly become weights/claim-IDs. Rides the *already-shipped* `hud:phase` channel; it is the visual signature of the whole theme. Central to the 47-A proof surface.
3. **`overview_intent_strip`** (BP-03) — the flight-time contact strip gains INTENT verbs (Hostile/Fleeing/Scanning/Docking/Mining). Reuses SG-06 AI states already computed; visible every second of flight, first 15 included.

---

## BP-05 — STORY WIRE (evidence, mass motif, fact-graph)

### Packet: `ledger_corruption_readout`
- **name:** Ledger-Corruption Readout
- **fantasy:** For half a second the crew names on your HUD are replaced by weights and claim-IDs — the world files you the way it files cargo.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-05.1 addendum
- **reuses:** `story.js` (`hud:phase` emitter, phases 2/3), `hudMeta.js` (already renders phase lies), `narrative.js` (FIGURES → weight/claim-ID pairs)
- **newFiles:** `src/data/ledgerGlyphs.js` (name→{mass, claimId} table, transcribed from `narrative.js` FIGURES + the mass motif)
- **noTouch:** `hudMeta.js`, `story.js`, `narrative.js`, `uiRoot.js` (orchestrator wires the new `hud:ledgerCorrupt` listener into hudMeta)
- **budget:** spawn:none · voice:none (silent — no `voiceArbiter` line; the point is it does NOT announce itself) · draw:none (DOM text swap)
- **rng:** none / pure UI — the swap is authored-moment-gated (phase>=2 AND an authored beat), never a per-frame roll
- **acceptance:** at phase 2, a scripted beat swaps a target's name-tag to `480kg · CLM-44C` for ~600ms then reverts; a headless check asserts the swap fires only on the authored beat and only when `state.story.phase >= 2`
- **failureModes:** reads as a bug if it fires randomly (MUST be authored-gated, never ambient); double-voice if it also toasts (it must not)
- **size:** M

### Packet: `sensor_contradiction_beat`
- **name:** Sensor-Contradiction Beat
- **fantasy:** The manifest says 480kg but the ship handles like it's carrying a moon — the numbers and the physics disagree, and the HUD sides with the paperwork.
- **pillar:** world-was-here · momentum-toy
- **wave/BP:** W3 / BP-05.1 addendum
- **reuses:** `story.js` (beat hook, `hud:phase` lie channel), `hudMeta.js` (manifest line), the shipped mass-motif graffiti in `narrative.js` ("THEY KNEW THE MASS")
- **newFiles:** `src/data/massDiscrepancy.js` (authored beat→{shownMass, actualHandlingMass} pairs)
- **noTouch:** `flightV3.js`, `cargo.js`, `story.js`, `combat.js` (orchestrator applies a handling-mass override ONLY on the authored beat and reverts it)
- **budget:** spawn:none · voice:none (the discrepancy is felt, not narrated) · draw:none
- **rng:** none — authored beat only; the handling override is a fixed scripted value, never seeded
- **acceptance:** during the authored 47-A beat, ship inertia uses `actualHandlingMass` while the HUD reads `shownMass`; a check asserts the override is active only during that beat window and that determinism (47-A golden telemetry) is untouched outside it
- **failureModes:** breaks flight-feel determinism if the override leaks past its window; must be a single-beat, self-reverting scripted effect, not a general system
- **size:** M

### Packet: `evidence_cargo_item`
- **name:** Evidence-Has-Mass Cargo
- **fantasy:** You're carrying proof, and proof is heavy, scannable, and illegal — it slows you, lights up customs, and every faction wants it for a different reason.
- **pillar:** momentum-toy · world-was-here
- **wave/BP:** W3 / BP-12 (new machinery: an evidence commodity class)
- **reuses:** `cargo.js` (persistent-cargo pattern already used for the Kurtz ledger in `story.js`), `scanner.js` (scan reveals manifest), `narrative.js` (per-faction wants text)
- **newFiles:** `src/data/evidence.js` (evidence item defs: mass, scanSignature, per-faction `want` enum: `chain_of_custody|suppression|leverage|untranslatable|religious|proof|collateral`)
- **noTouch:** `cargo.js`, `scanner.js`, `story.js` (orchestrator registers the evidence commodity + persistent flag)
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none — the item is placed by an authored beat / contract, never a random drop
- **acceptance:** carrying an evidence item adds real mass to the cargo mass total (visible in the mass readout) and, on a customs scan, resolves to its authored manifest; a check asserts mass is counted and the item is non-jettisonable
- **failureModes:** becomes gold-plating if it spawns a whole investigation UI — keep it a cargo item with a `want` tag that BP-05 story branches read; the branching is the story lane's job, not this packet's
- **size:** M

### Packet: `evidence_scan_draws_heat`
- **name:** Evidence Draws Scans
- **fantasy:** The thing in your hold is loud — patrols vector toward you, and running it past a customs cone is a decision, not a formality.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-12
- **reuses:** `evidence.js` (from `evidence_cargo_item`), `heat.js` (`isPlayerWanted` already gates `trap_inspection` in `narrative.js`), `scanner.js` hostility seam, `dangerModel` interdiction impulse (`kind:'interdiction'` already exists)
- **newFiles:** none (rides `evidence.js` `scanSignature` + the existing heat/trap-comms path)
- **noTouch:** `heat.js`, `scanner.js`, `encounterDirector.js` (orchestrator raises heat while an evidence item is aboard, released on delivery/destroy)
- **budget:** spawn:none (interdiction spawns go through `spawnBudget` via the existing encounter path — this packet only raises the heat input) · voice:one (`voiceArbiter` — a single customs bark on cone entry) · draw:none
- **rng:** the interdiction roll uses the EXISTING seeded interdiction domain in `dangerModel`; this packet adds no new roll
- **acceptance:** with an evidence item aboard, `isPlayerWanted`-style pressure rises and the existing `trap_inspection` cond fires sooner in high-sec; check asserts heat delta is applied on pickup and cleared on drop
- **failureModes:** determinism leak if it adds an unseeded spawn roll — it must ONLY move the heat input and let `spawnBudget`+`encounterDirector` own the spawn
- **size:** S

### Packet: `smuggler_compartment_conceal`
- **name:** Smuggler Compartment
- **fantasy:** A false-bottom hold that hides your evidence from a routine scan — until someone runs a deep scan and the compartment becomes the reason they don't let you leave.
- **pillar:** world-was-here
- **wave/BP:** W3 / BP-12
- **reuses:** `evidence.js`, `scanner.js` (scan-quality-by-distance already modeled — deep scan vs near scan), `modules.js` (module slot pattern)
- **newFiles:** `src/data/concealment.js` (one module def: `smuggler_hold` — hides tagged cargo below a scan-quality threshold)
- **noTouch:** `scanner.js`, `modules.js`, `cargo.js` (orchestrator registers the module + the scanner conceal check)
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none — conceal is a deterministic threshold on the shipped scan-quality value
- **acceptance:** a near scan reports `NOMINAL`; a deep scan (within `NEAR_SCAN_RADIUS`) reveals the concealed manifest; check asserts the threshold gate is deterministic per scan distance
- **failureModes:** flat if scan-quality isn't already distance-graded — verified it is (`scanner.js` `NEAR_SCAN_RADIUS`); keep conceal purely a read-time filter, no state mutation
- **size:** S

### Packet: `fact_graph_validator`
- **name:** Fact-Graph "No Character Knows Undiscovered Facts" Validator
- **fantasy:** (dev-facing) The world can't leak its own secrets — a character never references a fact the player hasn't unlocked.
- **pillar:** world-was-here (integrity of the one-voice fiction)
- **wave/BP:** W3 / BP-05.1 addendum (tooling)
- **reuses:** `narrative.js` (FIGURES: Kessler/Vale/Elroy/Mira/Hale + the beat→content tables), `story.js` beat gating, `missions.js` beat registry
- **newFiles:** `src/data/factGraph.js` (fact nodes: {id, knownAtBeat, knownBy[]} for the Kessler/Vale/Elroy chain) + `scripts/check-fact-graph.mjs` (headless validator)
- **noTouch:** `narrative.js`, `story.js` (read-only validation; never edits content)
- **budget:** spawn:none · voice:none · draw:none (pure tooling)
- **rng:** none
- **acceptance:** `check-fact-graph.mjs` scans every comms/graffiti line's referenced facts against `knownAtBeat` and FAILS if any line at beat N names a fact gated to beat > N; runs green on current content
- **failureModes:** false positives if fact tagging is coarse — start with the named-figure chain only (Kessler/Vale/Elroy), expand later; it's a gate, not a generator
- **size:** M

### Packet: `story_consequence_map_labels`
- **name:** Story Choices Alter Map Labels & Traffic
- **fantasy:** After you pick a side, the world re-labels itself around you — patrols get stricter here, a bounty cluster blooms there, and the map stops trusting your name.
- **pillar:** world-was-here · glance
- **wave/BP:** W3 / BP-05.1 addendum
- **reuses:** `story.js` (endgame/branch flags already set: `identityErased`, `branch`), `dangerModel` impulses (`interdiction`/`territory_flip` already exist), `galaxyMap.js` (label render), `narrative.js` (the `late_registry_unknown` "OPERATOR: UNKNOWN" beat)
- **newFiles:** `src/data/storyConsequences.js` (branch/flag → {patrolStrictnessDelta, bountyClusterSectorId, mapLabelOverride})
- **noTouch:** `story.js`, `dangerModel.js`, `galaxyMap.js`, `sectorSim.js` (orchestrator applies the deltas as `dangerModel` impulses + a label override read by the map builder)
- **budget:** spawn:none (bounty cluster is a `spawnBudget` client via `encounterDirector`) · voice:none · draw:none
- **rng:** consequences are deterministic functions of the chosen branch/flag; any spawn uses the existing seeded encounter domain
- **acceptance:** picking branch B (identity erased) makes the player's own map label read `OPERATOR: UNKNOWN` and applies a patrol-strictness impulse to the chosen faction's home sector; check asserts the impulse + label override are driven by `state.story.flags`, not a timer
- **failureModes:** fights determinism if labels flicker per-frame — the override is a one-shot on flag-set; HUD-trust must route through the shipped `hud:phase`, not a parallel trust system
- **size:** M

---

## BP-03 — ONE MAP (surface the shipped map + reads)

### Packet: `overview_intent_strip`
- **name:** Overview Intent Strip
- **fantasy:** Every blip on your contact strip tells you what it's DOING — Fleeing, Scanning, Docking, Interdicting — so you read the room without opening a menu.
- **pillar:** glance · one-voice
- **wave/BP:** W3 / BP-03.1 addendum
- **reuses:** SG-06 AI states (`aiPorts.js` roster — intent already computed), `scanner.isHostileToPlayer` (hostility seam), the shipped contacts strip
- **newFiles:** `src/data/intentGlyphs.js` (AI-state → {verb, glyph} map: Intercepting/Fleeing/Scanning/Docking/Mining/Escorting/Interdicting)
- **noTouch:** `hud.js`, `aiPorts.js`, `scanner.js` (orchestrator reads AI state into the strip)
- **budget:** spawn:none · voice:none · draw:none (glyph + one word per existing strip row)
- **rng:** none — intent is read from the already-computed SG-06 state, never rolled
- **acceptance:** a contact in the SG-06 `Fleeing` state shows `FLEE` on its strip row; a headless check maps each SG-06 state to exactly one verb (budget: one glyph per role, no ambiguity)
- **failureModes:** glyph budget blowout if every micro-state gets its own icon — cap at the 7 canonical verbs; falls back to blank (not "UNKNOWN spam") when state is unreadable
- **size:** S

### Packet: `map_confidence_not_fog`
- **name:** Map Confidence, Not Pure Fog
- **fantasy:** The map doesn't just hide the frontier — it tells you how much to trust what it shows: charted-and-current, known-but-stale, or rumored.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-03.1 addendum
- **reuses:** `galaxyMap.js` (`isSectorCharted` + `state.world.discovery` already exist), `sectorSim.js` (`sectorSignalFor` carries `epochDays`/trend for staleness)
- **newFiles:** none (extends the pure `buildGalaxyModel`/`buildSystemModel` output with a `confidence` field: `live|known|stale|rumored`)
- **noTouch:** `galaxyMap.js` (orchestrator adds the `confidence` derivation to the pure builders; render tier reads it)
- **budget:** spawn:none · voice:none · draw:none (node/label opacity + a small staleness tick — within existing glyph budget)
- **rng:** none — confidence is derived from discovery flags + field `epochDays`, deterministic
- **acceptance:** a discovered sector not visited in-model for N days renders at `stale` confidence (dimmed + a "last seen" tick); an uncharted frontier stays `rumored` (`???`); check asserts confidence is a pure function of discovery + epoch
- **failureModes:** two-and-a-half-maps risk if it becomes a second overlay — it is ONE new field on the existing model, not a new layer; must degrade to plain fog when discovery data is absent (contract §7)
- **size:** M

### Packet: `known_vs_live_prices`
- **name:** Known-vs-Live Price Staleness on Map
- **fantasy:** The map remembers what a commodity cost last time you were there — and marks it as a memory, not a promise.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-03.1 addendum
- **reuses:** `galaxyMap.js` (SYSTEM/GALAXY node tooltips), `sectorSim.js` (`sectorSignalFor.pricePressure` + `marketFlowUnitsPerDay`), `marketNews.js` (the shipped "why prices changed" headline)
- **newFiles:** `src/data/priceMemory.js` (per-sector last-seen price snapshot, written on dock/visit, read by the map)
- **noTouch:** `galaxyMap.js`, `sectorSim.js`, `economy.js` (orchestrator persists the snapshot on dock, exposes it to the map builder)
- **budget:** spawn:none · voice:none · draw:none
- **rng:** none
- **acceptance:** hovering a visited sector on the map shows `last seen: Ore 42 (3 cycles ago)`; a never-visited sector shows `no data`; check asserts the snapshot writes on dock and the map reads it read-only
- **failureModes:** economy double-count risk if the snapshot feeds back into pricing — it is READ-ONLY memory, never a price source; keep it out of `dangerModel`
- **size:** M

---

## BP-12 — ROUTE RISK (from `dangerModel` / `sectorSim`)

### Packet: `route_risk_preview`  ★ top-ranked
- **name:** Route-Risk Preview
- **fantasy:** Before you commit a course, the map tells you the price of the trip: time, fuel, how likely you get jumped, and whether your hull survives it.
- **pillar:** glance · world-was-here
- **wave/BP:** W3 / BP-12
- **reuses:** `sectorSim.js` (`forecastTransitFor` → danger/incidentChance/expectedDamage/survivalMargin; `sectorSignalFor` → dominant faction/driver), `world.js` (`computeRoute` → fuel/edge path already computed), `galaxyMap.js` (the click-to-course flow), `priceMemory.js` (last-prices from `known_vs_live_prices`)
- **newFiles:** `src/ui/routeRiskPanel.js` (a pure preview panel: takes `state` + target sectorId, calls the shipped forecast reads, renders time/fuel/danger/tolls/last-prices — NO new math)
- **noTouch:** `galaxyMap.js`, `sectorSim.js`, `world.js` (orchestrator mounts the panel on map hover/select; the panel is read-only)
- **budget:** spawn:none · voice:none · draw:none (one DOM panel)
- **rng:** none — every number comes from the shipped deterministic forecast functions; the panel adds zero rolls
- **acceptance:** selecting a sector node on `galaxyMap` shows a panel with fuel (from `computeRoute._fuelCost`), incident chance + expected damage + survival margin (from `forecastTransitFor`), gate toll (from `_gateToll`), and last-seen prices (from `priceMemory`); a headless check calls the panel builder and asserts each field equals the corresponding shipped read
- **failureModes:** it INVENTS math if it recomputes danger itself — it must call `forecastTransitFor`/`sectorSignalFor`/`computeRoute` verbatim (they already exist and `missionPreflight.js` proves the pattern); flat if it shows raw floats — band them (LOW/MED/HIGH) like `missionPreflight` does
- **size:** M

---

## VALIDATED (already shipped, reframed — NOT rebuilt)

| Brainstorm item (cluster Q/N) | Already shipped as |
|---|---|
| "The HUD can be wrong (authored moments only)" | `hud:phase` meta-arc — `story.js` emits, `hudMeta.js` renders (phases 1/2/3). |
| "CARGO manifests lie / stable-load" | `hudLie: 'stable_load'` + the `STABLE LOAD` persistent line in `hudMeta.js`. |
| "Manifest self-corrects silently" | `hudLie: 'manifest_silent_correct'` at B1/B5, wired via `hud:phase`. |
| "Civilian tag flicker on first kill" | `hud:tagFlicker` (Elroy, B2) — `story.js` `_onKill` + `hudMeta.js`. |
| "Tags freeze on last-known state (phase 3)" | `hudLie: 'phase3_freeze'` at B6/B7. |
| "47-A never closes / PENDING forever" | `pers_47a_pending` + `story_vale_goodwork` + endgame Choice C loop-back in `narrative.js`. |
| "Evidence handling: open/deliver/copy/destroy/leak/sell" as branch | The Kurtz ledger take/coords/approach branches (`_onKurtzInteract`) + endgame Choices A–E. |
| "Per-mission route risk (danger/damage)" | `forecastTransitFor` surfaced in `missionPreflight.js` (ROUTE_RISK_WARNING_DANGER). |
| "The ONE map with LOCAL/SYSTEM/GALAXY layers" | `galaxyMap.js` (unifies the two legacy maps; §N M+N layers preserved). |
| "Fog only at true frontier / charted-is-known" | `isSectorCharted` + the `???` uncharted node render in `galaxyMap.js`. |
| "Set-course from any POI" | `resolveCourseTarget` + `ui:setCourse` in `galaxyMap.js`. |
| "Cause ledger — why prices changed" | `dangerModel` `classifyDrivers` + `marketNews` headline (documented in DOCTRINE §1). |
| "Diegetic strategic intel (station news / rumor)" | `marketNews.js` + the ambient/trap comms corpus in `narrative.js`. |
| "Ledger tracks you as COUNTERPARTY before you arrive" | B7 hint + Kurtz ledger `WITNESS — CURRENT` transition (Choice D). |

---

## CUT / DEFER (no packets written)

| Item | Action | Reason |
|---|---|---|
| #257 keep-two-maps (M local + N nav as separate maps) | **HARD CUT** | Settled decision: unified to `galaxyMap` (REVAMP_MASTER §6.2, DOCTRINE §8). |
| Mass-debt faction mechanic (Meridian tracks losses as debt claims) | **Defer** | New faction subsystem; gold-plating vs the shipped `dangerModel` impulse path. Real idea, wrong decade. |
| Body-as-inventory beats / "accounting horror" full system | **Defer/reshape** | The *motif* ships via `ledger_corruption_readout`; a literal body-cargo system is scope-creep. |
| Investigation board UI (facts/lies/sources/contradictions) | **Defer** | The `fact_graph_validator` gives the integrity guarantee dev-side; a full player board is a later BP. |
| "Asteroid core bends scanner" / false-mass-near-gates ambient variants | **Cut/reshape** | Would need per-frame flavor rolls without a seeded domain (contract §1); the authored `sensor_contradiction_beat` covers the payload legibly. |
| Rumor reliability tiers (verified/stale/suspicious/propaganda) as a system | **Defer** | Partially covered by `map_confidence_not_fog`; a full four-tier rumor economy is gold-plating. |
| Autopilot incident menagerie (toll/traffic-jam/minefield/derelict on autopilot) | **Defer** | Belongs to BP-01/BP-12 encounter work, not the map lane; `route_risk_preview` surfaces the risk instead. |
| Wormhole instability forecast / scanner ghosts in anomaly space | **Defer** | Cosmetic anomaly polish; no first-15 / 47-A visibility. |
| Pirates HIRED to retrieve evidence (not random) | **Defer to BP-13** | Correct instinct, but it's Pirate-Ecology machinery — `evidence_scan_draws_heat` gives the heat hook BP-13 consumes. |
