# SpaceFace Visual Asset Production Standard

This directory is the canonical craft and acceptance route for Blender-authored ships, stations,
props, VFX-support geometry, and related glTF/GLB assets.

For substantive Blender asset work, read the production standard first, then load only the
task-relevant routed material:

1. `VISUAL_ASSET_PRODUCTION_STANDARD.md` - always required: states, craft outcomes, G0-G7 gates,
   budgets, and execution.
2. `.grok/skills/spaceface-blender-material-truth/SKILL.md` - required when an
   existing asset reads plastic/clay/LEGO-like, primitive-stacked, or fiction/material-incoherent.
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
