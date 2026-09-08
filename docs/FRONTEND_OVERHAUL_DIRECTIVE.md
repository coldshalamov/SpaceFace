# SpaceFace Frontend Master Architecture & Total Overhaul Directive

**The Definitive Context, Design Research, Gameplay Systems, and Screen Inventory Dossier for Incoming Frontend Agents**  
*Document Authority: Explicitly repudiates, overrides, and supersedes `design/frontend/direction/DIRECTION_SHEET.md` ("Cinematic Minimal") and all associated poisoned design specifications.*

---

## 1. Executive Charter: Mandate to Burn Down & Rebuild

If you are an incoming high-capability frontend agent, you have **full authority and license to burn down, replace, or completely rebuild the existing frontend across every 2D menu, screen, and HUD element in SpaceFace**.

You do **not** need to preserve the broken DOM structures, CSS hacks, or flawed layout coordinates left behind by previous low-tier agents. An earlier agent created an ideological manifesto (`DIRECTION_SHEET.md`) that banned standard game UI patterns ("no cards, no plates, no borders, no buttons, 0% scrim"), and subsequent agents mechanically stripped all buttons, cards, and containers from the game—turning menus, station terminals, and secondary screens into naked white text floating illegibly over a 38% transparent flight HUD and the 3D space scene.

**We do not prescribe rigid layout coordinates, fixed widths, or exact button positions.** We trust your superior reasoning, architectural judgment, and visual taste to synthesize the optimal frontend. This dossier gives you everything you need:
- The exact inventory of **poisoned design documents** to disregard and ignore.
- The complete inventory of **every 2D menu and screen** in the game and what went wrong with each.
- The complete breakdown of what the game is and how all gameplay systems work.
- Everything the player can control or would want to control.
- Everything the player needs to see, monitor, and feel across flight, combat, docking, and trading.
- Deep case studies of premier 2026 space games (*Everspace 2*, *Starsector*, *Homeworld 3*, *Helldivers 2*, *Chorus*).
- Ambitious architectural options you may choose to implement.
- A zero-grep code map of every relevant file, line range, and data contract in the codebase.

---

## 2. Invalidation of Poisoned Design Documents (Do NOT Follow These)

The following files in the repository contain poisoned instructions from the failed "Cinematic Minimal" initiative (PQ-187, Sep 5–7, 2026). They must be **explicitly disregarded and treated as anti-patterns**:

1. **`design/frontend/direction/DIRECTION_SHEET.md` (The Root Poison):**
   - *Toxic Mandate:* Declared that "nothing is boxed", "no cards, plates, borders, or buttons", "0% scrim", and "HUD dims to 38%".
   - *Action:* **Ignore completely.** It produced an unreadable, broken Google Doc aesthetic.
2. **`design/frontend/direction/KIT_SPEC.md`:**
   - *Toxic Mandate:* Codified the removal of interactive button styling, container elevation, and background contrast, replacing them with bare text and 1px hairlines.
   - *Action:* **Ignore.** Replace with real, tactile, aerospace-grade UI components.
3. **`design/frontend/direction/HANDOFF_PROMPTS.md` & Task Files (`tasks/TASK_A_*.md` through `TASK_D_*.md`):**
   - *Toxic Mandate:* Instructed agents to systematically scour every screen (Title, Pause, Station Market, Shipworks, Bar, Contracts, Tech Tree, Codex, Settings) and strip away all container cards, tables, and buttons.
   - *Action:* **Do not use as reference.** They represent the systematic dismantling of game affordances.
4. **Legacy Directives in `CANONICAL_BUILD_MAP.md §20.14` & `design/FRONTEND_DIRECTION.md`:**
   - Any reference pointing to `DIRECTION_SHEET.md` as the "decided direction" is formally superseded by this directive.

---

## 3. Complete Inventory of All 2D Menus & Screens in SpaceFace

SpaceFace has 24 primary modal screens and 7 station facility terminals. Below is the exhaustive inventory. Every single one of these screens was either corrupted by the poisoned instructions or left in a half-finished state:

