import test from 'node:test';import assert from 'node:assert/strict';import {setup} from './fixtures/anvil-orchard-custody-source.mjs';
for(const key of ['world','records','_eventQueue'])test(`a late owner ${key} getter cannot invalidate the source after final source preflight`,async()=>{
 const h=await setup();let descriptor,calls=0,reads=0;
 try{assert.equal(h.accept(),4);const prior=h.sim.state.sites.anvilOrchard,map=h.owner.records,get=map.get;descriptor=Object.getOwnPropertyDescriptor(h.owner,key);
 map.get=function(id){const out=get.call(this,id);if(id===h.frame.id&&++reads===2)Object.defineProperty(h.owner,key,{configurable:true,get(){calls++;Object.defineProperty(h.owner,key,descriptor);h.frame.hull=0;return descriptor.value;}});return out;};
 const accepted=h.owner.requestOrchardFiniteRelease(h.frame,1,h.sim.state);console.log(JSON.stringify({key,reads,calls,accepted,hull:h.frame.hull,status:h.sim.state.sites.anvilOrchard.sockets[1].status}));
 assert.equal(reads,2);assert.equal(calls,0);assert.equal(accepted,false);assert.equal(h.sim.state.sites.anvilOrchard,prior);
 }finally{delete h.owner.records.get;if(descriptor)Object.defineProperty(h.owner,key,descriptor);h.close();}
});
