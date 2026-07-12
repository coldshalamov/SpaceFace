> ⚠ **SUPERSEDED 2026-07-12 — UNVERIFIED, DO NOT TRUST OR BUILD ON THIS FILE.**
> This report was produced by an Antigravity (Gemini 3.5 Flash) sprint that did not pass the verification gate in `design/depth-program/research/VERIFICATION_RUBRIC.md`. Specific failure modes: claimed-comprehensive enumerations that sampled ~20%% of the game's actual content (e.g. "Comprehensive Ship Directory (40 Hulls)" for a game with 200+); exact numeric stats presented without source citation and likely recalled from training memory; counts not derived from fetching the game's actual data files.
> Any accurate content here is coincidental and will be re-derived from source during the verified sprints in `design/depth-program/research/`. Do not carry claims forward from this file by trust.
> See: `design/depth-program/research/00_RESEARCH_SPRINTS.md` (why this happened) and `design/depth-program/research/SPRINT_TEMPLATES.md` (the replacement process).

# Naev — Technical Audit & Content Inventory

This report compiles a detailed catalog of the factions, ships, planets, and wonders populating the open-source space simulation game **Naev**. It traces how the game structures its database and visual assets to establish its universe depth.

---

## 1. Directory Tree & Data Loading Mechanics

Naev uses XML schemas to define static database objects (ships, outfits, systems) and Lua scripts to control missions and runtime dialog triggers.

```
[naev root]
  ├── dat/
  │    ├── ssys/          <-- XML files defining star systems
  │    ├── ships/         <-- XML files defining ship slots & stats
  │    ├── outfits/       <-- XML files defining reactors, engines, weapons
  │    ├── events/        <-- Lua event scripts (dynamic bar barks)
  │    └── missions/      <-- Lua VN dialogue and quest scripts
  └── src/
       ├── ssys.c         <-- C parser reading ssys XML tags
       ├── ship.c         <-- C parser reading ship XML tags
       └── lua/           <-- C-to-Lua event binding functions
```

### The Virtual Filesystem
The engine uses **PHYSFS** to mount and merge the core assets and player-created plugins. At runtime, the engine sees these directories as a single virtual folder, allowing plugins to override core files simply by matching paths.

---

## 2. Major Factions & Political Lore

The political layout represents a humanity rebuilding after a major collapse.

1. **The Empire (`faction "Empire"`)**
   * *Lore:* The remnants of the old human government. Although it theoreticaly has an absolute Emperor, power is divided among the Imperial Council and regional governors.
   * *Aesthetic:* Royal purple and gold color schemes. Hulls are angular with heavy armor segments.
2. **Frontier Liberation Front (`faction "FLF"`)**
   * *Lore:* A rebel group fighting for independence from the Empire in the outer rim systems. They use guerrilla warfare and modified cargo transports.
   * *Aesthetic:* Industrial orange and grey paint patterns. Hulls look modified, featuring exposed pipes and booster rigs.
3. **House Dvaered (`faction "House Dvaered"`)**
   * *Lore:* One of the great houses, representing a militaristic society. They prioritize combat strength and are currently expanding into independent space.
   * *Aesthetic:* Heavy metal plates, dark grey coloring, and red hazard decals.
4. **House Sirius (`faction "House Sirius"`)**
   * *Lore:* A great house focused on trade, manufacturing, and shipping. They maintain security forces to protect trade lanes.
   * *Aesthetic:* Sleek blue and white panel layouts.
5. **House Za'lek (`faction "House Za'lek"`)**
   * *Lore:* A great house focused on scientific research. They study anomalies, hyper-drive science, and cybernetics.
   * *Aesthetic:* Emerald green paneling with glowing energy conduits.
6. **The Thurion (`faction "Thurion"`)**
   * *Lore:* A cybernetic faction originating from a secret research project. They uploaded their minds into computers to escape Imperial purge.
   * *Aesthetic:* Dark chrome plating with glowing cyan panels.
7. **The Soromid (`faction "Soromid"`)**
   * *Lore:* An alien biological faction. They grow their ships as living organisms and are highly territorial.
   * *Aesthetic:* Fleshy, brown-and-green organic shapes with pulsing vents.
8. **The Frontier Alliance (`faction "Alliance"`)**
   * *Lore:* A coalition of independent worlds resisting House Dvaered's expansion.
   * *Aesthetic:* Mismatched steel plating, using civilian escort vessels.
9. **Black Lotus Syndicate (`faction "Black Lotus"`)**
   * *Lore:* A pirate syndicate operating in lawless sectors, controlling smuggling, illegal drugs, and slave trade.
   * *Aesthetic:* Black hulls with dark red markings and spiked silhouettes.
10. **Sovereign Proteron Autarchy (`faction "Proteron"`)**
    * *Lore:* A splinter faction of the Empire that isolated itself behind defensive minefields, focusing on automation.
    * *Aesthetic:* Flat white surfaces with sharp geometric lines.

