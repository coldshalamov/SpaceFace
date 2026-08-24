# Tactical Map, Second Generation — Reviewed Implementation

**Status:** implemented on PR #98 and rebuilt from current `master`.  
**Primary code:** `src/ui/radar.js`, `src/ui/map/tacticalMapGrammar.js`, `src/ui/map/mapParityBridge.js`, `src/ui/screenManager.js`.  
**Regression coverage:** `test/tactical-map-second-generation.test.mjs` plus the existing radar, HUD, map, accessibility, pause, and performance gates.

## 1. Review verdict

The first implementation chose the right product direction but stopped halfway through the rendering architecture.

It correctly identified the root defect as **semantic compression**, not merely insufficient diameter. The 220 px radar already had a 340 px expanded mode, indexed contacts, spatial asteroid filtering, trails, scan pings, lead prediction, station/gate marks, and an objective. The failure was that too many things used the same language: small luminous polygons separated mainly by hue while bloom consumed the contrast budget.

The review found these material faults:

1. Only the player and objective were promoted into the crisp layer; threats, stations, and gates stayed fuzzy.
2. The compositor copied the old canvas and covered old marks with dark circular masks, cutting holes in the grid.
3. Global menu pause was installed from `createRadar()`, coupling simulation authority to a HUD widget.
4. The pause shim watched a state flag the real `ScreenManager` never published, allowing time freeze and pause events to disagree.
5. Cross-sector objectives without a resolved local position silently fell back to the old generic diamond.
6. New radar text rendered below the repository's binding 12 px floor.
7. The chart-parity bridge used a process-global one-shot flag and failed after cached-screen remounts.
8. The chart legend taught the new objective grammar while the live chart objective still displayed only its old diamond and ring.
9. Large off-range objective and infrastructure marks could be clipped against the range-ring edge.

The revised implementation removes those compromises rather than reclassifying them as future polish.

## 2. Product decision

The selected architecture remains:

> **Semantic tactical radar + paused operational atlas**

The radar answers immediate questions under flight time pressure. The atlas answers slower planning questions. They share identity, not composition.

### Compact radar jobs

The always-on instrument should answer in roughly one fixation:

1. Where am I?
2. Which way am I facing?
3. What can hurt me now?
4. Where is the active objective?
5. Where are persistent navigation anchors?
6. What range am I looking at?
7. Is the situation dense enough that I should open the chart?

The radar should not attempt to show trade strategy, every asteroid label, faction history, mission prose, or the whole route graph.

### Full chart jobs

The paused chart should answer:

1. Where is the objective in local, system, and galactic context?
2. What route should I take, and why?
3. What is live, remembered, stale, inferred, or unknown?
4. Which security, economic, political, mission, and exploration layers matter?
5. What action is available for the selected object?
6. Can I move between overview and detail without losing orientation?

## 3. Weighted architecture comparison

Weights:

- at-a-glance tactical legibility: 25%
- navigation leverage: 20%
- combat usefulness: 15%
- compact/full-map parity: 15%
- performance and implementation risk: 15%
- accessibility and extensibility: 10%

| Rank | Architecture | Weighted score | Decision |
|---:|---|---:|---|
| 1 | Semantic glyph grammar + adaptive objective corridor | **93.5** | Selected |
| 2 | Adaptive context/range radar | 87.3 | Density policy incorporated |
| 3 | Layer-preset strategy workbench | 84.3 | Atlas follow-up |
| 4 | Sensor-truth / confidence map | 84.2 | Follow-up |
| 5 | Hybrid 2D + shallow-depth command map | 78.9 | Optional paused lens |
| 6 | Volumetric 3D sensor globe | 68.1 | Rejected as default |

A default 3D globe is visually impressive but currently inferior. SpaceFace's meaningful combat and navigation primarily occupy the x/z plane. Perspective introduces occlusion, camera manipulation, depth ambiguity, and a second expensive scene without adding equivalent decisions. Shallow depth becomes justified only when altitude itself carries gameplay information.

## 4. Final symbol grammar

Every primary class has a unique silhouette and at least one redundant channel.

