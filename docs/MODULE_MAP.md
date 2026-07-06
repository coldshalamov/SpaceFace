# SpaceFace Module Map

> **What this is:** the single index of "which file does what, which implementation is LIVE,
> and where to start reading." If you don't know where something lives, start here.
> Companion to `AGENTS.md` (policy) and `docs/COMMON_BUGS.md` (debugging playbooks).
>
> **Verified first-hand against the working tree 2026-07-05.** The working tree has ~202 files /
> ~17k insertions uncommitted (see `AGENTS.md` §3) — claims here reflect the working tree, not HEAD.
>
> **Live vs legacy:** the engine has flag-selected backend swaps (see `AGENTS.md` §5).
> Files marked 🟢 are default-on. Files marked ⚪ are fallback/test-fixture only — editing them
> has no effect in normal play. Defaults: `physicsBackend:'rapier-dynamic'`,
> `aiBackend:'sg06-tactical'`, `flightBackend:'v3'` (`src/core/gameState.js:16`,
> force-stamped on every save at `src/save/saveSystem.js:1411-1413`).
>
> **System vs library:** a *system* is registered in `src/core/registry.js` (runs every tick).
> A *library module* lives in `src/systems/` but is just imported by other code — it does NOT run
> on its own. Marked 📚 below.

---

## Boot & core

| File | Role | Notes |
|---|---|---|
| `index.html` | DOM shell + Three.js importmap. z-layered: canvas (0) < vignette (5) < hud (10) < modal-backdrop (90) < screens (100) < toasts (1000) < alerts (1100). | `#ui-root` is `pointer-events:none`; interactive children opt back in. |
| `src/main.js` | Boot + bootstrap. **Boots to Main Menu** (`state.mode='menu'`). On `game:new` → `startNewGame()` → builds world → **hard gate: refuses flight if authored assets not ready** (lines 196-199, 203-206, 216-223) → `state.mode='flight'`. Exposes `window.SF = {state, bus, registry, ctx, helpers, THREE, telemetry, eventTrace}` in debug. | Don't weaken the asset-ready gates — they prevent silent procedural-fallback ships. |
| `server.js` | Zero-dependency static dev server (port 8123). | Browser route is the primary player path. |
| `electron/main.cjs` | Optional desktop shell. Serves the SAME game route on private port 41788. | Shell-only; must not change gameplay/assets/reachability. `check:launch-policy` enforces. |
| `src/core/gameState.js` | `createGameState(seed)` — the single flat `GameState`. Default backend flags at line 16. `state.input` raw axes at line 85 (`actions.*` added lazily by input.js). | The one state object every system reads/writes. See `AGENTS.md` §6 for single-writer rules. |
| `src/core/eventBus.js` | The event bus. All cross-system comms. Event names: `domain:verb`, lowercase, `:`-delimited. | ARCHITECTURE §0.3, §4.4. |
| `src/core/registry.js` 🟢 | System registry: instantiates every system, `init(ctx)` in registration order, `step(dt)` runs `UPDATE_ORDER`. **Flight/AI backend selection at lines 170-186.** `get(name)` returns the slot winner by name (lines 84-85). | If a system isn't here, it doesn't run. Update order in `AGENTS.md` §8. |
| `src/core/loop.js` 🟢 | Fixed-timestep loop. 60 Hz sim, render every frame, accumulator capped at 8 steps. | ARCHITECTURE §2. |
| `src/core/sim.js` / `simSnapshot.js` | Deterministic sim harness + canonical serialization (for replay hashing). | `canonicalStringify` is the hash basis — change it and all goldens break. |
| `src/core/entity.js` | Entity factory + the single entity store (`state.entities: Map` + `entityList`). | ARCHITECTURE §0.15 — `combatants` is a derived per-tick index, NOT a separate store. |
| `src/core/physics.js` / `physicsAuthority.js` 🟢 / `rapierCollisionWorld.js` / `spatialHash.js` | Physics: Rapier dynamic bodies (live), the single-writer authority membrane (only thing that writes pos/vel/rot), core's spatial hash (cell 64 wu). | Everything else emits force/torque/impulse commands through `physicsAuthority`. |
| `src/core/rng.js` | mulberry32 + `hash32` helpers. `state.rng` is the core sim stream. | Determinism. Never `Math.random()` in sim. |
| `src/core/sg02DynamicBodyOwner.js` | SG-02 dynamic-body owner tracking (Rapier). | Used by physics authority + aiPorts. |
| `src/core/perfRuntime.js` | Per-system perf timing (`recordSystem`/`recordPhase`). | Powers the perf probes. |
| `src/core/math.js` | Shared math helpers. | |

