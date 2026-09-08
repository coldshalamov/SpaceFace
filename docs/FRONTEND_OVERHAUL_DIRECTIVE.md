# SpaceFace Frontend Master Architecture & Rescue Directive

**The Definitive Context, Design Research, and Technical Implementation Dossier for Incoming Frontend Agents**  
*Document Authority: Explicitly overrides and supersedes `design/frontend/direction/DIRECTION_SHEET.md` ("Cinematic Minimal") and all legacy "0% scrim / borderless / unboxed" instructions.*

---

## 1. Executive Briefing: The Core Mission

SpaceFace has suffered from two consecutive, polar-opposite frontend failures across previous development cycles:
1. **The 1995 Cheesy Dashboard Era (Pre-Sep 5):** Garish neon-cyan gradients, laser-sweep animations, heavy outer glows, and fake military corner stamps (`[SYS.01]`, `// SEC_CLEARANCE`). It felt like a cheap 1990s Geocities fan game.
2. **The "Cinematic Minimal" Blank Google Doc Over-Correction (Sep 5–7):** An agent reacted by banning all standard game UI. It declared: *"Nothing is boxed. No cards, plates, borders, buttons, or scrim."* Subsequent agents systematically stripped every container, background, and button from the game—including all station facility terminals (Market, Shipworks, Bar, Contracts) and the Pause menu.

**The Current State of the Game:**
The Pause menu is naked white text floating over the 3D space scene. The in-game flight HUD is kept visible at 38% opacity directly behind it, causing horrifying text collisions (flight telemetry numbers like `drive 100` collide with `Esc resumes`). The station Market has no buy/sell buttons or tables—just bare words on hairlines. The center flight HUD collides with tool badges. The minimap is a confetti storm of 30+ asteroid dots.

**Your Mission:**
Transform SpaceFace's frontend into a sleek, tactile, modern 2026 indie space game interface (*Everspace 2*, *Starsector*, *Homeworld 3*, *Helldivers 2*). Provide precision vector HUDs, physical dark-chassis container panels with frosted glass scrim, responsive interactive button blocks, and deconflicted telemetry layouts.

This document contains **everything** you need: complete git history analysis, industry case studies, concrete CSS/SVG design recipes, a full file-and-line repository inventory, and screenshot verification scripts. **You do not need to search git logs or grep the codebase.**

---

## 2. The History of What Went Wrong (Git Archeology)

To ensure you don't repeat past mistakes, here is the exact autopsy of how the frontend broke:

### Era 1: The Cheesy Sci-Fi Dashboard (Commit `e86f4be81` and earlier)
* **What it did:**
  - Placed 3px solid neon-cyan accent stripes on the left edge of every single container.
  - Used saturated cyan-to-purple CSS linear gradients on button backgrounds.
  - Added fake military jargon subtitles beneath every action (e.g. `SETTINGS // SYS.OP.EXECUTE`, `RESUME // KINETIC_SIM_INIT`).
  - Pulsing animated scanlines and laser sweeps across panel borders.
* **Why it failed:** It looked juvenile, noisy, and dated. It screamed amateur Web 1.0 rather than a polished tactical simulator.

### Era 2: The "Cinematic Minimal" Over-Correction (Commits `c360cd16c` through `a63068658`)
* **What it did:**
  - An agent authored `design/frontend/direction/DIRECTION_SHEET.md` mandating:
    - *"Nothing is boxed. There are no panels, cards, plates, chips or borders."*
    - *"No plate, no logo lockup, no buttons."*
    - *"The frozen game at 0% scrim."*
    - *"The HUD dims to 38% rather than disappearing."*
  - In commit `5516b3500`, `0513b050a`, `785efe51b`, and `cac3adefd` (Tasks C & D), agents stripped all UI styling:
    - `styles/station.css` lines 4–5 were changed to: *"No plates, borders, radii, gradients, glows or shadows anywhere."*
    - Station Market, Shipworks, Bar, Contracts, and Factions had all cards, tables, and buttons removed.
    - `styles/kit.css` line 279 forced `#hud` to stay at `opacity: 0.38` during pause, and line 286 set modal backdrops to `background: none;`.
* **Why it failed:** It turned the game into a broken, unstyled text document. When you pause or open a station terminal, white words float illegibly over brightly lit planets, stars, and flight telemetry numbers. Clicking words feels unresponsive and ambiguous because there are no button hitboxes, hovers, or boundaries.