| Class | Shape | Secondary channel | Priority |
|---|---|---|---:|
| Player | filled asymmetric hull | white nose notch + fixed centre brackets + `YOU` | 100 |
| Objective | four open destination corners | inner diamond + dotted corridor | 95 |
| Hostile | directional open chevron | selected fill + threat weight | 80 |
| Gate | double portal ring | four portal ticks | 70 |
| Station | berth hex | inset dark berth square | 65 |
| Neutral contact | outline hull/role shape | faction tint where known | 45 |
| Asteroid | micro-diamond | low luminance and scale | 15 |

Colour is reinforcement. Removing hue still leaves self, goal, threat, station, and gate distinguishable.

## 5. Native crisp radar

`src/ui/radar.js` now directly owns the complete radar rendering path. There is no copied fuzzy source canvas, legacy mask layer, or canvas bloom.

The native renderer retains:

- DPI-scaled 220 px compact and 340 px expanded canvases;
- indexed contact consumption;
- spatial-hash asteroid query with adaptive full-scan fallback;
- bounded trail sampling and pruning;
- asteroids, pickups, wrecks, neutral traffic, hostile traffic, stations, gates, scan pings, claim beacons, heat zones, selected-target tether, and ballistic lead;
- off-range hostile and infrastructure guidance;
- reduced-motion behavior;
- resolved and unresolved objective guidance;
- explicit range plate;
- accessible radar description.

No `shadowBlur` appears in the radar. Decision-critical marks are geometrically sharp. Decorative sensor motion is reduced to one low-alpha sweep line.

### Density hierarchy

The objective corridor responds to both hostile density and total salient-contact density:

- **full:** low-density flight;
- **reduced:** moderate threat or contact load, preserving start and terminal segments;
- **terminal:** swarm or severe clutter, preserving destination-side guidance only;
- **none:** destination already sits close to the player mark.

Expanded mode restores the full corridor because the larger surface has enough visual bandwidth.

### Salient-contact budget

The semantic pass caps high-priority marks while sorting selected and nearest contacts first. Background asteroids remain low-alpha texture rather than competing symbols.

## 6. Objective behavior

### Resolved local objective

A local objective receives:

- four amber destination brackets;
- an inner diamond and white centre;
- a dotted route corridor;
- a compact distance readout;
- a range-rim arrow when outside radar range;
- the existing HUD edge indicator, which remains the sole screen-space bearing cue.

The objective bracket centre is inset from the range ring so its corners do not clip against the canvas. Off-range station and gate pips keep their centres on the ring but use smaller geometry and inward-facing ticks.

The PR deliberately does not create a second screen-space HUD arrow. The live HUD already owns that function; duplicating it would recreate the same attention collision this work is solving.

### Unresolved or cross-sector objective

A waypoint without a presentable local position receives an amber unresolved bracket at the north reference with an internal `?` and `ROUTE PENDING`. No false bearing or fake corridor is drawn.

## 7. Full-chart parity

The unified chart keeps its Surveyor's Table composition and continuous local/system/galaxy zoom.

`mapParityBridge.js` now supplies two parity layers:

1. a five-symbol key in the chart inspector;
2. the same four-corner bracket around the **actual live chart objective**.

The objective overlay does not reimplement projection. It imports the existing `galaxyMapScreen` authority and consumes the chart's resolved `_clickTargets`, preferring the canonical `active-waypoint`. Off-canvas destinations keep the chart's existing edge-tick affordance rather than receiving a clipped duplicate bracket.

The bridge is:

- root-aware rather than process-global;
- safe across cached-screen remounts and same-root `innerHTML` replacement;
- reference-counted across HUD recreation;
- persistent through later map mounts;
- compliant with the 12 px type floor;
- asleep while the cached chart screen is hidden.

Parity means the player learns one vocabulary. It does not mean forcing the compact radar and operational atlas into the same layout.

## 8. Pause authority

The first implementation installed an all-menu pause shim from the radar. That was the wrong ownership boundary.

The reviewed version changes `ScreenManager` itself:

