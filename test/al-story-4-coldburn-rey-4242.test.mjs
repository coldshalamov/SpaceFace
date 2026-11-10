import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { traffic } from '../src/systems/traffic.js';
import { missions } from '../src/systems/missions.js';
import { REY_CAPTAIN_ID } from '../src/systems/coldburnRey.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { cargo } from '../src/systems/cargo.js';

function boot() {
  const state = createGameState(4242), bus = createBus(), grants = [];
  state.meta.seed = 4242; state.mode = 'flight'; state.playerId = 1; state.player.credits = 50000;
  state.story = { beatIndex: 7, branch: 'traders', flags: {}, chainProgress: 0 };
  state.settings.gameplay.tutorialHints = false;
  state.world.currentSectorId = 'sector_helios_prime';
  for (const sector of SECTORS) state.world.sectors[sector.id] = { ...sector, owner: sector.factionId };
  state.factions = Object.fromEntries(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free'].map(id => [id, { rep: 500 }]));
  state.entities = new Map(); state.entityList = [];
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: -200, z: 0 }, data: {} });
  let nextId = 100;
  const helpers = { hash32, queryRadius: () => [], spawnEntity(spec) {
    const entity = { ...spec, id: nextId++, alive: true, data: { ...spec.data } };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } };
  for (const [stationId, x] of [['station_helios', 0], ['station_coalition', 1800]]) {
    helpers.spawnEntity({ type: 'station', radius: 100, pos: { x, z: 0 }, data: { stationId } });
  }
  state.ui.dockedStationId = 'station_helios';
  const owners = { traffic: Object.create(traffic), missions: Object.create(missions) };
  const registry = { get: name => owners[name] || null };
  owners.traffic.init({ state, bus, helpers, registry }); owners.missions.init({ state, bus, helpers, registry });
  bus.on('economy:grantCredits', payload => grants.push(payload));
  return { state, bus, helpers, grants, ...owners };
}

function accept(rt, stationId = 'station_helios') {
  rt.state.ui.dockedStationId = stationId;
  const offer = rt.missions.ensureBoard(stationId).slots.find(row => row.cause?.reyBid);
  assert.ok(offer, 'default mission board posts the competing bid');
  assert.equal(offer.cause.reyBid.rivalBidCr, 300 - Math.min(4,
    rt.state.traffic.captainRoster?.find(row => row.id === REY_CAPTAIN_ID)?.outcomes?.robbed || 0) * 15);
  const result = rt.missions.acceptMission(offer.id);
  assert.notEqual(result, false);
  const mission = rt.state.missions.active.find(row => row.cause?.reyBid);
  assert.ok(mission, 'normal accept path owns the supplied delivery');
  const rey = rt.state.entityList.find(entity => entity.alive !== false && entity.data?.coldburnRey);
  assert.ok(rey); assert.equal(rey.data.captainName, 'Coldburn Rey');
  return { mission, rey, offer };
}

function complete(rt, mission) {
  rt.missions._completeMission(mission, rt.state.missions.active.indexOf(mission));
  return rt.grants.find(row => row.reason === `mission:${mission.id}`)?.amount;
}

test('4242: Rey bids on a normal board and flies a real loaded hull; either carrier can earn the first receipt', () => {
  const fast = boot(), a = accept(fast);
  fast.traffic._coldburnRey.update(1 / 60);
  assert.equal(a.rey.data.intent.moveZ, 1);
  assert.equal(a.rey.data.cargoManifest.totalQty, 2);
  assert.equal(complete(fast, a.mission), 540, 'player arrives first: base delivery plus announced race bonus');
  assert.equal(fast.state.traffic.coldburnRey.races[0].winner, 'player');
  assert.equal(fast.state.traffic.coldburnRey.races[0].reyDelivered, undefined);
  a.rey.pos = { x: 1800, z: 0 }; fast.traffic._coldburnRey.update(1 / 60);
  assert.equal(fast.state.traffic.coldburnRey.races[0].reyDelivered, true, 'Rey finishes his work after losing the race');

  const slow = boot(), b = accept(slow);
  b.rey.pos = { x: 1800, z: 0 }; slow.traffic._coldburnRey.update(1 / 60);
  assert.equal(slow.state.traffic.coldburnRey.races[0].winner, 'rey');
  assert.equal(complete(slow, b.mission), 360, 'Rey wins through his hull arriving, not a forced player win');
});

