# TASK: Parallax depth stack (SpaceFace WS-E1) — background depth

You are Codex in the SpaceFace repo. Read `design/GDD_2_0.md` §9.1 and `design/BUILD_PLAN_2_0.md`
(wave-2 status — sector palettes just landed; `state.render.sectorPalette` exposes a `dust` color).
Study `src/render/starfield.js` (existing skydome), `src/render/renderer.js` (scene setup, palette
lerp), `src/render/vfx.js` _initPools for the pooling idiom (do NOT edit vfx.js — it changed today).

## Build exactly this — new file `src/render/parallaxLayers.js` + minimal renderer hook
1. Three camera-relative layers between skydome and play plane (XZ world, camera looks down at 60°):
   - FAR dust sheets: 2 large additive planes (~3000 wu) at y = -140, parallax factor 0.22 — soft
     nebula wisp textures generated on canvas (reuse the starfield's canvas-texture approach, 512px,
     2-3 giant soft blobs, tinted by `state.render.sectorPalette?.dust` or fallback #35406a).
   - MID debris: InstancedMesh of ~120 tiny tetrahedra (radius 0.6–2.2 wu) at y = -40, factor 0.55,
     slow individual tumble (rotation only, no per-frame allocation — store axis/speed in arrays).
   - NEAR speed-motes: ~200 additive point sprites at y = +26 (ABOVE the play plane, they read as
     foreground), factor 1.35. While the player is boosting (`state.entities.get(playerId)?.flags?.boosting`)
     or moving > 200 wu/s, stretch motes along the velocity direction (scale, not new geometry) —
     this is the layer that SELLS speed.
2. Parallax mechanics: each layer group's position = cameraTargetXZ * (1 - factor) with wrap-around
   tiling (modulo a tile size per layer) so the field never runs out. Read the camera target from
   the same source camera.js uses (find its follow target; do not modify camera.js).
3. Palette coupling: on `jump:arrive` (or when `state.render.sectorPalette` object identity changes),
   retint far-sheet materials + mote color toward the palette's `dust`/`nebulaTint` over ~1.5 s
   (preallocated Color lerp, mirror the renderer's palette lerp pattern).
4. `settings.video.motionReduce === true` → halve mote count and disable boost-stretch.
   `settings.video.particleQuality === 'low'` → halve all layer densities.
5. Renderer hook: init from renderer.js where starfield is created (≤4 lines) and call
   `parallaxLayers.update(dt)` from the render-phase update where starfield/vfx update runs.
6. New `scripts/check-parallax-layers.mjs`: node --check style import test + assert the module
   exports {init, update, dispose} and that constructing with a stub scene creates 3 groups with
   expected instance counts under both quality settings. Add `check:parallax` npm script.

## Constraints
- Files: NEW `src/render/parallaxLayers.js`, `scripts/check-parallax-layers.mjs`, package.json (one
  line), `src/render/renderer.js` (≤6 lines of hook). Do NOT touch: vfx.js, starfield.js internals
  (import its texture helper only if it's exported), camera.js, any sim file, any UI file.
- Zero per-frame allocations (preallocate arrays/colors/scratch). All additive materials
  depthWrite:false. Total new draw calls ≤ 5 (instancing + merged sheets).
- No new deps. Respect the existing render-order (skydome behind everything).

## Verify
```
node scripts/check-parallax-layers.mjs && npm run check:non-graphics 2>&1 | tail -5
```
(check:non-graphics currently has known-red 47a tape gates unrelated to you — report its tail, do
not chase those.) Write the files. 10-line summary max.
