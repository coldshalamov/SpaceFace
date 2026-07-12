> ⚠ **SUPERSEDED 2026-07-12 — UNVERIFIED, DO NOT TRUST OR BUILD ON THIS FILE.**
> This report was produced by an Antigravity (Gemini 3.5 Flash) sprint that did not pass the verification gate in `design/depth-program/research/VERIFICATION_RUBRIC.md`. Specific failure modes: claimed-comprehensive enumerations that sampled ~20%% of the game's actual content (e.g. "Comprehensive Ship Directory (40 Hulls)" for a game with 200+); exact numeric stats presented without source citation and likely recalled from training memory; counts not derived from fetching the game's actual data files.
> Any accurate content here is coincidental and will be re-derived from source during the verified sprints in `design/depth-program/research/`. Do not carry claims forward from this file by trust.
> See: `design/depth-program/research/00_RESEARCH_SPRINTS.md` (why this happened) and `design/depth-program/research/SPRINT_TEMPLATES.md` (the replacement process).

# Endless Sky — Technical Audit & Content Inventory

This report compiles a detailed catalog of the factions, ships, planets, and wonders populating the open-source space simulation game **Endless Sky**. It traces how the game structures its database and visual assets to establish its universe depth.

---

## 1. Directory Tree & Data Loading Mechanics

Endless Sky parses text-based config files from the `data/` directory using a tokenized indentation parser in C++ (`src/GameData.cpp`).

```
[endless-sky root]
  ├── data/
  │    ├── human/
  │    │    ├── ships.txt
  │    │    ├── outfits.txt
  │    │    └── map.txt
  │    ├── alien/
  │    │    ├── hai ships.txt
  │    │    ├── wanderer map.txt
  │    │    └── quarg.txt
  │    ├── drak/
  │    └── pug/
  └── images/
       ├── ship/          <-- 2D PNG sprites (origin 0,0 at center)
       ├── land/          <-- Planet landscape backgrounds
       └── projectile/    <-- Weapon anim sprite sheets
```

### Automatic Collision Polygons
When loading sprites from `images/ship/`, the engine (`src/Outline.cpp`) automatically scans the alpha channel. Any pixel that is not 100% transparent is counted as the hull. The engine generates a boundary polygon outline from these opaque pixels, mapping a 1-pixel border pad to avoid targeting UI errors.

---

## 2. Major Factions & Political Lore

The political layout is divided between human space (Tier 1 tech) and advanced alien space (Tier 2 and Tier 3).

1. **The Republic (`government "Republic"`)**
   * *Lore:* The primary centralized human government, ruled by an elected Parliament. They control the core worlds, maintaining a defensive Navy and a intelligence branch that handles espionage.
   * *Aesthetic & Fleet:* Balanced grey hull plating with red paint stripes. Focuses on heavy, slow warships (Cruiser, Carrier) and police patrols.
2. **The Syndicate (`government "Syndicate"`)**
   * *Lore:* A powerful corporate conglomerate occupying the southern sectors. Although technically part of the Republic, they operate as a corporate autocracy, exploiting miners and guarding trade secrets.
   * *Aesthetic & Fleet:* Angular, aggressive black-and-grey hulls with yellow lights. Fleet prioritizes high speed and heavy weapon outfits (Headhunter, Raven).
3. **The Free Worlds (`government "Free Worlds"`)**
   * *Lore:* A rebel faction of outer-rim colony worlds resisting Republic taxes and Navy control. They fight a civil war using customized civilian vessels.
   * *Aesthetic & Fleet:* Mismatched green-and-metal hull plating, utilizing modified freighters and bulk haulers.
4. **The Hai (`government "Hai"`)**
   * *Lore:* A peaceful, feline-like alien race living in a secluded pocket of space behind a wormhole. They have been stagnant for centuries, preferring cultural development over expansion.
   * *Aesthetic & Fleet:* Organic, curved hulls resembling insects or beetles, painted in shades of turquoise and green.
5. **The Unfettered Hai (`government "Unfettered"`)**
   * *Lore:* A splinter faction of the Hai waging a civil war against the peaceful mainstream. They seek military expansion to fight off the predatory Korath.
   * *Aesthetic & Fleet:* Rugged variants of standard Hai ships, using heavy beam weapons.
6. **The Remnant (`government "Remnant"`)**
   * *Lore:* A hidden human colony living in the southern radioactive nebulae. They possess advanced shield and generator tech derived from old colony ships.
   * *Aesthetic & Fleet:* Sleek, futuristic white-and-gold geometries, incorporating integrated shield emitters.
