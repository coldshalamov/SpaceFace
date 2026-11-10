# Naev — Verified Content Inventory

Source repo: `/tmp/sf-research/repos/naev/` (a.k.a. `C:\Users\93rob\AppData\Local\Temp\sf-research\repos\naev`).
Extracted 2026-07-12 by reading the actual XML/Lua files. All stats below are copied from files; where a stat field is blank the source file genuinely omits it (the ship is a variant using `inherits="..."`).

> Path note: the brief said `naev/dat/...`; in this clone the data lives directly under `dat/...` (the repo root IS the project root). Counts below use the correct `dat/...` paths.

---

## Counts (from grep / ls / wc)

| Asset class | Count | Source path |
|---|---|---|
| Ships (XML) | **139** | `dat/ships/*/*.xml` |
| Factions (XML) | **32** | `dat/factions/*.xml` |
| Star systems (XML) | **554** | `dat/ssys/*.xml` |
| Space objects / planets+stations (XML) | **1320** | `dat/spob/*.xml` (+ `dat/spob/spaceport/`) |
| Outfits (XML) | **311** | `dat/outfits/*/*.xml` |
| Commodities (XML) | **24** | `dat/commodities/*.xml` |
| Effects (XML) | **39** | `dat/effects/*.xml` |
| Missions (Lua) | **248** | `dat/missions/**/*.lua` |
| Events (Lua) | **203** | `dat/events/**/*.lua` |
| AI profiles (Lua) | **59** | `dat/ai/*.lua` |
| Shared Lua libs (`scripts/`) | — | `dat/scripts/common/`, etc. |

Shell quirk note: `find -name '*.xml'` returns 0 on this MSYS/Git-Bash build, so all counts were taken with `ls dat/<dir>/*/*.xml | wc -l` and cross-checked against a Python `xml.etree` pass (139/139 ships parsed with 0 errors). Ship stats were extracted with `_extract_ships.py` (ElementTree), not by hand.

**Ships per faction subdir** (139 total):
`neutral 40, pirate 16, zalek 15, empire 10, sirius 10, soromid 10, dvaered 8, thurion 8, proteron 7, misc 6, collective 4, feral_bioship 3, unique 2`. (The `dat/ships/lua/` subdir holds code, 0 ship XMLs.)

---

## Factions (all 32, from `dat/factions/*.xml`)

Schema fields read per file: `<player>` (starting standing modifier; negative = hostile), `<colour>`, `<longname>`, `<ai>` (AI profile), `<spawn>`/`<standing>`/`<equip>` (Lua modules for NPC generation, reputation curves, loadouts), `<static/>`/`<invisible/>` (hidden/utility factions), `<known/>` (known at game start), `<allies>/<enemies>/<neutrals>`, `<local_th>` (local presence threshold), `<generator weight="x">Faction</generator>` (what NPCs spawn in their systems), `<tags>`.

