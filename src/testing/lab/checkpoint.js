// Semantic + deterministic-covered checkpoints (§14).
// KEEP canonicalStateHash (semantic). ADD deterministic-covered alongside (never claim "exact"
// until coverage is sufficient).

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../core/simSnapshot.js';
import { canonicalStateHash, canonicalStateSnapshot } from '../../observability/sessionSamplers.js';

export const CHECKPOINT_COVERAGE_VERSION = 'lab-checkpoint-v1';

/** Fields intentionally included in the deterministic-covered surface. */
export const DETERMINISTIC_COVERED = Object.freeze([
  'tick',
  'simTime',
  'mode',
  'playerId',
  'seed',
  'entities.ordered',
  'entities.pose',
  'entities.velocity',
  'entities.alive',
  'entities.team',
  'entities.mass',
  'entities.hull',
  'player.credits',
  'player.tether.active',
  'player.tether.targetId',
  'player.tether.restLength',
  'input.moveX',
  'input.moveZ',
  'input.turnIntent',
  'input.boost',
  'input.keys.sorted',
  'runtime.profileId',
  'runtime.profileHash',
  'runtime.manifestHash',
  'scenarioDigest',
  'inputDigest',
  'engine.simDt',
]);

/** Explicit omissions — do not call this hash "exact". */
export const DETERMINISTIC_OMITTED = Object.freeze([
  'objectIdentity',
  'memoryAddresses',
  'wasmPointers',
  'dom',
  'threeJsObjects',
  'rendererCaches',
  'wallTimestamps',
  'presentationState',
  'unorderedMapIteration',
  'rng.fullStream', // serializable seed is covered; live stream cursor may differ post-restore
  'vfx',
  'audio',
  'perfCounters',
  'spatialHash',
  'entityIndex',
  'bus.listeners',
  'rapier.internalContactCache',
]);

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

export function buildDeterministicSurface(state, meta = {}) {
  const entities = Array.isArray(state && state.entityList)
    ? state.entityList
      .filter(Boolean)
      .map((e) => ({
        id: e.id | 0,
        type: e.type || null,
        alive: !!e.alive,
        team: e.team | 0,
        factionId: e.factionId || null,
        pos: e.pos ? { x: round6(e.pos.x), z: round6(e.pos.z) } : null,
        vel: e.vel ? { x: round6(e.vel.x), z: round6(e.vel.z) } : null,
        rot: round6(e.rot || 0),
        angVel: round6(e.angVel || 0),
        mass: round6(e.mass || 0),
        radius: round6(e.radius || 0),
        hull: round6(e.hull || 0),
        hullMax: round6(e.hullMax || 0),
        data: e.data ? {
          scenarioAlias: e.data.scenarioAlias || null,
          scenarioRole: e.data.scenarioRole || null,
          defId: e.data.defId || null,
        } : null,
      }))
      .sort((a, b) => a.id - b.id)
    : [];

  const keys = state && state.input && state.input.keys
    ? Object.keys(state.input.keys).filter((k) => state.input.keys[k]).sort()
    : [];

  const tether = state && state.player && state.player.tether
    ? {
      active: !!state.player.tether.active,
      targetId: state.player.tether.targetId ?? null,
      restLength: round6(state.player.tether.restLength || 0),
      attachmentId: state.player.tether.attachmentId || null,
    }
    : null;

  return {
    tick: state ? (state.tick | 0) : 0,
    simTime: round6(state && state.simTime),
    mode: state && state.mode,
    playerId: state ? (state.playerId | 0) : 0,
    seed: state && state.meta ? (state.meta.seed | 0) : 0,
    entities,
    player: {
      credits: state && state.player ? round6(state.player.credits) : 0,
      tether,
    },
    input: {
      moveX: round6(state && state.input && state.input.moveX),
      moveZ: round6(state && state.input && state.input.moveZ),
      turnIntent: round6(state && state.input && state.input.turnIntent),
      boost: !!(state && state.input && state.input.boost),
      keys,
    },
    runtime: {
      profileId: state && state.runtime && state.runtime.profileId,
      profileHash: state && state.runtime && state.runtime.profileHash,
      manifestHash: state && state.runtime && state.runtime.manifestHash,
    },
    scenarioDigest: meta.scenarioDigest || null,
    inputDigest: meta.inputDigest || null,
    engine: {
      simDt: meta.dt || 1 / 60,
    },
  };
}

export function stripCheckpointDebug(checkpoint) {
  if (!checkpoint) return checkpoint;
  const { surface, ...rest } = checkpoint;
  return rest;
}

function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1e6) / 1e6;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

// Re-export semantic helpers for tests.
export { canonicalStateHash, canonicalStateSnapshot };
