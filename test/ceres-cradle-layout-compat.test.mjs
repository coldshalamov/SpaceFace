import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetHardwareSpec,ceresWorkfleetHardwareRoleForRecord} from '../src/data/ceresWorkfleetHardware.js';
import {captureEntityRecord,spawnSpecFromRecord} from '../src/world/worldRecords.js';
import {admitCeresCradleLayout,bindCeresCradleLayout,readCeresCradleLayout,canPublishCeresCradleLayout} from '../src/core/ceresWorkfleetLayoutAdmission.js';
import {ceresWorkfleetPosePrimitives} from '../src/data/ceresWorkfleetArticulation.js';
import {reconcileCeresWorkfleetPresentation} from '../src/systems/ceresWorkfleet.js';
import {ensureCombatState} from '../src/combat/runtime.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function savedRecord(layout){
 const spec=ceresWorkfleetHardwareSpec('cradle');
 const r=captureEntityRecord({id:1,occupantGeneration:1,...spec},{sectorId:C.sectorId,tick:1});
 if(layout===undefined)delete r.itinerary.ceresWorkfleet.cradleLayout;
 else r.itinerary.ceresWorkfleet.cradleLayout=layout;
 return clone(r);
}
async function fixture({layout,occupied=false,nativeOld=true}={}){
 const sim=createSimulation({seed:47,systems:[]}),state=sim.state;state.world.currentSectorId=C.sectorId;state.world.records={byId:{},order:[]};
 const record=savedRecord(layout);state.world.records.byId[record.recordId]=record;
 const cradle=sim.spawn(spawnSpecFromRecord(record));
 const section=sim.spawn({type:'wreck',hull:1000,mass:1800,radius:C.existing.section.radius,
  pos:{x:cradle.pos.x+(occupied?0:300),z:cradle.pos.z+(occupied?10:0)},vel:{x:0,z:0},rot:0,angVel:0,collides:true,
  physicsBody:{schemaVersion:1,dynamic:true,mass:1800,radius:C.existing.section.radius,material:'wreck',
   collisionProxyManifest:{schemaVersion:1,id:`world-site-structure:${C.identities.payload}`,referenceRadius:'radius',
    primitives:C.existing.section.boxes.map((b,i)=>({kind:'obb',id:`matched-section-${i}`,x:b.center.x/C.existing.section.radius,z:b.center.z/C.existing.section.radius,hx:b.size.x/2/C.existing.section.radius,hz:b.size.z/2/C.existing.section.radius,angle:0}))}},
  data:{worldRecordId:C.identities.payload,persistenceOwner:'asteroidSites',worldSiteId:C.siteId,worldSitePayloadId:'long_plate',worldSiteStructural:true}});
 state.sites={worldById:{[C.siteId]:{payloads:{long_plate:{worldObjectId:C.identities.payload}}}}};ensureCombatState(state);
 const native=await createSg02DynamicBodyOwner({publishTelemetry:false,frameOrigin:{...cradle.pos}});
 native.syncFromEntities(nativeOld?[cradle,section]:[section]);
 return {sim,state,cradle,section,native,record,close(){native.dispose();sim.dispose();}};
}
function pose(e){return {pos:{...e.pos},prevPos:e.prevPos&&{...e.prevPos},vel:{...e.vel},rot:e.rot,angVel:e.angVel,life:e.occupantGeneration,id:e.id};}
function snapshot(h){
 const n=h.native,r=n.records.get(h.cradle.id),bodies=[];n.world.forEachRigidBody(b=>bodies.push(b.handle));
 return {record:r,body:r.body,colliders:r.colliders.map(c=>c.handle),owners:new Map(n._colliderOwners),dynamic:new Set(n.dynamicRecords),ceres:new Set(n.ceresWorkfleetRecords),bodies:bodies.sort(),pose:pose(h.cradle),section:pose(h.section),pending:new Map(n._pendingNativeRebuilds),suspended:new Map(n._suspendedAttachments),spec:h.cradle.physicsBody};
}
function unchanged(h,before){
 const after=snapshot(h);assert.equal(after.record,before.record);assert.equal(after.body,before.body);assert.equal(after.spec,before.spec);
 for(const key of ['colliders','owners','dynamic','ceres','bodies','pose','section','pending','suspended'])assert.deepEqual(after[key],before[key],key);
 assert.equal(readCeresCradleLayout(h.cradle,h.state),'open-v1');assert.equal(canPublishCeresCradleLayout(h.cradle,h.state),true);
}

