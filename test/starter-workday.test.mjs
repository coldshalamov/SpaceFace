import { forEachFieldRock } from '../src/world/livingWorldViews.js';
import { captureOrchardWorkDamage } from '../src/combat/orchardWorkDamage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { starterWorkSite, authoredStarterSite, starterBuoySpec, starterMiningFocus, starterMiningReceiptMatches, starterBuoyRecordMarker, starterBuoyFromRecord, isStarterBuoyRecord, STARTER_WORKDAY_VERSION, registerStarterBuoyTow } from '../src/missions/starterWorkday.js';
import { activeOwnedShip, nextStarterStep } from '../src/data/starterJobs.js';
import * as cinderRoute from '../src/missions/cinderRoute.js';
import { registerMassScaleTow } from '../src/systems/cargoCustody.js';
const src = p => readFileSync(new URL('../'+p, import.meta.url),'utf8');
const loadOps = (p, name, deps) => {
 deps={forEachFieldRock,registerStarterBuoyTow,...deps};
 if(p==='src/systems/missionSpawningOps.js')deps={...cinderRoute,registerMassScaleTow,...deps};
 const code=src(p).replace(/\r\n/g,'\n').replace(/^import[\s\S]*?;\n/gm,'').replace(`export const ${name}`,`const ${name}`);
 return Function(...Object.keys(deps),code+`;return ${name};`)(...Object.values(deps));
};
const mission=(job='starter_pelican',step=1,type='tow_recovery')=>({id:`work-${job}-${step}`,type,destSectorId:'sector_helios_prime',params:{starterJobId:job,starterStep:step,starterWorkdayVersion:1},targetEntityIds:[]});
const global=(p)=>({x:p.x+10000,z:p.z-20000});
test('three real recoveries expand from lane to claim to outer yard, in the sector frame',()=>{
 const bodies=[1,2,3].map(n=>starterBuoySpec(mission('starter_pelican',n),global));
 assert.deepEqual(bodies.map(b=>b.mass),[40,65,90]);
 assert.deepEqual(bodies[0].pos,{x:10310,z:-20035});
 assert.ok(bodies[1].vel.z>0);assert.ok(bodies[2].vel.x>0);
 for(const b of bodies){assert.equal(b.type,'payload');assert.equal(b.physicsBody.dynamic,true);assert.equal(b.physicsBody.mass,b.mass);assert.equal(b.data.packagedPropFile,'places/place_lane_beacon.glb');assert.equal(b.data.tetherPayload,true);}
 assert.ok(Math.hypot(310,35)<Math.hypot(1000,30));assert.ok(Math.hypot(1000,30)<Math.hypot(1560,1100));
});
test('ordinary contracts, unknown versions, old saved starter offers are untouched',()=>{
 for(const m of [{type:'tow_recovery',params:{}}, {...mission(),params:{starterJobId:'starter_pelican',starterStep:1}}, {...mission(),destSectorId:'sector_ceres_belt'}]){
 assert.equal(starterBuoySpec(m,global),null);assert.equal(authoredStarterSite(m),null);assert.equal(starterMiningReceiptMatches(m,{},{}),true);
 }
 assert.equal(starterWorkSite('starter_wasp',1),null);
});
test('work faces guide to a real live rock; depleted sites retain free mining fallback',()=>{
 const m=mission('starter_hitch',1,'mining_quota');
 const rock={id:7,type:'asteroid',alive:true,pos:global({x:601,z:-300}),data:{oreHP:20}};
 assert.equal(starterMiningFocus(m,[rock],global,[{id:'ast_common_rock',oreTable:{cmdty_ore_iron:0.3}}]).targetEntityId,7);
 rock.data.oreHP=0;assert.equal(starterMiningFocus(m,[rock],global,[{id:'ast_common_rock',oreTable:{cmdty_ore_iron:0.3}}]),null);
 const state={playerId:5,world:{currentSectorId:m.destSectorId}};
 assert.equal(starterMiningReceiptMatches(m,{minerId:5,qty:2},state),true);
 assert.equal(starterMiningReceiptMatches(m,{minerId:6,qty:2},state),false);
 assert.equal(starterMiningReceiptMatches(m,{qty:2},state),false);
 assert.equal(starterMiningReceiptMatches(m,{minerId:5,qty:Infinity},state),false);
 state.world.currentSectorId='sector_ceres_belt';assert.equal(starterMiningReceiptMatches(m,{minerId:5,qty:2},state),false);
});
test('ordinary board entry authors correct first fit and next step; Wasp unchanged',()=>{
 const ops=loadOps('src/systems/missionBoardOps.js','missionBoardOps',{activeOwnedShip,nextStarterStep,starterWorkSite,STARTER_WORKDAY_VERSION});
 for(const [ship,job] of [['ship_kestrel','starter_hitch'],['ship_pelican','starter_pelican'],['ship_wasp','starter_wasp']]){
 const state={player:{ownedShips:[{defId:ship}],activeShipIndex:0},missions:{}};
 const ctx={state,_rollOffer:()=>({params:{},brief:'old'})};const offers=[];
 ops._injectStarterJob.call(ctx,{id:'station_helios',sectorId:'sector_helios_prime'},offers,9);
 assert.equal(offers[0].params.starterJobId,job);
 assert.equal(offers[0].params.starterWorkdayVersion,job==='starter_wasp'?undefined:1);
 state.missions.starterJobStep={[job]:1};const next=[];ops._injectStarterJob.call(ctx,{id:'station_helios',sectorId:'sector_helios_prime'},next,9);assert.equal(next[0].params.starterStep,2);
 const saved=JSON.parse(JSON.stringify(offers[0]));assert.deepEqual(authoredStarterSite(saved),authoredStarterSite(offers[0]));
 }
});
test('ordinary physical target owner stamps durable slot and does not replenish an adopted buoy',()=>{
 const PHYSICAL_ROLE={SLAG_CORE:'slag_core'};
 const deps={starterBuoySpec,starterMiningReceiptMatches,sectorLocalToGlobalForSector:global,
 isCampaign47aB2Rescue:()=>false,PHYSICAL_ROLE,ashfallCacheApproachPos:()=>null,asteroidColliderRadius:(_,r)=>r,missionTargetSlotOf:e=>e?.data?.slot};
 const ops=loadOps('src/systems/missionObjectiveOps.js','missionObjectiveOps',deps);
 const m=mission();let spawned=[];const entities=new Map();
 const ctx={helpers:{spawnEntity:spec=>{const e={...spec,id:100+spawned.length,alive:true};spawned.push(e);entities.set(e.id,e);return e;}},state:{entities},
 _countPhysicalRoles:()=>({core:m.targetEntityIds.length,tower:0,pods:0,escorts:0}),_stampMissionTargetIdentity:(e,m,slot)=>{e.data.slot=slot;e.data.missionTag=m.id;}};
 ops._spawnPhysicalTargetsFor.call(ctx,m,()=>()=>0.2,1280,-420);
 assert.equal(spawned.length,1);assert.equal(spawned[0].type,'payload');assert.equal(spawned[0].data.physicalRole,'slag_core');assert.equal(spawned[0].data.slot,0);
 const restored=JSON.parse(JSON.stringify(m));ops._spawnPhysicalTargetsFor.call(ctx,restored,()=>()=>0.8,9000,9000);assert.equal(spawned.length,1);
 const old=mission();delete old.params.starterWorkdayVersion;old.targetEntityIds=[];ctx._countPhysicalRoles=()=>({core:0,tower:0,pods:0,escorts:0});
 ops._spawnPhysicalTargetsFor.call(ctx,old,()=>()=>0.2,1280,-420);assert.equal(spawned[1].type,'asteroid');
});
test('negative control at pinned master: named buoy was a random slag asteroid',()=>{
 const body=readFileSync(new URL('./fixtures/baseline-physical.txt',import.meta.url),'utf8');
 const spawn=Function('isCampaign47aB2Rescue','PHYSICAL_ROLE','ashfallCacheApproachPos','asteroidColliderRadius','missionTargetSlotOf',`return ({${body}})._spawnPhysicalTargetsFor`)(()=>false,{SLAG_CORE:'slag_core'},()=>null,(_,r)=>r,()=>null);
 let actual;const m=mission();const ctx={helpers:{spawnEntity:s=>{actual={...s,id:1};return actual;}},state:{entities:new Map()},_countPhysicalRoles:()=>({core:0,tower:0,pods:0,escorts:0}),_stampMissionTargetIdentity:()=>{}};
 spawn.call(ctx,m,()=>()=>0.2,1280,-420);
 assert.equal(actual.type,'asteroid');assert.equal(actual.data.scanLabel,'SLAG CORE');assert.equal(actual.data.packagedPropFile,undefined);assert.notDeepEqual(actual.pos,{x:310,z:-35});
});
test('Continue adoption reads payload index, preserves durable slot and is idempotent',()=>{
 const m=mission();const buoy={...starterBuoySpec(m,global),id:77,alive:true};buoy.data.slot=0;buoy.data.physicalRole='slag_core';
 let payloadVisits=0,livingVisits=0;
 const deps={registerStarterBuoyTow,authoredStarterSite,PHYSICAL_ROLE:{SLAG_CORE:'slag_core'},isCampaign47aB2Rescue:()=>false,
 forEachJobInteractable:(_,visit)=>{payloadVisits++;visit(buoy);},forEachLivingWorldActor:()=>{livingVisits++;},
 missionIdentityOf:e=>e.data.missionTag,missionTargetSlotOf:e=>e.data.slot,stableEntityId:String,lowestVacantSlot:()=>0};
 const ops=loadOps('src/systems/missionSpawningOps.js','missionSpawningOps',deps);
 const ctx={state:{},_stampMissionTargetIdentity:(e,m,slot)=>{e.data.slot=slot;e.data.missionTag=m.id;}};
 assert.equal(ops._adoptLiveMissionTargets.call(ctx,m),1);assert.deepEqual(m.targetEntityIds,[77]);
 assert.equal(ops._adoptLiveMissionTargets.call(ctx,m),0);assert.deepEqual(m.targetEntityIds,[77]);
 assert.equal(payloadVisits,2);assert.equal(livingVisits,0);
 const old=mission();delete old.params.starterWorkdayVersion;ops._adoptLiveMissionTargets.call(ctx,old);assert.equal(livingVisits,1);
});
test('destroying the real buoy retains the ordinary failure and saved loss location',()=>{
 const m={...mission(),status:'active',targetEntityIds:[77]};const buoy={...starterBuoySpec(m,global),id:77};buoy.data.physicalRole='slag_core';
 const deps={PHYSICAL_TYPE_SET:new Set(['tow_recovery']),PHYSICAL_ROLE:{SLAG_CORE:'slag_core'},physicalRoleOf:e=>e?.data?.physicalRole,
 escortLossSite:(pos,sectorId)=>({sectorId,wreckPos:pos})};
 const ops=loadOps('src/systems/missionObjectiveOps.js','missionObjectiveOps',deps);
 const ctx={state:{missions:{active:[m]},entities:new Map([[77,buoy]]),world:{currentSectorId:m.destSectorId}},
 _stampPhysicalLossSite:ops._stampPhysicalLossSite,_failMission:(m,i,reason)=>{m.status='failed';m.failureReason=reason;}};
 ops._onPhysicalEntityDestroyed.call(ctx,{id:77,entity:buoy,pos:buoy.pos});
 assert.equal(m.status,'failed');assert.equal(m.failureReason,'core_lost');assert.deepEqual(JSON.parse(JSON.stringify(m)).params.lostWreckPos,buoy.pos);
});
test('actual mining owner credits any player Helios iron, not NPC, unknown, foreign or wrong ore',()=>{
 const ops=loadOps('src/systems/missionObjectiveOps.js','missionObjectiveOps',{
   starterMiningReceiptMatches,activeOwnedShip,shipCarriesModule:()=>true,CONTRACT_47A_B0_TAG:'b0',
 });
 const m={...mission('starter_hitch',1,'mining_quota'),status:'active',objectiveProgress:0,objectiveTarget:2};
 m.params.cmdtyId='cmdty_ore_iron';
 const state={playerId:5,player:{ownedShips:[{defId:'ship_kestrel'}],activeShipIndex:0},world:{currentSectorId:m.destSectorId},missions:{active:[m]}};
 let completed=0;
 const ctx={state,bus:{emit:()=>{}},_refreshTrackedMissionNav:()=>{},_storyTrigger:()=>{},_completeMission:()=>{completed++;m.status='completed';}};
 const yieldOre=(overrides={})=>ops._onMiningYield.call(ctx,{minerId:5,commodityId:'cmdty_ore_iron',qty:1,pos:{x:9000,z:9000},...overrides});
 for(const minerId of [6,undefined,null]) yieldOre({minerId});
 yieldOre({commodityId:'cmdty_ore_copper'});yieldOre({qty:Infinity});
 state.world.currentSectorId='sector_ceres_belt';yieldOre();
 assert.equal(m.objectiveProgress,0);
 state.world.currentSectorId=m.destSectorId;yieldOre();yieldOre();
 assert.equal(m.objectiveProgress,2);assert.equal(completed,1);
});
test('real payload index + identity stamp + physical role owner preserve one Continue carrier',()=>{
 const production=name=>src(`src/world/${name}.js`);
 const exportedFunction=(code,name)=>Function(`return (${code.match(new RegExp(`export function ${name}\\([^]*?\\n}`))[0].replace('export ', '')});`)();
 const views=Function(production('livingWorldViews').replace(/export /g,'')+';return {forEachJobInteractable,forEachLivingWorldActor};')();
 const missionIdentityOf=exportedFunction(production('worldRecords'),'missionIdentityOf');
 const missionTargetSlotOf=exportedFunction(src('src/systems/missions.js'),'missionTargetSlotOf');
 const lowestVacantSlot=exportedFunction(src('src/systems/missions.js'),'lowestVacantSlot');
 const physicalRoleOf=exportedFunction(src('src/systems/missions.js'),'physicalRoleOf');
 const PHYSICAL_ROLE={SLAG_CORE:'slag_core'};
 const deps={...views,missionIdentityOf,missionTargetSlotOf,lowestVacantSlot,physicalRoleOf,PHYSICAL_ROLE,
   PHYSICAL_TYPE_SET:new Set(['tow_recovery']),registerStarterBuoyTow,authoredStarterSite,starterBuoySpec,
   isCampaign47aB2Rescue:()=>false,stableEntityId:String,syncEntitySectorMembership:()=>{},
   sectorLocalToGlobalForSector:global,ashfallCacheApproachPos:()=>null,asteroidColliderRadius:(_,r)=>r};
 const spawning=loadOps('src/systems/missionSpawningOps.js','missionSpawningOps',deps);
 const objective=loadOps('src/systems/missionObjectiveOps.js','missionObjectiveOps',deps);
 for(const indexed of [true,false]){
   const m=JSON.parse(JSON.stringify(mission())); // missions restore clears transient target ids
   const buoy={...starterBuoySpec(m,global),id:177,alive:true};
   Object.assign(buoy.data,{physicalRole:'slag_core',worldRecordId:'wr_saved_buoy',identityKey:`mission:${m.id}:0`});
   // Reacquisition must use saved identity even when the runtime missionTag was omitted.
   delete buoy.data.missionTag;buoy.data.missionId=m.id;
   const foreign={...buoy,id:178,data:{...buoy.data,missionId:'unrelated'}};
   const state={world:{currentSectorId:m.destSectorId},entities:new Map([[177,buoy],[178,foreign]]),entityList:[buoy,foreign],
     entityIndex:{__spacefaceEntityIndexV1:true,ready:indexed,payloads:[buoy,foreign],shipLike:[],stations:[],wrecks:[],pickups:[]}};
   if(indexed) Object.defineProperty(state,'entityList',{get(){throw Error('must use payload index');}});
   let spawns=0;
   const ctx={state,_stampMissionTargetIdentity:spawning._stampMissionTargetIdentity,_countPhysicalRoles:objective._countPhysicalRoles,
     helpers:{spawnEntity:()=>{spawns++;throw Error('duplicate buoy spawn');}}};
   assert.equal(spawning._adoptLiveMissionTargets.call(ctx,m),1);
   assert.equal(spawning._adoptLiveMissionTargets.call(ctx,m),0);
   objective._spawnPhysicalTargetsFor.call(ctx,m,()=>()=>0.2,0,0);
   assert.deepEqual(m.targetEntityIds,[177]);assert.equal(spawns,0);
   assert.equal(state.entities.get(177),buoy);assert.equal(buoy.data.worldRecordId,'wr_saved_buoy');
   assert.equal(buoy.data.identityKey,`mission:${m.id}:0`);assert.equal(buoy.data.missionTargetSlot,0);
   assert.equal(buoy.type,'payload');assert.equal(buoy.data.packagedPropFile,'places/place_lane_beacon.glb');
 }
});
test('authored iron hint skips nearer ice and crystal using production ore-table definitions',()=>{
 const data=src('src/data/mining.js');
 const defs=Function('return '+data.match(/export const ASTEROIDS = ([^]*?\n\]);/)[1])();
 const m=mission('starter_hitch',1,'mining_quota');
 const rocks=['ast_icy','ast_crystalline','ast_metallic'].map((typeId,i)=>({id:i,type:'asteroid',alive:true,pos:global({x:600+i,z:-300}),data:{typeId,oreHP:10}}));
 assert.equal(starterMiningFocus(m,rocks,global,defs).targetEntityId,2);
 assert.equal(starterMiningFocus(m,rocks.slice(0,2),global,defs),null);
});
test('production physics normalization resolves explicit buoy masses rather than payload density mass',()=>{
 const code=src('src/core/physicsAuthority.js').replace(/^import[^]*?;\n/gm,'').replace(/export \{[^]*?\} from [^;]+;/g,'').replace(/export /g,'');
 const productionExport=(path,exp)=>Function(src(path).replace(/export /g,'')+`;return ${exp};`)();
 const materials=productionExport('src/data/physicsMaterials.js','PHYSICS_MATERIALS');
 const rockSubstanceFor=productionExport('src/data/rockSubstances.js','rockSubstanceFor');
 const resolve=Function('PHYSICS_MATERIALS','rockSubstanceFor',code+';return resolvePhysicsBodySpec;')(materials,rockSubstanceFor);
 for(const step of [1,2,3]){
   const e=starterBuoySpec(mission('starter_pelican',step),global);
   const body=resolve(e);
   assert.equal(body.mass,[40,65,90][step-1]);assert.equal(body.dynamic,true);assert.equal(body.ccd,true);
   assert.equal(body.radius,10);assert.ok(body.inertiaY>0);
 }
});
test('actual durable capture/normalize/restore preserves moved damaged buoy and rejects corrupt markers',()=>{
 const code=src('src/world/worldRecords.js').replace(/^import[^]*?;\n/gm,'').replace(/export /g,'');
 const deps={captureOrchardWorkDamage,starterBuoyRecordMarker,starterBuoyFromRecord,isStarterBuoyRecord,claimsTallyAssessor:()=>false,
   ceresWorkfleetRoleForEntity:()=>null,isCeresWorkfleetRecordIdentity:()=>false,
   SIM_TIER:{S0_EXACT:'S0_EXACT'},normalizeIntent:()=>null,SECTORS:[],SHIPS:[],PLANET_SITE:{}};
 const records=Function(...Object.keys(deps),code+';return {captureEntityRecord,normalizeRecord,spawnSpecFromRecord,bindEntityToRecord,missionIdentityOf,ensureWorldRecords,recordsForSector,entityIsDurableCandidate,upsertRecord,RECORD_KIND};')(...Object.values(deps));
 for(const step of [1,2,3]){
   const m=mission('starter_pelican',step);
   const e={...starterBuoySpec(m,global),alive:true,id:90,homeSectorId:m.destSectorId};
   Object.assign(e.data,{physicalRole:'slag_core',worldRecordId:`wr_buoy_${step}`,identityKey:`mission:${m.id}:0`,missionId:m.id});
   e.pos={x:321,z:-987};e.vel={x:-3,z:5};e.rot=1.2;e.angVel=0.5;e.hull=67;
   const viewSource=src('src/world/livingWorldViews.js');
   const captureViews=Function(viewSource.replace(/export /g,'')+';return {forEachLivingWorldActor,isLivingWorldActor,indexedTypeScan,registerEntityWorldRecordId};')();
   const worldSource=src('src/systems/world.js');
   const declaredViewBindings=worldSource.match(/import \{([^}]+)\} from '\.\.\/world\/livingWorldViews\.js';/)[1].split(',').map(x=>x.trim());
   for (const name of ['forEachLivingWorldActor','isLivingWorldActor','indexedTypeScan','registerEntityWorldRecordId']) {
     assert.ok(declaredViewBindings.includes(name),`world capture requires real import binding ${name}`);
   }
   assert.match(worldSource,/import \{ starterBuoyRecordMarker \} from '\.\.\/missions\/starterWorkday\.js';/);

   const start=worldSource.indexOf('  _captureSectorDurableRecords(sectorId, opts = {}) {');
   const method=worldSource.slice(start,worldSource.indexOf('\n  /**',start));
   const captureDeps={...records,...captureViews,starterBuoyRecordMarker,captureBolusRib:()=>{},TETHYS_BLACK_MARKET_RUN:{sectorId:'elsewhere',runId:'other-run'}};
   const capture=Function(...Object.keys(captureDeps),`return ({${method}})._captureSectorDurableRecords;`)(...Object.values(captureDeps));
   const ordinaryPayload={...e,id:91,data:{...e.data,starterWorkdayVersion:undefined,worldRecordId:'ordinary_payload'}};
   const captureState={world:{currentSectorId:m.destSectorId},entityList:[e,ordinaryPayload],entities:new Map([[90,e],[91,ordinaryPayload]]),
     entityIndex:{__spacefaceEntityIndexV1:true,ready:step!==2,payloads:[e,ordinaryPayload]}};
   const captureCtx={state:captureState,_destroyEntitiesAtIndices:()=>{}};
   const baselineMethod=readFileSync(new URL('./fixtures/world-capture-baseline.pinned.txt',import.meta.url),'utf8');
   const baselineCapture=Function(...Object.keys(captureDeps),`return ({${baselineMethod}})._captureSectorDurableRecords;`)(...Object.values(captureDeps));
   baselineCapture.call(captureCtx,m.destSectorId,{reason:'serialize'});
   assert.equal(Object.keys(captureState.world.records.byId).length,0); // baseline omits payload
   capture.call(captureCtx,m.destSectorId,{reason:'serialize'});
   capture.call(captureCtx,m.destSectorId,{reason:'serialize'});
   assert.equal(Object.keys(captureState.world.records.byId).length,1);
   const rec=captureState.world.records.byId[e.data.worldRecordId];
   assert.equal(rec.extra.starterWorkdayBuoy.step,step);
   const saved=records.normalizeRecord(JSON.parse(JSON.stringify(rec)));
   const restored=records.spawnSpecFromRecord(saved);
   records.bindEntityToRecord(restored,saved);
   assert.equal(restored.type,'payload');assert.equal(restored.data.worldRecordId,e.data.worldRecordId);
   assert.equal(restored.data.identityKey,e.data.identityKey);assert.equal(restored.data.physicalRole,'slag_core');
   assert.deepEqual(restored.pos,e.pos);assert.deepEqual(restored.vel,e.vel);assert.equal(restored.hull,67);
   assert.equal(restored.rot,1.2);assert.equal(restored.angVel,0.5);assert.equal(restored.physicsBody.mass,[40,65,90][step-1]);
   const fn=(name)=>Function(`return (${src('src/systems/missions.js').match(new RegExp(`export function ${name}\\([^]*?\\n}`))[0].replace('export ', '')});`)();
   const views=Function(src('src/world/livingWorldViews.js').replace(/export /g,'')+';return {forEachJobInteractable,forEachLivingWorldActor};')();
   const missionDeps={...views,authoredStarterSite,starterBuoySpec,missionIdentityOf:records.missionIdentityOf,
     missionTargetSlotOf:fn('missionTargetSlotOf'),lowestVacantSlot:fn('lowestVacantSlot'),physicalRoleOf:fn('physicalRoleOf'),
     PHYSICAL_ROLE:{SLAG_CORE:'slag_core'},PHYSICAL_TYPE_SET:new Set(['tow_recovery']),isCampaign47aB2Rescue:()=>false,
     stableEntityId:String,syncEntitySectorMembership:()=>{}};
   const spawning=loadOps('src/systems/missionSpawningOps.js','missionSpawningOps',missionDeps);
   const objective=loadOps('src/systems/missionObjectiveOps.js','missionObjectiveOps',missionDeps);
   Object.assign(restored,{id:191,alive:true});
   const state={world:{currentSectorId:m.destSectorId},entities:new Map([[191,restored]]),
     entityIndex:{__spacefaceEntityIndexV1:true,ready:true,payloads:[restored]}};
   const ctx={state,_stampMissionTargetIdentity:spawning._stampMissionTargetIdentity,_countPhysicalRoles:objective._countPhysicalRoles,
     helpers:{spawnEntity:()=>{throw Error('duplicate spawn after durable restore');}},
     bus:{emit:()=>{throw Error('unexpected reward/event replay');}}};
   assert.equal(spawning._adoptLiveMissionTargets.call(ctx,m),1);
   assert.equal(spawning._adoptLiveMissionTargets.call(ctx,m),0);
   objective._spawnPhysicalTargetsFor.call(ctx,m,()=>()=>0.2,999,999);
   assert.deepEqual(m.targetEntityIds,[191]);assert.equal(state.entities.get(191),restored);
   const again=records.captureEntityRecord({...restored,alive:true},{sectorId:m.destSectorId});
   assert.deepEqual(again.extra.starterWorkdayBuoy,saved.extra.starterWorkdayBuoy);
   for(const patch of [{step:4},{step:1.2},{version:2},{jobId:'starter_wasp'},{role:'tower'}]){
     const bad=structuredClone(saved);Object.assign(bad.extra.starterWorkdayBuoy,patch);
     assert.equal(records.normalizeRecord(bad).type,'ship');
     assert.equal(records.spawnSpecFromRecord(bad),null);
   }
   const foreign=structuredClone(saved);foreign.sectorId='sector_ceres_belt';assert.equal(records.spawnSpecFromRecord(foreign),null);
   const destroyed=structuredClone(saved);destroyed.alive=false;assert.equal(records.spawnSpecFromRecord(destroyed),null);
   const wrongType=structuredClone(saved);wrongType.type='ship';assert.equal(records.spawnSpecFromRecord(wrongType),null);
   const wrongKind=structuredClone(saved);wrongKind.kind='npc';assert.equal(records.spawnSpecFromRecord(wrongKind),null);
   const ordinary=structuredClone(saved);delete ordinary.extra.starterWorkdayBuoy;
   assert.equal(records.normalizeRecord(ordinary).type,'ship');
   assert.equal(records.spawnSpecFromRecord(ordinary).type,'ship');
 }
});
