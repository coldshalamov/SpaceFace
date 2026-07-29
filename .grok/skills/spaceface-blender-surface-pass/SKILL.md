---
name: spaceface-blender-surface-pass
description: >
  Focused SpaceFace Blender pass for articulation, animation, sockets, secondary motion, damage/state
  variants, and final integration polish. Use only when the asset's role benefits from those systems.
---

# SpaceFace Blender — Life and Integration Pass

Read `docs/visual-assets/README.md` and
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` first. This pass cannot grant acceptance or
hide an unresolved material-truth G1–G4 failure; load
`../spaceface-blender-material-truth/SKILL.md` when that defect class is present.

## Scope

Use this pass when motion, state change, attachment behavior, or integration polish materially improves
the asset's gameplay role. Rigging, shape keys, animated greebles, and extra geometry are not universal
quality requirements. Static assets and distant props should remain static when motion adds no value.

## Desired outcome

- Thrusters, weapons, hatches, docking interfaces, damage states, and sockets align with runtime behavior.
- Any articulation has a clear gameplay/presentation purpose, stable pivots, sensible ranges, and an
  export/runtime path that actually consumes it.
- Secondary detail supports hierarchy and scale without creating clutter or invisible cost.
- Final source organization, names, transforms, metadata, and attachment points are coherent.

## Workflow

1. Inspect runtime consumers and current player-route behavior before authoring animation or sockets.
2. Name the integration or life defects that are visible or functionally missing.
3. Choose the smallest robust solution: corrected pivots/sockets, authored state meshes, bones/actions,
   shape keys, emissive/state variants, or no animation when runtime motion already supplies the effect.
4. Review relevant states in motion and at the real camera. Repair actual defects; no technique or
   iteration quota applies.
5. Export, validate, integrate when ownership permits, and verify the normal game route.

## Evidence

- clips or state captures showing the relevant behavior;
- socket/pivot/action inspection where applicable;
- exporter and runtime-consumer checks;
- current player-route proof and independent review for prominent assets.

Do not add motion merely to make a checklist look complete.
