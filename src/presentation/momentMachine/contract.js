// Moment Machine event truth. Pure read-model: no Math.random, DOM, Three.js, or sim writes.
// A semantic claim is admissible only when a logged event carries it. Position proximity is not a cause.

export const MOMENT_STREAM_SCHEMA = 'spaceface.momentStream.v1';
export const MOMENT_SELECTION_SCHEMA = 'spaceface.momentSelection.v1';
export const MOMENT_PLAN_SCHEMA = 'spaceface.momentShotPlan.v1';
export const MOMENT_LEASE_SCHEMA = 'spaceface.momentCameraLease.v1';
export const MOMENT_CAPTION_SCHEMA = 'spaceface.momentCaptions.v1';
export const MOMENT_EXPORT_REQUEST_SCHEMA = 'spaceface.momentExportRequest.v1';

export const TICK_RATE = 60;
export const CLIP_MIN_S = 15;
export const CLIP_MAX_S = 30;
export const CLIP_TARGET_S = 22;
export const PRE_ROLL_S = 14;
export const POST_ROLL_S = 8;
export const CLIP_MIN_TICKS = CLIP_MIN_S * TICK_RATE;
export const CLIP_MAX_TICKS = CLIP_MAX_S * TICK_RATE;
export const CLIP_TARGET_TICKS = CLIP_TARGET_S * TICK_RATE;
export const PRE_ROLL_TICKS = PRE_ROLL_S * TICK_RATE;
export const POST_ROLL_TICKS = POST_ROLL_S * TICK_RATE;

export const SCORE_WEIGHTS = Object.freeze({
  payoff: 0.4,
  causalClarity: 0.3,
  visualContinuity: 0.2,
  novelty: 0.1,
});
export const SCORE_THRESHOLD = 0.45;
export const CLARITY_MIN = 0.5;
export const MAX_RANKED = 8;
export const MAX_REJECTS = 32;

/** Logged event kinds. Editorial shapes are not kinds — a shape is a pattern over these. */
export const EVENT_KINDS = Object.freeze([
  'collision',
  'tether_cut',
  'collateral',
  'lawful_intervention',
  'sling',
  'rescue',
  'near_miss',
  'cargo_catastrophe',
  'blockade',
  'reversal',
  'ricochet',
  'recovery',
  'kill',
  'stunt',
  'boost',
  'damage',
  'threat',
  'wanted',
  'scan',
  'shot',
  'transit',
  'escape',
  'witness',
  'death_flash',
  'spill',
  'gate',
]);

export const SHAPE_IDS = Object.freeze([
  'chain_collision',
  'impossible_tether_cut',
  'accidental_collateral',
  'dramatic_lawful_intervention',
  'giant_sling',
  'last_second_rescue',
  'near_miss',
  'volatile_cargo_catastrophe',
  'moving_blockade',
  'reversal',
  'freak_ricochet',
  'unplanned_recovery',
]);

export const LOGGED_SOURCES = Object.freeze(['chronicle', 'tape', 'killcam', 'clip', 'stream']);
export const ACTOR_ROLES = Object.freeze(['subject', 'actor', 'secondary', 'witness', 'blocker']);

const KIND_SET = new Set(EVENT_KINDS);
const SOURCE_SET = new Set(LOGGED_SOURCES);
const ROLE_SET = new Set(ACTOR_ROLES);

export function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function cleanId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 64) return null;
  if (/[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

export function actorByRole(event, role) {
  const list = event && event.actors;
  if (!Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i += 1) {
    const actor = list[i];
    if (actor && actor.role === role) return actor;
  }
  return null;
}

export function sameActor(a, b) {
  return !!a && !!b && a.id === b.id && a.generation === b.generation;
}

function copyPayload(raw, dropped, idLabel) {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    dropped.push({ id: idLabel, reason: 'payload-not-scalar-bag' });
    return {};
  }
  const out = {};
  const keys = Object.keys(raw);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) continue;
    const value = raw[key];
    if (value == null) {
      out[key] = null;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string') {
      if (value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value)) out[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

function copyActor(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanId(raw.id);
  const generation = finiteNumber(raw.generation);
  const role = ROLE_SET.has(raw.role) ? raw.role : null;
  if (!id || generation == null || !Number.isInteger(generation) || generation < 0 || generation > 1e6) {
    return null;
  }
  if (!role) return null;
  return { id, generation, role };
}

/**
 * Admit one logged event. Inferred sources and unknown kinds are dropped, never coerced
 * into a rescue or other claim.
 */
export function sanitizeEvent(raw, dropped) {
  const bucket = dropped || [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    bucket.push({ id: null, reason: 'event-not-object' });
    return null;
  }
  const id = cleanId(raw.id) || null;
  const source = typeof raw.source === 'string' ? raw.source : '';
  if (!SOURCE_SET.has(source)) {
    bucket.push({ id, reason: 'rejected:unlogged-source' });
    return null;
  }
  if (!KIND_SET.has(raw.kind)) {
    bucket.push({ id, reason: 'rejected:unknown-kind' });
    return null;
  }
  const tick = finiteNumber(raw.tick);
  if (tick == null || !Number.isInteger(tick) || tick < 0 || tick > 1e12) {
    bucket.push({ id, reason: 'rejected:bad-tick' });
    return null;
  }
  const simTime = finiteNumber(raw.simTime);
  const actors = [];
  if (Array.isArray(raw.actors)) {
    for (let i = 0; i < raw.actors.length && actors.length < 8; i += 1) {
      const actor = copyActor(raw.actors[i]);
      if (actor) actors.push(actor);
    }
  }
  let position = null;
  if (raw.position && typeof raw.position === 'object') {
    const x = finiteNumber(raw.position.x);
    const z = finiteNumber(raw.position.z);
    if (x != null && z != null) position = { x, z };
  }
  const causalityId = raw.causalityId == null ? null : cleanId(raw.causalityId);
  if (raw.causalityId != null && !causalityId) {
    bucket.push({ id, reason: 'rejected:bad-causality' });
    return null;
  }
  return {
    id: id || `evt-${tick}-${raw.kind}`,
    causalityId,
    tick,
    simTime: simTime == null ? tick / TICK_RATE : Math.max(0, simTime),
    kind: raw.kind,
    actors,
    position,
    payload: copyPayload(raw.payload, bucket, id),
    source,
  };
}

export function sanitizeSample(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanId(raw.id);
  const generation = finiteNumber(raw.generation);
  const tick = finiteNumber(raw.tick);
  const x = finiteNumber(raw.x);
  const z = finiteNumber(raw.z);
  if (!id || generation == null || !Number.isInteger(generation) || generation < 0) return null;
  if (tick == null || !Number.isInteger(tick) || tick < 0) return null;
  if (x == null || z == null) return null;
  const heading = finiteNumber(raw.heading);
  return {
    tick,
    id,
    generation,
    x,
    z,
    heading: heading == null ? 0 : heading,
  };
}

export function compareEventOrder(a, b) {
  if (a.tick !== b.tick) return a.tick - b.tick;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function scoreOf(parts) {
  return SCORE_WEIGHTS.payoff * parts.payoff
    + SCORE_WEIGHTS.causalClarity * parts.causalClarity
    + SCORE_WEIGHTS.visualContinuity * parts.visualContinuity
    + SCORE_WEIGHTS.novelty * parts.novelty;
}
