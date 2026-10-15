import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {physics,readOrchardNativePose} from '../src/core/physics.js';
import {save} from '../src/save/saveSystem.js';
import {asteroidSites} from '../src/systems/asteroidSites.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {createOrchardCollarState,createOrchardMotorState,requestOrchardMotion,publishOrchardCompletedContacts} from '../src/core/anvilOrchardNative.js';
import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec} from '../src/data/anvilOrchardBody.js';
async function fixture(state=createOrchardMotorState()) {
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,
  physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:state}});
 const owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 return {sim,frame,owner,close(){owner.dispose();sim.dispose();}};
}
test('motor authority requires explicit fresh owned storage and private owner capability',async()=>{
 const f=await fixture();try {
  assert.equal(requestOrchardMotion(f.owner,{},f.frame,1,30,0),false);
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
  const plain=await fixture(createOrchardCollarState());try {assert.equal(plain.owner.requestOrchardMotion(plain.frame,1,30,0),false);}finally{plain.close();}
 }finally{f.close();}
});
test('cold reconstruction preserves progress, hidden data and first-sync identity without granting a completed tick',async()=>{
 const f=await fixture(createOrchardCollarState([0,14,30],[1,2,3]));try {
  const old=f.frame.data;Object.defineProperty(old,'hidden',{value:{token:17},enumerable:false,configurable:false,writable:false});
  f.owner.rebuildWorldFromEntities([f.frame],{orchardColdRestore:true});
  assert.notEqual(f.frame.data,old);assert.equal(f.frame.data.hidden,old.hidden);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.frame.data,'hidden'),Object.getOwnPropertyDescriptor(old,'hidden'));
  const spec=f.frame.physicsBody,data=f.frame.data;f.owner.syncFromEntities([f.frame]);
  assert.equal(f.frame.physicsBody,spec);assert.equal(f.frame.data,data);
  const pose=f.owner.readOrchardFramePose(f.frame);assert.deepEqual(pose.progress,[0,14,30]);assert.equal(pose.completedNativeTick,null);
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
 }finally{f.close();}
});
test('ordinary live reconstruction does not upgrade unbranded pose-only storage',async()=>{
 const f=await fixture(createOrchardCollarState([0,14,0]));try {
  f.owner.rebuildWorldFromEntities([f.frame]);assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),false);
 }finally{f.close();}
});
test('invalid and replayed contact tokens never invoke a publisher',async()=>{
 const f=await fixture();try {
  f.owner.step(1/60,1);const token=f.owner.completedOrchardTail();let calls=0;
  assert.equal(f.owner.publishCompletedOrchardContacts({...token},()=>++calls),null);assert.equal(calls,0);
  assert.equal(publishOrchardCompletedContacts(f.owner,{},token,()=>++calls),null);assert.equal(calls,0);
  assert.equal(f.owner.publishCompletedOrchardContacts(token,()=>++calls),1);
  assert.equal(f.owner.publishCompletedOrchardContacts(token,()=>++calls),null);assert.equal(calls,1);
 }finally{f.close();}
});
test('nested solve during contact publication preserves debt and counters and consumes the tail once',async()=>{
 const f=await fixture();try {
  f.owner.step(3/60,1);const token=f.owner.completedOrchardTail(),tick=f.owner.tick,debt=f.owner.accumulator;
  let nestedCalls=0;const step=f.owner.world.step;f.owner.world.step=function(...args){nestedCalls++;return step.apply(this,args);};
  f.owner.publishCompletedOrchardContacts(token,()=>{f.owner.step(1/60,1);assert.equal(f.owner.tick,tick);assert.equal(f.owner.accumulator,debt);});
  assert.equal(nestedCalls,0);assert.equal(f.owner.publishCompletedOrchardContacts(token,()=>assert.fail('replay')),null);
  delete f.owner.world.step;
 }finally{f.close();}
});
test('escaping publisher exception cancels credit while harmless reentry cannot steal its batch',async()=>{
 const f=await fixture();try {
  f.owner.step(1/60,1);let token=f.owner.completedOrchardTail();
  assert.throws(()=>f.owner.publishCompletedOrchardContacts(token,()=>{throw Error('publisher');}),/publisher/);
  assert.equal(f.owner.publishCompletedOrchardContacts(token,()=>assert.fail('replay')),null);
  f.owner.step(1/60,2);token=f.owner.completedOrchardTail();let later=false;
  f.owner.publishCompletedOrchardContacts(token,()=>{assert.equal(f.owner.publishCompletedOrchardContacts(token,()=>assert.fail('reentry')),null);later=true;});
  assert.equal(later,true);
 }finally{f.close();}
});
test('cold replacement in publication cancels the old tail and leaves the successor usable',async()=>{
 const f=await fixture();try {
  f.owner.step(1/60,1);const oldWorld=f.owner.world,token=f.owner.completedOrchardTail();
  assert.equal(f.owner.publishCompletedOrchardContacts(token,()=>f.owner.rebuildWorldFromEntities([f.frame],{orchardColdRestore:true})),null);
  assert.notEqual(f.owner.world,oldWorld);assert.ok(f.owner.readOrchardFramePose(f.frame));
  f.owner.step(1/60,2);assert.equal(f.owner.tick,1);assert.ok(f.owner.exportWorldSnapshot());
 }finally{f.close();}
});

