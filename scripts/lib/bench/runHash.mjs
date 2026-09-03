// scripts/lib/bench/runHash.mjs — Deterministic hashing for the Fun Convergence Loop bench.
import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../../src/core/simSnapshot.js';
import { buildDeterministicSurface } from '../../../src/testing/lab/deterministicSurface.js';

export function round6(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
}

/**
 * Computes a bit-identical SHA-256 run hash over the configuration, wave checkpoints,
 * deterministic event trace, final state surface, and summarized fun/feel metrics.
 *
 * @param {object} params
 * @param {object} params.config { bench, ruleset, arenaId, loadoutId, seed, waveCount }
 * @param {string[]} [params.waveCheckpoints] Checkpoint SHA-256 hashes per completed wave
 * @param {Array<object>} [params.eventTrace] Sanitized chronological events { tick, type, data }
 * @param {object} [params.finalState] Authoritative GameState at end of run
 * @param {object} [params.metrics] Summarized player-unit metrics (kills, knockBudget, VPM, etc.)
 * @returns {{ runHash: string, runManifest: object }}
 */
export function computeRunHash({
  config,
  waveCheckpoints = [],
  eventTrace = [],
  finalState = null,
  metrics = {},
}) {
  let finalStateHash = 'none';
  if (finalState) {
    try {
      const surface = buildDeterministicSurface(finalState, {
        schema: 'spaceface.benchSurface.v1',
        seed: config && config.seed,
      });
      finalStateHash = createHash('sha256')
        .update(canonicalStringify(surface))
        .digest('hex');
    } catch {
      // Fallback surface if full deterministic surface builder is unavailable
      finalStateHash = createHash('sha256')
        .update(canonicalStringify({
          tick: finalState.tick | 0,
          simTime: round6(finalState.simTime || 0),
          entitiesCount: (finalState.entityList || []).length,
          playerPos: finalState.player && finalState.player.pos
            ? { x: round6(finalState.player.pos.x), z: round6(finalState.player.pos.z) }
            : null,
          playerHull: finalState.player ? round6(finalState.player.hull) : null,
        }))
        .digest('hex');
    }
  }

  const sanitizedTrace = (eventTrace || []).map((e) => ({
    tick: e.tick | 0,
    type: String(e.type || ''),
    data: sanitizeTraceData(e.data || {}),
  }));

  const traceHash = createHash('sha256')
    .update(canonicalStringify(sanitizedTrace))
    .digest('hex');

  const normalizedMetrics = sanitizeTraceData(metrics || {});

  const runManifest = {
    schema: 'spaceface.funBenchRun.v1',
    config: {
      bench: (config && config.bench) || 'crucible',
      ruleset: (config && config.ruleset) || 'swarm',
      arenaId: (config && config.arenaId) || 'helios_core',
      loadoutId: (config && config.loadoutId) || 'energy_baseline',
      seed: Number(config && config.seed) | 0,
      waveCount: Number((config && config.waveCount) || 3) | 0,
    },
    waveCheckpoints: (waveCheckpoints || []).slice(),
    traceHash,
    finalStateHash,
    metricsSummary: normalizedMetrics,
  };

  const runHash = createHash('sha256')
    .update(canonicalStringify(runManifest))
    .digest('hex');

  return { runHash, runManifest };
}

function sanitizeTraceData(data) {
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeTraceData);
  const out = {};
  for (const key of Object.keys(data).sort()) {
    const val = data[key];
    if (typeof val === 'number') {
      out[key] = round6(val);
    } else if (val && typeof val === 'object') {
      out[key] = sanitizeTraceData(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}
