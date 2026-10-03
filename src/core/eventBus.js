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
// Sliced emits that stack up behind a drain that couldn't finish inside its wall-clock cap
// queue here rather than being lost. The queue is bounded — past the cap the oldest entry is
// delivered fully inline at push. That preserves the one contract the queue exists to keep
// (no listener is ever skipped); it does not promise that delivery stays sliced.
export const MAX_QUEUED_SLICED_EMITS = 8;

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
  // Lifecycle-class events drain ahead of cosmetic slices: entity:destroyed carries the
  // corpse-mesh unbind (plus tag/doctrine/residency cleanup) — a starved frame that
  // dropped its slice would leave a dead hull on the glass until the residency poll
  // self-healed. Whole-event promotion keeps in-event FIFO; only cross-event order moves.
  const PRESENTATION_PRIORITY_EVENTS = new Set(['entity:destroyed']);
  const presentationPriorityQueue = [];
  // Once-only cosmetic events (spawn tails carry materializeT0/spiralDone stamps whose loss
  // is a permanent pop-in) get their own overflow floor above the generic cosmetic one — a
  // sustained destroyed burst sheds lifecycle slices long before it can evict the last
  // once-only stamps. Tracked as a count so the trim scan stays O(1) on the common path.
  const PRESENTATION_ONCE_ONLY_EVENTS = new Set(['entity:spawned']);
  const PRESENTATION_PRIORITY_INTERLEAVE = 8;
  let presentationOnceOnlyCount = 0;
  const presentationSlicePool = [];
  // Pooled-payload events (physics:impact, combat:damage refill one record per emit) register
  // an emit-time snapshotter: a queued presentation tail must read the fields a synchronous
  // listener saw — not the values the next emit refilled before the frame drain ran.
  const payloadSnapshots = new Map(); // event -> payload => clonedPayload
  let presentationDrainClaimed = false;
  let deferred = [];
  const deferredPool = [];
  const sliceBudgets = new Map();
  let emitSlice = null;
  // Sliced emits that arrived while a predecessor tail still lived past its
  // wall-clock cap — started in order when that tail finishes.
  const pendingSlicedEmits = [];
  // Bumped by clear(): a flush mid-stack that captured its batch pre-teardown must not deliver
  // the rest of it into listeners bound on the new bus.
  let generation = 0;

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
    // The fired guard must be set BEFORE unsubscribing: an earlier listener that recursively
    // re-emits snapshots this wrapper while it is still subscribed, and the outer dispatch's
    // captured copy must find it already spent. Snapshot semantics are preserved — the wrapper
    // may still be invoked by an in-flight array, it just no-ops.
    let fired = false;
    const unsub = on(event, (p, e) => {
      if (fired) return;
      fired = true;
      unsub();
      fn(p, e);
    });
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
    const snapshot = payloadSnapshots.get(event);
    const slice = presentationSlicePool.pop() || { event: null, payload: null, fns: null, index: 0 };
    slice.event = event;
    slice.payload = snapshot ? snapshot(payload) : payload;
    slice.fns = fns;
    slice.index = 0;
    const priority = PRESENTATION_PRIORITY_EVENTS.has(event);
    (priority ? presentationPriorityQueue : presentationQueue).push(slice);
    if (!priority && PRESENTATION_ONCE_ONLY_EVENTS.has(event)) presentationOnceOnlyCount += 1;
    // A claimed-but-unpumped drain (hidden tab, suspended shell) must not accumulate
    // unboundedly: drop the oldest slices past the cap — losing a mid-burst visual tail is
    // cheaper than minutes of deferred drain when the pump resumes. Cosmetic slices drop
    // first, but only down to a floor: spawn tails carry once-only stamps (materializeT0,
    // spiralDone) whose loss is a permanent pop-in, while a dropped lifecycle slice leaves a
    // dead hull the residency poll self-heals. Once-only cosmetics get their own deeper
    // floor — while it holds, the priority lane sheds its own oldest instead of evicting
    // the last spawn stamps.
    const COSMETIC_OVERFLOW_FLOOR = 16;
    const ONCE_ONLY_OVERFLOW_FLOOR = 32;
    let overflow = presentationQueue.length + presentationPriorityQueue.length - 64;
    while (overflow-- > 0) {
      const dropCosmetic = presentationPriorityQueue.length === 0
        || presentationQueue.length > COSMETIC_OVERFLOW_FLOOR;
      if (dropCosmetic) {
        let dropIndex = -1;
        // Prefer the oldest non-once-only cosmetic whether or not the priority lane is
        // populated — a lifecycle slice self-heals (the residency poll re-stamps), while
        // a once-only spawn stamp is a permanent pop-in.
        for (let i = 0; i < presentationQueue.length; i++) {
          if (!PRESENTATION_ONCE_ONLY_EVENTS.has(presentationQueue[i].event)) {
            dropIndex = i;
            break;
          }
        }
        // Every retained cosmetic is once-only: shed its oldest only past the deeper
        // floor; below it the priority lane pays instead (self-healing hull residue
        // before permanent spawn-stamp loss).
        if (dropIndex === -1 && presentationOnceOnlyCount > ONCE_ONLY_OVERFLOW_FLOOR) {
          dropIndex = 0;
        }
        // Belt-and-braces: a floor that could stall the trim reintroduces the unbounded
        // drain debt the cap exists to prevent — with no priority lane to pay, the cap
        // forces the shed anyway.
        if (dropIndex === -1 && presentationPriorityQueue.length === 0) dropIndex = 0;
        if (dropIndex !== -1) {
          const dropped = presentationQueue.splice(dropIndex, 1)[0];
          recyclePresentationSlice(dropped);
          continue;
        }
      }
      recyclePresentationSlice(presentationPriorityQueue.shift());
    }
  }

  function recyclePresentationSlice(slice) {
    if (!slice) return;
    if (!PRESENTATION_PRIORITY_EVENTS.has(slice.event)
        && PRESENTATION_ONCE_ONLY_EVENTS.has(slice.event)) {
      presentationOnceOnlyCount -= 1;
    }
    slice.event = null;
    slice.payload = null;
    slice.fns = null;
    slice.index = 0;
    presentationSlicePool.push(slice);
  }

  // Emitter-side pooled-payload contract: registers the snapshot a deferred tail should read.
  // Registering the same fn again is a no-op, so pool owners may re-arm cheaply after clear().
  function setPayloadSnapshot(event, fn) {
    if (typeof fn !== 'function') { payloadSnapshots.delete(event); return; }
    if (payloadSnapshots.get(event) === fn) return;
    payloadSnapshots.set(event, fn);
  }

  function emitAll(event, payload) {
    const fns = snapshotListeners(listeners, listenerSnapshots, event);
    if (fns) dispatchRange(fns, payload, event, 0, fns.length);
    dispatchPresentation(event, payload);
  }

  function startEmitSlice(event, payload, budget, maxMs) {
    // A second sliced emit while a predecessor still has a deferred tail used to discard that
    // tail outright — every listener past the cut never heard the first sector:enter. Drain the
    // remainder synchronously so no listener is ever skipped — but bound the flush to one
    // thin slice: a tail that outlives the wall-clock cap queues the NEW emit behind the
    // drain (ordering still holds emit-by-emit) instead of holding this frame hostage.
    // A bounded caller threads its remaining deadline in maxMs — both the forced flush and
    // the fresh slice must fit inside it, or a ≤4ms pump call pays a whole first slice inline.
    const flushCap = Number.isFinite(maxMs) && maxMs > 0 ? Math.min(4, maxMs) : 4;
    // One deadline shared by the forced flush, the fresh slice, and any listenerless queued
    // restart — forwarding the original maxMs down the chain would re-mint a full window per
    // hop and overspend the caller's bound by up to a window each hop.
    const windowEnd = Number.isFinite(maxMs) && maxMs > 0
      ? performance.now() + maxMs
      : Infinity;
    const remainingMs = () => Number.isFinite(windowEnd)
      ? Math.max(0.001, windowEnd - performance.now())
      : Infinity;
    if (emitSlice) drainEmitSlice(Number.MAX_SAFE_INTEGER, flushCap);
    if (emitSlice) {
      if (pendingSlicedEmits.length >= MAX_QUEUED_SLICED_EMITS) {
        // Backlog bounded: the oldest queued emit is delivered fully inline so a pathological
        // stack of enters can't grow the queue without bound (see MAX_QUEUED_SLICED_EMITS).
        const oldest = pendingSlicedEmits.shift();
        emitAll(oldest.event, oldest.payload);
      }
      pendingSlicedEmits.push({ event, payload, budget });
      return;
    }
    const fns = snapshotListeners(listeners, listenerSnapshots, event);
    if (!fns) {
      dispatchPresentation(event, payload);
      if (pendingSlicedEmits.length) {
        const next = pendingSlicedEmits.shift();
        startEmitSlice(next.event, next.payload, next.budget, remainingMs());
      }
      return;
    }
    emitSlice = { event, payload, fns, index: 0 };
    drainEmitSlice(budget, remainingMs());
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

  function drainEmitSlice(budget = SECTOR_ENTER_DRAIN_BUDGET, maxMs = Infinity) {
    // Capture the slice locally: a listener that clear()s the bus (screen teardown mid-present)
    // or starts a re-entrant sliced emit nulls/replaces `emitSlice` while this drain is on the
    // stack — writing through the global here crashed on the stale null (seen on glass would be
    // a hard TypeError inside the frame).
    const slice = emitSlice;
    if (!slice) return 0;
    const base = Math.max(1, Math.floor(Number(budget) || SECTOR_ENTER_DRAIN_BUDGET));
    // Depth-scaled like the presentation drain: a fixed count makes a ~100-listener backlog
    // take ~25 frames while the wall-clock deadline (not the count) is what actually bounds
    // each frame's spend. ceil/4 keeps per-frame cost identical at small depths.
    const limit = Math.max(base, Math.ceil(pendingEmitSliceCount() / 4));
    // Optional wall-clock budget alongside the listener count: a single heavyweight listener
    // can blow a count-only slice past the paint deadline. Checked after each listener so at
    // least one always runs per drain call (listener order is unchanged either way).
    const deadline = Number.isFinite(maxMs) && maxMs > 0
      ? performance.now() + maxMs
      : Infinity;
    let ran = 0;
    while (emitSlice === slice && ran < limit && slice.index < slice.fns.length) {
      const fn = slice.fns[slice.index];
      slice.index += 1;
      ran += 1;
      try { fn(slice.payload, slice.event); }
      catch (err) { console.error(`[bus] handler error for "${slice.event}":`, err); }
      if (performance.now() >= deadline) break;
    }
    if (emitSlice === slice && slice.index >= slice.fns.length) {
      emitSlice = null;
      if (pendingSlicedEmits.length) {
        const next = pendingSlicedEmits.shift();
        // The restart shares this drain's remaining window — a queued emit's first slice
        // can't spend past the caller's deadline (it still runs ≥1 listener per the
        // checked-after-each contract, so progress is guaranteed). The epsilon floor keeps
        // an expired window from widening back to Infinity — 0 would fail maxMs > 0.
        const remainingMs = Number.isFinite(deadline)
          ? Math.max(0.001, deadline - performance.now())
          : Infinity;
        startEmitSlice(next.event, next.payload, next.budget, remainingMs);
      }
    }
    return ran;
  }

  function pendingEmitSliceCount() {
    return (emitSlice ? emitSlice.fns.length - emitSlice.index : 0)
      + pendingSlicedEmits.length;
  }

  /** The frame-loop owner claims the presentation drain; headsless contexts stay inline. */
  function claimPresentationDrain() {
    presentationDrainClaimed = true;
  }

  function drainPresentationTail(budget = PRESENTATION_LISTENER_DRAIN_BUDGET, maxMs = Infinity) {
    const base = Math.max(1, Math.floor(Number(budget) || PRESENTATION_LISTENER_DRAIN_BUDGET));
    // Depth-scaled floor: a fixed 8/frame budget makes a kill clump or sector re-entry lag
    // linearly (~200ms at ~100 pending). Scaling with queued invocations caps per-emit lag at
    // ~4 frames while still spending only what the caller's frame-ms gate allows.
    const limit = Math.max(base, Math.ceil(pendingPresentationCount() / 4));
    // Wall-clock bound alongside the count: a backlog scales the count limit into hundreds of
    // listener invocations on one monotask, which is exactly the frame it must not run in.
    // Checked after each listener so at least one always drains (order unchanged either way);
    // undrained slices stay queued for the next frame's drain.
    const deadline = Number.isFinite(maxMs) && maxMs > 0
      ? performance.now() + maxMs
      : Infinity;
    let ran = 0;
    // Bounded interleave: strict priority let a sustained destroyed burst starve the
    // cosmetic lane for the burst's whole duration. After PRIORITY_INTERLEAVE consecutive
    // priority invocations the cosmetic head drains once (per-lane FIFO kept, priority
    // stays the major share), bounding cosmetic latency at K invocations while the burst
    // still drains ~8x faster than cosmetics.
    let priorityRun = 0;
    while (ran < limit) {
      const takePriority = presentationPriorityQueue.length > 0
        && (priorityRun < PRESENTATION_PRIORITY_INTERLEAVE || presentationQueue.length === 0);
      const queue = takePriority ? presentationPriorityQueue
        : presentationQueue.length ? presentationQueue
        : null;
      if (!queue) break;
      if (queue === presentationPriorityQueue) priorityRun += 1;
      else priorityRun = 0;
      const head = queue[0];
      const fn = head.fns[head.index];
      head.index += 1;
      ran += 1;
      try { fn(head.payload, head.event); }
      catch (err) { console.error(`[bus] presentation handler error for "${head.event}":`, err); }
      if (head.index >= head.fns.length) recyclePresentationSlice(queue.shift());
      if (performance.now() >= deadline) break;
    }
    return ran;
  }

  function pendingPresentationCount() {
    let n = 0;
    for (const slice of presentationPriorityQueue) n += slice.fns.length - slice.index;
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
    const batchGeneration = generation;
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      if (generation !== batchGeneration) {
        // clear() ran while this batch was on the stack: everything still in it predates the
        // teardown and must not reach listeners (re)bound on the new bus. Recycle the slot;
        // events queued after clear() live in the new deferred array and flush normally.
        item.event = null;
        item.payload = null;
        deferredPool.push(item);
        continue;
      }
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
    presentationPriorityQueue.length = 0;
    presentationOnceOnlyCount = 0;
    presentationSlicePool.length = 0;
    payloadSnapshots.clear();
    deferred = [];
    deferredPool.length = 0;
    sliceBudgets.clear();
    emitSlice = null;
    // A stranded queue outlives the slice that fed it: pendingEmitSliceCount() would
    // never converge while drainEmitSlice early-returns on emitSlice === null.
    pendingSlicedEmits.length = 0;
    generation += 1;
  }

  return {
    on, off, once, emit, queue, flush, clear,
    setEmitSliceBudget, drainEmitSlice, pendingEmitSliceCount,
    claimPresentationDrain, drainPresentationTail, pendingPresentationCount,
    setPayloadSnapshot,
    _listeners: listeners,
  };
}

export const EventBus = createBus; // alias per manifest
