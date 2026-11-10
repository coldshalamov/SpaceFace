import test from 'node:test';import assert from 'node:assert/strict';import {setup} from './fixtures/anvil-orchard-custody-source.mjs';
for(const key of ['map-size','peer-collider-index'])test(`final native observation handles ${key} through its declared callback-free container contract`,async()=>{
 const h=await setup();let target,prop,prior,calls=0,reads=0;
 try{assert.equal(h.accept(),4);const row=h.sim.state.sites.anvilOrchard,map=h.owner.records,get=map.get;
 target=key==='map-size'?map:map.get(h.worker.id).colliders;prop=key==='map-size'?'size':'0';prior=Object.getOwnPropertyDescriptor(target,prop)
 map.get=function(id){const out=get.call(this,id);if(id===h.frame.id&&++reads===2){const held=key==='map-size'?Object.getOwnPropertyDescriptor(Map.prototype,'size').get.call(map):prior.value;Object.defineProperty(target,prop,{configurable:true,get(){calls++;if(prior)Object.defineProperty(target,prop,prior);else delete target[prop];h.frame.hull=0;return held;}});}return out;};
 const accepted=h.owner.requestOrchardFiniteRelease(h.frame,1,h.sim.state);console.log(JSON.stringify({key,reads,calls,accepted,hull:h.frame.hull,status:h.sim.state.sites.anvilOrchard.sockets[1].status}));
 assert.equal(reads,2);assert.equal(calls,0);assert.equal(h.frame.hull,300);if(key==='map-size'){assert.equal(accepted,true);assert.equal(row.sockets[1].status,'stowed');assert.equal(h.sim.state.sites.anvilOrchard.sockets[1].status,'releasing');}else{assert.equal(accepted,false);assert.equal(h.sim.state.sites.anvilOrchard,row);}
 }finally{delete h.owner.records.get;if(target){if(prior)Object.defineProperty(target,prop,prior);else delete target[prop];}h.close();}
});
