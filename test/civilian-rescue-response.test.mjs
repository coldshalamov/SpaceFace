import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  isCausalSurvivorPod,
  shouldEjectCausalSurvivorPod,
  survivorPod,
} from '../src/systems/survivorPod.js';
import { traffic } from '../src/systems/traffic.js';

const SECTOR_ID = 'sector_tethys_junction';

function boot({ withMotion = false } = {}) {
  const bus = createBus();
  const systems = withMotion
    ? [flightV3, physics, survivorPod, traffic]
    : [survivorPod, traffic];
  const sim = createSimulation({
    seed: 1818,
    bus,
    systems,
    updateOrder: systems,
  });
  const state = sim.state;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.playerId = null;

  function station(x = 650) {
    return sim.spawn({
      type: 'station',
      team: 2,
      factionId: 'faction_mts',
      pos: { x, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 45,
      mass: 1_000_000,
      hull: 5_000,
      hullMax: 5_000,
      collides: false,
      data: { stationId: 'station_rescue_home', sectorId: SECTOR_ID },
    });
  }

  function responder({ x, worldRecordId }) {
    const entity = sim.spawn(makeShipEntitySpec('ship_drifter', {
      team: 2,
      factionId: 'faction_mts',
      pos: { x, z: 0 },
      rot: Math.PI,
      ai: { archetype: 'passive', passive: true },
    }));
    entity.homeSectorId = SECTOR_ID;
    Object.assign(entity.data, {
      trafficRole: 'rescue',
      role: 'rescue',
      homeSectorId: SECTOR_ID,
      sectorId: SECTOR_ID,
      worldRecordId,
      durable: true,
    });
    return entity;
  }

  function track(entity, target) {
    const record = {
      id: entity.id,
      role: 'rescue',
      targetId: target.id,
      waitT: 0,
      nextTradeT: 5,
      dockSeq: 0,
      manifest: null,
    };
    state.traffic.freighters.push(record);
    return record;
  }

  function victimAt(x) {
    const victim = sim.spawn(makeShipEntitySpec('ship_mule', {
      team: 2,
      factionId: 'faction_mts',
      pos: { x, z: 0 },
      ai: { archetype: 'fleeing_trader', passive: true },
    }));
    victim.data.trafficRole = 'hauler';
    victim.data.role = 'hauler';
    for (let index = 0; index < 100; index++) {
      victim.data.worldRecordId = `wr_rescue_disaster_${index}`;
      if (shouldEjectCausalSurvivorPod(state, victim)) return victim;
    }
    assert.fail('fixture could not find a deterministic survivor ejection identity');
  }

  function kill(victim) {
    victim.alive = false;
    bus.emit('entity:killed', {
      id: victim.id,
      killerId: null,
      type: victim.type,
      pos: { x: victim.pos.x, z: victim.pos.z },
      vel: { x: victim.vel.x, z: victim.vel.z },
      factionId: victim.factionId,
      data: victim.data,
    });
    return state.entityList.find(isCausalSurvivorPod) || null;
  }

  function forcePod(x, victimId) {
    const podOwner = sim.registry.get('survivorPod');
    return podOwner._spawnCausalPod(state, {
      id: victimId,
      type: 'ship',
      alive: false,
      factionId: 'faction_mts',
      pos: { x, z: 0 },
      vel: { x: 0, z: 0 },
      data: { worldRecordId: `wr_force_${victimId}` },
    }, { pos: { x, z: 0 }, vel: { x: 0, z: 0 } });
  }

  return { sim, bus, state, station, responder, track, victimAt, kill, forcePod };
}

test('an ambient rescue craft physically closes from outside claim range, then resumes its station route', async () => {
  const h = boot({ withMotion: true });
  const home = h.station(650);
  const ambulance = h.responder({ x: 230, worldRecordId: 'wr_ambulance_route' });
  const record = h.track(ambulance, home);
  const rescued = [];
  h.bus.on('survivorPod:rescued', (payload) => rescued.push(payload));

  const physicsOwner = h.sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(h.state), true,
    'the route prepares the production-default Rapier authority');

  const victim = h.victimAt(0);
  const pod = h.kill(victim);
  assert.ok(pod, 'a real entity:killed disaster emits a physical survivor pod');
  const startingDistance = Math.hypot(ambulance.pos.x - pod.pos.x, ambulance.pos.z - pod.pos.z);
  assert.ok(startingDistance > 70, `response begins beyond the owner's 70 WU claim radius, got ${startingDistance}`);
  assert.equal(record.targetId, home.id, 'dispatch does not replace the original station target');

  let minimumDistance = startingDistance;
  let sawRescueIntent = false;
  for (let tick = 0; tick < 30 * 60 && rescued.length === 0; tick++) {
    h.sim.step(SIM_DT);
    const livePod = h.state.entities.get(pod.id);
    if (livePod && livePod.alive !== false) {
      minimumDistance = Math.min(minimumDistance,
        Math.hypot(ambulance.pos.x - livePod.pos.x, ambulance.pos.z - livePod.pos.z));
      const intent = ambulance.data.intent;
      if (intent && intent.moveZ === 1 && Math.cos(intent.aimAngle) < -0.8) sawRescueIntent = true;
    }
  }

  assert.equal(sawRescueIntent, true, 'traffic writes its ordinary forward/aim intent toward the real pod');
  assert.ok(minimumDistance < startingDistance - 80,
    `Flight V3 plus physics must produce real closing motion (${startingDistance} -> ${minimumDistance})`);
  assert.equal(rescued.length, 1, 'the existing pod owner resolves the physical interception once');
  assert.equal(rescued[0].reason, 'rescue_hull');
  assert.equal(rescued[0].rescueHullId, ambulance.id);
  assert.equal(h.state.entities.has(pod.id), false, 'the existing resolution owner disposes the pod');
  assert.equal(record.targetId, home.id, 'resolution preserves the original route');

  let resumed = false;
  for (let tick = 0; tick < 60 && !resumed; tick++) {
    h.sim.step(SIM_DT);
    const intent = ambulance.data.intent;
    resumed = !!intent && intent.moveZ === 1 && Math.cos(intent.aimAngle) > 0.8;
  }
  assert.equal(resumed, true, 'the same hull returns to its original station intent after resolution');
  if (typeof physicsOwner._disableSg02DynamicAuthority === 'function') physicsOwner._disableSg02DynamicAuthority();
});

