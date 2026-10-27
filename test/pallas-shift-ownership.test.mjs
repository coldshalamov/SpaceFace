import test from 'node:test';
import assert from 'node:assert/strict';
import { pallasNativeFixture } from './fixtures/pallasNativeFixture.mjs';
import { PALLAS_SHIFT as C, pallasShiftJob, pallasShiftOwnsMovement, pallasShiftStatus } from '../src/data/pallasWorkShift.js';
import { armLaneErrands, applyLaneErrandIntent } from '../src/systems/laneErrands.js';

test('actual native shift hold survives a naturally armed ambient errand in runtime dispatch', async t => {
 const h = await pallasNativeFixture(); t.after(() => h.close()); h.step(6);
 const runtime=h.sim.registry.get('npcJobsRuntime'), entry=h.sim.helpers.npcJobs.byEntity(h.hauler.id);
 armLaneErrands(runtime,h.state.simTime);
 assert.ok(entry.errand && entry.errand.motion !== 'brake');
 const target=h.sim.helpers.traffic.pallasWorkTarget(entry,h.hauler);
 assert.equal(target.settled,true); assert.ok(target.workPose);
 assert.equal(pallasShiftOwnsMovement(h.state,entry,h.hauler),true);
 runtime._drive(entry,h.hauler);
 const held={...h.hauler.data.intent}; assert.equal(held.brake,true);
 assert.equal(applyLaneErrandIntent(runtime,entry,h.hauler,h.state.simTime),true);
 const overwritten={...h.hauler.data.intent}; assert.equal(overwritten.brake,false);
 runtime.update(1/60,h.state);
 const dispatched={...h.hauler.data.intent}; assert.equal(dispatched.brake,true); assert.equal(dispatched.moveZ,0);
 console.log('PALLAS_ERRAND_CAUSAL',JSON.stringify({nativeTick:h.state.tick,job:entry.job.id,errand:entry.errand.id,held,overwritten,dispatched}));
});

test('only the bound original shift job excludes ordinary errand movement', async t => {
 const h=await pallasNativeFixture(); t.after(()=>h.close());h.step(6);
 const runtime=h.sim.registry.get('npcJobsRuntime'),entry=h.sim.helpers.npcJobs.byEntity(h.hauler.id);
 armLaneErrands(runtime,h.state.simTime);
 const payload=entry.job.payload;
 entry.job.payload=null;
 assert.equal(pallasShiftOwnsMovement(h.state,entry,h.hauler),false);
 runtime.update(1/60,h.state);
 assert.equal(h.hauler.data.intent.brake,false,'ordinary nonshift errand still writes through production dispatch');
 entry.job.payload=payload;
 for(const [field,value] of [['entityId',-1],['worldRecordId','foreign'],['sectorId','foreign']]) {
  const old=entry[field];entry[field]=value;
  assert.equal(pallasShiftOwnsMovement(h.state,entry,h.hauler),false,field);entry[field]=old;
 }
 const id=entry.job.id;
 h.state.npcJobs.byId[id]={...entry,job:{...entry.job}};
 assert.equal(pallasShiftOwnsMovement(h.state,entry,h.hauler),false,'captured replaced entry cannot claim intent');
 h.state.npcJobs.byId[id]=entry;
 const oldId=entry.job.id;entry.job.id='stale';assert.equal(pallasShiftOwnsMovement(h.state,entry,h.hauler),false);entry.job.id=oldId;
});

test('danger status accepts only original current jobs and preserves terminal precedence', async t => {
 const h=await pallasNativeFixture({native:false});t.after(()=>h.close());h.step(1);
 const entry=h.sim.helpers.npcJobs.byEntity(h.hauler.id);
 entry.job.phase='flee';
 assert.equal(pallasShiftJob(h.state,h.hauler),entry);
 assert.match(pallasShiftStatus(h.state,h.hauler).text,/avoiding danger/);
 for(const [field,value] of [['entityId',-1],['worldRecordId','foreign'],['sectorId','foreign']]) {
  const old=entry[field];entry[field]=value;
  assert.doesNotMatch(pallasShiftStatus(h.state,h.hauler).text,/avoiding danger/,field);entry[field]=old;
 }
 const old=entry.job;entry.job={...old,id:'foreign',phase:'flee'};
 assert.doesNotMatch(pallasShiftStatus(h.state,h.hauler).text,/avoiding danger/);entry.job=old;
 const originalId=h.hauler.data.jobId;h.hauler.data.jobId='foreign';
 h.state.npcJobs.byId.foreign={...entry,job:{...old,id:'foreign'}};
 assert.doesNotMatch(pallasShiftStatus(h.state,h.hauler).text,/avoiding danger/);h.hauler.data.jobId=originalId;
 h.state.traffic.pallasWorkLoop.phase='arrived';assert.match(pallasShiftStatus(h.state,h.hauler).label,/ARRIVAL/);
 h.state.traffic.pallasWorkLoop.phase='lost';assert.match(pallasShiftStatus(h.state,h.hauler).label,/INTERRUPTED/);
});
