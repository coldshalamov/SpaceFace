// Per-tick dirty bits for TABLE systems. Entity objects stay authoritative;
// systems that can skip a still body read this journal instead of the fat list.
// Generation skip: stale slots are ignored without clearing the whole bit array.

export const DIRTY_JOURNAL_SCHEMA = 'spaceface.dirtyJournal.v2';

export const DIRTY = Object.freeze({
  MEMBERSHIP: 1 << 0,
  POSE: 1 << 1,
  COMBAT: 1 << 2,
  CARGO: 1 << 3,
});

function numericId(id) {
  const n = typeof id === 'number' ? id : Number(id);
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

function growColumns(journal, minId) {
  const need = minId + 1;
  if (need <= journal.capacity) return;
  let next = Math.max(64, journal.capacity || 64);
  while (next < need) next *= 2;
  const gen = new Uint32Array(next);
  const bits = new Uint32Array(next);
  if (journal.entityGen) gen.set(journal.entityGen);
  if (journal.entityBits) bits.set(journal.entityBits);
  journal.entityGen = gen;
  journal.entityBits = bits;
  journal.capacity = next;
}

function growPacked(journal, need) {
  if (need <= journal.packedCapacity) return;
  let next = Math.max(32, journal.packedCapacity || 32);
  while (next < need) next *= 2;
  const ids = new Uint32Array(next);
  if (journal.ids) ids.set(journal.ids.subarray(0, journal.count));
  journal.ids = ids;
  journal.packedCapacity = next;
}

function createJournal() {
  return {
    schema: DIRTY_JOURNAL_SCHEMA,
    tick: -1,
    generation: 1,
    capacity: 0,
    packedCapacity: 0,
    count: 0,
    entityGen: new Uint32Array(0),
    entityBits: new Uint32Array(0),
    ids: new Uint32Array(0),
  };
}

export function ensureDirtyJournal(state) {
  if (!state || typeof state !== 'object') return null;
  let journal = state.dirtyJournal;
  if (journal && journal.schema === DIRTY_JOURNAL_SCHEMA
    && journal.entityBits instanceof Uint32Array
    && journal.entityGen instanceof Uint32Array
    && journal.ids instanceof Uint32Array) {
    return journal;
  }
  journal = createJournal();
  state.dirtyJournal = journal;
  return journal;
}

export function beginDirtyTick(state, tick) {
  const journal = ensureDirtyJournal(state);
  if (!journal) return null;
  const t = tick | 0;
  if (journal.tick !== t) {
    journal.tick = t;
    let generation = (journal.generation + 1) >>> 0;
    if (generation === 0) generation = 1;
    journal.generation = generation;
    journal.count = 0;
  }
  return journal;
}

export function markDirty(state, id, mask) {
  const nid = numericId(id);
  if (nid < 0) return;
  const journal = ensureDirtyJournal(state);
  if (!journal) return;
  const bits = mask | 0;
  if (!bits) return;
  growColumns(journal, nid);
  const generation = journal.generation;
  if (journal.entityGen[nid] !== generation) {
    journal.entityGen[nid] = generation;
    journal.entityBits[nid] = bits;
    growPacked(journal, journal.count + 1);
    journal.ids[journal.count++] = nid;
    return;
  }
  journal.entityBits[nid] |= bits;
}

export function isDirty(state, id, mask) {
  const journal = state && state.dirtyJournal;
  if (!journal || !(journal.entityBits instanceof Uint32Array)) return true;
  const nid = numericId(id);
  if (nid < 0 || nid >= journal.capacity) return false;
  if (journal.entityGen[nid] !== journal.generation) return false;
  return (journal.entityBits[nid] & (mask | 0)) !== 0;
}

/** Fail-open true when the journal is missing so TABLE scans still run. */
export function hasDirty(state, mask) {
  const journal = state && state.dirtyJournal;
  if (!journal || !(journal.ids instanceof Uint32Array)) return true;
  const want = mask | 0;
  const generation = journal.generation;
  const count = journal.count | 0;
  for (let i = 0; i < count; i++) {
    const id = journal.ids[i];
    if (journal.entityGen[id] !== generation) continue;
    if ((journal.entityBits[id] & want) !== 0) return true;
  }
  return false;
}

export function collectDirtyIds(state, mask, out = []) {
  out.length = 0;
  const journal = state && state.dirtyJournal;
  if (!journal || !(journal.ids instanceof Uint32Array)) return out;
  const want = mask | 0;
  const generation = journal.generation;
  const count = journal.count | 0;
  for (let i = 0; i < count; i++) {
    const id = journal.ids[i];
    if (journal.entityGen[id] !== generation) continue;
    if ((journal.entityBits[id] & want) !== 0) out.push(id);
  }
  return out;
}

export function dirtyCount(state) {
  const journal = state && state.dirtyJournal;
  return journal ? journal.count | 0 : 0;
}
