import test from 'node:test';
import assert from 'node:assert/strict';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { ceresTenderClearanceFixture, assertTenderNativeContacts } from './fixtures/ceres-tender-clearance.mjs';

const request = entityId => ({ version: 1, entityId, tick: 1, kind: 'hold',
  forceLocal: { forward: 1, right: 0 }, torqueYaw: 0, boost: false, brake: false,
  targetHeading: 0, horizonTicks: 1, trajectory: [], reason: 'tender_authority_boundary' });

test('ordinary Ceres tender excludes ambient maneuver only while exact service owns flight', async t => {
  const f = await ceresTenderClearanceFixture();
  try {
    const jobs = f.runtime.getSystem('npcJobsRuntime'), ports = f.runtime.getSystem('aiPorts');
    const actor = f.state.entityList.find(e => e.data?.activityActorSlotId === 'ceres_refinery_tender');
    const jobId = actor.data.jobId, entry = f.state.npcJobs.byId[jobId];
    const owns = e => jobs._ceresTenderOwnsFlight(e);
    assert.equal(owns(actor), true);
    for(const impostor of [{...actor},{...actor,id:actor.id+100000}]) {
      assert.equal(owns(impostor),false);
      assert.equal(owns(actor),true,'unrelated impostor cannot consume genuine authority');
    }
    assert.equal(ports._requestManeuver(request(actor.id)), false);
    assert.equal(ports._diag.lastDropReason, 'ceres_tender_owned');

    const binding=jobs._ceresRealTargetActorBinding(actor.data.worldRecordId);
    const originalPhase=entry.job.phase, originalIndex=entry.job.routeIndex;
    for(const phase of ['commission','depart','transit','approach','work','return','flee']) {
      entry.job.phase=phase;
      for(const index of [0,1]) {entry.job.routeIndex=index; assert.equal(owns(actor),true,`${phase}:${index} remains job owned`);}
    }
    entry.job.phase=originalPhase;entry.job.routeIndex=originalIndex;
    binding.targetAmbiguous=true;assert.equal(owns(actor),true,'missing/ambiguous client does not hand flight to ambient AI');binding.targetAmbiguous=false;
    binding.actorAmbiguous=true;assert.equal(owns(actor),false);binding.actorAmbiguous=false;
    const savedPhase=entry.job.phase,savedIndex=entry.job.routeIndex;
    for(const [phase,index] of [['commission',0],['transit',0],['work',1],['return',1],['approach',0]]) {
      entry.job.phase=phase;entry.job.routeIndex=index;
      const target=jobs._ceresTenderPhysicalTarget(entry,actor);
      assert.ok(target&&target.reach===2);
      jobs._drive(entry,actor);
      assert.equal(actor.data.intent.brake,false,`${phase} uses RCS, never PulsePlate brake-charge`);
      assert.equal(actor.data.intent.boost,false);
    }
    entry.job.phase='work';entry.job.routeIndex=1;
    const client=binding.targetRef,clientData=binding.targetDataRef;
    binding.targetRef=null;binding.targetDataRef=null;
    assert.deepEqual(jobs._ceresTenderPhysicalTarget(entry,actor).pos,entry.job.route[1].pos,'missing client retains canonical fallback');
    binding.targetRef=client;binding.targetDataRef=clientData;
    const savedPos=actor.pos;actor.pos={...client.pos};
    const zeroDistanceTarget=jobs._ceresTenderPhysicalTarget(entry,actor);
    assert.ok(Number.isFinite(zeroDistanceTarget.pos.x)&&Number.isFinite(zeroDistanceTarget.pos.z));
    actor.pos=savedPos;
    entry.job.phase=savedPhase;entry.job.routeIndex=savedIndex;
    const cases = [
      ['replacement same-id entity', () => { const replacement={...actor}; f.state.entities.set(actor.id,replacement); return () => f.state.entities.set(actor.id,actor); }],
      ['same-object generation change', () => { const old=actor.occupantGeneration; actor.occupantGeneration=(old||0)+1; return () => {actor.occupantGeneration=old;}; }],
      ['changed to another admitted world record', () => { const old=actor.data.worldRecordId; actor.data.worldRecordId=jobs._ensureCeresRealTargetAuthority().bindings.find(b=>b!==binding).worldRecordId; return () => {actor.data.worldRecordId=old;}; }],
      ['changed world record', () => { const old=actor.data.worldRecordId; actor.data.worldRecordId='forged'; return () => {actor.data.worldRecordId=old;}; }],
      ['replacement data', () => { const old=actor.data; actor.data={...old}; return () => {actor.data=old;}; }],
      ['replacement entry', () => { f.state.npcJobs.byId[jobId]={...entry}; return () => {f.state.npcJobs.byId[jobId]=entry;}; }],
      ['replacement job', () => { const old=entry.job; entry.job={...old}; return () => {entry.job=old;}; }],
      ['replacement route', () => { const old=entry.job.route; entry.job.route=[...old]; return () => {entry.job.route=old;}; }],
      ['completed job', () => { const old=entry.job.phase; entry.job.phase='complete'; return () => {entry.job.phase=old;}; }],
      ['virtualized job', () => { entry.job.materialized=false; return () => {entry.job.materialized=true;}; }],
      ['released job', () => { delete f.state.npcJobs.byId[jobId]; return () => {f.state.npcJobs.byId[jobId]=entry;}; }],
      ['foreign sector', () => { const old=f.state.world.currentSectorId; f.state.world.currentSectorId='sector_helios_prime'; return () => {f.state.world.currentSectorId=old;}; }],
      ['forged slot', () => { const old=actor.data.activityActorSlotId; actor.data.activityActorSlotId='ceres_seam_surveyor'; return () => {actor.data.activityActorSlotId=old;}; }],
    ];
    for (const [name, mutate] of cases) await t.test(name, () => {
      const restore=mutate();
      try { assert.equal(owns(actor),false,name); }
      finally { restore(); }
      if (!['completed job','foreign sector'].includes(name)) assert.equal(owns(actor),false,'observed invalid authority cannot revive by restoring fields');
      // Re-admission uses the existing lifecycle seam, never a second guard cache.
      jobs._refreshCeresRealTargetsForEntry(entry,actor);
      assert.equal(owns(actor),true,'lifecycle re-admission restores genuine authority');
    });

    for(const holder of ['external-controller','trafficTenderService','contactHail']) {
      assert.equal(jobs.claimControl(jobId,{claimId:`test:${holder}`,holder}).granted,true);
      assert.equal(owns(actor),false,'foreign/emergency controller retains its flight authority');
      assert.equal(ports._requestManeuver(request(actor.id)),true,'ordinary guard does not capture leased flight');
      assert.equal(jobs.releaseControl(jobId,`test:${holder}`).released,true);
      const control=writePhysicsControl(actor,{source:'test-job-owned',force:{x:12,z:34}});
      const flushed=ports._diag.flushedManeuvers;
      ports.update(1/60,f.state);
      assert.equal(ports._diag.flushedManeuvers,flushed,'queued maneuver loses authority on handback before flush');
      assert.equal(ports._diag.lastDropReason,'ceres_tender_owned');
      assert.equal(control.source,'test-job-owned','flush did not overwrite the owner control');
    }
    const other=f.state.entityList.find(e=>e.type==='ship'&&e.id!==actor.id&&e.id!==f.state.playerId);
    assert.ok(other);
    assert.equal(owns(other),false,'unrelated ships retain ordinary AI');
    assert.equal(ports._requestManeuver(request(other.id)),true);
    ports._pendingManeuvers.clear();

  } finally { f.close(); }
});

