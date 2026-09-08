# SpaceFace Frontend Master Architecture & Overhaul Directive

**The Definitive Context, Design Research, and Gameplay Systems Dossier for Incoming Frontend Agents**  
*Document Authority: Explicitly overrides and supersedes `design/frontend/direction/DIRECTION_SHEET.md` ("Cinematic Minimal") and all legacy "0% scrim / borderless / unboxed" instructions.*

---

## 1. Executive Charter: Mandate to Burn Down & Rebuild

If you are an incoming high-capability frontend agent, you have **full authority and license to burn down, replace, or heavily refactor the existing frontend**. 

You do **not** need to preserve the broken DOM structures, CSS hackery, or flawed layout coordinates left behind by previous low-tier agents. An earlier agent created an ideological manifesto (`DIRECTION_SHEET.md`) that banned standard game UI patterns ("no cards, no plates, no borders, no buttons, 0% scrim"), and subsequent agents mechanically stripped all buttons, cards, and containers from the game—turning menus and station facilities into naked white text floating illegibly over a 38% transparent flight HUD and the 3D space scene.

**We do not prescribe rigid layout coordinates, fixed widths, or exact button positions.** We trust your superior reasoning, architectural judgment, and visual taste to synthesize the optimal frontend. This dossier gives you everything you need:
- The complete breakdown of what the game is and how all gameplay systems work.
- Everything the player can control or would want to control.
- Everything the player needs to see, monitor, and feel across flight, combat, docking, and trading.
- The autopsy of past failures so you don't repeat them.
- Deep case studies of premier 2026 space games (*Everspace 2*, *Starsector*, *Homeworld 3*, *Helldivers 2*, *Chorus*).
- Ambitious architectural options you may choose to implement.
- A zero-grep code map of every relevant file, line range, and data contract in the codebase.

---

## 2. Gameplay Systems Matrix: What SpaceFace Actually Is

SpaceFace is a Three.js browser/Electron space combat, mining, trading, and RPG sim built on a flat `GameState`, an event bus, and a fixed 60 Hz simulation loop running on the XZ plane decoupled from rendering.

Here is the complete inventory of what the game does and how its systems behave:

### A. Flight & Piloting Mechanics
- **Physics Engine:** Runs fixed-step simulation in `src/systems/flightV3.js` and `src/core/flight/` via Rapier dynamic physics on the XZ plane.
- **Flight Modes:**
  - *Assisted Mode:* Thrusters automatically damp lateral drift and angular velocity, behaving like an atmospheric aerospace craft.
  - *Newtonian / Drift Mode:* Disables inertial damping; forward thrust creates continuous momentum while the ship can decouple its heading and spin freely.
- **Ship Dynamics:** Handled via ship hulls (`src/data/ships.js`) with stats for `maxSpeed`, `accel`, `reverseAccel`, `angularSpeed`, `boostMultiplier`, and `mass`.
- **Autopilot & Navigation:** Players can engage autopilot to travel toward nav waypoints, stations, or jump gates (`state.nav.autopilot`).
- **Jump Gates:** Travel between sectors involves approaching jump gates, initiating a charge cycle (`state.jump`), and jumping to target sectors.

### B. Combat & Weapons Systems
- **Weapons:** Managed in `src/data/weapons.js` and `src/systems/combat/`. Includes:
  - Kinetic Cannons / Autocannons (projectile speed, spread, physical impulse).
  - Mining & Combat Pulse/Beam Lasers (continuous raycast damage, armor burn).
  - Seeking Missiles & Torpedoes (lock-on acquisition, homing physics).
- **Fire Groups:** Players configure weapons into Primary (Group 1) and Secondary (Group 2) firing groups (`state.player.fireGroups`).
- **Targeting & Aim Assist:**
  - Lead-Aim Reticle: Calculates target lead based on target velocity, player velocity, and projectile speed.
  - Target Lock Diamond: Centers on selected enemy or poi (`state.player.targetId`).
  - Target Cycling: Keys to cycle nearest hostile, next target, or objective.
- **Combat Feedback:** Responsive crosshair ticks for shield hits (cyan), armor hits (amber), and kill flashes (white/gold), backed by pure synth audio cues.
- **Kinetic Collisions:** Devastating lethality when ramming or flinging enemies into asteroids or other hulls, while the player hull has collision shielding.

### C. Defense & Survival
- **Shields:** Dynamic shield capacity (`state.player.efficiencyMods.shieldRegenMult`). Shields absorb incoming energy/kinetic damage before collapsing.
- **Armor & Hull Integrity:** Once shields drop, damage directly degrades ship hull HP.
- **Emergency Boost & Countermeasures:** Rapid burst boost to escape missile locks or disengage.

