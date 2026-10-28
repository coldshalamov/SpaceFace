// Current production imports by default. Sparse paths/core-only frontier port are explicit local evidence.
// node --experimental-vm-modules scripts/test-compost-receiver.mjs
import assert from 'node:assert/strict';
import { loadClearanceGeometry } from './compost-clearance-geometry.mjs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const aux = process.argv.flatMap((s,i,a) => s === '--aux-root' ? [path.resolve(a[i+1])] : []);
const coreOnly = process.argv.includes('--core-sector-only');
const geometry = await loadClearanceGeometry({root,auxRoots:aux});
const geometryExports = {
 'src/data/collisionProxyManifests.js':['hullEnvelopeWu','proxyOuterRadiusWu','COLLISION_PROXY_MANIFESTS'],
 'src/data/modelTruth.js':['modelTruthProxyManifest'],
 'src/core/physicsAuthority.js':['shouldSyncPhysicsBodyEntity','substanceFor'],
 'src/data/physicsMaterials.js':['PHYSICS_MATERIALS'],
};
const context = vm.createContext({ console, structuredClone, Map, Set, Object, Array, Math, Number });
const cache = new Map();
function source(name) {
  const filename = [root,...aux].map(p => path.join(p,name)).find(p => fs.existsSync(p));
  assert(filename, `Missing ${name}; use explicit --aux-root only for qualified sparse evidence`);
  const value = fs.readFileSync(filename,'utf8');
  console.log(JSON.stringify({ path:name, filename, sha256:createHash('sha256').update(value).digest('hex') }));
  return value;
}
function mod(name) {
  if(cache.has(name))return cache.get(name);
  let m;
  if (geometryExports[name]) {
    m = new vm.SyntheticModule(geometryExports[name],function(){for(const key of geometryExports[name])this.setExport(key,geometry[key]);},{context,identifier:name});
  } else if(coreOnly && name === 'src/data/frontierRegions/index.js') {
    m = new vm.SyntheticModule(['FRONTIER_ORIGINS','FRONTIER_SECTOR_IDS'],function(){this.setExport('FRONTIER_ORIGINS',{});this.setExport('FRONTIER_SECTOR_IDS',[]);},{context,identifier:name});
  } else m = new vm.SourceTextModule(source(name),{context,identifier:name});
  cache.set(name,m);return m;
}
const entry = new vm.SourceTextModule(`import * as G from './src/systems/faction_understory.js'; import * as R from './src/data/understoryReceiver.js'; import * as C from './src/save/catalogStationRestore.js'; export {G,R,C};`,{context,identifier:'entry.mjs'});
await entry.link((s,r)=>mod(path.posix.normalize(path.posix.join(path.posix.dirname(r.identifier),s))));await entry.evaluate();
const {G,R,C}=entry.namespace;
function boot() {
 let id=1;
 const state={tick:10,simTime:10,rng:()=>.5,mode:'flight',run:{kind:'adventure'},playerId:999,player:{},entities:new Map(),entityList:[],world:{currentSectorId:R.UNDERSTORY_RECEIVER.sectorId}};
 const events=[],subs=new Map();
 const bus={on(n,f){const l=subs.get(n)||[];l.push(f);subs.set(n,l);return()=>{}},emit(n,p){events.push({name:n,...p});for(const f of subs.get(n)||[])f(p)}};
 const helpers={spawnEntity(spec){const e={id:id++,alive:true,...spec};state.entities.set(e.id,e);state.entityList.push(e);bus.emit('entity:spawned',{id:e.id,type:e.type,entity:e});return e},removeEntity(n){const e=state.entities.get(n);if(e)e.alive=false}};
 const systems=new Map();const owner=Object.create(G.understoryGardens);owner.init({state,bus,helpers,registry:{get:n=>systems.get(n)}});
 bus.emit('sector:enter',{});
 const garden=R.receiverStatus(state).garden;assert(garden);
 const feed=(mass=16,player=true,data={},type='wreck')=>{const e=helpers.spawnEntity({type,pos:{...garden.pos},vel:{x:0,z:0},radius:10,mass,hull:20,data});state.player.tether=player?{active:true,targetId:e.id}:null;owner.update(1/60,state);state.player.tether=null;state.tick++;return e;};
 return {state,events,bus,helpers,systems,owner,garden,feed};
}
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
const payments=h=>h.events.filter(e=>e.name==='economy:grantCredits');
const plain=x=>JSON.parse(JSON.stringify(x));
test('authored receiver appears once without a kill and never grants initial ecology credit',()=>{const h=boot();for(let i=0;i<4;i++){h.bus.emit('sector:enter',{});h.owner.update(1/60,h.state)}assert.equal(G.gardenEntities(h.state).length,1);assert.equal(h.garden.data.gardenBiomass,52);assert.equal(h.garden.data.compostFedMass,0);assert.equal(payments(h).length,0);assert.equal(h.garden.data.placeId,'place_dead_hulk');assert.equal(h.garden.type,'garden');});
test('16 actual tonnes cross the unchanged60 threshold and preserve honest16/240',()=>{const h=boot();const prey=h.feed();assert.equal(prey.alive,false);assert.equal(h.garden.data.gardenBiomass,61.6);assert.equal(h.garden.data.gardenStage,2);assert.equal(h.garden.radius,R.UNDERSTORY_RECEIVER.hullPhysicsReferenceRadius);assert.equal(h.garden.data.gardenRadius,140);assert.equal(h.garden.data.compostFedMass,16);assert(R.firstPlayerGardenGrowth(h.state));assert.equal(payments(h).length,0);h.owner.update(1/60,h.state);assert.equal(h.garden.data.compostFedMass,16);assert.equal(h.events.filter(e=>e.name==='understory:playerGrowth').length,1);});
test('partial run and actual biomass survive transient reset, pay once at240, later feeding never repays',()=>{const h=boot();h.feed(120);const saved=plain(h.garden);h.state.understory=undefined;Object.assign(h.garden,saved);h.feed(120);assert.equal(h.garden.data.compostFedMass,240);assert.equal(h.garden.data.gardenBiomass,196);assert.equal(payments(h).length,1);assert.equal(payments(h)[0].amount,2880);h.state.understory=undefined;h.feed(240);assert.equal(payments(h).length,1);assert.equal(h.garden.data.compostFedMass,240);});
test('oversized closing delivery pays its whole actual run, not a fabricated cap',()=>{const h=boot();h.feed(250);assert.equal(payments(h)[0].amount,3000);assert.equal(h.garden.data.compostFedMass,250)});
test('legacy completed garden never repays despite missing partial mass',()=>{const h=boot();delete h.garden.data.compostFedMass;h.garden.data.compostRunComplete=true;h.feed(240);assert.equal(payments(h).length,0)});
test('NPC drift cannot fill authored receiver before pilot; ordinary death-garden ambient ecology still grows without player receipt',()=>{const h=boot();const npc=h.feed(150,false);assert.equal(npc.alive,true);assert.equal(h.garden.data.gardenBiomass,52);const other=G.spawnGarden(h.state,h.helpers,{x:0,z:0,gardenId:'ambient'});h.helpers.spawnEntity({type:'wreck',mass:100,radius:1,pos:{x:0,z:0},data:{}});h.owner.update(1/60,h.state);assert.equal(other.data.gardenStage,2);assert.equal(other.data.gardenFirstPlayerGrowth,undefined);assert.equal(R.firstPlayerGardenGrowth(h.state),null)});
test('mission/resource/site/persistent/foreign bodies remain intact; ephemeral loose material remains food',()=>{const h=boot();for(const data of [{missionPinned:true},{missionId:'m'},{missionTag:'x'},{worldRecordId:'x'},{resourceBodyId:'x'},{fieldId:'f'},{worldSiteId:'x'},{worldObjectId:'x'},{siteId:'x'},{activityObjectSlotId:'x'},{claimId:'x'},{ownerId:7},{persistenceOwner:'foreign'},{markerId:'wrong'},{survivorPod:true},...['runtimeOwner','wreckMissionId','identityKey','worldSitePayloadId','freightCustody','caughtByNet','contractClaimSiteOf','salvorClaimedBy','recoveryEncounterId','physicalCustodyOnly','orchardId','arenaShardOf','reefMineId','reefMine'].map(k=>({[k]:'owned'}))]){const p=h.feed(16,true,data);assert.equal(p.alive,true,JSON.stringify(data))}const p=h.helpers.spawnEntity({type:'wreck',mass:16,hull:10,pos:{...h.garden.pos},radius:1,flags:{persistent:true},data:{}});h.state.player.tether={targetId:p.id};h.owner.update(1/60,h.state);assert.equal(p.alive,true);assert.equal(h.feed().alive,false)});
test('canonical owner must authorize exact body before removal and may refuse; absent owner fails closed',()=>{const h=boot();const data={persistenceOwner:'aftermathWrecks',markerId:'m'};assert.equal(h.feed(16,true,{...data}).alive,true);h.systems.set('aftermathWrecks',{consumeByGarden:()=>false});assert.equal(h.feed(16,true,{...data}).alive,true);let live=false;h.systems.set('aftermathWrecks',{consumeByGarden:(prey,g)=>{live=prey.alive&&g===h.garden;return true}});const p=h.feed(16,true,{...data});assert(live);assert.equal(p.alive,false)});
test('missing player identity or inactive tether gives no player credit',()=>{const h=boot();h.state.playerId=null;assert.equal(h.feed().alive,true);h.state.playerId=999;const p=h.helpers.spawnEntity({type:'wreck',mass:16,pos:{...h.garden.pos},radius:1,data:{}});h.state.player.tether={targetId:p.id,active:false};h.owner.update(1/60,h.state);assert.equal(p.alive,true)});
test('wrong-sector arrival does not duplicate; absent bound live receiver never silently respawns',()=>{const h=boot();h.state.world.currentSectorId='sector_helios_prime';h.bus.emit('sector:enter',{});h.state.world.currentSectorId=R.UNDERSTORY_RECEIVER.sectorId;h.bus.emit('sector:enter',{});assert.equal(G.gardenEntities(h.state).length,1);h.garden.alive=false;h.owner.update(1/60,h.state);assert.equal(G.gardenEntities(h.state).length,0);assert.equal(R.receiverStatus(h.state).status,'unavailable')});
test('actual lethal receiver transition retains terminal evidence, arbitrary event does not kill it',()=>{const h=boot();h.feed();h.bus.emit('entity:killed',{id:h.garden.id,type:'garden'});assert.equal(h.state.understory.authoredReceiver.status,'live');h.garden.alive=false;h.garden.hull=0;h.bus.emit('entity:killed',{id:h.garden.id,type:'garden',entity:h.garden});assert.equal(R.receiverStatus(h.state).status,'destroyed');assert(R.firstPlayerGardenGrowth(h.state));h.owner.update(1/60,h.state);assert.equal(G.gardenEntities(h.state).length,0)});
test('save restoring defers authored spawn until ordinary saved body adoption',()=>{const h=boot();h.feed();const data=plain(h.garden);h.bus.emit('save:restoring',{});h.state.entities.clear();h.state.entityList=[];h.state.understory=undefined;h.bus.emit('sector:enter',{});assert.equal(G.gardenEntities(h.state).length,0);const restored=h.helpers.spawnEntity({...data,id:42});h.bus.emit('save:loaded',{});h.owner.update(1/60,h.state);assert.equal(G.gardenEntities(h.state).length,1);assert.equal(R.receiverStatus(h.state).garden,restored);assert.equal(restored.data.compostFedMass,16);assert.equal(R.firstPlayerGardenGrowth(h.state).entityId,42)});
test('New Game clears authored lifecycle and starts zero player credit, not an old receiver',()=>{const h=boot();h.feed();h.state.entities.clear();h.state.entityList=[];h.bus.emit('game:started',{});h.bus.emit('sector:enter',{});const g=R.receiverStatus(h.state).garden;assert(g);assert.notEqual(g,h.garden);assert.equal(g.data.gardenBiomass,52);assert.equal(g.data.compostFedMass,0)});
console.log(`PASS ${passed} compost receiver owner groups; ${coreOnly?'explicit core-frontier sparse port':'current native data graph'}. Not native physics/full save/browser acceptance.`);