test('native contact failure escapes even when native callbacks swallow thrown exceptions', () => {
  const record={entity:{id:1},colliders:[{}]},target={entity:{id:2}};
  const other={handle:2,isSensor:()=>false};
  const swallowing=fn=>{try{fn();}catch{}};
  const native={_colliderOwners:new Map([[2,{rec:target}]]),world:{
    contactPairsWith(c,fn){swallowing(()=>fn(other));},
    contactPair(c,o,fn){swallowing(()=>fn({numContacts:()=>1,contactDist:()=>-17.95}));}
  }};
  assert.throws(()=>assertTenderNativeContacts(native,record,7),/1\/2 depth -17.95/);
});

test('ordinary tender flight authority rebinds through whole-save Continue', async () => {
  const f=await ceresTenderClearanceFixture();
  try {
    const jobs=f.runtime.getSystem('npcJobsRuntime'),save=f.runtime.getSystem('save');
    const old=f.state.entityList.find(e=>e.data?.activityActorSlotId==='ceres_refinery_tender');
    const worldRecordId=old.data.worldRecordId;
    assert.equal(jobs._ceresTenderOwnsFlight(old),true);
    const oldJob=f.state.npcJobs.byId[old.data.jobId].job;
    oldJob.phase='work';oldJob.routeIndex=1;oldJob.progress=.42;
    const envelope=JSON.parse(JSON.stringify(save.serialize('tender-flight-continue')));delete envelope.checksum;
    assert.equal(save.loadEnvelope(envelope),true);
    f.physics._finishNativeRestore();f.state.mode='flight';
    assert.equal(await f.physics.prepareBackend(f.state),true);
    const current=f.state.entityList.find(e=>e.alive&&e.data?.worldRecordId===worldRecordId);
    assert.ok(current);
    const restoredJob=f.state.npcJobs.byId[current.data.jobId].job;
    assert.equal(restoredJob.phase,'work');assert.equal(restoredJob.progress,.42);
    assert.ok(jobs._ceresTenderPhysicalTarget(f.state.npcJobs.byId[current.data.jobId],current));
    assert.equal(jobs._ceresTenderOwnsFlight(current),true,'restored canonical job reacquires exact current incarnation');
    if(current!==old)assert.equal(jobs._ceresTenderOwnsFlight(old),false);
    assert.equal(jobs._ceresTenderOwnsFlight(current),true,'stale pre-Continue actor cannot revoke restored authority');
  } finally {f.close();}
});

test('ordinary tender work progress waits for actual position and relative speed', async () => {
  const f=await ceresTenderClearanceFixture();
  try {
    const jobs=f.runtime.getSystem('npcJobsRuntime');
    const actor=f.state.entityList.find(e=>e.data?.activityActorSlotId==='ceres_refinery_tender');
    const entry=f.state.npcJobs.byId[actor.data.jobId];
    // Focused update-boundary positions, not claimed as a native gameplay route.
    entry.job.phase='work';entry.job.routeIndex=1;entry.job.progress=.2;
    const before=entry.job.progress;
    jobs.update(.1,f.state);
    assert.equal(entry.job.progress,before,'work cannot advance outside actual standoff');
    actor.pos={...jobs._ceresTenderPhysicalTarget(entry,actor).pos};actor.vel={x:9,z:0};
    jobs.update(.1,f.state);
    assert.equal(entry.job.progress,before,'passing the worksite too fast is not arrival');
    actor.vel={x:0,z:0};jobs.update(.1,f.state);
    assert.ok(entry.job.progress>before,'settled same job resumes without resetting/replaying progress');
  } finally {f.close();}
});
