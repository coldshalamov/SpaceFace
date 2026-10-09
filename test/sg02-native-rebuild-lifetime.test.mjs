import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {physicsBodyNativeReady,markPhysicsBodyNativeFailure,clearPhysicsBodyNativeFailure} from '../src/core/physicsAuthority.js';
const body=(id=1)=>({id,occupantGeneration:1,type:'wreck',alive:true,hull:100,hullMax:100,collides:true,radius:6,mass:24,pos:{x:0,z:0},vel:{x:0,z:0},rot:0,angVel:0,data:{},physicsBody:{schemaVersion:1,dynamic:true,ccd:true,shape:'ball',radius:6,mass:24,inertiaY:48,revision:0}});
function failConstruction(owner,entity) {
 const create=owner.world.createCollider.bind(owner.world);
 owner.world.createCollider=()=>{throw new Error('injected construction failure');};
 owner.syncFromEntities([entity]);
 owner.world.createCollider=create;
 assert.equal(owner.records.size,0);assert.equal(physicsBodyNativeReady(entity),false);
}
test('successful scalar native reconstruction clears the old failure receipt for the same body life',async()=>{
 const owner=await createSg02DynamicBodyOwner(),e=body();try{
  failConstruction(owner,e);
  owner.rebuildWorldFromEntities([e]);
  assert.equal(owner.records.get(e.id)?.entity,e);
  assert.equal(owner._pendingNativeRebuilds.size,0);
  assert.equal(physicsBodyNativeReady(e),true,'reconstructed live native body must re-enter query/presentation eligibility');
 }finally{owner.dispose();}
});
test('a failed body removed from the next full entity sync does not regain a native collider',async()=>{
 const owner=await createSg02DynamicBodyOwner(),e=body();try{
  failConstruction(owner,e);
  owner.syncFromEntities([]);
  assert.equal(owner.records.size,0,'native retry must not resurrect a body outside the current authoritative set');
  assert.equal(owner.world.bodies.len(),0);
  assert.equal(owner._pendingNativeRebuilds.size,0);
  assert.equal(physicsBodyNativeReady(e),true);
 }finally{owner.dispose();}
});
test('successful exact snapshot adoption clears a replaced owner failure receipt',async()=>{
 const owner=await createSg02DynamicBodyOwner(),donor=await createSg02DynamicBodyOwner(),e=body();try{
  donor.syncFromEntities([structuredClone(e)]);const cache=donor.exportWorldSnapshot();assert.ok(cache);
  failConstruction(owner,e);
  assert.equal(owner.adoptWorldSnapshot(cache,[e]),true);
  assert.equal(owner.records.get(e.id)?.entity,e);assert.equal(physicsBodyNativeReady(e),true);
 }finally{owner.dispose();donor.dispose();}
});
test('failed scalar staging retains the current owner failure receipt',async()=>{
 const owner=await createSg02DynamicBodyOwner(),e=body();try{
  failConstruction(owner,e);const world=owner.world;
  Object.defineProperty(e,'physicsSleeping',{value:'invalid',writable:false,configurable:true});
  assert.throws(()=>owner.rebuildWorldFromEntities([e]),/entity_mirror_not_writable/);
  assert.equal(owner.world,world);assert.equal(physicsBodyNativeReady(e),false);assert.equal(owner._pendingNativeRebuilds.size,1);
 }finally{owner.dispose();}
});
for(const dynamic of [true,false])test(`removed ${dynamic?'dynamic':'static'} layered failed body does not resurrect`,async()=>{
 const owner=await createSg02DynamicBodyOwner(),e=body();e.physicsBody.dynamic=dynamic;try{
  const create=owner.world.createCollider.bind(owner.world);owner.world.createCollider=()=>{throw new Error('injected');};
  owner.syncFromEntityLayers(dynamic?[]:[e],dynamic?[e]:[],1);
  assert.equal(physicsBodyNativeReady(e),false);owner.world.createCollider=create;
  owner.syncFromEntityLayers([],[],2);
  assert.equal(owner.records.size,0);assert.equal(owner.world.bodies.len(),0);assert.equal(owner._pendingNativeRebuilds.size,0);assert.equal(physicsBodyNativeReady(e),true);
 }finally{owner.dispose();}
});
test('unchanged static layer keeps its pending real body eligible for bounded retry',async()=>{
 const owner=await createSg02DynamicBodyOwner(),e=body();e.physicsBody.dynamic=false;try{
  const create=owner.world.createCollider.bind(owner.world);owner.world.createCollider=()=>{throw new Error('injected');};
  owner.syncFromEntityLayers([e],[],1);owner.world.createCollider=create;
  owner.syncFromEntityLayers([e],[],1);
  assert.equal(owner.records.get(e.id)?.entity,e);assert.equal(physicsBodyNativeReady(e),true);assert.equal(owner._pendingNativeRebuilds.size,0);
 }finally{owner.dispose();}
});
test('a replacement object using a failed id retires only the old object failure',async()=>{
 const owner=await createSg02DynamicBodyOwner(),old=body(),next=body();try{
  failConstruction(owner,old);const create=owner.world.createCollider.bind(owner.world);owner.world.createCollider=()=>{throw new Error('replacement injected');};
  owner.syncFromEntities([next]);owner.world.createCollider=create;
  assert.equal(physicsBodyNativeReady(old),true);assert.equal(physicsBodyNativeReady(next),false);
  assert.equal(owner._pendingNativeRebuilds.get(next.id).entity,next);
 }finally{owner.dispose();}
});
test('native replacement cannot clear a newer failure receipt issued by another owner',async()=>{
 const owner=await createSg02DynamicBodyOwner(),e=body(),other={};let latest;try{
  failConstruction(owner,e);latest=markPhysicsBodyNativeFailure(e,other);
  owner.rebuildWorldFromEntities([e]);
  assert.equal(owner.records.get(e.id)?.entity,e);assert.equal(physicsBodyNativeReady(e),false);
  clearPhysicsBodyNativeFailure(e,other,latest);assert.equal(physicsBodyNativeReady(e),true);
 }finally{if(latest)clearPhysicsBodyNativeFailure(e,other,latest);owner.dispose();}
});
test('explicit withdrawal retires the pending failure without retrying its absent body',async()=>{
 const owner=await createSg02DynamicBodyOwner(),e=body();try{
  failConstruction(owner,e);e.physicsBody=false;owner.syncFromEntities([e]);
  assert.equal(owner.records.size,0);assert.equal(owner.world.bodies.len(),0);assert.equal(owner._pendingNativeRebuilds.size,0);assert.equal(physicsBodyNativeReady(e),true);
 }finally{owner.dispose();}
});
