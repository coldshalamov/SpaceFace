# SpaceFace — Current Content Baseline (the gap to close)

**Purpose:** establish SpaceFace's current content counts as the denominator for the depth-gap analysis. Every number here is verified from the working tree (cited to `file:line`), produced by the audits at the start of this session. This is the "SpaceFace column" the synthesis will compare against the 10 researched games.

**Audit date:** 2026-07-12. **Method:** direct `src/data/*` and `src/render/*` file reads via subagent.

---

## Counts (all verified from working tree)

| Entity | Count | Source (file:line) |
|---|---|---|
| **Player-flyable ships** | **13** (T0–T5) | `src/data/ships.js:1` header; defs at :33–392 |
| **Ship tiers** | 6 (T0 starter → T5 flagship) | `ships.js` `tier` field per def |
| **Distinct hull meshes** | **10** (3 ship-pairs share a mesh: Pelican/Ironback, Mule/Atlas, Drifter/Ranger, Colossus/Leviathan) | `src/render/partsLibrary.js:271-285` `HULL_FILE_BY_DEF_ID` |
| **Bespoke whole-ship bodies** | **1 of 13** (only Kestrel; other 12 are modular) | `partsLibrary.js:289-291` `WHOLE_SHIP_FILE_BY_DEF_ID` |
| **Enemy archetypes** | **8** (swarmer, sniper, brawler, fleeing-trader, pirate, corsair, patrol, dreadnought-boss) | `src/data/enemies.js:1` header |
| **Named ace bosses** | 3 (Yara No-Cut, Toll Saint Venn, Mako Broken Ring) | `src/data/namedAces.js` |
| **Named captains** | 3 (Sable Iask, Redcut Sorrel, Vane Ash) | `src/data/encounters.js:316` |
| **Weapons** | **13** (S/M/L across energy+kinetic) | `src/data/weapons.js:1` (header says 12; array has 13) |
| **Non-weapon modules** | **35** | `src/data/modules.js` |
| **Drive types** | 7 | `src/data/ships.js` `driveId` field |
| **Factions (code-active)** | **8 + 1 paper** (scn, mts, dmc, reach, quiet, vael, free, choir + helix paper) | `src/data/factions.js:6-81` |
| **Fleet doctrines** | **5** (8 factions collapse onto 5 doctrines: federation/syndicate/independent/pirate/mercenary/alien) | `factions.js` `fleetClass` field |
| **Sectors** | **24** (10 core + 14 frontier) | `src/data/sectors.js:253-261`; frontier in `frontierRegions/{west,north,east,south}.js` |
| **Sector palettes (visual themes)** | **4** (core/belt/fringe/anomaly — fog/nebula recolor only) | `sectors.js:16-37` |
| **Station types** | **7** (trade_hub, refinery, mining, fab, military, blackmarket, research) | `sectors.js:13-14`; GLB map at `partsLibrary.js:44-53` |
| **Per-faction station skins** | **0** — station GLB chosen by type, faction never consulted | `world.js:1010` `archetypeGlb: st.archetypeGlb` |
| **Asteroid gameplay types** | **6** (common rock, metallic, icy, crystalline, gas cloud, rare exotic) | `src/data/mining.js:93-124` |
| **Asteroid visual meshes** | **1 family** (3 dressing variants; mineable instances all share one mesh family, shader-only differentiation) | `src/render/visualFactory.js:1704-1709` |
| **Ores** | ~20 | `mining.js:54-89` |
| **Commodities** | ~45 | `src/data/commodities.js` |
| **Star systems/planets interactive** | **0** — planets are non-interactive procedural backdrop only | `src/render/planetFactory.js`; no planet POI type |
| **Planet types (backdrop)** | 9 procedural (terran, oceanic, gas giant, arid, rocky, ice, lava, dead, scorched) | `planetFactory.js:24-31` |
| **Named zones** | ~38 (e.g. "Cruiser Graveyard," "Iron Maw Approach") | `src/data/sectorZones.js:68-226` + frontier |
| **Signature landmark props per named zone** | **0** — every zone dresses from same ~13 shared prop meshes | `src/systems/world.js:1209-1345` dressing fns |
| **Place/prop GLB meshes total** | **27** (3 asteroid rocks + 2 special + 7 stations + 1 gate + 2 nav + 2 wreckage + 2 industrial + 1 billboard + 4 claim outpost + 3 dock interior) | `assets/ships/parts/places/`; `partsLibrary.js:59-79` |
| **Wreck classes** | 5 (debris/fresh/battlefield/military/ancient) with provenance | `src/data/wreckClasses.js:30-71` |
| **Wreckage systems** | 3 layered (POI derelicts, class taxonomy, combat-aftermath persistence) | `src/systems/aftermathWrecks.js` |
| **Mission archetypes** | **10** (all single-stage fetch/kill/scan) | `src/data/missions.js:113-194` |
| **Hand-authored missions** | **0** — fully procedural generator | `src/systems/missions.js:515` `_generateOffers` |
| **Story beats (spine)** | **8** (cold_start → deep_reach) | `src/data/missions.js:212-229` |
| **Embodied story missions (campaign 47-A)** | 8 (one per beat, partially embodied) | `src/story/campaign47a/embodiedMissions.js:82-178` |
| **Endings** | 5 (A–E + sandbox) | `src/story/endings/endingDefs.js:38-207` |
| **Story contacts** | 10 | `src/story/campaign47a/embodiedDialogue.js` |
| **Encounter archetypes** | 12 | `src/data/encounters.js` |
| **Encounter scripts** | 12 | `src/systems/encounterScripts.js:782` |
| **Economy profiles (regional)** | 26 | `src/data/regionalEconomyProfiles.js` |
| **Bark dialogue lines** | 189 (8 factions × 8 situations) | `src/data/barks.js` |
| **Prose content (narrative/comms/graffiti)** | ~2,055 lines | `src/data/narrative.js` + flavor corpora |
| **Worldbuilding docs** | 23 | `docs/worldbuilding/story/` |

