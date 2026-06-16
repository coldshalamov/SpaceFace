// Synchronous event bus with a deferred queue (ARCHITECTURE §4). Most events fire
// synchronously; entity spawn/destroy are queued and flushed at the end of a sim step
// so the entity set is never mutated mid-iteration.

export function createBus() {
  const listeners = new Map(); // event -> Set<fn>
  let deferred = [];

  function on(event, fn) {
    let set = listeners.get(event);
    if (!set) { set = new Set(); listeners.set(event, set); }
    set.add(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    const set = listeners.get(event);
    if (set) set.delete(fn);
  }

  function once(event, fn) {
    const unsub = on(event, (p, e) => { unsub(); fn(p, e); });
    return unsub;
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    // copy to tolerate handlers that subscribe/unsubscribe during dispatch
    for (const fn of [...set]) {
      try { fn(payload, event); }
      catch (err) { console.error(`[bus] handler error for "${event}":`, err); }
    }
  }

  /** Defer an event to the next flush() (end of sim step). */
  function queue(event, payload) { deferred.push([event, payload]); }

  function flush() {
    if (!deferred.length) return;
    const batch = deferred;
    deferred = [];
    for (const [event, payload] of batch) emit(event, payload);
  }

  function clear() { listeners.clear(); deferred = []; }

  return { on, off, once, emit, queue, flush, clear, _listeners: listeners };
}

export const EventBus = createBus; // alias per manifest
