# Renderer adapter

Scene Truth reads lab checkpoint surfaces, `wholeShipVisualForEntity`,
`authoredPayloadFileForEntity`, `RENDER_PACKAGE_PILOTS`, and model-truth
keep-outs. Those sources do not carry live mesh visibility, render order,
or GPU residency. Shield discs use the live shell radius (`entity.radius`
while `entity.shield` or `entity.shieldMax` is up), the same scale
`createShieldBubble` applies. They do not use def shield HP.

`window.__THREE_GAME_DIAGNOSTICS__` (`src/render/diagnostics.js`) publishes
draw counters. Its report has no object ids. Confirmed by
`tools/scene-truth/test/hook.test.mjs`.

Do not add a debug overlay to shipping play. The probe below stays off unless
a witness sets `globalThis.__SF_SCENE_TRUTH_WITNESS__ === true` before boot.
It assigns one plain object and never creates DOM.

## Call site

The play loop draws on the split path in `src/core/renderUpdatePhase.js`:
`prepareFrame`, then `drawPreparedFrame`. That draw returns true only after a
frame was submitted. The publish runs on that true return:

```js
const submitted = render.drawPreparedFrame();
if (submitted === true) publishSceneTruthPlayStep(render);
```

`renderFrame` in `src/render/renderer.js` is the fallback used when the render
object does not define both methods. It publishes only when `drawPreparedFrame()`
returns true, so a return before submit does not publish.

The probe stays off unless a witness sets `globalThis.__SF_SCENE_TRUTH_WITNESS__ === true`
before the step. It assigns one plain object and never creates DOM.

A non-SVG `state.render.sceneTruthFrameCapture` (`{ format, bytes }`) publishes
`gpuFrame: true`. An SVG payload stays `gpuFrame: false`.

`samples` would be one record per live render root, copied from data the
renderer already has: entity id, `userData.assetId`, package content hash,
`visible`, `renderOrder`, LOD level. No extra draw, no DOM node, no write to
sim state. `sceneTruthFrameFromSamples` is covered by
`tools/scene-truth/test/hook.test.mjs`.

Shield hit points stay owned by the combat writer. The observatory reads
`entity.shield` / `entity.shieldMax` and the live shell radius. It does not
write them.
