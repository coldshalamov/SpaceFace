# PLANNER BRIEFING — SpaceFace worldbuilding depth program

**Supporting planning reference.** Use the root `AGENTS.md` and `design/program/README.md` as current
routing/status authority. Counts, code shapes, ownership signals, and campaign state below are a
dated research snapshot: verify the relevant seam in the live tree before planning or editing it.

**Your job:** use this briefing and its research to produce implementation-ready chunks with coherent
player-facing outcomes. Exercise current evidence-based judgment; this file is neither a taste
authority nor a reason to avoid live code, checks, manifests, or player-route evidence.

---

## §0. What SpaceFace is (30 seconds)

A **semi-3D top-down space game** for PC/browser. Fly a ship, mine asteroids, trade on a living economy, fight pirates, upgrade ships/modules, jump between sectors, take missions. Inspired by Freelancer, Endless Sky, Rebel Galaxy, the X series. Gritty space-western tone — **Firefly/Serenity** is the north star.

**Tech:** Three.js (r0.160, vendored ES modules + importmap, esbuild bundle for release), DOM/CSS overlay UI, a procedural Web Audio foundation with hybrid sources allowed, and a 60Hz fixed-timestep sim decoupled from rendering. Gameplay is on the **XZ plane (y=0)**. Determinism uses `state.rng` rather than ambient randomness in sim code.

**The depth problem (your reason for existing):** the engine is over-built, but the *surface* is shallow. 13 ships sharing 10 hull meshes. 8 factions collapsing to 5 doctrines. 24 sectors dressing from the same ~13 prop meshes. 0 per-faction station skins. 0 signature landmarks at named zones. 0 unique-loot wrecks. The game feels repetitive not because systems are missing, but because **latent content isn't actualized**. Your plan fixes that.

---

## §1. The research evidence base (read these — they are verified, not stale)

All in `design/depth-program/research/verified/`. Open `README.md` there for the index. The key files:

| File | What it is | Why the planner needs it |
|---|---|---|
| `synthesis.md` | The cross-game comparison table (9 games × 15 dimensions) + **6 depth-producing patterns** + **8-item must-fix list** | This is the *evidence* behind every recommendation. Every plan chunk must trace its "why" to a pattern here. |
| `spaceface_baseline.md` | SpaceFace's current content counts + the 3 structural gaps | The denominator. What we have, what's missing. |
| `sf_asset_expansion_plan.md` | The 98-item creation manifest (8 categories) | The *what*. Your plan operationalizes this. |
| `implementation_pipeline.md` | The 4-track, 5-phase production sequence | The *when*. Your plan refines this with excruciating detail. |
| `endless_sky.md`, `naev.md`, `transcendence.md`, `starsector.md`, `freelancer.md`, `x4_foundations.md`, `rebel_galaxy.md`, `oolite.md`, `pioneer.md` | Per-game verified extractions (cited counts, depth patterns, "what SpaceFace could learn") | Deep reference for *how* each pattern works in a real game. Read the ones most relevant to each plan chunk. |

**The 6 depth patterns (the spine of your plan):**
- **A.** Faction identity is data-driven AND multi-axis (Starsector `.faction` JSON: palette + fleet composition + illegal goods + behavior flags; Naev: 32 factions, self-registering content).
- **B.** Wreckage as progression, not dressing (Freelancer: ~70 hidden wrecks, unique Class 9/10 weapons, rumor-gated).
- **C.** Place identity through signature assets (Freelancer/X4: named zones have corresponding hero visuals).
- **D.** Small-content-deep-feel is achievable (Rebel Galaxy: ~12 ships + audio worldbuilding + role-distinctiveness).
- **E.** Data-driven content partitioning enables scale (Naev: 451 self-registering Lua scripts; Endless Sky: 19 species dirs).
- **F.** Polymorphic schemas + offline sim harnesses (Transcendence: wrecks/stargates are station types; offline economy balancing).

---

## §2. The example pools (490 concepts — your raw material to synthesize, NOT copy)

The user explicitly said: "The plan should not blindly take your examples and describe how to build them, it must take the examples you gave and **synthesize the best parts of each** into concrete plans." So: read all 5 candidates per slot, extract the strongest elements, and produce a *better* synthesized concept that takes the best of each.

