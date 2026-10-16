import test from 'node:test';import assert from 'node:assert/strict';
import {ready,tail} from './fixtures/anvil-orchard-custody-ready.mjs';
import {physicsReachWuFromState} from '../src/world/activityRuntime.js';
import {applyFrameOrigin,snapFrameOrigin} from '../src/core/coordinates.js';
async function scene(mode){
 const h=await ready(),s=h.sim.state,row=JSON.stringify(s.sites.anvilOrchard),x=h.frame.pos.x,z=h.frame.pos.z,podStart={x:h.pod.pos.x,z:h.pod.pos.z};
 const D=3*physicsReachWuFromState(s,h.worker)+2000;
 const sync=t=>{s.tick=t;s.simTime=t/60;applyFrameOrigin(s,snapFrameOrigin(h.worker.pos,{}));h.facade._syncSg02FrameOrigin(s);h.facade._syncSg02DynamicAuthorityEntities(s);tail(h,t);};
 h.worker.pos.x=x+100;h.worker.pos.z=z;h.worker.flags.noInterp=true;sync(31);
 if(mode!=='both-away'){h.pod.pos.x=x+D;h.pod.pos.z=z;h.pod.flags.noInterp=true;}
 if(mode!=='pod-away')h.worker.pos.x=x+D+100;
 sync(32);sync(154);
 assert.equal(h.frame.alive,true);assert.equal(h.pod.alive,true);assert.equal(s.entities.get(h.frame.id),h.frame);assert.equal(s.entities.get(h.pod.id),h.pod);
 assert.equal(h.owner.records.has(h.frame.id),mode==='pod-away');assert.equal(h.owner.records.has(h.pod.id),mode==='frame-away');assert.equal(JSON.stringify(s.sites.anvilOrchard),row);
 return {...h,s,row,sync,x,z,podStart};
}
for(const mode of ['pod-away','frame-away','both-away'])for(const restore of ['native','scalar'])test(`${mode}: ${restore} Continue preserves live dormant custody and unrelated physics`,async()=>{
 const h=await scene(mode);try{
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('residency-'+mode+'-'+restore)));delete env.checksum;if(restore==='scalar')env.data.physics=null;
  const saved=env.data.entities.persistent.filter(e=>e.data?.orchardId==='anvil_storm_orchard');assert.equal(saved.length,2);
  const loaded=save.loadEnvelope(env),s=h.sim.state;assert.equal(loaded,true,'ordinary native demotion must not make Continue fail');assert.equal(h.facade._nativeRestorePending,false);
  const frame=s.entityList.find(e=>e.data?.orchardKind==='frame'),pod=s.entityList.find(e=>e.data?.orchardKind==='pod');assert.equal(frame.alive,true);assert.equal(pod.alive,true);assert.equal(JSON.stringify(s.sites.anvilOrchard),h.row);
  assert.equal(h.owner.records.has(frame.id),mode==='pod-away');assert.equal(h.owner.records.has(pod.id),mode==='frame-away');
  const receipt=h.facade.readOrchardPodReady(pod);assert.equal(!!receipt,mode==='frame-away','ready authority follows current pod custody, not source-frame residency');
  const tick=h.owner.tick;h.facade._updateSg02DynamicAuthority(1/60,s);assert.ok(h.owner.tick>tick,'unrelated normal physics remains available');
 }finally{h.close();}
});
for(const mode of ['pod-away','frame-away','both-away'])test(`${mode}: live return reuses exact same-life custody without recapturing saved flags`,async()=>{
 const h=await scene(mode);try{
  h.worker.pos.x=h.x+100;h.worker.pos.z=h.z;h.worker.flags.noInterp=true;h.pod.pos.x=h.podStart.x;h.pod.pos.z=h.podStart.z;h.pod.flags.noInterp=true;h.sync(155);
  assert.equal(h.owner.records.has(h.frame.id),true,'source motor lease may return after legitimate native demotion');assert.equal(h.owner.records.has(h.pod.id),true);assert.equal(h.owner._pendingNativeRebuilds.size,0);
  assert.ok(h.owner.readOrchardFramePose(h.frame));assert.ok(h.facade.readOrchardPodReady(h.pod));assert.equal(JSON.stringify(h.s.sites.anvilOrchard),h.row);
 }finally{h.close();}
});
