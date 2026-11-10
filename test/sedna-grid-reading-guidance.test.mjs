import test from 'node:test';
import assert from 'node:assert/strict';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';
import { RINGWORLD_GRID_READING as q, buildLandmarkQuestOffers } from '../src/data/landmarkMissions.js';
import lore from '../src/data/flavor/080-landmark-lore.js';
import { SECTORS } from '../src/data/sectors.js';
const base = () => ({world:{currentSectorId:q.sectorId,discovery:{[q.sectorId]:{pois:{[q.poiId]:{identified:true,discovered:true}}}}},missions:{active:[],receipts:[]}});
const record=s=>s.world.discovery[q.sectorId].pois[q.poiId];
const plate=s=>explorationDiscoveryPlates(s).find(p=>p.poiId===q.poiId);
function active(s){const o=buildLandmarkQuestOffers(s)[0];assert.ok(o);const m={...o,id:'m_sedna',sourceOfferId:o.id,status:'active'};s.missions.active.push(m);return m;}
test('C11 names the actual issuer and preserves the fuel-less post',()=>{
 const entry=lore.entries.find(e=>e.targetRef===q.targetRef);
 const line=entry.lines.find(l=>l.id==='c11_05').text;
 assert.match(line,/Sedna Survey Post/);assert.doesNotMatch(line,/The Archive pays/);
 assert.equal(q.stationId,'station_sedna');assert.equal(q.factionId,'faction_helix');
 const station=SECTORS.find(s=>s.id===q.sectorId).stations.find(s=>s.id===q.stationId);
 assert.deepEqual(station.services,['scan_tech','repair']);
});
test('unearned, triangulated and wrong-sector identity never reveal a filing lead',()=>{
 const s=base();delete record(s).identified;delete record(s).discovered;record(s).triangulated=true;assert.equal(plate(s),undefined);
 s.world.discovery={sector_helios_prime:{pois:{[q.poiId]:{identified:true}}}};assert.equal(plate(s),undefined);
});
test('discovery gives a conditional earned filing lead, not guaranteed work or fuel',()=>{
 const s=base(),before=JSON.stringify(s);assert.match(plate(s).body,/check Sedna Survey Post’s Jobs board/);assert.match(plate(s).body,/no fuel pump/);assert.equal(JSON.stringify(s),before);
});
test('canonical active contract gives the current close-reading action on revisit',()=>{
 const s=base();active(s);assert.match(plate(s).body,/Grid Reading accepted/);assert.match(plate(s).body,/300 WU/);
 s.world.currentSectorId='sector_helios_prime';assert.match(plate(s).body,/Return to the Ringworld Arc/);
});
test('wrong station, sector, source and range do not impersonate accepted work',()=>{
 for(const mutate of [m=>m.stationId='station_helios',m=>m.destSectorId='sector_helios_prime',m=>m.sourceRef='other',m=>m.params.landmarkProbe.maxRangeWu=999]){
 const s=base();const m=active(s);mutate(m);assert.doesNotMatch(plate(s).body,/Grid Reading accepted/);}
});
test('failed, abandoned and settled receipts outrank stale active rows without inventing an artifact',()=>{
 for(const outcome of ['failed','abandoned','completed']){const s=base();active(s);s.missions.receipts.push({sourceOfferId:q.id,outcome});assert.match(plate(s).body,/no longer active/);assert.match(plate(s).body,/No Ringworld grid reading is filed/);}
 const s=base();active(s).status='failed';assert.match(plate(s).body,/no longer active/);
});
test('durable artifact identity renders authored text, not stored display strings',()=>{
 const s=base();record(s).landmarkArtifact={...q.artifact,sourceRef:q.targetRef,title:'INJECTED',body:'INJECTED'};
 assert.match(plate(s).body,/Grid Reading filed for Sedna Survey Post/);assert.match(plate(s).body,/one street/);assert.doesNotMatch(plate(s).body,/INJECTED|accepted|check Sedna/);
 delete record(s).landmarkArtifact.sourceRef;assert.match(plate(s).body,/Grid Reading filed/);
});
test('unrelated artifacts cannot masquerade as the Ringworld reading',()=>{
 const s=base();record(s).landmarkArtifact={id:'other',title:'INJECTED',body:'INJECTED'};assert.doesNotMatch(plate(s).body,/INJECTED|Grid Reading filed/);assert.doesNotMatch(plate(s).note,/Recovered/);
 record(s).landmarkArtifact={...q.artifact,sourceRef:'other'};assert.doesNotMatch(plate(s).body,/Grid Reading filed/);
});
test('unrelated known plates keep their authored content',()=>{
 const s=base();s.world.discovery.sector_hyperion_cut={pois:{poi_hyperion_driller:{identified:true}}};const p=explorationDiscoveryPlates(s).find(p=>p.poiId==='poi_hyperion_driller');assert.ok(p);assert.doesNotMatch(p.body,/Sedna/);
});
test('actual SaveSystem restores accepted and filed projection without new flags',async()=>{
 const [{createSimulation},{missions},{world},{save}]=await Promise.all([import('../src/core/sim.js'),import('../src/systems/missions.js'),import('../src/systems/world.js'),import('../src/save/saveSystem.js')]);
 const old=globalThis.localStorage,storage=new Map();globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const sim=createSimulation({seed:4242,systems:[missions,world,save]});
 try{const {state,bus}=sim;state.mode='flight';const ship=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},hull:140,hullMax:140,radius:6});state.playerId=ship.id;
 const owner=sim.registry.get('world');owner.enterSector(q.sectorId);
 // Disclosed discovery fixture; no physical scan or mission completion is claimed here.
 state.world.discovery[q.sectorId].pois[q.poiId]={identified:true,discovered:true};
 const mo=sim.registry.get('missions');mo._reconcileLandmarkQuestOffers({stationId:q.stationId});
 assert.equal(mo.acceptMission(q.id),true);assert.match(plate(state).body,/Grid Reading accepted/);
 const saver=sim.registry.get('save');assert.ok(saver.save('quick'));state.missions.active=[];await saver.load('quick');assert.match(plate(state).body,/Grid Reading accepted/);
 // Actual world artifact consumer, synthetic upstream artifact event. Not a completed gameplay route.
 bus.emit('landmark:artifactRecovered',{sectorId:q.sectorId,poiId:q.poiId,targetRef:q.targetRef,artifact:q.artifact,returnedAt:20});
 assert.match(plate(state).body,/Grid Reading filed/);assert.ok(saver.save('quick'));delete state.world.discovery[q.sectorId].pois[q.poiId].landmarkArtifact;
 await saver.load('quick');assert.match(plate(state).body,/Grid Reading filed/);
 }finally{sim.dispose();globalThis.localStorage=old;}
});
