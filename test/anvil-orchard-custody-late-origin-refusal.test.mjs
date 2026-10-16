import test from 'node:test';import assert from 'node:assert/strict';import {setup} from './fixtures/anvil-orchard-custody-source.mjs';
for(const operation of ['release-x','release-z','cavity-x'])test(`${operation} rejects a late origin accessor without executing it`,async()=>{
 const h=await setup();let origin,descriptor,calls=0,reads=0;
 try{assert.equal(h.accept(),4);const prior=h.sim.state.sites.anvilOrchard,map=h.owner.records,get=map.get,key=operation.endsWith('x')?'x':'z';origin=h.owner._frameOrigin;descriptor=Object.getOwnPropertyDescriptor(origin,key);
 map.get=function(id){const out=get.call(this,id);if(id===h.frame.id&&++reads===2)Object.defineProperty(origin,key,{configurable:true,get(){calls++;Object.defineProperty(origin,key,descriptor);h.frame.hull=0;return descriptor.value;}});return out;};
 const result=operation.startsWith('release')?h.owner.requestOrchardFiniteRelease(h.frame,1,h.sim.state):h.owner.queryOrchardPodCavity(h.frame,0);
 console.log(JSON.stringify({operation,reads,calls,result:typeof result==='object'&&result!==null?{clear:result.clear}:result}));assert.equal(reads,2);assert.equal(calls,0);assert.equal(result,operation.startsWith('release')?false:null);assert.equal(h.sim.state.sites.anvilOrchard,prior);assert.equal(h.frame.hull,300);
 }finally{delete h.owner.records.get;if(origin&&descriptor)Object.defineProperty(origin,operation.endsWith('x')?'x':'z',descriptor);h.close();}
});