// Save-owner integration: execute the current complete capture plan, sync/stepped capture and
// persistent-entity serializer/reconstructor. Only unrelated subsystem ports are no-op adapters.
// The full browser restore scheduler/native physics are NOT replaced or claimed by this probe.
const saveSource=source('src/save/saveSystem.js');
function method(name){const start=saveSource.indexOf(`  ${name}(`);assert(start>=0,name);const end=saveSource.indexOf('\n  },',start);assert(end>start,name);return saveSource.slice(start,end+5)}
function fn(name){const start=saveSource.indexOf(`function ${name}(`);assert(start>=0,name);return saveSource.slice(start,saveSource.indexOf('\n}',start)+2)}
const savePorts={console,Map,Set,Object,Array,Number,Math,
 isRestoredCatalogStation:C.isRestoredCatalogStation,restoredCatalogStation:C.restoredCatalogStation,bindRestoredCatalogStation:C.bindRestoredCatalogStation,
 pendingStuntBodyIds:()=>new Set(),pendingProjectileBodyIds:()=>[],ceresWorkfleetHostileAttachmentOwners:()=>new Map(),ceresWorkfleetEntityRef:()=>null,ceresWorkfleetRefKey:()=>{throw Error('unexpected Ceres port')},
 captureIndustrialDisasters:()=>null,serializeCombatState:()=>null,serializeShipLedgerBoard:()=>null,
 rigWorkshopSavePlanEntry:()=>['rigWorkshop',()=>null],captureRigWorkshopSaveSlot:d=>{d.rigWorkshop=null},
 shipbreakingYardSavePlanEntry:()=>['shipbreakingYard',()=>null],serializeShipbreakingYardSteps:function*(self,d){d.shipbreakingYard=null;yield 'serialize:shipbreakingYard'},
 indexedWorldRecordEntity:()=>{throw Error('unexpected world-record port')},worldLedgerHoldsId:()=>false,nowMs:()=>0,
 SAVE_IMPORT_MAX_PERSISTENT_ENTITIES:10000,RESTORE_YIELD_SLICE_MS:8};
