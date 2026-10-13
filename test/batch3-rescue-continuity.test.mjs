import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { survivorPod, enforceCausalSurvivorPodCap } from '../src/systems/survivorPod.js';
import { traffic } from '../src/systems/traffic.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactLoadBoundary, stationLifeSaveProjection } from '../src/systems/stationContactLoadBoundary.js';
import { save } from '../src/save/saveSystem.js';
import { buildDockArrival } from '../src/ui/dockArrival.js';

function boot(t) {
  const state = createGameState(47);
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers });
  core.preStep(1 / 60, state);
  state.simTime = 40;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const player = helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, radius: 10,
    mass: 100, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  state.player.tether = { active: false, targetId: null };
  const sys = { ...survivorPod };
  sys.init({ state, bus, helpers });
  t.after(() => { sys.destroy(); core.destroy(); });
  function pod(index = 0) {
    const entity = helpers.spawnEntity({ type: 'payload', pos: { x: 20 + index * 8, z: 0 },
      radius: 5, mass: 24, hull: 40, hullMax: 40, flags: { persistent: true },
      data: { payloadType: 'survivor_pod', transientSector: false } });
    const rec = { entityId: entity.id, victimId: 800 + index, factionId: 'faction_scn',
      memoryId: `batch3-pod:${index}`, sectorId: 'sector_tethys_junction', phase: 'adrift',
      ejectedAt: 40, expireAt: 220, resolved: false };
    entity.data.survivorPodCausal = { ...rec };
    state.survivorPod.causal.byEntityId[entity.id] = rec;
    return entity;
  }
  function rescuer(extra = {}) {
    return helpers.spawnEntity({ type: 'ship', pos: { x: 20, z: 0 }, radius: 8,
      mass: 100, hull: 100, hullMax: 100, data: { trafficRole: 'rescue', ...extra } });
  }
  return { state, bus, helpers, player, sys, pod, rescuer };
}

test('a disabled rescue hull leaves a physical pod awaiting a working carrier', (t) => {
  const h = boot(t);
  const pod = h.pod();
  const rescue = h.rescuer();
  h.state.combat.entities = {};
  h.state.combat.entities[String(rescue.id)] = { capabilities: { drive: false } };
  const claims = [];
  h.bus.on('survivorPod:rescued', (event) => claims.push(event));
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.entities.get(pod.id), pod);
  assert.equal(claims.length, 0);
  h.state.combat.entities[String(rescue.id)].capabilities.drive = true;
  h.sys.update(1 / 60, h.state);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].rescueHullId, rescue.id);
  assert.equal(h.state.entities.has(pod.id), false);
});

test('a carrying rescue craft cannot silently consume a second survivor in the same tick', (t) => {
  const h = boot(t);
  const first = h.pod();
  const second = h.pod(1);
  const rescue = h.rescuer();
  const rec = { id: rescue.id, role: 'rescue', carryingSurvivor: false };
  h.state.traffic = { freighters: [rec] };
  const owner = { ...traffic, state: h.state, _sectorStations: () => [], _pickStation: () => null };
  h.bus.on('survivorPod:rescued', (event) => owner._onSurvivorPodRescued(event));
  h.sys.update(1 / 60, h.state);
  assert.equal(rec.carryingSurvivor, true);
  assert.equal(h.state.entities.has(first.id), false);
  assert.equal(h.state.entities.get(second.id), second);
  rec.carryingSurvivor = false; // native traffic delivery opens the passenger berth again
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.entities.has(second.id), false);
});

test('capped survivor residency preserves the actual player tow and retires unattended bodies', (t) => {
  const h = boot(t);
  const pods = Array.from({ length: 5 }, (_, index) => h.pod(index));
  h.state.player.tether = { active: true, targetId: pods[0].id };
  assert.equal(enforceCausalSurvivorPodCap(h.state, h.bus, 4, h.helpers), 1);
  assert.equal(h.state.entities.get(pods[0].id), pods[0]);
  assert.equal(h.state.entities.has(pods[1].id), false);
  assert.equal(h.state.entityIndex.payloads.length, 4);
  h.state.player.tether.active = false;
  assert.equal(enforceCausalSurvivorPodCap(h.state, h.bus, 3, h.helpers), 1);
  assert.equal(h.state.entities.has(pods[0].id), false);
});

