// scripts/lib/bench/flightBench.mjs — Flight bench for the Fun Convergence Loop.
import {
  MOTION_LAB_SEED,
  runM1,
  runM2,
  runM3,
  runM8,
} from '../../../src/testing/motionScenarios.js';
import { computeRunHash } from './runHash.mjs';

export const FLIGHT_BENCH_SCENARIOS = [
  { id: 'flight-accel-brake', runner: runM1, label: 'M1 Accel & Brake Response' },
  { id: 'flight-slalom', runner: runM2, label: 'M2 Slalom Course Precision' },
  { id: 'flight-reversal', runner: runM3, label: 'M3 180° Reversal & Lag' },
  { id: 'collision-recovery', runner: runM8, label: 'M8 Impulse & Collision Recovery' },
];

/**
 * Runs the Flight Bench scenarios on fixed seeds and returns deterministic metrics and hashes.
 *
 * @param {object} [options]
 * @param {number[]} [options.seeds] List of seeds to evaluate (default: [MOTION_LAB_SEED])
 * @param {string[]} [options.scenarioIds] Filter scenarios (optional)
 * @param {boolean} [options.verbose] Verbose console output
 * @returns {Promise<object>}
 */
export async function runFlightBench({
  seeds = [MOTION_LAB_SEED],
  scenarioIds = null,
  verbose = false,
} = {}) {
  const startedAt = Date.now();
  const scenariosToRun = scenarioIds
    ? FLIGHT_BENCH_SCENARIOS.filter((s) => scenarioIds.includes(s.id))
    : FLIGHT_BENCH_SCENARIOS;

  const results = [];
  for (const seed of seeds) {
    for (const scenario of scenariosToRun) {
      if (verbose) console.log(`[flight-bench] running ${scenario.id} (seed ${seed})...`);
      const t0 = Date.now();
      const output = await scenario.runner({ seed });
      const durationMs = Date.now() - t0;

      const traceObj = output.trace || (output.traces && (output.traces.ship_kestrel || Object.values(output.traces)[0]));
      const rawTrace = traceObj ? (traceObj.samples || []) : [];

      const eventTrace = rawTrace.slice(0, 100).map((s, idx) => ({
        tick: s.tick || idx,
        type: 'sample',
        data: { x: s.x, z: s.z, vx: s.vx, vz: s.vz, spd: s.speed },
      }));

      const { runHash, runManifest } = computeRunHash({
        config: {
          bench: 'flight',
          ruleset: 'motion_lab',
          arenaId: 'lab',
          loadoutId: scenario.id,
          seed,
          waveCount: 1,
        },
        eventTrace,
        metrics: output.metrics || {},
      });

      results.push({
        bench: 'flight',
        scenarioId: scenario.id,
        label: scenario.label,
        seed,
        durationMs,
        runHash,
        runManifest,
        metrics: output.metrics || {},
      });
    }
  }

  return {
    bench: 'flight',
    ok: true,
    wallMs: Date.now() - startedAt,
    runs: results,
  };
}