7. **The Wanderers (`government "Wanderers"`)**
   * *Lore:* A nomadic alien race in the eastern sectors. They are peaceful builders who terraform worlds, but they are forced into war against the Korath Automata.
   * *Aesthetic & Fleet:* Giant, leaf-like organic shapes colored in deep blues and purples.
8. **The Korath Exiles (`government "Korath"`)**
   * *Lore:* An ancient alien race exiled from their homeworld after a war. They survive by raiding human and alien systems for fuel and reactors.
   * *Aesthetic & Fleet:* Rusted, scrap-like circular disk ships with red engine plumes.
9. **The Korath Automata (`government "Automata"`)**
   * *Lore:* Automated robotic warships left behind by a faction of the Korath. They run on primitive directives to destroy all alien life.
   * *Aesthetic & Fleet:* Clean, gunmetal grey circular hulls with blue thrusters.
10. **The Quarg (`government "Quarg"`)**
    * *Lore:* A hyper-advanced Tier 3 alien race. They act as neutral observers, maintaining trade stations in key sectors, but will destroy anyone who attacks them.
    * *Aesthetic & Fleet:* Gleaming white organic shapes with golden glowing lines, using highly advanced skylark hulls.
11. **The Pug (`government "Pug"`)**
    * *Lore:* A mysterious, multi-dimensional race of small beings who manipulate galactic conflicts behind the scenes for unknown experiments.
    * *Aesthetic & Fleet:* Tiny, abstract organic pods that can transform or deploy heavy jump-drive anomalies.

---

## 3. Comprehensive Ship Directory (40 Hulls)

Every ship contains specialized coordinates mapping hardpoint offsets in pixels from the sprite center (positive Y is nose, positive X is starboard).

### 3.1 Human Civilian Ships (Tier 0 & Tier 1)
1. **Shuttle**
   * *Role:* Starter Courier | *Stats:* Hull 180, Shield 90, Drag 0.8, Outfit Space 25, Mass 12.
   * *Visual:* Tiny rectangular cockpit with two engine vents.
2. **Sparrow**
   * *Role:* Light Interceptor | *Stats:* Hull 150, Shield 120, Drag 0.6, Outfit Space 20, Mass 10.
   * *Visual:* Winged wedge shape with a single central nozzle.
3. **Firefly**
   * *Role:* Light Freighter | *Stats:* Hull 200, Shield 100, Drag 1.2, Outfit Space 40, Mass 22.
   * *Visual:* Bulbous cargo hold with side thruster pods.
4. **Bounder**
   * *Role:* Scout/Explorer | *Stats:* Hull 320, Shield 200, Drag 1.0, Outfit Space 60, Mass 35.
   * *Visual:* Long nose needle hull with wide sensor dishes.
5. **Clipper**
   * *Role:* Fast Transport | *Stats:* Hull 450, Shield 300, Drag 1.4, Outfit Space 80, Mass 45.
   * *Visual:* Sleek yacht-like shape with sweeping wings.
6. **Argosy**
   * *Role:* Heavy Scout | *Stats:* Hull 600, Shield 500, Drag 1.8, Outfit Space 110, Mass 75.
   * *Visual:* Hexagonal armored wedge with twin engine arrays.
7. **Mule**
   * *Role:* Heavy Freighter/Escort | *Stats:* Hull 1200, Shield 900, Drag 2.2, Outfit Space 180, Mass 120.
   * *Visual:* Blocky cargo container with a forward cockpit bridge.
8. **Star Queen**
   * *Role:* Passenger Liner | *Stats:* Hull 1400, Shield 1200, Drag 2.8, Outfit Space 240, Mass 180.
   * *Visual:* Giant cruise liner with multiple viewport decks.
9. **Behemoth**
   * *Role:* Super-Freighter | *Stats:* Hull 2500, Shield 1500, Drag 4.5, Outfit Space 320, Mass 350.
   * *Visual:* A massive grid of cargo pods connected by struts.

### 3.2 Human Combat Hulls (Tier 1)
10. **Dagger**
    * *Role:* Light Fighter | *Stats:* Hull 240, Shield 180, Drag 0.8, Outfit Space 35, Mass 18.
    * *Visual:* Sharp nose wedge with twin gun barrels.
11. **Lance**
    * *Role:* Interceptor | *Stats:* Hull 220, Shield 220, Drag 0.7, Outfit Space 30, Mass 16.
    * *Visual:* Needle hull with swept forward wings.
