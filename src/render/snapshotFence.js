// Presentation snapshot fence. Render reads the latest complete packed frame,
// never live entity objects. Required before a simulation Worker.

import { createPresentationSnapshot, SNAPSHOT_COLUMNS } from './presentationSnapshot.js';

export const SNAPSHOT_FENCE_BUFFERS = 3;

/** Bytes written into the packed columns for one entity. All column kinds are 4-byte. */
export const PACKED_BYTES_PER_ENTITY = Object.values(SNAPSHOT_COLUMNS)
  .reduce((total, spec) => total + spec.stride, 0) * 4;
/** Bytes recorded for one journal event: kind + index + payload, all u32. */
export const PACKED_BYTES_PER_JOURNAL_EVENT = 12;
/** Commits of byte counts kept for p50/p95 reporting. Preallocated — no per-frame allocation. */
export const PACK_BYTES_RING = 64;

function readonlyColumns(columns) {
  // Ownership is the immutability boundary: only the writer slot can call
  // write(), and commit rotates to another slot before the next pack. Do not
  // proxy typed-array element reads on the render hot path. The facade is built once per buffer;
  // getters resolve the current typed-array value because presentationSnapshot grows by replacing
  // columns[name] when a population spike exceeds capacity.
  const facade = {};
  for (const name of Object.keys(columns || {})) {
    Object.defineProperty(facade, name, {
      enumerable: true,
      configurable: false,
      get() { return columns[name]; },
    });
  }
  return Object.freeze(facade);
}

