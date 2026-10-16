import { isOrchardFrame, isOrchardPod } from '../data/anvilOrchardIdentity.js';
import { isPhysicalMachinery, machineryHasEffectivePresentation } from './machineryPresentation.js';
// Simulation-safe receipt shared with the renderer. The core never imports Three.js: render owners
// publish only this small state token when an exact authored identity is ready. In headless runs there
// is no live render scene, so deterministic simulation remains independent of presentation admission.

import { indexedWorldRecordEntity } from '../world/livingWorldViews.js';

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
  // Same union as declaredPlaceTargetRadius, inlined — this module must not pull the
  // render layer (authoredAdmissionPolicy -> visualCullRadius -> three) into core.
  const targetRadius = Number.isFinite(entity.placeTargetRadius) && entity.placeTargetRadius > 0
    ? entity.placeTargetRadius
    : Number(data.placeTargetRadius);
  return data.authoredGeologySkin === true
    && typeof data.placeId === 'string'
    && data.placeId.length > 0
    && Number.isFinite(radius)
    && radius > 0
    && targetRadius === radius;
}

/**
 * PQ-019 cargo capsules opt into one exact authored pod without changing payload physics identity.
 * PQ-195.00: the SP-07 flywheel assembly opts into its own exact authored spindle the same way.
 */
export function hasExplicitAuthoredPayloadPresentation(entity) {
  if (isOrchardPod(entity)) return true;
  if (entity?.alive !== false && entity?.type === 'wreck'
    && entity.data?.persistenceOwner === 'borrowedVoice' && entity.data.borrowedVoiceKind === 'ring'
    && entity.data.authoredPayloadAssetId === 'SF_PLACE_BORROWED_VOICE_RING') return true;
  if (!entity || entity.alive === false || entity.type !== 'payload') return false;
  const assetId = entity.data?.authoredPayloadAssetId;
  return assetId === 'pod_cargo_container' || assetId === 'place_breakaway_sp07'
    || (assetId === 'SF_PROP_KILNBACK_CASK' && entity.data?.persistenceOwner === 'kilnback')
    || (assetId === 'SF_PROP_TOWLINE_DEBRIS' && entity.data?.persistenceOwner === 'towlineTable')
    || (assetId === 'SF_PROP_MOTHLIGHT_LAMP' && entity.data?.persistenceOwner === 'mothlight'
      && /^lamp_[1-4]$/.test(entity.data.mothlightLampId || ''))
    || (assetId === 'SF_PROP_ILEX_VAULT' && entity.data?.persistenceOwner === 'ilexArk')
    || (entity.data?.persistenceOwner === 'borrowedVoice' && entity.data.borrowedVoiceKind === 'recorder'
      && ['a','b','c'].includes(entity.data.borrowedVoiceRecorderId)
      && assetId === `SF_PROP_BORROWED_VOICE_${entity.data.borrowedVoiceRecorderId.toUpperCase()}`);
}

export function entityRequiresAuthoredPresentation(entity) {
  if (!entity || entity.alive === false) return false;
  if (isOrchardFrame(entity) || entity.type === 'ship' || entity.type === 'station' || isPhysicalMachinery(entity)) return true;
  if (hasExplicitAuthoredGeologyPresentation(entity)) return true;
  if (hasExplicitAuthoredPayloadPresentation(entity)) return true;
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
  return indexedWorldRecordEntity(state, ownerWorldRecordId);
}

