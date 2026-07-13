# Starsector — Verified Depth Research

A content-extraction analysis of the commercial space-combat/strategy game **Starsector** (by Fractal Softworks), focused on how it differentiates factions through data-driven doctrine, ship classification, and economy systems. All claims are extracted directly from the Starsector community wiki (fandom) via the MediaWiki API, and cite the source URL that yielded each fact.

**Extraction date:** 2026-07-12
**Method:** MediaWiki `action=parse`/`action=query` API against `starsector.fandom.com` (bypasses cookie-consent render wall, returns clean wikitext).

---

## Counts

All counts below come from the Fandom `Category:` namespace (`action=query&list=categorymembers`), which enumerates every article tagged into that category. These are exact article counts, not estimates.

| Entity | Count | Source URL |
|---|---|---|
| **Factions (all)** | **12** article pages in `Category:Factions` | https://starsector.fandom.com/wiki/Category:Factions |
| Factions — major (playable-interaction) | 8: Hegemony, Tri-Tachyon, Persean League, Sindrian Diktat, Luddic Church, Luddic Path, Independent, Pirates | https://starsector.fandom.com/wiki/Factions |
| Factions — minor/special | 4: Domain Exploration Derelict, Omega, Remnants, + the extinct Domain of Man (lore-only) | https://starsector.fandom.com/wiki/Category:Factions |
| **Ships (all articles in `Category:Ships`)** | **93** (includes Mk.II/Mk.III variant pages; 10 of these are `Category:` subcategory placeholders, so ~83 distinct hull articles + variants) | https://starsector.fandom.com/wiki/Category:Ships |
| Ships — Frigate class | 28 articles | https://starsector.fandom.com/wiki/Category:Frigate |
| Ships — Destroyer class | 21 articles | https://starsector.fandom.com/wiki/Category:Destroyer |
| Ships — Cruiser class | 22 articles | https://starsector.fandom.com/wiki/Category:Cruiser |
| Ships — Capital class | 18 articles | https://starsector.fandom.com/wiki/Category:Capital |
| Ships — Fighter/Wing class | 22 articles | https://starsector.fandom.com/wiki/Category:Fighter |
| Ships — Carrier hulls | 15 articles | https://starsector.fandom.com/wiki/Category:Carrier |
| Ships — Station (buildable defensive) | 6 articles | https://starsector.fandom.com/wiki/Category:Station |
| **Weapons — Ballistic** | 32 articles (29 real weapons + 3 template/user pages) | https://starsector.fandom.com/wiki/Category:Ballistic |
| **Weapons — Energy** | 30 articles (27 real weapons incl. some "High Delay" variants + 3 template/user pages) | https://starsector.fandom.com/wiki/Category:Energy |
| **Weapons — Missile** | 41 articles (~39 real missile weapons; counts fighter-exclusive variants separately) | https://starsector.fandom.com/wiki/Category:Missile |
| **Weapons — total** | **~95 distinct weapon articles** across 3 categories | (sum of the three above) |
| **Ship Systems** | **38** articles in `Category:Ship_Systems` | https://starsector.fandom.com/wiki/Category:Ship_Systems |

> Note on counting: Fandom category pages paginate at 200 members; all categories here were under that limit (`cmlimit=500`), so these are complete, not approximate. Ship-class categories overlap (a hull can be both a Cruiser and a Carrier), so summing the per-class columns double-counts — the canonical "total distinct ships" figure is the **93 in `Category:Ships`**.

---

## Factions

Extracted from each faction's wiki page `FactionInfobox` and prose. Source URLs cited per faction. The Factions hub page (https://starsector.fandom.com/wiki/Factions) enumerates them and gives the starting-relationship baseline: all factions start **neutral** to the player except **Pirates** and **Luddic Path**, who start hostile.

### Major factions

