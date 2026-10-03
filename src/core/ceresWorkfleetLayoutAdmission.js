// A one-shot pre-presentation materialization decision, not a live refit manager.
// Existing saves without a layout remain physically/visually legacy unless a fully
// known empty cradle can stage its replacement without touching the old native body.
import {CERES_WORKFLEET_CONTRACT as C,ceresWorkfleetCradleLayout} from '../data/ceresWorkfleet.js';
import {ceresWorkfleetHardwareSpec,consumeCeresCradleMaterialization,ceresCradleMaterializationPending,ceresCradleConstructionSelection} from '../data/ceresWorkfleetHardware.js';
import {ceresWorkfleetRoleForEntity} from '../data/ceresWorkfleetIdentity.js';
import {ensurePhysicsBodySpec,resolvePhysicsBodySpec,physicsBodyNativeReady} from './physicsAuthority.js';
import {hasPendingCeresWorkfleetAttachments} from '../combat/persistence.js';
const staging=new WeakSet();
function freezeRecipe(value) {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const key of Reflect.ownKeys(value))freezeRecipe(value[key]);
    Object.freeze(value);
  }
  return value;
}
const keeperBody=freezeRecipe(ceresWorkfleetHardwareSpec('cradle').physicsBody);
// This optional owner-supplied canonical object is retained only for pointer
// identity. Every native-affecting key, including non-enumerable additions, must
// match the generated recipe before it can cross the native construction seam.
function sameCanonicalData(value, expected) {
  if(value===null||expected===null||typeof value!=='object'||typeof expected!=='object')return Object.is(value,expected);
  if(Object.getPrototypeOf(value)!==Object.getPrototypeOf(expected))return false;
  const keys=Reflect.ownKeys(value),wanted=Reflect.ownKeys(expected);
  if(keys.length!==wanted.length||keys.some(key=>!Object.hasOwn(expected,key)))return false;
  return wanted.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    return descriptor&&Object.hasOwn(descriptor,'value')&&sameCanonicalData(descriptor.value,expected[key]);
  });
}
function canonicalKeeperBody(body) {
  try{return sameCanonicalData(body,keeperBody);}catch{return false;}
}