const saveContext=vm.createContext(savePorts);
const constants=['TRANSIENT_ENTITY_SAVE_KEYS','TRANSIENT_ENTITY_FLAGS','TRANSIENT_PLAYER_FLAGS','BOOST_SIM_STATE_KEYS'].map(n=>{const start=saveSource.indexOf(`const ${n} = `);return saveSource.slice(start,saveSource.indexOf(';',start)+1)}).join('\n');
const functions=['plainEntity','shouldSkipEntitySaveKey','attachSavedActivity','sanitizeEntityFlagsForSave','sanitizeBoostForSave','clonePlain','isUnsafePlainKey'].map(fn).join('\n');
const saveMethods=vm.runInContext(`${constants}\n${functions}\n({${['_saveCapturePlan','serializeData','*_serializeDataSteps','_serializeEntities','_callSerialize','_spawnPersistentEntities'].map(method).join('\n')}})`,saveContext);
function saveOwner(h){return new Proxy({...saveMethods,state:h.state,helpers:h.helpers,registry:{get:n=>n==='understoryGardens'?h.owner:null}},{get(t,k){if(k in t)return t[k];if(typeof k==='string'&&k.startsWith('_serialize'))return()=>null;return undefined}})}
function capture(h){const so=saveOwner(h),sync=plain(so.serializeData()),plan=Object.fromEntries(so._saveCapturePlan().map(([key,read])=>[key,read()]));assert.deepEqual(plain(plan),sync);assert.equal(JSON.stringify(plan),JSON.stringify(sync),'capture-plan byte/key-order parity');const steps=so._serializeDataSteps();let r;const labels=[];while(!(r=steps.next()).done)labels.push(r.value);assert.deepEqual(plain(r.value),sync);assert.equal(JSON.stringify(r.value),JSON.stringify(sync),'stepped byte/key-order parity');assert(labels.includes('serialize:understoryGardens'));return sync}
// Lock the actual source ordering; a projection must not quietly assume this lifecycle.
const open=method('_openRestoreSession'),chunks=method('*_restoreChunks');
assert(open.includes("this.bus.emit('save:restoring'"));
const order=["this._spawnPlayer(savedPlayer, entityIdRemap)","this._callDeserialize('understoryGardens', data.understoryGardens)","worldSys.enterSectorChunked(","this._spawnPersistentEntities(","this.bus.emit('save:loaded'"];
let last=-1;for(const marker of order){const at=chunks.indexOf(marker);assert(at>last,`restore order: ${marker}`);last=at}
function restore(h,data,{occupySavedId=false}={}){h.bus.emit('save:restoring',{});h.state.entities.clear();h.state.entityList=[];h.state.playerId=777;h.state.nextEntityId=1000;h.owner.deserialize(data.understoryGardens);h.bus.emit('sector:enter',{});assert.equal(G.gardenEntities(h.state).length,0,'no transient absent-body respawn');if(occupySavedId){const id=data.entities.persistent[0].id;const e={id,type:'ship',alive:true,flags:{},data:{}};h.state.entities.set(id,e);h.state.entityList.push(e)}const remap=new Map();saveOwner(h)._spawnPersistentEntities(data.entities.persistent,remap);h.bus.emit('save:loaded',{});return remap}
test('actual save capture-plan/synchronous/stepped byte parity and persistent reconstruction retain first growth/partial run with rebound id',()=>{const h=boot();h.feed();const saved=capture(h),oldId=h.garden.id;const map=restore(h,saved,{occupySavedId:true});const g=R.receiverStatus(h.state).garden;assert(g);assert.notEqual(g.id,oldId);assert.equal(map.get(String(oldId)),g.id);assert.equal(g.data.compostFedMass,16);assert.equal(g.data.gardenBiomass,61.6);assert.equal(R.firstPlayerGardenGrowth(h.state).entityId,g.id);assert.equal(G.gardenEntities(h.state).length,1);assert.equal(payments(h).length,0);capture(h)});
test('actual killed receiver omitted by persistent serializer; terminal Continue preserves loss without52 subsidy or payment',()=>{const h=boot();h.feed();h.garden.alive=false;h.garden.hull=0;h.bus.emit('entity:killed',{id:h.garden.id,entity:h.garden});const saved=capture(h);assert.equal(saved.entities.persistent.length,0);assert.equal(saved.understoryGardens.authoredReceiver.status,'destroyed');restore(h,saved);h.owner.update(1/60,h.state);assert.equal(G.gardenEntities(h.state).length,0);assert.equal(R.receiverStatus(h.state).status,'destroyed');assert(R.firstPlayerGardenGrowth(h.state));assert.equal(payments(h).length,0)});
test('malformed present terminal receipt/totals fail closed; missing legacy section adopts the actual saved garden',()=>{const h=boot();h.feed();const saved=capture(h);delete saved.understoryGardens;restore(h,saved);assert.equal(G.gardenEntities(h.state).length,1);const receipt=plain(R.firstPlayerGardenGrowth(h.state));h.state.entities.clear();h.state.entityList=[];h.owner.deserialize({version:1,authoredReceiver:{status:'destroyed',terminalGardenData:{gardenBiomass:0,gardenFedMass:0,gardenFedByPlayer:0,compostFedMass:0,compostRunComplete:false,gardenFirstPlayerGrowth:receipt}}});h.bus.emit('save:loaded',{});h.owner.update(1/60,h.state);assert.equal(R.receiverStatus(h.state).status,'unavailable');assert.equal(R.firstPlayerGardenGrowth(h.state),null);assert.equal(G.gardenEntities(h.state).length,0)});
test('receipt-bearing foreign/non-garden entity is not a player garden fact',()=>{const h=boot();h.feed();h.garden.type='ship';assert.equal(R.firstPlayerGardenGrowth(h.state),null);assert.equal(R.receiverStatus(h.state).garden,null);h.garden.type='garden';h.garden.factionId='foreign';assert.equal(R.firstPlayerGardenGrowth(h.state),null)});
console.log(`PASS ${passed} owner/save integration groups; actual complete capture methods and persistent entity methods, explicit unrelated owner ports. Source-asserted real restore order; not full scheduler/native-physics acceptance.`);

