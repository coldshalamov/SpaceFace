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
counts, deficiency counts, triangle counts, and self-scores have no acceptance weight by themselves.

## Canonical craft and acceptance authority

Read `docs/visual-assets/README.md` first for substantive authored-asset work. It routes to:

- `00_VISUAL_ASSET_CONSTITUTION.md` — states, tiers, severity, non-negotiables;
- `01_REFERENCE_AND_DESIGN.md` — brief, references, silhouette, industrial story;
- `02_HARD_SURFACE_MODELING.md` — form, intersections, edge language, topology;
- `03_UV_BAKING_AND_TEXTURES.md` — UV, density, cage, tangent and maps;
- `04_MATERIAL_REALISM.md` — physical surface stacks and causal wear;
- `05_LOD_OPTIMIZATION_AND_WEBGL_BUDGETS.md` — screen-space LOD and measured whole cost;
- `06_VFX_LIGHTING_AND_PRESENTATION.md` — effects and diagnostic presentation;
- `07_ACCEPTANCE_GATES.md` — G0–G7 proof and definition of done;
- `08_AGENT_EXECUTION_PROTOCOL.md` — defect-driven loop and completion law;
- `10_TECHNIQUE_CATALOG.md` — defect-to-method lookup, never a quota.

The current design/program plan owns scope and order. Exact manifests/runtime maps own identity and
reachability. The visual-asset suite owns craft and acceptance semantics.

## Read only what the task needs

1. Root and nearest `AGENTS.md`, including `assets/AGENTS.md` and `assets/ships/AGENTS.md`.
2. Current asset-specific manifest/classification record and any live lock.
3. `tools/blender/spaceface_export.py` and the relevant release/check command.
4. `design/spec3/SPEC3-F9-asset-pipeline.md` for the live asset contract.
5. The task's brief, concept, role, faction, and normal-route references.
6. The constitution, acceptance gates, execution protocol, and only the craft documents relevant to
   the earliest failed gate.
7. A focused pass skill below when it materially helps:
   - `../spaceface-blender-blockout/SKILL.md` — form and construction;
   - `../spaceface-blender-hardsurface/SKILL.md` — materials and surface response;
   - `../spaceface-blender-surface-pass/SKILL.md` — articulation, sockets, and final life.

Do not infer current routing or readiness from old queue prose. Verify the exact asset ID against the
live manifest, runtime map, exporter, candidate hash, and fresh normal-route capture.

## Production state law

Use only these states:

`blockout` → `design_candidate` → `production_model` → `bake_candidate` →
`surfaced_candidate` → `integration_candidate` → `accepted`.

`blocked` and `deprecated` are terminal classifications outside that progression. `done`, `finished`,
`production-ready`, and `shippable` are reserved for `accepted`.

A technical build/export check may prove `technicalContractOk`. It cannot set `accepted`. Tier A/B
assets require independent G7 review against the exact candidate hash.

## Outcome-driven workflow

1. **Inspect current truth.** Record source/release/runtime paths, exact IDs and hashes, collections,
   transforms, topology, UVs, materials/maps, metadata, sockets, LODs, exporter result, active locks,
   representative cost, and current in-game presentation. Preserve matched baseline views.
2. **Create the brief.** State tier, gameplay role, intended silhouette/identity, supported camera and
   projected-size envelope, interaction needs, family language, construction/material story, target
   scene, exclusions, and provisional cost hypothesis.
3. **Find the earliest failed gate.** Repair role/form before surfacing; production geometry before
   final UV/bakes; bake integrity before mesh-aware materials; material before LOD/performance;
   integration before acceptance.
4. **Choose methods deliberately.** Use `docs/visual-assets/10_TECHNIQUE_CATALOG.md` as a menu. Select
   only methods that repair an observed defect or provide required runtime behavior. Simpler methods
   are correct when they produce the stronger result; advanced methods are correct when their value
   survives export and is visible in context.
5. **Author, export, compare.** Work in editable Blender source, export through the sanctioned path,
   render matched neutral/lit/adversarial views, run the actual player route, and keep/revise/revert
   based on evidence.
6. **Optimize without lowering the premise.** Prefer shared materials, instancing/batching, sensible
   topology, bakes, reuse, compression, and authored LOD/HLOD. Profile actual draw, memory, upload,
   transparency, scene, and frame impact. A generic triangle or texture ceiling is not measurement.
7. **Validate and integrate.** Prove the exact reviewed release hash is reachable with no fallback in
   required browser/Electron paths. Complete required wiring only when the task owns the seam.
8. **Request independent review.** Assemble the G7 packet after G0–G6 pass. Continue on rejection at
   the earliest implicated gate.

The loop has no arbitrary technique, pass, or iteration count. Continue while an applicable gate
fails or a P0/P1 defect remains. When work cannot proceed, record `blocked` with the exact dependency
and smallest action needed.

## Technique safeguards

Depending on the asset, useful methods can include modifier/boolean workflows, sculpted or modeled
high-poly sources, weighted normals, controlled bevels, direct game modeling, retopology,
UV/trim/decal workflows, baked normal/AO/curvature/ID/ORM, layered materials, Geometry Nodes for
genuine repeatable structure, texture painting, rigging, animation, sockets, shape keys, or
image-assisted masks. None is mandatory merely to demonstrate tool use.

Do not present these as final work:

- primitive stacking with one uniform bevel language;
- floating bars as a universal panel-cut substitute;
- automatic UVs without stretch/density/padding review;
- flat normal maps or generic tile noise as object-specific surfacing;
- fixed-ratio decimation without authored transition review;
- extra subdivision/triangles that do not improve silhouette, shading, deformation, or close form;
- Blender-only beauty renders without exact runtime proof.

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

Use the tier-appropriate packet in `docs/visual-assets/07_ACCEPTANCE_GATES.md`, including:

- exact source/export/release identity and exporter/validator result;
- representative fully framed form, bake, material, and useful detail views;
- a current normal-route in-game view at the real gameplay camera;
- relevant asset/reachability/visual-stability checks;
- LOD transition evidence;
- measured representative-scene performance when cost changed;
- an independent review for consequential player-facing assets.

A checklist or transcript cannot override a visibly weak, unreachable, invalid, unreviewed, or
needlessly costly result.
