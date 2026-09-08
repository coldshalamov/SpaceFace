# SpaceFace Frontend Rescue & Overhaul Directive

**Comprehensive Implementation Blueprint & File Map for Frontend Agents**  
*Explicitly overrides and supersedes `design/frontend/direction/DIRECTION_SHEET.md` ("Cinematic Minimal") and all prior "0% scrim / borderless / unboxed" instructions.*

---

## 1. Executive Summary: What Happened & What Must Be Fixed

An earlier agent created a design manifesto (`design/frontend/direction/DIRECTION_SHEET.md`) that banned standard game UI elements:
- *"Nothing is boxed. There are no panels, cards, plates, chips or borders."*
- *"No plate, no logo lockup, no buttons."*
- *"The frozen game at 0% scrim."*
- *"The HUD dims to 38% rather than disappearing."*

Following agents implemented this literally. The result is:
1. **The Pause Menu looks like a broken, unstyled text document:** Naked white words float over the 3D space scene with zero background card or panel. The in-game flight HUD stays at 38% opacity directly behind it, so HUD numbers (`drive 100`, `energy`, `fuel`, minimap, objective lines) collide with the menu text (e.g. `Esc resumes` is rendered on top of `drive 100`).
2. **The Center Flight HUD is an overlapping collision:** Speed (`19`), sector zone (`◇ Concord Core` rendered twice), clearing cone (`CONE — CLEARING`), and weapon status are all jammed onto the exact same coordinate (`left: 50%; bottom: ~140px;`).
3. **The Minimap is an unreadable confetti storm:** 30+ tiny geometric icons (asteroids, civilian ships, stations, debris) are rendered simultaneously in a 100px dial with no clustering or distance filtering.

---

## 2. Complete File Inventory & Code Map

To prevent unnecessary repository grepping, here are all the exact file paths, line ranges, and responsibilities involved:

