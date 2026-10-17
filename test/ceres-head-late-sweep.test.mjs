import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {restore} from './ceres-reacquire-harness.mjs';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {ceresWorkfleetPose} from '../src/data/ceresWorkfleet.js';
import {stepCeresWorkfleet,consumeCeresHeadControl,consumeCeresBreakerControl,ceresWorkfleetHeadReturnTarget} from '../src/systems/ceresWorkfleet.js';
import {ceresWorkfleetRecoveryClear} from '../src/systems/ceresWorkfleetRecovery.js';
test('a solid admitted after head waypoint issuance revokes that exact request before native force application',async()=>{
 const flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);
 const h=await restore(JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/seed47-mid-head-return.json',import.meta.url))));
 try{
  for(let i=0;i<9000;i++){h.sim.step();if(h.job().phase==='head_retract'&&h.job().index===1)break;}
  assert.equal(h.job().index,1);stepCeresWorkfleet(h.owner,1/60);
  const at=ceresWorkfleetPose({...h.b.breaker.pos,rot:h.b.breaker.rot},{x:-16,z:15,rot:0});
  const solid=h.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:at.x,z:at.z},vel:{x:0,z:0},mass:100,radius:2,data:{worldRecordId:'proof:head-late-solid'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:2,shape:'ball',useMeasuredSkin:false,material:'wreck'}});
  h.physics._sg02.syncFromEntities(h.state.entityList);
  assert.equal(consumeCeresHeadControl(h.b.cutterHead,h.state,h.owner),null);
  assert.equal(consumeCeresBreakerControl(h.b.breaker,h.state),null);
  for(let i=0;i<300;i++)h.sim.step();assert.equal(h.job().index,1,'a blocked safe prefix cannot be mistaken for the authored waypoint');
  solid.alive=false;h.physics._sg02.syncFromEntities(h.state.entityList);
  for(let i=0;i<5000&&h.job().phase==='head_retract';i++)h.sim.step();assert.notEqual(h.job().phase,'head_retract','cleared head path resumes through real physical docking');
 }finally{h.close();restoreFeatureMaps(flags);}
});

test('carrier return encloses the measured head outline without inventing contact at the cut mouth',async()=>{
 const flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);
 const wire=JSON.parse(readFileSync(new URL('./fixtures/ceres-handoff/seed47-head-return-entry.json',import.meta.url)));
 // Observed full-production seed-47 carrier pose at release; the fixture supplies
 // the original head and plate. The real blade has clearance where a radius box does not.
 Object.assign(wire.records.byId['ceres:second_measure:breaker'],{pos:{x:-12869.612854003906,z:9628.906982421875},
  vel:{x:0,z:0},rot:1.570796798328529,angVel:0});
 const h=await restore(wire);
 try{
  h.sim.step();const b=h.b,head=b.cutterHead,from={...b.breaker.pos,rot:b.breaker.rot},to={...from,z:from.z-.1};
  const headTarget=ceresWorkfleetHeadReturnTarget(b.breaker,head,0).pose,native=h.physics._sg02;
  assert.equal(ceresWorkfleetRecoveryClear(native,h.state,b,from,to,{headTarget}).ok,true,'clear head entry must not freeze carrier realignment');
  const at=ceresWorkfleetPose({...head.pos,rot:head.rot},{x:7,z:4,rot:0});
  const solid=h.sim.spawn({type:'wreck',alive:true,hull:100,collides:true,pos:{x:at.x,z:at.z},vel:{x:0,z:0},mass:100,radius:.5,
   data:{worldRecordId:'proof:actual-head-contact'},physicsBody:{schemaVersion:1,dynamic:false,mass:100,radius:.5,shape:'ball',useMeasuredSkin:false,material:'wreck'}});
  native.syncFromEntities(h.state.entityList);
  const hit=ceresWorkfleetRecoveryClear(native,h.state,b,from,to,{headTarget});
  assert.equal(hit.ok,false);assert.equal(hit.blocker,solid.data.worldRecordId);assert.equal(hit.part,'actual-head-route');
 }finally{h.close();restoreFeatureMaps(flags);}
});
