# Cargo port cycle 04 — material and shape audit

Root `SF_WORKS_CARGO_PORT_V1`. Launch axis Blender +Z through the well.

Footprint 2.142 x 1.581 wu (0.973 x 0.719 cells), zMin 0.0.

Cycle 03 defect: round dock/portal on a pad of boxes. The C-clamp, keyed
cut, pod face, and five freight types did not separate at ~120 px/cell;
at ~19 px/cell the cell was one brown stamp.
Cycle 04 replacement: D+key docking opening with wall thickness that survives
at 120 px; one open C-clamp whose arms are the apron lip; five distinct crate
planforms (bar, cube+X, long case, hollow frame, L); darker port, warmer
freight, dark pod well with no cool disc or green lamp. Horseshoe flange, +X
throat, five-stage crate contract, +Z launch, hooks, envelope, LOD identity,
and Cycle 01-03 evidence stay frozen.

Visible zones billed: flange, liner, loading cheeks, jack pads, guides, apron,
C-clamp cradle, crate family, pod shell, keyed docking well, aft thruster.
allSupportedViewZonesClassified remains false until independent review.

LOD0 port 6644 / pod 1230 / crates 1404 972 972 1080 756.

LOD1 port 672 / pod 268 / crates 924 204 300 600 276.

LOD2 port 580 / pod 184 / crates 60 96 84 60 60.

Validation errors: none.

G3 is blocked: the authored atlas remains provisional until exact-mesh high/cage
normal, AO, curvature, and cavity bakes exist.

G1/G2/G4 whole-asset remain open. Cycle 04 is evidence_ready only.
Cycle 01 evidence under evidence/cycle_001 is frozen.
Cycle 02 evidence under evidence/cycle_002 is frozen.
Cycle 03 evidence under evidence/cycle_003 is frozen.
