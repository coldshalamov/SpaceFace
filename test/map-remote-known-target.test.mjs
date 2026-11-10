import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { buildSystemModel, commitCoursePayload, resolveGalaxyMapPrimaryAction,
  emitGalaxyMapPrimaryAction, galaxyMapScreen, resolveRouteEngageAction, emitRouteEngageAction,
  isOneHopNeighbor } from '../src/ui/galaxyMap.js';

function stateFor(sector='sector_helios_prime') {
 const s=createGameState(4242);
 s.mode='flight';s.world.currentSectorId=sector;
 s.world.sectors=Object.fromEntries(SECTORS.map(row=>[row.id,{...row}]));
 s.world.discovery=Object.fromEntries(SECTORS.map(row=>[row.id,{discovered:true}]));
 s.playerId=1;
 const player={id:1,type:'ship',alive:true,pos:sectorLocalToGlobalForSector({x:0,z:0},sector),data:{}};
 s.entities.set(1,player);s.entityList=[player];
 s.world.counterweightCircuit={discovered:true};
 s.breakwaterSpurView={phase:'operating',stage:3,nextAction:'Supply the berth.'};
 s.cinderglassJobView={markers:[{id:'cinderglassJob:pod',label:'CG-7 pod',followId:913,
  pos:sectorLocalToGlobalForSector({x:260,z:-140},'sector_tethys_junction')}]};
 return s;
}
const cases=[['Breakwater Spur','sector_ceres_belt'],['Counterweight Circuit','sector_pallas_drift'],['CG-7 pod','sector_tethys_junction']];

for(const [name,sector]of cases)test(`known remote ${name} plots only, then uses the same canonical local fix`,()=>{
 const s=stateFor();
 const marker=buildSystemModel(s,sector).points.find(row=>row.name===name);
 assert.ok(marker,`${name} must come from the real public map reader`);
 const canonical={...(marker.coursePos||{x:marker.x,z:marker.z})};
 const payload=commitCoursePayload(s,marker),action=resolveGalaxyMapPrimaryAction(s,marker);
 assert.deepEqual(payload,{type:'sector',sectorId:sector,path:null,label:marker.courseLabel||marker.name});
 assert.equal(action.kind,'route');assert.equal(action.label,'Plot Course');
 assert.deepEqual(action.coursePayload,payload);
 const events=[],bus={emit:(name,payload)=>events.push({name,payload})};
 emitGalaxyMapPrimaryAction(bus,action);
 assert.deepEqual(events.filter(e=>e.name==='world:requestRoute').map(e=>e.payload.targetSectorId),[sector]);
 assert.equal(events.some(e=>e.name==='world:requestJump'||e.name==='nav:engageRoute'),false);
 assert.equal(events.find(e=>e.name==='ui:setCourse').payload.pos,undefined);
 // The ordinary line/double-click path emits the same plot and keeps Engage reachable.
 const chart=Object.create(galaxyMapScreen);
 Object.assign(chart,{_ctx:{state:s,bus},_visible:true,_previewPts:null,_reduceMotion:true,refresh(){}});
 const previous=events.length;
 assert.equal(chart._commitCourse(marker),true);
 assert.deepEqual(events.slice(previous).find(e=>e.name==='ui:setCourse').payload,payload);
 assert.equal(events.slice(previous).some(e=>e.name==='ui:popScreen'),false);
 s.world.currentSectorId=sector;
 const local=commitCoursePayload(s,marker);
 assert.deepEqual(local.pos,canonical);
 assert.notEqual(local.type,'sector');assert.equal(local.autopilot,true);
 assert.equal(resolveGalaxyMapPrimaryAction(s,marker).kind,'waypoint');
 if(marker.entityId!=null)assert.equal(local.targetEntityId,marker.entityId);
});

test('a neighboring remote station requires explicit Engage while sector-node and gate actions keep their intent',()=>{
 const s=stateFor();
 const sector='sector_ceres_belt';assert.equal(isOneHopNeighbor(s,sector),true);
 const point=sectorLocalToGlobalForSector({x:100,z:200},sector);
 const station={kind:'station',name:'Ceres Station',stationId:'station_ceres',sectorId:sector,...point,entityId:321};
 const action=resolveGalaxyMapPrimaryAction(s,station);
 assert.equal(action.kind,'route');assert.equal(action.coursePayload.targetEntityId,undefined);
 const events=[],bus={emit:(name,payload)=>events.push({name,payload})};
 emitGalaxyMapPrimaryAction(bus,action);
 assert.equal(events.some(e=>e.name==='world:requestJump'||e.name==='nav:engageRoute'),false);
 // The existing route owner supplies the plotted path; the explicit button emits Engage.
 s.nav.route={path:['sector_helios_prime',sector],status:'plotted'};
 const engage=resolveRouteEngageAction(s);
 assert.equal(emitRouteEngageAction(bus,engage),true);
 assert.equal(events.filter(e=>e.name==='nav:engageRoute').length,1);
 assert.equal(resolveGalaxyMapPrimaryAction(s,{kind:'sector',id:sector,sectorId:sector}).kind,'jump');
 const gate={kind:'gate',x:10,z:20,targetSectorId:sector,sectorId:'sector_helios_prime'};
 assert.equal(resolveGalaxyMapPrimaryAction(s,gate).kind,'waypoint');
});

test('remote rumor, disabled mark and gated planetary approach remain refused',()=>{
 const s=stateFor(),base={kind:'poi',sectorId:'sector_ceres_belt',x:20000,z:100,name:'Unresolved'};
 for(const marker of [{...base,kind:'rumor'},{...base,courseDisabled:true},{...base,planetaryApproach:true}]){
  assert.equal(commitCoursePayload(s,marker),null);
  assert.equal(resolveGalaxyMapPrimaryAction(s,marker),null);
 }
});
