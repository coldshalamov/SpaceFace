# MTS tender: released-model detail review

![Offline released MTS LOD0 detail sheet](mts-tender-detail-review.jpg)

## Inspected asset

The existing released `assets/ships/release/parts/wholeships/helios_span_mts.glb` is unchanged between public base `3095a835eb3dbda178d359bbb0541e3ee6124f4c` and inspected master `47be172e0736cb3e32925a550807c684a155ef82`: Git blob `9b89bbe29d3c5988c9a13674deec9b3687c05137`, 1,177,488 bytes, SHA-256 `171d0120501fd1762f0eba7b1a72160b4057061d7a62fbf705e929c32c3bc6df`. Relevant parts-library and enemy definitions also match those references.

The LOD0 sheet shows six cargo modules, four repeated crossframes, an exposed spine, rounded cockpit and vented aft unit. Existing seams and fittings supply the industrial construction detail. These views do not justify geometry edits; source geometry was not changed and no new model is counted.

## Rendering and fit

Nineteen visible LOD0 primitives contain 34,277 triangles. The asset has seventeen materials and six embedded KTX2 maps covering panel/machinery albedo, normal and ORM channels. This CPU preview uses interpolated normals and material color factors only: those maps, PBR, shadows, motion rig and VFX are not rendered. Their absence from the sheet is not evidence of a missing or defective asset.

Top-down, forward detail and rear-quarter views retain source-axis coordinates. The inspected fit is `1.72 × 18 / 29.2214 ≈ 1.059497655`; preview coordinates remain source units. Existing motion/engine/cargo/utility/navigation/VFX sockets are retained but static.

## Qualification

This is an offline review of actual released geometry, not a game-camera capture, material/PBR review, physics or performance test, or full visual acceptance. Bounded textured-render feasibility is being investigated separately and is not yet implemented here. No game source, model, placement or runtime behavior changed.

Image: 57,367 bytes, SHA-256 `4384904983514a28eaaa2c877db07adb9a1134c49714998f94afc0ad972a6580`.
