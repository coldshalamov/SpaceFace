import test from 'node:test';
import assert from 'node:assert/strict';
import {world} from '../src/systems/world.js';
import {getDressingRow} from '../src/world/dressingTable.js';
import {createSimulation} from '../src/core/sim.js';
import {livingPoiBehaviors} from '../src/systems/livingPoiBehaviors.js';
import {environmentalMachinery} from '../src/systems/environmentalMachinery.js';
import {terrainAnchors} from '../src/systems/terrainAnchors.js';
import {fields} from '../src/systems/fields.js';
import {scanner} from '../src/systems/scanner.js';
import {missions} from '../src/systems/missions.js';
import {economy} from '../src/systems/economy.js';
import {save} from '../src/save/saveSystem.js';
import {SECTORS} from '../src/data/sectors.js';
import {FIELD_FLAGS} from '../src/data/fields.js';
import {RIFT_FISSURE_CRACKER as MACHINE} from '../src/data/environmentalMachinery.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';
const SID='sector_haumea_rift', ZID='zone_haumea_fissure';
const sector=SECTORS.find(s=>s.id===SID);
const global=p=>sectorLocalToGlobalForSector(p,SID);
// Rendering/world placement is a fixture boundary. Real terrain, field kernel, machine,
// scanner, POI, missions, economy and save owners execute; no native/GPU witness claimed.
const fixtureWorld={name:'world',init(ctx){this.ctx=ctx;this.state=ctx.state;this.helpers=ctx.helpers},
 _spawnPlaceProp:world._spawnPlaceProp, _stampHomeSector:world._stampHomeSector, _poiCarrier:world._poiCarrier};
