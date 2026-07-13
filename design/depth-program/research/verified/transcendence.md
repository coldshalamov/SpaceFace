# Transcendence (Kronosaur) — Verified Content Extraction

**Source repo:** `/tmp/sf-research/repos/Transcendence/`
**Engine style:** C++ runtime (`TransCore/`, `Transcendence/`) + fully data-driven XML content (`TransCore/*.xml`, ~242 XML files).
**Genre relevance:** Top-down 2D space action-RPG — the single most genre-comparable open-source reference for SpaceFace. Ship outfitting, factions, star-map traversal by stargate, wreck-looting, modular extension system.

All counts below are from `grep`/`find` over the actual repo files; every claim cites a path.

---

## Counts

All content lives under `TransCore/` as XML. Each entity has a stable hex `UNID` (e.g. `0x00000001`) exposed via XML entities like `&scSapphire;`, `&stCommonwealthStation;`, `&svCommonwealth;`.

| Entity | Count | Method / Source |
|---|---|---|
| ShipClass definitions | **215** | `grep -roh '<ShipClass' TransCore/*.xml | wc -l` |
| StationType definitions | **329** | `grep -roh '<StationType' TransCore/*.xml | wc -l` |
| ItemType definitions | **637** | `grep -roh '<ItemType' --include=*.xml . | wc -l` (repo-wide) |
| ItemType subtype tags (overlapping) | Weapon 170, Armor 256, Shields 48, Devices 281, Missile 92, Drive 49, Reactor 31 | `grep -roh` over subtype tags in `TransCore/` |
| Sovereign (faction) definitions | **64** | `grep -roh '<Sovereign' TransCore/*.xml | wc -l` |
| SystemType templates | **30** | `grep -roh '<SystemType' TransCore/*.xml | wc -l` (procedural system archetypes) |
| Named star systems (`ssXxx`) | **23** distinct `SystemType` UNIDs | e.g. `ssElysium`, `ssStartonEridani`, `ssStKatharine` |
| Topology Nodes (fixed star-map vertices) | **29** `<Node>` + **3** `<NodeGroup>` | `HumanSpaceMap.xml` |
| Stargate links (edges) | **32** `<Stargate>` | `HumanSpaceMap.xml` |
| MissionType | **77** | `grep -roh '<MissionType'` repo-wide |
| DockScreen | **227** | `grep -roh '<DockScreen'` repo-wide |
| EffectType | **84** | `grep -roh '<EffectType'` repo-wide |
| AdventureDesc (game modules) | **1+** (Part 1 "Stars of the Pilgrim") | `StarsOfThePilgrim.xml` |
| Bundled Extensions | **1** (Diagnostics, debug/test) | `Extensions/Diagnostics/` |

**Key takeaway:** roughly 215 ships, 329 stations, 637 items, 64 factions, ~30 system archetypes plus a hand-authored ~29-node core star map — comparable to a mid-size commercial space game, all in plain XML.

---

## Factions

Factions are `<Sovereign>` elements (`TransCore/StdSovereigns.xml` plus each faction file). Each has an `alignment` on a **2-axis grid** (constructive/destructive × chaos/order) and optional `<Relationships>` declaring `disposition="friend|enemy|neutral"` (often `mutual="true"`).

Alignment values observed (`StdSovereigns.xml`, `Commonwealth.xml`, `AresOrthodoxy.xml`, `CharonPirates.xml`): `constructive chaos`, `constructive order`, `neutral`, `destructive order`, `destructive chaos`. This 2-axis alignment is the core diplomatic model — it is more compact than per-pair diplomacy matrices but still produces emergent friend/enemy webs.

All 64 sovereigns enumerated (`grep 'Sovereign UNID="&sv' *.xml | sort -u`), grouped here by role:

**Human / playable-space factions (most with full ship rosters):**
- `svCommonwealth` — Commonwealth, `constructive chaos`, the default "good guy" human polity. Ships in `CommonwealthShips.xml` (Sapphire, EI freighters, Wolfen, Centurion…).
- `svCommonwealthFleet` — military wing (`CommonwealthFleet.xml` + 11 mission files).
- `svCentauriWarlords` — hostile human raiders (`CentauriWarlords.xml`, 3 ships).
- `svPirates` — **Charon Pirates / Charon confederacy**, `destructive order` (`CharonPirates.xml`, `CharonFortress.xml`; 7 ships: Corsair, Drake, Viking, Charon frigate…). The iconic early-game enemy.
- `svOutlaw`, `svOutlawMiners`, `svMarauders` — `Outlaws.xml`, `OutlawMiners.xml`, `Marauders.xml` (4 ships).
- `svKorolovFreighters` / Korolov Shipping — friendly shipping corp (`KorolovFreighters.xml`, `KorolovShipping.xml`).
- `svBlackMarket`, `svBlackMarketBountyHunter` — `BlackMarket.xml`.
- `svSung` / `svSungSlaves` — Sung Slavers, `destructive order` (`SungSlavers.xml`, `SungSlaveCamp.xml`, 6 ships).
- `svHuariEmpire` — Huari, enemy of Sung (`Huari.xml` + 3 mission files; 1 ship — a faction defined more by stations/lore than ship count).
- `svRanxEmpire` — Ranx Empire (`RanxEmpire.xml`, 2 ships).
- `svKobolWarlords`, `svUrakWarlords` — `KobolWarlords.xml` (3), `UrakWarlords.xml` (2).
- `svHeliotropes`, `svHimalSeparatists`, `svSapiens`, `svPenitents`, `svAnarchists`, `svTinkers`, `svSalvagers`, `svRogueFleet`, `svFleetAssassins`, `svGladiator`.
- Religious/cult: `svDomina`, `svSistersOfDomina`, `svCult`.