| Faction | Prefix | Doctrine lean | Alignment / personality | Capital & territory | Signature ships | Source |
|---|---|---|---|---|---|---|
| **Hegemony** | HSS | **Low Tech** (heavy, armored, ballistic) | Martial successor-state to the Domain; authoritarian, "Great Cause" restorationists; largest faction; starts Favorable (+15) | Chicomoztoc (size 8, Aztlan System); 13 markets across Aztlan/Corvus/Galatia/Naraka/Samarra/Valhalla/Arcadia | Onslaught (+XIV), Legion, Dominator (+XIV), Eagle (+XIV), Enforcer (+XIV) | https://starsector.fandom.com/wiki/Hegemony |
| **Tri-Tachyon** | TTS | **High Tech** (energy, phase, shields) | Arrogant scientist/corporate types; AI research; "keepers of knowledge"; small but elite; starts Neutral | Eochu Bres (size 6, Hybrasil System); also Magec/Mayasura/Valhalla outposts | Paragon, Odyssey, Astral, Aurora, Doom, Tempest, Hyperion | https://starsector.fandom.com/wiki/Tri-Tachyon |
| **Persean League** | PLS | **Midline** (pure — "fleets consist purely of Midline ships") | Anti-Hegemony alliance of polities; freedom-of-polities (not individuals); 2nd largest; allied +75 to Sindrian Diktat; starts Neutral | Kazeron (size 7, Thule System); 12 markets — tied with Hegemony for most markets | Conquest, Pegasus, Champion, Gryphon, Eagle, Heron | https://starsector.fandom.com/wiki/Persean_League |
| **Sindrian Diktat** | SDS | **Midline** (warships only — doctrine bans carriers) | Military dictatorship, rogue Hegemony splinter under Admiral Andrada; fuel & Volturnian Lobster producer; narcissistic-cult-of-personality; allied +75 to League; starts Neutral | Sindria (size 7, Askonia System); 3 planets in one system | **Executor** (modified Pegasus, faction-unique capital), plus Lion's Guard retrofitted variants (Brawler LG, Hammerhead LG, etc.) | https://starsector.fandom.com/wiki/Sindrian_Diktat |
| **Luddic Church** (Church of Galactic Redemption) | CGR | **Low Tech** (ancient/outdated hulls) | Religious, anti-technology, agrarian-virtue; has military arm "Knights of Ludd"; allied +75 to Luddic Path; hates Tri-Tachyon; starts Neutral | Gilead (size 7, Canaan System); 4 planets in Canaan + Eos Exodus | Invictus, Retribution, Eradicator, Mora | https://starsector.fandom.com/wiki/Luddic_Church |
| **Luddic Path** | (none) | **Low Tech + Midline mix** (substandard hulls, overridden safeties) | Radical religious terrorists; decentralized apocalyptic sects; hostile to nearly everyone; allied +75 to Church; starts **Hostile (-50)** | Chalcedon (Kumari Kandam) + Epiphany (Al Gebbar); spawns hidden Pather cells on colonies | Prometheus Mk.II, Eradicator, (LP)-suffixed retrofitted hulls | https://starsector.fandom.com/wiki/Luddic_Path |
| **Independent** | ISS | **Midline** (freighters + midline combat) | Loose collection of neutral polities, smugglers, free traders; no commissions; cooperative-defensive; starts Neutral | Spread across many systems (Maxios, Agreus, Asharu, Nomios, etc.); no single capital | (uses civilian/midline hulls, no unique combat roster) | https://starsector.fandom.com/wiki/Independent |
| **Pirates** | (none) | **Mixed / D-grade** (defective hulls from all doctrines) | Loose bandits/deserters/mercenaries; hostile to everyone except Luddic Path; unique blueprint-leak mechanic; starts **Hostile (-65)** | Kanta's Den (Magec), Kapteyn Starworks (their Heavy Industry), Umbra, Qaras, etc. | Atlas Mk.II, Eradicator, Prometheus Mk.II, Buffalo Mk.II, Mudskipper Mk.II, plus D-versions of many hulls | https://starsector.fandom.com/wiki/Pirates |

### Minor / special factions (from `Category:Factions`)

- **Remnants** — autonomous AI fleets left over from the AI Wars; High Tech; guard restricted systems; not a normal-trade faction.
- **Omega** — endgame boss-tier faction; exotic weapons (Rift weapons, Resonator MRM); Ziggurat is an Omega-derived hull.
- **Domain Exploration Derelict** — "Explorarium" drones (Defender, Bastillon) from defunct Domain-era survey corps; guard old survey probes.
- **Domain of Man** — extinct lore-only polity; all technology descends from it.

Source for minor-faction enumeration: https://starsector.fandom.com/wiki/Category:Factions and https://starsector.fandom.com/wiki/Factions (Corporations sub-section: Altair Exotech, Bhilai Astra Group, Eridani-Utopia, Fabrique Orbitale, Ko Combine, Mbaye-Gogol, Orion Shipyards, etc.).

### Commission-eligibility (a faction-defining flag)

From https://starsector.fandom.com/wiki/Factions: **Hegemony, Tri-Tachyon, Luddic Church, Persean League, Sindrian Diktat** offer commissions (monthly stipend + military-market access + standing bounty on their enemies). Pirates, Luddic Path, and Independents do **not**. This is encoded per-faction as `custom.offersCommissions` in the `.faction` file (see Data Architecture).