function promoted(h) {
  const wreck = h.helpers.spawnEntity({ type: 'wreck', pos: { x: 60, z: 0 }, radius: 9,
    data: { salvagePointId: 'batch3-point', salvagePool: { cmdty_scrap_metal: 2 } } });
  const point = { id: 'batch3-point', entityId: wreck.id, sectorId: 'sector_tethys_junction',
    zoneId: 'zone_tethys_derelict', pos: { x: 60, z: 0 }, offered: false };
  h.state.salvage = { points: [point] };
  h.bus.emit('salvage:placed', { sectorId: point.sectorId });
  assert.ok(point.survivorPod);
  h.state.player.tether = { active: true, targetId: wreck.id };
  return { point, wreck };
}

test('a committed rescue cannot be stripped into an impossible active passenger contract', (t) => {
  const h = boot(t);
  const { point, wreck } = promoted(h);
  h.state.missions = { active: [] };
  h.bus.on('survivorPod:rescueSelected', () => h.state.missions.active.push({
    status: 'active', params: { survivorPodId: point.id },
  }));
  h.bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
  const strips = [], refusals = [], grants = [];
  h.bus.on('survivorPod:stripped', (event) => strips.push(event));
  h.bus.on('survivorPod:stripBlocked', (event) => refusals.push(event));
  h.bus.on('economy:grantCredits', (event) => grants.push(event));
  h.bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'strip' });
  assert.equal(refusals[0].reason, 'rescue_committed');
  assert.equal(strips.length, 0);
  assert.equal(grants.length, 0);
  assert.equal(wreck.alive, true);
  assert.equal(point.survivorPod.rescueSelected, true);
  h.state.missions.active[0].status = 'failed';
  h.bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'strip' });
  assert.equal(strips.length, 1, 'the ended commitment returns the other physical choice');
});

test('refused physical retirement cannot repeat a terminal rescue across tick or Continue', (t) => {
  const h = boot(t);
  const pod = h.pod();
  h.helpers.spawnEntity({ type: 'station', pos: { x: 20, z: 0 }, radius: 40,
    factionId: 'faction_scn', data: { stationId: 'station_test_medical' } });
  h.state.player.tether = { active: true, targetId: pod.id };
  let refuse = true;
  let attempts = 0;
  h.sys.helpers = { ...h.helpers, removeEntity: (...args) => {
    attempts += 1;
    return refuse ? false : h.helpers.removeEntity(...args);
  } };
  const grants = [], rep = [], outcomes = [];
  h.bus.on('economy:grantCredits', (event) => grants.push(event));
  h.bus.on('faction:repDelta', (event) => rep.push(event));
  h.bus.on('survivorPod:resolved', (event) => outcomes.push(event));
  h.sys.update(1 / 60, h.state);
  assert.equal(pod.data.survivorPodCausal.resolved, true);
  assert.equal(pod.data.survivorPodCausal.phase, 'rescued');
  assert.equal(grants.length, 1);
  h.sys.update(1 / 60, h.state);
  const savedCoordinator = h.sys.serialize();
  h.sys.deserialize(savedCoordinator);
  h.bus.emit('save:loaded', {});
  h.sys.update(1 / 60, h.state);
  assert.deepEqual([grants.length, rep.length, outcomes.length], [1, 1, 1]);
  assert.ok(attempts >= 3, 'refused retirement remains retryable');
  refuse = false;
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.entities.has(pod.id), false);
  assert.equal(h.state.entityIndex.payloads.includes(pod), false);
  assert.deepEqual([grants.length, rep.length, outcomes.length], [1, 1, 1]);
});

test('terminal retirement also drains a dead pod without skipping its adjacent terminal pod', (t) => {
  const h = boot(t);
  const pods = [h.pod(), h.pod(1)];
  for (const pod of pods) {
    pod.data.survivorPodCausal = { ...pod.data.survivorPodCausal, resolved: true, phase: 'abandoned' };
    pod.alive = false;
  }
  h.sys.update(1 / 60, h.state);
  assert.ok(pods.every((pod) => !h.state.entities.has(pod.id)));
});

