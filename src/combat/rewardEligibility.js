import { hash32, mulberry32 } from '../core/rng.js';

export const PLAYER_FIRST_HIT_TRUTH_FIELD = 'playerFirstHitTruth';

const PLAYER_FIRST_HIT_TRUTH_VERSION = 1;

function normalizedRunSeed(seed) {
  return (Number(seed) >>> 0) || 1;
}

function durableIdentityValue(entity) {
  const data = entity && entity.data || {};
  if (data.worldRecordId != null) return `worldRecord:${String(data.worldRecordId)}`;
  if (data.identityKey != null) return `identity:${String(data.identityKey)}`;
  if (data.stableId != null) return `stable:${String(data.stableId)}`;
  if (data.spawnKey != null) return `spawn:${String(data.spawnKey)}`;
  return null;
}

/** Stable across a durable victim's live entity-id remaps; local-only actors fall back to live id. */
export function stableRewardVictimIdentity(entity) {
  const durable = durableIdentityValue(entity);
  // Durable ids are already globally namespaced and remain authoritative even if world-record
  // rematerialization normalizes a live subtype (for example, a durable drone shell) to `ship`.
  if (durable != null) return `durable:${durable}`;
  return `${entity && entity.type || 'unknown'}:entity:${String(entity && entity.id)}`;
}

/** Stateless reward stream: current run seed + durable victim identity + one named reward domain. */
export function createVictimRewardRng(seed, victim, salt) {
  return mulberry32(hash32(
    normalizedRunSeed(seed),
    String(salt || 'reward'),
    stableRewardVictimIdentity(victim),
  ));
}

/**
 * A Survival body pays into the RUN wallet, never the campaign one (PQ-133 ruling 2, CRU-014/015).
 *
 * The marker rides on the victim, written by the wave materializer, so this answers "did this kill
 * belong to a run?" instead of the much broader "is a run live?" — ambient traffic and anything the
 * player brought with them still settle through the ordinary campaign reward path.
 */
export function runOwnsReward(entity) {
  const data = entity && entity.data || {};
  return data.runCohort === 'survival';
}

/** One mission marker is sufficient to reserve every generic kill-reward path for missions. */
export function missionOwnsReward(entity) {
  const data = entity && entity.data || {};
  const flags = entity && entity.flags || {};
  return data.missionId != null
    || data.missionTag != null
    || data.missionPinned === true
    || flags.missionPinned === true;
}

/**
 * Identity for the sole local player within a run. The run seed survives Continue while separating
 * New Game, and the live id separates an explicitly replaced player inside one still-live run.
 */
export function currentPlayerRewardIdentity(state, player) {
  if (!state || !player || player.id == null) return null;
  return `run:${normalizedRunSeed(state.meta && state.meta.seed)}:player:${String(player.id)}`;
}

/** Read a durable first-hit receipt only when it belongs to the current player identity. */
export function readPlayerFirstHitTruth(target, playerIdentity) {
  if (!playerIdentity) return null;
  const ai = target && target.data && target.data.ai;
  const record = ai && typeof ai === 'object' && !Array.isArray(ai)
    ? ai[PLAYER_FIRST_HIT_TRUTH_FIELD]
    : null;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (record.version !== PLAYER_FIRST_HIT_TRUTH_VERSION) return null;
  if (record.playerIdentity !== playerIdentity) return null;
  if (typeof record.factionLawful !== 'boolean'
    || typeof record.targetHostileToPlayer !== 'boolean') return null;
  return record;
}

/**
 * Persist on existing AI data so world-record capture/serialize/rematerialize carries the receipt.
 * Non-AI targets return false and let the damage router use its object-lifetime WeakMap fallback.
 */
export function writePlayerFirstHitTruth(target, playerIdentity, factionLawful, targetHostileToPlayer) {
  const ai = target && target.data && target.data.ai;
  if (!playerIdentity || !ai || typeof ai !== 'object' || Array.isArray(ai)) return null;
  const record = {
    version: PLAYER_FIRST_HIT_TRUTH_VERSION,
    playerIdentity,
    factionLawful: !!factionLawful,
    targetHostileToPlayer: !!targetHostileToPlayer,
  };
  ai[PLAYER_FIRST_HIT_TRUTH_FIELD] = record;
  return record;
}
