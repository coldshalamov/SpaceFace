import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {createOrchardMotorState,orchardPartPose} from '../src/core/anvilOrchardNative.js';
import {createOrchardNativeLane,prepareOrchardNativeObservation,orchardPairClearance} from '../src/core/anvilOrchardCollarQuery.js';
import {loadRapierCompatRuntime,orchardRapierBaseline} from '../src/core/rapierCompatRuntime.js';
import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec} from '../src/data/anvilOrchardBody.js';
const R=await loadRapierCompatRuntime();
async function fixture(x=0,z=0,yaw=0) {
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x,z},rot:yaw,radius:G.radius,hull:300,
  physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}});
 const owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 const rec=owner.records.get(frame.id),lane=createOrchardNativeLane(R,owner.world,orchardRapierBaseline(R));
 return {sim,frame,owner,rec,lane,close(){owner.dispose();sim.dispose();}};
}
const moves=(socket,progress,direction=1)=>G.rigs.filter(r=>r.socket===socket).map(r=>{const index=G.parts.findIndex(p=>p.id===r.partId),values=[0,0,0];values[socket]=progress;return {index,...orchardPartPose(index,values),pivot:r.pivot,angle:direction*r.yawSign*Math.PI/60};});
const query=(f,ms,geometry=G)=>orchardPairClearance(prepareOrchardNativeObservation(f.owner,f.lane).scan(),f.rec.body.handle,ms,f.lane.constants,geometry);
const tail=(f,tick)=>{f.owner.step(1/60,tick);return f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());};
for(const socket of [0,1,2])test(`canonical socket ${socket} certifies every opening and closing slice with full source reserves`,async()=>{
 const f=await fixture(13200,8300,.713);try {
  let minimum=Infinity;
  for(const direction of [1,-1]) for(let n=1;n<=30;n++) {
   const progress=direction===1?n:30-n,ms=moves(socket,progress,direction),proof=query(f,ms);
   assert.equal(proof.clear,true,JSON.stringify({socket,progress,...proof}));minimum=Math.min(minimum,proof.minimum);
   for(const m of ms){f.rec.colliders[m.index].setTranslationWrtParent(m.translation);f.rec.colliders[m.index].setRotationWrtParent(m.rotation);}
  }
  assert.ok(minimum>.1,`minimum strict off-domain clearance ${minimum}`);
 }finally{f.close();}
});
test('the same current source refuses the original complete-proxy overlap without explicit certified domains',async()=>{
 const f=await fixture();try{assert.equal(query(f,moves(1,1),null).clear,false);assert.equal(query(f,moves(1,1)).clear,true);}finally{f.close();}
});
for(const change of ['enlarged domain','same-value copy','wrong pivot','wrong sign','outside authored arc'])test(`bearing admission refuses ${change}`,async()=>{
 const f=await fixture();try {
  const ms=moves(1,1);let geometry=G;
  if(change==='enlarged domain'){geometry=structuredClone(G);geometry.bearingDomains[0].planarBox.minX-=1;}
  if(change==='same-value copy')geometry=structuredClone(G);
  if(change==='wrong pivot')ms[0]={...ms[0],pivot:{...ms[0].pivot,x:ms[0].pivot.x+.01}};
  if(change==='wrong sign')ms[0]={...ms[0],angle:-ms[0].angle};
  if(change==='outside authored arc')ms.splice(0,2,...moves(1,-1,-1));
  assert.throws(()=>query(f,ms,geometry),/orchard_query:bearing_/);
 }finally{f.close();}
});
for(const [x,z,yaw] of [[0,0,0],[13200,8300,.713]])test(`a separate native peer inside the bearing domain retains both full external proxies at ${x},${z}`,async()=>{
 const f=await fixture(x,z,yaw);try {
  const p=G.rigs.find(r=>r.socket===1).pivot,c=Math.cos(yaw),s=Math.sin(yaw);
  const peer=f.sim.spawn({type:'wreck',pos:{x:x+c*p.x-s*p.z,z:z+s*p.x+c*p.z},hull:100,radius:.05,
   physicsBody:{dynamic:false,shape:'ball',radius:.05,mass:10,inertiaY:10,material:'station'},data:{}});
  f.owner.syncFromEntities([f.frame,peer]);
  const proof=query(f,moves(1,1));assert.equal(proof.clear,false);assert.equal(proof.blocker,f.owner.records.get(peer.id).collider.handle);
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);tail(f,1);assert.equal(f.frame.data.orchardCollars.progress[1],0);
 }finally{f.close();}
});
for(const change of ['pin pose','pin shape','source manifest'])test(`actual ${change} change refuses motor authority before either jaw moves`,async()=>{
 const f=await fixture();try {
  const d=G.bearingDomains.find(d=>d.movingPartId===G.rigs.find(r=>r.socket===1).partId),index=G.parts.findIndex(p=>p.id===d.fixedPartId),pin=f.rec.colliders[index];
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
  if(change==='pin pose')pin.setTranslationWrtParent({x:.01,y:0,z:0});
  if(change==='pin shape')pin.setShape(new R.Ball(.3));
  if(change==='source manifest')f.frame.physicsBody.collisionProxyManifest.convexParts[index].points[0].x+=.001;
  const before=f.rec.colliders.map(c=>({...c.translationWrtParent()}));tail(f,1);
  assert.equal(f.frame.data.orchardCollars.progress[1],0);assert.deepEqual(f.rec.colliders.map(c=>({...c.translationWrtParent()})),before);
 }finally{f.close();}
});
test('a yawed full motor cycle survives rebase without changing the source domain',async()=>{
 const f=await fixture(13200,8300,.713);try {
  assert.equal(f.owner.requestOrchardMotion(f.frame,2,30,0),true);
  for(let tick=1;tick<=60;tick++) {
   if(tick===16){f.owner.setFrameOrigin({x:13000,z:8100},1);f.owner.syncFromEntities([f.frame]);}
   if(tick===31)assert.equal(f.owner.requestOrchardMotion(f.frame,2,0,30),true);
   tail(f,tick);assert.equal(f.frame.data.orchardCollars.progress[2],tick<=30?tick:60-tick);
  }
 }finally{f.close();}
});
test('all three exact source pairs complete a shared native open/close cycle with one increment per tick',async()=>{
 const f=await fixture();try {
  for(const socket of [0,1,2])assert.equal(f.owner.requestOrchardMotion(f.frame,socket,30,0),true);
  for(let tick=1;tick<=60;tick++) {
   if(tick===31)for(const socket of [0,1,2])assert.equal(f.owner.requestOrchardMotion(f.frame,socket,0,30),true);
   tail(f,tick);assert.deepEqual(f.frame.data.orchardCollars.progress,Array(3).fill(tick<=30?tick:60-tick));
  }
 }finally{f.close();}
});
test('the exact named fixed part still blocks the geometry kernel outside its certified domain',async()=>{
 const f=await fixture();try {
  const snapshot=prepareOrchardNativeObservation(f.owner,f.lane).scan(),frame=snapshot.byHandle.get(f.rec.body.handle),ms=moves(1,1);
  const rig=G.rigs.find(r=>r.socket===1),domain=G.bearingDomains.find(d=>d.id===rig.bearingDomainId);
  const fixed=frame.colliders[G.parts.findIndex(p=>p.id===domain.fixedPartId)],moving=G.parts.find(p=>p.id===rig.partId);
  const point=[...moving.points].sort((a,b)=>Math.hypot(...b.map((v,i)=>v-[rig.pivot.x,rig.pivot.z][i]))-Math.hypot(...a.map((v,i)=>v-[rig.pivot.x,rig.pivot.z][i])))[0];
  // A deliberately altered copied observation isolates the clipping algorithm.
  // Live source validation separately refuses any such actual native tamper.
  fixed.shape=R.ShapeType.Cuboid;fixed.halfExtents={x:.2,y:.2,z:.2};fixed.local={x:point[0],y:0,z:point[1]};fixed.rotation={x:0,y:0,z:0,w:1};
  const proof=orchardPairClearance(snapshot,f.rec.body.handle,ms,f.lane.constants,G);
  assert.equal(proof.clear,false);assert.equal(proof.blocker,fixed.handle);
 }finally{f.close();}
});

