import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { registryWritContact, registryWritCustody } from '../src/missions/registryWrit.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { missionStoryOps } from '../src/systems/missionStoryOps.js';
import { world as worldProto } from '../src/systems/world.js';
import { ensureWorldRecords, captureEntityRecord, upsertRecord, serializeRecordsBag, deserializeRecordsBag, spawnSpecFromRecord } from '../src/world/worldRecords.js';
import { missionObjectiveOps } from '../src/systems/missionObjectiveOps.js';
import { missionSpawningOps } from '../src/systems/missionSpawningOps.js';
import { registryContactReadout } from '../src/ui/sim/missionRecap.js';
import { story } from '../src/systems/story.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { combat as combatProto, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { ROCK_SIZE_CLASSES } from '../src/data/rockSubstances.js';
import { modelTruthRopeEnd } from '../src/data/modelTruth.js';
import { isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
import { initCampaignSidecar } from '../src/story/campaign47a/campaignTransitions.js';
const tether=fs.readFileSync(process.env.NEST_TETHER_SOURCE || new URL('../src/systems/tetherGameplay.js',import.meta.url),'utf8');
const rating=fs.readFileSync(process.env.NEST_LINE_RATING_SOURCE || new URL('../src/data/lineRating.js',import.meta.url),'utf8');
function fn(s,n){const a=s.search(new RegExp('(?:export )?function '+n+'\\(')),b=s.indexOf('\n}',a);assert(a>=0&&b>a,n);return s.slice(a,b+2).replace(/^export /,'');}
function method(s,n){const a=s.indexOf('\n  '+n+'('),b=s.indexOf('\n  },',a);assert(a>=0&&b>a,n);return s.slice(a+3,b+4);}
const no=n=>()=>{throw Error('Unexercised port '+n)};
const ctx=vm.createContext({console,ROCK_SIZE_CLASSES,modelTruthRopeEnd,isDynamicPhysicsBodyEntity,
 isBlackFlagAdventure:()=>true,vesselForEntity:no('drive-disabled vessel'),peekShipjack:no('drive-disabled parley'),hasRecoveryTowConsent:no('drive-disabled consent'),isSurrenderedContact:no('surrender'),
 occupantGenerationOf:e=>e?.occupantGeneration,survivalRoundWreckLatchLegal:()=>false,isMassSeedTetherEligible:no('MassSeed'),
 commandAcquireCandidates:(state,player,max,scratch)=>[...state.entities.values()].filter(e=>e.id!==player.id&&e.data?.candidate===true),
 collectAcquisitionObstacles:()=>[],masslineObstructed:()=>false,compareEntityIds:(a,b)=>String(a.id).localeCompare(String(b?.id)),acquisitionCursorActive:()=>false,
 promoteAsteroidFieldRock:no('field-rock'),TETHER_DEF_ID:'tether_standard',TRANSIENT_NON_TETHERABLE_TYPES:new Set(['projectile','fx']),TOW_TARGET_COM_TYPES:new Set(['wreck','ship','drone','payload','pickup'])});
vm.runInContext(rating.replace(/^import[^;]+;/m,'').replace(/^export /gm,'')+'\n'+['acquisitionDenialReason','positive','finite','surfacePointToward','isAttachable','validateAcquisitionTarget','acquisitionAttachmentEndpoints','contextualAttachmentWorlds','towAnchorAtCenterOfMass','invalidateAcquisitionReceipt','statusForReason','bodyMassOf','attachmentDef'].map(n=>fn(tether,n)).join('\n'),ctx);
const tailStart=tether.indexOf('    const def = attachmentDef(kernel, TETHER_DEF_ID);',tether.indexOf('  _updateTetherGameplay('));
const tailEnd=tether.indexOf('\n  },',tailStart);
vm.runInContext('this.hostMethods={'+['_consumeAcquisitionReceipt','_acquireCommandTarget','_clearAcquisitionPreview'].map(n=>method(tether,n)).join(',')+'};\nthis.press=function(kernel,state,player,now){const attachments=kernel.attachments,wantsLatch=true;'+tether.slice(tailStart,tailEnd)+'\n};',ctx);

function fixture(tier=1, mode='nearest') {
 const state=createGameState({seed:31});state.tick=10;state.simTime=10;state.mode='flight';state.world.currentSectorId='sector_charon_expanse';state.ui.docked=false;
 state.entities=new Map();state.entityList=[];state.playerId=1;state.story.beatIndex=2;initCampaignSidecar(state,0);
 state.story.campaign47a.stepProgress['2']={completed:['cinder_board','compost','nest'],updatedAtS:0};
 const player={id:1,occupantGeneration:11,type:'ship',alive:true,team:'player',hull:100,hullMax:100,radius:10,mass:55,pos:{x:0,z:0},vel:{x:0,z:0},data:{},flags:{}};
 const spec=makeEnemySpawnSpec('wasp_swarmer',1,{x:50,z:0},{factionId:'faction_free',startedTick:0});
 const target={...spec,id:2,occupantGeneration:22,alive:true};target.data={...spec.data,storyTargetId:'npc_elroy',storyTargetRole:'register_mark',candidate:true};
 const mission={id:'registry-test',status:'active',storyTag:'campaign47a:b2:elroy',type:'bounty_hunt',destSectorId:'sector_charon_expanse',targetEntityIds:[2],storyTarget:{id:'npc_elroy',role:'register_mark',name:'Elroy',label:'UNKNOWN VESSEL'},params:{},objectiveTarget:1};
 state.entities.set(1,player);state.entities.set(2,target);state.entityList=[player,target];state.missions.active=[mission];state.player.targetId=2;
 missionSpawningOps._stampMissionTargetIdentity.call({state},target,mission,0);
 state.rockCore={tier,rating:tier?25:0};state.player.lineProgression={classIndex:1};state.input={tetherMode:mode==='nearest'?'nearest':null};
 const bus=createBus(),events=[];const helpers={combatPhysics:{createAttachment:()=>({id:'bounded-constraint'}),cutAttachment:()=>true,setAttachmentReel:({restLength})=>({restLength})}};
 const kernel=getCombatKernel({state,bus,helpers});
 const host=Object.assign({_noRelatchUntil:-Infinity,_lastPreviewTick:state.tick-1,_resetPhaseMirror(){},_refreshAcquisitionPreview(){throw Error('Unexpected preview rebuild');},bus},ctx.hostMethods);
 const owner=Object.assign({state,bus,_ensureCampaignSidecar(){},_refreshTrackedMissionNav(){},_sayStoryLine(text){events.push({say:text});},_completeMission(m){m.status='completed';events.push({complete:m.params.investigationOutcome});}},missionObjectiveOps);
 bus.on('tether:reel',p=>{events.push({reel:p});owner._onContract47aB2TetherReel(p);});bus.on('tether:latchDenied',p=>events.push({denial:p.reason}));bus.on('story:elroyResolved',p=>events.push({resolved:p}));
 function latch(){state.masslineAcquisition={id:'standing-input-receipt',validUntil:11,selected:{targetId:2,status:'ready'}};ctx.press.call(host,kernel,state,player,10);const a=host._active&&kernel.attachments.get(host._active.attachmentId);if(a)state.player.tether={active:true,targetId:2,attachmentId:a.id};return a;}
 return {state,player,target,mission,bus,kernel,host,owner,events,latch};
}

test('ordinary Elroy retains radius12/mass16: current T0 and T1 admission, attachment-service custody',()=>{
 const low=fixture(0);assert.equal(low.target.radius,12);assert.equal(low.target.mass,16);assert(low.latch());assert.equal(low.state.rockCore.tier,0);
 const h=fixture(1);assert(h.owner._identifyContract47aB2({targetId:2}));const a=h.latch();assert(a);assert.equal(a.ownerGeneration,11);assert.equal(a.targetGeneration,22);
 assert(h.kernel.attachments.reel(a.id,-1).ok);assert.equal(h.mission.status,'completed');assert.equal(h.state.story.flags.elroy_outcome,'custody');assert.equal(h.events.filter(e=>e.complete).length,1);
 assert(h.kernel.attachments.reel(a.id,-1).ok);assert.equal(h.events.filter(e=>e.complete).length,1);assert.equal(h.target.alive,true);
});

test('scan authenticates current live contact rather than reused target ID',()=>{
 for(const mutate of [h=>h.target.data.storyTargetId='impostor',h=>h.target.data.missionId='foreign',h=>h.target.data.worldRecordId='foreign',h=>h.target.data.identityKey='foreign',h=>h.target.data.missionTargetSlot=1,h=>h.target.homeSectorId='foreign',h=>h.target.alive=false,h=>h.player.alive=false,h=>h.state.mode='dead',h=>h.state.ui.docked=true,h=>h.target.pos.x=1201,h=>h.target.pos.x=NaN]){
  const h=fixture();mutate(h);assert.equal(h.owner._identifyContract47aB2({targetId:2}),false);assert.equal(h.mission.params.investigationStage,undefined);
 }
 const h=fixture();h.target.pos.x=1200;assert(h.owner._identifyContract47aB2({targetId:2}));
});

test('custody rejects stale, severed, reused, foreign, dead and remote physical claims',()=>{
 const cases=[h=>h.state.player.tether.active=false,h=>h.a.state='cut',h=>h.a.ownerId=99,h=>h.a.targetId=99,h=>h.a.ownerGeneration=99,h=>h.a.targetGeneration=99,h=>h.a.physicsHandle=null,h=>h.state.tick++,h=>h.target.pos.x=61,h=>h.player.alive=false,h=>h.target.alive=false,h=>h.state.world.currentSectorId='foreign',h=>h.target.data.storyTargetRole='wrong',h=>h.a.restLength=61,h=>h.p.after=-1,h=>h.p.after='50',h=>h.p.attachmentId='stale',h=>h.p.actorId=99,h=>h.p.before=0,h=>h.mission.params.investigationStage=null];
 for(const mutate of cases){const h=fixture();h.owner._identifyContract47aB2({targetId:2});h.a=h.latch();h.a.restLength=50;h.a.lastReelTick=h.state.tick;h.a.reelRevision=1;h.p={actorId:1,targetId:2,attachmentId:h.a.id,before:51,after:50};mutate(h);assert.equal(h.owner._onContract47aB2TetherReel(h.p),false);assert.equal(h.mission.status,'active');assert.equal(h.state.story.flags.elroy_outcome,undefined);}
});

test('short spool while target remains distant is not custody; a later nearby reel can settle',()=>{
 const h=fixture();h.owner._identifyContract47aB2({targetId:2});const a=h.latch();h.target.pos.x=80;h.kernel.attachments.reel(a.id,-1);assert.equal(h.mission.status,'active');h.target.pos.x=50;h.kernel.attachments.reel(a.id,-1);assert.equal(h.mission.params.investigationOutcome,'custody');
});

test('force before scan retains wreck identification and force route',()=>{
 const h=fixture();h.target.alive=false;h.owner._settleBountyTargetKill(h.mission,0,{id:2,killerId:1});assert.equal(h.mission.params.investigationOutcome,'force');assert.equal(h.mission.params.identifiedBy,'wreck_registry');assert.equal(h.state.story.flags.elroy_outcome,'force');
});

test('stale saved mirror alone cannot establish custody',()=>{
 const h=fixture();h.owner._identifyContract47aB2({targetId:2});const a=h.latch();h.state.player.tether=structuredClone(h.state.player.tether);delete h.state.combat.attachments.byId[a.id];assert(registryWritContact(h.state,h.mission,2));assert.equal(registryWritCustody(h.state,h.mission,{actorId:1,targetId:2,attachmentId:a.id,before:50,after:49},60),false);
});

test('Registry guidance discloses living target and real proximity',()=>{
 const h=fixture();assert.match(registryContactReadout(h.mission).next,/pulse scan/);h.mission.params.investigationStage='identified';const next=registryContactReadout(h.mission).next;assert.match(next,/living vessel/);assert.doesNotMatch(next,/rating T1|starter T0/);assert.match(next,/close within 60 WU/);assert.match(next,/destroy/);
});

test('aftermath preserves living witness versus sealed force case, once',()=>{
 for(const outcome of ['custody','force']){const events=[];const h={state:{story:{flags:{}}},bus:{emit:(n,p)=>events.push({n,p})},_showGraffiti(){},_fireComms:p=>events.push({n:'comms',p})};story._onElroyResolved.call(h,{entityId:2,outcome});story._onElroyResolved.call(h,{entityId:2,outcome});assert.equal(events.filter(e=>e.n==='comms').length,1);assert.match(events.find(e=>e.n==='comms').p.text,outcome==='custody'?/LIVING WITNESS SECURED/:/CASE FILE SEALED/);}
});

test('current preview receipt also admits standard Elroy at T0 without a grant',()=>{const h=fixture(0,'preview');assert(h.latch());assert.equal(h.target.radius,12);assert.equal(h.target.mass,16);assert.equal(h.state.rockCore.tier,0);});

test('living or foreign recycled occupants cannot resolve the Registry force route',()=>{
 for(const mutate of [h=>{},h=>{h.target.alive=false;h.target.data.missionId='foreign';},h=>{h.target.alive=false;h.target.data.worldRecordId='foreign';}]){const h=fixture();mutate(h);h.owner._onKill({id:2,killerId:1});assert.equal(h.mission.status,'active');assert.equal(h.mission.params.investigationOutcome,undefined);}
});


for (const seeded of [true, false]) test(`real mission completion retires ${seeded ? 'recorded' : 'fresh unrecorded'} custody durably without kill or wreck, and cannot pay twice`,()=>{
 const h=fixture();const world=Object.assign({},worldProto,{state:h.state});
 Object.assign(h.owner,missionsProto);h.owner.registry={get:name=>name==='world'?world:null};h.owner.helpers={};
 h.mission.stationId='station_tethys';h.mission.reward_cr=800;h.mission.collateral_cr=0;h.mission.riskTier=2;
 const recordId=h.target.data.worldRecordId;
 if (seeded) upsertRecord(ensureWorldRecords(h.state.world),captureEntityRecord(h.target,{sectorId:h.mission.destSectorId,tick:h.state.tick}));
 else assert.equal(h.state.world.records?.byId?.[recordId],undefined,'fresh target has no world row before custody');
 let captures=0;const upsert=world.upsertWorldRecord;world.upsertWorldRecord=function(e){assert.equal(e.alive,true);captures++;return upsert.call(this,e);};
 let kills=0;const payments=[];h.bus.on('entity:killed',()=>kills++);h.bus.on('economy:grantCredits',p=>payments.push(p));
 assert(h.owner._identifyContract47aB2({targetId:2}));const a=h.latch();assert(h.kernel.attachments.reel(a.id,-1).ok);
 assert.equal(h.mission.status,'completed');assert.equal(h.mission.params.investigationOutcome,'custody');
 assert.equal(captures,seeded?0:1,'capture only the missing record through the world owner');
 const rec=h.state.world.records.byId[recordId];assert(rec);assert.equal(rec.outcome,'defeated');assert.equal(rec.extra.custodyOutcome,'registry_custody');
 assert.equal(h.target.alive,false,'runtime actor retired by canonical cleanup, without a kill event');assert.equal(kills,0);
 const restored=deserializeRecordsBag(serializeRecordsBag(h.state.world.records)).byId[recordId];
 assert.equal(restored.outcome,'defeated');assert.equal(restored.extra.custodyOutcome,'registry_custody');assert.equal(spawnSpecFromRecord(restored),null);
 assert.equal(payments.filter(p=>p.reason==='mission:'+h.mission.id).length,1);
 h.owner._onContract47aB2TetherReel({actorId:1,targetId:2,attachmentId:a.id,before:51,after:50});
 assert.equal(payments.filter(p=>p.reason==='mission:'+h.mission.id).length,1);
});

test('Registry auto-accept requires Tethys departure; already-active tracking remains available elsewhere',()=>{
 const h=fixture();h.state.missions.active=[];let boards=0,accepted=0,tracked=0;
 const host={state:h.state,_epoch:()=>1,ensureBoard(){boards++;return {slots:[{id:'offered-registry',storyTag:'campaign47a:b2:elroy'}]};},acceptMission(){accepted++;return true;},trackMission(){tracked++;}};
 assert.equal(missionStoryOps._activateBookContractOnDeparture.call(host,2,'station_vesta'),false);
 assert.equal(boards,0);assert.equal(accepted,0);
 assert.equal(missionStoryOps._activateBookContractOnDeparture.call(host,2,null),false);
 assert.equal(missionStoryOps._activateBookContractOnDeparture.call(host,2,'station_tethys'),true);assert.equal(accepted,1);
 h.state.missions.active=[h.mission];assert.equal(missionStoryOps._activateBookContractOnDeparture.call(host,2,'station_vesta'),true);assert.equal(tracked,1);assert.equal(accepted,1);
});

test('actual combat kill producer resolves force through real completion and durable destruction',()=>{
 const h=fixture();const world=Object.assign({},worldProto,{state:h.state});Object.assign(h.owner,missionsProto);h.owner.registry={get:name=>name==='world'?world:null};h.owner.helpers={};
 h.mission.stationId='station_tethys';h.mission.reward_cr=800;h.mission.collateral_cr=0;h.mission.riskTier=2;
 const recordId=h.target.data.worldRecordId;upsertRecord(ensureWorldRecords(h.state.world),captureEntityRecord(h.target,{sectorId:h.mission.destSectorId,tick:h.state.tick}));
 h.bus.on('entity:killed',p=>h.owner._onKill(p));
 const combat=Object.assign({},combatProto,{state:h.state,bus:h.bus,helpers:{}});combat.kill(h.target,h.state.playerId);
 assert.equal(h.mission.status,'completed');assert.equal(h.mission.params.investigationOutcome,'force');assert.equal(h.mission.params.identifiedBy,'wreck_registry');
 assert.equal(h.state.world.records.byId[recordId].outcome,'destroyed');assert.equal(h.state.world.records.byId[recordId].extra?.custodyOutcome,undefined);
});
