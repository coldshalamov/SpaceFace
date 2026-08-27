# Cargo port cycle 02 — material and shape audit

Root `SF_WORKS_CARGO_PORT_V1`. Launch axis Blender +Z through the well.

Footprint 2.088 x 1.580 wu (0.949 x 0.718 cells), zMin 0.0.

Cycle 01 defect: concentric shrine collar/pod, equal cube jack pads, 2x2 cube freight.
Cycle 02 replacement: folded octagonal flange with +X loading throat, one asymmetric
C-cradle with saddle, clamp jaws, and a folded C-channel load beam; three folded
hat-section jack pads; five unique
freight footprints (trunk/cube/instrument/frame/vented), faceted pressure shell with
rectangular keyed docking face. Dark liner crescent remains around the seated pod.

Visible zones billed: flange, liner, loading cheeks, jack pads, guides, apron,
cradle saddle/jaws/beam, crate family, pod shell, docking face, aft thruster.
allSupportedViewZonesClassified remains false until independent review.

LOD0 port 7176 / pod 2430 / crates 1404 1188 1404 1188 1188.

LOD1 port 824 / pod 574 / crates 924 612 912 996 684.

LOD2 port 592 / pod 274 / crates 60 72 48 24 36.

Validation errors: none.

G3 is blocked: the authored atlas remains provisional until exact-mesh high/cage
normal, AO, curvature, and cavity bakes exist.

G1/G2/G4 whole-asset remain open. Cycle 02 is evidence_ready only.
Cycle 01 evidence under evidence/cycle_001 is frozen.