test('fresh construction selects keepers-v2; unversioned durable records conservatively restore open-v1',()=>{
 const sim=createSimulation({seed:47,systems:[]});try{
  const fresh=sim.spawn(ceresWorkfleetHardwareSpec('cradle'));
  assert.equal(readCeresCradleLayout(fresh,sim.state),null);assert.equal(canPublishCeresCradleLayout(fresh,sim.state),false);
  assert.equal(bindCeresCradleLayout(fresh,sim.state),'keepers-v2');assert.equal(readCeresCradleLayout(fresh),'keepers-v2');
  assert.equal(fresh.physicsBody.collisionProxyManifest.primitives.length,11);
  const legacy=sim.spawn(spawnSpecFromRecord(savedRecord()));
  assert.equal(legacy.data.ceresWorkfleetCradleLayout,'open-v1');assert.equal(legacy.physicsBody.collisionProxyManifest.primitives.length,9);
  assert.equal(admitCeresCradleLayout(sim.state,null,legacy).reason,'native-or-world-unresolved');
  assert.equal(readCeresCradleLayout(legacy),'open-v1');assert.equal(canPublishCeresCradleLayout(legacy,sim.state),true);
  for(const bad of [null,'future-v9',0,{},false]){
   const r=savedRecord(bad);assert.equal(ceresWorkfleetHardwareRoleForRecord(r),null);assert.equal(spawnSpecFromRecord(r),null);
   assert.throws(()=>ceresWorkfleetHardwareSpec('cradle',r),/Invalid cradle layout/);
  }
 }finally{sim.dispose();}
});

test('serialized strings, copied data, stale lives and foreign state cannot grant recipe selection',()=>{
 const sim=createSimulation({seed:47,systems:[]});try{
  const e=sim.spawn(ceresWorkfleetHardwareSpec('cradle'));assert.equal(bindCeresCradleLayout(e,sim.state),'keepers-v2');
  const forged=sim.spawn(clone(ceresWorkfleetHardwareSpec('cradle')));assert.equal(bindCeresCradleLayout(forged,sim.state),null);
  const twin=sim.spawn({...ceresWorkfleetHardwareSpec('cradle'),data:e.data});assert.equal(bindCeresCradleLayout(twin,sim.state),null);
  assert.equal(readCeresCradleLayout(e,{entities:sim.state.entities}),null);
  e.occupantGeneration++;assert.equal(readCeresCradleLayout(e),null);assert.equal(bindCeresCradleLayout(e,sim.state),null);
 }finally{sim.dispose();}
});

test('empty legacy admission stages eleven native shapes before publishing the unchanged original identity and pose',async()=>{
 const h=await fixture();try{
  const before=snapshot(h);assert.equal(canPublishCeresCradleLayout(h.cradle,h.state),false);
  const out=admitCeresCradleLayout(h.state,h.native,h.cradle);assert.equal(out.status,'upgraded',out.reason);
  const next=h.native.records.get(h.cradle.id);assert.notEqual(next,before.record);assert.equal(next.colliders.length,11);
  assert.equal(next.proxyId,'ceres-workfleet:cradle:open:v2');assert.equal(readCeresCradleLayout(h.cradle),'keepers-v2');
  assert.deepEqual(pose(h.cradle),before.pose);assert.deepEqual(pose(h.section),before.section);
  assert.equal(h.native.world.bodies.len(),before.bodies.length);assert.equal(h.native.ceresWorkfleetRecords.size,1);
  for(const handle of before.colliders)assert.equal(h.native._colliderOwners.has(handle),false);
  assert.equal(captureEntityRecord(h.cradle,{sectorId:C.sectorId}).itinerary.ceresWorkfleet.cradleLayout,'keepers-v2');
 }finally{h.close();}
});

test('occupied legacy save preserves its original nine-shape body and layout across repeat captures and fresh lives',async()=>{
 let h=await fixture({occupied:true});try{
  for(let turn=0;turn<3;turn++){
   const before=snapshot(h);const out=admitCeresCradleLayout(h.state,h.native,h.cradle);assert.equal(out.reason,'occupied-footprint');unchanged(h,before);
   const wire=clone(captureEntityRecord(h.cradle,{sectorId:C.sectorId}));assert.equal(wire.itinerary.ceresWorkfleet.cradleLayout,'open-v1');
   const oldLife=h.cradle.occupantGeneration,oldId=h.cradle.id;
   h.cradle.alive=false;h.native.syncFromEntities([h.section]);
   h.cradle=h.sim.spawn(spawnSpecFromRecord(wire));assert.notEqual(h.cradle.occupantGeneration,oldLife);assert.notEqual(h.cradle.id,oldId);
   h.native.syncFromEntities([h.cradle,h.section]);
  }
 }finally{h.close();}
});

