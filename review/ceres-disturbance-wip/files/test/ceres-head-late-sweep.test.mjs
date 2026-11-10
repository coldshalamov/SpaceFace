import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {restore} from './ceres-reacquire-harness.mjs';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {ceresWorkfleetPose} from '../src/data/ceresWorkfleet.js';
import {stepCeresWorkfleet,consumeCeresHeadControl,consumeCeresBreakerControl} from '../src/systems/ceresWorkfleet.js';
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
