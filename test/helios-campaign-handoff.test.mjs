import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import { heliosCampaignStage, heliosCampaignChoices, heliosCampaignReply,
  heliosCampaignActionCurrent, takeHeliosCampaignAction } from '../src/ui/station/heliosCampaignHandoff.js';
const HOME='station_helios',SECTOR='sector_helios_prime',FILE='helios_47a_file',ORIGINAL='helios_47a_original';
function fixture() {
 const sim=createSimulation({seed:79319,systems:[missions,economy,cargo,stationContacts],updateOrder:[]});
 const s=sim.state;s.mode='flight';s.simTime=20;s.world.currentSectorId=SECTOR;
 s.playerId=sim.spawn({type:'ship',isPlayer:true,team:0,pos:{x:0,z:0},radius:10,mass:30,hull:100,data:{}}).id;
 const asteroid=sim.spawn({type:'asteroid',pos:{x:180,z:-60},radius:20,mass:30,hull:100,data:{typeId:'ast_common_rock',oreHP:200}});
 s.player.ownedShips=[{defId:'ship_kestrel',fittings:['mod_drill_amp','mod_mining_laser_s']}];s.player.activeShipIndex=0;
 s.onboarding={active:false,finished:true};s.settings.gameplay.tutorialHints=false;
 const owner=sim.registry.get('missions');owner.newGame();
 const b0=s.missions.active.find(m=>m.storyTag==='campaign47a:b0:recovery');assert.ok(b0);
 const posting=owner.ensureBoard(HOME).slots.find(m=>m.params?.starterJobId==='starter_hitch');assert.ok(owner.acceptMission(posting.id));
 const first=s.missions.active.find(m=>m.params?.starterJobId==='starter_hitch');
 const dock=()=>{s.ui.docked=true;s.ui.dockedStationId=HOME;s.player.flags={...s.player.flags,docked:true};};
 const paid=()=>{sim.bus.emit('mining:yield',{minerId:s.playerId,commodityId:'cmdty_ore_iron',qty:2,pos:{x:450,z:0}});assert.equal(first.status,'completed');owner.ensureBoard(HOME);dock();};
 const receive=()=>{sim.bus.emit('mining:yield',{minerId:s.playerId,commodityId:'cmdty_ore_iron',qty:1,pos:{...asteroid.pos}});assert.equal(b0.params.sampleRecovered,true);sim.bus.emit('dock:docked',{stationId:HOME});dock();assert.equal(s.story.beatIndex,1);owner.ensureBoard(HOME);};
 return {sim,s,owner,b0,first,asteroid,dock,paid,receive,close:()=>sim.dispose()};
}
const reply=f=>heliosCampaignReply(f.s,HOME,FILE);

test('paid local shift exposes existing 47-A with a real track intent, without repeating or completing work',()=>{
 const f=fixture();try{
 f.dock();assert.deepEqual(heliosCampaignChoices(f.s,HOME),[]);f.paid();
 assert.equal(heliosCampaignStage(f.s,HOME)?.stage,'sample_outbound');
 const c=generateContacts(HOME,f.s).find(c=>c.canonicalKey==='kessler');assert.ok(c.choices.some(c=>c.id===FILE));
 const before=JSON.stringify([f.s.player,f.s.story,f.s.missions]);
 const r=buildReply(c.role,FILE,{state:f.s,bus:f.sim.bus},HOME,c);assert.match(r.text,/not another iron quota/);
 assert.equal(r.missionOffer,undefined);assert.equal(r.campaignHandoff.missionId,f.b0.id);
 assert.equal(JSON.stringify([f.s.player,f.s.story,f.s.missions]),before);
 const events=[];f.sim.bus.on('ui:pushScreen',p=>events.push(p));
 assert.equal(takeHeliosCampaignAction({state:f.s,bus:f.sim.bus},HOME,r.campaignHandoff),true);
 assert.equal(f.s.ui.trackedMissionId,f.b0.id);assert.equal(f.s.nav.waypoint.missionId,f.b0.id);
 assert.deepEqual(events,[{id:'missionLog',source:'station-bar'}]);
 assert.equal(f.b0.status,'active');assert.equal(f.s.missions.active.filter(m=>m.storyTag===f.b0.storyTag).length,1);
 }finally{f.close();}
});

