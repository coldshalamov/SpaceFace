# SpaceFace Visual Asset Production Standard

This directory is the canonical craft and acceptance route for Blender-authored ships, stations,
props, VFX-support geometry, and related glTF/GLB assets.

Read in this order:

1. `VISUAL_ASSET_PRODUCTION_STANDARD.md` ΓÇö states, craft outcomes, G0ΓÇôG7 gates, budgets, and execution.
2. `SPACEFACE_MIGRATION.md` ΓÇö repository-specific audit and migration plan.
3. `AGENT_PROMPTS.md` ΓÇö reusable standards, one-asset, family, and independent-review prompts.
4. `TEMPLATES.md` ΓÇö brief, performance, review, and acceptance record shapes.

The central rule:

> A valid GLB is not accepted art. An asset is finished only when its form, construction, UV/bake,
> material response, LOD/cost, exact runtime presentation, and required independent review pass.

Canonical production states:

`blockout` ΓåÆ `design_candidate` ΓåÆ `production_model` ΓåÆ `bake_candidate` ΓåÆ
`surfaced_candidate` ΓåÆ `integration_candidate` ΓåÆ `accepted`.

`blocked` and `deprecated` are explicit non-acceptance states. `done`, `finished`,
`production-ready`, and `shippable` mean `accepted` only.

There is no universal triangle ceiling, texture size, material count, bevel recipe, or percentage of
techniques to use. Budget the complete measured runtime cost at supported camera sizes and
representative scene density. Select techniques from visible defects, not fashion.
