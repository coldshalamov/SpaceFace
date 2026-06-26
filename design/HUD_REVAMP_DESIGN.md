# SpaceFace HUD Revamp Design: "Tactical Visor"

## 1. Goal and Philosophy
The current HUD relies heavily on a "Web Page UI" paradigm—thick backgrounds, glassmorphic panels, and bulky margins. To match premium, high-fidelity space simulators, we must completely pivot to a **"Tactical Visor" / "Diegetic Projection"** design system.

The UI must appear as if it is projected directly onto the pilot's helmet visor or rendering in 3D space around the ship. 

### Core Tenets:
1. **Kill the Panels:** Completely eliminate `background-color` and `backdrop-filter` from the flight HUD.
2. **Thin-Line Aesthetic:** Use 1px or 2px crisp lines (using CSS borders and SVG strokes) for all elements. Use negative space instead of boxes.
3. **Legibility via Glow:** Since there are no background panels, contrast is achieved via strict CSS `drop-shadow` or `text-shadow`.
4. **Centralized Action:** The player's eyes must remain near the center crosshair. Critical data (health, shields, energy) will be moved from the corners into arcs framing the center of the screen.
5. **Bright Background Contrast:** SpaceFace features very bright, vibrant nebulas. Pure 1px neon lines will get lost without a strict, harsh `drop-shadow` to separate them from the colorful background.
6. **Resolving Existing Overlaps:** The current top-left hamburger menu (`≡`) overlaps the "OBJECTIVE" panel. This will be fixed by establishing strict Flexbox/Grid anchor zones so elements naturally stack.

---

## 2. Global Styling & CSS Variables (The Palette)
The CSS must be updated to reflect this new technical, neon-lit aesthetic. Open `styles/ui.css` and update the `:root` variables:

```css
:root {
  /* Tactical Visor Palette */
  --visor-cyan: #00F0FF;
  --visor-cyan-dim: rgba(0, 240, 255, 0.4);
  --visor-amber: #FF9900;
  --visor-amber-dim: rgba(255, 153, 0, 0.4);
  --visor-red: #FF2A2A;
  --visor-red-dim: rgba(255, 42, 42, 0.4);
  
  /* Text and Glows */
  --text-primary: #FFFFFF;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --visor-glow-cyan: 0px 0px 8px rgba(0, 240, 255, 0.6);
  --visor-glow-amber: 0px 0px 8px rgba(255, 153, 0, 0.6);
  --visor-glow-red: 0px 0px 12px rgba(255, 42, 42, 0.8);
  
  /* Text shadow for legibility without backgrounds */
  --text-shadow-hard: 0px 1px 3px rgba(0, 0, 0, 1), 0px 0px 2px rgba(0, 0, 0, 0.8);
}
```

---

## 3. DOM Component Overhaul

### A. The Central Arcs (Health & Energy)
Remove the four stacked bars from the `bottom-left` of the screen. Instead, introduce two large SVG elements pinned to the center of the screen, wrapping around the crosshair.

**CRITICAL 3RD-PERSON ADJUSTMENT:** Because this game uses a third-person chase camera, we cannot have the arcs hug the crosshair too tightly, otherwise they will obscure the player's ship model.
- The arcs must have a wide radius (e.g., `800px` to `1000px` spread) to frame the *action zone* (the space around the ship) rather than the ship itself.
- **Dynamic Opacity:** To prevent screen clutter, these arcs should sit at a very low base opacity (e.g., `0.15`). They will only flare up to full brightness (`1.0` opacity + glow) momentarily when the player takes damage, fires weapons, or rapidly expends energy, then fade back out.

**DOM Structure (`#hud`):**
```html
<!-- Wide container to frame the 3rd person ship -->
<div id="hud-center-arcs">
  <!-- Left Arc: Defensive (Shields & Hull) -->
  <svg class="hud-arc arc-left" viewBox="0 0 100 800">
    <!-- Faint background track -->
    <path class="arc-track" d="M 90 20 A 400 400 0 0 0 90 780" />
    <!-- Active Fill (controlled via JS stroke-dashoffset) -->
    <path id="shield-arc-fill" class="arc-fill stroke-cyan" d="M 90 20 A 400 400 0 0 0 90 780" />
  </svg>

  <!-- Right Arc: Offensive/Utility (Energy & Heat) -->
  <svg class="hud-arc arc-right" viewBox="0 0 100 800">
    <path class="arc-track" d="M 10 20 A 400 400 0 0 1 10 780" />
    <path id="energy-arc-fill" class="arc-fill stroke-amber" d="M 10 20 A 400 400 0 0 1 10 780" />
  </svg>
</div>
```

**CSS Integration:**
```css
#hud-center-arcs {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 1000px;
  height: 800px;
  pointer-events: none;
  display: flex;
  justify-content: space-between;
}

.hud-arc {
  width: 100px;
  height: 800px;
  fill: none;
  stroke-width: 3px;
  stroke-linecap: square;
}

.arc-track {
  stroke: rgba(255,255,255,0.1);
}

.arc-fill {
  stroke-dasharray: 400; /* Approximate length, requires JS tuning */
  stroke-dashoffset: 0; 
  transition: stroke-dashoffset 0.1s linear;
}

.stroke-cyan { stroke: var(--visor-cyan); filter: drop-shadow(var(--visor-glow-cyan)); }
.stroke-amber { stroke: var(--visor-amber); filter: drop-shadow(var(--visor-glow-amber)); }
```

