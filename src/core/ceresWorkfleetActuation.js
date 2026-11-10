// Process-local proof of force actually consumed by the workfleet controller. Save
// diagnostics, velocity, intent, and a copied _flightFrame never authorize a nozzle.
import { ceresWorkfleetRoleForEntity } from '../data/ceresWorkfleetIdentity.js';
import { machineryHasEffectivePresentation } from './machineryPresentation.js';

const receipts = new WeakMap();
const cutWork = new WeakMap();
const publicReceipts = new WeakMap();
const finite = Number.isFinite;
function eligible(state, entity, role) {
  const capability = state?.combat?.entities?.[String(entity?.id)]?.capabilities;
  return (role === 'breaker' || role === 'cutterHead') && state?.entities?.get(entity.id) === entity
    && entity.alive !== false && entity.hull > 0 && Number.isSafeInteger(entity.occupantGeneration)
    && entity.id !== state.playerId && entity.playerOwned !== true && entity.data?.playerOwned !== true
    && !entity.data?.controlLease && entity.data?.disabled !== true
    && capability?.drive !== false && capability?.power !== false
    && state.render?.contextRecovery?.pending !== true
    && machineryHasEffectivePresentation(entity, state);
}
export function clearCeresWorkfleetActuation(entity) {
  if (entity) receipts.delete(entity);
}
export function recordCeresWorkfleetActuation(state, entity, control, limits, nativeControlReceipt = null) {
  const role = ceresWorkfleetRoleForEntity(entity);
  if (!control || !eligible(state, entity, role)
    || ![state.tick, state.simTime, control.force?.x, control.force?.z, control.torque?.y,
      limits?.accel, limits?.angularAccel, entity.mass, entity.physicsBody?.inertiaY].every(finite)
    || !(limits.accel > 0) || !(limits.angularAccel > 0)) {
    clearCeresWorkfleetActuation(entity); return null;
  }
  const c = Math.cos(entity.rot || 0), s = Math.sin(entity.rot || 0);
  const localFx = control.force.x * c + control.force.z * s;
  const localFz = -control.force.x * s + control.force.z * c;
  const torque = control.torque.y;
  if (![localFx, localFz, torque].every(finite)) { clearCeresWorkfleetActuation(entity); return null; }
  const render = state.render;
  const receipt = { state, entity, tick: state.tick, simTime: state.simTime,
    life: entity.occupantGeneration, role, worldRecordId: entity.data.worldRecordId,
    render, scene: render?.scene, nativeRenderer: render?.renderer,
    generation: render?.admissionRunGeneration, recoveryGeneration: render?.contextRecovery?.generation,
    mesh: entity.mesh, body: entity.physicsBody, bodyRevision: entity.physicsBody?.revision,
    localFx, localFz, torque, axisCos:c, axisSin:s, nativeControlReceipt, linearCapacity: limits.accel * entity.mass,
    torqueCapacity: limits.angularAccel * entity.physicsBody.inertiaY };
  receipts.set(entity, receipt);
  return receipt;
}
function readNativeActuation(entity, state) {
  const r = entity && receipts.get(entity), render = state?.render;
  if (!r || r.state !== state || r.entity !== entity || r.tick !== state.tick || r.simTime !== state.simTime
    || r.life !== entity.occupantGeneration || r.role !== ceresWorkfleetRoleForEntity(entity)
    || r.worldRecordId !== entity.data?.worldRecordId || r.render !== render || r.scene !== render?.scene
    || r.nativeRenderer !== render?.renderer || r.generation !== render?.admissionRunGeneration
    || r.recoveryGeneration !== render?.contextRecovery?.generation || r.mesh !== entity.mesh
    || r.body !== entity.physicsBody || r.bodyRevision !== entity.physicsBody?.revision
    || !eligible(state, entity, r.role)) {
    clearCeresWorkfleetActuation(entity); return null;
  }
  return r;
}

// Called at the real site-owner result, not from the saved entity tick stamp.
export function recordCeresWorkfleetCutWork(state, entity, result) {
  if (ceresWorkfleetRoleForEntity(entity)!=='cutterHead'||!eligible(state,entity,'cutterHead')
    ||state.npcJobs?.ceresWorkfleet?.phase!=='head_cut'||!Number.isSafeInteger(state.tick)
    ||!result?.ok||result.duplicate||!(result.moved>0)) {
    if(entity)cutWork.delete(entity);return false;
  }
  cutWork.set(entity,{state,life:entity.occupantGeneration,body:entity.physicsBody,
    revision:entity.physicsBody?.revision,tick:state.tick,simTime:state.simTime});
  return true;
}
function hasNativeCutWork(entity,state) {
  const r=cutWork.get(entity);
  return !!r&&r.state===state&&r.life===entity.occupantGeneration&&r.body===entity.physicsBody
    &&r.revision===entity.physicsBody?.revision&&r.tick===state.tick&&r.simTime===state.simTime
    &&state.npcJobs?.ceresWorkfleet?.phase==='head_cut'&&eligible(state,entity,'cutterHead');
}

