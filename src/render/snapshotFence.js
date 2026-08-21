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
    get sequence() { return sequence; },
    get packCount() { return packCount; },
  };
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
