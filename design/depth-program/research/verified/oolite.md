# Oolite — Verified Content Inventory

> Elite-style space trader, origin of the modern space-trader genre. Verified by
> reading the actual files in `/tmp/sf-research/repos/oolite/`. All counts and
> examples are sourced from those files.
>
 - Data root: `oolite/Resources/`
 - Config (data tables): `oolite/Resources/Config/`
 - Scripts/AI: `oolite/Resources/Scripts/`, `oolite/Resources/AIs/`
 - Models: `oolite/Resources/Models/`
 - Source: `src/Core/` (Objective-C; `OOSystemDescriptionManager`, `OOOXZManager`,
   `OOStringExpander`)

NOTE on path convention in this document: the brief used
`oolite/Resources/...`; the actual clone layout is one level flatter
(`<repo>/Resources/...`). Every path below is the real path in the clone.

---

## Counts

| Thing | Count | Source path |
|---|---|---|
| Top-level shipdata entries | **189** | `Resources/Config/shipdata.plist` (tokenizer parse) |
| Canonical ship **templates** (carry the real stats) | **83** | `Resources/Config/shipdata.plist` (`oolite_template_*` keys) |
| Named ship entries that inherit a template (`like_ship`) | **90** | `Resources/Config/shipdata.plist` |
| Flyable **player** ships | **11** | `shipdata.plist` entries with `roles = "player"` |
| Station types | **7** | `shipdata.plist` roles containing `station` |
| Equipment items (`EQ_*`) | **42** | `Resources/Config/equipment.plist` |
| Commodities (trade goods) | **17** | `Resources/Config/trade-goods.plist` (no `commodities.plist` exists) |
| AI behavior scripts | **62** files | `Resources/AIs/` (mix of `.plist` FSMs and `.js` priority AIs) |
| Core world-scripts (loaded every game) | **18** | `Resources/Config/world-scripts.plist` |
| Core story missions | **5** | `world-scripts.plist` "Missions" section |
| Procedurally-described star systems | **2048** (8 × 256) | `Resources/Config/planetinfo.plist` (`random_seed =` count = 2048) |
| Galaxies | **8** | `src/Core/OOTypes.h` `kOOMaximumGalaxyID = 7` |
| Systems per galaxy | **256** | `src/Core/OOTypes.h` `kOOMaximumSystemID = 255` |
| Mesh/model files (`.dat`) | ~140+ | `Resources/Models/` |
| Mission-text lines file | 498 lines | `Resources/Config/missiontext.plist` |
| Start scenarios | 4 | `Resources/Scenarios/` (easy, standard, strict, tutorial) |

Caveat: the 189 top-level entries include templates, real ships, pirate/police
**variants**, missiles/mines, asteroids, debris ("cinder", "splinter", "alloy"),
buoys, escape pods, and pure subentities (turrets, docking slits). The 83
templates are the cleanest definition of a "ship type"; the 90 named entries
are the per-role instances actually spawned.

---

## Factions

Oolite has **no faction system in the data-driven sense** (that is a Pioneer
concept). Instead it has the classic Elite **government + economy** axis per
system, plus the **Thargoid** alien antagonist faction (defined as ships with
roles `thargoid`, `thargoid-mothership`, `tharglet`, `thargon` in
`shipdata.plist` and dedicated AI files `oolite-thargoidAI.js`,
`oolite-thargletAI.js`). Police are tied to the "GalCop" authority via
`oolite-policeAI.js` and the `viper` / `viper-interceptor` ships. The political
texture is government tiers (anarchy → corporate state → democracy, etc.),
encoded as the integer `government` field in `planetinfo.plist`.

---

## Ships

Verified from `Resources/Config/shipdata.plist`. Stats live on the templates;
variants inherit. `speed` = `max_flight_speed`; `miss` = `max_missiles`;
`ecm` = `has_ecm`. Canonical Elite ship types (template stats):

