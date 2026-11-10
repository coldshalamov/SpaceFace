import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/anvil-orchard-custody-source.mjs';
import {cargo} from '../src/systems/cargo.js';
import {mining} from '../src/systems/mining.js';

const tail=(h,tick)=>{h.sim.state.tick=tick;h.owner.step(1/60,tick);h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(),()=>h.owner.drainContactImpacts());};
async function released(){
 const h=await setup();assert.equal(h.accept(),4);assert.equal(h.owner.requestOrchardFiniteRelease(h.frame,1,h.sim.state),true);
 for(let i=1;i<=30;i++)tail(h,i);h.pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');
 const handoff=h.owner.prepareOrchardPodHandoff(h.frame,h.pod,1,h.sim.state);assert.ok(handoff);assert.equal(handoff.commit(),true);
 const registry=h.sim.registry,resolve=registry.get.bind(registry);registry.get=name=>name==='cargo'?cargo:resolve(name);
 cargo.init(registry.ctx);mining.init(registry.ctx);return h;
}

test('ordinary pod pickup atomically delivers the finite lot before cargo observers and survives Continue',async()=>{
 const h=await released();try{
  const {sim,pod,worker}=h;let observed=null;const heldBefore=sim.state.player.cargo.items.cmdty_gas_hydrogen||0;
  sim.bus.on('cargo:changed',()=>{const row=sim.state.sites.anvilOrchard;observed={alive:pod.alive,status:row.sockets[1].status,outcome:row.lots.find(l=>l.id===pod.data.worldRecordId).outcome,source:row.sourceRemaining,env:sim.registry.get('save').serialize('orchard-collected-observer')};});
  const accepted=mining._collectPickupViaEvent(pod,worker);
  assert.equal(accepted.accepted,4);assert.equal(sim.state.player.cargo.items.cmdty_gas_hydrogen,heldBefore+4);
  assert.equal(observed.alive,false);assert.equal(observed.status,'delivered');assert.equal(observed.outcome,'delivered');assert.equal(observed.source,44);
  const row=sim.state.sites.anvilOrchard;assert.equal(row.lots.reduce((n,l)=>n+l.units,0)+row.sourceRemaining,48);
  mining._collectPickupViaEvent(pod,worker);assert.equal(sim.state.player.cargo.items.cmdty_gas_hydrogen,heldBefore+4);
  assert.equal(sim.registry.get('save').loadEnvelope(observed.env),true);h.facade._finishNativeRestore();
  assert.equal(await h.facade.prepareBackend(sim.state),true);h.owner=h.facade._sg02;
  assert.equal(sim.state.player.cargo.items.cmdty_gas_hydrogen,heldBefore+4);
  assert.equal(sim.state.sites.anvilOrchard.sockets[1].status,'delivered');
  assert.equal(sim.state.entityList.some(e=>e.data?.worldRecordId===`anvil_storm_orchard:1:1`),false);
  assert.equal(h.owner.readOrchardPodReady(h.pod,sim.state),null);
 }finally{h.close();}
});

for(const refusal of ['full-hold','stale-row'])test(`Orchard collection ${refusal} refusal preserves the live pod and retained lot`,async()=>{
 const h=await released();try{
  if(refusal==='full-hold')h.sim.state.player.cargo.capVolume=0;
  else h.sim.state.sites.anvilOrchard=structuredClone(h.sim.state.sites.anvilOrchard);
  const result=mining._collectPickupViaEvent(h.pod,h.worker);
  assert.equal(result.accepted,0);assert.equal(h.pod.alive,true);assert.equal(h.pod.data.amount,4);
  const row=h.sim.state.sites.anvilOrchard;assert.equal(row.sockets[1].status,'drifting');
  assert.equal(row.lots[0].outcome,'retained');assert.equal(row.lots[0].units,4);assert.equal(row.sourceRemaining,44);
  assert.equal(h.sim.state.player.cargo.items.cmdty_gas_hydrogen||0,0);
 }finally{h.close();}
});

test('a delivered socket closes by native ticks and admits the next finite lot',async()=>{
 const h=await released();try{
  assert.equal(mining._collectPickupViaEvent(h.pod,h.worker).accepted,4);
  h.facade._syncSg02DynamicAuthorityEntities(h.sim.state);
  h.sim.state.tick=30;assert.equal(h.owner.requestOrchardFiniteClose(h.frame,1,h.sim.state),true);
  for(let i=31;i<=60;i++)tail(h,i);
  assert.equal(h.frame.data.orchardCollars.progress[1],0);assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].operation,'closed');
  const worker=h.sim.state.entities.get(h.sim.state.playerId);
  assert.equal(h.machine.acceptOrchardNewPod(worker,{frame:h.frame,socket:1,qty:4,commodityId:'cmdty_gas_hydrogen'}),4);
  assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].cycle,2);
 }finally{h.close();}
});