test('dispatch is deterministic, one-to-one, and duplicate ejections do not steal responders', () => {
  const h = boot();
  const home = h.station();
  const near = h.responder({ x: 0, worldRecordId: 'wr_rescue_a' });
  const reserve = h.responder({ x: 300, worldRecordId: 'wr_rescue_c' });
  const far = h.responder({ x: 600, worldRecordId: 'wr_rescue_b' });
  for (const responder of [near, reserve, far]) h.track(responder, home);

  const first = h.forcePod(100, 801);
  const second = h.forcePod(500, 802);
  assert.ok(first && second);
  const owner = h.sim.registry.get('traffic');
  assert.equal(owner._rescueResponseByPod.get(first.id).responderId, near.id,
    'the nearest stable available rescue record takes the first pod');
  assert.equal(owner._rescueResponseByPod.get(second.id).responderId, far.id,
    'the second pod cannot steal the occupied nearest responder');
  assert.equal(owner._rescuePodByResponder.size, 2);

  h.bus.emit('survivorPod:ejected', {
    entityId: first.id,
    sectorId: SECTOR_ID,
    source: 'causal_eject',
  });
  assert.equal(owner._rescueResponseByPod.get(first.id).responderId, near.id,
    'a duplicate ejection is idempotent');

  // This test isolates responder reassignment; the real-disaster route above owns pod emission.
  // Mark this responder's crew outcome already handled so its destruction does not add a third pod.
  near.data.survivorPodEjected = true;
  near.alive = false;
  h.bus.emit('entity:killed', { id: near.id, type: near.type, data: near.data });
  assert.equal(owner._rescueResponseByPod.get(first.id).responderId, reserve.id,
    'destroying a responder releases and deterministically reassigns its still-live pod');
  assert.equal(owner._rescueResponseByPod.get(second.id).responderId, far.id);

  h.bus.emit('survivorPod:resolved', { entityId: second.id, sectorId: SECTOR_ID, outcome: 'rescued' });
  h.bus.emit('survivorPod:resolved', { entityId: second.id, sectorId: SECTOR_ID, outcome: 'rescued' });
  assert.equal(owner._rescueResponseByPod.has(second.id), false, 'duplicate resolution stays released');
  assert.equal(owner._rescuePodByResponder.has(far.id), false, 'the responder becomes route-available again');
});

test('a pod from another sector cannot borrow a local ambient responder', () => {
  const h = boot();
  const home = h.station();
  const responder = h.responder({ x: 0, worldRecordId: 'wr_rescue_local' });
  h.track(responder, home);
  const foreignPod = h.sim.spawn({
    type: 'payload',
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 5,
    mass: 24,
    hull: 40,
    hullMax: 40,
    data: {
      payloadType: 'survivor_pod',
      survivorPodCausal: { entityId: null, sectorId: 'sector_ceres_belt', phase: 'adrift', resolved: false },
    },
  });
  foreignPod.data.survivorPodCausal.entityId = foreignPod.id;
  h.bus.emit('survivorPod:ejected', {
    entityId: foreignPod.id,
    sectorId: 'sector_ceres_belt',
    source: 'causal_eject',
  });
  const owner = h.sim.registry.get('traffic');
  assert.equal(owner._rescueResponseByPod.has(foreignPod.id), false);
  assert.equal(owner._rescuePodByResponder.has(responder.id), false);
});