test('non-Adventure modes cannot create, feed or regrow the authored receiver',()=>{for(const kind of ['survival','race','lab']){const h=boot();h.state.run.kind=kind;assert.equal(h.feed().alive,true);h.garden.alive=false;h.garden.hull=0;h.bus.emit('entity:killed',{id:h.garden.id,entity:h.garden});const p=h.helpers.spawnEntity({type:'wreck',mass:100,pos:{...h.garden.pos},radius:1,data:{}});h.state.player.tether={active:true,targetId:p.id};h.owner.update(1/60,h.state);assert.equal(p.alive,true);assert.equal(G.gardenEntities(h.state).length,0)}});
console.log(`PASS ${passed} final receiver/save groups.`);

test('present null/array/scalar save sections never create free52 ecology',()=>{for(const bad of [null,[],0,false,'bad']){const h=boot();h.state.entities.clear();h.state.entityList=[];h.owner.deserialize(bad);h.bus.emit('save:loaded',{});h.owner.update(1/60,h.state);assert.equal(R.receiverStatus(h.state).status,'unavailable');assert.equal(G.gardenEntities(h.state).length,0)}});
console.log(`PASS ${passed} all receiver/save groups.`);

test('refused reseed commit never consumes another load or leaves a free replacement',()=>{const h=boot();h.garden.alive=false;h.garden.hull=0;h.bus.emit('entity:killed',{id:h.garden.id,entity:h.garden});const first=h.helpers.spawnEntity({type:'wreck',mass:16,radius:1,pos:{...h.garden.pos},data:{persistenceOwner:'aftermathWrecks',markerId:'m',thrownBy:h.state.playerId}});const second=h.helpers.spawnEntity({type:'wreck',mass:16,radius:1,pos:{x:h.garden.pos.x+100,z:h.garden.pos.z},data:{thrownBy:h.state.playerId}});h.systems.set('aftermathWrecks',{gardenFeedMass:()=>16,consumeByGarden:()=>false});h.owner.update(1/60,h.state);assert.equal(first.alive,true);assert.equal(second.alive,true);assert.equal(G.gardenEntities(h.state).length,0);assert.equal(R.receiverStatus(h.state).status,'destroyed');assert.equal(payments(h).length,0)});
test('stale generic entity-list occupant cannot retire its replacement, and non-Adventure cannot reconcile old growth',()=>{const h=boot();const p=h.helpers.spawnEntity({type:'wreck',mass:16,pos:{...h.garden.pos},radius:1,data:{thrownBy:h.state.playerId}});h.state.entities.set(p.id,{...p,data:{missionId:'foreign'}});h.owner.update(1/60,h.state);assert.equal(p.alive,true);h.feed();assert(R.firstPlayerGardenGrowth(h.state));h.state.run.kind='survival';assert.equal(R.firstPlayerGardenGrowth(h.state),null)});
console.log(`PASS ${passed} final all receiver/save groups.`);