---

## Flight (two implementations — V3 is live)

| File | Role | Live? |
|---|---|---|
| `src/systems/flightV3.js` 🟢 | **LIVE flight controller.** Production adapter over the propulsion stack. Writes only force/torque/impulse through `physicsAuthority` — never touches pos/vel/rot directly. Adds autopursuit verb. `_diag.version = 3`. **Currently +520 lines uncommitted** (active rewrite). | YES — `flightBackend:'v3'`. |
| `src/systems/flight.js` ⚪ | Legacy flight controller. Directly edits `e.vel`/`e.rot` via `flightDynamics.js`. | NO — registered fallback only; **zero importers anywhere**. CI runs legacy `check:sim` against it. GDD §4 still cites it (line 25) — stale. |
| `src/core/flight/propulsionCatalog.js` 🟢 | V3 propulsion profile catalog (thrust/drag/vmax per ship role). | YES — V3's math. |
| `src/core/flight/propulsionKernel.js` 🟢 | V3 force integration kernel. | YES. |
| `src/core/flight/flightTelemetry.js` 🟢 | V3 telemetry export for HUD/radar. | YES — read by `ui/hud.js`, `ui/radar.js`. |
| `src/core/flightDynamics.js` ⚪ | Legacy flight math (`resolveFlightProfile`, `stepPlayerFlight`). | NO for flight — BUT still imported by `src/systems/aiPorts.js` + legacy `check:sim` scripts. Do not assume it's fully dead. |
| `src/core/constraints/masslineController.js` | Tether/grapple constraint solver. Imported by `src/combat/attachments.js` (the tether system), NOT by either flight controller. | Live — used by tether. |
| `src/systems/cruise.js` | Cruise tier (3s charge, 4× speed, agility crush, drop on damage/mass-lock). Emits `cruise:dropped`. | Live. `check-cruise.mjs` exists. |
| `src/systems/impulseCharges.js` | Impulse charges (sticky lob Q/Y, R-detonate radial impulse). | Live. |

---

## AI (two stacks — SG-06 tactical is live)

> **If your AI fix "didn't apply," you edited `src/systems/ai.js`.** It's dead at runtime.
> The live stack is `tacticalAI.js` + `src/ai/` + `aiPorts.js`.

| File | Role | Live? |
|---|---|---|
| `src/systems/tacticalAI.js` 🟢 | **LIVE AI system** (thin factory). Wires the `src/ai/` stack into the registry under the `'ai'` slot. | YES — `aiBackend:'sg06-tactical'`. |
| `src/ai/stack.js` 🟢 | `TacticalAIStack.update` — the per-tick AI driver. | YES. |
| `src/ai/perception.js` 🟢 | Builds per-ship sensor frames; counts `hostileContacts`/`visibleThreat` feeding the director. | YES. |
| `src/ai/director.js` 🟢 | Encounter pacing — ramps pressure based on perceived threat, emits reinforcement requests. | YES. |
| `src/ai/squad.js` 🟢 | Target voting (`mergeContacts`, hostile-vote at line 271-273) + `selectFocusTarget` (line 289). **Contains a fallback clause at line 272** that can vote hostile when `contact.hostile` is undefined + team mismatch + threat > 0. | YES — read `docs/COMMON_BUGS.md` §2. |
| `src/ai/shipDecision.js` / `maneuver.js` 🟢 | Per-ship action pick (attack/ranged/flee) + steering (INTERCEPT/ORBIT). | YES. |
| `src/ai/contracts.js` 🟢 | AI data contracts (sensor frames, contact kinds, director phases). Imported widely. | YES. |
| `src/ai/sg03ActionPort.js` / `inspection.js` / `trace.js` 🟢 | Action port (writes `intent.fire`/`intent.thrust`), test inspection endpoint, tracing. | YES. |
| `src/systems/aiPorts.js` 🟢 | Bridges tactical AI to physics via `physicsAuthority`. **Contains `isHostile` (line 784)** — the live hostility oracle. In the working tree it has the lawful+heat gate (lines 793-795: `lawful && otherIsPlayer → isPlayerWanted(state)`); in HEAD it's team-only. | YES — critical for hostility debugging. |
| `src/systems/aiEncounter.js` 🟢 | Consumes director reinforcement requests, spawns `REINFORCEMENT_PACKAGES` (all `team:1`). | YES. |
| `src/systems/ai.js` ⚪ | Legacy per-NPC FSM. Has a correct lawful+heat gate (line 536-549) — but the file is **dead at runtime** (zero importers). | NO. |

