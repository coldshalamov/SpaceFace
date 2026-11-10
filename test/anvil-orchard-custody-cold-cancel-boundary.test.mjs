import test from 'node:test';import assert from 'node:assert/strict';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';
test('cancellation retains the exact destination world captured at incoming pod adoption and grants no cold ready authority',async()=>{
 const h=await ready(),proto=Object.getPrototypeOf(h.owner),base=proto._adoptRecord;let pod,cancelledWorld,fired=false;
 try{const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('review-calibrated-cancel')));delete env.checksum;
 proto._adoptRecord=function(e,...rest){const r=base.call(this,e,...rest);if(!fired && e!==h.pod && e.data?.orchardKind==='pod'){fired=true;pod=e;cancelledWorld=h.facade._sg02.world;h.facade.cancelRestore();}return r;};
 assert.equal(save.loadEnvelope(env),true);assert.equal(fired,true);const sameDestination=h.facade._sg02.world===cancelledWorld,receipt=h.facade._sg02.readOrchardPodReady(pod,h.sim.state);console.log(JSON.stringify({sameDestination,pending:h.facade._nativeRestorePending,context:h.facade._nativeRestoreContext,ready:!!receipt}));assert.equal(sameDestination,true);assert.doesNotThrow(()=>cancelledWorld.bodies.len());assert.equal(receipt,null);assert.equal(h.facade._nativeRestorePending,true);assert.equal(h.facade._nativeRestoreContext,null);
 }finally{proto._adoptRecord=base;h.close();}
});
