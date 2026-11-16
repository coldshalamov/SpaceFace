# Proposed goal: complete graphics coverage

Review every 3D model used in SpaceFace, including procedural models and newly landed assets. Give each an individual visual and practical efficiency pass; prioritize coverage over repeatedly polishing a few examples. Group LODs, variants, and source/release/package files under their model. Track unused and uncertain assets separately; do not delete based on a text search alone.

Establish a consistent professional style based on the game and its factions. Inspect each model at gameplay scale and, when needed, closer. Fix prominent flat shapes, inconsistent materials, disconnected construction, washout and unnecessary glow. Give visible surfaces suitable texture or convincing material detail; preserve functional lights and glass. Use imagegen where useful, reuse suitable art, and preserve faction and story character. Infestation should be creepy, brown, fleshy, folded and story-led.

Remove obvious waste where safe: duplicate geometry, excessive compatible static meshes/materials, unneeded textures and offscreen drawing. Preserve animation, sockets, collision and gameplay cues. Performance captures and benchmarks are not required; do not claim measured speed or FPS improvements without measurements.

Batch models and viewer captures. Use Luna for bounded inventory and mechanical work, Terra for most visual and 3D work, and Sol for difficult one-offs. Also delegate real tasks to devin-fleet agents running GPT-6.1 Terra on accounts with usage, as parallel subagents; review their work. Do not use Astra. No fixed iteration quota: revisit only when needed. Incomplete captures and failed candidates are not passes.

Maintain one durable work list with a status for every model: pending, in progress, passed, needs follow-up, or unused/unresolved. Record the model/version, view, changes and issues immediately. Refresh for merged assets. Review graphics systems and shared lighting/material issues separately without indefinitely holding up coverage.

Finish when every in-scope model has received an individual visual and practical efficiency pass, the work list has no unaccounted models, and remaining issues are resolved or explicitly reported. Verify changes with the smallest relevant checks and preserve other agents' work. Do not expand into repeated audits, performance capture campaigns, or arbitrary review quotas.
