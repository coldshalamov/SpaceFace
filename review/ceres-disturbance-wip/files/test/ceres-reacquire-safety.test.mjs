import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {restore,capture,pose} from './ceres-reacquire-harness.mjs';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {stepCeresWorkfleet,clearCeresWorkfleetControls,syncCeresWorkfleetActivity,consumeCeresBreakerControl,consumeCeresHeadControl} from '../src/systems/ceresWorkfleet.js';
const prior=snapshotFeatureMaps();let wire;
test.before(async()=>{applyFeatureConfigToMaps(PRODUCTION_FEATURES);const h=await restore(JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/seed47-mid-head-return.json',import.meta.url))));try{for(let i=0;i<9000;i++){h.sim.step();if(h.job().phase==='reacquire'&&h.job().reacquire?.leg==='approach'){wire=capture(h);break;}}assert.ok(wire);}finally{h.close();}});
test.after(()=>restoreFeatureMaps(prior));
const blocked=h=>h.job().blockedReason?.startsWith('reacquire-');
function obstacle(h,{ahead=3.7,side=55}={}){const b=h.b.breaker;return h.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:b.pos.x+side,z:b.pos.z+90+ahead},vel:{x:0,z:0},rot:0,mass:100,radius:2,data:{worldRecordId:'proof:reacquire-obstacle'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:2,shape:'ball',useMeasuredSkin:false,material:'wreck'}});}
test('late full-compound obstruction brakes, holds without creating a tow, and resumes after clearance',async()=>{const h=await restore(wire);try{
 const start={...h.b.breaker.pos};for(let i=0;i<1200&&Math.hypot(h.b.breaker.pos.x-start.x,h.b.breaker.pos.z-start.z)<2;i++)h.sim.step();
 const speed=Math.hypot(h.b.breaker.vel.x,h.b.breaker.vel.z);assert.ok(speed>.3);
 const solid=obstacle(h);h.physics._sg02.syncFromEntities(h.state.entityList);
 stepCeresWorkfleet(h.owner,1/60);assert.ok(blocked(h));const command=consumeCeresBreakerControl(h.b.breaker,h.state);assert.ok(command);
 assert.ok(command.force.x*h.b.breaker.vel.x+command.force.z*h.b.breaker.vel.z<0,'refusal issues bounded opposing thrust, not a forward push');
 assert.ok(Math.hypot(command.force.x,command.force.z)<=h.b.breaker.mass*.1+1e-8);
 for(let i=0;i<600;i++)h.sim.step();assert.equal(h.job().phase,'reacquire');assert.equal(h.job().towId,null);assert.ok(Math.hypot(h.b.breaker.vel.x,h.b.breaker.vel.z)<.02);
 assert.equal(h.b.section.data.jobId,h.job().id);assert.equal(h.physics._sg02.records.get(h.b.section.id)?.entity,h.b.section);
 solid.alive=false;h.physics._sg02.syncFromEntities(h.state.entityList);
 for(let i=0;i<5000&&h.job().phase!=='extract';i++)h.sim.step();assert.equal(h.job().phase,'extract');assert.equal(h.b.section.data.jobId,undefined);
}finally{h.close();}});
for(const kind of ['overwritten-life','destroyed-head','broken-mount','player-custody','cancel','restore-teardown'])test(`released-plate lease and commands close on ${kind}`,async()=>{const h=await restore(wire);try{
 h.sim.step();assert.equal(h.b.section.data.jobId,h.job().id);const lines=Object.keys(h.state.combat.attachments.byId).length;
 if(kind==='overwritten-life')h.b.section.occupantGeneration++;
 if(kind==='destroyed-head')h.b.cutterHead.hull=0;
 if(kind==='broken-mount')h.service.cut(h.job().mountId,h.b.cutterHead.id,'test-cut');
 if(kind==='player-custody')h.b.section.data.playerOwned=true;
 if(kind==='cancel'){h.job().phase='recovery-interrupted';clearCeresWorkfleetControls(h.state);}
 if(kind==='restore-teardown')h.sim.bus.emit('save:restoring',{});
 if(!['cancel','restore-teardown'].includes(kind))stepCeresWorkfleet(h.owner,1/60);
 assert.equal(h.b.section.data.jobId,undefined);assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);
 assert.equal(Object.keys(h.state.combat.attachments.byId).length,lines,'no replacement custody is minted');assert.equal(h.b.section.mass,1800);
 if(kind==='overwritten-life')assert.equal(h.job().reason,'reacquire-occupant-changed');
 if(kind==='destroyed-head'||kind==='broken-mount')assert.equal(h.job().phase,'head-disabled');
 if(kind==='player-custody')assert.equal(h.job().phase,'player-retained');
}finally{h.close();}});
test('local recovery never leases a remote plate or reissues a lease after owner life is overwritten',async()=>{const h=await restore(wire);try{
 h.sim.step();const plate=h.b.section;plate.pos.x=C.sitePlacement.pos.x+900;syncCeresWorkfleetActivity(h.owner);assert.equal(plate.data.jobId,undefined);
 plate.pos.x=C.sitePlacement.pos.x-80;plate.occupantGeneration++;syncCeresWorkfleetActivity(h.owner);stepCeresWorkfleet(h.owner,1/60);assert.equal(plate.data.jobId,undefined);assert.equal(h.job().phase,'recovery-interrupted');
 assert.equal(h.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities.payload).length,1);
}finally{h.close();}});
