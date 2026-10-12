# Unapplied renderer adapter

Scene Truth reads lab checkpoint surfaces, `wholeShipVisualForEntity`,
`authoredPayloadFileForEntity`, `RENDER_PACKAGE_PILOTS`, and model-truth
keep-outs. Those sources do not carry live mesh visibility, render order,
shield hit points, or GPU residency.

`window.__THREE_GAME_DIAGNOSTICS__` (`src/render/diagnostics.js`) publishes
draw counters. Its report has no object ids. Confirmed by
`tools/scene-truth/test/hook.test.mjs`.

Do not add a debug overlay to shipping play. The probe below stays off unless
a witness sets `globalThis.__SF_SCENE_TRUTH_WITNESS__ === true` before boot.
It assigns one plain object and never creates DOM.

## Proposed call site

File: `src/render/renderer.js`, immediately after the existing diagnostics
install (`state.render.diagnostics = this.diag`, around the diagnostics
publish). Do not apply this while graphics and perf PRs own `src/render/**`.

```js
import { sceneTruthFrameFromSamples } from '../../tools/scene-truth/lib/hook.mjs';

function publishSceneTruthFrame(samples, meta) {
  if (typeof globalThis === 'undefined' || globalThis.__SF_SCENE_TRUTH_WITNESS__ !== true) return;
  globalThis.__SF_SCENE_TRUTH_FRAME__ = sceneTruthFrameFromSamples(samples, meta);
}
```

`samples` would be one record per live render root, copied from data the
renderer already has: entity id, `userData.assetId`, package content hash,
`visible`, `renderOrder`, LOD level. No extra draw, no DOM node, no write to
sim state. `sceneTruthFrameFromSamples` is covered by
`tools/scene-truth/test/hook.test.mjs`.

Shield hit points are still owned by the combat writer. A later sample may
read `entity.shield` without writing it. Until this hook lands, shield discs
in the observatory use the ship and enemy def stats and are labeled as such.
