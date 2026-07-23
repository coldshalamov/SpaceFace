// Simulation-safe receipt shared with the renderer. The core never imports Three.js: render owners
// publish only this small state token when an exact authored identity is ready. In headless runs there
// is no live render scene, so deterministic simulation remains independent of presentation admission.

export const PRESENTATION_ADMISSION = Object.freeze({
  pending: 'pending',
  ready: 'ready',
  unavailable: 'unavailable',
});

export const PRESENTATION_OWNER_ADMISSION = Object.freeze({
  headless: 'headless',
  missing: 'missing',
  pending: PRESENTATION_ADMISSION.pending,
  ready: PRESENTATION_ADMISSION.ready,
  unavailable: PRESENTATION_ADMISSION.unavailable,
});

/**
 * Simulation asteroids may opt into an exact authored geology skin without changing their gameplay
 * identity. Keep this contract deliberately narrow: a stray `placeId` on an asteroid must not turn
 * every rock, POI, or claim body into an authored-place admission boundary.
 */
export function hasExplicitAuthoredGeologyPresentation(entity) {
  if (!entity || entity.alive === false || entity.type !== 'asteroid') return false;
  const data = entity.data || {};
  const radius = Number(entity.radius);
  const targetRadius = Number(data.placeTargetRadius);
  return data.authoredGeologySkin === true
    && typeof data.placeId === 'string'
    && data.placeId.length > 0
    && Number.isFinite(radius)
    && radius > 0
    && targetRadius === radius;
}

export function entityRequiresAuthoredPresentation(entity) {
  if (!entity || entity.alive === false) return false;
  if (entity.type === 'ship' || entity.type === 'station') return true;
  if (hasExplicitAuthoredGeologyPresentation(entity)) return true;
  const data = entity.data || {};
  return entity.type === 'fx' && !!(
    data.placeId || data.landmarkGlb || data.archetypeGlb || data.claimSpecId || data.claimOwned
  );
}

export function initializePresentationAdmission(entity) {
  if (entityRequiresAuthoredPresentation(entity)) {
    entity.presentationAdmission = PRESENTATION_ADMISSION.pending;
  }
  return entity;
}

export function setPresentationAdmission(entity, state) {
  if (!entity || !Object.values(PRESENTATION_ADMISSION).includes(state)) return false;
  entity.presentationAdmission = state;
  return true;
}

export function resolvePresentationAdmissionOwner(entity, state) {
  if (!entity || entity.alive === false) return null;
  const ownerWorldRecordId = entity.data && entity.data.presentationOwnerWorldRecordId;
  if (!ownerWorldRecordId) return entity;
  const entities = state && state.entities;
  if (!entities || typeof entities.values !== 'function') return null;
  for (const candidate of entities.values()) {
    if (candidate && candidate.alive !== false && candidate.data
      && candidate.data.worldRecordId === ownerWorldRecordId) return candidate;
  }
  return null;
}

/** Pure stable-world-identity lookup; browser callers fail closed, headless simulation does not. */
export function presentationOwnerAdmissionForWorldRecord(ownerWorldRecordId, state) {
  if (!state || !state.render || !state.render.scene) return PRESENTATION_OWNER_ADMISSION.headless;
  if (!ownerWorldRecordId || !state.entities || typeof state.entities.values !== 'function') {
    return PRESENTATION_OWNER_ADMISSION.missing;
  }
  for (const candidate of state.entities.values()) {
    if (!candidate || candidate.alive === false || !candidate.data
      || candidate.data.worldRecordId !== ownerWorldRecordId) continue;
    const admission = candidate.presentationAdmission;
    return admission === PRESENTATION_ADMISSION.ready
      || admission === PRESENTATION_ADMISSION.unavailable
      || admission === PRESENTATION_ADMISSION.pending
      ? admission
      : PRESENTATION_OWNER_ADMISSION.pending;
  }
  return PRESENTATION_OWNER_ADMISSION.missing;
}

export function presentationOwnerIsAdmitted(admission) {
  return admission === PRESENTATION_OWNER_ADMISSION.headless
    || admission === PRESENTATION_OWNER_ADMISSION.ready;
}

export function presentationAllowsPlayerFacingAction(entity, state) {
  if (!state || !state.render || !state.render.scene) return true;
  const indirect = entity && entity.data && entity.data.presentationOwnerWorldRecordId;
  if (!indirect && !entityRequiresAuthoredPresentation(entity)) return true;
  if (indirect) {
    return presentationOwnerIsAdmitted(presentationOwnerAdmissionForWorldRecord(indirect, state));
  }
  const owner = resolvePresentationAdmissionOwner(entity, state);
  return !!owner && owner.presentationAdmission === PRESENTATION_ADMISSION.ready;
}
