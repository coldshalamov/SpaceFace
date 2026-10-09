import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {restore,capture} from './ceres-reacquire-harness.mjs';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {stepCeresWorkfleet,restoreCeresWorkfleetJob,consumeCeresBreakerControl} from '../src/systems/ceresWorkfleet.js';
const observer={playerPosition:{x:C.sitePlacement.pos.x+350,z:C.sitePlacement.pos.z-400}};
let wire;const flags=snapshotFeatureMaps();
test.before(async()=>{applyFeatureConfigToMaps(PRODUCTION_FEATURES);const h=await restore(JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/seed47-mid-head-return.json',import.meta.url))));try{
 for(let i=0;i<9000;i++){h.sim.step();if(h.job().phase==='reacquire'){wire=capture(h);break;}}assert.ok(wire);
 // Constructed settled return case. Only initial construction is translated; all
 // subsequent return movement is produced by ordinary native thrust.
 for(const role of ['worker','cutterHead']){const r=wire.records.byId[C.identities[role]];r.pos.x+=520;r.vel={x:0,z:0};r.angVel=0;}
 Object.assign(wire.jobs.ceresWorkfleet,{reacquire:null,reacquireReturnBudget:null,reacquireRetryTick:wire.tick});
}finally{h.close();}});test.after(()=>restoreFeatureMaps(flags));
test('return deadline survives obstruction, replanning and typed Continue without reset',async()=>{const h=await restore(wire,observer);let resumed;
 try{for(let i=0;i<1200&&!h.job().reacquire;i++)h.sim.step();assert.equal(h.job().reacquire?.kind,'return-to-work',JSON.stringify(h.job()));
 const deadline=h.job().reacquireReturnBudget.deadlineTick,initial=h.b.breaker.pos.x;
 const solid=h.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:initial-70,z:h.b.breaker.pos.z+30},vel:{x:0,z:0},mass:100,radius:2,data:{worldRecordId:'proof:return-obstacle'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:2,shape:'ball',useMeasuredSkin:false,material:'wreck'}});h.physics._sg02.syncFromEntities(h.state.entityList);
 for(let i=0;i<1800;i++)h.sim.step();assert.match(h.job().blockedReason||'',/^reacquire-/,'actual full-compound obstruction must refuse the route');assert.ok(Math.hypot(h.b.breaker.vel.x,h.b.breaker.vel.z)<.02,'obstructed return settles using bounded thrust');assert.equal(h.job().phase,'reacquire');assert.equal(h.job().reacquireReturnBudget.deadlineTick,deadline);assert.equal(h.job().towId,null);
 solid.alive=false;h.physics._sg02.syncFromEntities(h.state.entityList);for(let i=0;i<600;i++)h.sim.step();
 const snap=capture(h);resumed=await restore(snap,observer);assert.equal(resumed.job().reacquireReturnBudget.deadlineTick,deadline);
 for(let i=0;i<600;i++){h.sim.step();resumed.sim.step();}
 assert.ok(h.b.breaker.pos.x<initial-5);assert.ok(resumed.b.breaker.pos.x<initial-5);assert.equal(h.job().reacquireReturnBudget.deadlineTick,deadline);assert.equal(resumed.job().reacquireReturnBudget.deadlineTick,deadline);
 }finally{resumed?.close();h.close();}
});
test('expired return budget terminates, preserves real mount custody and releases leases',async()=>{const h=await restore(wire,observer);try{
 h.sim.step();const budget=h.job().reacquireReturnBudget,mount=h.job().mountId;assert.ok(budget);h.state.tick=budget.deadlineTick+1;stepCeresWorkfleet(h.owner,1/60);
 assert.equal(h.job().phase,'recovery-interrupted');assert.equal(h.job().reason,'reacquire-return-timeout');assert.equal(h.service.get(mount).state,'active');assert.equal(h.job().towId,null);
 for(const e of Object.values(h.b))assert.equal(e.data.jobId,undefined);assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);assert.equal(h.b.section.mass,1800);
 const again=await restore(capture(h),observer);try{assert.equal(again.job().phase,'recovery-interrupted');assert.equal(again.job().reason,'reacquire-return-timeout');assert.equal(again.b.section.data.jobId,undefined);}finally{again.close();}
}finally{h.close();}});
test('malformed or future return budgets fail closed rather than grant fresh time',async()=>{const h=await restore(wire,observer);try{
 h.sim.step();const raw=capture(h).jobs.ceresWorkfleet;
 raw.reacquireReturnBudget.deadlineTick=Number.MAX_SAFE_INTEGER;assert.equal(restoreCeresWorkfleetJob(raw).phase,'recovery-interrupted');
 h.job().reacquireReturnBudget.startedTick=h.state.tick+10;h.job().reacquireReturnBudget.deadlineTick=h.state.tick+100;stepCeresWorkfleet(h.owner,1/60);
 assert.equal(h.job().phase,'recovery-interrupted');assert.equal(h.job().reason,'reacquire-return-clock-invalid');assert.equal(h.b.section.data.jobId,undefined);
}finally{h.close();}});