### D. Mining, Salvage & Cargo Attractor
- **Asteroid Mining:** Mining lasers fracture asteroids into valuable ore chunks (`src/systems/mining.js`).
- **Magnetic Vacuum Scoop:** Ships possess a wide magnetic attractor (`state.player.magnetRange`, 800+ WU) that vacuums floating ore chunks, salvage crates, and debris directly into the cargo hold.
- **Cargo Management:** `state.player.cargo` tracks `usedVolume`, `capVolume`, `usedMass`, and `capMass`. Different commodities have varied density and volume.

### E. Law, Heat & WANTED System
- **WANTED Heat:** `state.player.heat` is a 0..1 scalar driven by piracy, contraband smuggling, and attacking lawful ships (`src/systems/heat.js`).
- **Police & Bounty Hunters:** As heat crosses thresholds, lawful patrols perform cargo scans, and persistent bounty hunter aces are dispatched to hunt the player.
- **Heat Zones:** Evading patrols in high-security space requires breaking contact and jumping to unregulated or frontier sectors.

### F. Dynamic Economy & Station Facilities
- **Trading & Markets:** Each station features dynamic supply and demand for commodities (`state.economy.markets`). Prices fluctuate based on economic events, piracy, and player trade runs.
- **Docking Procedure:** Flying within docking radius of a station transitions the game into the docked state (`state.ui.docked = true`), opening the Station Terminal Hub.
- **Station Facilities (`src/ui/station/`):**
  - *Commodity Market:* Register table for buying/selling goods, cargo hold visualization, profit margins.
  - *Shipworks / Outfitting:* Buying new ship hulls, swapping weapons, fitting shield generators, upgraded cargo bays, thrusters, and scanners.
  - *The Bar / Lounge:* NPC dialogue, gossip, local sector rumors, hiring wingmen/mercenaries, bribing corrupt officials.
  - *Contracts / Mission Board:* Bounty hunting contracts, cargo delivery runs, patrol jobs, and story missions.
  - *Industry / Fabrication:* Refining raw minerals into manufactured alloys and advanced tech.
  - *Factions:* Tracking standing, faction wars, reputation rewards, and territorial ownership.

### G. Meta Progression & Secondary Systems
- **Tech Tree / Research:** Unlocking passive and active ship modifications (`state.player.researchedNodes`).
- **Codex & Sector Atlas:** Lore records, enemy ship blueprints, commodity histories, and galactic history.
- **Save / Load System:** Persistent game state slots with playtime, sector stamp, and auto-save intervals.

---

## 3. The Player Control Envelope & Information Hierarchy

To design a brilliant UI, you must understand what the player wants to do and what they need to see at every moment.

### A. What the Player Controls (Actions & Inputs)
| Context | Actions Controlled by Player |
|---|---|
| **Flight & Piloting** | Pitch, yaw, steering, forward throttle, reverse brake, lateral strafing, boost sprint, toggle flight-assist (drift mode), engage autopilot. |
| **Combat** | Fire primary weapon, fire secondary weapon, toggle auto-fire, cycle target locks, deploy countermeasures, trigger active field abilities. |
| **Mining & Utility** | Fire mining beam, deploy tractor vacuum, cycle cargo manifest, jettison unwanted mass. |
| **Navigation & Traversal** | Open/zoom galaxy starmap, select jump gate, engage hyperjump drive, lock nav waypoints. |
| **Station Terminal** | Switch facility tabs, select commodities, set transaction volume (`-`, `+`, `Max`), execute Buy/Sell, inspect modules, fit/strip hardpoints, accept contracts, choose dialogue lines. |
| **System & Menus** | Pause/resume simulation, quicksave, quickload, adjust audio/video/controls in settings, browse codex, inspect tech tree. |

### B. What the Player Needs to See & Feel (The 5-Tier Sensory Hierarchy)

When flying at 1000 m/s in combat, screen real estate is life or death. Information must be organized into strict priority tiers:

```
+-----------------------------------------------------------------------+
| TOP BAR: Navigation Breadcrumb, Credits, WANTED Heat, Active Quest     |
+-----------------------------------------------------------------------+
|                                                                       |
|                          [TARGET LEAD PIP]                            |
|                                                                       |
|                                  + (Aim Reticle)                      |
|                      [SHIELD]  /   \  [HULL]                          |
|                                                                       |
|                                                                       |
| LEFT: Warnings, Comms,       BOTTOM CENTER:             RIGHT: Radar, |
| Target Info Inspector         [SPEED / THROTTLE]        Hostile Wedge |
|                              [WEAPON HEAT / COOL]       Blips, Docking|
|                              [DEPLOYABLE TOOL BADGE]                  |
+-----------------------------------------------------------------------+
```