| Template | Speed | Missiles | ECM | Roles (sample) |
|---|---|---|---|---|
| adder | 240 | 1 | 0.01 | trader, pirate-light-fighter, scavenger, shuttle, hermit-ship |
| anaconda | 140 | 7 | 0.95 | escort |
| asp | 400 | 1 | 0.85 | trader-courier, hunter-medium/heavy, pirate-medium/heavy-fighter, assassin-heavy |
| boa | 240 | 4 | 0.75 | escort |
| boa-mk2 | 312 | 5 | 0.95 | escort |
| cobra3 (Cobra Mk III) | 350 / 300 variants | 4 | 0.15–0.95 | trader, hunter, pirate-heavy-fighter, scavenger, sunskim-trader |
| cobramk1 (Cobra Mk I) | 260 | 1 | – | pirate, hunter, trader, miner, escort, assassin-light |
| constrictor | 600 | – | yes | constrictor (mission ship) |
| ferdelance (Fer-de-Lance) | 300 | 2 | yes | trader, pirate-heavy-fighter, hunter, assassin-medium |
| gecko | 300 | – | – | hunter, pirate-light/medium-fighter, escort |
| krait | 300 | – | – | pirate, hunter, escort, assassin-light |
| mamba | 320 | – | – | pirate, pirate-light-fighter, hunter |
| moray (Moray Star Boat) | 300 | 2 | – | trader, hunter, pirate-medium-fighter, escort, assassin-light |
| python | 200 | 2 | – | trader, pirate-light-freighter |
| sidewinder | 370 | – | – | pirate, pirate-light-fighter, hunter |
| thargoid | 500 | – | yes | thargoid, thargoid-mothership |
| tharglet | 450 | – | – | tharglet, thargon |
| viper (police) | 320 | – | yes | police |
| viper-interceptor | 520 | – | yes | interceptor, wingman |
| missile | 750 | – | – | missile, EQ_MISSILE |
| qbomb (Quirium Cascade Mine) | 1000 | – | – | energy-bomb, EQ_QC_MINE |
| shuttle / transporter / worm | 80–110 | – | – | shuttle, miner |
| asteroid / boulder / splinter | 0–50 | – | – | asteroid, boulder, splinter, cinder |

**Stations (7):** `coriolis-station`, `dodecahedron-station` (Dodo),
`icosahedron-station` (Ico), `rock-hermit`, `rock-hermit-chaotic`,
`rock-hermit-pirate`, `tutorial-station`.

**Flyable player ships (11):** adder-player, anaconda-player, asp-player,
boa-player, boa-mk2-player, cobra3-player, cobramk1-player, ferdelance-player,
moray-player, morayMED-player, python-player.

Role syntax note: roles carry **spawn weights**, e.g.
`trader(0.25) trader-courier(0.5) pirate-light-fighter(0.25)` — a single ship
definition can fill many ecological niches at different probabilities.

---

## Economy

### Commodities (17) — `Resources/Config/trade-goods.plist`

`food, textiles, radioactives, slaves, liquor_wines, luxuries, narcotics,
computers, machinery, alloys, firearms, furs, minerals, gold, platinum,
gem_stones, alien_items` — the classic Elite eight-pairs trade goods.

Each commodity is fully parameterised with a **deterministic price/quantity
model** keyed to system economy (0 = Rich Industrial … 7 = Poor Agricultural):

```
"food" = {
    "name" = "[commodity-name food]";
    "classes" = ("oolite-consumer","oolite-edible","oolite-farming");
    "quantity_unit" = 0;          // 0 = tonnes
    "peak_export" = 7;            // economy index that produces most (Poor Ag)
    "peak_import" = 0;            // economy index that demands most (Rich Ind)
    "price_average" = 50;         // decicredits → 5.0 Cr
    "price_economic" = 0.55;      // weight of economy-driven price swing
    "price_random" = 0.04;        // weight of per-system random swing
    "quantity_average" = 13.5;
    "quantity_economic" = 0.52;
    "quantity_random" = 0.04;
    "legality_export" = 0; "legality_import" = 0;   // 0 = legal
    "trumble_opinion" = 1.0;      // food feeds the trumble pet system
    "sort_order" = 100;
};
```

This is the **Elite supply/demand model expressed as data**: each system's
economy integer interpolates between peak_export and peak_import, plus a random
component. There is also a `classes` taxonomy (consumer/edible/farming/…)
that OXPs can hook into.

---

## Missions / dynamic content

### Core missions (5) — `Resources/Config/world-scripts.plist` + `Resources/Scripts/`

- `oolite-constrictor-hunt-mission.js` (200 lines) — hunt a stolen
  prototype across the galaxies (the original Elite mission 1).
- `oolite-thargoid-plans-mission.js` (192 lines) — steal Thargoid war
  plans (original Elite mission 2).
- `oolite-cloaking-device-mission.js` (104 lines) — recover a cloaking device.
- `oolite-nova-mission.js` (415 lines) — evacuate a system before its sun
  goes nova (the largest core mission).
- `oolite-trumbles-mission.js` (141 lines) — the tribble-like "trumbles"
  that breed and infest your ship.

### Dynamic contract system (procedural, repeatable)

