import {ballisticDrift} from '../world/worldCatchup.js';
import {SIM_TIER} from '../world/activityClassification.js';
import {resolveCraftProportions} from '../core/sg02DynamicBodyOwner.js';
import {articulatedColliderRadius} from '../core/articulatedColliderBounds.js';
import {resolveCollisionProxyManifest,proxyOuterRadiusWu,proxyScaleFor} from '../data/collisionProxyManifests.js';
// Bounded source-specific route planning/query only. The existing job owns commands and custody.
import {CERES_WORKFLEET_CONTRACT as C,ceresWorkfleetPose as compose,ceresWorkfleetPoint as point} from '../data/ceresWorkfleet.js';
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
export const CERES_RECOVERY_LIMITS=Object.freeze({workRadius:740,maxApproach:211,approachSpeed:1,accel:.3,
  angularSpeed:.035,angularAccel:.025,returnSpeed:.5,returnAccel:.1,assessmentTicks:600,maxTicks:54000,maxPeers:64,maxPeerShapes:512});
const world=p=>compose({...C.sitePlacement.pos,rot:C.sitePlacement.rot},p);
const finite=p=>p&&[p.x,p.z,p.rot].every(Number.isFinite);
const at=e=>({x:e.pos.x,z:e.pos.z,rot:e.rot});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const loadedBoxes=C.assets.breaker.states.open.boxes.map((box,i)=>{const b=C.assets.breaker.states.retained.boxes[i];const minX=Math.min(box.center.x-box.size.x/2,b.center.x-b.size.x/2),maxX=Math.max(box.center.x+box.size.x/2,b.center.x+b.size.x/2),minZ=Math.min(box.center.z-box.size.z/2,b.center.z-b.size.z/2),maxZ=Math.max(box.center.z+box.size.z/2,b.center.z+b.size.z/2);return {...box,center:{...box.center,x:(minX+maxX)/2,z:(minZ+maxZ)/2},size:{...box.size,x:maxX-minX,z:maxZ-minZ}};});
const boxesFor=(loaded)=>[
 ...(loaded?loadedBoxes:C.assets.breaker.states.open.boxes).map(box=>({box,local:{x:0,z:0,rot:0}})),
 ...C.assets.cutterHead.boxes.map(box=>({box,local:C.assets.breaker.headMountedPose,head:true})),
 ...(loaded?C.existing.section.boxes.map(box=>({box,local:C.assets.breaker.loadPose,section:true})):[])];
