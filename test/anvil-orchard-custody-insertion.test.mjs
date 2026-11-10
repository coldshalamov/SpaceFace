import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {createOrchardMotorState} from '../src/core/anvilOrchardNative.js';
import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec,orchardPodBodySpec} from '../src/data/anvilOrchardBody.js';
async function setup(progress=[0,0,0]){
 const sim=createSimulation(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 const frame=sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:.713,radius:G.radius,mass:1e6,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState(progress)}});
 owner.syncFromEntities([frame]);return {sim,owner,frame,close(){owner.dispose();sim.dispose();},stage(socket=1){const slot=G.pods[socket],c=Math.cos(frame.rot),s=Math.sin(frame.rot),lot=`anvil_storm_orchard:${socket}:${frame.data.orchardCollars.cycles[socket]+1}`;return sim.helpers.stageEntitySpawn({type:'payload',pos:{x:frame.pos.x+c*slot.pos.x-s*slot.pos.z,z:frame.pos.z+s*slot.pos.x+c*slot.pos.z},rot:frame.rot,radius:G.pod.radius,hull:100,flags:{persistent:true},physicsBody:orchardPodBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'pod',masslineTetherable:false,worldRecordId:lot,identityKey:lot,authoredAssetId:G.pod.assetId,authoredPayloadAssetId:G.pod.assetId,amount:4}});}};
}
test('actual normal-owner fixed pod remains private until staged native and core publication',async()=>{
 const h=await setup();try{const stage=h.stage(),entity=stage.entity,oldData=h.frame.data,rec=h.owner.records.get(h.frame.id),world=h.owner.world;
  const prepared=h.owner.prepareOrchardPodInsertion(h.frame,entity,1);assert.ok(prepared);
  assert.equal(h.owner.orchardAuthorityAvailable(),false);assert.equal(h.owner.exportWorldSnapshot(),null);assert.equal(h.owner.records.has(entity.id),false);assert.equal(h.sim.state.entities.has(entity.id),false);assert.equal(h.owner.world.bodies.len(),2);
  assert.equal(stage.commit(prepared),true);assert.equal(prepared.committed,true);assert.equal(stage.current(),true);assert.equal(h.owner.world,world);assert.equal(h.owner.records.get(h.frame.id),rec);assert.notEqual(h.frame.data,oldData);assert.deepEqual(h.frame.data.orchardCollars.cycles,[0,1,0]);assert.deepEqual(h.frame.data.orchardCollars.progress,[0,0,0]);
  assert.equal(h.owner.records.get(entity.id).body.isFixed(),true);assert.equal(h.sim.state.entities.get(entity.id),entity);assert.equal(h.owner.orchardAuthorityAvailable(),true);assert.ok(h.owner.readOrchardFramePose(h.frame));assert.ok(h.owner.exportWorldSnapshot());
 }finally{h.close();}
});
test('refused core commit aborts only the unclaimed private native pod',async()=>{
 const h=await setup();try{const stage=h.stage(),old=h.frame.data,prepared=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(prepared);
  assert.equal(stage.commit({preflight(){return false;},commit:prepared.commit,abort:prepared.abort}),false);assert.equal(h.owner.world.bodies.len(),1);assert.equal(h.owner.orchardAuthorityAvailable(),true);assert.equal(h.frame.data,old);assert.equal(h.owner.records.has(stage.entity.id),false);assert.equal(h.sim.state.entities.has(stage.entity.id),false);
 }finally{h.close();}
});
test('an existing native occupant refuses allocation and preserves all finite/public custody',async()=>{
 const h=await setup();try{const first=h.stage();const p=h.owner.prepareOrchardPodInsertion(h.frame,first.entity,1);assert.ok(p);assert.equal(first.commit(p),true);
  const second=h.stage(),before=h.owner.world.bodies.len();assert.equal(h.owner.prepareOrchardPodInsertion(h.frame,second.entity,1),null);assert.equal(h.owner.world.bodies.len(),before);assert.equal(h.owner.orchardAuthorityAvailable(),true);assert.equal(second.committed,false);second.abort();
 }finally{h.close();}
});
test('closed-cycle insertion preserves other jaw progress, pending intent and same-tick motor credit',async()=>{
 const h=await setup([14,0,0]);try{
  assert.equal(h.owner.requestOrchardMotion(h.frame,0,30,0),true);h.owner.step(1/60,1);h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(),()=>h.owner.drainContactImpacts());assert.deepEqual(h.frame.data.orchardCollars.progress,[15,0,0]);
  const stage=h.stage(),p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);assert.equal(stage.commit(p),true);assert.deepEqual(h.frame.data.orchardCollars.progress,[15,0,0]);
  h.owner.step(1/60,1);h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(),()=>h.owner.drainContactImpacts());assert.deepEqual(h.frame.data.orchardCollars.progress,[15,0,0]);
  h.owner.step(1/60,2);h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(),()=>h.owner.drainContactImpacts());assert.deepEqual(h.frame.data.orchardCollars.progress,[16,0,0]);
 }finally{h.close();}
});
for(const claim of ['record','collider','manual','suspended','joint'])test(`failed insertion preserves a foreign ${claim} claim until deliberate cleanup`,async()=>{
 const h=await setup();let allocated,joint;try{
  const peer=h.sim.spawn({type:'payload',pos:{x:14000,z:9000},radius:1,hull:100,physicsBody:{dynamic:true,mass:10,inertiaY:10,shape:'ball',material:'pod'},data:{}});h.owner.syncFromEntities([h.frame,peer]);const other=h.owner.records.get(peer.id);
  h.owner._syncCeresWorkfleetRecord=function(rec){allocated=rec;if(claim==='record')h.owner.records.set(98765,rec);if(claim==='collider')h.owner._colliderOwners.set(rec.collider.handle,{rec,collider:rec.collider});if(claim==='manual')h.owner.attachments.set('claim',{owner:rec,target:other});if(claim==='suspended')h.owner._suspendedAttachments.set('claim',{attachment:{owner:rec,target:other}});if(claim==='joint')joint=h.owner.world.createImpulseJoint(h.owner.RAPIER.JointData.rope(1000,{x:0,y:0,z:0},{x:0,y:0,z:0}),rec.body,other.body,true);throw Error('claimed-stage');};
  const stage=h.stage();assert.equal(h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1),null);assert.ok(allocated);assert.equal(h.owner.world.getRigidBody(allocated.body.handle),allocated.body);assert.equal(h.owner.orchardAuthorityAvailable(),false);assert.equal(h.owner.cancelOrchardPodInsertion(),false);assert.equal(h.sim.state.entities.has(stage.entity.id),false);assert.deepEqual(h.frame.data.orchardCollars.cycles,[0,0,0]);
  delete h.owner._syncCeresWorkfleetRecord;if(claim==='record')h.owner.records.delete(98765);if(claim==='collider')h.owner._colliderOwners.delete(allocated.collider.handle);h.owner.attachments.delete('claim');h.owner._suspendedAttachments.delete('claim');if(joint)h.owner.world.removeImpulseJoint(joint,true);
  assert.equal(h.owner.cancelOrchardPodInsertion(),true);assert.equal(h.owner.world.getRigidBody(allocated.body.handle),null);assert.equal(h.owner.orchardAuthorityAvailable(),true);assert.equal(h.owner.records.get(peer.id),other);stage.abort();
 }finally{delete h.owner._syncCeresWorkfleetRecord;h.close();}
});
for(const seam of ['data','native','slot'])test(`changed ${seam} between insertion preparation and commit retains prior publication`,async()=>{
 const h=await setup();try{const stage=h.stage(),oldData=h.frame.data,p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);
  if(seam==='data')stage.entity.data={...stage.entity.data};if(seam==='native'){let body;h.owner.world.bodies.forEach(b=>{if(b!==h.owner.records.get(h.frame.id).body)body=b;});body.setTranslation({x:0,y:0,z:0},false);}if(seam==='slot')Object.defineProperty(h.frame,'data',{writable:false});
  assert.equal(stage.commit(p),false);assert.equal(h.sim.state.entities.has(stage.entity.id),false);assert.equal(h.owner.records.has(stage.entity.id),false);assert.equal(h.frame.data,oldData);assert.equal(h.owner.world.bodies.len(),1);
  if(seam==='slot')Object.defineProperty(h.frame,'data',{writable:true});
 }finally{h.close();}
});
test('cold owner replacement during private allocation stops the old insertion without touching the successor',async()=>{
 const h=await setup();try{const world=h.owner.world,stage=h.stage();let changed=false;h.owner._syncCeresWorkfleetRecord=function(){changed=true;delete h.owner._syncCeresWorkfleetRecord;h.owner.rebuildWorldFromEntities([h.frame],{orchardColdRestore:true});};
  assert.equal(h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1),null);assert.equal(changed,true);assert.notEqual(h.owner.world,world);assert.equal(h.owner.world.bodies.len(),1);assert.ok(h.owner.readOrchardFramePose(h.frame));assert.ok(h.owner.exportWorldSnapshot());assert.equal(h.sim.state.entities.has(stage.entity.id),false);stage.abort();
 }finally{delete h.owner._syncCeresWorkfleetRecord;h.close();}
});
test('real Save JSON Continue after staged publication preserves one finite debit, fixed pod and cold frame cycle',async()=>{
 const {physics}=await import('../src/core/physics.js');const {save}=await import('../src/save/saveSystem.js');const {asteroidSites}=await import('../src/systems/asteroidSites.js');const {createOrchardRecord,normalizeOrchardRecord}=await import('../src/data/anvilOrchard.js');
 const sim=createSimulation({systems:[asteroidSites,physics,save]});sim.state.mode='flight';sim.state.world.currentSectorId='sector_tethys_junction';
 try{
  const player=sim.spawn({type:'ship',pos:{x:14000,z:9000},radius:6,hull:100,data:{defId:'ship_kestrel',fittings:[]}});sim.state.playerId=player.id;
  const frame=sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:.713,radius:G.radius,hull:300,flags:{persistent:true},physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}});
  const facade=sim.registry.get('physics'),saves=sim.registry.get('save');assert.equal(await facade.prepareBackend(sim.state),true);const owner=facade._sg02;
  sim.state.sites.anvilOrchard=createOrchardRecord(0);const prior=sim.state.sites.anvilOrchard;
  const slot=G.pods[1],c=Math.cos(frame.rot),s=Math.sin(frame.rot),lot='anvil_storm_orchard:1:1';
  const stage=sim.helpers.stageEntitySpawn({type:'payload',pos:{x:frame.pos.x+c*slot.pos.x-s*slot.pos.z,z:frame.pos.z+s*slot.pos.x+c*slot.pos.z},rot:frame.rot,radius:G.pod.radius,hull:100,flags:{persistent:true},physicsBody:orchardPodBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'pod',masslineTetherable:false,worldRecordId:lot,identityKey:lot,authoredAssetId:G.pod.assetId,authoredPayloadAssetId:G.pod.assetId,amount:4}});
  const prepared=owner.prepareOrchardPodInsertion(frame,stage.entity,1);assert.ok(prepared);
  const tentative=JSON.parse(JSON.stringify(saves.serialize('tentative-pod')));assert.equal(tentative.data.sites.anvilOrchard.sourceRemaining,48);assert.equal(tentative.data.sites.anvilOrchard.lots.length,0);
  const next=structuredClone(prior);next.sourceRemaining-=4;next.lots.push({id:lot,socket:1,cycle:1,units:4,outcome:'retained'});Object.assign(next.sockets[1],{cycle:1,lotId:lot,status:'stowed'});assert.ok(normalizeOrchardRecord(next));
  let loaded=false,after;
  sim.bus.on('entity:spawned',event=>{if(event.entity!==stage.entity)return;after=JSON.parse(JSON.stringify(saves.serialize('committed-pod')));delete after.checksum;assert.equal(saves.loadEnvelope(after),true);facade._finishNativeRestore();loaded=true;});
  assert.equal(stage.commit({preflight:prepared.preflight,commit(){if(!prepared.commit())return false;sim.state.sites.anvilOrchard=next;return true;},abort:prepared.abort}),true);
  assert.equal(loaded,true);assert.equal(stage.committed,true);assert.equal(stage.current(),false);assert.equal(sim.state.sites.anvilOrchard.sourceRemaining,44);assert.equal(sim.state.sites.anvilOrchard.lots.length,1);
  assert.equal(await facade.prepareBackend(sim.state),true);const restoredFrame=sim.state.entityList.find(e=>e.data?.orchardKind==='frame'),pods=sim.state.entityList.filter(e=>e.data?.orchardKind==='pod');assert.equal(pods.length,1);assert.equal(pods[0].data.amount,4);assert.equal(pods[0].physicsBody.dynamic,false);assert.deepEqual(restoredFrame.data.orchardCollars.cycles,[0,1,0]);assert.deepEqual(facade._sg02.readOrchardFramePose(restoredFrame)?.progress,[0,0,0]);
  facade._syncSg02DynamicAuthorityEntities(sim.state);assert.ok(facade._sg02.readOrchardFramePose(restoredFrame));assert.equal(facade._sg02.records.get(pods[0].id).body.isFixed(),true);
 }finally{sim.dispose();}
});
for(const kind of ['near-root','local-pose','lower-face','spec'])test(`exact private native pod validation refuses ${kind} tamper`,async()=>{
 const h=await setup();try{const stage=h.stage(),p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);let body;h.owner.world.bodies.forEach(b=>{if(b!==h.owner.records.get(h.frame.id).body)body=b;});const collider=body.collider(0);
  if(kind==='near-root'){const t=body.translation();body.setTranslation({...t,x:t.x+.002},false);}if(kind==='local-pose')collider.setTranslationWrtParent({x:.0001,y:0,z:0});
  if(kind==='lower-face'){const vertices=collider.vertices(),ys=[];for(let i=1;i<vertices.length;i+=3)ys.push(vertices[i]);const top=Math.max(...ys),points=[0,Math.min(...ys),0];for(const [x,z] of G.pod.parts[0].points)points.push(x,top,z);collider.setShape(new h.owner.RAPIER.ConvexPolyhedron(new Float32Array(points)));}
  if(kind==='spec')stage.entity.physicsBody.mass+=1;if(kind==='extra-collider')h.owner.world.createCollider(h.owner.RAPIER.ColliderDesc.ball(.1),body);
  assert.equal(stage.commit(p),false);assert.equal(h.owner.records.has(stage.entity.id),false);assert.equal(h.sim.state.entities.has(stage.entity.id),false);assert.equal(h.owner.world.bodies.len(),1);assert.deepEqual(h.frame.data.orchardCollars.cycles,[0,0,0]);
 }finally{h.close();}
});
test('tentative insertion denies a direct public World.step and retains no old solve credit',async()=>{
 const h=await setup();try{const peer=h.sim.spawn({type:'payload',pos:{x:14000,z:9000},vel:{x:3,z:0},radius:1,hull:100,physicsBody:{dynamic:true,mass:10,inertiaY:10,shape:'ball',material:'pod'},data:{}});h.owner.syncFromEntities([h.frame,peer]);const body=h.owner.records.get(peer.id).body,before=body.translation();
  const stage=h.stage(),p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);
  h.owner.RAPIER.World.prototype.step.call(h.owner.world);assert.deepEqual(body.translation(),before);assert.equal(stage.commit(p),false);assert.equal(h.owner.orchardAuthorityAvailable(),true);assert.equal(h.owner.world.bodies.len(),2);assert.equal(h.sim.state.entities.has(stage.entity.id),false);
 }finally{h.close();}
});

