# src/render/ — Agent Notes

Presentation / GPU layer. Never writes sim state. Root `AGENTS.md` §6 first. Asset pipeline:
`assets/AGENTS.md`. Player-visible VFX, compositor, lighting, or camera changes also read
`docs/visual-assets/README.md` and `design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md`.

## Silent-fallback trap

`assetLoader.js` returns `null` on authored-load failure and records a diagnostic;
`partsLibrary.js` keeps procedural fallback geometry. The entity stays visible. Inspect
`getAuthoredAssetDiagnostic` and run `npm run check:assets:live`. Runtime loads **RELEASE**
(`assets/ships/release/parts/`), not source. A model must be in the source manifest, generated
release manifest, and the appropriate `partsLibrary.js` map. Failure modes:
`assets/ships/AGENTS.md` and `docs/COMMON_BUGS.md` §3.

## Non-obvious owners

- `renderer.js`, `precompile.js`, `adaptiveQuality.js` / `lod.js` — frame, hitch, quality.
- `assetLoader.js` / `partsLibrary.js` — fetch/validate GLB; ship/role/archetype maps.
- `vfx.js` — pooled cosmetic particles. Player-facing VFX obey
  `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`. No `THREE.Points` / `THREE.Sprite` / glow card as
  the object itself; distant background stars are the only exception. Inventory:
  `docs/visual-assets/SOFT_CARD_INVENTORY.json`.
- `camera.js` — position-follow only, never yaw. `feel.js` — shake/trauma.
- `bloom.js` — selective; tune from representative captures, not a universal cap.

No per-frame allocations in render loops. Coordinate before editing a currently owned
release/lock/output.