const selections=new WeakMap(), certificateOwners=new WeakMap();
// This is recipe selection, not a native-readiness receipt. Only the simulation
// owner binds constructor provenance; render readers cannot create that authority.
export function bindCeresCradleLayout(entity,state){
  if(ceresWorkfleetRoleForEntity(entity)!=='cradle'||state?.entities?.get(entity.id)!==entity||entity.alive===false)return null;
  const prior=selections.get(entity);
  if(prior)return readCeresCradleLayout(entity,state);
  const certificate=ceresCradleConstructionSelection(entity);
  if(!certificate||certificateOwners.has(certificate)||certificate.recordId!==C.identities.cradle
    ||entity.data.ceresWorkfleetCradleLayout!==certificate.layout
    ||entity.data.itinerary?.ceresWorkfleet?.cradleLayout!==certificate.layout)return null;
  const receipt={state,entity,life:entity.occupantGeneration,data:entity.data,layout:certificate.layout,certificate};
  selections.set(entity,receipt);certificateOwners.set(certificate,entity);
  return readCeresCradleLayout(entity,state);
}
export function readCeresCradleLayout(entity,state=selections.get(entity)?.state){
  const r=selections.get(entity);
  return r&&r.state===state&&state?.entities?.get(entity.id)===entity&&r.entity===entity
    &&entity.alive!==false&&entity.occupantGeneration===r.life&&entity.data===r.data
    &&ceresWorkfleetRoleForEntity(entity)==='cradle'&&entity.data.persistenceOwner==='worldRecords'
    &&ceresCradleConstructionSelection(entity)===r.certificate
    &&entity.data.ceresWorkfleetCradleLayout===r.layout
    &&entity.data.itinerary?.ceresWorkfleet?.cradleLayout===r.layout?r.layout:null;
}
export function canPublishCeresCradleLayout(entity,state=selections.get(entity)?.state){
  if(ceresWorkfleetRoleForEntity(entity)!=='cradle')return true;
  if(selections.has(entity)&&!readCeresCradleLayout(entity,state))return false;
  if(state?.entities?.get(entity.id)!==entity)return !selections.has(entity);
  return !!readCeresCradleLayout(entity,state)&&!ceresCradleMaterializationPending(entity)&&!staging.has(entity);
}
const samePose=(e,p)=>e.pos.x===p.x&&e.pos.z===p.z&&e.rot===p.rot&&e.vel.x===p.vx&&e.vel.z===p.vz&&e.angVel===p.spin&&e.occupantGeneration===p.life;
function reasonNotSafe(state,native,e){
  if(!native?.world||!native.records||state?.entities?.get(e.id)!==e||state.world?.currentSectorId!==C.sectorId)return 'native-or-world-unresolved';
  if(e.alive===false||e.hull<=0||e.data?.persistenceOwner!=='worldRecords'||e.playerOwned||e.data.playerOwned||e.data.controlLease||e.data.disabled)return 'custody-or-health';
  if(e.radius!==keeperBody.radius||e.mass!==keeperBody.mass)return 'entity-recipe-unresolved';
  if(e.mesh?.userData?.authoredAssetState==='authored')return 'already-presented';
  const record=state.world?.records?.byId?.[C.identities.cradle];
  if(!record||record.playerOwned||record.alive===false||['defeated','destroyed'].includes(record.outcome))return 'record-unresolved';
  const payload=state.sites?.worldById?.[C.siteId]?.payloads?.long_plate;
  if(!payload||payload.destroyed||payload.worldObjectId!==C.identities.payload)return 'payload-unresolved';
  const sections=[...state.entities.values()].filter(x=>x.alive!==false&&x.data?.worldRecordId===C.identities.payload);
  if(sections.length!==1)return 'section-not-materialized';
  const section=sections[0], sectionRecord=native.records.get(section.id);
  if(section.mass!==1800||section.data.persistenceOwner!=='asteroidSites'
    ||section.data.worldSiteId!==C.siteId||section.data.worldSitePayloadId!=='long_plate'
    ||section.data.worldSiteStructural!==true||sectionRecord?.entity!==section
    ||sectionRecord.spec.mass!==1800||sectionRecord.proxyId!==`world-site-structure:${C.identities.payload}`
    ||sectionRecord.colliders.length!==C.existing.section.boxes.length
    ||section.physicsBody===false||sectionRecord.body.isEnabled()===false
    ||!physicsBodyNativeReady(section))return 'section-not-materialized';
  const sectionPose=sectionRecord.body.translation(),frame=native.getFrameOrigin();
  if(sectionPose.x!==Math.fround(section.pos.x-frame.x)||sectionPose.z!==Math.fround(section.pos.z-frame.z))return 'section-native-pose-unresolved';
  const lines=state.combat?.attachments?.byId;
  if(!lines||hasPendingCeresWorkfleetAttachments(state))return 'custody-unresolved';
  for(const line of Object.values(lines))if(line.state==='active'&&(line.ownerId===e.id||line.targetId===e.id))return 'active-coupling';
  for(const a of native.attachments.values())if(a.owner.entity===e||a.target.entity===e)return 'active-native-coupling';
  for(const a of native._suspendedAttachments.values())if(a.owner===e||a.target===e)return 'suspended-coupling';
  const old=native.records.get(e.id);
  if(old&&(old.entity!==e||old.spec.dynamic||old.colliders.length!==9||old.proxyId!=='ceres-workfleet:cradle:open:v1'))return 'native-layout-mismatch';
  // Conservative whole-footprint emptiness also rules out coincident-spawn nudges.
  // An unregistered nearby body is unresolved, never proof of empty space.
  for(const peer of state.entities.values()){
    if(peer===e||peer.alive===false||!peer.pos)continue;
    const reach=e.radius+Math.max(0,Number(peer.radius)||0);
    if(Math.hypot(peer.pos.x-e.pos.x,peer.pos.z-e.pos.z)<=reach&&!native.records.has(peer.id))return 'nearby-body-unresolved';
  }
  const at={x:e.pos.x-native.getFrameOrigin().x,y:0,z:e.pos.z-native.getFrameOrigin().z};
  const q={x:0,y:-Math.sin(e.rot/2),z:0,w:Math.cos(e.rot/2)};
  const shape=new native.RAPIER.Cuboid(85,2*Math.hypot(85,75),75);
  native.world.propagateModifiedBodyPositionsToColliders();
  for(const rec of native.records.values()){
    if(rec===old)continue;
    for(const c of rec.colliders){const contact=c.contactShape(shape,at,q,0);if(contact&&contact.distance<=0)return 'occupied-footprint';}
  }
  return null;
}
function discardStage(native,before){
  for(const [handle] of native._colliderOwners)if(!before.colliderOwners.has(handle))native._colliderOwners.delete(handle);
  for(const rec of native.ceresWorkfleetRecords)if(!before.ceres.has(rec))native.ceresWorkfleetRecords.delete(rec);
  for(const rec of native.dynamicRecords)if(!before.dynamic.has(rec))native.dynamicRecords.delete(rec);
  const added=[];native.world.forEachRigidBody(body=>{if(!before.bodies.has(body.handle))added.push(body);});
  for(const body of added)native.world.removeRigidBody(body);
}
/** Synchronous staged replacement. It preserves old ownership on construction failure,
 * not Rapier allocation history or bit-identical future native continuation. */
