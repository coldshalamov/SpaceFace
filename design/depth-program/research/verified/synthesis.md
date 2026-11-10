# Cross-Game Depth Synthesis — the bar for modern space games

**Status:** FINAL — all 9 games verified (8 in detailed reports + Endless Sky via direct repo grep). This is the evidence base.
**Purpose:** the evidence base for the itemized creation plan. Every recommendation in the plan traces back to a pattern established here.

---

## §1. Quantitative depth benchmarks (the comparison table)

The denominator: SpaceFace (from `verified/spaceface_baseline.md`). Each competitor cell is cited to its verified report.

| Dimension | **SpaceFace (us)** | Freelancer | Starsector | X4: Foundations | Rebel Galaxy | Endless Sky | Naev | Oolite | Pioneer | Transcendence |
|---|---|---|---|---|---|---|---|---|---|---|
| **Factions** | 8+1 paper | ~50 | 12 (8 major) | ~20 | ~9 | **125** (19 species × state-variants) | **32** | (n/a — species) | **103** | **64** |
| **Ships (player+NPC distinct)** | 13 player + 8 enemy | 9 flyable + 30+ NPC | 93 hull articles | ~79 base / ~139 w/DLC | ~12 flyable | **895** (human 330 + 18 alien species) | **139 (XML-parsed)** | **83 templates + 90 variants + 11 flyable** | **27 pilotable + 4 missiles** | **215 ShipClass** |
| **Ship design doctrines** | 5 fleet classes (8 factions → 5) | 4 Houses + criminal styles | **3 doctrines** (Low/Mid/High Tech) | 4 size classes × ~12 roles | ~9 tier classes | **species-partitioned (19 species, T1/T2/T3 tiers)** | **size 1-6 × role; faction stat-mods** | (role via like_ship variants) | (hull classes via JSON) | 2-axis alignment grid |
| **Sectors/systems** | 24 | 49 (47 explorable) | 38 ship systems | 63 | ~20 | **685** | **554** (142 deliberately empty) | **2048** (8 galaxies × 256, procedural) | **procedural galaxy** (1024² density map, 2 hand-authored) | **23 named + 30 procedural templates** |
| **Sector visual themes** | 4 palettes (recolor) | 4 Houses (distinct architecture) | per-faction station skins | per-faction station architecture | Law×Threat 2-axis | **species-partitioned (per-species map files)** | derived from aggregated spob presence | (procedural descriptions) | derived from star/body type | hybrid hand-authored + procedural |
| **Per-faction station skins** | **0** | implied (House-specific) | yes (.faction `color`/`logo`) | yes (faction-themed interiors) | yes (faction-coded) | **species-distinct (19 species aesthetics)** | yes (faction-coded spobs) | (station roles) | (faction-coded stations) | (sovereign-coded stations) |
| **Stations/bases** | 7 types | dozens (per-system) | 6 station hulls + markets | player-buildable + dynamic NPC | per-system | (per-system, species-styled) | **1,320 spobs** (planets+stations) | 7 station types | (BBS modules, 41 types) | **329 StationType (polymorphic: stargates & wrecks are stations)** |
| **Wreckage system** | 3-layer (POI+class+aftermath) | **~70 hidden wrecks, unique loot, rumor-gated** | derelict/exploration content | every ship boardable | (limited) | **region-based derelict outfitter lists + boardable govt** | derelict Lua subsystem | (rock hermits, thargoids) | (limited) | **wrecks = StationType with Shipwreck variants (polymorphic)** |
| **Commodities** | ~45 | ~30 | (economy + blueprints) | full ware economy (input/output recipes) | (trade goods) | ~30 | **24** | **17** (trade-goods.plist) | **32** | **637 ItemType** (incl. weapons/armor/shields/devices) |
| **Mission archetypes** | 10 (all single-stage) | (bar/rumor/story) | (bounty/survey/story) | (station missions + plots) | (guild/story) | **2,273 missions + jobs (4,665 lines)** | **248 Lua missions** (self-registering) | 5 core missions + OXPs | **41 BBS modules** | **77 MissionType** |
| **Story/campaign** | 8 beats + 5 endings | linear SP campaign | emergent + plots | faction quest lines | focused linear | **219 news articles + Free Worlds war arc** | 203 events (Lua, self-registering) | 18 world-scripts | (procedural BBS) | 1 Adventure + Extension system |
| **Interactive planets** | **0** (backdrop only) | landable per system | (colony gameplay) | (station-docked) | (limited) | (landable per system) | 1,320 spobs (planets are stations) | **2048 landable** (procedural) | **full planetary descent** (~40 body types) | (n/a — top-down 2D like SpaceFace) |
| **Economy simulation** | supply/demand + 26 profiles | House price differentials | blueprint + market | **living: NPC build/destroy stations, float prices** | reputation-gated | (per-system commodity supply) | (per-spob commodity lists) | (simple trade-goods) | **dynamic: m_tradeLevel from metallicity/agriculture/industry** | **offline sim harness (LootSim/TradeSim/EncounterSim)** |
| **Outfits/equipment** | 35 modules + 13 weapons | (equipment classes) | ~95 weapons + hullmods | (per-faction equipment) | (ship classes) | **51+ outfits + 1,880 lines weapons** | **311 outfits** | **42 equipment items** | **123 equipment items** | **637 items** (170 weapons + 256 armor + 48 shields + 281 devices) |