| File | Categories | Concepts |
|---|---|---|
| `examples_A_factions.md` | Factions (5 slots × 5) | 25 |
| `examples_B_ships.md` | Ships (20 slots × 5) | 100 |
| `examples_C_landmarks.md` | Landmarks (15 slots × 5) | 75 |
| `examples_D_wrecks.md` | Unique-loot wrecks (12 slots × 5) | 60 |
| `examples_EF_planets_props.md` | Planet states (8×5) + Props (15×5) | 115 |
| `examples_GH_npcs_encounters.md` | NPCs (15×5) + Encounters (8×5) | 115 |

---

## §3. The live code shapes (so you never grep)

### Factions — `src/data/factions.js` (the `.faction` migration target)
Currently a flat array `FACTION_META` of 8+1 entries. Each: `{id, name, short, color, personality, startingRep, homeSectors[], controls[], fleetClass, relations{}}`. IDs prefixed `faction_`. The 8 factions: scn (Concord, lawful-blue), mts (Meridian, corporate-gold), dmc (Drift, blue-collar-orange), reach (Crimson Reach, pirate-red), quiet (smuggler-violet), vael (alien-green, xenophobic), free (Frontier, independent-cyan), choir (zealot-magenta). Plus `faction_helix` (paper — no ships, contracts/dock-deny only).

**The Starsector `.faction` pattern to adopt (from `starsector.md`):** one file per faction carrying: `color`, `logo`, `portraits`, `shipNamePrefix`, `names`, `hullMods`, `illegalCommodities`, `music`, `ranks`, `custom` behavioral flags (`caresAboutAtrocities`, `allowsTransponderOffTrade`, `postsNoBounties`, `offersCommissions`), `shipRoles` (fleet composition weights), `doctrine` (officer counts/personalities), `traits` (captain personality mix). **No code change to add/retune a faction.**

### Palettes — `src/data/palettes.js`
- `FACTION_PALETTES` — 6-field palette per faction: `{primary, secondary, accent, hull, emissive, thruster}`. Existing colors are starting references; new factions earn their identity through the combined silhouette, material, marking, motion, sound, and context rather than an unclaimed-hue rule.
- `PAINT_PROFILES` — keyed by `personality` (lawful/corporate/independent/blue_collar/pirate/smuggler/xenophobic) with `{grime, chrome, noseArt, killMarks, patches}`. **This is the soul of the art direction** — the "dirty outlaw vs clean authority" contrast, data-driven. The player's own ship (Free Frontier/independent) is the "haunted ex-gangster runner": heavy grime, bomber+punk hybrid nose-art, kill marks, repair patches.
- `PLAYER_NOSE_ART` — `{motto: 'BORROWED TIME', mascot: 'ghost', sharkMouth: true, tally: 13}`. The Kestrel's canonical dark-humor graffiti.
- `SECTOR_PALETTES` — environmental palettes per sector.

### Ships — `src/data/ships.js`
`SHIPS` array of 13 defs (T0-T5). Each: `{id, name, role, tier, hull, shield, baseShieldRegen, cargo, mass, handling, bankFactor, driveId, energyCap, energyRegen, collisionRadius, price, buyback, boost, slots, visuals}`. The `slots` block: `{weapon:[sizes/facings], shield, engine, cargo, mining, utility}`. The `visuals` block is **render-only**: `{family, proportions, tiers, hardpoints, engineMounts, cockpit, bridge, drill, cargoRows, sensor}`. Roles: starter/mining/fighter/freighter/multirole/interceptor/mining_barge/corvette/heavy_hauler/explorer/gunship/battlecruiser/flagship. Visuals families: scout/fighter/freighter/miner/frigate/capital/multirole.

### Hull mesh map — `src/render/partsLibrary.js:271-285` `HULL_FILE_BY_DEF_ID`
13 ship defs → 10 distinct hull meshes (3 pairs share). Only Kestrel has a bespoke whole-ship body (`WHOLE_SHIP_FILE_BY_DEF_ID` at :289). Engine map `ENGINE_FILE_BY_DEF_ID` + `ENGINE_FILE_BY_DRIVE_ID` cover all 7 drive IDs.

