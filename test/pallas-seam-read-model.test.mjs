import test from 'node:test';
import assert from 'node:assert/strict';
import { pallasSeamNativeFixture } from './fixtures/pallas-seam-native.mjs';
import { PALLAS_SEAM as C } from '../src/data/pallasSeamWork.js';
import { createTargetPanel } from '../src/ui/targetPanel.js';
import { createDomainDiffer, createReadModel, applyDomainPathUpdate, applySpawnInfos, applyEntityVitals, canonicalClone, DOMAIN_MIRROR_KEYS } from '../scripts/lib/simReadModel.mjs';
import { collectEntityVitals, entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';
import { projectNpcJobsById } from '../scripts/lib/npcJobsMirror.mjs';

class NodeStub {
 constructor(){this.style={};this.dataset={};this.children=new Map();this.textContent='';this.classList={toggle(){}};}
 querySelector(key){if(!this.children.has(key))this.children.set(key,new NodeStub());return this.children.get(key);}
 setAttribute(){} addEventListener(){}
}

// Presentation contract cases deliberately vary wire facts, not native physics or acceptance.
// The persistent panel instance consumes real domain/vitals producers and receiver functions;
// six ordinary updates exercise its existing slow-update and text caches without forceRefresh.
test('finite seam facts refresh the existing target panel across actual domain and vital projection', async t=>{
 const h=await pallasSeamNativeFixture({native:false});t.after(()=>h.close());h.step(1);
 const miner=h.state.entityList.find(e=>e.data?.activityActorSlotId===C.miner);
 const surveyor=h.state.entityList.find(e=>e.data?.activityActorSlotId===C.surveyor);
 const entry=h.sim.helpers.npcJobs.byEntity(miner.id);entry.job.phase='work';
 const model=createReadModel(),main={};
 const differ=createDomainDiffer();let tick=60;
 function domains(){
  // Advance each ordinary publish slot: jumping by60 would miss staggered cadence slots.
  const wire=[];
  for(let pass=0;pass<60;pass++)wire.push(...JSON.parse(JSON.stringify(differ.diff(h.state,++tick).updates)));
  for(const u of wire){const segs=u.segs.length===1&&u.segs[0].includes('.')?u.segs[0].split('.'):u.segs;
   const holder=new Map([[segs[0],main[segs[0]]]]);applyDomainPathUpdate(holder,{...u,segs},new Set());main[segs[0]]=holder.get(segs[0]);}
 }
 domains();
 applySpawnInfos(model,[miner,surveyor,h.player].map(e=>({v:2,entityId:e.id,type:e.type,alive:e.alive,team:e.team,x:e.pos.x,z:e.pos.z,
  data:canonicalClone(e.data),vitals:entityVitalsOf(e)})));
 main.entities=model.entities;main.entityList=[...model.entities.values()];main.player.targetId=miner.id;
 const oldDocument=globalThis.document;globalThis.document={createElement:()=>new NodeStub()};
 t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;});
 const panel=createTargetPanel({state:main});const line=panel.el.querySelector('.sf-target__object');
 const render=()=>{for(let i=0;i<6;i++)panel.update();return line.textContent;};
 assert.match(render(),/Approaching metallic workface/);
 const shadow=new Map();collectEntityVitals({entityList:[miner]},shadow);
 miner.data.minerShiftActive=true;
 const changed=collectEntityVitals({entityList:[miner]},shadow);assert.equal(changed.length,1);
 applyEntityVitals(model,JSON.parse(JSON.stringify(changed)));assert.match(render(),/Cutting metallic ore/);
 assert.equal(collectEntityVitals({entityList:[miner]},shadow).length,0,'unchanged work light sends no packet');
 miner.data.minerShiftActive=false;miner.data.pallasSeamStandbyTick=main.tick;
 applyEntityVitals(model,JSON.parse(JSON.stringify(collectEntityVitals({entityList:[miner]},shadow))));
 assert.match(render(),/Standing by at workface/);
 miner.data.pallasSeamStandbyTick=null;
 applyEntityVitals(model,JSON.parse(JSON.stringify(collectEntityVitals({entityList:[miner]},shadow))));
 assert.equal(model.entities.get(miner.id).data.pallasSeamStandbyTick,null);
 assert.equal(model.entities.get(miner.id).data.minerShiftActive,false);
 assert.match(render(),/Approaching metallic workface/);
 for(const stamp of [main.tick+1,main.tick-3]) {
  miner.data.pallasSeamStandbyTick=stamp;
  applyEntityVitals(model,JSON.parse(JSON.stringify(collectEntityVitals({entityList:[miner]},shadow))));
  assert.match(render(),/Approaching metallic workface/);
 }
 miner.data.pallasSeamStandbyTick=null;
 applyEntityVitals(model,JSON.parse(JSON.stringify(collectEntityVitals({entityList:[miner]},shadow))));
 for(const [key,label] of [['pallasSeamFinished',/Cut finished/],['pallasSeamWaiting',/No workable metallic source/],['pallasSeamUnavailable',/Source lost or depleted/]]){
  entry.job.payload={...entry.job.payload,pallasSeamFinished:false,pallasSeamWaiting:false,pallasSeamUnavailable:false,[key]:true};
  domains();assert.match(render(),label,'same target and panel must refresh changed projected flags');
 }
 entry.job.payload.pallasSeamUnavailable=false;entry.job.payload.pallasSeamSource='private-source-authority';entry.job.payload.pallasSeamFinished='true';
 domains();assert.match(render(),/Approaching metallic workface/);
 const projected=projectNpcJobsById(h.state.npcJobs.byId)[entry.job.id];
 assert.equal(projected.job.payload.pallasSeamSource,undefined);assert.equal(projected.job.payload.pallasSeamFinished,undefined);
 const worldRecordId=entry.worldRecordId;entry.worldRecordId='foreign';domains();assert.match(render(),/Work unavailable/);entry.worldRecordId=worldRecordId;
 const jobId=entry.job.id;entry.job.id='stale-session-job';domains();assert.match(render(),/Work unavailable/);entry.job.id=jobId;
 assert.ok(DOMAIN_MIRROR_KEYS.includes('npcJobs.surveyMarks.sector_pallas_drift'));
 assert.equal(DOMAIN_MIRROR_KEYS.includes('npcJobs.surveyMarks'),false);
 main.player.targetId=surveyor.id;
 const now=h.state.simTime;
 for(const reading of [{fieldId:'foreign',measuredAt:now,depletion:.5},{fieldId:C.field,measuredAt:now+1,depletion:.5},{fieldId:C.field,measuredAt:now-421,depletion:.5},{fieldId:C.field,measuredAt:now,depletion:2}]){
  h.state.npcJobs.surveyMarks[C.sector]=[reading];domains();assert.match(render(),/No fresh field reading/);
 }
 h.state.npcJobs.surveyMarks[C.sector]=[{fieldId:C.field,measuredAt:now,depletion:.5}];domains();assert.match(render(),/50% depleted/);
 h.state.npcJobs.surveyMarks[C.sector]=[];domains();assert.match(render(),/No fresh field reading/);
 const unrelated={...miner,id:999,data:{...miner.data,activityActorSlotId:'foreign'}};
 assert.equal(entityVitalsOf(unrelated).pallasSeamCutting,undefined);
 console.log('PALLAS_SEAM_PANEL',JSON.stringify({samePanel:true,finiteFlags:3,dynamicScalars:2,surveyCap:24,staleSeconds:420}));
});
