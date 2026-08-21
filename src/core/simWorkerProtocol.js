// Simulation Worker transport contract. Production stays on the main thread
// until the snapshot fence and a copy-cost spike both pass.

export const SIM_WORKER_TRANSPORT = Object.freeze({
  SHARED_ARRAY_BUFFER: 'sab',
  FALLBACK_POST_MESSAGE: 'postMessage',
});

export function isSimulationWorkerEnabled(_state = null) {
  return false;
}

export function selectSimWorkerTransport(options = {}) {
  if (isSimulationWorkerEnabled(options.state)) {
    if (options.sharedArrayBuffer === true) return SIM_WORKER_TRANSPORT.SHARED_ARRAY_BUFFER;
    return SIM_WORKER_TRANSPORT.FALLBACK_POST_MESSAGE;
  }
  return null;
}

export function createCommandRing(capacity = 64) {
  const size = Math.max(8, capacity | 0);
  const kinds = new Uint32Array(size);
  const sequences = new Uint32Array(size);
  let read = 0;
  let write = 0;
  let count = 0;
  let dropped = 0;
  let sequence = 0;

  return {
    push(kind) {
      if (count >= size) {
        dropped++;
        return false;
      }
      sequence++;
      kinds[write] = kind >>> 0;
      sequences[write] = sequence;
      write = (write + 1) % size;
      count++;
      return true;
    },
    pop() {
      if (count <= 0) return null;
      const item = Object.freeze({ kind: kinds[read], sequence: sequences[read] });
      read = (read + 1) % size;
      count--;
      return item;
    },
    get pending() { return count; },
    get dropped() { return dropped; },
  };
}