### Places/props — `partsLibrary.js:59-79` `PLACE_FILES`
27 place GLBs total. Categories: 3 asteroid rocks + 2 special asteroids + 7 station archetypes + 1 gate + 2 nav props + 2 wreckage + 2 industrial + 1 billboard + 4 claim outposts + 3 dock interiors. **Stations are selected by `archetypeGlb` (type-driven, faction NEVER consulted)** — this is the gap the faction-livery fix closes.

### Wreckage — `src/data/wreckClasses.js` (T4c just created)
5 classes: debris (default, no-provenance) / fresh / battlefield / military (restricted) / ancient. Seeded class assignment keyed off `(seed, lossId, sectorId)`. `src/systems/aftermathWrecks.js` persists combat kills as wreckage. `src/systems/lossLedger.js` records losses with provenance. **The wreckage-as-progression gap:** no unique loot, no rumor-gating. The 60 wreck concepts in `examples_D_wrecks.md` fill this.

### The dressing system — `src/systems/world.js:1209-1345`
4 palette-class functions (`_spawnCoreDressing` / `_spawnBeltDressing` / `_spawnFringeDressing` / `_spawnAnomalyDressing`) place props relative to anchors (stations, fields, POIs, gates). Every sector dresses from the same `PLACE_FILES`. New landmarks/props register in `PLACE_FILES` and place via these functions or POI `landmarkGlb` fields.

### Planet factory — `src/render/planetFactory.js`
9 procedural backdrop types (terran/oceanic/gas_giant/arid/rocky/ice/lava/dead/scorched). Shader-driven (`PLANET_FRAG`), atmosphere shell (`ATMSHELL_FRAG`), reuses `uSunDir`/`uTime`/`uSeed` uniforms. **0 interactive planets** — backdrop only. The 40 planet-state concepts in `examples_EF_planets_props.md` add visible-from-orbit story anchors (cracked, burning, ringed-hazard, megastructure-wrapped) without landing (y=0 plane respected).

### Story/encounter — `src/systems/story.js`, `src/story/campaign47a/`, `src/systems/missions.js`, `src/data/encounters.js`
The campaign spine and embodied missions bind story to world signals such as `mining:yield`, `dock:docked`, `scan:completed`, `tether:reel`, and `entity:killed`. `embodiedDialogue.js` has `card()` and `line()` factories. Treat current counts and prose limits as snapshot details to verify in the live code, not planning constraints.

---

## §4. The contracts (inviolable)

### Determinism
60Hz fixed-timestep sim. **NEVER `Math.random()` in sim** — use `state.rng` (mulberry32 seeded). **NEVER wall-clock** — use `state.simTime`. VFX/particles may use `Math.random()` (cosmetic, not serialized). **NEVER edit `test/*.expected.json` goldens** to make a check pass.

### Player-facing and engineering guardrails
- Charted/frontier information, text density, modal/HUD choice, camera behavior, and constraint feel
  must be selected from the current task spec and verified in public play; historical taste recipes
  are references, not blanket bans.
- Keep the clean non-diegetic HUD decision and accessible signal hierarchy.
- Dependencies require documented license, bundle/performance, determinism/save, and maintenance
  impact; they are not rejected merely for being dependencies.
- Never edit goldens just to pass checks. Avoid per-frame allocations in measured hot loops.

### HUD rule (standing user preference)
**Clean NON-diegetic HUD.** No first-person/visor/cockpit motifs — no screen-edge arcs, no helmet avatars, no pilot portraits on the HUD. Non-negotiable.

### Single-writer ownership (`AGENTS.md` §6)
- **Credits** — only `economy` writes `state.player.credits`
- **Reputation** — only `factions` writes `state.factions[id].rep` via `applyRep()`
- **Cargo** — only `cargo` writes `state.player.cargo`
- **Ship derived stats** — only `ships` writes `entity.derived`
- **WANTED heat** — only `heat` writes `state.player.heat`

### Wired Feature Policy
Player-facing features must be **reachable in the default game or intentionally removed.** No "sometimes wired" work. Browser and desktop must see the same assets/defaults.

