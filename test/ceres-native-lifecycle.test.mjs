import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {queuePhysicsImpulse,physicsBodyNativeReady,markPhysicsBodyNativeFailure,clearPhysicsBodyNativeFailure} from '../src/core/physicsAuthority.js';
const DT=1/60;
const body=(id,x)=>({id,occupantGeneration:id,type:'wreck',alive:true,hull:100,hullMax:100,collides:true,radius:6,mass:24,pos:{x,z:0},vel:{x:0,z:0},rot:0,angVel:0,data:{},physicsBody:{schemaVersion:1,dynamic:true,ccd:true,shape:'ball',radius:6,mass:24,inertiaY:48,revision:0}});
async function fixture(){
 const native=await createSg02DynamicBodyOwner(),a=body(1,0),b=body(2,100);native.syncFromEntities([a,b]);
 assert.ok(native.createAttachment({attachmentId:'held',ownerId:1,targetId:2,restLength:100,sourceAnchorLocal:{x:0,z:0},targetAnchorLocal:{x:0,z:0}}));
 const sync=()=>native.syncFromEntities([a,b]);return {native,a,b,sync};
}
test('withdrawn exact body loses native force/contact authority and resumes the same semantic rope only for its same life',async()=>{
 const t=await fixture();try{
  const line=t.native.attachments.get('held'),spec=t.b.physicsBody;
  t.b.physicsBody=false;t.sync();assert.equal(t.native.records.has(2),false);assert.equal(t.native.attachments.size,0);assert.equal(t.native.world.bodies.len(),1);
  queuePhysicsImpulse(t.b,{x:2400,y:0,z:0});t.b.physicsBody=spec;t.sync();
  assert.equal(t.native.attachments.size,1);assert.equal(t.native.attachments.get('held').restLength,line.restLength);
  t.native.step(DT);assert.equal(t.b.vel.x,0,'absent-body command cannot replay after readmission');
  t.b.physicsBody=false;t.sync();t.b.occupantGeneration++;t.b.physicsBody=spec;t.sync();
  assert.equal(t.native.attachments.size,0);assert.equal(t.native._suspendedAttachments.size,1);
  queuePhysicsImpulse(t.b,{x:240,y:0,z:0});t.sync();t.native.step(DT);assert.ok(t.b.vel.x>0,'old suspended lease cannot consume a replacement life command');
 }finally{t.native.dispose();}
});
test('shape and fixed-body rebuild keep logical line, anchors, earned spring state and physical pose',async()=>{
 const t=await fixture();try{
  const line=t.native.attachments.get('held'),spring=line.springState,anchors=[line.anchorA,line.anchorB];spring.lastStoredEnergy=123;
  const before={...t.b.pos},prior=t.native.records.get(2);
  t.b.physicsBody={...t.b.physicsBody,radius:7,revision:1};t.sync();
  const next=t.native.records.get(2);assert.notEqual(next,prior);assert.equal(t.native.attachments.get('held'),line);assert.equal(line.target,next);
  assert.equal(line.springState,spring);assert.equal(spring.lastStoredEnergy,123);assert.deepEqual([line.anchorA,line.anchorB],anchors);assert.deepEqual(t.b.pos,before);
  t.b.physicsBody={...t.b.physicsBody,dynamic:false,revision:2};t.sync();assert.equal(t.native.records.get(2).spec.dynamic,false);assert.equal(t.native.attachments.get('held'),line);assert.equal(line.springState,spring);
 }finally{t.native.dispose();}
});
test('failed coupled rebuild has bounded clean retries and re-arms only after a new recipe',async()=>{
 const t=await fixture();try{
  const create=t.native.world.createCollider.bind(t.native.world),line=t.native.attachments.get('held'),spring=line.springState;spring.lastStoredEnergy=123;
  let attempts=0;t.native.world.createCollider=()=>{attempts++;throw new Error('injected constructor failure');};
  t.b.physicsBody={...t.b.physicsBody,radius:7,revision:1};t.sync();assert.equal(t.native.records.has(2),false);assert.equal(t.native.world.bodies.len(),1);assert.equal(physicsBodyNativeReady(t.b),false);
  for(let i=0;i<10;i++)t.sync();assert.equal(attempts,4);assert.equal(t.native._pendingNativeRebuilds.get(2).attempts,4);assert.equal(t.native.world.bodies.len(),1);
  t.native.world.createCollider=create;t.sync();assert.equal(t.native.records.has(2),false,'same failed recipe does not spin forever');
  t.b.physicsBody={...t.b.physicsBody,revision:2};t.sync();assert.equal(t.native.records.has(2),true);assert.equal(physicsBodyNativeReady(t.b),true);assert.equal(t.native.world.bodies.len(),2);
  assert.equal(t.native.attachments.get('held'),line);assert.equal(line.springState,spring);assert.equal(spring.lastStoredEnergy,123);
 }finally{t.native.dispose();}
});
test('stale native owner cannot clear a newer failure receipt',()=>{
 const e=body(1,0),a={},b={},old=markPhysicsBodyNativeFailure(e,a),latest=markPhysicsBodyNativeFailure(e,b);
 clearPhysicsBodyNativeFailure(e,a,old);assert.equal(physicsBodyNativeReady(e),false);clearPhysicsBodyNativeFailure(e,b,latest);assert.equal(physicsBodyNativeReady(e),true);
});
