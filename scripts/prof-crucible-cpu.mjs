// scripts/prof-crucible-cpu.mjs — PQ-133.04 diagnostic driver (perf lane, disposable).
//
// NOT a gate. Runs the real Crucible bench on one seed with a short tick cap, recording the same
// per-tick wall deltas the gate probe records, plus cheap per-tick context (ship/cohort counts)
// so spike ticks can be correlated with activity. Use with node --cpu-prof:
//
//   node --cpu-prof --cpu-prof-dir=.devshots/pq13304-prof scripts/prof-crucible-cpu.mjs
//
// Env: SEED (default 13502), TICK_CAP (default 1200), ARENA (default helios_core).

process.env.SPACEFACE_PLAYER_STORE_DIR = '';

const seed = Number(process.env.SEED || 13502);
const tickCap = Number(process.env.TICK_CAP || 1200);
const arenaId = process.env.ARENA || 'helios_core';
const waveCount = Number(process.env.WAVE_COUNT || 10);

const { simulateCrucibleSwarm } = await import('./lib/bench/crucibleBench.mjs');
const { writeFileSync, mkdirSync } = await import('node:fs');

let last = null;
const deltas = [];
const ctx = [];

const run = await simulateCrucibleSwarm({
  arenaId,
  seed,
  waveCount,
  tickCap,
  onTick: ({ state, t }) => {
    const now = performance.now();
    if (last != null) deltas.push(now - last);
    last = now;
    if (t % 30 === 0) {
      let hostiles = 0;
      let total = 0;
      for (const s of state.ships || []) {
        total++;
        if (s.team !== 0) hostiles++;
      }
      const rocks = (state.asteroids || []).length;
      const run2 = state.run || {};
      ctx.push({ t, dt: +(now - last).toFixed(1), total, hostiles, rocks, wave: run2.wave, phase: run2.phase });
    }
  },
});

const sorted = deltas.slice().sort((a, b) => a - b);
const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
const mean = deltas.reduce((s, d) => s + d, 0) / Math.max(1, deltas.length);
console.log(
  `seed=${seed} ticks=${run.ticks} stop=${run.stopReason} wave=${run.wave} `
  + `mean=${mean.toFixed(2)} p50=${q(0.5).toFixed(2)} p90=${q(0.9).toFixed(2)} p95=${q(0.95).toFixed(2)} `
  + `p99=${q(0.99).toFixed(2)} max=${sorted[sorted.length - 1]?.toFixed(2)}`,
);
console.log('bodyAdmission:', JSON.stringify(run.bodyAdmission));

mkdirSync('.devshots/pq13304-prof', { recursive: true });
writeFileSync('.devshots/pq13304-prof/deltas.json', JSON.stringify(deltas));
writeFileSync('.devshots/pq13304-prof/ctx.json', JSON.stringify(ctx, null, 1));
// Slowest 40 ticks with their context window (nearest sampled row).
const idx = deltas.map((d, i) => [d, i]).sort((a, b) => b[0] - a[0]).slice(0, 40);
for (const [d, i] of idx) {
  const near = ctx.reduce((best, c) => (Math.abs(c.t - i) < Math.abs(best.t - i) ? c : best), ctx[0]);
  console.log(`slow tick=${i} dt=${d.toFixed(1)} near[t=${near.t} total=${near.total} host=${near.hostiles} rocks=${near.rocks} wave=${near.wave}]`);
}
