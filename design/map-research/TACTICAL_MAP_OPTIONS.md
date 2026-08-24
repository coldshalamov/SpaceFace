# Tactical Map: Six Bold Implementation Candidates

Weighted architecture comparison for [`../TACTICAL_MAP_SECOND_GENERATION.md`](../TACTICAL_MAP_SECOND_GENERATION.md). Research inputs are recorded in [`TACTICAL_MAP_RESEARCH.md`](TACTICAL_MAP_RESEARCH.md).

## 5. Six bold implementation candidates

Scores use 1–10 values. Weighted total is out of 100.

### Weights

- At-a-glance legibility: **25%**
- Navigation leverage: **20%**
- Combat usefulness: **15%**
- Compact/full-map parity: **15%**
- Performance and implementation feasibility: **15%**
- Extensibility and accessibility: **10%**

| Rank | Concept | Legibility | Navigation | Combat | Parity | Perf/feas. | Extend/a11y | Weighted |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | **Semantic glyph grammar + adaptive objective corridor** | 9.6 | 9.3 | 9.4 | 9.8 | 8.7 | 9.1 | **93.5** |
| 2 | **Adaptive context/range radar** | 9.0 | 8.7 | 9.1 | 8.5 | 8.5 | 8.3 | **87.3** |
| 3 | **Layer-preset strategy workbench** | 8.2 | 9.4 | 6.8 | 9.3 | 8.2 | 8.6 | **84.3** |
| 4 | **Sensor-truth / confidence map** | 8.3 | 8.7 | 7.7 | 9.4 | 7.7 | 8.8 | **84.2** |
| 5 | **Hybrid 2D + shallow-depth command map** | 7.8 | 9.0 | 6.4 | 9.5 | 6.3 | 8.1 | **78.9** |
| 6 | **Volumetric 3D sensor globe** | 6.4 | 8.3 | 5.7 | 8.6 | 4.7 | 7.0 | **68.1** |

### 5.1 Semantic glyph grammar + adaptive objective corridor — selected

**Concept:** Assign each primary class a unique silhouette and redundant visual channel. Make the player visually sovereign. Represent the objective as a relationship—player-to-destination corridor—rather than a point with a different hue. Collapse the corridor progressively as contact density rises.

**Pros**

- Fixes the current complaint directly without increasing HUD footprint.
- Works in monochrome and under colour-vision deficiencies.
- Gives compact/full-screen parity through a reusable data-driven symbol catalog.
- Preserves the mature contact renderer, spatial query, trails, lead pip, scan, and heat systems.
- Makes waypoint direction obvious without forcing a screen-space HUD arrow everywhere.
- The route line is adaptive, so it provides guidance when calm and gets out of the way in combat.

**Cons**

- Compositing over the existing renderer adds one canvas copy per radar update.
- The legacy mark must be masked beneath the new semantic mark until the base renderer itself is migrated.
- Full parity initially appears as a key/legend; replacing every existing chart glyph with the shared draw functions is a deeper follow-on.

### 5.2 Adaptive context/range radar

**Concept:** Dynamically choose range, contact budget, marker scale, and labels based on speed, combat state, objective distance, and local density. Slow exploration zooms out; active combat tightens around threats; expansion becomes an explicit “sensor analysis” mode.

**Pros**

- Makes the radar show more than the camera without permanently consuming more screen area.
- Can privilege braking distance, weapons range, docking approach, or objective context.
- Reduces asteroid and civilian clutter automatically.

**Cons**

- A changing scale can destroy spatial intuition if transitions are not extremely clear.
- Hidden adaptation can feel like the instrument is lying.
- Requires telemetry and careful hysteresis to avoid zoom pumping.

**Decision:** Adopt only the density-aware objective treatment now. Keep range explicit and player-controlled until telemetry proves an adaptive mode.

### 5.3 Layer-preset strategy workbench

**Concept:** Give the full map task presets—Navigate, Fight, Trade, Explore, Claims—each selecting a coherent set of layers, labels, and inspector defaults.

**Pros**

- Converts map complexity into named questions.
- Scales well as the living-universe simulation adds data.
- Strong keyboard/gamepad affordance and good parity with the existing chart architecture.

**Cons**

- Does little for the immediate compact-radar complaint.
- Preset state can become another configuration burden.
- Requires rigorous ownership so layers do not silently disagree.

**Decision:** High-value next phase, not the first repair.

### 5.4 Sensor-truth / confidence map

**Concept:** Treat contacts as observations with freshness, confidence, uncertainty regions, source, and decay. The map distinguishes live sensor truth, remembered truth, rumors, and unknown space.

**Pros**

- Gives the map genuine gameplay purpose beyond omniscient UI.
- Excellent fit for exploration, scanning, stealth, electronic warfare, and faction intelligence.
- Creates meaningful differences among sensors and ships.

**Cons**

- Requires a coherent simulation/data model, not just rendering.
- Badly tuned uncertainty feels like interface failure rather than gameplay.
- More visual states are dangerous before the basic symbol vocabulary is mastered.

**Decision:** Build after the shared grammar is stable.

### 5.5 Hybrid 2D + shallow-depth command map

**Concept:** Keep the canonical top-down survey table, but add a paused optional oblique view with modest parallax, altitude/depth stems, and selectable planes. No free-flying camera; one gesture returns to orthographic north-up.

**Pros**

- Adds depth where it can actually clarify vertical separation, orbit relationships, or layered hazards.
- Preserves the fast 2D overview.
- Can become visually distinctive without infecting the tactical HUD.

**Cons**

- Requires a second projection, hit testing, label layout, input, accessibility, and performance path.
- Depth cues can obscure routes and marks.
- SpaceFace currently plays primarily in a top-down x/z plane; fake depth would be theater unless gameplay data earns it.

**Decision:** Valid future experiment only after gameplay introduces spatial information that 2D cannot express cleanly.

### 5.6 Volumetric 3D sensor globe

**Concept:** A rotatable holographic sphere containing contacts, route arcs, sensor volumes, hazards, and system bodies.

**Pros**

- Spectacular presentation.
- Natural home for true 3D flight, orbital layers, sensor volumes, and vertical routes.
- Strong marketing image.

**Cons**

- Worst glanceability and combat utility.
- Occlusion, camera manipulation, and perspective distort distance and bearing.
- High GPU, input, label, and testing cost.
- A 3D globe representing a mostly 2D simulation is visual fiction.
- Would likely become a beautiful menu players avoid using.

**Decision:** Rejected as the default. Reconsider only if the simulation becomes materially three-dimensional.

---

