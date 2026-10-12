// scripts/lib/bench/verbBench.mjs — Verb benches for the Fun Convergence Loop.
import { computeRunHash } from './runHash.mjs';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Scenario modules are auto-discovered from ./scenarios/*.mjs (see scenarios/README.md for the
// contract). The directory is the ONLY scenario source: every stand-in that used to live inline
// here was replaced by a real-path module with the same id and then deleted — a module can no
// longer "replace" an inline case because there is nothing left to replace.
const SCENARIOS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'scenarios');
let discoveredScenarioCache = null;

export async function discoverScenarioModules() {
  if (discoveredScenarioCache) return discoveredScenarioCache;
  const found = new Map();
  let names = [];
  try {
    names = readdirSync(SCENARIOS_DIR)
      .filter((name) => name.endsWith('.mjs') && !name.startsWith('_'))
      .sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    const mod = await import(pathToFileURL(join(SCENARIOS_DIR, name)).href);
    const spec = mod.scenario || mod.default;
    if (!spec || typeof spec.id !== 'string' || typeof spec.run !== 'function') {
      throw new Error(`verb scenario module ${name} must export { id, label, run(seed) }`);
    }
    if (found.has(spec.id)) throw new Error(`duplicate verb scenario id ${spec.id} in ${name}`);
    found.set(spec.id, { id: spec.id, label: spec.label || spec.id, run: spec.run, module: name });
  }
  discoveredScenarioCache = found;
  return found;
}

/** The discovered module set, sorted by file name. There are no inline scenarios left. */
export async function listVerbScenarios() {
  return [...(await discoverScenarioModules()).values()];
}

/**
 * Runs the verb benches headlessly on fixed seeds.
 *
 * @param {object} [options]
 * @param {number[]} [options.seeds] List of seeds to evaluate (default: [4242])
 * @param {string[]} [options.scenarioIds] Filter scenarios (optional)
 * @param {boolean} [options.verbose] Verbose logging
 * @returns {Promise<object>}
 */
export async function runVerbBench({
  seeds = [4242],
  scenarioIds = null,
  verbose = false,
} = {}) {
  const startedAt = Date.now();
  const allScenarios = await listVerbScenarios();
  const scenariosToRun = scenarioIds
    ? allScenarios.filter((s) => scenarioIds.includes(s.id))
    : allScenarios;

  const results = [];
  for (const seed of seeds) {
    for (const scenario of scenariosToRun) {
      if (verbose) console.log(`[verb-bench] running ${scenario.id} (seed ${seed})...`);
      const t0 = Date.now();
      // Per-scenario error boundary: one lane's broken module costs one row, never the measurer
      // for all six lanes (FORCE, 2026-09-04: an in-progress feel.knock_budget threw and no receipt
      // was written for anyone). A failed scenario is recorded as a run with runError and no metrics.
      let runResult;
      try {
        runResult = await scenario.run(seed);
      } catch (error) {
        const message = error && error.message ? String(error.message) : String(error);
        console.error(`[verb-bench] ${scenario.id} (seed ${seed}) FAILED: ${message}`);
        results.push({
          bench: 'verbs',
          scenarioId: scenario.id,
          label: scenario.label,
          seed,
          durationMs: Date.now() - t0,
          runHash: null,
          runManifest: null,
          metrics: {},
          runError: message,
        });
        continue;
      }
      const durationMs = Date.now() - t0;

      const { runHash, runManifest } = computeRunHash({
        config: {
          bench: 'verbs',
          ruleset: 'feel_contract',
          arenaId: 'lab',
          loadoutId: scenario.id,
          seed,
          waveCount: 1,
        },
        eventTrace: runResult.eventTrace,
        metrics: runResult.metrics,
      });

      results.push({
        bench: 'verbs',
        scenarioId: scenario.id,
        label: scenario.label,
        seed,
        durationMs,
        runHash,
        runManifest,
        metrics: runResult.metrics,
      });
    }
  }

  return {
    bench: 'verbs',
    // Fail closed: a thrown scenario is a red run, and an empty result set (e.g. an id typo)
    // must not read as a green bench.
    ok: results.length > 0 && results.every((run) => !run.runError),
    wallMs: Date.now() - startedAt,
    runs: results,
  };
}

