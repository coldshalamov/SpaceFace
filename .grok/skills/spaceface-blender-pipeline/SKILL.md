---
name: spaceface-blender-pipeline
description: >
  SpaceFace Blender authoring and repair pipeline for ships, props, stations, and other authored
  GLBs. Use when a task explicitly requires Blender/source-asset work, export-contract repair, or
  player-route visual improvement. Techniques are selected from evidence, not quotas.
---

# SpaceFace Blender Pipeline

## Scope

This skill is an authoring workflow, not repository-wide policy. Invoking it does not activate a
historical graphics campaign, reserve unrelated files, or prevent the assigned agent from completing
required integration after ownership is coordinated. A live asset/release lock does reserve the
affected paths until its owner releases or hands them off.

The target is professional game art that works in the actual SpaceFace camera and runtime. Quality is
judged from form, role readability, material response, construction logic, motion where appropriate,
coherence with adjacent assets, and current player-route evidence. Named Blender techniques, pass
counts, deficiency counts, and self-scores have no acceptance weight.

## Read only what the task needs

1. `assets/AGENTS.md` and the current asset-specific manifest/classification record.
2. `tools/blender/spaceface_export.py` and the relevant release/check command.
3. `design/spec3/SPEC3-F9-asset-pipeline.md` for the live asset contract.
4. The task's concept, role, or faction references, if any.
5. One focused pass skill below when it materially helps:
   - `../spaceface-blender-blockout/SKILL.md` — form and construction;
   - `../spaceface-blender-hardsurface/SKILL.md` — materials and surface response;
   - `../spaceface-blender-surface-pass/SKILL.md` — articulation, sockets, and final life.

Do not infer current routing or readiness from old queue prose. Verify the exact asset ID against the
live manifest, runtime map, exporter, and normal-route capture.

## Outcome-driven workflow

1. **Inspect current truth.** Record source path, asset ID, collections, transforms, topology,
   materials/maps, metadata, sockets, LODs, exporter result, and in-game presentation. Preserve a
   useful before view.
2. **Define the visible job.** State the asset's gameplay role, intended silhouette/identity, camera
   distances, interaction needs, and the largest current defects.
3. **Choose methods deliberately.** Use `references/professional-techniques.md` as a menu. Select only
   techniques that repair an observed defect or provide required runtime behavior. Simpler methods
   are correct when they produce the stronger result; advanced methods are correct when their value
   survives export and is visible in context.
4. **Author and review.** Work in Blender, render fully framed neutral and lit views, and review at the
   real game camera. Make the highest-impact repairs. Repeat only while evidence exposes material
   defects; do not manufacture a quota of iterations or deficiencies.
5. **Optimize without lowering quality.** Prefer shared materials, batching-friendly roles, sensible
   topology, bakes, reuse, and appropriate LOD/HLOD. Profile actual memory/upload/frame impact. A
   generic triangle or texture ceiling is not a substitute for measurement.
6. **Validate and integrate.** Export through the sanctioned pipeline, run the asset-specific checks,
   and prove the authored result is reachable on the normal player route. Complete the required
   manifest/runtime wiring when the task owns it and no active writer holds that seam; otherwise make
   an explicit handoff to the current owner.

## Technique menu

Depending on the asset, useful methods can include modifier/boolean workflows, sculpted or modeled
high-poly sources, weighted normals, controlled bevels, UV/trim/decal workflows, baked normal/AO/ORM,
layered materials, geometry nodes for genuine repeatable variation, texture painting, rigging,
animation, sockets, shape keys, or image-assisted masks. None is mandatory merely to demonstrate tool
use. See `references/professional-techniques.md` for tradeoffs and failure modes.

## Non-negotiable safeguards

- Respect `assets/ships/release.__lock/`, `release.__building/`, authoring locks, and an active
  graphics owner. Never delete or impersonate another session's lock.
- Preserve provenance and licenses for external/generated inputs.
- Do not hand-edit generated release assets or weaken exporter/check assertions to ship a candidate.
- Never use destructive Git commands against the shared working tree.
- Do not replace detailed authored visuals with primitives or lower runtime quality to hide a
  performance problem.
- Image generation may support concepts, trim sheets, decals, or masks; it does not prove a valid 3D
  asset or replace asset-specific bakes and runtime validation.

## Acceptance evidence

- exact source/candidate identity and exporter result;
- representative fully framed form/material views, plus useful detail views;
- a current normal-route in-game view at the real gameplay camera;
- relevant asset/reachability/visual-stability checks;
- measured performance evidence when cost changed materially;
- an independent review for consequential player-facing assets.

A checklist or transcript cannot override a visibly weak, unreachable, invalid, or needlessly costly
result.