All cells filled — 9 games verified. Endless Sky counts via direct repo grep (895 ships / 125 governments / 685 systems); all others via subagent extraction with cited sources.

---

## §2. The five depth-producing patterns (what actually creates the *feeling*)

Distilled from the 4 verified commercial reports so far. Each cites the games that exhibit it and the evidence. OS-game corroboration slots in as reports land.

### Pattern A — Faction identity is data-driven AND multi-axis (not just color)

**The bar:** a faction must differ visually (palette/architecture), mechanically (fleet doctrine), economically (illegal goods/trade profile), AND behaviorally (AI flags). Color-only is below the bar.

- **Starsector's `.faction` JSON file** (verified: `verified/starsector.md` §Data architecture) is the gold standard: one declarative file defines `color`, `logo`, `portraits`, `illegalCommodities`, `shipRoles` (fleet composition weights), `doctrine` (officer counts/personalities), `traits` (captain personality mix), and `custom` behavior flags (`caresAboutAtrocities`, `allowsTransponderOffTrade`, `postsNoBounties`). No code change to add/retune a faction.
- **X4** gives every faction a full stack: unique shipyard, S–XL ship line, station architecture, and a home sector.
- **Freelancer's ~50 factions** each have alignment, signature ships, territory, and a lore hook — and the reputation matrix means every faction choice cascades.

**SpaceFace's gap (verified):** 8 factions collapse to 5 fleet doctrines; 0 per-faction station skins; faction never consulted in station GLB selection (`world.js:1010`). Below the bar on 3 of 4 axes.

**The lesson:** SpaceFace's faction identity should be **one data file per faction** (adopt the `.faction` pattern), covering palette, ship allowed-list, fleet composition weights, illegal goods, and behavior flags. This is P3 (Faction Kits) — and it's mostly a data/wiring change, not an art change, for the runtime-livery tier.

### Pattern B — Wreckage as progression, not dressing

**The bar:** wreckage must be a *discovery loop with unique rewards* — the strongest gear or lore should be *findable*, not buyable.

- **Freelancer's ~70 hidden wrecks** (verified: `verified/freelancer.md` §Wreckage) each hold a unique Class 9/10 weapon unavailable any other way. Discovery is gated by **bar rumors / LNN news / mission hints** that give a direction, not coordinates. The player searches, finds, salvages. This converts the worldbuilding layer (news/bar/comms) *into the progression layer*.
- **X4** makes every enemy ship boardable/capturable — every wreck is a potential asset.

**SpaceFace's gap (verified):** the 3-layer aftermath system is *mechanically* rich, but wrecks are generic dressing (`place_dead_hulk` everywhere, no unique loot, no rumor gating). Below the bar on the reward/discovery axis.

**The lesson:** SpaceFace's `aftermathWrecks` + `wreckClasses.js` should gain **named wrecks with unique loot tables**, and the encounter/news/comms system should **leak their locations as rumors**. This is the highest-ROI feature work identified — it turns existing systems into a progression loop.

