import test from 'node:test';import assert from 'node:assert/strict';
import {ready,tail} from './fixtures/anvil-orchard-custody-ready.mjs';
import {physicsReachWuFromState} from '../src/world/activityRuntime.js';
import {applyFrameOrigin,snapFrameOrigin} from '../src/core/coordinates.js';
test('activity retirement stops the old removal stack after genuine Continue replaces its world',async()=>{
 const h=await ready(),s=h.sim.state,x=h.frame.pos.x,z=h.frame.pos.z,D=3*physicsReachWuFromState(s,h.worker)+2000,saves=h.sim.registry.get('save');
 const sync=t=>{s.tick=t;s.simTime=t/60;applyFrameOrigin(s,snapFrameOrigin(h.worker.pos,{}));h.facade._syncSg02FrameOrigin(s);h.facade._syncSg02DynamicAuthorityEntities(s);tail(h,t);};
 h.worker.pos.x=x+100;h.worker.pos.z=z;h.worker.flags.noInterp=true;sync(31);
 // The incoming save is an ordinary valid near-resident session, not a fabricated owner.
 const env=JSON.parse(JSON.stringify(saves.serialize('before-activity-retirement')));delete env.checksum;
 // Consume ordinary post-canonicalization rebind before the one-time test relocation.
 h.facade._syncSg02DynamicAuthorityEntities(s);
 h.pod.pos.x=x+D;h.pod.pos.z=z;h.pod.flags.noInterp=true;sync(32);
 const old=h.owner.world,record=h.owner.records.get(h.pod.id),collider=record.colliders[0],remove=old.removeCollider;
 const staleCalls=[];let loaded=false,successor=null,fired=0,err=null;
 old.removeCollider=function(c,...args){
  if(c!==collider)return remove.call(this,c,...args);
  fired++;delete old.removeCollider;
  loaded=saves.loadEnvelope(env);successor=h.owner.world;
  for(const method of ['getCollider','getRigidBody','removeCollider','removeRigidBody']){
   const call=successor[method];
   successor[method]=function(...argv){
    const stack=new Error().stack;
    if(stack.includes('._removeRecord '))staleCalls.push({method,handle:typeof argv[0]==='number'?argv[0]:argv[0]?.handle});
    return call.apply(this,argv);
   };
  }
  // Continue retired the old world. Never dispatch the saved native removal into freed WASM.
 };
 try{
  try{sync(154);}catch(e){err=e.message;}
  for(const method of ['getCollider','getRigidBody','removeCollider','removeRigidBody'])if(successor)delete successor[method];
  const pod=s.entityList.find(e=>e.data?.orchardKind==='pod');
  console.log(JSON.stringify({fired,loaded,worldReplaced:successor!==old,error:err,staleCalls,pending:h.facade._nativeRestorePending,ready:!!h.facade.readOrchardPodReady(pod),nativeRestore:s.physicsRuntime?.nativeRestore}));
  assert.equal(fired,1);assert.equal(loaded,true);assert.notEqual(successor,old);
  assert.deepEqual(staleCalls,[],'superseded activity retirement must not issue native calls against the successor world');
 }finally{delete old.removeCollider;for(const method of ['getCollider','getRigidBody','removeCollider','removeRigidBody'])if(successor)delete successor[method];h.close();}
});