export function admitCeresCradleLayout(state,native,e,canonicalBody=keeperBody){
  if(!bindCeresCradleLayout(e,state))return {status:'unselected'};
  const token=consumeCeresCradleMaterialization(e);
  if(!token||!token.restored||token.layout!=='open-v1'||ceresWorkfleetRoleForEntity(e)!=='cradle'||ceresWorkfleetCradleLayout(e)!=='open-v1')return {status:'unchanged'};
  if(!canonicalKeeperBody(canonicalBody))return {status:'legacy',reason:'canonical-recipe-unresolved'};
  const reason=reasonNotSafe(state,native,e);if(reason)return {status:'legacy',reason};
  const old=native.records.get(e.id),oldBody=e.physicsBody;
  const pose={x:e.pos.x,z:e.pos.z,rot:e.rot,vx:e.vel.x,vz:e.vel.z,spin:e.angVel,life:e.occupantGeneration,prev:e.prevPos&&{...e.prevPos}};
  const before={colliderOwners:new Set(native._colliderOwners.keys()),ceres:new Set(native.ceresWorkfleetRecords),dynamic:new Set(native.dynamicRecords),bodies:new Set()};
  native.world.forEachRigidBody(body=>before.bodies.add(body.handle));
  staging.add(e);let next;
  try{
    e.physicsBody={...keeperBody,collisionProxyManifest:canonicalBody.collisionProxyManifest,revision:(oldBody?.revision||0)+1};
    ensurePhysicsBodySpec(e);const spec=resolvePhysicsBodySpec(e);
    next=native._createRecord(e,spec,old);
    if(!samePose(e,pose)||next.entity!==e||next.colliders.length!==11||next.proxyId!=='ceres-workfleet:cradle:open:v2'||!physicsBodyNativeReady(e))throw new Error('candidate-layout-admission-mismatch');
    const p=next.body.translation(),o=native.getFrameOrigin();
    if(p.x!==Math.fround(pose.x-o.x)||p.z!==Math.fround(pose.z-o.z))throw new Error('candidate-native-pose-mismatch');
  }catch(error){
    discardStage(native,before);e.physicsBody=oldBody;
    // A staged constructor must not become a transform repair. Restore only the
    // uncommitted semantic mirror if an injected/native admission nudge touched it;
    // the old native body has never been stepped, removed or rewritten on this path.
    if(!samePose(e,pose)){e.pos.x=pose.x;e.pos.z=pose.z;e.rot=pose.rot;e.vel.x=pose.vx;e.vel.z=pose.vz;e.angVel=pose.spin;if(pose.prev&&e.prevPos)Object.assign(e.prevPos,pose.prev);}
    staging.delete(e);
    return {status:'legacy',reason:'native-admission-failed',error:String(error?.message||error)};
  }
  // Construction and validation are complete. No catch below this boundary may
  // claim to preserve the old native body after its removal. The preflight proved
  // there are no native, semantic or suspended constraints to transfer.
  if(old&&native._removeRecord(e.id,old)===false){
    discardStage(native,before);e.physicsBody=oldBody;staging.delete(e);
    return {status:'legacy',reason:'old-layout-still-owned'};
  }
  native.records.set(e.id,next);
  e.data.ceresWorkfleetCradleLayout='keepers-v2';
  e.data.itinerary.ceresWorkfleet.cradleLayout='keepers-v2';
  selections.get(e).layout='keepers-v2';
  staging.delete(e);
  return {status:'upgraded',record:next};
}