function boot(){
 const old=FIELD_FLAGS.enabled;FIELD_FLAGS.enabled=true;
 const sim=createSimulation({seed:4242,systems:[economy,missions,fixtureWorld,terrainAnchors,fields,environmentalMachinery,livingPoiBehaviors,scanner,save]});
 const {state,bus}=sim;state.mode='flight';state.onboarding={active:false,finished:true};
 state.world.currentSectorId=SID;state.world.enterSerial=1;state.world.sectors[SID]=sector;
 state.world.activeSector={id:SID,stations:[],pois:[],fields:[],gates:[],dressing:[]};
 for(const id of ['faction_free','faction_vael','faction_archive'])state.factions[id]={...state.factions[id],rep:500};
 const player=sim.spawn({type:'ship',team:0,pos:global({x:0,z:180}),vel:{x:0,z:0},hull:100,hullMax:100,radius:6,data:{}});state.playerId=player.id;
 const own=sim.registry.get('livingPoiBehaviors'),machine=sim.registry.get('environmentalMachinery'),scan=sim.registry.get('scanner'),field=sim.registry.get('fields');
 own.planSector(SID);const offers=[],spoken=[];bus.on('mission:offered',p=>offers.push(p));bus.on('toast',p=>spoken.push(p.text));
 const admit=t=>{state.simTime=t;state.tick=Math.round(t*60);machine.update(1/60,state)};
 const pulse=(t,pos)=>{if(pos)player.pos={...pos};admit(t);scan._pulse(state,player,t)};
 const row=()=>state.livingPoiBehaviors.activeByZone[ZID];
 const dispose=()=>{sim.dispose();FIELD_FLAGS.enabled=old};
 return {sim,state,bus,player,own,machine,field,scan,offers,spoken,admit,pulse,row,dispose};
}
function finish(h){h.pulse(8);h.pulse(16.5)}
test('real scanner compares calm with later surge; duplicate, warning and reversed phases do not advance',()=>{
 const h=boot();try{
 assert.equal(h.row().contract.required,2);h.pulse(4.5);assert.equal(h.row().progress,0);
 h.pulse(8);assert.equal(h.row().progress,1);h.pulse(9);h.pulse(14.5);assert.equal(h.row().progress,1);
 h.pulse(16.5);assert.equal(h.row().status,'resolved');assert.equal(h.offers.length,1);
 assert.equal(h.offers[0].stationId,'station_haumea_rift');assert.ok(sector.neighbors.includes(h.offers[0].destSectorId));
 h.pulse(28.5);assert.equal(h.offers.length,1);
 }finally{h.dispose()}
});
test('phase projection without successful machinery admission earns no observation',()=>{
 const h=boot();try{
 h.state.simTime=8;assert.equal(h.machine.readFissureSurvey(h.player),null);
 const world=h.sim.registry.get('world'),spawn=world._spawnPlaceProp;world._spawnPlaceProp=()=>null;
 h.pulse(8);assert.equal(h.row().progress,0);world._spawnPlaceProp=spawn;h.pulse(9);assert.equal(h.row().progress,1);
 }finally{h.dispose()}
});
test('unregistered or wrong live force cannot masquerade as a surge; safe calm has no force',()=>{
 const h=boot();try{
 h.admit(8);assert.equal(h.machine.readFissureSurvey(h.player)?.phase,'calm');
 h.admit(16.5);const id=MACHINE.fields[0].id;h.field.unregisterExternal(id);assert.equal(h.machine.readFissureSurvey(h.player),null);
 h.admit(16.5);h.field.updateExternal(id,{strength:0});assert.equal(h.machine.readFissureSurvey(h.player),null);
 }finally{h.dispose()}
});
test('whole field envelope includes pilot hull, not just its center; exterior gap remains usable',()=>{
 const h=boot();try{
 h.admit(8);const r=h.machine.readFissureSurvey(h.player);assert.ok(r);assert.ok(Math.abs(r.safeRadius-118)<1e-8);
 h.player.pos={x:MACHINE.globalPos.x+117,z:MACHINE.globalPos.z};assert.equal(h.machine.readFissureSurvey(h.player),null);
 h.player.pos.x=MACHINE.globalPos.x+119;assert.ok(h.machine.readFissureSurvey(h.player));
 h.player.radius=20;assert.equal(h.machine.readFissureSurvey(h.player),null);
 }finally{h.dispose()}
});
for(const cause of ['player_shutdown','operator_died','tower_destroyed','machine_destroyed'])test(`durable ${cause} yields a steady reading without restarting machinery`,()=>{
 const h=boot();try{
 h.admit(8);assert.equal(h.machine.shutdownKillMachine(MACHINE.id,cause),true);h.pulse(16.5);
 assert.equal(h.row().status,'resolved');assert.equal(h.offers.length,1);
 assert.equal(h.state.world.discovery[SID].machineShutdowns[MACHINE.id].cause,cause);
 assert.ok(h.spoken.some(s=>s.includes('steady fracture return')));
 assert.equal(h.field.hasExternal(MACHINE.fields[0].id),false);
 }finally{h.dispose()}
});
test('missing or dead original anvil does not invent shutdown, and reused numeric mouth identity fails',()=>{
 const h=boot();try{
 h.admit(8);const a=h.state.entityList.find(e=>e.data?.killMachineId===MACHINE.id);assert.ok(a);a.alive=false;
 assert.equal(h.machine.readFissureSurvey(h.player),null);a.alive=true;
 const id=h.machine._mouthIds.get(MACHINE.id),original=getDressingRow(h.state,id);h.state.world.dressing.byId.set(id,{...original});assert.equal(h.machine.readFissureSurvey(h.player),null);h.admit(8);assert.equal(h.machine.readFissureSurvey(h.player),null);
 assert.equal(h.state.world.discovery?.[SID]?.machineShutdowns?.[MACHINE.id],undefined);
 }finally{h.dispose()}
});
test('disabled fields, departed visit, changed epoch, dead or docked player fail closed',()=>{
 const h=boot();try{
 h.admit(8);FIELD_FLAGS.enabled=false;assert.equal(h.machine.readFissureSurvey(h.player),null);FIELD_FLAGS.enabled=true;
 h.state.world.enterSerial++;assert.equal(h.machine.readFissureSurvey(h.player),null);h.admit(8);
 h.player.alive=false;assert.equal(h.machine.readFissureSurvey(h.player),null);h.player.alive=true;
 h.player.flags={docked:true};assert.equal(h.machine.readFissureSurvey(h.player),null);h.player.flags={};
 h.bus.emit('sector:exit',{sectorId:SID});assert.equal(h.machine.readFissureSurvey(h.player),null);
 }finally{h.dispose()}
});
test('forged pulse position, sector, phase, remote zone and non-finite input cannot earn readings',()=>{
 const h=boot();try{
 h.admit(4.5);for(const p of [{pos:h.player.pos,phase:'calm'},{pos:global({x:400,z:180})},{pos:h.player.pos,sectorId:'sector_eris_margin'},{pos:{x:NaN,z:0}}])h.bus.emit('scan:pulse',{zoneId:ZID,...p});
 assert.equal(h.row().progress,0);h.player.pos=global({x:1000,z:180});h.admit(8);h.bus.emit('scan:pulse',{zoneId:ZID,pos:h.player.pos});assert.equal(h.row().progress,0);
 }finally{h.dispose()}
});
test('leave and reenter require a fresh quiet baseline; a stale enter cannot re-enable samples',()=>{
 const h=boot();try{
 h.pulse(8);h.bus.emit('sector:exit',{sectorId:SID});assert.equal(h.row().progress,0);
 h.state.world.enterSerial=2;h.bus.emit('sector:enter',{sectorId:SID,enterEpoch:1});h.pulse(16.5);assert.equal(h.row().progress,0);
 h.bus.emit('sector:enter',{sectorId:SID,enterEpoch:2});h.pulse(20);assert.equal(h.row().progress,1);h.pulse(28.5);assert.equal(h.row().status,'resolved');
 }finally{h.dispose()}
});
test('partial serialization resets observations while completed aftermath and legacy aftermath remain durable',()=>{
 const h=boot();try{
 h.pulse(8);const partial=h.own.serialize();h.own.deserialize(partial);h.own.planSector(SID);assert.equal(h.row().progress,0);
 h.pulse(16.5);assert.equal(h.row().progress,0);h.pulse(20);h.pulse(28.5);const data=h.own.serialize();
 h.own.deserialize(data);h.own.planSector(SID);assert.equal(h.row().status,'aftermath');assert.equal(h.offers.length,1);
 const old=structuredClone(data);old.aftermath[h.row().behaviorId].fingerprint='legacy-three-bearing';h.own.deserialize(old);h.own.planSector(SID);assert.equal(h.row().status,'aftermath');assert.equal(h.row().fingerprint,'legacy-three-bearing');
 }finally{h.dispose()}
});
test('actual Save/Continue retains accepted survey mission, completed aftermath and shutdown choice',async()=>{
 const storage=new Map(),old=globalThis.localStorage;globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const h=boot();try{
 h.admit(8);h.machine.shutdownKillMachine(MACHINE.id,'player_shutdown');h.pulse(16.5);
 assert.equal(h.sim.registry.get('missions').acceptMission(h.offers[0].id),true);const id=h.state.missions.active[0].id;
 const saver=h.sim.registry.get('save');assert.equal(saver.save('quick'),true);h.state.missions.active=[];h.state.livingPoiBehaviors.aftermath={};
 assert.ok(await saver.load('quick'));assert.ok(h.state.missions.active.some(m=>m.id===id));
 h.state.world.currentSectorId=SID;h.own.planSector(SID);assert.equal(h.row().status,'aftermath');assert.equal(h.state.world.discovery[SID].machineShutdowns[MACHINE.id].cause,'player_shutdown');
 }finally{h.dispose();globalThis.localStorage=old}
});