### A. Pause Menu & Screen Layer
| File Path | Key Line Ranges | Responsibility / Issue |
|---|---|---|
| [`styles/kit.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/kit.css) | Line 279: `body.k-screen-top[data-k-screen="pause"] #hud`<br>Line 286: `body.k-screen-top #modal-backdrop` | **Critical Bug:** Line 279 sets HUD opacity to `0.38` instead of hiding it. Line 286 sets modal backdrop `background: none;`. Re-enable full dark/frosted scrim (`background: rgba(6, 10, 18, 0.75); backdrop-filter: blur(8px);`) and hide `#hud` completely (`opacity: 0 !important; pointer-events: none !important; display: none !important;`). |
| [`src/ui/screens/pause.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/pause.js) | Lines 1–25: Header rules<br>Lines 120–250: Menu item builders<br>Lines 300–450: DOM assembly | Builds the pause menu DOM. Currently outputs plain word lists down the left edge. Needs container card wrapping, structured section headers, and styled button components with hover/active states. |
| [`styles/menu.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/menu.css) | Lines 50–120: Menu fascia styling<br>Line 68: `/* One flat surface (no blur stack... */` | Contains the menu plate styling. Remove the flat text rules; define real aerospace card containers with subtle borders (`1px solid rgba(132, 160, 200, 0.22)`) and background fills (`rgba(10, 16, 28, 0.85)`). |
| [`src/ui/screenManager.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screenManager.js) | Lines 50–150: Screen lifecycle | Manages push/pop of screens, dispatches pause timeScale events, and toggles body classes. |
| [`src/ui/uiRoot.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/uiRoot.js) | Lines 150–250: `#hud` and `#screens` mounting | Mounts root DOM containers. Ensure `#screens` properly stacks above `#hud` and suppresses flight HUD input. |

### B. Flight HUD & Center Cluster Overlaps
| File Path | Key Line Ranges | Responsibility / Issue |
|---|---|---|
| [`src/ui/hud.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/hud.js) | Lines 1241–1250: `center` (`.sf-cluster`)<br>Lines 3400–3450: Target lock diamond<br>Lines 4480–4550: Objective projection & arrow label<br>Lines 4570–4605: First-use hint projection | Main flight HUD. `.sf-cluster` renders speed, weapon, and contextual chips at bottom center. Check coordinate collisions with `fieldHud.js` and in-world projected text. |
| [`src/ui/fieldHud.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/fieldHud.js) | Lines 19–34: `FIELD_HUD_CSS`<br>Lines 105–128: Field resolution (`CONE — CLEARING`) | Injects `.sf-field-pill` at `position: absolute; left: 50%; bottom: 146px; transform: translateX(-50%);`. This coordinate places `CONE — CLEARING` directly on top of the speedometer numbers! Relocate field badges to a designated slot above or beside the primary instruments. |
| [`styles/ui.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/ui.css) | Lines 530–650: Input, keycaps, console tokens<br>Lines 1200–1250: Instrument and deck classes | Controls layout and positioning of `#hud`, `.sf-cluster`, `.sf-stat`, and flight telemetry readouts. |
| [`src/data/sectorZones.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/data/sectorZones.js) | Line 94: `{ id: 'zone_helios_core', name: 'Concord Core', ... }` | Zone definition. The name "Concord Core" is projected into screen space; verify where the duplicate diamond `◇ Concord Core` overlay is emitted so it does not collide with the flight reticle or speedometer. |
| [`src/ui/commandBar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/commandBar.js) | Lines 37–67: `COMMAND_BAR_CSS`<br>Lines 68–120: Resource strip cells | Top RTS-style resource strip. Safe at `top: 10px`, but ensure its z-index and hiding behavior match modal states. |

### C. Minimap / Tactical Radar
| File Path | Key Line Ranges | Responsibility / Issue |
|---|---|---|
| [`src/ui/radar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/radar.js) | Lines 39–61: Dial dimensions & contact limits<br>Lines 517–585: Canvas creation & transform<br>Lines 800–1150: Entity drawing loops | **Confetti Bug:** Currently draws dozens of individual blips for ambient belt asteroids (`ASTEROID_DOT_LIMIT = 14`), ambient traffic, and minor infrastructure. Culls need to be tightened. Belt asteroids should be represented as a faint background field/ring rather than individual bright glyphs. Immediate threats and nav waypoints must dominate. |
| [`src/ui/map/tacticalMapGrammar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/map/tacticalMapGrammar.js) | Lines 20–60: Color palettes & glyph drawing functions | Draws glyphs (`drawHostileGlyph`, `drawStationGlyph`, `drawGateGlyph`, `projectRadarPoint`). Ensure hostile chevrons have high contrast and clear directional arrows. |

### D. Visual Capture & Screenshot Scripts
| Script / Path | Purpose | How to Run |
|---|---|---|
| `scripts/capture-menu-overhaul.mjs` | Captures pause menu, main menu, and modal screens | `node scripts/capture-menu-overhaul.mjs` |
| `scripts/capture-kit.mjs` | Captures frontend UI kit components | `node scripts/capture-kit.mjs` |
| `scripts/capture-gameplay.mjs` | Captures in-flight HUD and gameplay | `node scripts/capture-gameplay.mjs` |
| `.devshots/` | Directory where all generated screenshots are saved | Inspect `.devshots/` PNG outputs to verify visual appearance |

---

## 3. Specific Component Requirements

### 1. The Pause Screen
* **Scrim & Atmosphere:**
  - 65% dark translucent backdrop (`background: rgba(8, 12, 22, 0.72)`) with a subtle `backdrop-filter: blur(6px)`.
  - The frozen 3D game world is visible behind the scrim, providing depth without causing visual noise.
* **Menu Card Container:**
  - Group pause menu actions inside an aerospace-grade container panel (e.g. `width: 320px; padding: 24px; border: 1px solid rgba(132, 160, 200, 0.25); background: rgba(12, 18, 30, 0.88); border-radius: 4px; box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);`).
  - Positioned either cleanly centered or as an aligned left-hand drawer.
* **Interactive Button Components:**
  - Replace raw text lists with distinct clickable buttons.
  - Buttons must have clear hitboxes (`min-height: 38px`), padding, clean typography, and responsive hover/focus states (subtle highlight border, slight background glow, audio click cue).
  - Categorize actions: Primary (Resume), System (Settings, Save, Load), Flight Records (Missions, Ship, Codex), Dangerous (Main Menu, Quit Game - styled with a subtle warning accent).
* **100% HUD Occlusion:**
  - When paused, `#hud` MUST have `display: none !important; opacity: 0 !important; pointer-events: none !important;`.
  - No meters, speed numbers, or objective hints may bleed through.

### 2. Flight HUD Center Cluster Deconfliction
* **Dedicated Layout Stack:**
  - `bottom: 24px`: Primary flight instruments (Speed readout, Weapon firing group / cooling bars).
  - `bottom: 90px`: Active tool / Deployable field pill (`fieldHud.js` - `CONE — CLEARING`). Must be neatly centered above the speed bar with fixed vertical clearance so it never overlaps text.
  - `bottom: 130px`: Proximity warnings / Critical alerts (`alerts.js`).
* **Zone & Nav Guidance Placement:**
  - Sector zone identification (e.g. `Concord Core`) belongs on the upper navigation banner or sector arrival postcard, NOT anchored to the center flight reticle or bottom speedometer.

### 3. Minimap / Radar Decluttering
* **Sensory Hierarchy:**
  - **Level 1 (Dominant):** Hostile craft (bright red/amber blips with directional heading indicators), active missile locks, and current navigated objective/waypoint (high-contrast gold bracket).
  - **Level 2 (Persistent Infrastructure):** Stations and jump gates (clean, distinct geometric icons; never masked by traffic).
  - **Level 3 (Ambient Traffic):** Neutral freighters and allies within 600 WU.
  - **Cull Ambient Clutter:** Remove individual glowing icons for every minor asteroid rock. Represent asteroid belts as a subtle texture or background density curve rather than 20 individual cyan/purple circles that drown out combat contacts.

---

---

## 4. UI Craft Standards & Anti-Patterns (How to Build Great UI)

High-quality modern game UI (*Everspace 2*, *Homeworld 3*, *Helldivers 2*, *Starsector*, *Armored Core VI*) succeeds because it feels like a precision instrument: structured, tactile, and quiet.

### A. How Great Game UI is Built
1. **Vector Precision (SVG & Canvas):**
   - Reticles, crosshair ticks, radar blips, directional arrows, and telemetry gauges must be clean vector SVGs or crisp canvas geometry. They stay surgical and knife-sharp at 1080p, 1440p, and 4K without pixelation or raster blur.
2. **The "Dark Chassis" Container Principle:**
   - Every modal, drawer, and menu needs a physical "home": a dark, low-saturation frosted-glass panel (`background: rgba(10, 14, 24, 0.85); backdrop-filter: blur(10px); border: 1px solid rgba(132, 160, 200, 0.22);`).
   - Give panels authentic aerospace feel through subtle corner chamfers (`clip-path: polygon(...)`), fine 1px hairline dividers, or subtle corner accent brackets.
3. **Tactile Interactive Buttons:**
   - Buttons are physical interactive blocks (`min-height: 40px; padding: 8px 16px;`), not naked text links.
   - **Idle:** Dark slate fill, subtle border, crisp high-contrast white/silver text.
   - **Hover:** Fast 100ms transition — background subtly brightens (+15-20%), accent border highlights, pointer cursor, soft tactile click audio.
   - **Active/Click:** Snappy visual acknowledgement.
4. **Typographic Discipline:**
   - Exactly two font roles:
     - **UI Body/Buttons:** Clean, modern geometric/grotesque sans (Segoe UI, Inter, DIN, Barlow).
     - **Telemetry & Numbers:** Tabular monospaced font for speeds, credits, and coordinates.

### B. The Anti-Patterns (What NOT to Do — LLM Design Traps)
1. **NO Subtitle / Lore Vomit:**
   - Do NOT add cheesy fake-military sub-labels or pseudo-code under buttons (e.g. `SETTINGS // SYS_CONFIG_V1`, `RESUME // EXECUTE_SIM`). It looks cringe and clutters the interface. Keep labels clear, concise, and confident: `Resume`, `Settings`, `Save`, `Load`, `Quit`.
2. **NO Garish 90s Neon & Laser Sweeps:**
   - Avoid saturated cyan-to-purple gradient buttons, heavy outer glow filters, or animated laser sweeps across borders. The UI is a functional aerospace cockpit computer, not a 1999 Geocities sci-fi page.
3. **NO Floating Naked Text (The Google Doc Trap):**
   - Never render raw unboxed text floating directly across a 3D space scene. All interactive controls belong inside a designed container panel.
4. **NO Confetti Icons:**
   - Avoid generating dozens of conflicting decorative micro-icons that turn the screen or minimap into visual noise. Every glyph must have a dedicated, unambiguous gameplay meaning.

### C. Creative Room for the Agent
The executing agent has full creative freedom to author:
- Exact panel silhouettes, corner cuts, and border accent motifs.
- Color grading: sleek graphite/titanium dark bases with tactical accent highlights (e.g. warm amber, crisp gold, or deep ice blue).
- Micro-interactions, hover animations, and sound cue attachments.

---

## 5. Verification & Quality Assurance Checklist

Before declaring any frontend task complete, an agent must fulfill these requirements:

1. **Visual Screenshot Inspection:**
   - Run `node scripts/capture-menu-overhaul.mjs` and `node scripts/capture-gameplay.mjs`.
   - Inspect the images in `.devshots/`. Confirm:
     - No text collisions or overlapping layers anywhere on screen.
     - Pause menu looks like a finished, professional indie space game UI (like *Starsector*, *Everspace*, or *FTL*), not an unstyled web document.
     - In-game HUD is completely hidden when paused.
2. **Automated Baseline Verification:**
   - Run `npm run check:baseline` to ensure no UI test contracts or fast-gate assertions were broken.
   - Run `node scripts/check-now-liveness.mjs` to ensure clean checkpoint lifecycle.
