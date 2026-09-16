# BREAKAWAY — art, instrument and sound direction

## 1. The visual decision

**Heavy machinery that becomes spectacular when a pilot abuses it.** Not a glowing loot crystal, a futuristic sports trophy or a clean hologram. The spindle should be recognizable from its caged cylindrical silhouette, unequal collars, machined rotor and raised service spine. The capture fork is a substantial receiving machine with an obvious mouth, not a luminous finish line.

The generated concept is an atmosphere and relationship reference: player / taut line / heavy load / struck raider / receiving infrastructure. It is not an orthographic drawing, a collision manifest or evidence of shipped game quality. Its camera, complexity and asteroid density are not instructions to overload the real scene.

The pinned repo has a newer UI authority: `design/frontend/direction/FIELD_HARDWARE_PROGRAM.md` (PQ-194). Its approved frames and common art direction outrank older packet screenshots. Preserve the real three-anchor HUD and Power Rail. The lab’s standalone load card demonstrates information priority; **do not install it as a fourth permanent game HUD anchor**. Bind the new read model into the established contextual EDGE surface.

## 2. What has been authored here

`sp07-spindle.glb` is an original modeled candidate: 3,780 triangles, six material primitives, 74,336 bytes. `capture-fork.glb` is 552 triangles, six material primitives, 13,324 bytes. Editable procedural source is `tools/build-assets.py`. Socket nodes, exact bounds, hashes and dimensions are in the manifest.

These are real GLB meshes, not images pretending to be game assets. They are nevertheless **candidates**, not production-approved masterpieces. The lab has rendered their actual triangles; live SpaceFace materials, lights, camera and asset pipeline still need review. Do not repeat the triangle counts embedded in the earlier recovered contact sheet: those refer to unrecovered work, not these models.

The packet also supplies original SVGs: an asymmetric broken-clasp emblem, a load glyph, a receiving-mouth glyph, an asset-first instrument plate and a scaled receiver geometry sheet. They can be edited without flattening the art into a screenshot. No font files are included.

## 3. Material hierarchy

The large forms use worn warm paint, graphite machinery and selected exposed metal. Copper is an energy-handling material and a secondary accent. Amber is for operating state and industrial legibility. The lifting lug and key physical corners must remain visible in silhouette. Avoid covering every surface with random greebles or luminous strips.

The untextured candidate materials are deliberately inexpensive and adequate for judging shape. For release, apply the existing material-truth process: coherent roughness differences, believable edge wear, normal detail only where it survives the camera, and no unexplained emissive paint. Recorded dirt should follow access, contact and heat, not uniform noise.

Do not add six distinct high-resolution texture sets just because there are six material colors. Reuse a compact atlas or existing approved material library where practical. Batching and texture decisions must be reviewed against measured draw-call and residency budgets, not guessed from triangles alone.

The fork’s big rails should have readable thickness at game scale. The small current mesh is a shape/placement foundation. It may require authored rail articulation, fastener groups, tool marks or localized texture detail to meet the shipping camera. Add those only where they improve the player’s understanding of capture or its manufactured weight.

## 4. Silhouette and camera tests

First test the spindle at the **ordinary combat/travel camera**, not only an orbiting asset viewer. A fresh reviewer should locate the load, its tow point and the receiver entrance without reading a paragraph. At thumbnail size, the load must not be mistaken for a tiny asteroid or an enemy ship.

The procedural origin is mechanically useful, not necessarily the center of its visual bounding box. Preserve the mouth socket as the placement authority when the renderer recenters a model. Overlay collision shapes during engineering validation, then turn all overlays off for the art verdict.

Camera behavior remains owned by the existing camera. Do not zoom out so far that the player disappears merely to show both load and station. A modest speed/load-aware framing request may be warranted, but it must preserve the feel contract and earned speed. Use an offscreen destination indicator when needed; do not place arrows over every body.

Review at default quality, 1280×720 and a supported high-resolution display, and at minimum and maximum accepted UI scale. The included 390×844 lab frame tests overlay overflow; it does not claim that the game’s mobile/touch route is implemented or supported.

## 5. The interface vocabulary

The permanent information is deliberately small: load identity, current condition, and one useful next action. The context should answer “what is this, what is happening, what can I do next?” without displaying internal FSM labels or receipt IDs.