export function createSnapshotFence(options = {}) {
  const buffers = Array.from({ length: SNAPSHOT_FENCE_BUFFERS }, () => {
    const snapshot = createPresentationSnapshot({
      capacity: options.capacity || 256,
      journalCapacity: options.journalCapacity,
    });
    const indexByEntityId = new Map();
    const publishedColumns = readonlyColumns(snapshot.columns);
    const state = {
      snapshot,
      indexByEntityId,
      sealed: true,
      simTime: 0,
      sequence: 0,
      // Interpolation epoch. Two packs may only be interpolated against each other when the pose
      // stream between them is continuous; a sector jump or a mirror rebuild reassigns slots and
      // teleports every body, so packs on either side of one are not comparable.
      poseEpoch: 0,
      // Slot→packed-row hint table for the pack that committed this buffer. The mesh
      // apply resolves a row by one typed-array read instead of an identity-map probe;
      // every read is verified against the entityId column and misses fall back to the
      // map, so the table is a pure accelerator — semantics stay fail-closed.
      slotRows: new Int32Array(0),
      // When true the identity map does not describe this buffer's latest pack (the
      // membership-stable fast path left it stale on purpose). The first identity
      // lookup rebuilds it from the entityId column — a pure derivation, so callers
      // that never probe pay nothing.
      indexStale: false,
    };
    function ensureSlotRows(slots) {
      const needed = Math.max(0, Math.floor(Number(slots) || 0));
      if (state.slotRows.length >= needed) return;
      let next = state.slotRows.length || 64;
      while (next < needed) next *= 2;
      state.slotRows = new Int32Array(next);
    }
    function rebuildIndex() {
      indexByEntityId.clear();
      const ids = snapshot.columns.entityId;
      const n = snapshot.count | 0;
      for (let i = 0; i < n; i++) indexByEntityId.set(ids[i] >>> 0, i);
      state.indexStale = false;
    }
    const publishedIndexByEntityId = Object.freeze({
      get(entityId) { if (state.indexStale) rebuildIndex(); return indexByEntityId.get(entityId); },
      has(entityId) { if (state.indexStale) rebuildIndex(); return indexByEntityId.has(entityId); },
      get size() { if (state.indexStale) rebuildIndex(); return indexByEntityId.size; },
    });
    state.publishedIndexByEntityId = publishedIndexByEntityId;
    state.publishedColumns = publishedColumns;
    const writable = {
      get schema() { return snapshot.schema; },
      get columns() { return snapshot.columns; },
      get count() { return snapshot.count; },
      get capacity() { return snapshot.capacity; },
      get generation() { return snapshot.generation; },
      get journalDropped() { return snapshot.journalDropped; },
      get slotRows() { return state.slotRows; },
      beginFrame(expectedCount, slotCapacity = 0) {
        if (state.sealed) state.sealed = false;
        indexByEntityId.clear();
        state.indexStale = false;
        ensureSlotRows(slotCapacity);
        if (slotCapacity > 0) state.slotRows.fill(-1, 0, slotCapacity);
        return snapshot.beginFrame(expectedCount);
      },
      // Membership-stable fast pack: the identity map is left stale rather than
      // cleared+re-minted — the bulk column blit already produced identical rows,
      // and any later identity probe rebuilds the map on first access. slotRows is
      // left for the caller to adopt from the previous pack's table.
      beginFrameReuse(expectedCount, slotCapacity = 0) {
        if (state.sealed) state.sealed = false;
        state.indexStale = true;
        ensureSlotRows(slotCapacity);
        return snapshot.beginFrame(expectedCount);
      },
      blitColumnsFrom(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.blitColumnsFrom(...args);
      },
      rewriteAt(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.rewriteAt(...args);
      },
      write(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        const index = snapshot.write(...args);
        state.indexByEntityId.set(args[0] >>> 0, index);
        return index;
      },
      copyRow(previousSnapshot, sourceIndex) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        const index = snapshot.copyRow(previousSnapshot.columns, sourceIndex);
        state.indexByEntityId.set(previousSnapshot.columns.entityId[sourceIndex] >>> 0, index);
        return index;
      },
      setTint(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.setTint(...args);
      },
      setLean(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.setLean(...args);
      },
      setGeneration(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.setGeneration(...args);
      },
      record(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.record(...args);
      },
      drainJournal(...args) { return snapshot.drainJournal(...args); },
    };
    const published = Object.freeze({
      schema: snapshot.schema,
      columns: publishedColumns,
      get count() { return snapshot.count; },
      get capacity() { return snapshot.capacity; },
      get generation() { return snapshot.generation; },
      get journalDropped() { return snapshot.journalDropped; },
      get simTime() { return state.simTime; },
      get sequence() { return state.sequence; },
      get poseEpoch() { return state.poseEpoch; },
      get indexByEntityId() { return state.publishedIndexByEntityId; },
      get slotRows() { return state.slotRows; },
    });
    state.writable = Object.freeze(writable);
    state.published = published;
    return state;
  });
  let write = 0;
  let latest = -1;
  let previous = -1;
  let sequence = 0;
  let packCount = 0;
  const packBytesRing = new Float64Array(PACK_BYTES_RING);
  let packBytesIndex = 0;
  let packBytesCount = 0;
  let lastBytesPacked = 0;
  let lastPackMembership = null;
  let presentedTime = NaN;
  let presentedSequence = -1;
  let presentedEpoch = -1;
  let presentedSnapshotTime = NaN;

  return {
    beginPack(expectedCount, simTime = 0, poseEpoch = 0, slotCapacity = 0) {
      const buffer = buffers[write];
      buffer.writable.beginFrame(expectedCount, slotCapacity);
      buffer.simTime = Number.isFinite(simTime) ? simTime : 0;
      buffer.sequence = sequence + 1;
      buffer.poseEpoch = Number.isFinite(poseEpoch) ? poseEpoch : 0;
      return buffer.writable;
    },
    // Same begin, for the membership-stable fast pack: the identity map is left
    // stale (first probe rebuilds it from the entityId column) and slotRows is
    // adopted from the previous pack's table instead of re-minted.
    beginPackReuse(expectedCount, simTime = 0, poseEpoch = 0, slotCapacity = 0) {
      const buffer = buffers[write];
      buffer.writable.beginFrameReuse(expectedCount, slotCapacity);
      buffer.simTime = Number.isFinite(simTime) ? simTime : 0;
      buffer.sequence = sequence + 1;
      buffer.poseEpoch = Number.isFinite(poseEpoch) ? poseEpoch : 0;
      return buffer.writable;
    },
    // Membership stamp the fast pack's eligibility compares against. The pack
    // records the world's allocations/retirements counters at every commit; a
    // stamp that still matches the world's counters proves the live set (and
    // therefore the packed row order) is unchanged.
    notePackMembership(diagnostics) {
      if (!diagnostics || !Number.isInteger(diagnostics.allocations)
        || !Number.isInteger(diagnostics.retirements)) {
        lastPackMembership = null;
        return;
      }
      lastPackMembership = {
        allocations: diagnostics.allocations | 0,
        retirements: diagnostics.retirements | 0,
      };
    },
    get packMembership() { return lastPackMembership; },
    commit() {
      const buffer = buffers[write];
      if (buffer.sealed) throw new Error('Presentation snapshot fence commit without beginPack');
      sequence++;
      previous = latest;
      latest = write;
      buffer.sealed = true;
      buffer.sequence = sequence;
      write = (write + 1) % SNAPSHOT_FENCE_BUFFERS;
      packCount++;
      lastBytesPacked = buffer.snapshot.count * PACKED_BYTES_PER_ENTITY
        + buffer.snapshot.journalCount * PACKED_BYTES_PER_JOURNAL_EVENT;
      packBytesRing[packBytesIndex] = lastBytesPacked;
      packBytesIndex = (packBytesIndex + 1) % PACK_BYTES_RING;
      if (packBytesCount < PACK_BYTES_RING) packBytesCount++;
      return sequence;
    },
    latestSnapshot() {
      if (latest < 0) return null;
      return buffers[latest].published;
    },
    /**
     * The interpolation source for the latest pack, or null when there is none.
     *
     * A sector jump teleports every body thousands of world units and reassigns mirror slots, so
     * the pack taken before the jump is not a pose the pack after it may be blended against.
     * Blending them anyway drew the player's own hull partway between the two sectors and, because
     * a standing-still root is neither dirty nor pose-delta, that wrong pose then froze for the
     * rest of the session. Packs only interpolate inside one continuous pose epoch.
     */
    previousSnapshot() {
      if (packCount < 2 || previous < 0 || latest < 0) return null;
      if (buffers[previous].poseEpoch !== buffers[latest].poseEpoch) return null;
      return buffers[previous].published;
    },
    // Sample once per drawn frame. The worker (or a stepped pack) can leave the same two
    // snapshots on glass across several accumulator wraps. Continue toward the latest pose,
    // then hold it; never replay their blend backwards. No prediction changes sim authority.
    samplePresentationAlpha(elapsedS, accumulatorS, fixedDt, fallbackAlpha = 1) {
      if (latest < 0) return fallbackAlpha;
      const current = buffers[latest].published;
      const prior = this.previousSnapshot();
      const span = prior ? current.simTime - prior.simTime : 0;
      const raw = poseSpanAlpha(current, prior, accumulatorS, fixedDt, fallbackAlpha);
      const target = span > 0 ? prior.simTime + span * raw : current.simTime;
      const reset = presentedEpoch !== current.poseEpoch
        || current.simTime < presentedSnapshotTime || !Number.isFinite(presentedTime);
      if (reset) presentedTime = target;
      else if (presentedSequence === current.sequence) {
        const elapsed = Number.isFinite(elapsedS) ? Math.max(0, elapsedS) : 0;
        presentedTime = Math.min(current.simTime, Math.max(target, presentedTime + elapsed));
      } else presentedTime = Math.max(presentedTime, target);
      presentedSequence = current.sequence;
      presentedEpoch = current.poseEpoch;
      presentedSnapshotTime = current.simTime;
      return span > 0 ? Math.max(0, Math.min(1, (presentedTime - prior.simTime) / span)) : 1;
    },
    get sequence() { return sequence; },
    get packCount() { return packCount; },
    /** Bytes packed by the most recent commit. 0 before the first pack. */
    get lastBytesPacked() { return lastBytesPacked; },
    /**
     * p50/p95 of bytes packed per commit over the retained ring. Sorts a scratch copy — call
     * from a witness/report cadence, not per frame.
     */
    bytesPackedStats() {
      if (packBytesCount === 0) return { samples: 0, last: 0, p50: 0, p95: 0, max: 0, mean: 0 };
      const scratch = Array.prototype.slice.call(packBytesRing, 0, packBytesCount).sort((a, b) => a - b);
      const pick = (q) => scratch[Math.min(scratch.length - 1, Math.max(0, Math.ceil(q * scratch.length) - 1))];
      let total = 0;
      for (let i = 0; i < scratch.length; i++) total += scratch[i];
      return {
        samples: scratch.length,
        last: lastBytesPacked,
        p50: pick(0.5),
        p95: pick(0.95),
        max: scratch[scratch.length - 1],
        mean: total / scratch.length,
      };
    },
  };
}

