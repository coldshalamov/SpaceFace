/**
 * Primary KPI: packPresentationWorldToFence residual under prepareFrame after #51.
 * Before = always beginIncrementalPack + copyDenseFrom on zero-dirty ticks.
 * After  = O(1) world.dirtyCount === 0 retains sealed latest (no dense copy).
 * Quiet Ceres-shaped: parked majority, measured on zero-dirty ticks.
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
  // Fill the ring with full packs so incremental is eligible for the "before" path.
  for (let i = 0; i < 3; i++) {
    packPresentationWorldToFence(world, fence, i * 0.016, 1, { forceFull: true });
    clearAllDirty(world);
  }
}

function packBefore(world, fence, simTime) {
  const active = world.getDiagnostics().active;
  const snapshot = fence.beginIncrementalPack(active, simTime, 1, world.layoutVersion);
  if (!snapshot || (snapshot.count | 0) !== active) {
    return packPresentationWorldToFence(world, fence, simTime, 1, { forceFull: true });
  }
  fence.commit();
  return active;
}

function runScenario(n, dirtyCount, frames) {
  const beforeSeed = seed(n);
  const afterSeed = seed(n);
  const fenceBefore = createSnapshotFence({ capacity: n });
  const fenceAfter = createSnapshotFence({ capacity: n });
  prime(beforeSeed.world, fenceBefore);
  prime(afterSeed.world, fenceAfter);

  const beforeTimes = [];
  const afterTimes = [];

  for (let f = 0; f < frames; f++) {
    if (dirtyCount > 0) {
      markDirtyMovers(beforeSeed.world, beforeSeed.entities, dirtyCount);
      markDirtyMovers(afterSeed.world, afterSeed.entities, dirtyCount);
    } else {
      clearAllDirty(beforeSeed.world);
      clearAllDirty(afterSeed.world);
    }
    const tb0 = performance.now();
    packBefore(beforeSeed.world, fenceBefore, 1 + f * 0.016);
    beforeTimes.push(performance.now() - tb0);
    clearAllDirty(beforeSeed.world);

    const ta0 = performance.now();
    packPresentationWorldToFence(afterSeed.world, fenceAfter, 1 + f * 0.016, 1);
    afterTimes.push(performance.now() - ta0);
    clearAllDirty(afterSeed.world);
  }

  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const beforeMed = median(beforeTimes);
  const afterMed = median(afterTimes);
  return {
    n,
    dirtyCount,
    frames,
    beforeMedMs: beforeMed,
    afterMedMs: afterMed,
    speedup: afterMed > 0 ? beforeMed / afterMed : 0,
    dirtyCountAfterPrime: afterSeed.world.dirtyCount,
    packCountBefore: fenceBefore.packCount,
    packCountAfter: fenceAfter.packCount,
  };
}

if (process.argv[2] === 'child') {
  const result = runScenario(Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5]));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

function isolated(scenario) {
  const r = spawnSync(process.execPath, [__filename, 'child', String(scenario.n), String(scenario.dirtyCount), String(scenario.frames)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const scenarios = [
  { n: 120, dirtyCount: 0, frames: 12000 },
  { n: 400, dirtyCount: 0, frames: 10000 },
  { n: 400, dirtyCount: 4, frames: 8000 },
];
const runs = [];
for (const scenario of scenarios) {
  const samples = [];
  for (let i = 0; i < 7; i++) samples.push(isolated(scenario));
  samples.sort((a, b) => a.speedup - b.speedup);
  const med = samples[Math.floor(samples.length / 2)];
  runs.push({ ...med, minSpeedup: samples[0].speedup, maxSpeedup: samples[samples.length - 1].speedup });
  console.log(
    `n=${med.n} dirty=${med.dirtyCount} → ${med.speedup.toFixed(2)}× (min ${samples[0].speedup.toFixed(2)}×) before=${med.beforeMedMs.toFixed(4)}ms after=${med.afterMedMs.toFixed(4)}ms packs ${med.packCountBefore}→${med.packCountAfter}`,
  );
}
const primary = runs.find((r) => r.n === 400 && r.dirtyCount === 0) || runs[0];
const report = {
  label: 'snapshot-fence-zero-dirty-retain',
  primary,
  runs,
  ship_bar: 1.5,
  clears_bar: primary.speedup >= 1.5 && primary.minSpeedup >= 1.5,
  note: 'Soft-GPU fps not claimed. O(1) dirtyCount zero-dirty retain under prepareFrame packFence after #51.',
};
writeFileSync(new URL('./snapshot-fence-zero-dirty-retain-microbench.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
