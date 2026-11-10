// Incremental save journal. Producers record small, authoritative dirty facts during the sim;
// the save owner peeks them at a snapshot boundary outside the presentation callback and
// acknowledges them only after the complete compatibility save succeeds. A failed save therefore
// leaves the facts available for the next attempt.

export const SAVE_JOURNAL_EVENT = Object.freeze({
  UPSERT_RECORD: 1,
  DESTROY_RECORD: 2,
  RESOURCE_BODY: 3,
  PLAYER: 4,
});

function cloneBoundaryPayload(payload) {
  if (payload == null || typeof payload !== 'object') return payload;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(payload); } catch (_) {}
  }
  if (Array.isArray(payload)) return payload.map(cloneBoundaryPayload);
  const out = {};
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (typeof value === 'function' || typeof value === 'symbol') continue;
    out[key] = cloneBoundaryPayload(value);
  }
  return out;
}

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

  function collectEntries() {
    const entries = [];
    for (let offset = 0; offset < count; offset++) {
      const index = (read + offset) % size;
      entries.push(Object.freeze({
        kind: kinds[index],
        payload: cloneBoundaryPayload(payloads[index]),
        sequence: sequences[index],
      }));
    }
    return Object.freeze({
      entries: Object.freeze(entries),
      throughSequence: sequence,
      dropped,
    });
  }

  function drain(visit) {
    if (typeof visit !== 'function') throw new TypeError('save journal visitor must be a function');
    let n = 0;
    while (count > 0) {
      visit(kinds[read], payloads[read], sequences[read]);
      payloads[read] = null;
      read = (read + 1) % size;
      count--;
      n++;
    }
    return n;
  }

  function acknowledgeThrough(targetSequence) {
    const target = Number(targetSequence);
    if (!Number.isFinite(target)) return 0;
    let n = 0;
    while (count > 0 && sequences[read] <= target) {
      payloads[read] = null;
      read = (read + 1) % size;
      count--;
      n++;
    }
    return n;
  }

  return {
    record(kind, payload) {
      if (count >= size) {
        dropped++;
        return false;
      }
      sequence++;
      kinds[write] = kind >>> 0;
      sequences[write] = sequence >>> 0;
      // Event payloads may be backed by mutable state objects. Copy the small dirty fact at record
      // time so a later sim tick cannot rewrite the meaning of this boundary.
      payloads[write] = cloneBoundaryPayload(payload);
      write = (write + 1) % size;
      count++;
      return true;
    },
    drain,
    /** Non-destructive immutable boundary payload for a save capture. */
    peek() { return collectEntries(); },
    /** Compatibility helper for callers that explicitly own a destructive drain. */
    snapshot() {
      const boundary = collectEntries();
      drain(() => {});
      return boundary;
    },
    acknowledgeThrough,
    clear() { drain(() => {}); },
    reset() {
      drain(() => {});
      sequence = 0;
      dropped = 0;
    },
    get pending() { return count; },
    get dropped() { return dropped; },
    get sequence() { return sequence; },
  };
}

/**
 * Presentation is a read-only consumer. Save capture is scheduled from the sim/event task and
 * this policy remains an explicit false rather than pretending a presentation callback is a safe
 * serialization boundary.
 */
export function shouldSerializeDuringPresent() {
  return false;
}

export function captureSaveSnapshotBoundary(journal, state = null) {
  const snapshot = journal && typeof journal.peek === 'function'
    ? journal.peek()
    : journal && typeof journal.snapshot === 'function'
      ? journal.snapshot()
    : { entries: [], throughSequence: 0, dropped: 0 };
  return Object.freeze({
    tick: state && Number.isInteger(state.tick) ? state.tick : null,
    simTime: state && Number.isFinite(state.simTime) ? state.simTime : null,
    entries: snapshot.entries,
    throughSequence: snapshot.throughSequence,
    dropped: snapshot.dropped,
  });
}

export function acknowledgeSaveSnapshotBoundary(journal, boundary) {
  if (!journal || typeof journal.acknowledgeThrough !== 'function' || !boundary) return 0;
  return journal.acknowledgeThrough(boundary.throughSequence);
}