// Load malformed authored metadata in isolated Node processes, preserving every
// ordinary bootstrap/native path and the outer pinned-candidate loader.
for(const mutation of ['fixed-part-id','domain-id'])test(`runtime canonical bearing binding refuses malformed ${mutation} metadata`,async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {pathToFileURL}=await import('node:url');const {spawnSync}=await import('node:child_process');
 const temp=mkdtempSync(join(tmpdir(),'orchard-bearing-metadata-')),hook=join(temp,'loader.mjs');
 writeFileSync(hook,`export async function load(url,context,next){const result=await next(url,context);if(new URL(url).pathname.endsWith('/src/data/anvilOrchardGeometry.json')){const g=JSON.parse(result.source);const d=g.bearingDomains[0],r=g.rigs.find(r=>r.bearingDomainId===d.id);if(process.env.ORCHARD_BAD_BEARING==='fixed-part-id')d.fixedPartId=g.parts.find(p=>!g.rigs.some(r=>r.partId===p.id)&&!p.id.includes('shoulder')).id;else {d.id='unrecognized-bearing';r.bearingDomainId=d.id;}return {...result,source:JSON.stringify(g)};}return result;}`);
 const url=path=>JSON.stringify(pathToFileURL(join(process.cwd(),path)).href);
 const script=`import assert from 'node:assert/strict';
 import {createSimulation} from ${url('src/core/sim.js')};
 import {createSg02DynamicBodyOwner} from ${url('src/core/sg02DynamicBodyOwner.js')};
 import {createOrchardCollarState,orchardPartPose} from ${url('src/core/anvilOrchardNative.js')};
 import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec} from ${url('src/data/anvilOrchardBody.js')};
 import {createOrchardNativeLane,prepareOrchardNativeObservation,orchardPairClearance} from ${url('src/core/anvilOrchardCollarQuery.js')};
 import {loadRapierCompatRuntime,orchardRapierBaseline} from ${url('src/core/rapierCompatRuntime.js')};
 const R=await loadRapierCompatRuntime(),sim=createSimulation();
 const frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardCollarState()}});
 const owner=await createSg02DynamicBodyOwner();
 try{owner.syncFromEntities([frame]);const rec=owner.records.get(frame.id);assert.ok(rec,'ordinary exact source construction remains available');
 const lane=createOrchardNativeLane(R,owner.world,orchardRapierBaseline(R));assert.ok(lane);
 const moves=G.rigs.filter(r=>r.socket===0).map(r=>{const index=G.parts.findIndex(p=>p.id===r.partId);return {index,...orchardPartPose(index,[1,0,0]),pivot:r.pivot,angle:r.yawSign*Math.PI/60};});
 assert.throws(()=>orchardPairClearance(prepareOrchardNativeObservation(owner,lane).scan(),rec.body.handle,moves,lane.constants,G),/orchard_query:bearing_source/);
 }finally{owner.dispose();sim.dispose();}`;
 const loaders=[];for(let i=0;i<process.execArgv.length;i++)if(['--loader','--experimental-loader'].includes(process.execArgv[i]))loaders.push(process.execArgv[i],process.execArgv[++i]);
 try{const result=spawnSync(process.execPath,[...loaders,'--loader',hook,'--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,ORCHARD_BAD_BEARING:mutation}});assert.equal(result.status,0,result.stdout+result.stderr);}
 finally{rmSync(temp,{recursive:true,force:true});}
});

for(const key of ['world','records','_eventQueue'])test(`late ${key} descriptor cannot mutate source after the last motor preflight`,async()=>{
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}}),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 const rec=owner.records.get(frame.id),rigs=G.rigs.filter(r=>r.socket===1),columns=rigs.map(r=>rec.colliders[G.parts.findIndex(p=>p.id===r.partId)]),map=owner.records,get=map.get,descriptor=Object.getOwnPropertyDescriptor(owner,key);let completeReads=0,calls=0;
 try{assert.equal(owner.requestOrchardMotion(frame,1,30,0),true);owner.step(1/60,1);
 map.get=function(id){const out=get.call(this,id);if(id===frame.id&&columns.every((c,i)=>Math.abs(c.rotationWrtParent().y-Math.sin(rigs[i].yawSign*Math.PI/120))<1e-6)&&++completeReads===2)Object.defineProperty(owner,key,{configurable:true,get(){calls++;Object.defineProperty(owner,key,descriptor);frame.hull=0;return descriptor.value;}});return out;};
 owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
 console.log(JSON.stringify({key,calls,completeReads,hull:frame.hull,progress:frame.data.orchardCollars.progress[1]}));
 assert.equal(calls,0);assert.equal(frame.data.orchardCollars.progress[1],0);
 assert.equal(owner.orchardAuthorityAvailable(),false);delete map.get;Object.defineProperty(owner,key,descriptor);
 const tick=owner.tick,debt=owner.accumulator;owner.step(1/60,2);assert.equal(owner.tick,tick);assert.equal(owner.accumulator,debt);
 assert.equal(owner.recoverOrchardFrame(),true);assert.equal(owner.orchardAuthorityAvailable(),true);
 owner.step(1/60,2);owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());assert.equal(frame.data.orchardCollars.progress[1],1);

 }finally{delete map.get;Object.defineProperty(owner,key,descriptor);owner.dispose();sim.dispose();}
});

