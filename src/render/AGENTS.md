# src/render/ — Agent Notes

> The presentation / GPU layer. Pure rendering — never writes sim state.
> Read root `AGENTS.md` §Performance + Concurrent Graphics Work first.
> Asset pipeline runtime side; full pipeline in `assets/AGENTS.md`.

## The silent-fallback trap (why "my model won't render")

`assetLoader.js` resolves `null` on authored-load or contract failure and records a diagnostic;
`partsLibrary.js` retains procedural fallback geometry. The entity stays visible, so inspect
`getAuthoredAssetDiagnostic` and run `npm run check:assets:live` after asset changes.

The runtime pulls from **RELEASE** (`assets/ships/release/parts/`), not source.
`releaseMode.js` makes release mode the default and `partsLibrary.js` selects `PART_RELEASE_ROOT`.

A model must be registered in the source manifest, generated release manifest, and the appropriate
runtime map in `partsLibrary.js`. `WHOLE_SHIP_FILE_BY_DEF_ID` currently routes production bodies for
`ship_kestrel` and `ship_wasp`; `HULL_FILE_BY_DEF_ID` supplies modular hulls for other definitions.
Only production-validated complete bodies belong in the whole-ship map. Full pipeline and failure
modes: `assets/AGENTS.md` and `docs/COMMON_BUGS.md` §3.

## File quick reference

- `renderer.js` (72KB) — WebGLRenderer, scene, render frame. Perf lane.
- `assetLoader.js` (48KB) — fetch + validate GLB; **silent null on failure**.
- `partsLibrary.js` (110KB) — compose ships from parts; **holds the shipId→GLB maps**.
- `vfx.js` (131KB) — pooled particles + sprites; cosmetic only; has a good header. `EVENT_LIGHT_POOL_SIZE` is a shader cache key — `precompile.js` must match it.
- `visualFactory.js` (131KB) — world props/stations; `applyStructureProfile` controls shell opacity (the 0.655→≤0.07 fix).
- `spaceBackground.js` (66KB) / `starfield.js` / `parallaxLayers.js` — background layers.
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
- **Do not edit `assets/**`, manifests, or release outputs while `assets/ships/release.__lock/` or `release.__building/` exist** — another graphics lane is active.
