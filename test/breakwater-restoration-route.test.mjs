import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSystemModel,resolveCourseTarget} from '../src/ui/galaxyMap.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';
import {createBreakwaterRow,recomputePhase,recomputeStage} from '../src/features/breakwaterSpur/project.js';
import {getBreakwaterSpurMapMarkers,buildBreakwaterSpurOffer} from '../src/features/breakwaterSpur/readModel.js';
import {normalizeBreakwaterSpurRow} from '../src/features/breakwaterSpur/persistence.js';
import {BREAKWATER_SITE_LOCAL,BREAKWATER_POCKET_LOCAL,BREAKWATER_SECTOR_ID} from '../src/features/breakwaterSpur/definition.js';
const state = () => {const row=createBreakwaterRow();row.phase='restoring';row.surveyed={socket_drive:true,socket_drum:true,console:true};return {world:{breakwaterSpur:row},entities:new Map(),player:{credits:0}};};
const markers=s=>getBreakwaterSpurMapMarkers(s,BREAKWATER_SECTOR_ID);
test('restoration chart connects original search area to open receiving approach',()=>{
 const s=state(), before=JSON.stringify(s.world), rows=markers(s);
 assert.equal(rows.length,3);
 assert.deepEqual(rows[1].coursePos,BREAKWATER_POCKET_LOCAL);
 assert.ok(rows[1].coursePos.x>BREAKWATER_SITE_LOCAL.x && rows[1].coursePos.z<BREAKWATER_SITE_LOCAL.z);
 assert.deepEqual(rows[2].coursePos,{x:BREAKWATER_SITE_LOCAL.x,z:BREAKWATER_SITE_LOCAL.z-90});
 assert.equal(rows[2].courseArrivalRadius,20);
 assert.match(rows[1].statusLine,/not live cargo tracking/);
 assert.match(rows[2].statusLine,/matching cradle mouth/);
 assert.equal(JSON.stringify(s.world),before);
 assert.deepEqual(getBreakwaterSpurMapMarkers(s,'sector_helios_prime'),[]);
});
test('partially restored work keeps return route without claiming seated original remains in pocket',()=>{
 const s=state(),r=s.world.breakwaterSpur;r.cartridges.drive.status='seated';r.sockets.drive.status='seated';recomputeStage(r);recomputePhase(r);
 const offer=buildBreakwaterSpurOffer(s);assert.match(offer.detail,/drive — seated/);assert.doesNotMatch(offer.detail,/Both originals lie/);
 assert.match(offer.detail,/rear support/);assert.equal(markers(s).length,3);
 const restored=normalizeBreakwaterSpurRow(JSON.parse(JSON.stringify(r)));
 assert.deepEqual(markers({world:{breakwaterSpur:restored}}).map(x=>x.id),markers(s).map(x=>x.id));
});
test('completed and failed projects do not advertise a restoration haul',()=>{
 for(const phase of ['ready','commissioned','operating','failed','degraded','signaled','dark']){
 const s=state();s.world.breakwaterSpur.phase=phase;assert.ok(markers(s).every(m=>m.stageId!=='restoration_route'),phase);
 }
});
test('worker view is authoritative and unconfirmed originals remain explicitly search-only',()=>{
 const s=state();s.world.breakwaterSpur.cartridges.drive.status='unconfirmed';
 assert.match(buildBreakwaterSpurOffer(s).detail,/location unconfirmed/);
 assert.match(markers(s)[1].statusLine,/search area/);
 s.breakwaterSpurView={...s.world.breakwaterSpur,phase:'failed'};assert.equal(markers(s).length,1);
 s.breakwaterSpurView=null;assert.deepEqual(markers(s),[]);
});

test('production chart resolves both restoration courses through normal sector coordinates',()=>{
 const s=state();s.world.currentSectorId=BREAKWATER_SECTOR_ID;
 const model=buildSystemModel(s,BREAKWATER_SECTOR_ID);
 for(const marker of markers(s).filter(m=>m.stageId==='restoration_route')){
  const point=model.points.find(p=>p.id===marker.id);assert.ok(point,marker.id);
  const course=resolveCourseTarget(point);
  assert.deepEqual(course.pos,sectorLocalToGlobalForSector(marker.coursePos,BREAKWATER_SECTOR_ID));
  assert.equal(course.arrivalRadius,20);assert.equal(course.autopilot,true);
 }
});

test('selecting a restoration chart course arms the existing world autopilot without granting work',async()=>{
 const {createSimulation}=await import('../src/core/sim.js');
 const {world}=await import('../src/systems/world.js');
 const sim=createSimulation({seed:47,systems:[{...world,update(){}}],updateOrder:[]});
 try {
  const s=sim.state;s.mode='flight';s.run.kind='adventure';s.world.currentSectorId=BREAKWATER_SECTOR_ID;s.ui.docked=false;
  s.world.breakwaterSpur=state().world.breakwaterSpur;
  const before=JSON.stringify(s.world.breakwaterSpur);
  const model=buildSystemModel(s,BREAKWATER_SECTOR_ID);
  for(const id of ['poi_breakwater_salvage_pocket','poi_breakwater_restoration_approach']){
   const course=resolveCourseTarget(model.points.find(p=>p.id===id));
   sim.bus.emit('ui:setCourse',course);
   assert.equal(s.nav.autopilot.active,true);
   assert.deepEqual(s.nav.waypoint.pos,course.pos);
   assert.equal(s.world.currentSectorId,BREAKWATER_SECTOR_ID);
   assert.equal(JSON.stringify(s.world.breakwaterSpur),before);
  }
 } finally {sim.dispose();}
});