for(const kind of ['records-size','peer-slot'])test(`the final motor observation cannot dispatch a late ${kind} getter`,async()=>{
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}}),peer=sim.spawn({type:'payload',pos:{x:200,z:200},hull:100,radius:1,physicsBody:{dynamic:true,shape:'ball',radius:1,mass:10,inertiaY:10,material:'pod'},data:{}}),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame,peer]);
 const rec=owner.records.get(frame.id),rigs=G.rigs.filter(r=>r.socket===1),columns=rigs.map(r=>rec.colliders[G.parts.findIndex(p=>p.id===r.partId)]),map=owner.records,get=map.get,array=owner.records.get(peer.id).colliders;
 const target=kind==='records-size'?map:array,key=kind==='records-size'?'size':'0',descriptor=Object.getOwnPropertyDescriptor(target,key),value=kind==='records-size'?Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(map):array[0];let completeReads=0,calls=0;
 try{assert.equal(owner.requestOrchardMotion(frame,1,30,0),true);owner.step(1/60,1);
 map.get=function(id){const out=get.call(this,id);if(id===frame.id&&columns.every((c,i)=>Math.abs(c.rotationWrtParent().y-Math.sin(rigs[i].yawSign*Math.PI/120))<1e-6)&&++completeReads===2)Object.defineProperty(target,key,{configurable:true,get(){calls++;if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];frame.hull=0;return value;}});return out;};
 owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
 console.log(JSON.stringify({kind,calls,completeReads,hull:frame.hull,progress:frame.data.orchardCollars.progress[1]}));assert.equal(calls,0);assert.equal(frame.hull,300);assert.equal(frame.data.orchardCollars.progress[1],kind==='records-size'?1:0);
 if(kind==='peer-slot'){
  assert.equal(owner.orchardAuthorityAvailable(),false);delete map.get;Object.defineProperty(target,key,descriptor);
  const tick=owner.tick,debt=owner.accumulator,peerBody=owner.records.get(peer.id).body;owner.step(1/60,2);assert.equal(owner.tick,tick);assert.equal(owner.accumulator,debt);
  assert.equal(owner.recoverOrchardFrame(),true);assert.equal(owner.records.get(peer.id).body,peerBody);
  owner.step(1/60,2);owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());assert.equal(frame.data.orchardCollars.progress[1],1);
 }

 }finally{delete map.get;if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];owner.dispose();sim.dispose();}
});

