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
function boardPod(rt, pod, playerAnswered = true) {
  const pos = { x: pod.pos.x, z: pod.pos.z };
  const player = rt.state.entities.get(1) || resident(rt, { id: 1, type: 'ship', pos, data: {} });
  player.pos = { ...pos };
  const station = resident(rt, { id: rt.state.nextEntityId++, type: 'station', hull: 1000,
    pos: { x: pos.x + 200, z: pos.z }, data: { stationId: 'station_helios', sectorId: rt.state.world.currentSectorId } });
  const rescuer = resident(rt, { ...makeShipEntitySpec('ship_kestrel', { team: 2, pos }),
    id: rt.state.nextEntityId++ });
  Object.assign(rescuer.data, { trafficRole: 'rescue', role: 'rescue', worldRecordId: `test-rescue:${rescuer.id}` });
  const rescueRecord = { id: rescuer.id, role: 'rescue', targetId: station.id, carryingSurvivor: false };
  rt.state.traffic.freighters.push(rescueRecord);
  rt.state.player.tether = { active: playerAnswered, targetId: playerAnswered ? pod.id : null };
  const receipts = [], grants = [], boarded = [];
  rt.bus.on('survivorPod:rescued', event => receipts.push(event));
  rt.bus.on('survivorPod:boarded', event => boarded.push(event));
  rt.bus.on('economy:grantCredits', event => grants.push(event));
  rt.survivorPod.update(0, rt.state);
  assert.equal(boarded.length, 1);
  assert.equal(receipts.length, 0, 'boarding does not settle the rescue');
  assert.equal(grants.length, 0, 'boarding does not pay a fee');
  const custody = rt.state.survivorPod.causal.receipts.find(row => row.id === boarded[0].custodyId);
  assert.equal(custody.outcome, 'in_transit');
  assert.equal(rt.state.entities.has(pod.id), false, 'the original pod is retired into custody');
  return { rescuer, rescueRecord, station: rt.state.entities.get(rescueRecord.targetId), custody, receipts, grants };
}
function deliverPod(rt, ride) {
  // Focused handoff geometry; the real traffic and survivor owners perform delivery.
  // This fixture does not claim a physically flown route.
  ride.rescuer.pos = { ...ride.station.pos };
  rt.traffic._stepRescue(ride.rescuer, ride.rescueRecord, [ride.station], rt.state, 0);
  assert.equal(ride.receipts.length, 1);
  assert.equal(ride.rescueRecord.carryingSurvivor, false);
  return { receipt: ride.receipts[0], grants: ride.grants };
}
function settlePod(rt, pod, playerAnswered = true) {
  return deliverPod(rt, boardPod(rt, pod, playerAnswered));
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
  rt.bus.emit('survivorPod:rescued', { ...receipt, playerAnswered: true, captainPodKey: row.podKey });
  assert.deepEqual(row, before, 'a replay cannot upgrade the canonical unattended receipt');
  rt.state.simTime = 1800;
  assert.equal(rt.missions.ensureBoard('station_helios').slots.some(offer => offer.giverId === row.id), false);
});

test('4242: saved custody carries the captain binding past recycled pod and victim slots', () => {
  const rt = boot({ pods: true }), { pod, row, entity } = ejectCaptain(rt);
  const ride = boardPod(rt, pod), key = row.podKey;
  assert.equal(ride.custody.survivor.captainPodKey, key);
  const saved = jsonCopy(rt.survivorPod.serialize());
  rt.survivorPod.deserialize(saved);
  assert.equal(rt.state.survivorPod.causal.receipts.find(item => item.id === ride.custody.id).survivor.captainPodKey, key);
  const unrelated = captain(rt, pod.id);
  rt.bus.emit('freight:cargoSpilled', { carrierId: unrelated.id, attackerId: 1, receiptId: 'recycled-pod-slot' });
  const other = rt.state.traffic.captainRoster.find(item => item.id === unrelated.data.captainId);
  other.podKey = 'captain-pod:another-person'; unrelated.data.captainPodKey = other.podKey;
  resident(rt, { id: entity.id, type: 'ship', pos: { x: 9000, z: 9000 }, data: { captainPodKey: other.podKey } });
  const otherBefore = jsonCopy(other);
  const { receipt, grants } = deliverPod(rt, ride);
  assert.equal(receipt.captainPodKey, key); assert.equal(grants.length, 1);
  assert.equal(row.outcomes.rescued, 1); assert.equal(row.alive, true);
  assert.deepEqual(other, otherBefore, 'numeric slots never replace the passenger identity');
  const once = jsonCopy(row);
  rt.state.simTime = 50;
  rt.bus.emit('survivorPod:rescued', { ...receipt, captainPodKey: other.podKey,
    receiptId: 'forged-second-receipt', victimId: unrelated.id, entityId: unrelated.id });
  assert.deepEqual(row, once, 'the owner receipt also controls duplicate suppression and due time');
  assert.deepEqual(other, otherBefore, 'a forged payload key cannot redirect a canonical rescue');
});