---

## Combat, weapons, heat

| File | Role | Notes |
|---|---|---|
| `src/systems/combat.js` 🟢 | The registered combat system → calls into `src/combat/` library. **`makeEnemySpawnSpec` (line 65) hardcodes `team:1` for every enemy including lawful patrols** (line 70). Sets `ai.lawful = !!def.factionLawful` (line 111). | ARCHITECTURE §0.15. |
| `src/combat/` (`kernel.js`, `damage.js`, `actions.js`, `runtime.js`, `statuses.js`, `subsystems.js`, `attachments.js`, `geometry.js`, `persistence.js`, `trace.js`, `validate.js`, `index.js`) 🟢 | **Busy shared combat library** — imported by `combat.js`, `weapons.js`, `actions.js`, `ai.js`, `aiEncounter.js`, `impulseCharges.js`, `missions.js`, `onboarding.js`, `world.js`. `attachments.js` = tether (imports masslineController). `index.js` = barrel re-export. | Library, not a registered system. |
| `src/systems/weapons.js` 🟢 | Weapon firing + weapon heat. NPC firing path services every ship with `intent.fire` set. The `typeof window`-gated heat vent (line 31) preserves determinism — don't "fix" it. | The player-auto-fire lawful gate is at line ~552 (player side only). |
| `src/systems/heat.js` 🟢 | **WANTED heat** (`state.player.heat`, 0..1) — the ONLY writer. Raised by `faction:aggro` events. `WANTED_THRESHOLD = 0.15` (line 33). **`isPlayerWanted(state)` at line 147** — the canonical "is the player wanted" check. | Do not confuse with weapon heat or sector danger. |
| `src/systems/countermeasures.js` | Countermeasures (missile decoys). | Live. |
| `src/systems/dangerModel.js` 📚 | **Sector danger index kernel** — offscreen sector-field simulation. Imported only by `sectorSim.js`. **NOT a registered system, NOT combat threat.** `dangerIndex()` itself is in `src/data/sectors.js:254`. | Library module — do not edit expecting combat changes. |
| `src/data/combatDefs.js` / `enemies.js` | Combat definitions + enemy archetypes (swarmer/sniper/brawler/pirate/trader/capital) + `factionLawful` flag. | `enemies.js` `patrol_lawman` has `factionLawful:true` → spawns `ai.lawful:true` but still `team:1`. |

---

## Mining, cargo, economy

| File | Role |
|---|---|
| `src/systems/mining.js` | Beam mining, seams (deterministic 1-4/asteroid), fracture-into-chunks, vacuum buff, rich cores. `check:mining:2` gates it. |
| `src/systems/drill.js` | Charged-drill timing ring (rich cores 3-8× rare). |
| `src/systems/cargo.js` | The ONLY writer of `state.player.cargo` (`addCargo`/`removeCargo`). Volume (`u`) is the only hard cap; mass is a handling penalty, not a second cap. |
| `src/systems/economy.js` (57KB) | The ONLY writer of `state.player.credits`. Per-station supply/demand market, price-from-stock, spreads, drift, events, contraband. 5s tick. |
| `src/systems/economyCycles.js` 📚 | Economic event cycles. Imported by `ui/screens/market.js`. Library module, not a registered system. |
| `src/data/commodities.js` | The ONE commodity registry (ores, refined goods, trade goods, contraband, salvage) — unified `cmdty_*` IDs. |
| `src/data/mining.js` | Ores→asteroids, beam tiers (`beam_mk1..beam_industrial`), recipes, fields. |
| `src/ui/priceHistory.js` / `sparkline.js` | Market price history + sparkline rendering. |

---

## World, factions, traffic