test('a synchronous rescue observer cannot make late retirement remove a recycled civilian body', (t) => {
  const h = boot(t), pod = h.pod();
  h.helpers.spawnEntity({ type: 'station', pos: { x: 20, z: 0 }, radius: 40,
    factionId: 'faction_scn', data: { stationId: 'station_test_medical' } });
  h.state.player.tether = { active: true, targetId: pod.id };
  let replacement; let grants = 0;
  h.bus.on('economy:grantCredits', () => {
    grants++;
    h.sys.update(1 / 60, h.state); // The terminal stamp lets this tick retire the old pod.
    replacement = h.helpers.spawnEntity({ type: 'payload', pos: { x: 80, z: 0 }, hull: 40,
      data: { payloadType: 'cargo_pod', amount: 2, commodityId: 'cmdty_ore_iron' } });
    assert.equal(replacement.id, pod.id, 'the native allocator reuses the retired slot');
  });
  h.sys.update(1 / 60, h.state);
  assert.equal(grants, 1);
  assert.equal(h.state.entities.get(replacement.id), replacement);
  assert.equal(replacement.alive, true);
  assert.equal(replacement.data.amount, 2);
});

test('native player save and load boundary retain fresh station aftermath news and unclaimed rescue gossip', () => {
  const bus = createBus();
  const state = { simTime: 120, player: {}, world: { currentSectorId: 'sector_tethys_junction' } };
  const contacts = { ...stationContacts };
  const boundary = { ...stationContactLoadBoundary };
  contacts.init({ state, bus });
  boundary.init({ state, bus });
  try {
    bus.emit('recovery:completed', { outcome: 'rescue', recoveryId: 'batch3-returned-crew',
      sectorId: 'sector_tethys_junction' });
    bus.emit('encounter:resolved', { outcome: 'defended', encounterId: 'batch3-hauler-defended',
      shape: 'freighter', sectorId: 'sector_tethys_junction' });
    state.stationLife.traffic.push({ stationId: 'station_tethys', text: 'transient berth visit' });
    const playerSave = save._serializePlayer.call({ state });
    assert.equal(playerSave.stationLife.deeds.sector_tethys_junction.encounterId, 'batch3-hauler-defended');
    assert.equal(Object.hasOwn(playerSave.stationLife, 'traffic'), false);
    bus.emit('save:restoring', {});
    save._restorePlayer.call({ state }, JSON.parse(JSON.stringify(playerSave)));
    bus.emit('save:loaded', {});
    assert.equal(state.stationLife.rescueNotices.sector_tethys_junction.recordId, 'batch3-returned-crew');
    assert.equal(state.stationLife.deeds.sector_tethys_junction.outcome, 'defended');
    assert.equal(Object.hasOwn(state.player, 'stationLife'), false, 'transport ends at native owner');
    assert.deepEqual(state.stationLife.traffic, []);
    const view = buildDockArrival(state, { id: 'station_tethys', services: [] });
    assert.match(view.news, /DOCK LOG:.*defended/i, 'ordinary dock card hears the retained story');
    contacts.newGame();
    assert.deepEqual(state.stationLife.deeds, {});
    assert.deepEqual(state.stationLife.rescueNotices, {});
  } finally { boundary.destroy(); contacts.destroy(); }
});

test('station news save projection is bounded and refuses mismatched, stale and unsafe records', () => {
  const source = { traffic: ['do not persist'], rescueNotices: {}, deeds: {} };
  for (let index = 0; index < 30; index += 1) {
    const sectorId = `sector_${index}`;
    source.rescueNotices[sectorId] = { recordId: `rescued-${index}`, sectorId, simTime: index };
    source.deeds[sectorId] = { sectorId, outcome: 'defended', text: 'A hauler was defended.', simTime: index };
  }
  source.rescueNotices.bad = { recordId: 'wrong-pocket', sectorId: 'elsewhere', simTime: 1 };
  source.deeds.old = { sectorId: 'old', outcome: 'defended', text: 'Old.', simTime: 0 };
  const projected = stationLifeSaveProjection(source, 100);
  assert.equal(Object.keys(projected.rescueNotices).length, 16);
  assert.equal(Object.keys(projected.deeds).length, 8);
  assert.equal(Object.hasOwn(projected.rescueNotices, 'bad'), false);
  assert.equal(Object.hasOwn(projected, 'traffic'), false);
  assert.equal(stationLifeSaveProjection(source, 2000).deeds.old, undefined);
  assert.equal(Object.hasOwn(save._serializePlayer.call({ state: { player: {}, simTime: 0 } }), 'stationLife'), false);
});
