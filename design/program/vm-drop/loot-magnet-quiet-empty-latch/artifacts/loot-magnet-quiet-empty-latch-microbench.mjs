/**
 * Primary KPI: _lootMagnetRelevant when pickups+payloads indexes empty.
 * Before = player resolve + 2× indexedTypeScan every tick.
 * After  = latch; wake on entityIndexVersion.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS = ${ITERS};
const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
function make() {
  return {
    quiet: false, quietVersion: -1, walks: 0, skips: 0,
    helpers: { player() { return player; } },
    state: {
      playerId: 1,
      entityIndex: { ready: true, version: 5, pickups: [], payloads: [], __spacefaceEntityIndexV1: true },
    },
  };
}
function scan(state, bucket) {
  const index = state.entityIndex;
  if (index && index.ready && Array.isArray(index[bucket])) return index[bucket];
  return [];
}
function before(h) {
  h.walks++;
  const state = h.state;
  const p = h.helpers.player();
  if (!p || !p.alive || !p.pos) return false;
  const pickups = scan(state, 'pickups');
  const payloads = scan(state, 'payloads');
  return !!(pickups.length || payloads.length);
}
function after(h) {
  const state = h.state;
  const version = state.entityIndex.version;
  if (h.quiet && version === h.quietVersion) {
    h.skips++;
    return false;
  }
  h.walks++;
  const p = h.helpers.player();
  if (!p || !p.alive || !p.pos) return false;
  const pickups = scan(state, 'pickups');
  const payloads = scan(state, 'payloads');
  const relevant = !!(pickups.length || payloads.length);
  if (!relevant) { h.quiet = true; h.quietVersion = version; }
  else h.quiet = false;
  return relevant;
}
const h = make();
const fn = ${JSON.stringify(mode)} === 'before' ? before : after;
for (let i = 0; i < 3000; i++) fn(h);
h.walks = 0; h.skips = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn(h);
console.log(JSON.stringify({ ms: performance.now() - t0, walks: h.walks, skips: h.skips, quiet: !!h.quiet, mode: ${JSON.stringify(mode)} }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}
function median(xs) { const a = [...xs].sort((x,y)=>x-y); return a[Math.floor(a.length/2)]; }

function dirtyWakeProof() {
  const script = `
const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
const h = {
  quiet: false, quietVersion: -1, walks: 0, skips: 0,
  helpers: { player() { return player; } },
  state: {
    playerId: 1,
    entityIndex: { ready: true, version: 1, pickups: [], payloads: [], __spacefaceEntityIndexV1: true },
  },
};
function scan(state, bucket) {
  const index = state.entityIndex;
  if (index && index.ready && Array.isArray(index[bucket])) return index[bucket];
  return [];
}
function after(hh) {
  const state = hh.state;
  const version = state.entityIndex.version;
  if (hh.quiet && version === hh.quietVersion) { hh.skips++; return false; }
  hh.walks++;
  const p = hh.helpers.player();
  if (!p || !p.alive || !p.pos) return false;
  const pickups = scan(state, 'pickups');
  const payloads = scan(state, 'payloads');
  const relevant = !!(pickups.length || payloads.length);
  if (!relevant) { hh.quiet = true; hh.quietVersion = version; }
  else hh.quiet = false;
  return relevant;
}
after(h); // latch
const skipsBefore = h.skips;
after(h); after(h);
if (!h.quiet || h.skips < skipsBefore + 2) throw new Error('failed to stay latched');
h.state.entityIndex.version = 2;
h.state.entityIndex.pickups = [{ id: 9 }];
const woke = after(h);
if (!woke || h.quiet) throw new Error('failed to wake');
h.state.entityIndex.version = 3;
h.state.entityIndex.pickups = [];
after(h);
if (!h.quiet || h.quietVersion !== 3) throw new Error('failed to re-latch');
console.log(JSON.stringify({ ok: true, quietVersion: h.quietVersion, skips: h.skips, walks: h.walks }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before'); const a = runOnce('after');
  pairs.push({ beforeMs: b.ms, afterMs: a.ms, speedup: b.ms / Math.max(1e-9, a.ms), beforeWalks: b.walks, afterSkips: a.skips, afterWalks: a.walks });
}
const s = pairs.map(p => p.speedup);
const wake = dirtyWakeProof();
const out = {
  name: 'loot-magnet-quiet-empty-latch',
  primary: 'quiet-loot-magnet-empty-buckets',
  iterations: ITERS,
  runs: RUNS,
  medianSpeedup: median(s),
  minSpeedup: Math.min(...s),
  maxSpeedup: Math.max(...s),
  dirtyWake: wake,
  pairs,
};
writeFileSync('artifacts/loot-magnet-quiet-empty-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ name: out.name, median: +out.medianSpeedup.toFixed(3), min: +out.minSpeedup.toFixed(3), max: +out.maxSpeedup.toFixed(3), dirtyWake: wake }, null, 2));
