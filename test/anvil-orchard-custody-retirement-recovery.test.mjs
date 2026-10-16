import test from 'node:test';import assert from 'node:assert/strict';import {approachingRetirement} from './fixtures/anvil-orchard-custody-retirement-fixture.mjs';
for(const kind of ['pod','frame'])test(`${kind}: partial activity retirement stays no-solve and resumes before ordinary return`,async()=>{
 const h=await approachingRetirement(kind),record=h.owner.records.get(h[kind].id),world=h.owner.world,remove=world.removeCollider,collider=record.colliders[0],row=JSON.stringify(h.s.sites.anvilOrchard);let fired=0;
 world.removeCollider=function(c,...args){if(c!==collider)return remove.call(this,c,...args);delete world.removeCollider;fired++;remove.call(this,c,...args);throw Error('after_first_native_removal');};
 try{assert.throws(()=>h.sync(154),/after_first_native_removal/);assert.equal(fired,1);assert.equal(h.owner.records.get(h[kind].id),record);assert.equal(world.getCollider(collider.handle),null);assert.equal(h.owner.orchardAuthorityAvailable(),false);assert.equal(h.owner.exportWorldSnapshot(),null);
  const tick=h.owner.tick,debt=h.owner.accumulator;h.owner.step(1/60,154);assert.equal(h.owner.tick,tick);assert.equal(h.owner.accumulator,debt);const peer=h.owner.records.get(h.worker.id).body;peer.setLinvel({x:1,y:0,z:0},true);const before=peer.translation();world.step();assert.deepEqual(peer.translation(),before,'direct World.step must not invoke the solver while retirement is partial');
  assert.equal(h.owner.recoverOrchardFrame(),true);assert.equal(h.owner.orchardAuthorityAvailable(),true);assert.equal(h.owner.records.has(h[kind].id),false);assert.equal(JSON.stringify(h.s.sites.anvilOrchard),row);
  h.worker.pos.x=h.x+100;h.worker.pos.z=h.z;h.worker.flags.noInterp=true;h.pod.pos.x=h.podStart.x;h.pod.pos.z=h.podStart.z;h.pod.flags.noInterp=true;h.sync(155);
  assert.ok(h.owner.readOrchardFramePose(h.frame));assert.ok(h.facade.readOrchardPodReady(h.pod));assert.equal(JSON.stringify(h.s.sites.anvilOrchard),row);
 }finally{delete world.removeCollider;h.close();}
});
test('foreign collider attached during partial retirement remains claimed until explicitly released',async()=>{
 const h=await approachingRetirement('pod'),record=h.owner.records.get(h.pod.id),world=h.owner.world,remove=world.removeCollider,collider=record.collider;let foreign;
 world.removeCollider=function(c,...args){delete world.removeCollider;remove.call(this,c,...args);foreign=world.createCollider(h.owner.RAPIER.ColliderDesc.ball(.25),record.body);};
 try{h.sync(154);assert.ok(foreign);assert.equal(h.owner.orchardAuthorityAvailable(),false);assert.equal(h.owner.recoverOrchardFrame(),false);assert.equal(world.getCollider(foreign.handle),foreign);assert.equal(world.getRigidBody(record.body.handle),record.body);
  world.removeCollider(foreign,false);assert.equal(h.owner.recoverOrchardFrame(),true);assert.equal(h.owner.records.has(h.pod.id),false);
 }finally{delete world.removeCollider;h.close();}
});
