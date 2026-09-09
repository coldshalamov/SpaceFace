// Cook the REAL live scene behind the loading shell: compile its programs and
// upload its buffers. Dummy catalog prewarm is not this path.

import { prepareStartupGpuResidency } from './startupGpuResidency.js';

function remember(render, result) {
  if (render) render.liveSceneCook = result;
  return result;
}

export async function cookLiveSceneGpu(state, options = {}) {
  if (!state || state.mode !== 'loading') {
    return remember(state && state.render, { skipped: true, reason: 'not-loading' });
  }
  const render = state.render;
  if (!render) return { skipped: true, reason: 'no-render' };
  if (typeof render.cookLiveSceneGpu === 'function') {
    return remember(render, await render.cookLiveSceneGpu());
  }

  const renderer = render.renderer;
  const scene = render.scene;
  const camera = render.camera;
  if (!renderer || !scene || !camera) {
    return remember(render, { skipped: true, reason: 'no-live-scene' });
  }

  let programs = { skipped: true, reason: 'compile-unavailable' };
  if (typeof renderer.compileAsync === 'function') {
    await renderer.compileAsync(scene, camera);
    programs = { skipped: false, method: 'compileAsync' };
  } else if (typeof renderer.compile === 'function') {
    renderer.compile(scene, camera);
    programs = { skipped: false, method: 'compile' };
  }

  const prepare = typeof options.prepareResidency === 'function'
    ? options.prepareResidency
    : prepareStartupGpuResidency;
  const buffers = await prepare(renderer, scene, {
    includeGeometry: true,
    yieldToMain: options.yieldToMain,
    onBlockingSlice: options.onBlockingSlice,
  });

  const result = {
    skipped: false,
    liveScene: true,
    programs,
    buffers,
  };
  render.liveSceneCook = result;
  return result;
}
