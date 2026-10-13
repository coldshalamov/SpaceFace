# Renderer adapter

Scene Truth reads lab checkpoint surfaces, `wholeShipVisualForEntity`,
`authoredPayloadFileForEntity`, `RENDER_PACKAGE_PILOTS`, and model-truth
keep-outs. Those sources do not carry live mesh visibility, render order,
or GPU residency. The live shield shell is `entity.radius` while
`entity.shield` is above zero, the same scale `createShieldBubble` applies.
`shieldMax` alone does not raise the shell. While the shield is up, the
presented disc is that live shell. A recorded `presentedShieldRadius` or
bubble scale does not replace it. A witness that claims a different disc
still fails. A shield of 0 draws no disc.
The lab checkpoint surface carries `shield` and `shieldMax`.

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
`gpuFrame: true`. An SVG payload stays `gpuFrame: false`, including a document
stored only as bytes whose prefix is an `<svg` or `<?xml` marker.

`samples` would be one record per live render root, copied from data the
renderer already has: entity id, `userData.assetId`, package content hash,
`visible`, `renderOrder`, LOD level. No extra draw, no DOM node, no write to
sim state. `sceneTruthFrameFromSamples` is covered by
`tools/scene-truth/test/hook.test.mjs`.

Shield hit points stay owned by the combat writer. The observatory reads
`entity.shield` / `entity.shieldMax` and the live shell radius. It does not
write them.
