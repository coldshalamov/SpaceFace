import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {createOrchardMotorState} from '../src/core/anvilOrchardNative.js';
import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec} from '../src/data/anvilOrchardBody.js';

async function quarantined() {
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}});
 const peer=sim.spawn({type:'payload',pos:{x:200,z:200},radius:1,hull:100,physicsBody:{dynamic:true,shape:'ball',radius:1,mass:10,inertiaY:10,material:'pod'},data:{}});
 const owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame,peer]);
 const rec=owner.records.get(frame.id),other=owner.records.get(peer.id),rig=G.rigs.find(r=>r.socket===1),collider=rec.colliders[G.parts.findIndex(p=>p.id===rig.partId)];
 const map=owner._colliderOwners,get=map.get;let installed=false,calls=0;
 assert.equal(owner.requestOrchardMotion(frame,1,30,0),true);owner.step(1/60,1);
 map.get=function(key){const result=get.call(this,key);if(!installed && Math.abs(collider.translationWrtParent().x)>1e-5){installed=true;collider.setRotationWrtParent=()=>{calls++;throw Error('unsupported');};}return result;};
 owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
 delete map.get;delete collider.setRotationWrtParent;
 assert.equal(installed,true);assert.equal(calls,0);assert.equal(owner.orchardAuthorityAvailable(),false);
 return {sim,frame,peer,owner,rec,other,close(){owner.dispose();sim.dispose();}};
}
test('passive settling cannot admit a native body while Orchard authority is quarantined', async () => {
 const f = await quarantined();
 try {
  const entity = f.sim.spawn({type:'asteroid',pos:{x:500,z:500},vel:{x:40,z:0},radius:4,mass:20,data:{}});
  const velocity = [entity.vel.x,entity.vel.y,entity.vel.z];
  const bodies = f.owner.world.bodies.len(), colliders = f.owner.world.colliders.len(), records = f.owner.records.size;
  const input = {entityId:entity.id,entity,entities:f.sim.state.entities,
   occupantGeneration:entity.occupantGeneration,minSpeed:6,reason:'swarm_round_settle'};
  assert.equal(f.owner.settlePassiveBody(input),false);
  assert.equal(f.owner.world.bodies.len(),bodies);
  assert.equal(f.owner.world.colliders.len(),colliders);
  assert.equal(f.owner.records.size,records);
  assert.equal(f.owner.records.has(entity.id),false);
  assert.equal(f.owner.orchardAuthorityAvailable(),false);
  assert.deepEqual([entity.vel.x,entity.vel.y,entity.vel.z],velocity);
 } finally {f.close();}
});
for(const change of ['data','life','spec','record','origin','root','extra-collider'])test(`recovery refuses changed ${change} without allocating or recapturing`,async()=>{
 const f=await quarantined(),{owner,frame,rec}=f;try {
  if(change==='data')frame.data={...frame.data};
  if(change==='life')Object.defineProperty(frame,'occupantGeneration',{value:frame.occupantGeneration+1,configurable:true});
  if(change==='spec')frame.physicsBody={...frame.physicsBody};
  if(change==='record')owner.records.set(frame.id,{...rec});
  if(change==='origin')owner._frameOrigin.x=1;
  if(change==='root')rec.body.setTranslation({x:1,y:0,z:0},false);
  if(change==='extra-collider')owner.world.createCollider(owner.RAPIER.ColliderDesc.ball(.1),rec.body);
  const bodies=owner.world.bodies.len(),colliders=owner.world.colliders.len();
  assert.equal(owner.recoverOrchardFrame(),false);assert.equal(owner.world.bodies.len(),bodies);assert.equal(owner.world.colliders.len(),colliders);
  assert.equal(owner.orchardAuthorityAvailable(),false);assert.equal(frame.data.orchardCollars.progress[1],0);
 }finally{f.close();}
});
for(const claim of ['record','collider-owner','manual','suspended','native-joint'])test(`failed staging retains a ${claim} claim and retries only after its release`,async()=>{
 const f=await quarantined(),{owner,frame,rec,other}=f;let staged,joint;
 const original=owner._syncCeresWorkfleetRecord;
 owner._syncCeresWorkfleetRecord=function(next){staged=next;
  if(claim==='record')owner.records.set(987654,next);
  if(claim==='collider-owner')owner._colliderOwners.set(next.collider.handle,{rec:next,collider:next.collider});
  if(claim==='manual')owner.attachments.set('stage-claim',{owner:next,target:other});
  if(claim==='suspended')owner._suspendedAttachments.set('stage-claim',{attachment:{owner:next,target:other}});
  if(claim==='native-joint')joint=owner.world.createImpulseJoint(owner.RAPIER.JointData.rope(400,{x:0,y:0,z:0},{x:0,y:0,z:0}),next.body,other.body,true);
  throw Error('stage-after-claim');
 };
 try {
  assert.equal(owner.recoverOrchardFrame(),false);assert.ok(staged);assert.equal(owner.world.getRigidBody(staged.body.handle),staged.body);
  assert.equal(owner.records.get(frame.id),rec);assert.equal(owner.records.get(f.peer.id),other);
  assert.equal(owner.orchardAuthorityAvailable(),false);
  if(joint)assert.equal(owner.world.impulseJoints.get(joint.handle),joint);
  delete owner._syncCeresWorkfleetRecord;
  if(claim==='record')owner.records.delete(987654);
  if(claim==='collider-owner')owner._colliderOwners.delete(staged.collider.handle);
  owner.attachments.delete('stage-claim');owner._suspendedAttachments.delete('stage-claim');
  if(joint)owner.world.removeImpulseJoint(joint,true);
  assert.equal(owner.recoverOrchardFrame(),true);assert.notEqual(owner.world.getRigidBody(staged.body.handle),staged.body);
  assert.ok(owner.readOrchardFramePose(frame));assert.equal(owner.records.get(f.peer.id),other);
 }finally{delete owner._syncCeresWorkfleetRecord;f.close();}
});
test('coincident root nudge is refused before allocation and may retry after the blocker moves',async()=>{
 const f=await quarantined(),{owner,rec}=f,resolve=owner._resolveCoincidentSpawnSlot;let calls=0;
 owner._resolveCoincidentSpawnSlot=function(x){calls++;return x+.25;};
 try {assert.equal(owner.recoverOrchardFrame(),false);assert.equal(calls,1);assert.equal(owner.world.bodies.len(),2);assert.equal(owner.records.get(f.frame.id),rec);
  delete owner._resolveCoincidentSpawnSlot;assert.equal(owner.recoverOrchardFrame(),true);
 }finally{delete owner._resolveCoincidentSpawnSlot;f.close();}
});
test('a new unsupported retirement dispatch stops before invocation and resumes the retained candidate',async()=>{
 const f=await quarantined(),{owner,rec}=f,map=owner._colliderOwners,get=map.get;let installed=false,calls=0;
 map.get=function(key){const result=get.call(this,key);if(!installed && rec.body.numColliders()<31){installed=true;owner.world.removeCollider=()=>{calls++;throw Error('unsupported retirement');};}return result;};
 try {
  assert.equal(owner.recoverOrchardFrame(),false);assert.equal(installed,true);assert.equal(calls,0);assert.equal(rec.body.numColliders(),30);
  let staged;owner.world.bodies.forEach(body=>{if(body!==rec.body && body!==f.other.body)staged=body;});assert.ok(staged);
  delete map.get;delete owner.world.removeCollider;
  assert.equal(owner.recoverOrchardFrame(),true);assert.equal(owner.records.get(f.frame.id).body,staged);assert.equal(owner.records.get(f.peer.id),f.other);
 }finally{delete map.get;delete owner.world.removeCollider;f.close();}
});
test('cold owner replacement during staged construction keeps the successor usable',async()=>{
 const f=await quarantined(),{owner}=f,oldWorld=owner.world;let replaced=false;
 owner._syncCeresWorkfleetRecord=function(){replaced=true;delete owner._syncCeresWorkfleetRecord;owner.rebuildWorldFromEntities([f.frame,f.peer],{orchardColdRestore:true});};
 try {
  assert.equal(owner.recoverOrchardFrame(),false);assert.equal(replaced,true);assert.notEqual(owner.world,oldWorld);
  assert.ok(owner.readOrchardFramePose(f.frame));assert.ok(owner.exportWorldSnapshot());
  owner.step(1/60,2);owner.publishCompletedOrchardContacts(owner.completedOrchardTail(),()=>owner.drainContactImpacts());
  assert.equal(f.frame.data.orchardCollars.progress[1],1);
 }finally{delete owner._syncCeresWorkfleetRecord;f.close();}
});