The contracts layer (`oolite-contracts-cargo.js`, `oolite-contracts-parcels.js`,
`oolite-contracts-passengers.js`, `oolite-contracts-helpers.js`) generates
cargo-delivery, parcel-courier, and passenger-transport jobs that scale with
distance and risk.

### The populator — `Resources/Scripts/oolite-populator.js`

This is Oolite's **dynamic-content engine**. It subscribes to the
`systemWillPopulate` world event and uses a **priority-ordered callback
queue** to fill each system with traffic based on the system's economy,
government, and population:

```js
this.systemWillPopulate = function() {
    system.addPopulator("oolite-pop-header",  { priority:  5, callback: ... });
    system.addPopulator("oolite-pop-buoy",    { priority: 10, callback: ... });
    system.addPopulator("oolite-pop-rockcluster", { priority: 20, ... });
    system.addPopulator("oolite-pop-route1trader", { priority: 40, ... });
    ... // ~20+ populator entries at priorities 5–99
}
```

Higher-priority callbacks run first and can read what earlier ones added
(e.g. decide whether to spawn a rock-hermit pirate base, then spawn pirates
near it). `oolite-priorityai.js` is the shared AI-construction library the
newer `.js` AIs build on.

---

## Data architecture

- **OpenStep plist** is the dominant format (ASCII, brace-delimited). Both
  dictionary (`key = value;`) and array (`( a, b, c )`) forms are used. Keys
  are quoted only when they contain non-identifier characters; the opening
  brace of a value may sit on the **next line** (`"key" =\n{`), which trips
  naive parsers.
- **shipdata.plist** uses a **template + `like_ship` inheritance** pattern:
  `oolite_template_<ship>` defines stats; `oolite_template_<ship>-player`,
  `-pirate`, etc. inherit via `like_ship = "oolite_template_<ship>"` and
  override only what differs (model, roles, `is_template = 1`). This is the
  contract OXPs program against so they survive core changes.
- **equipment.plist** is an **array of tuples**:
  `( TECH_LEVEL, PRICE_CREDITS, "Display Name", "EQ_KEY", "desc", {options} )`,
  e.g. `(2, 6000, "E.C.M. System", "EQ_ECM", "High power disruptor circuits…",
  { condition_script = "oolite-conditions.js"; })`. Availability is gated by
  `condition_script` (`oolite-conditions.js`) plus flags like
  `available_to_all`, `requires_empty_pylon`, `incompatible_with_equipment`.
- **planetinfo.plist** (88 086 lines) keys systems as `"G S"` (galaxy, system
  index) and stores: `description`, `economy`, `government`, `inhabitant(s)`,
  `population`, `productivity`, `radius`, `random_seed`, `coordinates`, and a
  full planet-rendering parameter set (`air_color`, `land_color`, `sea_color`,
  `cloud_*`, `corona_*`, `polar_*`, `rotation_speed`, `planet_distance`).
- **Descriptions are shipped pre-baked.** Each of the 2048 systems already has
  its flavour sentence written into planetinfo.plist (see Depth patterns).
- **JSON Schemas** ship for OXP authors: `Resources/Schemata/` contains
  `shipdataEntrySchema.plist`, `hudSchema.plist`, `demoshipsSchema.plist`,
  `plistschema.plist`, `shipyardSchema.plist` — OXPs can be validated.

---

## Depth patterns

1. **Seed-deterministic everything.** Every system's data is anchored on
   `random_seed = "74 90 72 2 83 183"` (see `planetinfo.plist` entry `"0 0"` =
   Tibedied). The same seed always yields the same name, economy, government,
   inhabitant species, description, and planet rendering — so the galaxy feels
   hand-authored but is fully deterministic. The pre-baked description strings
   were *produced* by the Elite fragment algorithm historically, but Oolite
   ships them as data for reproducibility (`Resources/Config/planetinfo.plist`,
   verified 2048 `random_seed` entries).

2. **Recursive fragment-string expansion (`OOStringExpander`).** Text in
   `descriptions.plist` is not literal — it is a template language expanded at
   runtime by `src/Core/OOStringExpander.m`. Verified escape codes:
   - `%H` → current system name, `%I` → system name + adjectival suffix
     (so "Tibedied" → "Tibediedian", producing "Tibediedian Arma brandy"),
   - `%N`, `%R` → seeded random proper names,
   - `[key]` → recursively expand another descriptions.plist entry.
   The NPC-name generator `nom`/`nom1` in `descriptions.plist` builds names
   from syllable fragments: `"ben [nom11]"`, `"Mc[nom11]"`, `"Dav[nomvoweliy][nom2]"`
   with vowel-pool sub-fragments `nomvowelie/ar/ur/iy`. This is the engine
   behind "Herbert of Ararus is a well-known thief"-style procedural prose.

