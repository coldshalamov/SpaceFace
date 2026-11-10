/**
 * Primary KPI: classifyWorld physics partition cache.
 * Before = entityNeedsPhysics + shouldSyncPhysicsBodyEntity + isDynamicPhysicsBodyEntity.
 * After  = cached entity._physicsPartition (0/1/2) warmed as applyStamp / first touch.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import {
  shouldSyncPhysicsBodyEntity,
  isDynamicPhysicsBodyEntity,
} from '../src/core/physicsAuthority.js';
import {
  entityNeedsPhysics,
  refreshPhysicsPartition,
} from '../src/world/activityRuntime.js';

const N = 180;
const ITERS = 80000;
const RUNS = 11;

function makeEntities() {
  const list = [];
  for (let i = 0; i < N; i++) {
    const tier = i < 40 ? 'S0_EXACT' : i < 90 ? 'S1_NEAR' : i < 140 ? 'S3_DORMANT' : 'S2_ABSTRACT';
    let type = 'ship';
    if (i % 17 === 0) type = 'projectile';
    else if (i % 23 === 0) type = 'station';
    else if (i % 29 === 0) type = 'asteroid';
    else if (i % 31 === 0) type = 'fx';
    const isChunk = type === 'asteroid' && i % 2 === 0;
    list.push({
      id: i + 1,
      type,
      alive: true,
      radius: type === 'projectile' ? 1 : 4,
      physicsBody: type === 'fx' && i % 2 === 0
        ? false
        : (i % 5 === 0 ? null : { dynamic: type === 'station' ? false : true, radius: type === 'projectile' ? 1 : 4 }),
      activity: { simTier: tier, pinnedExact: i === 3 },
      collides: type === 'fx' ? false : true,
      data: isChunk ? { isChunk: true } : null,
      _physicsPartition: undefined,
    });
  }
  return list;
}

function walkBefore(list) {
  const dynamics = [];
  const statics = [];
  let last = 0;
  for (let t = 0; t < ITERS; t++) {
    dynamics.length = 0;
    statics.length = 0;
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      if (!entityNeedsPhysics(entity)) continue;
      if (!shouldSyncPhysicsBodyEntity(entity)) continue;
      if (isDynamicPhysicsBodyEntity(entity) || entity.type === 'projectile') dynamics.push(entity);
      else statics.push(entity);
    }
    last = dynamics.length + statics.length * 1000;
  }
  return last;
}

function walkAfter(list) {
  const dynamics = [];
  const statics = [];
  let last = 0;
  for (let t = 0; t < ITERS; t++) {
    dynamics.length = 0;
    statics.length = 0;
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      let partition = entity._physicsPartition;
      if (partition !== 0 && partition !== 1 && partition !== 2) {
        partition = refreshPhysicsPartition(entity);
      }
      if (partition === 2) dynamics.push(entity);
      else if (partition === 1) statics.push(entity);
    }
    last = dynamics.length + statics.length * 1000;
  }
  return last;
}

function bench(which) {
  const list = makeEntities();
  if (which === 'after') {
    for (const e of list) refreshPhysicsPartition(e);
  }
  (which === 'after' ? walkAfter : walkBefore)(list);
  const times = [];
  let last = 0;
  for (let r = 0; r < RUNS; r++) {
    const L = makeEntities();
    if (which === 'after') for (const e of L) refreshPhysicsPartition(e);
    const t0 = performance.now();
    last = (which === 'after' ? walkAfter : walkBefore)(L);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { med: times[(RUNS / 2) | 0], min: times[0], max: times[RUNS - 1], last };
}

const mode = process.argv[2];
if (mode === 'before' || mode === 'after') {
  process.stdout.write(`${JSON.stringify(bench(mode))}\n`);
  process.exit(0);
}

const self = fileURLToPath(import.meta.url);
function runChild(which) {
  const res = spawnSync(process.execPath, [self, which], { encoding: 'utf8', cwd: process.cwd() });
  if (res.status !== 0) {
    process.stderr.write(res.stderr || res.stdout || `child ${which} failed\n`);
    process.exit(res.status || 1);
  }
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

const before = runChild('before');
const after = runChild('after');
const speedup = before.med / after.med;

// Admit + production refresh parity
const list = makeEntities();
const dB = [], sB = [], dA = [], sA = [];
for (const e of list) {
  if (!entityNeedsPhysics(e)) continue;
  if (!shouldSyncPhysicsBodyEntity(e)) continue;
  if (isDynamicPhysicsBodyEntity(e) || e.type === 'projectile') dB.push(e.id);
  else sB.push(e.id);
}
for (const e of list) {
  const k = refreshPhysicsPartition(e);
  if (k === 2) dA.push(e.id);
  else if (k === 1) sA.push(e.id);
}
const sortJoin = (a) => [...a].sort((x, y) => x - y).join(',');
const admitParity = sortJoin(dB) === sortJoin(dA) && sortJoin(sB) === sortJoin(sA);

const result = {
  label: 'classify-physics-partition-cache',
  n: N,
  iters: ITERS,
  runs: RUNS,
  beforeMedMs: +before.med.toFixed(3),
  afterMedMs: +after.med.toFixed(3),
  minSpeedup: +(before.min / after.max).toFixed(3),
  medSpeedup: +speedup.toFixed(3),
  maxSpeedup: +(before.max / after.min).toFixed(3),
  admitParity,
  dynamics: dA.length,
  statics: sA.length,
  primary: `~${speedup.toFixed(2)}×`,
  clears_bar: speedup >= 1.5 && admitParity,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./classify-physics-partition-cache-microbench.json', import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
process.exit(result.clears_bar ? 0 : 3);
