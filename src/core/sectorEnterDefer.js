// Emit-first sector:enter materializers used to run their whole spawn cohort
// synchronously inside the emit (30+ listener bodies on a live enter — the
// in-flight-hitches family). A cook-covered materializer instead defers its
// body to this per-enter FIFO, which the renderer's deterministic census
// (prepareLiveSectorAfterJump) drains in listener-registration order under
// its own slice clock. Spawn order is identical either way — FIFO position
// preserves the emit ordering the inline drain produced — and the cook's
// provider pass re-runs covered systems as cheap dedupe-skips after.
//
// The deferral can only ever apply where a drain owner will run. For hard
// enters that is the cook: sectorEnterCookWillRun is published by the renderer
// and encodes the same conditions its own sector:enter listener uses to reach
// compileSectorPipelines (live GPU, non-loading, non-continuous, not
// session-recook-keep). For continuous enters the drain owner is the
// handoff-hold's exempt collect beat — sectorEnterSeamDeferWillRun mirrors the
// listener branch that arms _sectorHandoffStreamHoldS, and the beat drives the
// same FIFO in bounded slices across the presented blend instead of inside the
// emit tail. Headless runs, software GPU, loading enters, and noTeleport-only
// enters (no hold arm) all take the unchanged inline path, so tests and the
// sim keep byte-identical behavior.
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
//
// dropDeadDeferredEnterEntries is the supersession clear: it drops ONLY the
// dead-epoch seam leftovers and leaves the new enter's live cohort queued for
// the census splice. Draining inline here would run the fresh cohort against
// the departing sector arg inside the emit — then the census splice would find
// the queue empty and run every registered provider a second time anyway.
import {
  notePacedFrameSpend,
  pacedFrameSpend,
  PACED_FRAME_BUDGET_MS,
} from '../render/decodeTaskBudget.js';

export function dropDeadDeferredEnterEntries(state) {
  const render = state && state.render;
  const queue = render && Array.isArray(render.deferredEnterMaterializers)
    ? render.deferredEnterMaterializers : null;
  if (!queue || !queue.length) return 0;
  const liveEpoch = state.world && state.world.enterSerial != null
    ? state.world.enterSerial : null;
  let dropped = 0;
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    const entry = queue[i];
    const live = entry && typeof entry.provider === 'function'
      && (entry.epoch == null || liveEpoch == null || entry.epoch === liveEpoch);
    if (live) continue;
    // A mid-stream iterator holds provider state — close it like a stale-drive bail.
    try { if (entry && entry.iterator && typeof entry.iterator.return === 'function') entry.iterator.return(); }
    catch (_) { /* drop proceeds regardless */ }
    queue.splice(i, 1);
    dropped += 1;
  }
  return dropped;
}

// A deferred provider runs after the emit under the slice clock, but durable
// schedulers inside it must stamp the EMIT's own clock — deferred and emit
// delivery produce identical dueAts. Both drains pin render._deferredEnterClock
// around provider work; this is the one read the cohort shares.
export function deferredEnterNow(state) {
  const render = state && state.render;
  const pinned = render && render._deferredEnterClock;
  if (pinned != null) return pinned;
  return state && state.simTime;
}

// Same pin for the tick counter — tick-stamped durable identity (recordCreatedTick)
// drifts the same way simTime does across the deferred window.
export function deferredEnterTick(state) {
  const render = state && state.render;
  const pinned = render && render._deferredEnterTick;
  if (pinned != null) return pinned;
  return state && state.tick;
}

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
    if (!live) {
      try { if (entry && entry.iterator && typeof entry.iterator.return === 'function') entry.iterator.return(); }
      catch (_) { /* drop proceeds regardless */ }
      continue;
    }
    try {
      // Enter-clock pinning: durable schedulers invoked inside a provider read the
      // emit's own clock so deferred and emit delivery stamp identical dueAts.
      // Save/restore: a suspended outer driver (census splice, hold beat) may hold
      // its own pin — clobbering it to null would stamp its tail with live clocks.
      const prevClock = render._deferredEnterClock;
      const prevTick = render._deferredEnterTick;
      if (entry.clock != null) render._deferredEnterClock = entry.clock;
      if (entry.tick != null) render._deferredEnterTick = entry.tick;
      try {
        const iterator = entry.iterator || entry.provider(sector);
        if (iterator && typeof iterator.next === 'function') {
          for (;;) { const step = iterator.next(); if (step.done) break; }
        }
      } finally { render._deferredEnterClock = prevClock; render._deferredEnterTick = prevTick; }
    } catch (_) { /* isolated like a bus listener — one body's throw frees the rest */ }
  }
  queue.length = 0;
}

