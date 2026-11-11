import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {missions} from '../src/systems/missions.js';
import {combat} from '../src/systems/combat.js';
import {createProductionCapitalBossEncounters} from '../src/systems/capitalBossRuntime.js';
import {save as saveDefinition} from '../src/save/saveSystem.js';
import {createGameState} from '../src/core/gameState.js';
import {initCampaignSidecar,buildMissionBoardContract} from '../src/story/campaign47a/index.js';
const fixture=createGameState(8008);fixture.story.beatIndex=3;initCampaignSidecar(fixture).own.stepProgress['3']={completed:['delivery','feed_the_maw']};
const originalOffer=buildMissionBoardContract(3,{state:fixture,seed:8008});
function boot(){
 const sim=createSimulation({seed:8008,systems:[missions,combat,createProductionCapitalBossEncounters()],updateOrder:[]});
 const {state}=sim;state.mode='flight';state.world.currentSectorId='sector_vesta_forge';state.player.credits=2162;
 const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},radius:14,mass:38,hull:140,hullMax:140});state.playerId=player.id;
 return {sim,state,player,m:sim.registry.get('missions'),boss:sim.registry.get('capitalBossEncounters')};
}
function saveOwner(h){const s=Object.create(saveDefinition);s.state=h.state;s.bus=h.sim.bus;s.registry=h.sim.registry;s.helpers=h.sim.helpers;s._restoring=false;s._pendingRunTransition=null;s._restoreSequence=0;s._lastAutosaveAt=0;s._lastAutosavePlaytime=0;s._rollbackCaptureActive=false;s._rollbackInProgress=false;return s;}
function accept(h){const board=h.m.ensureBoard('station_tethys');board.slots.unshift(JSON.parse(JSON.stringify(originalOffer)));assert.equal(h.m.acceptMission(originalOffer.id),true);const m=h.state.missions.active.find(m=>m.storyTag===originalOffer.storyTag);assert.ok(m);h.m._ensureMissionTargets(m);return m;}
function cast(h,m){return h.state.entityList.filter(e=>e.alive!==false&&e.data?.capitalBossActorKey?.startsWith(`${m.id}/`));}
function step(h,n=1){for(let i=0;i<n;i++){h.state.tick++;h.state.simTime+=1/60;h.boss.update(1/60,h.state);}}
test('hard-jump retreat keeps the finite Foreman cast and restores it while away without refilling spent ballast',()=>{
const good=boot();const gm=accept(good);const initial=cast(good,gm);const boss=initial.find(e=>e.data.physicalRole==='capital_hull');
// Synthetic spent-slot staging. This is a save/ownership test, not combat evidence.
const spent=initial.find(e=>e.data.physicalRole==='throw_mass');spent.alive=false;gm.targetEntityIds=gm.targetEntityIds.filter(id=>id!==spent.id);
good.player.pos.set(boss.pos.x+500,0,boss.pos.z);good.player.prevPos.copy(good.player.pos);step(good,5);const fight=good.state.capitalBossEncounters.fights[gm.id];assert.equal(fight.started,true);
// Exercise the actual hard-exit mission branch, then its entity/save/score restoration seams.
good.m._onSectorExit({sectorId:'sector_vesta_forge',nextSectorId:'sector_helios_prime'});
good.state.world.currentSectorId='sector_helios_prime';step(good);assert.equal(fight.suspended,true);const saved=saveOwner(good).serializeData();
const savedCast=saved.entities.persistent.filter(e=>e.data?.capitalBossActorKey?.startsWith(`${gm.id}/`));assert.equal(savedCast.length,3);assert.equal(savedCast.filter(e=>e.data.physicalRole==='throw_mass').length,2);
const revived=boot();revived.state.world.currentSectorId='sector_helios_prime';revived.state.tick=saved.entities.tick;revived.state.simTime=saved.entities.simTime;
const sv=saveOwner(revived);sv._restoreMissions(JSON.parse(JSON.stringify(saved.missions)));const remap=new Map();const persistent=saved.entities.persistent;
for(let cursor=0;cursor<persistent.length;){const next=sv._spawnPersistentEntities(persistent,remap,{startIndex:cursor,maxBatch:1000});assert.ok(next>cursor);cursor=next;}
sv._restoreCapitalBossFights(JSON.parse(JSON.stringify(saved.capitalBoss)));
const rm=revived.state.missions.active.find(m=>m.id===gm.id);assert.ok(rm);const rf=revived.state.capitalBossEncounters.fights[gm.id];assert.equal(rf.suspended,true);assert.equal(cast(revived,rm).length,3);
const awayClock=rf.clock;step(revived,3);assert.equal(rf.clock,awayClock,'away sector keeps score clock stopped');
revived.state.world.currentSectorId='sector_vesta_forge';const restoredBoss=cast(revived,rm).find(e=>e.data.physicalRole==='capital_hull');revived.player.pos.set(restoredBoss.pos.x+500,0,restoredBoss.pos.z);revived.player.prevPos.copy(revived.player.pos);
revived.m._ensureMissionTargets(rm);step(revived);assert.equal(cast(revived,rm).length,3);assert.equal(Object.keys(rm.params.capitalActorLedger).length,4);assert.equal(rf.suspended,false);assert.ok(['intro','transition'].includes(rf.phase),'return starts behind an authored warning phase');
good.sim.dispose();revived.sim.dispose();
});