test('only actual source recovery and Helios settlement expose the next real preloaded alloy posting',()=>{
 const f=fixture();try{
 f.paid();const stale=reply(f).campaignHandoff;const credits=f.s.player.credits;
 assert.equal(f.b0.params.sampleRecovered,false);
 f.sim.bus.emit('mining:yield',{minerId:f.s.playerId,commodityId:'cmdty_ore_iron',qty:5,pos:{x:800,z:0}});
 assert.equal(f.b0.params.sampleRecovered,false);assert.equal(heliosCampaignStage(f.s,HOME).stage,'sample_outbound');
 f.sim.bus.emit('mining:yield',{minerId:f.s.playerId,commodityId:'cmdty_ore_iron',qty:1,pos:{...f.asteroid.pos}});
 assert.equal(heliosCampaignStage(f.s,HOME).stage,'sample_return');assert.equal(heliosCampaignActionCurrent(f.s,HOME,stale),false);
 f.sim.bus.emit('dock:docked',{stationId:'station_coalition'});assert.equal(f.s.story.beatIndex,0);
 f.sim.bus.emit('dock:docked',{stationId:HOME});f.owner.ensureBoard(HOME);
 assert.equal(f.s.story.beatIndex,1);assert.equal(f.s.player.credits,credits+400,'existing B0 story stipend is separate from withheld freight payment');
 const r=reply(f);assert.match(r.text,/Freight payment withheld/);assert.match(r.text,/6 units.*loaded on acceptance/);
 assert.equal(r.missionOffer,f.s.missions.boards[HOME].slots.find(o=>o.storyTag==='campaign47a:b1:alloy_run'));
 assert.equal(r.campaignHandoff.kind,'offer');
 f.sim.bus.emit('ui:acceptMission',{missionId:r.missionOffer.id});
 assert.equal(heliosCampaignStage(f.s,HOME).stage,'alloy_outbound');assert.equal(f.s.player.cargo.items.cmdty_alloys,6);
 const active=reply(f);assert.match(active.text,/do not sell or jettison/);assert.equal(active.missionOffer,undefined);
 assert.equal(takeHeliosCampaignAction({state:f.s,bus:f.sim.bus},HOME,active.campaignHandoff),true);
 assert.equal(f.s.ui.trackedMissionId,active.campaignHandoff.missionId);
 assert.equal(f.s.player.credits,credits+400);
 }finally{f.close();}
});

test('the original-number choice is remembered by existing contact owner, not a gameplay mutation',()=>{
 const f=fixture();try{
 f.paid();const before=JSON.stringify([f.s.player.credits,f.s.player.cargo,f.s.story,f.s.missions]);
 f.sim.bus.emit('ui:talkContact',{contactId:'contact_station_helios_kessler',canonicalKey:'kessler',stationId:HOME,name:'Kessler',choiceId:ORIGINAL});
 assert.equal(f.s.player.stationContacts.contact_station_helios_kessler.flags.choice_helios_47a_original,true);
 const r=heliosCampaignReply(f.s,HOME,ORIGINAL);assert.match(r.text,/note, not a payment/);
 assert.equal(JSON.stringify([f.s.player.credits,f.s.player.cargo,f.s.story,f.s.missions]),before);
 assert.ok(!heliosCampaignChoices(f.s,HOME).some(c=>c.id===ORIGINAL));assert.match(reply(f).text,/asked me to leave it/);
 f.receive();assert.match(reply(f).text,/asked me to leave it/);assert.match(reply(f).text,/Freight payment withheld/);
 }finally{f.close();}
});

test('changed, duplicate, closed, foreign, restoring and undocked missions cannot use a cached action',()=>{
 for(const mutate of [s=>s.ui.docked=false,s=>s.ui.dockedStationId='station_tethys',s=>s.world.currentSectorId='sector_ceres_belt',
 s=>s.save={...s.save,restoring:true},s=>s.run={kind:'survival'},s=>s.missions.active={},
 s=>s.missions.active.push({...s.missions.active.find(m=>m.storyTag==='campaign47a:b0:recovery')}),
 s=>s.missions.active.find(m=>m.storyTag==='campaign47a:b0:recovery').status='completed',
 s=>s.missions.active.find(m=>m.storyTag==='campaign47a:b0:recovery').id+='replacement',
 s=>s.missions.active.find(m=>m.storyTag==='campaign47a:b0:recovery').params.samplePos={x:900,z:900},
 s=>s.meta.seed++,s=>s.missions.receipts=[]]){
 const f=fixture();try{f.paid();const a=reply(f).campaignHandoff;assert.ok(a);mutate(f.s);const seen=[];
 assert.equal(takeHeliosCampaignAction({state:f.s,bus:{emit:(...args)=>seen.push(args)}},HOME,a),false);assert.deepEqual(seen,[]);
 }finally{f.close();}}
});

