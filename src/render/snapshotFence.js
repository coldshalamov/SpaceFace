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

function readonlyIndex(index) {
  return Object.freeze({
    get(entityId) { return index.get(entityId); },
    has(entityId) { return index.has(entityId); },
    get size() { return index.size; },
  });
}

export function createSnapshotFence(options = {}) {
  const buffers = Array.from({ length: SNAPSHOT_FENCE_BUFFERS }, () => {
    const snapshot = createPresentationSnapshot({
      capacity: options.capacity || 256,
      journalCapacity: options.journalCapacity,
    });
    const indexByEntityId = new Map();
    const publishedIndexByEntityId = readonlyIndex(indexByEntityId);
    const publishedColumns = readonlyColumns(snapshot.columns);
    const state = {
      snapshot,
      indexByEntityId,
      publishedIndexByEntityId,
      sealed: true,
      simTime: 0,
      sequence: 0,
      // Interpolation epoch. Two packs may only be interpolated against each other when the pose
      // stream between them is continuous; a sector jump or a mirror rebuild reassigns slots and
      // teleports every body, so packs on either side of one are not comparable.
      poseEpoch: 0,
    };
    const writable = {
      get schema() { return snapshot.schema; },
      get columns() { return snapshot.columns; },
      get count() { return snapshot.count; },
      get capacity() { return snapshot.capacity; },
      get generation() { return snapshot.generation; },
      get journalDropped() { return snapshot.journalDropped; },
      beginFrame(expectedCount) {
        if (state.sealed) state.sealed = false;
        indexByEntityId.clear();
        return snapshot.beginFrame(expectedCount);
      },
      write(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        const index = snapshot.write(...args);
        state.indexByEntityId.set(args[0] >>> 0, index);
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

  return {
    beginPack(expectedCount, simTime = 0, poseEpoch = 0) {
      const buffer = buffers[write];
      buffer.writable.beginFrame(expectedCount);
      buffer.simTime = Number.isFinite(simTime) ? simTime : 0;
      buffer.sequence = sequence + 1;
      buffer.poseEpoch = Number.isFinite(poseEpoch) ? poseEpoch : 0;
      return buffer.writable;
    },
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

export function applySnapshotPoseToMesh(mesh, snapshot, entityId, origin, previous = null, alpha = 1) {
  if (!mesh || !mesh.position || !snapshot) return false;
  const index = snapshotIndexOf(snapshot, entityId);
  if (index < 0) return false;
  const p = index * 3;
  const q = index * 4;
  let x = snapshot.columns.position[p];
  let z = snapshot.columns.position[p + 2];
  let qy = snapshot.columns.quaternion[q + 1];
  let qw = snapshot.columns.quaternion[q + 3];
  const t = Number.isFinite(alpha) ? alpha : 1;
  if (previous && t < 1) {
    const prev = snapshotIndexOf(previous, entityId);
    if (prev >= 0) {
      const pp = prev * 3;
      const pq = prev * 4;
      x = previous.columns.position[pp] + (x - previous.columns.position[pp]) * t;
      z = previous.columns.position[pp + 2] + (z - previous.columns.position[pp + 2]) * t;
      qy = previous.columns.quaternion[pq + 1] + (qy - previous.columns.quaternion[pq + 1]) * t;
      qw = previous.columns.quaternion[pq + 3] + (qw - previous.columns.quaternion[pq + 3]) * t;
    }
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
    if (previous && t < 1 && previous.columns.bank && previous.columns.pitch) {
      const prev = snapshotIndexOf(previous, entityId);
      if (prev >= 0) {
        bank = previous.columns.bank[prev] + (bank - previous.columns.bank[prev]) * t;
        pitch = previous.columns.pitch[prev] + (pitch - previous.columns.pitch[prev]) * t;
      }
    }
    hull.rotation.x = bank;
    hull.rotation.z = pitch;
  }
  return true;
}

export function packPresentationWorldToFence(world, fence, simTime = 0, poseEpoch = 0) {
  if (!world || !fence) return 0;
  const diagnostics = typeof world.getDiagnostics === 'function' ? world.getDiagnostics() : null;
  const active = diagnostics && Number.isInteger(diagnostics.active) ? diagnostics.active : 0;
  const snapshot = fence.beginPack(Math.max(1, active), simTime, poseEpoch);
  let packed = 0;
  for (let index = 0; index < active; index++) {
    const slot = world.activeSlots[index];
    if (world.alive[slot] !== 1) continue;
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
      world.entityIds[slot] >>> 0,
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
    packed++;
  }
  fence.commit();
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
