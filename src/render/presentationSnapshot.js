// spaceface.presentationSnapshot.v1 — the dense per-frame view the renderer consumes.
//
// WHY DENSE
// ---------
// Presentation currently walks live entities and reads fields off each object to sync transforms.
// That is one pointer chase per entity per frame, and the cost is dominated by cache misses rather
// than arithmetic: entity objects are scattered across the heap, so every field read is a potential
// miss and none of the reads prefetch each other. It also allocates — every per-entity intermediate
// is garbage the frame has to pay for later.
//
// A snapshot is a struct-of-arrays instead: one typed array per field, entity `i` at index `i` in
// all of them. Reading every position is then a linear scan of one contiguous Float32Array, which
// prefetches perfectly and touches no object headers. Crucially the arrays are allocated once and
// reused, so per-frame allocation is zero no matter how many entities there are — the property the
// >=5x-at-5x-population gate actually measures.
//
// The snapshot is a *view*, never truth. The sim owns state; this is a derived, per-frame copy that
// the renderer may read and must never write back through.

export const PRESENTATION_SNAPSHOT_SCHEMA = 'spaceface.presentationSnapshot.v1';

/** Field layout. Grouping the three position components adjacently is deliberate: the renderer
 *  reads x/y/z together, so one cache line serves all three. */
export const SNAPSHOT_COLUMNS = Object.freeze({
  position: { stride: 3, kind: 'f32' },
  quaternion: { stride: 4, kind: 'f32' },
  scale: { stride: 3, kind: 'f32' },
  tint: { stride: 3, kind: 'f32' },
  entityId: { stride: 1, kind: 'u32' },
  archetype: { stride: 1, kind: 'u32' },
  flags: { stride: 1, kind: 'u32' },
});

export const SNAPSHOT_FLAG = Object.freeze({
  VISIBLE: 1 << 0,
  CASTS_SHADOW: 1 << 1,
  DAMAGED: 1 << 2,
  CLOAKED: 1 << 3,
});

/** Journal event kinds, in the order the renderer must apply them. Ordering is part of the
 *  contract: a destroy that overtakes its spawn would leak a slot. */
export const JOURNAL_EVENT = Object.freeze({
  SPAWN: 1,
  DESTROY: 2,
  VISUAL: 3,
});

const GROWTH_FACTOR = 2;

/**
 * Create a reusable dense snapshot.
 *
 * Capacity grows by doubling and never shrinks. Shrinking would trade a steady-state allocation of
 * zero for repeated reallocation whenever population oscillates around a threshold, which is exactly
 * the hitch this contract exists to remove.
 */
export function createPresentationSnapshot(options = {}) {
  const initialCapacity = Math.max(1, options.capacity || 256);
  let capacity = 0;
  let count = 0;
  let generation = 0;
  let grows = 0;

  const columns = {};

  function allocate(nextCapacity) {
    for (const [name, spec] of Object.entries(SNAPSHOT_COLUMNS)) {
      const length = nextCapacity * spec.stride;
      const next = spec.kind === 'u32' ? new Uint32Array(length) : new Float32Array(length);
      if (columns[name]) next.set(columns[name].subarray(0, Math.min(columns[name].length, length)));
      columns[name] = next;
    }
    capacity = nextCapacity;
    grows++;
  }
  allocate(initialCapacity);

  // The journal is a ring of flat triples so recording an event allocates nothing either. Events are
  // consumed in insertion order; a dropped event is reported rather than silently lost, because a
  // renderer that missed a spawn is worse off believing it saw everything.
  const journalCapacity = Math.max(16, options.journalCapacity || 1024);
  const journalKind = new Uint32Array(journalCapacity);
  const journalIndex = new Uint32Array(journalCapacity);
  const journalPayload = new Uint32Array(journalCapacity);
  let journalCount = 0;
  let journalDropped = 0;

  return {
    schema: PRESENTATION_SNAPSHOT_SCHEMA,
    columns,

    get count() { return count; },
    get capacity() { return capacity; },
    get generation() { return generation; },
    /** Times the backing arrays were reallocated. Steady state must be 1 — see the gate. */
    get grows() { return grows; },
    get journalDropped() { return journalDropped; },

    /**
     * Begin a frame. Reserving up front means the write loop below never branches on capacity, so a
     * frame either grows exactly once or not at all.
     */
    beginFrame(expectedCount) {
      count = 0;
      journalCount = 0;
      generation++;
      if (expectedCount > capacity) {
        let next = capacity;
        while (next < expectedCount) next *= GROWTH_FACTOR;
        allocate(next);
      }
      return this;
    },

    /**
     * Append one entity. Returns its snapshot index. No object is created and no field is read
     * through a pointer — the caller passes primitives, which is what keeps the loop linear.
     */
    write(entityId, archetype, px, py, pz, qx, qy, qz, qw, sx, sy, sz, flags) {
      const index = count++;
      if (index >= capacity) allocate(capacity * GROWTH_FACTOR);
      const p = index * 3;
      const q = index * 4;
      columns.position[p] = px; columns.position[p + 1] = py; columns.position[p + 2] = pz;
      columns.quaternion[q] = qx; columns.quaternion[q + 1] = qy;
      columns.quaternion[q + 2] = qz; columns.quaternion[q + 3] = qw;
      columns.scale[p] = sx; columns.scale[p + 1] = sy; columns.scale[p + 2] = sz;
      columns.entityId[index] = entityId >>> 0;
      columns.archetype[index] = archetype >>> 0;
      columns.flags[index] = flags >>> 0;
      return index;
    },

    setTint(index, r, g, b) {
      const t = index * 3;
      columns.tint[t] = r; columns.tint[t + 1] = g; columns.tint[t + 2] = b;
    },

    /** Record an ordered event. Overflow is counted, never silently dropped. */
    record(kind, index, payload = 0) {
      if (journalCount >= journalCapacity) { journalDropped++; return false; }
      journalKind[journalCount] = kind;
      journalIndex[journalCount] = index >>> 0;
      journalPayload[journalCount] = payload >>> 0;
      journalCount++;
      return true;
    },

    /** Apply events in insertion order. The visitor receives primitives, so draining allocates nothing. */
    drainJournal(visit) {
      for (let i = 0; i < journalCount; i++) visit(journalKind[i], journalIndex[i], journalPayload[i]);
      const drained = journalCount;
      journalCount = 0;
      return drained;
    },

    get journalCount() { return journalCount; },
  };
}