### Group A: The Core Flow Menus
| Screen | File Path | What Was Ruined / Current State | Required Modern Game Standard |
|---|---|---|---|
| **Pause Menu** | [`src/ui/screens/pause.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/pause.js)<br>[`styles/menu.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/menu.css)<br>[`styles/kit.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/kit.css) | Naked white text floating down the left screen edge. Flight HUD kept at 38% opacity directly behind it (`kit.css:279`), causing telemetry numbers to collide with menu text. Modal backdrop has `background: none` (`kit.css:286`). | 100% occlude the flight HUD (`display: none !important`). Deep dark frosted scrim (65–75% dark glass + blur). Structured aerospace container card with tactile, responsive button blocks (Resume, Settings, Save, Load, Codex, Quit). |
| **Main Menu / Title Screen** | [`src/ui/screens/mainMenu.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/mainMenu.js) | Stripped of all buttons; bare unboxed words floating over the starter skybox. Zero visual weight or title presence. | Grand, atmospheric title treatment. Distinct primary button blocks (Continue, New Game, Load, Settings, Credits) with tactile hover states and audio cues. |
| **New Game / Pilot Setup** | [`src/ui/screens/newGame.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/newGame.js) | Raw text links for career/starter selection without structured panels or visual ship preview cards. | Tactile dossier cards showing starter ship silhouettes, starting gear, origin traits, and clear "Launch Career" confirmation buttons. |
| **Game Over Screen** | [`src/ui/screens/gameOver.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/gameOver.js) | Bare floating text over death scene. Lack of impact or insurance breakdown. | Dramatic casualty report panel: cause of destruction, insurance payout/deductible breakdown, lost cargo summary, and clear "Respawn at Station" / "Load Last Save" buttons. |

### Group B: The Starmap & Sector Navigation Menus
| Screen | File Path | What Was Ruined / Current State | Required Modern Game Standard |
|---|---|---|---|
| **Unified Galaxy Map ("The Chart")** | [`src/ui/galaxyMap.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/galaxyMap.js)<br>[`src/ui/map/mapAuthority.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/map/mapAuthority.js) | Hybrid SVG/canvas map. Header and legend suffered from hairline-only unboxed text styling. | Sleek tactical star chart (*Homeworld* / *Stellaris* style). High-contrast sector nodes, jump gate hyperlanes, faction territory wash, clear search/filter bar, and clean node inspection dossier. |
| **Starmap (Legacy)** | [`src/ui/screens/starmap.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/starmap.js) | Bare text overlays. | Serves as fallback; ensure clean container framing and waypoint route plotting. |
| **Local Sector Map** | [`src/ui/screens/localmap.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/localmap.js) | Low-contrast POI list, text overlap on radar canvas. | Crisp tactical grid showing stations, asteroid fields, hazard boundaries, and active ship contacts in the sector. |