test('an added foreign native collider retains the aborted body until that allocation is released',async()=>{
 const h=await setup();try{const stage=h.stage(),p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);let body;h.owner.world.bodies.forEach(b=>{if(b!==h.owner.records.get(h.frame.id).body)body=b;});
  const extra=h.owner.world.createCollider(h.owner.RAPIER.ColliderDesc.ball(.1),body);assert.equal(stage.commit(p),false);assert.equal(h.owner.world.getRigidBody(body.handle),body);assert.equal(h.owner.world.getCollider(extra.handle),extra);assert.equal(h.owner.orchardAuthorityAvailable(),false);assert.equal(h.sim.state.entities.has(stage.entity.id),false);
  h.owner.world.removeCollider(extra,false);assert.equal(h.owner.cancelOrchardPodInsertion(),true);assert.equal(h.owner.world.bodies.len(),1);assert.equal(h.owner.orchardAuthorityAvailable(),true);
 }finally{h.close();}
});
for(const key of ['entity','spec','revision','spines'])test(`factory record ${key} substitution refuses before publication`,async()=>{
 const h=await setup();try{h.owner._syncCeresWorkfleetRecord=function(r){if(key==='entity')r.entity={...r.entity};if(key==='spec')r.spec.mass+=1;if(key==='revision')r.revision++;if(key==='spines')r.coincidentSpines[0].ox=10;};
  const stage=h.stage();assert.equal(h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1),null);assert.equal(h.owner.world.bodies.len(),1);assert.equal(h.owner.orchardAuthorityAvailable(),true);assert.equal(h.sim.state.entities.has(stage.entity.id),false);stage.abort();
 }finally{delete h.owner._syncCeresWorkfleetRecord;h.close();}
});

