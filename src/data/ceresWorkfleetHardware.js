import { CERES_BREAKER_CRAFT } from './occupationalTrafficCraft.js';
// Canonical finite hardware spawn/Continue recipes, never a live motion writer.
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetPose, ceresWorkfleetCollision } from './ceresWorkfleet.js';
const materialization = Symbol('ceres.cradle.materialization');
const selections = new WeakMap();
// Process-local constructor provenance. JSON fields alone cannot issue this certificate.
export function ceresCradleConstructionSelection(entity) {
  return entity?.data ? selections.get(entity.data) || null : null;
}
export function ceresCradleMaterializationPending(entity) {
  const token=entity?.data?.[materialization];return !!token?.restored&&token.layout==='open-v1';
}
export function consumeCeresCradleMaterialization(entity) {
  const token=entity?.data?.[materialization];
  if(!token)return null;
  delete entity.data[materialization];return token;
}
import { Masks } from '../core/entity.js';
export function ceresWorkfleetHardwareSpec(role, record=null) {
  const asset=C.assets[role];
  if(!asset)throw new RangeError(`Unknown Ceres hardware ${role}`);
  const local=role==='breaker'?C.route.breakerWorkPose:role==='cradle'?asset.pose
    :ceresWorkfleetPose(C.route.breakerWorkPose,C.assets.breaker.headMountedPose);
  const at=record?{...record.pos,rot:record.rot||0}:ceresWorkfleetPose({...C.sitePlacement.pos,rot:C.sitePlacement.rot},local);
  const saved=record?.itinerary?.ceresWorkfleet;
  const slide=Number.isFinite(saved?.slide)?Math.max(0,Math.min(1,saved.slide)):0;
  const cradleLayout=role==='cradle'?(record?(saved&&Object.hasOwn(saved,'cradleLayout')?saved.cradleLayout:'open-v1'):'keepers-v2'):null;
  if(role==='cradle'&&!['open-v1','keepers-v2'].includes(cradleLayout))throw new RangeError('Invalid cradle layout');
  const custody=record&&ceresWorkfleetRecordHasCustody(record)?{...saved.custody}:null;
  const worldRecordId=C.identities[role==='breaker'?'worker':role];
  const spec={type:role==='breaker'?'ship':'wreck',alive:true,pos:{x:at.x,z:at.z},rot:at.rot,
    vel:record?{x:record.vel.x,z:record.vel.z}:{x:0,z:0},angVel:record?.angVel||0,radius:asset.radius,mass:asset.mass,hull:record?.hull??(role==='breaker'?1800:role==='cradle'?2400:120),
    hullMax:role==='breaker'?1800:role==='cradle'?2400:120,collides:true,collisionMask:Masks.PROJECTILE,team:2,factionId:'faction_free',
    homeSectorId:C.sectorId,playerOwned:record?.playerOwned===true,playerCreated:record?.playerCreated===true,flags:{},ai:role==='breaker'?{passive:true}:undefined,
    physicsBody:{schemaVersion:1,dynamic:role!=='cradle',radius:asset.radius,mass:asset.mass,
      inertiaY:asset.mass*(asset.dimensions.x**2+asset.dimensions.z**2)/12,ccd:true,material:'wreck',
      collisionProxyManifest:ceresWorkfleetCollision(role,'open',cradleLayout||'keepers-v2'),revision:0},
    data:{ceresWorkfleetRole:role,...(cradleLayout?{ceresWorkfleetCradleLayout:cradleLayout}:{}),ceresWorkfleetSlide:slide,ceresWorkfleetSlideTarget:slide,
      worldRecordId,playerOwned:record?.playerOwned===true,playerCreated:record?.playerCreated===true,itinerary:{kind:'ceres_workfleet',ceresWorkfleet:{role,slide,custody,...(cradleLayout?{cradleLayout}:{})}},persistenceOwner:'worldRecords',homeSectorId:C.sectorId,sectorId:C.sectorId,worldRecordNamed:true,
      name:role==='breaker'?'Second Measure Breaker':role==='cradle'?'Second Measure Section Cradle':'Second Measure Cutter Head',
      role:role==='breaker'?'ceres_breaker':'world_site_hardware',
      ...(role==='breaker'?{occupationalCraft:CERES_BREAKER_CRAFT.craftId,ai:{passive:true,allowPassiveManeuver:false,roe:'hold_fire',spawnContext:'convoy_civilian'}}:{placeId:asset.id,placeScale:asset.sourceScale}),
      combatProfileId:`combat_profile_ceres_${role==='cutterHead'?'cutter_head':role}`,
      salvagePool:{},transientSector:false},};
  if(role==='cradle'){
    const selection=Object.freeze({recordId:worldRecordId,layout:cradleLayout,restored:!!record});
    selections.set(spec.data,selection);
    Object.defineProperty(spec.data,materialization,{value:selection,configurable:true});
  }
  return spec;
}

export const isCeresWorkfleetRecordIdentity = record => record?.recordId===C.identities.worker||record?.recordId===C.identities.cradle||record?.recordId===C.identities.cutterHead;
export function ceresWorkfleetHardwareRoleForRecord(record) {
  const role=record?.itinerary?.ceresWorkfleet?.role;
  return ['breaker','cradle','cutterHead'].includes(role)&&record.itinerary.kind==='ceres_workfleet'
    &&(role!=='cradle'||!Object.hasOwn(record.itinerary.ceresWorkfleet,'cradleLayout')||['open-v1','keepers-v2'].includes(record.itinerary.ceresWorkfleet.cradleLayout))
    &&record.alive!==false&&!['destroyed','defeated'].includes(record.outcome)
    &&(record.persistenceOwner==null||record.persistenceOwner==='worldRecords')
    &&(record.extra?.persistenceOwner==null||record.extra.persistenceOwner==='worldRecords')
    &&record.recordId===C.identities[role==='breaker'?'worker':role]
    &&record.sectorId===C.sectorId&&record.type===(role==='breaker'?'ship':'wreck')
    &&[record.pos?.x,record.pos?.z,record.vel?.x,record.vel?.z,record.rot,record.angVel,record.hull,record.hullMax,record.itinerary.ceresWorkfleet.slide].every(Number.isFinite)
    &&record.hull>0&&record.hull<=record.hullMax&&record.itinerary.ceresWorkfleet.slide>=0&&record.itinerary.ceresWorkfleet.slide<=1?role:null;
}

// Exact custody receipts written by npcJobsRuntime from its live job and attachment service.
// A name/asset/itinerary alone must not freeze a loose or player-released body.
export function ceresWorkfleetRecordHasCustody(record) {
  if(!isCeresWorkfleetRecordIdentity(record)||!ceresWorkfleetHardwareRoleForRecord(record)||record.playerOwned===true)return false;
  const custody=record.itinerary.ceresWorkfleet.custody;
  return custody?.jobId==='job:ceres:second_measure:long_plate'&&custody.worker===C.identities.worker
    &&custody.head===C.identities.cutterHead&&custody.cradle===C.identities.cradle&&custody.section===C.identities.payload
    &&custody.active===true&&(custody.phase==='paused'?typeof custody.attachmentId==='string'&&custody.attachmentId.length>0: ['head_dock','head_out','head_cut','head_retract','tow_attach','extract','seat','loaded',
      'receiver','unshoe','withdraw','pads','secured','recover_turn','recover_approach','recover_seat','recover_return_turn','recover_return'].includes(custody.phase));
}