function insideWork(p,parts){return parts.every(({box,local})=>[-1,1].every(ax=>[-1,1].every(az=>{const q=point(compose(p,local),{x:box.center.x+ax*box.size.x/2,z:box.center.z+az*box.size.z/2});return distance(q,C.sitePlacement.pos)<=CERES_RECOVERY_LIMITS.workRadius;})));}
function shellClear(section){return C.existing.section.boxes.every(box=>[-1,1].every(ax=>[-1,1].every(az=>point(at(section),{x:box.center.x+ax*box.size.x/2,z:box.center.z+az*box.size.z/2}).z<C.sitePlacement.pos.z-125)));}
export function planCeresWorkfleetRecovery(b,tick){
 const {breaker,section}=b,origin=world(C.route.extraction.breakerTo);if(!breaker||!section||!finite(at(breaker))||!finite(at(section)))return {reason:'invalid-pose'};
 if(distance(at(breaker),origin)>1||Math.abs(wrap(breaker.rot-origin.rot))>.006)return {reason:'carrier-outside-staging'};
 if(!shellClear(section))return {reason:'section-not-clear-of-shell'};
 if(breaker.data?.ceresWorkfleetSlide!==0)return {reason:'shoes-not-open'};
 const plate=at(section),stage={...compose(plate,{x:0,z:-220,rot:Math.PI/2})};
 const turn={...at(breaker),rot:stage.rot};const travel=distance(turn,stage),yaw=Math.abs(wrap(stage.rot-breaker.rot));
 if(travel>CERES_RECOVERY_LIMITS.maxApproach||![turn,stage].every(p=>insideWork(p,boxesFor(false)))||!insideWork(stage,boxesFor(true)))return {reason:'outside-work-envelope'};
 // Four WU per side in the authored 76-WU mouth around the 68-WU plate. Keep half
 // for the real force-driven approach/rope response; predicted free drift may use only two.
 const seconds=travel/CERES_RECOVERY_LIMITS.approachSpeed+yaw/CERES_RECOVERY_LIMITS.angularSpeed+2/CERES_RECOVERY_LIMITS.accel+10;
 const driftBudget=(C.assets.breaker.clearVolumes.open[0].z[1]-C.assets.breaker.clearVolumes.open[0].z[0]-C.existing.section.dimensions.x)/4;
 const tipRadius=Math.hypot(C.existing.section.dimensions.x/2,C.existing.section.dimensions.z/2);
 if(Math.hypot(section.vel.x,section.vel.z)*seconds+Math.abs(section.angVel||0)*seconds*tipRadius>driftBudget)return {reason:'moving-load-outside-capture-budget'};
 const total=seconds+(C.route.seating.lineLengthFrom-C.route.seating.lineLengthTo)+travel/CERES_RECOVERY_LIMITS.returnSpeed+Math.abs(wrap(stage.rot-origin.rot))/.015+30;
 const budget=Math.ceil(total*1.5*60);if(budget>CERES_RECOVERY_LIMITS.maxTicks)return {reason:'route-time-budget',turnCheck:{from:at(breaker),to:turn}};
 return {plan:{schemaVersion:1,attempt:1,startedTick:tick,deadlineTick:tick+budget,start:at(breaker),plate,turn,stage,
  returnStage:origin,predictedApproachSeconds:seconds,driftBudget,returnStart:null}};
}
export function restoreCeresWorkfleetRecovery(raw){
 if(!raw||raw.schemaVersion!==1||raw.attempt!==1||!Number.isSafeInteger(raw.startedTick)||!Number.isSafeInteger(raw.deadlineTick)
  ||raw.startedTick<0||raw.deadlineTick<=raw.startedTick||raw.deadlineTick-raw.startedTick>CERES_RECOVERY_LIMITS.maxTicks)return null;
 for(const key of ['start','plate','turn','stage','returnStage'])if(!finite(raw[key]))return null;
 const origin=world(C.route.extraction.breakerTo),stage=compose(raw.plate,{x:0,z:-220,rot:Math.PI/2});
 if(distance(raw.start,origin)>1||Math.abs(wrap(raw.start.rot-origin.rot))>.006||distance(raw.turn,raw.start)>1e-6
  ||Math.abs(wrap(raw.turn.rot-stage.rot))>1e-6||distance(raw.stage,stage)>1e-6||Math.abs(wrap(raw.stage.rot-stage.rot))>1e-6
  ||distance(raw.returnStage,origin)>1e-6||Math.abs(wrap(raw.returnStage.rot-origin.rot))>1e-6
  ||distance(raw.start,stage)>CERES_RECOVERY_LIMITS.maxApproach||![raw.start,raw.turn,raw.stage].every(p=>insideWork(p,boxesFor(false)))
  ||!insideWork(raw.stage,boxesFor(true)))return null;
 const returnStart=raw.returnStart==null?null:finite(raw.returnStart)&&distance(raw.returnStart,raw.stage)<=8&&Math.abs(wrap(raw.returnStart.rot-raw.stage.rot))<=.04?{...raw.returnStart}:false;
 if(returnStart===false)return null;
 return {schemaVersion:1,attempt:1,startedTick:raw.startedTick,deadlineTick:raw.deadlineTick,
  start:{...raw.start},plate:{...raw.plate},turn:{...raw.turn},stage:{...raw.stage},returnStage:{...raw.returnStage},returnStart};
}
function shapePlanarReach(shape,q){
 const planar=Math.abs(q.x)<1e-12&&Math.abs(q.z)<1e-12;
 if(shape.halfExtents){const h=shape.halfExtents;return Math.hypot(h.x,planar?0:h.y,h.z)+(shape.borderRadius||0);}
 if(Number.isFinite(shape.radius))return shape.radius+(Number.isFinite(shape.halfHeight)?shape.halfHeight:0);
 if(shape.vertices?.length){let r=0;for(let i=0;i+2<shape.vertices.length;i+=3)r=Math.max(r,Math.hypot(shape.vertices[i],planar?0:shape.vertices[i+1],shape.vertices[i+2]));return r+(shape.borderRadius||0);}
 return Infinity;
}
function segmentDistance(start,velocity,p){const d=velocity.x**2+velocity.z**2,t=d?Math.max(0,Math.min(1,((p.x-start.x)*velocity.x+(p.z-start.z)*velocity.z)/d)):0;return Math.hypot(start.x+velocity.x*t-p.x,start.z+velocity.z*t-p.z);}
// Same supported primitive/capsule/hull inputs as native construction. An absent
// native body is never admitted nearby; a finite canonical bound only proves that
// a dormant distant body's entire possible collider lies outside this local query.
function unregisteredReach(e,proxy){
 const positive=(x,f)=>Number.isFinite(x)&&x>0?x:f,radius=positive(e.physicsBody?.radius,positive(e.radius,1));
 const shape=e.physicsBody?.shape||(e.type==='ship'||e.type==='drone'?'capsule':'ball');let fallback=Infinity;
 if(shape==='ball')fallback=radius;
 else if(shape==='capsule'){
  const p=resolveCraftProportions(e,e.physicsBody),com=e.physicsBody?.centerOfMass;
  fallback=Math.max(Math.max(.1,positive(p?.length,1.35)*radius)/2,Math.max(.1,positive(p?.halfWidth,.42)*radius))
    +Math.hypot(Number.isFinite(com?.x)?com.x:0,Number.isFinite(com?.z)?com.z:0);
 }
 if(!proxy)return fallback;
 let bound=Math.max(fallback,proxyOuterRadiusWu(proxy,e));
 for(const key of ['compactHull','planarPolygon'])if(proxy[key]!=null){
  const points=proxy[key],scale=proxyScaleFor(e,proxy);
  if(!Array.isArray(points)||points.length<3||!Number.isFinite(scale)||scale<=0||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)))return Infinity;
  // Native polygon triangles are fans through the origin. Failed native hulls fall
  // back to primitives, hence the maximum of both recipes rather than trusting one.
  for(const p of points)bound=Math.max(bound,Math.hypot(p.x,p.z)*scale);
 }
 return bound;
}
// Live S2/S3/S4 entities keep their last exact pose until activityRuntime's
// catchUpEntity promotes them. Query that same canonical ballistic state without
// mutating the entity/stamp or admitting a native body. Exact/unstamped entities
// already carry their current pose and must not be advanced a second time.
function coldCurrentPosition(e,state){
 const a=e.activity,now=state.simTime;
 if(!a||a.simTier===SIM_TIER.S0_EXACT||a.simTier===SIM_TIER.S1_NEAR
  ||e.type==='projectile'||e.type==='fx'||!Number.isFinite(a.lastExactT)||a.lastExactT<0
  ||!Number.isFinite(now)||now<=a.lastExactT+1e-4)return e.pos;
 return ballisticDrift(e.pos,e.vel,e.rot,e.angVel,now-a.lastExactT).pos;
}
const quat=a=>({x:0,y:-Math.sin(a/2),z:0,w:Math.cos(a/2)});
// Each rotating interval is enclosed by the midpoint box plus the exact maximum
// angular chord displacement of any corner. Translation is a continuous native cast.
// This deliberately over-approximates curved sweeps; it never shrinks authored collision.
export function ceresWorkfleetRecoveryClear(native,state,b,from,to,{loaded=false,sectionOnly=false,ignoreSection=false,headOnly=false,headTarget=null}={}){
 let parts=headOnly?C.assets.cutterHead.boxes.map(box=>({box,local:{x:0,z:0,rot:0}})):sectionOnly?C.existing.section.boxes.map(box=>({box,local:{x:0,z:0,rot:0}})):boxesFor(loaded);
 if(headTarget){
  // Enclose the complete detached-head route in the actual carrier frame. This is
  // query-only conservative support, not a replacement physical collider.
  const frame=at(b.breaker),c=Math.cos(frame.rot),s=Math.sin(frame.rot),local=p=>({x:(p.x-frame.x)*c+(p.z-frame.z)*s,z:-(p.x-frame.x)*s+(p.z-frame.z)*c});
  const a=local(b.cutterHead.pos),z=local(headTarget),r=C.assets.cutterHead.radius;
  const minX=Math.min(a.x,z.x)-r,maxX=Math.max(a.x,z.x)+r,minZ=Math.min(a.z,z.z)-r,maxZ=Math.max(a.z,z.z)+r;
  parts=[...parts.filter(p=>!p.head),{box:{id:'actual-head-route',center:{x:(minX+maxX)/2,z:(minZ+maxZ)/2},size:{x:maxX-minX,z:maxZ-minZ}},local:{x:0,z:0,rot:0}}];
 }
 if(!native||!finite(from)||!finite(to)||!insideWork(from,parts)||!insideWork(to,parts))return {ok:false,reason:'work-envelope'};
 const own=new Set(headOnly?[b.cutterHead]:[b.breaker,b.cutterHead,...(loaded||sectionOnly||ignoreSection)?[b.section]:[]]);
 for(const e of [b.breaker,b.cutterHead,b.section]){const rec=native.records.get(e?.id);if(!e||rec?.entity!==e||rec.body.isEnabled()===false)return {ok:false,reason:'native-life-unresolved'};}
 const radius=Math.max(...parts.map(({box,local,head,section})=>Math.hypot(local.x||0,local.z||0)+Math.hypot(box.center.x,box.center.z)+Math.hypot(box.size.x/2,box.size.z/2)+(head?1+2*C.assets.cutterHead.radius*Math.sin(.04/2):section?1+2*C.existing.section.radius*Math.sin(.006/2):0)));
 const cx=(from.x+to.x)/2,cz=(from.z+to.z)/2,reach=distance(from,to)/2+radius;
 const peers=[];let shapes=0;
 for(const e of state.entities.values()){
  if(own.has(e)||e.alive===false||e.collides===false||!e.physicsBody||e.physicsBody.material==='massline_sensor')continue;
  const r=native.records.get(e.id),origin=native._frameOrigin||{x:0,z:0};
  const valid=r?.entity===e&&r.body.isEnabled()!==false;
  const nativePosition=valid?r.body.translation():null,position=nativePosition?{x:nativePosition.x+origin.x,z:nativePosition.z+origin.z}:coldCurrentPosition(e,state);
  const proxy=valid?null:resolveCollisionProxyManifest(e);
  const outer=valid?articulatedColliderRadius(r):unregisteredReach(e,proxy);
  if(Math.hypot(position.x-cx,position.z-cz)>reach+outer)continue;
  if(!valid)return {ok:false,reason:'nearby-native-unresolved',blocker:e.data?.worldRecordId||e.id};
  const colliders=r.colliders.filter(c=>!c.isSensor()&&c.isEnabled());shapes+=colliders.length;
  if(colliders.length)peers.push({e,colliders});
  if(peers.length>CERES_RECOVERY_LIMITS.maxPeers||shapes>CERES_RECOVERY_LIMITS.maxPeerShapes)return {ok:false,reason:'query-budget'};
 }
 native.world.propagateModifiedBodyPositionsToColliders();
 for(const peer of peers)peer.shapes=peer.colliders.map(collider=>{const shape=collider.shape,position=collider.translation(),rotation=collider.rotation();return {collider,shape,position,rotation,reach:shapePlanarReach(shape,rotation)};});
 const origin=native._frameOrigin||{x:0,z:0};
 const delta=wrap(to.rot-from.rot),steps=Math.max(1,Math.ceil(Math.abs(delta)/.02));
 for(let i=0;i<steps;i++){
  const a=i/steps,z=(i+1)/steps,m=(a+z)/2,rot=from.rot+delta*m;
  for(const {box,local,head,section}of parts){
   const localCenter=point(local,{x:box.center.x,z:box.center.z}),offset=point({x:0,z:0,rot},localCenter);
   const arc=2*(Math.hypot(localCenter.x,localCenter.z)+Math.hypot(box.size.x/2,box.size.z/2))*Math.sin(Math.abs(delta)/(steps*4));
   const pad=arc+(head?1+2*C.assets.cutterHead.radius*Math.sin(.04/2):section?1+2*C.existing.section.radius*Math.sin(.006/2):0),shape=new native.RAPIER.Cuboid(box.size.x/2+pad,Math.max(.1,2*Math.hypot(box.size.x/2+pad,box.size.z/2+pad)),box.size.z/2+pad);
   const start={x:from.x+(to.x-from.x)*a+offset.x-origin.x,y:0,z:from.z+(to.z-from.z)*a+offset.z-origin.z};
   const velocity={x:(to.x-from.x)/steps,y:0,z:(to.z-from.z)/steps},q=quat(rot+(local.rot||0));
   for(const {e,shapes}of peers)for(const peer of shapes){
    if(segmentDistance(start,velocity,peer.position)>Math.hypot(box.size.x/2+pad,box.size.z/2+pad)+peer.reach+1e-4)continue;
    const collider=peer.collider,contact=collider.contactShape(shape,start,q,0);if(contact&&contact.distance<0)return {ok:false,reason:'obstructed',blocker:e.data?.worldRecordId||e.id,part:box.id};
    const hit=shape.castShape(start,q,velocity,peer.shape,peer.position,peer.rotation,{x:0,y:0,z:0},0,1,true);
    if(hit&&hit.time_of_impact<1)return {ok:false,reason:'obstructed',blocker:e.data?.worldRecordId||e.id,part:box.id};
   }
  }
 }
 return {ok:true};
}