// Sliced drain owner for the continuous-seam path: the handoff hold's exempt
// beat drives the FIFO at most budgetMs per call, holding each provider's
// iterator on its entry so chunked cook providers resume mid-stream across
// beats. Always drains at least one step so a long queue still retires inside
// the hold; the hold-end tail drains whatever remains inline. `holdEpoch`
// bounds the owner: a hold minted under one enter must never step the live
// entries of a newer enter against its departed sector — those wait queued for
// the census splice, which drives them against the right sector.
export function drainDeferredEnterSlice(state, sector, budgetMs, holdEpoch) {
  const render = state && state.render;
  const queue = render && Array.isArray(render.deferredEnterMaterializers)
    ? render.deferredEnterMaterializers : null;
  if (!queue || !queue.length) return 0;
  const liveEpoch = state.world && state.world.enterSerial != null
    ? state.world.enterSerial : null;
  // Serials are monotone — drop dead-epoch entries first (same as the inline drain).
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    const entry = queue[i];
    if (entry && typeof entry.provider === 'function'
        && (entry.epoch == null || liveEpoch == null || entry.epoch === liveEpoch)) continue;
    try { if (entry && entry.iterator && typeof entry.iterator.return === 'function') entry.iterator.return(); }
    catch (_) { /* drop proceeds regardless */ }
    queue.splice(i, 1);
  }
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? () => performance.now() : () => Date.now();
  const startedAt = now();
  const deadline = startedAt + Math.max(0, Number(budgetMs) || 0);
  let steps = 0;
  // The caller's budgetMs plus the shared paced ledger — a frame that already
  // spent its paced budget doesn't also get this drain's wallet. `steps === 0`
  // preserves the drain's min-1-step progress guarantee either way.
  while (queue.length && (steps === 0 || (now() < deadline
      && pacedFrameSpend() < PACED_FRAME_BUDGET_MS))) {
    const entry = queue[0];
    if (entry && entry.epoch != null && holdEpoch != null && entry.epoch !== holdEpoch) break;
    if (!entry.iterator) {
      try {
        // Enter-clock pinning (see the inline drain): schedulers inside a provider
        // read the emit's own clock so deferred delivery stamps identical dueAts.
        const prevClock = render._deferredEnterClock;
        const prevTick = render._deferredEnterTick;
        if (entry.clock != null) render._deferredEnterClock = entry.clock;
        if (entry.tick != null) render._deferredEnterTick = entry.tick;
        try { entry.iterator = entry.provider(sector) || null; }
        finally { render._deferredEnterClock = prevClock; render._deferredEnterTick = prevTick; }
      } catch (_) { entry.iterator = null; entry.done = true; }
      if (entry.iterator != null && typeof entry.iterator.next !== 'function') {
        entry.iterator = null;
        entry.done = true;
      }
    }
    if (!entry.done) {
      try {
        const prevClock = render._deferredEnterClock;
        const prevTick = render._deferredEnterTick;
        if (entry.clock != null) render._deferredEnterClock = entry.clock;
        if (entry.tick != null) render._deferredEnterTick = entry.tick;
        try {
          const step = entry.iterator.next();
          if (step.done) entry.done = true;
        } finally { render._deferredEnterClock = prevClock; render._deferredEnterTick = prevTick; }
      } catch (_) { entry.done = true; }
    }
    if (entry.done) queue.shift();
    steps += 1;
  }
  if (steps > 0) notePacedFrameSpend(now() - startedAt);
  return steps;
}
// True while the deferred-enter queue holds this provider live under the
// world's current epoch — queued-not-yet-driven or suspended mid-stream on a
// held iterator. Inline sweeps that share the provider's mutable state must
// defer to the slice clock: a second driver on the same array would race the
// held iterator's indexes.
export function deferredEnterProviderInFlight(state, provider) {
  const render = state && state.render;
  const queue = render && Array.isArray(render.deferredEnterMaterializers)
    ? render.deferredEnterMaterializers : null;
  if (!queue || !queue.length || typeof provider !== 'function') return false;
  const liveEpoch = state.world && Number.isFinite(state.world.enterSerial)
    ? state.world.enterSerial : null;
  for (const entry of queue) {
    if (!entry || entry.provider !== provider || entry.done) continue;
    if (entry.epoch != null && liveEpoch != null && entry.epoch !== liveEpoch) continue;
    return true;
  }
  return false;
}

export function deferSectorEnterMaterialization(state, payload, provider) {
  const render = state && state.render;
  const willRun = render && ((
    typeof render.sectorEnterCookWillRun === 'function'
      && render.sectorEnterCookWillRun(payload) === true)
    || (typeof render.sectorEnterSeamDeferWillRun === 'function'
      && render.sectorEnterSeamDeferWillRun(payload) === true));
  if (!willRun || typeof provider !== 'function') return false;
  const queue = render.deferredEnterMaterializers || (render.deferredEnterMaterializers = []);
  // An epochless payload binds to the world's current serial instead of staying null-immortal:
  // a null epoch passed every future drain's liveness check, so a stale entry would re-run its
  // provider on whatever world was then current, forever.
  const epoch = payload && Number.isFinite(payload.enterEpoch) ? payload.enterEpoch
    : (state.world && Number.isFinite(state.world.enterSerial) ? state.world.enterSerial : null);
  // A second emit carrying the same epoch must not stack a second copy of this
  // system's entry — both would drain and the cohort would materialize twice.
  if (queue.some((entry) => entry && entry.provider === provider && entry.epoch === epoch)) return true;
  // Carry the emit's own clock: the drains pin it on render._deferredEnterClock
  // while a provider runs so schedulers inside the deferred path stamp the same
  // dueAt the emit path would have (emitSimTime > drain-time simTime wobble).
  const clock = payload && Number.isFinite(payload.enterSimTime) ? payload.enterSimTime
    : (Number.isFinite(state.simTime) ? state.simTime : null);
  const tick = payload && Number.isFinite(payload.enterTick) ? payload.enterTick
    : (Number.isFinite(state.tick) ? state.tick : null);
  queue.push({ epoch, provider, clock, tick, iterator: null, done: false });
  return true;
}
