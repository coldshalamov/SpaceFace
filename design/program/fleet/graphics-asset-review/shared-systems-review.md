# Shared lighting and materials review — 2026-11-16

Source review found existing limits on lit non-emissive surfaces and scene IBL, plus a neutral tone curve in the shared look configuration. Forge signal-role emissive gain is a watchpoint for individual materials, but source inspection alone does not establish a cross-model defect. Prior practical handoff observations identified broad decorative strips on particular ships as the source of dominating glow; targeted adjustments preserved functional lights, while global lightening trials were rejected. No shared lighting or material values changed in this pass.

Evidence: `src/render/lookMoods.js`, `src/render/authoredMaterialProfiles.js`, and `design/program/fleet/graphics-asset-review/PRACTICAL_HANDOFF.md` where present. Individual gameplay views and model-specific decisions remain tracked in `coverage-status.json`.