| File | Role | Notes |
|---|---|---|
| `src/systems/world.js` (64KB) | Sectors, stations, hazards, asteroid fields, jump graph, fuel + jump drive, interdiction, fog-of-war. **`_spawnEnemies` (line ~584) sizes spawns; WANTED-hunter block (line ~606) is the only place heat currently gates lawful spawns.** | Critical for spawn debugging. |
| `src/systems/factions.js` | The ONLY writer of `state.factions[id].rep` + the `aggro` flag (`AGGRO_THRESHOLD = -150`). Emits `faction:aggro` → `heat.js` raises WANTED. The live combat AI reads `ai.lawful`/team/heat, **not** raw rep. | 8 factions, -1000..+1000 / 9 tiers. |
| `src/systems/traffic.js` | Ambient civilian traffic — all `team:2` (haulers, couriers, miners, even flavors named "patrol"/"escort"/"pirate"). Marked `ai.passive`. | Team 2 = neutral civilian. |
| `src/systems/sectorSim.js` | Offscreen sector simulation — consumes `dangerModel.js`, emits economy/faction intents on day boundaries. | Live. No per-frame work — day:tick / sector transitions / save:loaded only. |
| `src/systems/scanner.js` | Scanner pulse (C, 8s cd), seam highlight, wreck/anomaly ping, "?" markers. Feeds `recon_scan` missions. |
| `src/systems/claims.js` / `beacons.js` | Player bases/claims system + claim beacons (`actions.deployBeacon`). |
| `src/data/sectors.js` | Sectors, stations, hazards, POIs. `dangerTier`/`wealthIndex`/`dangerIndex` helpers (line ~254). Sector palettes. |
| `src/data/factions.js` | Faction defs + rep matrix + rep actions. |
| `src/data/sectorAnchors.js` / `narrative.js` | Sector narrative anchors + narrative content. |

---

## Missions, story, onboarding

| File | Role |
|---|---|
| `src/systems/missions.js` (93KB) | Deterministic station boards, 10 mission types, objective tracking. |
| `src/systems/story.js` | 8-beat story spine (co-owns `state.story` with missions.js). |
| `src/systems/onboarding.js` (42KB) | First-hour rail, attention arbiter (one-voice gate), tutorial. Runs last in update order (reads state only). |
| `src/systems/telemetry.js` 📚 | Gameplay telemetry. Created in `main.js`, not a registry system. |
| `src/systems/scenarioRuntime.js` | Scenario/47a runtime. |
| `src/systems/intervention.js` | Dev/intervention hooks + salvage wreck pruning. |
| `src/data/missions.js` | Mission type defs + story beats. |
| `src/data/newGameDefaults.js` | New-game state seed (`NEW_GAME`). |

---

## Ships, modules, outfitting

| File | Role |
|---|---|
| `src/systems/ships.js` (39KB) | The ONLY writer of `entity.derived`/ship stat blocks (`getDerivedStats()`). Shipyard + outfitting logic. `makeShipEntitySpec` default `team:0` (line ~388). |
| `src/systems/wingmen.js` | Wingmen — all `team:0`, same as player. |
| `src/systems/crafting.js` | Refining/manufacturing recipes + build queue. |
| `src/data/ships.js` | 13 ships (T0-T5), prices, slots, tech-gates. Starter = `ship_kestrel` (40u cargo). **No direct GLB reference** — the link is in `src/render/partsLibrary.js`. |
| `src/data/weapons.js` | ONE def per weapon: catalog fields (price/slot/tier/tech) + runtime fields (damageType/dmg/rof/energyCost/heat/projSpeed/range/spread/tracking). |
| `src/data/modules.js` | Modules + the 6-slot × 3-size grid. |
| `src/data/tech.js` | 28-node tech tree. |
| `src/data/flightTuning.js` | Flight tuning constants. |

---

## Render (the asset pipeline runtime side — see `assets/AGENTS.md`)