export function snapshotIndexOf(snapshot, entityId) {
  if (!snapshot || entityId == null) return -1;
  if (snapshot.indexByEntityId && typeof snapshot.indexByEntityId.get === 'function') {
    const indexed = snapshot.indexByEntityId.get(entityId >>> 0);
    return indexed == null ? -1 : indexed;
  }
  const ids = snapshot.columns && snapshot.columns.entityId;
  if (!ids) return -1;
  const want = entityId >>> 0;
  const n = snapshot.count | 0;
  for (let i = 0; i < n; i++) if (ids[i] === want) return i;
  return -1;
}

/**
 * Resolve an entity's packed row via its world slot. The slot table is a hint
 * only: a hit is verified against the entityId column, and a miss (or a
 * snapshot without the table — test doubles, raw writes) falls back to the
 * identity map, so callers keep fail-closed semantics for stale/recycled slots.
 */
export function snapshotRowForSlot(snapshot, slot, entityId) {
  if (!snapshot || !Number.isInteger(slot)) return -1;
  const slotRows = snapshot.slotRows;
  if (slotRows && slot >= 0 && slot < slotRows.length) {
    const row = slotRows[slot];
    const ids = snapshot.columns && snapshot.columns.entityId;
    if (row >= 0 && ids && ids[row] === (entityId >>> 0)) return row;
  }
  return snapshotIndexOf(snapshot, entityId);
}

