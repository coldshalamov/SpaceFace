// Pure deterministic-covered surface builder (Node + Chromium). No node:crypto.
// checkpoint.js hashes this surface on Node; Chromium host returns the same surface for compare.

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
  // H9: full multi-stream RNG is not covered; lab-included streams are under entropy.*
  'rng.fullStream',
  'rng.streams.unlisted',
  'vfx',
  'audio',
  'perfCounters',
  'spatialHash',
  'entityIndex',
  'bus.listeners',
  'rapier.internalContactCache',
]);

/** Lab-covered entropy streams (honest subset of system-owned RNGs). */
export const ENTROPY_COVERED_STREAMS = Object.freeze([
  'core.seed+state+draws',
  'weapons.seed0+draws',
  'traffic.rngSeed',
]);

/**
 * Streams known to exist but NOT serialized/restored through save (H9 honesty).
 * Save/load equivalence must not claim full RNG identity while these remain uncovered.
 */
export const ENTROPY_UNCOVERED_STREAMS = Object.freeze([
  'automation.meta.rngSeed',
  'claims.meta.rngSeed',
  'sectorSim.meta.rngSeed',
  'interventionMeta.rngSeed',
  'other-system-private-streams',
]);

/**
 * Build the deterministic-covered surface for a game state.
 * @param {object} state
 * @param {object} [meta]
 */
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
    // H9: lab-included entropy streams (weapons + traffic). Other streams remain omitted.
    entropy: buildEntropySurface(state),
    scenarioDigest: meta.scenarioDigest || null,
    inputDigest: meta.inputDigest || null,
    engine: {
      simDt: meta.dt || 1 / 60,
    },
  };
}

/**
 * Snapshot entropy state for systems the focused lab actually exercises.
 * weaponsEntropy is written by weapons.js; traffic.rngSeed by traffic.js.
 */
function buildEntropySurface(state) {
  const weapons = state && state.weaponsEntropy
    ? {
      seed0: state.weaponsEntropy.seed0 >>> 0,
      draws: state.weaponsEntropy.draws | 0,
    }
    : null;
  const trafficSeed = state && state.traffic && Number.isFinite(state.traffic.rngSeed)
    ? (state.traffic.rngSeed >>> 0)
    : null;
  const coreCont = state && state.rng && typeof state.rng.getState === 'function'
    ? state.rng.getState()
    : null;
  return {
    covered: ENTROPY_COVERED_STREAMS.slice(),
    uncovered: ENTROPY_UNCOVERED_STREAMS.slice(),
    coreSeed: state && state.meta ? (state.meta.seed | 0) : 0,
    // H9: continuation (not seed alone) is what save/load restores for covered streams.
    core: coreCont
      ? { seed0: coreCont.seed0 >>> 0, state: coreCont.state >>> 0, draws: coreCont.draws | 0 }
      : null,
    weapons,
    trafficRngSeed: trafficSeed,
  };
}

export function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1e6) / 1e6;
}
