/**
 * Chaff must pull in-flight missiles onto a decoy point off the hull, not drop guidance
 * so they fly straight through the ship they were already tracking.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { weapons } from '../src/systems/weapons.js';

const DT = 1 / 60;

function makeBus() {
  const handlers = {};
  return {
    on(name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
    },
    emit(name, payload) {
      for (const fn of handlers[name] || []) fn(payload);
    },
  };
}

function boot() {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    flags: {},
    cap: 100,
    data: {
      fittings: ['mod_chaff_dispenser_m'],
      weapons: [],
      combat: {},
      derived: { cap: 100 },
    },
  };
  const missile = {
    id: 20,
    type: 'projectile',
    alive: true,
    pos: { x: 220, z: 0 },
    vel: { x: -90, z: 0 },
    rot: Math.PI,
    radius: 1,
    data: {
      kind: 'missile',
      targetId: 1,
      turnRate: 2.8,
      projSpeed: 90,
    },
  };
  const entities = new Map([[1, player], [20, missile]]);
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 120,
    simTime: 2,
    meta: { seed: 11 },
    rng: () => 0,
    player: {},
    input: { fire: false, deployCountermeasure: true, actions: {} },
    combat: { beams: [] },
    entities,
    entityList: [player, missile],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: [player],
      weaponShips: [player],
      projectiles: [missile],
    },
  };
  const bus = makeBus();
  const helpers = {
    getEntity: (id) => state.entities.get(id),
    spawnEntity() { return null; },
    hash32,
    mulberry32,
  };
  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers });
  const guns = Object.create(weapons);
  guns.init({ state, bus, helpers });
  return { state, cm, guns, player, missile };
}

test('chaff writes a decoy off the hull and missiles steer toward it, not straight in', () => {
  const { state, cm, guns, player, missile } = boot();
  const headingBefore = Math.atan2(missile.vel.z, missile.vel.x);

  cm.update(DT, state);
  assert.equal(missile.data.diverted, true, 'chaff must mark the inbound missile diverted');
  assert.ok(missile.data.divertPos, 'diverted missiles must carry a decoy point');
  const decoy = missile.data.divertPos;
  const decoyDist = Math.hypot(decoy.x - player.pos.x, decoy.z - player.pos.z);
  assert.ok(decoyDist > 40, `decoy must sit off the hull, got ${decoyDist.toFixed(1)} wu`);

  guns.update(DT, state);
  const headingAfter = Math.atan2(missile.vel.z, missile.vel.x);
  assert.notEqual(headingAfter, headingBefore, 'missile must yaw toward the decoy instead of flying straight');
  assert.ok(Math.abs(missile.vel.z) > 1e-6, 'turning onto a starboard-aft decoy must produce a z velocity');
});