### Group C: The Station Terminal Hub & Facility Screens
When the player docks, `src/ui/station/stationApp.js` mounts into `#screens`. `styles/station.css` lines 4–5 explicitly declared: *"No plates, borders, radii, gradients, glows or shadows anywhere"*, completely ruining all facility interfaces:
| Facility Screen | File Path | What Was Ruined / Current State | Required Modern Game Standard |
|---|---|---|---|
| **Station Hub Shell** | [`src/ui/station/stationApp.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/stationApp.js)<br>[`styles/station.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/station.css) | Facility tabs (Market, Shipworks, Bar, Contracts, Industry, Factions, Ledger) were reduced to bare clickable words with no tab affordance. Background is naked 3D dock. | A true aerospace spaceport terminal (*Starsector* / *Everspace 2*). Smoked glass chassis, station metadata header (Station Name, Faction, Security Level, Docking Bay), and distinct, styled facility navigation tabs with active indicators. |
| **Commodity Market** | [`src/ui/station/screens/market.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/market.js) | Ripped out all tables, quantity controls, and buttons. Bare commodity names floating on hairlines with raw numbers. | Structured register table with subtle alternating row contrast. Commodity inspector panel with stock, base price, local price, margin (+% green, -% red). Quantity adjustment controls (`-`, `+`, `Max`, slider) and physical **BUY** and **SELL** button blocks. |
| **Shipworks & Outfitting** | [`src/ui/station/screens/shipworks.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/shipworks.js) | Stripped module fitting cards, hardpoint slots, and stat comparison badges into plain text strings. | Interactive hardpoint fitting grid (Weapons, Shields, Thrusters, Cargo Bays, Utilities). Module cards showing stats (DPS, energy draw, mass, range). Stat delta preview (green +gain / red -loss) and tactile "Install" / "Strip" buttons. |
| **The Bar & Contacts** | [`src/ui/station/screens/bar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/bar.js)<br>[`src/ui/station/barContacts.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/barContacts.js) | Bare text dialogues floating without character portrait framing or distinct conversation choice buttons. | Atmospheric cantina dossier: NPC contact card, faction affiliation, framed dialogue window, and clear, clickable conversation response buttons. |
| **Contracts & Mission Board** | [`src/ui/station/screens/contracts.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/contracts.js) | Bare list of mission titles on hairlines with no reward badges or accept buttons. | Structured mission contract cards: faction crest, contract type (Bounty, Courier, Patrol, Mining), destination sector, danger rating, credit payout badge, and an "Accept Contract" button. |
| **Industry & Refining** | [`src/ui/station/screens/industry.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/industry.js) | Unboxed crafting queues. | Clean industrial fabrication console: input ore recipe cards, refining progress bars, and a "Fabricate" action button. |
| **Factions & Politics** | [`src/ui/station/screens/factions.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/factions.js) | Bare faction names and percentage numbers. | Faction standing dossier: faction banners, reputation meters (Hostile -> Neutral -> Friendly -> Allied), active perks, and territory control status. |
| **Ship's Ledger** | [`src/ui/station/screens/ledger.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/ledger.js) | Plain text financial dump. | Clean accounting ledger: lifetime trade profit, smuggling gains, bounty earnings, expense breakdown, and net worth tracker. |

### Group D: Progression, Automation & Secondary Screens
| Screen | File Path | What Was Ruined / Current State | Required Modern Game Standard |
|---|---|---|---|
| **Tech Tree / Research** | [`src/ui/screens/techTree.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/techTree.js) | Reduced tech nodes to bare words on hairlines. Research unlock pathways are confusing and unclickable. | High-tech R&D console: interconnected research node cards with status rings (Locked, Available, Researched), cost in research points, and an "Initiate Research" button. |
| **Mission Log** | [`src/ui/screens/missionLog.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/missionLog.js) | Plain text list of missions. | Quest journal: Active vs Completed tabs, step-by-step objective checkboxes, waypoint tracking toggle, and faction reward details. |
| **Codex & Database** | [`src/ui/screens/codex.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/codex.js) | Bare left-hand list of entries with unboxed text reader. | Galactic encyclopedia: Category sidebar (Ships, Factions, Commodities, Lore, Historical Events), structured article reader with blueprint schematics. |
| **Settings / Options** | [`src/ui/screens/settings.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/settings.js)<br>[`styles/accessibility.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/accessibility.css) | Raw words on lines for toggles and bindings. | Professional game settings menu: Audio volume sliders, Graphics/Video segmented pills, Controls keybinding rebinding table with keycap capture boxes, Accessibility toggles. |
| **Save & Load Menu** | [`src/ui/screens/saveLoad.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/saveLoad.js) | Text links without save slot framing or timestamps. | Save slot cards: Slot title, sector location, ship hull name, playtime counter, timestamp, and distinct "Save", "Load", and "Delete" buttons. |
| **Automation & Fleet** | [`src/ui/screens/automationPanel.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/automationPanel.js) | Bare text lists for mining drones and autonomous traders. | Passive empire command slate: drone fleet status cards, passive credit yield meters, upkeep trackers, and deployment buttons. |
| **Outpost Base Operations** | [`src/ui/screens/base.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/base.js) | Unframed structure list. | Modular planetary/asteroid base management screen with facility upgrade cards. |
| **Asteroid Operations / Drill** | [`src/ui/asteroid/asteroidScreen.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/asteroid/asteroidScreen.js)<br>[`src/ui/screens/drill.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/drill.js) | Hybrid 2D/3D drill minigame. Overlay controls need clean HUD framing. | Tactical sub-surface mining overlay with core depth meters, heat gauges, and fracture extraction triggers. |
| **Help & Pilot Handbook** | [`src/ui/screens/help.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/help.js) | Hairline text dump. | Pilot flight manual with keyboard/gamepad layout diagrams and combat flight maneuvers. |
| **Credits Screen** | [`src/ui/screens/credits.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/credits.js) | Unstyled text scroll. | Clean typographical presentation with graceful auto-scroll and pause control. |
| **Crucible Arena & Refit** | [`src/ui/screens/crucible.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/crucible.js)<br>[`crucibleDraft.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/crucibleDraft.js) | Combat arena draft cards. | Roguelike draft screen with distinct upgrade card choices. |
| **Range & Footprint Diagnostics** | [`src/ui/screens/range.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/range.js)<br>[`footprint.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/footprint.js) | Weapon testing telemetry tools. | Surgical weapon ballistic graphs and firing cone diagnostics. |

