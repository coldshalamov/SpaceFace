import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { firstIronContactIdentity } from '../src/data/heliosFirstIronContact.js';
import { heliosSharedCutRead } from '../src/systems/heliosSharedCut.js';
import { sellableCargoQuantity } from '../src/systems/cargoReadModel.js';
import { nearestMiningResourceFace } from '../src/missions/starterWorkday.js';
import { ASTEROIDS } from '../src/data/mining.js';
import { resolveAutopilotTarget } from '../src/core/flight/flightPresentationReads.js';
import { createDockIntent } from '../src/core/dockIntent.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';
import { firstShiftReceipt, kesslerStarterWorkReply } from '../src/ui/station/heliosFirstShiftConversation.js';
import fs from 'node:fs';
import { resolveDockDeny } from '../src/ui/dockDenyBanner.js';
import { heliosCampaignStage, heliosCampaignReply, takeHeliosCampaignAction } from '../src/ui/station/heliosCampaignHandoff.js';
const DT=1/60;

test('earned first iron leads through physical marked-source recovery and Skim to real B1 acceptance', {timeout:480000}, async()=>{
 const flags=snapshotFeatureMaps(),r=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:8008});
 applyFeatureConfigToMaps(r.config.features);
 try {
  const s=r.state,jobs=r.getSystem('npcJobsRuntime'),world=r.getSystem('world'),missions=r.getSystem('missions');
  s.mode='flight';s.ui.screenStack=[];r.getSystem('ships').newGame();
  const player=r.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,team:0,pos:{x:0,z:0}}));s.playerId=player.id;
  world.enterSector('sector_helios_prime');s.onboarding={active:false,finished:true};missions.newGame();
  console.log('CANONICAL_B0',JSON.stringify(s.missions.active));
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
  for(let i=0;i<1800&&rock.data.oreHP>0&&mission.status==='active';i++)r.step(DT);
  console.log('CUT_DIAGNOSTIC',JSON.stringify({time:s.simTime,status:mission.status,cargo:s.player.cargo,ore:rock.data.oreHP,player:player.pos,rock:rock.pos,yielded,grants,mode:s.mode,hull:player.hull}));
  input.ingestLaneDomEvent({type:'mouseup',button:2,clientX:0,clientY:0});
  console.log('MISSION_REMAINING',JSON.stringify(mission));
  let second;
  for(const e of s.entityList){s.player.targetId=e.id;if(firstIronContactIdentity(s,e)){worker=e;second=hail();break;}}
  if(!second){
   const {face}=nearestMiningResourceFace(s,{sectorId:'sector_helios_prime',center:player.pos,commodityId:'cmdty_ore_iron'},ASTEROIDS,e=>e.data.oreHP>0&&e.id!==rock.id&&!e.fieldResident);
   assert.ok(face,'another live iron face remains');
   const dx=player.pos.x-face.pos.x,dz=player.pos.z-face.pos.z,d=Math.hypot(dx,dz),off=(face.radius||20)+70;
   second={faceId:face.id,pos:{x:face.pos.x+dx/d*off,z:face.pos.z+dz/d*off},readOnlyScanFallback:true};
  }
  console.log('SECOND_COURSE',JSON.stringify(second));
  let nativeKeyFlightDistance=0,nativeKeyFlightFrames=0;
  const keys=new Set();
  const setKeys=(want)=>{for(const code of new Set([...keys,...want])){if(keys.has(code)===want.has(code))continue;input.ingestLaneDomEvent({type:want.has(code)?'keydown':'keyup',code,key:code,pressed:want.has(code)});}keys.clear();for(const code of want)keys.add(code);};
  const fly=(pos,max=6000)=>{
   for(let i=0;i<max;i++){
    const target=typeof pos==='function'?pos():pos,p=s.entities.get(s.playerId),dx=target.x-p.pos.x,dz=target.z-p.pos.z,d=Math.hypot(dx,dz),v=Math.hypot(p.vel.x,p.vel.z);
    if(d<8&&v<2){setKeys(new Set());return true;}
    const scale=Math.min(.5,25/Math.max(1,d)),ax=(dx*scale-p.vel.x)*.12,az=(dz*scale-p.vel.z)*.12,co=Math.cos(p.rot),sn=Math.sin(p.rot),f=ax*co+az*sn,l=-ax*sn+az*co;
    const want=new Set();if(f>.12)want.add('KeyW');if(f<-.12)want.add('KeyS');if(l>.12)want.add('KeyE');if(l<-.12)want.add('KeyQ');setKeys(want);const before={x:p.pos.x,z:p.pos.z};r.step(DT);nativeKeyFlightDistance+=Math.hypot(p.pos.x-before.x,p.pos.z-before.z);nativeKeyFlightFrames++;
   }return false;
  };
  if(mission.status==='active'){
  assert.ok(fly(second.pos),JSON.stringify({reason:'ordinary keys reach second working position',player:player.pos,target:second.pos,velocity:player.vel}));
  const nextRock=s.entities.get(second.faceId);assert.ok(nextRock);
  s.input.worldObjectTargetId=nextRock.id;
  input.ingestLaneDomEvent({type:'cursorProjection',x:nextRock.pos.x,z:nextRock.pos.z});
  input.ingestLaneDomEvent({type:'mousedown',button:2,clientX:0,clientY:0});
  for(let i=0;i<2400&&mission.status==='active';i++)r.step(DT);
  console.log('SECOND_CUT',JSON.stringify({mission,cargo:s.player.cargo,pos:player.pos,rock:nextRock.pos,ore:nextRock.data.oreHP,grants}));
  assert.equal(mission.status,'completed');assert.ok(sellableCargoQuantity(s,'cmdty_ore_iron')>0);
  input.ingestLaneDomEvent({type:'mouseup',button:2,clientX:0,clientY:0});
  }
  const snapshot={record,jobId,credits:s.player.credits,cargo:structuredClone(s.player.cargo),
   receipts:structuredClone(s.missions.receipts),starterStep:s.missions.starterJobStep.starter_hitch,resourceBodyId:rock.data.resourceBodyId,ore:rock.data.oreHP};
  const save=r.getSystem('save'),envelope=JSON.parse(JSON.stringify(save.serialize('helios-contact-proof')));
  assert.equal(save.loadEnvelope(envelope,'helios-contact-proof'),true);s.mode='flight';
  assert.equal(s.missions.starterJobStep.starter_hitch,snapshot.starterStep);
  assert.equal(s.player.credits,snapshot.credits);assert.deepEqual(s.player.cargo.items,snapshot.cargo.items);
  assert.ok(Math.abs(s.player.cargo.usedMass-snapshot.cargo.usedMass)<1e-9);assert.equal(s.player.cargo.usedVolume,snapshot.cargo.usedVolume);
  assert.deepEqual(s.missions.receipts,snapshot.receipts);
  for(let i=0;i<90;i++)r.step(DT);
  assert.equal(s.player.credits,snapshot.credits);assert.equal(sellableCargoQuantity(s,'cmdty_ore_iron'),snapshot.cargo.items.cmdty_ore_iron);
  assert.equal(grants.filter(e=>e.reason?.startsWith('mission:')).length,1);
  const ranges=[];r.bus.on('dock:range',e=>ranges.push(e));
  let station=s.entityList.find(e=>e.alive&&e.type==='station'&&e.data?.stationId==='station_helios');assert.ok(station);
  const home=()=>resolveAutopilotTarget(s,{targetEntityId:station.id});
  assert.ok(fly(home,9000),JSON.stringify({reason:'ordinary keys return to berth',pos:s.entities.get(s.playerId).pos,target:home()}));
  assert.ok(ranges.some(e=>e.stationId==='station_helios'&&e.inRange),'physical docking gate opens');
  const payload=createDockIntent(s,{stationId:'station_helios'});
  // Node-safe runtime excludes uiRoot. Invoke its real dock-commit owner only after the real range gate.
  assert.equal(commitDockedUiState(s,payload,r.bus),true);
  const receipt=firstShiftReceipt(s,'station_helios');assert.equal(receipt?.outcome,'completed');
  const heldReply=kesslerStarterWorkReply(s,'station_helios','helios_local_work');assert.match(heldReply.text,/420 cr paid/);assert.match(heldReply.text,/2u free iron/);
  const econ=r.getSystem('economy'),qty=sellableCargoQuantity(s,'cmdty_ore_iron'),credits=s.player.credits;
  const q=econ.quote('station_helios','cmdty_ore_iron','sell',qty);assert.equal(q.ok,true);
  const sale=econ.execute('station_helios','cmdty_ore_iron','sell',qty,{expectedTotal:q.total,intentId:'first-loop-sale'});
  assert.equal(sale.ok,true);assert.equal(sale.qty,qty);assert.equal(s.player.credits,credits+sale.total);
  assert.equal(sellableCargoQuantity(s,'cmdty_ore_iron'),0);
  assert.equal(econ.execute('station_helios','cmdty_ore_iron','sell',qty,{intentId:'first-loop-sale'}).duplicate,true);
  assert.equal(s.player.credits,credits+sale.total);
  assert.equal(grants.filter(e=>e.reason?.startsWith('mission:')).length,1);
  const soldReply=kesslerStarterWorkReply(s,'station_helios','helios_local_work');assert.match(soldReply.text,/Two columns, two receipts/);assert.match(soldReply.text,new RegExp(`${qty}u for ${sale.total} cr`));
  const soldEnvelope=JSON.parse(JSON.stringify(save.serialize('helios-sold-proof')));
  const afterSaleCredits=s.player.credits;assert.equal(save.loadEnvelope(soldEnvelope,'helios-sold-proof'),true);s.mode='flight';
  // Continue returns to flight rather than silently reopening the station UI.
  assert.equal(s.ui.docked,false);assert.equal(firstShiftReceipt(s,'station_helios'),null);
  station=s.entityList.find(e=>e.alive&&e.type==='station'&&e.data?.stationId==='station_helios');assert.ok(station);
  for(let i=0;i<90;i++)r.step(DT);
  assert.ok(fly(home,1200));
  assert.equal(commitDockedUiState(s,createDockIntent(s,{stationId:'station_helios'}),r.bus),true);
  assert.equal(firstShiftReceipt(s,'station_helios')?.outcome,'completed');
  const restoredReply=kesslerStarterWorkReply(s,'station_helios','helios_local_work');
  assert.match(restoredReply.text,/Two columns, two receipts/);assert.match(restoredReply.text,new RegExp(`${qty}u for ${sale.total} cr`));
  console.log('POST_SALE_RESTORE',JSON.stringify({docked:s.ui.docked,reply:restoredReply.text}));
  assert.equal(s.player.credits,afterSaleCredits);assert.equal(sellableCargoQuantity(s,'cmdty_ore_iron'),0);
  assert.equal(grants.filter(e=>e.reason?.startsWith('mission:')).length,1);
  console.log('EARNED_CONTINUE',JSON.stringify({time:s.simTime,cargoAtSave:snapshot.cargo,grants,sold:qty,saleCredits:sale.total,placementFixtures:2,scannerFallback:!!second?.readOnlyScanFallback,fullUiContinue:false,fullUiDock:false}));

  if(process.env.HELIOS_EARNED_CHECKPOINT) fs.writeFileSync(process.env.HELIOS_EARNED_CHECKPOINT,JSON.stringify(save.serialize('earned-paid-desk')));
  console.log('B0_AT_PAID_DESK',JSON.stringify({stage:heliosCampaignStage(s,'station_helios'),story:s.story,active:s.missions.active}));
  assert.equal(heliosCampaignStage(s,'station_helios')?.stage,'sample_outbound');
  r.bus.emit('ui:talkContact',{contactId:'contact_station_helios_kessler',stationId:'station_helios',choiceId:'helios_47a_original'});
  assert.equal(s.player.stationContacts.contact_station_helios_kessler.flags.choice_helios_47a_original,true);
  const brief=heliosCampaignReply(s,'station_helios','helios_47a_file');
  assert.match(brief.text,/You asked me to leave it there/);
  const tracked=[];r.bus.on('ui:trackMission',e=>tracked.push(e));
  assert.equal(takeHeliosCampaignAction({state:s,bus:r.bus},'station_helios',brief.campaignHandoff),true);
  assert.equal(tracked.at(-1).missionId,brief.campaignHandoff.missionId);
  let b0=s.missions.active.find(m=>m.storyTag==='campaign47a:b0:recovery');
  const skim=[];r.bus.on('story:skimResolved',e=>skim.push(e));
  // Node-safe runtime has no uiRoot: clear dock UI only, and emit the ordinary undock intent.
  // No relocation, velocity, collision, damage, cargo or mission state is set here.
  s.ui.docked=false;s.ui.dockedStationId=null;s.ui.screenStack=[];s.mode='flight';r.bus.emit('dock:undocked',{});
  const site=()=>{
    const p=b0.params.samplePos,ship=s.entities.get(s.playerId),dx=ship.pos.x-p.x,dz=ship.pos.z-p.z,d=Math.hypot(dx,dz);
    const rock=s.entityList.find(e=>e.alive&&e.type==='asteroid'&&e.data?.fieldId===b0.params.sampleSource?.fieldId&&e.data?.asteroidSlotId===b0.params.sampleSource?.slotId);
    const off=(rock?.radius||20)+65;
    return {x:p.x+dx/d*off,z:p.z+dz/d*off};
  };
  console.log('B0_DEPARTURE',JSON.stringify({pos:s.entities.get(s.playerId).pos,mission:b0,target:site()}));
  assert.ok(fly(site(),18000),JSON.stringify({reason:'physical B0 outbound flight',pos:s.entities.get(s.playerId).pos,mission:b0}));
  let source=s.entityList.find(e=>e.alive&&e.type==='asteroid'&&e.data?.fieldId===b0.params.sampleSource?.fieldId&&e.data?.asteroidSlotId===b0.params.sampleSource?.slotId);
  assert.ok(source,'exact live marked source loaded');
  console.log('B0_MARKED_SOURCE',JSON.stringify({id:source.id,pos:source.pos,data:source.data,binding:b0.params.sampleSource}));
  s.input.worldObjectTargetId=source.id;
  input.ingestLaneDomEvent({type:'cursorProjection',x:source.pos.x,z:source.pos.z});
  input.ingestLaneDomEvent({type:'mousedown',button:2,clientX:0,clientY:0});
  for(let i=0;i<2400&&!b0.params.sampleRecovered;i++)r.step(DT);
  input.ingestLaneDomEvent({type:'mouseup',button:2,clientX:0,clientY:0});
  assert.equal(b0.params.sampleRecovered,true,JSON.stringify({mission:b0,pos:s.entities.get(s.playerId).pos,source:source.pos,hull:s.entities.get(s.playerId).hull}));
  console.log('B0_RECOVERED',JSON.stringify({mission:b0,cargo:s.player.cargo}));
  const recovered=JSON.parse(JSON.stringify(save.serialize('b0-recovered')));
  assert.equal(save.loadEnvelope(recovered,'b0-recovered'),true);s.mode='flight';
  b0=s.missions.active.find(m=>m.storyTag==='campaign47a:b0:recovery');
  assert.equal(b0.params.sampleRecovered,true);
  assert.equal(s.player.stationContacts.contact_station_helios_kessler.flags.choice_helios_47a_original,true);
  for(let i=0;i<1800&&!b0.params.skimResolved;i++)r.step(DT);
  assert.equal(b0.params.skimResolved,true);assert.equal(b0.params.skimWhere,'lane');assert.equal(skim.length,1);
  ranges.length=0;
  station=s.entityList.find(e=>e.alive&&e.type==='station'&&e.data?.stationId==='station_helios');
  assert.ok(fly(home,18000),JSON.stringify({reason:'physical B0 return flight',pos:s.entities.get(s.playerId).pos,target:home()}));
  assert.ok(ranges.some(e=>e.stationId==='station_helios'&&e.inRange),'fresh physical B0 return range gate');
  const dockAttempt=createDockIntent(s,{stationId:'station_helios'});
  r.bus.emit('dock:attempt',dockAttempt);assert.equal(resolveDockDeny(s,'station_helios'),null);
  r.bus.emit('dock:docked',dockAttempt);
  assert.equal(commitDockedUiState(s,dockAttempt,r.bus),true);
  assert.equal(s.story.beatIndex,1);assert.equal(s.story.flags.contract_47a_payment_withheld,true);
  missions.ensureBoard('station_helios');
  const next=heliosCampaignReply(s,'station_helios','helios_47a_file');
  assert.equal(heliosCampaignStage(s,'station_helios').stage,'alloy_ready');
  assert.match(next.text,/[Pp]ayment withheld/);assert.match(next.text,/You asked me to leave it there/);
  assert.ok(next.missionOffer.preloadedCargo);
  assert.equal(missions.acceptMission(next.missionOffer.id),true);
  assert.equal(heliosCampaignStage(s,'station_helios').stage,'alloy_outbound');
  const b1=s.missions.active.find(m=>m.storyTag==='campaign47a:b1:alloy_run');
  console.log('B1_ACCEPTED',JSON.stringify({mission:b1,reply:next.text,cargo:s.player.cargo,story:s.story,skim}));
  assert.equal(b1.params.qty,6);assert.equal(s.player.cargo.items.cmdty_alloys,6);
  const b1Credits=s.player.credits,b1Cargo=structuredClone(s.player.cargo.items);
  const b1save=JSON.parse(JSON.stringify(save.serialize('b1-accepted')));
  assert.equal(save.loadEnvelope(b1save,'b1-accepted'),true);s.mode='flight';
  assert.ok(s.missions.active.some(m=>m.id===b1.id&&m.status==='active'));
  assert.equal(s.player.credits,b1Credits);assert.deepEqual(s.player.cargo.items,b1Cargo);assert.equal(s.player.cargo.items.cmdty_alloys,6);
  assert.equal(s.player.stationContacts.contact_station_helios_kessler.flags.choice_helios_47a_original,true);
  assert.equal(s.story.flags.contract_47a_payment_withheld,true);
  console.log('NATIVE_CAMPAIGN_PROOF',JSON.stringify({time:s.simTime,placementFixtures:2,fullUiDock:false,fullUiContinue:false,exactSource:true,skimCount:skim.length,b1Id:b1.id,nativeKeyFlightDistance,nativeKeyFlightFrames}));

 } finally {r.dispose();restoreFeatureMaps(flags);}
});
