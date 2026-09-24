/**
 * Primary KPI: selectClassifyEntities seen-membership on quiet incremental classify.
 * Before = Set.clear() + has/add every pass (production prior).
 * After  = dense Uint32Array id-epoch marks (bump epoch; no clear/rehash).
 * Quiet mix: exact+near ids + ~180 radius rocks, empty projectiles lane.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXACT = 8;
const NEAR = 40;
const RADIUS = 180;
const ITERS = 12000;
const RUNS = 11;

function childScript(mode) {
  return `
const { performance } = await import('node:perf_hooks');
const EXACT = ${EXACT}, NEAR = ${NEAR}, RADIUS = ${RADIUS}, ITERS = ${ITERS}, RUNS = ${RUNS};
const exactIds = Array.from({ length: EXACT }, (_, i) => i + 1);
const nearIds = Array.from({ length: NEAR }, (_, i) => 100 + i);
const entities = new Map();
for (const id of exactIds) entities.set(id, { id, alive: true, type: 'ship' });
for (const id of nearIds) entities.set(id, { id, alive: true, type: 'asteroid' });
const radiusHits = [];
for (let i = 0; i < RADIUS; i++) {
  const id = i < EXACT ? exactIds[i] : 1000 + i;
  radiusHits.push(i < EXACT ? entities.get(id) : { id, alive: true, type: 'asteroid' });
}
const projectiles = [];
const out = [];
const mode = ${JSON.stringify(mode)};

function runSet() {
  out.length = 0;
  const seen = runSet._seen || (runSet._seen = new Set());
  seen.clear();
  const add = (e) => {
    if (!e || e.alive === false || seen.has(e.id)) return;
    seen.add(e.id);
    out.push(e);
  };
  for (const id of exactIds) add(entities.get(id));
  for (const id of nearIds) add(entities.get(id));
  if (projectiles.length) {
    for (const e of projectiles) if (e && e.alive !== false && e.type === 'projectile') add(e);
  }
  for (const e of radiusHits) add(e);
  return out.length;
}

function runEpoch() {
  out.length = 0;
  let marks = runEpoch._marks || (runEpoch._marks = new Uint32Array(0));
  let epoch = (runEpoch._epoch | 0) + 1;
  if (epoch >= 0x7fffffff) { marks.fill(0); epoch = 1; }
  runEpoch._epoch = epoch;
  const ensure = (id) => {
    if (id < marks.length) return;
    let cap = marks.length || 64;
    while (cap <= id) cap <<= 1;
    const next = new Uint32Array(cap);
    next.set(marks);
    marks = next;
    runEpoch._marks = next;
  };
  const add = (e) => {
    if (!e || e.alive === false) return;
    const id = e.id | 0;
    if (id < 0) return;
    ensure(id);
    if (marks[id] === epoch) return;
    marks[id] = epoch;
    out.push(e);
  };
  for (const id of exactIds) add(entities.get(id));
  for (const id of nearIds) add(entities.get(id));
  if (projectiles.length) {
    for (const e of projectiles) if (e && e.alive !== false && e.type === 'projectile') add(e);
  }
  for (const e of radiusHits) add(e);
  return out.length;
}

const fn = mode === 'epoch' ? runEpoch : runSet;
fn();
const times = [];
let last = 0;
for (let run = 0; run < RUNS; run++) {
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) last = fn();
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const median = times[(times.length / 2) | 0];
process.stdout.write(JSON.stringify({ mode, median, last, times }));
`;
}

function runMode(mode) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', childScript(mode)], {
    encoding: 'utf8',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
  });
  if (result.status !== 0) {
    throw new Error(`child ${mode} failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

const before = runMode('set');
const after = runMode('epoch');
if (before.last !== after.last) {
  throw new Error(`admit parity mismatch ${before.last} vs ${after.last}`);
}
const speedup = before.median / after.median;
const payload = {
  label: 'select-classify-epoch-seen',
  before: { ms: +before.median.toFixed(3), admitted: before.last },
  after: { ms: +after.median.toFixed(3), admitted: after.last },
  speedup: +speedup.toFixed(3),
  note: 'Portable CPU. Soft-GPU fps not claimed. Before=Set.clear; After=Uint32Array id-epoch marks.',
};
writeFileSync(
  fileURLToPath(new URL('./select-classify-epoch-seen-microbench.json', import.meta.url)),
  `${JSON.stringify(payload, null, 2)}\n`,
);
console.log(JSON.stringify(payload, null, 2));
