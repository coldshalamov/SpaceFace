import test from 'node:test';
import assert from 'node:assert/strict';
import {nestWaypoint, NEST_VISIT, nestPosition} from '../src/data/nestVisit.js';
function fixture() {
 const carrier={id:17,alive:true,pos:nestPosition(),data:{nestEncounterId:NEST_VISIT.encounterId,nestSlot:'carrier',nestBayOpen:false}};
 const rec={carrierId:17,contactEstablished:true,remaining:6,returnHits:0,broodVariant:'nursery_compact_v1'};
 const live={id:NEST_VISIT.encounterId,shapeId:'the_nest',phase:'conflict',data:{nest:rec}};
 const state={entities:new Map([[17,carrier]]),encounterDirector:{nestVisit:{version:1,status:'active',sectorId:NEST_VISIT.sectorId,encounterId:live.id,anchor:nestPosition(),snapshot:{version:1}},live:{[live.id]:live}}};
 return {state,carrier,rec,live};
}
test('ordinary active waypoint follows owner bay state and confirmed hit progress without changing state',()=>{
 const h=fixture();let waypoint=nestWaypoint(h.state);
 assert.equal(waypoint.label,'The Nest — guarded couplings');assert.match(waypoint.reason,/0\/3 confirmed/);assert.match(waypoint.reason,/6\/6 Wasps still aboard/);
 h.rec.remaining=4;h.rec.returnHits=1;h.carrier.data.nestBayOpen=true;
 waypoint=nestWaypoint(h.state);assert.equal(waypoint.label,'The Nest — exposed coupling');assert.match(waypoint.reason,/1\/3 confirmed/);assert.match(waypoint.reason,/4\/6 Wasps still aboard/);assert.match(waypoint.reason,/only real contact counts/);
 assert.match(waypoint.reason,/16t nursery Wasps fit Class I/);assert.equal(h.rec.returnHits,1);
});
test('last launch does not promise another window; torn/exposed flank remains usable',()=>{
 const h=fixture();h.rec.remaining=0;
 assert.equal(nestWaypoint(h.state).label,'The Nest — brood deployed');assert.match(nestWaypoint(h.state).reason,/No more launch windows/);
 h.carrier.data.nestBayOpen=true;assert.equal(nestWaypoint(h.state).label,'The Nest — exposed coupling');assert.doesNotMatch(nestWaypoint(h.state).reason,/No more launch windows/);
});
test('withdrawal describes genuine contact break without moving waypoint or promising safety',()=>{
 const h=fixture();const w=nestWaypoint(h.state);
 assert.match(w.reason,/more than 3,000 WU.*while alive, or leave the sector/);
 assert.match(w.reason,/approach marker is not the escape boundary/);
 assert.deepEqual(w.pos,{x:h.carrier.pos.x+650,z:h.carrier.pos.z});assert.equal(w.targetEntityId,null);
 assert.doesNotMatch(w.reason,/safe|victory|paid/i);
});
test('missing, dead, foreign and incomplete runtime records do not invent live progress',()=>{
 for(const edit of [h=>h.state.entities.delete(17),h=>h.carrier.alive=false,h=>h.carrier.data.nestEncounterId='foreign',h=>h.rec.remaining=NaN,h=>h.rec.returnHits=4,h=>h.live.phase='done',h=>h.rec.contactEstablished=false]) {
 const h=fixture();edit(h);assert.doesNotMatch(nestWaypoint(h.state).reason,/confirmed coupling returns/);
 }
});
test('restored snapshot alone cannot claim a fresh exposed window',()=>{
 const h=fixture();h.state.encounterDirector.nestVisit.snapshot.bayOpenIn=2;delete h.state.encounterDirector.live[h.live.id];
 assert.doesNotMatch(nestWaypoint(h.state).reason,/confirmed coupling returns/);
});
