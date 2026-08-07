// Draw ordinary entities from the dense presentation snapshot, one draw call per archetype.
//
// WHY BATCH BY ARCHETYPE
// ----------------------
// The per-entity path issues one draw per entity, and each draw carries a pipeline/uniform binding
// whether or not anything changed. Ordinary entities are overwhelmingly the same few archetypes
// repeated, so the binding is nearly always redundant — the GPU is being told the same thing
// hundreds of times per frame.
//
// Grouping by archetype turns that into one instanced draw per archetype, with per-entity data
// living in an instance buffer instead of in state changes. Population then costs buffer bytes
// rather than draw calls, which is the difference between scaling and not.
//
// This consumes `spaceface.presentationSnapshot.v1` directly: entity `i` reads from index `i` of
// each column. No entity objects are touched, so the batching loop is a linear scan over contiguous
// typed arrays and allocates nothing per frame.

const MATRIX_STRIDE = 16;
const GROWTH_FACTOR = 2;

/**
 * Compose a TRS matrix straight into an instance buffer at `offset`.
 *
 * Written inline rather than via THREE.Matrix4.compose so no Matrix4, Vector3 or Quaternion is
 * allocated per entity per frame — that allocation is exactly what the dense snapshot exists to
 * avoid, and routing through object wrappers here would hand it straight back.
 */
function composeInto(out, offset, px, py, pz, qx, qy, qz, qw, sx, sy, sz) {
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;

  out[offset] = (1 - (yy + zz)) * sx;
  out[offset + 1] = (xy + wz) * sx;
  out[offset + 2] = (xz - wy) * sx;
  out[offset + 3] = 0;

  out[offset + 4] = (xy - wz) * sy;
  out[offset + 5] = (1 - (xx + zz)) * sy;
  out[offset + 6] = (yz + wx) * sy;
  out[offset + 7] = 0;

  out[offset + 8] = (xz + wy) * sz;
  out[offset + 9] = (yz - wx) * sz;
  out[offset + 10] = (1 - (xx + yy)) * sz;
  out[offset + 11] = 0;

  out[offset + 12] = px;
  out[offset + 13] = py;
  out[offset + 14] = pz;
  out[offset + 15] = 1;
}

/**
 * Create the batcher.
 *
 * Per-archetype buffers are kept in a Map and grown by doubling, never shrunk — same reasoning as
 * the snapshot: shrinking trades steady-state zero allocation for churn whenever population
 * oscillates.
 */
export function createBatchedInstanceRenderer(options = {}) {
  const visibleFlag = options.visibleFlag ?? 1;
  const batches = new Map();
  let drawCalls = 0;
  let instancesWritten = 0;
  let bufferGrows = 0;

  function batchFor(archetype) {
    let batch = batches.get(archetype);
    if (!batch) {
      batch = { archetype, matrices: new Float32Array(MATRIX_STRIDE * 16), capacity: 16, count: 0 };
      batches.set(archetype, batch);
      bufferGrows++;
    }
    return batch;
  }

  function reserve(batch, needed) {
    if (needed <= batch.capacity) return;
    let next = batch.capacity;
    while (next < needed) next *= GROWTH_FACTOR;
    const grown = new Float32Array(MATRIX_STRIDE * next);
    grown.set(batch.matrices);
    batch.matrices = grown;
    batch.capacity = next;
    bufferGrows++;
  }

  return {
    get drawCalls() { return drawCalls; },
    get instancesWritten() { return instancesWritten; },
    get bufferGrows() { return bufferGrows; },
    get batchCount() { return batches.size; },
    batches,

    /**
     * Build this frame's batches from a snapshot.
     *
     * Two passes. The first counts per archetype so every buffer is reserved exactly once; the
     * second writes. Counting first is what keeps the write loop free of capacity branches and
     * bounds a frame to at most one growth per archetype.
     */
    build(snapshot) {
      for (const batch of batches.values()) batch.count = 0;
      const { position, quaternion, scale, archetype: archetypeColumn, flags } = snapshot.columns;
      const count = snapshot.count;

      for (let i = 0; i < count; i++) {
        if ((flags[i] & visibleFlag) === 0) continue;
        batchFor(archetypeColumn[i]).count++;
      }
      for (const batch of batches.values()) reserve(batch, batch.count);
      for (const batch of batches.values()) batch.count = 0;

      for (let i = 0; i < count; i++) {
        if ((flags[i] & visibleFlag) === 0) continue;
        const batch = batches.get(archetypeColumn[i]);
        const p = i * 3;
        const q = i * 4;
        composeInto(
          batch.matrices, batch.count * MATRIX_STRIDE,
          position[p], position[p + 1], position[p + 2],
          quaternion[q], quaternion[q + 1], quaternion[q + 2], quaternion[q + 3],
          scale[p], scale[p + 1], scale[p + 2],
        );
        batch.count++;
        instancesWritten++;
      }

      // An archetype with no visible instances this frame issues no draw. Counting it would make the
      // draw-call metric insensitive to culling, which is the main thing it needs to reflect.
      drawCalls = 0;
      for (const batch of batches.values()) if (batch.count > 0) drawCalls++;
      return drawCalls;
    },

    resetCounters() {
      drawCalls = 0;
      instancesWritten = 0;
      bufferGrows = 0;
    },
  };
}