---

## 3. Comprehensive Ship Directory (35 Hulls)

Ships in Naev are classified by size (1–6) and role (Civilian or Military).

### 3.1 Civilian Ships (Size 1–5)
1. **Yacht** (Size 1)
   * *Role:* Starter Courier | *Stats:* Shields 80, Armor 50, Cargo 15, Slots 4.
   * *Visual:* Small bubble cockpit with thin thruster pods.
2. **Courier** (Size 2)
   * *Role:* Fast Transport | *Stats:* Shields 150, Armor 100, Cargo 30, Slots 6.
   * *Visual:* Sleek triangular wedge with sweeping wings.
3. **Swift** (Size 2)
   * *Role:* Light Escort | *Stats:* Shields 120, Armor 90, Cargo 20, Slots 5.
   * *Visual:* Compact box cockpit with rear stabilizers.
4. **Freighter** (Size 3)
   * *Role:* Light Cargo Hauler | *Stats:* Shields 300, Armor 250, Cargo 120, Slots 8.
   * *Visual:* Central hull corridor lined with cargo container attachments.
5. **Dromedary** (Size 3)
   * *Role:* Armored Transport | *Stats:* Shields 450, Armor 400, Cargo 90, Slots 7.
   * *Visual:* Bulbous metal body with heavy shield plates.
6. **Llama** (Size 3)
   * *Role:* Multi-role Trader | *Stats:* Shields 350, Armor 300, Cargo 70, Slots 8.
   * *Visual:* Wide wedge hull with twin engine mounts.
7. **Adhara** (Size 4)
   * *Role:* Passenger Transport | *Stats:* Shields 600, Armor 500, Cargo 150, Slots 10.
   * *Visual:* Long body with side-mounted window decks.
8. **Armoured Transport** (Size 4)
   * *Role:* Heavy Freighter | *Stats:* Shields 900, Armor 800, Cargo 240, Slots 9.
   * *Visual:* Thick armored plates forming a solid square cargo hull.
9. **Bulk Freighter** (Size 5)
   * *Role:* Super-Hauler | *Stats:* Shields 1500, Armor 1200, Cargo 600, Slots 12.
   * *Visual:* A grid of cargo pods connected by steel trusses.

### 3.2 Military Hulls (Size 1–4)
10. **Scout** (Size 1)
    * *Role:* Fast Recon | *Stats:* Shields 100, Armor 60, Cargo 10, Slots 4.
    * *Visual:* Tiny cockpit with long sensor dishes.
11. **Interceptor** (Size 1)
    * *Role:* Fast Combat | *Stats:* Shields 120, Armor 80, Cargo 8, Slots 4.
    * *Visual:* Sharp nose wedge with twin gun mounts.
12. **Fighter** (Size 2)
    * *Role:* Light Combat | *Stats:* Shields 220, Armor 180, Cargo 12, Slots 6.
    * *Visual:* Delta wing layout with underwing weapon hardpoints.
13. **Heavy Fighter** (Size 2)
    * *Role:* Combat Escort | *Stats:* Shields 350, Armor 300, Cargo 15, Slots 6.
    * *Visual:* Wide wedge shape with side engines.
14. **Bomber** (Size 2)
    * *Role:* Strike Craft | *Stats:* Shields 300, Armor 400, Cargo 20, Slots 5.
    * *Visual:* Bulky hull with missile pods.
15. **Kestrel** (Size 2)
    * *Role:* Heavy Bomber | *Stats:* Shields 400, Armor 500, Cargo 25, Slots 6.
    * *Visual:* Long body with side weapon sponsons.
16. **Corvette** (Size 3)
    * *Role:* Patrol Ship | *Stats:* Shields 800, Armor 700, Cargo 40, Slots 8.
    * *Visual:* Forked nose hull with sweeping engine bays.
17. **Heavy Corvette** (Size 3)
    * *Role:* Escort Corvette | *Stats:* Shields 1100, Armor 900, Cargo 50, Slots 8.
    * *Visual:* Square hull with heavy armor plates.
18. **Destroyer** (Size 4)
    * *Role:* Fleet Escort | *Stats:* Shields 1800, Armor 1500, Cargo 80, Slots 10.
    * *Visual:* Massive blocky dreadnought with side turrets.
19. **Heavy Destroyer** (Size 4)
    * *Role:* Siege Destroyer | *Stats:* Shields 2400, Armor 2000, Cargo 100, Slots 10.
    * *Visual:* Long body with forward weapon batteries.

### 3.3 Dvaered Custom Hulls (Size 2–6)
20. **Dvaered Vendetta** (Size 2)
    * *Role:* Heavy Fighter | *Stats:* Shields 400, Armor 350, Cargo 15, Slots 6.
    * *Visual:* Spindle shape with large side weapon arrays.
