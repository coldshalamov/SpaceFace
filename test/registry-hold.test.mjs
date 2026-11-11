import { createBus } from '../src/core/eventBus.js';
import { missionObjectiveOps } from '../src/systems/missionObjectiveOps.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { missionSpawningOps } from '../src/systems/missionSpawningOps.js';
import { combat as combatProto, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { registryWritContact, registryWritForce } from '../src/missions/registryWrit.js';
import { captureEntityRecord, spawnSpecFromRecord, serializeRecordsBag, deserializeRecordsBag } from '../src/world/worldRecords.js';
function setup() {
 const state=createGameState({seed:31});state.mode='flight';state.tick=600;state.simTime=10;state.world.currentSectorId='sector_charon_expanse';state.ui.docked=false;
 const player={id:1,type:'ship',alive:true,team:0,pos:{x:0,y:0,z:0},vel:{x:0,y:0,z:0},data:{},flags:{}};
 const spec=makeEnemySpawnSpec('wasp_swarmer',9,{x:50,z:0},{factionId:'faction_free',startedTick:0});
 const target={...spec,id:2,alive:true,occupantGeneration:22,vel:{x:1,y:0,z:2}};
 target.data={...spec.data,missionTag:'m_test',storyTargetId:'npc_elroy',storyTargetRole:'register_mark'};
 const mission={id:'m_test',status:'active',storyTag:'campaign47a:b2:elroy',type:'bounty_hunt',destSectorId:'sector_charon_expanse',targetEntityIds:[2],storyTarget:{id:'npc_elroy',role:'register_mark',name:'Elroy'},params:{}};
 state.entities=new Map([[1,player],[2,target]]);state.entityList=[player,target];state.playerId=1;state.missions.active=[mission];
 const host={state};const stamp=()=>missionSpawningOps._stampMissionTargetIdentity.call(host,target,mission,0);
 return {state,player,target,mission,host,stamp};
}
function body(e){return structuredClone({pos:e.pos,vel:e.vel,rot:e.rot,mass:e.mass,radius:e.radius,hull:e.hull,shield:e.shield,armorHp:e.armorHp,collides:e.collides,physicsBody:e.physicsBody,invuln:e.flags?.invuln,weapons:e.data.weapons});}
test('the authenticated civilian holds without bypassing hull, collision or physical Line rules',()=>{
 const h=setup(),before=body(h.target);h.stamp();const a=h.target.data.ai;
 assert.equal(a.passive,true);assert.equal(a.allowPassiveManeuver,false);assert.equal(a.roe,'hold_fire');assert.equal(a.activity.kind,'hail_hold');assert.equal(a.activity.targetId,null);assert.deepEqual(a.hostileTeams,[]);assert.deepEqual(body(h.target),before);
 assert.equal(missionSpawningOps._armAcceptedCombatTargets.call(h.host,h.mission,h.state),0);assert.equal(h.target.data.combat.targetId,null);
 assert.deepEqual(authorizeAIEngagement({state:h.state,self:h.target,target:h.player,tick:600,objectiveReason:'combat_doctrine:swarm_pack:strike'}),{ok:false,reason:'passive'});
 assert.equal(registryWritContact(h.state,h.mission,2)?.target,h.target);assert.equal(registryWritForce(h.state,h.mission,{id:2,killerId:1}),false);
 h.target.alive=false;assert.equal(registryWritForce(h.state,h.mission,{id:2,killerId:1}),true,'real player death remains eligible for force');
});
test('Continue-adopted durable mark regains the hold after ordinary world-record round-trip',()=>{
 const h=setup();h.stamp();const rec=captureEntityRecord(h.target,{sectorId:h.mission.destSectorId,tick:h.state.tick});
 const bag=deserializeRecordsBag(serializeRecordsBag({byId:{[rec.recordId]:rec}}));const restored=spawnSpecFromRecord(bag.byId[rec.recordId]);assert.ok(restored);
 const e={...restored,id:3,alive:true};assert.equal(e.data.storyTargetId,undefined,'story dressing is not durable record identity');e.data.ai.passive=false;e.data.ai.activity={kind:'attack_run',targetId:1};e.data.combat={targetId:1};
 missionSpawningOps._stampMissionTargetIdentity.call(h.host,e,h.mission,0);
 assert.equal(e.data.storyTargetId,'npc_elroy');assert.equal(e.data.storyTargetRole,'register_mark');assert.equal(e.data.ai.passive,true);assert.equal(e.data.ai.activity.kind,'hail_hold');assert.equal(e.data.combat.targetId,null);
 const activity=e.data.ai.activity;missionSpawningOps._stampMissionTargetIdentity.call(h.host,e,h.mission,0);assert.equal(e.data.ai.activity,activity,'repeat adoption retains its hold anchor');
});
const foreignCases={missingPerson:h=>delete h.target.data.storyTargetId,missingRole:h=>delete h.target.data.storyTargetRole,foreignDataHome:h=>h.target.data.homeSectorId='foreign',foreignDataSector:h=>h.target.data.sectorId='foreign',foreignTag:h=>h.target.data.missionTag='foreign',foreignOwner:h=>h.target.data.missionId='foreign',foreignSlot:h=>h.target.data.missionTargetSlot=1,foreignRecord:h=>h.target.data.worldRecordId='foreign',foreignKey:h=>h.target.data.identityKey='foreign',foreignSector:h=>h.target.homeSectorId='foreign',foreignPerson:h=>h.target.data.storyTargetId='other',foreignRole:h=>h.target.data.storyTargetRole='board_writ',dead:h=>h.target.alive=false,wreck:h=>h.target.type='wreck',inactive:h=>h.mission.status='completed',otherDestination:h=>h.mission.destSectorId='sector_tethys_junction',otherMission:h=>h.mission.storyTag='campaign47a:b3:other',ordinaryBounty:h=>{h.mission.storyTag=null;h.mission.storyTarget.role='board_writ';}};
// Adversarial owner-seam probes, not claims that native adoption admits every fixture.
for(const [name,mutate]of Object.entries(foreignCases))test(`repeat stamping never relabels ${name} as the civilian`,()=>{
 const h=setup();mutate(h);const before=structuredClone(h.target);
 for(let n=0;n<3;n++){
  h.stamp();assert.notEqual(h.target.data.ai.passive,true);assert.notEqual(h.target.data.ai.activity.kind,'hail_hold');
  if(h.mission.storyTag==='campaign47a:b2:elroy'&&h.mission.destSectorId==='sector_charon_expanse')assert.deepEqual(h.target,before,'rejected identity remains untouched across repeat attempts');
 }
});
for(const missing of ['storyTargetId','storyTargetRole'])test(`partial durable restore with missing ${missing} holds on its first stamp`,()=>{
 const h=setup();h.stamp();const rec=captureEntityRecord(h.target,{sectorId:h.mission.destSectorId,tick:h.state.tick});
 const bag=deserializeRecordsBag(serializeRecordsBag({byId:{[rec.recordId]:rec}}));const e={...spawnSpecFromRecord(bag.byId[rec.recordId]),id:3,alive:true};
 if(missing==='storyTargetId')e.data.storyTargetRole='register_mark';else e.data.storyTargetId='npc_elroy';
 e.data.ai.passive=false;e.data.ai.activity={kind:'attack_run',targetId:1};e.data.combat={targetId:1};missionSpawningOps._stampMissionTargetIdentity.call(h.host,e,h.mission,0);
 assert.equal(e.data.storyTargetId,'npc_elroy');assert.equal(e.data.storyTargetRole,'register_mark');assert.equal(e.data.ai.passive,true);assert.equal(e.data.ai.activity.kind,'hail_hold');assert.equal(e.data.combat.targetId,null);
 const activity=e.data.ai.activity;missionSpawningOps._stampMissionTargetIdentity.call(h.host,e,h.mission,0);assert.equal(e.data.ai.activity,activity);
});
test('the mission owner may stamp an unclaimed fresh civilian with exact story dressing',()=>{
 const h=setup();delete h.target.data.missionTag;h.stamp();
 assert.equal(h.target.data.missionTag,h.mission.id);assert.equal(h.target.data.missionId,h.mission.id);assert.equal(h.target.data.ai.passive,true);
 const activity=h.target.data.ai.activity;h.stamp();assert.equal(h.target.data.ai.activity,activity);
});
test('the single-person Registry rejects a nonzero stamping sequence without changing provenance',()=>{
 const h=setup(),before=structuredClone(h.target);
 for(let n=0;n<3;n++)missionSpawningOps._stampMissionTargetIdentity.call(h.host,h.target,h.mission,1);
 assert.deepEqual(h.target,before);
});
test('ordinary accepted bounty keeps its hostile pursuit contract',()=>{
 const h=setup();h.mission.storyTag=null;h.mission.storyTarget={id:'mark_1',role:'board_writ',name:'Hunter mark'};h.stamp();
 assert.deepEqual(h.target.data.ai.hostileTeams,[0]);assert.equal(h.target.data.ai.motive,'accepted_combat_contract');assert.equal(h.target.data.ai.activity.kind,'attack_run');
 assert.equal(missionSpawningOps._armAcceptedCombatTargets.call(h.host,h.mission,h.state),1);assert.equal(h.target.data.combat.targetId,1);
});

test('actual combat kill still resolves held civilian as force, once',()=>{
 const h=setup();h.stamp();h.mission.params.investigationStage='identified';h.mission.objectiveTarget=1;
 const bus=createBus(),outcomes=[];let completions=0;
 const owner={...missionObjectiveOps,state:h.state,bus,_sayStoryLine(){},_completeMission(m){m.status='completed';completions++;}};
 bus.on('entity:killed',e=>owner._onKill(e));bus.on('story:elroyResolved',e=>outcomes.push(e));
 const combat={...combatProto,state:h.state,bus,helpers:{}};combat.kill(h.target,1);
 assert.equal(h.target.alive,false);assert.equal(h.mission.params.investigationOutcome,'force');assert.equal(completions,1);assert.equal(outcomes.length,1);assert.equal(outcomes[0].outcome,'force');
 owner._onKill({id:2,killerId:1});assert.equal(completions,1);
});