test('Scale 4 route reads the completed alloy step and actual paired readings, never the delivered load',()=>{
 const f=fixture();try{
 f.paid();f.receive();const o=reply(f).missionOffer;f.sim.bus.emit('ui:acceptMission',{missionId:o.id});
 const alloys=f.s.missions.active.find(m=>m.storyTag==='campaign47a:b1:alloy_run');assert.ok(alloys);
 // Focused event-path fixture: the full cross-sector flight belongs to native acceptance.
 f.s.world.currentSectorId='sector_tethys_junction';f.sim.bus.emit('dock:docked',{stationId:'station_tethys'});
 assert.equal(alloys.status,'completed');f.s.world.currentSectorId=SECTOR;f.dock();
 const r=reply(f);assert.equal(heliosCampaignStage(f.s,HOME).stage,'scale_outbound');assert.match(r.text,/delivered alloys are gone/);
 assert.equal(f.s.player.cargo.items.cmdty_alloys||0,0);assert.equal(r.campaignHandoff.kind,'course');
 const events=[];assert.equal(takeHeliosCampaignAction({state:f.s,bus:{emit:(...x)=>events.push(x)}},HOME,r.campaignHandoff),true);
 assert.equal(events[0][0],'ui:setCourse');assert.equal(events[0][1].sectorId,'sector_tethys_junction');
 f.sim.bus.emit('kesslerPod:weighed',{variance:true,plateRead:18.8,trueRead:20,count:1});
 assert.equal(heliosCampaignStage(f.s,HOME).stage,'scale_recorded');assert.match(reply(f).text,/will not invent/);
 f.s.story.flags.kessler_comparison_watch={version:1,first:{plate:18.8,stamp:20,count:1}};
 assert.equal(heliosCampaignStage(f.s,HOME).stage,'scale_return');assert.match(reply(f).text,/20.0 tonnes.*18.8/);
 assert.match(reply(f).text,/does not release/);assert.match(reply(f).text,/Furnace Detail/);
 assert.equal(heliosCampaignActionCurrent(f.s,HOME,r.campaignHandoff),false);
 }finally{f.close();}
});

test('missing or duplicate B1 postings never fabricate a replacement contract',()=>{
 const f=fixture();try{f.paid();f.receive();const slots=f.s.missions.boards[HOME].slots;const o=slots.find(o=>o.storyTag==='campaign47a:b1:alloy_run');
 slots.push({...o});assert.equal(reply(f).missionOffer,undefined);assert.match(reply(f).text,/no single current posting/);
 f.s.missions.boards[HOME].slots=slots.filter(x=>x.storyTag!=='campaign47a:b1:alloy_run');
 assert.equal(reply(f).missionOffer,undefined);assert.equal(heliosCampaignStage(f.s,HOME).stage,'alloy_wait');
 }finally{f.close();}
});


test('a first-shift counter, wrong receipt, or duplicate paid record cannot open the second file',()=>{
 for(const mutate of [s=>s.missions.receipts=[],s=>s.missions.receipts.push({...s.missions.receipts[0]}),
 s=>s.missions.receipts[0].rewardCr=0,s=>s.missions.receipts[0].at_s=s.simTime+1,
 s=>s.missions.receipts[0].destStationId='station_tethys',s=>s.missions.starterJobStep.starter_hitch=0,
 s=>s.missions.active.push({id:'contradictory',status:'active',params:{starterJobId:'starter_hitch',starterStep:1}})]){
 const f=fixture();try{f.paid();mutate(f.s);assert.deepEqual(heliosCampaignChoices(f.s,HOME),[]);
 assert.equal(reply(f).campaignHandoff,undefined);assert.equal(reply(f).missionOffer,undefined);
 }finally{f.close();}}
});

test('all displayed alloy terms are bound into the acceptance snapshot',()=>{
 for(const field of ['time_limit_s','collateral_cr','reward_cr']){const f=fixture();try{f.paid();f.receive();
 const r=reply(f);assert.equal(r.campaignHandoff.kind,'offer');
 r.missionOffer[field]=(r.missionOffer[field]||0)+10;
 assert.equal(heliosCampaignActionCurrent(f.s,HOME,r.campaignHandoff),false);
 }finally{f.close();}}
});


test('campaign-only pilots never inherit an invented paid iron shift',()=>{
 const f=fixture();try{f.receive();assert.equal(f.first.status,'active');
 const r=reply(f);assert.equal(r.missionOffer?.storyTag,'campaign47a:b1:alloy_run');
 assert.doesNotMatch(r.text,/paid cutting ticket|cutting wages/);assert.match(r.text,/does not settle the old claim/);
 }finally{f.close();}
});
