import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { missions } from '../src/systems/missions.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { stampCaptainIdentity } from '../src/systems/captainMemory.js';
import { noteStandingOrderCompletion } from '../src/systems/captainStandingOrders.js';
import { survivorPod, shouldEjectCausalSurvivorPod } from '../src/systems/survivorPod.js';
import { makeEntity } from '../src/core/entity.js';
import { save } from '../src/save/saveSystem.js';

function boot({ pods = false } = {}) {
  const state = createGameState(4242), bus = createBus();
  state.meta.seed = 4242; state.mode = 'flight'; state.playerId = 1;
  state.story = { beatIndex: 7, branch: 'traders', flags: {}, chainProgress: 0 };
  state.world.currentSectorId = 'sector_helios_prime';
  for (const sector of SECTORS) state.world.sectors[sector.id] = { ...sector, owner: sector.factionId };
  state.entities = new Map(); state.entityList = [];
  state.settings.gameplay.tutorialHints = false;
  state.factions = Object.fromEntries(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free'].map(id => [id, { rep: 500 }]));
  const helpers = { hash32, queryRadius: () => [] };
  const owners = { traffic: Object.create(traffic), npcJobsRuntime: Object.create(npcJobsRuntime), missions: Object.create(missions) };
  if (pods) owners.survivorPod = Object.create(survivorPod);
  const registry = { get: name => owners[name] || null };
  // Match authoritativeSystemManifest: ejection is nested inside death BEFORE traffic's listener.
  if (pods) owners.survivorPod.init({ state, bus, helpers, registry });
  owners.npcJobsRuntime.init({ state, bus, helpers, registry });
  owners.traffic.init({ state, bus, helpers, registry });
  owners.missions.init({ state, bus, helpers, registry });
  return { state, bus, helpers, ...owners };
}

function captain(rt, id = 100) {
  const entity = { ...makeShipEntitySpec('ship_mule', { team: 2, factionId: 'faction_mts', pos: { x: 0, z: 0 } }), id, alive: true };
  entity.data = { ...entity.data, worldRecordId: `record-hauler-${id}`, trafficRole: 'hauler',
    trafficLabel: 'Relief hauler', homeSectorId: 'sector_helios_prime' };
  rt.state.entities.set(id, entity); rt.state.entityList.push(entity);
  stampCaptainIdentity(rt.state, entity);
  return entity;
}

test('4242: a rescued civilian returns three days later as a named standing client on the real board, including after reload', () => {
  const rt = boot(), entity = captain(rt);
  rt.bus.emit('freight:recovery', { entityId: entity.id, stationId: 'station_helios', receiptId: 'rescue-4242' });
  const row = rt.state.traffic.captainRoster[0];
  assert.equal(row.outcomes.rescued, 1);
  assert.equal(rt.missions.ensureBoard('station_helios').slots.some(offer => offer.giverId === row.id), false);
  rt.state.simTime = 1801;
  const offer = rt.missions.ensureBoard('station_helios').slots.find(offer => offer.giverId === row.id);
  assert.ok(offer); assert.match(offer.title, new RegExp(row.name)); assert.equal(offer.type, 'cargo_delivery');
  assert.notEqual(offer.destStationId, offer.stationId);
  const savedTraffic = JSON.parse(JSON.stringify(rt.traffic.serialize()));
  const savedMissions = JSON.parse(JSON.stringify(rt.missions.serialize()));
  const restored = boot(); restored.state.simTime = 1801;
  restored.traffic.deserialize(savedTraffic); restored.missions.deserialize(savedMissions);
  assert.ok(restored.missions.ensureBoard('station_helios').slots.some(offer => offer.giverId === row.id));
  assert.equal(restored.state.traffic.captainRoster[0].name, row.name);
  // Completion rotates only missions' cycle; the captain memory owner is left intact.
  const accepted = restored.missions._instanceFromOffer(offer);
  assert.equal(accepted.giverId, row.id); assert.equal(accepted.chainNextSeed, null);
  noteStandingOrderCompletion(restored.state, accepted);
  assert.equal(restored.state.missions.captainOrderCycles[row.id].cycle, 1);
  assert.equal(restored.state.traffic.captainRoster[0].outcomes.rescued, 1);
});

test('4242: robbing a captain replans the physical job off the robbed lane and the route survives reload', () => {
  const rt = boot(), entity = captain(rt);
  const original = [{ id: 'origin', pos: { x: 0, z: 0 } }, { id: 'destination', pos: { x: 1600, z: 0 } }];
  const jobId = rt.helpers.npcJobs.assign(entity, { kind: 'hauler', sectorId: 'sector_helios_prime', route: original, speed: 60 });
  assert.ok(jobId);
  rt.bus.emit('freight:cargoSpilled', { carrierId: entity.id, attackerId: rt.state.playerId, receiptId: 'rob-4242', qty: 2 });
  const entry = rt.helpers.npcJobs.get(jobId);
  assert.equal(entry.job.route.length, 3);
  assert.equal(Math.abs(entry.job.route[1].pos.z), 650);
  assert.equal(rt.state.traffic.captainRoster[0].outcomes.robbed, 1);
  const savedJobs = JSON.parse(JSON.stringify(rt.npcJobsRuntime.serialize()));
  const savedTraffic = JSON.parse(JSON.stringify(rt.traffic.serialize()));
  rt.npcJobsRuntime.deserialize(savedJobs); rt.traffic.deserialize(savedTraffic);
  assert.equal(rt.helpers.npcJobs.get(jobId).job.route.length, 3);
  assert.equal(rt.state.traffic.captainRoster[0].avoidsPlayerLane, true);
});

test('4242: killed captains and rescued pods retain identity and the consequential roster stays at 24', () => {
  const rt = boot(), entity = captain(rt);
  rt.bus.emit('entity:killed', { id: entity.id, killerId: rt.state.playerId });
  assert.equal(rt.state.traffic.captainRoster[0].alive, false);
  const pod = { id: 900, data: {} }; rt.state.entities.set(pod.id, pod);
  rt.bus.emit('survivorPod:ejected', { victimId: entity.id, entityId: pod.id });
  rt.state.entities.delete(entity.id);
  rt.bus.emit('survivorPod:rescued', { entityId: pod.id, playerAnswered: true, id: 'rescued-pod-4242' });
  assert.equal(rt.state.traffic.captainRoster[0].outcomes.rescued, 1);
  assert.equal(rt.state.traffic.captainRoster[0].alive, true);
  for (let id = 101; id < 131; id++) {
    const next = captain(rt, id);
    rt.bus.emit('freight:recovery', { entityId: next.id, receiptId: `rescue-${id}` });
  }
  assert.equal(rt.state.traffic.captainRoster.length, 24);
  rt.traffic.deserialize(JSON.parse(JSON.stringify(rt.traffic.serialize())));
  assert.equal(rt.state.traffic.captainRoster.length, 24);
});

test('4242 AL-LG-16: the third contract of one type at one station pins a regular client on the next Helios board', () => {
  const rt = boot();
  const template = { stationId: 'station_helios', type: 'cargo_delivery', destStationId: 'station_coalition',
    destSectorId: 'sector_helios_prime', params: { cmdtyId: 'cmdty_food', qty: 2 },
    preloadedCargo: true, reward_cr: 300, collateral_cr: 0, riskTier: 1, minRep: 0, factionId: 'faction_mts' };
  const complete = id => {
    const mission = rt.missions._instanceFromOffer({ ...template, id, title: 'Ordinary relief contract' });
    rt.state.missions.active.push(mission);
    rt.missions._completeMission(mission, rt.state.missions.active.length - 1);
  };
  for (let index = 0; index < 2; index++) complete(`ordinary-${index}`);
  assert.equal(rt.missions.ensureBoard('station_helios').slots.some(row => row.cause?.tag === 'standing_client'), false);
  complete('ordinary-2');
  const board = rt.missions.ensureBoard('station_helios');
  assert.equal(board.slots.filter(row => row.cause?.tag === 'standing_client').length, 1);
  assert.equal(board.slots.find(row => row.cause?.tag === 'standing_client').type, template.type);
  rt.state.simTime += 6000;
  rt.missions.deserialize(JSON.parse(JSON.stringify(rt.missions.serialize())));
  assert.equal(rt.missions.ensureBoard('station_helios').slots.filter(row => row.cause?.tag === 'standing_client').length, 1);
});

// Bounded headless lifecycle: real bus, pod producer/settlement, traffic and board owners.
// The map/list entity host below does not claim native towing or a whole Save/Continue route.
const jsonCopy = value => JSON.parse(JSON.stringify(value));
function removeResident(rt, entity) {
  rt.state.entities.delete(entity.id);
  rt.state.entityList.splice(rt.state.entityList.indexOf(entity), 1);
}
function resident(rt, spec) {
  const entity = makeEntity(spec);
  rt.state.entities.set(entity.id, entity); rt.state.entityList.push(entity);
  return entity;
}
function ejectCaptain(rt, preRemembered = false) {
  rt.state.nextEntityId = 1000;
  let entity;
  for (let id = 100; id < 200; id++) {
    entity = captain(rt, id);
    if (shouldEjectCausalSurvivorPod(rt.state, entity)) break;
    removeResident(rt, entity); entity = null;
  }
  assert.ok(entity, 'seeded ordinary captain passes the real ejection roll');
  if (preRemembered) rt.bus.emit('freight:cargoSpilled', {
    carrierId: entity.id, attackerId: rt.state.playerId, receiptId: 'earlier-robbery',
  });
  const remembered = [], ejections = [];
  rt.bus.on('captain:remembered', event => remembered.push(event));
  rt.bus.on('survivorPod:ejected', event => ejections.push({
    event, rows: jsonCopy(rt.state.traffic.captainRoster || []), remembered: remembered.length,
  }));
  entity.alive = false;
  rt.bus.emit('entity:killed', { id: entity.id, type: 'ship', killerId: rt.state.playerId });
  assert.equal(ejections.length, 1, 'real death producer ejected exactly one pod');
  const pod = rt.state.entities.get(ejections[0].event.entityId);
  const row = rt.state.traffic.captainRoster.find(item => item.id === entity.data.captainId);
  removeResident(rt, entity);
  return { entity, pod, row, ejections, remembered };
}
function settlePod(rt, pod, playerAnswered = true) {
  const pos = { x: pod.pos.x, z: pod.pos.z };
  resident(rt, { id: 1, type: 'ship', pos, data: {} });
  resident(rt, { id: 2, type: 'ship', pos, data: { trafficRole: 'rescue' } });
  rt.state.player.tether = { active: playerAnswered, targetId: playerAnswered ? pod.id : null };
  const receipts = [], grants = [];
  rt.bus.on('survivorPod:rescued', event => receipts.push(event));
  rt.bus.on('economy:grantCredits', event => grants.push(event));
  rt.survivorPod.update(0, rt.state);
  assert.equal(receipts.length, 1);
  return { receipt: receipts[0], grants };
}

for (const preRemembered of [false, true]) {
  test(`4242: real nested ejection binds a ${preRemembered ? 'remembered' : 'first-met'} captain without inventing an outcome`, () => {
    const rt = boot({ pods: true });
    const { entity, pod, row, ejections, remembered } = ejectCaptain(rt, preRemembered);
    const atEjection = ejections[0].rows.find(item => item.id === row.id);
    assert.ok(atEjection, 'ejection can precede the first remembered outcome');
    assert.deepEqual(atEjection.outcomes, { rescued: 0, robbed: Number(preRemembered), killed: 0 });
    assert.equal(ejections[0].remembered, 0, 'association emits no fictional remembered event');
    assert.equal(pod.data.captainPodKey, row.podKey);
    assert.ok(row.podKey);
    assert.equal(row.alive, false); assert.equal(row.outcomes.killed, 1);
    assert.deepEqual(remembered.map(event => event.outcome), ['killed']);
    assert.equal(rt.state.entities.has(entity.id), false);
    const { receipt, grants } = settlePod(rt, pod);
    assert.equal(receipt.playerAnswered, true);
    assert.equal(grants.length, 1);
    assert.equal(row.outcomes.rescued, 1); assert.equal(row.outcomes.robbed, Number(preRemembered));
    assert.equal(row.alive, true);
    assert.equal(rt.state.entities.has(pod.id), false, 'real producer retires the original pod');
    const afterRescue = jsonCopy(row);
    rt.state.simTime = 30;
    rt.bus.emit('survivorPod:rescued', receipt);
    assert.deepEqual(row, afterRescue, 'late duplicate cannot reschedule or count another rescue');
    rt.state.simTime = 1799;
    assert.equal(rt.missions.ensureBoard('station_helios').slots.some(offer => offer.giverId === row.id), false);
    rt.state.simTime = 1800;
    assert.equal(rt.missions.ensureBoard('station_coalition').slots.some(offer => offer.giverId === row.id), false);
    const offer = rt.missions.ensureBoard('station_helios').slots.find(offer => offer.giverId === row.id);
    assert.ok(offer); assert.equal(offer.clientId, entity.data.captainId);
    assert.equal(offer.title, `${entity.data.captainName} — standing relief run`);
    assert.equal(offer.source, 'captainStandingOrder'); assert.equal(offer.type, 'cargo_delivery');
    assert.equal(offer.reward_cr, 360); assert.equal(offer.params.cmdtyId, 'cmdty_food');
    assert.equal(offer.params.qty, 2); assert.equal(offer.preloadedCargo, true);
  });
}

for (const duplicateEjection of [false, true]) {
test(`4242: serialized original pod outranks a remembered reused victim after remap${duplicateEjection ? ' and duplicate ejection' : ''}`, () => {
  const rt = boot({ pods: true }), { entity, pod, row } = ejectCaptain(rt, true);
  const savedTraffic = jsonCopy(rt.traffic.serialize());
  const savedPods = jsonCopy(rt.survivorPod.serialize());
  const savedEntities = jsonCopy(save._serializeEntities.call({ state: rt.state }));
  assert.equal(savedEntities.persistent.length, 1);
  assert.equal(savedEntities.persistent[0].data.captainPodKey, row.podKey);
  const restored = boot({ pods: true });
  restored.traffic.deserialize(savedTraffic); restored.survivorPod.deserialize(savedPods);
  const unrelated = captain(restored, entity.id);
  unrelated.data.worldRecordId = 'unrelated-record';
  unrelated.data.captainId = 'captain:unrelated-record'; unrelated.data.captainName = 'Unrelated captain';
  restored.bus.emit('freight:cargoSpilled', {
    carrierId: unrelated.id, attackerId: restored.state.playerId, receiptId: 'unrelated-robbery',
  });
  const otherRow = restored.state.traffic.captainRoster.find(item => item.id === unrelated.data.captainId);
  const otherBefore = jsonCopy(otherRow);
  // Occupy the saved pod's numeric slot too. The actual persistent spawn method must remap it.
  resident(restored, { id: pod.id, type: 'ship', pos: { x: 5000, z: 5000 }, data: {} });
  restored.state.nextEntityId = 2000;
  const remap = new Map();
  save._spawnPersistentEntities.call({ state: restored.state, helpers: {
    spawnEntity(spec) { return resident(restored, { ...spec, id: spec.id ?? restored.state.nextEntityId++ }); },
  } }, savedEntities.persistent, remap);
  const restoredPod = restored.state.entities.get(remap.get(String(pod.id)));
  assert.notEqual(restoredPod.id, pod.id);
  assert.equal(restoredPod.data.survivorPodCausal.victimId, entity.id, 'historical provenance remains stale');
  assert.equal(restoredPod.data.captainPodKey, row.podKey, 'durable binding survives the real serializer');
  // Duplicate ejection with a now-reused victim ID must not relabel the original pod.
  if (duplicateEjection) restored.bus.emit('survivorPod:ejected', { victimId: unrelated.id, entityId: restoredPod.id });
  assert.equal(restoredPod.data.captainPodKey, row.podKey);
  assert.deepEqual(otherRow, otherBefore);
  const original = restored.state.traffic.captainRoster.find(item => item.id === row.id);
  const { receipt } = settlePod(restored, restoredPod);
  assert.equal(original.outcomes.rescued, 1); assert.equal(original.alive, true);
  assert.deepEqual(otherRow, otherBefore);
  const afterRescue = jsonCopy(original);
  restored.state.simTime = 50; restored.bus.emit('survivorPod:rescued', receipt);
  assert.deepEqual(original, afterRescue); assert.deepEqual(otherRow, otherBefore);
});
}

test('4242: unattended real rescue never grants the captain standing-client credit', () => {
  const rt = boot({ pods: true }), { pod, row } = ejectCaptain(rt);
  const before = jsonCopy(row), { receipt, grants } = settlePod(rt, pod, false);
  assert.notEqual(receipt.playerAnswered, true); assert.equal(grants.length, 0);
  assert.deepEqual(row, before);
  rt.state.simTime = 1800;
  assert.equal(rt.missions.ensureBoard('station_helios').slots.some(offer => offer.giverId === row.id), false);
});

for (const binding of ['missing', 'unknown', 'ambiguous', 'evicted']) {
  test(`4242: ${binding} pod binding cannot credit an unrelated reused victim ID`, () => {
    const rt = boot({ pods: true }), { entity, pod, row } = ejectCaptain(rt, true);
    const unrelated = captain(rt, entity.id);
    unrelated.data.worldRecordId = 'reused-record'; unrelated.data.captainId = 'captain:reused-record';
    rt.bus.emit('freight:cargoSpilled', {
      carrierId: unrelated.id, attackerId: rt.state.playerId, receiptId: 'reused-robbery',
    });
    if (binding === 'missing') delete pod.data.captainPodKey;
    if (binding === 'unknown') pod.data.captainPodKey = 'captain-pod:unknown';
    if (binding === 'ambiguous') rt.state.traffic.captainRoster.find(item => item.id === unrelated.data.captainId).podKey = row.podKey;
    if (binding === 'evicted') {
      for (let id = 300; id < 324; id++) {
        const next = captain(rt, id);
        rt.bus.emit('freight:cargoSpilled', { carrierId: next.id, attackerId: 1, receiptId: `cap-${id}` });
      }
      // Keep the reused actor remembered while the original binding remains evicted.
      rt.bus.emit('freight:cargoSpilled', { carrierId: unrelated.id, attackerId: 1, receiptId: 'reused-again' });
      assert.equal(rt.state.traffic.captainRoster.length, 24);
      assert.equal(rt.state.traffic.captainRoster.some(item => item.id === row.id), false);
    }
    const before = jsonCopy(rt.state.traffic.captainRoster);
    settlePod(rt, pod);
    assert.deepEqual(rt.state.traffic.captainRoster, before);
  });
}

test('4242: duplicate rescue while the bound pod still exists preserves its one receipt and due time', () => {
  const rt = boot({ pods: true }), { pod, entity, row } = ejectCaptain(rt);
  const receipt = { entityId: pod.id, victimId: entity.id, playerAnswered: true, id: 'same-pod-receipt' };
  rt.bus.emit('survivorPod:rescued', receipt);
  const once = jsonCopy(row);
  rt.state.simTime = 100; rt.bus.emit('survivorPod:rescued', receipt);
  assert.deepEqual(row, once); assert.equal(row.outcomes.rescued, 1);
  assert.equal(row.orderDueAtS, 1800); assert.ok(row.receiptIds.length <= 8);
});

test('4242: first ejection obeys the existing 24-captain roster cap without adding a fake outcome', () => {
  const rt = boot({ pods: true });
  for (let id = 300; id < 324; id++) {
    const entity = captain(rt, id);
    rt.bus.emit('freight:cargoSpilled', { carrierId: entity.id, attackerId: 1, receiptId: `prior-${id}` });
  }
  const firstId = rt.state.traffic.captainRoster[0].id;
  const { row, pod, ejections } = ejectCaptain(rt);
  assert.equal(ejections[0].rows.length, 24);
  assert.equal(rt.state.traffic.captainRoster.length, 24);
  assert.equal(rt.state.traffic.captainRoster.some(item => item.id === firstId), false);
  const associated = ejections[0].rows.find(item => item.id === row.id);
  assert.ok(associated); assert.equal(associated.podKey, pod.data.captainPodKey);
  assert.deepEqual(associated.outcomes, { rescued: 0, robbed: 0, killed: 0 });
  assert.equal(ejections[0].remembered, 0);
});

test('4242: non-pod encounter memory keeps its identity, duplicate receipt and bounded history behavior', () => {
  const rt = boot(), entity = captain(rt);
  const defended = { entityId: entity.id, outcome: 'defended', encounterId: 'defended-once' };
  rt.bus.emit('encounter:resolved', defended);
  const row = rt.state.traffic.captainRoster[0], once = jsonCopy(row);
  rt.state.simTime = 10; rt.bus.emit('encounter:resolved', defended);
  assert.deepEqual(row, once); assert.equal(row.outcomes.rescued, 1); assert.equal(row.alive, true);
  for (let i = 0; i < 12; i++) rt.bus.emit('encounter:resolved', {
    entityId: entity.id, outcome: 'robbed', encounterId: `robbed-${i}`,
  });
  assert.equal(row.outcomes.robbed, 12); assert.equal(row.receiptIds.length, 8);
  assert.equal(row.id, entity.data.captainId);
});