/** Pure stable-world-identity lookup; browser callers fail closed, headless simulation does not. */
export function presentationOwnerAdmissionForWorldRecord(ownerWorldRecordId, state) {
  // Exact machinery owners cannot lend a saved/string-only ready state to a tool,
  // line or child presentation. This also preserves fail-closed browser lifetimes
  // after their scene disappears, instead of treating those owners as headless.
  const candidate = ownerWorldRecordId && state?.entities && typeof state.entities.values==='function'
    ? indexedWorldRecordEntity(state, ownerWorldRecordId) : null;
  if(isPhysicalMachinery(candidate))return machineryHasEffectivePresentation(candidate,state)
    ? PRESENTATION_OWNER_ADMISSION.ready : PRESENTATION_OWNER_ADMISSION.pending;
  if (!state || !state.render || !state.render.scene) return PRESENTATION_OWNER_ADMISSION.headless;
  if (!ownerWorldRecordId || !state.entities || typeof state.entities.values !== 'function') {
    return PRESENTATION_OWNER_ADMISSION.missing;
  }
  if (!candidate) return PRESENTATION_OWNER_ADMISSION.missing;
  const admission = candidate.presentationAdmission;
  return admission === PRESENTATION_ADMISSION.ready
    || admission === PRESENTATION_ADMISSION.unavailable
    || admission === PRESENTATION_ADMISSION.pending
    ? admission
    : PRESENTATION_OWNER_ADMISSION.pending;
}

export function presentationOwnerIsAdmitted(admission) {
  return admission === PRESENTATION_OWNER_ADMISSION.headless
    || admission === PRESENTATION_OWNER_ADMISSION.ready;
}

/**
 * Whether an entity is a mission target whose lock the renderer must keep serviceable even when
 * its authored hull never publishes: a terminal 'unavailable' on a required-whole-ship mission
 * hostile may still mount a drawn body (its resident stand-in or the procedural fallback) so the
 * warrant can be closed — authored-or-nothing never wins over a completable mission.
 * Identity arrives two ways: stamped on the record (missionTag / storyTarget) or by membership in
 * a live mission's target list. Guard every access — a save restore can leave either side
 * partially populated, and the renderer polls this on a real frame path.
 */
export function entityIsMissionCritical(entity, state) {
  const data = entity && entity.data;
  if (data) {
    if (data.missionTag != null) return true;
    if (data.storyTarget) return true;
  }
  if (!entity || entity.id == null) return false;
  const active = state && state.missions && state.missions.active;
  if (!Array.isArray(active)) return false;
  for (const mission of active) {
    const ids = mission && mission.targetEntityIds;
    if (Array.isArray(ids) && ids.includes(entity.id)) return true;
  }
  return false;
}

export function presentationAllowsPlayerFacingAction(entity, state) {
  if (isPhysicalMachinery(entity)) return machineryHasEffectivePresentation(entity, state);
  const indirect = entity && entity.data && entity.data.presentationOwnerWorldRecordId;
  if (indirect) {
    return presentationOwnerIsAdmitted(presentationOwnerAdmissionForWorldRecord(indirect, state));
  }
  if (!state || !state.render || !state.render.scene) return true;
  if (!entityRequiresAuthoredPresentation(entity)) return true;
  const owner = resolvePresentationAdmissionOwner(entity, state);
  return !!owner && owner.presentationAdmission === PRESENTATION_ADMISSION.ready;
}

/**
 * Targeting must not sit on empty air. A required hull whose authored identity is still pending
 * stays off the lock until that same complete body publishes. Headless sim and contacts that never
 * entered the authored path remain lockable. A terminal 'unavailable' verdict is not empty air by
 * itself: `presentationFallbackVisible` describes what the boundary actually draws at terminal —
 * the procedural fallback for non-required hulls, the ship's own resident stand-in hull, or the
 * procedural body the renderer publishes for a mission-critical required hull (see
 * entityIsMissionCritical). Only a verdict still drawing the abstract resolving marker — or
 * nothing — keeps the lock refused.
 */
export function presentationAllowsTargetLock(entity, state) {
  if (!entity || entity.alive === false) return false;
  if (isPhysicalMachinery(entity)) return machineryHasEffectivePresentation(entity, state);
  const indirect = entity.data && entity.data.presentationOwnerWorldRecordId;
  if (indirect) return presentationAllowsPlayerFacingAction(entity, state);
  if (!state || !state.render || !state.render.scene) return true;
  if (entity.type !== 'ship') return true;
  const admission = entity.presentationAdmission;
  if (admission == null) return true;
  if (admission === PRESENTATION_ADMISSION.unavailable) {
    return entity.presentationFallbackVisible === true;
  }
  return admission === PRESENTATION_ADMISSION.ready;
}