for(const stage of ['partial-colliders','registered-ownership'])test(`injected ${stage} failure retains old pose/life/native ownership and leaves no candidate or pending residue`,async()=>{
 const h=await fixture();try{
  const before=snapshot(h);let restore;
  if(stage==='partial-colliders'){
   const f=h.native.world.createCollider;let count=0;
   h.native.world.createCollider=function(...args){if(++count===4)throw new Error('injected partial collider failure');return f.apply(this,args);};
   restore=()=>h.native.world.createCollider=f;
  }else{
   const f=h.native._syncCeresWorkfleetRecord;
   h.native._syncCeresWorkfleetRecord=function(rec){f.call(this,rec);assert.equal(this.ceresWorkfleetRecords.has(rec),true);throw new Error('injected after registration');};
   restore=()=>h.native._syncCeresWorkfleetRecord=f;
  }
  const out=admitCeresCradleLayout(h.state,h.native,h.cradle);restore();
  assert.equal(out.reason,'native-admission-failed',JSON.stringify(out));assert.match(out.error,/injected/);unchanged(h,before);
  assert.equal(admitCeresCradleLayout(h.state,h.native,h.cradle).status,'unchanged','failed materialization is not retried live');unchanged(h,before);
  // Native allocation history is intentionally not claimed identical after staging.
 }finally{h.close();}
});

for(const reason of ['payload-unresolved','section-not-materialized','section-native-pose-unresolved','custody-unresolved','active-coupling','nearby-body-unresolved','already-presented','custody-or-health'])test(`uncertain or owned legacy state stays open-v1: ${reason}`,async()=>{
 const h=await fixture();try{
  if(reason==='payload-unresolved')delete h.state.sites.worldById[C.siteId].payloads.long_plate;
  if(reason==='section-not-materialized')h.native.syncFromEntities([h.cradle]);
  if(reason==='section-native-pose-unresolved')h.section.pos.x+=2;
  if(reason==='custody-unresolved')delete h.state.combat.attachments.byId;
  if(reason==='active-coupling')h.state.combat.attachments.byId.test={state:'active',ownerId:h.cradle.id,targetId:h.section.id};
  if(reason==='nearby-body-unresolved')h.sim.spawn({type:'wreck',pos:{...h.cradle.pos},radius:3,mass:4});
  if(reason==='already-presented')h.cradle.mesh={userData:{authoredAssetState:'authored'}};
  if(reason==='custody-or-health')h.cradle.playerOwned=true;
  const before=snapshot(h);const out=admitCeresCradleLayout(h.state,h.native,h.cradle);assert.equal(out.reason,reason);unchanged(h,before);
 }finally{h.close();}
});

test('legacy and keeper recipes use their own validated primitive indexes through a complete real native pad stroke',async()=>{
 for(const layout of ['open-v1','keepers-v2']){
  const h=await fixture({layout});try{
   // Occupancy is resolved before presentation but this fixture deliberately keeps legacy.
   if(layout==='open-v1')h.state.sites.worldById[C.siteId].payloads.long_plate.destroyed=true;
   admitCeresCradleLayout(h.state,h.native,h.cradle);h.cradle.data.ceresWorkfleetSlideTarget=1;
   const rec=h.native.records.get(h.cradle.id),count=layout==='open-v1'?9:11;
   for(let i=0;i<185;i++){
    h.native.step(1/60);const posed=ceresWorkfleetPosePrimitives(h.cradle);assert.equal(posed.length,count);
    for(let k=0;k<count;k++){
     const p=posed[k],c=rec.colliders[k].translationWrtParent();
     assert.ok(Math.abs(c.x-p.x*h.cradle.radius)<.0001);assert.ok(Math.abs(c.z-p.z*h.cradle.radius)<.0001);
    }
   }
   assert.equal(h.cradle.data.ceresWorkfleetSlide,1);assert.equal(rec.colliders.length,count);
  }finally{h.close();}
 }
});

test('loading-mode owner reconciliation selects a conservative cold recipe without requiring a flight tick',()=>{
 const sim=createSimulation({seed:47,systems:[]});try{
  const e=sim.spawn(spawnSpecFromRecord(savedRecord()));sim.state.mode='loading';sim.state.render={scene:{},renderer:{}};
  reconcileCeresWorkfleetPresentation({state:sim.state});
  assert.equal(readCeresCradleLayout(e),'open-v1');assert.equal(canPublishCeresCradleLayout(e,sim.state),true);
  assert.equal(e.physicsBody,false);assert.equal(e.collides,false);
 }finally{sim.dispose();}
});