test('4242: a disabled carrier returns the same bound captain before a second real delivery', () => {
  const rt = boot({ pods: true }), { pod, row } = ejectCaptain(rt);
  const ride = boardPod(rt, pod), memoryId = ride.custody.id, key = row.podKey;
  rt.state.player.tether = { active: false, targetId: null };
  ride.rescuer.data.disabled = true;
  rt.survivorPod.update(0, rt.state);
  const returned = rt.state.entityList.filter(item => item.alive !== false
    && item.data?.survivorPodCausal?.memoryId === memoryId);
  assert.equal(returned.length, 1); assert.notEqual(returned[0].id, pod.id);
  assert.equal(returned[0].data.captainPodKey, key);
  assert.equal(returned[0].data.survivorPodCausal.captainPodKey, key);
  assert.equal(ride.custody.outcome, 'adrift'); assert.equal(row.alive, false);
  assert.equal(ride.receipts.length, 0); assert.equal(ride.grants.length, 0);
  const { receipt, grants } = settlePod(rt, returned[0]);
  assert.equal(receipt.id, memoryId); assert.equal(receipt.captainPodKey, key);
  assert.equal(row.outcomes.rescued, 1); assert.equal(row.alive, true); assert.equal(grants.length, 1);
});

test('4242: pending, unknown and ambiguous receipts cannot grant captain credit from a payload key', () => {
  const rt = boot({ pods: true }), { pod, row } = ejectCaptain(rt);
  const ride = boardPod(rt, pod), before = jsonCopy(row);
  const forged = { id: ride.custody.id, entityId: pod.id, captainPodKey: row.podKey, playerAnswered: true };
  rt.bus.emit('survivorPod:rescued', forged);
  rt.bus.emit('survivorPod:rescued', { ...forged, id: 'unknown-receipt' });
  assert.deepEqual(row, before, 'neither raw keys nor a pending owner receipt establish rescue');
  rt.state.survivorPod.causal.receipts.push({ ...ride.custody, outcome: 'rescued', playerAnswered: true,
    captainPodKey: row.podKey });
  rt.bus.emit('survivorPod:rescued', forged);
  assert.deepEqual(row, before, 'duplicate canonical IDs are ambiguous, even with a terminal-looking row');
});

