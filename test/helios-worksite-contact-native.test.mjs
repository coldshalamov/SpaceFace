import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { firstIronContactIdentity } from '../src/data/heliosFirstIronContact.js';
import { heliosSharedCutRead } from '../src/systems/heliosSharedCut.js';
import { sellableCargoQuantity } from '../src/systems/cargoReadModel.js';
const DT=1/60;

test('published production cutter, ordinary Hail and real extraction carry the active first ticket through Save and a fresh working hail', {timeout:120000}, async()=>{
 const flags=snapshotFeatureMaps(),r=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:8008});
 applyFeatureConfigToMaps(r.config.features);
 try {
  const s=r.state,jobs=r.getSystem('npcJobsRuntime'),world=r.getSystem('world'),missions=r.getSystem('missions');
  s.mode='flight';s.ui.screenStack=[];r.getSystem('ships').newGame();
  const player=r.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,team:0,pos:{x:0,z:0}}));s.playerId=player.id;
  world.enterSector('sector_helios_prime');s.onboarding={active:false,finished:true};
  const posting=missions.ensureBoard('station_helios').slots.find(m=>m.params?.starterJobId==='starter_hitch');
  assert.match(posting.brief,/Hail.*MARK FIRST IRON/);assert.equal(missions.acceptMission(posting.id),true);
  const mission=s.missions.active.find(m=>m.params?.starterJobId==='starter_hitch');
  await r.getSystem('physics').prepareBackend(s);
  let worker;
  for(let i=0;i<7200;i++){r.step(DT);worker=s.entityList.find(e=>e.alive&&e.data?.minerShiftActive===true);if(worker)break;}
  assert.ok(worker);
  const record=worker.data.worldRecordId,jobId=worker.data.jobId;
  const rock=s.entities.get(worker.data.minerShiftRockId),entry=s.npcJobs.byId[jobId];
  // Admission placement only. This test does not claim unassisted main-menu travel.
  world.relocatePlayerInSector({x:worker.pos.x,z:worker.pos.z-180},{reason:'shared-hail-admission-fixture'});
  s.player.targetId=worker.id;
  const offers=[],replies=[],grants=[],yielded=[];
  r.bus.on('contactHail:offer',e=>offers.push(e));r.bus.on('contactHail:response',e=>replies.push(e));
  r.bus.on('economy:grantCredits',e=>grants.push(e));r.bus.on('mining:yield',e=>yielded.push(e));
  const hail=()=>{
   const offeredBefore=offers.length,repliedBefore=replies.length;
   r.bus.emit('contactHail:request',{targetId:s.player.targetId,source:'test'});
   assert.equal(offers.length,offeredBefore+1,'this request produces a fresh offer');
   const o=offers.at(-1);assert.ok(o?.firstIronHail,JSON.stringify({o,identity:firstIronContactIdentity(s,s.entities.get(s.player.targetId))}));
   r.bus.emit('contactHail:choice',{requestId:o.requestId,targetId:o.targetId,choice:'route'});
   assert.equal(replies.length,repliedBefore+1,'this choice produces a fresh response');
   const reply=replies.at(-1);assert.equal(reply.requestId,o.requestId);assert.ok(reply?.firstIronCourse,JSON.stringify(reply));return reply.firstIronCourse;
  };
  const before={progress:entry.job.progress,ore:rock.data.oreHP};
  const course=hail();assert.equal(course.sharedFace,true);assert.equal(course.faceId,rock.id);
  assert.equal(entry.job.progress,before.progress);assert.equal(rock.data.oreHP,before.ore);
  world.relocatePlayerInSector(course.pos,{reason:'shared-hail-working-position-fixture'});
  const input=r.getSystem('input');s.input.worldObjectTargetId=rock.id;
  input.ingestLaneDomEvent({type:'cursorProjection',x:rock.pos.x,z:rock.pos.z});
  input.ingestLaneDomEvent({type:'mousedown',button:2,clientX:0,clientY:0});
  for(let i=0;i<30&&!heliosSharedCutRead(s,worker);i++)r.step(DT);
  assert.ok(heliosSharedCutRead(s,worker),'real player mining, not accepting a hail, holds the cutter');
  const held={progress:entry.job.progress,beam:worker.data.minerShiftBeamS,ore:rock.data.oreHP};
  for(let i=0;i<12;i++)r.step(DT);
  assert.equal(entry.job.progress,held.progress);assert.equal(worker.data.minerShiftBeamS,held.beam);
  assert.equal(worker.data.minerShiftActive,false);assert.ok(rock.data.oreHP<held.ore);
  assert.equal(mission.status,'active');assert.deepEqual(grants,[]);
  input.ingestLaneDomEvent({type:'mouseup',button:2,clientX:0,clientY:0});
  for(let i=0;i<60;i++)r.step(DT);
  assert.equal(heliosSharedCutRead(s,worker),null);assert.ok(entry.job.progress>held.progress,'same original resumes its finite work');
  const snapshot={record,jobId,credits:s.player.credits,cargo:structuredClone(s.player.cargo),
   activeMission:structuredClone(s.missions.active.find(e=>e.id===mission.id)),resourceBodyId:rock.data.resourceBodyId,ore:rock.data.oreHP};
  const save=r.getSystem('save'),envelope=JSON.parse(JSON.stringify(save.serialize('helios-contact-proof')));
  assert.equal(save.loadEnvelope(envelope,'helios-contact-proof'),true);s.mode='flight';
  let restored=s.entities.get(s.npcJobs.byId[jobId]?.entityId);assert.ok(restored);assert.equal(restored.data.worldRecordId,record);
  assert.equal(s.player.credits,snapshot.credits);assert.deepEqual(s.player.cargo.items,snapshot.cargo.items);
  assert.equal(s.player.cargo.usedMass,snapshot.cargo.usedMass);assert.equal(s.player.cargo.usedVolume,snapshot.cargo.usedVolume);
  const restoredMission=s.missions.active.find(e=>e.id===mission.id);
  // Save may add default transient escort fields; every pre-save ticket field stays exact.
  assert.deepEqual(Object.fromEntries(Object.keys(snapshot.activeMission).map(key=>[key,restoredMission[key]])),snapshot.activeMission);
  assert.equal(heliosSharedCutRead(s,restored),null);
  for(let i=0;i<90;i++)r.step(DT);
  restored=s.entities.get(s.npcJobs.byId[jobId]?.entityId);s.player.targetId=restored.id;
  const renewed=hail();assert.equal(renewed.sharedFace,true);
  const savedFace=s.entities.get(renewed.faceId);assert.equal(savedFace?.data?.resourceBodyId,snapshot.resourceBodyId);
  assert.ok(savedFace.data.oreHP<snapshot.ore,'same finite face resumes after load');
  assert.equal(renewed.autopilot,false);assert.equal(s.player.credits,snapshot.credits);assert.deepEqual(grants,[]);
  console.log('HELIOS_CONTACT_CONTINUE',JSON.stringify({atS:s.simTime,worker:record,slot:restored.data.activityActorSlotId,
    face:snapshot.resourceBodyId,oreAtSave:snapshot.ore,firstTicket:s.missions.starterJobStep?.starter_hitch ?? 0,
    cargo:sellableCargoQuantity(s,'cmdty_ore_iron'),renewedFaceId:renewed.faceId,grants:grants.length,
    placementFixtures:2,fullUiContinue:false}));
 } finally {r.dispose();restoreFeatureMaps(flags);}
});
