---
name: spaceface-blender-blockout
description: >
  Focused SpaceFace Blender pass for silhouette, proportion, construction logic, topology, and
  game-camera readability. Use when form is the asset's material weakness.
---

# SpaceFace Blender — Form and Construction Pass

## Scope

Use this focused pass when inspection shows that the asset's silhouette, proportion, construction,
topology, or role readability needs work. It is not automatically required before every surface edit,
and it does not create ownership beyond the task and current live lock.

## Desired outcome

- The role and orientation read at the real gameplay camera.
- Macro masses, load paths, access points, engines/weapons/docks, and negative space form a plausible,
  intentional construction rather than random primitives or floating decoration.
- Secondary forms reinforce the design without destroying the silhouette.
- Curvature, bevels, normals, topology, transforms, and scale support clean shading and export.
- Detail density follows visibility and function rather than a universal greeble recipe.

## Workflow

1. Inspect the exact current source, normal-route presentation, and any relevant references.
2. Name the few form defects that most weaken the player-facing result.
3. Choose the most direct techniques for those defects. Modifier stacks, booleans, support geometry,
   sculpting, instances, geometry nodes, retopology, or simple direct modeling are all optional tools.
   When primitive stacking is the defect, rebuild the camera-prominent mass as a manufactured skin:
   define a small set of cross-sections, vary width/height/chamfer or squareness along the axis, bridge
   the rings, and use deliberate shoulders or parallel runs instead of one featureless taper.
4. Cut meaningful depth into that skin. Form panel bays, trenches, keel/service channels, apertures,
   and hangars by inset/recess or an equivalent clean boolean/direct-modeling operation. A shallow
   decal can remain a decal; a cavity that explains structure, access, cooling, payload, or thrust
   must have walls, thickness, a rim, and an interior.
5. Zone detail into macro, construction, and fine scales. Preserve clean plate between zones so the
   eye can read both the primary form and the detail. Size fine work from supported screen space and
   function, not a universal greeble ratio.
6. Review fully framed front/side/top and three-quarter clay views plus the real game-camera view.
   Derive diagnostic camera distance from the evaluated visible-geometry bounds so close views cannot
   silently begin inside the asset.
7. Repair material defects and repeat review while the form is still weak. There is no required pass,
   deficiency, modifier, or technique count.
8. Validate transforms, scale, normals, hull-body presence, metadata, sockets/interfaces, and export.

## Manufactured-skin safeguards

- Use stepped loft sections when they improve an existing hull or component; do not replace a sound
  asset merely to demonstrate lofting.
- Keep cross-section changes explainable as pressure shell, rolled plate, frame station, shoulder,
  armor transition, or service break. A smooth procedural taper with no construction logic is still
  generic.
- Prefer integrated inset/recess geometry over rows of boxes glued to the surface. Keep separate
  objects where the fiction actually calls for removable equipment, brackets, doors, lines, or
  replaceable armor.
- Inspect object and parent transforms before beveling. Apply non-uniform mesh scale only when that
  preserves dimensions, pivots, parents, sockets, collision, and shared-data intent; otherwise
  compensate deliberately. Review bevel width again in world and screen space.
- Record the intended flat/hard/smooth-by-angle policy by component. “Flat shade everything” and
  “smooth everything” are both invalid global substitutes for manufactured edge design.

## Evidence

- before/after clay or neutral-lit views with matching framing;
- current player-camera silhouette/context view;
- short notes connecting each substantial modeling decision to a visible or functional problem;
- exporter and asset-specific check output.

Proceed to surfacing when surface response is now the largest meaningful gap. Do not add arbitrary
geometry merely to demonstrate advanced Blender use.