| File | Role | Notes |
|---|---|---|
| `src/render/renderer.js` (72KB) | WebGLRenderer setup, scene management, render frame (`renderFrame` / split `prepareFrame`+`drawPreparedFrame`). | Perf lane. |
| `src/render/assetLoader.js` (48KB) | Fetches + validates authored GLB parts. **`loadAuthoredPart` (line 100): on ANY contract violation the `.catch` (lines 117-125) records the failure and returns null → `partsLibrary` falls back to procedural geometry (silent, no throw).** | #1 reason "my model won't render." Use `getAuthoredAssetDiagnostic` to see the actual failure. |
| `src/render/partsLibrary.js` (110KB) | Composes ships from parts. **`HULL_FILE_BY_DEF_ID` (line 202) is the LIVE modular hull map** (`ship_kestrel → 'hulls/hull_starter.glb'`, etc.). **`WHOLE_SHIP_FILE_BY_DEF_ID` (line 220) is currently EMPTY** (`Object.freeze({})`) — whole-ship bodies are disabled until SPEC3-37 re-exports complete hull bodies. Pulls from `assets/ships/release/parts/` by default (`PART_RELEASE_ROOT`, line 17; release mode on at `releaseMode.js:1`). | The shipId→GLB link lives HERE, not in `ships.js`. |
| `src/render/releaseMode.js` | `isReleaseAssetMode()` returns `true` unless overridden. | Release is the default game path. |
| `src/render/vfx.js` (131KB) | Pooled GPU particle cloud + additive sprites. Purely cosmetic, event-driven, never writes sim state. Has a good header — read it. `EVENT_LIGHT_POOL_SIZE` is a shader cache key. |
| `src/render/visualFactory.js` (131KB) | World prop / station / structure factory. `applyStructureProfile` controls shell opacity. |
| `src/render/spaceBackground.js` (66KB) / `starfield.js` / `parallaxLayers.js` / `bloom.js` / `feel.js` / `camera.js` | Background, starfield, parallax dust/motes, selective bloom (**never > 0.9 global**), game-feel (shake/trauma), camera (position-follow only, never yaw). | Camera params canonical at ARCHITECTURE §0.14. |
| `src/render/precompile.js` | Shader precompile (hitch elimination). | Perf lane. |
| `src/render/adaptiveQuality.js` / `lod.js` | Dynamic resolution + LOD. |
| `src/render/materialLibrary.js` / `canvasTextures.js` | Material + runtime canvas texture factories. |
| `src/render/GLTFLoader.js` | Three.js GLTF loader (vendored). |
| `src/render/energy/` / `post/` / `ships/` | Energy volume materials, post-processing, ship-specific render helpers. |

---

## UI (DOM overlay)

| File | Role |
|---|---|
| `src/ui/uiRoot.js` (64KB) | Mounts `#ui-root`, manages screen lifecycle. |
| `src/ui/screenManager.js` | Modal screen caching/switching (one visible at a time). |
| `src/ui/hud.js` (90KB) | Always-mounted flight HUD. **Has a good header — read it.** Reads state for display, never mutates sim. |
| `src/ui/radar.js` (33KB) | Radar glyph/IFF pass. |
| `src/ui/targetPanel.js` | Shield/armor/hull segmented bars + in-world target arcs. |
| `src/ui/comms.js` (30KB) | Comms barks (≤12 words, one-voice arbiter). |
| `src/ui/alerts.js` / `toasts.js` / `floatingText.js` / `damageIndicators.js` | Alert queue, toasts, floaters (money/loot/level only), damage numbers (off by default). |
| `src/ui/accessibility.js` | `motionReduce`/`flashReduce` — all shake/hit-stop/FOV effects ×0.25 or off. |
| `src/ui/input.js` / `bindings.js` / `controlPrompts.js` | **UI input handling.** NOT the LOCKED sim input contract — that's `src/systems/input.js` (lead-only). |
| `src/ui/screens/*` | Modal screens: `stationHub.js` (114KB!), `market.js`, `shipyard.js`, `outfitting.js`, `starmap.js`, `localmap.js`, `techTree.js`, `bar.js`, `missionLog.js`, `automationPanel.js`, etc. |

---

## Save, audio, presentation

| File | Role |
|---|---|
| `src/save/saveSystem.js` | Versioned saves (localStorage + JSON export/import), autosave, migrations. **Force-stamps backend defaults at line 1411-1413.** |
| `src/audio/audioSystem.js` / `synth.js` | 100% procedural Web Audio. AudioContext created lazily on first gesture. |
| `src/data/audioRecipes.js` | Synth recipes. |
| `src/systems/presentationOrchestrator.js` + `presentationAdapters.js` 🟢 | Registered presentation system: produces normalized cues, fans them to camera/audio/UI buses. |
| `src/presentation/cueRecipes.js` / `cueSchema.js` 📚 | Cue recipe/schema data (consumed by the orchestrator). Not a registered system. |

---

## Library modules in src/systems/ (NOT registered systems — editing won't change runtime behavior on their own)

These live in `src/systems/` but are imported by other code; they do NOT run every tick on their own:
- `src/systems/dangerModel.js` — imported by `sectorSim.js` only.
- `src/systems/economyCycles.js` — imported by `ui/screens/market.js`.
- `src/systems/alphabet.js` — imported by check scripts.
- `src/systems/gamepad.js` — imported by check scripts + input.js.
- `src/systems/telemetry.js` — instantiated in `main.js`, not the registry.
- `src/systems/touch.js` — touch input helper.