- any non-empty screen stack requests `ui:pausing-screen` at scale 0;
- nested screens preserve a single aggregate pause;
- the final pop releases the request and emits one resume;
- known screens remain listed for audit and audio-policy tests;
- unknown future screens pause automatically;
- `.ui-live-screen` is retired;
- administrative blackout semantics remain separate and unchanged.

The map can now be opened for planning without the simulation continuing beneath it, and the rule does not depend on whether a radar happened to mount.

## 9. Size and text

### Compact size: 220 px

Retained. The right-dock and playfield cost of further enlargement is not justified once semantic bandwidth is repaired.

### Expanded size: 340 px

Retained. It doubles range and supports objective labels and a full route corridor.

### Type floor: 12 px

Every new canvas and DOM text declaration is at least 12 px, including:

- north reference;
- player tag;
- range plate;
- objective plate;
- scan-ping text;
- heat-zone readout;
- chart parity key.

Tiny text is not subtle. It is missing information rendered decoratively.

## 10. Performance model

Normal flight adds no second radar canvas copy and no blur pass.

Per radar update:

1. one pre-rendered background-canvas copy;
2. one indexed contact traversal;
3. one bounded asteroid traversal;
4. at most 72 trail updates;
5. at most 32 crisp hostile marks;
6. at most 20 crisp infrastructure marks;
7. constant-cost objective, player, range, and threat geometry.

The spatial query keeps the existing adaptive fallback:

- small asteroid fields use the cheap full scan;
- sparse fields use the spatial hash;
- very broad/high-visit queries fall back instead of paying more to use the index.

No new WebGL scene, timer, or simulation query is introduced. The chart's objective overlay uses one lightweight animation-frame reader **only while the paused chart is visible**, because the chart's click-target coordinates move during pan and zoom. The loop cancels when the cached chart hides; normal flight pays nothing for it.

## 11. Verification

The dedicated suite covers:

- unique primary shapes;
- redundant encoding;
- contrast against the radar ground;
- camera-consistent projection;
- invalid-coordinate rejection;
- off-range clamping and large-glyph clearance;
- threat- and density-driven corridor modes;
- unresolved objective identity;
- chart/radar legend parity;
- actual live-chart objective parity;
- remount-safe parity installation;
- visible-only chart overlay activity;
- native no-bloom rendering;
- retention of trails, lead prediction, spatial fallback, pings, and indexed contacts;
- direct all-screen pause ownership;
- future unknown-screen pause behavior;
- the 12 px type floor.

Recommended focused commands:

```bash
node --test test/tactical-map-second-generation.test.mjs
node --test test/j07-hud-contract.test.mjs test/unified-map-professional.test.mjs
node scripts/check-radar-perf.mjs
node scripts/check-type-floor.mjs
node test/time-effects.test.mjs
npm run check:galaxy-map-inspector
npm run check:ui-a11y
```

## 12. Further polish backlog

1. **Instrument glanceability.** Measure time-to-identify self, objective, nearest hostile, nearest dock, and radar range at common resolutions and UI scales.
2. **Add explicit radar ranges.** Short, Tactical, and Survey should be stable user-selected modes with a visible transition receipt.
3. **Task-based chart presets.** Navigate, Fight, Trade, Explore, and Claims should activate coherent layer groups rather than expose a switchboard.
4. **Sensor confidence.** Encode live, remembered, stale, inferred, rumored, and unknown contacts through fill, dash, and uncertainty envelopes.
5. **Selected-contact labels in expanded mode.** Reuse the chart's deterministic collision-aware label placement for objective, dock, gate, capital, and selected marks.
6. **Route semantics.** Add braking envelope, ETA confidence, route danger, fuel margin, and alternate route comparison while keeping the radar on the next actionable leg.
7. **Optional shallow depth.** Prototype an oblique paused-only lens with altitude stems and one-command snap back to canonical top-down.
8. **Accessibility controls.** Add symbol scale, line weight, high-contrast ground, persistent legend, and motion-off settings without changing simulation.
9. **Nonvisual bearing cues.** Test a sparse stereo tick or controller pulse for off-screen objectives, gated by angular error and distance.
10. **Visual regression corpus.** Capture empty flight, dense mining, swarm combat, station approach, off-range route, unresolved route, expanded radar, and every colour-vision mode.