---

## The three structural gaps (where SpaceFace is shallow, in priority order)

These are the synthesis-ready findings — each maps to a depth-program pipeline (P1–P4) and each will be cross-referenced against the competitor research in `synthesis.md`.

### Gap 1 — Spatial sameness (the biggest "feels repetitive" driver)
- **24 sectors dress from the same ~13 prop meshes.** Every `wreck`/`derelict` zone uses generic `place_dead_hulk`. Named zones ("Cruiser Graveyard") promise hero assets they don't have.
- **0 per-faction station skins.** A Concord trade_hub and a Meridian trade_hub look identical — faction is never consulted in GLB selection (`world.js:1010`).
- **12 of 13 ships share 10 hull meshes;** only Kestrel has a bespoke body.
- **All 6 asteroid types share one mesh family**, differentiated by shader only.
- **Planets are non-interactive backdrop** — 0 planet POIs, 0 cataclysmic/scared worlds, 0 landing/mining.
- *Maps to:* **P1 (Landmarks)** + **P3 (Faction Kits)** + whole-ship body graphics lane.

### Gap 2 — Narrative under-actualization (story laid out, not staged)
- The 8-beat spine is **partially embodied** (campaign-47a) but beats are thin: B0 is "mine, then dock." Only B2 (`first_blood`) has scan→tether + named target + aftermath — that's the shape *every* beat should have.
- ~2,055 lines of prose exist but land mostly as comms popups, not playable set-pieces.
- *Maps to:* **P2 (Story-Beat Embodiment).**

### Gap 3 — Activity-shape monotony (no amount of art fixes this)
- **10 mission archetypes, all single-stage, single-destination, single-threshold.** Fetch/kill/scan variants only. No multi-stage, no branching, no time-pressured set-pieces outside the story spine.
- **8 factions collapse to 5 fleet doctrines** — enemies fly the same regardless of who you fight.
- *Maps to:* **P4 (Set-Piece Mission Types)** + doctrine tuning.

---

## What SpaceFace already does well (don't re-build these)

- **Systems architecture:** 33 systems, fixed 60Hz sim, determinism-gated, full economy/war/rep/heat loops. Production-scale.
- **Wreckage aftermath system:** 3-layered (POI + class taxonomy + combat persistence). Genuinely rich — competitor games mostly have simpler versions.
- **Economy depth:** 45 commodities, 26 regional profiles, supply/demand model. Deeper than most genre comparators.
- **Prose/voice:** 189 barks in distinct faction registers, 5 literary endings. Aspirations to thematic density.
- **Encounter director:** 12 archetypes, named captains with memory. A real living-universe scaffold.

The depth program should **fill the three gaps**, not touch the strengths.
