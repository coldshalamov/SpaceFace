// Synchronous event bus with a deferred queue (ARCHITECTURE §4). Most events fire
// synchronously; entity spawn/destroy are queued and flushed at the end of a sim step
// so the entity set is never mutated mid-iteration.
//
// `sector:enter` may be count-sliced: the first budget of listeners still runs inside
// enterSector, leftover presentation listeners drain after present. Default budget 0
// keeps every emit fully synchronous (tests, boot, Continue).

export const SECTOR_ENTER_LISTENER_BUDGET = 32;
export const SECTOR_ENTER_DRAIN_BUDGET = 4;

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
  let deferred = [];
  const deferredPool = [];
  const sliceBudgets = new Map();
  let emitSlice = null;

  function invalidateSnapshot(event) {
    const snap = listenerSnapshots.get(event);
    if (snap) snap.dirty = true;
  }

  function on(event, fn) {
    let set = listeners.get(event);
    if (!set) { set = new Set(); listeners.set(event, set); }
    set.add(fn);
    invalidateSnapshot(event);
    return () => off(event, fn);
  }

  function off(event, fn) {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(fn);
    invalidateSnapshot(event);
    if (set.size === 0) listeners.delete(event);
  }

  function once(event, fn) {
    const unsub = on(event, (p, e) => { unsub(); fn(p, e); });
    return unsub;
  }

  function snapshotListeners(event) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return null;
    let snap = listenerSnapshots.get(event);
    if (!snap) {
      snap = { dirty: true, fns: null };
      listenerSnapshots.set(event, snap);
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

  function emitAll(event, payload) {
    const fns = snapshotListeners(event);
    if (!fns) return;
    dispatchRange(fns, payload, event, 0, fns.length);
  }

  function startEmitSlice(event, payload, budget) {
    emitSlice = null;
    const fns = snapshotListeners(event);
    if (!fns) return;
    emitSlice = { event, payload, fns, index: 0 };
    drainEmitSlice(budget);
  }

  function emit(event, payload) {
    const budget = sliceBudgets.get(event) | 0;
    if (budget > 0 && event === 'sector:enter') {
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
    const next = dispatchRange(
      slice.fns,
      slice.payload,
      slice.event,
      slice.index,
      slice.index + limit,
    );
    const ran = next - slice.index;
    if (emitSlice === slice) {
      slice.index = next;
      if (slice.index >= slice.fns.length) emitSlice = null;
    }
    return ran;
  }

  function pendingEmitSliceCount() {
    return emitSlice ? emitSlice.fns.length - emitSlice.index : 0;
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
    deferred = [];
    deferredPool.length = 0;
    sliceBudgets.clear();
    emitSlice = null;
  }

  return {
    on, off, once, emit, queue, flush, clear,
    setEmitSliceBudget, drainEmitSlice, pendingEmitSliceCount,
    _listeners: listeners,
  };
}

export const EventBus = createBus; // alias per manifest
