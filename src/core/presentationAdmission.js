// Simulation-safe receipt shared with the renderer. The core never imports Three.js: render owners
// publish only this small state token when an exact authored identity is ready. In headless runs there
// is no live render scene, so deterministic simulation remains independent of presentation admission.

export const PRESENTATION_ADMISSION = Object.freeze({
  pending: 'pending',
  ready: 'ready',
  unavailable: 'unavailable',
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

export function presentationAllowsPlayerFacingAction(entity, state) {
  if (!state || !state.render || !state.render.scene) return true;
  if (!entityRequiresAuthoredPresentation(entity)) return true;
  return entity.presentationAdmission === PRESENTATION_ADMISSION.ready;
}
