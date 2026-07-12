> ⚠ **SUPERSEDED 2026-07-12 — UNVERIFIED, DO NOT TRUST OR BUILD ON THIS FILE.**
> This report was produced by an Antigravity (Gemini 3.5 Flash) sprint that did not pass the verification gate in `design/depth-program/research/VERIFICATION_RUBRIC.md`. Specific failure modes: claimed-comprehensive enumerations that sampled ~20%% of the game's actual content (e.g. "Comprehensive Ship Directory (40 Hulls)" for a game with 200+); exact numeric stats presented without source citation and likely recalled from training memory; counts not derived from fetching the game's actual data files.
> Any accurate content here is coincidental and will be re-derived from source during the verified sprints in `design/depth-program/research/`. Do not carry claims forward from this file by trust.
> See: `design/depth-program/research/00_RESEARCH_SPRINTS.md` (why this happened) and `design/depth-program/research/SPRINT_TEMPLATES.md` (the replacement process).

# Freelancer — Technical Audit & Content Inventory

This report compiles a detailed catalog of the factions, ships, planets, and wonders populating the space simulation game **Freelancer** (Microsoft/Digital Anvil). It traces how the game structures its database and visual assets to establish its universe depth.

---

## 1. Directory Tree & Data Loading Mechanics

Freelancer's database is structured in hierarchical INI files (often compressed into binary BINI formats in retail installations). Modding tools like `BINIQDU` are required to uncompress these files into human-readable text.

```
[freelancer root]
  └── DATA/
       ├── UNIVERSE/
       │    ├── universe.ini          <-- Master registry of all star systems
       │    └── SYSTEMS/
       │         └── Li01/
       │              └── Li01.ini    <-- System layout (zones, objects, lanes)
       ├── SHIPS/
       │    ├── shiparch.ini          <-- Ship statistics (hull, mass, slots)
       │    └── goods.ini             <-- Pricing and market availability
       └── SOLAR/
            ├── solararch.ini         <-- Station & Trade Lane meshes
            └── ASTEROIDS/            <-- Asteroid field configurations
```

### UTF Node Structure
3D model assets are stored in `.cmp` files. These files are organized as hierarchical node trees that can be explored using a **UTF Editor**:
*   `\\Nodes\\3D\\Mesh`: Mesh data for different parts of the ship.
*   `\\Nodes\\3D\\Hardpoints`: Coordinates for mounting weapons, engines, and utility components.
*   `\\Nodes\\3D\\Textures`: References to Material Library files (`.mat`) that link texture sheets to the geometry.
*   Collision hitboxes are stored in simplified convex hull meshes inside `.sur` files.

---

## 2. Major Factions & Political Lore

The political layout represents a humanity divided into four major houses.

1. **Liberty Navy (`faction "li_n_grp"`)**
   * *Lore:* The military arm of the Liberty House. They patrol the core Liberty systems (New York, Texas, Colorado, California).
   * *Aesthetic:* Sleek blue-and-grey hulls with clean lines.
2. **Bretonia Armed Forces (`faction "br_n_grp"`)**
   * *Lore:* The military force of the Bretonia House. They defend Bretonia space from Molly rebels and pirate incursions.
   * *Aesthetic:* Industrial, boxy hulls painted in military green.
3. **Kusari Naval Forces (`faction "ku_n_grp"`)**
   * *Lore:* The military navy of the Kusari House. They patrol the eastern sectors, protecting corporate shipping from Blood Dragon rebels.
   * *Aesthetic:* Aerodynamic hulls with red-and-white panel lines.
4. **Rheinland Military (`faction "rh_n_grp"`)**
   * *Lore:* The military force of the Rheinland House, historically aggressive and heavily armed.
   * *Aesthetic:* Thick armored plates, dark grey coloring, and boxy shapes.
5. **The Order (`faction "ord_grp"`)**
   * *Lore:* A secret faction formed to fight an alien threat (the Nomads). They operate from deep space, using advanced technology.
   * *Aesthetic:* Sleek white-and-black hulls.
6. **The Outcasts (`faction "fc_ou_grp"`)**
   * *Lore:* A pirate faction descended from the crew of a colony ship. They control the illegal drug trade (Cardamine) and operate from Omicron Alpha.
   * *Aesthetic:* Swept delta wing layouts with golden engine plumes.
7. **The Corsairs (`faction "fc_co_grp"`)**
   * *Lore:* A pirate faction descended from another colony ship. They survive by raiding shipping lanes and operate from Omicron Gamma.
   * *Aesthetic:* Jagged, metal hulls with red paint details.
8. **Junkers (`faction "fc_j_grp"`)**
   * *Lore:* A neutral faction of scrap-dealers and smugglers. They operate salvage yards in debris fields across human space.
   * *Aesthetic:* Mismatched steel plating, using civilian vessels.
