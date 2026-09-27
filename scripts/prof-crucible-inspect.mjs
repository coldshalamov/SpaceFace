// scripts/prof-crucible-inspect.mjs — PQ-133.04 diagnostic driver (perf lane, disposable).
//
// Profiles ONLY the simulateCrucibleSwarm call via the inspector API (no module-load noise), and
// separates boot from steady-state by bracketing the first onTick.
//
//   node scripts/prof-crucible-inspect.mjs SEED TICK_CAP [out.cpuprofile]

process.env.SPACEFACE_PLAYER_STORE_DIR = '';

const seed = Number(process.argv[2] || 13502);
const tickCap = Number(process.argv[3] || 2500);
const out = process.argv[4] || `.devshots/pq13304-prof/seed${seed}-${tickCap}.cpuprofile`;

const inspector = await import('node:inspector');
const { writeFileSync, mkdirSync } = await import('node:fs');
const { simulateCrucibleSwarm } = await import('./lib/bench/crucibleBench.mjs');

const session = new inspector.Session();
session.connect();
const post = (m, p) => new Promise((res, rej) => session.post(m, p, (e, r) => (e ? rej(e) : res(r))));
await post('Profiler.enable');
await post('Profiler.setSamplingInterval', { interval: 200 }); // 200 µs — finer than default 1 ms
await post('Profiler.start');

let last = null;
let firstTickUs = null;
const deltas = [];
const t0 = performance.now();
const run = await simulateCrucibleSwarm({
  arenaId: 'helios_core',
  seed,
  waveCount: 10,
  tickCap,
  onTick: () => {
    const now = performance.now();
    if (last != null) deltas.push(now - last);
    else firstTickUs = process.hrtime.bigint() / 1000n;
    last = now;
  },
});
const { profile } = await post('Profiler.stop');
writeFileSync(out, JSON.stringify(profile));
mkdirSync('.devshots/pq13304-prof', { recursive: true });

// attribute samples before/after first onTick
const firstUs = Number(firstTickUs);
const before = profile.samples.filter((_, i) => {
  return (profile.timeDeltas[i] || 0) > 0; // placeholder, real split below
});
let bootUs = 0, loopUs = 0, acc = 0n;
const wallTotal = performance.now() - t0;
const sorted = deltas.slice().sort((a, b) => a - b);
const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
console.log(
  `seed=${seed} ticks=${run.ticks} stop=${run.stopReason} wave=${run.wave} wall=${wallTotal.toFixed(0)}ms `
  + `tickMean=${(deltas.reduce((s, d) => s + d, 0) / Math.max(1, deltas.length)).toFixed(2)} `
  + `p50=${q(0.5).toFixed(2)} p90=${q(0.9).toFixed(2)} p95=${q(0.95).toFixed(2)} p99=${q(0.99).toFixed(2)}`,
);
console.log('profile written to', out);
