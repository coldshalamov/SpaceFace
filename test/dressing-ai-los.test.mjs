import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { markPhysicsBodyNativeFailure, clearPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { PerceptionMemory } from '../src/ai/perception.js';
import { ManeuverKind } from '../src/ai/contracts.js';
import { insertDressingRow, dropDressingRow } from '../src/world/dressingTable.js';
import { dressingStaticLayerFor } from '../src/world/solidDressing.js';
import { witnessLineOfSight, segmentHitsProxy } from '../src/combat/lineOfSight.js';
import { currentSolidDressingRows } from '../src/core/physicalObstacleQuery.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/forge-approach-dressing.json',import.meta.url)));
test('native Forge dressing remains a cold obstacle for NPC avoidance and exact physical sight',async()=>{
 const sim=createSimulation({seed:4242,systems:[aiPorts]}); const s=sim.state;
 s.mode='flight';s.world.currentSectorId='sector_vesta_forge';
 const source=fixture.dressing.find(r=>r.id===2309), z=source.pos.z, x=source.pos.x;
 const actor=sim.spawn({type:'ship',alive:true,team:2,pos:{x,z:z-90},vel:{x:0,z:70},rot:Math.PI/2,
  radius:12,mass:40,collides:true,data:{ai:{passive:true,roe:'hold_fire'},intent:{}}});
 const ordinary=sim.spawn({type:'ship',alive:true,team:3,pos:{x:x+150,z},vel:{x:0,z:0},radius:8,
  collides:true,data:{ai:{passive:true},intent:{}}});
 const prior=sim.helpers.aiSensors.frameFor(actor.id,1).contacts;
 const rngBefore=structuredClone(s.rng.getState());
 const row=insertDressingRow(s,{...structuredClone(source),homeSectorId:'sector_vesta_forge'});
 const ghost=insertDressingRow(s,{pos:{x:x+20,z},radius:30,collides:false,data:{}});
 const ghostMaterial=insertDressingRow(s,{pos:{x:x+10,z},radius:30,collides:true,physicsBody:{dynamic:false,material:'projectile'},data:{}});
 const owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 try {
  let layer=dressingStaticLayerFor(s,[],0);owner.syncFromEntityLayers(layer.statics,[],layer.staticVersion,null);
  const record=owner.records.get(row.id);assert.ok(record && record.colliders.length,'captured hopper has real native colliders');
  assert.equal(s.entities.has(row.id),false);assert.equal(s.entityList.includes(row),false);
  const target={x,z:z+100},length=190;
  const ray=new owner.RAPIER.Ray({x,y:0,z:z-90},{x:0,y:0,z:1});
  assert.ok(record.colliders.some(c=>c.castRay(ray,length,true)>=0),'native hull intersects this line');
  assert.equal(witnessLineOfSight(s,actor,target),false,'same native skin blocks the physical sight reader');
  for (const offset of [-55,-35,-15,0,15,35,55]) {
    const origin={id:actor.id,pos:{x:x+offset,z:z-90}}, end={x:x+offset,z:z+100};
    const ray=new owner.RAPIER.Ray({x:x+offset,y:0,z:z-90},{x:0,y:0,z:1});
    const blocked=record.colliders.some(c=>c.castRay(ray,length,true)>=0);
    assert.equal(witnessLineOfSight(s,origin,end),!blocked,`native skin LOS at x offset ${offset}`);
  }
  let frame=sim.helpers.aiSensors.frameFor(actor.id,1),contact=frame.contacts.find(c=>c.id===row.id);
  assert.ok(contact);assert.equal(contact.kind,'hazard');assert.equal(contact.hostile,false);assert.equal(contact.threat,0);
  assert.equal(frame.contacts.some(c=>c.id===ghost.id||c.id===ghostMaterial.id),false,'ghost dressing never becomes an obstacle');
  assert.deepEqual(frame.contacts.filter(c=>c.id!==row.id),prior,'existing contacts, threat and targeting facts remain unchanged');
  assert.ok(frame.contacts.some(c=>c.id===ordinary.id));assert.deepEqual(s.rng.getState(),rngBefore,'no RNG draw');
  const planner=new ManeuverPlanner({seed:7,config:{inputSlewPerTick:1,emergencyInputSlewPerTick:1,torqueSlewPerTick:1,emergencyTorqueSlewPerTick:1}});
  const destination={x,z:z+300}, maneuver={kind:ManeuverKind.INTERCEPT,flightPoint:destination,formationSlot:destination,formationBound:170,breakFormation:true};
  const directive={squadId:'route',formation:{slot:destination,bound:170,breakFormation:true}};
  const request=planner.plan({entityId:actor.id,tick:1,perception:frame,behavior:{maneuver},directive});
  assert.equal(request.brake,true);assert.ok(Math.abs(request.forceLocal.right)>.02,'actual NPC maneuver clears the native blocker');
  const failure=markPhysicsBodyNativeFailure(row,owner);
  assert.equal(witnessLineOfSight(s,actor,target),true,'failed native body cannot occlude');
  assert.equal(sim.helpers.aiSensors.frameFor(actor.id,1).contacts.some(c=>c.id===row.id),false,'failed native body cannot steer NPCs');
  clearPhysicsBodyNativeFailure(row,owner,failure);
  assert.equal(witnessLineOfSight(s,actor,target),false,'native readiness recovery restores the same row');
  assert.ok(sim.helpers.aiSensors.frameFor(actor.id,1).contacts.some(c=>c.id===row.id));
  row.collides=false;
  assert.equal(witnessLineOfSight(s,actor,target),true);
  assert.equal(sim.helpers.aiSensors.frameFor(actor.id,1).contacts.some(c=>c.id===row.id),false);
  row.collides=true;
  assert.equal(witnessLineOfSight(s,actor,target),false,'same-tick solid admission is live');
  const memory=new PerceptionMemory({freezeResults:false});
  memory.observe(actor.id,sim.helpers.aiSensors.frameFor(actor.id,1),1);
  assert.ok(memory.observe(actor.id,sim.helpers.aiSensors.frameFor(actor.id,1),1).contacts.some(c=>c.id===row.id),
    'a still-present cold obstacle remains in memory');
  // Same id and kind can later be an ordinary contact; fresh tags replace the
  // cold policy rather than inheriting it in the pooled perception record.
  const reused=new PerceptionMemory({freezeResults:false});
  reused.observe(actor.id,{...frame,contacts:[contact]},1);
  const ordinaryHazard={...contact,tags:['solid']};
  reused.observe(actor.id,{...frame,tick:2,contacts:[ordinaryHazard]},2);
  assert.ok(reused.observe(actor.id,{...frame,tick:3,contacts:[]},3).contacts.some(c=>c.id===row.id),
    'ordinary replacement preserves the normal memory window');
  s.world.currentSectorId='sector_helios_prime';
  assert.equal(witnessLineOfSight(s,actor,target),true);
  const offSector=sim.helpers.aiSensors.frameFor(actor.id,2);
  assert.equal(offSector.contacts.some(c=>c.id===row.id),false);
  assert.equal(memory.observe(actor.id,offSector,2).contacts.some(c=>c.id===row.id),false,'retired cold geometry must not remain a remembered obstacle');
  s.world.currentSectorId='sector_vesta_forge';assert.equal(witnessLineOfSight(s,actor,target),false);
  memory.observe(actor.id,sim.helpers.aiSensors.frameFor(actor.id,3),3);
  dropDressingRow(s,row.id);assert.equal(witnessLineOfSight(s,actor,target),true);
  assert.equal(memory.observe(actor.id,sim.helpers.aiSensors.frameFor(actor.id,4),4).contacts.some(c=>c.id===row.id),false,
    'removed same-sector geometry drops out of memory');
  const replacement=insertDressingRow(s,{...structuredClone(source),homeSectorId:'sector_vesta_forge'});
  assert.notEqual(replacement,row,'new sector/restore identity is not the removed row');
  assert.equal(witnessLineOfSight(s,actor,target),false);assert.ok(sim.helpers.aiSensors.frameFor(actor.id,5).contacts.some(c=>c.id===replacement.id));
 } finally {owner.dispose();sim.dispose();}
});

