// Presentation-only admission priority. This module never writes simulation state and deliberately
// derives causality only from explicit receipts or exact source/player identity.

export const DEFAULT_VFX_ADMISSION_PRIORITY = 0.5;

const SEVERITY_BY_NAME = Object.freeze({
  trivial: 0.08,
  minor: 0.2,
  low: 0.25,
  medium: 0.5,
  moderate: 0.55,
  high: 0.78,
  severe: 0.88,
  critical: 0.95,
  catastrophic: 1,
});
const NO_POSITION = Symbol('no-position');

function clamp01(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function hasOwn(value, key) {
  return !!value && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, key);
}

function explicitValue(cue, key) {
  if (hasOwn(cue, key)) return cue[key];
  const payload = cue && cue.payload;
  if (hasOwn(payload, key)) return payload[key];
  const directPresentation = cue && cue.presentation;
  if (hasOwn(directPresentation, key)) return directPresentation[key];
  const presentation = payload && payload.presentation;
  if (hasOwn(presentation, key)) return presentation[key];
  return undefined;
}

function sourceIdFrom(cue) {
  return cue ? (cue.sourceId ?? cue.attackerId ?? cue.ownerId ?? cue.killerId ?? null) : null;
}

function targetIdFrom(cue) {
  if (!cue) return null;
  const direct = cue.targetId ?? cue.combatantId ?? cue.entityId;
  if (direct != null) return direct;
  const semanticCue = !!cue.lanes || !!cue.budgets || cue.sourceEvent != null;
  return semanticCue ? null : (cue.id ?? null);
}

function severityFrom(cue) {
  const explicit = explicitValue(cue, 'severity');
  if (Number.isFinite(explicit)) return clamp01(explicit, 0.5);
  if (typeof explicit === 'string') {
    const named = SEVERITY_BY_NAME[explicit.toLowerCase()];
    if (Number.isFinite(named)) return named;
  }
  const magnitude = cue && cue.magnitude;
  return Number.isFinite(magnitude) ? clamp01(magnitude / 100, 0.5) : 0.5;
}

function positionEvidenceFrom(cue) {
  if (!cue || typeof cue !== 'object') return NO_POSITION;
  if (hasOwn(cue, 'position')) return cue.position;
  if (hasOwn(cue, 'pos')) return cue.pos;
  const directPresentation = cue.presentation;
  if (hasOwn(directPresentation, 'position')) return directPresentation.position;
  if (hasOwn(directPresentation, 'pos')) return directPresentation.pos;
  const payload = cue.payload;
  if (hasOwn(payload, 'position')) return payload.position;
  if (hasOwn(payload, 'pos')) return payload.pos;
  const nestedPresentation = payload && payload.presentation;
  if (hasOwn(nestedPresentation, 'position')) return nestedPresentation.position;
  if (hasOwn(nestedPresentation, 'pos')) return nestedPresentation.pos;
  return NO_POSITION;
}

function validPosition(value) {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.z);
}

function livePlayerPosition(state) {
  if (!state) return null;
  const entity = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const position = entity && entity.pos || state.player && state.player.pos;
  return validPosition(position) ? position : null;
}

function proximityFrom(cue, state) {
  const explicit = explicitValue(cue, 'proximity');
  if (Number.isFinite(explicit)) return clamp01(explicit, 0.5);
  const distance = cue && cue.distance;
  if (Number.isFinite(distance) && distance > 0) {
    return 1 - clamp01(distance / 700, 1);
  }
  if (distance != null && (!Number.isFinite(distance) || distance < 0)) return 0.5;

  const position = positionEvidenceFrom(cue);
  if (position === NO_POSITION) return 0.5;
  if (!validPosition(position)) return 0.5;
  const playerPosition = livePlayerPosition(state);
  if (!playerPosition) return 0.5;
  const derivedDistance = Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z);
  return 1 - clamp01(derivedDistance / 700, 1);
}

export function normalizeVfxAdmissionPriority(value, fallback = DEFAULT_VFX_ADMISSION_PRIORITY) {
  return clamp01(value, clamp01(fallback, DEFAULT_VFX_ADMISSION_PRIORITY));
}

export function deriveVfxAdmissionMetadata(cue = {}, state = null) {
  const sourceId = sourceIdFrom(cue);
  const targetId = targetIdFrom(cue);
  const playerId = state && state.playerId;
  const currentTargetId = state && state.player && state.player.targetId;
  const explicitCausality = explicitValue(cue, 'playerCaused');
  const playerCaused = typeof explicitCausality === 'boolean'
    ? explicitCausality
    : playerId != null && sourceId === playerId;
  const currentTarget = targetId != null && currentTargetId != null && targetId === currentTargetId;
  const explicitTargetRelevance = explicitValue(cue, 'targetRelevance');
  const targetRelevance = Number.isFinite(explicitTargetRelevance)
    ? clamp01(explicitTargetRelevance, 0)
    : (currentTarget || (playerId != null && targetId === playerId) ? 1 : 0);
  const importance = clamp01(cue && cue.importance, 0.5);
  const explicitPlayerRelevance = cue && cue.playerRelevance;
  const playerRelevance = Number.isFinite(explicitPlayerRelevance)
    ? clamp01(explicitPlayerRelevance, 0.5)
    : (playerId != null && targetId === playerId ? 1
      : (playerId != null && sourceId === playerId ? 0.88 : 0.5));
  const proximity = proximityFrom(cue, state);
  const severity = severityFrom(cue);
  const explicitAdmission = explicitValue(cue, 'admissionPriority');
  const derived = importance * 0.18
    + playerRelevance * 0.14
    + proximity * 0.10
    + severity * 0.14
    + targetRelevance * 0.14
    + (playerCaused ? 0.30 : 0);
  const admissionPriority = Number.isFinite(explicitAdmission)
    ? normalizeVfxAdmissionPriority(explicitAdmission)
    : normalizeVfxAdmissionPriority(derived, DEFAULT_VFX_ADMISSION_PRIORITY);

  return {
    admissionPriority,
    importance,
    playerRelevance,
    proximity,
    severity,
    targetRelevance,
    playerCaused,
    currentTarget,
    sourceId,
    targetId,
  };
}
