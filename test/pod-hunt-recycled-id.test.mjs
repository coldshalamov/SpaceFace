/**
 * Regression: entity ids recycle through freeIds. A pod-hunt errand outlives its bound hunter in
 * `state.survivorPod.hunt.errands` — stack.forgetEntity does not touch that book. If a fresh ship
 * is spawned onto the dead hunter's id before the next tickPodHunts pass, the errand must close,
 * not adopt the new occupant: assertSeekDoctrine would rewrite its doctrine to the pod-hunt seek
 * and endErrand would later restore the DEAD hunter's posture snapshot onto it.
 *
 * Drives the real survivorPod system with the real bus on createGameState(seed), mirroring
 * test/world-answers-c7-pods-pirates.test.mjs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { survivorPod, isCausalSurvivorPod } from '../src/systems/survivorPod.js';

const DT = 1 / 60;

function boot(seed) {
  const bus = createBus();
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_tethys_junction';
  state.playerId = 1;
  state.nextEntityId = 500;

  function add(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }
  add({
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 100,
    hull: 200, hullMax: 200, data: {}, flags: {},
  });
  state.player.tether = { active: false, targetId: null };

  survivorPod.init({ state, bus, helpers: {} });

  const pirate = ({ id, x, z, hull, hullMax = 100, extraAi = {} }) => add({
    id, type: 'ship', team: 1, factionId: 'faction_reach', alive: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 80,
    hull, hullMax, data: {
      ai: {
        archetype: 'pirate_raider', roe: 'weapons_free', forcePlayerTarget: true,
        activity: { kind: 'attack_run', reason: 'raid:attack:raider', targetId: 1 },
        ...extraAi,
      },
      combat: { targetId: 1, lockTarget: 1 },
      intent: { moveX: 0, moveZ: 0, fire: true, fireGroup: 0 },
    },
    flags: {},
  });

  const victim = (id) => add({
    id, type: 'ship', team: 2, factionId: 'faction_mts', alive: true,
    pos: { x: 400, z: 0 }, vel: { x: 2, z: 1 }, rot: 0, radius: 14, mass: 160,
    hull: 0, hullMax: 100,
    data: { trafficRole: 'hauler', role: 'hauler', ai: { archetype: 'mule_trader', passive: true } },
    flags: {},
  });

  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick += 1;
      state.simTime += DT;
      survivorPod.update(DT, state);
    }
  };

  return { state, bus, add, pirate, victim, step };
}

for (const seed of [4242, 8008]) {
  test(`pod-hunt errand closes on a recycled hunter id instead of hijacking the new hull [${seed}]`, () => {
    const h = boot(seed);
    try {
      const hunter = h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      const pod = survivorPod._spawnCausalPod(h.state, h.victim(30), { pos: { x: 400, z: 0 }, vel: { x: 2, z: 1 } });
      assert.ok(isCausalSurvivorPod(pod), 'a causal pod ejected');
      assert.ok(hunter.data.ai.podHunt, 'hunter stamped for the errand');
      assert.equal(Object.keys(h.state.survivorPod.hunt.errands).length, 1);

      // The hunter dies; entity ids recycle LIFO. A new ship spawns onto id 21 — the errand
      // book still holds a record keyed to it.
      hunter.alive = false;
      h.state.entities.delete(21);
      h.state.entityList.splice(h.state.entityList.indexOf(hunter), 1);
      const fresh = h.pirate({ id: 21, x: 260, z: 40, hull: 90 });
      assert.equal(fresh.data.ai.podHunt, undefined, 'fresh hull carries no hunt stamp');

      h.step(2);

      const ai = fresh.data.ai;
      assert.equal(ai.podHunt, undefined, 'the recycled occupant is never stamped');
      assert.equal(ai.activity.kind, 'attack_run', 'doctrine is not rewritten to the pod-hunt seek');
      assert.equal(ai.roe, 'weapons_free', 'posture untouched');
      assert.equal(ai.forcePlayerTarget, true, 'aggro untouched');
      assert.equal(fresh.data.intent.fire, true, 'weapons state untouched');
      assert.equal(Object.keys(h.state.survivorPod.hunt.errands).length, 0, 'errand book closed');
    } finally {
      survivorPod.destroy();
    }
  });
}
