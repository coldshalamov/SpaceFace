# Cycle 78 material-truth preflight (PQ-131.01 rover)

Tier B hero. Supported cameras: works_top, works_edge, works_site.
Working scene: `tools/blender/build_works_rover_mtx.py`. Live route still `makeRover` until KEEP.

Cycle 77 REVISE×3. Steel lip ring is gone. The well is an open cavity from the edge camera, still a black rectangle from the top, and the load spine still dies into the dark boom arm from above.

Fiction: the boom is a boxed chevron arm with a separate mill-scale load spine on top, pinned into a scarred bit housing with a bright cutter. A spine that sits in the arm's silhouette is just paint. It has to stand off the arm so the top camera sees a bright line on a dark beam.

Bill this cycle: raise and fatten `BoomSpine` only (`radius` 0.016 → 0.022, start `pz+0.18` → `pz+0.26`, end `pz+0.14` → `pz+0.20`). Do not put BoomTop back. Do not thin the arm. Do not put the steel lip ring back. Do not steel the well walls. Do not retune the visor. HullCore stays steel. Bit shank stays scar, cutter stays steel.

`componentReferenceDecision`: `not_needed`.
Frozen identity: envelope 1.87 × 1.76 × 0.99 wu ±5%, 13 hooks, yellow as minority safety paint.
G0–G7: hash-bound `evidence/cycle_078/`. Do not promote. Hitch frozen.