for(const label of ['origin-object','origin-sequence','origin-x','origin-z','spines','attachments','suspended-attachments'])test(`late ${label} descriptor cannot mutate source after the last motor preflight`,async()=>{
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}}),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 const rec=owner.records.get(frame.id),rigs=G.rigs.filter(r=>r.socket===1),columns=rigs.map(r=>rec.colliders[G.parts.findIndex(p=>p.id===r.partId)]),map=owner.records,get=map.get;const [target,key]=label==='spines'?[rec,'coincidentSpines']:label==='origin-x'?[owner._frameOrigin,'x']:label==='origin-z'?[owner._frameOrigin,'z']:[owner,({'origin-object':'_frameOrigin','origin-sequence':'_frameOriginSeq',attachments:'attachments','suspended-attachments':'_suspendedAttachments'})[label]],descriptor=Object.getOwnPropertyDescriptor(target,key);let completeReads=0,calls=0;
 try{assert.equal(owner.requestOrchardMotion(frame,1,30,0),true);owner.step(1/60,1);
 map.get=function(id){const out=get.call(this,id);if(id===frame.id&&columns.every((c,i)=>Math.abs(c.rotationWrtParent().y-Math.sin(rigs[i].yawSign*Math.PI/120))<1e-6)&&++completeReads===2)Object.defineProperty(target,key,{configurable:true,get(){calls++;Object.defineProperty(target,key,descriptor);frame.hull=0;return descriptor.value;}});return out;};
 owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
 console.log(JSON.stringify({label,calls,completeReads,hull:frame.hull,progress:frame.data.orchardCollars.progress[1]}));
 assert.equal(calls,0);assert.equal(frame.data.orchardCollars.progress[1],0);
 assert.equal(owner.orchardAuthorityAvailable(),false);delete map.get;Object.defineProperty(target,key,descriptor);
 const tick=owner.tick,debt=owner.accumulator;owner.step(1/60,2);assert.equal(owner.tick,tick);assert.equal(owner.accumulator,debt);
 assert.equal(owner.recoverOrchardFrame(),true);assert.equal(owner.orchardAuthorityAvailable(),true);
 owner.step(1/60,2);owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());assert.equal(frame.data.orchardCollars.progress[1],1);

 }finally{delete map.get;Object.defineProperty(target,key,descriptor);owner.dispose();sim.dispose();}
});