// Real save owner replacement: the old table and its row must never leak through
// the reader when Continue regenerates a sector. A fixture-inserted row is not a
// durable world-owned original, so it is deliberately not expected to reappear.
test('real Continue retires the prior cold dressing identity from both readers',async()=>{
 const lane=createSimHost();
 try {
  await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
  const {state,registry,runtime}=lane.host;state.mode='flight';state.run={kind:'adventure'};
  state.world.currentSectorId='sector_vesta_forge';const source=fixture.dressing.find(r=>r.id===2309);
  const actor=runtime.spawn({type:'ship',alive:true,team:2,pos:{x:source.pos.x,z:source.pos.z-90},vel:{x:0,z:0},radius:12,
   collides:true,data:{ai:{passive:true},intent:{}}});state.playerId=actor.id;
  const old=insertDressingRow(state,{...structuredClone(source),homeSectorId:'sector_vesta_forge'});
  assert.ok(lane.host.sim.helpers.aiSensors.frameFor(actor.id,1).contacts.some(c=>c.id===old.id));
  const aim={x:source.pos.x,z:source.pos.z+100};assert.equal(witnessLineOfSight(state,actor,aim),false);
  const memory=new PerceptionMemory({freezeResults:false});
  memory.observe(actor.id,lane.host.sim.helpers.aiSensors.frameFor(actor.id,1),1);
  const save=registry.get('save'),envelope=save.serialize('dressing consumers');
  assert.equal(save.loadEnvelope(envelope,'dressing consumers'),true);
  const rows=state.world.dressing?.rows||[];
  assert.ok(!rows.includes(old),'real Continue replaced the old table identity');
  const isolated={world:state.world,entities:new Map()};
  const retained=Array.from(currentSolidDressingRows(isolated));
  const expected=!retained.some(row=>segmentHitsProxy(row,actor.pos,aim));
  assert.equal(witnessLineOfSight(isolated,actor,aim),expected,'LOS reads the regenerated table, not the old plan');
  const restoredActor=state.entities.get(actor.id) || state.entities.get(state.playerId);
  if (restoredActor) {
   const seen=lane.host.sim.helpers.aiSensors.frameFor(restoredActor.id,2).contacts;
   assert.equal(seen.some(c=>c.id===old.id&&!rows.some(r=>r.id===c.id)),false,'no old cold contact survives');
   const restoredFrame=lane.host.sim.helpers.aiSensors.frameFor(restoredActor.id,2);
   const remembered=memory.observe(restoredActor.id,restoredFrame,2).contacts;
   assert.equal(remembered.some(c=>c.id===old.id&&!rows.some(r=>r.id===c.id)),false,'Continue clears old cold memory');
  }
 } finally {lane.shutdown();}
});