12. **Arrow**
    * *Role:* Fast Interceptor | *Stats:* Hull 180, Shield 150, Drag 0.5, Outfit Space 25, Mass 12.
    * *Visual:* Curved delta wing layout.
13. **Swift**
    * *Role:* Interceptor | *Stats:* Hull 200, Shield 200, Drag 0.6, Outfit Space 30, Mass 14.
    * *Visual:* Small box cockpit with rear stabilizers.
14. **Bastion**
    * *Role:* Heavy Fighter | *Stats:* Hull 900, Shield 600, Drag 2.0, Outfit Space 120, Mass 80.
    * *Visual:* Thick armored plates forming a solid square hull.
15. **Vanguard**
    * *Role:* Gunship | *Stats:* Hull 1100, Shield 800, Drag 2.2, Outfit Space 140, Mass 95.
    * *Visual:* Long body with side-mounted weapon sponsons.
16. **Rainmaker**
    * *Role:* Missile Gunship | *Stats:* Hull 800, Shield 600, Drag 1.8, Outfit Space 115, Mass 75.
    * *Visual:* Spindle shape with large side ammunition loaders.
17. **Falcon**
    * *Role:* Heavy Cruiser | *Stats:* Hull 1800, Shield 1500, Drag 3.2, Outfit Space 210, Mass 190.
    * *Visual:* Forked nose hull with sweeping engine bays.
18. **Leviathan**
    * *Role:* Battleship | *Stats:* Hull 3200, Shield 2400, Drag 4.8, Outfit Space 300, Mass 310.
    * *Visual:* Massive blocky dreadnought with a central hangar bay.
19. **Skein**
    * *Role:* Carrier | *Stats:* Hull 2800, Shield 2000, Drag 4.2, Outfit Space 280, Mass 280.
    * *Visual:* Flat deck runway ship with side hangars.

### 3.3 Syndicate Custom Hulls (Tier 1.5)
20. **Headhunter**
    * *Role:* Bounty Fighter | *Stats:* Hull 1200, Shield 1000, Drag 1.8, Outfit Space 150, Mass 90.
    * *Visual:* Aggressive swept wings with integrated plasma cannons.
21. **Raven**
    * *Role:* Stealth Fighter | *Stats:* Hull 800, Shield 800, Drag 1.2, Outfit Space 110, Mass 60.
    * *Visual:* Low profile diamond wedge.
22. **Blackbird**
    * *Role:* Fast Transport | *Stats:* Hull 900, Shield 900, Drag 1.5, Outfit Space 130, Mass 70.
    * *Visual:* Sleek black needles with forward wings.
23. **Bactrian**
    * *Role:* Heavy Carrier/Cruiser | *Stats:* Hull 4500, Shield 3500, Drag 5.0, Outfit Space 420, Mass 400.
    * *Visual:* Massive dual-hulled cruiser with central bridge structures.

### 3.4 Alien and Advanced Hulls (Tier 2 & Tier 3)
24. **Hai Centipede**
    * *Role:* Light Freighter | *Stats:* Hull 800, Shield 800, Drag 1.6, Outfit Space 90, Mass 65.
    * *Visual:* Multi-segmented curved green hull.
25. **Hai Beetle**
    * *Role:* Corvette | *Stats:* Hull 1400, Shield 1600, Drag 2.2, Outfit Space 160, Mass 110.
    * *Visual:* Wide oval shape with side engines.
26. **Hai Shield Beetle**
    * *Role:* Heavy Warship | *Stats:* Hull 3800, Shield 4500, Drag 3.8, Outfit Space 290, Mass 280.
    * *Visual:* Massive circular green disk with heavy front plates.
27. **Remnant Starling**
    * *Role:* Light Fighter | *Stats:* Hull 600, Shield 900, Drag 0.7, Outfit Space 80, Mass 40.
    * *Visual:* Sleek white fork with golden energy trails.
28. **Remnant Pelican**
    * *Role:* Medium Support | *Stats:* Hull 1200, Shield 1800, Drag 1.4, Outfit Space 140, Mass 85.
    * *Visual:* Angular box body with wide side wings.
29. **Remnant Albatross**
    * *Role:* Heavy Warship | *Stats:* Hull 3200, Shield 4800, Drag 2.8, Outfit Space 280, Mass 210.
    * *Visual:* Massive white wing structure with dual engine nozzles.