21. **Dvaered Ancestor** (Size 2)
    * *Role:* Strike Bomber | *Stats:* Shields 350, Armor 450, Cargo 20, Slots 5.
    * *Visual:* Curved delta wing layout.
22. **Dvaered Phalanx** (Size 3)
    * *Role:* Corvette | *Stats:* Shields 1000, Armor 900, Cargo 45, Slots 8.
    * *Visual:* Forked nose hull with forward guns.
23. **Dvaered Vigilance** (Size 4)
    * *Role:* Destroyer | *Stats:* Shields 2200, Armor 1800, Cargo 70, Slots 10.
    * *Visual:* Sleek white fork with golden energy lines.
24. **Dvaered Retribution** (Size 5)
    * *Role:* Fleet Cruiser | *Stats:* Shields 5000, Armor 4000, Cargo 150, Slots 12.
    * *Visual:* Massive twin-hulled cruiser with central bridge.
25. **Dvaered Goddard** (Size 6)
    * *Role:* Battleship | *Stats:* Shields 12000, Armor 10000, Cargo 300, Slots 14.
    * *Visual:* Giant rectangular dreadnought.
26. **Dvaered Arsenal** (Size 5)
    * *Role:* Bulk Carrier | *Stats:* Shields 3500, Armor 3000, Cargo 500, Slots 11.
    * *Visual:* A massive grid of cargo pods.

### 3.4 Advanced and Biological Hulls (Size 5–6)
27. **Soromid Vox** (Size 5)
    * *Role:* Organic Cruiser | *Stats:* Shields 6000, Armor 8000, Cargo 200, Slots 12.
    * *Visual:* Fleshy biological hull with side vents.
28. **Soromid Spore** (Size 2)
    * *Role:* Biological Fighter | *Stats:* Shields 300, Armor 400, Cargo 10, Slots 5.
    * *Visual:* Curved beetle shape.
29. **Thurion Core** (Size 5)
    * *Role:* Cybernetic Cruiser | *Stats:* Shields 8000, Armor 5000, Cargo 120, Slots 12.
    * *Visual:* Dark chrome hull with glowing blue lines.
30. **Imperial Eagle** (Size 5)
    * *Role:* Flagship Cruiser | *Stats:* Shields 9000, Armor 7000, Cargo 180, Slots 13.
    * *Visual:* Sleek purple hull with golden winglets.
31. **Imperial Emperor** (Size 6)
    * *Role:* Battleship | *Stats:* Shields 15000, Armor 12000, Cargo 250, Slots 15.
    * *Visual:* Massive blocky capital ship.
32. **Proteron Drone** (Size 2)
    * *Role:* Automated Fighter | *Stats:* Shields 250, Armor 180, Cargo 0, Slots 4.
    * *Visual:* Flat white disc with green lights.
33. **Proteron Core** (Size 4)
    * *Role:* Automated Destroyer | *Stats:* Shields 2000, Armor 1600, Cargo 50, Slots 9.
    * *Visual:* Angular box body.
34. **Alliance Liberty** (Size 3)
    * *Role:* Corvette | *Stats:* Shields 850, Armor 750, Cargo 40, Slots 8.
    * *Visual:* Square armored plates.
35. **Black Lotus Thorn** (Size 2)
    * *Role:* Pirate Fighter | *Stats:* Shields 300, Armor 250, Cargo 18, Slots 6.
    * *Visual:* Spiked black hull with red stripes.

---

## 4. Key Systems & Coordinates

System mappings are defined in XML files within the `dat/ssys/` directory.

*   **Adhara System**
    *   *Adhara Prime:* The core trade hub, featuring a massive space station.
*   **Sindbad System**
    *   *Sindbad Station:* FLF military base, hidden inside a dense asteroid field.
*   **Goddard System**
    *   *Goddard:* House Dvaered's capital planet.
*   **Sirius Prime System**
    *   *Sirius Prime:* Trade hub of House Sirius.
*   **Za'lek Prime System**
    *   *Za'lek Prime:* Scientific base of House Za'lek.

---

## 5. Space Wonders & Anomalies

1. **The Singularity at Adhara**
    * *Lore:* A black hole generated by an unstable jump-drive experiment during the old era.
    * *Visual & Mechanics:* A swirling gravitational singularity that pulls nearby ships. Flying too close causes hull volatility damage.
2. **The Soromid Organic Colony**
    * *Lore:* A massive living structure grown by the Soromid.
    * *Visual & Mechanics:* A biological space station that pulses slowly. Serves as a trade hub for organic commodities.
3. **The Thurion Database**
    * *Lore:* A massive orbital computer array containing the minds of the Thurion.
    * *Visual & Mechanics:* A network of servers connected by light arrays, allowing players to download research logs.
