import test from 'node:test';import assert from 'node:assert/strict';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';
for(const kind of ['pod-body-handle','frame-body-handle','pod-ccd-record'])test(`current readiness refuses late ${kind} without invoking a getter`,async()=>{
 const h=await ready(),map=h.owner.records,get=map.get,podRec=map.get(h.pod.id),frameRec=map.get(h.frame.id),object=kind==='pod-body-handle'?podRec.body:kind==='frame-body-handle'?frameRec.body:podRec,key=kind==='pod-ccd-record'?'ccdEnabled':'handle',d=Object.getOwnPropertyDescriptor(object,key);let reads=0,calls=0;
 try{map.get=function(id){const r=get.call(this,id);if(id===h.frame.id && ++reads===2)Object.defineProperty(object,key,{configurable:true,get(){calls++;Object.defineProperty(object,key,d);h.frame.hull=0;return d.value;}});return r;};const result=h.owner.readOrchardPodReady(h.pod,h.sim.state);assert.equal(reads,2);assert.equal(calls,0);assert.equal(result,null);assert.equal(h.frame.hull,300);
 }finally{delete map.get;Object.defineProperty(object,key,d);h.close();}
});