3. **The OXP / OXZ modding system.** `src/Core/OOManifestProperties.h`
   defines a real package manifest: `identifier`, `version`,
   `required_oolite_version` / `maximum_oolite_version`, `requires_oxps`,
   `conflict_oxps`, `category`, `tags`, `download_url`, `information_url`.
   `OOOXZManager` (.m, ~thousands of lines) implements an in-game package
   manager that can download/install `.oxz` bundles from a remote catalog.
   Layered system overrides (`src/Core/OOSystemDescriptionManager.h`:
   `OO_LAYER_CORE=0`, `OXP_STATIC=1`, `OXP_DYNAMIC=2`, `OXP_PRIORITY=3`) let
   mods override individual system properties without editing core data. This
   is Oolite's single biggest depth multiplier — an entire community OXP
   ecosystem rides on a stable, versioned data contract.

4. **One ship definition, many roles (weighted ecology).** A single template
   like `cobra3` carries role weights `trader(0.375) trader-courier(0.2)
   hunter-medium(0.5) pirate-heavy-fighter(1.0) pirate-interceptor(0.25)
   scavenger sunskim-trader`. The populator then draws from these weighted
   role-tags to populate traffic. Result: ~40 distinct *roles* are filled by a
   modest roster of ~20 chassis, so the universe feels populous without
   exploding the art budget.

5. **Per-ship AI as a swappable script.** Each ship carries an `ai_type`
   pointing into `Resources/AIs/` (62 files). Oolite supports two AI systems
   side by side: legacy **plist state machines** (`pirateAI.plist`,
   `traderAI.plist`, `missileAI.plist`, …) and newer **JavaScript priority
   AIs** (`oolite-pirateAI.js`, `oolite-traderAI.js`,
   `oolite-bountyHunterAI.js`, `oolite-thargoidAI.js`, …). AI is not
   hard-coded to a ship — the same hull can be a trader, pirate, or police
   escort depending on which AI and role it is spawned with.

---

## What SpaceFace could learn

1. **Ship-as-template + role-tags, not ship-as-instance.** Oolite's
   `template → named variant (like_ship) → weighted role list` triad means a
   small chassis count fills an entire simulated ecosystem. SpaceFace can
   adopt: define each hull once with stats, then attach weighted role tags
   (`trader`, `pirate-interceptor`, `escort-heavy`) so the spawn/dynamic system
   — not the art team — creates variety. (Verified: `shipdata.plist`
   `oolite_template_cobra3` fills 10+ roles from one definition.)

2. **A recursive fragment-string language for flavour text.** The
   `OOStringExpander` (`%H`/`%I`/`[key]`) + syllable-fragment name generator
   (`nom`/`nom1`/`nomvowel*`) lets one small `descriptions.plist` produce
   endless localised, system-aware prose ("Tibediedian Arma brandy but
   scourged by deadly edible grubs"). SpaceFace can ship a tiny fragment
   grammar + seed keys and get procedurally-flavoured, deterministic, cheap
   text for NPCs, systems, and items. (Verified: `Resources/Config/descriptions.plist`
   lines 935–1065, `src/Core/OOStringExpander.m`.)

3. **Economy as a parameterised formula, not a loot table.** `trade-goods.plist`
   expresses each commodity's price/quantity as
   `average + economy_weight × (peak_export − peak_import) + random`, all as
   data. SpaceFace can make trade depth data-driven and self-balancing rather
   than hand-tuning every station's inventory. (Verified:
   `Resources/Config/trade-goods.plist`.)

4. **A populator with a priority callback queue.** `systemWillPopulate` +
   `system.addPopulator(name, priority, callback)` lets each layer of dynamic
   content (stations, then traders, then pirates that react to traders, then
   scavengers) run in order and *see what earlier layers did*. This is a
   clean, extensible architecture for SpaceFace's scene-population: register
   content generators by priority rather than hard-coding spawn order.
   (Verified: `Resources/Scripts/oolite-populator.js`, priorities 5–99.)

5. **A versioned mod manifest as a first-class citizen.** Oolite's
   `manifest.plist` + dependency/conflict resolution + layered override layers
   turned a 2004 game into a still-active platform. Even a minimal version of
   this (`identifier`, `version`, `requires`, `conflicts`) in SpaceFace would
   make content packs composable and future-proof. (Verified:
   `src/Core/OOManifestProperties.h`, `src/Core/OOOXZManager.m`.)
