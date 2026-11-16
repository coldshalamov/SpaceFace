# Ceres wreck batch — 2026-11-16

Current isolated renderer pass: `place` and `inspect` views in
`.devshots/fleet/graphics-overhaul-asset-review-current/ceres-wrecks-20261116/`. This is not an
ordinary assembled-site or animation/LOD-selection check.

| Model | Current visual finding | Practical construction finding | Required follow-up |
| --- | --- | --- | --- |
| `place_ceres_bait_wreck` | The cylindrical hull, ring frame and small amber/red signals give a readable silhouette, but in isolation it can read as an intact capsule more readily than a bait wreck. | Three LODs; release uses six texture images. Three sockets, collision hull and per-LOD dynamic nav-port groups must remain. | View at its Kettle Line site and judge wreck damage language without removing functional signal hooks. |
| `place_ceres_second_measure_crossbeam` | A restrained blue-grey truss with orange repair marks; isolated it is a functional support, not a complete story object. | Three LODs; four Cut/Recovery/Tow sockets; 5 current isolated target draws. | Inspect fitted to the main site and its live LOD choice before changing its narrow construction. |
| `place_ceres_second_measure_keel` | The thicker hull channel has the strongest volume and panel breakup of the three movable components. | Three LODs; four Cut/Recovery/Tow sockets; 5 current isolated target draws. | Inspect fitted to the main site and its live LOD choice. |
| `place_ceres_second_measure_long_plate` | Its brace/truss profile is visually close to the crossbeam, which is appropriate only if their assembled role separates them. | Three LODs; four Cut/Recovery/Tow sockets; 5 current isolated target draws. | Verify installed silhouette and role distinction before treating the apparent similarity as a material or geometry defect. |
| `place_ceres_second_measure` | The root view shows three spaced yard structures, which may be deliberate site assembly rather than disconnected geometry. | Three LODs; seven attachment sockets. Collision and cuttable payload ownership is in `ceresShipbreak.js`, not the package. The root package has no embedded collision hull. | Inspect the actual Ceres shipbreak composition and state transitions; preserve sockets, the five shell collision boxes and three cuttable payloads. |

No safe mesh/material reduction is established by this pass. The root's all-LOD triangle total and
package size are not evidence of per-frame waste, and no frame-time claim is made.