1. **Tier 1: Immediate Survival (Center Reticle Zone - Zero Eye Travel)**
   - Aim reticle, target lead pip, target lock diamond.
   - Shield integrity and hull health (ideally curved vector arcs or compact bars hugging the reticle periphery).
   - Incoming missile lock warning, collision alert.
2. **Tier 2: Tactical Awareness (Peripheral Cockpit Zone)**
   - Radar/Minimap: Directional bearing of hostiles (red chevrons/wedges), stations, gates. Asteroid noise is suppressed.
   - Selected target status card (target ship name, shield/hull %, distance).
   - Weapon group status, capacitor heat/energy, reload progress.
3. **Tier 3: Flight Telemetry (Bottom Center)**
   - Current velocity, throttle %, boost capacitor.
   - Active field deployable / tool badge (`CONE — CLEARING`), placed with distinct vertical clearance above the speedometer.
4. **Tier 4: Navigation & Logistics (Top & Edges)**
   - Sector zone name, jump gate alignment indicator.
   - Active mission objective tracker (clean, compact text).
   - Credits and cargo fill percentage (`usedVolume / capVolume`).
5. **Tier 5: Modal Interfaces (Pause, Station, Menus)**
   - When opened, the simulation pauses and the in-flight HUD is **100% hidden**.
   - A deep frosted glass scrim dims and blurs the 3D scene behind.
   - All interactive controls are housed inside structured, physical container chassis with distinct clickable button blocks.

---

## 4. The Autopsy: Why Earlier Frontend Passes Failed

You must understand what went wrong previously so you can decisively avoid both traps:

### Trap 1: The 1995 Cheesy Sci-Fi Dashboard (Pre-Sep 5, Commit `e86f4be81`)
* **What it looked like:** 3px neon-cyan accent lines on the left edge of every div; saturated cyan-to-purple CSS linear gradients; animated scanlines and pulsing laser sweeps across borders; cringe fake-military subtitle spam under every button (`SETTINGS // SYS.OP.EXECUTE`, `RESUME // KINETIC_SIM_INIT`).
* **Why it failed:** It felt like a cheap 1990s Geocities arcade fan game. It was visually exhausting, juvenile, and amateur.

### Trap 2: The "Cinematic Minimal" Blank Google Doc (Sep 5–7, Commits `c360cd16c` to `a63068658`)
* **What it looked like:** An agent reacted to Trap 1 by writing `DIRECTION_SHEET.md`, mandating: *"Nothing is boxed. No cards, plates, borders, buttons, or scrim. Frozen game at 0% scrim. HUD dims to 38%."*
* **Why it failed:** Agents ripped out every container, table, and button. When you pause, bare white text floats illegibly over brightly lit 3D stars and planets while the flight HUD remains at 38% opacity directly behind it—causing flight telemetry (`drive 100`) to collide with menu text (`Esc resumes`). The station Market was stripped of tables and buttons, leaving bare words floating on hairlines.

### The Golden Middle (Where Modern Games Live)
Modern games do not choose between a 90s neon arcade and a naked Google doc. They build **precision aerospace instruments**: dark, quiet, structured, tactile, and surgical.

---

## 5. 2026 Space Game Case Studies & Ambitious Options

Here is how the world's best space games solve these problems. You can use these as your direct creative and technical baseline:

### Case Study A: *Everspace 2* (Fast Aerospace & Smoked Glass)
- **Aesthetic:** High-tech civilian/mercenary cockpit OS.
- **Surfaces:** Dark smoked acrylic panels (`rgba(10, 14, 22, 0.88)` + 12px backdrop blur). 45-degree chamfered corner cuts (`clip-path: polygon(...)`). Hairline borders in low-opacity slate (`rgba(130, 165, 210, 0.22)`).
- **Buttons & Tabs:** Wide, physical rectangular blocks with clear hitboxes (`min-height: 40px`). Idle is dark slate; hover triggers an instant 100ms brightening with an accent highlight; click gives tactile audio and physical depress.
- **Flight HUD:** Curved vector arcs hugging the crosshair for shield and hull; peripheral instruments pushed to lower thirds.

