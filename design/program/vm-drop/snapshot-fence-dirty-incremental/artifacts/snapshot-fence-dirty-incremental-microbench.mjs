/**
 * Primary KPI: packPresentationWorldToFence residual under prepareFrame.
 * Before = dense rewrite every active slot every pack (post-#46 yaw-cache tip).
 * After  = layout-stable copy + dirty-row rewrite (this package).
 * Quiet Ceres-shaped: many parked rows, few TRANSFORM-dirty movers.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import {
  createSnapshotFence,
  packPresentationWorldToFence,
} from '../src/render/snapshotFence.js';

function seedWorld(n) {
  const world = createPresentationWorld({ capacity: Math.max(32, n) });
  const entities = [];
  for (let i = 0; i < n; i++) {
    const entity = {
      id: i + 1,
      alive: true,
      type: i < 8 ? 'ship' : 'asteroid',
      pos: { x: (i % 20) * 40, y: 0, z: Math.floor(i / 20) * 40 },
      rot: (i * 0.017) % (Math.PI * 2),
      bank: 0,
      pitch: 0,
      radius: 6,
    };
    entities.push(entity);
    world.allocateEntity(entity, 0);
  }
  return { world, entities };
}

function markDirtyMovers(world, entities, dirtyCount) {
  for (let i = 0; i < dirtyCount; i++) {
    const entity = entities[i];
    entity.pos.x += 0.05;
    entity.pos.z += 0.02;
    entity.rot += 0.001;
    world.applyTransform(
      {
        entityId: entity.id,
        generation: 0,
        revision: (entity._rev = (entity._rev || 0) + 1),
        x: entity.pos.x,
        y: 0,
        z: entity.pos.z,
        rot: entity.rot,
        bank: 0,
        pitch: 0,
      },
      entity,
    );
  }
}

function clearAllDirty(world) {
  const active = world.getDiagnostics().active;
  for (let a = 0; a < active; a++) world.clearDirty(world.activeSlots[a]);
}

function primeRing(world, fence, entities, dirtyCount) {
  for (let i = 0; i < 3; i++) {
    markDirtyMovers(world, entities, dirtyCount);
    packPresentationWorldToFence(world, fence, i * 0.016, 1);
    clearAllDirty(world);
  }
}

function runScenario(n, dirtyCount, frames) {
  const { world, entities } = seedWorld(n);
  const fenceBefore = createSnapshotFence({ capacity: n });
  const fenceAfter = createSnapshotFence({ capacity: n });
  primeRing(world, fenceBefore, entities, dirtyCount);
  // Reset dirty and prime after fence on a clone world so layoutVersions diverge independently
  const seeded = seedWorld(n);
  primeRing(seeded.world, fenceAfter, seeded.entities, dirtyCount);

  // Warm
  markDirtyMovers(world, entities, dirtyCount);
  packPresentationWorldToFence(world, fenceBefore, 1, 1, { forceFull: true });
  clearAllDirty(world);
  markDirtyMovers(seeded.world, seeded.entities, dirtyCount);
  packPresentationWorldToFence(seeded.world, fenceAfter, 1, 1);
  clearAllDirty(seeded.world);

  const t0 = performance.now();
  let sinkB = 0;
  for (let i = 0; i < frames; i++) {
    markDirtyMovers(world, entities, dirtyCount);
    sinkB += packPresentationWorldToFence(world, fenceBefore, i * 0.016, 1, { forceFull: true });
    clearAllDirty(world);
  }
  const beforeMs = performance.now() - t0;

  const t1 = performance.now();
  let sinkA = 0;
  for (let i = 0; i < frames; i++) {
    markDirtyMovers(seeded.world, seeded.entities, dirtyCount);
    sinkA += packPresentationWorldToFence(seeded.world, fenceAfter, i * 0.016, 1);
    clearAllDirty(seeded.world);
  }
  const afterMs = performance.now() - t1;

  return {
    entities: n,
    dirty: dirtyCount,
    frames,
    before_ms: +beforeMs.toFixed(3),
    after_ms: +afterMs.toFixed(3),
    speedup: +(beforeMs / Math.max(afterMs, 1e-9)).toFixed(3),
    sinkBefore: sinkB,
    sinkAfter: sinkA,
  };
}

function oracle() {
  const n = 80;
  const dirty = 3;
  const { world, entities } = seedWorld(n);
  const fenceInc = createSnapshotFence({ capacity: n });
  const fenceFull = createSnapshotFence({ capacity: n });
  primeRing(world, fenceInc, entities, dirty);
  primeRing(world, fenceFull, entities, dirty);
  markDirtyMovers(world, entities, dirty);
  packPresentationWorldToFence(world, fenceInc, 10, 1);
  packPresentationWorldToFence(world, fenceFull, 10, 1, { forceFull: true });
  const a = fenceInc.latestSnapshot();
  const b = fenceFull.latestSnapshot();
  let mismatches = 0;
  if (a.count !== b.count) mismatches += 1000;
  for (let i = 0; i < a.count; i++) {
    const p = i * 3;
    const q = i * 4;
    if (Math.abs(a.columns.position[p] - b.columns.position[p]) > 1e-5) mismatches++;
    if (Math.abs(a.columns.position[p + 2] - b.columns.position[p + 2]) > 1e-5) mismatches++;
    if (Math.abs(a.columns.quaternion[q + 1] - b.columns.quaternion[q + 1]) > 1e-5) mismatches++;
    if (Math.abs(a.columns.quaternion[q + 3] - b.columns.quaternion[q + 3]) > 1e-5) mismatches++;
    if (a.columns.entityId[i] !== b.columns.entityId[i]) mismatches++;
    if (Math.abs((a.columns.bank[i] || 0) - (b.columns.bank[i] || 0)) > 1e-5) mismatches++;
  }
  return { mismatches, count: a.count };
}

const scenarios = [
  runScenario(120, 1, 12000),
  runScenario(120, 3, 12000),
  runScenario(200, 2, 10000),
  runScenario(400, 4, 8000),
  runScenario(400, 40, 8000),
];
const out = {
  label: 'snapshot-fence-dirty-incremental',
  oracle: oracle(),
  scenarios,
  primary: scenarios.find((s) => s.entities === 400 && s.dirty === 4) || scenarios[3],
  note: 'Portable pack. Soft-GPU fps not claimed. Before=forceFull dense rewrite; After=layout-stable dirty incremental. Both include applyTransform mark cost equally.',
};
console.log(JSON.stringify(out, null, 2));
writeFileSync(
  new URL('./snapshot-fence-dirty-incremental-microbench.json', import.meta.url),
  JSON.stringify(out, null, 2),
);
