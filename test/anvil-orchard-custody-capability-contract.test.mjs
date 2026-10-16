import test from 'node:test';
import assert from 'node:assert/strict';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';
import {captureOrchardRestoreInputs,orchardRestoreInputsCurrent,prepareOrchardFrameTransfer} from '../src/core/anvilOrchardNative.js';

test('a genuine pending cold plan cannot be retrieved with a public claim or redirected to another owner',async()=>{
 const h=await ready(),other=await ready(),proto=Object.getPrototypeOf(h.owner),adopt=proto.adoptWorldSnapshot;
 try{
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('private-restore-claim')));delete env.checksum;
  let plan,called=false;
  proto.adoptWorldSnapshot=function(payload,entities,options={}){
   if(this!==h.owner || !options.orchardRestoreInputs)return adopt.call(this,payload,entities,options);
   called=true;plan=options.orchardRestoreInputs;assert.ok(plan);assert.ok(orchardRestoreInputsCurrent(plan,this));
   const context=h.facade._nativeRestoreContext;
   for(const token of [undefined,{},plan,this,context])assert.equal(captureOrchardRestoreInputs(context,h.sim.state,entities,h.facade,token),null);
   assert.equal(orchardRestoreInputsCurrent(plan,other.owner),false);
   const world=other.owner.world;
   assert.equal(other.owner.adoptWorldSnapshot(payload,entities,options),false);
   assert.throws(()=>other.owner.rebuildWorldFromEntities(entities,options),/orchard_restore_inputs_changed/);
   assert.throws(()=>prepareOrchardFrameTransfer(this,other.owner,new Map(),{restoreInputs:plan,coldMotor:true,finiteState:h.sim.state}),/orchard_restore_inputs_changed/);
   assert.equal(other.owner.world,world);
   return adopt.call(this,payload,entities,options);
  };
  assert.equal(save.loadEnvelope(env),true);assert.equal(called,true);
  h.pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');assert.ok(h.facade.readOrchardPodReady(h.pod));
  assert.equal(orchardRestoreInputsCurrent(plan,h.facade._sg02),false,'consumed destination context must not authorize reuse');
  assert.equal(Object.hasOwn(h.facade,'orchardRestoreCapability'),false);assert.equal(Object.hasOwn(h.owner,'orchardRestoreCapability'),false);
 }finally{proto.adoptWorldSnapshot=adopt;h.close();other.close();}
});

test('successive genuine native and scalar restores preserve the private facade claim through owner transfers',async()=>{
 const h=await ready();
 try{
  const save=h.sim.registry.get('save');
  for(const scalar of [false,true,false]){
   const env=JSON.parse(JSON.stringify(save.serialize('successive-private-restores')));delete env.checksum;if(scalar)env.data.physics=null;
   assert.equal(save.loadEnvelope(env),true);h.facade._finishNativeRestore();
   assert.equal(h.sim.state.physicsRuntime.nativeRestore.mode,scalar?'scalar':'native');
   h.pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod');assert.equal(h.facade.readOrchardPodReady(h.pod)?.provenance,'cold-adopted');
  }
 }finally{h.close();}
});