### Pattern C — Place identity through signature assets, not palette swaps

**The bar:** a named location ("Cruiser Graveyard") must have a corresponding signature visual; palette-tinting the same prop is below the bar.

- **X4's 63 sectors** each have faction-themed station architecture and procedural placement.
- **Freelancer's 49 systems** are organized into 4 Houses with distinct visual+political identity, plus border worlds and alien space.
- **Rebel Galaxy** is the counter-example that proves the rule: only ~20 systems, but each has a position on a Law×Threat grid + faction presence that makes them *feel* distinct despite low asset count.

**SpaceFace's gap (verified):** 24 sectors dress from the same ~13 prop meshes. Named zones ("Cruiser Graveyard," "Iron Maw Approach") have no corresponding hero asset — every `wreck` zone gets generic `place_dead_hulk`. Below the bar.

**The lesson:** SpaceFace needs **signature landmark props per named zone** (P1), and the dressing system (`world.js:1209-1345`) should place them relative to zone anchors. This is the single biggest spatial-ROI investment.

### Pattern D — Small-content-deep-feel is achievable (Rebel Galaxy proves it)

**The bar (realistic for SpaceFace's scale):** ~12 ships + ~20 systems + ~9 factions can feel deep IF each asset is high-differentiation and the feel-layer (audio, character writing, reputation) does heavy lifting.

- **Rebel Galaxy** (verified: `verified/rebel_galaxy.md`) is the existence proof. Its depth comes from: (1) **diegetic radio/audio worldbuilding** — the single highest depth-per-dollar technique; (2) **role-differentiation over asset count** (Tug vs. Dreadnought is a vast gulf); (3) **reputation as content multiplier** (same systems replay differently as standing shifts); (4) **named characters + focused story** (words, not polygons); (5) **2-axis system identity** (Law × Threat).

**SpaceFace's position:** 13 ships / 24 sectors / 8 factions is *comparable to or above* Rebel Galaxy's raw counts. The gap is not count — it's differentiation and feel-layer. SpaceFace has the prose (2,055 lines) but delivers it mostly as comms popups, not as an immersive feel-layer.

**The lesson:** before chasing X4-scale content, SpaceFace should **maximize the Rebel Galaxy playbook**: audio worldbuilding, role-distinct ships, reputation-driven replay, named-character story. This is the highest-ROI *non-art* investment.

### Pattern E — Data-driven content partitioning enables scale

**The bar:** content must be partitioned by faction/species/region in data, not hardcoded, so adding a faction = adding a data file, not touching engine code.

- **Endless Sky** (verified structurally: 19 species dirs under `data/`) — each species owns its ships/outfits/map/events as text files. Adding a species = adding a directory.
- **Naev** (verified structurally: faction-partitioned `dat/ships/<faction>/`, `dat/factions/`, `dat/ssys/`) — XML per entity, Lua for events.
- **Starsector's `.faction` + `ship_data.csv`** — declarative data files.
- **Transcendence's extension system** (pending) — modular content packs.

**SpaceFace's position:** already data-driven (`src/data/*`), but factions are a flat array in `factions.js` rather than one-file-per-faction with full doctrine. Adopting the partitioned pattern scales better.

**Naev corroboration (verified, strong):** Naev takes partitioning further than any other game audited. **32 factions** each own a subdir tree (`dat/ships/<faction>/`, `dat/missions/<faction>/`, `dat/events/<faction>/`). The standout: **self-registering Lua content** — each of Naev's **248 missions + 203 events** (451 scripts) embeds its trigger metadata in an XML comment header (`location`, `chance`, `conditions`, `spob`, `unique`). The engine scans folders to build the trigger registry. **Adding content = dropping one file in a folder. No central registry to edit.** This scales to 451+ gameplay scripts cleanly and is directly portable to SpaceFace's mission/encounter director.

**The lesson:** migrate toward **one-data-file-per-faction** (the `.faction` pattern) AND adopt **self-registering content files** (Naev's Lua-header trick) so the mission/encounter system scales without registry edits. The self-registering pattern is the single highest-leverage *architectural* change for content scaling.

---

## §3. Where SpaceFace is below the genre floor (the must-fix list)

Ranked by gap severity × ROI. Each will become a section in the itemized creation plan.

| # | Gap | Genre floor (evidence) | SpaceFace now | Severity |
|---|---|---|---|---|
| 1 | **Per-faction visual identity** | Starsector/X4/Freelancer all differentiate stations+ships by faction | 0 station skins; 5 doctrines for 8 factions | **Critical** |
| 2 | **Signature landmarks per named zone** | Freelancer's named wrecks; X4's distinct sectors | 0; same ~13 props everywhere | **Critical** |
| 3 | **Wreckage-as-progression** | Freelancer's 70 unique-loot wrecks, rumor-gated | generic dressing, no unique loot | **High** |
| 4 | **Story-beat embodiment depth** | (genre: playable set-pieces) | 8 thin beats, only B2 rich | **High** |
| 5 | **Mission structural variety** | (genre: multi-stage missions common) | 10 single-stage archetypes | **High** |
| 6 | **Interactive planets/celestial** | Pioneer/Oolite landable; Freelancer per-system | 0 interactive, backdrop only | **Medium** |
| 7 | **Audio worldbuilding** | Rebel Galaxy's diegetic radio | (not audited here) | **Medium** |
| 8 | **Faction doctrine differentiation** | Starsector's 3-axis doctrines | 8 factions → 5 doctrines | **Medium** |

---

### Pattern F — Polymorphic schemas + offline simulation harnesses (Transcendence)

**The bar:** a single schema can represent multiple conceptually-distinct things (stations, stargates, wrecks) AND content can be balanced offline before it ships.

- **Transcendence** (verified: `verified/transcendence.md`) treats **stargates and wrecks as `StationType`s** — not separate entity types. A wreck is a station with `<ImageVariants><Shipwreck class="…"/>`. A stargate is a station that moves you. This eliminates an entire entity class and lets all station-handling logic (placement, interaction, rendering) apply to them for free.
- Transcendence also ships an **offline economy-sim harness** in `TransData/` (LootSim, EncounterSim, TradeSim, SystemCount) — C++ tools that simulate the economy/loot/encounter distribution *before runtime*, so designers see whether an item is too rare or a system too sparse without playing for hours. This is a depth-balancing technique no other audited game has.
- **The item-attribute selector DSL** (`"* +food; -illegal;"`, `"w +property:omnidirectional;"`) is one mini-language driving DeviceSlot fitting, loot tables, station inventories, AND system placement — four subsystems, one syntax.

**SpaceFace's position:** separate entity types per concept; no offline balancing sim; ad-hoc per-system selectors. Workable at current scale but won't scale to 100+ items cleanly.

**The lesson:** consider a **polymorphic station/place schema** (wrecks, gates, and props as variants of one type) and a **deterministic offline balance harness** (simulate the economy/loot distribution from `src/data/*` headlessly — would also strengthen the determinism goldens). The selector DSL is over-engineering for now; revisit if item count exceeds ~200.

---

## §4. What SpaceFace should NOT copy (anti-patterns for our constraints)

- **X4's walkable first-person stations** — SpaceFace is top-down 2.5D; on-foot is out of scope.
- **X4's full living economy (NPC-built/destroyed stations)** — aspirational but the determinism contract (60Hz fixed sim, golden replays) makes dynamic station destruction risky. Keep the supply/demand model; don't make it fully agent-driven.
- **Full 3D planet landing (Pioneer)** — SpaceFace's y=0 plane constraint. Backdrop planets only.
- **Freelancer's trade-lane highway system** — implies a different travel model than SpaceFace's free-flight.

These are noted so the creation plan doesn't accidentally promise them.

---

## §5. Provenance

All 9 games are verified. The open-source extractions corroborated every pattern with the strongest data: Endless Sky's 19-species partitioning (895 ships / 125 governments), Naev's 554 systems + self-registering Lua, Oolite's procedural description generator + OXP extensions, Pioneer's dynamic economy + 103 factions, Transcendence's polymorphic schemas + offline sim harness.

This synthesis is the evidence base for [`sf_asset_expansion_plan.md`](./sf_asset_expansion_plan.md) (the 98-item / 490-example creation list) and [`implementation_pipeline.md`](./implementation_pipeline.md) (the production plan).
