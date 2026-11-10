/**
 * Primary KPI: sanitize cost for the every-frame ship:thrust envelope.
 * Before = sorted Object.keys sanitizePayload (bench toggle off).
 * After  = typed sanitizeThrustPayload fast path.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  sanitizePayload,
  sanitizeThrustPayload,
  setThrustTraceSanitizeFastForBench,
  getThrustTraceSanitizeFastForBench,
} from '../src/core/eventTrace.js';

const ITERS = 30000;
const RUNS = 7;

function makePayload(i) {
  return {
    id: 1,
    shipId: 1,
    throttle: 0.55 + (i % 10) * 0.01,
    reverse: 0,
    strafe: (i % 5) * 0.02,
    boost: false,
    nozzles: [
      { role: 'main', strength: 0.55 + (i % 10) * 0.01, angle: 0 },
    ],
  };
}

function bench(fn) {
  for (let i = 0; i < 2000; i++) fn(makePayload(i));
  const times = [];
  for (let run = 0; run < RUNS; run++) {
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) fn(makePayload(i));
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { med: times[(RUNS / 2) | 0], min: times[0], max: times[RUNS - 1], times };
}

const restore = getThrustTraceSanitizeFastForBench();
setThrustTraceSanitizeFastForBench(false);
const before = bench((p) => sanitizePayload(p));
setThrustTraceSanitizeFastForBench(true);
const after = bench((p) => sanitizeThrustPayload(p));
setThrustTraceSanitizeFastForBench(restore);

let mismatches = 0;
for (let i = 0; i < 200; i++) {
  const p = makePayload(i);
  if (JSON.stringify(sanitizePayload(p)) !== JSON.stringify(sanitizeThrustPayload(p))) mismatches += 1;
}

const speedup = before.med / after.med;
const result = {
  iters: ITERS,
  runs: RUNS,
  beforeMedMs: +before.med.toFixed(3),
  afterMedMs: +after.med.toFixed(3),
  minSpeedup: +(before.min / after.max).toFixed(3),
  medSpeedup: +speedup.toFixed(3),
  maxSpeedup: +(before.max / after.min).toFixed(3),
  jsonMismatches: mismatches,
  primary: `~${speedup.toFixed(2)}×`,
};

writeFileSync(
  new URL('./event-trace-thrust-sanitize-microbench.json', import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
if (mismatches !== 0) process.exit(2);
if (speedup < 1.5) process.exit(3);