---

## Data catalogs (single-owner — ARCHITECTURE §0.17)

| File | Owner for |
|---|---|
| `src/data/ships.js` | Ships (13, tiers, prices, slots, tech-gates) |
| `src/data/weapons.js` | Weapons (catalog + runtime) |
| `src/data/modules.js` | Modules + slot grid |
| `src/data/tech.js` | Tech tree (28 nodes) |
| `src/data/commodities.js` | The ONE commodity registry |
| `src/data/mining.js` | Ores→asteroids, beams, recipes, fields |
| `src/data/sectors.js` | Sectors, stations, hazards, POIs, palettes, `dangerIndex` |
| `src/data/factions.js` | Factions, matrix, rep actions |
| `src/data/missions.js` | Mission types, story beats |
| `src/data/automation.js` | Drones/traders/outposts |
| `src/data/audioRecipes.js` | Audio synth recipes |
| `src/data/palettes.js` | Faction/sector visual palettes |
| `src/data/enemies.js` | Enemy archetypes + `factionLawful` |
| `src/data/combatDefs.js` | Combat definitions |
| `src/data/flightTuning.js` | Flight tuning constants |
| `src/data/impulseCharges.js` | Impulse charge defs |
| `src/data/blueprints.js` / `claimableBodies.js` | Blueprints + claimable bodies |
| `src/data/scenarios/` | 47a scenario contract + live scene. |

---

## Tooling & tests

| Path | Role |
|---|---|
| `tools/art/` | Asset authoring tools: `finalize_whole_ship.mjs` (npm `build:whole-ships`), `finalize_part.mjs`, `generate_ship_parts_library.py`. |
| `tools/blender/spaceface_export.py` | Blender export script. |
| `scripts/` | All `check:*` scripts, sim harnesses (`sf-sim.mjs`), probes (`probe-*`), build scripts (`build-sg04-release-assets.mjs`, `build-bundle.mjs`). ~100+ scripts — see `package.json` `scripts` for the canonical list. |
| `test/` | Golden telemetry (`47a.telemetry.expected.json` legacy + `47a.telemetry.v3.expected.json` V3), input tapes (`47a.inputs.json`), spec tests. **Never edit `*.expected.json` to pass — fix the code.** |
| `assets/QUEUE.md` | Live asset work queue (current blocker: Kestrel/Pelican/Wasp whole-ship hull bodies missing). |

---

## Where things are NOT (common dead-ends)

- **`src/systems/flight.js` and `src/systems/ai.js` are dead at runtime.** Defaults run V3 + tactical. Editing them appears to work but has no effect. (Verified: zero importers in `src/`, `scripts/`, `test/`.)
- **There is no `src/core/flight/flightDynamics.js`** despite some spec docs referencing it. V3 files are `propulsionCatalog.js`/`propulsionKernel.js`/`flightTelemetry.js` under that dir. `flightDynamics.js` lives one level up at `src/core/flightDynamics.js` (legacy, but still imported by `aiPorts.js`).
- **`WHOLE_SHIP_FILE_BY_DEF_ID` is empty** (`partsLibrary.js:220`). Whole-ship bodies are disabled; default play uses modular hulls (`HULL_FILE_BY_DEF_ID`). Don't add to the whole-ship map until SPEC3-37 re-exports complete hull bodies.
- **`ai.playerWanted` is a dead field** — read in a few places, never written. The canonical wanted check is `heat.isPlayerWanted(state)` (`heat.js:147`).
- **`dangerModel.js` is NOT combat threat** — it's the offscreen sector difficulty kernel. Combat hostility is decided by `aiPorts.isHostile` (team + lawful + heat).
- **`combatants` is not a separate store** (ARCHITECTURE §0.15) — derived per-tick index over `state.entities`.
- **`backdrop-filter` is forbidden** in UI CSS (prior perf pass). Use opaque `rgba(5,9,18,.88)` panels.
- **`design/ARCHITECTURE.md` is NOT the authoritative architecture doc.** The repo-root `ARCHITECTURE.md` is. The `design/ARCHITECTURE.md` is older/different.
- **The working tree ≠ HEAD.** ~202 files / ~17k insertions uncommitted. Always `git diff` before diagnosing — your bug may already be fixed in the working tree, or your "fix" may already exist there. See `AGENTS.md` §3.
