# Procedural machine construction notes — 2026-11-16

Preliminary source inspection only; individual visual and ordinary-route review remain pending. Source: `src/render/machineVisuals.js`. Geometry primitives use a module cache marked shared. No safe geometry removal is established by these counts alone.

| Machine | Construction / noteworthy behavior |
| --- | --- |
| witness | Hemisphere, iris and gimbal; 3 meshes. Inspect gimbal and dome in view. |
| shepherd | Cylinder hull, three vanes and field tip; 5 meshes. Vane geometry is shared; seam materials are separate. |
| executor | Dart, aft ring, eye and animated purge arm; 5 meshes. |
| courier | Faceted body and wake; 2 meshes. |
| conservator | Can, skirt and lamp; 3 meshes. |
| boundary_walker | Wedge and edge; 2 meshes. |
| appeals_clerk | Desk and slat; 2 meshes. |
| debris_sorter | Mouth, spine and eye; 3 meshes, working-state deploy and emissive cue. |

| Prop | Construction / noteworthy behavior |
| --- | --- |
| pylon | Tapered body, collar, cap; 3 meshes. |
| monolith | Slab and seam; 2 meshes. |
| spine | Transverse cylinder and three nodes; 4 meshes, node materials separate. |
| plate | Octagonal plate and etched ring; 2 meshes. |
| husk | Partial torus and core; 2 meshes. |
| vault | Flattened dark sphere and seam; 2 meshes. |
| gate_ring | Torus and four unlit markers; 5 meshes, marker materials separate. |
| marker | Needle and reference ring; 2 meshes; field-scale ring has 96 segments. |
| dock_arm | Arm, half-torus jaw and pin; 3 meshes. |
| gantry | Half-arch, axis and cradle; 3 meshes. |

These are construction observations, not visual passes or measurements of frame time. Preserve motion, state cues and the field-scale silhouette when evaluating possible reuse.
