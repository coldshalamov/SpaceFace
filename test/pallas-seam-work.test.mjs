import test from 'node:test';
import assert from 'node:assert/strict';
import { pallasSeamNativeFixture } from './fixtures/pallas-seam-native.mjs';
import { pallasSeamTarget, stepPallasSeamCut } from '../src/systems/pallasSeamWork.js';
import { PALLAS_SEAM as C, pallasSeamCenter, pallasSeamInfoLine } from '../src/data/pallasSeamWork.js';
import { environmentSurfaceData } from '../src/data/environmentMaterials.js';
const actor = (h, slot) => h.state.entityList.find(e => e.alive !== false && e.data?.activityActorSlotId === slot);
const entry = (h, a) => h.state.npcJobs.byId[a.data.jobId];

test('ordinary metallic field yields finite loose ore; survey arrives physically; Continue keeps depletion and source identity', { timeout: 240000 }, async t => {
  const h = await pallasSeamNativeFixture(); t.after(() => h.close());
  const miner = actor(h, C.miner), surveyor = actor(h, C.surveyor), initialSurveyPos = {...surveyor.pos};
  const jobs = h.sim.registry.get('npcJobsRuntime'), save = h.sim.registry.get('save');
  const sourceBefore = h.state.entityList.filter(e => e.type === 'asteroid' && e.data?.fieldId === C.field);
  assert.ok(sourceBefore.length > 0 && sourceBefore.every(e => e.data.opticMaterial === 'metal'));
  let yielded = 0, marks = [], posted = 0;
  h.sim.bus.on('mining:yield', event => { if (event.minerId === miner.id) yielded += event.qty; });
  h.sim.bus.on('npcjobs:lotPosted', event => { if (event.postedBy === miner.data.jobId) posted++; });
  h.sim.bus.on('npcjobs:surveyMarked', event => {
    if (event.jobId !== surveyor.data.jobId) return;
    const target = pallasSeamTarget(jobs, entry(h, surveyor), surveyor);
    assert.ok(target && !target.blocked);
    assert.ok(Math.hypot(surveyor.pos.x-target.pos.x,surveyor.pos.z-target.pos.z)<=12);
    assert.ok(Math.hypot(surveyor.vel.x,surveyor.vel.z)<=8);
    marks.push(event);
  });
  const credits = h.state.player.credits;
  for (let second=0;second<240;second++) {
    h.step(60);
    if (entry(h, miner).job.payload?.pallasSeamFinished && marks.length) break;
  }
  assert.ok(yielded > 0, 'actual surface-tagged metallic ore is extracted');
  assert.equal(posted, 0, 'no advisory freight was passed off as cargo');
  assert.ok(marks.some(m => m.fieldId === C.field));
  assert.ok(Math.hypot(surveyor.pos.x-initialSurveyPos.x,surveyor.pos.z-initialSurveyPos.z)>30, 'native survey vessel travels');
  assert.equal(h.state.player.credits, credits, 'no invented work payment');
  const sourceId = entry(h, miner).job.payload.pallasSeamSource;
  const resource = h.state.world.resourceBodies.byId[sourceId];
  assert.ok(resource && ['destroyed','depleted'].includes(resource.outcome));
  assert.equal(entry(h, miner).job.payload.pallasSeamFinished, true);
  assert.match(pallasSeamInfoLine(miner,h.state),/Cut finished/);
  assert.match(pallasSeamInfoLine(surveyor,h.state),/% depleted/);
  const saved = JSON.parse(JSON.stringify(save.serialize('pallas-seam-finished'))); delete saved.checksum;
  const oldPose = {...miner.pos}, oldOre = resource.oreHp;
  h.step(600); assert.equal(posted, 0);
  assert.equal(save.loadEnvelope(saved), true); h.physics._finishNativeRestore(); h.state.mode='flight';
  assert.equal(await h.physics.prepareBackend(h.state), true);
  const restored = actor(h,C.miner);
  assert.ok(restored); assert.ok(Math.hypot(restored.pos.x-oldPose.x,restored.pos.z-oldPose.z)<.001,'Continue never teleports saved worker');
  assert.equal(entry(h,restored).job.payload.pallasSeamSource,sourceId);
  assert.equal(entry(h,restored).job.payload.pallasSeamFinished,true);
  assert.equal(h.state.world.resourceBodies.byId[sourceId].oreHp,oldOre);
  h.step(120); assert.equal(pallasSeamTarget(jobs,entry(h,restored),restored).blocked,true);
  console.log(JSON.stringify({yielded,sourceId,resourceOutcome:resource.outcome,survey:marks[0],continued:true}));
});

test('actual material tags remain intact and optical structures remain unmineable', {timeout:120000}, async t => {
  const h=await pallasSeamNativeFixture();t.after(()=>h.close());
  const mining=h.sim.registry.get('mining');
  for(const material of ['metal','crystal']) {
    const data=environmentSurfaceData(material,{typeId:material==='metal'?'ast_metallic':'ast_crystalline',oreHP:100,oreHPMax:100,yieldU:8});
    const rock=h.sim.spawn({type:'asteroid',pos:{x:h.player.pos.x+50,z:h.player.pos.z},radius:12,hull:100,hullMax:100,data});
    const tag=rock.data.opticMaterial;
    h.state.input.worldObjectTargetId=rock.id;
    assert.equal(mining._acquireTarget(h.player,240,h.state),rock,'ordinary pointed target stays eligible');
    assert.ok(mining.applyMining(rock.id,18,1,h.player.id)>0);
    assert.equal(rock.data.opticMaterial,tag);
    const hp=rock.data.oreHP;rock.data.opticStructureId='authored-optic-lattice';
    assert.equal(mining._acquireTarget(h.player,240,h.state),null,'real optic lattice is not a mining target');
    assert.equal(mining.applyMining(rock.id,18,1,h.player.id),0);assert.equal(rock.data.oreHP,hp);
  }
});

