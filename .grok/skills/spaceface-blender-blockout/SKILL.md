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
4. Review fully framed front/side/top and three-quarter clay views plus the real game-camera view.
5. Repair material defects and repeat review while the form is still weak. There is no required pass,
   deficiency, modifier, or technique count.
6. Validate transforms, scale, normals, hull-body presence, metadata, sockets/interfaces, and export.

## Evidence

- before/after clay or neutral-lit views with matching framing;
- current player-camera silhouette/context view;
- short notes connecting each substantial modeling decision to a visible or functional problem;
- exporter and asset-specific check output.

Proceed to surfacing when surface response is now the largest meaningful gap. Do not add arbitrary
geometry merely to demonstrate advanced Blender use.