test('real scalar Save/JSON/Continue acquires cold motor storage and survives first ordinary sync',async()=>{
 const sim=createSimulation({seed:424214,systems:[asteroidSites,physics,save]});sim.state.mode='flight';sim.state.world.currentSectorId='sector_tethys_junction';
 const player=sim.spawn({type:'ship',pos:{x:13400,z:8300},hull:100,radius:6,data:{defId:'ship_kestrel',fittings:[]}});sim.state.playerId=player.id;
 sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:0.713,radius:G.radius,hull:300,hullMax:300,flags:{persistent:true},physicsBody:orchardFrameBodySpec(),data:{
  orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,placeId:'place_anvil_storm_orchard',authoredAssetId:G.assetId,authoredPayloadAssetId:G.assetId,
  masslineTetherable:false,orchardCollars:createOrchardCollarState([0,14,30])}});
 const facade=sim.registry.get('physics'),saves=sim.registry.get('save');
 try {
  assert.equal(await facade.prepareBackend(sim.state),true);
  const envelope=JSON.parse(JSON.stringify(saves.serialize('motor-cold')));delete envelope.data.physics;delete envelope.checksum;
  assert.equal(saves.loadEnvelope(envelope),true);assert.equal(await facade.prepareBackend(sim.state),true);
  const frame=sim.state.entityList.find(e=>e.data?.orchardKind==='frame'),spec=frame.physicsBody,data=frame.data;
  facade._syncSg02DynamicAuthorityEntities(sim.state);
  assert.equal(frame.physicsBody,spec);assert.equal(frame.data,data);
  assert.deepEqual(facade._sg02.readOrchardFramePose(frame).progress,[0,14,30]);
  assert.equal(facade._sg02.readOrchardFramePose(frame).completedNativeTick,null);
  assert.equal(facade._sg02.requestOrchardMotion(frame,1,30,sim.state.tick),true);
  facade._sg02.step(1/60,sim.state.tick+1);facade._sg02.publishCompletedOrchardContacts(facade._sg02.completedOrchardTail(),()=>facade._sg02.drainContactImpacts());
  assert.equal(frame.data.orchardCollars.progress[1],15);
 }finally{facade._sg02?.dispose();sim.dispose();}
});
test('failed cold data publication preserves the old state and owner without motor authority',async()=>{
 const f=await fixture(createOrchardCollarState([0,14,0]));try {
  const data=f.frame.data,world=f.owner.world,rec=f.owner.records.get(f.frame.id);
  Object.defineProperty(f.frame,'data',{value:data,writable:false,enumerable:true,configurable:true});
  assert.throws(()=>f.owner.rebuildWorldFromEntities([f.frame],{orchardColdRestore:true}),/entity_mirror_not_writable/);
  assert.equal(f.owner.world,world);assert.equal(f.owner.records.get(f.frame.id),rec);assert.equal(f.frame.data,data);
  assert.ok(f.owner.readOrchardFramePose(f.frame));assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),false);
 }finally{f.close();}
});

test('thirty completed native tails open and thirty close the actual source pair',async()=>{
 const f=await fixture();try {
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
  for(let tick=1;tick<=30;tick++) {
   f.owner.step(1/60,tick);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
   assert.equal(f.frame.data.orchardCollars.progress[1],tick,`open ${tick}`);
   const receipt=f.owner.readOrchardFramePose(f.frame);assert.equal(receipt.kind,'completed-step');assert.equal(receipt.completedNativeTick,tick);
  }
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,0,30),true);
  for(let tick=31;tick<=60;tick++) {
   f.owner.step(1/60,tick);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
   assert.equal(f.frame.data.orchardCollars.progress[1],60-tick,`close ${tick}`);
  }
  assert.deepEqual(f.owner.readOrchardFramePose(f.frame).progress,[0,0,0]);
 }finally{f.close();}
});
test('catch-up solves create only one later canonical increment per socket',async()=>{
 const f=await fixture();try {
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,1),true);
  f.owner.step(3/60,1);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],0);
  f.owner.step(3/60,2);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.owner.tick,6);assert.equal(f.frame.data.orchardCollars.progress[1],1);
  f.owner.step(2/60,2);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],1);
  f.owner.step(0,3);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],1);
 }finally{f.close();}
});

