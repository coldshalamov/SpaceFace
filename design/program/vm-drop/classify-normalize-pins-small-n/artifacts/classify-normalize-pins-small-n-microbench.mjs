/**
 * Primary KPI: normalizePinReasons on quiet Ceres-shaped pin lists.
 * Before = always Set.clear + scan + sort.
 * After  = 0/1/2-pin fast path (skip Set/sort); n>=3 keeps Set+sort.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PIN_REASON, normalizePinReasons } from '../src/world/activityClassification.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const mode = process.argv[2] || 'all';

const N = 200;
const ITERS = 50000;
const RUNS = 11;

const PIN_SET = new Set(Object.values(PIN_REASON));

/** Legacy normalize — always Set.clear + sort (pre-fast-path). */
function normalizeBefore(list, scratch = null) {
  const out = scratch && Array.isArray(scratch.out) ? scratch.out : [];
  if (scratch && Array.isArray(scratch.out)) out.length = 0;
  const seen = scratch && scratch.seen instanceof Set ? scratch.seen : new Set();
  if (scratch && scratch.seen instanceof Set) seen.clear();
  const src = Array.isArray(list) ? list : [];
  for (let i = 0; i < src.length; i++) {
    const reason = src[i];
    if (!PIN_SET.has(reason) || seen.has(reason)) continue;
    seen.add(reason);
    out.push(reason);
  }
  out.sort();
  return out;
}

/** Quiet Ceres mix: mostly empty rock pins, sparse singles, rare multi. */
function makeLists() {
  const lists = [];
  for (let i = 0; i < N; i++) {
    const r = i % 100;
    if (r < 89) lists.push([]);
    else if (r < 98) lists.push([PIN_REASON.VISIBLE_ON_GLASS]);
    else if (r < 99) lists.push([PIN_REASON.PLAYER, PIN_REASON.VISIBLE_ON_GLASS]);
    else {
      lists.push([
        PIN_REASON.MISSION_CRITICAL,
        PIN_REASON.HOSTILE_AGGRO,
        PIN_REASON.VISIBLE_ON_GLASS,
        PIN_REASON.MISSION_CRITICAL,
      ]);
    }
  }
  return lists;
}

function histOf(lists) {
  const h = { 0: 0, 1: 0, 2: 0, more: 0 };
  for (const L of lists) {
    if (L.length === 0) h[0]++;
    else if (L.length === 1) h[1]++;
    else if (L.length === 2) h[2]++;
    else h.more++;
  }
  return h;
}

function walk(which, lists) {
  const scratch = { out: [], seen: new Set() };
  const fn = which === 'after' ? normalizePinReasons : normalizeBefore;
  let last = 0;
  for (let t = 0; t < ITERS; t++) {
    for (let i = 0; i < lists.length; i++) {
      last += fn(lists[i], scratch).length;
    }
  }
  return last;
}

function bench(which) {
  const lists = makeLists();
  walk(which, lists); // warmup
  const times = [];
  let last = 0;
  for (let r = 0; r < RUNS; r++) {
    const L = makeLists();
    const t0 = performance.now();
    last = walk(which, L);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    med: times[(times.length / 2) | 0],
    min: times[0],
    max: times[times.length - 1],
    times,
    last,
    hist: histOf(lists),
  };
}

function isolated(which) {
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), which], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`isolated ${which} failed: ${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

if (mode === 'before' || mode === 'after') {
  const r = bench(mode);
  console.log(JSON.stringify({
    mode,
    medMs: +r.med.toFixed(3),
    minMs: +r.min.toFixed(3),
    maxMs: +r.max.toFixed(3),
    last: r.last,
    hist: r.hist,
  }));
  process.exit(0);
}

const beforeRuns = [];
const afterRuns = [];
for (let i = 0; i < 5; i++) {
  beforeRuns.push(isolated('before'));
  afterRuns.push(isolated('after'));
}
beforeRuns.sort((a, b) => a.medMs - b.medMs);
afterRuns.sort((a, b) => a.medMs - b.medMs);
const beforeMed = beforeRuns[(beforeRuns.length / 2) | 0].medMs;
const afterMed = afterRuns[(afterRuns.length / 2) | 0].medMs;
const speedups = beforeRuns.map((b, i) => b.medMs / afterRuns[i].medMs);
speedups.sort((a, b) => a - b);
const minSpeedup = speedups[0];
const medSpeedup = beforeMed / afterMed;
const maxSpeedup = speedups[speedups.length - 1];

// Parity: same outputs on a fixed corpus
{
  const lists = makeLists();
  const sb = { out: [], seen: new Set() };
  const sa = { out: [], seen: new Set() };
  for (const L of lists) {
    const b = normalizeBefore(L, sb).join('|');
    const a = normalizePinReasons(L, sa).join('|');
    if (b !== a) throw new Error(`parity mismatch: ${b} vs ${a}`);
  }
}

const out = {
  label: 'classify-normalize-pins-small-n',
  N,
  ITERS,
  RUNS,
  isolatedPairs: 5,
  hist: beforeRuns[0].hist,
  beforeMedMs: beforeMed,
  afterMedMs: afterMed,
  minSpeedup: +minSpeedup.toFixed(3),
  medSpeedup: +medSpeedup.toFixed(3),
  maxSpeedup: +maxSpeedup.toFixed(3),
  beforeRuns: beforeRuns.map((r) => r.medMs),
  afterRuns: afterRuns.map((r) => r.medMs),
  admitParity: true,
  primary: `~${medSpeedup.toFixed(2)}×`,
  ship_bar: 1.5,
  clears_bar: medSpeedup >= 1.5 && minSpeedup >= 1.5,
};
writeFileSync(
  join(__dirname, 'classify-normalize-pins-small-n-microbench.json'),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