// A completed pack can outlive the body that owned an id while the next stepped
// pack is still in flight. Only that body's current generation can authorize a
// pose; pre-column snapshots and callers without a generation retain id lookup.
export function snapshotHasEntityGeneration(snapshot, entityId, expectedGeneration, slotHint = -1) {
  const index = slotHint >= 0
    ? snapshotRowForSlot(snapshot, slotHint, entityId)
    : snapshotIndexOf(snapshot, entityId);
  if (index < 0) return false;
  const generations = snapshot.columns && snapshot.columns.generation;
  return !generations || !Number.isInteger(expectedGeneration)
    || generations[index] === (expectedGeneration >>> 0);
}

// A recycled entityId inside one pose epoch names a different body — the
// previous pack's row may only feed a blend (or the fence pack's copy path)
// when its generation matches the current row's. Snapshots lacking the
// generation column (test doubles, pre-column packs) keep index-only lookup.
function snapshotSameGenerationRow(previous, snapshot, entityId, index, slotHint = -1) {
  const prev = slotHint >= 0
    ? snapshotRowForSlot(previous, slotHint, entityId)
    : snapshotIndexOf(previous, entityId);
  if (prev < 0) return -1;
  const prevGens = previous.columns && previous.columns.generation;
  const curGens = snapshot.columns && snapshot.columns.generation;
  if (prevGens && curGens && prevGens[prev] !== curGens[index]) return -1;
  return prev;
}

/**
 * Pose blend parameter for the previous→latest pack span, normalized by that span's real length.
 *
 * The raw render alpha is accumulator/fixedDt — a fraction of ONE sim tick — and it is only the
 * correct blend while every present advances exactly one step, keeping the previous pack exactly
 * one tick behind the latest. On any frame that completes k > 1 steps (a missed vsync, a long
 * frame, present-first recovery after a late present) the previous pack sits k ticks back, and a
 * one-tick alpha across a k-tick span lands near the STALE previous pose: the hull holds last
 * frame's position for a whole present, then snaps the entire span forward on the next one. That
 * freeze-then-jump cadence is the visible judder under load. The rendered moment is always
 * latest.simTime + accumulator − fixedDt, so normalizing by the actual span
 *
 *   t = 1 + (accumulator − fixedDt) / (latest.simTime − previous.simTime)
 *
 * reduces to accumulator/fixedDt for a one-tick span and otherwise spreads catch-up motion across
 * the span at correct world speed. Degenerate spans (no predecessor, equal stamps, clock resets)
 * return the fallback alpha unchanged.
 */
export function poseSpanAlpha(latest, previous, accumulatorS, fixedDt, fallbackAlpha = 1) {
  if (!latest || !previous) return fallbackAlpha;
  const dt = Number.isFinite(fixedDt) && fixedDt > 0 ? fixedDt : 0;
  if (!(dt > 0)) return fallbackAlpha;
  const span = latest.simTime - previous.simTime;
  if (!Number.isFinite(span) || span <= 0) return fallbackAlpha;
  const acc = Number.isFinite(accumulatorS) ? accumulatorS : 0;
  const t = 1 + (acc - dt) / span;
  return t < 0 ? 0 : (t > 1 ? 1 : t);
}

export function applySnapshotPoseToMesh(mesh, snapshot, entityId, origin, previous = null, alpha = 1, slotHint = -1) {
  if (!mesh || !mesh.position || !snapshot) return false;
  const index = slotHint >= 0
    ? snapshotRowForSlot(snapshot, slotHint, entityId)
    : snapshotIndexOf(snapshot, entityId);
  if (index < 0) return false;
  const p = index * 3;
  const q = index * 4;
  let x = snapshot.columns.position[p];
  let z = snapshot.columns.position[p + 2];
  let qy = snapshot.columns.quaternion[q + 1];
  let qw = snapshot.columns.quaternion[q + 3];
  const t = Number.isFinite(alpha) ? alpha : 1;
  const prev = previous && t < 1
    ? snapshotSameGenerationRow(previous, snapshot, entityId, index, slotHint) : -1;
  if (prev >= 0) {
    const pp = prev * 3;
    const pq = prev * 4;
    x = previous.columns.position[pp] + (x - previous.columns.position[pp]) * t;
    z = previous.columns.position[pp + 2] + (z - previous.columns.position[pp + 2]) * t;
    qy = previous.columns.quaternion[pq + 1] + (qy - previous.columns.quaternion[pq + 1]) * t;
    qw = previous.columns.quaternion[pq + 3] + (qw - previous.columns.quaternion[pq + 3]) * t;
  }
  const ox = origin && Number.isFinite(origin.x) ? origin.x : 0;
  const oy = origin && Number.isFinite(origin.y) ? origin.y : 0;
  const oz = origin && Number.isFinite(origin.z) ? origin.z : 0;
  mesh.position.x = x - ox;
  mesh.position.y = (snapshot.columns.position[p + 1] || 0) - oy;
  mesh.position.z = z - oz;
  mesh.rotation.y = -2 * Math.atan2(qy, qw || 1);
  // Static-presentation roots keep matrixAutoUpdate=false (PERF-59): compose the pose here or
  // the walk never sees it.
  if (mesh.matrixAutoUpdate === false) mesh.updateMatrix();
  const hull = mesh.userData && mesh.userData.hull;
  if (hull && snapshot.columns.bank && snapshot.columns.pitch) {
    let bank = snapshot.columns.bank[index] || 0;
    let pitch = snapshot.columns.pitch[index] || 0;
    if (prev >= 0 && previous.columns.bank && previous.columns.pitch) {
      bank = previous.columns.bank[prev] + (bank - previous.columns.bank[prev]) * t;
      pitch = previous.columns.pitch[prev] + (pitch - previous.columns.pitch[prev]) * t;
    }
    hull.rotation.x = bank;
    hull.rotation.z = pitch;
  }
  return true;
}