test('ordinary decimal contents reach honest240t without a floating-point extra load',()=>{const h=boot();for(let i=0;i<17;i++)h.feed(17*.8);h.feed(11*.8);assert(Math.abs(h.garden.data.compostFedMass-240)<1e-9);assert.equal(payments(h).length,1);assert.equal(payments(h)[0].amount,2880);h.feed(17*.8);assert.equal(payments(h).length,1)});
console.log(`PASS ${passed} final receiver/save/arithmetic groups.`);

test('125 actual one-unit iron masses regrow zero-subsidy bed to unchanged60 floor with a valid receipt',()=>{const h=boot();h.garden.alive=false;h.garden.hull=0;h.bus.emit('entity:killed',{id:h.garden.id,entity:h.garden});for(let i=0;i<125;i++)h.feed(.8);const g=R.receiverStatus(h.state).garden;assert.equal(g.data.gardenStage,2);assert(Math.abs(g.data.gardenBiomass-60)<1e-9);assert(Math.abs(g.data.compostFedMass-100)<1e-9);assert(R.firstPlayerGardenGrowth(h.state));assert.equal(payments(h).length,0);assert.equal(G.stageForBiomass(60-1e-5).stage,1)});
test('legacy saved ordinary garden gains only missing visual identity at real reconstruction spawn; custom visuals stay untouched',()=>{const h=boot();const old=G.spawnGarden(h.state,h.helpers,{x:0,z:0,biomass:9.6,gardenId:'legacy'});old.data.gardenFedMass=16;old.data.gardenFedByPlayer=16;old.data.compostFedMass=16;const saved=capture(h);const row=saved.entities.persistent.find(e=>e.data.gardenId==='legacy');delete row.data.placeId;delete row.data.poi;delete row.data.placeTargetRadius;delete row.data.gardenRadius;restore(h,saved);const g=G.gardenEntities(h.state).find(e=>e.data.gardenId==='legacy');assert.equal(g.data.placeId,'place_dead_hulk');assert.equal(g.radius,90);assert.equal(g.data.gardenRadius,90);assert.equal(g.data.gardenBiomass,9.6);assert.equal(g.data.compostFedMass,16);const custom=h.helpers.spawnEntity({type:'garden',factionId:'faction_understory',flags:{persistent:true},radius:200,data:{understoryGarden:true,gardenId:'custom',placeId:'custom_hull',gardenBiomass:180}});assert.equal(custom.data.placeId,'custom_hull');assert.equal(custom.data.placeTargetRadius,undefined)});
console.log(`PASS ${passed} final owner/save/legacy/numeric groups.`);
test('visual-only legacy adoption preserves body fields/false and refuses explicit custom physics',()=>{const h=boot();const make=physicsBody=>h.helpers.spawnEntity({type:'garden',factionId:'faction_understory',flags:{persistent:true},alive:true,hull:100,radius:140,physicsBody,data:{understoryGarden:true,gardenId:'legacy-body',gardenBiomass:60}});const old=make({dynamic:false,radius:140,mass:8000,material:'debris',shape:'ball',contact:{friction:.8}});assert.deepEqual(plain(old.physicsBody),{dynamic:false,radius:140,mass:8000,material:'debris',shape:'ball',contact:{friction:.8},useMeasuredSkin:false});const ghost=make(false);assert.equal(ghost.physicsBody,false);assert.equal(ghost.data.placeId,'place_dead_hulk');for(const body of [{useMeasuredSkin:true},{shape:'capsule'},{collisionProxyManifest:{id:'custom'}}]){const e=make(body);assert.equal(e.data.placeId,undefined);assert.equal(e.physicsBody,body)}});
test('conflicting visual identity cannot manufacture a visible-growth receipt; meaningfully under240 never pays',()=>{for(const key of ['archetypeGlb','landmarkGlb','assetId','assetRef','packagedPropFile','claimSpecId','claimOwned','storyPropKind']){const h=boot();h.garden.data[key]='custom';h.feed();assert.equal(h.garden.data.gardenFirstPlayerGrowth,undefined,key);assert.equal(R.firstPlayerGardenGrowth(h.state),null,key)}const h=boot();h.feed(240-1e-5);assert.equal(payments(h).length,0);assert.equal(h.garden.data.compostRunComplete,undefined)});
console.log(`PASS ${passed} final receiver integration groups.`);

