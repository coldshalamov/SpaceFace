import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveText } from '../src/ui/sim/missionRecap.js';
import { cleanCylinderContact, cleanCylinderReply, CYLINDER_MESSAGE_ID } from '../src/ui/station/cleanCylinderConversation.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
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
    const spec = makeEnemySpawnSpec('mule_trader', 1, { x: T.entry.x, z: T.entry.z - 200 });
    spec.isPlayer = true; spec.team = 0; delete spec.data.ai;
    const player = sim.spawn(spec); state.playerId = player.id;
    sim.spawn({ type: 'station', pos: { x: 3000, z: 2000 }, data: { stationId: T.stationId, dockRadius: 90 } });
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

const spokenWords = s => String(s || '').trim().split(/\s+/).length;

test('M30 seed 4242: the recorded message names each settled outcome without paying or rewriting history', () => {
  for (const outcome of ['clean_delivery', 'contaminated_delivery', 'retreated']) {
    const f = runtime(), m = f.accept();
    f.match(m); f.step();
    if (outcome === 'retreated') { m.params.cleanCylinder.phase = 'retreat'; f.at(m, T.entry); f.step(); }
    else { if (outcome === 'contaminated_delivery') m.params.cleanCylinder.exposure = 0.7; f.arrive(m); }
    const receipt = f.state.missions.receipts.find(r => r.missionId === m.id);
    assert.equal(receipt.storyOutcome, outcome, 'the real settlement wrote the story outcome');
    const before = JSON.stringify({ story: f.state.story, missions: f.state.missions, credits: f.state.player.credits });
    const contact = cleanCylinderContact(f.state, T.stationId);
    assert.ok(contact, 'a settled run leaves one recorded message');
    assert.equal(contact.id, CYLINDER_MESSAGE_ID);
    assert.match(contact.roleLabel, /recorded message/);
    assert.ok(contact.choices.some(c => c.id === 'cylinder_after')
      && contact.choices.some(c => c.id === 'cylinder_receipt'));
    assert.ok(spokenWords(contact.line) <= 12, 'the greeting is one short line');
    const words = cleanCylinderReply(f.state, T.stationId, contact, 'cylinder_after').text;
    assert.ok(spokenWords(words) <= 12, 'the afterword is one short line');
    assert.match(words, outcome === 'retreated' ? /crossing is still out there/
      : outcome === 'clean_delivery' ? /clean cylinder/ : /will not call it clean/);
    const filed = cleanCylinderReply(f.state, T.stationId, contact, 'cylinder_receipt').text;
    assert.ok(spokenWords(filed) <= 12, 'the filed receipt answer is one short line');
    assert.match(filed, outcome === 'retreated' ? /300 cr/ : outcome === 'clean_delivery' ? /1,200 cr/ : /600 cr/);
    assert.match(cleanCylinderReply(f.state, T.stationId, contact, 'cylinder_bye').text, /engine note/);
    assert.equal(JSON.stringify({ story: f.state.story, missions: f.state.missions, credits: f.state.player.credits }),
      before, 'reading the message pays nothing and mints nothing');
    assert.equal(cleanCylinderContact(f.state, 'station_helios'), null, 'the message lives at the destination bar only');
    f.state.missions.receipts = [];
    assert.equal(cleanCylinderContact(f.state, T.stationId), null);
    assert.match(cleanCylinderReply(f.state, T.stationId, contact, 'cylinder_after').text, /no settled/);
  }
});

test('M30 seed 4242: the recorded message reaches the bar through the real contact list and reply path', () => {
  const f = runtime(), m = f.accept();
  f.match(m); f.step(); f.arrive(m);
  assert.equal(f.state.missions.receipts.find(r => r.missionId === m.id).storyOutcome, 'clean_delivery');
  f.state.ui.docked = true; f.state.ui.dockedStationId = T.stationId;
  const listed = generateContacts(T.stationId, f.state);
  const contact = listed.find(c => c.id === CYLINDER_MESSAGE_ID);
  assert.ok(contact, 'the settled run leaves its message on the real contact rail');
  assert.equal(listed.filter(c => c.id === CYLINDER_MESSAGE_ID).length, 1, 'one message, not a duplicated row');
  const ctx = { state: f.state, bus: f.bus };
  const spoken = buildReply(contact.role, 'cylinder_after', ctx, T.stationId, contact);
  assert.match(spoken.text, /clean cylinder/);
  const filed = buildReply(contact.role, 'cylinder_receipt', ctx, T.stationId, contact);
  assert.match(filed.text, /1,200 cr/);
  const before = JSON.stringify([f.state.missions, f.state.story, f.state.player.credits]);
  buildReply(contact.role, 'cylinder_bye', ctx, T.stationId, contact);
  assert.equal(JSON.stringify([f.state.missions, f.state.story, f.state.player.credits]), before,
    'the desk pays nothing and files nothing a second time');
  // A foreign contact clicking the same choice id never answers as the Shepherd's message.
  const host = listed.find(c => c.id !== CYLINDER_MESSAGE_ID);
  if (host) assert.notEqual(buildReply(host.role, 'cylinder_after', ctx, T.stationId, host).text, spoken.text);
  f.state.missions.receipts = [];
  assert.equal(generateContacts(T.stationId, f.state).some(c => c.id === CYLINDER_MESSAGE_ID), false,
    'the row leaves the rail with its receipt');
  assert.equal(buildReply(contact.role, 'cylinder_after', ctx, T.stationId, contact).text.includes('no settled'), true,
    'the same click fails closed once the record is gone');
});

test('M30 seed 4242: no message claims a pilot survived a failed or absent run', () => {
  const f = runtime(), m = f.accept();
  assert.equal(cleanCylinderContact(f.state, T.stationId), null, 'an active run has no afterword yet');
  f.charge(m).alive = false;
  f.bus.emit('entity:destroyed', { id: f.charge(m).id, pos: f.charge(m).pos, data: f.charge(m).data });
  assert.equal(m.status, 'failed');
  assert.equal(cleanCylinderContact(f.state, T.stationId), null, 'a destroyed charge files no recorded thanks');
});

test('M30 seed 4242: recap wording follows the real crossing, delivery and settled outcome', () => {
  const f = runtime(), m = f.accept();
  assert.equal(objectiveText(m), 'Join the charge at the entry refuge — within 420 u, relative speed below 12 u/s');
  f.match(m); f.step();
  f.at(m, T.exit); f.step();
  assert.equal(m.params.cleanCylinder.phase, 'delivery');
  f.step();
  assert.match(objectiveText(m), /BERTH/, 'the owner-written status reaches the recap');
  f.arrive(m);
  assert.equal(objectiveText(m), 'Delivered to Expanse — cylinder clean');
  const g = runtime(), gm = g.accept();
  g.match(gm); g.step();
  gm.params.cleanCylinder.exposure = 0.7;
  g.arrive(gm);
  assert.equal(objectiveText(gm), 'Delivered to quarantine — contaminated cylinder');
  const h = runtime(), hm = h.accept();
  hm.params.cleanCylinder.phase = 'retreat';
  assert.equal(objectiveText(hm), 'Return to the entry refuge together', 'retreat names its door before any drive tick');
  h.at(hm, { x: 1000, z: 1900 }); h.step();
  assert.match(objectiveText(hm), /RETREAT TO ENTRY REFUGE/, 'the owner-written retreat status reaches the recap');
  h.at(hm, T.entry); h.step();
  assert.equal(hm.status, 'completed');
  assert.equal(objectiveText(hm), 'Returned together to the entry refuge — crossing unfinished');
});