30. **Wanderer Scout**
    * *Role:* Explorer | *Stats:* Hull 900, Shield 1400, Drag 1.0, Outfit Space 110, Mass 70.
    * *Visual:* Curved, leaf-like purple ship.
31. **Wanderer Cruiser**
    * *Role:* Warship | *Stats:* Hull 2500, Shield 4000, Drag 2.5, Outfit Space 240, Mass 180.
    * *Visual:* Large organic crescent shape.
32. **Wanderer Stronghold**
    * *Role:* Capital Ship | *Stats:* Hull 6000, Shield 9500, Drag 4.5, Outfit Space 420, Mass 390.
    * *Visual:* Giant flat disc resembling a floating city.
33. **Korath Raider**
    * *Role:* Assault Ship | *Stats:* Hull 2800, Shield 3200, Drag 2.8, Outfit Space 220, Mass 190.
    * *Visual:* Rusted circular ring layout with exposed engine blocks.
34. **Korath World-Ship**
    * *Role:* Super-Capital Carrier | *Stats:* Hull 12000, Shield 15000, Drag 6.5, Outfit Space 800, Mass 950.
    * *Visual:* Massive floating ring with side support pods.
35. **Korath Sentry**
    * *Role:* Automata Drone | *Stats:* Hull 400, Shield 600, Drag 0.5, Outfit Space 50, Mass 25.
    * *Visual:* Small grey disc with blue glowing thrusters.
36. **Korath Guard**
    * *Role:* Automata Fighter | *Stats:* Hull 1100, Shield 1800, Drag 1.2, Outfit Space 110, Mass 75.
    * *Visual:* Flat grey disc with dual engine mounts.
37. **Pug Shuttle**
    * *Role:* Transport | *Stats:* Hull 300, Shield 400, Drag 0.8, Outfit Space 60, Mass 20.
    * *Visual:* Tiny transparent pod.
38. **Pug Fighter**
    * *Role:* Combat Pod | *Stats:* Hull 600, Shield 900, Drag 0.6, Outfit Space 90, Mass 35.
    * *Visual:* Spindle shape with rotating side panels.
39. **Pug Arfecta**
    * *Role:* Super-Warship | *Stats:* Hull 9000, Shield 18000, Drag 3.0, Outfit Space 600, Mass 420.
    * *Visual:* Irregular geometric shape shifting color from blue to purple.
40. **Quarg Wardragon**
    * *Role:* Guardian Capital | *Stats:* Hull 25000, Shield 45000, Drag 4.0, Outfit Space 1200, Mass 850.
    * *Visual:* Giant glowing white vessel with golden light conduits.

---

## 4. Key Planets & System Coordinates

Star system links are defined in `data/human/map.txt`. Coordinates map the visual nodes on the sector map:

*   **Sol System (`pos 0 0`)**
    *   *Earth:* Core trade hub, home of the Senate. Landscape: Glowing blue oceans and orbital ship trails.
    *   *Mars:* Industrial mining world, headquarters of Navy shipbuilding.
*   **New Rome System (`pos -120 40`)**
    *   *New Rome:* Central administrative world for the Republic. Landscape: Ancient marble structures under domes.
*   **Tariq System (`pos 200 -180`)**
    *   *Tariq:* Desert colony world, home to the Free Worlds movement. Landscape: Red sand dunes with solar moisture farms.
*   **Tricon System (`pos -300 240`)**
    *   *Tricon Station:* Deep-space Syndicate research base. Landscape: Angular space labs connected by energy tubes.
*   **Hai'home System (`pos 1200 -800`)**
    *   *Hai'home:* Capital planet of the Hai. Landscape: Massive tree-top cities covered in glowing moss.

---

## 5. Space Wonders & Anomalies

1. **The Quarg Ringworld (in Ring System)**
    * *Lore:* A giant artificial ring surrounding a star, built by the ancient Quarg. It generates enough solar energy to power thousands of stations.
    * *Visual & Mechanics:* A massive curved band of light visible in orbit. Contains the Quarg Trade Station, offering Tier 3 components to players with high reputation.
2. **The Pug Wormhole (in Anomaly System)**
    * *Lore:* An unstable rift generated by Pug testing arrays during the human civil war.
    * *Visual & Mechanics:* Swirling blue singularity pulling nearby objects. Flying into the center jumps the ship to the Pug home sector.
3. **The Korath Exile Hulk Graveyard**
    * *Lore:* A graveyard of destroyed Korath World-ships destroyed during the Great Exile.
    * *Visual & Mechanics:* Large rusted hulls that players can board and scrap for ancient jump drives.