// Exact core entity constructor + spawn publication, not the earlier sparse helper. Index,
// presentation-journal and unrelated identity ports do not perform collision admission.
const coreSource=source('src/core/coreSystem.js').replace(/\r\n/g,'\n');
const entitySource=source('src/core/entity.js').replace(/^export /gm,'');
const admissionSource=source('src/core/presentationAdmission.js');
const freeFunction=(src,name)=>{const at=src.indexOf(`function ${name}(`),end=src.indexOf('\n}',at);assert(at>=0&&end>at,name);return src.slice(at,end+2)};
const admissionFns=['entityRequiresAuthoredPresentation','initializePresentationAdmission'].map(n=>freeFunction(admissionSource,n)).join('\n');
const constructStart=coreSource.indexOf('    const constructEntity = (spec, fence = null) => {');
const constructEnd=coreSource.indexOf('    // The normal allocator/constructor is shared;',constructStart);
assert(constructStart>=0&&constructEnd>constructStart);
const spawnText=coreSource.slice(constructStart,constructEnd);
function installCore(h){const ports=vm.createContext({...geometry,state:h.state,bus:h.bus,
 ensureEntityIndex:()=>({}),reconcileEntityIndexSource(){},appendEntityIndex(){},markEntityIndexSourceSynced(){},markDirty(){},publishPresentation(){},DIRTY:{MEMBERSHIP:1,POSE:2},
 isOrchardFrame:()=>false,isPhysicalMachinery:()=>false,hasExplicitAuthoredGeologyPresentation:()=>false,hasExplicitAuthoredPayloadPresentation:()=>false,PRESENTATION_ADMISSION:{pending:'pending'}});
 h.state.freeIds=[];h.state.nextEntityId=Math.max(0,...h.state.entities.keys())+1;h.state.nextOccupantGeneration=1;
 h.helpers.spawnEntity=vm.runInContext(entitySource+'\n'+admissionFns+'\n'+spawnText+'\nspawnEntity;',ports);return h}
