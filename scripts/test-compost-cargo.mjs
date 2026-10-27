// Current-source owner composition. Defaults are production; sparse --*-source paths are explicit.
// Real cargo.jettison -> lootShards -> industrialBeam spawn; real mining/cargo pickup acceptance.
// Entity/bus ports and unrelated content are declared below. This is not a native GPU/save run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadClearanceGeometry } from './compost-clearance-geometry.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const auxRoots = process.argv.flatMap((arg, i, args) => arg === '--aux-root' ? [path.resolve(args[i + 1])] : []);
const clearanceGeometry = await loadClearanceGeometry({ root, auxRoots });
const arg = (flag, relative) => { const i=process.argv.indexOf(flag); return path.resolve(i<0?path.join(root,relative):process.argv[i+1]); };
const read = (flag, relative) => fs.readFileSync(arg(flag,relative),'utf8');
const strip = s => s.replace(/^import[\s\S]*?;[^\n]*\n/gm,'').replace(/^export\s*\{[^}]*\}\s*from[^;]*;[^\n]*\n/gm,'').replace(/\bexport\s+(?=const|function|class)/g,'').replace(/^export default [\s\S]*?;\s*$/gm,'');
function project(source,ports,names) { const context=vm.createContext({...ports}); vm.runInContext(strip(source)+'\n;this.api={'+names.join(',')+'};',context); return context.api; }
function between(source,start,end) { const i=source.indexOf(start),j=source.indexOf(end,i+start.length);assert(i>=0&&j>i,`current source boundary ${start}`);return source.slice(i,j); }
const data=await import(pathToFileURL(arg('--understory-data-source','src/data/factions/understory.js')));
const helperSource=read('--receiver-source','src/data/understoryReceiver.js');
const radius=project(between(helperSource,'export function gardenGrowthRadius(','\nexport function'),data,['gardenGrowthRadius']).gardenGrowthRadius;
const {COMMODITIES}=project(read('--commodities-source','src/data/commodities.js'),{COMMODITY_FLAVOR:{},COMMODITY_MORAL_TAGS:{}},['COMMODITIES']);
const identity=await import(pathToFileURL(arg('--identity-source','src/data/cargoIdentity.js')));
const pickup=await import(pathToFileURL(arg('--pickup-source','src/core/pickupAcceptance.js')));
const beamSource=read('--beam-source','src/combat/industrialBeam.js');
const beam=project(between(beamSource,'export function spawnPayloadEntity(','// -----------------------------------------------------------------------------\n// Sector Transition')+'\n'+between(beamSource,'function hasCanonicalEntityLifecycle(','// Presentation cue'),{},['spawnPayloadEntity']);
// Kill feature is enabled; gardens exit its real type guard. Volatile behavior is not exercised: ordinary iron has no volatile class. Native mass/volume/identity remain real.
const loot=project(read('--loot-source','src/systems/lootShards.js'),{...identity,...pickup,...beam,...data,gardenGrowthRadius:radius,COMMODITIES,volatileClassOf:()=>null,massline2Flag:()=>true},['lootShards','spawnJettisonedCargoPod','volatileThrowSpeedScale']);
const cargoModule=project(read('--cargo-source','src/systems/cargo.js'),{...pickup,...loot,COMMODITIES,PERSISTENT_CARGO:[],ANVIL_ORCHARD:{id:'anvil_storm_orchard'},combatFlag:()=>false},['cargo']);
const miningSource=read('--mining-source','src/systems/mining.js');
const miningMethods=between(miningSource,'  _collectPayload(payloadEntity, player) {','  _onPickupCollected(p) {')+'\n'+between(miningSource,'  _collectPickupViaEvent(pickup, player) {','  // Hull-burst overhaul slice A');
const mining=vm.runInNewContext('({'+miningMethods+'})',{...pickup,isCreditChipPickup:d=>d.kind==='credits'});
// Native current sector coordinates by default. The explicit local core-only port excludes unrelated frontier content.
let coordinate;
if(process.argv.includes('--core-sector-only')) {
 const core=await import(pathToFileURL(arg('--coordinate-core-source','src/core/coordinates.js')));
 coordinate=project(read('--coordinates-source','src/data/sectorCoordinates.js'),{...core,FRONTIER_ORIGINS:{},FRONTIER_SECTOR_IDS:[]},['sectorLocalToGlobalForSector']);
} else coordinate=await import(pathToFileURL(arg('--coordinates-source','src/data/sectorCoordinates.js')));
const receiver=project(helperSource,{...data,...coordinate},['UNDERSTORY_MASS_EPSILON','UNDERSTORY_RECEIVER','receiverPosition','firstPlayerGardenGrowth','gardenGrowthRadius','normalizePlayerGardenGrowth','hasUnderstoryGardenVisualIdentity']);
const gardenModule=project(read('--garden-source','src/systems/faction_understory.js'),{...data,...receiver,...clearanceGeometry},['understoryGardens','gardenEntities']);
// Load the actual catalog-station restore dependency closure. The source reader
// accepts the same explicit sparse roots; no constant-false identity substitute.
const catalogContext=vm.createContext({}),catalogModules=new Map();
function catalogModule(id) {
 if(!catalogModules.has(id)) {
  const file=[root,...auxRoots].map(r=>path.join(r,id)).find(fs.existsSync);
  assert.ok(file,`Missing catalog restore source ${id}`);
  catalogModules.set(id,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:catalogContext,identifier:id}));
 }
 return catalogModules.get(id);
}
const catalogEntry=catalogModule('src/save/catalogStationRestore.js');
await catalogEntry.link((specifier,ref)=>catalogModule(path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier),specifier))));
await catalogEntry.evaluate();
const catalogRestore=catalogEntry.namespace;
// Actual Save owner methods, with only allocator/entity ports and irrelevant world-ledger inputs adapted.
const saveSource=read('--save-source','src/save/saveSystem.js');
const saveHelpers=project(between(saveSource,'function clonePlain(v) {','function mergePlain(')+'\n'
 +between(saveSource,'function isUnsafePlainKey(key) {','function safeStringify(')+'\n'
 +between(saveSource,'function attachSavedActivity(entity, savedActivity) {','function sanitizeEntityFlagsForSave('),{},['clonePlain','attachSavedActivity']);
