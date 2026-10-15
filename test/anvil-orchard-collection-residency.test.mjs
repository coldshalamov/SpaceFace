import test from 'node:test';
import assert from 'node:assert/strict';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';

function retire(h){
 const rec=h.owner.records.get(h.frame.id);
 h.owner._removeRecord(h.frame.id,rec,{orchardResidency:true});
 assert.equal(h.owner.records.has(h.frame.id),false);
 assert.ok(h.owner.readOrchardPodReady(h.pod,h.sim.state));
}
for(const retired of [false,true])test(`exact released pod collection with ${retired?'retired':'resident'} source commits once`,async()=>{
 const h=await ready();try{
  if(retired)retire(h);
  const stage=h.owner.prepareOrchardPodCollection(h.pod,h.sim.state);assert.ok(stage);
  assert.ok(stage.preflight());assert.equal(stage.commit(),true);assert.equal(stage.commit(),false);
  assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,44);
  assert.equal(h.sim.state.sites.anvilOrchard.lots[0].outcome,'delivered');assert.equal(h.pod.alive,false);
  assert.equal(h.owner.prepareOrchardPodCollection(h.pod,h.sim.state),null);
 }finally{h.close();}
});
for(const change of ['row','source-data','source-life','source-map','pod-data','pod-spec','pod-native','world','owner','tick','abort','source-return'])test(`retired source collection rejects ${change} after preparation without finite payout`,async()=>{
 const h=await ready();try{
  retire(h);const s=h.sim.state,prior=s.sites.anvilOrchard,stage=h.owner.prepareOrchardPodCollection(h.pod,s);assert.ok(stage);
  if(change==='row')s.sites.anvilOrchard=structuredClone(prior);
  if(change==='source-data')h.frame.data={...h.frame.data};
  if(change==='source-life')Object.defineProperty(h.frame,'occupantGeneration',{value:h.frame.occupantGeneration+1});
  if(change==='source-map')s.entities.set(h.frame.id,{...h.frame});
  if(change==='pod-data')h.pod.data={...h.pod.data};
  if(change==='pod-spec')h.pod.physicsBody={...h.pod.physicsBody};
  if(change==='pod-native')h.owner.records.get(h.pod.id).body.setGravityScale(2,true);
  if(change==='world')s.world={...s.world};
  if(change==='owner')h.owner.rebuildWorldFromEntities([...s.entities.values()]);
  if(change==='tick')s.tick++;
  if(change==='abort')assert.equal(stage.abort(),true);
  if(change==='source-return')h.owner.syncFromEntities([...s.entities.values()]);
  assert.ok(!stage.preflight());assert.equal(stage.commit(),false);
  assert.equal(prior.sourceRemaining,44);assert.equal(prior.lots[0].outcome,'retained');assert.equal(h.pod.alive,true);
 }finally{h.close();}
});
test('a preparation made before source retirement cannot silently cross the residency boundary',async()=>{
 const h=await ready();try{const stage=h.owner.prepareOrchardPodCollection(h.pod,h.sim.state);assert.ok(stage);retire(h);assert.equal(stage.commit(),false);assert.ok(h.owner.prepareOrchardPodCollection(h.pod,h.sim.state));}finally{h.close();}
});
test('a same-life source re-admission and separate finite lot preserve the first released pickup',async()=>{
 const h=await ready();try{
  retire(h);h.owner.syncFromEntities([...h.sim.state.entities.values()]);
  assert.ok(h.owner.readOrchardFramePose(h.frame));
  assert.equal(h.accept(1,0),1);retire(h);
  const stage=h.owner.prepareOrchardPodCollection(h.pod,h.sim.state);assert.ok(stage);
  assert.equal(stage.commit(),true);assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,43);
  assert.deepEqual(h.sim.state.sites.anvilOrchard.lots.map(l=>l.outcome),['delivered','retained']);
 }finally{h.close();}
});
test('a prepared collection cannot overwrite a later same-tick fill of another retained lot',async()=>{
 const h=await ready();try{
  assert.equal(h.accept(1,0),1);
  const stage=h.owner.prepareOrchardPodCollection(h.pod,h.sim.state);assert.ok(stage);
  assert.equal(h.machine.acceptOrchardHarvest(h.worker,{frame:h.frame,socket:0,qty:1,commodityId:'cmdty_gas_hydrogen'}),1);
  assert.equal(stage.commit(),false);
  assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,42);
  assert.equal(h.sim.state.sites.anvilOrchard.lots.find(l=>l.socket===0)?.units,2);
  const retry=h.owner.prepareOrchardPodCollection(h.pod,h.sim.state);assert.ok(retry);assert.equal(retry.commit(),true);
  assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining,42);
  assert.equal(h.sim.state.sites.anvilOrchard.lots.find(l=>l.socket===0)?.units,2);
 }finally{h.close();}
});
