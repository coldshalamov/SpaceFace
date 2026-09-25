/**
 * Primary KPI: packPresentationWorldToFence residual when dirtyCount > 0 after #51+#68.
 * Before = O(active) dirtyMasks scan after copyDenseFrom.
 * After  = O(dirtyCount) dirtySlots list rewrite.
 * Quiet Ceres-shaped: parked majority, few TRANSFORM-dirty movers.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import {
  createSnapshotFence,
  packPresentationWorldToFence,
  setSnapshotFenceDirtySlotListForBench,
  getSnapshotFenceDirtySlotListForBench,
} from '../src/render/snapshotFence.js';

const __filename = fileURLToPath(import.meta.url);

function seed(n) {
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

function clearAllDirty(world) {
  const active = world.getDiagnostics().active;
  for (let a = 0; a < active; a++) world.clearDirty(world.activeSlots[a]);
}

function markDirtyMovers(world, entities, dirtyCount) {
  for (let i = 0; i < dirtyCount; i++) {
    const entity = entities[i];
    entity.pos.x += 0.05;
    entity.rot += 0.001;
    world.applyTransform({
      entityId: entity.id,
      generation: 0,
      revision: (entity._rev = (entity._rev || 0) + 1),
      x: entity.pos.x,
      y: 0,
      z: entity.pos.z,
      rot: entity.rot,
      bank: 0,
      pitch: 0,
    }, entity);
  }
}

function prime(world, fence) {
  for (let i = 0; i < 3; i++) {
    packPresentationWorldToFence(world, fence, i * 0.016, 1, { forceFull: true });
    clearAllDirty(world);
  }
}

function checksum(fence) {
  const snap = fence.latestSnapshot();
  if (!snap) return 0;
  let h = snap.count | 0;
  const pos = snap.columns.position;
  const n = Math.min(pos.length, (snap.count | 0) * 3);
  for (let i = 0; i < n; i++) h = (Math.imul(h, 31) + (pos[i] * 1000 | 0)) | 0;
  return h;
}

function runScenario(n, dirtyCount, frames, useList) {
  const restore = getSnapshotFenceDirtySlotListForBench();
  setSnapshotFenceDirtySlotListForBench(useList);
  const { world, entities } = seed(n);
  const fence = createSnapshotFence({ capacity: n });
  prime(world, fence);
  // warm
  for (let f = 0; f < 200; f++) {
    markDirtyMovers(world, entities, dirtyCount);
    packPresentationWorldToFence(world, fence, 1 + f * 0.016, 1);
    clearAllDirty(world);
  }
  const times = [];
  for (let f = 0; f < frames; f++) {
    markDirtyMovers(world, entities, dirtyCount);
    const t0 = performance.now();
    packPresentationWorldToFence(world, fence, 100 + f * 0.016, 1);
    times.push(performance.now() - t0);
    clearAllDirty(world);
  }
  setSnapshotFenceDirtySlotListForBench(restore);
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    n,
    dirtyCount,
    frames,
    useList,
    medianMs: median,
    totalMs: sum,
    checksum: checksum(fence),
    dirtyCountEnd: world.dirtyCount,
  };
}

function childPair(n, dirtyCount, frames) {
  const before = runScenario(n, dirtyCount, frames, false);
  const after = runScenario(n, dirtyCount, frames, true);
  return {
    n,
    dirtyCount,
    frames,
    beforeMs: before.totalMs,
    afterMs: after.totalMs,
    beforeMedianMs: before.medianMs,
    afterMedianMs: after.medianMs,
    speedup: before.totalMs / Math.max(1e-9, after.totalMs),
    checksumBefore: before.checksum,
    checksumAfter: after.checksum,
    checksumMatch: before.checksum === after.checksum,
  };
}

function main() {
  if (process.argv.includes('--child')) {
    const n = Number(process.argv[process.argv.indexOf('--n') + 1]);
    const dirty = Number(process.argv[process.argv.indexOf('--dirty') + 1]);
    const frames = Number(process.argv[process.argv.indexOf('--frames') + 1]);
    const result = childPair(n, dirty, frames);
    process.stdout.write(JSON.stringify(result));
    return;
  }

  const scenarios = [
    { n: 180, dirty: 1, frames: 12000, label: 'quiet-180ents-1dirty' },
    { n: 180, dirty: 3, frames: 12000, label: 'quiet-180ents-3dirty' },
    { n: 400, dirty: 4, frames: 10000, label: 'quiet-400ents-4dirty' },
    { n: 400, dirty: 40, frames: 8000, label: 'combat-ish-400ents-40dirty' },
  ];
  const report = { label: 'snapshot-fence-dirty-slot-list', scenarios: {}, pairs: {} };

  for (const sc of scenarios) {
    const pairs = [];
    for (let i = 0; i < 7; i++) {
      const r = spawnSync(process.execPath, [
        __filename, '--child',
        '--n', String(sc.n),
        '--dirty', String(sc.dirty),
        '--frames', String(sc.frames),
      ], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
      if (r.status !== 0) {
        console.error(r.stderr || r.stdout);
        process.exit(r.status || 1);
      }
      const parsed = JSON.parse(r.stdout);
      pairs.push(parsed);
      console.log(
        `${sc.label} pair${i}: ${parsed.speedup.toFixed(3)}× `
        + `(${parsed.beforeMs.toFixed(1)}→${parsed.afterMs.toFixed(1)} ms) `
        + `cs=${parsed.checksumMatch}`,
      );
    }
    const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
    const mid = speedups[Math.floor(speedups.length / 2)];
    report.scenarios[sc.label] = {
      n: sc.n,
      dirty: sc.dirty,
      frames: sc.frames,
      pairs,
      medianSpeedup: mid,
      minSpeedup: speedups[0],
      maxSpeedup: speedups[speedups.length - 1],
      allChecksumMatch: pairs.every((p) => p.checksumMatch),
    };
    console.log(
      `→ ${sc.label} median ${mid.toFixed(3)}× floor ${speedups[0].toFixed(3)}×`,
    );
  }

  const primary = report.scenarios['quiet-180ents-1dirty'];
  report.primary = {
    label: 'quiet-180ents-1dirty',
    medianSpeedup: primary.medianSpeedup,
    minSpeedup: primary.minSpeedup,
  };
  const out = new URL('./snapshot-fence-dirty-slot-list-microbench.json', import.meta.url);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('wrote', out.pathname);
  console.log('PRIMARY median', primary.medianSpeedup.toFixed(3), 'floor', primary.minSpeedup.toFixed(3));
}

main();
