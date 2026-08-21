// Incremental save journal. Capture dirty world facts outside the present
// callback; commit on a safe cadence.

export const SAVE_JOURNAL_EVENT = Object.freeze({
  UPSERT_RECORD: 1,
  DESTROY_RECORD: 2,
  RESOURCE_BODY: 3,
  PLAYER: 4,
});

export function createSaveDirtyJournal(capacity = 256) {
  const size = Math.max(16, capacity | 0);
  const kinds = new Uint32Array(size);
  const sequences = new Uint32Array(size);
  const payloads = new Array(size);
  let read = 0;
  let write = 0;
  let count = 0;
  let sequence = 0;
  let dropped = 0;

  return {
    record(kind, payload) {
      if (count >= size) {
        dropped++;
        return false;
      }
      sequence++;
      kinds[write] = kind >>> 0;
      sequences[write] = sequence;
      payloads[write] = payload;
      write = (write + 1) % size;
      count++;
      return true;
    },
    drain(visit) {
      let n = 0;
      while (count > 0) {
        visit(kinds[read], payloads[read], sequences[read]);
        payloads[read] = null;
        read = (read + 1) % size;
        count--;
        n++;
      }
      return n;
    },
    get pending() { return count; },
    get dropped() { return dropped; },
    get sequence() { return sequence; },
  };
}

export function shouldSerializeDuringPresent() {
  return false;
}
