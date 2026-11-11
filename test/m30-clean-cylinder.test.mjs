import { aiPorts } from '../src/systems/aiPorts.js';
import { sectorLocalToGlobalForSector, globalToSectorLocalForSector } from '../src/data/sectorCoordinates.js';
import { objectiveText, continueRecap } from '../src/ui/sim/missionRecap.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import { CYLINDER_MESSAGE_ID } from '../src/ui/station/cleanCylinderConversation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions } from '../src/systems/missions.js';
import { CLEAN_CYLINDER as T } from '../src/data/cleanCylinder.js';
import { shepherdFieldAt, tickMachineLayer } from '../src/systems/precursorMachines.js';
import { createSimulation } from '../src/core/sim.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

function runtime(offset = { x: 0, z: 0 }) {
  const state = createGameState(4242), events = [], listeners = new Map();
  const bus = {
    on(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
    emit(name, payload) { events.push({ name, payload }); for (const fn of listeners.get(name) || []) fn(payload); },
  };
  let nextId = 1;
  const helpers = { hash32, mulberry32, player: () => state.entities.get(state.playerId),
    spawnEntity(spec) {
      const e = makeEntity({ ...spec, id: nextId++ });
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
  };
  const global = p => ({ x: p.x + offset.x, z: p.z + offset.z });
  const world = { state, bus, helpers, active: { id: T.sectorId, pois: [], dressing: [] },
    _toGlobal: global, _toLocal: p => ({ x: p.x - offset.x, z: p.z - offset.z }) };
  const system = Object.create(missions);
  const registry = { get: name => name === 'world' ? world : name === 'missions' ? system : null };
  world.registry = registry;
  state.mode = 'flight'; state.world.currentSectorId = T.sectorId;
  state.world.activeSector = world.active; state.story.beatIndex = 2;
  state.settings.gameplay.tutorialHints = false;
  const player = helpers.spawnEntity({ type: 'ship', team: 0, isPlayer: true, pos: global({ x: 0, z: 0 }) });
  state.playerId = player.id;
  const station = helpers.spawnEntity({ type: 'station', pos: global({ x: 3000, z: 2000 }),
    data: { stationId: T.stationId, dockRadius: 90 } });
  system.init({ state, bus, helpers, registry });
  function step(dt = 0.1) { state.simTime += dt; state.tick++; system.update(dt, state); }
  function seconds(s) { for (let i = 0; i < Math.ceil(s * 10); i++) step(); }
  function accept() {
    bus.emit('dock:docked', { stationId: T.stationId });
    const offer = state.missions.boards[T.stationId].slots.find(o => o.id === T.id);
    assert.ok(offer, 'ordinary destination station board offers M30');
    bus.emit('ui:acceptMission', { missionId: offer.id });
    const mission = state.missions.active.find(m => m.params?.cleanCylinder);
    assert.ok(mission, 'ordinary accept intent starts escort');
    return mission;
  }
  function charge(m) { return state.entities.get(m._escorteeId); }
  function match(m, separation = 50) {
    const e = charge(m); player.pos.copy(e.pos); player.pos.x += separation;
    player.vel.copy(e.vel);
  }
  function at(m, local) { charge(m).pos.copy(global(local)); match(m); }
  function arrive(m) {
    at(m, T.exit); step();
    assert.equal(m.params.cleanCylinder.phase, 'delivery');
    charge(m).pos.copy(station.pos); match(m); step();
    bus.emit('dock:docked', { stationId: T.stationId });
  }
  return { state, events, bus, system, helpers, world, player, station, global, step, seconds, accept, charge, match, at, arrive };
}

test('M30 seed 4242: ordinary board offer, decline, physical join and velocity match', () => {
  const f = runtime();
  f.bus.emit('dock:docked', { stationId: T.stationId });
  assert.equal(f.state.missions.active.length, 0, 'reading/declining the board commits nothing');
  const m = f.accept(), c = m.params.cleanCylinder, lead = f.charge(m);
  f.step();
  assert.equal(c.joined, undefined);
  assert.equal(lead.data.intent.moveZ, 0, 'charge waits at entry refuge');
  f.match(m); f.player.vel.x = 90; f.step();
  assert.equal(c.matched, false, 'excess player speed is not a lane match');
  f.match(m); f.step();
  assert.equal(c.joined, true);
  assert.ok(lead.data.intent.moveZ > 0, 'the actual hull receives flight intent');
  assert.equal(shepherdFieldAt(f.state, T.sectorId, lead.pos.x, lead.pos.z), lead,
    'matching activates the existing moving suppression consumer');
  assert.equal(f.state.player.cargo.usedVolume, 0);
  assert.equal(f.events.some(e => e.name === 'economy:chargeCredits'), false);
  f.bus.emit('ui:abandonMission', { missionId: m.id });
  assert.equal(m.status, 'failed', 'ordinary abort remains available');
  assert.ok(f.system.ensureBoard(T.stationId).slots.some(o => o.id === T.id), 'abort leaves a fresh recovery attempt');
});

for (const fouled of [false, true]) {
  test(`M30 seed 4242: ${fouled ? 'fouled' : 'clean'} arrival settles once with an honest result`, () => {
    const f = runtime(), m = f.accept();
    f.match(m); f.step();
    if (fouled) { f.at(m, { x: 1000, z: 1900 }); f.player.pos.x += 900; f.seconds(60); }
    else { f.seconds(27); f.at(m, { x: 1000, z: 1900 }); f.seconds(20); }
    assert.equal(m.status, 'active', 'exposure is recoverable, never instant mission loss');
    assert.equal(m.params.cleanCylinder.exposure >= T.foulAt, fouled);
    f.arrive(m);
    assert.equal(m.status, 'completed');
    const receipt = f.state.missions.receipts.find(r => r.missionId === m.id);
    assert.equal(receipt.storyOutcome, fouled ? 'contaminated_delivery' : 'clean_delivery');
    assert.equal(receipt.rewardCr, fouled ? 600 : 1200);
    const pays = () => f.events.filter(e => e.name === 'economy:grantCredits');
    assert.equal(pays().length, 1);
    f.bus.emit('dock:docked', { stationId: T.stationId });
    f.system._settleEscortConvoyPay(m);
    assert.equal(pays().length, 1);
    assert.equal(f.state.missions.boards[T.stationId].slots.some(o => o.id === T.id), false);
  });
}

test('M30 seed 4242: a selected close repair restores a fouled charge mid-route', () => {
  const f = runtime(), m = f.accept(), c = m.params.cleanCylinder;
  f.at(m, { x: 1000, z: 1900 }); f.step(); f.player.pos.x += 900; f.seconds(60);
  assert.ok(c.exposure >= T.foulAt);
  f.at(m, { x: 1000, z: 1900 }); f.seconds(7);
  assert.ok(c.exposure >= T.foulAt, 'proximity alone cannot silently purge the charge');
  f.state.player.targetId = f.charge(m).id;
  f.seconds(3); f.player.vel.x = 40; f.step();
  assert.equal(c.repairS, 0, 'breaking the speed hold resets repair');
  f.match(m); f.seconds(6.1);
  assert.equal(c.exposure, 0); assert.equal(c.repairs, 1);
  assert.equal(f.charge(m).data.suppressionOffline, false);
  f.arrive(m);
  assert.equal(f.state.missions.receipts[0].storyOutcome, 'clean_delivery');
  assert.equal(f.state.missions.receipts[0].rewardCr, 1200);
});

test('M30 seed 4242: suppression spike is warned and returning together earns only recovery pay', () => {
  const f = runtime(), m = f.accept(), c = m.params.cleanCylinder;
  f.at(m, { x: 1000, z: 1900 }); f.seconds(29);
  assert.ok(f.events.some(e => e.name === 'comms:popup' && /spike in six seconds/.test(e.payload.text)));
  f.seconds(6);
  assert.equal(shepherdFieldAt(f.state, T.sectorId, f.charge(m).pos.x, f.charge(m).pos.z), null);
  f.match(m, -120); f.player.pos.z -= 120; f.player.vel.set(-10, 0, -10); f.seconds(2.1);
  assert.equal(c.phase, 'retreat');
  f.charge(m).pos.copy(f.global(T.entry)); f.player.pos.x += 1000; f.step();
  assert.equal(m.status, 'active', 'charge at refuge without the player cannot cash out');
  f.match(m); f.step();
  assert.equal(m.status, 'completed');
  assert.equal(f.state.missions.receipts[0].storyOutcome, 'retreated');
  assert.equal(f.state.missions.receipts[0].rewardCr, 300);
});

test('M30 seed 4242: save/reload mid-escort resumes condition, repair, fault and rebased pose', () => {
  const f = runtime({ x: 20000, z: -7000 }), m = f.accept(), c = m.params.cleanCylinder;
  f.at(m, { x: 900, z: 1750 }); f.seconds(35);
  f.state.player.targetId = f.charge(m).id; f.seconds(2);
  const snapshot = JSON.parse(JSON.stringify(f.system.serialize()));
  assert.equal(snapshot.active[0]._escorteeId, undefined);
  assert.equal(snapshot.active[0].params.cleanCylinder.pose.x, 900);
  const g = runtime({ x: -4000, z: 8000 });
  g.system.deserialize(snapshot);
  const resumed = g.state.missions.active.find(m => m.params?.cleanCylinder);
  g.system._ensureMissionTargets(resumed); g.match(resumed);
  assert.equal(resumed.params.cleanCylinder.crossingS, c.crossingS);
  assert.equal(resumed.params.cleanCylinder.exposure, c.exposure);
  assert.equal(resumed.params.cleanCylinder.repairS, c.repairS);
  assert.equal(g.charge(resumed).pos.x, -3100);
  assert.equal(g.charge(resumed).pos.z, 9750);
  g.state.player.targetId = g.charge(resumed).id; g.seconds(4.1);
  assert.equal(resumed.params.cleanCylinder.exposure, 0);
  assert.equal(resumed.params.cleanCylinder.faultRepaired, true);
  g.system._ensureMissionTargets(resumed);
  assert.equal(g.state.entityList.filter(e => e.alive && e.data?.cleanCylinderOf).length, 1);
  g.arrive(resumed);
  assert.equal(g.state.missions.receipts[0].rewardCr, 1200);
});

test('M30 seed 4242: machine tick cannot move the escort hull and destruction remains a real loss', () => {
  const f = runtime(), m = f.accept(), lead = f.charge(m);
  const before = lead.pos.clone();
  tickMachineLayer(f.world, 1);
  assert.equal(lead.pos.distanceTo(before), 0, 'missions emits intent; machine patrol cannot teleport the charge');
  lead.alive = false;
  f.bus.emit('entity:destroyed', { id: lead.id, pos: lead.pos, data: lead.data });
  assert.equal(m.status, 'failed');
  assert.equal(f.events.some(e => e.name === 'economy:grantCredits'), false);
});

test('M30 seed 4242: live V3/Rapier consumes escort intent and moves the charge down its lane', async () => {
  const sim = createSimulation({ seed: 4242, systems: [flightV3, physics, missions] });
  try {
    const { state } = sim;
    state.mode = 'flight'; state.world.currentSectorId = T.sectorId;
    state.settings.gameplay.tutorialHints = false;
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    const spec = makeEnemySpawnSpec('mule_trader', 1, sectorLocalToGlobalForSector({ x: T.entry.x, z: T.entry.z - 200 }, T.sectorId));
    spec.isPlayer = true; spec.team = 0; delete spec.data.ai;
    const player = sim.spawn(spec); state.playerId = player.id;
    sim.spawn({ type: 'station', pos: sectorLocalToGlobalForSector({ x: 3000, z: 2000 }, T.sectorId), data: { stationId: T.stationId, dockRadius: 90 } });
    const system = sim.registry.get('missions');
    system.ensureBoard(T.stationId);
    assert.equal(system.acceptMission(T.id), true);
    const m = state.missions.active.find(m => m.params?.cleanCylinder);
    const lead = state.entities.get(m._escorteeId), start = lead.pos.clone();
    sim.runTicks(300);
    assert.ok(lead.pos.distanceTo(start) > 20, 'production flight and physics move the real charge');
    assert.ok(lead.pos.x > start.x && lead.pos.z > start.z, 'motion is toward the exit refuge');
    assert.ok(lead.vel.length() < T.speed * 1.5, 'the existing Shepherd pace remains matchable');
  } finally { sim.dispose(); }
});


test('M30 production coordinate boundary names the sector and saves local poses exactly once', () => {
  const f=runtime(); f.world._toGlobal=sectorLocalToGlobalForSector; delete f.world._toLocal;
  const m=f.accept(), q=f.charge(m), expected=sectorLocalToGlobalForSector(T.entry,T.sectorId);
  assert.deepEqual({x:q.pos.x,z:q.pos.z},expected);
  assert.ok(Math.hypot(q.pos.x-T.entry.x,q.pos.z-T.entry.z)>1000);
  f.system._snapshotCleanCylinder(m);
  assert.equal(m.params.cleanCylinder.pose.x,T.entry.x);assert.equal(m.params.cleanCylinder.pose.z,T.entry.z);
  const saved=JSON.parse(JSON.stringify(f.system.serialize()));
  f.system.deserialize(saved);const resumed=f.state.missions.active[0];f.system._ensureMissionTargets(resumed);
  assert.equal(f.charge(resumed),q);assert.deepEqual({x:q.pos.x,z:q.pos.z},expected);
});

test('M30 adopts the actual damaged Continue body without pose, health or identity replacement', () => {
  const f=runtime(),m=f.accept(),q=f.charge(m);
  q.pos.x+=180;q.vel.x=5;q.hull=97;q.shield=12;q.armorHp=8;
  const identity=q.data.worldRecordId, before={pos:q.pos.clone(),vel:q.vel.clone(),hull:q.hull,shield:q.shield,armor:q.armorHp};
  const data=JSON.parse(JSON.stringify(f.system.serialize()));
  delete q.data.escortee;delete q.data.cleanCylinderOf;delete q.data.machine;
  q.data.ai={archetype:'fleeing_trader'};q.team=1;
  f.system.deserialize(data);const resumed=f.state.missions.active[0];
  for(let i=0;i<3;i++)f.system._ensureMissionTargets(resumed);
  assert.equal(f.charge(resumed),q);assert.equal(q.data.worldRecordId,identity);assert.equal(q.team,0);assert.deepEqual(q.data.ai,{passive:true,roe:'hold_fire'});
  assert.equal(q.data.escortee,'lead');assert.equal(q.data.machine.kind,'shepherd');
  assert.deepEqual({pos:q.pos,vel:q.vel,hull:q.hull,shield:q.shield,armor:q.armorHp},before);
  assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.cleanCylinderOf===m.id).length,1);
});