test('fresh separate-body blocker pauses both jaws and preserves intent for later clearance',async()=>{
 const f=await fixture();try {
  const peer=f.sim.spawn({type:'wreck',pos:{x:18.4,z:-0.7},radius:.3,hull:100,physicsBody:{dynamic:false,shape:'ball',radius:.3,mass:10,inertiaY:10,material:'station'},data:{}});
  f.owner.syncFromEntities([f.frame,peer]);assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
  const rec=f.owner.records.get(f.frame.id),before=rec.colliders.map(c=>({...c.translationWrtParent()}));
  f.owner.step(1/60,1);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],0);assert.deepEqual(rec.colliders.map(c=>({...c.translationWrtParent()})),before);
  f.owner.records.get(peer.id).body.setTranslation({x:200,y:0,z:200},false);
  f.owner.step(1/60,2);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],1);
 }finally{f.close();}
});
test('unsupported setter override refuses before the wrapper or either jaw moves',async()=>{
 const f=await fixture();try {
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
  const rig=G.rigs.find(r=>r.socket===1),index=G.parts.findIndex(p=>p.id===rig.partId),c=f.owner.records.get(f.frame.id).colliders[index];
  let calls=0;const set=c.setTranslationWrtParent;c.setTranslationWrtParent=function(...args){calls++;return set.apply(this,args);};
  f.owner.step(1/60,1);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(calls,0);assert.equal(f.frame.data.orchardCollars.progress[1],0);delete c.setTranslationWrtParent;
 }finally{f.close();}
});

test('same-entity native canonicalization preserves pending intent and per-tick credit',async()=>{
 const f=await fixture();try {
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
  f.owner.step(1/60,1);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],1);
  const snapshot=f.owner.exportWorldSnapshot();assert.ok(snapshot);assert.equal(f.owner.canonicalizeWorldSnapshot(snapshot),true);
  assert.equal(f.owner.readOrchardFramePose(f.frame).completedNativeTick,null);
  f.owner.step(1/60,1);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],1);
  f.owner.step(1/60,2);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],2);
 }finally{f.close();}
});

test('a nested direct world solve is refused during completed contact publication',async()=>{
 const f=await fixture();try {
  const peer=f.sim.spawn({type:'payload',pos:{x:200,z:200},vel:{x:12,z:0},hull:100,radius:1,
   physicsBody:{dynamic:true,shape:'ball',radius:1,mass:10,inertiaY:10,material:'pod'},data:{}});
  f.owner.syncFromEntities([f.frame,peer]);f.owner.step(1/60,1);const rec=f.owner.records.get(peer.id),before={...rec.body.translation()};
  f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.world.step());
  assert.deepEqual({...rec.body.translation()},before);
 }finally{f.close();}
});


test('pose receipts and motion requests require the exact supplied entity, before and after completion',async()=>{
 const f=await fixture();try {
  const copy={...f.frame,occupantGeneration:f.frame.occupantGeneration};
  assert.ok(f.owner.readOrchardFramePose(f.frame));
  assert.equal(f.owner.readOrchardFramePose(copy),null);
  assert.equal(f.owner.requestOrchardMotion(copy,1,30,0),false);
  assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
  f.owner.step(1/60,1);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.owner.readOrchardFramePose(f.frame).kind,'completed-step');
  assert.equal(f.owner.readOrchardFramePose(copy),null);
 }finally{f.close();}
});
test('public presentation refuses a new same-ID life before native reconciliation',async()=>{
 const sim=createSimulation({systems:[physics]}),state=sim.state;state.mode='flight';state.world.currentSectorId='sector_tethys_junction';
 const player=sim.spawn({type:'ship',pos:{x:13230,z:8300},radius:6,hull:100,data:{defId:'ship_kestrel',fittings:[]}});state.playerId=player.id;
 const frame=sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:.713,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}});
 const facade=sim.registry.get('physics');try {
  assert.equal(await facade.prepareBackend(state),true);assert.ok(readOrchardNativePose(state,frame));
  const replacement={...frame,occupantGeneration:frame.occupantGeneration+1};state.entities.set(frame.id,replacement);
  assert.equal(readOrchardNativePose(state,replacement),null);assert.equal(readOrchardNativePose(state,frame),null);
 }finally{facade._sg02?.dispose();sim.dispose();}
});


