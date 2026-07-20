# LANE H — SCENERY BREADTH PACK (deterministic bpy prop generators)

Read `briefs/common.md` first and obey it. Then read:
`repetition-audit.md` (field-prop findings: lane_beacon/gate_ring/billboard/nav_buoy/mining_drone
are the repeated-field offenders), `design/foundry/FACTION_SURFACE_LANGUAGE.md` (construction
languages), `tools/foundry/kitgen/kitgen.py` (REUSE its builders + its exact `KitMat_*` material
helper so material names match), and `assets/QUEUE.md` (the claim-prop family this pack also
feeds).

## Mission

A compact family of reusable environmental props, each with meaningful construction, at least
one built-in variation strategy, and materially distinct functional zones (structure vs
machinery vs paint vs emissive). NOT eight recolors of one primitive. These read at long
range: silhouette first, kit detail second.

Scripts in `tools/foundry/scenerygen/` (kitgen idiom: builders + `export_scenery.py` headless
entry + `check_scenery.py` TDD gate), outputs
`assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_<name>_v<NN>.glb` +
`scenery_manifest.json`.

| family | variants | construction intent |
|---|---|---|
| lane_beacon | 3 | tower beacon (clean SCN-style trussed mast, frame-line emissive) / industrial strobe spar (DMC: guyed spar, rivet plates, sodium lamps) / scavenged beacon (Reach: mismatched segments, welded collar splices, jittery lamp) |
| gate_ring | 3 | concord ring (machined segments, recessed fasteners, disciplined emissive ring) / truss gate (open lattice chords + gussets + pipe runs) / scavenged hoop (mixed salvage arcs, standoff clamps, weld ropes) |
| nav_buoy | 2 | standard sphere-cage buoy with antenna crown / fringe drum buoy with hand-riveted bands + faded paint panels |
| container_stack | 3 | corporate locked stack (uniform, clamped, seal frames) / port mixed stack (sizes staggered, ratchet straps, one dented) / scavenge stack (cut-open container, spill frame, patch plates) |
| claim_hopper | 2 | ore hopper: riveted funnel + grate + feed pipe / worn version with patch + dust zone |
| claim_battery_mast | 2 | power mast: cell rack + cooling fins + conduit / weathered with replaced mismatched cell |
| claim_sensor_dish | 2 | dish + counterweight boom + service ladder / folded-transit variant |
| wreck_fragment | 3 | hull rib section with torn plating / scorched engine block fragment / tagged (graffiti decal zone) spar cluster |

## Rules (check-enforced, kitgen pattern)

- Deterministic seeded builders `build_<family>(variant, seed)`; two runs → identical hashes.
- Tri budgets: ≤3000 per prop hard (QUEUE prop alarm); target ≤1800. gate_ring may reach 4500.
- Materials: ONLY kitgen's `KitMat_Steel/Paint/Rubber/Emissive` (import its helper — identical
  names/values) — zone assignment must be meaningful (structure=Steel, painted panels=Paint,
  seals/wear strips=Rubber, lamps/strips=Emissive).
- Transforms applied; origin at functional anchor (beacon/mast base, buoy center, ring center,
  stack bottom); +X forward where a prop has a facing; semantic names `SCN_<FAMILY>_V<NN>_<part>`
  — no `Cube.001`.
- UVs present (Smart UV Project ok). No cameras/lights/empties except one `SOCKET_Top` empty on
  beacon/mast tips (for future light/effect mounting) and `SOCKET_Dock` on gate rings.
- Silhouette-first: at 64 px each variant of a family must be tellable-apart by outline alone —
  proxy check: variant pairwise bbox aspect OR projected-outline area must differ ≥12%, AND
  each variant adds/moves at least one ≥0.25×bbox feature (mast angle, hoop break, stack step).
- Wear goes in geometry (patches, splices, dents as real meshes) — paint stays neutral for
  runtime tinting; no baked hue.

`check_scenery.py` headless: rebuilds everything twice, asserts all rules, exits 0 printing
`SCENERY_CHECK_OK`, writes manifest with per-prop tris/dims/materials/sha256.

Finish per common protocol (report: `reports/H-SCENERY-REPORT.md`). Done only when the check
is green and all 20 GLBs + manifest exist.