**Alien / non-human factions:**
- `svAres` / `svAresHeretic` — **Ares Orthodoxy** ("neo-human"/alien zealots), `destructive order` (`AresOrthodoxy.xml`, `AresShips.xml`, 11 ships: Polar, Sandstorm, sentries…). High-level antagonist.
- `svRingers`, `svTeratons`, `svFerianMiners` (+ `Angry` variant), `svDwargRaiders`, `svXenophobes`, `svLuminous` (+ `Friendly` variant), `svPteravores`, `svGaiansTerraformers`, `svZoanthrope` (Friendly variant), `svAbbasid`, `svHeliotropes`, `svKronosaurus` (eponymous).
- `svDeathDrugsCartel` (`DeathDrugsCartel.xml`).

**Ancient / mysterious races (the lore engine):**
- `svIocrym` — **Iocrym assembly**, `destructive order` (`Iocrym.xml`, 2 ships: command ship size 350 / 150 000 mass, sentinel). The closest thing to Ancient-Race remnants in Human Space.
- `svUnknownEnemy` — used for debris/shipwrecks (`Debris.xml`) so wrecks are "owned" by no one and attackable by all.
- Stargate lore (`Stargates.xml`): *"These giant structures are used by the Ancient Races to move their starships across the Galaxy… the only method [of FTL] known to humans."* The stargates are relics of unnamed Ancients — a deliberate mystery that drives the "Reach the Galactic Core" plot.

**Relationship example** (`Huari.xml`): `<Relationship sovereign="&svSung;" disposition="enemy" mutual="true"/>` — Huari hate Sung, producing emergent cross-faction combat the player can exploit.

---

## Ships

### Ship schema (`TransCore/CommonwealthShips.xml`, Sapphire yacht, lines 82–197)

A `<ShipClass>` block contains:
- **Identity:** `manufacturer`, `class`, `type` (yacht/freighter/gunship/corvette/frigate…), `defaultSovereign="&svCommonwealth;"` (which faction fields it), `attributes` (tags like `commonwealth, genericClass, zubrin`), `inherit="&baHumanTechShip;"` (shared base behavior — a key DRY mechanism).
- **`<Hull>`:** `size`, `mass`, `cargoSpace`, `maxReactorPower`, `maxCargoSpace`, `maxDevices`, `maxArmor` (heavy/medium/light…), `stdArmor`.
- **`<Drive>`:** `maxSpeed`, `thrust`, `powerUse`.
- **`<Maneuver>`:** `maxRotationRate`, `rotationAccel` (top-down rotation model).
- **`<DeviceSlots>`:** ordered list of `<DeviceSlot criteria=… posAngle=… posRadius=…>`. Criteria use the item-attribute query language, e.g. `"w +property:omnidirectional;"` (weapon, omnidirectional), `"w"` (any weapon), `"c"` (cargo/utility device), `cannotBeEmpty="true"` (mandatory slot). This is the ship-outfit constraint system.
- **`<Armor armorID="&itReactiveArmor;" count="4"/>`** — pre-installed segmented armor.
- **`<Devices>`** — default installed devices (`<Device deviceID="&itRecoillessCannon;"/>`).
- **`<Items>`** — cargo/loot onboard, dice expressions: `<Item count="4d6" item="&itHelium3FuelRod;"/>`.
- **`<Image imageID="&rsSapphire;" imageWidth="62" imageHeight="62" rotationCount="120" rotationColumns="12"/>`** — pre-rendered sprite with 120 rotation frames in a 12-column grid. This is why Transcendence has smooth 360° top-down rotation without realtime 3D.
- **`<HeroImage>`** — large marketing/dock-screen render.
- **`<Effects>`** — `<Effect type="thrustMain" posAngle="160" posRadius="7"…/>` thruster ports positioned in polar coords around the sprite.
- **`<PlayerSettings><ArmorDisplay>`** — per-ship HUD layout with named armor sections (`forward`, `starboard`, `port`, `aft`) — segmented damage UI per ship.
- **`<AISettings>`:** `fireRateAdj`, `fireAccuracy`, `perception`, `combatStyle="advanced"`.
- **`<level>`** (where present) gates the ship into a system-level tier.