### Case Study B: *Starsector* (Tactical Military & Station Registers)
- **Aesthetic:** Industrial tactical command computer.
- **Station Market:** Dense, functional register table. Alternating row shading (`rgba(255, 255, 255, 0.03)`), clear quantity sliders, green/red profit margins, and prominent "BUY" and "SELL" button blocks.
- **Radar Hierarchy:** Asteroids are not tracked with individual bright dots. Only hostile ship wedges, missile signatures, and stations are shown.

### Case Study C: *Homeworld 3* (Vector Precision & Typographic Restraint)
- **Aesthetic:** Clinical, high-contrast vector design.
- **Typography:** Grotesque sans (Inter/DIN style) for labels; tabular monospaced numbers for speeds, credits, and coordinates.
- **Pause Atmosphere:** When opening tactical or system menus, a deep 70% dark scrim with gaussian blur covers the 3D scene, instantly focusing the eye on the interface.

### Case Study D: *Helldivers 2* (Tactical Affordance)
- **Aesthetic:** Bold physical terminals. Every interactive element has unmistakable affordance: thick borders, bold uppercase typography, and distinct keycap shortcuts (`[ESC]`, `[E]`, `[SPACE]`).

---

## 6. Ambitious Architectural Paradigms for You to Consider

As the lead frontend architect, you have the freedom to pick or synthesize any of these modern approaches:

- **Option 1: The Smoked Glass Aerospace Chassis**
  Dark translucent container panels with backdrop blur, 45° chamfered structural corners, fine 1px border lighting, and tactile physical button blocks with micro-elevation and edge glow.
- **Option 2: The Tactical Military Command Slate**
  Minimalist, high-density dark slate panels, hairline dividers, monospace telemetry grids, clear segmented controls, and deep focus scrims.
- **Option 3: The Integrated Modular Station Dock**
  A unified station console where ship outfitting, commodity trading, and missions share a cohesive, responsive modular multi-column grid with smooth tab switching.

---

## 7. Strict Guardrails & LLM Anti-Patterns (The Red Lines)

While you have complete creative freedom over layout, styling, and color grading, you are strictly forbidden from these specific anti-patterns:

1. **NO Subtitle / Lore Vomit:**
   - Never write pseudo-code or cringe military sub-labels beneath buttons (e.g. `SETTINGS // CONFIG_V2.0`, `RESUME // EXECUTE_SIM`, `MARKET // COMMODITY_REG_INIT`).
   - Use plain, strong, confident human words: `Resume`, `Settings`, `Save Game`, `Buy`, `Sell`, `Accept`.
2. **NO Garish 90s Neon & Laser Sweeps:**
   - Do not use bright magenta/cyan gradients, animated scanline borders, or heavy CSS drop-shadow glows. Keep base panels dark, neutral, and muted (charcoal, graphite, slate, deep navy).
3. **NO Floating Naked Text (The Google Doc Trap):**
   - Every interactive menu or terminal MUST sit inside a physical container chassis with a dark frosted background and border. Never render bare text directly over the 3D game scene.
4. **NO Radar Confetti:**
   - Do not draw dozens of tiny dots for every space rock on the minimap. Asteroids are environmental; radar contacts are tactical.
5. **100% Modal Occlusion:**
   - When paused or when any modal screen is active, `#hud` MUST have `display: none !important; opacity: 0 !important; pointer-events: none !important;`. No flight telemetry may bleed through.

---

## 8. Complete Code Map & Architecture Guide (Zero-Grep Reference)

To save you from grepping or scouring the repository, here is the exact code map:

### A. Core State Contracts (`src/core/gameState.js`)
- `state.mode`: `'flight'` | `'paused'` | `'menu'`.
- `state.player`:
  - `credits`, `debt`, `bounty`, `heat` (0..1 WANTED scalar).
  - `cargo`: `{ items: {}, usedVolume, usedMass, capVolume, capMass }`.
  - `ownedShips`, `activeShipIndex`, `moduleInventory`, `researchedNodes`.
  - `targetId`, `fireGroups: { 1: [], 2: [] }`, `boostActive`, `magnetRange`.
- `state.ui`:
  - `screenStack: string[]` (managed by `src/ui/screenManager.js`).
  - `docked: boolean`, `activeStationTab: string`, `radarRange: number`.
- `state.world`: `currentSectorId`, `activeSector: { stations, fields, hazards, pois, gates }`.
- `state.economy`: `markets: { [stationId]: { catalog, inventory, prices } }`.

