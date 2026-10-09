import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {restore,capture} from './ceres-reacquire-harness.mjs';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {queuePhysicsImpulse,queuePhysicsTorqueImpulse} from '../src/core/physicsAuthority.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
let wire;const prior=snapshotFeatureMaps();
test.before(async()=>{applyFeatureConfigToMaps(PRODUCTION_FEATURES);const h=await restore(JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/seed47-mid-head-return.json',import.meta.url))));try{
 for(let i=0;i<9000;i++){h.sim.step();if(h.job().phase==='tow_attach'&&!h.job().mountId){wire=capture(h);break;}}assert.ok(wire);
}finally{h.close();}});test.after(()=>restoreFeatureMaps(prior));
test('a real late head impulse revokes stale docking readiness before binding',async()=>{const h=await restore(wire);try{
 queuePhysicsImpulse(h.b.cutterHead,{x:60*.5,y:0,z:0});h.sim.step();
 assert.equal(h.job().mountId,null,'no clamp is minted from last tick readiness');assert.equal(h.job().phase,'tow_attach');assert.equal(h.job().blockedReason,'head-docking-settling');
 for(let i=0;i<1500&&!h.job().mountId;i++)h.sim.step();assert.ok(h.job().mountId);assert.equal(h.service.get(h.job().mountId).state,'active');assert.equal(h.b.cutterHead.mass,60);
}finally{h.close();}});
test('moving-frame head docking cannot bypass initial carrier commissioning position',async()=>{
 const displaced=JSON.parse(JSON.stringify(wire));for(const role of ['worker','cutterHead'])displaced.records.byId[C.identities[role]].pos.x+=50;
 const motion=displaced.sites.worldById[C.siteId].payloads.long_plate.motion;motion.pos={x:C.sitePlacement.pos.x-80,z:C.sitePlacement.pos.z};motion.vel={x:0,z:0};motion.rot=0;motion.angVel=0;
 const h=await restore(displaced);try{
  for(let i=0;i<120;i++){h.sim.step();if(h.job().phase==='reacquire')break;}
  assert.equal(h.job().phase,'reacquire');assert.equal(h.job().towId,null);assert.ok(h.job().mountId,'head may dock to the actual displaced carrier');
 }finally{h.close();}
});

test('late head spin must settle in the carrier frame before real binding',async()=>{const h=await restore(wire);try{
 queuePhysicsTorqueImpulse(h.b.cutterHead,{x:0,y:h.b.cutterHead.physicsBody.inertiaY*.02,z:0});h.sim.step();
 assert.equal(h.job().mountId,null);assert.equal(h.job().phase,'tow_attach');
 for(let i=0;i<1800&&!h.job().mountId;i++)h.sim.step();assert.ok(h.job().mountId,JSON.stringify({job:h.job(),head:{pos:h.b.cutterHead.pos,rot:h.b.cutterHead.rot,angVel:h.b.cutterHead.angVel},carrier:{pos:h.b.breaker.pos,rot:h.b.breaker.rot,angVel:h.b.breaker.angVel}}));
 assert.equal(h.service.get(h.job().mountId).state,'active');
}finally{h.close();}});