test('fixed insertion requires explicit non-tetherable custody before any native allocation',async()=>{
 const h=await setup();try{const stage=h.stage();stage.entity.data.masslineTetherable=true;assert.equal(h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1),null);assert.equal(h.owner.world.bodies.len(),1);assert.equal(h.owner.orchardAuthorityAvailable(),true);stage.abort();}finally{h.close();}
});
for(const kind of ['owner-world','body-handle','collider-handle'])test(`abort refuses ${kind} accessors without calling stale lookup surfaces`,async()=>{
 const h=await setup();let object,key,original;try{const stage=h.stage(),p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);let body;h.owner.world.bodies.forEach(b=>{if(b!==h.owner.records.get(h.frame.id).body)body=b;});
  object=kind==='owner-world'?h.owner:kind==='body-handle'?body:body.collider(0);key=kind==='owner-world'?'world':'handle';original=Object.getOwnPropertyDescriptor(object,key);let calls=0;
  Object.defineProperty(object,key,{configurable:true,get(){calls++;throw Error('unsupported-getter');}});
  assert.equal(p.abort(),false);assert.equal(calls,0);Object.defineProperty(object,key,original);assert.equal(h.owner.cancelOrchardPodInsertion(),true);assert.equal(h.owner.world.bodies.len(),1);stage.abort();
 }finally{if(original)Object.defineProperty(object,key,original);h.close();}
});

