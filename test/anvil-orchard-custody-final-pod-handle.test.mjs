import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from './fixtures/anvil-orchard-custody-source.mjs';
const tail=(h,tick)=>{h.sim.state.tick=tick;h.owner.step(1/60,tick);h.owner.publishCompletedOrchardContacts(h.owner.completedOrchardTail(),()=>h.owner.drainContactImpacts());};
async function ready(){const h=await setup();assert.equal(h.accept(),4);assert.equal(h.owner.requestOrchardFiniteRelease(h.frame,1,h.sim.state),true);for(let i=1;i<=30;i++)tail(h,i);h.pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');const stage=h.owner.prepareOrchardPodHandoff(h.frame,h.pod,1,h.sim.state);assert.ok(stage);assert.equal(stage.commit(),true);return h;}
test('ready final pod handle cannot invalidate the frame after its last source eligibility check',async()=>{
 const h=await ready(),map=h.owner.records,get=map.get,c=h.owner.records.get(h.pod.id).collider,d=Object.getOwnPropertyDescriptor(c,'handle');let reads=0,calls=0;
 try{map.get=function(id){const r=get.call(this,id);if(id===h.frame.id && ++reads===2)Object.defineProperty(c,'handle',{configurable:true,get(){calls++;Object.defineProperty(c,'handle',d);h.frame.hull=0;return d.value;}});return r;};const receipt=h.owner.readOrchardPodReady(h.pod,h.sim.state);console.log(JSON.stringify({reads,calls,hull:h.frame.hull,accepted:!!receipt}));assert.equal(calls,0);assert.equal(receipt,null);assert.equal(h.frame.hull,300);
 }finally{delete map.get;Object.defineProperty(c,'handle',d);h.close();}
});
