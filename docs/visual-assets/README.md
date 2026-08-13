# SpaceFace Visual Asset Production Standard

This directory is the front door for every player-facing graphics task. It routes each visual class
to one compatible quality contract so an agent cannot bypass professional craft by entering through
a dated sprint prompt, an old automation script, or a runtime folder.

| Visual work | Mandatory route |
|---|---|
| Blender/glTF/GLB ship, station, place, prop, or VFX-support geometry | `VISUAL_ASSET_PRODUCTION_STANDARD.md`, then `.grok/skills/spaceface-blender-material-truth/SKILL.md` and `ADVANCED_MODEL_TECHNIQUE_CONTRACT.md` for every form or surfacing change. When the activated packet cites `MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md` (including PQ-050), its full-job cycles, still reviews, and cleanup are mandatory. Tier C/D may group a repeated manufactured family |
| Portrait/contact art | `assets/portraits/AGENTS.md` and its canonical character/capture direction |
| Concept or generated construction/material reference | `assets/concept/AGENTS.md`; component handoff contract in `AGENT_PROMPTS.md` § E |
| Cinematic, key art, runtime VFX, compositor, or presentation imagery | `design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md`, then the owning `src/render/AGENTS.md`, `src/ui/AGENTS.md`, or asset registry |
| Repository-wide inventory/prioritization | `design/graphics-sprints/VISUAL_ASSET_CATALOG.md` plus live manifests/runtime maps |

Across every class:

- begin with the fictional identity, player-facing role, supported camera/crop, and exact runtime
  owner rather than a software preset or generic genre treatment;
- preserve provenance and editable source, and distinguish reference, candidate, evidence, release,
  and live runtime assets;
- judge the exact output in its real context and size; technical validity never grants visual
  acceptance;
- if a selected image-generation method is unavailable to the assigned worker, use the bounded
  Codex terminal handoff in `AGENT_PROMPTS.md` § E or record
  `blocked:image-generation-capability`; do not silently lower the brief.

For substantive Blender asset work, read the production standard first, then load only the
task-relevant routed material:

1. `VISUAL_ASSET_PRODUCTION_STANDARD.md` - always required: states, craft outcomes, G0-G7 gates,
   budgets, and execution.
2. `.grok/skills/spaceface-blender-material-truth/SKILL.md` - required for every Blender/GLB form or
   surfacing change, including new assets and remasters; it contains the proportional
   fiction/material preflight and anti-toy workflow.
3. `SPACEFACE_MIGRATION.md` - only for repository-wide audit or migration work.
4. `AGENT_PROMPTS.md` - only when dispatching one-asset, family, image-generation, or independent
   review work.
5. `TEMPLATES.md` - only when creating the corresponding brief, performance, review, or acceptance
   record.

The central rule:

> A valid GLB is not accepted art. An asset is finished only when its form, construction, UV/bake,
> material response, LOD/cost, exact runtime presentation, and required independent review pass.

Canonical production states:

`blockout` -> `design_candidate` -> `production_model` -> `bake_candidate` ->
`surfaced_candidate` -> `integration_candidate` -> `accepted`.

`blocked` and `deprecated` are explicit non-acceptance states. `done`, `finished`,
`production-ready`, and `shippable` mean `accepted` only.

There is no universal triangle ceiling, texture size, material count, bevel recipe, or percentage of
techniques to use. Budget the complete measured runtime cost at supported camera sizes and
representative scene density. Select techniques from visible defects, not fashion.

Focused Blender skills are technique routers, not alternate quality bars. They must cite this
directory, preserve the same production states and G0-G7 evidence semantics, and stop at
`blocked`/candidate state when exact runtime or independent proof is unavailable.

Legacy skill identifiers are descriptive routes, not literal pass names:
`spaceface-blender-hardsurface` owns material/surfacing defects, while
`spaceface-blender-surface-pass` owns life, state, and integration defects. Use their declared
descriptions and scope; do not infer the task from the folder name alone.