for(const invalid of ['missionId','identityKey','record','sector','slot','notShip']) test('M30 rejects conflicting Continue provenance: '+invalid,()=>{
  const f=runtime(),m=f.accept(),q=f.charge(m);delete q.data.escortee;m._escorteeId=null;m.targetEntityIds=[];
  if(invalid==='missionId')q.data.missionId='foreign';
  if(invalid==='identityKey')q.data.identityKey='mission:foreign:0';
  if(invalid==='record')q.data.worldRecordId='foreign-record';
  if(invalid==='sector')q.homeSectorId='sector_helios_prime';
  if(invalid==='slot')q.data.missionTargetSlot=1;
  if(invalid==='notShip')q.type='wreck';
  const before=JSON.stringify(q);f.system._adoptLiveMissionTargets(m);
  assert.equal(m._escorteeId,null);assert.deepEqual(m.targetEntityIds,[]);assert.equal(JSON.stringify(q),before);
});

test('M30 repair keeps the promised physical retreat available and reports its two-second lead',()=>{
  const f=runtime(),m=f.accept(),c=m.params.cleanCylinder;
  f.at(m,{x:1000,z:1900});f.seconds(29);f.state.player.targetId=f.charge(m).id;f.seconds(6.1);
  assert.equal(c.faultRepaired,true);assert.equal(c.exposure,0);
  f.match(m,-120);f.player.pos.z-=120;f.player.vel.set(-10,0,-10);f.seconds(1);
  assert.match(c.objective,/LEADING HOME 0\/2s|LEADING HOME 1\/2s/);assert.equal(objectiveText(m),c.objective);
  f.seconds(1.1);assert.equal(c.phase,'retreat');assert.match(objectiveText(m),/ENTRY REFUGE/);
  f.at(m,T.entry);f.step();assert.equal(f.state.missions.receipts[0].rewardCr,300);
});

