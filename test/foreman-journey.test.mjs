import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missionStoryOps } from '../src/systems/missionStoryOps.js';
import { initCampaignSidecar, buildMissionBoardContract } from '../src/story/campaign47a/index.js';
import { capitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { SECTORS } from '../src/data/sectors.js';
function boot(){
 const state=createGameState(8008);state.story.beatIndex=3;
 const own=initCampaignSidecar(state).own;own.stepProgress['3']={completed:['delivery','feed_the_maw']};
 state.missions.active=[];state.player.credits=1610;state.player.debt=160;state.fuel={current:100,max:100};
 const bus=createBus(),events=[];bus.on('comms:popup',p=>events.push(p));
 const owner={...missionStoryOps,state,bus,_epoch:()=>12,_ensureCampaignSidecar:()=>initCampaignSidecar(state),_refreshEmbodiedStoryBoards(){},_refreshNavigation(){},_advanceStory(){state.story.beatIndex++}};
 return {state,owner,events,offer:buildMissionBoardContract(3,{state,seed:8008,epoch:12})};
}
test('next Book 3 offer names actual Vesta counters, line burden and services',()=>{
 const {offer}=boot();assert.equal(offer.destSectorId,'sector_vesta_forge');assert.equal(offer.destStationId,'station_forge');assert.equal(offer.params.foremanBriefVersion,1);assert.equal(offer.reward_cr,2200);
 for(const read of [/locked charge/,/exposed stern/,/heavily resists/,/three 180t/,/Class I line is rated 20t/,/early releases/,/stern vent/,/Refuel Depot/])assert.match(offer.brief,read);
 const cast=capitalBossEncounter(offer.params.encounterId);assert.equal(cast.actors.find(a=>a.role==='throw_mass').mass,180);assert.equal(cast.actors.find(a=>a.role==='throw_mass').count,3);
 const vesta=SECTORS.find(s=>s.id===offer.destSectorId);assert.ok(vesta.stations.find(s=>s.id==='station_forge').services.includes('repair'));assert.equal(vesta.stations.find(s=>s.id==='station_forge').services.includes('refuel'),false);assert.ok(vesta.stations.some(s=>s.name==='Refuel Depot'&&s.services.includes('refuel')));
});
test('frozen old pending Foreman row receives only preparation, without changing terms or identity',()=>{
 const {owner,offer}=boot();const params={...offer.params};delete params.foremanBriefVersion;
 const old=Object.freeze({...offer,id:'kept-old-id',reward_cr:1999,brief:'old preparation',params:Object.freeze(params)}),other=Object.freeze({id:'unrelated',brief:'leave it'}),board={slots:Object.freeze([old,other])};let accepted;
 owner.ensureBoard=()=>board;owner.acceptMission=id=>{accepted=board.slots.find(row=>row.id===id);return true};
 assert.equal(owner._activateBookContractOnDeparture(3,'station_ceres'),true);assert.notEqual(accepted,old);assert.equal(accepted.id,'kept-old-id');assert.equal(accepted.reward_cr,1999);assert.equal(accepted.params.foremanBriefVersion,1);assert.match(accepted.brief,/Vesta/);assert.equal(old.brief,'old preparation');assert.equal(old.params.foremanBriefVersion,undefined);assert.equal(board.slots[1],other);
});
test('accepted legacy Foreman is tracked unchanged, never replaced or reaccepted',()=>{
 const {state,owner}=boot();const active=Object.freeze({id:'active',storyTag:'campaign47a:b3:foreman',status:'active',brief:'accepted terms',params:Object.freeze({})});state.missions.active=[active];let tracked;owner.trackMission=id=>tracked=id;owner.ensureBoard=()=>{throw Error('no pending board needed')};owner.acceptMission=()=>{throw Error('must not reaccept')};
 assert.equal(owner._activateBookContractOnDeparture(3),true);assert.equal(tracked,'active');assert.equal(active.brief,'accepted terms');assert.deepEqual(active.params,{});
});
test('acceptance preparation is readable without writing fuel, money or progression',()=>{
 const {state,owner,events,offer}=boot();const before=JSON.stringify({player:state.player,fuel:state.fuel,story:state.story});assert.equal(owner._onBookContractAccepted({...offer,id:'active'}),true);assert.equal(events.length,1);assert.match(events[0].text,/charge lock/);assert.match(events[0].text,/20t against 180t/);assert.match(events[0].text,/Refuel Depot/);assert.equal(JSON.stringify({player:state.player,fuel:state.fuel,story:state.story}),before);
});
test('completed Foreman closes the actual book without inventing lane ownership or a ship',()=>{
 const {state,owner,events,offer}=boot();assert.equal(owner._advanceEmbodiedStoryMission({...offer,id:'m_test',status:'completed',params:{...offer.params,completionMethod:'outgun_the_capital'}}),true);assert.equal(state.story.beatIndex,4);assert.equal(state.story.flags.foreman_settled,true);const line=events.find(p=>p.id==='b3_foreman_m_test');assert.ok(line);assert.match(line.text,/next introductions wait at Helios/);assert.doesNotMatch(line.text,/lane is yours|free ship|hand over/);assert.equal(state.player.credits,1610);assert.equal(state.player.debt,160);
});