test('actual save owner restores an occupied unversioned cradle without merge-upgrading or rewriting the saved plate',async()=>{
 const [{world},{asteroidSites},{save}]=await Promise.all([
  import('../src/systems/world.js'),import('../src/systems/asteroidSites.js'),import('../src/save/saveSystem.js')]);
 const source=createSimulation({seed:47,systems:[world,asteroidSites,save]});
 const destination=createSimulation({seed:47,systems:[world,asteroidSites,save]});let native;
 try{
  source.state.world.currentSectorId=C.sectorId;const sites=source.registry.get('asteroidSites');sites._syncWorldSites();
  for(const [componentId,verb,amount,requestSequence] of [['long_plate_clamp','repair',24,1],['long_plate','cut',54,2],['long_plate_clamp','cut',18,3]])
   assert.equal(sites.applyWorldSiteBeamOperation({siteId:C.siteId,componentId,verb,amount,requestStreamId:'player-industrial-beam',requestSequence}).ok,true);
  const cradle=source.spawn(ceresWorkfleetHardwareSpec('cradle'));source.registry.get('world').upsertWorldRecord(cradle);
  let wire=clone(source.registry.get('save').serializeData());
  // A legacy wire fixture at the measured old north stop, not a live pose repair.
  delete wire.world.records.byId[C.identities.cradle].itinerary.ceresWorkfleet.cradleLayout;
  const motion={pos:{x:cradle.pos.x,z:cradle.pos.z+10},vel:{x:0,z:0},rot:0,angVel:0};
  wire.sites.worldById[C.siteId].payloads.long_plate.motion=clone(motion);
  for(let turn=0;turn<3;turn++){
   const unchangedBytes=JSON.stringify(wire);assert.equal(destination.registry.get('save')._restore(clone(wire),'quick').restored,true);
   const state=destination.state,hardware=[...state.entities.values()].filter(e=>e.alive&&e.data?.worldRecordId===C.identities.cradle);
   const sections=[...state.entities.values()].filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload);
   assert.equal(hardware.length,1);assert.equal(sections.length,1);const e=hardware[0],section=sections[0];
   assert.equal(e.physicsBody.collisionProxyManifest.primitives.length,9);
   assert.deepEqual({pos:{x:section.pos.x,z:section.pos.z},vel:{x:section.vel.x,z:section.vel.z},rot:section.rot,angVel:section.angVel},motion);
   native=await createSg02DynamicBodyOwner({publishTelemetry:false,frameOrigin:{...e.pos}});native.syncFromEntities([e,section]);
   assert.equal(admitCeresCradleLayout(state,native,e).status,'legacy');assert.equal(readCeresCradleLayout(e),'open-v1');
   assert.equal(native.records.get(e.id).colliders.length,9);assert.equal(native.records.get(section.id).colliders.length,5);
   assert.equal(section.mass,1800);assert.equal(native.records.get(section.id).body.mass(),1800);
   assert.equal(JSON.stringify(wire),unchangedBytes,'incoming save bytes are not rewritten by materialization');
   wire=clone(destination.registry.get('save').serializeData());assert.equal(wire.world.records.byId[C.identities.cradle].itinerary.ceresWorkfleet.cradleLayout,'open-v1');
   assert.deepEqual(wire.sites.worldById[C.siteId].payloads.long_plate.motion,motion);
   native.dispose();native=null;
  }
 }finally{native?.dispose();source.dispose();destination.dispose();}
});

test('ordinary owner admission publishes the exact staged recipe without a second geometry rebuild',async()=>{
 const h=await fixture();try{
  const writes=[],registry=new Map([['physics',{_sg02:h.native}],['world',{upsertWorldRecord:e=>writes.push(captureEntityRecord(e,{sectorId:C.sectorId}))}]]);
  reconcileCeresWorkfleetPresentation({state:h.state,registry});
  assert.equal(readCeresCradleLayout(h.cradle),'keepers-v2');assert.equal(writes.length,1);assert.equal(writes[0].itinerary.ceresWorkfleet.cradleLayout,'keepers-v2');
  const record=h.native.records.get(h.cradle.id),body=h.cradle.physicsBody;
  assert.equal(record.revision,body.revision);assert.equal(record.proxyId,body.collisionProxyManifest.id);
  h.native.syncFromEntities([h.cradle,h.section]);
  assert.equal(h.native.records.get(h.cradle.id),record,'next owner sync uses the staged body rather than rebuilding it');
  assert.equal(h.cradle.physicsBody,body);
 }finally{h.close();}
});

