// Cook the REAL live scene behind the loading shell: compile its programs and
// upload its buffers. Dummy catalog prewarm is not this path.

import { compileScenePipelinesSafely } from './compilePipelinesSafely.js';
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
    return remember(render, await render.cookLiveSceneGpu(options));
  }

  const renderer = render.renderer;
  const scene = render.scene;
  const camera = render.camera;
  if (!renderer || !scene || !camera) {
    return remember(render, { skipped: true, reason: 'no-live-scene' });
  }

  let programs = { skipped: true, reason: 'compile-unavailable' };
  if (typeof renderer.compileAsync === 'function' || typeof renderer.compile === 'function') {
    const compiled = await compileScenePipelinesSafely(renderer, scene, camera, scene);
    programs = compiled && compiled.skipped === false
      ? { skipped: false, method: compiled.method || 'compile-pipelines-safe' }
      : { skipped: true, reason: (compiled && compiled.reason) || 'compile-unavailable' };
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