for(const label of ['origin-x','origin-z','record-extra','record-body','body-handle','collider-handle','vel','prevPos','vel-x','prevPos-x','dynamic-set','workfleet-set','vel-y-hidden','vel-z-hidden','pos-y-hidden','prevPos-y-hidden','angVel'])test(`recovery refuses an installed ${label} accessor before reads and resumes after restoration`,async()=>{
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}}),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 const rec=owner.records.get(frame.id),rigs=G.rigs.filter(r=>r.socket===1),columns=rigs.map(r=>rec.colliders[G.parts.findIndex(p=>p.id===r.partId)]),map=owner.records,get=map.get,originDescriptor=Object.getOwnPropertyDescriptor(owner,'_frameOrigin');let reads=0,calls=0,target,key,descriptor;
 try {
  assert.equal(owner.requestOrchardMotion(frame,1,30,0),true);owner.step(1/60,1);
  map.get=function(id){const out=get.call(this,id);if(id===frame.id&&columns.every((c,i)=>Math.abs(c.rotationWrtParent().y-Math.sin(rigs[i].yawSign*Math.PI/120))<1e-6)&&++reads===2)Object.defineProperty(owner,'_frameOrigin',{configurable:true,get(){throw Error('unsupported origin');}});return out;};
  owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
  delete map.get;Object.defineProperty(owner,'_frameOrigin',originDescriptor);
  assert.equal(owner.orchardAuthorityAvailable(),false);assert.equal(frame.data.orchardCollars.progress[1],0);
  [target,key]=label==='origin-x'?[owner._frameOrigin,'x']:label==='origin-z'?[owner._frameOrigin,'z']:
   label==='record-extra'?[rec,'extra']:label==='record-body'?[rec,'body']:label==='body-handle'?[rec.body,'handle']:label==='collider-handle'?[rec.collider,'handle']:
   label==='vel'?[frame,'vel']:label==='prevPos'?[frame,'prevPos']:label==='vel-x'?[frame.vel,'x']:label==='prevPos-x'?[frame.prevPos,'x']:
   label==='vel-y-hidden'?[frame.vel,'y']:label==='vel-z-hidden'?[frame.vel,'z']:label==='pos-y-hidden'?[frame.pos,'y']:label==='prevPos-y-hidden'?[frame.prevPos,'y']:label==='angVel'?[frame,'angVel']:
   [owner,label==='dynamic-set'?'dynamicRecords':'ceresWorkfleetRecords'];
  descriptor=Object.getOwnPropertyDescriptor(target,key);
  const world=owner.world,bodies=world.bodies.len(),colliders=world.colliders.len(),body=rec.body,
   poses=columns.map(c=>({t:c.translationWrtParent(),q:c.rotationWrtParent()}));
  Object.defineProperty(target,key,{configurable:true,enumerable:!label.endsWith('-hidden'),get(){calls++;frame.hull=0;return descriptor?.value;}});
  assert.equal(owner.recoverOrchardFrame(),false);
  assert.equal(calls,0);assert.equal(frame.hull,300);assert.equal(frame.data.orchardCollars.progress[1],0);
  assert.equal(world.bodies.len(),bodies);assert.equal(world.colliders.len(),colliders);assert.equal(owner.records.get(frame.id),rec);
  assert.equal(owner.orchardAuthorityAvailable(),false);
  if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];
  assert.equal(rec.body,body);assert.deepEqual(columns.map(c=>({t:c.translationWrtParent(),q:c.rotationWrtParent()})),poses);
  const tick=owner.tick,debt=owner.accumulator;owner.step(1/60,2);assert.equal(owner.tick,tick);assert.equal(owner.accumulator,debt);
  assert.equal(owner.recoverOrchardFrame(),true);assert.equal(owner.orchardAuthorityAvailable(),true);
  owner.step(1/60,2);owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
  assert.equal(frame.data.orchardCollars.progress[1],1);assert.equal(calls,0);assert.equal(frame.hull,300);
 }finally {
  delete map.get;Object.defineProperty(owner,'_frameOrigin',originDescriptor);
  if(target){if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];}
  owner.dispose();sim.dispose();
 }
});

