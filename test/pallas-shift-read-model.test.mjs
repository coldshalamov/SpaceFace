import test from 'node:test';
import assert from 'node:assert/strict';
import { pallasSeamNativeFixture } from './fixtures/pallas-seam-native.mjs';
import { PALLAS_SHIFT as C, pallasShiftActor, pallasShiftStatus } from '../src/data/pallasWorkShift.js';
import { livingWorkStatusText, createContactHailResponse } from '../src/data/contactHail.js';
import { createDomainDiffer, applyDomainPathUpdate, createReadModel, applySpawnInfos, canonicalClone, DOMAIN_MIRROR_KEYS } from '../scripts/lib/simReadModel.mjs';

// Actual production domain serializer and receiver, including the job allowlist. Entity SPAWN
// input uses entityInfoBlock's documented v2 canonical data/vitals shape; no native authority
// crosses this boundary. This is a read-model/Hail contract test, not browser flight acceptance.
test('real threat reaches Hail through the bounded worker/main projection', async t => {
 const h=await pallasSeamNativeFixture();t.after(()=>h.close());h.step(60);
 assert.equal(DOMAIN_MIRROR_KEYS.filter(k=>k==='traffic.pallasWorkLoop').length,1);
 assert.equal(DOMAIN_MIRROR_KEYS.includes('traffic'),false);
 const differ=createDomainDiffer();const wire=JSON.parse(JSON.stringify(differ.diff(h.state,h.state.tick).updates));
 const main={};const domains=new Map();
 for(const u of wire) {
  const segs=u.segs.length===1&&u.segs[0].includes('.')?u.segs[0].split('.'):u.segs;
  domains.clear();domains.set(segs[0],main[segs[0]]);
  applyDomainPathUpdate(domains,{...u,segs},new Set());main[segs[0]]=domains.get(segs[0]);
 }
 const model=createReadModel();
 applySpawnInfos(model,[C.hauler,C.escort].map(slot=>{
  const e=pallasShiftActor(h.state,slot);
  return {v:2,entityId:e.id,type:e.type,alive:e.alive,x:e.pos.x,z:e.pos.z,
   data:canonicalClone(e.data),vitals:{hull:e.hull}};
 }));
 main.entities=model.entities;main.entityList=[...model.entities.values()];
 const hauler=pallasShiftActor(main,C.hauler);
 assert.ok(hauler);assert.notEqual(hauler,pallasShiftActor(h.state,C.hauler));
 assert.deepEqual(main.traffic.pallasWorkLoop,h.state.traffic.pallasWorkLoop);
 assert.equal(main.npcJobs.byId[hauler.data.jobId].job.phase,'flee');
 assert.match(livingWorkStatusText(hauler,{state:main}),/SKER RUN UNDER THREAT/);
 assert.match(createContactHailResponse(main,{kind:'trader',targetId:hauler.id},'status').lines[0],/avoiding danger/);
 assert.notEqual(main.npcJobs.byId[hauler.data.jobId],h.state.npcJobs.byId[hauler.data.jobId]);
 assert.deepEqual(Object.keys(main.traffic),['pallasWorkLoop']);
 const bytes=Buffer.byteLength(JSON.stringify(main.traffic.pallasWorkLoop));assert.ok(bytes<1024);
 const row=main.traffic.pallasWorkLoop;row.seed++;
 assert.equal(pallasShiftStatus(main,hauler),null,'a stale session receipt is not the current passage');row.seed--;
 const entry=main.npcJobs.byId[hauler.data.jobId],originalId=entry.entityId;
 entry.entityId=-1;
 const escort=pallasShiftActor(main,C.escort),escortEntry=main.npcJobs.byId[escort.data.jobId];
 const originalEscortId=escortEntry.entityId;escortEntry.entityId=-2;
 assert.doesNotMatch(pallasShiftStatus(main,hauler).text,/avoiding danger/,'stale session entity bindings cannot explain current work');
 entry.entityId=originalId;escortEntry.entityId=originalEscortId;
 row.phase='arrived';assert.match(livingWorkStatusText(hauler,{state:main}),/SMUGGLER DEN ARRIVAL/);
 row.phase='lost';assert.match(livingWorkStatusText(hauler,{state:main}),/SKER RUN INTERRUPTED/);
 console.log('PALLAS_HAIL_WIRE',JSON.stringify({bookBytes:bytes,jobPhase:entry.job.phase,bookKeys:Object.keys(row)}));
});