/**
 * Membership-stable fast-pack eligibility. The previous committed pack may serve
 * as a byte-exact base only when EVERY packed row still names the same entity at
 * the same position: the world's allocations/retirements counters — which cover
 * every allocateRecord/retireSlot path — must not have moved since that commit,
 * and the pose epoch must match (a remap or sector jump makes rows incomparable).
 * Worlds lacking the counters, slotGenerations, entityIds, or the packDirty mask
 * (test doubles) get null and run the classic walk.
 */
function fastPackPrevious(world, fence, poseEpoch) {
  const previous = typeof fence.latestSnapshot === 'function' ? fence.latestSnapshot() : null;
  if (!previous || previous.poseEpoch !== poseEpoch || !previous.slotRows) return null;
  const stamp = fence.packMembership;
  if (!stamp || typeof world.getDiagnostics !== 'function') return null;
  const diagnostics = world.getDiagnostics();
  if (!diagnostics
    || (diagnostics.allocations | 0) !== stamp.allocations
    || (diagnostics.retirements | 0) !== stamp.retirements) return null;
  if (!world.packDirty || !world.entityIds || !world.slotGenerations || !world.alive) return null;
  return previous;
}

// Shared row rewrite for the fast pack: same bytes the classic walk's write +
// setLean + setGeneration sequence produces, at the row the slot already owns.
function rewritePackedRow(snapshot, world, slot, row, entityId) {
  let qy;
  let qw;
  if (world.yawSin && world.yawCos) {
    qy = world.yawSin[slot];
    qw = world.yawCos[slot];
  } else {
    const rot = world.rot ? Number(world.rot[slot]) || 0 : 0;
    const half = rot * 0.5;
    qy = Math.sin(half);
    qw = Math.cos(half);
  }
  snapshot.rewriteAt(
    row,
    entityId,
    world.typeCodes ? world.typeCodes[slot] : 0,
    world.x[slot],
    world.y[slot],
    world.z[slot],
    0, qy, 0, qw,
    1, 1, 1,
    world.flags[slot] >>> 0,
  );
  if (typeof snapshot.setLean === 'function') {
    snapshot.setLean(
      row,
      world.bank ? Number(world.bank[slot]) || 0 : 0,
      world.pitch ? Number(world.pitch[slot]) || 0 : 0,
    );
  }
  if (typeof snapshot.setGeneration === 'function') {
    snapshot.setGeneration(
      row,
      world.slotGenerations ? world.slotGenerations[slot] : 0,
    );
  }
}

