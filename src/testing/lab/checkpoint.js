// Semantic + deterministic-covered checkpoints (§14).
// KEEP canonicalStateHash (semantic). ADD deterministic-covered alongside.
//
// F10 COVERAGE BOUND (honest contract — do NOT promote to "exact"):
// - deterministic-covered uses round6 quantization and maps non-finite → 0 in the surface builder.
// - Full multi-stream RNG / system-private state is OMITTED (see DETERMINISTIC_OMITTED).
// - Two different IEEE-754 states can therefore share a deterministic-covered hash.
// - The determinism GATE uses deterministic-covered as a *coverage-bounded* identity check,
//   never as bit-exact reproducibility. Evidence must never label this hashKind as "exact".
// - exactWithin.crossRuntime remains false; sameCoverage is the strongest claim allowed.

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../core/simSnapshot.js';
import { canonicalStateHash, canonicalStateSnapshot } from '../../observability/sessionSamplers.js';
import {
  CHECKPOINT_COVERAGE_VERSION,
  DETERMINISTIC_COVERED,
  DETERMINISTIC_OMITTED,
  buildDeterministicSurface,
} from './deterministicSurface.js';

export {
  CHECKPOINT_COVERAGE_VERSION,
  DETERMINISTIC_COVERED,
  DETERMINISTIC_OMITTED,
  buildDeterministicSurface,
};

/**
 * Semantic checkpoint via Observatory canonicalStateHash.
 * @param {object} state
 * @param {object} [meta]
 */
export function buildSemanticCheckpoint(state, meta = {}) {
  const hash = canonicalStateHash(state);
  return {
    hashKind: 'semantic',
    hash,
    coverageVersion: 'observatory-canonical-v1',
    covered: ['canonicalStateSnapshot.rootKeys', 'entities.canonical'],
    omitted: ['rng', 'render', 'vfx', 'audio', 'wallTime', 'objectIdentity'],
    exactWithin: {
      sameBuild: true,
      sameRuntimeKind: true,
      sameEngineBinary: false,
      crossRuntime: false,
    },
    tick: state && (state.tick | 0),
    label: meta.label || null,
    scenarioDigest: meta.scenarioDigest || null,
    inputDigest: meta.inputDigest || null,
  };
}

/**
 * Deterministic-covered checkpoint with explicit omissions list.
 * @param {object} state
 * @param {object} [meta]
 */
export function buildDeterministicCoveredCheckpoint(state, meta = {}) {
  const surface = buildDeterministicSurface(state, meta);
  const hash = sha256(canonicalStringify(surface));
  return {
    hashKind: 'deterministic-covered',
    hash,
    coverageVersion: CHECKPOINT_COVERAGE_VERSION,
    covered: [...DETERMINISTIC_COVERED],
    omitted: [...DETERMINISTIC_OMITTED],
    exactWithin: {
      sameBuild: true,
      sameRuntimeKind: true,
      sameEngineBinary: true,
      crossRuntime: false,
    },
    tick: state && (state.tick | 0),
    label: meta.label || null,
    scenarioDigest: meta.scenarioDigest || null,
    inputDigest: meta.inputDigest || null,
    surface, // optional debug; strip at low verbosity
  };
}

/**
 * Build both checkpoint kinds for a state.
 */
export function buildCheckpoints(state, meta = {}) {
  return {
    semantic: buildSemanticCheckpoint(state, meta),
    deterministicCovered: buildDeterministicCoveredCheckpoint(state, meta),
  };
}

export function stripCheckpointDebug(checkpoint) {
  if (!checkpoint) return checkpoint;
  const { surface, ...rest } = checkpoint;
  return rest;
}

/**
 * Hash a deterministic surface the same way Node checkpoints do.
 * @param {object} surface
 */
export function hashDeterministicSurface(surface) {
  return sha256(canonicalStringify(surface));
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

// Re-export semantic helpers for tests.
export { canonicalStateHash, canonicalStateSnapshot };
