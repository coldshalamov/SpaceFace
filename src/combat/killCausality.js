// Semantic kill causality shared by campaign combat and consequence readers.
//
// `entity:killed.presentation` owns a richer immutable presentation receipt: vectors, impact
// telemetry, and hit geometry. That receipt is deliberately transient. This module extracts only
// the compact facts simulation systems may retain or serialize without smuggling render-shaped
// data into GameState.

import { IMPULSE_PROVENANCE_MAX_AGE_TICKS } from './impulseKernel.js';

export const KillCause = Object.freeze({
  GENERIC: 'generic',
  KINETIC: 'kinetic',
  EXPLOSIVE: 'explosive',
  TERRAIN_COLLISION: 'terrain_collision',
  SHIP_COLLISION: 'ship_collision',
});

// A hull contact the pilot's own body made. A throw is a different body carrying their cause.
const DIRECT_IMPACT_TAGS = new Set(['direct_contact', 'ram_plate', 'tow_flail']);
const INDIRECT_IMPACT_TAGS = new Set(['massline_throw', 'massline', 'rope_throw', 'massline_whip']);

const CANONICAL_CAUSES = new Set(Object.values(KillCause));

// The surfaces the collision-consequence receipt admits (src/systems/collisionConsequences.js
// collisionPresentationSurface): a station is not a rock, and the durable record must say which.
export const KillSurface = Object.freeze({
  TERRAIN: 'terrain',
  CRAFT: 'craft',
  STRUCTURE: 'structure',
});

const CANONICAL_SURFACES = new Set(Object.values(KillSurface));

const FAMILY_BY_KILL_CAUSE = Object.freeze({
  [KillCause.GENERIC]: 'direct',
  [KillCause.KINETIC]: 'direct',
  [KillCause.EXPLOSIVE]: 'explosive',
  [KillCause.TERRAIN_COLLISION]: 'terrain',
  [KillCause.SHIP_COLLISION]: 'collision',
});

export function isCanonicalKillCause(value) {
  return typeof value === 'string' && CANONICAL_CAUSES.has(value);
}

export function isCanonicalKillSurface(value) {
  return typeof value === 'string' && CANONICAL_SURFACES.has(value);
}

export function normalizeKillCause(value) {
  return isCanonicalKillCause(value) ? value : KillCause.GENERIC;
}

export function killCauseFromPayload(payload) {
  const presentation = payload && payload.presentation;
  const candidates = [
    presentation && presentation.cause,
    payload && payload.cause,
  ];
  for (const candidate of candidates) {
    if (isCanonicalKillCause(candidate)) return candidate;
  }
  return KillCause.GENERIC;
}

export function compactKillCausality(payload, playerId = null) {
  const presentation = payload && payload.presentation;
  const cause = killCauseFromPayload(payload);
  const playerCaused = presentation && typeof presentation.playerCaused === 'boolean'
    ? presentation.playerCaused
    : playerId != null && !!payload && payload.killerId === playerId;
  // Prefer the receipt's own surface (terrain | craft | structure); derive from the cause only
  // when the emitter did not say. Deriving always would record a station kill as a rock kill.
  const receiptSurface = presentation && presentation.surface;
  const surface = isCanonicalKillSurface(receiptSurface)
    ? receiptSurface
    : cause === KillCause.TERRAIN_COLLISION
      ? KillSurface.TERRAIN
      : cause === KillCause.SHIP_COLLISION ? KillSurface.CRAFT : null;

  return Object.freeze({
    version: 1,
    cause,
    playerCaused,
    surface,
  });
}

export function killCauseFamily(cause) {
  return FAMILY_BY_KILL_CAUSE[normalizeKillCause(cause)];
}

function finiteTick(value) {
  return Number.isFinite(value) ? value : null;
}

/**
 * Why a collision is or is not the pilot's. The same facts always return the same class.
 * A held throw stays indirect for the whole flight; a lapsed window with no hold is stale.
 * Direct is the pilot's own hull. Anything whose actor is not the pilot is accidental.
 */
export function classifyImpactResponsibility(facts = {}) {
  const playerId = facts.playerId ?? null;
  const actorId = facts.actorId ?? null;
  const tag = typeof facts.tag === 'string' ? facts.tag : '';
  const impactTick = finiteTick(facts.impactTick);
  const appliedTick = finiteTick(facts.appliedTick);
  const holdUntilTick = finiteTick(facts.holdUntilTick);
  const windowTicks = finiteTick(facts.windowTicks) ?? IMPULSE_PROVENANCE_MAX_AGE_TICKS;
  if (playerId == null || actorId !== playerId) {
    return Object.freeze({
      class: 'accidental',
      responsible: false,
      line: 'Not your cause. You are not responsible.',
    });
  }
  const age = impactTick != null && appliedTick != null ? impactTick - appliedTick : 0;
  const held = holdUntilTick != null && impactTick != null && impactTick <= holdUntilTick;
  const fresh = age >= 0 && (held || age <= windowTicks);
  if (!fresh) {
    return Object.freeze({
      class: 'stale',
      responsible: false,
      line: 'That cause is stale. You are not responsible for this collision.',
    });
  }
  if (DIRECT_IMPACT_TAGS.has(tag)) {
    return Object.freeze({
      class: 'direct',
      responsible: true,
      line: 'Your hull hit them. This collision is yours.',
    });
  }
  if (INDIRECT_IMPACT_TAGS.has(tag)) {
    return Object.freeze({
      class: 'indirect',
      responsible: true,
      line: 'You threw what hit them. The collision is still yours.',
    });
  }
  // A fresh cause the pilot owns, but not their own hull: a blast, a shove, a body they set moving.
  return Object.freeze({
    class: 'indirect',
    responsible: true,
    line: 'Your cause is still on what hit them. The collision is yours.',
  });
}

/** The compact cause the law card classifies. Null when the kill carried no collision link. */
export function impactLinkFromPresentation(presentation, { impactTick = null, playerId = null } = {}) {
  const raw = presentation && presentation.impactLink;
  if (!raw || typeof raw !== 'object') return null;
  return Object.freeze({
    actorId: raw.actorId ?? null,
    tag: typeof raw.tag === 'string' ? raw.tag : '',
    appliedTick: finiteTick(raw.appliedTick),
    holdUntilTick: finiteTick(raw.holdUntilTick),
    impactTick: finiteTick(impactTick),
    playerId,
  });
}