test('4242: save/load retains the live race position and materializes one rival to continue it', () => {
  const rt = boot(), { mission, rey } = accept(rt);
  rey.pos = { x: 850, z: 30 }; rt.traffic._coldburnRey.update(1 / 60);
  const savedTraffic = JSON.parse(JSON.stringify(rt.traffic.serialize()));
  const savedMissions = JSON.parse(JSON.stringify(rt.missions.serialize()));
  const restored = boot(); restored.traffic.deserialize(savedTraffic); restored.missions.deserialize(savedMissions);
  restored.bus.emit('save:loaded', {}); restored.bus.emit('save:loaded', {});
  const rivals = restored.state.entityList.filter(entity => entity.alive !== false && entity.data?.coldburnRey);
  assert.equal(rivals.length, 1); assert.equal(rivals[0].pos.x, 850);
  assert.equal(restored.state.traffic.coldburnRey.races[0].missionId, mission.id);
  rivals[0].pos = { x: 1800, z: 0 }; restored.traffic._coldburnRey.update(1 / 60);
  assert.equal(restored.state.traffic.coldburnRey.races[0].winner, 'rey');
});

test('4242: robbery is physical freight loss, forfeits the bonus, and changes Rey’s next bid and route after reload; rescue is remembered', () => {
  const rt = boot(), { mission, rey } = accept(rt);
  rt.bus.emit('combat:damage', { targetId: rey.id, attackerId: rt.state.playerId, applied: 1 });
  assert.equal(rey.data.cargoManifest.totalQty, 1, 'the ordinary civilian violence path spills a real unit');
  assert.ok(rt.state.entityList.some(entity => entity.data?.ownerName === 'Coldburn Rey'
    && entity.data?.amount === 1));
  assert.equal(rt.state.traffic.captainRoster.find(row => row.id === REY_CAPTAIN_ID).outcomes.robbed, 1);
  assert.equal(complete(rt, mission), 360);
  rey.pos = { x: 1800, z: 0 }; rt.traffic._coldburnRey.update(1 / 60);
  rt.bus.emit('freight:recovery', { entityId: rey.id, stationId: 'station_coalition', receiptId: 'rey-rescued-4242' });
  assert.equal(rt.state.traffic.captainRoster.find(row => row.id === REY_CAPTAIN_ID).outcomes.rescued, 1);
  const savedTraffic = JSON.parse(JSON.stringify(rt.traffic.serialize()));
  const savedMissions = JSON.parse(JSON.stringify(rt.missions.serialize()));
  const restored = boot(); restored.state.simTime = 1200; restored.traffic.deserialize(savedTraffic);
  restored.missions.deserialize(savedMissions);
  const next = accept(restored, 'station_coalition');
  assert.equal(next.offer.cause.reyBid.rivalBidCr, 285);
  assert.ok(restored.state.traffic.coldburnRey.races.at(-1).detour);
  assert.match(next.offer.summary, /remembers the stolen hold/);
});

test('4242: normal V3 and Rapier fly Rey to the receiving station without pose injection or a timer deciding the winner', async () => {
  const raceTraffic = { ...traffic, update(dt) { this._coldburnRey.update(dt); } };
  const sim = createSimulation({ seed: 4242, systems: [cargo, raceTraffic, missions, flightV3, physics],
    updateOrder: [raceTraffic, flightV3, physics] });
  const { state } = sim;
  state.mode = 'flight'; state.meta.seed = 4242; state.player.credits = 50000;
  state.story = { beatIndex: 7, branch: 'traders', flags: {}, chainProgress: 0 };
  state.world.currentSectorId = 'sector_helios_prime';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.tutorialHints = false;
  state.factions.faction_scn = { rep: 500 };
  const observer = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 280, z: 400 },
    hull: 100, collides: false, physicsBody: false, data: {} });
  state.playerId = observer.id;
  for (const [stationId, x] of [['station_helios', 0], ['station_coalition', 1800]]) {
    sim.spawn({ type: 'station', radius: 100, pos: { x, z: 0 }, mass: 10000,
      collides: true, data: { stationId, dockRadius: 150 } });
  }
  state.ui.dockedStationId = 'station_helios';
  const missionOwner = sim.registry.get('missions');
  const offer = missionOwner.ensureBoard('station_helios').slots.find(row => row.cause?.reyBid);
  assert.ok(offer); missionOwner.acceptMission(offer.id);
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const rey = state.entityList.find(entity => entity.data?.coldburnRey);
  assert.ok(rey);
  const start = { ...rey.pos };
  let travel = 0;
  for (let tick = 0; tick < 60 * 120 && !state.traffic.coldburnRey.races[0].reyDelivered; tick++) {
    observer.pos.x = rey.pos.x + 100; observer.pos.z = rey.pos.z + 200;
    sim.step(SIM_DT);
    travel = Math.max(travel, Math.hypot(rey.pos.x - start.x, rey.pos.z - start.z));
  }
  assert.ok(travel >= 1000, `actual rival hull travelled ${travel.toFixed(1)} WU`);
  assert.equal(state.traffic.coldburnRey.races[0].winner, 'rey');
  assert.equal(state.traffic.coldburnRey.races[0].reyDelivered, true);
  sim.dispose();
});
