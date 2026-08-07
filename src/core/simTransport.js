// The sim/render/platform boundary, as a transport that can be proven before any thread exists.
//
// WHY IN-PROCESS FIRST
// --------------------
// Moving the sim to a Worker changes two things at once: the ownership boundary and the execution
// context. If both move together and the result diverges, there is no way to tell whether the bug is
// a genuine ownership violation (the renderer was quietly mutating sim state) or a transfer artifact
// (a structured clone dropping a field, a detached buffer, an out-of-order message). Debugging that
// across a thread boundary, with no shared stack, is the expensive way to find out.
//
// So the boundary moves first and the thread moves second. This transport runs both owners in one
// process over a MessageChannel — the same asynchronous, copy-only, ordered-delivery semantics a real
// Worker has, minus the thread. Every ownership violation surfaces here, synchronously debuggable,
// against a digest that must match the single-threaded baseline exactly. Only once digests agree is
// swapping in a real Worker a transport change rather than a leap.
//
// The digest is the whole point. Two owners "looking right" proves nothing; a frame-by-frame hash of
// what the sim published is what makes divergence impossible to miss.

export const SIM_TRANSPORT_SCHEMA = 'spaceface.simTransport.v1';

export const TRANSPORT_MESSAGE = Object.freeze({
  STEP: 'step',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
});

/**
 * FNV-1a over the published floats, quantised first.
 *
 * Quantisation matters: raw float bits differ harmlessly between a direct call and a structured
 * clone round-trip on some values, and a digest that trips on that noise would cry wolf on every
 * frame. Quantising to a fixed grid keeps the digest sensitive to real divergence — a position that
 * actually moved — while ignoring representation noise. The grid is fine enough that any difference
 * a player could see changes the hash.
 */
export function digestSnapshot(snapshot, quantum = 1e-4) {
  let hash = 0x811c9dc5;
  const mix = (value) => {
    hash ^= value >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  const columns = snapshot.columns;
  const count = snapshot.count;
  mix(count);
  for (let i = 0; i < count; i++) {
    mix(columns.entityId[i]);
    mix(columns.archetype[i]);
    mix(columns.flags[i]);
    const p = i * 3;
    const q = i * 4;
    for (let k = 0; k < 3; k++) mix(Math.round(columns.position[p + k] / quantum));
    for (let k = 0; k < 4; k++) mix(Math.round(columns.quaternion[q + k] / quantum));
    for (let k = 0; k < 3; k++) mix(Math.round(columns.scale[p + k] / quantum));
  }
  return hash >>> 0;
}

/**
 * A MessageChannel-shaped transport that does not require a Worker.
 *
 * `globalThis.MessageChannel` is used when present so the production path and the provable path are
 * the same object. The fallback is a queue with the same contract — asynchronous delivery, order
 * preserved — so the transport is testable in environments without one, and so a bug can never be
 * hidden by synchronous delivery that a real Worker would not have given us.
 */
export function createSimTransport(options = {}) {
  const listeners = { sim: null, render: null };
  const journal = [];
  let delivered = 0;
  let posted = 0;

  const Channel = options.MessageChannel || globalThis.MessageChannel;
  const channel = Channel ? new Channel() : null;

  // Delivery must never be synchronous. A synchronous transport would let the renderer observe sim
  // state inside the sim's own step, which is exactly the ownership violation this is meant to catch
  // — and it would then break the moment a real Worker made delivery asynchronous.
  const schedule = options.schedule
    || (typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => Promise.resolve().then(fn));

  function deliver(side, message) {
    delivered++;
    const listener = listeners[side];
    if (listener) listener(message);
  }

  if (channel) {
    channel.port1.onmessage = (event) => deliver('render', event.data);
    channel.port2.onmessage = (event) => deliver('sim', event.data);
    channel.port1.start?.();
    channel.port2.start?.();
  }

  return {
    schema: SIM_TRANSPORT_SCHEMA,
    /** True when a real MessageChannel backs this transport. */
    get structured() { return !!channel; },
    get posted() { return posted; },
    get delivered() { return delivered; },
    get journal() { return journal; },

    onRender(listener) { listeners.render = listener; },
    onSim(listener) { listeners.sim = listener; },

    /** Sim → render. The payload is copied, never shared, so the renderer cannot reach back. */
    publish(kind, payload) {
      posted++;
      journal.push({ kind, sequence: posted });
      const message = { kind, sequence: posted, payload };
      if (channel) channel.port2.postMessage(message);
      else schedule(() => deliver('render', message));
      return posted;
    },

    /** Render/platform → sim. Same one-way copy in the other direction. */
    request(kind, payload) {
      posted++;
      const message = { kind, sequence: posted, payload };
      if (channel) channel.port1.postMessage(message);
      else schedule(() => deliver('sim', message));
      return posted;
    },

    close() {
      channel?.port1.close();
      channel?.port2.close();
    },
  };
}

/**
 * Flatten a snapshot into a transferable payload.
 *
 * `subarray(0, count)` rather than the whole buffer: capacity is deliberately larger than count, and
 * copying the slack would grow the message with the high-water mark instead of the live population.
 */
export function packSnapshot(snapshot) {
  const count = snapshot.count;
  return {
    count,
    position: snapshot.columns.position.slice(0, count * 3),
    quaternion: snapshot.columns.quaternion.slice(0, count * 4),
    scale: snapshot.columns.scale.slice(0, count * 3),
    entityId: snapshot.columns.entityId.slice(0, count),
    archetype: snapshot.columns.archetype.slice(0, count),
    flags: snapshot.columns.flags.slice(0, count),
  };
}

/** Rehydrate a packed payload into the snapshot-shaped view the renderer reads. */
export function unpackSnapshot(packed) {
  return { count: packed.count, columns: packed };
}
