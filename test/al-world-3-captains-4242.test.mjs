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

function boot() {
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
  const registry = { get: name => owners[name] || null };
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
