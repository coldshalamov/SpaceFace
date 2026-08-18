# SpaceFace · Cyberpunk Loading Screen & Terminal Mainframe Engine
## Engineering Handoff & High-Level Architecture Brief

---

### 1. High-Level Vision & Purpose

The goal of this system is to replace the generic game loading screen with a **high-contrast, dense cyberpunk dot-matrix and ASCII artwork animation sequence** framed inside an authentic military tactical mainframe terminal. 

Rather than showing static text or cheap character spam, the terminal plays an unbroken, 5-act looping music-video-style animation of solid, recognizable cyberpunk imagery that runs smoothly at 60 FPS while the game assets, Three.js scenes, and simulation systems load in the background.

```
┌──[ SPACEFACE TACTICAL MAINFRAME // 120x60 ASCII PHOSPHOR RASTER ]────────────────────────┐
│                                                                                          │
│  [Act 1: Biomechanical Android] ──> [Act 2: Megacity Canyon] ──> [Act 3: Space Combat]  │
│   • Solid facial contours            • Skyscraper monoliths      • Interceptor & Frigate │
│   • 8 catenary cranial cables        • Glowing window arrays     • Kinetic laser beams   │
│   • Asymmetric blinking/reticle      • Multi-lane AV skyways     • 4-stage detonation    │
│                                              │                                           │
│                                              ▼                                           │
│  [Act 5: Hyper-Warp Corvette]   <── [Act 4: AI Core / Dyson Iris]                       │
│   • 3D faceted player ship           • 12 interlocking iris blades                       │
│   • Shock-diamond thrusters          • 32-tooth bevel gear ring                          │
│   • 8 expanding warp rings           • Singularity pupil & runes                         │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Core Architectural & Rendering Principles

1. **Solid Rasterization over Sparse Point Clouds:**
   - **Crucial Rule:** Never render 3D scenes as sparse floating point clouds. 1,600 scattered dots on a 120×60 grid produce empty black space and unreadable punctuation clutter.
   - All visual elements must be drawn using **solid raster primitives** (filled silhouettes, rasterized 2D/3D polygons, continuous line equations, and edge-detected luminance masks) into a flat `Float32Array(7200)` buffer.
2. **Dense Monospace Typography & Tone Ramp:**
   - Standard 120×60 grid ($7,200$ active character cells).
   - Dynamic luminance values $[0.0, 1.0]$ map directly to a calibrated density ramp (` `, `·`, `.`, `:`, `;`, `+`, `=`, `x`, `*`, `#`, `%`, `■`, `░`, `▒`, `▓`, `▀`, `▄`, `█`).
   - Solid block characters (`█`, `▓`, `▄`, `▀`) form the opaque mass of ships, buildings, and faces; fine dots (`·`, `:`) provide ambient background texture and lighting falloff.
3. **Physical P31 CRT Phosphor Persistence:**
   - An exponential decay buffer ($D_t = \max(L_t, D_{t-1} \cdot e^{-9.0 \Delta t})$) provides authentic $400\text{–}600\text{ms}$ phosphor ghost trails behind moving projectiles, flying vehicles, and blinking lights.
4. **Performance & Zero-GC Guarantees:**
   - Dedicated Web Worker execution via `OffscreenCanvas` with automatic fallback to the main thread if unsupported.
   - All simulation and framebuffer arrays (`lumBuffer`, `colorBuffer`, `decayBuffer`, `glyphBuffer`) are pre-allocated once during initialization. Zero allocations occur inside the 60 FPS animation loop.

---

### 3. The 5 Handcrafted Narrative Acts

| Act | Theme / Narrative | Dominant Palette | Key Visual Identifiers |
|---|---|---|---|
| **Act 1** | **The Biomechanical Android**<br>*(Intimate Cyberpunk Horror)* | Neural Emerald & Cyan<br>(`#14a37f`, `#4ef0c0`, `#b48cff`) | Solid facial contours (cheekbones, jaw, lips, nose bridge); 8 catenary cranial cables with glowing data pulses; left organic eye blinking vs. right cybernetic 32-step rotating reticle. |
| **Act 2** | **Dystopian Megacity Canyon**<br>*(Brutalist Urban Scale)* | Blade Runner Amber & Gold<br>(`#b86e00`, `#ffb700`, `#ff0066`) | Towering skyscraper monolith silhouettes with rooftop antenna warning beacons; hundreds of glowing window arrays; animated neon billboards (`KAIJU_AI`); multi-lane skyway AV traffic with continuous beam trails. |
| **Act 3** | **Kinetic Space Combat & Rupture**<br>*(High-Energy Violence)* | Incendiary Orange & Cyan<br>(`#00e5ff`, `#ff5500`, `#ffffff`) | Solid delta-wing interceptor firing continuous kinetic railgun beams; capital frigate with armor bulkheads and deflector shield sparks; 4-stage detonation with expanding shockwave ring and 48 tumbling polygonal shrapnel shards. |
| **Act 4** | **Ominous AI Core / Dyson Iris**<br>*(Cosmic Singularity Horror)* | Quantum Void Purple & Red<br>(`#8a2be2`, `#c77dff`, `#ff0055`) | 32-tooth perimeter gear ring; 12 interlocking curved mechanical iris blades sliding open and shut; central black void event horizon with glowing caustic rim and red synthetic pupil; orbiting hexadecimal runes. |
| **Act 5** | **Tessera Corvette Hyper-Warp**<br>*(Heroic Spaceflight Breakout)* | Vasimr Cyan & Electric Lime<br>(`#00b4d8`, `#7df9ff`, `#39ff14`) | 3D faceted Tessera corvette with nose chine and cockpit canopy; supersonic Mach shock-diamond thruster plumes (4 repeating nodes); 8 expanding relativistic warp tunnel toroid rings; 48 radial warp star streaks closing the loop back into Act 1. |

---

### 4. Key Files & Responsibilities

1. **[`src/ui/loadingTerminalArt.js`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/loadingTerminalArt.js):**
   - Contains the standalone Web Worker script (`WORKER_SCRIPT`), raster drawing primitives (`setPixel`, `drawLine`, `fillRect`, `fillCircle`, `drawText`), act evaluators, phosphor decay loop, and main-thread lifecycle controller (`createTerminalArtwork`, `bootstrapLoadingTerminal`).
2. **[`src/ui/loadingPresenter.js`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/loadingPresenter.js):**
   - Manages presentation timing (`MIN_BOOT_DISPLAY_MS = 9500`), cold-boot display guarantees, user skip reachability (click/keypress), and stage progression synchronization.
3. **[`test/loading-terminal-art.test.mjs`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/test/loading-terminal-art.test.mjs):**
   - Node test suite verifying the lifecycle API, progress updates, and graceful fallback behavior when DOM elements or canvas contexts are absent.

---

### 5. Maintenance & Future Enhancement Rules

- **Do Not Revert to Point Clouds:** Any future additions to scenes or visual assets must render via solid raster fill or continuous vector lines into `lumBuffer`.
- **Preserve Fixed Buffer Sizes:** The 120×60 buffer dimension is tuned for monospace font aspect ratios ($1:2$ cell ratio) and optimal legibility.
- **Retain CRT Phosphor Decay:** The decay factor (`decayRate`) must remain calibrated between $0.85\text{–}0.92$ per frame to ensure smooth motion persistence without smearing static UI elements.
- **Maintain User Skip Reachability:** `loadingPresenter.js` allows instant dismissal on key/click after minimum initial display threshold—do not block user input.