test('M30 objective names the phase after a physical exit crossing and updates only owned navigation',()=>{
  const f=runtime(),m=f.accept();f.match(m);f.step();
  f.at(m,T.exit);f.step();assert.equal(m.params.cleanCylinder.phase,'delivery');assert.match(objectiveText(m),/BERTH/);
  const wp=JSON.stringify(f.state.nav.waypoint);assert.match(wp,/BERTH/);
  f.state.nav.waypoint={kind:'local',pos:{x:1,z:2}};const custom=JSON.stringify(f.state.nav.waypoint);
  m.params.cleanCylinder.exposure=.7;f.step();assert.equal(JSON.stringify(f.state.nav.waypoint),custom);
});

for(const outcome of ['clean_delivery','contaminated_delivery','retreated']) test('M30 '+outcome+' leaves one truthful local pilot message without paying or rewriting history',()=>{
  const f=runtime(),m=f.accept();f.match(m);f.step();
  if(outcome==='retreated'){m.params.cleanCylinder.phase='retreat';f.at(m,T.entry);f.step();}
  else {if(outcome==='contaminated_delivery')m.params.cleanCylinder.exposure=.7;f.arrive(m);}
  const before=JSON.stringify({story:f.state.story,missions:f.state.missions,credits:f.state.player.credits});
  const contacts=generateContacts(T.stationId,f.state),contact=contacts.find(c=>c.id===CYLINDER_MESSAGE_ID);assert.ok(contact);
  assert.match(contact.roleLabel,/recorded message/);
  const words=buildReply('pilot','cylinder_after',{state:f.state,bus:f.bus},T.stationId,contact).text;
  assert.match(words,outcome==='retreated'?/entry refuge/:outcome==='clean_delivery'?/clean cylinder/:/will not call it clean/);
  const receipt=buildReply('pilot','cylinder_receipt',{state:f.state,bus:f.bus},T.stationId,contact).text;
  assert.match(receipt,outcome==='retreated'?/300 cr/:outcome==='clean_delivery'?/1,200 cr/:/600 cr/);
  assert.equal(JSON.stringify({story:f.state.story,missions:f.state.missions,credits:f.state.player.credits}),before);
  assert.equal(generateContacts('station_helios',f.state).some(c=>c.id===CYLINDER_MESSAGE_ID),false);
  f.state.missions.receipts=[];assert.match(buildReply('pilot','cylinder_after',{state:f.state},T.stationId,contact).text,/no settled/);
});