test('recovery final view copies never dispatch owner container iteration or publication methods',async()=>{
 const f=await quarantined(),{owner,frame}=f;let calls=0;
 const records=owner.records,owners=owner._colliderOwners,dynamic=owner.dynamicRecords;
 records[Symbol.iterator]=owners[Symbol.iterator]=dynamic[Symbol.iterator]=()=>{calls++;frame.hull=0;throw Error('foreign iteration');};
 records.set=owners.set=owners.delete=dynamic.delete=()=>{calls++;frame.hull=0;throw Error('foreign publication');};
 try {assert.equal(owner.recoverOrchardFrame(),true);assert.equal(calls,0);assert.equal(frame.hull,300);assert.ok(owner.readOrchardFramePose(frame));}
 finally {delete records[Symbol.iterator];delete owners[Symbol.iterator];delete dynamic[Symbol.iterator];delete records.set;delete owners.set;delete owners.delete;delete dynamic.delete;f.close();}
});
test('a view preparation callback changing source cannot reach the next native retirement',async()=>{
 const f=await quarantined(),{owner,frame,rec}=f,pool=owner._ghostProjectilePool,values=pool.values;let fired=false;
 pool.values=function(){if(!fired){fired=true;frame.hull=0;}return values.call(this);};
 try {assert.equal(owner.recoverOrchardFrame(),false);assert.equal(fired,true);assert.equal(owner.world.bodies.len(),2);assert.equal(rec.body.numColliders(),31);assert.equal(owner.orchardAuthorityAvailable(),false);}
 finally{delete pool.values;f.close();}
});

test('recovery final source callback cannot overwrite a newly published same-map record',async()=>{
 const f=await quarantined(),map=f.owner.records,get=map.get,handle=f.rec.body.handle;let calls=0,successor;
 try{
  map.get=function(key){const result=get.call(this,key),stack=new Error().stack;
   if(key===f.frame.id && !f.owner.world.getRigidBody(handle) && stack.includes('sourceRecordCurrent') && stack.includes('recoverySnapshot') && ++calls===2){successor={...f.rec};Map.prototype.set.call(map,key,successor);}
   return result;
  };
  const accepted=f.owner.recoverOrchardFrame();assert.ok(successor,'source mapping changes in the final authored preflight');
  assert.equal(accepted,false,'stale recovery cannot publish over a same-map successor');assert.equal(Map.prototype.get.call(map,f.frame.id),successor);assert.equal(f.owner.orchardAuthorityAvailable(),false);
 }finally{delete map.get;f.close();}
});