export function packPresentationWorldToFence(world, fence, simTime = 0, poseEpoch = 0) {
  if (!world || !fence) return 0;
  const diagnostics = typeof world.getDiagnostics === 'function' ? world.getDiagnostics() : null;
  const active = diagnostics && Number.isInteger(diagnostics.active) ? diagnostics.active : 0;
  const slotCap = Number.isInteger(world.capacity)
    ? world.capacity
    : (world.packDirty ? world.packDirty.length : active);
  // Membership-stable fast pack: the previous commit is already a byte-exact
  // base, so one contiguous column blit plus rewrites of only the pack-dirty
  // rows replaces the O(active) row walk and the identity-map rebuild. The
  // atomic twin cannot observe mid-pack world churn, so no re-check is needed.
  const fastPrevious = fastPackPrevious(world, fence, poseEpoch);
  if (fastPrevious) {
    const snapshot = fence.beginPackReuse(Math.max(1, active), simTime, poseEpoch, slotCap);
    const slotRows = snapshot.slotRows;
    const previousRows = fastPrevious.slotRows;
    slotRows.set(previousRows.subarray(0, Math.min(previousRows.length, slotRows.length)));
    snapshot.blitColumnsFrom(fastPrevious.columns, fastPrevious.count);
    const dirty = world.packDirty;
    const scan = Math.min(dirty.length, slotRows.length);
    let bail = false;
    for (let slot = 0; slot < scan; slot++) {
      if (dirty[slot] === 0) continue;
      if (world.alive[slot] !== 1) continue;
      const row = slotRows[slot];
      const entityId = world.entityIds[slot] >>> 0;
      // A miss means the premise was wrong — never write a guess into the
      // snapshot; fall back to the classic walk for this frame instead.
      // The dirty bit clears only on commit: a bail must leave every bit set
      // so the classic walk re-packs what this discarded buffer consumed (G1a).
      if (row < 0 || row >= snapshot.count
        || fastPrevious.columns.entityId[row] !== entityId) { bail = true; break; }
      rewritePackedRow(snapshot, world, slot, row, entityId);
    }
    if (!bail) {
      dirty.fill(0, 0, scan);
      fence.commit();
      fence.notePackMembership(diagnostics);
      return snapshot.count;
    }
  }
  const snapshot = fence.beginPack(Math.max(1, active), simTime, poseEpoch, slotCap);
  // Dirty-column pack: the mask still holds every pose/visual write since the
  // last frame's consume when this runs (the pack precedes the sync pass), so a
  // clean slot's packed bytes are identical to the LATEST committed pack's row —
  // copy them verbatim instead of re-reading a dozen columns + re-deriving the
  // yaw pair + re-stamping lean. The latest pack must share this pack's pose
  // epoch: a slot remap (sector jump, mirror rebuild) teleports every row and
  // always falls back to the full write. (latestSnapshot is the pack minted
  // last frame — previousSnapshot is two packs back and would reintroduce
  // poses dirtied since.)
  const previous = typeof fence.latestSnapshot === 'function' ? fence.latestSnapshot() : null;
  const previousIndex = previous && previous.poseEpoch === poseEpoch
    ? (previous.indexByEntityId || null) : null;
  let packed = 0;
  for (let index = 0; index < active; index++) {
    const slot = world.activeSlots[index];
    if (world.alive[slot] !== 1) continue;
    const entityId = world.entityIds[slot] >>> 0;
    // The pack owns its dirty bit: only writers that can change packed bytes
    // set it, so never-visited slots (allocated ALL for life) and byte-identical
    // BINDING/VISIBILITY/VISUAL marks copy verbatim instead of paying the scalar
    // write per presented frame. The generation term keeps a recycled id from
    // copying the prior body's row inside a shared epoch.
    if (previousIndex && world.packDirty && world.packDirty[slot] === 0) {
      const previousRow = previousIndex.get(entityId);
      const previousGenerations = previous.columns && previous.columns.generation;
      if (previousRow !== undefined && previousRow >= 0
          && (!previousGenerations || !world.slotGenerations
            || previousGenerations[previousRow] === (world.slotGenerations[slot] >>> 0))) {
        snapshot.slotRows[slot] = snapshot.copyRow(previous, previousRow);
        world.packDirty[slot] = 0;
        packed++;
        continue;
      }
    }
    // Prefer presentation-world half-yaw cache (filled on rot write). Fall back to sin/cos
    // for worlds that predate the cache columns or omit them in tests.
    let qy;
    let qw;
    if (world.yawSin && world.yawCos) {
      qy = world.yawSin[slot];
      qw = world.yawCos[slot];
    } else {
      const rot = world.rot ? Number(world.rot[slot]) || 0 : 0;
      const half = rot * 0.5;
      qy = Math.sin(half);
      qw = Math.cos(half);
    }
    const packedIndex = snapshot.write(
      entityId,
      world.typeCodes ? world.typeCodes[slot] : 0,
      world.x[slot],
      world.y[slot],
      world.z[slot],
      0, qy, 0, qw,
      1, 1, 1,
      world.flags[slot] >>> 0,
    );
    if (typeof snapshot.setLean === 'function') {
      snapshot.setLean(
        packedIndex,
        world.bank ? Number(world.bank[slot]) || 0 : 0,
        world.pitch ? Number(world.pitch[slot]) || 0 : 0,
      );
    }
    if (typeof snapshot.setGeneration === 'function') {
      snapshot.setGeneration(
        packedIndex,
        world.slotGenerations ? world.slotGenerations[slot] : 0,
      );
    }
    snapshot.slotRows[slot] = packedIndex;
    if (world.packDirty) world.packDirty[slot] = 0;
    packed++;
  }
  fence.commit();
  fence.notePackMembership(diagnostics);
  return packed;
}

/**
 * Stepped twin — identical pack contents, commit, and return. The atomic pack
 * pays O(activeCount) inside most presents; drivers pace this across a 4ms
 * wall bound, parking mid-walk like the other stepped passes. Rows pack
 * atomically each, so a suspended pack's mix is bounded to row granularity —
 * the same staleness the suspended journal collect already produces.
 */
