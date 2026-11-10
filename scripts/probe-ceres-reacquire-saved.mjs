import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createAuthoritativeRuntime} from '../src/runtime/createAuthoritativeRuntime.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
const root=new URL('../',import.meta.url),file=process.argv[2]||'test/fixtures/ceres-reacquire/seed47-mid-return.json.gz';
const maxSteps=Number(process.argv[3]||90000);if(!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>200000)throw new Error('Bounded maxSteps required');
const output=new URL('.devshots/ceres-reacquire/',root);mkdirSync(output,{recursive:true});
const runtime=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:47}),state=runtime.state;
const scope=fn=>{const p=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{return fn();}finally{restoreFeatureMaps(p);}};
async function prepare(){const p=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{return await runtime.getSystem('physics').prepareBackend(state);}finally{restoreFeatureMaps(p);}}
state.mode='flight';state.ui.screenStack=[];const player=scope(()=>runtime.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:state.player,pos:{x:0,z:0}})));state.playerId=player.id;
scope(()=>runtime.getSystem('world').enterSector(C.sectorId));await prepare();
const bytes=readFileSync(new URL(file,root));const saved=JSON.parse(file.endsWith('.gz')?gunzipSync(bytes):bytes);
if(!scope(()=>runtime.getSystem('save').loadEnvelope(saved,'ceres-reacquire-proof')))throw new Error('restore failed');state.mode='flight';state.ui.screenStack=[];await prepare();
const id=C.identities.payload;let plate=state.entityList.find(e=>e.alive&&e.data?.worldRecordId===id);const life=plate.occupantGeneration;
const samples=[],phases=[],events=[];let lastPhase=null,continued=false,firstExtract=null,continuation=null;
const describe=e=>e&&({id:e.id,life:e.occupantGeneration,pos:{...e.pos},vel:{...e.vel},rot:e.rot,mass:e.mass,jobId:e.data?.jobId});
runtime.bus.on('physics:impact',p=>{if([p.aId,p.bId].some(id=>id===plate.id||state.entities.get(id)?.data?.ceresWorkfleetRole==='breaker')){events.push({tick:state.tick,p:structuredClone(p)});if(events.length>40)events.shift();}});
try{
 for(let i=0;i<maxSteps;i++){
  runtime.step(1/60);const job=state.npcJobs.ceresWorkfleet;
  if(job.phase!==lastPhase){phases.push({tick:state.tick,phase:job.phase});lastPhase=job.phase;console.log('PHASE',state.tick,job.phase);}
  if(state.tick%600===0){samples.push({tick:state.tick,job:structuredClone(job),plate:describe(plate),hardware:state.entityList.filter(e=>e.alive&&e.data?.ceresWorkfleetRole).map(describe)});console.log('PROGRESS',state.tick,job.phase,job.blockedReason,JSON.stringify(plate.pos));}
  if(!continued&&job.phase==='reacquire'&&job.reacquire?.leg==='approach'&&Math.hypot(...['x','z'].map(k=>state.entityList.find(e=>e.alive&&e.data?.ceresWorkfleetRole==='breaker').pos[k]-job.reacquire.start[k]))>2){
    const before=JSON.parse(JSON.stringify(describe(plate))),returnBudget=structuredClone(job.reacquireReturnBudget),envelope=scope(()=>runtime.getSystem('save').serialize('mid-reacquire-actual'));
    assert.equal(state.entities.get(plate.id),plate);assert.equal(plate.occupantGeneration,life);
    assert.ok(scope(()=>runtime.getSystem('save').loadEnvelope(envelope,'mid-reacquire-actual')));state.mode='flight';state.ui.screenStack=[];await prepare();
    const all=state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===id);assert.equal(all.length,1);plate=all[0];const after=JSON.parse(JSON.stringify(describe(plate)));
    for(const key of ['pos','vel','rot','mass'])assert.deepEqual(after[key],before[key]);assert.notEqual(after.life,before.life);assert.equal(state.npcJobs.ceresWorkfleet.phase,'reacquire');
    assert.deepEqual(state.npcJobs.ceresWorkfleet.reacquireReturnBudget,returnBudget,'Continue preserves the exact finite return budget');
    continuation={tick:state.tick,before,after,returnBudget};continued=true;console.log('ACTUAL_CONTINUE',JSON.stringify(continuation));
  }
  if(job.phase==='extract'&&!firstExtract)firstExtract=state.tick;
  if(firstExtract&&state.tick>=firstExtract+600)break;
  if(['worker-disabled','head-disabled','section-destroyed','player-retained','recovery-interrupted'].includes(job.phase))break;
 }
 const result={file,initialTick:saved.data?.entities?.tick,phases,job:state.npcJobs.ceresWorkfleet,tick:state.tick,firstExtract,originalPlateRetained:state.entities.get(plate.id)===plate&&(continued||plate.occupantGeneration===life),continuation,plate:describe(plate),plateNative:runtime.getSystem('physics')._sg02.records.get(plate.id)?.entity===plate,events,samples};
 writeFileSync(new URL('reacquire-saved-result.json',output),JSON.stringify(result,null,2));assert.ok(continuation);assert.equal(result.job.phase,'extract');assert.equal(result.plate.mass,1800);assert.ok(result.plateNative);console.log('RESULT',JSON.stringify({tick:result.tick,firstExtract,job:result.job,plate:result.plate,plateNative:result.plateNative}));
}finally{runtime.dispose();}