---

## 4. Gameplay Systems Matrix: What SpaceFace Actually Is

SpaceFace is a Three.js browser/Electron space combat, mining, trading, and RPG sim built on a flat `GameState`, an event bus, and a fixed 60 Hz simulation loop running on the XZ plane decoupled from rendering.

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
  - Target Lock Diamond: Centers on selected enemy or POI (`state.player.targetId`).
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

---

## 5. The Player Control Envelope & Information Hierarchy

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

## 6. 2026 Space Game Case Studies & Ambitious Options

Here is how the world's best space games solve these problems:

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

### A. Core State Contracts (`src/core/gameState.js`)
- `state.mode`: `'flight'` | `'paused'` | `'menu'`.
- `state.player`: `credits`, `debt`, `bounty`, `heat` (0..1 WANTED scalar), `cargo`, `ownedShips`, `activeShipIndex`, `moduleInventory`, `researchedNodes`, `targetId`, `fireGroups`, `boostActive`, `magnetRange`.
- `state.ui`: `screenStack: string[]`, `docked: boolean`, `activeStationTab: string`, `radarRange: number`.
- `state.world`: `currentSectorId`, `activeSector: { stations, fields, hazards, pois, gates }`.
- `state.economy`: `markets: { [stationId]: { catalog, inventory, prices } }`.

### B. Screen Stack & Modal Framework
- [`src/ui/screenManager.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screenManager.js): Manages modal screen stack (`state.ui.screenStack`), emits pause/resume events, caches screen DOMs in `#screens`, manages `#modal-backdrop`.
- [`src/ui/uiRoot.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/uiRoot.js): Mounts root DOM (`#hud`, `#screens`), dynamically registers all screens (lines 74–115), updates flight HUD every frame.
- [`styles/kit.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/kit.css): **Line 279:** Sets HUD opacity to 0.38 on pause (FIX: hide HUD completely). **Line 286:** Sets modal backdrop background to none (FIX: restore dark frosted scrim).

### C. In-Flight HUD & Telemetry
- [`src/ui/hud.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/hud.js): Primary flight HUD. Lines 1241–1260 house `.sf-cluster` (speedometer, throttle bar, weapon firing status).
- [`src/ui/fieldHud.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/fieldHud.js): Lines 19–34 inject `.sf-field-pill` at `bottom: 146px; left: 50%;`, which collides directly with the speedometer numbers. Separate these coordinates.
- [`styles/ui.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/ui.css): Telemetry styling, flight cluster styles, health meters, coordinate badges.
- [`src/ui/commandBar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/commandBar.js): Top RTS-style strip: resources, credits, cargo load, and time controls.
- [`src/ui/radar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/radar.js): Minimap radar dial. Lines 39–61 set `ASTEROID_DOT_LIMIT = 14`. Suppress ambient asteroid dots to clear the confetti.

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
