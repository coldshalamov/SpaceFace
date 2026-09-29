# FB-085 — Photo mode's filter flag does something: a final grade pass with three authored looks

**Kind:** build · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: spaceRenderGraph.js, seam: camera.js, seam: pause.js
**Write-set:** `src/render/post/spaceRenderGraph.js`, `src/render/camera.js`, `src/ui/screens/pause.js`, `test/fb-photo-filters.test.mjs`

## The gap
Photo mode is complete and reachable (free camera, HUD off, exposure, PNG export) but `PHOTO_FILTERS_DEFAULT = false`
is passed through `photoModeFlags` and nothing in `src/render/post/` consumes it. It is the one
declared-but-empty photo channel. There is also no photo key: `photoHintText` notes that no binding is
registered.

## Why this direction
A third-party post stack was rejected (no casual deps). The render graph already has a final composite; a
LUT-free grade pass (lift/gamma/gain plus a mono and a warm look) is three parameter sets.

## Mechanism
- Add a grade stage at the end of `spaceRenderGraph.js` gated on `state.render.photoMode.filters` with three
  authored looks; off by default, no cost when off.
- Cycle looks from the photo overlay in `pause.js` (a task-needed functional edit, ORRERY-consistent) and expose
  photo FOV from the same overlay using the existing `video.fov` reader in `camera.js`.
- Register a `photo` binding in `src/ui/bindings.js` conflict-checked like the others.

## Done when
`test/fb-photo-filters.test.mjs`: filters off adds zero passes; each look changes the composite hash
deterministically for a fixed frame; `pq-159-03-photo-mode.test.mjs` stays green; the photo overlay walk via
`node scripts/ui-bench.mjs --walk` on the pause screen shows the new controls reachable.

## Do not
Do not run the grade during play. Do not add a dependency. Do not redesign the pause screen (ORRERY owns the
look).

## Focus test starting points
- `test/pq-159-03-photo-mode.test.mjs`
- `test/bloom-distortion.test.mjs`
