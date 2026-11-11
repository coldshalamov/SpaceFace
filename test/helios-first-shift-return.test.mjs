import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo, removeCargo } from '../src/systems/cargo.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import { firstShiftReceipt, kesslerStarterWorkChoice, kesslerStarterWorkReply,
  firstShiftMarketCurrent, openFirstShiftMarket } from '../src/ui/station/heliosFirstShiftConversation.js';

const STATION='station_helios',IRON='cmdty_ore_iron',SECTOR='sector_helios_prime';
function fixture() {
 const sim=createSimulation({seed:73319,systems:[missions,economy,cargo],updateOrder:[]});
 const s=sim.state;s.mode='flight';s.world.currentSectorId=SECTOR;s.ui.screenStack=[];
 s.playerId=sim.spawn({type:'ship',isPlayer:true,team:0,pos:{x:0,z:0},radius:10,mass:30,hull:100,data:{}}).id;
 s.player.ownedShips=[{defId:'ship_kestrel',fittings:['mod_drill_amp','mod_mining_laser_s']}];s.player.activeShipIndex=0;
 s.onboarding={active:false,finished:true};s.simTime=20;
 const owner=sim.registry.get('missions');const board=owner.ensureBoard(STATION);
 const posting=board.slots.find(m=>m.params?.starterJobId==='starter_hitch');assert.ok(owner.acceptMission(posting.id));
 const mission=s.missions.active.find(m=>m.params?.starterJobId==='starter_hitch');
 sim.registry.get('economy').populateSector({sectorId:SECTOR});
 return {sim,s,owner,mission,close:()=>sim.dispose()};
}
function complete(f) {
 f.sim.bus.emit('mining:yield',{minerId:f.s.playerId,commodityId:IRON,qty:2,pos:{x:450,z:0}});
 assert.equal(f.mission.status,'completed');dock(f);
 f.owner.ensureBoard(STATION);
}
function dock(f){f.s.ui.docked=true;f.s.ui.dockedStationId=STATION;f.s.player.flags={...(f.s.player.flags||{}),docked:true};}
function reply(f){return kesslerStarterWorkReply(f.s,STATION,'helios_local_work');}
function sale(f,qty){
 const e=f.sim.registry.get('economy');f.sim.bus.emit('economy:marketOpened',{stationId:STATION});
 const result=e.handleTrade(IRON,'sell',qty);assert.equal(result.ok,true,JSON.stringify(result));return f.s.player.tradeLedger[0];
}

test('ordinary Kessler list and reply close the paid first ticket, preserving the exact next posting',()=>{
 const f=fixture();try{
 complete(f);addCargo(f.s,IRON,3);
 const before=JSON.stringify([f.s.player,f.s.missions]);
 const contact=generateContacts(STATION,f.s).find(c=>c.canonicalKey==='kessler');assert.ok(contact);
 assert.equal(contact.choices.filter(c=>c.id==='helios_local_work').length,1);
 assert.equal(contact.choices.find(c=>c.id==='helios_local_work').label,'About my first iron ticket.');
 const r=buildReply(contact.role,'helios_local_work',{state:f.s,bus:f.sim.bus},STATION,contact);
 assert.match(r.text,/420 cr paid/);assert.match(r.text,/3u free iron/);assert.match(r.text,/No later Helios iron sale/);
 assert.equal(r.missionOffer,f.s.missions.boards[STATION].slots.find(m=>m.params?.starterJobId==='starter_hitch'&&m.params.starterStep===2));
 assert.ok(r.firstShiftMarket);assert.equal(JSON.stringify([f.s.player,f.s.missions]),before);
 }finally{f.close();}
});

test('actual partial and full market sales change the return scene without claiming provenance or another payment',()=>{
 const f=fixture();try{
 complete(f);addCargo(f.s,IRON,3);f.s.simTime=21;const first=sale(f,1);
 let r=reply(f);assert.match(r.text,/2u free iron/);assert.ok(r.text.includes(`1u for ${first.total} cr`));
 assert.doesNotMatch(r.text,/rails repaired|all your ore|berth repaired/);
 f.s.simTime=22;const last=sale(f,2);const credits=f.s.player.credits;
 r=reply(f);assert.match(r.text,/No iron is aboard/);assert.ok(r.text.includes(`2u for ${last.total} cr`));assert.equal(r.firstShiftMarket,undefined);
 for(let i=0;i<4;i++)reply(f);assert.equal(f.s.player.credits,credits);
 assert.equal(f.s.missions.receipts.filter(r=>r.missionId===f.mission.id).length,1);
 }finally{f.close();}
});

test('opening Market is an exact free-stock revalidated navigation, never a sale or a duplicate ticket',()=>{
 const f=fixture();try{
 complete(f);addCargo(f.s,IRON,3);const slip=reply(f).firstShiftMarket;
 const events=[];const ctx={state:f.s,bus:{emit:(name,payload)=>events.push({name,payload})}};
 const before=JSON.stringify([f.s.player,f.s.missions]);assert.equal(openFirstShiftMarket(ctx,STATION,slip),true);
 assert.deepEqual(events,[{name:'station:navigate',payload:{destination:'market',options:{tradeMode:'sell',commodityId:IRON}}}]);
 assert.equal(JSON.stringify([f.s.player,f.s.missions]),before);
 removeCargo(f.s,IRON,1);assert.equal(firstShiftMarketCurrent(f.s,STATION,slip),false);assert.equal(openFirstShiftMarket(ctx,STATION,slip),false);
 assert.equal(openFirstShiftMarket(ctx,STATION,reply(f).firstShiftMarket),true);
 f.s.ui.docked=false;assert.equal(openFirstShiftMarket(ctx,STATION,slip),false);
 }finally{f.close();}
});

