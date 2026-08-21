// Presentation snapshot fence. Render reads the latest complete packed frame,
// never live entity objects. Required before a simulation Worker.

import { createPresentationSnapshot } from './presentationSnapshot.js';

export const SNAPSHOT_FENCE_BUFFERS = 3;

export function createSnapshotFence(options = {}) {
  const buffers = Array.from(
    { length: SNAPSHOT_FENCE_BUFFERS },
    () => createPresentationSnapshot({
      capacity: options.capacity || 256,
      journalCapacity: options.journalCapacity,
    }),
  );
  let write = 0;
  let latest = -1;
  let sequence = 0;
  let packCount = 0;

  return {
    beginPack(expectedCount, simTime = 0) {
      const snapshot = buffers[write];
      snapshot.beginFrame(expectedCount);
      snapshot.simTime = Number.isFinite(simTime) ? simTime : 0;
      snapshot.sequence = sequence + 1;
      return snapshot;
    },
    commit() {
      sequence++;
      latest = write;
      write = (write + 1) % SNAPSHOT_FENCE_BUFFERS;
      packCount++;
      return sequence;
    },
    latestSnapshot() {
      if (latest < 0) return null;
      return buffers[latest];
    },
    previousSnapshot() {
      if (packCount < 2 || latest < 0) return null;
      const prev = (latest + SNAPSHOT_FENCE_BUFFERS - 1) % SNAPSHOT_FENCE_BUFFERS;
      return buffers[prev];
    },
    get sequence() { return sequence; },
    get packCount() { return packCount; },
  };
}

export function snapshotIndexOf(snapshot, entityId) {
  if (!snapshot || entityId == null) return -1;
  const ids = snapshot.columns && snapshot.columns.entityId;
  if (!ids) return -1;
  const want = entityId >>> 0;
  const n = snapshot.count | 0;
  for (let i = 0; i < n; i++) if (ids[i] === want) return i;
  return -1;
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
  const oz = origin && Number.isFinite(origin.z) ? origin.z : 0;
  mesh.position.x = x - ox;
  mesh.position.y = 0;
  mesh.position.z = z - oz;
  mesh.rotation.y = -2 * Math.atan2(qy, qw || 1);
  return true;
}

export function packPresentationWorldToFence(world, fence, simTime = 0) {
  if (!world || !fence) return 0;
  const diagnostics = typeof world.getDiagnostics === 'function' ? world.getDiagnostics() : null;
  const active = diagnostics && Number.isInteger(diagnostics.active) ? diagnostics.active : 0;
  const snapshot = fence.beginPack(Math.max(1, active), simTime);
  let packed = 0;
  for (let index = 0; index < active; index++) {
    const slot = world.activeSlots[index];
    if (world.alive[slot] !== 1) continue;
    const rot = world.rot ? Number(world.rot[slot]) || 0 : 0;
    const half = rot * 0.5;
    snapshot.write(
      world.entityIds[slot] >>> 0,
      world.typeCodes ? world.typeCodes[slot] : 0,
      world.x[slot],
      world.y[slot],
      world.z[slot],
      0, Math.sin(half), 0, Math.cos(half),
      1, 1, 1,
      world.flags[slot] >>> 0,
    );
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
