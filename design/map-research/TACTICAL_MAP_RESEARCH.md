# Tactical Map Research

Companion evidence and design-rule ledger for [`../TACTICAL_MAP_SECOND_GENERATION.md`](../TACTICAL_MAP_SECOND_GENERATION.md).

## 3. Research findings translated into design rules

### 3.1 General cartography and visual perception

- **Colour cannot carry identity alone.** W3C Success Criterion 1.4.1 requires another visual channel when colour communicates meaning. For maps, the practical answer is shape, enclosure, fill state, direction, line pattern, and text—not merely a second palette.
- **Critical graphical marks need non-text contrast.** W3C Technique G207 gives 3:1 as the relevant contrast target for icons required to understand content. The shared grammar includes executable contrast tests against the radar ground.
- **Hierarchy is more important than inventory.** The eye should meet self, objective, selected threat, threats, navigational anchors, and ambient mass in that order. A radar where every contact glows is a radar with no hierarchy.
- **Labels are a scarce resource.** Permanent labels belong only to the player, current objective, critical selection, and explicit range. Everything else should remain glyph-first until expanded, selected, or inspected.
- **Edge clipping is a navigation feature.** An off-range mark should preserve bearing and class at the rim rather than vanish or be squeezed into the visible field.
- **Scale must be legible.** A map without an explicit range invites false distance judgments. Compact mode shows the range plate continuously; expanded mode doubles range and identifies itself.

### 3.2 2D versus 3D

Eye-tracking research consistently makes the distinction task-dependent:

- 2D maps support faster scanning, lower cognitive load, and efficient general orientation.
- 3D can improve detailed understanding at difficult spatial decision points, but it costs longer fixations, more directed attention, and can introduce occlusion or information overload.
- Hybrid systems are strongest when 2D remains the stable overview and depth is invoked for a specific spatial question.

This directly rejects a continuously rotating 3D globe as the compact radar. It also rejects mandatory perspective on the full chart. The rational future experiment is an **optional shallow-depth command-map lens**, available only while paused, preserving a one-key return to the canonical top-down frame.

### 3.3 Space-game precedents

Useful patterns recur across successful space-game navigation systems:

- **EVE Online:** sensor overlay provides an overview and general direction, then filters reduce displayed categories; the star map becomes a manipulation and search workspace. Route planning can incorporate avoidance and risk preferences. Lesson: immediate bearing and strategic filtering are separate layers.
- **Elite Dangerous:** galaxy-map route planning, mission destinations, filters, bookmarks, and system data turn the map into a planning tool rather than a decorative atlas. Lesson: the waypoint is a stateful route object with context, not merely a colored pin.
- **Starsector-style sensor maps:** sparse marks, strong territory/hostility distinctions, and explicit sensor range make the map valuable beyond the camera viewport. Lesson: uncertainty and detection state can become gameplay, but only after the base grammar is readable.

The shared conclusion is simple: the compact view is for **bearing and threat triage**; the full view is for **filtering, inference, and route choice**.

---

## 4. Applicable feature inventory

These are the features that materially improve SpaceFace rather than merely making the map busier.

| Feature | Compact radar | Full chart | Reason |
|---|---:|---:|---|
| Dominant self marker | Required | Required | Removes the most basic orientation failure |
| Shape-coded contacts | Required | Required | Identity survives colour loss and bloom |
| Explicit range | Required | Required | Prevents scale ambiguity |
| Off-range bearing marks | Required | Required | Makes the map useful beyond the camera |
| Objective route corridor | Adaptive | Full | Turns waypoint into a navigational relation |
| Density-aware declutter | Required | Required | Protects hierarchy in swarms/dense systems |
| Selection/target tether | Required | Required | Clarifies which contact owns the inspector/action |
| Shared symbol grammar | Required | Required | Eliminates relearning between screens |
| Filters/layer presets | Minimal | Required | Strategic questions differ by task |
| Confidence/age/uncertainty | Selected only | Required | Enables exploration and sensor gameplay |
| Alternative routes/risk | No | Required | Strategic planning, not combat telemetry |
| Labels | Self/objective/range | Collision-managed | Text budget differs sharply by surface |
| 3D depth | No | Optional | Useful only for specific spatial judgments |
| Simulation pause | No | Required | Planning screen must not conceal live danger |
| Main-world render pause | N/A | Recommended for 3D | Prevents paying twice for a paused view |

---


## 11. References considered

- W3C, WCAG “Use of Color” (SC 1.4.1).
- W3C, Technique G207, 3:1 contrast for required graphical icons.
- Guo, Yang, Wang, and Fang, *Effects of Spatial Reference Frames, Map Dimensionality, and Navigation Modes on Spatial Orientation Efficiency* (2023).
- Liao, Dong, Peng, and Liu, *Exploring differences of visual attention in pedestrian navigation when using 2D maps and 3D geo-browsers* (2017).
- Lei, Wu, Chao, and Lee, *Evaluating differences in spatial visual attention in wayfinding strategy when using 2D and 3D electronic maps* (GeoJournal, 2016; DOI 10.1007/s10708-014-9605-3).
- EVE Online official support documentation for the Sensor Overlay, Probe Scanner filtering, star-map probe manipulation, and route-avoidance behavior.
- Elite Dangerous map/navigation documentation and update notes concerning filters, mission destinations, route plotting, bookmarks, and map icon fidelity.
- Existing SpaceFace `MAP_OVERHAUL_BRIEF.md`, `MAP_UX_PLAN.md`, unified map tests, radar performance probe, J07 HUD contracts, and screen-manager pause authority.