---

## Ships by Doctrine / Faction

### The three design doctrines (the masterclass)

Extracted verbatim-summarized from the three category pages. These are the aesthetic + tactical "personalities" Starsector uses to make factions feel mechanically and visually distinct.

**LOW TECH** — https://starsector.fandom.com/wiki/Category:Low_Tech
> "Low Tech hulls rely greatly on ballistic and missile based weapons, and boast high hull and armor levels. They are very-much frontline ships capable of both taking a beating, and dishing out a considerable amount of damage."
- Aesthetic: bulky, rugged, industrial, "brute".
- Tactical: heavy armor tanking, ballistic+missile firepower, slow, cheap, numerous. Civilian-grade haulers (Atlas, Prometheus, Tarsus, Phaeton, Ox) are almost all Low Tech.

**MIDLINE** — https://starsector.fandom.com/wiki/Category:Midline
> "Midline hulls strike the middle between low tech and high tech. They typically fall into two categories: specialized designs... or a more generalized approach... jack-of-all-trades. Each utilize a flexible range of ordnance and a combination of both adequate armor and shields for defense."
- Aesthetic: balanced, functional, purpose-built.
- Tactical: two sub-philosophies — **specialists** (Gryphon = missile boat; Heron = mobile carrier; Hammerhead = max firepower) vs **generalists** (Eagle/Falcon = flexible flux-friendly loadouts). Mobility via Maneuvering Jets.

**HIGH TECH** — https://starsector.fandom.com/wiki/Category:High_Tech
> "High Tech hulls are expensive, yet advanced designs that focus primarily on energy-based weapons with a heavy reliance on Shields... High tech also focuses on mobility, encouraging strike-based configurations... especially notable in hulls that utilize the unique Phase Cloak ship system."
- Aesthetic: sleek, smooth, rare/expensive.
- Tactical: energy weapons, strong shields, high flux, high speed/agility, strike-and-fade, phase cloak ships. High maintenance cost; poor in prolonged attrition.

Each doctrine category page renders the **same table structure** (Frigates / Destroyers / Cruisers / Capitals / Fighters / Station), which is itself a reusable information-architecture pattern.

### Doctrine rosters (from the category tables)

