// Presentation-only scheduling. This moves an optional synchronous environment
// bake out of Launch; it does not make the bake cheaper or prove a painted veil.
// The bounded timer permits progress when the compositor is not delivering rAF.
export function createVeiledFoundryEnvDrainScheduler(host = globalThis) {
  const pending = new WeakMap();
  return function scheduleVeiledFoundryEnvDrain(state, bus = null) {
    pending.get(state)?.();
    const render = state.render;
    const bake = render?._drainFoundryEnvPending;
    if (state.mode !== 'loading' || render?._foundryEnvPending !== true
        || typeof bake !== 'function') return () => {};
    const renderer = render.renderer;
    const generation = render.admissionRunGeneration;
    let closed = false, queued = false;
    let frameId = null, fallbackId = null, taskId = null, unsubscribe = null;
    const cancel = () => {
      if (closed) return;
      closed = true;
      if (frameId !== null && typeof host.cancelAnimationFrame === 'function') {
        host.cancelAnimationFrame(frameId);
      }
      if (fallbackId !== null) host.clearTimeout(fallbackId);
      if (taskId !== null) host.clearTimeout(taskId);
      if (typeof unsubscribe === 'function') unsubscribe();
      if (pending.get(state) === cancel) pending.delete(state);
    };
    const drain = () => {
      if (closed) return;
      cancel();
      // A reset can replace either the presentation state or its renderer while
      // leaving mode='loading'. A retired callback has no authority over either.
      if (state.mode !== 'loading' || state.render !== render
          || render.renderer !== renderer || render.admissionRunGeneration !== generation
          || render._foundryEnvPending !== true
          || render._drainFoundryEnvPending !== bake) return;
      try { bake.call(render); } catch (_) { /* optional; other cook seams may retry */ }
    };
    const later = () => {
      if (closed || queued) return;
      queued = true;
      if (frameId !== null && typeof host.cancelAnimationFrame === 'function') {
        host.cancelAnimationFrame(frameId);
      }
      frameId = null;
      if (fallbackId !== null) host.clearTimeout(fallbackId);
      fallbackId = null;
      // Never bake inside rAF (which runs before paint), nor inside Launch.
      taskId = host.setTimeout(drain, 0);
    };
    pending.set(state, cancel);
    if (typeof bus?.on === 'function') {
      unsubscribe = bus.on('mode:changed', event => {
        if (state.mode !== 'loading' || (event?.mode != null && event.mode !== 'loading')) cancel();
      });
    }
    // Arm the fallback first: even a throwing/unavailable rAF cannot wedge it.
    fallbackId = host.setTimeout(later, 100);
    try {
      if (typeof host.requestAnimationFrame === 'function') frameId = host.requestAnimationFrame(later);
    } catch (_) { /* fallback remains armed */ }
    return cancel;
  };
}

export const scheduleVeiledFoundryEnvDrain = createVeiledFoundryEnvDrainScheduler();
