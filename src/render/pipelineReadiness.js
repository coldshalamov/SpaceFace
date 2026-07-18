function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), ms));
}

async function settleWithin(promise, timeoutMs) {
  return Promise.race([
    Promise.resolve(promise).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    ),
    timeout(timeoutMs),
  ]);
}

/**
 * Gate flight on both the procedural shader probes and the exact material graph currently installed
 * in the scene. The second phase is intentionally invoked only after authored visual readiness:
 * compiling before GLB composition exists merely warms a different set of program keys.
 */
export async function waitForCurrentRenderPipelines(state, timeoutMs = 20000) {
  const render = state && state.render;
  if (!render) return true;

  const procedural = render.pipelinePrecompileReady;
  if (procedural && typeof procedural.then === 'function') {
    const result = await settleWithin(procedural, timeoutMs);
    if (!result.ok) return false;
  }

  if (typeof render.compileCurrentPipelines !== 'function') return true;
  const exact = Promise.resolve().then(() => render.compileCurrentPipelines());
  render.exactPipelineWarmupReady = exact;
  const result = await settleWithin(exact, timeoutMs);
  return result.ok;
}
