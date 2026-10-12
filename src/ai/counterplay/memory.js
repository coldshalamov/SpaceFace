// Serializable counterplay mind. Plain data only: a reload is JSON in, JSON out.
// The live tactical adapter preserves this object with its hull's ordinary data.ai save record.

const MEMORY_VERSION = 1;

export function createCounterplayMemory(doctrineId) {
  return {
    version: MEMORY_VERSION,
    doctrineId: String(doctrineId || ''),
    phase: 'acquire',
    phaseSince: 0,
    commit: null,
    delay: [],
    best: 0,
    stallSince: 0,
    disengage: false,
    done: false,
    latchIssued: false,
    identity: {},
    notes: {},
  };
}

export function serializeCounterplayMemory(memory) {
  return JSON.parse(JSON.stringify(memory || createCounterplayMemory('')));
}

export function restoreCounterplayMemory(snapshot, doctrineId) {
  const fresh = createCounterplayMemory(doctrineId);
  if (!snapshot || typeof snapshot !== 'object') return fresh;
  if (snapshot.version !== MEMORY_VERSION) return fresh;
  if (doctrineId && snapshot.doctrineId && snapshot.doctrineId !== doctrineId) return fresh;
  const restored = createCounterplayMemory(snapshot.doctrineId || doctrineId);
  restored.phase = typeof snapshot.phase === 'string' ? snapshot.phase : 'acquire';
  restored.phaseSince = int(snapshot.phaseSince);
  restored.commit = snapshot.commit && typeof snapshot.commit === 'object'
    ? JSON.parse(JSON.stringify(snapshot.commit))
    : null;
  restored.delay = Array.isArray(snapshot.delay) ? JSON.parse(JSON.stringify(snapshot.delay)) : [];
  restored.best = num(snapshot.best);
  restored.stallSince = int(snapshot.stallSince);
  restored.disengage = snapshot.disengage === true;
  restored.done = snapshot.done === true;
  restored.latchIssued = snapshot.latchIssued === true;
  restored.identity = snapshot.identity && typeof snapshot.identity === 'object'
    ? JSON.parse(JSON.stringify(snapshot.identity))
    : {};
  restored.notes = snapshot.notes && typeof snapshot.notes === 'object'
    ? JSON.parse(JSON.stringify(snapshot.notes))
    : {};
  return restored;
}

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

function int(value) {
  return Number.isInteger(value) ? value : 0;
}