for(const key of ['dynamicRecords','ceresWorkfleetRecords'])test(`recovery retains exact ${key} membership before enabling a later solve`,async()=>{
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}}),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 const rec=owner.records.get(frame.id),rigs=G.rigs.filter(r=>r.socket===1),columns=rigs.map(r=>rec.colliders[G.parts.findIndex(p=>p.id===r.partId)]),map=owner.records,get=map.get,originDescriptor=Object.getOwnPropertyDescriptor(owner,'_frameOrigin'),set=owner[key],sentinel={entity:{id:'sentinel'},body:{},spec:{dynamic:true}};let reads=0;
 try {
  assert.equal(owner.requestOrchardMotion(frame,1,30,0),true);owner.step(1/60,1);
  map.get=function(id){const out=get.call(this,id);if(id===frame.id&&columns.every((c,i)=>Math.abs(c.rotationWrtParent().y-Math.sin(rigs[i].yawSign*Math.PI/120))<1e-6)&&++reads===2)Object.defineProperty(owner,'_frameOrigin',{configurable:true,get(){throw Error('unsupported origin');}});return out;};
  owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
  delete map.get;Object.defineProperty(owner,'_frameOrigin',originDescriptor);
  assert.equal(owner.orchardAuthorityAvailable(),false);set.add(sentinel);
  const bodies=owner.world.bodies.len(),colliders=owner.world.colliders.len(),tick=owner.tick,debt=owner.accumulator;
  assert.equal(owner.recoverOrchardFrame(),false);assert.equal(owner.orchardAuthorityAvailable(),false);assert.equal(set.has(sentinel),true);
  assert.equal(owner.world.bodies.len(),bodies);assert.equal(owner.world.colliders.len(),colliders);assert.equal(owner.records.get(frame.id),rec);
  owner.step(1/60,2);assert.equal(owner.tick,tick);assert.equal(owner.accumulator,debt);assert.equal(frame.data.orchardCollars.progress[1],0);
  set.delete(sentinel);assert.equal(owner.recoverOrchardFrame(),true);assert.equal(owner.orchardAuthorityAvailable(),true);
  owner.step(1/60,2);owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
  assert.equal(frame.data.orchardCollars.progress[1],1);assert.equal(frame.hull,300);assert.equal(set.has(sentinel),false);
 }finally{delete map.get;Object.defineProperty(owner,'_frameOrigin',originDescriptor);set.delete(sentinel);owner.dispose();sim.dispose();}
});

