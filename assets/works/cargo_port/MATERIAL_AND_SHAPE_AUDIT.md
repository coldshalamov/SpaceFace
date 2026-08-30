# Cargo port cycle 03 — material and shape audit

Root `SF_WORKS_CARGO_PORT_V1`. Launch axis Blender +Z through the well.

Footprint 2.088 x 1.580 wu (0.949 x 0.718 cells), zMin 0.0.

Cycle 02 defect: bright plate stacked on a filled/capped oval docking face;
cradle read as boxes attached to a capped loft.
Cycle 03 replacement: keyed docking well cut through the pod cap with physical
wall thickness and a dark floor; one manufactured open C-clamp whose arms flow
onto the +X apron lip. Horseshoe flange, +X throat, five additive crate
footprints, +Z launch states, hooks, and Cycle 01/02 evidence stay frozen.

Visible zones billed: flange, liner, loading cheeks, jack pads, guides, apron,
C-clamp cradle, crate family, pod shell, keyed docking well, aft thruster.
allSupportedViewZonesClassified remains false until independent review.

LOD0 port 6624 / pod 1462 / crates 1404 1188 1404 1188 1188.

LOD1 port 692 / pod 268 / crates 924 612 912 996 684.

LOD2 port 572 / pod 174 / crates 60 72 48 24 36.

Validation errors: none.

G3 is blocked: the authored atlas remains provisional until exact-mesh high/cage
normal, AO, curvature, and cavity bakes exist.

G1/G2/G4 whole-asset remain open. Cycle 03 is evidence_ready only.
Cycle 01 evidence under evidence/cycle_001 is frozen.
Cycle 02 evidence under evidence/cycle_002 is frozen.
