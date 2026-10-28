// Physical queue adapter for one existing service. NPC jobs/flight still own motion;
// world records own the original keg. Clearing a lane does not release impounded cargo.
import { TETHYS_TALLY as C, tallyMarks, isTallyCourier, tallyPauseId } from '../data/tethysTallyPassage.js';
import { PRIORITY_COURIER_SERVICE as SERVICE, isPriorityCourierItinerary } from '../data/laneContacts.js';
import { stableRecordId, RECORD_KIND } from '../world/worldRecords.js';
import { indexedWorldRecordEntity } from '../world/livingWorldViews.js';
import { hullEnvelopeWu } from '../data/collisionProxyManifests.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
const dist = (a,b) => a && b && [a.x,a.z,b.x,b.z].every(Number.isFinite) ? Math.hypot(a.x-b.x,a.z-b.z) : Infinity;
export function tallyKegRecordId(state) {
  return stableRecordId(state.meta?.seed || 1,C.sectorId,RECORD_KIND.WRECK,`worldOneOff:${C.oneOffId}`);
}
export function isTallyPassageJob(job) { return job?.payload?.priorityCourierService?.tallyPassage === C.id; }
function pose(owner,e) {
  if(!e || e.alive === false || owner.state.entities?.get(e.id)!==e || !e.pos || !e.vel
    || ![e.pos.x,e.pos.z,e.vel.x,e.vel.z].every(Number.isFinite)) return null;
  if(owner.state.settings?.gameplay?.physicsBackend==='custom')return {pos:e.pos,vel:e.vel};
  if(owner.state.settings?.gameplay?.physicsBackend!=='rapier-dynamic')return null;
  const p=(owner.registry||owner._registry)?.get('physics'), n=p?._sg02, r=n?.records?.get(e.id), b=r?.body;
  if(p?._nativeRestorePending || p?._nativeRestoreDeferred || !physicsBodyNativeReady(e)
    || r?.entity!==e || !b || !Number.isInteger(n._simTick) || owner.state.tick-n._simTick<0
    || owner.state.tick-n._simTick>2 || r._postStepReadTick!==n.tick)return null;
  try {
    if(!b.isEnabled() || n.world.getRigidBody(b.handle)!==b || !r.colliders?.length
      || b.numColliders()!==r.colliders.length || r.colliders.some((c,i)=>!c.isEnabled()
      || b.collider(i)!==c || n.world.getCollider(c.handle)!==c || c.parent()!==b))return null;
    const t=b.translation(),v=b.linvel(),a=b.angvel(),q=b.rotation(),o=n._frameOrigin||{x:0,z:0};
    if(![t.x,t.y,t.z,v.x,v.y,v.z,a.x,a.y,a.z,q.x,q.y,q.z,q.w].every(Number.isFinite))return null;
    return {pos:{x:t.x+o.x,z:t.z+o.z},vel:{x:v.x,z:v.z}};
  }catch{return null;}
}
function pointSegment(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
 const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;
 return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
export function sweptCorridorDistance(a,b,c,d){
 const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
 if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0)return 0;
 return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
export function tallyClearance(owner,entity){
 const state=owner.state,id=tallyKegRecordId(state),record=state.world?.records?.byId?.[id];
 const keg=indexedWorldRecordEntity(state,id);
 if(!keg && record && (record.alive===false || ['destroyed','defeated'].includes(record.outcome)))return {reason:'removed',clear:true};
 if(!keg || keg.data?.oneOffId!==C.oneOffId || keg.data.identityKey!==`worldOneOff:${C.oneOffId}`
   || keg.data.homeSectorId!==C.sectorId)return {reason:'unobserved',clear:false};
 const kp=pose(owner,keg);if(!kp)return {reason:'unobserved',clear:false};
 const marks=tallyMarks(),a=marks[1].pos,b=marks[2].pos;
 const end={x:kp.pos.x+kp.vel.x,z:kp.pos.z+kp.vel.z};
 const gap=sweptCorridorDistance(a,b,kp.pos,end);
 const width=Math.max(1,hullEnvelopeWu(entity))+Math.max(1,hullEnvelopeWu(keg))+C.clearance;
 return {reason:gap>width?'clear':'obstructed',clear:gap>width,gap,width};
}
export function tallyPassageTarget(owner,entry,entity){
 const job=entry?.job;if(!isTallyPassageJob(job))return null;
 if(['flee','complete'].includes(job.phase)){ releaseTallyPause(owner,entity); return null; }
 const state=owner.state,it=entity?.data?.itinerary, marker=job.payload.priorityCourierService;
 if(state.mode!=='flight' || state.world?.currentSectorId!==C.sectorId || entry.control
   || entry.entityId!==entity?.id || state.entities?.get(entity.id)!==entity
   || !isTallyCourier(entity) || entry.worldRecordId!==entity.data.worldRecordId || marker.serviceId!==SERVICE.id
   || marker.schema!=='spaceface.priority-courier-job.v1'
   || !isPriorityCourierItinerary(it) || it.legSeq!==marker.legSeq
   || it.destinationStationId!==C.customsId)return {blocked:true};
 const wp=pose(owner,entity);if(!wp)return {blocked:true};
 const marks=tallyMarks();
 const stations=[it.originStationId,it.destinationStationId].map(id=>state.entityList?.find(e=>e.alive!==false && e.type==='station' && e.data?.stationId===id && state.entities.get(e.id)===e));
 if(stations.some(s=>!s) || job.route?.[0]?.id!==`origin:${it.originStationId}` || job.route?.[4]?.id!==`dest:${it.destinationStationId}`
   || dist(job.route[0].pos,stations[0].pos)>.01 || dist(job.route[4].pos,stations[1].pos)>.01)return {blocked:true};
 if(job.route?.length!==5 || marks.some((m,i)=>job.route[i+1]?.id!==m.id || dist(job.route[i+1].pos,m.pos)>.01))return {blocked:true};
 syncTallyPause(owner,entity,wp);
 const moving=job.phase==='transit';
 const index=moving?Math.min(job.routeIndex+1,4):job.routeIndex;
 let target=job.route[index]?.pos;if(!target)return {blocked:true};
 const row=it.tallyPassage ||= {id:C.id,legSeq:it.legSeq,reason:'approaching',firstHeldAt:null,clearedAt:null,holdStartedAt:null,heldS:0};
 if(row.id!==C.id || row.legSeq!==it.legSeq)return {blocked:true};
 for(const key of ['firstHeldAt','clearedAt','passedAt','holdStartedAt'])if(row[key]!=null && (!Number.isFinite(row[key]) || row[key]<0 || row[key]>state.simTime)){row[key]=null;return {blocked:true};}
 if(!Number.isFinite(row.heldS) || row.heldS<0)row.heldS=0;
 let holdClock=false;
 if(index===3 && moving){
   const clearance=tallyClearance(owner,entity);row.reason=clearance.reason;
   if(!clearance.clear){target=marks[1].pos;holdClock=true; row.clearedAt=null;
     if(dist(wp.pos,target)<=C.reach){
       if(row.firstHeldAt==null)row.firstHeldAt=state.simTime;
       if(row.holdStartedAt==null)row.holdStartedAt=state.simTime;
     }
   }else if(row.holdStartedAt!=null){row.clearedAt=state.simTime;row.heldS+=Math.max(0,state.simTime-row.holdStartedAt);row.holdStartedAt=null;}
 }
 const stationId=index===0?it.originStationId:index===4?it.destinationStationId:null;
 const station=stationId && owner.state.entityList?.find(e=>e.alive!==false && e.type==='station' && e.data?.stationId===stationId);
 // Center-authored station marks stop outside both exported collision envelopes.
 const reach=station?Math.max(hullEnvelopeWu(station)+hullEnvelopeWu(entity)+C.clearance,station.data?.dockRadius||0):C.reach;
 const stopRadius=station?reach-4:reach*.5;
 const reached=dist(wp.pos,target)<=reach && Math.hypot(wp.vel.x,wp.vel.z)<=8;
 if(index===3 && moving && reached && !holdClock)row.passedAt=state.simTime;
 return {pos:target,vel:{x:0,z:0},workPose:wp,reach,stopRadius,holdClock,moving,reached, navigationSpeed:index===1?SERVICE.sprintSpeedWU:40};
}
// Limit only this actor's kernel call, so a timed crossing cannot outrun its real hull.
export function tallyAdvanceDt(job,target,dt){
 if(!target)return dt;
 if(target.blocked || target.holdClock)return 0;
 if(!target.moving)return target.reached?dt:0;
 if(target.reached)return Math.min(dt,.1);
 const a=job.route[job.routeIndex]?.pos,b=job.route[job.routeIndex+1]?.pos;
 if(!a||!b)return 0;
 const duration=Math.max(dist(a,b)/job.speed,.001);
 return Math.min(dt,Math.max(0,duration*(1-job.progress)-1e-6));
}

function syncTallyPause(owner, entity, nativePose) {
 const id=tallyPauseId(entity),d=entity.data,now=owner.state.simTime;
 if(!id || !Number.isFinite(now) || d.abstractIntent && d.abstractIntent.routeId!==id)return;
 d.abstractIntent={kind:'travel',routeId:id,startT:now,endT:now+1,parameters:{
   from:{...nativePose.pos},to:{...nativePose.pos}}};
 (owner.registry||owner._registry)?.get('world')?.upsertWorldRecord?.(entity);
}
export function releaseTallyPause(owner,entity) {
 const d=entity?.data,id=tallyPauseId(entity);
 if(!id || d?.abstractIntent?.routeId!==id)return;
 delete d.abstractIntent;
 (owner.registry||owner._registry)?.get('world')?.upsertWorldRecord?.(entity);
}
