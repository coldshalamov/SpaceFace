// scripts/probe-crucible-perf.mjs — PQ-133.04 R4 Foundry p95 probe (the receipt's DEFERRED gate).
//
// Runs the REAL Crucible bench runtime (scripts/lib/bench/crucibleBench.mjs, READ-ONLY import —
// the lib is foreign-owned) on helios_core, waveCount 10, the three fixed seeds, and measures the
// per-tick wall deltas through the bench's own onTick seam (crucibleBench.mjs:229/:508).
//
// HONESTY of the number: P95_MS is a SIM-SIDE CPU figure. nodeSafeOnly, no renderer, and the
// delta between successive onTick invocations brackets the harness's own pilot/ingest work as
// well as the sim — a conservative upper bound on frame cost, not a render-side frame time.
// The bench hardcodes ruleset 'swarm' (crucibleBench.mjs:380), so the ten-wave run exercises the
// Foundry room under generated swarm waves, not the authored boss recipe. It is the receipt gate's
// instrument (Foundry p95 <= 16.7 ms, PQ-133.04.md:202-204), judged on its own stated terms.
//
//   node scripts/probe-crucible-perf.mjs
//
// Output: one line per seed, then EXACTLY ONE final line `P95_MS=<number>` — the nearest-rank
// p95 (2 decimals) over every measured tick of every seed. Nothing prints after it.

// The player-save drawer stays shut: this probe must never mount the real shared store.
process.env.SPACEFACE_PLAYER_STORE_DIR = '';

const ARENA_ID = 'helios_core';
const WAVE_TARGET = 10;
const SEEDS = [4242, 8008, 13502];
// 3 waves fit the bench's 5400-tick default; ten waves need headroom. The loop still stops the
// moment state.run.wave passes the target, so the cap is a safety net, not a timer.
const TICK_CAP = 36000;

const { simulateCrucibleSwarm } = await import('./lib/bench/crucibleBench.mjs');

function nearestRankP95(values) {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

const allDeltas = [];

for (const seed of SEEDS) {
  let last = null;
  const deltas = [];
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA_ID,
    seed,
    waveCount: WAVE_TARGET,
    tickCap: TICK_CAP,
    onTick: () => {
      // The delta between successive onTick invocations covers drivePilot + runtime.step + the
      // harness's event ingest — the conservative upper bound described above. The first sample
      // only seeds the clock; it brackets boot, so it is never measured.
      const now = performance.now();
      if (last != null) deltas.push(now - last);
      last = now;
    },
  });
  allDeltas.push(...deltas);
  const p95 = nearestRankP95(deltas);
  console.log(
    `seed=${seed} ticks=${run.ticks} stop=${run.stopReason} wave=${run.wave} `
    + `samples=${deltas.length} mean=${round2(deltas.reduce((s, d) => s + d, 0) / Math.max(1, deltas.length))} `
    + `p95=${round2(p95)} msPerTick=${run.msPerTick}`,
  );
}

const pooled = nearestRankP95(allDeltas);
console.log(`P95_MS=${round2(pooled).toFixed(2)}`);