| Faction (`name=`) | Player | Colour | Allies / Enemies (count) | Notes / territory tags |
|---|---|---|---|---|
| **Empire** | +1 | green | 0 allies / 7 enemies (Collective, Pirate, Marauder, Wild Ones, Dreamer Clan, Raven Clan, Black Lotus) | `greathouse`. Bureaucratic heart; largest territory. |
| **Dvaered** (House Dvaered) | +1 | brown | 0 / 7 enemies; neutrals Za'lek, Sirius, Soromid | `greathouse`. Oldest Great House, coalition of warlords. |
| **Sirius** (House Sirius) | +3 | aqua | 0 / 8 (incl. Nasin) | `greathouse`. State religion, Sirichana worship. |
| **Za'lek** (House Za'lek) | +2 | DarkRed | 0 / 7; neutrals Dvaered, Sirius, Empire, Soromid | `greathouse`. "Scientific heart of the Empire." |
| **Soromid** (Soromid Tribes) | 0 | orange | 0 / 7 | Genetically-modified post-pandemic humans; bio-ships. |
| **Thurion** | +1 | grey50 | 0 enemies | "Mysterious faction deep in the Nebula." `misn_cargo`,`misn_patrol`. |
| **Proteron** (Sovereign Proteron Autarchy) | -50 | purple | 0 / 13 | Caused "the Incident." Universally hostile. `misn_cargo`. |
| **Goddard** (House Goddard) | +2 | lightblue | 0 / 7 | Minor house; ship fabricator for Dvaered. |
| **Frontier** (Frontier Alliance) | +3 | yellow | 0 / 7; neutrals FLF, Dvaered | Survivors of first human expansion. |
| **FLF** (Frontier Liberation Front) | 0 | yellow | 0 / 1 enemy (Dvaered) | Terrorists / independence movement. |
| **Pirate** (Galactic Space Pirates) | -20 | red | 0 / 15 | `pirate`,`criminal`. Disorganized clans. |
| **Marauder** (Pirate Marauders) | -50 | red | 0 / 15; mapname "Pirate" | Lowest, most aggressive pirates. |
| **Wild Ones** (Pirate Clan) | -40 | red | ally Pirate / 15 | "Haven sector between Empire and Soromid." |
| **Dreamer Clan** (Pirate) | -10 | red | ally Pirate / 15 | Frontier-disaffected pirates. |
| **Raven Clan** (Pirate) | -20 | red | ally Pirate / 15 | "Qorel sector between Empire and Dvaered." |
| **Black Lotus** (Pirate Clan) | -20 | red | ally Pirate / 15 | "Between Za'lek and Sirius." Organized crime. |
| **Collective** | -100 | silver | static; 0 / 10 | AI hivemind gone rogue; attacks all humans. |
| **Lost** | -100 | red | 0 / 15 (+Derelict) | "Excessive exposure to volatile Nebula." |
| **Independent** | +3 | lightblue | `invisible`; 0 / 8 | `generic`,`civilian`. Default civilian faction. |
| **Trader** | 0 | — | `invisible`,`static`; 0 / 8 | `generic`,`civilian`; mapname "Independent". |
| **Traders Society** (Space Traders Society) | +3 | lightblue | 0 / 8 | Spans all guilds (Astra Vigilis, Mining Vrata, Imperial Red Star). |
| **Free Trader** | 0 | — | `static`,`invisible`; neutrals incl. Pirate, Marauder | `generic`,`criminal`. |
| **Miner** | 0 | — | `static`,`invisible`; 0 / 6 | mapname "Independent". |
| **Mercenary** | 0 | — | `static`,`invisible`; neutrals all | Mission/static mercs. |
| **Independent Mercenary** | 0 | — | `static`,`invisible`; display "Mercenary" | Independent-spawned mercs. |
| **O'rez** (House O'rez) | +1 | aquablue | 0 / 4 (incl. Yetmer) | `minorhouse`. At war with Yetmer. |
| **Yetmer** (House Yetmer) | +1 | gold | 0 / 4 (incl. O'rez) | `minorhouse`. At war with O'rez. |
| **Nasin** | 0 | — | `invisible`; 0 / 1 enemy (Sirius) | "// TODO make dynamic faction." Uses sirius logo. |
| **Strangelove** | 0 | — | `static`,`invisible`,display "Independent"; 13 enemies | Has a fixed asset (Strangelove Lab). |
| **Cultist** (Harbringers of the Cloud) | 0 | — | `static`,`invisible` | ai=mercenary. |
| **Derelict** | 0 | — | `static`,`invisible` | "Used for some abandoned assets." |
| **Dummy** | 0 | — | `static`,`invisible` | Test/utility. |

**Faction territory (spobs per faction, computed from `presence` tags of all 1320 spob files):** Empire 99, Soromid 95, Sirius 93, Dvaered 92, Za'lek 58, Thurion 26, Proteron 18, Independent 17, Frontier 16, Collective 15, Derelict 10, Free Trader 9, Traders Society 9, Raven Clan 3, O'rez 3, Goddard 3, Black Lotus 3, Yetmer 2, Dreamer Clan 2, Wild Ones 2, Pirate 2, Lost 1, FLF 1, Strangelove 1. (Total tagged spobs = 580.)

**Systems "controlled" (≥1 spob of that faction):** Empire 47, Dvaered 44, Sirius 39, Soromid 39, Za'lek 31, Independent 15, Frontier 10, Derelict 10, Thurion 9, Free Trader 9, Proteron 8, Traders Society 6, Collective 5, Raven Clan 3, Black Lotus 2, O'rez 2, then 1 each for Yetmer/Goddard/Wild Ones/Pirate/Lost/Dreamer Clan.

---

## Ships (all 139, grouped by faction subdir)

Schema (from `dat/ships/empire/empire_lancelot.xml`, `dat/ships/neutral/goddard.xml`): root `<ship name=... [inherits=...]>`. Numeric base stats: `<health><armour>` (and optional `<shield>`), `<characteristics>` with `<crew> <mass> <fuel_consumption> <cargo>`. `<stats>` are *percentage modifiers* applied on top of engine/hull outfits (e.g. `speed_mod=-10`, `shield_mod=15`, `armour_regen=6`). `<class>` may carry a `display=` for flavor. `<points>` = AI/fleet-points value; `<price>` in credits; `<gfx size="...">` is a `.gltf` model with sprite-sheet size; `<fabricator>`, `<faction>`, `<licence>`, `<cond>` (Lua reputation gate), `<rarity>`, `<slots>` (weapon/utility/structure with `size` small/medium/large and `prop`). Many variants use `inherits="BaseName"` and only override changed fields — those show blank stats below meaning "inherits from base."

Ship classes observed: Interceptor, Fighter, Bomber, Corvette, Destroyer, Cruiser, Carrier, Battleship, Bulk Freighter, Freighter, Transport, Yacht, Courier, Scout, Station; plus bio- equivalents (Bio-Fighter, Bio-Corvette, etc.) and robotic equivalents (Robotic Interceptor, etc.).

Format below: `Name — class(display) | armour crew mass cargo | price pts`. Empty = variant inherits.

### collective (4) — `dat/ships/collective/`
- Drone — Robotic Interceptor | arm 40, crew 1, mass 20, cargo 0 | 300k, 30 pts. gfx drone.gltf (size 70). Fab: Robosys.
- Drone Carrier — Robotic Carrier | arm 1200, crew 12, mass 1400, cargo 100 | 6.0M, 190 pts.
- Drone (Hyena) — Robotic Interceptor | arm 40, crew 1, mass 40, cargo 0 | 500k, 20 pts.
- Heavy Drone — Robotic Fighter | arm 60, crew 1, mass 60, cargo 0 | 750k, 50 pts.

### dvaered (8) — `dat/ships/dvaered/`
- Dvaered Ancestor — Bomber | 60 / 6 / 80 / 10 | 550k, 40. Fab: House Dvaered.
- Dvaered Ancestor Calamity — variant | 50 / 6 / 90 / 6 | 850k.
- Dvaered Arsenal — Bulk Freighter | 1190 / 32 / 2050 / 320 | 5.4M, 120.
- Dvaered Goddard — Battleship | 2100 / 52 / 2500 / 140 | 9.2M, 200. Fab: House Goddard.
- Dvaered Phalanx — Corvette | 250 / 15 / 210 / 20 | 925k, 60.
- Dvaered Retribution — Cruiser | 1800 / 39 / 1300 / 100 | 5.0M, 150.
- Dvaered Vendetta — Fighter | 100 / 4 / 140 / 15 | 450k, 50.
- Dvaered Vigilance — Destroyer | 550 / 15 / 360 / 50 | 2.2M, 90.

### empire (10) — `dat/ships/empire/`
- Empire Admonisher — Corvette | 240 / 13 / 170 / 25 | 1.1M, 60. Fab: Nexus Shipyards.
- Empire Admonisher Longbow — variant | price 1.85M.
- Empire Hawking — Cruiser | 1600 / 35 / 1100 / 110 | 5.5M, 150.
- Empire Lancelot — Fighter | 70 / 4 / 80 / 15 | 500k, 40.
- Empire Lancelot Golden Efreeti — variant | 850k.
- Empire Pacifier — Destroyer | 550 / 17 / 400 / 40 | 2.1M, 90.
- Empire Pacifier Hoplite — variant | 3.3M.
- Empire Peacemaker — Carrier | 2400 / 65 / 2500 / 170 | 10M, 200.
- Empire Rainmaker — Bulk Freighter | 900 / 25 / 2000 / 370 | 5.0M, 120.
- Empire Shark — Interceptor | 40 / 2 / 40 / 10 | 280k, 30.

### feral_bioship (3) — `dat/ships/feral_bioship/` (NPC-only wild bioships, `noplayer`/`feral`/`noequip`/`nocargo` tags)
- Kauweke — Elder Feral Bioship / Battleship | arm 1300, crew 1, mass 1900 | 8.9M, 200. stat `armour_regen=12`.
- Nohinohi — Bio-Fighter / Fighter | 75 / 1 / 60 / 10 | 570k, 40. armour_regen=3.
- Taitamariki — Bio-Corvette / Corvette | 220 / 1 / 140 / 20 | 950k, 60. armour_regen=6.
  - Uses biological outfits (Talon Organ III, Mediocre Cerebrum II, Gene Drive, Cortex) — a separate equipment pipeline.

### misc (6) — `dat/ships/misc/` (stations-as-ships + utility)
- Escape Pod — Escape Pod / Interceptor | arm 1, crew 1, mass 5 | price 1.
- Fort Raelid — Station / Battleship | arm 5000, crew 500, mass 10000, cargo 5000 | price 1.
- Fort Raglan — Station / Battleship | arm 7000, crew 500, mass 30000 | price 1.
- One-Wing Goddard — Station / Battleship | arm 15000, crew 1, mass 5000 | price 1. (wrecked Goddard)
- Psychic Orb — Unknown / Interceptor | arm 1, crew 1, mass 999999 | price 1.
- Sindbad — Station / Battleship | arm 5000, crew 500, mass 100000 | price 1.

### neutral (40) — `dat/ships/neutral/` (the generic/civilian catalogue that factions draw from)
Fighters/interceptors: Lancelot (60/4/80/15, 450k), Vendetta (100/4/140/15, 400k), Tristan (80/3/95/23, 250k), Hyena (25/2/40/5, 210k), Shark (30/2/45/10, 250k), Schroedinger — Scout (20/2/20/4, 205k).
Corvettes: Admonisher (220/13/170/25, 950k), Phalanx (250/15/210/20, 850k), Starbridge — Destroyer (320/12/300/50, 1.7M).
Destroyers: Bedivere (390/22/420/110, 1.3M), Pacifier (475/17/400/40, 1.9M), Vigilance (550/15/360/50, 2.05M), Starbridge.
Cruisers: Hawking (1400/35/1100/110, 4.8M), Kestrel (1100/27/800/80, 3.7M).
Battleship: Goddard (1900/52/2300/140, 7.5M).
Carrier: (none standalone; Zebra Wolfie variant is a carrier).
Freighters/transports: Mule (350/13/430/230, 900k), Plowshare (120/3/330/320, 500k), Rhino — Armoured Transport (450/11/530/150, 1.4M), Zebra — Bulk Freighter (800/20/1880/340, 3.5M), Clydesdale — Armoured Bulk Freighter (950/25/1400/220, 4.525M), Goddard Merchantman — Bulk Freighter (1400/42/2000/290, 6.85M).
Yachts/couriers: Alpaca (15/1/50/30, 70k), Gawain (40/2/50/6, 500k), Llama (30/2/60/20, 120k), Koala (115/3/150/50, 420k), Quicksilver (65/4/125/30, 510k).
Bomber: Ancestor (60/6/80/10, 500k).
Variants (inherit base, price only / partial stats): Admonisher ΩIIa (1.28M), Ancestor HG Eagle-Eye (830k), Clydesdale Blockade Buster (5.725M), Gawain XY-37 (1.2M), Kestrel Sigma (6.3M), Koala Armoured (550k), Llama Voyager (235k), Mule Hardhat (1.1M), Quicksilver Mercury (1.49M), Shark ΨIIIa (290k), Starbridge Sigma (2.3M, arm 410), Vendetta Whiplash (550k), Zebra Wolfie (carrier, crew 15 mass 2100).

### pirate (16) — `dat/ships/pirate/`
- Dealbreaker — Battleship | 1600 / 61 / 2200 / 180 | 9.2M, 200.
- Pirate Admonisher — Corvette | 200 / 13 / 160 / 20 | 1.1M, 70.
- Pirate Ancestor — Bomber | 45 / 6 / 70 / 10 | 550k, 40.
- Pirate Bedivere — Destroyer | 340 / 24 / 400 / 150 | 1.31M, 75.
- Pirate Blue Shark — variant | 390k.
- Pirate Hyena — Interceptor | 25 / 2 / 25 / 5 | 280k, 30.
- Pirate Kestrel — Cruiser | 950 / 28 / 740 / 80 | 3.96M, 130.
- Pirate Kestrel Galaxy Soul — variant | 5.35M.
- Pirate Kestrel Yuri's Kiss — variant | 5.71M.
- Pirate Phalanx — Corvette | 190 / 15 / 180 / 25 | 925k, 60.
- Pirate Revenant — Bio-Corvette / Corvette | 170 / 12 / 165 / 20 | 1.8M, 60.
- Pirate Rhino — Armoured Transport | 550 / 10 / 500 / 90 | 1.45M, 80.
- Pirate Shark — Interceptor | 35 / 2 / 45 / 10 | 280k, 30.
- Pirate Starbridge — Destroyer | 300 / 14 / 290 / 50 | 1.85M, 80.
- Pirate Vendetta — Fighter | 90 / 4 / 135 / 15 | 450k, 50.
- Pirate Zebra — Carrier | 1400 / 40 / 2100 / 210 | 8.0M, 180.

### proteron (7) — `dat/ships/proteron/`
- Proteron Archimedes — Battleship | 1900 / 40 / 2400 / 120 | 12M, 200.
- Proteron Dalton — Interceptor | 40 / 2 / 35 / 5 | 280k, 30.
- Proteron Euler — Scout | 30 / 2 / 24 / 5 | 200k, 20.
- Proteron Gauss — Destroyer | 500 / 20 / 250 / 40 | 2.2M, 90.
- Proteron Hippocrates — Destroyer | 400 / 19 / 270 / 40 | 1.9M, 80.
- Proteron Pythagoras — Cruiser | 1400 / 33 / 1000 / 100 | 6.0M, 150.
- Proteron Watson — Carrier | 1800 / 65 / 2400 / 70 | 11M, 200.

### sirius (10) — `dat/ships/sirius/`
- Sirius Divinity — Carrier | 1400 / 36 / 2100 / 110 | 11M, 200.
- Sirius Dogma — Battleship | 1800 / 43 / 2200 / 120 | 9.4M, 200.
- Sirius Fidelity — Interceptor | 45 / 2 / 50 / 10 | 320k, 30.
- Sirius Preacher — Corvette | 250 / 11 / 150 / 20 | 1.2M, 60.
- Sirius Providence — Bulk Freighter | 1000 / 28 / 1850 / 330 | 5.4M, 120.
- Sirius Shaman — Bomber | 50 / 4 / 70 / 15 | 525k, 40.
- Starbridge Herald — variant of Starbridge | 400 / 22 / 300 / 50 | 2.6M.
- Astral Projection Lesser — Interceptor | 200 / 1 / 30 / 0 | price 1, 30 pts.
- Astral Projection Normal — Corvette | 500 / 1 / 100 / 0 | price 1, 30 pts.
- Astral Projection Greater — Cruiser | 1300 / 1 / 300 / 0 | price 1, 30 pts. (Sirius psychic constructs)

### soromid (10) — `dat/ships/soromid/` (bioships)
- Soromid Arx — Bio-Carrier / Carrier | 1300 / 36 / 1900 / 110 | 18.9M, 200.
- Soromid Brigand — Bio-Interceptor / Interceptor | 45 / 2 / 35 / 10 | 380k, 30.
- Soromid Copia — Bio-Freighter / Bulk Freighter | 900 / 25 / 1350 / 400 | 5.5M, 120.
- Soromid Ira — Bio-Cruiser / Cruiser | 1650 / 35 / 1020 / 110 | 7.1M, 200.
- Soromid Marauder — Bio-Bomber / Bomber | 45 / 6 / 70 / 10 | 700k, 40.
- Soromid Nyx — Bio-Destroyer / Destroyer | 550 / 17 / 300 / 40 | 2.9M, 90.
- Soromid Nyx Symbiotic — variant | 3.5M.
- Soromid Odium — Bio-Corvette / Corvette | 220 / 13 / 170 / 25 | 1.35M, 60.
- Soromid Reaver — Bio-Fighter / Fighter | 75 / 4 / 70 / 15 | 670k, 40.
- Soromid Vox — Bio-Battleship / Battleship | 2000 / 42 / 2300 / 130 | 23M, 240.

### thurion (8) — `dat/ships/thurion/` (mysterious Nebula faction)
- Thurion Apprehension — Destroyer | 550 / 12 / 250 / 50 | 2.3M, 90.
- Thurion Certitude — Battleship | 2400 / 24 / 2000 / 180 | 9.0M, 200.
- Thurion Ingenuity — Fighter | 100 / 2 / 47 / 15 | 650k, 40.
- Thurion Perspicacity — Interceptor | 50 / 1 / 30 / 10 | 350k, 30.
- Thurion Perspicacity Beta — Scout | variant | 530k, 20.
- Thurion Scintillation — Bomber | 60 / 4 / 65 / 20 | 750k, 40.
- Thurion Taciturnity — Armoured Transport | 500 / 6 / 400 / 100 | 1.6M, 80.
- Thurion Virtuosity — Corvette | 300 / 9 / 140 / 25 | 1.25M, 60.

### unique (2) — `dat/ships/unique/`
- Black Diamond — Fighter | 60 / 1 / 80 / 0 | 450k, 40.
- Emerald Sword — Battleship | 1800 / 52 / 2200 / 90 | 9.5M, 200.

### zalek (15) — `dat/ships/zalek/` (heavy drone/robotic line)
- Za'lek Bomber Drone — Robotic Bomber / Bomber | 30 / 1 / 105 / 0 | 250k, 40.
- Za'lek Demon — Destroyer | 400 / 17 / 270 / 50 | 2.4M, 100.
- Za'lek Demon Type IV — variant | 3.8M (arm 300).
- Za'lek Diablo — Carrier | 1000 / 28 / 1910 / 80 | 7.0M, 200.
- Za'lek Diablo RAT — Battleship | 1050 / 32 / 1870 / 60 | 9.0M.
- Za'lek Heavy Drone — Robotic Fighter / Fighter | 50 / 1 / 120 / 0 | 350k, 40.
- Za'lek Hephaestus — Carrier | 1200 / 32 / 2800 / 110 | 16M, 300.
- Za'lek Light Drone — Robotic Interceptor / Interceptor | 30 / 1 / 80 / 0 | 90k, 26.
- Za'lek Mammon — Bulk Freighter | 520 / 22 / 1770 / 310 | 4.6M, 110.
- Za'lek Mephisto — Battleship | 1200 / 28 / 2000 / 120 | 9.1M, 200.
- Za'lek Mephisto Type V — variant | 13.4M.
- Za'lek Scout Drone — Robotic Scout / Scout | 20 / 1 / 50 / 0 | 180k, 24.
- Za'lek Sting — Corvette | 230 / 12 / 150 / 25 | 1.3M, 70.
- Za'lek Sting Type II — variant | 1.95M.
- Za'lek Sting Type IV — variant | 2.1M.

---

## Star Systems

**554 systems**, schema from `dat/ssys/gamma_polaris.xml` and `dat/ssys/acheron.xml`:
```
<ssys name="...">
 <general><radius/><spacedust/><interference/><background?>...</general>
 <pos x=".." y=".."/>            <!-- galactic-map position -->
 <spobs>                         <!-- references by NAME to dat/spob/*.xml -->
   <spob>Emperor's Fist</spob>
   <spob_virtual>Trade Lane (Empire)</spob_virtual>   <!-- logical/derived presence -->
 </spobs>
 <jumps>
   <jump target="Apez"><hide>0|1</hide><pos .../><hidden?/></jump>   <!-- hide=1 = hidden until scouted -->
 </jumps>
 <asteroids><asteroid><group>typeA-poor</group><radius/><pos/></asteroid><exclusion.../></asteroids>
 <tags><tag>tradelane</tag></tags>
</ssys>
```
Systems are deliberately thin containers: all faction ownership, services, population and behaviour live in the referenced `spob` files (see Data architecture). Asteroids reference named groups in `dat/asteroids/groups/*.xml` (`typeA_poor`, `typeA_rich`, `typeB-standard`, etc.).

**Density / structure (computed across all 554):**
- 142 systems are **empty** (0 spobs) — pure navigation/hazard space.
- 220 systems have **≥4 spobs**.
- Jumps are mostly auto-generated (`was_auto="true"`); `hide=1` jumps are scannable hidden routes; `<hidden/>` jumps need special discovery (e.g. Acheron → Terminus).

**Top populated systems** (spob count / jumps / asteroids / dominant faction):
| System | spobs | jumps | asteroids | faction |
|---|---|---|---|---|
| Gamma Polaris | 12 | 5 | 1 | Empire (7) — capital region; `Emperor's Fist`, `Emperor's Wrath`, `Polaris Prime`, `Hypergate Gamma Polaris` + virtual `Trade Lane (Empire)` |
| Dvaer | 11 | 4 | 1 | Dvaered (5) — `Dvaered High Command`, `Hypergate Dvaer` |
| Ruadan | 11 | 3 | 0 | Za'lek (4) |
| Za'lek | 11 | 5 | 0 | Za'lek (6) |
| Nartur | 10 | 2 | 0 | Empire (4) |
| Alteris | 9 | 4 | 1 | Free Trader/Independent |
| Ariadus | 9 | 2 | 0 | Soromid (4) |
| Brimstone | 9 | 5 | 0 | Free Trader/Frontier |
| Kansas | 9 | 1 | 1 | Soromid (4) |
| Koralis | 9 | 3 | 1 | Empire (3) + Free Trader |
| Mirror | 9 | 2 | 0 | Sirius (3) |
| Aesir | 8 | 1 | 0 | Sirius (6) — `Sirius Shipyards`, `Mutris` (religious hub) |
| Arcturus | 8 | 3 | 2 | Empire (4) |
| Cerberus | 8 | 3 | 0 | Soromid (3) |
| Delta Pavonis | 8 | 3 | 0 | Empire (3) |

**Notable named systems / regions (from filenames + faction XML lore):**
- **Gamma Polaris / Emperor's Fist** — Imperial capital rebuilding project (C-class terraformed world, pop 127000).
- **Dvaer** — House Dvaered seat (`Dvaered High Command`).
- **Aesir / Mutris** — Sirius religious heart; `Sirius Shipyards` builds warships "in proximity to Mutris to endow Sirichana's power."
- **Eye of Night** — Sirius-related mystery start (referenced by `sirius_awakening.lua`).
- **Sol** — destroyed in "the Incident" (Proteron-caused); `barnards_star_ruined_ringworld.xml` spob evokes the aftermath.
- **Frontier** region — `Frontier` systems; FLF insurgency vs Dvaered.
- **Haven sector** — Wild Ones pirates (between Empire and Soromid).
- **Qorel sector** — Raven Clan pirates (between Empire and Dvaered).
- **The Nebula** — volatile region; Thurion live "deep in the Nebula"; the `Lost` are humans warped by nebula exposure; systems carry nebula volatility that gates POI generation (`poi.test_sys` rejects `vola > 25`).
- **Wildspace** — separate event/mission arc (`dat/events/wildspace/`, `dat/missions/wildspace/`).
- **Taiomi / Minerva / Onion** — each has its own dedicated mission+event subdirectory (mini story arcs).

**Faction regions** (territorial clusters inferred from spob counts above): Empire is the largest bloc (47 systems, core around Gamma Polaris); Dvaered (44) and Sirius (39) and Soromid (39) are the other great powers; Za'lek (31) is a compact scientific bloc; Thurion (9) and Proteron (8) occupy isolated/hostile pockets (Nebula / autarchy). Pirates are scattered, not territorial.

---

## Outfits & Commodities

**311 outfits** in `dat/outfits/`, partitioned by function:
| Subdir | Count | Purpose |
|---|---|---|
| weapons | 62 | beams, turrets, cannons (`antimatter_lance`, `turret_indigo_blaster`, …) |
| utility | 37 | scanners, jammers, afterburners, EPS upgrades |
| structure | 35 | hull plating, bulkheads |
| accessory | 29 | map reveal, licenses, misc non-slot items |
| launchers | 28 | missile/rocket tubes |
| fighter_bays | 25 | ship-launching bays |
| unique | 23 | one-off special gear |
| maps | 21 | region map unlocks |
| intrinsic | 17 | built-in ship traits |
| misc | 16 | |
| pointdefence | 8 | PD turrets |
| special | 4 | |
| flow | 3 | |
| core_system / core_hull / core_engine | 1 each | (mostly moved under structure/utility) |
| bioship, generated, lib, core_sets | 0 XML | code/template dirs |

Outfit schema (`dat/outfits/weapons/antimatter_lance.xml`): `<outfit name=><general><slot>weapon</slot><size>medium</size><rarity>4</rarity><mass/><price/><cpu/>...<specific type="beam"><lua>outfits/weapons/antimatter_lance.lua</lua><delay min="3.5">5</delay><duration/><range/><energy/><swivel/><damage><type>energy</type><penetrate/><physical/></damage><spfx_shield/><spfx_armour/><sound/><shader.../></specific>`. Heavy behavioural logic per-weapon lives in its own Lua under `dat/outfits/...`.

**24 commodities** in `dat/commodities/`: `astral_nectar, clay, diamond, food, gold, industrial_goods, iron, kermite, luxury_goods, medicine, neblaze, nebula_crystals, neodymium, nickel, olivine, ore, platinum, rhodium, silicate, space_moss, therite, vixilium, water, yttrium`. Schema (`astral_nectar.xml`): `<commodity><name/><description/><gfx_store/><price_ref>Food</price_ref><price_mod>350</price_mod><always_can_sell/>`. `price_ref` + `price_mod` drive the dynamic per-station pricing relative to a reference commodity.

---

## Missions & Events — how dynamic content works

**Two parallel faction-partitioned trees:**
- `dat/missions/<faction>/` — 248 Lua files, 21 faction subdirs (`baron, dvaered, empire, flf, minerva, neutral, onion, pirate, proteron, shadow, shark, sirius, soromid, taiomi, thurion, trader, tutorial, wildspace, yetmer, zalek`). Largest arcs by size: `neutral` 716 KB, `dvaered` 540 KB, `minerva` 444 KB, `zalek` 404 KB, `onion` 220 KB.
- `dat/events/<faction>/` — 203 Lua files, 23 subdirs (`cinematic, collective, derelict, dev, dvaered, flf, minerva, neutral, news, npc, onion, pers, pirate, priority_bounty, proteron, sirius, soromid, taiomi, thurion, trader, tutorial, wildspace, zalek`). Largest: `neutral` 34, `news` 19, `npc` 17, `pers` 12, `sirius` 8, `dvaered` 8, `minerva` 7, `derelict` 6.

**Registration mechanism — XML embedded in a Lua block comment.** Each gameplay Lua file starts with:
```lua
--[[
<?xml version='1.0' encoding='utf8'?>
<mission name="Adblocker">
 <unique />
 <chance>10</chance>
 <cond> ...lua condition... </cond>
 <location>Bar</location>
</mission>
--]]
```
The engine parses this XML header (without executing the file) to register the mission/event's **trigger location, spawn chance, gating conditions, uniqueness and spob-specificity**. Then, when triggered, it runs the Lua body. Verified coverage: **233/248 mission files and 119/203 event files** carry an `<?xml` header; the remainder are library/helper modules (e.g. files under `common/`, `npc/` generators) invoked by other scripts.

**Trigger locations** (frequency across all mission+event XML headers): `Bar` 151 (talk to an NPC in a station bar), `enter` 46 (on jumping into a system), `Computer` 44 (mission-terminal computer), `land`/`Land` 33 (on planetfall), `load` 27 (on game load), `None`/`none` 52 (started only by other scripts). This is the core "dynamic content" surface: the world is mostly a static XML backdrop, and Lua scripts hook these lifecycle points to inject procedural missions, bar encounters, news and derelicts.

**A canonical mission (`dat/missions/neutral/adblocker.lua`):** declares `mission = { name, description, reward, npc={name, description} }`; `create()` sets an NPC portrait via `vnimage.genericMale()`, calls `misn.setNPC(...)` to place the giver in the bar, and `misn.claim(system, true)` to reserve the target system so two missions don't collide. Dialogue is built with the `vn` (visual-novel) engine: `vn.scene()`, `vn.newCharacter(...)`, `vn.na(...)` (narration), `vn.menu{{"choice","label"}...}`, `vn.label/​vn.jump/​vn.done`. State persists via `mem.` and `var.peek/push`. Reusable logic lives in `dat/scripts/common/` (`cargo.lua`, `bounty.lua`, `poi.lua`, `derelict.lua`, per-faction helpers like `empire.lua`, `sirius.lua`).

**Event example (`dat/events/neutral/alsafi_druglab.lua`):** header `<location>land</location><chance>100</chance><spob>Alsafi II</spob><unique />` — fires only when landing on that specific planet, once ever. Body is a VN sequence ending in a combat encounter and a payout.

**News system (`dat/events/news/*.lua`, 19 files):** one file per faction (`dvaered, empire, flf, free_trader, frontier, goddard, independent, orez, pirate, proteron, sirius, soromid, thurion, trader, yetmer, zalek`) plus `generic.lua` and specials (`hypergates.lua`, `zalek_campaign.lua`). Each returns a Lua table of `head`/`greeting`/`articles = { {head=N_(...), body=_(...)}, ... }` categorized by section (Science & technology, Business, Politics, Human interest). The `_()` / `N_()` wrappers mark strings for gettext i18n. Articles are flavor (e.g. Dvaered: "New Mace Rockets", "FLF Responsible for Piracy", "FLF Terrorist Trial Ends"; generic: "Techs Probe for Sol", "Experiment Produces Cold Fusion").

**Other dynamic-content subsystems (each its own events dir):**
- `npc/` (17 files) — procedural bar characters (one per faction: `black_lotus, dreamer_clan, dvaered, empire, flf, frontier, generic, pirate, proteron, …`).
- `pers/` (12 files) — **persistent** named NPCs that roam systems (`dvaered, empire, indep, minerva, misn_escort, misn_refuel, pirate, sirius, soromid, thurion, trader, zalek`).
- `priority_bounty/` — tiered bounty system with a `bounties/` subdir.
- `cinematic/`, `tutorial/` — on-rails sequences.
- Faction plot arcs each have **both** an events and missions dir: `minerva`, `taiomi`, `onion`, `shadow` (missions only), `wildspace`, `baron`, `shark`.

---

## Wreckage & Derelicts

Derelicts are delivered as a **small event subsystem**, not a static asset class. Files:
- `dat/events/derelict/` (6 Lua files): `blackcat.lua, junker_pack.lua, junker_plates.lua, poi.lua, rescue.lua, sirius_awakening.lua`.
- `dat/scripts/common/derelict.lua` — thin shared helper: lazy-loaded SFX (`board` = `spaceship_door_open`, `unboard` = `spaceship_door_close`, ambient loop `snd/sounds/loops/derelict`) and `derelict.addMiscLog(text)` which creates/appends to a `"derelict"` ship-log under the "Neutral" faction.

**How a derelict fires:** each event Lua is a **factory function returning a table** `{ mission=..., chance=..., weight=..., func=function() ... end }` gated on world state. Examples:
- `poi.lua` (Point of Interest): gates on `not player.misnActive("Point of Interest - Intro")` and `<=3 active POIs`; on trigger it calls `poi.generate()` (from `common/poi.lua`), runs a VN aboard the derelict, and on "Download the data" starts the `Point of Interest` mission pointing the player at a generated uninhabited system, then logs `derelict.addMiscLog("You found information on a sensor anomaly aboard a derelict in the {sys} system.")`. `poi.test_sys()` filters candidate systems: must be claimable, nebula volatility `<= 25`, and have **no inhabited landable spobs** — i.e. derelicts lead you into genuinely empty wild systems.
- `rescue.lua` ("Derelict Rescue") — `chance=0.5`, simple duplicate guard.
- `blackcat.lua` ("Black Cat") — gated on `system.cur():presence("Wild Ones") > 0` (only where Wild Ones pirates are present), `weight=2`.
- `sirius_awakening.lua` — gated on `not sirius_playerIsPsychic()`, Sirius presence, and player knowing ≥10 Sirius systems; ties into the "Eye of Night Mystery" start.

**Named derelict-flavoured ships** in the catalogue: the `One-Wing Goddard` (`dat/ships/misc/`) — class "Station", a wrecked Goddard battleship (armour 15000, mass 5000, gfx `derelict_goddard`). The `derelict` faction itself (`dat/factions/derelict.xml`) is a static/invisible utility faction "used for some abandoned assets." Several spobs are tagged to the Derelict faction (10 spobs across 10 systems) representing abandoned installations.

---

## Data architecture

**Three-layer separation: static XML defines the world; Lua defines behaviour; art is referenced by relative path.**

1. **Faction** (`dat/factions/*.xml`) — declarative: relationships, colour, AI profile name, spawn/standing/equip Lua-module names, presence threshold, spawn-weight generators, tags. This is the "who" layer.
2. **Ship** (`dat/ships/<faction>/*.xml`) — declarative hull: stats, slot layout (weapon/utility/structure each with size + `prop`), `<stats>` percentage modifiers, model reference, fabricator, licence, reputation gate `<cond>`, and an optional `<lua>` per-ship behaviour script (e.g. `soromid.lua` for bioships, `thurion.lua` for the Collective Drone). Supports **`inherits="BaseName"`** so variants only declare deltas — this is why ~30 "variant" ships in the catalogue have blank stats. Outfits are slotted into `<slots>` by outfit *name string* (resolved at load against `dat/outfits/`), e.g. `<structure prop="engines" size="small">Unicorp Hawk 160 Engine</structure>`.
3. **Space object** (`dat/spob/*.xml`) — the real ownership layer. Each planet/station carries its own `<presence><faction/><base/><bonus/><range/></presence>` (faction + numerical presence value that feeds system NPC density), `<services>` (bit-set: `land/refuel/bar/missions/commodity/shipyard/outfits/blackmarket`), `<class>` (planet class), `<population>`, `<tech><item>` list (what shipyard/outfit tech it stocks), `<GFX><space/><exterior/>`, a **`<lua>` behaviour script** (e.g. `sirius_mil_restricted.lua`, `highclass.lua`, `hypergate_*.lua`), and `<tags>` (`restricted`, `station`, `shipbuilding`, `rural`, etc.). 1320 of these exist.
4. **System** (`dat/ssys/*.xml`) — thin spatial container: position, radius, list of spob *names* (resolved against `dat/spob/`), jump graph (`<jump target=...><hide/><pos/><hidden/></jump>`), asteroid groups, `<tags>` (e.g. `tradelane`). System faction is **derived** by aggregating its spobs' presences — there is no faction field on the system itself.
5. **Virtual spobs** (`<spob_virtual>` in a system) — logical/derived presences like `Trade Lane (Empire)` or `Pirate All Unpresence` that inject dynamic NPC behaviour without a physical planet.
6. **Outfit** (`dat/outfits/<type>/*.xml`) — declarative stats + a per-outfit `<lua>` for special behaviour (e.g. `outfits/weapons/antimatter_lance.lua`). Damage typing references `dat/damagetype/`.
7. **Commodity** (`dat/commodities/*.xml`) — pricing is *relative*: `price_ref` + `price_mod` against a reference commodity, with per-station buy/sell variance.
8. **Mission/Event** (`dat/missions|events/<faction>/*.lua`) — **self-registering**: each gameplay Lua embeds an XML manifest in a leading `--[[ ... ]]` comment (location, chance, conditions, spob, unique). The engine scans these headers to build the trigger registry, then runs the Lua on fire. Shared logic is factored into `dat/scripts/common/*.lua` (e.g. `cargo`, `bounty`, `poi`, `derelict`, `lmisn`, `prob`, `nebula`, plus per-faction helpers).
9. **AI** (`dat/ai/*.lua`, 59 files) — per-faction/behaviour profiles (`empire`, `pirate`, `marauder`, `baddie`, `miner`, `trader`, `mercenary`, `sirius`, `zalek`, `collective`, `lost`, `wild_ones`, `raven_clan`, `dreamer_clan`, `black_lotus`, `flf`, `frontier_police`, …), referenced by name from faction/ship XML.
10. **Effect** (`dat/effects/*.xml`, 39 files) — temporary status modifiers: `<duration>`, `<stats>` (e.g. `weapon_damage=50`), `<buff/>` or `<overwrite>`, `<icon>`. Examples: `ambush_hunter_i/ii`, `bloodlust`, `avatar_of_the_sirichana`, `feather_drive`, `crippling_plasma`, `astral_projection`, `cyberspace`.
11. **Asset pipeline** — art is referenced by bare name (e.g. `<gfx>lancelot_empire.gltf</gfx>`, `<icon>/gfx/misc/icons/hidden</icon>`) resolved under `dat/`/`assets/` at load; the build is CMake/meson-driven (`meson.build`, `build.rs.in`, `Cargo.toml.in` — Naev has a Rust+Lua+C core). The `start.toml` at `dat/start.toml` defines the default new-game scenario ("Sea of Darkness", ship `Llama`, 30000 credits, system `Delta Polaris`, start event `start_event`, default spob-Lua `spob/lua/default.lua`).

---

## Depth patterns (5 concrete, cited techniques)

1. **Faction-partitioned data trees.** Ships, missions and events each live under a per-faction subdirectory (`dat/ships/empire/`, `dat/missions/dvaered/`, `dat/events/sirius/`). This makes the relationship between lore and content mechanically obvious: to add a faction you create a directory in each tree; to audit a faction's content you `ls` three paths. 21 mission subdirs and 23 event subdirs, each named for a faction or story arc (`minerva`, `taiomi`, `onion`, `shadow`, `wildspace`, `baron`, `shark`).

2. **Self-registering Lua via embedded XML headers.** Every gameplay script declares its own trigger metadata in a `--[[ <?xml?> ... ]]` block (location/chance/cond/spob/unique). The engine scans headers without executing, so content authors add a new bar mission by dropping one file in a folder — no central registry, no manifest to edit. Verified at 233/248 missions and 119/203 events carrying headers; the rest are libraries. Trigger vocabulary is tiny and uniform (`Bar`, `Computer`, `land`, `enter`, `load`, `None`).

3. **554-system backdrop with derived faction presence + 142 deliberately empty systems.** Systems are thin spatial containers; faction control is *emergent* from aggregating per-spob `<presence>` values. 142 systems have zero spobs by design — they exist as navigation puzzles, ambush grounds, and (via `poi.test_sys`'s "no inhabited landable spobs" filter) as destinations for procedurally-generated Points of Interest. Empty space is content.

4. **Dynamic, faction-flavored news + persistent/procedural NPCs.** `dat/events/news/` is one Lua file per faction, each returning categorized article tables (`Science/Business/Politics/Human interest`) wrapped in `_()`/`N_()` for i18n — cheap, prolific, lore-reinforcing, and trivially extensible. Layered on top: `npc/` (procedural bar characters, 17 files) and `pers/` (persistent roaming named NPCs, 12 files) give stations life without hand-authoring every encounter.

5. **Variants via `inherits=` + percentage `<stats>` modifiers.** Instead of duplicating ship data, ~30 ships are pure deltas on a base hull (`<ship name="Starbridge Sigma" inherits="Starbridge">`). Combined with `<stats>` percentage modifiers on every hull (e.g. Dvaered ships uniformly trade speed for armour/energy: `speed_mod=-10; armour_mod=20`), Naev expresses an entire faction's combat *feel* in a few numbers, and creates dozens of named sub-variants (Lancelot Golden Efreeti, Kestrel Sigma, Za'lek Mephisto Type V) at near-zero data cost.

---

## What SpaceFace could learn (5 transferable techniques)

1. **Faction-partitioned content directories.** Mirror Naev's `ships/<faction>/`, `missions/<faction>/`, `events/<faction>/` layout. It scales to 32 factions and hundreds of files with no cataloguing overhead, and it makes "what does faction X have?" a one-liner. Pair it with a faction-definition file per faction that centralizes colour, AI/behaviour reference, relationships, and spawn weights (Naev's `dat/factions/*.xml`).

