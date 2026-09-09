# src/render/ — Agent Notes

> The presentation / GPU layer. Pure rendering — never writes sim state.
> Read root `AGENTS.md` §6 (performance/assets contracts) first.
> Asset pipeline runtime side; full pipeline in `assets/AGENTS.md`.
> For player-visible VFX, compositor, lighting, or camera changes, also read
> `docs/visual-assets/README.md` and `design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md`;
> representative route evidence and independent visual judgment outrank source-level confidence.

## The silent-fallback trap (why "my model won't render")

`assetLoader.js` resolves `null` on authored-load or contract failure and records a diagnostic;
`partsLibrary.js` retains procedural fallback geometry. The entity stays visible, so inspect
`getAuthoredAssetDiagnostic` and run `npm run check:assets:live` after asset changes.

The runtime pulls from **RELEASE** (`assets/ships/release/parts/`), not source.
`releaseMode.js` makes release mode the default and `partsLibrary.js` selects `PART_RELEASE_ROOT`.

A model must be registered in the source manifest, generated release manifest, and the appropriate
runtime map in `partsLibrary.js`. Do not copy the current route inventory into instructions; inspect
the exact manifest IDs and live whole-ship, role, archetype, and modular-hull maps. Only
production-validated complete bodies belong in a live whole-ship map. Full pipeline and failure
modes: `assets/ships/AGENTS.md` and `docs/COMMON_BUGS.md` §3.

## File quick reference

- `renderer.js` — WebGLRenderer, scene, render frame. Perf lane.
- `assetLoader.js` — fetch + validate GLB; records a diagnostic and returns `null` on failure.
- `partsLibrary.js` — composes ships and owns ship/role/archetype asset maps.
- `vfx.js` — pooled particles + sprites; cosmetic only. `EVENT_LIGHT_POOL_SIZE` is a shader cache
  key that `precompile.js` must match. Player-facing VFX and fly-through world dressing obey
  `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`. Do not add `THREE.Points` / `THREE.Sprite` /
  glow cards as the object itself; distant background stars are the only exception. Live instances:
  `docs/visual-assets/SOFT_CARD_INVENTORY.json`.
- `visualFactory.js` — world props/stations and procedural fallback/dressing.
- `spaceBackground.js` / `starfield.js` / `parallaxLayers.js` — background layers.
- `bloom.js` — selective bloom. Tune global and per-material response together from representative
  captures; historical numeric values are baselines, not ceilings.
- `feel.js` — game feel (shake/trauma). `camera.js` — position-follow only, never yaw.
- `precompile.js` — shader precompile (hitch elimination). Perf lane.
- `adaptiveQuality.js` / `lod.js` — dynamic resolution + LOD.
- `materialLibrary.js` / `canvasTextures.js` — materials + runtime canvas textures.
- `energy/` / `post/` / `ships/` — energy materials, post-processing, ship helpers.

## Standing constraints

- **Measure compositor effects.** Do not ban or require blur, transparency, or opaque panels by
  recipe; preserve the strongest design and optimize the owning hot path with current evidence.
- **No per-frame allocations** in render loops — preallocate scratch.
- **Camera:** preserve gameplay-plane clarity and run the camera/composition checks. Current FOV,
  tilt, follow, and rotation behavior are implementation baselines, not immutable taste tokens.
- **Bloom:** selective and exposure-aware; accept it from representative player-route captures plus
  performance evidence, not a universal strength cap.
- If a release lock/building directory is backed by a current owner, process, or build signal,
  coordinate before editing the same asset/manifest/output. A stale marker or historical lane alone
  is not permanent ownership; use the asset lock protocol to verify activity.
