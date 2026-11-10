import test from 'node:test';import assert from 'node:assert/strict';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';
import {captureOrchardRestoreInputs} from '../src/core/anvilOrchardNative.js';
test('a caller supplied cold facade cannot mint restored readiness without a real restore',async()=>{
 const h=await ready();try{
  const payload=h.owner.exportWorldSnapshot(),entities=h.sim.state.entityList;assert.ok(payload);
  h.pod.data={...h.pod.data};assert.equal(h.owner.readOrchardPodReady(h.pod,h.sim.state),null);
  const context={},facade={state:h.sim.state,_sg02:h.owner,_sg02Token:0,_nativeRestoreContext:context,_pendingSg02Snapshot:payload,_nativeRestorePending:true,_nativeRestoreDeferred:false};
  const plan=captureOrchardRestoreInputs(context,h.sim.state,entities,facade);
  const adopted=h.owner.adoptWorldSnapshot(payload,entities,{orchardColdRestore:true,orchardFiniteState:h.sim.state,orchardRestoreInputs:plan});
  const receipt=h.owner.readOrchardPodReady(h.pod,h.sim.state);
  console.log(JSON.stringify({adopted,ready:!!receipt,provenance:receipt?.provenance}));
  assert.equal(receipt,null);
 }finally{h.close();}
});
