import {ceresWorkfleetReacquireReturnBudget,restoreCeresWorkfleetReacquireReturnBudget,ceresWorkfleetHeadClearPrefix,planCeresWorkfleetReacquire,restoreCeresWorkfleetReacquire,ceresWorkfleetReacquireStage,CERES_REACQUIRE_LIMITS} from './ceresWorkfleetRecovery.js';
import {planCeresWorkfleetRecovery,restoreCeresWorkfleetRecovery,ceresWorkfleetRecoveryClear,CERES_RECOVERY_LIMITS} from './ceresWorkfleetRecovery.js';
import {admitCeresCradleLayout} from '../core/ceresWorkfleetLayoutAdmission.js';
// P03's one finite handling cycle. Imported by the existing traffic/jobs/site owners.
// Pose and velocity belong exclusively to native physics; this adapter requests thrust.
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetPose,
  ceresWorkfleetPoint, ceresWorkfleetCradleLayout } from '../data/ceresWorkfleet.js';
import { writePhysicsControl, physicsBodyNativeReady, ensurePhysicsBodySpec } from '../core/physicsAuthority.js';

export const CERES_WORKFLEET_JOB_ID = 'job:ceres:second_measure:long_plate';
export const CERES_WORKFLEET_REQUEST_STREAM = 'ceres-second-measure-cutter';
export const CERES_WORKFLEET_PACE=Object.freeze({extractSpeed:1,reelSpeed:1});
const wrap = v => Math.atan2(Math.sin(v), Math.cos(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const bounded = (v,max,fallback) => Number.isFinite(v)?clamp(v,0,max):fallback;
export function ceresWorkfleetWorldPose(local) {
  return ceresWorkfleetPose({ ...C.sitePlacement.pos, rot:C.sitePlacement.rot },local);
}
export { ceresWorkfleetHardwareSpec } from '../data/ceresWorkfleetHardware.js';
export function ceresWorkfleetCarrierPointVelocity(carrier,at){
 const w=carrier.angVel||0;return {x:carrier.vel.x-w*(at.z-carrier.pos.z),z:carrier.vel.z+w*(at.x-carrier.pos.x)};
}
function headInsideCarrierBounds(breaker,head){
 return C.assets.cutterHead.boxes.every(box=>[-1,1].every(x=>[-1,1].every(z=>{
  const p=ceresWorkfleetPoint({...head.pos,rot:head.rot},{x:box.center.x+x*box.size.x/2,z:box.center.z+z*box.size.z/2});
  const dx=p.x-breaker.pos.x,dz=p.z-breaker.pos.z,c=Math.cos(breaker.rot),sn=Math.sin(breaker.rot),lx=dx*c+dz*sn,lz=-dx*sn+dz*c;
  return lx>=C.assets.breaker.bounds.min.x&&lx<=C.assets.breaker.bounds.max.x&&lz>=C.assets.breaker.bounds.min.z&&lz<=C.assets.breaker.bounds.max.z;
 })));
}
export function ceresWorkfleetHeadReturnReady(carrier,head,target,safeCorridor){
 if(!safeCorridor)return false;const velocity=ceresWorkfleetCarrierPointVelocity(carrier,head.pos);
 return Math.hypot(head.pos.x-target.x,head.pos.z-target.z)<=.2&&Math.abs(wrap(head.rot-target.rot))<=.006
  &&Math.hypot(head.vel.x-velocity.x,head.vel.z-velocity.z)<=.12&&Math.abs((head.angVel||0)-(carrier.angVel||0))<=.003;
}
/** A bounded reversible-thruster PD controller; no pose writes or endpoint impulses. */
export function ceresWorkfleetThrust(entity,target,{speed=10,accel=3,angularSpeed=.08,angularAccel=.12,referenceVelocity=null,referenceAngularVelocity=0,totalSpeed=speed}={}) {
  const dx=target.x-entity.pos.x,dz=target.z-entity.pos.z,distance=Math.hypot(dx,dz);
  const cruise=Math.min(speed,distance*.6);
  let vx=(distance?dx/distance*cruise:0)+(referenceVelocity?.x||0),vz=(distance?dz/distance*cruise:0)+(referenceVelocity?.z||0);
  const requested=Math.hypot(vx,vz);if(requested>totalSpeed){vx*=totalSpeed/requested;vz*=totalSpeed/requested;}
  let ax=(vx-(entity.vel?.x||0))*1.8;
  let az=(vz-(entity.vel?.z||0))*1.8;
  const magnitude=Math.hypot(ax,az);if(magnitude>accel){ax*=accel/magnitude;az*=accel/magnitude;}
  const yaw=clamp(wrap(target.rot-(entity.rot||0))*.9+referenceAngularVelocity,-angularSpeed,angularSpeed);
  const angular=clamp((yaw-(entity.angVel||0))*2,-angularAccel,angularAccel);
  return {mode:'newtonian',source:'ceres-workfleet',maxSpeed:Infinity,
    force:{x:ax*entity.mass,y:0,z:az*entity.mass},
    torque:{x:0,y:angular*entity.physicsBody.inertiaY,z:0}};
}
export function driveCeresWorkfleetBody(entity,target,options,state=null) {
  if(!entity||entity.alive===false||entity.hull<=0||!physicsBodyNativeReady(entity))return false;
  if(state&&ceresWorkfleetRoleForEntity(entity)==='cutterHead') {
    const job=jobOf(state),bodies=liveBodies(state),section=bodies.section,breaker=bodies.breaker;
    if(!job||!finitePose(target)||!healthy(state,entity)||!healthy(state,breaker)||!exactSection(section)||controlled(state,section))return false;
    const limits={speed:bounded(options?.speed,10,5),accel:bounded(options?.accel,8,8),
      angularSpeed:bounded(options?.angularSpeed,.3,.3),angularAccel:bounded(options?.angularAccel,.6,.6)};
    if((job.phase==='head_retract'||job.phase==='tow_attach'&&!job.mountId)&&options?.carrierVelocity===true){
      limits.referenceVelocity=ceresWorkfleetCarrierPointVelocity(breaker,target);limits.referenceAngularVelocity=breaker.angVel||0;limits.totalSpeed=10;
    }
    HEAD_CONTROL.set(entity,{state,render:state.render,scene:state.render?.scene,tick:state.tick,life:entity.occupantGeneration,
      body:entity.physicsBody,job,phase:job.phase,returnGuard:options?.returnGuard||null,breaker,breakerLife:breaker.occupantGeneration,section,sectionLife:section.occupantGeneration,target:{...target},
      control:ceresWorkfleetThrust(entity,target,limits)});return true;
  }
  const control=ceresWorkfleetThrust(entity,target,options);writePhysicsControl(entity,control);
  if(state)publishCeresWorkfleetActuation(entity,control,state.tick,state);return true;
}
export function publishCeresWorkfleetActuation(entity,control,tick,state=null) {
  if(!control)clearCeresWorkfleetActuation(entity);
  else if(state)recordCeresWorkfleetActuation(state,entity,control,entity.data.ceresWorkfleetRole==='breaker'
    ?{accel:.5,angularAccel:.025}:{accel:8,angularAccel:.6});
  const ax=control?.force?.x/entity.mass||0,az=control?.force?.z/entity.mass||0;
  const angular=control?.torque?.y/entity.physicsBody?.inertiaY||0,c=Math.cos(entity.rot||0),sn=Math.sin(entity.rot||0);
  const forward=ax*c+az*sn,lateral=-ax*sn+az*c;
  entity._flightFrame={mode:'newtonian',assistMode:'newtonian',family:'reaction',driveId:'ceres_workfleet_service_thrusters',
    acceleration:{x:ax,z:az},angularAcceleration:angular,force:{x:control?.force?.x||0,z:control?.force?.z||0},
    torque:{y:control?.torque?.y||0},driveState:Math.hypot(ax,az)+Math.abs(angular)>1e-6?'thrust':'idle',
    actuators:{main:Math.max(0,forward),reverse:Math.max(0,-forward),lateral,yaw:angular},
    speed:Math.hypot(entity.vel?.x||0,entity.vel?.z||0),maxSpeed:entity.data?.ceresWorkfleetRole==='breaker'?3:10};
  entity.data.ceresWorkfleetActuation={tick,forward,lateral,yaw:angular,
    linearFraction:Math.min(1,Math.hypot(ax,az)/(entity.data.ceresWorkfleetRole==='breaker'?.5:8)),
    yawFraction:Math.min(1,Math.abs(angular)/(entity.data.ceresWorkfleetRole==='breaker'?.025:.6))};
}
export function ceresWorkfleetAtPose(entity,target,{position=.2,angle=.006,speed=.12,spin=.003}={}) {
  return Math.hypot(entity.pos.x-target.x,entity.pos.z-target.z)<=position
    && Math.abs(wrap((entity.rot||0)-target.rot))<=angle
    && Math.hypot(entity.vel?.x||0,entity.vel?.z||0)<=speed&&Math.abs(entity.angVel||0)<=spin;
}
export function ceresWorkfleetSocket(entity,role,id) {
  const p=role==='section'?C.existing.section.sockets[id]:C.assets[role]?.sockets[id];
  return p?ceresWorkfleetPoint({...entity.pos,rot:entity.rot||0},p):null;
}

import { ceresWorkfleetHardwareSpec } from '../data/ceresWorkfleetHardware.js';
import { ceresWorkfleetRoleForEntity } from '../data/ceresWorkfleetIdentity.js';
import { machineryPresentationPlace, machineryRequestedPresentation, markMachineryEffective, machineryHasEffectivePresentation } from '../core/machineryPresentation.js';
import { resolveCollisionProxyManifest } from '../data/collisionProxyManifests.js';
import { sweepCollisionProxyInto } from '../core/collisionProxySweep.js';
import { entityIndexVersion } from '../world/livingWorldViews.js';
import { hasPendingCeresWorkfleetAttachments } from '../combat/persistence.js';
import { CERES_WORKFLEET_SLIDE_SECONDS } from '../data/ceresWorkfleetArticulation.js';
import { SIM_DT } from '../core/sim.js';
import { requestActivityReclassify } from '../world/activityRuntime.js';
import { recordCeresWorkfleetActuation, clearCeresWorkfleetActuation } from '../core/ceresWorkfleetActuation.js';

const CONTROL = new WeakMap();
const ACTIVITY_PINS = new WeakMap();
const HEAD_CONTROL = new WeakMap();
const COLD_BODIES = new WeakMap();
const LIVE = new WeakMap();
const APPROACH_PROGRESS = new WeakMap();
const RECOVERY_LIVES = new WeakMap();
const RECOVERY_NATIVE = new WeakMap();
const REACQUIRE_LIVES=new WeakMap();
const RECOVERY_PHASES=['recover_turn','recover_approach','recover_seat','recover_return_turn','recover_return'];
const CANONICAL_BODIES = Object.fromEntries(['breaker','cradle','cutterHead'].map(role=>{
  const body=ceresWorkfleetHardwareSpec(role).physicsBody;
  for(const p of body.collisionProxyManifest.primitives)Object.freeze(p);
  Object.freeze(body.collisionProxyManifest.primitives);Object.freeze(body.collisionProxyManifest);
  return [role,body];
}));
const LEGACY_CRADLE_BODY=ceresWorkfleetHardwareSpec('cradle',{pos:{x:0,z:0},vel:{x:0,z:0},rot:0,angVel:0,itinerary:{ceresWorkfleet:{slide:0,cradleLayout:'open-v1'}}}).physicsBody;
const ROLES = ['breaker','cradle','cutterHead'];
const TERMINAL = new Set([...C.persistence.terminalStates,'recovery-interrupted']);
const registryOf = owner => owner.registry || owner._registry;
const attachmentsOf = owner => registryOf(owner)?.get('combat')?.kernel?.attachments;
const siteRecord = state => state.sites?.worldById?.[C.siteId];
const jobOf = state => state.npcJobs?.ceresWorkfleet;
const admitted = (entity,state) => !!entity && (ceresWorkfleetRoleForEntity(entity)
  ? machineryHasEffectivePresentation(entity,state) : entity.data?.worldSitePresentationAdmitted!==false) && physicsBodyNativeReady(entity);
function liveBodies(state) {
  const version=entityIndexVersion(state),prior=LIVE.get(state);
  if(prior&&prior.entities===state.entities&&prior.version===version&&prior.size===state.entities.size
    &&prior.contenders.every(({role,e})=>state.entities.get(e.id)===e&&e.alive!==false
      &&e.data?.worldRecordId===C.identities[role==='breaker'?'worker':role==='section'?'payload':role]
      &&(role==='section'?exactSection(e):ceresWorkfleetRoleForEntity(e)===role)))return prior.found;
  const found={},contenders=[];
  for(const e of state.entities.values()) {
    if(e.alive===false)continue;
    const role=ROLES.find(role=>e.data?.worldRecordId===C.identities[role==='breaker'?'worker':role])
      ||(e.data?.worldRecordId===C.identities.payload?'section':null);
    if(!role)continue;
    contenders.push({role,e});
    const valid=role==='section'?exactSection(e):ceresWorkfleetRoleForEntity(e)===role;
    found[role]=Object.hasOwn(found,role)||!valid?null:e;
  }
  LIVE.set(state,{entities:state.entities,version,size:state.entities.size,found,contenders});return found;
}
function exactSection(e) {
  return e?.type==='wreck'&&e.data?.worldRecordId===C.identities.payload
    &&e.data.worldSiteId===C.siteId&&e.data.worldSitePayloadId==='long_plate'
    &&e.data.worldSiteStructural===true&&e.data.persistenceOwner==='asteroidSites'&&e.mass===C.existing.section.mass;
}
function playerCustody(state,e) {return !!e&&(e.id===state.playerId||e.data?.playerOwned===true||e.playerOwned===true);}
function controlled(state,e) { return playerCustody(state,e)||e?.data?.controlLease||e?.data?.disabled===true; }
function healthy(state,e) { const role=ceresWorkfleetRoleForEntity(e);return role&&state.entities.get(e.id)===e&&e.alive!==false&&e.hull>0
  &&e.data.combatProfileId===`combat_profile_ceres_${role==='cutterHead'?'cutter_head':role}`
  &&e.data?.persistenceOwner==='worldRecords'&&!controlled(state,e)&&admitted(e,state); }
function foreignAssemblyAttachment(state,job,breaker,head,section) {
  const rows=state.combat?.attachments?.byId;
  for(const id in rows) {
    const line=rows[id];
    if(line.state!=='active'||id===job.mountId||id===job.towId||id===job.receiverId)continue;
    if(line.ownerId===breaker.id||line.targetId===breaker.id||line.ownerId===head.id||line.targetId===head.id
      ||line.ownerId===section.id||line.targetId===section.id)return true;
  }
  return false;
}
function mountedPose(breaker) { return ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.headMountedPose); }
function sectionLoadPose(breaker) { return ceresWorkfleetPose({...breaker.pos,rot:breaker.rot},C.assets.breaker.loadPose); }
function currentLine(service,id,a,b) {
  const line=id&&service?.get(id);
  return line?.state==='active'&&line.ownerId===a?.id&&line.targetId===b?.id?line:null;
}
function requiredControlCouplings(state,job,breaker,head,section){
  const rows=state.combat?.attachments?.byId;
  const valid=(id,a,b)=>{const line=id&&rows?.[id];return !!a&&!!b&&!!line&&line.state==='active'&&line.ownerId===a?.id&&line.targetId===b?.id
    &&line.ownerGeneration===a.occupantGeneration&&line.targetGeneration===b.occupantGeneration;};
  const working=['extract','seat','loaded','receiver','unshoe',...RECOVERY_PHASES].includes(job.phase);
  if(working&&!valid(job.towId,breaker,section))return false;
  if((working||['reacquire','withdraw','pads','secured'].includes(job.phase))&&!valid(job.mountId,head,breaker))return false;
  if(['unshoe','withdraw','pads','secured'].includes(job.phase)){
    const cradle=liveBodies(state).cradle;if(!valid(job.receiverId,cradle,section))return false;
  }
  return true;
}
function recoveryMotionClear(native,state,b,target,options,phase,headTarget=null){
  const {breaker,section}=b;
  const dx=target.x-breaker.pos.x,dz=target.z-breaker.pos.z,d=Math.hypot(dx,dz),speed=Math.hypot(breaker.vel.x,breaker.vel.z);
  const reach=Math.max(.1,speed*speed/(2*options.accel)+speed*SIM_DT+.5),t=Math.min(1,reach/(d||1));
  const a=wrap(target.rot-breaker.rot),angleReach=(breaker.angVel||0)**2/(2*(options.angularAccel||.025))+Math.abs(breaker.angVel||0)*SIM_DT+.006;
  const ahead={x:breaker.pos.x+dx*t,z:breaker.pos.z+dz*t,rot:breaker.rot+Math.sign(a)*Math.min(Math.abs(a),angleReach)};
  const loaded=phase.startsWith('recover_return');
  if(phase==='reacquire'&&speed>.001){
    const coast={x:breaker.pos.x+breaker.vel.x/speed*reach,z:breaker.pos.z+breaker.vel.z/speed*reach,
      rot:breaker.rot+Math.sign(breaker.angVel||0)*angleReach};
    const stopping=ceresWorkfleetRecoveryClear(native,state,b,{...breaker.pos,rot:breaker.rot},coast);
    if(!stopping.ok)return stopping;
  }
  const clearance=ceresWorkfleetRecoveryClear(native,state,b,{...breaker.pos,rot:breaker.rot},ahead,{loaded,ignoreSection:phase==='recover_seat',headTarget});
  if(!clearance.ok)return clearance;
  return phase==='recover_seat'?ceresWorkfleetRecoveryClear(native,state,b,{...section.pos,rot:section.rot},sectionLoadPose(breaker),{sectionOnly:true}):clearance;
}
function recoveryCommandClear(state,job,target,options,headReturnPoint=null){
  if((job.phase==='head_retract'||job.phase==='tow_attach'&&!job.mountId)&&headReturnPoint){
    const native=RECOVERY_NATIVE.get(job),b=liveBodies(state);
    if(!native||!b.breaker||!b.cutterHead||!b.section||!finitePose(target)||!options)return false;
    return options.speed===0||recoveryMotionClear(native,state,b,target,options,'head-return',headReturnPoint).ok;
  }
  if(job.phase==='reacquire'){
    const b=liveBodies(state),native=RECOVERY_NATIVE.get(job),p=restoreCeresWorkfleetReacquire(job.reacquire);
    if(!native||!b.breaker||!b.cutterHead||!b.section||!finitePose(target)||!options||options.accel!==CERES_REACQUIRE_LIMITS.accel)return false;
    if(!ceresWorkfleetAtPose(b.cutterHead,mountedPose(b.breaker),{position:1,angle:.04,speed:12,spin:.1}))return options.speed===0;
    if(options.speed===0)return true; // bounded braking, never an approach to an unresolved target
    return !!p&&state.tick<=p.deadlineTick&&recoveryMotionClear(native,state,b,target,options,'reacquire').ok;
  }
  if(!RECOVERY_PHASES.includes(job.phase))return true;
  const native=RECOVERY_NATIVE.get(job),p=restoreCeresWorkfleetRecovery(job.recovery),b=liveBodies(state);
  if(!native||!p||state.tick<p.startedTick||state.tick>p.deadlineTick||!b.breaker||!b.cutterHead||!b.section)return false;
  if(!ceresWorkfleetAtPose(b.cutterHead,mountedPose(b.breaker),{position:1,angle:.04,speed:12,spin:.1}))return false;
  if(job.phase.startsWith('recover_return')){const held=sectionLoadPose(b.breaker);
    if(Math.hypot(b.section.pos.x-held.x,b.section.pos.z-held.z)>1||Math.abs(wrap(b.section.rot-held.rot))>.006)return false;
  }
  if(!finitePose(target)||!options||!(options.accel>0)||options.accel>.5)return false;
  return recoveryMotionClear(native,state,b,target,options,job.phase).ok;
}
function hasForeignAttachment(service,e,job) {
  return (service?.listForEntity(e.id)||[]).some(a=>a.state==='active'
    &&![job.mountId,job.towId,job.receiverId].includes(a.id));
}
function finitePose(p) {return p&&[p.x,p.z,p.rot].every(Number.isFinite);}
function stop(owner,job,phase,reason=phase) {
  job.phase=phase;job.reason=reason;job.updatedTick=owner.state.tick;
  const b=liveBodies(owner.state);
  for(const role of ROLES)if(b[role]) {CONTROL.delete(b[role]);HEAD_CONTROL.delete(b[role]);b[role].data.ceresWorkfleetSlideDisabled=true;publishCeresWorkfleetActuation(b[role],null,owner.state.tick);}
  if(phase==='player-retained') {
    const service=attachmentsOf(owner);
    const sectionClaimed=b.section&&(controlled(owner.state,b.section)||hasForeignAttachment(service,b.section,job));
    if(sectionClaimed) {
    for(const [key,role] of [['towId','breaker'],['receiverId','cradle']])if(job[key]&&b[role]) {
      const line=service?.get(job[key]);if(line?.state==='active'&&line.ownerId===b[role].id)service.cut(line.id,b[role].id,phase==='player-retained'?'ceres_yield_player':'ceres_yield_custody');
    }
    for(const role of ['breaker','cradle'])if(b[role]){b[role].data.ceresWorkfleetSlideDisabled=false;b[role].data.ceresWorkfleetSlideTarget=0;}
    registryOf(owner)?.get('asteroidSites')?.releaseCeresWorkfleetRetention?.(job.id);
    }
    if(b.cutterHead&&(controlled(owner.state,b.cutterHead)||hasForeignAttachment(service,b.cutterHead,job))) {
      const line=job.mountId&&service?.get(job.mountId);if(line?.state==='active'&&line.ownerId===b.cutterHead.id)service.cut(line.id,b.cutterHead.id,'ceres_yield_head');
    }
  }
  syncCeresWorkfleetActivity(owner);captureCeresWorkfleetHardware(owner);
  owner.bus?.emit('ceresWorkfleet:interrupted',{jobId:job.id,phase,reason,sectionWorldRecordId:C.identities.payload});
}
function pauseForForeignCustody(owner,job,b,reason='foreign-custody') {
  job.blockedReason=reason;job.updatedTick=owner.state.tick;
  for(const role of ROLES)if(b[role]) {
    CONTROL.delete(b[role]);HEAD_CONTROL.delete(b[role]);b[role].data.ceresWorkfleetSlideDisabled=true;
    publishCeresWorkfleetActuation(b[role],null,owner.state.tick);
  }
  if(b.breaker)authorizeCeresBreakerControl(b.breaker,owner.state,job,{...b.breaker.pos,rot:b.breaker.rot},
    {speed:0,accel:0,angularSpeed:0,angularAccel:0});
  captureCeresWorkfleetHardware(owner);
}
function onSegment(e,a,b,tolerance=1) {
  const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((e.pos.x-a.x)*dx+(e.pos.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(e.pos.x-a.x-t*dx,e.pos.z-a.z-t*dz)<=tolerance;
}
/** A transient snare may release; only measured geometry inside the authored route can resume. */
export function ceresWorkfleetCanResume(job,b) {
  const {breaker,section,cutterHead:head}=b;
  if(!breaker||!section||!head||!ceresWorkfleetAtPose(head,mountedPose(breaker),{position:1,angle:.04,speed:12,spin:.1})
    &&!['head_out','head_cut','head_retract'].includes(job.phase))return false;
  const work=ceresWorkfleetWorldPose(C.route.breakerWorkPose),extracted=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);
  if(job.phase==='reacquire')return !!planCeresWorkfleetReacquire(b,job.updatedTick).plan;
  if(['head_dock','head_out','head_cut','head_retract','tow_attach'].includes(job.phase))return ceresWorkfleetAtPose(breaker,work,{position:1,angle:.006,speed:3,spin:.03})
    &&ceresWorkfleetAtPose(section,ceresWorkfleetWorldPose(C.existing.section.mountedPose),{position:1,angle:.006,speed:3,spin:.03});
  if(RECOVERY_PHASES.includes(job.phase)){
    const p=restoreCeresWorkfleetRecovery(job.recovery);if(!p)return false;
    const start=job.phase==='recover_turn'?p.start:job.phase==='recover_approach'?p.turn:job.phase==='recover_seat'?p.stage:p.returnStart;
    const end=job.phase==='recover_turn'?p.turn:job.phase==='recover_approach'||job.phase==='recover_seat'?p.stage:job.phase==='recover_return_turn'?{...p.returnStart,rot:p.returnStage.rot}:p.returnStage;
    return !!start&&onSegment(breaker,start,end,job.phase==='recover_seat'?8:1)&&Math.hypot(breaker.vel.x,breaker.vel.z)<=1.5
      &&(job.phase.startsWith('recover_return')?ceresWorkfleetAtPose(section,sectionLoadPose(breaker),{position:1,angle:.006,speed:.5,spin:.03}):Math.hypot(section.vel.x,section.vel.z)<=2);
  }
  if(['extract','seat'].includes(job.phase))return onSegment(breaker,work,extracted)
    &&onSegment(section,ceresWorkfleetWorldPose(C.existing.section.mountedPose),ceresWorkfleetWorldPose(C.route.seating.sectionTo))
    &&Math.abs(wrap(breaker.rot-work.rot))<=.006&&Math.abs(wrap(section.rot))<=.006
    &&Math.hypot(breaker.vel.x,breaker.vel.z)<=3&&Math.hypot(section.vel.x,section.vel.z)<=3;
  if(job.phase==='loaded') {
    const leg=C.route.loadedLegs[job.index];if(!leg)return false;
    const a=ceresWorkfleetWorldPose(leg.from),z=ceresWorkfleetWorldPose(leg.to);
    return onSegment(breaker,a,z)&&ceresWorkfleetAtPose(section,sectionLoadPose(breaker),{position:2,angle:.04,speed:3,spin:.1})
      &&(leg.kind==='rotate'||Math.abs(wrap(breaker.rot-z.rot))<=.006);
  }
  const receiver=ceresWorkfleetWorldPose(C.route.receiverPose),withdraw=ceresWorkfleetWorldPose(C.route.carrierWithdrawalTo);
  return ceresWorkfleetAtPose(section,receiver,{position:2,angle:.04,speed:.5,spin:.03})
    &&onSegment(breaker,ceresWorkfleetWorldPose(C.route.loadedLegs.at(-1).to),withdraw)
    &&Math.abs(wrap(breaker.rot-withdraw.rot))<=.006&&Math.hypot(breaker.vel.x,breaker.vel.z)<=3;
}
function change(job,phase,state) {job.phase=phase;job.phaseTick=state.tick;job.updatedTick=state.tick;job.blockedReason=null;}

function clearActivityPins(state) {
  const bag=ACTIVITY_PINS.get(state);if(!bag)return;
  for(const {e} of bag.leases.values())if(e.data?.jobId===CERES_WORKFLEET_JOB_ID){delete e.data.jobId;requestActivityReclassify(state,e);}
  ACTIVITY_PINS.delete(state);
}
/** Existing activity fact, leased to three exact live bodies; never serialized as a durable job pin. */
export function syncCeresWorkfleetActivity(owner) {
  const state=owner.state,job=jobOf(state),b=liveBodies(state),service=attachmentsOf(owner);
  const valid=state.mode==='flight'&&state.world?.currentSectorId===C.sectorId&&siteRecord(state)?.completedOperations?.brace_long_plate
    &&job?.id===CERES_WORKFLEET_JOB_ID&&job.worker===C.identities.worker&&job.head===C.identities.cutterHead
    &&job.cradle===C.identities.cradle&&job.section===C.identities.payload&&!TERMINAL.has(job.phase)&&exactSection(b.section)
    &&b.section.alive!==false&&b.section.hull>0&&!controlled(state,b.section)
    &&ROLES.every(role=>{const e=b[role];return e&&e.alive!==false&&e.hull>0&&Number.isSafeInteger(e.occupantGeneration)
      &&e.data.persistenceOwner==='worldRecords'&&ceresWorkfleetRoleForEntity(e)===role;})
    &&!ROLES.some(role=>{const r=state.world.records?.byId?.[C.identities[role==='breaker'?'worker':role]];
      return r?.playerOwned||r?.alive===false||['defeated','destroyed'].includes(r?.outcome)||controlled(state,b[role]);});
  if(!valid){clearActivityPins(state);return;}
  let bag=ACTIVITY_PINS.get(state);
  if(bag?.job!==job){clearActivityPins(state);bag={job,leases:new Map(),ejected:new Set()};ACTIVITY_PINS.set(state,bag);}
  const released=siteRecord(state)?.completedOperations?.release_long_plate_clamp;
  const plate=b.section,localPlate=plate&&Math.hypot(plate.pos.x-C.sitePlacement.pos.x,plate.pos.z-C.sitePlacement.pos.z)<=CERES_RECOVERY_LIMITS.workRadius;
  const ownerLivesValid=ROLES.every(role=>{const prior=bag.leases.get(role),e=b[role];return !bag.ejected.has(role)&&(!prior||prior.e===e&&prior.life===e?.occupantGeneration);});
  const keepPlate=!!released&&localPlate&&ownerLivesValid&&['head_retract','tow_attach','reacquire'].includes(job.phase)
    &&!currentLine(service,job.towId,b.breaker,plate)&&Number.isSafeInteger(plate?.occupantGeneration);
  const oldPlate=bag.leases.get('section');
  if(oldPlate&&(!keepPlate||oldPlate.e!==plate||oldPlate.life!==plate?.occupantGeneration)){
    if(oldPlate.e.data?.jobId===job.id){delete oldPlate.e.data.jobId;requestActivityReclassify(state,oldPlate.e);}
    bag.leases.delete('section');if(oldPlate.e!==plate||oldPlate.life!==plate?.occupantGeneration)bag.ejected.add('section');
  }
  if(keepPlate&&!bag.ejected.has('section')&&!bag.leases.has('section')&&(!plate.data.jobId||plate.data.jobId===job.id)){
    plate.data.jobId=job.id;bag.leases.set('section',{e:plate,life:plate.occupantGeneration});requestActivityReclassify(state,plate);
  }
  for(const role of ROLES) {
    const e=b[role],prior=bag.leases.get(role);
    if(prior&&(prior.e!==e||prior.life!==e?.occupantGeneration||e?.alive===false||e?.hull<=0||e?.data?.jobId!==job.id)) {
      if(prior.e.data?.jobId===job.id){delete prior.e.data.jobId;requestActivityReclassify(state,prior.e);}
      bag.leases.delete(role);bag.ejected.add(role);
    }
    if(!e||bag.ejected.has(role)||!Number.isSafeInteger(e.occupantGeneration)||e.alive===false||e.hull<=0
      ||ceresWorkfleetRoleForEntity(e)!==role||e.data.persistenceOwner!=='worldRecords'||e.data.jobId&&e.data.jobId!==job.id)continue;
    // During a temporary snare, intact same-job couplings (or their typed Continue rows) retain residency.
    if(['foreign-custody','recovery-pose-outside-route'].includes(job.blockedReason)) {
      const pending=[job.mountId,job.towId,job.receiverId].some(id=>id&&hasPendingCeresWorkfleetAttachments(state,id));
      if(!pending&&['extract','seat','loaded','receiver','unshoe',...RECOVERY_PHASES].includes(job.phase)
        &&(!currentLine(service,job.mountId,b.cutterHead,b.breaker)||!currentLine(service,job.towId,b.breaker,b.section))) {
        clearActivityPins(state);return;
      }
    }
    if(!bag.leases.has(role)){e.data.jobId=job.id;bag.leases.set(role,{e,life:e.occupantGeneration});requestActivityReclassify(state,e);}
  }
}

/** One disposable flight sample. A serialized marker cannot grant flight authority. */
export function authorizeCeresBreakerControl(entity,state,job,target,options={}) {
  if(ceresWorkfleetRoleForEntity(entity)!=='breaker'||!Number.isSafeInteger(entity.occupantGeneration)||job!==jobOf(state)||!finitePose(target)
    ||controlled(state,entity)||!healthy(state,entity)||TERMINAL.has(job.phase)&&job.phase!=='secured')return false;
  const bodies=liveBodies(state),head=bodies.cutterHead,section=bodies.section;
  if(!healthy(state,head)||!exactSection(section)||controlled(state,section)||section.alive===false
    ||!Number.isSafeInteger(head.occupantGeneration)||!Number.isSafeInteger(section.occupantGeneration))return false;
  const input=entity.data.intent||(entity.data.intent={throttle:0,strafe:0,turn:0,boost:false,brake:false});
  CONTROL.set(entity,{state,scene:state.render?.scene,render:state.render,tick:state.tick,life:entity.occupantGeneration,
    job,phase:job.phase,input,head,headLife:head.occupantGeneration,section,sectionLife:section.occupantGeneration,
    target:{...target},options:{speed:bounded(options.speed,3,3),accel:bounded(options.accel,.5,.5),
      angularSpeed:bounded(options.angularSpeed,.035,.035),angularAccel:bounded(options.angularAccel,.025,.025)}});
  // The head's geometry guard certifies this exact jobs-issued carrier command,
  // not a target recomputed from a phase that may have advanced in the same call.
  const headRequest=HEAD_CONTROL.get(head),carrier=CONTROL.get(entity);
  if(headRequest?.state===state&&headRequest.job===job&&headRequest.tick===state.tick){
    carrier.headReturnPoint=headRequest.returnGuard?{...headRequest.target}:null;
    headRequest.carrierControl={target:{...carrier.target},options:{...carrier.options}};
  }
  return true;
}
export function consumeCeresBreakerControl(entity,state) {
  const r=CONTROL.get(entity);CONTROL.delete(entity);
  if(!r||r.state!==state||r.render!==state.render||r.scene!==state.render?.scene||state.render?.contextRecovery?.pending
    ||state.tick<r.tick||state.tick>r.tick+1||r.life!==entity.occupantGeneration
    ||jobOf(state)!==r.job||r.job.phase!==r.phase||entity.data.intent!==r.input||!healthy(state,entity)
    ||state.entities.get(r.head.id)!==r.head||r.head.occupantGeneration!==r.headLife||!healthy(state,r.head)
    ||state.entities.get(r.section.id)!==r.section||r.section.occupantGeneration!==r.sectionLife||!exactSection(r.section)
    ||r.section.alive===false||r.section.hull<=0||controlled(state,r.section)||r.head.hull<r.head.hullMax
    ||!requiredControlCouplings(state,r.job,entity,r.head,r.section)||!recoveryCommandClear(state,r.job,r.target,r.options,r.headReturnPoint)
    ||foreignAssemblyAttachment(state,r.job,entity,r.head,r.section)) {
    if(entity?._flightFrame?.driveId==='ceres_workfleet_service_thrusters'
      &&(r||entity.data.ceresWorkfleetActuation?.tick<state.tick))publishCeresWorkfleetActuation(entity,null,state.tick);
    return null;
  }
  const capabilities=state.combat?.entities?.[String(entity.id)]?.capabilities;
  if(capabilities?.drive===false||capabilities?.power===false){publishCeresWorkfleetActuation(entity,null,state.tick);return null;}
  const control=ceresWorkfleetThrust(entity,r.target,r.options);publishCeresWorkfleetActuation(entity,control,state.tick);return control;
}
export function clearCeresWorkfleetControls(state) {
  clearActivityPins(state);
  for(const e of state?.entities?.values()||[])if(ceresWorkfleetRoleForEntity(e)){CONTROL.delete(e);HEAD_CONTROL.delete(e);publishCeresWorkfleetActuation(e,null,state.tick);}
}

/** The detached head consumes one jobs-owned request at the existing pre-physics seam. */
export function consumeCeresHeadControl(entity,state,owner) {
  const r=HEAD_CONTROL.get(entity);HEAD_CONTROL.delete(entity);
  if(!r&&entity.data?.ceresWorkfleetActuation?.tick===state.tick)return null;
  const job=jobOf(state),b=liveBodies(state);
  if(!r||r.state!==state||r.render!==state.render||r.scene!==state.render?.scene||state.mode!=='flight'
    ||state.tick<r.tick||state.tick>r.tick+1||r.life!==entity.occupantGeneration||r.body!==entity.physicsBody
    ||r.job!==job||r.phase!==job.phase||TERMINAL.has(job.phase)&&job.phase!=='secured'
    ||b.cutterHead!==entity||b.breaker!==r.breaker||r.breakerLife!==r.breaker.occupantGeneration||!healthy(state,r.breaker)
    ||b.section!==r.section||r.sectionLife!==r.section.occupantGeneration
    ||!healthy(state,entity)||entity.hull<entity.hullMax||!exactSection(r.section)||r.section.alive===false
    ||controlled(state,r.section)||!requiredControlCouplings(state,job,r.breaker,entity,r.section)||!recoveryCommandClear(state,job,r.carrierControl?.target,r.carrierControl?.options,r.returnGuard?r.target:null)||foreignAssemblyAttachment(state,job,r.breaker,entity,r.section)||hasForeignAttachment(attachmentsOf(owner),r.section,job)||hasForeignAttachment(attachmentsOf(owner),entity,job)) {
    publishCeresWorkfleetActuation(entity,null,state.tick);return null;
  }
  if(r.returnGuard==='advance'&&!ceresWorkfleetRecoveryClear(RECOVERY_NATIVE.get(job),state,b,{...entity.pos,rot:entity.rot},r.target,{headOnly:true}).ok){
    publishCeresWorkfleetActuation(entity,null,state.tick);return null;
  }
  const capabilities=state.combat?.entities?.[String(entity.id)]?.capabilities;
  if(capabilities?.drive===false||capabilities?.power===false){publishCeresWorkfleetActuation(entity,null,state.tick);return null;}
  return r.control;
}

/** Traffic's exact producer. Existing world records, including tombstones, always outrank spawn. */
export function syncCeresWorkfleetHardware(owner) {
  const state=owner.state;
  if(state.world?.currentSectorId!==C.sectorId||!siteRecord(state)?.completedOperations?.brace_long_plate)return false;
  const world=registryOf(owner)?.get('world');
  if(!world?.upsertWorldRecord)return false;
  const bodies=liveBodies(state);
  for(const role of ROLES) {
    const id=C.identities[role==='breaker'?'worker':role],record=state.world.records?.byId?.[id];
    if(bodies[role]===null||record&&!bodies[role])continue;
    let e=bodies[role];
    if(!e) {
      const spec=ceresWorkfleetHardwareSpec(role);
      if(state.render?.scene){spec.collides=false;spec.physicsBody=false;}
      e=owner.helpers.spawnEntity(spec);
      if(!e)continue;
      world.upsertWorldRecord(e);
    }
    reconcileCeresWorkfleetEntity(e,state,owner);
    e.data.itinerary.ceresWorkfleet.slide=e.data.ceresWorkfleetSlide;
    if(state.tick%60===0)world.upsertWorldRecord(e);
  }
  syncCeresWorkfleetActivity(owner);return true;
}
function reconcileCeresWorkfleetEntity(e,state,owner) {
  const role=ceresWorkfleetRoleForEntity(e);if(!role||e.alive===false)return;
  let selected=true;
  if(role==='cradle'){
    const outcome=admitCeresCradleLayout(state,registryOf(owner)?.get('physics')?._sg02,e,CANONICAL_BODIES.cradle);
    selected=outcome.status!=='unselected';
    if(outcome.status==='upgraded')registryOf(owner)?.get('world')?.upsertWorldRecord?.(e);
  }
  const place=selected?machineryPresentationPlace(e,state):null,ready=place===machineryRequestedPresentation(e);
  if(!ready) {
    if(e.physicsBody)COLD_BODIES.set(e,{life:e.occupantGeneration,body:e.physicsBody});
    e.collides=false;e.physicsBody=false;CONTROL.delete(e);publishCeresWorkfleetActuation(e,null,state.tick);
    markMachineryEffective(e,state,null);return;
  }
  if(!e.physicsBody) {
    const prior=COLD_BODIES.get(e);
    e.physicsBody=prior?.life===e.occupantGeneration?prior.body:ceresWorkfleetHardwareSpec(role).physicsBody;
    COLD_BODIES.delete(e);
  }
  const expected=role==='cradle'&&ceresWorkfleetCradleLayout(e)==='open-v1'?LEGACY_CRADLE_BODY:CANONICAL_BODIES[role],body=e.physicsBody,proxy=body?.collisionProxyManifest;
  if(e.mass!==expected.mass||e.radius!==expected.radius||body.mass!==expected.mass||body.radius!==expected.radius
    ||body.inertiaY!==expected.inertiaY||body.dynamic!==expected.dynamic||body.material!=='wreck'
    ||proxy!==expected.collisionProxyManifest) {
    e.mass=expected.mass;e.radius=expected.radius;e.physicsBody={...expected,revision:(body?.revision||0)+1};
  }
  e.collides=true;ensurePhysicsBodySpec(e);
  markMachineryEffective(e,state,place);
}
export function reconcileCeresWorkfleetPresentation(owner) {
  syncCeresWorkfleetActivity(owner);
  const state=owner.state,bodies=liveBodies(state);
  for(const {role,e} of LIVE.get(state)?.contenders||[]) {
    if(role==='section')continue;
    if(bodies[role]===e)reconcileCeresWorkfleetEntity(e,state,owner);
    else {if(e.physicsBody)COLD_BODIES.set(e,{life:e.occupantGeneration,body:e.physicsBody});e.collides=false;e.physicsBody=false;CONTROL.delete(e);markMachineryEffective(e,state,null);}
  }
  if(bodies.cutterHead) {
    const control=consumeCeresHeadControl(bodies.cutterHead,state,owner);
    if(control){writePhysicsControl(bodies.cutterHead,control);publishCeresWorkfleetActuation(bodies.cutterHead,control,state.tick,state);}
  }
}
function stampCeresWorkfleetCustody(owner,e) {
  const state=owner.state,job=jobOf(state),b=liveBodies(state),service=attachmentsOf(owner),role=ceresWorkfleetRoleForEntity(e);
  const valid=job?.id===CERES_WORKFLEET_JOB_ID&&service&&!controlled(state,e);
  const active=valid&&(!TERMINAL.has(job.phase)||job.phase==='secured')&&b.breaker&&b.cutterHead&&b.cradle&&exactSection(b.section)
    &&![b.breaker,b.cutterHead,b.section].some(body=>controlled(state,body)||hasForeignAttachment(service,body,job));
  const mount=valid&&currentLine(service,job.mountId,b.cutterHead,b.breaker);
  const tow=valid&&currentLine(service,job.towId,b.breaker,b.section);
  const receiver=valid&&currentLine(service,job.receiverId,b.cradle,b.section);
  const joint=role==='cutterHead'?mount:role==='breaker'?(tow||mount):receiver;
  e.data.itinerary.ceresWorkfleet.custody=active||joint
    ?{jobId:job.id,phase:active?job.phase:'paused',attachmentId:joint?.id||null,
      worker:C.identities.worker,head:C.identities.cutterHead,cradle:C.identities.cradle,section:C.identities.payload,active:true}:null;
}
export function captureCeresWorkfleetHardware(owner) {
  const world=registryOf(owner)?.get('world');if(!world?.upsertWorldRecord)return;
  for(const e of owner.state.entities.values())if(ceresWorkfleetRoleForEntity(e)) {
    e.data.itinerary.ceresWorkfleet.slide=e.data.ceresWorkfleetSlide;stampCeresWorkfleetCustody(owner,e);world.upsertWorldRecord(e);
  }
}
export function restoreCeresWorkfleetJob(raw) {
  if(!raw||raw.id!==CERES_WORKFLEET_JOB_ID||raw.worker!==C.identities.worker||raw.section!==C.identities.payload
    ||raw.head!==C.identities.cutterHead||raw.cradle!==C.identities.cradle||typeof raw.phase!=='string')return null;
  const phases=['head_dock','head_out','head_cut','head_retract','tow_attach','reacquire','extract','seat','loaded','receiver','unshoe','withdraw','pads',...RECOVERY_PHASES,...TERMINAL];
  if(!phases.includes(raw.phase))return null;
  const recovery=restoreCeresWorkfleetRecovery(raw.recovery);
  const invalidRecovery=RECOVERY_PHASES.includes(raw.phase)&&!recovery;
  const reacquire=restoreCeresWorkfleetReacquire(raw.reacquire),reacquireReturnBudget=restoreCeresWorkfleetReacquireReturnBudget(raw.reacquireReturnBudget);
  const invalidReturnBudget=raw.reacquireReturnBudget!=null&&!reacquireReturnBudget;
  return {reacquire,reacquireReturnBudget,reacquireRetryTick:Number.isSafeInteger(raw.reacquireRetryTick)?Math.max(0,raw.reacquireRetryTick):0,id:raw.id,worker:raw.worker,section:raw.section,head:raw.head,cradle:raw.cradle,phase:invalidRecovery||invalidReturnBudget?'recovery-interrupted':raw.phase,recovery,
    extractionMisalignedSince:Number.isSafeInteger(raw.extractionMisalignedSince)&&raw.extractionMisalignedSince>=0?raw.extractionMisalignedSince:null,
    phaseTick:Math.max(0,Math.trunc(raw.phaseTick||0)),updatedTick:Math.max(0,Math.trunc(raw.updatedTick||0)),
    index:clamp(Math.trunc(raw.index||0),raw.phase==='head_out'?1:0,raw.phase==='head_out'?3:raw.phase==='head_retract'?2:raw.phase==='loaded'?4:5),sequence:Math.max(0,Math.trunc(raw.sequence||0)),
    mountId:typeof raw.mountId==='string'?raw.mountId:null,towId:typeof raw.towId==='string'?raw.towId:null,
    receiverId:typeof raw.receiverId==='string'?raw.receiverId:null,reason:invalidRecovery?'recovery-plan-invalid':invalidReturnBudget?'reacquire-budget-invalid':typeof raw.reason==='string'?raw.reason:null,
    blockedReason:['foreign-custody','recovery-pose-outside-route'].includes(raw.blockedReason)?raw.blockedReason:null,
    restorePending:true};
}
function makeJob(state) {
  return {id:CERES_WORKFLEET_JOB_ID,worker:C.identities.worker,section:C.identities.payload,head:C.identities.cutterHead,
    cradle:C.identities.cradle,phase:'head_dock',phaseTick:state.tick,updatedTick:state.tick,index:0,sequence:0};
}
function bindLine(owner,job,key,defId,a,ar,as,b,br,bs) {
  const service=attachmentsOf(owner);if(!service)return null;
  const existing=currentLine(service,job[key],a,b);if(existing)return existing;
  const prior=job[key]&&service.get(job[key]);
  if(job[key]&&!existing)return null; // Saved custody is restored by combat; never mint a replacement for a lost line.
  if(hasForeignAttachment(service,a,job)||hasForeignAttachment(service,b,job)){job.blockedReason='foreign-custody';return null;}
  const result=service.create({defId,ownerId:a.id,targetId:b.id,
    sourceSocketId:as,targetSocketId:br==='section'?'socket_tether_anchor':bs,
    sourceWorld:ceresWorkfleetSocket(a,ar,as),targetWorld:ceresWorkfleetSocket(b,br,bs),controlMode:'ceres_workfleet'});
  if(result?.ok){job[key]=result.attachment.id;return result.attachment;}job.blockedReason=result?.reason||'attachment-unavailable';return null;
}
/** Asteroid-sites revalidates this immediately before granting any NPC seam work. */
export function validateCeresWorkfleetOperation(state,request) {
  const job=jobOf(state),b=liveBodies(state),{breaker,head}= {breaker:b.breaker,head:b.cutterHead};
  if(!job||job.phase!=='head_cut'||request.jobId!==job.id||request.workerId!==breaker?.id||request.headId!==head?.id
    ||request.sectionId!==b.section?.id||request.siteId!==C.siteId||!C.persistence.operationIds.includes(request.operationId))return false;
  if(Object.values(state.combat?.attachments?.byId||{}).some(a=>a.state==='active'&&[head?.id,b.section?.id].some(id=>id!=null&&(a.ownerId===id||a.targetId===id))))return false;
  if(!healthy(state,breaker)||!healthy(state,head)||head.data.combatProfileId!=='combat_profile_ceres_cutter_head'||head.hull<head.hullMax||!exactSection(b.section)
    ||!admitted(b.section,state)||b.section.hull<=0||controlled(state,b.section))return false;
  const work=ceresWorkfleetWorldPose(C.route.breakerWorkPose),target=ceresWorkfleetPose(work,C.route.headPosesInBreaker.at(-1));
  if(!ceresWorkfleetAtPose(head,target,{position:.4,angle:.02,speed:.2,spin:.02}))return false;
  const focus=ceresWorkfleetSocket(head,'cutterHead','SOCKET_Cut'),cut=ceresWorkfleetSocket(b.section,'section',C.route.targetCutSocket);
  if(Math.hypot(focus.x-cut.x,focus.z-cut.z)>3||Math.abs(wrap(head.rot-b.section.rot-Math.PI/2))>.02)return false;
  const emitter=ceresWorkfleetPoint({...head.pos,rot:head.rot},C.assets.cutterHead.cutFocus.emitter),hit={};
  for(const e of state.entities.values()) {
    if(e===head||e===b.section||e.alive===false||e.collides===false||!e.physicsBody||e.physicsBody.material==='massline_sensor')continue;
    const proxy=resolveCollisionProxyManifest(e);if(proxy&&sweepCollisionProxyInto(hit,e,proxy,emitter,cut,0))return false;
    if(!proxy&&e.radius>0){const dx=cut.x-emitter.x,dz=cut.z-emitter.z,t=clamp(((e.pos.x-emitter.x)*dx+(e.pos.z-emitter.z)*dz)/(dx*dx+dz*dz||1),0,1);
      if(Math.hypot(e.pos.x-emitter.x-t*dx,e.pos.z-emitter.z-t*dz)<=e.radius)return false;}
  }
  return true;
}
function sectionBoundsInBreaker(breaker,section) {
  if(![breaker.pos?.x,breaker.pos?.z,breaker.rot,section.pos?.x,section.pos?.z,section.rot].every(Number.isFinite))return null;
  const c=Math.cos(breaker.rot),sn=Math.sin(breaker.rot),dx=section.pos.x-breaker.pos.x,dz=section.pos.z-breaker.pos.z;
  const x=dx*c+dz*sn,z=-dx*sn+dz*c,angle=section.rot-breaker.rot,ca=Math.cos(angle),sa=Math.sin(angle);
  const bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for(const box of C.existing.section.boxes)for(const ax of [-1,1])for(const az of [-1,1]){
    const px=box.center.x+ax*box.size.x/2,pz=box.center.z+az*box.size.z/2;
    const localX=x+px*ca-pz*sa,localZ=z+px*sa+pz*ca;
    bounds.minX=Math.min(bounds.minX,localX);bounds.maxX=Math.max(bounds.maxX,localX);
    bounds.minZ=Math.min(bounds.minZ,localZ);bounds.maxZ=Math.max(bounds.maxZ,localZ);
  }
  return bounds;
}
// This is only a reason to leave the existing extraction controller alone. It does
// not admit seating: a plate already moving down the open mouth must not be sent on
// a second approach while the unchanged full entry/retention predicates are settling.
function sectionInLoadingCorridor(breaker,section){
  const b=sectionBoundsInBreaker(breaker,section),well=C.assets.breaker.clearVolumes.open[0];
  return !!b&&b.minX>=well.x[0]&&b.minZ>=well.z[0]&&b.maxZ<=well.z[1];
}
export function ceresWorkfleetSectionInOpenWell(breaker,section) {
  const b=sectionBoundsInBreaker(breaker,section),well=C.assets.breaker.clearVolumes.open[0];
  return !!b&&b.minX>=well.x[0]&&b.maxX<=well.x[1]&&b.minZ>=well.z[0]&&b.maxZ<=well.z[1];
}
export function ceresWorkfleetSeatAlignmentTarget(breaker,section) {return seatAlignmentAt(breaker,section,ceresWorkfleetWorldPose(C.route.extraction.breakerTo));}
function seatAlignmentAt(breaker,section,stage) {
  if(!ceresWorkfleetSectionInOpenWell(breaker,section)
    ||Math.hypot(section.vel.x-breaker.vel.x,section.vel.z-breaker.vel.z)>.5
    ||Math.abs((section.angVel||0)-(breaker.angVel||0))>.03)return null;
  const load=C.assets.breaker.loadPose,rot=wrap(section.rot-load.rot),c=Math.cos(rot),sn=Math.sin(rot);
  const target={x:section.pos.x-c*load.x+sn*load.z,z:section.pos.z-sn*load.x-c*load.z,rot};
  const well=C.assets.breaker.clearVolumes.open[0];
  const clearance=Math.min(well.x[1]-well.x[0]-C.existing.section.dimensions.z,
    well.z[1]-well.z[0]-C.existing.section.dimensions.x);
  return Math.hypot(target.x-stage.x,target.z-stage.z)<=clearance&&Math.abs(wrap(rot-stage.rot))<=.04?target:null;
}
export function ceresWorkfleetExtractionReady(breaker,section) {
  return extractionGeometryReady(breaker,section)&&Math.hypot(section.vel.x,section.vel.z)<=2&&Math.abs(section.angVel||0)<=.03;
}
function extractionGeometryReady(breaker,section) {
  const c=Math.cos(breaker.rot),sn=Math.sin(breaker.rot);let near=Infinity,left=Infinity,right=-Infinity;
  for(const box of C.existing.section.boxes)for(const dx of [-1,1])for(const dz of [-1,1]) {
    const p=ceresWorkfleetPoint({...section.pos,rot:section.rot},{x:box.center.x+dx*box.size.x/2,z:box.center.z+dz*box.size.z/2});
    const x=p.x-breaker.pos.x,z=p.z-breaker.pos.z;near=Math.min(near,x*c+z*sn);
    const lateral=-x*sn+z*c;left=Math.min(left,lateral);right=Math.max(right,lateral);
  }
  // Reeling may align a loose section, but its real projected outline must enter the open mouth.
  // The stricter seated-pose and actual shoe-contact gates remain unchanged.
  const well=C.assets.breaker.clearVolumes.open[0];
  return section.pos.z<C.sitePlacement.pos.z-210&&near>C.assets.breaker.bounds.max.x&&left>=well.z[0]&&right<=well.z[1];
}
/** Opening the carrier shoes can disturb cargo after receiver entry was accepted.
 * Both existing lines retain custody until the measured assembly settles; this is
 * a release gate only and never rewrites a body or changes the final retention bounds. */
export function ceresWorkfleetReceiverTransferReady(breaker,section) {
  return ceresWorkfleetRoleForEntity(breaker)==='breaker'&&exactSection(section)
    &&ceresWorkfleetAtPose(section,ceresWorkfleetWorldPose(C.route.receiverPose),{position:1,angle:.003,speed:.05,spin:.0005})
    // Nominal 193WU withdrawal at 3WU/s leaves less than 1WU of free lateral drift.
    &&Math.abs(section.vel.x)<=.01
    &&ceresWorkfleetAtPose(breaker,ceresWorkfleetWorldPose(C.route.loadedLegs.at(-1).to),{position:.5,angle:.003,speed:.05,spin:.0005});
}
export function ceresWorkfleetContactRetained(holder,section,state,role) {
  if(!exactSection(section)||!healthy(state,holder)||!admitted(section,state))return false;
  const target=role==='breaker'?sectionLoadPose(holder):{...holder.pos,rot:holder.rot||0};
  const pose=ceresWorkfleetAtPose(section,target,{position:role==='breaker'?1:2,angle:role==='breaker'?.006:.04,speed:.5,spin:.03});
  if(!pose)return false;
  if(holder.data.ceresWorkfleetSlide>=1)return true;
  if(holder.data.ceresWorkfleetSlideBlocked!==true
    ||![section.id,C.identities.payload].includes(holder.data.ceresWorkfleetSlideBlocker))return false;
  // A measured yaw/offset makes one pad meet the actual section before the numeric endpoint.
  // Require that exact live face contact: fraction alone never grants retention.
  const c=Math.cos(holder.rot||0),sn=Math.sin(holder.rot||0);let lo=Infinity,hi=-Infinity;
  for(const box of C.existing.section.boxes)for(const dx of [-1,1])for(const dz of [-1,1]) {
    const p=ceresWorkfleetPoint({...section.pos,rot:section.rot||0},{x:box.center.x+dx*box.size.x/2,z:box.center.z+dz*box.size.z/2});
    const x=role==='breaker'?-(p.x-holder.pos.x)*sn+(p.z-holder.pos.z)*c:(p.x-holder.pos.x)*c+(p.z-holder.pos.z)*sn;
    lo=Math.min(lo,x);hi=Math.max(hi,x);
  }
  const travel=role==='breaker'?6:36,inner=(role==='breaker'?40:70)-travel*holder.data.ceresWorkfleetSlide;
  const leftGap=lo+inner,rightGap=inner-hi,stroke=travel*SIM_DT/CERES_WORKFLEET_SLIDE_SECONDS;
  return Math.abs(Math.min(leftGap,rightGap))<=stroke+1e-6&&Math.max(leftGap,rightGap)<=(role==='breaker'?2.7:4);

}

/** Preserve the authored return corridor after a physical carrier displacement.
 * An off-axis head first clears the live bow, then aligns outside it. Ordinary
 * retraction keeps its original waypoints and native CCD owns every movement. */
export function ceresWorkfleetHeadReturnTarget(breaker,head,index) {
  const frame={...breaker.pos,rot:breaker.rot},authored=C.route.headPosesInBreaker[2-index];
  if(!authored)return null;
  const c=Math.cos(breaker.rot),sn=Math.sin(breaker.rot),dx=head.pos.x-breaker.pos.x,dz=head.pos.z-breaker.pos.z;
  const local={x:dx*c+dz*sn,z:-dx*sn+dz*c};
  if(index===0&&Math.abs(local.z)>.2) {
    const radius=Math.max(...C.assets.cutterHead.boxes.map(b=>Math.hypot(Math.abs(b.center.x)+b.size.x/2,Math.abs(b.center.z)+b.size.z/2)));
    const front=C.assets.breaker.bounds.max.x+radius,well=C.assets.breaker.clearVolumes.open[0];
    const outside=local.z<well.z[0]+radius||local.z>well.z[1]-radius;
    if(local.x>=front||outside) {
      const point={...C.route.headPosesInBreaker.at(-1),z:local.x<front?local.z:0};
      return {pose:ceresWorkfleetPose(frame,point),advance:false};
    }
  }
  return {pose:ceresWorkfleetPose(frame,authored),advance:true};
}

/** Called by npcJobsRuntime only; one phase machine, one named job and three hardware records. */
export function stepCeresWorkfleet(owner,dt) {
  const state=owner.state;if(state.mode!=='flight'||state.world?.currentSectorId!==C.sectorId||!(dt>0))return;
  const record=siteRecord(state);if(!record?.completedOperations?.brace_long_plate)return;
  state.npcJobs ||= {byId:{}};
  const job=state.npcJobs.ceresWorkfleet ||= makeJob(state),b=liveBodies(state);
  const {breaker,cradle,cutterHead:head,section}=b;
  if(TERMINAL.has(job.phase)&&job.phase!=='secured')return;
  if(record.payloads.long_plate.destroyed){stop(owner,job,'section-destroyed');return;}
  for(const [role,e] of [['breaker',breaker],['cutterHead',head],['cradle',cradle]]) {
    const worldRecord=state.world.records?.byId?.[C.identities[role==='breaker'?'worker':role]];
    if(worldRecord?.alive===false||['destroyed','defeated'].includes(worldRecord?.outcome)||e?.hull<=0){stop(owner,job,role==='cutterHead'?'head-disabled':'worker-disabled');return;}
  }
  if(ROLES.some(role=>state.world.records?.byId?.[C.identities[role==='breaker'?'worker':role]]?.playerOwned===true)
    ||[breaker,cradle,head,section].some(e=>playerCustody(state,e))){stop(owner,job,'player-retained');return;}
  for(const [role,e] of [['breaker',breaker],['cutterHead',head],['cradle',cradle],['section',section]])if(e?.data?.disabled===true||e?.data?.controlLease) {
    stop(owner,job,role==='cutterHead'?'head-disabled':'worker-disabled',e.data.disabled?'hardware-disabled':'control-override');return;
  }
  const returnBudget=restoreCeresWorkfleetReacquireReturnBudget(job.reacquireReturnBudget);
  if(job.phase==='reacquire'&&returnBudget&&(state.tick<returnBudget.startedTick||state.tick>returnBudget.deadlineTick)){
    stop(owner,job,'recovery-interrupted',state.tick<returnBudget.startedTick?'reacquire-return-clock-invalid':'reacquire-return-timeout');return;
  }
  // Retired hardware can fail presentation/native admission before the phase body
  // runs. End that exact recovery lifetime before any such residency early return.
  const reacquireLives=job.phase==='reacquire'&&REACQUIRE_LIVES.get(job);
  if(reacquireLives&&reacquireLives.some(({e,life})=>state.entities.get(e.id)!==e||e.occupantGeneration!==life)){
    stop(owner,job,'recovery-interrupted','reacquire-occupant-changed');return;
  }
  if([job.mountId,job.towId,job.receiverId].some(id=>id&&hasPendingCeresWorkfleetAttachments(state,id)))return;
  if(!breaker||!head||!cradle||!section)return; // Residency/restore owns missing nonterminal records.
  if(!exactSection(section)||section.hull<=0){stop(owner,job,'section-destroyed');return;}
  if(head.hull<head.hullMax){stop(owner,job,'head-disabled');return;}
  if([breaker,cradle,head].some(e=>!healthy(state,e))||!admitted(section,state))return;
  const service=attachmentsOf(owner);if(!service)return;
  if(['extract','seat','loaded','receiver','unshoe',...RECOVERY_PHASES].includes(job.phase)&&!currentLine(service,job.towId,breaker,section)) {
    stop(owner,job,'worker-disabled',`tow-coupling-${service.get(job.towId)?.breakReason||'missing'}`);return;
  }
  if(['reacquire','extract','seat','loaded','receiver','unshoe','withdraw','pads','secured',...RECOVERY_PHASES].includes(job.phase)&&!currentLine(service,job.mountId,head,breaker)) {
    stop(owner,job,'head-disabled',`head-coupling-${service.get(job.mountId)?.breakReason||'missing'}`);return;
  }
  const foreign=[breaker,cradle,section,head].flatMap(e=>service.listForEntity(e.id)||[]).filter(a=>a.state==='active'&&![job.mountId,job.towId,job.receiverId].includes(a.id));
  if(foreign.length) {
    const playerClaim=foreign.some(a=>playerCustody(state,state.entities.get(a.ownerId)));
    if(playerClaim)stop(owner,job,'player-retained');else pauseForForeignCustody(owner,job,b);return;
  }
  if(['foreign-custody','recovery-pose-outside-route'].includes(job.blockedReason)) {
    if(!ceresWorkfleetCanResume(job,b)){pauseForForeignCustody(owner,job,b,'recovery-pose-outside-route');return;}
    job.blockedReason=null;for(const role of ROLES)b[role].data.ceresWorkfleetSlideDisabled=false;
  }
  const work=ceresWorkfleetWorldPose(C.route.breakerWorkPose),extracted=ceresWorkfleetWorldPose(C.route.extraction.breakerTo);
  let target=work,options={speed:.5,accel:.1};
  const headOptions={speed:5,accel:8,angularSpeed:.3,angularAccel:.6};let pendingDockBlocked=false;
  if(job.phase==='tow_attach'&&job.mountId&&!currentLine(service,job.mountId,head,breaker)){
    stop(owner,job,'head-disabled',`head-coupling-${service.get(job.mountId)?.breakReason||'missing'}`);return;
  }
  if(!['head_out','head_cut','head_retract'].includes(job.phase)){
    let headTarget=mountedPose(breaker),headDrive={...headOptions,speed:10};
    if(job.phase==='tow_attach'&&!job.mountId){
      const native=registryOf(owner)?.get('physics')?._sg02;RECOVERY_NATIVE.set(job,native);
      const clear=ceresWorkfleetHeadClearPrefix(native,state,b,{...head.pos,rot:head.rot},headTarget);
      pendingDockBlocked=!clear.ok;headTarget=clear.ok?clear.pose:{...head.pos,rot:head.rot};
      headDrive={...headDrive,carrierVelocity:true,returnGuard:clear.ok?'advance':'hold'};
    }
    driveCeresWorkfleetBody(head,headTarget,headDrive,state);
  }
  if(job.phase==='head_dock') {
    if(!ceresWorkfleetAtPose(breaker,work,{position:.5,angle:.006,speed:.2,spin:.01})){}
    else if(ceresWorkfleetAtPose(head,mountedPose(breaker))&&bindLine(owner,job,'mountId','attachment_transport_clamp',head,'cutterHead','SOCKET_Mount',breaker,'breaker','SOCKET_Cutter_Dock')) {
      service.cut(job.mountId,head.id,'ceres_deploy');job.mountId=null;job.index=1;change(job,'head_out',state);
    }
  } else if(job.phase==='head_out'||job.phase==='head_retract') {
    const index=job.phase==='head_out'?job.index:2-job.index;
    const headInFrame={x:(head.pos.x-breaker.pos.x)*Math.cos(breaker.rot)+(head.pos.z-breaker.pos.z)*Math.sin(breaker.rot),
      z:-(head.pos.x-breaker.pos.x)*Math.sin(breaker.rot)+(head.pos.z-breaker.pos.z)*Math.cos(breaker.rot)};
    const inRig=job.index>0||headInFrame.x<=C.assets.breaker.bounds.max.x&&headInFrame.x>=C.assets.breaker.bounds.min.x&&Math.abs(headInFrame.z)<=C.assets.breaker.bounds.max.z;
    const carrierReturning=job.phase==='head_retract'&&!ceresWorkfleetAtPose(breaker,work);
    // The cut pose is outside the bow and belongs to the stationary source. Do not
    // drag the detached head across the released plate while its carrier recovers
    // from an external impact. Existing thrusters return the carrier physically.
    const returning=job.phase==='head_retract'?(carrierReturning&&!inRig
      ?{pose:ceresWorkfleetPose(work,C.route.headPosesInBreaker.at(-1)),advance:false}
      :ceresWorkfleetHeadReturnTarget(breaker,head,job.index)):null;
    let point=returning?.pose||ceresWorkfleetPose(work,C.route.headPosesInBreaker[index]);
    const waypoint={...point};let headBlocked=false,headDriveOptions=headOptions;
    if(carrierReturning)job.blockedReason='head-return-carrier-realigning';
    else if(job.blockedReason==='head-return-carrier-realigning')job.blockedReason=null;
    if(job.phase==='head_retract'&&inRig){
      const native=registryOf(owner)?.get('physics')?._sg02;RECOVERY_NATIVE.set(job,native);
      const route=ceresWorkfleetHeadClearPrefix(native,state,b,{...head.pos,rot:head.rot},point);
      if(route.ok)point=route.pose;
      if(!route.ok){headBlocked=true;point={...head.pos,rot:head.rot};job.blockedReason=`head-return-${route.reason}`;}
      headDriveOptions={...headOptions,returnGuard:headBlocked?'hold':'advance'};
      if(carrierReturning){
        headDriveOptions={...headDriveOptions,carrierVelocity:true};
        const clear=recoveryMotionClear(native,state,b,target,options,'head-return',point);
        if(!clear.ok){target={...breaker.pos,rot:breaker.rot};options={...options,speed:0};point={...head.pos,rot:head.rot};headBlocked=true;headDriveOptions={...headOptions,returnGuard:'hold'};job.blockedReason=`head-return-carrier-${clear.reason}`;}
      }
    }
    driveCeresWorkfleetBody(head,point,headDriveOptions,state);
    const distance=Math.hypot(head.pos.x-point.x,head.pos.z-point.z),key=`${job.phase}:${job.index}`;
    let progress=APPROACH_PROGRESS.get(job);
    if(!progress||progress.key!==key||state.tick<progress.tick){progress={key,distance,tick:state.tick};APPROACH_PROGRESS.set(job,progress);}
    if(distance<progress.distance-.05){progress.distance=distance;progress.tick=state.tick;if(!carrierReturning&&!headBlocked)job.blockedReason=null;}
    if(!carrierReturning&&state.tick-progress.tick>1200)job.blockedReason='head-approach-obstructed';
    const safeInterior=inRig&&!headBlocked&&headInsideCarrierBounds(breaker,head);
    const reached=returning&&safeInterior?ceresWorkfleetHeadReturnReady(breaker,head,waypoint,true):!carrierReturning&&ceresWorkfleetAtPose(head,waypoint);
    if(!headBlocked&&returning?.advance!==false&&reached) {
      job.index++;
      if(job.phase==='head_out'&&job.index>=C.route.headPosesInBreaker.length){job.index=0;change(job,'head_cut',state);}
      else if(job.phase==='head_retract'&&job.index>=3){change(job,'tow_attach',state);}
    }
  } else if(job.phase==='head_cut') {
    driveCeresWorkfleetBody(head,ceresWorkfleetPose(work,C.route.headPosesInBreaker.at(-1)),headOptions,state);
    const op=C.persistence.operationIds.find(id=>!record.completedOperations[id]);
    if(!op){job.index=0;change(job,'head_retract',state);}
    else {const result=registryOf(owner)?.get('asteroidSites')?.applyCeresWorkfleetOperation?.({siteId:C.siteId,operationId:op,
      jobId:job.id,workerId:breaker.id,headId:head.id,sectionId:section.id,amount:Math.min(dt,.1)*18,requestSequence:state.tick});
      job.blockedReason=result?.ok?null:result?.reason||'physical-cutter-not-ready';}

  } else if(job.phase==='tow_attach') {
    let mount=currentLine(service,job.mountId,head,breaker);
    if(!mount){
      const native=registryOf(owner)?.get('physics')?._sg02,at={...head.pos,rot:head.rot};
      const safe=headInsideCarrierBounds(breaker,head)&&ceresWorkfleetRecoveryClear(native,state,b,at,at,{headOnly:true}).ok;
      if(ceresWorkfleetHeadReturnReady(breaker,head,mountedPose(breaker),safe))
        mount=bindLine(owner,job,'mountId','attachment_transport_clamp',head,'cutterHead','SOCKET_Mount',breaker,'breaker','SOCKET_Cutter_Dock');
      else if(pendingDockBlocked&&headInsideCarrierBounds(breaker,head)){job.index=1;change(job,'head_retract',state);job.blockedReason='head-dock-reapproach';}
      else job.blockedReason='head-docking-settling';
    }
    if(mount&&record.completedOperations.release_long_plate_clamp&&section.physicsBody?.dynamic&&ceresWorkfleetAtPose(breaker,work)
      &&ceresWorkfleetAtPose(section,ceresWorkfleetWorldPose(C.existing.section.mountedPose),{position:1,angle:.006,speed:.2,spin:.01})) {
      if(bindLine(owner,job,'towId','tether_standard',breaker,'breaker','SOCKET_Tether_Massline',section,'section','SOCKET_Cut_A'))change(job,'extract',state);
    }else if(mount&&record.completedOperations.release_long_plate_clamp&&section.physicsBody?.dynamic){
      job.reacquire=null;job.reacquireReturnBudget=ceresWorkfleetReacquireReturnBudget(b,state.tick);job.reacquireRetryTick=state.tick;REACQUIRE_LIVES.set(job,[breaker,head,cradle,section].map(e=>({e,life:e.occupantGeneration})));change(job,'reacquire',state);
    }
  } else if(job.phase==='reacquire') {
    const native=registryOf(owner)?.get('physics')?._sg02;
    RECOVERY_NATIVE.set(job,native);
    job.reacquireReturnBudget ||= ceresWorkfleetReacquireReturnBudget(b,state.tick);
    const lives=REACQUIRE_LIVES.get(job);
    if(!lives)REACQUIRE_LIVES.set(job,[breaker,head,cradle,section].map(e=>({e,life:e.occupantGeneration})));
    // A refused route still receives ordinary bounded braking. No line is created,
    // no reel advances, and no target body is projected or remotely instantiated.
    target={...breaker.pos,rot:breaker.rot};options={...CERES_REACQUIRE_LIMITS,speed:0};
    const hold=reason=>{job.reacquire=null;job.reacquireRetryTick=state.tick+CERES_REACQUIRE_LIMITS.retryTicks;job.blockedReason=`reacquire-${reason}`;};
    if(!Number.isSafeInteger(job.reacquireRetryTick)||job.reacquireRetryTick>state.tick+CERES_REACQUIRE_LIMITS.retryTicks)job.reacquireRetryTick=state.tick+CERES_REACQUIRE_LIMITS.retryTicks;
    let p=restoreCeresWorkfleetReacquire(job.reacquire);
    if(p&&(state.tick<p.startedTick||state.tick>p.deadlineTick)){hold('reassess');p=null;}
    if(!p&&state.tick>=job.reacquireRetryTick){
      if(Math.hypot(breaker.vel.x,breaker.vel.z)>.12||Math.abs(breaker.angVel||0)>.003)hold('carrier-settling');
      else {
        const planned=planCeresWorkfleetReacquire(b,state.tick);
        if(!planned.plan)hold(planned.reason);
        else {
          p=planned.plan;if(job.reacquireReturnBudget)p.deadlineTick=Math.min(p.deadlineTick,job.reacquireReturnBudget.deadlineTick);
          const check=[ceresWorkfleetRecoveryClear(native,state,b,p.start,p.turn),ceresWorkfleetRecoveryClear(native,state,b,p.turn,p.stage)].find(c=>!c.ok);
          if(check){hold(check.reason);job.reacquireBlocker=check.blocker||null;p=null;}
          else {job.reacquire=p;job.blockedReason=null;job.reacquireBlocker=null;}
        }
      }
    }
    if(p&&!onSegment(breaker,p.leg==='turn'?p.start:p.turn,p.leg==='turn'?p.turn:p.stage,1)){hold('route-disturbed');p=null;}
    if(p&&!ceresWorkfleetAtPose(head,mountedPose(breaker),{position:1,angle:.04,speed:12,spin:.1})){hold('head-settling');p=null;}
    if(p){
      const stage=p.kind==='return-to-work'?work:ceresWorkfleetReacquireStage(section);
      if(Math.hypot(stage.x-p.stage.x,stage.z-p.stage.z)>1||Math.abs(wrap(stage.rot-p.stage.rot))>.006)hold('cargo-moved');
      else {
        const approach=p.leg==='turn'?p.turn:p.stage,limits={...CERES_REACQUIRE_LIMITS};
        const clear=recoveryMotionClear(native,state,b,approach,limits,'reacquire');
        if(!clear.ok){hold(clear.reason);job.reacquireBlocker=clear.blocker||null;}
        else {
          target=approach;options=limits;
          if(ceresWorkfleetAtPose(breaker,approach)){
            if(p.leg==='turn'){job.reacquire.leg='approach';}
            else if(p.kind==='return-to-work'){job.reacquire=null;job.reacquireRetryTick=state.tick;job.blockedReason=null;}
            else if(ceresWorkfleetAtPose(breaker,stage)&&Math.hypot(section.vel.x,section.vel.z)<=.2&&Math.abs(section.angVel||0)<=.01){
              if(bindLine(owner,job,'towId','tether_standard',breaker,'breaker','SOCKET_Tether_Massline',section,'section','SOCKET_Cut_A')){
                job.reacquire=null;job.reacquireReturnBudget=null;change(job,'extract',state);
              }
            }
          }
        }
      }
    }
  } else if(job.phase==='extract') {
    target=extracted;options={speed:CERES_WORKFLEET_PACE.extractSpeed,accel:.2};
    if(ceresWorkfleetAtPose(breaker,target,{position:1,angle:.006,speed:.12,spin:.003})) {
      if(ceresWorkfleetExtractionReady(breaker,section)){job.extractionMisalignedSince=null;change(job,'seat',state);}
      else if(extractionGeometryReady(breaker,section)||sectionInLoadingCorridor(breaker,section)){job.blockedReason='extraction-settling';job.extractionMisalignedSince=null;}
      else {
        job.blockedReason='extraction-staging-misaligned';
        if(job.extractionMisalignedSince==null||job.extractionMisalignedSince>state.tick)job.extractionMisalignedSince=state.tick;
        if(state.tick-job.extractionMisalignedSince>=CERES_RECOVERY_LIMITS.assessmentTicks){
          if(job.recovery){stop(owner,job,'recovery-interrupted','recovery-attempt-exhausted');return;}
          const planned=planCeresWorkfleetRecovery(b,state.tick),native=registryOf(owner)?.get('physics')?._sg02;
          if(!planned.plan){
            const turn=planned.turnCheck&&ceresWorkfleetRecoveryClear(native,state,b,planned.turnCheck.from,planned.turnCheck.to);
            stop(owner,job,'recovery-interrupted',turn&&!turn.ok?`recovery-${turn.reason}`:planned.reason);
            if(turn&&!turn.ok)job.recoveryBlocker=turn.blocker||null;return;
          }
          const p=planned.plan,load=ceresWorkfleetPose(p.stage,C.assets.breaker.loadPose),returnTurn={...p.stage,rot:p.returnStage.rot};
          const checks=[
            ceresWorkfleetRecoveryClear(native,state,b,p.start,p.turn),
            ceresWorkfleetRecoveryClear(native,state,b,p.turn,p.stage),
            ceresWorkfleetRecoveryClear(native,state,b,p.plate,load,{sectionOnly:true}),
            ceresWorkfleetRecoveryClear(native,state,b,p.stage,returnTurn,{loaded:true}),
            ceresWorkfleetRecoveryClear(native,state,b,returnTurn,p.returnStage,{loaded:true})];
          const failure=checks.find(c=>!c.ok);if(failure){stop(owner,job,'recovery-interrupted',`recovery-${failure.reason}`);job.recoveryBlocker=failure.blocker||null;return;}
          job.recovery=p;RECOVERY_NATIVE.set(job,native);RECOVERY_LIVES.set(job,[breaker,head,section].map(e=>({e,life:e.occupantGeneration})));
          change(job,'recover_turn',state);
        }
      }
    }else job.extractionMisalignedSince=null;
  } else if(RECOVERY_PHASES.includes(job.phase)) {
    const p=restoreCeresWorkfleetRecovery(job.recovery),native=registryOf(owner)?.get('physics')?._sg02;
    const lives=RECOVERY_LIVES.get(job);if(lives&&lives.some(({e,life})=>state.entities.get(e.id)!==e||e.occupantGeneration!==life)){
      stop(owner,job,'recovery-interrupted','recovery-occupant-changed');return;
    }
    if(!ceresWorkfleetAtPose(head,mountedPose(breaker),{position:1,angle:.04,speed:12,spin:.1})){stop(owner,job,'recovery-interrupted','recovery-head-tracking');return;}
    if(!p||state.tick<p.startedTick||state.tick>p.deadlineTick){stop(owner,job,'recovery-interrupted',p?'recovery-timeout':'recovery-plan-invalid');return;}
    if(job.phase.startsWith('recover_return')){
      const held=sectionLoadPose(breaker);
      if(Math.hypot(section.pos.x-held.x,section.pos.z-held.z)>1||Math.abs(wrap(section.rot-held.rot))>.006){
        stop(owner,job,'recovery-interrupted','recovery-load-tracking');return;
      }
    }
    RECOVERY_NATIVE.set(job,native);
    if(!lives)RECOVERY_LIVES.set(job,[breaker,head,section].map(e=>({e,life:e.occupantGeneration})));
    options=job.phase.startsWith('recover_return')?{speed:CERES_RECOVERY_LIMITS.returnSpeed,accel:CERES_RECOVERY_LIMITS.returnAccel,angularSpeed:.015,angularAccel:.01}:{speed:job.phase==='recover_seat'?.5:1,accel:.3};
    target=job.phase==='recover_turn'?p.turn:job.phase==='recover_approach'||job.phase==='recover_seat'?p.stage:
      job.phase==='recover_return_turn'?{...p.returnStart,rot:p.returnStage.rot}:p.returnStage;
    if(!finitePose(target)){stop(owner,job,'recovery-interrupted','recovery-plan-invalid');return;}
    if(job.phase==='recover_seat'&&currentLine(service,job.towId,breaker,section).restLength<=18){
      const alignment=seatAlignmentAt(breaker,section,p.stage);if(alignment)target=alignment;
    }
    const clearance=recoveryMotionClear(native,state,b,target,options,job.phase);
    if(!clearance.ok){stop(owner,job,'recovery-interrupted',`recovery-${clearance.reason}`);job.recoveryBlocker=clearance.blocker||null;return;}
    if(job.phase==='recover_seat'){
      const line=currentLine(service,job.towId,breaker,section);service.reel(line.id,-CERES_WORKFLEET_PACE.reelSpeed*dt,18);
      if(line.restLength<=18){const alignment=seatAlignmentAt(breaker,section,p.stage);if(alignment)target=alignment;else job.blockedReason='recovery-seating-clearance';}
      if(line.restLength<=18&&ceresWorkfleetAtPose(section,sectionLoadPose(breaker),{position:1,angle:.006,speed:.5,spin:.03}))breaker.data.ceresWorkfleetSlideTarget=1;
      if(line.restLength<=18&&ceresWorkfleetContactRetained(breaker,section,state,'breaker')){
        job.recovery.returnStart={...breaker.pos,rot:breaker.rot};change(job,'recover_return_turn',state);
      }
    }else if(ceresWorkfleetAtPose(breaker,target,{position:.5,angle:.003,speed:.12,spin:.003})){
      if(job.phase==='recover_turn')change(job,'recover_approach',state);
      else if(job.phase==='recover_approach'){
        if(!ceresWorkfleetExtractionReady(breaker,section)){stop(owner,job,'recovery-interrupted','recovery-mouth-misaligned');return;}
        change(job,'recover_seat',state);
      }else if(job.phase==='recover_return_turn')change(job,'recover_return',state);
      else if(job.phase==='recover_return'){
        if(ceresWorkfleetContactRetained(breaker,section,state,'breaker')){job.index=0;change(job,'loaded',state);}
        else job.blockedReason='recovery-return-settling';
      }
    }
  } else if(job.phase==='seat') {
    target=extracted;options={speed:.5,accel:.3};
    const line=currentLine(service,job.towId,breaker,section);
    if(!line){stop(owner,job,'worker-disabled',`tow-coupling-${service.get(job.towId)?.breakReason||'missing'}`);return;}
    service.reel(line.id,-CERES_WORKFLEET_PACE.reelSpeed*dt,18);
    if(line.restLength<=18) {
      const alignment=ceresWorkfleetSeatAlignmentTarget(breaker,section);
      if(alignment){target=alignment;job.blockedReason=null;}
      else job.blockedReason='seating-realignment-clearance';
    }
    if(line.restLength<=18&&ceresWorkfleetAtPose(section,sectionLoadPose(breaker),{position:1,angle:.006,speed:.5,spin:.03}))breaker.data.ceresWorkfleetSlideTarget=1;
    if(line.restLength<=18&&ceresWorkfleetContactRetained(breaker,section,state,'breaker')){job.index=0;change(job,'loaded',state);}
  } else if(job.phase==='loaded') {
    breaker.data.ceresWorkfleetSlideTarget=1;
    const leg=C.route.loadedLegs[job.index];target=ceresWorkfleetWorldPose(leg.to);options={speed:leg.kind==='rotate'?1:3,accel:.5};
    if(ceresWorkfleetAtPose(breaker,target,{position:.5,angle:.003,speed:.5,spin:.01})) {
      job.index++;if(job.index>=C.route.loadedLegs.length)change(job,'receiver',state);
    }
  } else if(job.phase==='receiver'||job.phase==='unshoe') {
    breaker.data.ceresWorkfleetSlideTarget=job.phase==='unshoe'?0:1;
    target=ceresWorkfleetWorldPose(C.route.loadedLegs.at(-1).to);options={speed:1,accel:.5};
    if(job.phase==='receiver'&&ceresWorkfleetAtPose(section,ceresWorkfleetWorldPose(C.route.receiverPose),{position:2,angle:.04,speed:.5,spin:.03})) {
      if(bindLine(owner,job,'receiverId','attachment_transport_clamp',cradle,'cradle','SOCKET_Service_Head',section,'section','SOCKET_Cut_B')) {
        breaker.data.ceresWorkfleetSlideTarget=0;change(job,'unshoe',state);
      }
    } else if(job.phase==='unshoe'&&breaker.data.ceresWorkfleetSlide===0&&currentLine(service,job.receiverId,cradle,section)) {
      if(ceresWorkfleetReceiverTransferReady(breaker,section)) {
        service.cut(job.towId,breaker.id,'ceres_receiver_transfer');job.towId=null;change(job,'withdraw',state);
      } else job.blockedReason='receiver-transfer-settling';
    }
  } else if(['withdraw','pads','secured'].includes(job.phase)) {
    // Request retention while the carrier withdraws. The native continuous sweep
    // keeps each pad stopped against the actual carrier/section until it is clear;
    // waiting for the distant parking point leaves the free section drifting.
    cradle.data.ceresWorkfleetSlideTarget=1;
    target=ceresWorkfleetWorldPose(C.route.carrierWithdrawalTo);options={speed:job.phase==='withdraw'?3:1,accel:.5};
    if(job.phase==='withdraw'&&ceresWorkfleetAtPose(breaker,target,{position:.5,angle:.003,speed:.5,spin:.01})) {
      cradle.data.ceresWorkfleetSlideTarget=1;change(job,'pads',state);
    }
    if(job.phase==='pads'||job.phase==='secured')cradle.data.ceresWorkfleetSlideTarget=1;
    const receiverLine=currentLine(service,job.receiverId,cradle,section);
    const receiver=receiverLine?.ownerGeneration===cradle.occupantGeneration
      &&receiverLine?.targetGeneration===section.occupantGeneration?receiverLine:null;
    if(job.phase==='pads'&&receiver&&ceresWorkfleetCradleLayout(cradle)==='keepers-v2') {
      // A later field can move the plate inside the receiver cable's original slack
      // circle while the swept pads correctly stop at its offset face. Take up only
      // that geometric slack after the carrier clears. The existing finite-rate winch
      // and clamp spring recenter the original body; no pad/pose/contact is forced.
      const blocker=cradle.data.ceresWorkfleetSlideBlocked&&cradle.data.ceresWorkfleetSlideBlocker;
      if(blocker&&![section.id,C.identities.payload].includes(blocker))job.blockedReason='receiver-seating-obstructed';
      else {
        const sectionEnd=Math.max(...C.existing.section.boxes.map(box=>box.center.z+box.size.z/2));
        const seatedLength=C.assets.cradle.sockets.SOCKET_Service_Head.z-C.assets.cradle.well.z[1]
          +sectionEnd-C.existing.section.sockets.SOCKET_Cut_B.z;
        if(receiver.restLength>seatedLength)service.reel(receiver.id,-CERES_WORKFLEET_PACE.reelSpeed*dt,seatedLength);
        if(job.blockedReason==='receiver-seating-obstructed')job.blockedReason=null;
      }
    }
    if(job.phase==='pads'&&receiver&&ceresWorkfleetContactRetained(cradle,section,state,'cradle')) {
      const result=registryOf(owner)?.get('asteroidSites')?.retainCeresWorkfleetSection?.({jobId:job.id,workerId:breaker.id,headId:head.id,sectionId:section.id,cradleId:cradle.id});
      if(result?.ok)change(job,'secured',state);
    }
  }
  if(['extract','seat','loaded','receiver','unshoe',...RECOVERY_PHASES].includes(job.phase)&&!currentLine(service,job.towId,breaker,section)) {stop(owner,job,'worker-disabled',`tow-coupling-${service.get(job.towId)?.breakReason||'missing'}`);return;}
  if(['withdraw','pads','secured'].includes(job.phase)&&!currentLine(service,job.receiverId,cradle,section)) {job.blockedReason='receiver-coupling-missing';return;}
  const headRequest=HEAD_CONTROL.get(head);
  if(headRequest?.state===state&&headRequest.job===job&&headRequest.tick===state.tick)headRequest.phase=job.phase;
  authorizeCeresBreakerControl(breaker,state,job,target,options);
  job.updatedTick=state.tick;syncCeresWorkfleetActivity(owner);
  for(const e of [breaker,cradle,head]){e.data.itinerary.ceresWorkfleet.slide=e.data.ceresWorkfleetSlide;stampCeresWorkfleetCustody(owner,e);}
}