test('Continue keeps a partial delivered close cold until a fresh close-service admission',async()=>{
 const h=await released();try{
  assert.equal(mining._collectPickupViaEvent(h.pod,h.worker).accepted,4);
  h.sim.state.tick=30;assert.equal(h.owner.requestOrchardFiniteClose(h.frame,1,h.sim.state),true);
  for(let i=31;i<=35;i++)tail(h,i);
  assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].progress,25);
  const save=h.sim.registry.get('save'),envelope=JSON.parse(JSON.stringify(save.serialize('delivered-partial-close')));delete envelope.checksum;
  assert.equal(save.loadEnvelope(envelope),true);h.facade._finishNativeRestore();assert.equal(await h.facade.prepareBackend(h.sim.state),true);
  h.owner=h.facade._sg02;h.frame=h.sim.state.entityList.find(e=>e.data?.orchardKind==='frame');
  tail(h,36);assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].progress,25);
  assert.equal(h.owner.requestOrchardFiniteClose(h.frame,1,h.sim.state),true);
  for(let i=37;i<=61;i++)tail(h,i);
  assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].operation,'closed');
  assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].progress,0);
 }finally{h.close();}
});

test('normal mining update collects a nearby ready pod through the shared cargo event',async()=>{
 const h=await released();try{
  const before=h.sim.state.player.cargo.items.cmdty_gas_hydrogen||0;
  h.worker.pos={x:h.pod.pos.x,z:h.pod.pos.z};
  mining.update(1/60,h.sim.state);
  assert.equal(h.pod.alive,false);
  assert.equal(h.sim.state.player.cargo.items.cmdty_gas_hydrogen,before+4);
  assert.equal(h.sim.state.sites.anvilOrchard.lots[0].outcome,'delivered');
 }finally{h.close();}
});

test('ordinary core destruction settles a ready pod as lost and the lost row survives Continue',async()=>{
 const h=await released();try{
  const core=h.sim.registry.systems[0];let receipt=null;h.sim.bus.on('entity:destroyed',event=>{if(event?.entity===h.pod)receipt=event;});
  h.pod.alive=false;core.lifetimeSweep(0,h.sim.state);assert.equal(receipt?.entity,h.pod);
  const row=h.sim.state.sites.anvilOrchard;assert.equal(h.sim.state.entities.has(h.pod.id),false);
  assert.equal(row.sockets[1].status,'lost');assert.equal(row.lots[0].outcome,'lost');
  assert.equal(row.sourceRemaining,44);assert.equal(row.lots.reduce((n,l)=>n+l.units,0)+row.sourceRemaining,48);
  h.facade._syncSg02DynamicAuthorityEntities(h.sim.state);
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('orchard-lost-pod')));delete env.checksum;
  assert.equal(save.loadEnvelope(env),true);h.facade._finishNativeRestore();assert.equal(await h.facade.prepareBackend(h.sim.state),true);
  h.owner=h.facade._sg02;h.frame=h.sim.state.entityList.find(e=>e.data?.orchardKind==='frame');
  assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].status,'lost');
  h.sim.state.tick=30;assert.equal(h.owner.requestOrchardFiniteClose(h.frame,1,h.sim.state),true);
  for(let i=31;i<=60;i++)tail(h,i);
  assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].operation,'closed');
  const worker=h.sim.state.entities.get(h.sim.state.playerId);
  assert.equal(h.machine.acceptOrchardNewPod(worker,{frame:h.frame,socket:1,qty:4,commodityId:'cmdty_gas_hydrogen'}),4);
  assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].cycle,2);
 }finally{h.close();}
});

test('loss refuses wrong-sector destruction and absent residency without its exact event receipt',async()=>{
 const h=await released();try{
  const core=h.sim.registry.systems[0];let receipt=null;h.sim.bus.on('entity:destroyed',event=>{if(event?.entity===h.pod)receipt=event;});
  h.sim.state.world.currentSectorId='sector_non_orchard';h.pod.alive=false;core.lifetimeSweep(0,h.sim.state);
  assert.equal(receipt?.entity,h.pod);assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].status,'drifting');
  h.sim.state.world.currentSectorId='sector_tethys_junction';
  assert.equal(h.owner.commitOrchardPodLoss(h.frame,h.pod,h.sim.state,null),false);
  assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].status,'drifting');
  assert.equal(h.sim.state.sites.anvilOrchard.lots[0].outcome,'retained');
 }finally{h.close();}
});