for(const label of ['angVel-missing','angVel-inherited','vel-inherited','role-accessor','role-inherited'])test(`recovery scratch refuses ${label} without inherited dispatch`,async()=>{
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}}),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 const rec=owner.records.get(frame.id),rigs=G.rigs.filter(r=>r.socket===1),columns=rigs.map(r=>rec.colliders[G.parts.findIndex(p=>p.id===r.partId)]),map=owner.records,get=map.get,originDescriptor=Object.getOwnPropertyDescriptor(owner,'_frameOrigin');let reads=0,calls=0;
 const target=label.startsWith('role')?frame.data:frame,key=label.startsWith('role')?'ceresWorkfleetRole':label.startsWith('vel')?'vel':'angVel',descriptor=Object.getOwnPropertyDescriptor(target,key),prototype=Object.getPrototypeOf(target);
 const restore=()=>{Object.setPrototypeOf(target,prototype);if(descriptor)Object.defineProperty(target,key,descriptor);else delete target[key];};
 try {
  assert.equal(owner.requestOrchardMotion(frame,1,30,0),true);owner.step(1/60,1);
  map.get=function(id){const out=get.call(this,id);if(id===frame.id&&columns.every((c,i)=>Math.abs(c.rotationWrtParent().y-Math.sin(rigs[i].yawSign*Math.PI/120))<1e-6)&&++reads===2)Object.defineProperty(owner,'_frameOrigin',{configurable:true,get(){throw Error('unsupported origin');}});return out;};
  owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());delete map.get;Object.defineProperty(owner,'_frameOrigin',originDescriptor);
  const getter={configurable:true,get(){calls++;frame.hull=0;return descriptor?.value;}};
  if(label.endsWith('-inherited')){delete target[key];Object.setPrototypeOf(target,Object.create(prototype,{[key]:getter}));}
  else if(label.endsWith('-missing'))delete target[key];else Object.defineProperty(target,key,getter);
  const bodies=owner.world.bodies.len(),colliders=owner.world.colliders.len(),tick=owner.tick,debt=owner.accumulator;
  assert.equal(owner.recoverOrchardFrame(),false);assert.equal(calls,0);assert.equal(frame.hull,300);assert.equal(owner.orchardAuthorityAvailable(),false);
  assert.equal(owner.world.bodies.len(),bodies);assert.equal(owner.world.colliders.len(),colliders);assert.equal(owner.records.get(frame.id),rec);
  owner.step(1/60,2);assert.equal(owner.tick,tick);assert.equal(owner.accumulator,debt);assert.equal(frame.data.orchardCollars.progress[1],0);
  restore();assert.equal(owner.recoverOrchardFrame(),true);owner.step(1/60,2);owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
  assert.equal(frame.data.orchardCollars.progress[1],1);assert.equal(calls,0);assert.equal(frame.hull,300);
 }finally{delete map.get;Object.defineProperty(owner,'_frameOrigin',originDescriptor);restore();owner.dispose();sim.dispose();}
});