const saveMethods=vm.runInNewContext('({'+between(saveSource,'  _spawnPlayer(saved, entityIdRemap = null) {','  _applySavedVitals(saved) {')+'})',{
 ...catalogRestore,...saveHelpers,SAVE_IMPORT_MAX_PERSISTENT_ENTITIES:100000,RESTORE_YIELD_SLICE_MS:Infinity,nowMs:()=>0,
 worldLedgerHoldsId:()=>false,indexedWorldRecordEntity:()=>null});
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function setup(amount=17,startPlayerId=1) {
 const state={playerId:startPlayerId,player:{cargo:{items:{},capVolume:100,usedVolume:0,usedMass:0},credits:0},tick:10,simTime:10,entities:new Map(),entityList:[],missions:{active:[]}};
 let next=startPlayerId;const listeners=new Map(),events=[];
 const bus={on(n,f){const list=listeners.get(n)||[];list.push(f);listeners.set(n,list);return()=>{const i=list.indexOf(f);if(i>=0)list.splice(i,1)}},emit(n,p){events.push({name:n,p});for(const f of [...(listeners.get(n)||[])])f(p)}};
 const helpers={spawnEntity(spec){const e={id:next++,alive:true,vel:{x:0,z:0},...spec};state.entities.set(e.id,e);state.entityList.push(e);return e},removeEntity(id){const e=state.entities.get(id);if(!e)return false;e.alive=false;return true}};
 const player=helpers.spawnEntity({type:'ship',pos:{x:0,z:0},radius:10,rot:0,factionId:'player'});
 const garden=helpers.spawnEntity({type:'garden',pos:{x:0,z:0},radius:72,hull:100,factionId:'faction_understory',data:{understoryGarden:true,gardenId:'cargo-owner-test',gardenStage:1,gardenRadius:90,authoredUnderstoryReceiver:true}});
 const owner=Object.create(loot.lootShards),cargo=Object.create(cargoModule.cargo),miner=Object.assign(Object.create(mining),{state,bus});
 const ctx={state,bus,helpers,registry:{get:()=>null}};owner.init(ctx);cargo.init(ctx);
 // Mining's real pickup owner and cargo's real synchronous listener acquire ordinary iron.
 const ore=helpers.spawnEntity({type:'pickup',pos:{x:0,z:0},data:{kind:'ore',commodityId:'cmdty_ore_iron',amount}});
 const acceptance=miner._collectPickupViaEvent(ore,player);assert.equal(acceptance.accepted,amount);assert.equal(acceptance.legacyFullConsume,false);assert.equal(ore.alive,false);
 return {state,bus,helpers,events,player,garden,owner,cargo,miner,drop(qty=null){const before=state.entityList.length;const dumped=cargo.jettison('cmdty_ore_iron',qty);return {dumped,pod:state.entityList.slice(before).find(e=>e.type==='payload')}}};
}
test('real mining pickup -> hold -> jettison produces 13.6t contents in starter-compatible20t body',()=>{
 const h=setup(),{pod,dumped}=h.drop();assert.equal(dumped,17);assert.equal(h.state.player.cargo.items.cmdty_ore_iron,undefined);
 assert.equal(pod.mass,20);assert.equal(pod.physicsBody.mass,20);assert.equal(pod.flags.persistent,true);assert.equal(pod.data.worldRecordId,null);assert.equal(pod.ownerId,undefined);assert.equal(pod.data.ownerId,1);
 near(h.owner.gardenFeedMass(pod),13.6);assert.equal(pod.data.amount,17);near(h.owner.consumeByGarden(pod,h.garden),13.6);assert.equal(pod.data.amount,0);assert.equal(Object.keys(pod.data.salvagePool).length,0);
 assert.equal(h.owner.consumeByGarden(pod,h.garden),null);assert.equal(h.miner._collectPayload(pod,h.player),false);assert.equal(h.state.player.cargo.usedMass,0);assert.equal(h.state.player.credits,0);
 assert.equal(h.events.filter(e=>e.name==='economy:grantCredits'||e.name==='salvage:completed').length,0);
});
test('actual player producer origin survives ship transfer and repeated changed-id persistent restores',()=>{
 const h=setup(),{pod}=h.drop();assert.equal(pod.data.playerJettisonOrigin.ownerId,1);assert.equal(pod.data.playerJettisonOrigin.version,1);
 const nextShip=h.helpers.spawnEntity({type:'ship',pos:{...h.player.pos},radius:10,factionId:'player'});h.state.playerId=nextShip.id;
 near(h.owner.gardenFeedMass(pod),13.6);let current=pod;
 for(const id of [41,97]) {
  h.state.playerId=id;const restored=JSON.parse(JSON.stringify(current));h.state.entities.set(restored.id,restored);h.bus.emit('save:loaded',{});
  assert.equal(h.owner.gardenFeedMass(current),null);near(h.owner.gardenFeedMass(restored),13.6);current=restored;
 }
 near(h.owner.consumeByGarden(current,h.garden),13.6);assert.equal(h.owner.consumeByGarden(current,h.garden),null);
});
test('actual Save _spawnPlayer fresh-id and _spawnPersistentEntities preserve real producer custody twice',()=>{
 const h=setup(17,41),{pod}=h.drop();h.garden.flags={persistent:true};assert.equal(pod.data.playerJettisonOrigin.ownerId,41);
 let savedPlayer=JSON.parse(JSON.stringify(h.player)),savedBodies=JSON.parse(JSON.stringify([pod,h.garden]));
 let restoredPod,restoredGarden;
 for(let pass=0;pass<2;pass++) {
  h.state.entities.clear();h.state.entityList=[];h.state.playerId=0;h.state.nextEntityId=1;let nextId=1;
  const helpers={spawnEntity(spec){const id=Number.isSafeInteger(spec.id)&&spec.id>0&&!h.state.entities.has(spec.id)?spec.id:nextId++;
   const entity={...spec,id};h.state.entities.set(id,entity);h.state.entityList.push(entity);return entity;},
   removeEntity(id){h.state.entities.delete(id);h.state.entityList=h.state.entityList.filter(e=>e.id!==id)}};
  const saveOwner=Object.assign(Object.create(saveMethods),{state:h.state,helpers}),remap=new Map();h.state.sessionEntityIdRemap=remap;
  saveOwner._spawnPlayer(savedPlayer,remap);assert.equal(h.state.playerId,1);if(pass===0)assert.equal(remap.get('41'),1);
  assert.equal(saveOwner._spawnPersistentEntities(savedBodies,remap),2);h.bus.emit('save:loaded',{});
  restoredPod=h.state.entityList.find(e=>e.type==='payload');restoredGarden=h.state.entityList.find(e=>e.type==='garden');
  assert.equal(restoredPod.data.ownerId,41,'save deliberately does not remap payload owner mirrors');near(h.owner.gardenFeedMass(restoredPod),13.6);
  savedPlayer=JSON.parse(JSON.stringify(h.state.entities.get(h.state.playerId)));savedBodies=JSON.parse(JSON.stringify([restoredPod,restoredGarden]));
 }
 near(h.owner.consumeByGarden(restoredPod,restoredGarden),13.6);assert.equal(h.owner.consumeByGarden(restoredPod,restoredGarden),null);
 assert.equal(restoredPod.data.amount,0);assert.equal(h.state.player.cargo.usedMass,0);assert.equal(h.state.player.credits,0);
});
test('a genuine foreign pod cannot gain authority when its numeric owner collides with a restored player',()=>{
 const h=setup();const foreign=loot.spawnJettisonedCargoPod(h.state,{commodityId:'cmdty_ore_iron',amount:17,unitMass:.8,ownerId:41,pos:{...h.garden.pos}},h.helpers);
 assert.equal(foreign.data.playerJettisonOrigin,undefined);h.state.sessionEntityIdRemap=new Map([['41',h.state.playerId],['player',h.state.playerId]]);
 assert.equal(h.owner.gardenFeedMass(foreign),null,'session alias never authorizes a foreign body');h.state.playerId=41;
 const restored=JSON.parse(JSON.stringify(foreign));h.state.entities.set(restored.id,restored);h.bus.emit('save:loaded',{});
 assert.equal(h.owner.gardenFeedMass(restored),null);assert.equal(h.owner.consumeByGarden(restored,h.garden),null);assert.equal(restored.data.amount,17);
});
test('legacy unstamped pods remain ordinary pickups and acquire provenance only by real re-jettison',()=>{
 const h=setup(),{pod}=h.drop();delete pod.data.playerJettisonOrigin;assert.equal(h.owner.gardenFeedMass(pod),null);
 assert.equal(h.miner._collectPayload(pod,h.player),true);assert.equal(h.state.player.cargo.items.cmdty_ore_iron,17);
 const replacement=h.drop().pod;assert.equal(replacement.data.playerJettisonOrigin.ownerId,h.state.playerId);near(h.owner.gardenFeedMass(replacement),13.6);
});
test('a1u iron pod feeds only0.8t, never its20t physics floor',()=>{const h=setup(1),{pod}=h.drop();assert.equal(pod.mass,20);near(h.owner.consumeByGarden(pod,h.garden),.8)});
test('partial actual pickup reduces all mirrors; only remaining9.6t can be eaten',()=>{
 const h=setup(),{pod}=h.drop();h.state.player.cargo.capVolume=5;assert.equal(h.miner._collectPayload(pod,h.player),true);
 assert.equal(h.state.player.cargo.items.cmdty_ore_iron,5);assert.equal(pod.data.amount,12);assert.equal(pod.data.salvagePool.cmdty_ore_iron,12);near(h.owner.gardenFeedMass(pod),9.6);near(h.owner.consumeByGarden(pod,h.garden),9.6);
 h.state.player.cargo.capVolume=100;assert.equal(h.miner._collectPayload(pod,h.player),false);assert.equal(h.state.player.cargo.items.cmdty_ore_iron,5);
});
test('complete actual pickup wins custody: no later garden food',()=>{const h=setup(),{pod}=h.drop();assert.equal(h.miner._collectPayload(pod,h.player),true);assert.equal(pod.alive,false);assert.equal(h.owner.gardenFeedMass(pod),null);assert.equal(h.owner.consumeByGarden(pod,h.garden),null);assert.equal(h.state.player.cargo.items.cmdty_ore_iron,17)});
test('real sealed reservation refuses jettison; only surplus is available',()=>{
 const h=setup();h.state.missions.active=[{status:'active',preloadedCargo:true,params:{cmdtyId:'cmdty_ore_iron',qty:10}}];
 assert.equal(h.drop(17).dumped,0);assert.equal(h.state.player.cargo.items.cmdty_ore_iron,17);const {dumped,pod}=h.drop();assert.equal(dumped,7);assert.equal(h.state.player.cargo.items.cmdty_ore_iron,10);near(h.owner.gardenFeedMass(pod),5.6);
});
test('persistent body snapshot after partial pickup retains only the real remainder; after feed none can replay',()=>{
 const h=setup(),{pod}=h.drop();h.state.player.cargo.capVolume=5;h.miner._collectPayload(pod,h.player);
 // Same documented persistent entity shape used by Save/Continue; JSON only, not full saveSystem execution.
 const restored=JSON.parse(JSON.stringify(pod));h.state.entities.set(pod.id,restored);h.bus.emit('save:loaded',{});
 assert.equal(h.owner.gardenFeedMass(pod),null);near(h.owner.gardenFeedMass(restored),9.6);near(h.owner.consumeByGarden(restored,h.garden),9.6);
 const terminal=JSON.parse(JSON.stringify(restored));h.state.entities.set(terminal.id,terminal);h.bus.emit('save:loaded',{});assert.equal(h.owner.gardenFeedMass(terminal),null);assert.equal(h.owner.consumeByGarden(terminal,h.garden),null);
});
test('frozen quantity mirrors clear through shared pickup writer without lost credit or replay',()=>{const h=setup(),{pod}=h.drop();pod.data.salvagePool=Object.freeze(pod.data.salvagePool);pod.data.richLotSource=Object.freeze({richQty:17,lotQty:17});near(h.owner.consumeByGarden(pod,h.garden),13.6);assert.equal(pod.data.richLotSource.richQty,0);assert.equal(pod.data.richLotSource.lotQty,0);assert.equal(Object.keys(pod.data.salvagePool).length,0);assert.equal(h.owner.gardenFeedMass(pod),null)});
function liveReceiver(h) {
 h.state.entities.delete(h.garden.id);h.state.entityList=h.state.entityList.filter(e=>e!==h.garden);
 Object.assign(h.state,{world:{currentSectorId:receiver.UNDERSTORY_RECEIVER.sectorId},run:{kind:'adventure'},rng:()=>.25});
 const owner=Object.create(gardenModule.understoryGardens);
 owner.init({state:h.state,bus:h.bus,helpers:h.helpers,registry:{get:name=>name==='lootShards'?h.owner:null}});
 h.bus.emit('sector:enter',{});const garden=gardenModule.gardenEntities(h.state)[0];assert(garden);
 h.player.pos={x:garden.pos.x+140,z:garden.pos.z};
 return {owner,garden};
}
function acquireOre(h,amount) {
 const ore=h.helpers.spawnEntity({type:'pickup',pos:{...h.player.pos},data:{kind:'ore',commodityId:'cmdty_ore_iron',amount}});
 const acceptance=h.miner._collectPickupViaEvent(ore,h.player);assert.equal(acceptance.accepted,amount);
}
test('real17u jettison enters actual authored receiver once:60.16 biomass/stage2,13.6/240, no early pay',()=>{
 const h=setup(),{owner,garden}=liveReceiver(h),{pod}=h.drop();
 assert.equal(garden.data.gardenBiomass,52);assert.equal(garden.data.compostFedMass,0);
 h.state.player.tether={active:true,targetId:pod.id};pod.pos={x:garden.pos.x+100,z:garden.pos.z};
 owner.update(1/60,h.state);assert.equal(pod.alive,false);assert.equal(pod.data.amount,0);assert.equal(Object.keys(pod.data.salvagePool).length,0);
 near(garden.data.gardenBiomass,60.16);assert.equal(garden.data.gardenStage,2);near(garden.data.compostFedMass,13.6);
 assert.equal(h.events.filter(e=>e.name==='understory:gardenFed'&&e.p.eatenId===pod.id).length,1);
 assert.equal(h.events.filter(e=>e.name==='understory:playerGrowth').length,1);near(receiver.firstPlayerGardenGrowth(h.state).fedMass,13.6);
 const saved=JSON.parse(JSON.stringify(garden));h.state.entities.set(saved.id,saved);h.state.entityList=h.state.entityList.map(e=>e===garden?saved:e);
 const own=owner.serialize();owner.deserialize(own);h.bus.emit('save:loaded',{});owner.update(1/60,h.state);
 near(saved.data.gardenBiomass,60.16);near(saved.data.compostFedMass,13.6);assert.equal(gardenModule.gardenEntities(h.state).length,1);
 assert.equal(h.events.filter(e=>e.name==='understory:gardenFed'&&e.p.eatenId===pod.id).length,1);
 assert.equal(h.events.filter(e=>e.name==='economy:grantCredits').length,0);assert.equal(h.state.player.cargo.usedMass,0);
});
test('actual destroyed receiver stays dead through owner Continue and rejected loads; real second pod regrows from zero',()=>{
 const h=setup(),{owner,garden}=liveReceiver(h),{pod}=h.drop();h.state.player.tether={active:true,targetId:pod.id};pod.pos={x:garden.pos.x+100,z:garden.pos.z};owner.update(1/60,h.state);
 garden.hull=0;garden.alive=false;h.bus.emit('entity:killed',{id:garden.id,entity:garden});
 const saved=owner.serialize();assert.equal(saved.authoredReceiver.status,'destroyed');owner.deserialize(JSON.parse(JSON.stringify(saved)));h.bus.emit('save:loaded',{});
 owner.update(1/60,h.state);assert.equal(gardenModule.gardenEntities(h.state).length,0);
 acquireOre(h,17);const second=h.drop().pod;h.state.player.tether={active:true,targetId:second.id};second.pos={x:garden.pos.x+100,z:garden.pos.z};
 second.data.ownerId=2;owner.update(1/60,h.state);assert.equal(gardenModule.gardenEntities(h.state).length,0);assert.equal(second.data.amount,17);
 second.data.ownerId=1;second.pos.x+=1000;owner.update(1/60,h.state);assert.equal(gardenModule.gardenEntities(h.state).length,0);
 second.pos.x-=1000;owner.update(1/60,h.state);const regrown=gardenModule.gardenEntities(h.state)[0];assert(regrown);assert.equal(second.alive,false);
 near(regrown.data.gardenBiomass,8.16);near(regrown.data.compostFedMass,27.2);assert.equal(regrown.data.gardenStage,1);assert.equal(regrown.data.gardenRegrowth,true);
 assert.equal(regrown.data.gardenFirstPlayerGrowth.eatenId,pod.id);assert.equal(h.events.filter(e=>e.name==='understory:gardenFed'&&e.p.eatenId===second.id).length,1);
 owner.update(1/60,h.state);assert.equal(gardenModule.gardenEntities(h.state).length,1);near(regrown.data.compostFedMass,27.2);assert.equal(h.events.filter(e=>e.name==='economy:grantCredits').length,0);
});
const protectedData=['missionId','missionTag','missionPinned','wreckMissionId','persistenceOwner','runtimeOwner','worldRecordId','identityKey','resourceBodyId','worldSiteId','worldSitePayloadId','worldSiteStructural','worldObjectId','siteId','activityObjectSlotId','durable','claimId','claimedBy','custodyOwner','freightCustodyPod','freightCustody','caughtByNet','contractClaimSiteOf','salvorClaimedBy','recoveryEncounterId','survivorPod','storyPropKind','authored','authoredCharacter','uniqueWreckId','authoredWreckId','poiId','protected','anchored','interventionId','onboarding','worldOneOff','oneOffId','berthConsign','originId','destinationId','originStationId','destStationId','physicalCustodyOnly','orchardId','alienSiteId','fieldId','markerId','provenance','claimable','living','playerOwned','persistent','arenaShardOf','reefMineId','reefMine'];
for(const key of protectedData)test(`protected ${key} does not disappear`,()=>{const h=setup(),{pod}=h.drop();pod.data[key]='protected';assert.equal(h.owner.gardenFeedMass(pod),null);assert.equal(h.owner.consumeByGarden(pod,h.garden),null);assert.equal(pod.data.amount,17);assert.equal(pod.alive,true)});
for(const key of ['missionPinned','durable','invuln','protected'])test(`protected flag ${key} refuses`,()=>{const h=setup(),{pod}=h.drop();pod.flags[key]=true;assert.equal(h.owner.consumeByGarden(pod,h.garden),null)});
for(const [name,mutate] of [
 ['foreign owner',p=>{p.data.ownerId=2}],['invalid origin',p=>{p.data.playerJettisonOrigin={version:1,ownerId:NaN}}],['wrong origin version',p=>{p.data.playerJettisonOrigin={version:2,ownerId:1}}],['foreign entity owner',p=>{p.ownerId=2}],['foreign ownership mirror',p=>{p.data.ownership.ownerId=2}],['foreign identity',p=>{p.data.cargoIdentity={...p.data.cargoIdentity,ownerId:'2'}}],
 ['civilian manifest',p=>{p.data.payloadType='civilian_manifest'}],['missing jettison stamp',p=>{delete p.data.jettisonedCargo}],['world cargo identity',p=>{p.data.cargoIdentity={...p.data.cargoIdentity,destinationId:'station_elsewhere'}}],
 ['empty units',p=>{p.data.amount=0}],['fractional units',p=>{p.data.amount=1.5}],['nonfinite units',p=>{p.data.amount=Infinity}],['unknown commodity',p=>{p.data.commodityId='cmdty_unknown'}],['mismatched pool',p=>{p.data.salvagePool.cmdty_ore_iron=18}],['multicommodity pool',p=>{p.data.salvagePool.cmdty_scrap_metal=1}],['insufficient body mass',p=>{p.mass=1}],['destroyed hull',p=>{p.hull=0}],['dead body',p=>{p.alive=false}],['frozen data',p=>{Object.freeze(p.data)}],
])test(`${name} rejects actual pod without granting food`,()=>{const h=setup(),{pod}=h.drop();mutate(pod);assert.equal(h.owner.gardenFeedMass(pod),null);assert.equal(h.owner.consumeByGarden(pod,h.garden),null);assert.equal(h.state.player.credits,0)});
test('nonfinite intake radius and lethal receiver integrity reject without clearing contents',()=>{const h=setup(),{pod}=h.drop();pod.radius=Infinity;assert.equal(h.owner.consumeByGarden(pod,h.garden),null);pod.radius=3;h.garden.hull=0;assert.equal(h.owner.consumeByGarden(pod,h.garden),null);assert.equal(pod.data.amount,17)});
test('recycled object and invalid/outside/dead garden cannot consume',()=>{const h=setup(),{pod}=h.drop();assert.equal(h.owner.gardenFeedMass({...pod}),null);pod.pos.x=1000;assert.equal(h.owner.consumeByGarden(pod,h.garden),null);pod.pos.x=0;assert.equal(h.owner.consumeByGarden(pod,{...h.garden}),null);h.garden.alive=false;assert.equal(h.owner.consumeByGarden(pod,h.garden),null);assert.equal(pod.data.amount,17)});
console.log(`PASS ${passed} compost cargo owner cases (explicit source composition; no full-save/GPU claim)`);