// Revised commit contract: callback-capable preparation ends before the core's final
// index fence. Commit may only use inert ownership checks and the retained native scan.
test('native insertion commit invokes no caller Map or array dispatch after core preflight',async()=>{
 const h=await setup();const restored=[];let calls=0;
 try{const stage=h.stage(),p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);
  const install=(object,key)=>{const prior=Object.getOwnPropertyDescriptor(object,key);restored.push(()=>prior?Object.defineProperty(object,key,prior):delete object[key]);Object.defineProperty(object,key,{configurable:true,value(){calls++;throw Error('late-callback');}});};
  assert.equal(stage.commit({preflight(){if(!p.preflight())return false;
   for(const key of ['records','_colliderOwners','attachments','_suspendedAttachments'])for(const method of ['get','values',Symbol.iterator])install(h.owner[key],method);
   const rec=Map.prototype.get.call(h.owner.records,h.frame.id);for(const array of [rec.colliders,rec.coincidentSpines])for(const method of ['every','map',Symbol.iterator])install(array,method);
   return true;},commit:p.commit,abort:p.abort}),true);
  assert.equal(calls,0);assert.equal(p.committed,true);assert.equal(Map.prototype.get.call(h.owner.records,stage.entity.id)?.entity,stage.entity);assert.deepEqual(h.frame.data.orchardCollars.cycles,[0,1,0]);
 }finally{for(const restore of restored.reverse())restore();h.close();}
});
test('ordinary foreign core spawn during native preflight preserves foreign publication and refuses pod commit',async()=>{
 const h=await setup(),map=h.owner.records,get=map.get;let fired=false,foreign,commitCalls=0;
 try{const stage=h.stage(),prior=h.frame.data,p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);
  map.get=function(key){const out=get.call(this,key);if(!fired){fired=true;foreign=h.sim.spawn({type:'fx',physicsBody:false,data:{retained:'foreign-publication'}});}return out;};
  assert.equal(stage.commit({preflight:p.preflight,commit(){commitCalls++;return p.commit();},abort:p.abort}),false);
  assert.equal(fired,true);assert.equal(commitCalls,0);assert.equal(h.sim.state.entities.get(foreign.id),foreign);assert.equal(p.committed,false);assert.equal(h.frame.data,prior);
  assert.equal(map.has(stage.entity.id),false);assert.equal(h.owner.world.bodies.len(),1);assert.equal(h.sim.state.entities.has(stage.entity.id),false);
 }finally{delete map.get;h.close();}
});
for(const kind of ['source','native','collider-index'])test(`callback-free native commit refuses post-preflight ${kind} mutation`,async()=>{
 const h=await setup();let restore=()=>{},calls=0;
 try{const stage=h.stage(),prior=h.frame.data,p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);
  assert.equal(stage.commit({preflight(){if(!p.preflight())return false;
   if(kind==='source'){Object.defineProperty(h.frame,'hull',{configurable:true,get(){calls++;return 300;}});restore=()=>Object.defineProperty(h.frame,'hull',{configurable:true,writable:true,enumerable:true,value:300});}
   if(kind==='native'){let body;h.owner.world.bodies.forEach(b=>{if(b!==h.owner.records.get(h.frame.id).body)body=b;});body.setTranslation({x:0,y:0,z:0},false);}
   if(kind==='collider-index'){const rec=h.owner.records.get(h.frame.id),d=Object.getOwnPropertyDescriptor(rec.colliders,'0');Object.defineProperty(rec.colliders,'0',{configurable:true,get(){calls++;return d.value;}});restore=()=>Object.defineProperty(rec.colliders,'0',d);}
   return true;},commit:p.commit,abort:p.abort}),false);
  assert.equal(calls,0);assert.equal(p.committed,false);assert.equal(h.frame.data,prior);assert.equal(h.owner.records.has(stage.entity.id),false);assert.equal(h.sim.state.entities.has(stage.entity.id),false);
 }finally{restore();h.owner.cancelOrchardPodInsertion();h.close();}
});
for(const key of ['entity','body'])test(`post-preflight source record ${key} accessor is refused before any callback`,async()=>{
 const h=await setup();let rec,descriptor,calls=0;
 try{const stage=h.stage(),prior=h.frame.data,p=h.owner.prepareOrchardPodInsertion(h.frame,stage.entity,1);assert.ok(p);rec=h.owner.records.get(h.frame.id);descriptor=Object.getOwnPropertyDescriptor(rec,key);
  assert.equal(stage.commit({preflight(){if(!p.preflight())return false;Object.defineProperty(rec,key,{configurable:true,get(){calls++;Object.defineProperty(rec,key,descriptor);h.sim.spawn({type:'fx',physicsBody:false,data:{foreign:true}});return descriptor.value;}});return true;},commit:p.commit,abort:p.abort}),false);
  assert.equal(calls,0);assert.equal(p.committed,false);assert.equal(h.frame.data,prior);assert.equal(h.sim.state.entities.has(stage.entity.id),false);
 }finally{if(rec&&descriptor)Object.defineProperty(rec,key,descriptor);h.owner.cancelOrchardPodInsertion();h.close();}
});
