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
//
// drainDeferredEnterMaterializers is the safety valve: a cook that returns
// before reaching the splice (mode left 'flight' between emit and render's
// listener, no shell armed) would otherwise strand a whole cohort — the
// epoch guard can never match again. Draining the live-epoch entries inline
// restores exactly the pre-deferral emit-path behavior for that enter.
export function drainDeferredEnterMaterializers(state, sector) {
  const render = state && state.render;
  const queue = render && Array.isArray(render.deferredEnterMaterializers)
    ? render.deferredEnterMaterializers : null;
  if (!queue || !queue.length) return;
  const liveEpoch = state.world && state.world.enterSerial != null
    ? state.world.enterSerial : null;
  for (const entry of queue) {
    const live = entry && typeof entry.provider === 'function'
      && (entry.epoch == null || liveEpoch == null || entry.epoch === liveEpoch);
    // Serials are monotone: an epoch that fails the match can never match a later
    // serial — a re-queue would only re-check the same dead entry on every call.
    if (!live) continue;
    try {
      const iterator = entry.provider(sector);
      if (iterator && typeof iterator.next === 'function') {
        for (;;) { const step = iterator.next(); if (step.done) break; }
      }
    } catch (_) { /* isolated like a bus listener — one body's throw frees the rest */ }
  }
  queue.length = 0;
}
export function deferSectorEnterMaterialization(state, payload, provider) {
  const render = state && state.render;
  if (!render || typeof render.sectorEnterCookWillRun !== 'function'
      || render.sectorEnterCookWillRun(payload) !== true
      || typeof provider !== 'function') return false;
  const queue = render.deferredEnterMaterializers || (render.deferredEnterMaterializers = []);
  // An epochless payload binds to the world's current serial instead of staying null-immortal:
  // a null epoch passed every future drain's liveness check, so a stale entry would re-run its
  // provider on whatever world was then current, forever.
  const epoch = payload && Number.isFinite(payload.enterEpoch) ? payload.enterEpoch
    : (state.world && Number.isFinite(state.world.enterSerial) ? state.world.enterSerial : null);
  // A second emit carrying the same epoch must not stack a second copy of this
  // system's entry — both would drain and the cohort would materialize twice.
  if (queue.some((entry) => entry && entry.provider === provider && entry.epoch === epoch)) return true;
  queue.push({ epoch, provider });
  return true;
}
