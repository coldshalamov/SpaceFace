# X4: Foundations (Egosoft) — Verified Depth Extraction

> Extracted from community wikis (Fandom + Egosoft official + Roguey fan DB). Cited per-section.
> Date of extraction: 2026-07-12. Game version referenced: up to v8.0 / "Kingdom End" era DLC.
> **Extraction focus:** the living-economy depth ceiling — what SpaceFace's economy could aspire to.

---

## Counts (cited URLs)

| Entity | Count | Source |
|---|---|---|
| Playable factions (major + minor) | ~20 | [Fandom Factions](https://x4-foundations-wiki.fandom.com/wiki/Factions) |
| Sectors | **63** (base-game canonical per official wiki; grows with DLC) | [Egosoft official: Systems, Sectors and Zones](https://wiki.egosoft.com/X4%20Foundations%20Wiki/Manual%20and%20Guides/Objects%20in%20the%20Game%20Universe/Systems,%20Sectors,%20and%20Zones/) |
| Unique ship models | **~79 base**, ~100+ with all DLCs (~139 entries counting Sentinel/Vanguard/Builder/Miner variants) | [Reddit ship-model count](https://www.reddit.com/r/X4Foundations/comments/1353wlf/new_player_here_how_many_ship_models_are_in_this/); [Fandom Ship List](https://x4-foundations-wiki.fandom.com/wiki/Ship_list) |
| Ship size classes | 4 playable: **S / M / L / XL** (+ XS = non-player mass traffic) | [Fandom Ships](https://x4-foundations-wiki.fandom.com/wiki/Ships); [Fandom Small Size](https://x4-foundations-wiki.fandom.com/wiki/Small_Size) |
| Stations | Player-buildable from ~50+ module types; NPC stations procedurally placed and *dynamically built/destroyed* | [Fandom Factions](https://x4-foundations-wiki.fandom.com/wiki/Factions); [Egosoft manual](https://wiki.egosoft.com/X4%20Foundations%20Wiki/) |

**URL resolution status:**
- `https://x4-foundations-wiki.fandom.com/wiki/Factions` — RESOLVED (full faction list extracted)
- `https://roguey.co.uk/x4/factions/` — RESOLVED (cross-checked faction/race mapping + DLC colour coding)
- `https://x4-foundations-wiki.fandom.com/wiki/Sectors` — blocked by Fandom rate-limit (403 via curl, 429 via reader); sector **count** verified via Egosoft official wiki + Quantum Anomaly resource table
- `https://x4-foundations-wiki.fandom.com/wiki/Category:Ships` + `/wiki/Ships` — RESOLVED (via Fandom + Quantum Anomaly ship DB)
- Supporting: [Quantum Anomaly ships](https://www.qsna.eu/x4/ships), [Roguey ships](https://roguey.co.uk/x4/ships/), [Roguey universe map](https://roguey.co.uk/x4/universe/)

---

## Factions (all, with doctrine / territory / ship roster)

Source: [Fandom Factions](https://x4-foundations-wiki.fandom.com/wiki/Factions) + [Roguey factions](https://roguey.co.uk/x4/factions/) + [Lars Bodin faction/race map](https://lars-bodin.dk/?p=5524) + Steam community doctrine summary.

### Major factions (playable, build stations, have dedicated shipyards)

| Code | Faction | Race | Doctrine | Ships |
|---|---|---|---|---|
| **ARG** | Argon Federation | Argon | Balanced generalists; democracy; "vanilla" starter feel | Full S–XL roster |
| **ANT** | Antigone Republic | Argon (offshoot) | Diplomatic, cooperative, exploration-oriented | Full S–XL roster |
| **PAR** | Godrealm of the Paranid | Paranid | Religious traditionalists, three-eyed theocrats | Full S–XL roster |
| **HOP** | Holy Order of the Pontifex | Paranid (militant schism) | Zealous, militant, aggressive | Full S–XL roster |
| **TEL** | Teladi Company | Teladi (reptilian) | Profit-driven traders; slow ships, huge cargo | Full S–XL roster |
| **ALI** | Alliance of the Word | — | Minor diplomatic bloc | Partial roster |
| **ZYA / Split Families** | Zyarth's Territories / Split Families | Split | Hyper-aggressive warrior clans; fast paper-thin ships | Full S–XL roster (Split Vendetta DLC) |
| **RHA** | RahNrak Falouke's Realm | Split | Minor Split faction | Partial |
| **FRE** | Families of Nyrn | Split | Minor Split faction | Partial |
| **TER / PIO** | Terran Protectorate / Segaris Pioneers | Terran | Isolationist, superior tech, high-density economy | Full S–XL roster (Cradle of Humanity DLC) |
| **BOR / HOP** | Queen's Retribution / Boron factions | Boron (aquatic) | Defensive, peaceful traders (Kingdom End DLC) | Full S–XL roster |

### Minor / specialist factions (no full shipyards, smaller rosters)

| Code | Faction | Race / Type | Role |
|---|---|---|---|
| **HAT** | Hatikvah Free League | Argon breakaway | Free-trader enclave |
| **MIN** | Ministry of Finance | Teladi | Profit-oriented sub-faction |
| **DUC** | Duke's Buccaneers | Pirates | Mercenary/pirate faction |
| **PA** / **Provinces Adrift** | — | Outcasts | Minor |
| **SMC** | Smuggler factions | — | Contraband economy |
| **XEN** | Xenon | Rogue AI | **Enemy of all**; faction-less hostile threat that pressures the economy |

### Faction design pattern (the key lesson)
Each *major* faction owns a **complete vertical stack**: shipyard + wharf + equipment dock + distinct station architecture + a full S–XL ship line. Factions are **data-driven and symmetrical** — every race gets the same functional slots filled with stat-and-visual variants. This is what makes ~20 factions feel like ~20 *different games* rather than palette swaps.

---

## Ships (all classes, with stats + faction)

Source: [Fandom Ships](https://x4-foundations-wiki.fandom.com/wiki/Ships) + [Fandom Ship List](https://x4-foundations-wiki.fandom.com/wiki/Ship_list) + [Quantum Anomaly ships](https://www.qsna.eu/x4/ships) + [Roguey ships](https://roguey.co.uk/x4/ships/).

### Size taxonomy (the load-bearing schema)

| Size | Role examples | Note |
|---|---|---|
| **XS** | Drones, taxis, mass traffic | Non-player; ambient life |
| **S** | Scouts, Fighters, Interceptors, Light/Medium/Heavy fighters | Player-pilotable; carrier-based |
| **M** | Corvettes, Heavy Fighters, Miners, Freighters | The workhorse tier |
| **L** | Destroyers, Large Miners, Large Freighters | Capital combat + bulk logistics |
| **XL** | Carriers, Battleships, Resupply Ships, XL Freighters | Strategic assets |

### Role classes (orthogonal to size)
Scout, Fighter, Heavy Fighter, Interceptor, Miner (S/M/L), Freighter (M/L/XL), Courier, Courier Sentinel, Vanguard, Builder, Destroyer, Carrier, Battleship, Resupply.

### Per-ship variant naming convention (critical design detail)
A single hull model is sold as multiple **role variants** — this is X4's asset-multiplier:
- **Vanguard** — combat-focused loadout
- **Sentinel** — tank/heavy loadout
- **Miner** — mining lasers + ore hold
- **Builder** — TL-class construction ship
- **Courier** — cargo-optimised trader

So "79 unique hulls" balloons to ~139+ sellable ship entries with no new art — pure data varianting.

### Representative ship stat shape (from Roguey + Quantum Anomaly DBs)
Each ship entry carries: **size class, faction, hull HP, shield slots, weapon slots (turret + forward), cargo, max speed, price, crew capacity**. Example stat fields visible at [Roguey ships](https://roguey.co.uk/x4/ships/): Balaur (S), Baldric (M), Barbarossa (L), Barracuda (S).

### Faction ship-design differences (cited doctrine)
- **Argon** — balanced jack-of-all-trades hulls ([Fandom](https://x4-foundations-wiki.fandom.com/wiki/Factions))
- **Teladi** — slow, huge cargo, heavily shielded traders ([Steam doctrine summary](https://steamcommunity.com/app/392160/discussions/0/3825284962826855184/))
- **Split** — fast, fragile, gun-heavy ([Steam](https://steamcommunity.com/app/392160/discussions/0/3825284962826855184/))
- **Terran** — high-tech, dense module layouts, superior shielding ([Steam](https://steamcommunity.com/app/392160/discussions/0/3825284962826855184/))
- **Paranid** — religious aesthetic, balanced-but-premium tier ([Fandom](https://x4-foundations-wiki.fandom.com/wiki/Factions))

---

## Systems / Sectors

Source: [Egosoft official: Systems, Sectors and Zones](https://wiki.egosoft.com/X4%20Foundations%20Wiki/Manual%20and%20Guides/Objects%20in%20the%20Game%20Universe/Systems,%20Sectors,%20and%20Zones/) + [Quantum Anomaly resource table](https://www.qsna.eu/x4/resources) + [Roguey universe map](https://roguey.co.uk/x4/universe/).

### Spatial hierarchy (3 levels)
1. **Cluster** — a star system (contains 1+ sectors)
2. **Sector** — a navigable 3D region; **63 total** in the base galaxy
3. **Zone** — a sub-region inside a sector (where stations/asteroids live)

Sectors are linked by **Super Highways, Orbital Accelerators, and jump gates**. Example sector names (from [Quantum Anomaly](https://www.qsna.eu/x4/resources)): Argon Prime, Antigone Memorial, Bright Promise, Atiya's Misfortune, Black Hole Sun, Adventure's Promise, Asteroid Belt.

Each sector has an **owning faction** and **resource fields** (ore/silicon/ice/hydrogen/methane/nividia) that the economy actually consumes — sectors are not backdrops, they are supply nodes.

---

## Signature depth features (X4-specific)

### 1. The Living Economy (the headline feature)
Every wares-producing station requires **inputs** and produces **outputs** in a real supply chain. If the inputs stop, the outputs stop. If a factory is destroyed, its wares vanish from the galaxy until a new one is built — by an NPC or the player. Prices float by supply/demand in real time. *Source: [Egosoft manual](https://wiki.egosoft.com/X4%20Foundations%20Wiki/) + [Fandom Factions](https://x4-foundations-wiki.fandom.com/wiki/Factions).*

### 2. NPC-driven station construction and destruction
AI faction **wharfs and shipyards** build ships that the AI then flies. AI builders construct new stations when the economy demands wares. The player can also build stations, but so can everyone else — the universe is genuinely agent-driven, not scripted.

### 3. Boarding and capture of any ship
Every NPC ship — from a scout to an XL carrier — can be **boarded by marines and captured**, adding it to the player fleet. This makes every enemy ship a potential asset, not just a kill.

### 4. Walkable stations (first-person on-foot)
The player can ** disembark and walk inside stations** in first person, talk to NPCs, accept missions, hire crew, and trade. Station interiors are faction-themed (Argon stations look different from Paranid or Terran interiors). This is rare in the genre.

### 5. Fleet command + OOS (out-of-sector) simulation
The player can own and command hundreds of ships across the galaxy simultaneously via a hierarchical order system. Combat and production continue to simulate **out-of-sector** (when the player is elsewhere), so the economy never freezes.

### 6. Faction war diplomacy driven by player quests
Quest lines (e.g. Paranid Unification, the Terran plot) can **trigger wars between factions**, redrawing the political map. NPC "Dal Busta" offers the player choices to instigate Paranid-vs-Argon/Teladi/Split wars. *Source: [egosoft forum](https://forum.egosoft.com/viewtopic.php?t=450896), [Reddit war-order thread](https://www.reddit.com/r/X4Foundations/comments/1hwip14/).*

---

## Depth patterns (5) — concrete and cited

1. **Symmetrical vertical faction stacks.** Every major faction owns shipyard + wharf + equipment dock + full S–XL ship line. ~20 factions × full stack = emergent diversity without bespoke content per faction. *([Fandom Factions](https://x4-foundations-wiki.fandom.com/wiki/Factions))*

2. **Data-driven ship varianting.** One hull art asset → Vanguard / Sentinel / Miner / Builder / Courier variants = 5+ "ships" from 1 model. ~79 hulls → ~139+ entries. *([Reddit ship-model count](https://www.reddit.com/r/X4Foundations/comments/1353wlf/new_player_here_how_many_ship_models_are_in_this/))*

3. **Closed-loop economy with floating prices.** Wares have input/output recipes; prices move by supply/demand; destroying a factory removes its output galaxy-wide until rebuilt. This is the single biggest depth multiplier. *([Egosoft manual](https://wiki.egosoft.com/X4%20Foundations%20Wiki/))*

4. **Agent-driven world state.** NPC factions build, trade, fight, and conquer without player input — the universe is a simulation the player drops into, not a script the player triggers. *([Fandom Factions](https://x4-foundations-wiki.fandom.com/wiki/Factions))*

5. **First-person station interiors as faction identity.** Walkable, themed interiors turn "docking at a station" from a menu into a place — reinforcing faction visual identity for free. *([Fandom Factions](https://x4-foundations-wiki.fandom.com/wiki/Factions))*

---

## What SpaceFace could learn — the living-economy depth ceiling

1. **Steal the closed-loop ware economy, even at small scale.** Even a ~12-station economy with 8–10 wares in an input/output graph produces more perceived depth than 50 static shops, because prices *move* and scarcity *emerges*. SpaceFace can adopt the recipe-graph model with a fraction of X4's content count.

2. **Symmetrical faction stacks beat bespoke factions.** Give every faction the same functional slots (shipyard, market, quest-giver, ship dealer, signature ship) with stat/visual variants — this is how X4 makes 20 factions feel distinct on a data budget. SpaceFace's current asset count supports 3–5 well-differentiated factions done this way, not 10 bespoke ones.

3. **Variant ships are free depth.** One hull → 3–5 role variants (combat / trader / miner / tank) is the highest-ROI content multiplier in the genre. Adopt the Vanguard/Sentinel naming convention literally.

4. **Make destruction consequential.** If a station/freighter can be destroyed and its wares *leave the economy*, the player's actions gain weight. This does not require X4's scale — just that production be modelled, not faked.

5. **Aspire, don't replicate.** X4's true ceiling (walkable stations, OOS simulation, hundreds of owned ships, 63 sectors) is the product of a 20+ year franchise. SpaceFace should borrow the *patterns* (recipe economy, variant ships, symmetrical factions) while keeping its own scope focused — see the Rebel Galaxy file for the realistic small-asset comparator.