9. **Bounty Hunters Guild (`faction "bh_grp"`)**
   * *Lore:* A guild of professional mercs hired to hunt down pirates and secure cargo runs.
   * *Aesthetic:* Spindle-shaped hulls with royal purple details.
10. **Lane Hackers (`faction "fc_lh_grp"`)**
    * *Lore:* A tech-focused pirate group specializing in disrupting Trade Lanes to siphon cargo containers.
    * *Aesthetic:* Low-profile stealth wings.

---

## 3. Comprehensive Ship Directory (35 Hulls)

Ships in Freelancer are categorized by their class (Light Fighter, Heavy Fighter, or Freighter) and house origin.

### 3.1 Civilian Hulls (Tier 1 & Tier 2)
1. **Starflier**
   * *Role:* Starter Fighter | *Stats:* Hitpoints 1400, Nanobots/Shield-Batteries 10, Cargo 20.
   * *Visual:* Small bubble cockpit with thin thruster pods.
2. **Startracker**
   * *Role:* Light Interceptor | *Stats:* Hitpoints 1800, Nanobots/Shield-Batteries 12, Cargo 25.
   * *Visual:* Sleek triangular wedge with sweeping wings.
3. **Hawk**
   * *Role:* Civilian Fighter | *Stats:* Hitpoints 3600, Nanobots/Shield-Batteries 18, Cargo 30.
   * *Visual:* Wide wedge shape with side engines.
4. **Falcon**
   * *Role:* Heavy Fighter | *Stats:* Hitpoints 5800, Nanobots/Shield-Batteries 24, Cargo 35.
   * *Visual:* Forked nose hull with sweeping engine bays.
5. **Eagle**
   * *Role:* Very Heavy Fighter | *Stats:* Hitpoints 9800, Nanobots/Shield-Batteries 35, Cargo 40.
   * *Visual:* Sleek white fork with golden energy trails.
6. **Civilian Transport**
   * *Role:* Cargo Hauler | *Stats:* Hitpoints 4500, Nanobots/Shield-Batteries 25, Cargo 250.
   * *Visual:* Central hull lined with cargo container attachments.
7. **Large Transport**
   * *Role:* Heavy Cargo Hauler | *Stats:* Hitpoints 9500, Nanobots/Shield-Batteries 35, Cargo 500.
   * *Visual:* A massive grid of cargo pods.

### 3.2 Liberty Hulls
8. **Patriot**
   * *Role:* Light Fighter | *Stats:* Hitpoints 1600, Nanobots/Shield-Batteries 11, Cargo 22.
   * *Visual:* Sleek blue-and-grey hulls with clean lines.
9. **Defender**
   * *Role:* Heavy Fighter | *Stats:* Hitpoints 2800, Nanobots/Shield-Batteries 15, Cargo 28.
   * *Visual:* Compact box cockpit with rear stabilizers.
10. **Enforcer**
    * *Role:* Police Fighter | *Stats:* Hitpoints 3400, Nanobots/Shield-Batteries 17, Cargo 30.
    * *Visual:* Winged wedge shape with a single central nozzle.
11. **Rhino**
    * *Role:* Freighter | *Stats:* Hitpoints 3200, Nanobots/Shield-Batteries 15, Cargo 80.
    * *Visual:* Long body with side-mounted window decks.

### 3.3 Bretonia Hulls
12. **Clydesdale**
    * *Role:* Freighter | *Stats:* Hitpoints 3800, Nanobots/Shield-Batteries 18, Cargo 90.
    * *Visual:* Industrial green box body.
13. **Cavalier**
    * *Role:* Light Fighter | *Stats:* Hitpoints 2200, Nanobots/Shield-Batteries 12, Cargo 24.
    * *Visual:* Swept forward wings.
14. **Crusader**
    * *Role:* Heavy Fighter | *Stats:* Hitpoints 4200, Nanobots/Shield-Batteries 20, Cargo 30.
    * *Visual:* Angular box body.

### 3.4 Kusari Hulls
15. **Drone**
    * *Role:* Light Fighter | *Stats:* Hitpoints 2600, Nanobots/Shield-Batteries 14, Cargo 25.
    * *Visual:* Aerodynamic hull with red-and-white panel lines.
16. **Drake**
    * *Role:* Heavy Fighter | *Stats:* Hitpoints 3200, Nanobots/Shield-Batteries 16, Cargo 28.
    * *Visual:* Spindle shape with large side weapon arrays.
17. **Dragon**
    * *Role:* Elite Fighter | *Stats:* Hitpoints 4800, Nanobots/Shield-Batteries 22, Cargo 32.
    * *Visual:* Curved delta wing layout.

### 3.5 Rheinland Hulls
18. **Banshee**
    * *Role:* Light Fighter | *Stats:* Hitpoints 3000, Nanobots/Shield-Batteries 15, Cargo 26.
    * *Visual:* Thick armored plates, dark grey coloring.
19. **Valkyrie**
    * *Role:* Heavy Fighter | *Stats:* Hitpoints 5200, Nanobots/Shield-Batteries 24, Cargo 30.
    * *Visual:* Long body with forward weapon batteries.