### B. Screen Stack & Modal Framework
| File Path | Responsibility & Key Locations |
|---|---|
| [`src/ui/screenManager.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screenManager.js) | Manages modal screen stack (`state.ui.screenStack`), emits pause/resume events, caches screen DOMs in `#screens`, manages `#modal-backdrop`. |
| [`src/ui/uiRoot.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/uiRoot.js) | Mounts root DOM (`#hud`, `#screens`), dynamically registers all screens (lines 74–115), updates flight HUD every frame. |
| [`styles/kit.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/kit.css) | **Line 279:** Sets HUD opacity to 0.38 on pause (FIX: hide HUD completely). **Line 286:** Sets modal backdrop background to none (FIX: restore dark frosted scrim). |

### C. In-Flight HUD & Telemetry
| File Path | Responsibility & Key Locations |
|---|---|
| [`src/ui/hud.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/hud.js) | Primary flight HUD. Lines 1241–1260 house `.sf-cluster` (speedometer, throttle bar, weapon firing status). |
| [`src/ui/fieldHud.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/fieldHud.js) | Lines 19–34 inject `.sf-field-pill` at `bottom: 146px; left: 50%;`, which collides directly with the speedometer numbers. Separate these coordinates. |
| [`styles/ui.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/ui.css) | Telemetry styling, flight cluster styles, health meters, coordinate badges. |
| [`src/ui/commandBar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/commandBar.js) | Top RTS-style strip: resources, credits, cargo load, and time controls. |
| [`src/ui/radar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/radar.js) | Minimap radar dial. Lines 39–61 set `ASTEROID_DOT_LIMIT = 14`. Suppress ambient asteroid dots to clear the confetti. |

### D. Station Facility Terminals
| File Path | Responsibility & Key Locations |
|---|---|
| [`src/ui/station/stationApp.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/stationApp.js) | Root station UI shell. Manages facility tabs (Market, Shipworks, Bar, Contracts, Industry, Factions). |
| [`styles/station.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/station.css) | Station styles. Lines 4–5 currently ban cards, borders, buttons, and shadows. Restore structured chassis panels and tactile buttons. |
| [`src/ui/station/screens/market.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/market.js) | Commodity market. Needs structured register tables, volume sliders/buttons, and BUY/SELL button blocks. |
| [`src/ui/station/screens/shipworks.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/shipworks.js) | Shipyard and outfitting. Module cards, slot hardpoints, energy/mass comparison tooltips. |
| [`src/ui/station/screens/contracts.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/contracts.js) | Mission board. Contract dossiers with faction logos, objectives, rewards, and Accept buttons. |
| [`src/ui/station/screens/bar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/bar.js) | Station lounge. Framed dialogue panel with selectable conversation branches. |

### E. Pause Menu & Secondary Screens
| File Path | Responsibility & Key Locations |
|---|---|
| [`src/ui/screens/pause.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/pause.js) | Pause menu DOM. Wrap actions in an aerospace card container with styled interactive buttons. |
| [`styles/menu.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/menu.css) | Menu styles. Remove the flat text rules (Line 68); apply container chassis and button styles. |
| [`src/ui/screens/settings.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/settings.js) | Audio, video, and controls settings. Interactive segmented controls, checkboxes, and keybinding capture blocks. |
| [`src/ui/screens/saveLoad.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/saveLoad.js) | Save slots. Save cards showing sector, timestamp, playtime, and Save/Load/Delete action buttons. |
| [`src/ui/screens/techtree.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/techtree.js) | Research tree node cards and unlock buttons. |
| [`src/ui/screens/codex.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/codex.js) | Database and lore reader with categorized navigation. |

---

## 9. Verification & Visual Screenshot Workflow

Never conclude a frontend overhaul without visual confirmation. Headless browser screenshot scripts are pre-wired:

```bash
# 1. Capture pause menu, modal screens, and UI overlays
node scripts/capture-menu-overhaul.mjs

# 2. Capture in-flight HUD and active gameplay
node scripts/capture-gameplay.mjs

# 3. Capture UI kit components
node scripts/capture-kit.mjs

# 4. Run automated baseline test suite to ensure no code regressions
npm run check:baseline
```

Inspect the resulting PNG screenshots in the `.devshots/` directory:
- Confirm that the flight HUD is 100% occluded when paused.
- Confirm that menus and station facilities have physical, framed containers with dark frosted scrim.
- Confirm that buttons look physical, clickable, and responsive.
- Confirm zero text collisions between speedometer readouts and field deployable badges.
- Confirm that radar contacts are clean, high-priority tactical markers without asteroid noise.