2. **Self-registering dynamic content.** Adopt Naev's "metadata-in-a-comment-header" idea (or its JSON/YAML equivalent): each content script declares its own trigger location, probability, gating condition, and uniqueness, and the engine auto-discovers it on load. This eliminated Naev's need for a central quest registry at 248 missions + 203 events and let authors work in complete isolation.

3. **Thin spatial layer + derived presence.** Make your star-system / sector objects thin containers (position, jump graph, child-object references) and derive faction control, threat level, and economy from the child objects' aggregated values. Naev's 142 intentionally-empty systems show that negative space ("nothing here") is itself a design tool for pacing, ambushes, and exploration leads.

4. **Relative pricing + per-faction news as lore vehicles.** Two cheap systems punch above their weight: commodities priced as `price_ref` + `price_mod` (one number per commodity per station, auto-balanced against a reference), and one news-article-table per faction (a few dozen strings, fully i18n-able) that turns each station visit into worldbuilding. Both are trivial to author and scale to hundreds of stations.

5. **Variant inheritance + stat-modifier factions.** Support `inherits` for entity definitions so variants are pure deltas, and express a faction's identity as a small set of percentage stat modifiers applied across its whole roster (Naev's Dvaered = slow/armoured/energy-heavy; Za'lek = drone/robotic; Soromid = regenerating bioships). This lets a faction feel distinct with minimal per-asset authoring and makes adding a new sub-variant a 5-line file.