test('a safe eleven-shape upgrade rejects an old nine-shape native snapshot and preserves the selected body for honest owner fallback',async()=>{
 const h=await fixture();try{
  const snapshot=h.native.exportWorldSnapshot();assert.equal(snapshot.schema,3);
  assert.equal(admitCeresCradleLayout(h.state,h.native,h.cradle).status,'upgraded');
  const record=h.native.records.get(h.cradle.id),sectionRecord=h.native.records.get(h.section.id),before=pose(h.cradle);
  assert.equal(h.native.adoptWorldSnapshot(snapshot,[h.cradle,h.section]),false);
  assert.equal(h.native.records.get(h.cradle.id),record);assert.equal(h.native.records.get(h.section.id),sectionRecord);
  assert.equal(record.colliders.length,11);assert.equal(readCeresCradleLayout(h.cradle),'keepers-v2');assert.deepEqual(pose(h.cradle),before);
 }finally{h.close();}
});


test('a foreign caller recipe cannot expand or weaken the staged keeper body',async()=>{
 for(const change of [b=>b.mass=1,b=>b.dynamic=true,b=>b.radius=999,b=>b.collisionProxyManifest.primitives[0].hx+=1]){
  const h=await fixture();try{
   const before=snapshot(h),bad=clone(ceresWorkfleetHardwareSpec('cradle').physicsBody);change(bad);
   assert.equal(admitCeresCradleLayout(h.state,h.native,h.cradle,bad).reason,'canonical-recipe-unresolved');unchanged(h,before);
  }finally{h.close();}
 }
});


for(const [name,mutate] of [
 ['native angleDeg',b=>b.collisionProxyManifest.primitives.find(p=>p.id.includes('depth_keeper_port')).angleDeg=90],
 ['frame',b=>{b.collisionProxyManifest.frame='approach';b.collisionProxyManifest.frameBearingDeg=90;}],
 ['compact hull',b=>b.collisionProxyManifest.compactHull=[{x:-1,z:-1},{x:1,z:-1},{x:0,z:1}]],
 ['planar polygon',b=>b.collisionProxyManifest.planarPolygon=[{x:-1,z:-1},{x:1,z:-1},{x:0,z:1}]],
 ['articulation',b=>b.collisionProxyManifest.articulation='stormshift-service-tools'],
 ['non-enumerable native angle',b=>Object.defineProperty(b.collisionProxyManifest.primitives[0],'angleDeg',{value:90})],
 ['inherited native angle',b=>Object.setPrototypeOf(b.collisionProxyManifest.primitives[0],{angleDeg:90})],
 ['accessor shape',b=>Object.defineProperty(b.collisionProxyManifest.primitives[0],'hx',{get(){throw new Error('shape accessor must never execute');},enumerable:true})],
 ['symbol metadata',b=>b.collisionProxyManifest[Symbol('foreign')]=1],
])test(`exact canonical admission rejects ${name} before touching native geometry`,async()=>{
 const h=await fixture();try{
  const before=snapshot(h),bad=clone(ceresWorkfleetHardwareSpec('cradle').physicsBody);mutate(bad);
  const create=h.native._createRecord;h.native._createRecord=()=>{throw new Error('must fail before native create');};
  assert.equal(admitCeresCradleLayout(h.state,h.native,h.cradle,bad).reason,'canonical-recipe-unresolved');
  h.native._createRecord=create;unchanged(h,before);
 }finally{h.close();}
});


test('default admitted proxy cannot mutate the private canonical validator baseline',async()=>{
 const h=await fixture();try{
  assert.equal(admitCeresCradleLayout(h.state,h.native,h.cradle).status,'upgraded');
  const proxy=h.cradle.physicsBody.collisionProxyManifest;
  assert.equal(Object.isFrozen(proxy),true);assert.equal(Object.isFrozen(proxy.primitives),true);
  assert.ok(proxy.primitives.every(Object.isFrozen));
  assert.throws(()=>{proxy.primitives[0].angleDeg=90;},TypeError);
 }finally{h.close();}
});
for(const field of ['radius','mass'])test(`noncanonical live ${field} cannot alter staged native scale or mass`,async()=>{
 const h=await fixture();try{
  h.cradle[field]*=2;const before=snapshot(h);
  assert.equal(admitCeresCradleLayout(h.state,h.native,h.cradle).reason,'entity-recipe-unresolved');unchanged(h,before);
 }finally{h.close();}
});