**The Golden Middle (Where We Are Going):**
A real game UI is neither a 90s neon arcade nor a blank text document. It is an **aerospace instrument**: dark, quiet, structured, frosted, and tactile.

---

## 3. Industry Case Studies: How Great Space Game UI is Built

Do not guess or search the web. Top-tier space games in 2026 follow these proven visual systems:

### Case 1: *Everspace 2* (Fast Aerospace & Clean Glass)
* **Visual Identity:** Sleek, high-tech civilian/mercenary cockpit OS.
* **Containers & Surfaces:** Dark smoked glass panels (`rgba(10, 14, 22, 0.85)`) with 12px backdrop blur. 45-degree chamfered panel corners (aerospace structural plates). Subtle 1px borders in low-opacity silver/slate (`rgba(140, 170, 210, 0.2)`).
* **Buttons & Tabs:** Wide, tactile rectangular blocks. Idle state is dark with high-contrast text; hover triggers a fast 100ms brightening with a crisp cyan or amber edge highlight; click provides instant audio and tactile depress.
* **Flight HUD:** Curved vector arcs hugging the crosshair for shields and hull; peripheral telemetry is pushed to the lower thirds, keeping the flight center completely uncluttered.

### Case 2: *Starsector* (Tactical Military & Station Registers)
* **Visual Identity:** Industrial, tactical military command interface.
* **Station Facilities & Markets:** Dense, functional registers. The Market is a structured data table with subtle alternating row striping (`rgba(255, 255, 255, 0.03)`), clear quantity sliders, profit-margin indicators (+% green, -% red), and prominent "BUY" and "SELL" action buttons.
* **Radar Hierarchy:** Asteroids are not individually tracked with bright icons unless targeted. Radar prioritizes hostile ship silhouettes, missile signatures, and warp gates.

### Case 3: *Homeworld 3* & *Deserts of Kharak* (Precision Vectors)
* **Visual Identity:** Crisp monochromatic vector graphics with clinical typographic restraint.
* **Typography:** Clean grotesque sans (DIN / Inter style) for labels; tabular monospaced numbers for speeds, distances, and coordinates.
* **Atmosphere:** When paused or entering the tactical view, a deep 70% dark scrim with gaussian blur covers the 3D scene, creating an immediate sense of focus and calm.

### Case 4: *Helldivers 2* (High-Contrast Tactical Utility)
* **Visual Identity:** Bold, high-contrast, physical terminal blocks.
* **Affordance:** You never wonder if something is clickable. Interactive elements have clear physical boundaries, bold uppercase typography, and distinct keycap shortcuts (`[ESC]`, `[E]`, `[SPACE]`).

---

## 4. Advanced Technical Recipes for SpaceFace

You can implement these patterns directly using modern CSS and SVG:

### Recipe A: The Smoked Glass Aerospace Chassis
Every modal, pause menu, and station terminal needs a container panel:
```css
.sf-chassis {
  background: rgba(9, 13, 22, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(130, 165, 210, 0.22);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7), 0 0 1px 1px rgba(255, 255, 255, 0.05) inset;
  border-radius: 4px;
}

/* Optional Aerospace Chamfered Silhouette */
.sf-chassis-chamfer {
  clip-path: polygon(
    0 8px, 8px 0,
    calc(100% - 8px) 0, 100% 8px,
    100% calc(100% - 8px), calc(100% - 8px) 100%,
    8px 100%, 0 calc(100% - 8px)
  );
}
```

### Recipe B: Tactile Interactive Button Blocks
Replace bare text links with distinct, satisfying button components:
```css
.sf-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 8px 20px;
  background: rgba(22, 32, 50, 0.75);
  border: 1px solid rgba(130, 165, 210, 0.28);
  border-radius: 3px;
  color: #e2eaf5;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 60ms ease;
  user-select: none;
}

.sf-btn:hover {
  background: rgba(35, 52, 82, 0.9);
  border-color: rgba(160, 205, 255, 0.55);
  color: #ffffff;
}

.sf-btn:active {
  transform: translateY(1px);
  background: rgba(18, 26, 42, 0.95);
}

.sf-btn-primary {
  background: rgba(30, 60, 100, 0.85);
  border-color: rgba(100, 170, 255, 0.6);
}

.sf-btn-primary:hover {
  background: rgba(40, 80, 135, 0.95);
  border-color: #88c0ff;
}

.sf-btn-danger {
  background: rgba(65, 20, 25, 0.75);
  border-color: rgba(220, 80, 90, 0.4);
}

.sf-btn-danger:hover {
  background: rgba(90, 25, 32, 0.9);
  border-color: rgba(255, 100, 110, 0.7);
}
```

