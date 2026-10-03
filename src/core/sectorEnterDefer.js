// Emit-first sector:enter materializers used to run their whole spawn cohort
// synchronously inside the emit (30+ listener bodies on a live enter — the
// in-flight-hitches family). A cook-covered materializer instead defers its
// body to this per-enter FIFO, which the renderer's deterministic census
// (prepareLiveSectorAfterJump) drains in listener-registration order under
// its own slice clock. Spawn order is identical either way — FIFO position
// preserves the emit ordering the inline drain produced — and the cook's
// provider pass re-runs covered systems as cheap dedupe-skips after.
//
// The deferral can only ever apply where the cook itself would run:
// sectorEnterCookWillRun is published by the renderer and encodes the same
// conditions its own sector:enter listener uses to reach compileSectorPipelines
// (live GPU, non-loading, non-continuous, not session-recook-keep). Headless
// runs, software GPU, loading enters, and continuous handoffs all take the
// unchanged inline path, so tests and the sim keep byte-identical behavior.
//
// Entries stamped with an epoch that no longer matches the world's serial at
// drain time belong to a superseded enter and are dropped — the new enter's
// own emit re-enqueues its cohort, matching today's supersession semantics.
export function deferSectorEnterMaterialization(state, payload, provider) {
  const render = state && state.render;
  if (!render || typeof render.sectorEnterCookWillRun !== 'function'
      || render.sectorEnterCookWillRun(payload) !== true
      || typeof provider !== 'function') return false;
  const queue = render.deferredEnterMaterializers || (render.deferredEnterMaterializers = []);
  queue.push({
    epoch: payload && Number.isFinite(payload.enterEpoch) ? payload.enterEpoch : null,
    provider,
  });
  return true;
}
