// One safe entry point for "compile this subject and wait for its programs to link".
//
// Three's own compileAsync() poll assumes every material outlives the wait: dispose a material while
// it is still linking and `materialProperties.currentProgram` is undefined when the 10 ms timer
// fires. The throw is uncaught AND the returned promise is stranded forever — observed twice in a
// New Game run as "Cannot read properties of undefined (reading 'isReady')", plus a storm of
// glGetProgramiv calls against released programs. The exposed paths are ordinary player actions:
// leaving the title stage for New Game (uiStage), hovering a ship row away mid-compile
// (shipPreviewMount), and the loading/fallback cooks that precede them.
//
// bloom.js owns the hardened wait used by the live renderer: it polls with gl.isProgram() guards,
// retires its timer on context loss, and joins the shared readiness batch. This wrapper is the thin
// adapter the rest of the render layer calls; renderers without a render-target API (test/lab
// doubles) keep the plain compileAsync contract.

import { compileScenePipelinesForRenderTarget } from './bloom.js';

export async function compileScenePipelinesSafely(renderer, subject, camera, lightingScene = subject) {
  if (!renderer) return { skipped: true, reason: 'no-renderer' };
  if (typeof renderer.compileAsync !== 'function') {
    if (typeof renderer.compile === 'function') {
      renderer.compile(subject, camera, lightingScene);
      return { skipped: false, method: 'compile' };
    }
    return { skipped: true, reason: 'compile unusable' };
  }
  if (typeof renderer.setRenderTarget !== 'function') {
    await renderer.compileAsync(subject, camera, lightingScene);
    return { skipped: false, method: 'compileAsync' };
  }
  const result = await compileScenePipelinesForRenderTarget(
    renderer, null, subject, camera, lightingScene,
  );
  if (result && result.skipped === true) return result;
  return {
    skipped: false,
    method: 'compile-pipelines-safe',
    programCount: result && result.programCount,
  };
}
