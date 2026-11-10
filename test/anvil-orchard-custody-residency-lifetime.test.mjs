import test from 'node:test';import assert from 'node:assert/strict';
import {scene} from './fixtures/anvil-orchard-custody-residency-fixture.mjs';
import {ready,tail} from './fixtures/anvil-orchard-custody-ready.mjs';
for(const mode of ['pod-away','frame-away','both-away'])for(const scalar of [false,true])test(`${mode}: ${scalar?'scalar':'native'} Continue then ordinary return preserves historical handoff`,async()=>{
 const h=await scene(mode);try{
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('dormant-return')));delete env.checksum;if(scalar)env.data.physics=null;assert.equal(save.loadEnvelope(env),true);
  h.worker=h.sim.state.entities.get(h.sim.state.playerId);h.frame=h.sim.state.entityList.find(e=>e.data?.orchardKind==='frame');h.pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');
  h.worker.pos.x=h.x+100;h.worker.pos.z=h.z;h.worker.flags.noInterp=true;h.pod.pos.x=h.podStart.x;h.pod.pos.z=h.podStart.z;h.pod.flags.noInterp=true;
  h.sim.state.tick=155;h.facade._syncSg02DynamicAuthorityEntities(h.sim.state);tail(h,155);
  assert.ok(h.owner.records.has(h.frame.id));assert.ok(h.owner.records.has(h.pod.id));assert.ok(h.facade.readOrchardPodReady(h.pod));assert.equal(JSON.stringify(h.sim.state.sites.anvilOrchard),h.row);
 }finally{h.close();}
});
for(const key of ['data','physicsBody'])test(`same-value dormant pod ${key} replacement cannot reacquire readiness`,async()=>{
 const h=await scene('pod-away');try{h.pod[key]={...h.pod[key]};h.worker.pos.x=h.x+100;h.worker.pos.z=h.z;h.pod.pos.x=h.podStart.x;h.pod.pos.z=h.podStart.z;h.pod.flags.noInterp=true;h.sync(155);assert.equal(h.owner.readOrchardPodReady(h.pod,h.s),null);assert.equal(JSON.stringify(h.s.sites.anvilOrchard),h.row);}finally{h.close();}
});
test('another socket intake retains released lot authority and exact historical ticks',async()=>{
 const h=await ready();try{const first=h.facade.readOrchardPodReady(h.pod);assert.ok(first);assert.equal(h.accept(1,0),1);const next=h.facade.readOrchardPodReady(h.pod);assert.equal(next,first);assert.equal(next.readyTick,30);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,43);}finally{h.close();}
});
for(const scalar of [false,true])test(`released pod survives source destruction and ${scalar?'scalar':'native'} Continue`,async()=>{
 const h=await ready();try{h.frame.alive=false;h.facade._syncSg02DynamicAuthorityEntities(h.sim.state);assert.ok(h.facade.readOrchardPodReady(h.pod));
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('source-destroyed')));delete env.checksum;if(scalar)env.data.physics=null;assert.equal(save.loadEnvelope(env),true);
  h.pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');assert.ok(h.facade.readOrchardPodReady(h.pod));
 }finally{h.close();}
});
test('recycled source id cannot replace released pod custody',async()=>{
 const h=await ready();try{const oldId=h.frame.id;h.sim.helpers.removeEntity(oldId,{immediate:true});const replacement=h.sim.spawn({type:'payload',pos:{...h.frame.pos},radius:2,hull:100,data:{commodityId:'cmdty_scrap',amount:1}});assert.equal(replacement.id,oldId);assert.notEqual(replacement.occupantGeneration,h.frame.occupantGeneration);
  h.facade._syncSg02DynamicAuthorityEntities(h.sim.state);assert.equal(h.owner.records.get(oldId)?.entity,replacement);assert.ok(h.facade.readOrchardPodReady(h.pod));
 }finally{h.close();}
});
