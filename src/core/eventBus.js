// Synchronous event bus with a deferred queue (ARCHITECTURE §4). Most events fire
// synchronously; entity spawn/destroy are queued and flushed at the end of a sim step
// so the entity set is never mutated mid-iteration.
//
// `sector:enter` may be count-sliced: the first budget of listeners still runs inside
// enterSector, leftover presentation listeners drain after present. Default budget 0
// keeps every emit fully synchronous (tests, boot, Continue).

export const SECTOR_ENTER_LISTENER_BUDGET = 32;
export const SECTOR_ENTER_DRAIN_BUDGET = 4;
// Presentation-tier listeners (bus.on(event, fn, { presentation: true })): burst events like
// entity:killed / entity:destroyed fan out to ~dozen presentation-pure tails that used to run
// inside the emit — mid-tick for synchronous events, inside the flush task for queued ones.
// Once a presentation runner claims the drain, those tails enqueue and run a bounded number
// per frame; the sim tail still executes in-tick exactly as before. Without a claim (headless
// sims, tests) presentation listeners dispatch inline at emit — identical to a plain listener.
export const PRESENTATION_LISTENER_DRAIN_BUDGET = 8;

function dispatchRange(fns, payload, event, start, end) {
  const last = Math.min(fns.length, end);
  let i = start;
  for (; i < last; i++) {
    try { fns[i](payload, event); }
    catch (err) { console.error(`[bus] handler error for "${event}":`, err); }
  }
  return i;
}