| Physical condition | Player-facing language | Treatment |
|---|---|---|
| Free load | SP-07 / Assembly in transit | Neutral manufactured plate, no alarm |
| Player tethered | Load coupled | One clear attachment cue; ownership wording stays separate |
| Mouth acquisition | Rails have the assembly | Receiver lamps and one short cue |
| Braking | Arresting load | Localized rail energy, numeric approach information only if useful |
| Stable but not committed | Verifying custody | No credit celebration yet |
| Committed lawful | Assembly received | Existing receipt presentation plus visible local restart |
| Too fast | Approach at 100 WU/s or less | Meaning in words; not color alone |
| Left fork | Bring the assembly around again | Recoverable, no red mission-failed full-screen interruption |

The produced `instrument-plate.svg` has a substantial rim, a recessed window, fasteners, controlled surface variation and an asymmetric safety edge. In production it should be reconciled with the approved PQ-194 kit, not compete with it. Put dynamic labels in accessible HTML over the plate; do not rasterize changing values. The packet’s CSS positions and scales an asset rather than claiming a CSS border is finished physical hardware.

The smaller broken-clasp emblem is the feature’s shorthand, not a replacement for the game’s logo. Use the solid form for launcher-sized or tiny contextual uses; use the outlined mouth glyph only where line weights remain legible.

## 6. Effects: the cause remains visible

Acquisition should produce a short paired rail response, not an explosion. Braking should visibly consume motion: localized sparks, braking glow and a directionally meaningful response. The fixed rails—not a magical sphere around the load—are the source. While suspended or paused, the effect must stop consistently with simulation.

A load-to-raider impact has a hierarchy: the displaced hull, the load’s continuing motion, then fragments and a brief flash. Use existing physical-impact receipts and VFX ownership. Do not create a duplicate radial damage burst just because the event looks dramatic. A useful flash can be intense and short, but reduced-flash mode must retain its directional and state information.

Do not drive effects by world speed alone. A cargo body coasting quickly is not necessarily under strain. Tether load, contact impulse and receiver work are different sources and need different cues. For braking, `energyRemoved` is a bounded mechanical quantity available from the helper; use a compressed mapping rather than a linear light intensity that explodes at the upper range.

Debris: cosmetic fragments may be pooled and short-lived; the valuable payload or recovery rotor may not vanish under a cosmetic TTL. Keep important bodies and unimportant particles distinct in code and art.

## 7. Sound: heavy, informative, economical

The lab includes a minimal original Web Audio cue sketch. It is not the final sound library. The production audio owner should consume semantic events and use the established buses/voice arbiter. This packet does not include recorded WAVs or claim final audio acceptance.

| Cue | Direction | Bound / mix role |
|---|---|---|
| Transport clamp opens | Two dry mechanical clunks, a brief pressure release | One event, separated from a Massline cut |
| Massline latches | Existing line identity with a stronger body response | Do not replace or duplicate the universal latch cue |
| Heavy load releases | Short tension release plus receding metal resonance | No long tail that masks incoming threats |
| Fork acquires | Paired rail relay clicks, low mechanical engagement | One onset, not repeated every sample |
| Fork brakes | Rough descending energy bed tied to dissipated work | One bounded loop, shut down on exit/pause/destruction |
| Load settles | Three physical latches resolving into a firm end stop | Success anticipation, not paid-reward cue |
| Custody commits | Existing delivery confirmation, industrial restart | Receipt-driven, once |
| Capture refused | Dry relay refusal plus readable text | No punitive buzzer loop |

Maintain a threat-first mix. The raider’s attack cue outranks decorative machinery. Use one voice at a time. An assembly can sound heavy without adding continuous bass to every moment of the game. Tie loop start/stop to actual state transitions and prove cleanup on every exit path.

## 8. The four visual rejection conditions

Reject a candidate if the load reads as generic junk; if the fork’s visible opening and actual capture volume disagree; if the spectacular action hides which body moved and why; or if the new HUD looks like a separate web application over the existing cockpit-free interface.

A static contact sheet is not enough. Inspect the approach, acquisition, braking, departure, collision and committed-receiver states at the ordinary camera. Keep or revise each asset on that evidence, with the biggest silhouette/material defect fixed before adding tiny details.