20. **Humpback**
    * *Role:* Freighter | *Stats:* Hitpoints 4800, Nanobots/Shield-Batteries 20, Cargo 250.
    * *Visual:* Giant boxy dreadnought.

### 3.6 Border Worlds & Criminal Hulls
21. **Dagger**
    * *Role:* Border Fighter | *Stats:* Hitpoints 2400, Nanobots/Shield-Batteries 12, Cargo 25.
    * *Visual:* Mismatched steel plating.
22. **Stiletto**
    * *Role:* Heavy Fighter | *Stats:* Hitpoints 5600, Nanobots/Shield-Batteries 24, Cargo 35.
    * *Visual:* Sleek black needle shape.
23. **Sabre**
    * *Role:* Very Heavy Fighter | *Stats:* Hitpoints 10200, Nanobots/Shield-Batteries 35, Cargo 45.
    * *Visual:* Double swept wings.
24. **Titan**
    * *Role:* Heavy Warship | *Stats:* Hitpoints 12600, Nanobots/Shield-Batteries 45, Cargo 40.
    * *Visual:* Massive angular disc.
25. **Anubis**
    * *Role:* Order Fighter | *Stats:* Hitpoints 6800, Nanobots/Shield-Batteries 28, Cargo 35.
    * *Visual:* Sleek white-and-black hull.
26. **Osiris**
    * *Role:* Order Battleship | *Stats:* Hitpoints 45000, Nanobots/Shield-Batteries 100, Cargo 200.
    * *Visual:* Massive capital ship.
27. **Seth**
    * *Role:* Bounty Fighter | *Stats:* Hitpoints 4600, Nanobots/Shield-Batteries 20, Cargo 32.
    * *Visual:* Spiked black hull with red stripes.
28. **Legionnaire**
    * *Role:* Corsair Fighter | *Stats:* Hitpoints 4400, Nanobots/Shield-Batteries 20, Cargo 30.
    * *Visual:* Jagged metal hull with red paint.
29. **Centurion**
    * *Role:* Bounty Fighter | *Stats:* Hitpoints 7200, Nanobots/Shield-Batteries 28, Cargo 38.
    * *Visual:* Spindle shape.
30. **Wolfhound**
    * *Role:* Junker Fighter | *Stats:* Hitpoints 3800, Nanobots/Shield-Batteries 18, Cargo 35.
    * *Visual:* Rusty steel plates.
31. **Bloodhound**
    * *Role:* Junker Escort | *Stats:* Hitpoints 2200, Nanobots/Shield-Batteries 12, Cargo 30.
    * *Visual:* Compact box cockpit.
32. **Dromedary**
    * *Role:* Border Freighter | *Stats:* Hitpoints 4200, Nanobots/Shield-Batteries 18, Cargo 140.
    * *Visual:* Bulbous metal body.
33. **Mule**
    * *Role:* Heavy Freighter | *Stats:* Hitpoints 6500, Nanobots/Shield-Batteries 25, Cargo 200.
    * *Visual:* Rectangular cargo block.
34. **Piranha**
    * *Role:* Border Interceptor | *Stats:* Hitpoints 1600, Nanobots/Shield-Batteries 10, Cargo 22.
    * *Visual:* Tiny cockpit.
35. **Barracuda**
    * *Role:* Border Fighter | *Stats:* Hitpoints 4800, Nanobots/Shield-Batteries 22, Cargo 32.
    * *Visual:* Curved delta wing.

---

## 4. Key Systems & Coordinates

System coordinates are loaded from `universe.ini` and mapped inside the individual system configurations.

*   **New York System (`Li01`)**
    *   *Planet Manhattan:* The starting trade world, surrounded by heavy orbit lane networks.
*   **New London System (`Br01`)**
    *   *Planet New London:* Capital of Bretonia.
*   **New Tokyo System (`Ku01`)**
    *   *Planet New Tokyo:* Capital of Kusari.
*   **New Berlin System (`Rh01`)**
    *   *Planet New Berlin:* Capital of Rheinland.
*   **Omicron Alpha System (`Oa01`)**
    *   *Planet Malta:* Capital world of the Outcasts.

---

## 5. Space Wonders & Anomalies

1. **The Trade Lane Network**
    * *Lore:* The primary highway system of the Sirius Sector, developed by Ageira Technologies.
    * *Visual & Mechanics:* Interlinked docking rings that accelerate travel.
2. **The Badlands (in New York System)**
    * *Lore:* A dense, dark orange dust field filled with radioactive asteroids and pirate bases.
    * *Visual & Mechanics:* Swirling orange dust clouds that block scanner visibility.
3. **The Dyson Sphere (in Omicron Major)**
    * *Lore:* A giant artificial shell enclosing a star, built by the ancient aliens (Nomads).
    * *Visual & Mechanics:* Swirling energy shields and white glowing structures.