### Two-implementation awareness (AGENTS.md §5)
LIVE: `flightV3.js`, `tacticalAI.js`+`aiPorts.js`, `rapier-dynamic`. LEGACY (frozen fixtures, don't edit): `flight.js`, `ai.js`, `flightDynamics.js`.

---

## §5. The asset pipeline (critical — this is how GLBs become visible)

**5-step lifecycle:** `Blender (.blend) → export → parts/<category>/<id>.glb → finalize (stamps spacefaceAsset metadata) → build release (meshopt+KTX2) → runtime load (assetLoader validates → partsLibrary composes)`

**3 registries (all required for a wired asset):**
1. `assets/ships/parts/parts_manifest.json` — `parts[]` + `runtimeSlots`
2. `assets/ships/release/release_manifest.json` — auto-written by `scripts/build-sg04-release-assets.mjs` (DO NOT hand-edit)
3. `src/render/partsLibrary.js` — runtime slot lists + `HULL_FILE_BY_DEF_ID` / `PLACE_FILES`

**Why models silently fail:** a broken/missing GLB falls back to procedural geometry with NO error. "It renders" is NOT proof the authored asset is wired. **Always run `npm run check:assets:live` (failureCount:0) + screenshot.**

**Current material-classifier path:** the live renderer recognizes roles such as `Material_Hull`,
`Material_Accent`, and `Material_Emissive`, and `paletteFor(entity)` can tint those roles by faction.
Verify the current classifier before export. These roles enable reuse but are not an exclusive
material vocabulary; extend the documented contract when an authored result needs additional roles.

**Geometry and draw structure:** historical triangle ranges are profiling hints, not visual limits.
Choose geometry, textures, materials, LOD/HLOD, and compression from screen-space exposure and
representative profiling. Merge static detail into sensible material/animated roles, instance reuse,
cull invisible work, and solve measured bottlenecks structurally before reducing visible quality.

**Boot gate:** `src/main.js` refuses flight if authored assets aren't preloaded. Don't weaken it.

**Ownership signals:** inspect `assets/ships/release.__lock/`, `.__building/`, `.__previous/`, active
Blender/export processes, recent writes, and agent ownership together. Coordinate a live overlapping
owner or select non-overlapping work; marker presence alone is not a stop condition.

---

## §6. Historical Wave 4 collision map (verify every row live)

This table records the Wave 4 state observed when the research snapshot was written. It does not grant
current ownership or define current completion. Check `design/program/`, live git state, processes,
and the relevant checks before using a row to select or defer work.

| Depth-program move | Touches | Wave 4 owns? | Safe now? |
|---|---|---|---|
| `.faction` migration (Phase 0.1) | `src/data/factions.js` → `src/data/factions/<id>.js` | NO | ✅ |
| New faction data files (Cat A) | NEW `src/data/factions/<id>.js`, `palettes.js` (additive) | NO | ✅ |
| NPC concepts (Cat G) | `embodiedDialogue.js`, `narrative.js` | NO | ✅ |
| Wreckage-as-progression (Phase 1.1) | `wreckClasses.js`, `aftermathWrecks.js` | YES (T4c) | ⚠️ coordinate |
| Landmark GLBs (Cat C) | `assets/`, `parts_manifest.json`, `partsLibrary.js` | YES (T6) | ⚠️ wait/clear |
| New check scripts (Phase 0.3) | `scripts/check-*.mjs`, `package.json`, `registry.js` | PARTIAL (T8) | ⚠️ coordinate on registry.js |
| Example pool selection | `design/depth-program/research/verified/examples_*.md` only | NO | ✅ |

**Safe to start immediately (zero collision):** the `.faction` migration, new faction data files, NPC authoring, example synthesis.

**Must coordinate:** anything touching `registry.js` (T4 added ~10 systems), `wreckClasses.js`/`aftermathWrecks.js` (T4c owner), `parts_manifest.json`/`partsLibrary.js` (T6/graphics lane).

### The creative reframe — Wave 4 built your substrate, not just your obstacles

The collision map reads as "what to avoid." Read it instead as **what you get to build on.** Wave 4 didn't just lock files — it shipped systems your depth program *rides on*:
- **T4c's `lossLedger.js` + `wreckClasses.js`** are the provenance backbone your wreckage-as-progression loop (Freelancer pattern) attaches to. The loss is already recorded with a seeded id; your named wrecks with unique loot *consume* that provenance. That's not a collision — it's a gift.
- **T4d's pirate ecology** (`pirateDoctrines.js`, `namedAces.js`, `aceMemory.js`, `pirateRumor.js`, `ambushSignatures.js`) gives you the doctrine + named-rival + rumor-leak machinery your new pirate ships and wreck rumors plug into.
- **T4b's causal economy** (`contractClauses.js`, `moralTraps.js`, `economyContractTemplates.js`) gives you the clause/moral-trap layer your new mission types wrap around.
- **T4a's sector atmosphere** (`stationBubbles.js`, `stationGlyphs.js`, `hazardLanguage.js`, `dangerGradient.js`) gives you the per-station/per-hazard surfacing your faction liveries and landmark lore display through.

**When you plan, treat these as your foundation, not your competition.** The depth program's job is to *fill* these systems with memorable content, not rebuild them.

---

## §7. The tools the build agents will have

- **Blender MCP** — full Blender control (modeling, materials, GLB export). The build agents can sculpt, texture, and export assets. The export script is `tools/blender/spaceface_export.py`; finalization is `tools/art/finalize_whole_ship.mjs` / `finalize_part.mjs`.
- **Computer use + browser use** — build agents can playtest in the browser (`http://localhost:8123/`), take screenshots, verify visually. **They MUST verify each asset actually loads (not silent procedural fallback) via screenshot + `check:assets:live`.**
- **All standard agentic tools** — file read/write/edit, bash, etc.
- **Web search** — available if research is needed mid-build (use sparingly).
- **Review/QA/iteration** — build agents must self-verify: run the check, screenshot, iterate until green.

---

## §8. Aesthetic references to test in the current game

The established gritty space-western direction and existing fiction are useful starting references,
not a closed style bible. Test each choice against current GDD intent and representative game captures:
- **Lived-in, not pristine.** Ships have histories — grime, repair patches, kill marks, hand-painted nose art. The `PAINT_PROFILES` system encodes this; lean into it.
- **Dark humor, not grimdark.** "BORROWED TIME" graffiti. Bureaucratic horror (REF-44C paperwork, Director Vale). The tone in `narrative.js` and `barks.js` — terse, loaded, slightly literary.
- **Bold and unique over safe.** Avoid generic tropes. The faction concepts in `examples_A_factions.md` lean this way (the Fulfillment = a feral logistics-AI still fulfilling orders for a dead corporation; the Verge-Layers = dormant gate-builders nobody is minding). Push further.
- **Edgy, dark, exciting.** The galaxy is full of things that were here before you, maintained by systems nobody is minding, and the paperwork is starting to talk back.
- **Shoot for the moon in design quality.** Every asset, every faction, every wreck should be the kind of thing a player remembers a year later.

---

## §9. Acceptance checks (what "done" means per change type)

| After touching… | Run |
|---|---|
| Assets / manifests / `src/render/**` | `check:asset-reachability`, `check:assets:live` (failureCount:0), `check:visual-stability` |
| Flight or render loop | `check:flight:clean`, `check:assets:live`, `check:perf` |
| Sim / determinism-affecting | `check:sim:compare` (hashEqual:true) + `check-tether-gameplay.mjs` |
| Story / narrative | `check:story-beats`, `check:encounter-director`, `check:encounter-voice` |
| Missions | `check:mission-standing-ladder` |
| UI / a11y | `check:ui-a11y`, `check:wcag-contrast` |
| Broad | `npm run check` (full gate) |

**Always:** screenshot pair into `.devshots/` for visual work. **Transcripts are not proof — checks are.**

---

*This briefing was assembled by ZCode on 2026-07-12 from verified working-tree reads + the 9-game research program. Every code shape and count is current. If anything in the repo contradicts this, the repo is stale — trust this briefing (and flag the contradiction).*
