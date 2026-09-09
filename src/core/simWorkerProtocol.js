// Phase-14 simulation-worker transport contract.
//
// The live game deliberately stays on the deterministic main-thread fallback until the
// presentation snapshot, active-set membership, and cross-origin-isolated worker route are all
// available. A Worker object by itself is not an authority boundary: posting the live abstract
// set every frame is a whole-world structured clone and can be substantially worse than the
// single-thread path it is meant to replace.

export const SIM_WORKER_TRANSPORT = Object.freeze({
  SHARED_ARRAY_BUFFER: 'sab',
  FALLBACK_POST_MESSAGE: 'postMessage',
  MAIN_THREAD: 'main-thread',
});

export const SIM_WORKER_BUFFER_COUNT = 3;
export const SIM_WORKER_HEADER_WORDS = 4;
export const SIM_WORKER_RECORD_STRIDE = 6;
export const SIM_WORKER_SLOT_STATUS = Object.freeze({
  FREE: 0,
  READY: 1,
  PROCESSING: 2,
  DONE: 3,
});

function globalObject() {
  return typeof globalThis !== 'undefined' ? globalThis : {};
}

export function isSimulationWorkerEnabled(_state = null) {
  const root = globalObject();
  return typeof root.Worker === 'function'
    && (typeof root.window !== 'undefined' || typeof root.document !== 'undefined');
}

/**
 * SAB workers require a shared-memory capable realm. Browsers expose a boolean
 * `crossOriginIsolated`; Electron and a few embedded shells omit it, so an omitted value is
 * accepted when the constructors are present and the Worker creation probe still gets the final
 * say. An explicit `false` is never guessed around.
 */
export function hasSharedSimWorkerPrerequisites() {
  const root = globalObject();
  if (!isSimulationWorkerEnabled()) return false;
  if (typeof root.SharedArrayBuffer !== 'function' || typeof root.Atomics !== 'object') return false;
  if (root.crossOriginIsolated === false) return false;
  return typeof root.URL === 'function' || typeof root.URL?.createObjectURL === 'function';
}

export function selectSimWorkerTransport(options = {}) {
  const root = globalObject();
  const enabled = options.enabled !== false;
  if (!enabled && options.force !== true) return null;
  if (!isSimulationWorkerEnabled() && options.force !== true) return null;
  if ((options.sharedArrayBuffer === true && typeof root.SharedArrayBuffer === 'function')
    || hasSharedSimWorkerPrerequisites()) {
    return SIM_WORKER_TRANSPORT.SHARED_ARRAY_BUFFER;
  }
  // Structured-clone transport is retained only as an explicit lab seam. It is never selected by
  // the production host because it copies the full abstract set at the cadence of classification.
  if (options.allowPostMessage === true) return SIM_WORKER_TRANSPORT.FALLBACK_POST_MESSAGE;
  return SIM_WORKER_TRANSPORT.MAIN_THREAD;
}

export function createSharedSimWorkerBuffers(capacity = 1024) {
  const root = globalObject();
  if (typeof root.SharedArrayBuffer !== 'function') return null;
  const count = Math.max(16, capacity | 0);
  const bytes = SIM_WORKER_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT
    + count * SIM_WORKER_RECORD_STRIDE * Float64Array.BYTES_PER_ELEMENT;
  try {
    const buffers = Array.from(
      { length: SIM_WORKER_BUFFER_COUNT },
      () => new root.SharedArrayBuffer(bytes),
    );
    return Object.freeze({ buffers, capacity: count, bytes });
  } catch (_) {
    return null;
  }
}

/**
 * Small ordered command/event ring used by the worker seam. The ring is intentionally allocation
 * free while publishing and has observable sequence/drop counters; callers must not treat a
 * dropped command as if the worker consumed it.
 */
export function createSequenceRing(capacity = 64) {
  const size = Math.max(8, capacity | 0);
  const kinds = new Uint32Array(size);
  const payloads = new Uint32Array(size);
  const sequences = new Uint32Array(size);
  let read = 0;
  let write = 0;
  let count = 0;
  let dropped = 0;
  let sequence = 0;
  let lastPoppedSequence = 0;

  return {
    push(kind, payload = 0) {
      if (count >= size) {
        dropped++;
        return false;
      }
      sequence++;
      kinds[write] = kind >>> 0;
      payloads[write] = payload >>> 0;
      sequences[write] = sequence >>> 0;
      write = (write + 1) % size;
      count++;
      return true;
    },
    pop() {
      if (count <= 0) return null;
      const item = {
        kind: kinds[read],
        sequence: sequences[read],
      };
      // Preserve the original command-ring shape for payload-less commands while allowing the
      // phase-14 event lane to carry a compact scalar token when one was published.
      if (payloads[read] !== 0) item.payload = payloads[read];
      Object.freeze(item);
      read = (read + 1) % size;
      count--;
      lastPoppedSequence = item.sequence;
      return item;
    },
    clear() {
      read = 0;
      write = 0;
      count = 0;
    },
    get pending() { return count; },
    get dropped() { return dropped; },
    get sequence() { return sequence; },
    get lastPoppedSequence() { return lastPoppedSequence; },
  };
}

export function createCommandRing(capacity = 64) {
  return createSequenceRing(capacity);
}

export function createEventRing(capacity = 64) {
  return createSequenceRing(capacity);
}