### Recipe C: Vector SVG Precision for Flight HUD
Do not use chunky CSS boxes for crosshairs or radial meters. Use inline SVGs:
```html
<!-- Reticle with Shield/Armor Arcs -->
<svg class="sf-reticle-svg" viewBox="-50 -50 100 100" width="100" height="100">
  <!-- Center Aim Pip -->
  <circle cx="0" cy="0" r="2" fill="rgba(255, 255, 255, 0.85)" />
  <!-- Left Shield Arc -->
  <path d="M -24 -20 A 30 30 0 0 0 -24 20" fill="none" stroke="#4aa8ff" stroke-width="2.5" stroke-linecap="round" />
  <!-- Right Hull Arc -->
  <path d="M 24 -20 A 30 30 0 0 1 24 20" fill="none" stroke="#e6a030" stroke-width="2.5" stroke-linecap="round" />
</svg>
```

---

## 5. Complete File Inventory & Technical Map

Here are the exact files, line numbers, and responsibilities across the codebase:

### Layer A: Pause Menu & Scrim
| File Path | Lines | Responsibilities & Required Fixes |
|---|---|---|
| [`styles/kit.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/kit.css) | 279, 286 | **Lines 279 & 286:** Sets `#hud` to `opacity: 0.38` on pause and modal backdrop to `background: none;`. Fix: Set `#hud { display: none !important; opacity: 0 !important; }` and restore backdrop to `rgba(6, 10, 18, 0.75); backdrop-filter: blur(8px);`. |
| [`src/ui/screens/pause.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/pause.js) | 1–450 | Pause menu DOM construction. Replace the bare list of words down the screen edge with a structured modal card container (`width: 340px;`), title header, and distinct styled button blocks. |
| [`styles/menu.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/menu.css) | 50–140 | Styling for menu fascias. Remove flat text rules (Line 68); apply the smoked glass chassis and button styles. |
| [`src/ui/screenManager.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screenManager.js) | 50–150 | Screen stack lifecycle manager. Handles `pushScreen`, `popScreen`, and modal state classes. |

### Layer B: In-Flight HUD & Center Cluster Deconfliction
| File Path | Lines | Responsibilities & Required Fixes |
|---|---|---|
| [`src/ui/hud.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/hud.js) | 1241–1260 | Center cluster (`.sf-cluster`). Houses the speedometer, throttle bar, and weapon status. Positioned at bottom center. |
| [`src/ui/fieldHud.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/fieldHud.js) | 19–34, 105–128 | Active field / deployable tool badge (`CONE — CLEARING`). Injected at `left: 50%; bottom: 146px;` which collides directly with the speedometer. **Fix:** Reposition to `bottom: 86px;` or anchor above the flight reticle with clear vertical margins. |
| [`styles/ui.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/ui.css) | 530–650, 1200–1250 | Flight telemetry styles. Controls `.sf-cluster`, `.sf-stat`, instrument bars, and screen positioning. |
| [`src/data/sectorZones.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/data/sectorZones.js) | 94 | Sector zone label definition (`Concord Core`). Ensure in-world projected zone text does not duplicate or render over the center crosshairs. |

### Layer C: Tactical Radar & Minimap
| File Path | Lines | Responsibilities & Required Fixes |
|---|---|---|
| [`src/ui/radar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/radar.js) | 39–61, 800–1150 | Minimap rendering. Lines 39–61 set `ASTEROID_DOT_LIMIT = 14`. The radar is cluttered with dozens of minor asteroid and debris dots. **Fix:** Suppress ambient asteroid blips entirely from the radar dial. Reserve bright, crisp glyphs exclusively for hostiles, jump gates, stations, and tracked targets. |
| [`src/ui/map/tacticalMapGrammar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/map/tacticalMapGrammar.js) | 20–70 | Radar and map glyph drawing functions (`drawHostileGlyph`, `drawStationGlyph`, `drawGateGlyph`). Ensure sharp geometry and high-contrast color coding. |

### Layer D: Station Facility Terminals
| File Path | Lines | Responsibilities & Required Fixes |
|---|---|---|
| [`styles/station.css`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/styles/station.css) | 1–300 | Station terminal styles. Lines 4–5 currently ban all plates, cards, borders, and shadows. **Fix:** Restore the dark aerospace chassis, tabbed facility navigation, and framed content areas. |
| [`src/ui/station/stationApp.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/stationApp.js) | 40–180 | Root station UI coordinator. Manages facility tabs: Market, Shipworks, Bar, Contracts, Industry, Factions. Tabs must be interactive, styled pills or tabs with clear active state. |
| [`src/ui/station/screens/market.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/market.js) | 50–320 | Station commodity trading. Needs a structured register table with subtle alternating row contrast, quantity adjustment controls (`-`, `+`, `Max`), and physical **BUY** and **SELL** button blocks. |
| [`src/ui/station/screens/shipworks.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/shipworks.js) | 40–280 | Outfitting and ship customization. Needs module fitting slot cards with stats (energy, mass, DPS, shield HP) and install/uninstall button components. |
| [`src/ui/station/screens/contracts.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/contracts.js) | 30–220 | Missions board. Render contracts as framed mission dossiers with faction logos, reward payouts, and an "Accept Contract" button. |
| [`src/ui/station/screens/bar.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/station/screens/bar.js) | 30–180 | Station lounge / NPC dialogue. Framed dialogue panel with distinct, selectable conversation choices. |

### Layer E: Secondary Screens
| File Path | Lines | Responsibilities & Required Fixes |
|---|---|---|
| [`src/ui/screens/techtree.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/techtree.js) | 30–250 | Research tree. Replace raw words with research node cards and unlock buttons. |
| [`src/ui/screens/codex.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/codex.js) | 30–200 | Lore and database entries. Structured reading dossier panel with category navigation. |
| [`src/ui/screens/saveLoad.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/saveLoad.js) | 30–220 | Save/Load slots. Structured save cards showing sector, timestamp, playtime, and "Save"/"Load"/"Delete" buttons. |
| [`src/ui/screens/settings.js`](file:///c:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/settings.js) | 30–350 | Game settings & keybind remapping. Real segmented controls, checkboxes, and interactive keycap binding capture blocks. |

---

## 6. Strict Guardrails & LLM Anti-Patterns

Incoming LLM agents frequently fall into predictable traps when asked to design sci-fi UI. You are strictly forbidden from the following anti-patterns:

1. **NO Subtitle / Lore Vomit:**
   - Never write pseudo-code or cringe military sub-labels beneath buttons (e.g. `SETTINGS // CONFIG_V2.0`, `RESUME // EXECUTE_SIM`, `MARKET // COMMODITY_REG_INIT`).
   - Use plain, strong, confident human words: `Resume`, `Settings`, `Save Game`, `Buy`, `Sell`, `Accept`.
2. **NO Garish 90s Neon & Laser Sweeps:**
   - Do not use bright magenta/cyan gradients, animated scanline borders, or heavy CSS drop-shadow glows. Keep base panels dark, neutral, and muted (charcoal, graphite, slate, deep navy).
3. **NO Floating Naked Text (The Google Doc Trap):**
   - Every interactive menu or terminal MUST sit inside a physical container chassis with a dark frosted background and border. Never render bare text directly over the 3D game scene.
4. **NO Radar Confetti:**
   - Do not draw dozens of tiny dots for every space rock on the minimap. Asteroids are environmental; radar contacts are tactical.

### Creative Freedom Granted
Within these guardrails, you have full creative authority to decide:
- The exact accent color hierarchy (e.g. crisp aerospace amber `#e6a030`, high-tech cobalt `#4aa8ff`, or emerald `#40d090`).
- Panel silhouettes, corner bevels, and structural framing brackets.
- Sound effects triggers on button hover/click (using `src/audio/synth.js`).

---

## 7. Verification Workflow & Screenshot Proof

Never conclude your work without visual confirmation. Automated headless capture scripts are provided:

### Verification Commands
```bash
# 1. Capture pause menu, modal screens, and UI overlays
node scripts/capture-menu-overhaul.mjs

# 2. Capture in-flight HUD and active gameplay
node scripts/capture-gameplay.mjs

# 3. Capture UI kit components
node scripts/capture-kit.mjs

# 4. Run automated baseline test suite to ensure no regressions
npm run check:baseline
```

### Visual Quality Checklist
Inspect the resulting PNG images in the `.devshots/` directory:
- [ ] Is the in-game flight HUD 100% hidden when the game is paused?
- [ ] Does the pause screen have a dark frosted scrim with a clean aerospace card container and physical buttons?
- [ ] Are the speedometer numbers and field deployable badges separated with zero overlap?
- [ ] Is the radar clear of asteroid confetti, cleanly highlighting threats and gates?
- [ ] Do station terminals (Market, Shipworks, Bar, Contracts) have structured panels and real interactive button blocks?
