import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo, removeCargo } from '../src/systems/cargo.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import { heliosCampaignStage, heliosCampaignChoices, heliosCampaignReply,
  heliosCampaignActionCurrent, takeHeliosCampaignAction } from '../src/ui/station/heliosCampaignHandoff.js';
import { tethysScaleRead, tethysScaleChoices, tethysScaleReply } from '../src/ui/station/tethysScaleConversation.js';
import { createKesslerScale } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition } from '../src/systems/kesslerScaleWorksite.js';
import { lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';
const TETHYS='station_tethys';
const HOME='station_helios',SECTOR='sector_helios_prime',FILE='helios_47a_file',ORIGINAL='helios_47a_original';
function fixture() {
 const sim=createSimulation({seed:79319,systems:[missions,economy,cargo,stationContacts,lootShards,mining,createKesslerScale()],updateOrder:[]});
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

function arrive(f, deliver=true){
 f.receive();const o=f.s.missions.boards[HOME].slots.find(o=>o.storyTag==='campaign47a:b1:alloy_run');assert.equal(f.owner.acceptMission(o.id),true);
 f.s.ui.docked=false;f.s.ui.dockedStationId=null;f.s.world.currentSectorId='sector_tethys_junction';
 if(deliver)f.sim.bus.emit('dock:docked',{stationId:TETHYS});
 f.s.ui.docked=true;f.s.ui.dockedStationId=TETHYS;return f;
}
function ask(f,action='read'){const c=tethysScaleChoices(f.s,TETHYS).find(c=>c.id.startsWith('tethys_scale:'+action+':'));assert.ok(c);return tethysScaleReply({state:f.s,bus:f.sim.bus},TETHYS,c.id);}
test('real receiving settlement exposes Mira and own-freight route without generating cargo or money',()=>{const f=arrive(fixture());try{
 assert.equal(tethysScaleRead(f.s,TETHYS).phase,'weigh');assert.equal(f.s.player.cargo.items.cmdty_alloys||0,0);
 const mira=generateContacts(TETHYS,f.s).find(c=>c.canonicalKey==='mira');assert.ok(mira.choices.some(c=>c.id.startsWith('tethys_scale:')));
 const before=JSON.stringify([f.s.player.cargo,f.s.player.credits,f.s.story,f.s.missions]);const reply=ask(f);assert.match(reply.text,/HOUSEHOLD MINERALS/);assert.match(reply.text,/no free lot/);
 assert.equal(JSON.stringify([f.s.player.cargo,f.s.player.credits,f.s.story,f.s.missions]),before);
 const routes=[];f.sim.bus.on('ui:setCourse',p=>routes.push(p));ask(f,'course');assert.equal(routes.length,1);assert.deepEqual(routes[0].pos,kesslerPadPosition());assert.equal(routes[0].autopilot,false);
 assert.equal(f.s.player.cargo.items.cmdty_alloys||0,0);
 }finally{f.close();}});
test('incomplete and destroyed sealed loads stay open and do not claim a delivery or scale step',()=>{for(const missing of [1,6]){const f=arrive(fixture(),false);try{
 // Adversarial lost-stock fixture; no dialogue owner repairs it.
 removeCargo(f.s,'cmdty_alloys',missing);f.sim.bus.emit('dock:docked',{stationId:TETHYS});
 assert.equal(tethysScaleRead(f.s,TETHYS).phase,'unsettled');assert.match(ask(f).text,new RegExp(`${6-missing} of 6 reserved`));
 assert.equal(tethysScaleChoices(f.s,TETHYS).length,1);assert.ok(!f.s.story.campaign47a.stepProgress['1'].completed.includes('alloy_run'));
 }finally{f.close();}}});
test('current free cargo, sealed stock, replacement missions and stale routes remain distinct',()=>{const f=arrive(fixture());try{
 addCargo(f.s,'cmdty_silicate',3);const stale=tethysScaleChoices(f.s,TETHYS).find(c=>c.id.startsWith('tethys_scale:course:'));
 assert.match(ask(f).text,/3u Silicate/i);removeCargo(f.s,'cmdty_silicate',1);const routes=[];f.sim.bus.on('ui:setCourse',p=>routes.push(p));
 assert.match(tethysScaleReply({state:f.s,bus:f.sim.bus},TETHYS,stale.id).text,/not the current load/);assert.equal(routes.length,0);
 f.s.ui.docked=false;assert.deepEqual(tethysScaleChoices(f.s,TETHYS),[]);assert.equal(tethysScaleRead(f.s,TETHYS),null);
 }finally{f.close();}});
test('real cargo pod supplies measured figures; partial recovery and destruction never become a recovery claim',()=>{const f=arrive(fixture());try{
 const p=f.s.entities.get(f.s.playerId),pad=kesslerPadPosition();p.pos={...pad};p.vel={x:0,z:0};f.s.ui.docked=false;f.s.player.flags.docked=false;
 const scale=f.sim.registry.get('kesslerScale');scale._sync();addCargo(f.s,'cmdty_silicate',3);
 assert.equal(f.sim.registry.get('cargo').jettison('cmdty_silicate',3,{bay:true}),3);const pod=f.s.entityList.find(e=>e.alive&&e.data?.jettisonedCargo);scale.update(0,f.s);
 assert.ok(pod.data.kesslerReceipt);assert.equal(pod.data.kesslerReceipt.trueRead,pod.mass);assert.equal(f.s.story.campaign47a.stepProgress['1'].completed.includes('scale_4'),true);
 f.s.ui.docked=true;f.s.player.flags.docked=true;assert.equal(tethysScaleRead(f.s,TETHYS).phase,'return');assert.match(ask(f).text,/20.0t.*18.8t/);assert.match(ask(f).text,/3u still remain/);
 f.s.player.cargo.capVolume=1;f.sim.registry.get('mining')._collectPayload(pod,p);assert.equal(f.s.player.cargo.items.cmdty_silicate,1);assert.match(ask(f).text,/2u still remain/);
 pod.alive=false;assert.match(ask(f).text,/not that you recovered/);assert.equal(f.s.player.cargo.items.cmdty_silicate,1);
 const serial=f.sim.registry.get('missions').state.story.flags;const retained=JSON.parse(JSON.stringify(serial));f.s.story.flags=retained;assert.match(ask(f).text,/20.0t.*18.8t/);
 }finally{f.close();}});
test('legacy completion does not invent paired weights and mode/ambiguous evidence closes the scene',()=>{const f=arrive(fixture());try{
 f.sim.bus.emit('kesslerPod:weighed',{variance:true});assert.match(ask(f).text,/no paired figures/);assert.doesNotMatch(ask(f).text,/20.0t|18.8t/);
 f.s.run.kind='swarm';assert.deepEqual(tethysScaleChoices(f.s,TETHYS),[]);
 }finally{f.close();}});

test('accepting actual Furnace Detail changes the return and invalidates the unaccepted next-leg choice',()=>{const f=arrive(fixture());try{
 f.sim.bus.emit('kesslerPod:weighed',{variance:true});const stale=tethysScaleChoices(f.s,TETHYS).find(c=>c.id.startsWith('tethys_scale:next:'));
 const board=f.owner.ensureBoard(TETHYS);const offer=board.slots.find(o=>o.storyTag==='campaign47a:b1:infested');assert.ok(offer);assert.equal(f.owner.acceptMission(offer.id),true);
 assert.match(ask(f).text,/already signed/);assert.doesNotMatch(ask(f).text,/next job on Tethys/);
 const events=[];f.sim.bus.on('ui:trackMission',p=>events.push(p));tethysScaleReply({state:f.s,bus:f.sim.bus},TETHYS,stale.id);assert.equal(events.length,0);
 ask(f,'next');assert.equal(events.length,1);assert.equal(events[0].missionId,f.s.missions.active.find(m=>m.storyTag==='campaign47a:b1:infested').id);
 }finally{f.close();}});