### Visual style per faction

Confirmed via `imageID`/`manufacturer`/`attributes` in each faction file:
- **Commonwealth / human** (`CommonwealthShips.xml`): pre-rendered sprites (`rsSapphire`, `rsZubrinLarge`, `rsWolfen`) with manufacturer names — Zubrin Systems, Earth Industries (EI), Makayev, Rasiermesser, Pacific Defense. Real-world-flavored corporate branding.
- **Ares Orthodoxy** (`AresShips.xml`): manufacturer `"Ares Orthodoxy"`, classes Polar/Sandstorm/sentry — a unified alien-industrial aesthetic.
- **Charon Pirates** (`CharonPirates.xml`): Corsair, Drake, Viking, Charon frigate — gritty ramshackle raiders.
- **Iocrym** (`Iocrym.xml`): capital `size="350" mass="150000"`, `cyberDefenseLevel="12"`, `timeStopImmune="true"` — clearly boss-tier with exotic defenses.
- **Image strategy:** every ship is a pre-rendered multi-rotation sprite sheet (e.g. 120 frames), not a realtime model — keeps art pipeline parallelizable and lets modders drop in PNGs.

### Player ship progression

`StdPlayerShips.xml` defines **player-pilotable variants** with level suffixes: `scEI500PlayerL3`, `scEI500PlayerL4A/B/C`, `scSapphirePlayerL3`, `scEI200PlayerL4`, `scCenturionBlock2PlayerL6`, `scCenturionXPlayerL7`, `scMinotaurPlayerL7`, `scMinotaurPlayerL8`. The `L#` suffix encodes the **minimum system level** at which the ship is offered — i.e. ship progression is gated parallel to system difficulty (Levels I–X). 17 player ships in `StdPlayerShips.xml` + 3 more in `PlayerShips.xml`.

### Ship-count distribution by file (top contributors)

`CommonwealthShips.xml` 15, `StdPlayerShips.xml` 17, `AresShips.xml` 11, `CharonPirates.xml` 7, `SungSlavers.xml` 6, `Outlaws.xml` 6, `Xenophobes.xml` 4, `Marauders.xml` 4, `CommonwealthFleet.xml` (military), `CentauriWarlords.xml` 3, `DwargRaiders.xml` 3, `KobolWarlords.xml` 3. Total 215 across ~60 files.

---

## Items / Devices

The ship-outfit system is a single `<ItemType>` schema with a subtype child element selecting role.

### ItemType schema (`TransCore/StdWeapons.xml`, laser cannon)

```
<ItemType UNID="&itLaserCannon;"
        name=      "laser cannon"
        attributes="commonwealth, EI, energyWeapon, majorItem"
        level=     "1"
        frequency= "common"        <!-- rarity class -->
        value=     "380"
        mass=      "1000"
        description="...">
    <Image .../>
    <Weapon type="beam" damage="laser:1d4" fireRate="10" lifetime="30" powerUse="10" effect="&efLaserBeamDefault;"/>
</ItemType>
```

Common attrs: `level` (1–13), `frequency` (rarity — see below), `value` (credits), `mass`, `numberAppearing` (dice for loot), `charges` (consumables).

### Rarity / frequency system

`frequency=` values used across the repo (`grep -roh 'frequency=[^ ]*' --include=*.xml . | sort | uniq -c`):
- `common` ×116 (+30 inline)
- `uncommon` ×196 (+13 inline)
- `rare` ×177
- `veryrare` ×31
- `notrandom` ×30 (never spawned procedurally — mission/quest items)

This is the item-rarity axis that gates what wrecks and stations can drop. Separately, **encounter frequency** uses a positional string like `"ucccu rrvv- ----- ----- -----"` (`Debris.xml` `stShipwreck1`) where each character is a rarity at a system level (1–10); `-` = never. This dual rarity (item `frequency` × encounter `levelFrequency`) is a clean depth pattern.

### Item categories (by subtype tag, repo-wide counts)

- **Weapons** (`<Weapon>` 170): `type="beam"|"missile"|"cannon"…`, `damage="laser:1d4"` / `"blast:4d6; momentum4; WMD5"` (dice-based, with tags: blast, momentum, WMD = weapon-of-mass-destruction). `StdWeapons.xml` has 101 items (DM600 missile rack, laser cannon, recoilless cannon, blaster…).
- **Missiles** (`<Missile>` 92): distinct ammo/ordnance types.
- **Armor** (`<Armor …/>` 256): segmented, e.g. light ceramic, light reactive, plasteel. `StdArmor.xml` 60 items. Armor-mass categories defined once in `StdArmor.xml`: ultra-light(1000)…massive(12000)…dreadnought(100000). Each armor item has `hitPoints` + `hpBonus` per section.
- **Shields** (`<Shields>` 48): `hitPoints`, `regen`, `depletionDelay`, `powerUse`. `StdShields.xml` 37 items (A-class defender, Class I/II/III deflector, cyclotron, laser deflector).
- **Devices** (`<Devices>`/`<Device>` 281) + **Drive** (49) + **Reactor** (31): the ship-outfit slots. `StdDevices.xml` 31 items; reactors, drives, sensors, autofacs.
- **Useful/Misc items** (`UsefulItems.xml` 69, `MiscItems.xml` 93): consumables, commodities, fuel rods (`itHelium3FuelRod`), ore (`Ore.xml` 19), mining equipment (`StdMiningEquipment.xml` 14), autons (`StdAutons.xml` 8).
- **Unknown items** (`StdUnknownItems.xml` 10): unidentified loot you must scan to reveal.