test('one writable motor state cannot belong to two independent source frames',async()=>{
 const state=createOrchardMotorState(),a=await fixture(state),b=await fixture(state);try {
  assert.equal(a.owner.requestOrchardMotion(a.frame,1,30,0),true);
  assert.equal(b.owner.requestOrchardMotion(b.frame,1,30,0),false);
  assert.equal(b.owner.records.has(b.frame.id),false,'shared writable storage never binds a second native frame');
  a.owner.step(1/60,1);a.owner.publishCompletedOrchardContacts(a.owner.completedOrchardTail(),()=>a.owner.drainContactImpacts());
  assert.equal(state.progress[1],1);assert.equal(b.owner.readOrchardFramePose(b.frame),null);
 }finally{a.close();b.close();}
});
test('a late unsupported setter blocks rollback, quarantines and recovers only the same fixed frame',async()=>{
 const f=await fixture();try {
  const peer=f.sim.spawn({type:'payload',pos:{x:200,z:200},radius:1,hull:100,physicsBody:{dynamic:true,shape:'ball',radius:1,mass:10,inertiaY:10,material:'pod'},data:{}});
  f.owner.syncFromEntities([f.frame,peer]);const rec=f.owner.records.get(f.frame.id),other=f.owner.records.get(peer.id),world=f.owner.world;
  const rig=G.rigs.find(r=>r.socket===1),collider=rec.colliders[G.parts.findIndex(p=>p.id===rig.partId)],map=f.owner._colliderOwners,get=map.get;
  let installed=false,calls=0;assert.equal(f.owner.requestOrchardMotion(f.frame,1,30,0),true);
  f.owner.step(1/60,1);const tick=f.owner.tick,debt=f.owner.accumulator,velocity=other.body.linvel();
  map.get=function(key){const result=get.call(this,key);if(!installed && Math.abs(collider.translationWrtParent().x)>1e-5){installed=true;collider.setRotationWrtParent=()=>{calls++;throw Error('unsupported');};}return result;};
  f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(installed,true);assert.equal(calls,0);assert.equal(f.frame.data.orchardCollars.progress[1],0);
  assert.equal(f.owner.orchardAuthorityAvailable(),false);assert.equal(f.owner.exportWorldSnapshot(),null);
  f.owner.step(1/60,2);assert.equal(f.owner.tick,tick);assert.equal(f.owner.accumulator,debt);
  delete map.get;delete collider.setRotationWrtParent;
  assert.equal(f.owner.recoverOrchardFrame(),true);
  assert.equal(f.owner.world,world);assert.notEqual(f.owner.records.get(f.frame.id),rec);assert.equal(f.owner.records.get(peer.id),other);
  assert.deepEqual(other.body.linvel(),velocity);assert.equal(f.owner.tick,tick);assert.equal(f.owner.accumulator,debt);
  assert.equal(f.owner.readOrchardFramePose(f.frame).completedNativeTick,null);assert.ok(f.owner.exportWorldSnapshot());
  f.owner.step(1/60,2);f.owner.publishCompletedOrchardContacts(f.owner.completedOrchardTail(),()=>f.owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],1);
 }finally{f.close();}
});

test('new frame-incident native constraint during source recheck prevents motor publication',async()=>{const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}}),peer=sim.spawn({type:'payload',pos:{x:200,z:200},radius:1,hull:100,physicsBody:{dynamic:true,shape:'ball',radius:1,mass:10,inertiaY:10,material:'pod'},data:{}}),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame,peer]);const rec=owner.records.get(frame.id),other=owner.records.get(peer.id),rig=G.rigs.find(r=>r.socket===1),collider=rec.colliders[G.parts.findIndex(p=>p.id===rig.partId)];let joint;const map=owner._colliderOwners,get=map.get;try{assert.equal(owner.requestOrchardMotion(frame,1,30,0),true);owner.step(1/60,1);map.get=function(key){const result=get.call(this,key);if(!joint&&Math.abs(collider.translationWrtParent().x)>1e-5)joint=owner.world.createImpulseJoint(owner.RAPIER.JointData.rope(400,{x:0,y:0,z:0},{x:0,y:0,z:0}),rec.body,other.body,true);return result;};owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());assert.ok(joint,'the real native joint was created after a tentative jaw write');assert.equal(frame.data.orchardCollars.progress[1],0,'a new incident constraint cannot accompany a committed step');assert.equal(owner.world.impulseJoints.get(joint.handle),joint);assert.equal(owner.orchardAuthorityAvailable(),false);assert.equal(owner.recoverOrchardFrame(),false);}finally{delete map.get;owner.dispose();sim.dispose();}});
