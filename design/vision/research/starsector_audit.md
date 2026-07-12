> ⚠ **SUPERSEDED 2026-07-12 — UNVERIFIED, DO NOT TRUST OR BUILD ON THIS FILE.**
> This report was produced by an Antigravity (Gemini 3.5 Flash) sprint that did not pass the verification gate in `design/depth-program/research/VERIFICATION_RUBRIC.md`. Specific failure modes: claimed-comprehensive enumerations that sampled ~20%% of the game's actual content (e.g. "Comprehensive Ship Directory (40 Hulls)" for a game with 200+); exact numeric stats presented without source citation and likely recalled from training memory; counts not derived from fetching the game's actual data files.
> Any accurate content here is coincidental and will be re-derived from source during the verified sprints in `design/depth-program/research/`. Do not carry claims forward from this file by trust.
> See: `design/depth-program/research/00_RESEARCH_SPRINTS.md` (why this happened) and `design/depth-program/research/SPRINT_TEMPLATES.md` (the replacement process).

# Starsector — Technical Audit & Content Inventory

This report compiles a detailed catalog of the factions, ships, planets, and wonders populating the space simulation game **Starsector** (Fractal Softworks). It traces how the game structures its database and visual assets to establish its universe depth.

---

## 1. Directory Tree & Data Loading Mechanics

Starsector's database relies heavily on spreadsheets (`.csv` files) for stat attributes, and JSON formatting for faction behaviors and ship meshes.

```
[starsector-core]
  └── data/
       ├── hulls/
       │    ├── ship_data.csv         <-- Hull statistics (Armor, HP, slots, OP)
       │    └── [ship_id].ship        <-- Sprite layout, hardpoint coordinates
       ├── weapons/
       │    ├── weapon_data.csv       <-- Weapon statistics
       │    └── [weapon_id].wpn       <-- Weapon graphics & fire attributes
       └── world/
            └── factions/
                 ├── factions.csv     <-- Faction list registry
                 └── [faction_id].faction <-- Known ships, blueprints, colors
```

### Ship Configurations (`.ship` Files)
Each hull is configured in a JSON-formatted `.ship` file. This specifies the location of sprites (stored in `graphics/ships/`), engine nozzle coordinates, and the coordinates of all hardpoints (turrets and hidden slots).
*   **Collision Outlines:** Collision polygons are defined manually within the `.ship` file as a series of coordinate vertices, rather than generated automatically from the sprite's alpha channel.

---

## 2. Major Factions & Political Lore

The political layout represents a system isolated after the collapse of the Domain.

1. **Hegemony (`faction "hegemony"`)**
   * *Lore:* The largest faction in the sector, claiming to be the legitimate successor to the Domain. They enforce strict military rule, tax trade, and ban AI technology.
   * *Aesthetic:* Rusted orange and beige coloring, using low-tech hulls.
2. **Persean League (`faction "persean"`)**
   * *Lore:* A coalition of worlds united in their opposition to Hegemony rule. They fight for local autonomy, but are often internally divided.
   * *Aesthetic:* Royal blue and gold panel designs.
3. **Tri-Tachyon (`faction "tritachyon"`)**
   * *Lore:* A massive tech corporation that survived the collapse. They focus on AI research, high-tech weapons, and corporate profit.
   * *Aesthetic:* Sleek, futuristic blue and cyan hulls.
4. **Sindrian Diktat (`faction "sindrian"`)**
   * *Lore:* A military dictatorship founded by a rebel commander. They control the sector's fuel supply, operating from the Sindria system.
   * *Aesthetic:* Grey and purple hulls with sharp lines.
5. **Luddic Church (`faction "luddic_church"`)**
   * *Lore:* A religious organization opposing high technology and corporate greed. They live on agrarian worlds, prioritizing simple lives.
   * *Aesthetic:* Green and brown coloring.
6. **Luddic Path (`faction "luddic_path"`)**
   * *Lore:* A radical splinter faction of the Luddic Church. They use terrorism and suicide attacks to destroy advanced technology across the sector.
   * *Aesthetic:* Green paint with custom hazard stripes and improvised armor.
7. **Pirates (`faction "pirates"`)**
   * *Lore:* Various criminal groups operating from hidden bases. They raid trade fleets and sell cheap, customized hulls.
   * *Aesthetic:* Rusted steel plates, mismatched modifications, and exposed wiring.
8. **Independent (`faction "independent"`)**
   * *Lore:* Various worlds and mercs operating outside major faction boundaries.
   * *Aesthetic:* Neutral grey hulls.