### Item-attribute query language

Item `attributes` strings (e.g. `commonwealth, EI, energyWeapon, majorItem, disposable, military, lux, food, meds, res, ore, illegal`) are queried by `criteria` selectors everywhere — DeviceSlots (`"w +property:omnidirectional;"`), loot tables (`"* +food; -lux; -illegal;"`), station inventories. Same concept as CSS selectors for items. Example from `Commonwealth.xml`:
`criteria="* +food; -illegal;"` → "any food item, but not illegal". This single DSL drives device fitting, loot generation, and trade filtering.

---

## Star Systems

### Three-layer model

1. **`SystemType` templates (30)** — `StdSystems.xml` defines procedural archetypes (`ssEarthSpaceStandard`, `ssEarthSpaceRedDwarf`, `ssEarthSpaceAsteroids`, `ssEarthSpaceDesert`, `ssEarthSpaceNebulae`, `ssEarthSpaceVolcanic`, `ssEarthSpaceBinary`, `ssEarthSpaceIceRing`, `ssEarthSpacePrimordial`, …). Each template is a `<SystemGroup>` that procedurally lays out the star, asteroid belts, planets, stargates, stations, and debris using `<Lookup>`, `<Orbitals>`, `<Siblings>`, `<RandomLocation>`, `<RandomStation>`, `<FillLocations>`.
2. **Hand-authored topology** (`HumanSpaceMap.xml`) — the fixed star map: **29 `<Node>` + 3 `<NodeGroup>`** connected by **32 `<Stargate>` edges**. Each Node has an `(x,y)` position on the galactic map, an `initialState` (`known`/`positionKnown`/`unknown`), a system `level`, and either a fixed named `<System>` (Eridani, Rigel Aurelius, Charon, St. Katharine's Star) or a `<Table>` of randomly-chosen star names per archetype (so node "C1" might be Groombridge/Lalande/5 Indi/Foum Alhaut — same map position, varied flavor per playthrough).
3. **`<NodeGroup>` mainlines** — three named backbones (`NewBeyondMainline`, `UngovernedTerritoriesMainline`, `OuterRealmMainline`) that the `<TopologyCreator>` in `StarsOfThePilgrim.xml` wires together into a linear-ish path with optional branches. Example stochastic branch (`HumanSpaceMap.xml`): a 50/50 `<StargateTable>` either routes C4→C4A→CP (extra system) or directly C4→CP. So the *map topology is fixed but the routing has procedural variation* — replayability without losing landmark systems.

### SystemType schema (`StdSystems.xml`, `ssEarthSpaceStandard`)

```
<SystemType UNID="&ssEarthSpaceStandard;" attributes="envWater">
    <SystemGroup>
        <Lookup table="YellowStarSystem"/>
        <Lookup table="HumanSpaceStargates"/>          <!-- places the 2 stargates -->
        <RandomLocation probability="90" locationCriteria="++lifeZone; *planet">
            <RandomStation stationCriteria="*friendly; *primary"/>
        </RandomLocation>
        <FillLocations percentFull="80" stationCriteria="!primary; !debris;"
                       percentEnemies="65" separateEnemies="true"/>
        <RandomLocation probability="50" locationCriteria="++outerSystem; ++asteroids">
            <Orbitals count="1d6" distance="1d8+6" angle="random">
                <RandomStation stationCriteria="*debris"/>
            </Orbitals>
        </RandomLocation>
        <Orbitals count="1d12" distance="3d200+240" angle="random" exclusionRadius="100">
            <Table>
                <RandomStation chance="80" stationCriteria="*debris"/>
                <RandomStation chance="18" stationCriteria="*enemy" locationAttribs="void"/>
                <RandomStation chance="2"  stationCriteria="*friendly; !debris; !primary" locationAttribs="void"/>
            </Table>
        </Orbitals>
    </SystemGroup>
</SystemType>
```

Note the design knobs: `percentEnemies`, `separateEnemies`, `locationCriteria` selectors (`++lifeZone`, `++outerSystem`, `++asteroids` — `++` = strong preference), weighted `<Table>` chances. Stations are picked *by attribute tag* (`*friendly`, `*enemy`, `*primary`, `*debris`), not by hardcoded ID — so adding a new station auto-includes it in the right systems.

### Stargates (FTL)

Stargates are themselves `<StationType>`s (`Stargates.xml`): `&stStargate;` is `sovereign="&svNeutral;"`, `immutable="true"`, with 4 docking ports, an animated 48-frame sprite, and a dock screen with lore text. The player docks at a stargate and selects a destination node. There are variant gate types (`stMajellenStargate`). `stStargateBeacon` is the visual marker. Edge definition lives in `HumanSpaceMap.xml`: `<Stargate from="SE:Outbound" to="C1:Inbound"/>` — node IDs with `:Outbound`/`:Inbound` port qualifiers.

### Region label layer

`HumanSpaceMap.xml` `<SystemMap smHumanSpace>` carries `<MapEffect>` text labels positioning named regions over the background image: New Beyond, Charon Pirates, Huari Empire, Ungoverned Territories, Sung Slavers, Outer Realm, Ranx Empire. So the "galactic map" is a painted background + label overlay + topology graph + per-node system generator.

---

## Wreckage

This is one of Transcendence's signature depth systems. Wrecks are modeled as **station types** (so they can be docked with, looted, and have dock screens), not as items.

### Wreck station types (`TransCore/Debris.xml` + scattered `Wreck` types)

- `stShipwreck`, `stShipwreck1/2/3/4`, `stRadioactiveShipwreck`, `stCenturionWreck`, `stSandstormWreck`, `stCSCEuropaWreck`, `stHandOfSolaceWreck`, `stDallMissionWreck` — faction- or quest-specific wrecks.
- `stSealedCargoContainer`, `stWeaponsCache`, `stWeaponsCrate`, `stCargoCrate`, `stGenericCargoCrate`, `stFlotsam` — loot containers.
- All set `scale="ship"`, `mobile="true"`, `noMapIcon="true"`, `ejectaType="&vtWreckEjecta;"` (debris sprayed when shot), `sovereign="&svUnknownEnemy;"` (so anyone may attack/loot them), `dockScreen="&dsAbandonedShip;"`.

### Wreck schema (`Debris.xml`, `stShipwreck1`)

```
<StationType UNID="&stShipwreck1;" sovereign="&svUnknownEnemy;" ejectaType="&vtWreckEjecta;"
             attributes="debris,friendly,shipwreck" scale="ship" mobile="true">
    <Encounter systemCriteria="+humanSpace;" levelFrequency="ucccu rrvv- ----- ----- -----"/>
    <ImageVariants>
        <Shipwreck class="&scCorsair;"/>   <!-- reuse existing ship sprites as wreck art -->
        <Shipwreck class="&scBorer;"/>
        <Shipwreck class="&scEarthzone;"/>
        <Shipwreck class="&scRoninA;"/>
    </ImageVariants>
    <Items>
        <Table>
            <Null chance="20"/>                              <!-- 20% nothing -->
            <Lookup chance="30" count="1d3" table="&trConsumables1;"/>
            <Lookup chance="15" count="1"    table="&trConsumables2;"/>
            <Lookup chance="25" count="1"    table="&trMinorItem2;"/>
            <Lookup chance="10" count="1"    table="&trMajorItem2;"/>
        </Table>
    </Items>
    <Events>
        <GetExplosionType>(intContainerGetExplosionType gSource)</GetExplosionType>
        <OnDamage>(intContainerOnDamage gSource aDamageHP)</OnDamage>
    </Events>
    <DockingPorts portCount="2" portRadius="48" maxDist="3"/>
</StationType>
```

Key depth features:
- **`levelFrequency` positional code** (`ucccu rrvv- ----- …`): per-system-level spawn rarity (c=common, u=uncommon, r=rare, v=very rare, `-`=none). Wrecks taper off at high levels — early systems are full of loot, endgame is lean.
- **`<ImageVariants><Shipwreck class="…"/>`** — wrecks reuse live ship sprites, so any ship class automatically gets a wrecked visual. Zero extra art per wreck.
- **Loot is a nested `<Table>`** referencing reusable loot tables (`trConsumables1`, `trMinorItem2`, `trMajorItem2`) — tables are defined once and composed everywhere. `<Null chance="20"/>` adds the "empty wreck" letdown that makes loot feel variable.
- **Quest wrecks** carry mission state: e.g. `stCSCEuropaWreck` has a `VaultCode` data slot set per-game to a random code (`(cat (random codes) " " (random codes) " " (random 1 999))`) — a per-playthrough combination lock.

### Salvager NPC loop

`Salvagers.xml` defines `svSalvagers` who roam `+salvagerSpace` systems and compete with the player for wrecks. The Abbasid wreck (`Abbasid.xml`) sets `<Data id="core.noSalvage">True</Data>` to mark loot that salvagers are forbidden to take — a tag-based "reserved for player" flag. So the wreck system has its own NPC economy and a tag system to protect quest/loot drops.

### Loot tooling

`TransData/LootSim.cpp` is a CLI tool that simulates loot drops across all systems to balance the economy — Transcendence ships a data-simulation harness, not just a runtime. Companion tools: `EncounterSim.cpp`, `TradeSim.cpp`, `EncounterFrequency.cpp`, `SystemCount.cpp`, `ShipTable.cpp`, `TypeTable.cpp` — the entire content dataset is introspectable from outside the game.

---

## Extension system

Transcendence is **fully data-driven and explicitly extensible**. The Adventure is itself an XML bundle; everything else is a `<TranscendenceExtension>`.

### Root document types (top-level XML root elements)
- `<TranscendenceModule>` — a content library (the vast majority of `TransCore/*.xml`).
- `<TranscendenceAdventure>` — a playable game bundle: declares `<AdventureDesc>` (starting ship criteria, starting system, cover art, OnGameStart/OnGameEnd events) and `<Module filename="…"/>` includes. Example: `StarsOfThePilgrim.xml` is Part 1 of the main adventure and pulls in Benedict00–08, Heretic00–08, Huaramarca, PlayerShips, Elysium via `<Module>` includes.
- `<TranscendenceExtension>` — a mod pack: `UNID`, `name`, `version`, `apiVersion="43"`, `extends="&unidStarsOfThePilgrim;"` (declares dependency), `<Library>` includes, `<Module>` includes. Bundled example: `Extensions/Diagnostics/Diagnostics.xml` (`debugOnly="true"`, ships with the game as a test harness).
- `<CoreLibrary>` — base DOCTYPE + UNID allocation (e.g. `HumanSpaceVol01.xml` allocates the hex UNID ranges with comments like `<!-- 0000 4000-41FF: Human Space -->`).

### UNID allocation discipline

Every entity gets a stable hex UNID (e.g. `&scSapphire; = 0x…`). `HumanSpaceVol01.xml` opens with a *commented UNID range map* reserving blocks (0000–000F, 0010–001F, 4000–41FF, A000-A02F, F100…) per content category — so multiple modders can coexist by convention, and extensions take high ranges (`0xA0010000` for the Diagnostics extension). Backwards compatibility is explicit: `GalaxyLibrary.xml`/`HSCompatibility.xml`/`Compatibility10.xml`/`RPGCompatibility.xml` preserve deleted UNIDs.

### Extension runtime

C++ side loads extensions via `CSimpleLibraryResolver` and `CExtensionDirectory` (`TransWorkshop/ExtensionImpl.h`), which resolves `<Library>` references, tracks `Dependencies`, `Files`, `CoverImage`, and exposes them to the mod exchange UI (`Transcendence/CModExchangeSession.cpp`, `Transcendence/CChooseAdventureSession.cpp`). Steam Workshop integration exists (`TransWorkshop/steam/`, `CSteamCtx::GetOrCreateItem`). So the extension pipeline is first-class — installed, versioned, dependency-resolved, and Workshop-distributable.

### Composition mechanisms
- **`inherit="&baHumanTechShip;"`** — ShipClass/StationType inherit shared base behavior (e.g. all human ships inherit from `baHumanTechShip`).
- **`<Module filename="…"/>`** — file inclusion (Adventure/Extension composing many files).
- **`<Library unid="…"/>`** — depend on a library by UNID (resolved by `CSimpleLibraryResolver`).
- **`extends="&unidStarsOfThePilgrim;"`** — declare which Adventure an Extension extends.
- **`<Language>` blocks + TLisp** — all dialog, dock screens, and events are scripted in TLisp (a Lisp dialect embedded in XML CDATA), e.g. `(sysCreateStation &stHandOfSolaceWreck; …)`. Behavior is fully scriptable, not just data.

This is the single most important architectural lesson for SpaceFace: the base game ships *as* an adventure/module, identical in form to third-party content. There is no privileged "core" — only conventions and reserved UNID ranges.

---

## Data architecture

### Top-level entities (all keyed by hex `UNID`)
- `Sovereign` — faction (alignment + relationships).
- `ShipClass` — ship (hull/drive/maneuver/slots/armor/devices/items/image/AI).
- `StationType` — station OR wreck OR stargate OR asteroid (so polymorphic — a stargate is just a station with a `gateEffect`).
- `ItemType` — any item; subtype child (`<Weapon>`, `<Armor>`, `<Shields>`, `<Devices>`, `<Drive>`, `<Reactor>`, `<Missile>`) selects role.
- `SystemType` — procedural system template.
- `SystemMap` / `<Node>` / `<NodeGroup>` / `<Stargate>` / `<TopologyCreator>` — star-map graph.
- `MissionType` (77), `DockScreen` (227), `EffectType` (84), `EconomyType` (credits), `AdventureDesc`, `Type`/`Table`/`Group` (reusable loot & system-part tables).

### DOCTYPE reserves UNIDs as XML entities

Every file opens with a `<!DOCTYPE … [ <!ENTITY scSapphire "0x…"> … ]>` block, so refs look like `&scSapphire;` — readable, refactor-safe, and grep-friendly. This is why a `grep '&svCommonwealth;'` finds every reference to the Commonwealth sovereign across 242 files.

### Item-attribute query DSL

A mini-selector language (`"* +food; -lux; -illegal;"`, `"w +property:omnidirectional;"`, `"!primary; !debris;"`, `"++lifeZone; *planet"`) is used uniformly for: DeviceSlot fitting criteria, loot-table contents, station inventories, system placement criteria. One DSL, four subsystems.

### TLisp scripting layer

Behavior that data can't express is written in TLisp inside `<Events>` / `<Globals>` blocks (`<OnGameStart>`, `<OnDamage>`, `<GetExplosionType>`, `(sysCreateStation …)`, `(objSetSovereign …)`, `(msnCreate &msReachGalacticCore; Nil)`). This gives modders full imperative control without recompiling — and the runtime ships with a TLisp interpreter (`Game/TLisp/`).

---

## Depth patterns (cited)

1. **Data-as-the-game (extension-first architecture).** The base adventure (`StarsOfThePilgrim.xml`) is structurally identical to a mod (`Extensions/Diagnostics/Diagnostics.xml`) — both are XML bundles with `<Module>` includes, `<Library>` deps, TLisp events. C++ just loads and interprets. *Citation: `TransCore/StarsOfThePilgrim.xml`, `Extensions/Diagnostics/Diagnostics.xml`, `TransWorkshop/ExtensionImpl.h`.* Depth implication: the community can ship (and Steam-Workshop-distribute) anything the base game can do.

2. **Fixed-topology star map with procedural system interiors and stochastic routing.** 29 hand-placed nodes + 32 stargate edges give the player *navigable landmarks* (Eridani, St. Katharine's, Charon) while each node's interior is a procedural `SystemType` and even the *routing between* nodes has `<StargateTable>` 50/50 branches. *Citation: `TransCore/HumanSpaceMap.xml` lines 91–105 (StargateTable), `StdSystems.xml` (`ssEarthSpaceStandard`), `StarsOfThePilgrim.xml` (`<TopologyCreator>`).* Best of both worlds: hand-authored coherence + procedural replayability.

3. **Per-level encounter rarity encoding.** A single positional string `"ucccu rrvv- ----- ----- -----"` (`Debris.xml` `stShipwreck1`) encodes spawn frequency across 10 system levels using c/u/r/v/- glyphs. Combined with item `frequency` (common/uncommon/rare/veryrare/notrandom) and `level` (1–13), this produces a 2D rarity surface (item rarity × system level) in a few characters per entity. *Citation: `TransCore/Debris.xml`, frequency tally across `TransCore/*.xml`.* Very high data-density.

4. **Wrecks-as-stations with reusable art and shared loot tables.** Wrecks (`stShipwreck1/2/3`, faction wrecks) are full station types with dock screens, faction-neutral sovereignty, `<ImageVariants><Shipwreck class="…"/>` that reuses live-ship sprites, and `<Items><Table>` referencing shared `trConsumables`/`trMinorItem`/`trMajorItem` tables. Salvager NPCs compete for the same wrecks; quest loot sets `core.noSalvage=True`. *Citation: `TransCore/Debris.xml`, `TransCore/Abbasid.xml`, `TransCore/Salvagers.xml`.* This turns "loot the dead" into a systemic gameplay loop rather than scripted events.

5. **Item-attribute selector DSL unifying four subsystems.** One mini-language (`"* +food; -illegal;"`, `"w +property:omnidirectional;"`, `"!primary; !debris;"`, `"++lifeZone; *planet"`) drives DeviceSlot fitting, loot generation, station inventories, and system placement. *Citation: `TransCore/CommonwealthShips.xml` (DeviceSlot criteria), `TransCore/Commonwealth.xml` (economy ItemAttribute), `StdSystems.xml` (locationCriteria).* Add a new tagged item and it automatically flows into the right slots, drops, and shelves.

6. **2-axis faction alignment + explicit mutual relationships.** Sovereigns declare `alignment` on constructive/destructive × chaos/order (`StdSovereigns.xml`) plus optional `<Relationship sovereign=… disposition="friend|enemy" mutual="true"/>` pairs (`Huari.xml`). Produces an emergent diplomatic web from a tiny schema, and the `attributes` system (e.g. `+enemy`, `+friendly`, `+pirates`) lets system/station generators pick combatants by tag rather than ID.

7. **Ancient-race mystery as progression engine.** The stargates (`Stargates.xml`) are explicitly relics of unnamed "Ancient Races"; the Iocrym (`Iocrym.xml`, capital ship size 350, `cyberDefenseLevel=12`, `timeStopImmune`) are the visible remnant; the Part 1 OnGameEnd either continues ("To be continued…") or ends "never reached the Galactic Core." The mystery is structural (a literal journey toward an unknown core), not just flavor. *Citation: `TransCore/Stargates.xml` (lore text), `TransCore/Iocrym.xml`, `TransCore/StarsOfThePilgrim.xml`.*

---

## What SpaceFace could learn

1. **Ship the base game as a mod.** Transcendence's base adventure and third-party extensions use the *same* XML document type (`<TranscendenceModule>`/`<TranscendenceExtension>`) with `<Module>` includes and `<Library>` deps; the only difference is reserved UNID ranges and `extends=` pointers. SpaceFace should make its core content pack structurally indistinguishable from a community content pack from day one — same loader, same schema, same Workshop path — so modding isn't a retrofit. *(Grounded in `Extensions/Diagnostics/Diagnostics.xml` vs `TransCore/StarsOfThePilgrim.xml`.)*

2. **Adopt a fixed star-map backbone with procedural interiors and stochastic routing.** Hand-author ~30 landmark systems (named, with known positions and lore) connected by stargate edges, but generate each system's contents from typed templates and add 50/50 branch routes between landmarks (`<StargateTable>`). Players get memorable places (Eridani, St. Katharine's, Charon) and replayability (varied interiors and routing) without an amorphous fully-procedural blob. *(Grounded in `HumanSpaceMap.xml` `<NodeGroup>` + `<StargateTable>`, `StdSystems.xml` `<SystemType>`.)*

3. **Model wrecks/loot as first-class dockable entities, not item drops.** Make shipwrecks a subtype of station with their own dock screen, neutral faction, reusable ship-sprite art (`<ImageVariants>`), and a loot `<Table>` referencing shared rarity buckets. Add an NPC competitor (the Salvager pattern) and a `core.noSalvage`-style tag to protect quest loot. This makes "explore → find wreck → decide to dock or fight over it" a systemic loop. *(Grounded in `TransCore/Debris.xml` `stShipwreck1`, `TransCore/Salvagers.xml`, `TransCore/Abbasid.xml`.)*

4. **Use one attribute-selector DSL for fitting + loot + inventory + placement.** Define item attributes (military, food, illegal, omnidirectional, majorItem, …) once and query them everywhere with a CSS-like selector (`"* +food; -illegal;"`, `"w +property:omnidirectional;"`). New content then auto-flows into device slots, loot tables, station shelves, and system layouts without per-content glue code. *(Grounded in DeviceSlot `criteria` in `CommonwealthShips.xml`, economy `ItemAttribute` in `Commonwealth.xml`, `locationCriteria` in `StdSystems.xml`.)*

5. **Encode rarity as a per-level positional string + a separate item frequency.** Replace hand-tuned spawn tables with a compact code per entity (e.g. `levelFrequency="ucccu rrvv- ----- ----- -----"`) for "when does this appear at each of 10 system tiers" plus an item-level `frequency` (common/uncommon/rare/veryrare/notrandom). The two-axis result is tunable by editing a few characters, and a `LootSim`/`EncounterSim` harness can validate the economy offline. *(Grounded in `TransCore/Debris.xml` encounter encoding, frequency tally, `TransData/LootSim.cpp` + `TransData/EncounterSim.cpp`.)*

6. **(Bonus) Pre-rendered multi-rotation sprite sheets for ships.** Transcendence sidesteps realtime 3D by shipping each ship as a 120-frame rotation grid (`rotationCount="120" rotationColumns="12"`). For a 2D top-down SpaceFace this is a cheap path to buttery rotation, parallelizable art, and trivial modder-contributed sprites. *(Grounded in `TransCore/CommonwealthShips.xml` Sapphire `<Image>` block.)*

---

## File-path index (all absolute)

- Repo root: `/tmp/sf-research/repos/Transcendence/`
- All content XML: `/tmp/sf-research/repos/Transcendence/TransCore/*.xml`
- Ship schema exemplar: `/tmp/sf-research/repos/Transcendence/TransCore/CommonwealthShips.xml`
- Items: `…/TransCore/StdWeapons.xml`, `StdArmor.xml`, `StdShields.xml`, `StdDevices.xml`, `UsefulItems.xml`, `MiscItems.xml`, `AresItems.xml`, `Ore.xml`
- Factions: `…/TransCore/StdSovereigns.xml`, `Commonwealth.xml`, `AresOrthodoxy.xml`, `CharonPirates.xml`, `Iocrym.xml`, `Huari.xml`, `SungSlavers.xml`
- Systems & topology: `…/TransCore/StdSystems.xml`, `HumanSpaceMap.xml`, `StarsOfThePilgrim.xml`, `Stargates.xml`, `Primordial.xml`
- Wrecks/loot: `…/TransCore/Debris.xml`, `Salvagers.xml`, `Abbasid.xml`
- Extensions: `…/Extensions/Diagnostics/Diagnostics.xml`
- C++ extension loader: `…/TransWorkshop/ExtensionImpl.h`
- Data-sim tooling: `…/TransData/LootSim.cpp`, `EncounterSim.cpp`, `TradeSim.cpp`, `EncounterFrequency.cpp`, `SystemCount.cpp`
- Design doc (features by level): `…/Docs/FeaturesByLevel.txt`