test('real expiry offers the same first step without claiming paid work or losing already held ore',()=>{
 const f=fixture();try{
 addCargo(f.s,IRON,1);f.mission.deadline_s=f.s.simTime-1;f.owner.update(1/60,f.s);dock(f);f.owner.ensureBoard(STATION);
 assert.equal(f.mission.status,'expired');assert.equal(f.s.missions.starterJobStep?.starter_hitch||0,0);
 const r=reply(f);assert.match(r.text,/ticket is expired\. No ticket pay/);assert.match(r.text,/1u free iron/);
 assert.equal(r.missionOffer?.params.starterStep,1);assert.ok(r.firstShiftMarket);
 const before=JSON.stringify([f.s.player,f.s.missions]);reply(f);assert.equal(JSON.stringify([f.s.player,f.s.missions]),before);
 }finally{f.close();}
});

test('reserved iron never becomes sellable in the return scene',()=>{
 const f=fixture();try{
 complete(f);addCargo(f.s,IRON,3);f.s.missions.active.push({id:'sealed',status:'active',type:'cargo_delivery',preloadedCargo:true,params:{cmdtyId:IRON,qty:3,preloadedCargo:true}});
 const r=reply(f);assert.match(r.text,/none is free to sell/);assert.equal(r.firstShiftMarket,undefined);
 }finally{f.close();}
});

test('missing, stale, contradictory or foreign receipts cannot manufacture first-shift closure',()=>{
 const mutations=[s=>s.missions.receipts=[],s=>s.missions.receipts.push({...s.missions.receipts[0]}),
 s=>s.missions.receipts[0].rewardCr=0,s=>s.missions.receipts[0].at_s=s.simTime+1,
 s=>s.missions.active={},s=>s.missions.receipts[0].sourceOfferId='starter-starter_hitch-2',s=>s.missions.starterJobStep.starter_hitch=0,
 s=>s.world.currentSectorId='sector_ceres_belt',s=>s.ui.dockedStationId='station_tethys',s=>s.ui.docked=false,
 s=>s.save={...(s.save||{}),restoring:true},s=>s.run={kind:'survival'},s=>s.player.ownedShips[0].defId='ship_pelican'];
 for(const mutate of mutations){const f=fixture();try{complete(f);addCargo(f.s,IRON,2);mutate(f.s);
 assert.equal(firstShiftReceipt(f.s,STATION),null);assert.doesNotMatch(reply(f).text,/first column|second slip/);
 }finally{f.close();}}
});

test('a cargo loss or old/buy/foreign/duplicated sale never becomes a delivery',()=>{
 for(const change of [s=>s.player.tradeLedger[0].seenAt=20,s=>s.player.tradeLedger[0].seenAt=19,s=>s.player.tradeLedger[0].side='buy',
 s=>s.player.tradeLedger[0].stationId='station_tethys',s=>s.player.tradeLedger.push({...s.player.tradeLedger[0]}),
 s=>s.player.tradeLedger[0].total=0]){
 const f=fixture();try{complete(f);addCargo(f.s,IRON,1);sale(f,1);change(f.s);
 const r=reply(f);assert.match(r.text,/No iron is aboard/);assert.match(r.text,/No later Helios iron sale/);assert.doesNotMatch(r.text,/stock reached the buyer/);
 }finally{f.close();}}
});

// The actual first face can run out at one of two units. Advice reads objective
// progress, not params.progress (the mission owner leaves that legacy field at zero).
test('cutter guidance states the remaining live quota instead of promising a whole ticket from one face',async()=>{
 const {firstIronContactIdentity,firstIronContactReply}=await import('../src/data/heliosFirstIronContact.js');
 const f=fixture();try{
 const worker=f.sim.spawn({type:'ship',team:2,pos:{x:80,z:-80},radius:12,hull:100,
  data:{activityActorSlotId:'helios_seam_miner',worldRecordId:'quota-worker',jobId:'job:quota-worker'}});
 f.s.npcJobs={byId:{'job:quota-worker':{entityId:worker.id,worldRecordId:'quota-worker',job:{id:'job:quota-worker',kind:'miner',materialized:true}}}};
 f.sim.spawn({type:'asteroid',pos:{x:150,z:0},radius:20,mass:30,hull:100,data:{typeId:'ast_common_rock',oreHP:80,homeSectorId:SECTOR}});
 f.s.player.targetId=worker.id;
 f.sim.bus.emit('mining:yield',{minerId:f.s.playerId,commodityId:IRON,qty:1,pos:{x:150,z:0}});
 assert.equal(f.mission.objectiveProgress,1);assert.equal(f.mission.params.progress,0);
 const identity=firstIronContactIdentity(f.s,worker);assert.ok(identity);
 const r=firstIronContactReply(f.s,worker,{firstIronHail:identity,expiresAt:f.s.simTime+8,actions:[{id:'route'}]});
 assert.match(r.firstIronCourse.reason,/Ticket: 1\/2u iron cut/);assert.match(r.firstIronCourse.reason,/small face may run out/);
 assert.equal(f.mission.status,'active');assert.equal(f.s.missions.receipts.length,0);
 }finally{f.close();}
});
