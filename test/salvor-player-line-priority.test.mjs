import {salvage} from '../src/systems/salvage.js';
import {SECTORS} from '../src/data/sectors.js';
import {VESTA_DERELICT_SALVAGE_SOURCE as SOURCE} from '../src/data/sectorZones.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {physics} from '../src/core/physics.js';
import {combat} from '../src/systems/combat.js';
import {getCombatKernel} from '../src/combat/kernel.js';
import {traffic} from '../src/systems/traffic.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {NPC_JOB_PHASE as P} from '../src/systems/npcJobs.js';
async function rig(t){
 const sim=createSimulation({seed:47,systems:[{...traffic,update(){}},npcJobsRuntime,physics,combat]});
 const s=sim.state;s.mode='flight';s.world.currentSectorId='sector_helios_prime';s.settings.gameplay.physicsBackend='rapier-dynamic';
 const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,team:0,pos:{x:0,z:0}}));s.playerId=player.id;
 const spawn=(x=120)=>sim.spawn({type:'payload',hull:100,radius:8,mass:100,pos:{x,z:0},data:{payloadType:'jettisoned_cargo',spillNoticed:true,salvagePool:{cmdty_scrap_metal:3},salvorNoticeAt:0}});
 const pod=spawn(),sys=sim.registry.get('traffic'),phys=sim.registry.get('physics');assert.equal(await phys.prepareBackend(s),true);sim.step(1/60);
 const kernel=getCombatKernel({state:s,bus:sim.bus});
 const latch=()=>{const r=kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:pod.id,sourceWorld:{...player.pos,y:0},targetWorld:{...pod.pos,y:0}});assert.equal(r.ok,true,r.reason);return r.attachment;};
 t.after(()=>{phys._disableSg02DynamicAuthority();sim.dispose();});
 return {sim,s,sys,phys,player,pod,spawn,latch,kernel};
}
test('player-first native Massline defers new selection and reservation, release restores original notice eligibility',async t=>{
 const h=await rig(t);const notice=h.pod.data.salvorNoticeAt,a=h.latch();
 assert.equal(h.sys._isSalvageableBody(h.pod),true,'work/extraction predicate remains unchanged');
 assert.equal(h.sys._pickUnclaimedSalvageTarget(h.player),null);assert.equal(h.sys._stampSalvorClaim(h.pod,'crew'),false);
 assert.equal(h.pod.data.salvorClaimedBy,undefined);assert.equal(h.pod.data.salvorNoticeAt,notice);
 assert.equal(h.kernel.attachments.cut(a.id,h.player.id,'pilot_cut').ok,true);assert.equal(h.sys._pickUnclaimedSalvageTarget(h.player),h.pod);assert.equal(h.sys._stampSalvorClaim(h.pod,'crew'),true);
});
test('NPC-first claim and same-claim restamp survive later player line without granting title',async t=>{
 const h=await rig(t);assert.equal(h.sys._stampSalvorClaim(h.pod,'crew'),true);h.latch();
 assert.equal(h.sys._deferOrdinaryCleanupClaim(h.pod),true);assert.equal(h.sys._stampSalvorClaim(h.pod,'crew'),true);
 assert.equal(h.sys._stampSalvorClaim(h.pod,'rival'),false);assert.equal(h.pod.data.salvorClaimedBy,'crew');assert.equal(h.sys._isSalvageableBody(h.pod),true);
});
test('cached target selection is rechecked at final reservation after player latches',async t=>{
 const h=await rig(t);assert.equal(h.sys._pickUnclaimedSalvageTarget(h.player),h.pod);h.latch();
 assert.equal(h.sys._stampSalvorClaim(h.pod,'crew'),false);assert.equal(h.pod.data.salvorClaimedBy,undefined);
});
for(const fault of ['dead-player','owner-generation','target-generation','wrong-controller','inactive','wrong-def','handle','native-line','native-owner','disabled-native'])test(`stale or foreign line does not reserve salvage: ${fault}`,async t=>{
 const h=await rig(t),a=h.latch();
 if(fault==='dead-player')h.player.alive=false;
 if(fault==='owner-generation')a.ownerGeneration++;
 if(fault==='target-generation')a.targetGeneration++;
 if(fault==='wrong-controller'){a.controllerId='foreign';a.controllerGeneration=1;}
 if(fault==='inactive')a.state='cut';
 if(fault==='wrong-def')a.defId='npc_other';
 if(fault==='handle')a.physicsHandle={id:'stale'};
 if(fault==='native-line')h.phys._sg02.attachments.delete(a.id);
 if(fault==='native-owner')h.phys._sg02.attachments.get(a.id).ownerEntity={...h.player};
 if(fault==='disabled-native')h.phys._sg02.records.get(h.pod.id).body.setEnabled(false);
 assert.equal(h.sys._deferOrdinaryCleanupClaim(h.pod),false);assert.equal(h.sys._stampSalvorClaim(h.pod,'crew'),true);
});
test('UI-only tether flag does not defer, real secondary player attachment does',async t=>{
 const h=await rig(t);h.s.player.tether={active:true,targetId:h.pod.id,attachmentId:'nonexistent'};
 assert.equal(h.sys._deferOrdinaryCleanupClaim(h.pod),false);h.latch();
 assert.equal(h.sys._deferOrdinaryCleanupClaim(h.pod),true,'actual line need not be selected UI primary');
});
test('retarget picks another unheld body and failed final reservation never installs its payload',async t=>{
 const h=await rig(t);h.latch();const other=h.spawn(260);
 assert.equal(h.sys._pickUnclaimedSalvageTarget(h.player),other);
 const cutter=h.sim.spawn({type:'ship',hull:100,pos:{x:300,z:0},data:{worldRecordId:'crew',jobId:'job-test'}});
 const job={id:'job-test',kind:'salvor',phase:P.TRANSIT,routeIndex:0,progress:3,route:[{id:'yard:test',pos:{x:0,z:0}},{id:'payload:missing',pos:{x:999,z:0}}],payload:{targetId:'missing',targetType:'payload'}};
 h.s.traffic.freighters.push({id:cutter.id,role:'salvor'});
 const oldGet=h.sys.helpers.npcJobs.get;h.sys.helpers.npcJobs.get=id=>id==='job-test'?{job}:oldGet(id);
 const stamp=h.sys._stampSalvorClaim;h.sys._stampSalvorClaim=()=>false;
 h.sys._maintainGeneralSalvorJobs();assert.equal(job.payload.targetId,'missing');assert.equal(job.route[1].id,'payload:missing');assert.equal(job.payload.targetId,'missing','failed reservation never installs a new target');
 h.sys._stampSalvorClaim=stamp;job.phase=P.TRANSIT;h.sys._maintainGeneralSalvorJobs();
 assert.equal(job.payload.targetId,other.id);assert.equal(other.data.salvorClaimedBy,'crew');assert.equal(job.phase,P.TRANSIT);
});