test('same-state New Game clears admitted identities and prior survey evidence',()=>{
 const h=boot();try{
 h.pulse(8);assert.ok(h.machine.readFissureSurvey(h.player));h.machine.newGame();h.own.newGame();
 assert.equal(h.machine.readFissureSurvey(h.player),null);h.own.planSector(SID);assert.equal(h.row().progress,0);
 h.pulse(16.5);assert.equal(h.row().progress,0);h.pulse(20);h.pulse(28.5);assert.equal(h.row().status,'resolved');
 }finally{h.dispose()}
});
test('replacement field kernel needs new owner admission and a fresh baseline',()=>{
 const h=boot();try{
 h.pulse(8);assert.equal(h.row().progress,1);const original=h.field._kernel;
 const replacement=Object.create(Object.getPrototypeOf(original));Object.assign(replacement,original);h.field._kernel=replacement;
 assert.equal(h.machine.readFissureSurvey(h.player),null);h.pulse(16.5);assert.equal(h.row().progress,0);
 assert.equal(h.state.world.poiReadouts[ZID].progress,0);assert.equal(h.state.world.poiReadouts[ZID].status,'available');assert.ok(h.spoken.some(s=>s.includes('fresh scan in calm')));
 h.pulse(20);h.pulse(28.5);assert.equal(h.row().status,'resolved');
 }finally{h.dispose()}
});
test('fresh-instance Continue cannot inherit old admission or unfinished baseline',async()=>{
 const storage=new Map(),old=globalThis.localStorage;globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 let h=boot();try{
 h.pulse(8);assert.equal(h.sim.registry.get('save').save('quick'),true);h.dispose();h=boot();
 assert.ok(await h.sim.registry.get('save').load('quick'));h.state.mode='flight';h.state.world.currentSectorId=SID;
 const restored=h.state.entities.get(h.state.playerId);assert.ok(restored);assert.equal(h.machine.readFissureSurvey(restored),null);
 h.own.planSector(SID);assert.equal(h.row().progress,0);h.own._onZoneEntered({zoneId:ZID});
 assert.ok(h.spoken.some(s=>s.includes('fresh scan in calm')));
 }finally{h.dispose();globalThis.localStorage=old}
});