### B. The Bottom Action Bar
Ditch the boxy "Throttle / Speed / Cargo" cluster. We will replace it with a minimal Action Bar that clearly maps keys to abilities.

**DOM Structure (`#hud`):**
```html
<div id="action-bar">
  <div class="action-slot">
    <span class="bind">LMB</span>
    <div class="icon-box pulse-laser"></div>
  </div>
  <div class="action-slot">
    <span class="bind">RMB</span>
    <div class="icon-box mass-sample"></div>
  </div>
  <div class="action-slot">
    <span class="bind">SHIFT</span>
    <div class="icon-box boost"></div>
  </div>
  <div class="action-slot">
    <span class="bind">E</span>
    <div class="icon-box dock"></div>
  </div>
</div>

<!-- Text readouts placed minimally above the action bar -->
<div id="flight-readouts">
  <span id="speed-readout">SPD: <span class="val">0</span></span>
  <span id="throttle-readout">THR: <span class="val">0%</span></span>
</div>
```

**CSS Integration:**
```css
#action-bar {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
}

.action-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.action-slot .bind {
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--text-secondary);
  text-shadow: var(--text-shadow-hard);
}

.icon-box {
  width: 48px;
  height: 48px;
  border: 1px solid var(--visor-cyan-dim);
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0,0,0,0.4);
  box-shadow: inset 0 0 10px rgba(0,240,255,0.05);
}
```

### C. The Ship Schematic (Bottom Left)
Replace the clunky health bars with a top-down structural schematic of the player's ship. 

- Use an SVG outline of the ship.
- Use CSS filters to tint the ship red if hull < 25%.
- Draw a glowing cyan circle (`stroke`) around the ship schematic to represent the shield. Use `stroke-dasharray` to represent shield percentage.
- The `MSG` and `LOG` text feeds will sit directly above this schematic, without background boxes, using only `text-shadow: var(--text-shadow-hard)`.

### D. The Tactical Node Map (Bottom Right)
The current `180x180px <canvas>` radar is circular and enclosed in a thick border.
- **Change:** Remove the canvas background and border.
- Draw a faint isometric or top-down Cartesian grid on the canvas background.
- Draw contacts as extremely sharp, glowing vectors (no thick circles).
  - Hostiles: Red diamonds (`◇`).
  - Stations/Goals: Cyan squares (`□`).
  - Asteroids: Dim grey dots (`·`).
- Connect the player to the current target with a very thin `1px` dashed line.

### E. Top Left & Top Right Adjustments
Currently, the top-left hamburger menu overlaps the Objective panel, and the top-right has a redundant tutorial box.

**Top Left (Menu & Objectives):**
- Place the hamburger menu button in a dedicated top-left anchor `div`. Center the `≡` perfectly using `display: flex; justify-content: center; align-items: center;`.
- Remove the `margin-top` overlaps. The Objective panel should sit exactly `16px` below the menu button.

**Top Right & Center (Target Frame):**
- Remove the right-side control tutorial box entirely (it is now replaced by the Action Bar).
- Remove the "47-A Mass Signal" box styling.
- Center the target information at the top of the screen.
- Just use floating text: `[TARGET LOCK: 47-A Mass Signal]`.
- Encase the distance `ETA - 549u` in very small square brackets `[ 549u ]`.
- The floating "SYS NOMINAL" badge currently above the minimap should be moved to just underneath the top-center target lock, acting as a general ship status indicator.

---

## 4. JavaScript Wiring (`src/main.js` or `ui.js`)
Currently, `09-ui-ux-hud-menus-screen-management-dom-overlay.md` specifies that JS uses `transform:scaleX()` for bars. 

**Updating the Arcs:**
You will need to change the JS 60Hz update loop to map values to `stroke-dashoffset` instead of `scaleX`.
```javascript
// Example updating the shield arc
const shieldFill = document.getElementById('shield-arc-fill');
// Assuming total arc length is 400
const maxOffset = 400; 
const currentPct = GameState.player.shield / GameState.player.maxShield;

// As shield drops, offset increases, "erasing" the line
shieldFill.style.strokeDashoffset = maxOffset - (maxOffset * currentPct);
```

**Updating the Action Bar:**
The action bar is mostly static, but you can add a script to highlight the `icon-box` when the corresponding ability is cooling down or active.
```javascript
// On firing weapon
const lmbBox = document.querySelector('.icon-box.pulse-laser');
lmbBox.style.boxShadow = 'inset 0 0 20px rgba(0,240,255,0.5)';
// Revert after 100ms
```

## Summary of Execution
1. Delete `background`, `border-radius`, and `backdrop-filter` from `.hud-panel` classes in CSS.
2. Inject the `<svg>` arcs into `#hud` and bind their `stroke-dashoffset` in the JS render loop.
3. Replace the bottom `div` clusters with the `.action-slot` flexbox row.
4. Replace the bottom-right circular radar border with a raw, borderless canvas grid.
