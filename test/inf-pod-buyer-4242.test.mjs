/**
 * Towing a mayday pod hands it only to the fence who buys pods.
 * Live stations stamp stationId and stationTypeId. The buyer is the fence record.
 * Seed 4242. Scar Bazaar is Ilsa Greve. Smuggler Den is Oriel Pask.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { ensureMoralMemory } from '../src/systems/moralMemory.js';
import {
  countLiveCausalSurvivorPods,
  survivorPod,
} from '../src/systems/survivorPod.js';

function boot(sectorId) {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 30,
    playerId: 1,
    meta: { seed: 4242 },
    nextEntityId: 500,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: sectorId },
    player: { tether: { active: false, targetId: null } },
    story: { flags: {} },
    ui: {},
  };

  function add(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }

  const player = add({
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 12,
    mass: 100,
    hull: 200,
    hullMax: 200,
    data: {},
    flags: {},
  });

  survivorPod.init({ state, bus, helpers: {}, registry: null });

  function towTo(station) {
    const id = (state.nextEntityId += 1);
    const victim = add({
      id,
      type: 'ship',
      team: 2,
      factionId: 'faction_mts',
      alive: true,
      pos: { x: 80, z: 20 },
      vel: { x: 4, z: -1 },
      radius: 14,
      mass: 160,
      hull: 10,
      hullMax: 100,
      data: { trafficRole: 'hauler', role: 'hauler', ai: { archetype: 'mule_trader', passive: true } },
      flags: {},
    });
    const pod = survivorPod._spawnCausalPod(state, victim, { pos: victim.pos, vel: victim.vel });
    assert.ok(pod);
    add(station);
    pod.pos.x = 8;
    pod.pos.z = 4;
    player.pos.x = 0;
    player.pos.z = 0;
    const ransomed = [];
    const credits = [];
    bus.on('survivorPod:ransomed', (payload) => ransomed.push(payload));
    bus.on('economy:grantCredits', (payload) => credits.push(payload));
    state.player.tether = { active: true, targetId: pod.id };
    bus.emit('tether:latched', { targetId: pod.id, ownerId: player.id });
    survivorPod.update(1 / 60, state);
    return { pod, ransomed, credits };
  }

  return {
    state,
    towTo,
    restore() {
      if (typeof survivorPod.destroy === 'function') survivorPod.destroy();
    },
  };
}

function berth(id, stationId, factionId, radius, legacyType) {
  const data = { stationId, stationTypeId: 'blackmarket', factionId };
  if (legacyType) data.stationType = legacyType;
  return {
    id,
    type: 'station',
    alive: true,
    factionId,
    pos: { x: 0, z: 0 },
    radius,
    data,
    flags: {},
  };
}

test('Scar Bazaar takes a towed mayday pod and this system pays nothing', () => {
  const h = boot('sector_kepler_scar');
  try {
    const { ransomed, credits } = h.towTo(berth(901, 'station_kepler_scar', 'faction_reach', 34));
    assert.equal(ransomed.length, 1);
    assert.equal(ransomed[0].reason, 'fence_delivery');
    assert.equal(ransomed[0].stationId, 'station_kepler_scar');
    assert.equal(credits.length, 0);
    assert.equal(countLiveCausalSurvivorPods(h.state), 0);
    const memory = ensureMoralMemory(h.state);
    assert.equal(Object.values(memory.debts).some((d) => d.cause === 'ransomed_survivors'), true);
  } finally {
    h.restore();
  }
});

test('Smuggler Den leaves a towed mayday pod on the cable', () => {
  const h = boot('sector_pallas_drift');
  try {
    const { pod, ransomed, credits } = h.towTo(
      berth(902, 'station_smuggler', 'faction_quiet', 26, 'blackmarket'),
    );
    assert.equal(ransomed.length, 0);
    assert.equal(credits.length, 0);
    assert.equal(countLiveCausalSurvivorPods(h.state), 1);
    assert.equal(pod.alive !== false, true);
    const memory = ensureMoralMemory(h.state);
    assert.equal(Object.values(memory.debts).some((d) => d.cause === 'ransomed_survivors'), false);
  } finally {
    h.restore();
  }
});