test('physical worker pauses, rejects source replacement and never resumes from recycled identity', {timeout:120000},async t=>{
 const h=await pallasSeamNativeFixture();t.after(()=>h.close());
 const miner=actor(h,C.miner), jobs=h.sim.registry.get('npcJobsRuntime');h.step(60);
 const e=entry(h,miner), target=pallasSeamTarget(jobs,e,miner), source=h.state.entityList.find(r=>r.data?.resourceBodyId===e.job.payload.pallasSeamSource);
 assert.ok(source&&target&&!target.blocked);e.job.phase='work';
 const hp=source.data.oreHP;e.closeCallUntil=h.state.simTime+100;stepPallasSeamCut(jobs,e,miner,1);assert.equal(source.data.oreHP,hp);delete e.closeCallUntil;
 e.berthHold=true;stepPallasSeamCut(jobs,e,miner,1);assert.equal(source.data.oreHP,hp);e.berthHold=false;
 const replacement={...source,data:{...source.data}};h.state.entities.set(source.id,replacement);
 assert.equal(pallasSeamTarget(jobs,e,miner).blocked,true);stepPallasSeamCut(jobs,e,miner,1);assert.equal(replacement.data.oreHP,hp);
 h.state.entities.set(source.id,source);assert.equal(pallasSeamTarget(jobs,e,miner).blocked,true,'restoring stale ids cannot revive retired source');
 assert.match(pallasSeamInfoLine(miner,h.state),/Source lost or depleted/);
});

test('stale, future and malformed survey readings stay honest; missing source and duplicate actors cannot certify work',async t=>{
 const h=await pallasSeamNativeFixture({native:false});t.after(()=>h.close());
 const surveyor=actor(h,C.surveyor), miner=actor(h,C.miner),e=entry(h,surveyor);
 const ledger=h.state.npcJobs.surveyMarks;h.state.simTime=500;
 for(const mark of [{measuredAt:0,depletion:.2},{measuredAt:501,depletion:.2},{measuredAt:499,depletion:NaN}]) {
  ledger[C.sector]=[{...mark,fieldId:C.field,jobId:e.job.id}];
  assert.match(pallasSeamInfoLine(surveyor,h.state),/No fresh field reading/);
 }
 ledger[C.sector]=[{measuredAt:499,depletion:.3,fieldId:C.field,jobId:'another-surveyor'}];
 assert.match(pallasSeamInfoLine(surveyor,h.state),/30% depleted/,'shared latest field knowledge remains useful');
 ledger[C.sector].push({fieldId:C.field,measuredAt:498,depletion:.1,jobId:e.job.id});
 assert.match(pallasSeamInfoLine(surveyor,h.state),/Field report · 30% depleted/,'newest shared report, not this hull ownership');
 miner.data.pallasSeamStandbyTick=h.state.tick;
 assert.match(pallasSeamInfoLine(miner,h.state),/Standing by at workface/);
 h.state.tick+=3;assert.match(pallasSeamInfoLine(miner,h.state),/Approaching/);
 const duplicate={...miner,id:99999,data:{...miner.data}};h.state.entityList.push(duplicate);h.state.entities.set(duplicate.id,duplicate);
 assert.equal(pallasSeamTarget(h.sim.registry.get('npcJobsRuntime'),entry(h,miner),miner),null);
 h.state.entityList.pop();h.state.entities.delete(duplicate.id);
});

test('a synchronous owner callback cannot finish a replacement job; virtual seam work never posts ore lots',async t=>{
 const h=await pallasSeamNativeFixture({native:false});t.after(()=>h.close());
 const miner=actor(h,C.miner),jobs=h.sim.registry.get('npcJobsRuntime'),e=entry(h,miner),mining=h.sim.registry.get('mining');
 const target=pallasSeamTarget(jobs,e,miner),rock=h.state.entityList.find(r=>r.data?.resourceBodyId===e.job.payload.pallasSeamSource);
 assert.ok(target&&rock);
 // This adversarial callback test invokes an arrived custom-backend fixture, not a movement proof.
 miner.pos.x=target.pos.x;miner.pos.z=target.pos.z;e.job.phase='work';
 const apply=mining.applyMining;mining.applyMining=()=>{rock.data.oreHP=0;e.job={...e.job,payload:{replacement:true}};return 1;};
 stepPallasSeamCut(jobs,e,miner,.016);mining.applyMining=apply;
 assert.deepEqual(e.job.payload,{replacement:true});
 const lots=JSON.stringify(h.state.npcJobs.lots);e.entityId=null;
 jobs._noteHandoffIntent({jobId:e.job.id,event:'npcjobs:unload',kind:'miner'});
 assert.equal(JSON.stringify(h.state.npcJobs.lots),lots);
});
