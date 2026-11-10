import test from 'node:test';
import assert from 'node:assert/strict';
import { traffic } from '../src/systems/traffic.js';

function setup() {
  const events = [];
  const rescuer = { id: 11, type: 'ship', alive: true, pos: { x: 220, z: 0 }, rot: 0,
    data: { trafficRole: 'rescue' } };
  const station = { id: 40, type: 'station', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const rec = { id: rescuer.id, role: 'rescue', targetId: station.id, rescueTargetId: 51, rescueTargetType: 'pod' };
  const state = { simTime: 12, entities: new Map([[11, rescuer], [40, station]]), traffic: { freighters: [rec] } };
  const owner = { ...traffic, state, bus: { emit: (name, payload) => events.push({ name, payload }) },
    _sectorStations: () => [station], _pickStation: () => station };
  return { owner, state, rec, rescuer, station, events };
}

test('traffic does not invent delivery when the survivor owner cannot confirm custody', () => {
  const h = setup();
  h.owner._onSurvivorPodRescued({ entityId: 51, custodyId: 'survivor:51', rescueHullId: 11, reason: 'rescue_hull' });
  assert.equal(h.rec.carryingSurvivor, true);
  assert.equal(h.rec.rescueTargetId, 51, 'retain the survivor identity, not a null receipt');
  h.owner._stepRescue(h.rescuer, h.rec, [h.station], h.state, 0.1);
  assert.equal(h.events.filter(e => e.name === 'survivorPod:delivered').length, 0);
  h.rescuer.pos.x = 20;
  h.owner._stepRescue(h.rescuer, h.rec, [h.station], h.state, 0.1);
  const deliveries = h.events.filter(e => e.name === 'survivorPod:delivered');
  assert.equal(deliveries.length, 0);
  assert.equal(h.rec.carryingSurvivor, true);
  h.owner._stepRescue(h.rescuer, h.rec, [h.station], h.state, 0.1);
  assert.equal(h.events.filter(e => e.name === 'survivorPod:delivered').length, 0);
});

test('duplicate and unrelated pickup notices cannot replace a passenger in custody', () => {
  const h = setup();
  h.owner._onSurvivorPodRescued({ entityId: 51, custodyId: 'survivor:51', rescueHullId: 11, reason: 'rescue_hull' });
  h.owner._onSurvivorPodRescued({ entityId: 52, custodyId: 'survivor:52', rescueHullId: 11, reason: 'rescue_hull' });
  assert.equal(h.rec.rescueTargetId, 51);
  h.rec.carryingSurvivor = false;
  h.rec.role = 'hauler';
  h.owner._onSurvivorPodRescued({ entityId: 53, custodyId: 'survivor:53', rescueHullId: 11, reason: 'rescue_hull' });
  assert.equal(h.rec.carryingSurvivor, false);
});

test('a stale pickup cannot put a passenger on a recycled rescue hull', () => {
  const h = setup();
  h.rescuer.occupantGeneration = 8;
  h.owner._onSurvivorPodRescued({ entityId: 51, custodyId: 'survivor:51', rescueHullId: 11,
    rescueHullGeneration: 7, reason: 'rescue_hull' });
  assert.notEqual(h.rec.carryingSurvivor, true);
});


test('a player wreck marker is not treated as an unattended civilian survivor', () => {
  const h = setup();
  const playerWreck = { id: 70, type: 'payload', alive: true, pos: { x: 200, z: 0 },
    data: { payloadType: 'survivor_pod', playerWreck: true } };
  h.state.entityList = [h.rescuer, h.station, playerWreck];
  h.state.entities.set(playerWreck.id, playerWreck);
  assert.equal(h.owner._findNearbyRescueTarget(h.state, h.rescuer), null);
});

test('a busy or fleeing rescue hull cannot take a pod it cannot carry to safety', async () => {
  const { createBus } = await import('../src/core/eventBus.js');
  const { survivorPod } = await import('../src/systems/survivorPod.js');
  for (const condition of ['job', 'flee', 'untracked']) {
    const h = setup();
    h.state.mode = 'flight'; h.state.playerId = 1;
    h.state.world = { currentSectorId: 'sector_test' };
    h.state.player = { tether: { active: false } };
    h.state.ui = {};
    h.state.entityList = [h.rescuer, h.station];
    h.rescuer.pos.x = 200;
    const pod = { id: 51, type: 'payload', alive: true, pos: { x: 205, z: 0 },
      data: { payloadType: 'survivor_pod', survivorPodCausal: { entityId: 51, victimId: 9,
        sectorId: 'sector_test', memoryId: 'survivor:9', phase: 'adrift', expireAt: 100 } }, flags: {} };
    h.state.entityList.push(pod); h.state.entities.set(pod.id, pod);
    if (condition === 'job') h.rescuer.data.jobId = 'tender-job';
    else if (condition === 'flee') h.rec.violenceAlarmed = true;
    else h.state.traffic.freighters = [];
    const bus = createBus(); const sys = { ...survivorPod }; sys.init({ state: h.state, bus, helpers: {} });
    const rescued = []; const credits = [];
    bus.on('survivorPod:rescued', event => rescued.push(event));
    bus.on('economy:grantCredits', event => credits.push(event));
    sys.update(0.1, h.state);
    assert.equal(h.state.entities.get(51), pod, `${condition}: pod remains physical`);
    assert.equal(rescued.length, 0); assert.equal(credits.length, 0);
    sys.destroy();
  }
});