9. **Scavengers (`faction "scavengers"`)**
   * *Lore:* Semi-legitimate salvagers searching ruined systems for lost technology.
   * *Aesthetic:* Mismatched steel plating, using civilian vessels.
10. **Remnants (`faction "remnant"`)**
    * *Lore:* Automated robotic warships created by Tri-Tachyon during the AI wars. They patrol isolated sectors, attacking all intruders.
    * *Aesthetic:* Dark chrome plating with glowing blue runes.

---

## 3. Comprehensive Ship Directory (35 Hulls)

Ships in Starsector are categorized by their size (Frigate, Destroyer, Cruiser, or Capital Ship).

### 3.1 Frigate Class (Size 1)
1. **Lasher**
   * *Role:* Low-Tech Assault | *Stats:* Armor 500, Hull 2500, Max Speed 110, OP 50.
   * *Visual:* Rusted orange hull with dual gun mounts.
2. **Kite**
   * *Role:* Light Interceptor | *Stats:* Armor 100, Hull 800, Max Speed 140, OP 20.
   * *Visual:* Small box cockpit with rear stabilizers.
3. **Wolf**
   * *Role:* High-Tech Skirmisher | *Stats:* Armor 250, Hull 1500, Max Speed 150, OP 55.
   * *Visual:* Sleek triangular wedge with sweeping wings.
4. **Wayfarer**
   * *Role:* Combat Freighter | *Stats:* Armor 300, Hull 2200, Max Speed 100, OP 45.
   * *Visual:* Bulbous metal body with side cargo pods.
5. **Mudskipper**
   * *Role:* Shuttle | *Stats:* Armor 50, Hull 500, Max Speed 120, OP 15.
   * *Visual:* Compact cockpit.
6. **Centurion**
   * *Role:* Escort Frigate | *Stats:* Armor 450, Hull 2000, Max Speed 100, OP 50.
   * *Visual:* Thick armored plates.
7. **Shepherd**
   * *Role:* Drone Tender | *Stats:* Armor 200, Hull 1500, Max Speed 95, OP 30.
   * *Visual:* Utility antenna array.
8. **Brawler**
   * *Role:* Heavy Gunship | *Stats:* Armor 400, Hull 2400, Max Speed 110, OP 45.
   * *Visual:* Square hull with dual gun barrels.
9. **Hound**
   * *Role:* Fast Cargo Escort | *Stats:* Armor 150, Hull 1200, Max Speed 160, OP 35.
   * *Visual:* Spindle shape.

### 3.2 Destroyer Class (Size 2)
10. **Hammerhead**
    * *Role:* Low-Tech Gunship | *Stats:* Armor 800, Hull 5000, Max Speed 90, OP 95.
    * *Visual:* Rusted orange body with twin engine nozzles.
11. **Enforcer**
    * *Role:* Low-Tech Escort | *Stats:* Armor 1000, Hull 6000, Max Speed 80, OP 90.
    * *Visual:* Blocky cargo container with a forward cockpit bridge.
12. **Shrike**
    * *Role:* High-Tech Destroyer | *Stats:* Armor 350, Hull 3500, Max Speed 120, OP 75.
    * *Visual:* Sleek white-and-black hull.
13. **Sunder**
    * *Role:* Fleet Fire Support | *Stats:* Armor 200, Hull 3000, Max Speed 100, OP 80.
    * *Visual:* Curved delta wing layout.
14. **Mule**
    * *Role:* Armored Freighter | *Stats:* Armor 600, Hull 4500, Max Speed 70, OP 70.
    * *Visual:* Long body with side-mounted window decks.
15. **Gemini**
    * *Role:* Cargo Freighter | *Stats:* Armor 400, Hull 3800, Max Speed 65, OP 65.
    * *Visual:* Flat deck runway ship with side hangars.
16. **Buffalo**
    * *Role:* Standard Freighter | *Stats:* Armor 150, Hull 2500, Max Speed 60, OP 40.
    * *Visual:* Massive grid of cargo pods.

### 3.3 Cruiser Class (Size 3)
17. **Falcon**
    * *Role:* Light Cruiser | *Stats:* Armor 800, Hull 8000, Max Speed 100, OP 130.
    * *Visual:* Forked nose hull.
18. **Eagle**
    * *Role:* Fleet Cruiser | *Stats:* Armor 1000, Hull 10000, Max Speed 80, OP 150.
    * *Visual:* Massive angular disc.
