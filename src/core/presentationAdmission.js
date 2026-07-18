// Simulation-safe receipt shared with the renderer. The core never imports Three.js: render owners
// publish only this small state token when an exact authored identity is ready. In headless runs there
// is no live render scene, so deterministic simulation remains independent of presentation admission.

export const PRESENTATION_ADMISSION = Object.freeze({
  pending: 'pending',
  ready: 'ready',
  unavailable: 'unavailable',
});

export function entityRequiresAuthoredPresentation(entity) {
  if (!entity || entity.alive === false) return false;
  if (entity.type === 'ship' || entity.type === 'station') return true;
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