test('earned fracture lead reaches a real neighboring target and settles exactly once',()=>{
 const h=boot();try{
 finish(h);const offer=h.offers[0],owner=h.sim.registry.get('missions');assert.equal(owner.acceptMission(offer.id),true);
 const mission=h.state.missions.active.find(m=>m.sourceOfferId===offer.id);assert.ok(mission);
 const events=[];for(const name of ['mission:completed','economy:grantCredits'])h.bus.on(name,p=>events.push({name,p}));const before=h.state.player.credits;
 h.state.world.currentSectorId=offer.destSectorId;h.state.world.activeSector={id:offer.destSectorId,stations:[],fields:[],pois:[],gates:[]};h.bus.emit('sector:enter',{sectorId:offer.destSectorId});
 assert.equal(mission.targetEntityIds.length,1);const target=h.state.entities.get(mission.targetEntityIds[0]);assert.ok(target?.alive);
 h.player.pos={x:target.pos.x+900,z:target.pos.z};h.scan._pulse(h.state,h.player,h.state.simTime);const signalId=`signal:entity:${target.id}`;
 assert.equal(h.state.signalInvestigation.records[signalId].stage,1);h.scan._pulse(h.state,h.player,h.state.simTime+8.1);
 assert.equal(h.state.signalInvestigation.records[signalId].stage,2);h.bus.emit('signal:track',{signalId});h.player.pos={...target.pos};h.scan._updateTrackedSignal(h.state);
 assert.equal(h.state.missions.active.includes(mission),false);assert.equal(events.filter(e=>e.name==='mission:completed'&&e.p.missionId===mission.id).length,1);
 assert.equal(events.filter(e=>e.name==='economy:grantCredits'&&e.p.reason===`mission:${mission.id}`).length,1);assert.ok(h.state.player.credits>before);
 h.scan._updateTrackedSignal(h.state);assert.equal(events.filter(e=>e.name==='mission:completed').length,1);
 console.log('HAUMEA_ROUTE_RESULT',JSON.stringify({seed:4242,station:offer.stationId,destination:offer.destSectorId,creditDelta:h.state.player.credits-before,research:h.state.player.researchPoints}));
 }finally{h.dispose()}
});

test('production scanner-before-machinery order accepts previous fixed-step admission, including catch-up',async()=>{
 const {PRODUCTION_UPDATE_ORDER,getSystemClock,SYSTEM_CLOCK}=await import('../src/runtime/authoritativeSystemManifest.js');
 const {LOOP_FIXED_DT}=await import('../src/core/simulationRunner.js');
 assert.equal(LOOP_FIXED_DT,1/60);assert.equal(getSystemClock('environmentalMachinery'),SYSTEM_CLOCK.TABLE);
 assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('scanner')<PRODUCTION_UPDATE_ORDER.indexOf('environmentalMachinery'));
 const h=boot();try{
 h.admit(8);h.sim.registry.get('core').preStep(LOOP_FIXED_DT,h.state);h.state.input.actions={...h.state.input.actions,scanPulse:true};h.scan.update(LOOP_FIXED_DT,h.state);assert.equal(h.row().progress,1);
 // Actual machinery TABLE work continues during catch-up, while scanner is NEAR.
 h.admit(16.5);for(let i=0;i<3;i++){h.state.simCatchupIndex=i+1;h.sim.registry.get('core').preStep(LOOP_FIXED_DT,h.state);h.machine.update(LOOP_FIXED_DT,h.state)}
 h.state.simCatchupIndex=0;h.sim.registry.get('core').preStep(LOOP_FIXED_DT,h.state);h.state.input.actions={...h.state.input.actions,scanPulse:true};h.scan.update(LOOP_FIXED_DT,h.state);assert.equal(h.row().status,'resolved');
 }finally{h.dispose()}
});

test('measurement specialization preserves original causal fingerprint, route, reward and old accepted/offered identity',async()=>{
 const {planPoiBehaviors,poiBehaviorFingerprint}=await import('../src/systems/livingPoiBehaviors.js');
 const {zonesForSector}=await import('../src/data/sectorZones.js');
 const h=boot();try{
 const old=planPoiBehaviors({seed:4242,sectorId:SID,sector,zones:zonesForSector(SID)}).find(r=>r.zoneId===ZID);
 assert.equal(old.contract.required,3);assert.equal(h.row().contract.required,2);
 assert.equal(h.row().fingerprint,old.fingerprint);assert.equal(poiBehaviorFingerprint(h.row()),old.fingerprint);
 finish(h);const offer=h.offers[0];assert.equal(offer.destSectorId,'sector_rhea_cinder');assert.equal(offer.reward_cr,960);
 const saved=h.own.serialize();const original=h.row().behaviorId;
 for(const accepted of [false,true]){
  if(accepted)assert.equal(h.sim.registry.get('missions').acceptMission(offer.id),true);
  h.own.deserialize(saved);h.own.planSector(SID);assert.equal(h.row().status,'aftermath');assert.equal(h.row().behaviorId,original);
  h.pulse(32);h.pulse(40.5);assert.equal(h.offers.length,1);
 }
 }finally{h.dispose()}
});