test('M30 no message claims a pilot survived a failed or absent run',()=>{
 const f=runtime(),m=f.accept();assert.equal(generateContacts(T.stationId,f.state).some(c=>c.id===CYLINDER_MESSAGE_ID),false);
 f.charge(m).alive=false;f.bus.emit('entity:destroyed',{id:f.charge(m).id,data:f.charge(m).data});
 assert.equal(generateContacts(T.stationId,f.state).some(c=>c.id===CYLINDER_MESSAGE_ID),false);
});


test('M30 spawn and Continue keep tactical maneuver authority out of the mission-owned charge', () => {
  const f = runtime(), m = f.accept(), q = f.charge(m);
  const ports = Object.create(aiPorts); ports.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  const admitted = () => ports._listSquads(f.state.tick).some(s => s.members.some(e => e.id === q.id));
  assert.equal(admitted(), false, 'new charge has explicit passive mission authority');
  q.data.ai = {};
  assert.equal(admitted(), true, 'an empty AI is not inert in the production tactical roster');
  f.system._adoptLiveMissionTargets(m);
  assert.equal(admitted(), false, 'authenticated adoption restores passive authority');
});

test('M30 a purge during retreat keeps the entry refuge promise', () => {
  const f = runtime(), m = f.accept(), c = m.params.cleanCylinder;
  f.at(m, { x: 1000, z: 1900 }); f.step(); f.player.pos.x += 900; f.seconds(60);
  assert.ok(c.exposure >= T.foulAt);
  f.match(m, -120); f.player.pos.z -= 120; f.player.vel.set(-10, 0, -10); f.seconds(2.1);
  assert.equal(c.phase, 'retreat');
  f.match(m); f.state.player.targetId = f.charge(m).id; f.seconds(6.1);
  assert.equal(c.exposure, 0); assert.equal(c.phase, 'retreat');
  const text = f.events.filter(e => e.name === 'comms:popup' && e.payload.text.startsWith('Purge cycle complete')).at(-1).payload.text;
  assert.match(text, /entry refuge/); assert.doesNotMatch(text, /berth/);
});