test('dispatch creates no cleanup cutter for a player-held source, then release permits normal dispatch',async t=>{
 const h=await rig(t);h.sim.spawn({type:'station',hull:1000,radius:20,pos:{x:-500,z:0},data:{stationId:'station_customs'}});const a=h.latch();
 const before=h.s.traffic.freighters.length;
 assert.equal(h.sys._dispatchGeneralSalvors(h.s.world.currentSectorId),0);assert.equal(h.s.traffic.freighters.length,before);assert.equal(h.pod.data.salvorClaimedBy,undefined);
 assert.equal(h.kernel.attachments.cut(a.id,h.player.id,'pilot_cut').ok,true);
 assert.equal(h.sys._dispatchGeneralSalvors(h.s.world.currentSectorId),1);assert.ok(h.pod.data.salvorClaimedBy);
});

test('yard tug new selection skips player-held ordinary target without starving another loose body',async t=>{
 const h=await rig(t);h.pod.radius=80;const other=h.spawn(260);other.radius=80;h.latch();
 assert.equal(h.sys._pickUnclaimedTowTarget(h.player),other);assert.equal(h.pod.data.salvorClaimedBy,undefined);
});

// Existing PUBLIC job/source owners only. This is staged native custody, not a moving-route proof.
for(const authored of [false,true])test(`NPC-first ${authored?'authored':'ordinary'} public owner retains claim and once-only extraction after player latch`,async t=>{
 const sim=createSimulation({seed:4242,systems:[{...traffic,update(){}},npcJobsRuntime,...(authored?[salvage]:[]),physics,combat]});
 const s=sim.state;s.mode='flight';s.settings.gameplay.physicsBackend='custom';s.world.currentSectorId=SOURCE.sectorId;s.world.sectors=Object.fromEntries(SECTORS.map(x=>[x.id,x]));
 const player=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,team:0,pos:{x:0,z:0}}));s.playerId=player.id;
 sim.spawn({type:'station',pos:{x:0,z:0},radius:40,hull:1000,data:{stationId:'station_forge'}});
 if(authored)sim.registry.get('salvage')._planForSector(SOURCE.sectorId);
 const target=authored?sim.helpers.salvage.entityForPoint(SOURCE.salvagePointId,SOURCE.sourceKey):sim.spawn({type:'wreck',pos:{x:320,z:40},radius:9,mass:1000,hull:10,data:{salvagePool:{cmdty_scrap_metal:5},salvageTimeLeft:8}});
 assert.ok(target);target.data.salvorNoticeAt=0;
 const sys=sim.registry.get('traffic');assert.equal(sys._dispatchGeneralSalvors(SOURCE.sectorId),1);
 const cutter=s.entityList.find(e=>e.data?.generalSalvor&&sim.helpers.npcJobs.get(e.data.jobId)?.job?.payload?.targetId===target.id);assert.ok(cutter);
 const entry=sim.helpers.npcJobs.get(cutter.data.jobId),claim=sys._salvorClaimantOf(target);
 player.pos={x:target.pos.x-120,z:target.pos.z};cutter.pos={x:target.pos.x-20,z:target.pos.z};cutter.vel={...target.vel};
 entry.job.phase=P.WORK;entry.job.routeIndex=1;entry.job.progress=.99;entry.job.workS=1;
 const phys=sim.registry.get('physics');s.settings.gameplay.physicsBackend='rapier-dynamic';assert.equal(await phys.prepareBackend(s),true);phys.update(1/60,s);
 t.after(()=>{phys._disableSg02DynamicAuthority();sim.dispose();});
 const kernel=getCombatKernel({state:s,bus:sim.bus}),created=kernel.attachments.create({defId:'tether_standard',ownerId:player.id,targetId:target.id,sourceWorld:{...player.pos,y:0},targetWorld:{...target.pos,y:0}});assert.equal(created.ok,true,created.reason);
 assert.equal(sys._deferOrdinaryCleanupClaim(target),!authored);assert.equal(sys._stampSalvorClaim(target,claim),true);
 sys._maintainGeneralSalvorJobs();assert.equal(sys._salvorClaimantOf(target),claim);
 const events=[];sim.bus.on('salvage:npcExtraction',p=>events.push(p));const jobs=sim.registry.get('npcJobsRuntime');jobs.update(.25,s);sim.bus.flush();
 assert.equal(events.length,1);assert.ok(cutter.data.cargoManifest.totalQty>0);jobs.update(.25,s);sim.bus.flush();assert.equal(events.length,1);
});