// Reacquisition is an empty-carrier approach after the original section has really
// been released. It does not change initial commissioning or seating tolerances.
export const CERES_REACQUIRE_LIMITS=Object.freeze({retryTicks:120,speed:.5,accel:.1,angularSpeed:.015,angularAccel:.01,settleSeconds:30});
const MAX_LOCAL_RETURN_TICKS=Math.ceil(((CERES_RECOVERY_LIMITS.workRadius+Math.hypot(C.route.breakerWorkPose.x,C.route.breakerWorkPose.z))/CERES_REACQUIRE_LIMITS.speed+Math.PI/CERES_REACQUIRE_LIMITS.angularSpeed+CERES_REACQUIRE_LIMITS.settleSeconds)*1.5*60);
const sourceOffset={x:C.route.breakerWorkPose.x-C.existing.section.mountedPose.x,
 z:C.route.breakerWorkPose.z-C.existing.section.mountedPose.z,rot:wrap(C.route.breakerWorkPose.rot-C.existing.section.mountedPose.rot)};
export const ceresWorkfleetReacquireStage=section=>compose(at(section),sourceOffset);
export function ceresWorkfleetReacquireReturnBudget(b,tick){
 const stage=ceresWorkfleetReacquireStage(b.section),speed=Math.hypot(b.breaker.vel.x,b.breaker.vel.z);
 if(distance(at(b.breaker),stage)+speed*speed/(2*CERES_REACQUIRE_LIMITS.accel)<=CERES_RECOVERY_LIMITS.maxApproach)return null;
 const work=world(C.route.breakerWorkPose),seconds=speed/CERES_REACQUIRE_LIMITS.accel
  +(distance(at(b.breaker),work)+speed*speed/(2*CERES_REACQUIRE_LIMITS.accel))/CERES_REACQUIRE_LIMITS.speed
  +Math.abs(wrap(work.rot-b.breaker.rot))/CERES_REACQUIRE_LIMITS.angularSpeed+CERES_REACQUIRE_LIMITS.settleSeconds;
 return {schemaVersion:1,startedTick:tick,deadlineTick:tick+Math.min(MAX_LOCAL_RETURN_TICKS,Math.ceil(seconds*1.5*60))};
}
export function restoreCeresWorkfleetReacquireReturnBudget(raw){
 return raw?.schemaVersion===1&&Number.isSafeInteger(raw.startedTick)&&Number.isSafeInteger(raw.deadlineTick)&&raw.startedTick>=0
  &&raw.deadlineTick>raw.startedTick&&raw.deadlineTick-raw.startedTick<=MAX_LOCAL_RETURN_TICKS
  ?{schemaVersion:1,startedTick:raw.startedTick,deadlineTick:raw.deadlineTick}:null;
}
export function planCeresWorkfleetReacquire(b,tick){
 const {breaker,section}=b;if(!breaker||!section||!finite(at(breaker))||!finite(at(section)))return {reason:'invalid-pose'};
 const start=at(breaker),plate=at(section),capture=ceresWorkfleetReacquireStage(section),kind=distance(start,capture)>CERES_RECOVERY_LIMITS.maxApproach?'return-to-work':'approach';
 const stage=kind==='return-to-work'?world(C.route.breakerWorkPose):capture,turn={...start,rot:stage.rot};
 if(breaker.data?.ceresWorkfleetSlide!==0)return {reason:'shoes-not-open'};
 if(![start,turn,stage].every(p=>insideWork(p,boxesFor(false)))
  ||!C.existing.section.boxes.every(box=>[-1,1].every(x=>[-1,1].every(z=>distance(point(plate,{x:box.center.x+x*box.size.x/2,z:box.center.z+z*box.size.z/2}),C.sitePlacement.pos)<=CERES_RECOVERY_LIMITS.workRadius))))return {reason:'outside-local-work-envelope'};
 const seconds=distance(start,stage)/CERES_REACQUIRE_LIMITS.speed+Math.abs(wrap(stage.rot-start.rot))/CERES_REACQUIRE_LIMITS.angularSpeed+CERES_REACQUIRE_LIMITS.settleSeconds;
 const driftBudget=(C.assets.breaker.clearVolumes.open[0].z[1]-C.assets.breaker.clearVolumes.open[0].z[0]-C.existing.section.dimensions.x)/4;
 const tipRadius=Math.hypot(C.existing.section.dimensions.x/2,C.existing.section.dimensions.z/2);
 if(kind==='approach'&&(Math.hypot(section.vel.x,section.vel.z)*seconds+Math.abs(section.angVel||0)*seconds*tipRadius>driftBudget))return {reason:'cargo-moving'};
 const duration=Math.ceil(seconds*1.5*60);if(duration>(kind==='return-to-work'?MAX_LOCAL_RETURN_TICKS:CERES_RECOVERY_LIMITS.maxTicks))return {reason:'route-time-budget'};
 return {plan:{schemaVersion:1,kind,startedTick:tick,deadlineTick:tick+duration,start,plate,turn,stage,leg:'turn'}};
}
export function restoreCeresWorkfleetReacquire(raw){
 const kind=raw?.kind??'approach';if(!['approach','return-to-work'].includes(kind))return null;
 if(!raw||raw.schemaVersion!==1||!Number.isSafeInteger(raw.startedTick)||!Number.isSafeInteger(raw.deadlineTick)||raw.startedTick<0
  ||raw.deadlineTick<=raw.startedTick||raw.deadlineTick-raw.startedTick>(kind==='return-to-work'?MAX_LOCAL_RETURN_TICKS:CERES_RECOVERY_LIMITS.maxTicks)||!['turn','approach'].includes(raw.leg))return null;
 if(!['start','plate','turn','stage'].every(key=>finite(raw[key])))return null;
 const stage=kind==='return-to-work'?world(C.route.breakerWorkPose):compose(raw.plate,sourceOffset);
 if(distance(raw.stage,stage)>1e-6||Math.abs(wrap(raw.stage.rot-stage.rot))>1e-6||distance(raw.turn,raw.start)>1e-6
  ||Math.abs(wrap(raw.turn.rot-stage.rot))>1e-6||(kind==='approach'&&distance(raw.start,stage)>CERES_RECOVERY_LIMITS.maxApproach)
  ||![raw.start,raw.turn,raw.stage].every(p=>insideWork(p,boxesFor(false))))return null;
 return {schemaVersion:1,kind,startedTick:raw.startedTick,deadlineTick:raw.deadlineTick,start:{...raw.start},plate:{...raw.plate},turn:{...raw.turn},stage:{...raw.stage},leg:raw.leg};
}

// An authored dock can end on a real solid face. Approach only a prefix certified
// clear by the same native compound query; the job still tests the original pose.
export function ceresWorkfleetHeadClearPrefix(native,state,b,from,to){
 const check=ceresWorkfleetRecoveryClear(native,state,b,from,to,{headOnly:true});
 if(check.ok)return {ok:true,pose:to,complete:true};
 if(check.reason!=='obstructed')return check;
 if(!ceresWorkfleetRecoveryClear(native,state,b,from,from,{headOnly:true}).ok)return check;
 let lo=0,hi=1;const angle=wrap(to.rot-from.rot),at=t=>({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t,rot:from.rot+angle*t});
 for(let i=0;i<8;i++){const mid=(lo+hi)/2;if(ceresWorkfleetRecoveryClear(native,state,b,from,at(mid),{headOnly:true}).ok)lo=mid;else hi=mid;}
 return lo>0?{ok:true,pose:at(lo),complete:false,blocker:check.blocker}:check;
}