19. **Apogee**
    * *Role:* Exploration Cruiser | *Stats:* Armor 900, Hull 9000, Max Speed 75, OP 140.
    * *Visual:* Sleek white hull.
20. **Dominator**
    * *Role:* Heavy Cruiser | *Stats:* Armor 1500, Hull 12000, Max Speed 60, OP 140.
    * *Visual:* Boxy dreadnought shape.
21. **Mora**
    * *Role:* Fleet Carrier | *Stats:* Armor 1200, Hull 11000, Max Speed 55, OP 130.
    * *Visual:* Blocky cargo container.
22. **Heron**
    * *Role:* Strike Carrier | *Stats:* Armor 500, Hull 6000, Max Speed 90, OP 115.
    * *Visual:* Swept wings.
23. **Colossus**
    * *Role:* Heavy Cargo Freighter | *Stats:* Armor 300, Hull 5000, Max Speed 50, OP 60.
    * *Visual:* Container pods floating.

### 3.4 Capital Ship Class (Size 4)
24. **Onslaught**
    * *Role:* Low-Tech Battleship | *Stats:* Armor 2000, Hull 20000, Max Speed 45, OP 360.
    * *Visual:* Heavy armored plates.
25. **Paragon**
    * *Role:* High-Tech Battleship | *Stats:* Armor 1500, Hull 18000, Max Speed 30, OP 400.
    * *Visual:* Dark chrome hull with blue runes.
26. **Conquest**
    * *Role:* Fast Battlecruiser | *Stats:* Armor 1100, Hull 15000, Max Speed 70, OP 280.
    * *Visual:* Sleek purple hull with golden accents.
27. **Astral**
    * *Role:* Super-Carrier | *Stats:* Hull 14000, Shield 12000, Max Speed 40, OP 290.
    * *Visual:* Flat deck runway ship.
28. **Legion**
    * *Role:* Heavy Battlecarrier | *Stats:* Armor 1500, Hull 16000, Max Speed 50, OP 310.
    * *Visual:* Rusted circular ring.
29. **Atlas**
    * *Role:* Super-Freighter | *Stats:* Armor 200, Hull 4000, Max Speed 35, OP 50.
    * *Visual:* Massive grid of cargo pods.
30. **Prometheus**
    * *Role:* Super-Tanker | *Stats:* Armor 200, Hull 4000, Max Speed 35, OP 50.
    * *Visual:* Large cylindrical body.
31. **Radiant**
    * *Role:* Remnant Battleship | *Stats:* Armor 1500, Hull 17000, Max Speed 50, OP 350.
    * *Visual:* Dark chrome plating.
32. **Nova**
    * *Role:* Remnant Battlecruiser | *Stats:* Armor 1000, Hull 13000, Max Speed 75, OP 270.
    * *Visual:* Spindle shape.
33. **Brilliant**
    * *Role:* Remnant Cruiser | *Stats:* Armor 800, Hull 8000, Max Speed 80, OP 140.
    * *Visual:* Curved delta wing.
34. **Glimmer**
    * *Role:* Remnant Frigate | *Stats:* Armor 250, Hull 1400, Max Speed 140, OP 45.
    * *Visual:* Tiny cockpit.
35. **Apex**
    * *Role:* Remnant Cruiser | *Stats:* Armor 900, Hull 8500, Max Speed 70, OP 135.
    * *Visual:* Square armored plates.

---

## 4. Key Systems & Coordinates

System mappings are defined in Java generation scripts.

*   **Corvus System**
    *   *Jangala:* A jungle planet, serve as Hegemony capital.
*   **Askonia System**
    *   *Sindria:* Capital planet of the Sindrian Diktat.
*   **Maira System**
    *   *Chicomoztoc:* A massive industrial world, Hegemony's population center.
*   **Eos System**
    *   *Eos Prime:* Agricultural world of the Luddic Church.
*   **Galatia System**
    *   *Galatia Academy:* Station serving as the narrative hub.

---

## 5. Space Wonders & Anomalies

1. **The Cryosleeper**
    * *Lore:* A Domain-era colony vessel drifting in deep space, containing millions of colonists in cryosleep.
    * *Visual & Mechanics:* A massive cylinder ship. Can be explored to salvage technology or wake colonists to populate colonies.
2. **Coronal Hypershunt**
    * *Lore:* A massive structure built near a star to harvest solar energy.
    * *Visual & Mechanics:* Swirling energy shields and white glowing structures.
3. **Domain-era Sensor Array**
    * *Lore:* An old sensor array used to monitor hyperspace channels.
    * *Visual & Mechanics:* A network of satellites connected by light arrays.
