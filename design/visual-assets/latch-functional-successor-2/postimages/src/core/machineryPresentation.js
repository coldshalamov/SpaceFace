import { isLatchActor } from '../data/latchNineIdentity.js';
import { physicsBodyNativeReady } from './physicsAuthority.js';
import { readCeresCradleLayout, canPublishCeresCradleLayout } from './ceresWorkfleetLayoutAdmission.js';
import { refreshEntityPhysicsIndex } from './coreSystem.js';
import { refreshPhysicsPartition, requestActivityReclassify } from '../world/activityRuntime.js';
import { CERES_WORKFLEET_CONTRACT as CERES } from '../data/ceresWorkfleet.js';
import { ceresWorkfleetRoleForEntity } from '../data/ceresWorkfleetIdentity.js';
// Stormshift's three machinery families and Ceres's three exact workfleet identities
// share one presentation receipt. No other ships or wrecks opt in through a state string.
// Receipts are process-local: a saved ready string is never visual authority.
const FAMILIES = Object.freeze({
  latch_nine: Object.freeze(['place_latch_nine']),
  anvil_storage_saddle: Object.freeze(['foundation','intact','damaged'].map(s=>`place_stormshift_storage_saddle_${s}`)),
  anvil_rack: Object.freeze(['intact','damaged','repaired'].map(s=>`place_stormshift_cooling_rack_${s}`)),
  anvil_cradle: Object.freeze(['intact','blocked','repaired'].map(s=>`place_stormshift_service_cradle_${s}`)),
  ceres_breaker: Object.freeze([CERES.assets.breaker.id]),
  ceres_cradle: Object.freeze([CERES.assets.cradle.id]),
  ceres_cutterHead: Object.freeze([CERES.assets.cutterHead.id]),
});
const boundaryIdentities = new WeakMap();
const ceresBoundarySources = new WeakMap();
const latchBoundarySources = new WeakMap();
const ceresBoundaryLayouts = new WeakMap();
const browserStates = new WeakSet();
const bindings = new WeakMap();
const admitted = new WeakMap();
const effective = new WeakMap();
const epochs = new WeakMap();
const owners = new WeakMap();
export function machineryPresentationFamily(entity) {
  if(isLatchActor(entity))return 'latch_nine';
  const role=ceresWorkfleetRoleForEntity(entity);
  if(role)return `ceres_${role}`;
  const kind=entity?.data?.itinerary?.kind;
  return entity?.type==='wreck' && typeof kind==='string' && kind.startsWith('anvil_') && Object.hasOwn(FAMILIES,kind)?kind:null;
}
export function isPhysicalMachinery(entity) {
  return machineryPresentationFamily(entity)!==null;
}
export function machineryRequestedPresentation(entity) {
  const role=ceresWorkfleetRoleForEntity(entity);
  return role?CERES.assets[role].id:entity?.data?.placeId;
}
// Parts-library publication calls this with the actual selected GLB record, never the
// requested entity tags. Initial binds can precede async publication, so source capture
// is separate from binding. A boundary's first source cannot be relabelled after admission.
export function recordCeresWorkfleetAuthoredSource(boundary, source) {
  if(!boundary || ceresBoundarySources.has(boundary))return false;
  let file=source?.file;
  if(typeof file==='string') {
    if(/^https?:\/\//.test(file)) {
      try {const url=new URL(file);file=url.search||url.hash?null:url.pathname;}catch {file=null;}
    }
    file=file?.replace(/^\/?assets\/ships\/(?:release\/)?parts\//,'');
  }
  const role=Object.keys(CERES.assets).find(key=>{
    const asset=CERES.assets[key];
    return source?.assetId===asset.assetId && file===asset.file;
  });
  ceresBoundarySources.set(boundary,role?CERES.assets[role].id:null);
  return !!role;
}
// Latch admission binds the actual selected asset record, never saved ready strings.
export function recordLatchAuthoredSource(boundary,source){
  if(!boundary||latchBoundarySources.has(boundary)||!source)return false;
  let file=source.file;
  if(typeof file==='string'&&/^https?:\/\//.test(file)){try{const url=new URL(file);file=url.search||url.hash?null:url.pathname;}catch{file=null;}}
  file=typeof file==='string'?file.replace(/^\/?assets\/ships\/(?:release\/)?parts\//,''):null;
  const place=source.assetId==='SF_PLACE_LATCH_NINE'&&file==='places/place_latch_nine.glb'?'place_latch_nine':null;
  latchBoundarySources.set(boundary,place);return !!place;
}
// A selected native recipe is not a ready native body. This receipt only attests
// that the publishing instance applied its keeper mask to that selected recipe.
export function recordCeresCradleAuthoredLayout(boundary, entity, state, layout) {
  if (!boundary || ceresWorkfleetRoleForEntity(entity) !== 'cradle'
    || !layout || readCeresCradleLayout(entity, state) !== layout
    || !canPublishCeresCradleLayout(entity, state)) return false;
  const prior = ceresBoundaryLayouts.get(boundary);
  if (prior?.entity === entity && prior.life === entity.occupantGeneration && prior.layout === layout) return true;
  ceresBoundaryLayouts.set(boundary, {entity, life: entity.occupantGeneration, layout});
  return true;
}
function selectedCradleLayout(entity, state) {
  return ceresWorkfleetRoleForEntity(entity) === 'cradle' ? readCeresCradleLayout(entity, state) : null;
}
function boundaryCradleLayoutMatches(boundary, entity, state) {
  if (ceresWorkfleetRoleForEntity(entity) !== 'cradle') return true;
  const receipt = ceresBoundaryLayouts.get(boundary), layout = selectedCradleLayout(entity, state);
  return !!layout && receipt?.entity === entity && receipt.life === entity.occupantGeneration
    && receipt.layout === layout && canPublishCeresCradleLayout(entity, state);
}
function sameLife(receipt, entity, state) {
  return receipt && receipt.epoch === (epochs.get(state) || 0) && receipt.state === state && receipt.render === state.render
    && receipt.scene === state.render?.scene && !!receipt.scene
    && receipt.nativeRenderer === state.render?.renderer
    && state.render?.contextRecovery?.pending !== true
    && receipt.generation === state.render?.admissionRunGeneration
    && receipt.life === entity.occupantGeneration && state.entities?.get(entity.id) === entity
    && entity.alive !== false;
}
// Called only by the renderer's successful live-boundary bind, never by staging/preparation.
export function bindMachineryPresentation(entity, boundary, state) {
  if (!isPhysicalMachinery(entity) || !boundary || !state?.render?.scene) return;
  browserStates.add(state);
  if (!ceresWorkfleetRoleForEntity(entity) && !boundaryIdentities.has(boundary)) {
    const place=boundary.userData?.placeId;
    boundaryIdentities.set(boundary,FAMILIES[machineryPresentationFamily(entity)].includes(place)?place:null);
  }
  bindings.set(boundary, { state, render: state.render, scene: state.render.scene, nativeRenderer:state.render.renderer,
    epoch: epochs.get(state) || 0, generation: state.render.admissionRunGeneration, life: entity.occupantGeneration, entity });
}
export function machineryPresentationPlace(entity, state) {
  if (!isPhysicalMachinery(entity) || !state) return null;
  if(entity.alive===false || state.entities?.get(entity.id)!==entity)return null;
  if (ceresWorkfleetRoleForEntity(entity) === 'cradle'
    && (!selectedCradleLayout(entity, state) || !canPublishCeresCradleLayout(entity, state))) return null;
  if (state.render?.scene) browserStates.add(state);
  if (!browserStates.has(state)) return machineryRequestedPresentation(entity); // explicit no-render/headless path
  const boundary = entity.mesh, binding = boundary && bindings.get(boundary);
  if(isLatchActor(entity)){let mounted=boundary;while(mounted&&mounted!==state.render?.scene)mounted=mounted.parent;if(!boundary||!state.render?.scene||mounted!==state.render.scene)return null;}
  const place = boundary && (isLatchActor(entity)?latchBoundarySources.get(boundary):ceresWorkfleetRoleForEntity(entity)
    ?ceresBoundarySources.get(boundary):boundaryIdentities.get(boundary));
  if(boundary && (binding?.entity!==entity || !sameLife(binding,entity,state)))return null;
  // Initial binding precedes the synchronous renderer pending-latch setup. Never cache
  // admission from bind itself: the simulation samples after that setup, and a mounted
  // but hidden/unready boundary cannot borrow an evicted root's prior receipt.
  if (binding?.entity===entity && sameLife(binding,entity,state)
      && (boundary.userData.authoredAssetState!=='authored'
        || boundary.userData.pipelinesPending===true || boundary.userData.geometryPending===true
        || !FAMILIES[machineryPresentationFamily(entity)].includes(place)
        || !boundaryCradleLayoutMatches(boundary, entity, state))) return null;
  if (binding?.entity === entity && sameLife(binding, entity, state)
      && boundary.userData.authoredAssetState === 'authored'
      && FAMILIES[machineryPresentationFamily(entity)].includes(place)
      && boundaryCradleLayoutMatches(boundary, entity, state)) {
    const old=admitted.get(entity), layout=selectedCradleLayout(entity, state);
    if(old?.binding!==binding || old.place!==place || old.layout!==layout)admitted.set(entity, { ...binding, binding, place, layout });
  }
  const receipt = admitted.get(entity);
  return sameLife(receipt, entity, state)
    && receipt.layout === selectedCradleLayout(entity, state)
    && (ceresWorkfleetRoleForEntity(entity) !== 'cradle' || !!receipt.layout)
    && FAMILIES[machineryPresentationFamily(entity)].includes(receipt.place) ? receipt.place : null;
}
// The machinery owner writes this only after installing the matching effective proxy.
export function markMachineryEffective(entity, state, place) {
  const body=entity.physicsBody, prior=effective.get(entity), layout=selectedCradleLayout(entity, state);
  if(prior?.state===state && prior.place===place && prior.life===entity.occupantGeneration
      && prior.body===body && prior.proxy===body?.collisionProxyManifest
      && prior.revision===body?.revision && prior.collides===entity.collides && prior.layout===layout)return;
  effective.set(entity, { state, place, life:entity.occupantGeneration, body, layout,
    proxy:body?.collisionProxyManifest, revision:body?.revision, collides:entity.collides });
  refreshEntityPhysicsIndex(state,entity,entity.occupantGeneration);
  refreshPhysicsPartition(entity);
  requestActivityReclassify(state,entity,{physicsPublication:true});
}
export function machineryNeedsReconciliation(entity, state) {
  const receipt=effective.get(entity),body=entity?.physicsBody;
  return !receipt || receipt.state!==state || receipt.life!==entity.occupantGeneration
    || receipt.body!==body || receipt.proxy!==body?.collisionProxyManifest
    || receipt.revision!==body?.revision || receipt.collides!==entity.collides
    || receipt.layout!==selectedCradleLayout(entity,state)
    || receipt.place!==machineryPresentationPlace(entity,state);
}
export function machineryHasEffectivePresentation(entity, state = effective.get(entity)?.state) {
  if (!isPhysicalMachinery(entity)) return true;
  const place = machineryPresentationPlace(entity, state);
  const receipt=effective.get(entity),body=entity.physicsBody;
  return !!place && receipt?.state === state && receipt.place === place
    && receipt.life === entity.occupantGeneration && receipt.body === body
    && receipt.proxy === body?.collisionProxyManifest && receipt.revision === body?.revision
    && receipt.layout === selectedCradleLayout(entity, state)
    && (ceresWorkfleetRoleForEntity(entity) !== 'cradle' || !!receipt.layout)
    && body !== false && entity.collides === true && physicsBodyNativeReady(entity);
}
export function machineryDesiredPresentationReady(entity, state = effective.get(entity)?.state) {
  if (!isPhysicalMachinery(entity)) return true;
  return machineryHasEffectivePresentation(entity, state)
    && machineryPresentationPlace(entity, state) === machineryRequestedPresentation(entity);
}

export function invalidateMachineryPresentation(state) {
  if (!state) return;
  if (state.render?.scene) browserStates.add(state);
  if (owners.has(state)) owners.get(state).lastTick = null;
  epochs.set(state, (epochs.get(state) || 0) + 1);
}
export function registerMachineryReconciliation(state, owner) {
  owners.set(state, { owner, lastTick: null });
}
export function unregisterMachineryReconciliation(state, owner) {
  if (owners.get(state)?.owner !== owner) return;
  owners.delete(state);
  invalidateMachineryPresentation(state);
}
export function reconcileMachineryBeforePhysics(state) {
  const record = owners.get(state);
  if (!record || record.owner.state !== state || record.owner._restoreEpochPending === true) return;
  const tick = state.tick;
  if (tick != null && record.lastTick === tick) return;
  record.lastTick = tick;
  record.owner._reconcileAnvilPresentation?.();
  record.owner._reconcileCeresWorkfleetPresentation?.();
}