**Low Tech hulls** (https://starsector.fandom.com/wiki/Category:Low_Tech) — 39 category members:
- Frigates: Cerberus, Dram*, Gremlin, Hound, Lasher, Mudskipper*, Ox*, Shepherd*, Vanguard
- Destroyers: Buffalo Mk.II*, Condor, Enforcer, Manticore, Mule, Phaeton*, Tarsus*
- Cruisers: Colossus*, Dominator, Eradicator, Grendel, Mora, Venture*
- Capitals: Atlas*, Invictus, Legion, Onslaught, Prometheus*, Retribution
- Fighters/Wings: Broadsword, Khopesh, Mining Pod, Perdition, Piranha, Sarissa, Talon, Warthog
- Stations: Low Tech Station, Merlon
(* = civilian-grade)

**Midline hulls** (https://starsector.fandom.com/wiki/Category:Midline) — 26 members:
- Frigates: Brawler, Centurion, Hermes*, Kite*, Monitor, Vigilance, Wayfarer
- Destroyers: Drover, Gemini, Hammerhead, Nebula*, Salvage Rig*, Sunder, Valkyrie
- Cruisers: Champion, Eagle, Falcon, Gryphon, Heron, Starliner*
- Capitals: Conquest, Pegasus
- Fighters/Wings: Gladius, Thunder
- Stations: Midline Station, Ravelin

**High Tech hulls** (https://starsector.fandom.com/wiki/Category:High_Tech) — 31 members:
- Frigates: Afflictor, Hyperion, Mercury*, Omen, Scarab, Shade, Tempest, Wolf
- Destroyers: Buffalo*, Harbinger, Medusa, Phantom, Shrike
- Cruisers: Aurora, Doom, Fury, Revenant
- Capitals: Astral, Odyssey, Paragon, Ziggurat
- Fighters/Wings: Claw, Cobra, Dagger, Longbow, Trident, Wasp, Xyphos
- Stations: High Tech Station, Gargoyle

### Per-faction "Known Ships" rosters

Each faction page has a `== Known Ships ==` section grouping hulls by class. Below is the verified roster for each major faction.

#### Hegemony (Low Tech, XIV Battlegroup variants) — https://starsector.fandom.com/wiki/Hegemony
- **Frigates:** Centurion, Gremlin, Hound (A), Kite (A), Lasher, Wolf (H)
- **Destroyers:** Condor, Enforcer, Enforcer (XIV)
- **Cruisers:** Dominator, Dominator (XIV), Eagle, Eagle (XIV), Falcon (XIV), Grendel, Mora
- **Capitals:** Legion, Onslaught, Onslaught (XIV)
- Doctrine note: "primarily field large ships, mostly of Low Tech design... only faction to possess a Pristine Nanoforge by default... doctrinal focus are exceptional, steady officers, at the expense of fewer ships per fleet." XIV variants = improved flux+armor but slower.

#### Tri-Tachyon (High Tech, phase-heavy) — https://starsector.fandom.com/wiki/Tri-Tachyon
- **Frigates:** Afflictor, Brawler (TT), Hyperion, Omen, Scarab, Shade, Tempest
- **Destroyers:** Harbinger, Medusa, Shrike
- **Cruisers:** Aurora, Doom, Fury
- **Capitals:** Astral, Odyssey, Paragon
- **Logistic:** Phantom, Revenant
- Doctrine note: "the premiere user of High Tech ships... primarily utilize both warships and phase ships, with the Astral-class Carrier being the sole exception... fleets are small... ships top-of-the-line."

#### Persean League (pure Midline) — https://starsector.fandom.com/wiki/Persean_League
- **Frigates:** Brawler, Monitor, Vigilance
- **Destroyers:** Drover, Hammerhead, Sunder
- **Cruisers:** Champion, Eagle, Falcon, Gryphon, Heron
- **Capitals:** Conquest, Pegasus
- Doctrine note: "fleets consist purely of Midline ships... greater emphasis on warships, with the occasional carrier." Signature weapons: **DEM (Direct Energy Munitions)** missiles — Gazer/Gorgon/Dragonfire/Hydra.

#### Sindrian Diktat (Midline, warships-only) — https://starsector.fandom.com/wiki/Sindrian_Diktat
- **Frigates:** Brawler, Centurion
- **Destroyers:** Hammerhead, Sunder
- **Cruisers:** Eagle, Falcon
- **Capitals:** **Executor** (modified Pegasus — faction-unique)
- **Lion's Guard subfaction (exclusive retrofits):** Brawler (LG), Centurion (LG), Hammerhead (LG), Sunder (LG), Eagle (LG), Falcon (LG) — built-in Solar Shielding, biased to energy weapons, exclusive weapons **Kinetic Blaster** and **Gigacannon**.
- Doctrine note: "Fleet Doctrine exclusively uses warships due to the belief that 'fighter jocks' detract from working together for the Supreme Executor's Great Plan."

#### Luddic Church (Low Tech, ancient/outdated) — https://starsector.fandom.com/wiki/Luddic_Church
- **Frigates:** Hound (LC), Lasher (LC), Vanguard
- **Destroyers:** Buffalo Mk.II, Condor, Manticore
- **Cruisers:** Eradicator, Mora
- **Capitals:** **Invictus**, **Retribution**
- Doctrine note: "mainly use low tech ships... considered ancient and outdated, unlike the Hegemony, whose ships are tried and true... ship production quality is sacrificed in favor of fielding more ships... tend to use Converted Hangars to maximize wings." Signature missile: **Pilum LRM Catapult**; signature wing: **Perdition Bomber** (improvised, Hammer-torpedo payload).

#### Luddic Path (Low+Mid mix, overridden-safety, reckless) — https://starsector.fandom.com/wiki/Luddic_Path
- **Frigates:** Brawler (LP), Cerberus (LP), Gremlin (LP), Hound (LP), Kite (LP), Lasher (LP)
- **Destroyers:** Enforcer, Hammerhead, Manticore (LP), Sunder
- **Cruisers:** Colossus Mk.II, Eradicator, Venture (LP)
- **Capitals:** **Prometheus Mk.II**
- Doctrine note: "substandard low tech and midline ships, but many are retrofitted with permanently overridden safety overrides... doctrine employs many ships, and are also highly reckless in combat."

#### Pirates (mixed, D-grade, blueprinted from leaks) — https://starsector.fandom.com/wiki/Pirates
- **Frigates:** Afflictor, Cerberus, Gremlin, Hound, Kite, Lasher, Mudskipper Mk.II, Shade, Vanguard, Wolf
- **Destroyers:** Buffalo Mk.II, Condor, Enforcer, Manticore, Medusa, Mule, Shrike
- **Cruisers:** Eagle, Eradicator, Falcon, Venture
- **Capitals:** **Atlas Mk.II**
- Unique mechanic: "any Blueprints sold on the black market will inevitably make their way to the fleets themselves." Pirates use D (defective/damaged) hulls but sometimes gain extra missile hardpoints from crude modifications.

#### Independent (Midline, civilian-leaning) — https://starsector.fandom.com/wiki/Independent
- No unique combat roster documented; "primarily use freighters and midline ships."

---

## Weapon Systems

Weapons split into **3 categories**, each with size tiers (Small / Medium / Large) and mount-type compatibility (Ballistic / Energy / Missile / Synergy / Composite / Hybrid / Universal). Source: https://starsector.fandom.com/wiki/Category:Weapons and the per-faction "Known Weapons" sections.

- **Ballistic** (32 articles / ~29 weapons) — https://starsector.fandom.com/wiki/Category:Ballistic — kinetic+HE+frag damage; the Low Tech / Midline mainstay. Examples: Vulcan Cannon, Railgun, Light Needler, Heavy Autocannon, Heavy Mauler, Hypervelocity Driver, Mark IX Autocannon, Mjolnir Cannon, Gauss Cannon, Storm Needler, Devastator Cannon, Hellbore Cannon, Hephaestus Assault Gun, Assault Chaingun, Flak/Dual Flak Cannon.
- **Energy** (30 articles / ~27 weapons) — https://starsector.fandom.com/wiki/Category:Energy — damage type flexible; High Tech mainstay. Examples: PD Laser, Tactical Laser, Ion Cannon/Pulser/Beam, Graviton Beam, Phase Lance, Pulse Laser, Heavy Blaster, Autopulse Laser, High Intensity Laser, Plasma Cannon, Tachyon Lance, Paladin PD. Plus the recent **Kinetic Blaster**, **Gigacannon** (Sindrian LG exclusive), **IR Autolance** (League signature), and **Rift** weapons (Omega: Rift Beam/Lance/Cascade Emitter, Shock Repeater, Resonator MRM).
- **Missile** (41 articles / ~39 weapons) — https://starsector.fandom.com/wiki/Category:Missile — finite-ammo (or regenerating) burst damage; all doctrines use some. Examples: Harpoon/Sabot/Breach/Atropos (small SRMs/torpedoes), Pilum LRM, Salamander MRM, Squall MLRS, Hurricane MIRV, Locust SRM, Hammer/Reaper/Cyclone/Typhoon families, plus the **DEM** line (Gazer/Gorgon/Dragonfire/Hydra) introduced as the Persean League's signature missile class.

Each faction's page has a `== Known Weapons ==` section sub-divided into Ballistic / Energy / Missile — i.e. weapons are also **faction-scoped** (a faction only stocks a subset), which is itself a depth pattern.

---

## Wings (Fighters / Bombers / Interceptors)

From https://starsector.fandom.com/wiki/Wings and per-faction `== Known Wings ==` sections. Fighters ("Wings") are strike craft carried by carriers via Fighter Bays. Roles:
- **Interceptors** — anti-fighter/missile PD (Talon, Wasp, Thunder)
- **Fighters** — general escort/attack (Broadsword, Claw, Gladius, Warthog, Xyphos, Sarissa, Mining Pod)
- **Bombers** — anti-ship ordnance (Piranha, Khopesh, Dagger, Longbow, Cobra, Trident, Perdition)

~22 wing articles in `Category:Fighter`. Each faction lists only the wings it deploys (e.g. Hegemony fields Khopesh/Longbow/Piranha bombers + Broadsword/Warthog fighters + Talon interceptors — "Carriers are not a focus in Hegemony doctrine").

---

## Ship Systems

From https://starsector.fandom.com/wiki/Systems and https://starsector.fandom.com/wiki/Category:Ship_Systems (**38 systems**). Ship Systems are active abilities triggered with the F key; they can be charge-based, cooldown-based, or transformation-type. Notable examples (from doctrine pages and per-faction rosters): **Phase Cloak** (High Tech — Afflictor/Shade/Harbinginger/Doom/etc.), **Maneuvering Jets** (Midline mobility), **Terminal Teleport** (Hyperion), various missile-ammo/fortress-shield/burn-drive systems. Systems are a key axis of ship differentiation beyond raw stats.

---

## Data Architecture — the `.faction` File

This is the single most SpaceFace-relevant pattern. Extracted from https://starsector.fandom.com/wiki/.faction_File_Overview (the page resolved successfully and contains a full annotated dump of the Hegemony `.faction` file).

**What it is:** "A .faction file informs the game engine how to set up and use a faction. Every faction must have a corresponding .faction file and corresponding entry in `factions.csv`." Format: "Starsector's somewhat loose JSON schema." So a faction = a single declarative data file + a one-line CSV registration.

**Key fields (each is a lever a designer can pull without code):**

| Field | Purpose | Example (Hegemony) |
|---|---|---|
| `id` | unique code ID | `"hegemony"` |
| `color` | RGBA theme color | `[245,150,30,255]` (orange) |
| `displayName` / `displayNameWithArticle` / `displayNameLong` | name variants for prose generation | `"Hegemony"` / `"the Hegemony"` |
| `logo` / `crest` | faction iconography paths | 410x256 logo, 256x256 crest |
| `shipNamePrefix` | hull-name prefix | `"HSS"` |
| `shipNameSources` | weighted name-pool sources (from `ship_names.json`) | `BRITISH_NAVY:1, ROMAN:2, GREEK:1, SPACE:1, GENERAL:1` |
| `names` | weighted character-name pools (from `person_names.csv`) | `old english:1, modern:1, world:1, future:1, myth:1` |
| `hullMods` | hullmods this faction's markets can supply | `frontshield, heavyarmor, hardened_subsystem...` |
| `illegalCommodities` | banned goods | `drugs, organs, hand_weapons, ai_cores` |
| `music` | per-context music (theme / market neutral-hostile-friendly / encounter neutral-hostile-friendly) | 7 music slots |
| `portraits` | `standard_male[]` + `standard_female[]` portrait image arrays | per-faction portrait sets |
| `ranks` | custom names for `spaceCommander` / `patrolCommander` / `fleetCommander` / `baseCommander` | `"Commander"`, `"Patrol Commander"`, etc. |
| `custom` | behavioral flags | `offersCommissions:true, engagesInHostilities:true, buysAICores:true, AICoreValueMult:1, AICoreRepMult:2, buysSurveyData:true` |
| **`shipRoles`** | **fleet composition weights** — for each fleet role (`fastAttack`, `escortSmall/Medium`, `combatSmall/Medium/Large/Capital`, `carrierSmall/Medium/Large`, `freighter...`, `tanker...`, `personnel...`, `tug`, `utility`), a weighted list of **ship variant IDs** + a `fallback` role | e.g. `combatCapital: { onslaught_Standard:10, onslaught_Outdated:10, onslaught_Elite:10, onslaught_xiv_Elite:3, fallback:{combatLarge:2} }` |
| **`doctrine`** | **fleet-generation parameters** — ship-distribution weights (`small/fast/medium/large/capital`), escort fractions, carrier probabilities, officer counts/levels/skills, commander skill weights | `officersPerPoint:0.35, officerLevelBase:5, medium:8, large:8...` |
| `traits` | weighted captain personalities | `timid:1, cautious:5, steady:10, aggressive:10, reckless:5` |
| `baseUIColor`/`darkUIColor`/`gridUIColor`/`secondaryUIColor` | UI color theming | RGBA |

**Additional `custom` boolean flags documented on the page** (highly relevant — they encode faction *behavior* data-driven): `decentralized`, `no_contacts`, `ignoreTradeWithEnemiesForReputation` (Pirates+Path only), `postsNoBounties` (Pirates+Path only), `allowsTransponderOffTrade` (Independent/Path/Pirates), `caresAboutAtrocities` (Hegemony/League/Church/Independent), `engageWhenEvenStrength` (Derelict/Path/Omega/Pirates/Remnants).

**The pattern in one sentence:** A faction is fully defined — visually (colors/logos/portraits), narratively (names/ranks/music), economically (illegal goods, AI-core buy policy), and militarily (which ship variants spawn, in what fleet-role proportions, with how many officers of what personality) — by one declarative JSON file plus a CSV row. No code changes needed to add or retune a faction.

---

## Depth Patterns

1. **Doctrine-based ship classification (3-axis taxonomy).** Every hull is tagged `Low Tech` / `Midline` / `High Tech` AND by hull class (Frigate/Destroyer/Cruiser/Capital) AND by role (Carrier/Station/Fighter). The three doctrines are not just stat buckets — they are **aesthetic+mechanical+economic bundles** (armor vs shields vs phase; ballistic vs energy vs missile; cheap/numerous vs expensive/elite). This lets the same 93 hulls express 8+ distinct faction feels. Source: https://starsector.fandom.com/wiki/Category:Low_Tech , `/wiki/Category:Midline` , `/wiki/Category:High_Tech.

2. **Data-driven `.faction` definition files.** (See Data Architecture above.) Factions, fleets, officers, and markets are all parameters in one JSON file. This is why Starsector has a huge modding scene — adding a faction is a data task, not a code task. Source: https://starsector.fandom.com/wiki/.faction_File_Overview.

3. **Faction-scoped equipment (ships, weapons, wings, hullmods).** Each faction page lists not just ships but **Known Weapons** and **Known Wings** — a faction only fields a subset of the global arsenal, and that subset is itself a doctrine signal (Hegemony = elite ballistic; Church = cheap ballistic + mining lasers; League = DEM missiles + IR Autolance; Sindrian LG = exclusive Kinetic Blaster/Gigacannon). Source: every per-faction page's `== Known Weapons ==` section.

4. **Blueprint economy + black-market leakage.** Ships/weapons are gated behind **blueprints**; the player collects BPs to production-license them. Pirates have a unique twist: "any Blueprints sold on the black market will inevitably make their way to the fleets themselves" — so the player's economic choices reshape enemy rosters. Source: https://starsector.fandom.com/wiki/Pirates. The `(A)`/`(H)`/`(TT)`/`(LP)`/`(LG)`/`(XIV)` hull suffixes denote **faction-specific retrofit variants** of a common base hull — same art, different loadout/stats.

5. **Officer / character system tied to doctrine.** The `.faction` `doctrine` block defines `officersPerPoint`, `officerLevelBase/Variance`, `commanderSkills`, and `traits` (captain personality weights: timid→reckless). So a faction's *feel in combat* (Hegemony steady elites, Path reckless zerg, Tri-Tachyon small elite) is data-driven, not scripted. Source: https://starsector.fandom.com/wiki/.faction_File_Overview (doctrine block).

6. **Named bounty targets + relationship tiers + commissions.** Factions post bounties on "named" pirate fleets with skilled flagships; a **commission** turns a faction's enemy list into a standing bounty stream (2x destroyer / 3x cruiser / 5x capital). Reputation has 9 tiers (Cooperative → Vengeful) with mechanical breakpoints (e.g. -50 Hostile = fleets attack; -25 Inhospitable = can't dock). Source: https://starsector.fandom.com/wiki/Factions.

7. **Derelict / exploration + special factions as content vectors.** Beyond the 8 tradeable factions there are **Remnants** (AI fleets guarding loot), **Omega** (endgame boss with exotic Rift weapons), and **Domain Exploration Derelict** drones — these turn the "empty" map into a PvE exploration layer with unique rewards (Ziggurat, Omega weapons). Source: https://starsector.fandom.com/wiki/Category:Factions , https://starsector.fandom.com/wiki/Station.

8. **Station as buildable, tiered, doctrinal defense.** Player colonies build stations in 3 doctrines (Low/Midline/High Tech Station) × 3 tiers (Orbital Station → Battlestation → Star Fortress); destroyed modules regrow over months; pirate/path/remnant bases are permanently destroyable. Source: https://starsector.fandom.com/wiki/Station.

---

## What SpaceFace Could Learn

Each technique below is grounded in a verified Starsector pattern with its source.

1. **Define each faction as one declarative data file (the `.faction` pattern).** SpaceFace could ship every faction as a single JSON/YAML file covering: theme colors, logo/portrait sets, name pools, illegal/banned items, ship+weapon+wing allowed-lists, fleet-composition weights (the `shipRoles` block), and officer/doctrine parameters. Adding or rebalancing a faction becomes a data edit, not a code change — the single biggest enabler of both modding and design iteration. Grounded in: https://starsector.fandom.com/wiki/.faction_File_Overview (full annotated Hegemony `.faction` dump).

2. **Adopt a small, orthogonal "doctrine" axis as the primary visual+mechanical differentiator.** Starsector's Low/Midline/High Tech split proves you don't need dozens of bespoke faction kits — 3 doctrines, each a coherent bundle of (armor vs shields vs phase) + (ballistic vs energy vs missile) + (cheap/numerous vs elite/expensive), multiplied across hull classes, yields rich faction identity. SpaceFace could pick its own 3-doctrine triangle and let every faction lean toward one, instantly communicating "feel" through silhouette + damage type + economy. Grounded in: https://starsector.fandom.com/wiki/Category:Low_Tech , `/wiki/Category:Midline` , `/wiki/Category:High_Tech.

3. **Make equipment faction-scoped, and let faction rosters signal personality.** Rather than every faction accessing the full item table, give each faction a *subset* of ships/weapons and a few **exclusive signature items** (League = DEM missiles; Sindrian LG = Kinetic Blaster/Gigacannon; Church = Pilum Catapult/Perdition). Signature gear is a stronger identity anchor than lore text. Grounded in: per-faction `== Known Weapons ==` sections, e.g. https://starsector.fandom.com/wiki/Persean_League and https://starsector.fandom.com/wiki/Sindrian_Diktat.

4. **Use weighted fleet-composition tables + officer-personality weights for emergent combat feel.** The `shipRoles` (variant weights per fleet role) + `doctrine` (officer counts/levels) + `traits` (timid→reckless captain mix) blocks let the same hull pool produce a Hegemony steady-elite fleet vs a Luddic Path reckless-swarm fleet. SpaceFace's fleet generator could read the same three knobs to give factions distinct battlefield behavior for free. Grounded in: https://starsector.fandom.com/wiki/.faction_File_Overview (`shipRoles`, `doctrine`, `traits` blocks).

5. **Gate ships/weapons behind a blueprint economy with a black-market leakage twist.** Starsector's BPs give the player a long-term collection goal, and the Pirate "BPs sold to the black market end up in enemy fleets" rule makes the player's economic behavior *reshape the threat* — a closed feedback loop between economy and combat. SpaceFace could adopt blueprint-licensing plus a faction that reverse-engineers whatever the player sells, turning trade into a difficulty dial. Grounded in: https://starsector.fandom.com/wiki/Pirates ("any Blueprints sold on the black market will inevitably make their way to the fleets themselves").

6. **Encode faction *behavior* as data flags, not scripts.** The `custom` boolean block (`offersCommissions`, `engagesInHostilities`, `buysAICores`, `postsNoBounties`, `allowsTransponderOffTrade`, `caresAboutAtrocities`, `engageWhenEvenStrength`, `ignoreTradeWithEnemiesForReputation`) means "is this faction a normal polity or a raider/terrorist faction" is a set of toggles, not a subclass hierarchy. SpaceFace could do the same: a faction's diplomatic/economic/AI behavior = a row of flags on its definition. Grounded in: https://starsector.fandom.com/wiki/.faction_File_Overview (`custom` element documentation).

---

## URL Resolution Report

All 15 pinned URLs resolved successfully (HTTP 200, valid wikitext via MediaWiki API). Notes:

**Resolved (content extracted):**
- https://starsector.fandom.com/wiki/Factions — full faction list + relationship/commission mechanics.
- https://starsector.fandom.com/wiki/Category:Ships — 93 members.
- https://starsector.fandom.com/wiki/.faction_File_Overview — full annotated `.faction` spec (the most important page for SpaceFace).
- https://starsector.fandom.com/wiki/Hegemony — full roster + lore + markets.
- https://starsector.fandom.com/wiki/Tri-Tachyon — full roster + lore + markets.
- https://starsector.fandom.com/wiki/Persean_League — full roster + DEM weapon details.
- https://starsector.fandom.com/wiki/Pirates — full roster + blueprint-leak mechanic.
- https://starsector.fandom.com/wiki/Sindrian_Diktat — full roster + Lion's Guard + Executor.
- https://starsector.fandom.com/wiki/Luddic_Church — full roster + Knights of Ludd.
- https://starsector.fandom.com/wiki/Luddic_Path — full roster + Pather Cell mechanic.
- https://starsector.fandom.com/wiki/Category:Low_Tech — doctrine description + class-grouped ship table (39 members).
- https://starsector.fandom.com/wiki/Category:Midline — doctrine description + class-grouped ship table (26 members).
- https://starsector.fandom.com/wiki/Category:High_Tech — doctrine description + class-grouped ship table (31 members).
- https://starsector.fandom.com/wiki/Weapons — **redirects to `Category:Weapons`** (not a 404; a redirect). Weapon detail came from the `Category:Ballistic/Energy/Missile` member lists instead.
- https://starsector.fandom.com/wiki/Wings — resolved (fighter-role intro extracted via webReader; the page is transclusion-heavy so `action=parse` returned near-empty, but content was confirmed).
- https://starsector.fandom.com/wiki/Systems — resolved (intro extracted via webReader; `Category:Ship_Systems` gave the count of 38).

**404 / not found:** None of the pinned URLs 404'd. The `Weapons` URL is a soft-redirect to a category page (handled). Note: the bare pages `Low_Tech` / `Midline` / `High_Tech` (without the `Category:` prefix) do **not** exist as separate articles — the doctrine content lives *on the category pages themselves* (`Category:Low_Tech` etc.), which is what was fetched.

**Supplementary URLs also fetched to complete counts:** `Category:Factions`, `Category:Frigate/Destroyer/Cruiser/Capital/Carrier/Fighter/Station`, `Category:Ballistic/Energy/Missile`, `Category:Ship_Systems`, `Independent`, `Station`.