test('4242: an old keyless terminal receipt cannot borrow a recycled live pod binding', () => {
  const rt = boot({ pods: true }), { pod, row } = ejectCaptain(rt);
  const ride = boardPod(rt, pod);
  delete ride.custody.survivor.captainPodKey;
  const unrelated = captain(rt, pod.id);
  rt.bus.emit('freight:cargoSpilled', { carrierId: unrelated.id, attackerId: 1, receiptId: 'other-occupant' });
  const other = rt.state.traffic.captainRoster.find(item => item.id === unrelated.data.captainId);
  other.podKey = 'captain-pod:unrelated-live-pod';
  unrelated.data.captainPodKey = other.podKey;
  unrelated.data.survivorPodCausal = { memoryId: 'different-passenger' };
  const before = jsonCopy(rt.state.traffic.captainRoster);
  const { receipt } = deliverPod(rt, ride);
  assert.equal(receipt.captainPodKey, undefined);
  assert.deepEqual(rt.state.traffic.captainRoster, before);
  assert.equal(row.alive, false);
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

test('a captain aboard a transient lifter survives production Continue, recovery and actual station delivery', { timeout: 20000 }, async () => {
  const { productionContinueFixture, nextHostTurn } = await import('./fixtures/production-continue-finalizer.mjs');
  const h = await productionContinueFixture();
  try {
    const { runtime, state, bus, registry } = h;
    const player = state.entities.get(state.playerId);
    const victim = runtime.spawn(makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_mts', pos: { x: player.pos.x + 400, z: player.pos.z },
    }));
    Object.assign(victim.data, { trafficRole: 'hauler', homeSectorId: 'sector_helios_prime' });
    for (let i = 0; i < 100; i++) {
      victim.data.worldRecordId = `custody-continue-captain:${i}`;
      if (shouldEjectCausalSurvivorPod(state, victim)) break;
    }
    assert.ok(shouldEjectCausalSurvivorPod(state, victim));
    const identity = stampCaptainIdentity(state, victim);
    const ejected = [], rescued = [], grants = [];
    bus.on('survivorPod:ejected', receipt => ejected.push(receipt));
    bus.on('survivorPod:rescued', receipt => rescued.push(receipt));
    bus.on('economy:grantCredits', intent => {
      if (String(intent.reason).startsWith('survivor_mayday:')) grants.push(intent);
    });
    victim.alive = false;
    bus.emit('entity:killed', { id: victim.id, type: 'ship', killerId: state.playerId,
      pos: { ...victim.pos }, vel: { ...victim.vel }, factionId: victim.factionId, data: victim.data });
    assert.equal(ejected.length, 1);
    const pod = state.entities.get(ejected[0].entityId);
    const key = pod.data.captainPodKey, memoryId = pod.data.survivorPodCausal.memoryId;
    const before = jsonCopy(state.traffic.captainRoster.find(row => row.id === identity.id));
    assert.equal(before.alive, false); assert.ok(key);
    const podOwner = registry.get('survivorPod'), trafficOwner = registry.get('traffic');
    const board = passenger => {
      const hull = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
        team: 2, factionId: 'faction_mts', pos: { x: passenger.pos.x + 24, z: passenger.pos.z },
      }));
      Object.assign(hull.data, { trafficRole: 'rescue', role: 'rescue', worldRecordId: `captain-lifter:${hull.id}` });
      const record = { id: hull.id, role: 'rescue', targetId: null, waitT: 0, carryingSurvivor: false };
      state.traffic.freighters.push(record);
      const currentPlayer = state.entities.get(state.playerId);
      Object.assign(currentPlayer.pos, passenger.pos); Object.assign(currentPlayer.vel, { x: 0, z: 0 });
      currentPlayer.flags.noInterp = true;
      state.player.tether = { ...state.player.tether, active: true, targetId: passenger.id, attachmentId: null };
      podOwner.update(0, state);
      assert.equal(state.entities.has(passenger.id), false);
      assert.equal(record.carryingSurvivor, true);
      assert.equal(rescued.length, 0); assert.equal(grants.length, 0);
      const custody = state.survivorPod.causal.receipts.find(row => row.id === memoryId);
      assert.equal(custody.outcome, 'in_transit');
      assert.equal(custody.survivor.captainPodKey, key);
      return { hull, record };
    };
    const firstRide = board(pod), firstCarrierIdentity = firstRide.hull.data.worldRecordId;
    // The real save envelope carries a passenger whose physical pod no longer exists.
    const envelope = h.saves.serialize('captain-aboard-continue');
    assert.equal(envelope.data.survivorPod.causalReceipts.find(row => row.id === memoryId).survivor.captainPodKey, key);
    assert.equal(await h.load(envelope), true);
    assert.deepEqual(await h.finalization(), { stale: false });
    await nextHostTurn();
    state.render.worldSubmittedFrames = (Number(state.render.worldSubmittedFrames) || 0) + 1;
    assert.equal(state.render.releaseOpeningPresentationHold(), true);
    assert.equal(state.entityList.some(entity => entity.alive !== false
      && entity.data?.worldRecordId === firstCarrierIdentity), false,
    'Continue does not invent the absent transient carrier');
    const recovered = state.entityList.filter(entity => entity.alive !== false
      && entity.data?.survivorPodCausal?.memoryId === memoryId);
    assert.equal(recovered.length, 1, 'the passenger returns as exactly one real pod');
    assert.equal(recovered[0].data.captainPodKey, key);
    assert.equal(recovered[0].data.survivorPodCausal.captainPodKey, key);
    assert.ok(registry.get('physics')._sg02.records.has(recovered[0].id), 'recovery pod enters native physics');
    assert.equal(rescued.length, 0); assert.equal(grants.length, 0);
    assert.deepEqual(state.traffic.captainRoster.find(row => row.id === identity.id), before);
    const secondRide = board(recovered[0]);
    const station = state.entities.get(secondRide.record.targetId);
    assert.equal(station?.type, 'station');
    // Focused station arrival, using real custody/delivery owners; no flown-route claim.
    Object.assign(secondRide.hull.pos, station.pos);
    assert.equal(trafficOwner._stepRescue(secondRide.hull, secondRide.record, trafficOwner._sectorStations(), state, 0), true);
    assert.equal(rescued.length, 1); assert.equal(grants.length, 1);
    assert.equal(rescued[0].id, memoryId); assert.equal(rescued[0].captainPodKey, key);
    const row = state.traffic.captainRoster.find(item => item.id === identity.id);
    assert.equal(row.alive, true); assert.equal(row.outcomes.rescued, 1);
    const once = jsonCopy(row);
    bus.emit('survivorPod:rescued', { ...rescued[0], receiptId: 'replayed-after-continue' });
    assert.deepEqual(row, once);
    assert.deepEqual(h.events.filter(event => event.name === 'save:error' || event.name === 'game:startFailed'), []);
  } finally { h.close(); }
});
