# src/render/ — Agent Notes

> The presentation / GPU layer. Pure rendering — never writes sim state.
> Read root `AGENTS.md` §Performance + Concurrent Graphics Work first.
> Asset pipeline runtime side; full pipeline in `assets/AGENTS.md`.

## The silent-fallback trap (why "my model won't render")

`assetLoader.js:117-120` resolves `null` on ANY contract violation → `partsLibrary.js` falls back to procedural geometry → **no error, no log, just a wrong-looking ship.** A broken model is invisible. Always verify with `npm run check:assets:live` after asset changes.

The runtime pulls from **RELEASE** (`assets/ships/release/parts/`), not source. `releaseMode.js:1-4` `isReleaseAssetMode()` returns `true` by default; `partsLibrary.js:497` uses `PART_RELEASE_ROOT`.

A model must be registered in **three places** or it won't load: `assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json` (auto-written), AND `partsLibrary.js`. **The LIVE runtime map is `HULL_FILE_BY_DEF_ID` (line 202) for modular hulls. `WHOLE_SHIP_FILE_BY_DEF_ID` (line 220) is currently EMPTY** (`Object.freeze({})`) — whole-ship bodies are disabled until SPEC3-37 re-exports complete hull bodies; do NOT add to it. Full pipeline + failure modes: `assets/AGENTS.md` and `docs/COMMON_BUGS.md` §3. **All claims verified first-hand 2026-07-05.**

## File quick reference

- `renderer.js` (72KB) — WebGLRenderer, scene, render frame. Perf lane.
- `assetLoader.js` (48KB) — fetch + validate GLB; **silent null on failure**.
- `partsLibrary.js` (110KB) — compose ships from parts; **holds the shipId→GLB maps**.
- `vfx.js` (131KB) — pooled particles + sprites; cosmetic only; has a good header. `EVENT_LIGHT_POOL_SIZE` is a shader cache key — `precompile.js` must match it.
- `visualFactory.js` (131KB) — world props/stations; `applyStructureProfile` controls shell opacity (the 0.655→≤0.07 fix).
- `spaceBackground.js` (66KB) / `starfield.js` / `parallaxLayers.js` — background layers.
- `bloom.js` — selective bloom; **never raise global strength > 0.9** (raise per-material `emissiveIntensity` instead).
- `feel.js` — game feel (shake/trauma). `camera.js` — position-follow only, never yaw.
- `precompile.js` — shader precompile (hitch elimination). Perf lane.
- `adaptiveQuality.js` / `lod.js` — dynamic resolution + LOD.
- `materialLibrary.js` / `canvasTextures.js` — materials + runtime canvas textures.
- `energy/` / `post/` / `ships/` — energy materials, post-processing, ship helpers.

## Standing constraints

- **No `backdrop-filter`** in UI CSS (prior perf pass). Use opaque `rgba(5,9,18,.88)` panels.
- **No per-frame allocations** in render loops — preallocate scratch.
- **Camera:** fov 50, tilt 60°, position-follow only (never yaw), canonical numbers at ARCHITECTURE §0.14.
- **Bloom:** selective, global strength ≤ 0.9.
- **Do not edit `assets/**`, manifests, or release outputs while `assets/ships/release.__lock/` or `release.__building/` exist** — another graphics lane is active.