// The only serializable producer is the worker's current, actually consumed
// control and accepted work; neither diagnostic fields nor intents are evidence.
export function readCeresWorkfleetPublicActuation(entity,state,worldGeneration,nativeOwner) {
  if(!Number.isSafeInteger(worldGeneration)||worldGeneration<0||!entity)return null;
  const role=ceresWorkfleetRoleForEntity(entity);
  if(!eligible(state,entity,role)||!Number.isSafeInteger(state.tick)||!finite(state.simTime))return null;
  const pending=readNativeActuation(entity,state),cutting=role==='cutterHead'&&hasNativeCutWork(entity,state);
  const rec=nativeOwner?.records?.get(entity.id),tail=nativeOwner?.completedOrchardTail?.();
  let force=null,fx=0,fz=0,torque=0;
  if(pending&&tail?.canonicalTick===state.tick&&tail.nativeTick===nativeOwner.tick
    &&nativeOwner._simTick===state.tick&&rec?.entity===entity&&rec._hadCommand===true
    &&pending.nativeControlReceipt&&rec._ownedControlReceipt===pending.nativeControlReceipt
    &&rec._ownedControlReceiptTick===nativeOwner.tick
    &&rec.body?.isEnabled?.()===true&&nativeOwner.world?.getRigidBody(rec.body.handle)===rec.body
    &&rec.revision===entity.physicsBody?.revision) {
    const x=rec.controlForce?.x,z=rec.controlForce?.z,y=rec.controlTorque?.y;
    if(finite(x)&&finite(z)&&finite(y)) {
      fx=x*pending.axisCos+z*pending.axisSin;fz=-x*pending.axisSin+z*pending.axisCos;
      const same=(a,b)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
      // A later writer replacing this command must not borrow its receipt. The
      // native yaw guard can legitimately reduce torque; display the bounded value.
      if(same(fx,pending.localFx)&&same(fz,pending.localFz)
        &&(same(y,pending.torque)||((y===0||Math.sign(y)===Math.sign(pending.torque))&&Math.abs(y)<=Math.abs(pending.torque)))) {
        force=pending;torque=y;
      }
    }
  }
  if(!force&&!cutting)return null;
  return {schemaVersion:1,entityId:entity.id,occupantGeneration:entity.occupantGeneration,
    worldRecordId:entity.data.worldRecordId,role,worldGeneration,tick:state.tick,simTime:state.simTime,
    localFx:force?fx:0,localFz:force?fz:0,torque:force?torque:0,
    linearCapacity:force?.linearCapacity??0,torqueCapacity:force?.torqueCapacity??0,cutWork:cutting};
}
function publicEligible(state,entity,role) {
  const capability=state?.combat?.entities?.[String(entity?.id)]?.capabilities;
  return (role==='breaker'||role==='cutterHead')&&state?.entities?.get(entity.id)===entity
    &&entity.alive!==false&&entity.hull>0&&Number.isSafeInteger(entity.occupantGeneration)
    &&entity.id!==state.playerId&&entity.playerOwned!==true&&entity.data?.playerOwned!==true
    &&!entity.data?.controlLease&&entity.data?.disabled!==true
    &&capability?.drive!==false&&capability?.power!==false;
}
// Called only by the accepted worker-message applier, never from entity.data.
export function bindCeresWorkfleetPublicActuation(entity,state,view,worldGeneration) {
  if(!entity)return false;
  if(view==null){publicReceipts.delete(entity);return false;}
  const role=ceresWorkfleetRoleForEntity(entity);
  if(!Number.isSafeInteger(worldGeneration)||worldGeneration<0||view.schemaVersion!==1
    ||view.worldGeneration!==worldGeneration||view.entityId!==entity.id
    ||view.occupantGeneration!==entity.occupantGeneration||view.worldRecordId!==entity.data?.worldRecordId
    ||view.role!==role||!publicEligible(state,entity,role)||view.tick!==state.tick||view.simTime!==state.simTime
    ||!Number.isSafeInteger(view.tick)||typeof view.cutWork!=='boolean'
    ||(view.cutWork&&role!=='cutterHead')
    ||![view.simTime,view.localFx,view.localFz,view.torque,view.linearCapacity,view.torqueCapacity].every(finite)
    ||view.linearCapacity<0||view.torqueCapacity<0) {
    publicReceipts.delete(entity);return false;
  }
  publicReceipts.set(entity,{state,entity,life:entity.occupantGeneration,worldRecordId:view.worldRecordId,
    role,tick:view.tick,simTime:view.simTime,localFx:view.localFx,localFz:view.localFz,torque:view.torque,
    linearCapacity:view.linearCapacity,torqueCapacity:view.torqueCapacity,cutWork:view.cutWork,public:true});
  return true;
}
export function readCeresWorkfleetActuation(entity, state = receipts.get(entity)?.state || publicReceipts.get(entity)?.state) {
  const local=readNativeActuation(entity,state);if(local)return local;
  const r=entity&&publicReceipts.get(entity);
  if(!r||r.state!==state||r.entity!==entity||r.tick!==state?.tick||r.simTime!==state?.simTime
    ||r.life!==entity.occupantGeneration||r.worldRecordId!==entity.data?.worldRecordId
    ||r.role!==ceresWorkfleetRoleForEntity(entity)||!publicEligible(state,entity,r.role)) {
    if(entity)publicReceipts.delete(entity);return null;
  }
  if(state.render?.contextRecovery?.pending===true)return null;
  return r;
}
