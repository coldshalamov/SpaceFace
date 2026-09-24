/**
 * Primary KPI: isMovableEntity re-check on index.movables each preStep.
 * Before = isDynamicPhysicsBodyEntity + type switch (production prior).
 * After  = trust movables lane membership (append already gated).
 * Quiet mix: ships + fracture chunks; mirrors profile authoredPhysicsBody under
 * isMovableEntity from preStep. Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';

const SHIPS = 220;
const CHUNKS = 40;
const TICKS = 80000;
const RUNS = 9;

function isMovableEntity(e) {
  if (isDynamicPhysicsBodyEntity(e)) return true;
  switch (e.type) {
    case 'ship':
    case 'drone':
    case 'projectile':
    case 'pickup':
    case 'payload':
    case 'fx':
    case 'massSeed':
    case 'bomb':
      return true;
    default:
      return false;
  }
}

function makeMovables() {
  const list = [];
  for (let i = 0; i < SHIPS; i++) {
    list.push({
      id: i + 1,
      type: 'ship',
      alive: true,
      // Occasional missing authored dynamic forces defaultDynamic(type) fallback.
      physicsBody: i % 5 === 0 ? null : { dynamic: true, radius: 4 },
      radius: 4,
    });
  }
  for (let i = 0; i < CHUNKS; i++) {
    list.push({
      id: 10000 + i,
      type: 'asteroid',
      alive: true,
      physicsBody: { dynamic: true, radius: 6 },
      data: { isChunk: true },
      radius: 6,
    });
  }
  return list;
}

function gateWalk(movables, trustLane) {
  let admitted = 0;
  for (let t = 0; t < TICKS; t++) {
    for (let i = 0; i < movables.length; i++) {
      const e = movables[i];
      if (!e || !e.alive) continue;
      if (!trustLane && !isMovableEntity(e)) continue;
      admitted++;
    }
  }
  return admitted;
}

function benchMode(trustLane) {
  gateWalk(makeMovables(), trustLane);
  const times = [];
  let last = 0;
  for (let run = 0; run < RUNS; run++) {
    const m = makeMovables();
    const t0 = performance.now();
    last = gateWalk(m, trustLane);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    med: times[(RUNS / 2) | 0],
    min: times[0],
    max: times[RUNS - 1],
    times,
    last,
  };
}

const mode = process.argv[2];
if (mode === 'before' || mode === 'after') {
  process.stdout.write(`${JSON.stringify(benchMode(mode === 'after'))}\n`);
  process.exit(0);
}

const self = fileURLToPath(import.meta.url);
function runChild(which) {
  const res = spawnSync(process.execPath, [self, which], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  if (res.status !== 0) {
    process.stderr.write(res.stderr || res.stdout || `child ${which} failed\n`);
    process.exit(res.status || 1);
  }
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

const before = runChild('before');
const after = runChild('after');
const speedup = before.med / after.med;
const result = {
  ships: SHIPS,
  chunks: CHUNKS,
  ticks: TICKS,
  runs: RUNS,
  beforeMedMs: +before.med.toFixed(3),
  afterMedMs: +after.med.toFixed(3),
  minSpeedup: +(before.min / after.max).toFixed(3),
  medSpeedup: +speedup.toFixed(3),
  maxSpeedup: +(before.max / after.min).toFixed(3),
  admitParity: before.last === after.last,
  primary: `~${speedup.toFixed(2)}×`,
};
writeFileSync(
  new URL('./prestep-movables-trust-microbench.json', import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
if (!result.admitParity) process.exit(2);
if (speedup < 1.5) process.exit(3);