export function createBus() {
  const listeners = new Map(); // event -> Set<fn>
  const listenerSnapshots = new Map(); // event -> { dirty, fns }
  const presentationSets = new Map(); // event -> Set<fn> (presentation-tier listeners)
  const presentationSnaps = new Map();
  const presentationQueue = []; // [{ event, payload, fns, index }] — drained per frame
  let presentationDrainClaimed = false;
  let deferred = [];
  const deferredPool = [];
  const sliceBudgets = new Map();
  let emitSlice = null;

  function invalidateSnapshot(snaps, event) {
    const snap = snaps.get(event);
    if (snap) snap.dirty = true;
  }

  function on(event, fn, opts = null) {
    const presentation = !!(opts && opts.presentation === true);
    const table = presentation ? presentationSets : listeners;
    const snaps = presentation ? presentationSnaps : listenerSnapshots;
    let set = table.get(event);
    if (!set) { set = new Set(); table.set(event, set); }
    set.add(fn);
    invalidateSnapshot(snaps, event);
    return () => off(event, fn);
  }

  function off(event, fn) {
    for (const [table, snaps] of [[listeners, listenerSnapshots], [presentationSets, presentationSnaps]]) {
      const set = table.get(event);
      if (!set) continue;
      if (set.delete(fn)) invalidateSnapshot(snaps, event);
      if (set.size === 0) table.delete(event);
    }
  }

  function once(event, fn) {
    const unsub = on(event, (p, e) => { unsub(); fn(p, e); });
    return unsub;
  }

  function snapshotListeners(table, snaps, event) {
    const set = table.get(event);
    if (!set || set.size === 0) return null;
    let snap = snaps.get(event);
    if (!snap) {
      snap = { dirty: true, fns: null };
      snaps.set(event, snap);
    }
    if (snap.dirty) {
      // Publish a NEW array instead of mutating snap.fns in place: an emit already iterating the
      // old array (re-entrant emit of the same event, or a listener that on/off's mid-dispatch)
      // keeps its captured set, exactly like a per-emit copy — without the per-emit copy.
      const fns = new Array(set.size);
      let i = 0;
      set.forEach((fn) => { fns[i++] = fn; });
      snap.fns = fns;
      snap.dirty = false;
    }
    return snap.fns;
  }

  function dispatchPresentation(event, payload) {
    const fns = snapshotListeners(presentationSets, presentationSnaps, event);
    if (!fns) return;
    if (!presentationDrainClaimed) {
      // No runner owns the frame pump — dispatch inline so headless sims and tests observe the
      // same synchronous listener contract they always had.
      dispatchRange(fns, payload, event, 0, fns.length);
      return;
    }
    presentationQueue.push({ event, payload, fns, index: 0 });
    // A claimed-but-unpumped drain (hidden tab, suspended shell) must not accumulate
    // unboundedly: drop the oldest slices past the cap — losing a mid-burst visual tail is
    // cheaper than minutes of deferred drain when the pump resumes.
    if (presentationQueue.length > 64) presentationQueue.shift();
  }

  function emitAll(event, payload) {
    const fns = snapshotListeners(listeners, listenerSnapshots, event);
    if (fns) dispatchRange(fns, payload, event, 0, fns.length);
    dispatchPresentation(event, payload);
  }

  function startEmitSlice(event, payload, budget) {
    // A second sliced emit while a predecessor still has a deferred tail used to discard that
    // tail outright — every listener past the cut never heard the first sector:enter. Drain the
    // remainder synchronously so no listener is ever skipped; the newest emit still wins order.
    while (emitSlice) drainEmitSlice(Number.MAX_SAFE_INTEGER);
    const fns = snapshotListeners(listeners, listenerSnapshots, event);
    if (!fns) { dispatchPresentation(event, payload); return; }
    emitSlice = { event, payload, fns, index: 0 };
    drainEmitSlice(budget);
    dispatchPresentation(event, payload);
  }

  function emit(event, payload) {
    const budget = sliceBudgets.get(event) | 0;
    if (budget > 0 && (event === 'sector:enter' || event === 'save:loaded')) {
      startEmitSlice(event, payload, budget);
      return;
    }
    emitAll(event, payload);
  }

  function setEmitSliceBudget(event, budget) {
    const n = Math.max(0, Math.floor(Number(budget) || 0));
    if (n <= 0) sliceBudgets.delete(event);
    else sliceBudgets.set(event, n);
    return n;
  }

  function drainEmitSlice(budget = SECTOR_ENTER_DRAIN_BUDGET) {
    // Capture the slice locally: a listener that clear()s the bus (screen teardown mid-present)
    // or starts a re-entrant sliced emit nulls/replaces `emitSlice` while this drain is on the
    // stack — writing through the global here crashed on the stale null (seen on glass would be
    // a hard TypeError inside the frame).
    const slice = emitSlice;
    if (!slice) return 0;
    const limit = Math.max(1, Math.floor(Number(budget) || SECTOR_ENTER_DRAIN_BUDGET));
    let ran = 0;
    while (emitSlice === slice && ran < limit && slice.index < slice.fns.length) {
      const fn = slice.fns[slice.index];
      slice.index += 1;
      ran += 1;
      try { fn(slice.payload, slice.event); }
      catch (err) { console.error(`[bus] handler error for "${slice.event}":`, err); }
    }
    if (emitSlice === slice && slice.index >= slice.fns.length) emitSlice = null;
    return ran;
  }

  function pendingEmitSliceCount() {
    return emitSlice ? emitSlice.fns.length - emitSlice.index : 0;
  }

  /** The frame-loop owner claims the presentation drain; headsless contexts stay inline. */
  function claimPresentationDrain() {
    presentationDrainClaimed = true;
  }

  function drainPresentationTail(budget = PRESENTATION_LISTENER_DRAIN_BUDGET) {
    const limit = Math.max(1, Math.floor(Number(budget) || PRESENTATION_LISTENER_DRAIN_BUDGET));
    let ran = 0;
    while (ran < limit && presentationQueue.length) {
      const head = presentationQueue[0];
      const fn = head.fns[head.index];
      head.index += 1;
      ran += 1;
      try { fn(head.payload, head.event); }
      catch (err) { console.error(`[bus] presentation handler error for "${head.event}":`, err); }
      if (head.index >= head.fns.length) presentationQueue.shift();
    }
    return ran;
  }

  function pendingPresentationCount() {
    let n = 0;
    for (const slice of presentationQueue) n += slice.fns.length - slice.index;
    return n;
  }

  /** Defer an event to the next flush() (end of sim step). */
  function queue(event, payload) {
    const item = deferredPool.pop() || { event: null, payload: null };
    item.event = event;
    item.payload = payload;
    deferred.push(item);
  }

  function flush() {
    if (!deferred.length) return;
    const batch = deferred;
    deferred = [];
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      emitAll(item.event, item.payload);
      item.event = null;
      item.payload = null;
      deferredPool.push(item);
    }
    batch.length = 0;
  }

  function clear() {
    listeners.clear();
    listenerSnapshots.clear();
    presentationSets.clear();
    presentationSnaps.clear();
    presentationQueue.length = 0;
    deferred = [];
    deferredPool.length = 0;
    sliceBudgets.clear();
    emitSlice = null;
  }

  return {
    on, off, once, emit, queue, flush, clear,
    setEmitSliceBudget, drainEmitSlice, pendingEmitSliceCount,
    claimPresentationDrain, drainPresentationTail, pendingPresentationCount,
    _listeners: listeners,
  };
}

export const EventBus = createBus; // alias per manifest