function clearForFresh(h){h.state.entities.clear();h.state.entityList=[];h.state.understory=undefined;return h}
function bodyAt(h,offset=0,extra={}){const pos=R.receiverPosition();return h.helpers.spawnEntity({type:'ship',factionId:'player',radius:12,mass:24,hull:100,collides:true,pos:{x:pos.x+offset,z:pos.z},data:{defId:'ship_wasp'},...extra})}
function killReceiver(h){const g=R.receiverStatus(h.state).garden;g.alive=false;g.hull=0;h.bus.emit('entity:killed',{id:g.id,entity:g});return g}
const priorArg=process.argv.indexOf('--prior-garden-source');
if(priorArg>=0){
 const old=fs.readFileSync(process.argv[priorArg+1],'utf8').replace(/\r\n/g,'\n');
 const at=old.indexOf('  ensureAuthoredReceiver() {'),end=old.indexOf('\n  },',at);assert(at>=0&&end>at);
 const oldEnsure=vm.runInNewContext('({'+old.slice(at,end+5)+'}).ensureAuthoredReceiver',{...G,...R});
 test('exact pre-fix owner + actual core spawn creates fixed receiving hull over a live pilot',()=>{const h=clearForFresh(installCore(boot()));const p=bodyAt(h);h.state.playerId=p.id;const g=oldEnsure.call(h.owner);assert(g);assert.equal(g.pos.x,p.pos.x);assert.equal(g.pos.z,p.pos.z);assert.equal(g.physicsBody.dynamic,false);assert.equal(g.data.collisionProxy,'skin:place_dead_hulk');assert.equal(p.alive,true)});
}
test('actual core inputs: occupied first-admission bed defers without moving pilot and admits once after departure',()=>{const h=clearForFresh(installCore(boot()));const p=bodyAt(h);h.state.playerId=p.id;const pose=plain(p.pos);for(let i=0;i<3;i++)assert.equal(h.owner.ensureAuthoredReceiver(),null);assert.equal(G.gardenEntities(h.state).length,0);assert.deepEqual(plain(p.pos),pose);assert.equal(h.events.filter(e=>e.text?.startsWith('The receiving bed is occupied')).length,1);p.pos.x+=200;const g=h.owner.ensureAuthoredReceiver();assert(g);assert.equal(g.data.gardenBiomass,52);assert.equal(h.owner.ensureAuthoredReceiver(),g);assert.equal(payments(h).length,0)});
test('actual core inputs: pilot in ruined bed preserves meal and terminal/run/receipt; departure admits zero-subsidy once',()=>{const h=installCore(boot());h.feed(16);const old=killReceiver(h),before=JSON.stringify(h.owner.serialize());const p=bodyAt(h);h.state.playerId=p.id;const meal=h.helpers.spawnEntity({type:'wreck',radius:12,mass:16,hull:10,pos:{...old.pos},collides:true,data:{thrownBy:p.id}});for(let i=0;i<3;i++)h.owner.update(1/60,h.state);assert.equal(meal.alive,true);assert.equal(JSON.stringify(h.owner.serialize()),before);assert.equal(G.gardenEntities(h.state).length,0);p.pos.x+=200;h.owner.update(1/60,h.state);const g=R.receiverStatus(h.state).garden;assert(g);assert.equal(g.data.gardenBiomass,9.6);assert.equal(g.data.compostFedMass,32);assert.equal(meal.alive,false);assert(R.firstPlayerGardenGrowth(h.state));h.owner.update(1/60,h.state);assert.equal(g.data.compostFedMass,32);assert.equal(payments(h).length,0)});
test('wide authored body-radius and offset custom-proxy extents block even when their centers clear the76 core',()=>{for(const extra of [{radius:1,physicsBody:{radius:160,dynamic:false,material:'debris'}},{radius:1,physicsBody:{dynamic:false,material:'debris',collisionProxyManifest:{schemaVersion:1,id:'clearance-probe',referenceRadius:'radius',primitives:[{kind:'circle',x:-180,z:0,r:45}]}}}]){const h=clearForFresh(installCore(boot()));const blocker=bodyAt(h,180,{type:'wreck',data:{},...extra});assert.equal(h.owner.ensureAuthoredReceiver(),null);blocker.pos.x+=1000;assert(h.owner.ensureAuthoredReceiver())}});
test('only physically absent/ghost bodies are ignored, not collides:false with an authored solid body',()=>{for(const extra of [{physicsBody:false},{type:'projectile',physicsBody:{material:'projectile'}}]){const h=clearForFresh(installCore(boot()));bodyAt(h,0,extra);assert(h.owner.ensureAuthoredReceiver())}for(const extra of [{collides:false,physicsBody:{radius:12,material:'debris'}},{type:'pickup',physicsBody:{material:'sensor'}}]){const h=clearForFresh(installCore(boot()));bodyAt(h,0,extra);assert.equal(h.owner.ensureAuthoredReceiver(),null)}});
test('foreign/protected intended-meal argument never exempts an occupying body',()=>{const h=installCore(boot());killReceiver(h);const prey=bodyAt(h,0,{type:'wreck',data:{missionId:'foreign',thrownBy:h.state.playerId}});assert.equal(h.owner._receiverSiteClear(R.receiverPosition(),prey),false);assert.equal(prey.alive,true);assert.equal(R.receiverStatus(h.state).status,'destroyed')});
console.log(`PASS ${passed} receiver/clearance groups; actual core producer and current geometry readers, no native solver acceptance.`);
