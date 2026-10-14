import test from 'node:test';
import assert from 'node:assert/strict';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';

test('observed cold input invalidation revives after predecessor restored',async()=>{
 const h=await ready();const proto=Object.getPrototypeOf(h.owner),base=proto._adoptRecord;let pod,oldData;
 try {
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('review-aba')));delete env.checksum;
  proto._adoptRecord=function(e,...rest){const r=base.call(this,e,...rest);if(!pod && e!==h.pod && e.data?.orchardKind==='pod'){pod=e;oldData=e.data;e.data={...e.data};}return r;};
  assert.equal(save.loadEnvelope(env),true);assert.ok(pod);assert.equal(h.facade._nativeRestorePending,true);
  assert.equal(h.facade._finishNativeRestore(),false);assert.equal(h.facade.serialize(),null);
  proto._adoptRecord=base;pod.data=oldData;
  const result=h.facade._finishNativeRestore();
  console.log('ABA RESULT',JSON.stringify({result,pending:h.facade._nativeRestorePending,mode:h.sim.state.physicsRuntime.nativeRestore,ready:!!h.facade._sg02.readOrchardPodReady(pod,h.sim.state)}));
  assert.equal(h.facade._nativeRestorePending,true,'invalidated plan must stay pending after old reference restored');
 }finally{proto._adoptRecord=base;h.close();}
});

test('standalone save loaded event mints ready authority on foreign live source',async()=>{
 const h=await ready();
 try{
  h.pod.data={...h.pod.data};assert.equal(h.facade.readOrchardPodReady(h.pod),null);
  h.sim.bus.emit('save:loaded',{});
  const direct=h.facade._sg02.readOrchardPodReady(h.pod,h.sim.state);
  console.log('EVENT RESULT',JSON.stringify({pending:h.facade._nativeRestorePending,mode:h.sim.state.physicsRuntime.nativeRestore,ready:direct}));
  assert.equal(direct,null,'a save:loaded event alone must not grant a successful cold restore');
 }finally{h.close();}
});

test('cancelRestore during native adoption prevents old context publication',async()=>{
 const h=await ready();const proto=Object.getPrototypeOf(h.owner),base=proto._adoptRecord;let fired=false,pod;let beforeWorld;
 try{
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('review-context-cancel')));delete env.checksum;beforeWorld=h.owner.world;
  proto._adoptRecord=function(e,...rest){const r=base.call(this,e,...rest);if(!fired && e!==h.pod && e.data?.orchardKind==='pod'){fired=true;pod=e;beforeWorld=h.owner.world;h.facade.cancelRestore();}return r;};
  const loaded=save.loadEnvelope(env);const ready=h.facade._sg02.readOrchardPodReady(pod,h.sim.state);
  console.log('CANCEL RESULT',JSON.stringify({loaded,fired,pending:h.facade._nativeRestorePending,context:h.facade._nativeRestoreContext,worldChanged:h.owner.world!==beforeWorld,ready}));
  assert.equal(h.owner.world===beforeWorld,true,'cancelled restore context must not publish its staged world');
 }finally{proto._adoptRecord=base;h.close();}
});

test('late frame flightModel accessor must be rejected without execution',async()=>{
 const h=await ready();const proto=Object.getPrototypeOf(h.owner),base=proto._adoptRecord;let frame,calls=0;
 try{
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('review-flight-getter')));delete env.checksum;
  proto._adoptRecord=function(e,...rest){const r=base.call(this,e,...rest);if(!frame && e!==h.frame && e.data?.orchardKind==='frame'){frame=e;Object.defineProperty(e,'flightModel',{get(){calls++;return undefined;},configurable:true});}return r;};
  const loaded=save.loadEnvelope(env);const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');
  console.log('FLIGHT GETTER RESULT',JSON.stringify({loaded,calls,pending:h.facade._nativeRestorePending,mode:h.sim.state.physicsRuntime.nativeRestore,ready:!!h.facade._sg02.readOrchardPodReady(pod,h.sim.state)}));
  assert.equal(calls,0,'late normalization accessor must not execute');
 }finally{proto._adoptRecord=base;h.close();}
});
