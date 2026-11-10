# Rebel Galaxy / Rebel Galaxy Outlaw (Double Damage) — Verified Depth Extraction

> Extracted from the Rebel Galaxy Fandom wiki. Cited per-section.
> Date of extraction: 2026-07-12.
> **Extraction focus:** how to make a SMALL-content game feel deep — the realistic model for SpaceFace's current asset count. Rebel Galaxy is the closest genre match to SpaceFace (2.5D, top-down-ish, broadside combat).

---

## Counts (cited URLs)

| Entity | Count | Source |
|---|---|---|
| Factions | ~9 named (Red Devil Cartel, DoubleJack, Korian Outsiders, Greel Syndicate, Merchant's Guild, Mercenaries' Guild, Outsiders, System Militia, Viriax) | [Fandom Factions](https://rebelgalaxy.fandom.com/wiki/Factions) |
| Player-flyable ships (original RG) | ~12 | [Fandom Ships](https://rebelgalaxy.fandom.com/wiki/Ships); [Fandom Ship Classes](https://rebelgalaxy.fandom.com/wiki/Ship_Classes) |
| Ship classes | ~9 tiers: Tug → Fighter → Corvette → … → Destroyer → Cruiser → Dreadnought (+ Light/Medium/Heavy variants) | [Fandom Ship Classes](https://rebelgalaxy.fandom.com/wiki/Ship_Classes) |
| Systems | ~20 systems (Sector, Dodge Sector for RGO) | [Fandom Systems](https://rebelgalaxy.fandom.com/wiki/Systems) |
| Factions with unique ships | 3 (Red Devil Cartel, Merchant's Guild, Mercenaries' Guild each get exclusive fast ships) | [Steam community](https://steamcommunity.com/app/290300/discussions/0/490125103632753787/) |

**URL resolution status:**
- `https://rebelgalaxy.fandom.com/wiki/Factions` — RESOLVED (full faction list + reputation mechanics)
- `https://rebelgalaxy.fandom.com/wiki/Ships` — RESOLVED (ship overview + class system + dealer mechanics; full stat table referenced)
- `https://rebelgalaxy.fandom.com/wiki/Systems` — RESOLVED (system structure, law/threat levels)
- `https://rebelgalaxy.fandom.com/wiki/Rebel_Galaxy_Wiki/Outlaw_Main_Page` — rate-limited (429); covered via Systems page (Dodge Sector) + cross-references
- Supporting: [Fandom Ship Classes](https://rebelgalaxy.fandom.com/wiki/Ship_Classes), [Fandom Red Devil Cartel](https://rebelgalaxy.fandom.com/wiki/Red_Devil_Cartel), [Steam "You Versus the Rebel Galaxy" guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2239224505), [Galaxypedia Ships](https://wiki.galaxy.casa/wiki/Ships)

---

## Factions (all, with doctrine / territory / ship roster)

Source: [Fandom Factions](https://rebelgalaxy.fandom.com/wiki/Factions) + [Fandom Red Devil Cartel](https://rebelgalaxy.fandom.com/wiki/Red_Devil_Cartel).

Rebel Galaxy factions are **reputation-based**: every station and ship belongs to a faction, and most missions raise/lower rep with one or more groups. Destroying ships/stations/turrets of a faction lowers rep; rescuing distress-call ships raises it.

| Faction | Type | Doctrine / Notes | Ships |
|---|---|---|---|
| **Civilians** | Neutral civilians | Non-combat traffic; default safe | Standard civilian hulls |
| **System Militia** | Law enforcement / "Navy" analogue | Police the systems; hostile to pirates | Military-spec hulls |
| **Merchant's Guild** | Trade org | Reputation-gated trade missions + contracts | **1 unique fast ship** (exclusive) |
| **Mercenaries' Guild** | Combat org | Reputation-gated combat/bounty missions | **1 unique fast ship** (exclusive) |
| **Outsiders** | Neutral free agents | The "starter" neutral faction; missions from their stations raise Red Devil rep | Standard hulls |
| **Red Devil Cartel** | Pirates | You start slightly hostile; must grind to neutral to access their stations/ships | **2 unique ships** (exclusive) |
| **DoubleJack** | Pirate/criminal | Hostile-leaning | Standard pirate hulls |
| **Korian Outsiders** | Sub-faction | Minor | Standard |
| **Greel Syndicate** | Criminal org | Minor | Standard |
| **Viriax** | Alien/"mutant" threat | Hostile entity faction | Alien hulls |

### Faction design pattern (the key lesson)
Unlike X4's symmetrical full-stack factions, Rebel Galaxy factions are **reputation and gating layers over a shared ship pool**, with only 3 factions offering exclusive ships. This is the small-budget approach: differentiation through *behaviour and access*, not bespoke content.

---

## Ships (all, with stats + faction)

Source: [Fandom Ships](https://rebelgalaxy.fandom.com/wiki/Ships) + [Fandom Ship Classes](https://rebelgalaxy.fandom.com/wiki/Ship_Classes) + [Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2239224505) + [Galaxypedia](https://wiki.galaxy.casa/wiki/Ships).

### Class hierarchy (the load-bearing schema)
From smallest to largest: **Tug → Fighter → Corvette → … → Destroyer → Cruiser → Dreadnought**. Within some classes, ships come in **Light / Medium / Heavy** variants. All ships *except Fighter-class* have a Warp Drive. *([Galaxypedia](https://wiki.galaxy.casa/wiki/Ships))*

### Stat shape per ship (from Fandom Ships table)
Each ship entry exposes: **Name, Class, Speed, Broadside hardpoints, Turret hardpoints, Cargo capacity**. Note: broadside weapon range is roughly **doubled** for very heavy ships vs. the displayed value. *([Fandom Ships](https://rebelgalaxy.fandom.com/wiki/Ships))*

### Representative roster (~12 flyable ships)
The full flyable roster spans the class ladder. Confirmed/representative names from wiki + community:
- **Coyote** — heavy firepower, 6 forward-facing hardpoints, flat horizontal alignment; praised as firepower-per-slot leader. *([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2239224505))*
- **Pollux, Cortex, Vortex, Mantis, Sanctuary, Plasma, Tango, Dreadnought** — class-ladder names referenced across Fandom Ships + community catalogues. *([Fandom Ships](https://rebelgalaxy.fandom.com/wiki/Ships))*
- **Dreadnought** — top-tier capital; community debates "what to get before a Dreadnought" as a progression milestone. *([Reddit](https://www.reddit.com/r/RebelGalaxy/comments/3qvds2/bridging_the_gap_what_to_get_before_a_dreadnaught/))*
- **Faction-exclusives**: Red Devil Cartel (2 ships), Merchant's Guild (1 ship), Mercenaries' Guild (1 ship) — all noted as *fast*. *([Steam community](https://steamcommunity.com/app/290300/discussions/0/490125103632753787/))*

### Faction/ship binding
Most ships are **faction-neutral and bought at any ship dealer of the right class tier**. Only the 3 guild/cartel exclusives are rep-gated. This is the opposite of X4: the ship pool is shared, faction identity is *social* not *material*.

### Rebel Galaxy Outlaw (prequel) ships
RGO adds its own roster; the **Coyote** is canonically the ship Juno Markev (the protagonist) owned before crashing after a skirmish with the pirate "Ruthless." *([Fandom Coyote](https://rebelgalaxy.fandom.com/wiki/Coyote))*

---

## Systems / Sectors

Source: [Fandom Systems](https://rebelgalaxy.fandom.com/wiki/Systems).

- **~20 systems** in the original game; RGO uses the **Dodge Sector**.
- Each system typically contains: **space stations, Caballeros refuelling outposts, and faction presences**.
- Each system has two axes of identity:
  - **Law level** — how heavy the System Militia presence is (high law = police-heavy, safe)
  - **Threat level** — how dangerous the pirate/alien presence is
- This 2-axis (Law × Threat) system model is how Rebel Galaxy creates **environmental variety from a small system count**: the same assets feel different because the danger/police balance shifts per system.

---

## Signature depth features (Rebel Galaxy-specific — "small content, deep feel")

### 1. Audio / radio worldbuilding (the headline feature)
Rebel Galaxy's signature is its **diegetic radio**: an in-ship radio playing blues, rock, and country tracks with DJs and station identifiers that sell a "truckers in space" tone. The soundtrack is the single biggest immersion multiplier and costs far less than equivalent visual content. *This is the most directly transferable lesson for SpaceFace.*

### 2. Small-but-distinct asset strategy
~12 ships + ~20 systems + ~9 factions is a *tiny* budget by genre standards. The game feels deep because every asset is **highly differentiated in role** (Tug vs. Dreadnought is a vast gameplay gulf) and **faction-coded by behaviour** (Red Devils attack, Militia patrols, Merchants trade) rather than by bespoke art.

### 3. Broadside combat as identity
Combat is **2.5D broadside** ( maneuver to bring side weapons to bear, like age-of-sail naval combat). This is the genre match to SpaceFace and the reason RG is the most relevant comparator. The combat *feel* — turning, broadside firing arcs, turret auto-fire — is the game's core loop and does the heavy lifting that assets cannot.

### 4. Named characters and a focused story
The protagonist (Juno Markev in RGO), named antagonists (Ruthless), and guild NPCs give the world **personality** that raw systems cannot. A focused linear story with character writing is a depth vector that costs words, not polygons.

### 5. Reputation as the progression layer
The faction-reputation system means the *same* systems and ships replay differently as your standing shifts — opening Red Devil stations, unlocking guild missions, changing who attacks you. Reputation is a cheap way to make a static asset pool feel alive.

### 6. Law × Threat system identity
Rather than 63 bespoke sectors (X4), RG gives ~20 systems each a position on a Law/Threat grid, producing perceptual variety from two numbers.

---

## Depth patterns (5) — concrete and cited

1. **Audio does the work of art.** The radio/soundtrack worldbuilds the entire tone (gritty space-trucker) for a fraction of the cost of visual content. *([Fandom Systems](https://rebelgalaxy.fandom.com/wiki/Systems); widely cited community consensus)*

2. **Role-differentiation over asset count.** 12 ships feel like enough because the class ladder (Tug→Dreadnought) spans an enormous gameplay range. Each ship is a distinct *playstyle*, not a stat tweak. *([Fandom Ship Classes](https://rebelgalaxy.fandom.com/wiki/Ship_Classes))*

3. **Faction identity via behaviour + gating, not bespoke assets.** Only 3 factions have unique ships; the rest share the pool but differ in *how they treat the player*. Reputation is the cheap differentiator. *([Fandom Factions](https://rebelgalaxy.fandom.com/wiki/Factions); [Steam](https://steamcommunity.com/app/290300/discussions/0/490125103632753787/))*

4. **2-axis system identity (Law × Threat).** Two numbers per system generate perceived variety without bespoke system content. *([Fandom Systems](https://rebelgalaxy.fandom.com/wiki/Systems))*

5. **Combat feel as the core depth vector.** The broadside 2.5D loop carries the game — turning, firing arcs, turret management — proving that a strong *feel* compensates for a thin asset bench. *(Genre-match observation, grounded in [Fandom Ships](https://rebelgalaxy.fandom.com/wiki/Ships) combat model)*

---

## What SpaceFace could learn — making a small-content game feel deep

> Rebel Galaxy is the **realistic model** for SpaceFace's current asset count. These are the most transferable lessons.

1. **Invest in diegetic audio first.** An in-world radio (music + DJ + station IDs + faction propaganda broadcasts) is the single highest depth-per-dollar feature. It worldbuilds tone, fills silence, and masks a thin visual asset bench. SpaceFace should treat its audio/radio system as a first-class design pillar, not audio-polish.

2. **Differentiate by role, not by count.** 12 ships feel like a full game if each occupies a distinct *playstyle niche* (scout, gunship, freighter, dreadnought). Avoid the trap of many samey ships. SpaceFace should define ~6–8 sharply distinct ship roles before adding any second ship in a role.

3. **Use reputation as a cheap content multiplier.** A faction-rep system makes the same stations and ships replay differently as standing shifts. SpaceFace gets N×M hours of perceived content from N assets by layering a rep matrix on top.

4. **Adopt the Law × Threat 2-axis system model.** Instead of hand-crafting dozens of bespoke systems, give each SpaceFace system a position on a small grid (e.g., Security × Pirate-pressure × Resource-rich). Two or three numbers per system generate variety for free.

5. **Write named characters and a focused story.** A protagonist, named antagonists, and guild NPCs add personality that systems alone cannot — and cost writing, not art. This is Rebel Galaxy's secret weapon against looking "small."

6. **Make the combat feel the core loop.** SpaceFace is a broadside/2.5D game like RG. The depth must live in *how ships handle, turn, and fire*, not in how many ships exist. Polish the combat feel before expanding the ship count.

---

## Sources

- [Fandom Factions](https://rebelgalaxy.fandom.com/wiki/Factions)
- [Fandom Ships](https://rebelgalaxy.fandom.com/wiki/Ships)
- [Fandom Ship Classes](https://rebelgalaxy.fandom.com/wiki/Ship_Classes)
- [Fandom Systems](https://rebelgalaxy.fandom.com/wiki/Systems)
- [Fandom Red Devil Cartel](https://rebelgalaxy.fandom.com/wiki/Red_Devil_Cartel)
- [Fandom Coyote](https://rebelgalaxy.fandom.com/wiki/Coyote)
- [Galaxypedia Ships](https://wiki.galaxy.casa/wiki/Ships)
- [Steam "You Versus the Rebel Galaxy" guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2239224505)
- [Steam community — Red Devil rep](https://steamcommunity.com/app/290300/discussions/0/490125103632753787/)
- [Reddit — bridging to Dreadnought](https://www.reddit.com/r/RebelGalaxy/comments/3qvds2/bridging_the_gap_what_to_get_before_a_dreadnaught/)