export function* packPresentationWorldToFenceSteps(world, fence, simTime = 0, poseEpoch = 0, sliceEvery = 256) {
  if (!world || !fence) return 0;
  const diagnostics = typeof world.getDiagnostics === 'function' ? world.getDiagnostics() : null;
  const active = diagnostics && Number.isInteger(diagnostics.active) ? diagnostics.active : 0;
  // Structural counters captured at mint: while neither moves, no row can have
  // been appended, swap-moved, or recycled, and the post-mint sweeps are pure
  // re-verification — a quiet pack skips the O(active) membership walk.
  const allocationsAtMint = diagnostics ? (diagnostics.allocations | 0) : 0;
  const retirementsAtMint = diagnostics ? (diagnostics.retirements | 0) : 0;
  const every = Math.max(1, Math.floor(Number(sliceEvery) || 1));
  const slotCap = Number.isInteger(world.capacity)
    ? world.capacity
    : (world.packDirty ? world.packDirty.length : active);
  // Membership-stable fast pack: identical bytes and commit to the atomic
  // output — one column blit plus rewrites of only the pack-dirty rows. A
  // mid-park membership churn (allocations/retirements moved, or a slot-table
  // miss proving the premise wrong) discards the in-flight buffer and falls
  // through to the classic walk, still paced across the same yields.
  const fastPrevious = fastPackPrevious(world, fence, poseEpoch);
  if (fastPrevious) {
    const fastSnapshot = fence.beginPackReuse(Math.max(1, active), simTime, poseEpoch, slotCap);
    const slotRows = fastSnapshot.slotRows;
    const previousRows = fastPrevious.slotRows;
    slotRows.set(previousRows.subarray(0, Math.min(previousRows.length, slotRows.length)));
    fastSnapshot.blitColumnsFrom(fastPrevious.columns, fastPrevious.count);
    const dirty = world.packDirty;
    const scan = Math.min(dirty.length, slotRows.length);
    let bail = false;
    // Each mark is consumed as it is processed (W143-BG-1): the driver parks
    // mid-walk, so a mark landing on an already-scanned slot must survive to
    // the next pack — the classic walk's mark-after-process ⇒ next-pack-rewrite
    // self-heal, bounding staleness to one pack. A trailing fill would clear it
    // without ever having packed it (final-write-in-window ⇒ stale pose forever).
    const consumedDirty = [];
    let fastCommitted = false;
    try {
      for (let slot = 0; slot < scan; slot++) {
        if ((slot % every) === 0 && slot > 0) yield;
        if (dirty[slot] === 0) continue;
        dirty[slot] = 0;
        consumedDirty.push(slot);
        if (world.alive[slot] !== 1) continue;
        const row = slotRows[slot];
        const entityId = world.entityIds[slot] >>> 0;
        if (row < 0 || row >= fastSnapshot.count
          || fastPrevious.columns.entityId[row] !== entityId) { bail = true; break; }
        rewritePackedRow(fastSnapshot, world, slot, row, entityId);
      }
      if (!bail) {
        const postDiagnostics = typeof world.getDiagnostics === 'function'
          ? world.getDiagnostics() : null;
        if (postDiagnostics
          && (postDiagnostics.allocations | 0) === allocationsAtMint
          && (postDiagnostics.retirements | 0) === retirementsAtMint) {
          fence.commit();
          fence.notePackMembership(postDiagnostics);
          fastCommitted = true;
          return fastSnapshot.count;
        }
      }
    } finally {
      // ANY non-commit exit — bail, counters mismatch, throw, or a superseding
      // .return() — discards the consumed marks' rewrites, so restore their
      // bits (W144-BG-1: the finally is what covers fault/abandon paths the
      // old commit-gated fill never needed). Write through `world.packDirty`,
      // not the captured `dirty` alias: a mid-park capacity grow reallocates
      // the mask and growTyped copies the post-consume zeros, so a restore
      // into the old array would be a dead write (W144-BG-1b). The classic
      // walk reads packDirty===0 as "copy last committed row" and would
      // otherwise ship the stale row.
      if (!fastCommitted) {
        for (const slot of consumedDirty) world.packDirty[slot] = 1;
      }
    }
    // beginFrame re-clears the index, refills slotRows, and every live
    // row re-packs — byte-identical to the atomic output, just paced.
  }
  const snapshot = fence.beginPack(Math.max(1, active), simTime, poseEpoch, slotCap);
  const previous = typeof fence.latestSnapshot === 'function' ? fence.latestSnapshot() : null;
  const previousIndex = previous && previous.poseEpoch === poseEpoch
    ? (previous.indexByEntityId || null) : null;
  let packed = 0;
  // Identity coverage of the sweeps: a mid-park allocation swap-moved into
  // the frozen prefix escapes the minted list, and only this set can prove the
  // row was actually packed (positions lie once swap-remove runs mid-park). The
  // key is slot+generation, not slot alone — a retire+realloc mid-park reuses
  // the slot number for a new entity, and that row must still pack.
  const packedSlotGens = new Map();
  const packRow = (slot) => {
    if (world.alive[slot] !== 1) return;
    const slotIdentity = world.slotGenerations
      ? world.slotGenerations[slot] >>> 0
      : world.entityIds[slot] >>> 0;
    if (packedSlotGens.get(slot) === slotIdentity) return;
    const entityId = world.entityIds[slot] >>> 0;
    if (previousIndex && world.packDirty && world.packDirty[slot] === 0) {
      const previousRow = previousIndex.get(entityId);
      const previousGenerations = previous.columns && previous.columns.generation;
      if (previousRow !== undefined && previousRow >= 0
          && (!previousGenerations || !world.slotGenerations
            || previousGenerations[previousRow] === (world.slotGenerations[slot] >>> 0))) {
        snapshot.slotRows[slot] = snapshot.copyRow(previous, previousRow);
        world.packDirty[slot] = 0;
        packedSlotGens.set(slot, slotIdentity);
        packed++;
        return;
      }
    }
    let qy;
    let qw;
    if (world.yawSin && world.yawCos) {
      qy = world.yawSin[slot];
      qw = world.yawCos[slot];
    } else {
      const rot = world.rot ? Number(world.rot[slot]) || 0 : 0;
      const half = rot * 0.5;
      qy = Math.sin(half);
      qw = Math.cos(half);
    }
    const packedIndex = snapshot.write(
      entityId,
      world.typeCodes ? world.typeCodes[slot] : 0,
      world.x[slot],
      world.y[slot],
      world.z[slot],
      0, qy, 0, qw,
      1, 1, 1,
      world.flags[slot] >>> 0,
    );
    if (typeof snapshot.setLean === 'function') {
      snapshot.setLean(
        packedIndex,
        world.bank ? Number(world.bank[slot]) || 0 : 0,
        world.pitch ? Number(world.pitch[slot]) || 0 : 0,
      );
    }
    if (typeof snapshot.setGeneration === 'function') {
      snapshot.setGeneration(
        packedIndex,
        world.slotGenerations ? world.slotGenerations[slot] : 0,
      );
    }
    snapshot.slotRows[slot] = packedIndex;
    if (world.packDirty) world.packDirty[slot] = 0;
    packedSlotGens.set(slot, slotIdentity);
    packed++;
  };
  // Freeze the slot list at mint: activeSlots is live while this pack parks —
  // a retireSlot swap-moves an unvisited tail row into the visited prefix, and
  // the row is then absent from the committed snapshot entirely (a 1+ frame
  // pop-out). Frozen slots are packed by identity, not position.
  const mintedSlots = active > 0 ? world.activeSlots.slice(0, active) : [];
  for (let index = 0; index < mintedSlots.length; index++) {
    if ((index % every) === 0 && index > 0) yield;
    packRow(mintedSlots[index]);
  }
  // Rows allocated or retired while the pack was parked escape any positional
  // bound: appends land past the frozen mint slice, and a retire swap-moves a
  // live row into territory already swept (while the rescanned stale tail can
  // carry a duplicate that a later alloc then clobbers). Membership, not
  // position, is exact — the live id→slot index is position-free, and Map
  // iteration visits mid-walk inserts while skipping deleted keys, so a churn
  // burst inside one parked pack can neither miss a spawn nor pack a corpse.
  // Only worth paying when the world mutated mid-park: a quiet pack's frozen
  // slice already covered every live row (packRow is a no-op for a retired
  // row, and dedupes anything the minted sweep already packed).
  const postDiagnostics = typeof world.getDiagnostics === 'function'
    ? world.getDiagnostics() : null;
  const worldChurned = postDiagnostics === null
    ? true
    : ((postDiagnostics.allocations | 0) !== allocationsAtMint
      || (postDiagnostics.retirements | 0) !== retirementsAtMint);
  if (worldChurned && typeof world.liveSlotValues === 'function') {
    let scanned = 0;
    for (const slot of world.liveSlotValues()) {
      if ((scanned % every) === 0 && scanned > 0) yield;
      scanned += 1;
      packRow(slot);
    }
  }
  fence.commit();
  fence.notePackMembership(postDiagnostics);
  return packed;
}

export function packEntityIntoSnapshot(snapshot, entity, options = {}) {
  if (!snapshot || !entity || entity.alive === false) return -1;
  const pos = entity.pos || {};
  const flags = options.flags || 0;
  return snapshot.write(
    entity.id >>> 0,
    options.archetype || 0,
    Number(pos.x) || 0,
    Number(pos.y) || 0,
    Number(pos.z) || 0,
    0, 0, 0, 1,
    1, 1, 1,
    flags >>> 0,
  );
}
