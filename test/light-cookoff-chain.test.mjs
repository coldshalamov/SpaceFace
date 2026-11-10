// Light cookoff: a packed death hops a neighbor, stays visible, and keeps the
// player's swarm-chain credit when the player authored the first kill.
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIGHT_COOKOFF } from '../src/combat/lightCookoff.js';
import { THROW_CLASS_MAX_MASS } from '../src/data/survivalWaves.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';

function hull(id, x, z, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    mass: 16,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: 10,
    hull: 40,
    hullMax: 40,
    data: { runCohort: 'survival', shipClass: 'fighter' },
    ...extras,
  };
}

function harness({ killerId = 1, neighbor = true } = {}) {
  const player = hull(1, 400, 0, { mass: 40, data: {} });
  const origin = hull(2, 0, 0, { alive: false });
  const pack = hull(3, 18, 0);
  const entityList = neighbor ? [player, origin, pack] : [player, origin];
  const events = [];
  const handlers = new Map();
  const bus = {
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
  };
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: 1,
    run: { kind: 'survival', phase: 'combat' },
    entityList,
    entities: new Map(entityList.map((e) => [e.id, e])),
    input: { actions: {} },
    player: { cargo: { items: {}, capVolume: 0, usedVolume: 0, usedMass: 0 } },
  };
  const impulses = [];
  const damage = [];
  const system = Object.create(impulseCharges);
  system.init({
    state,
    bus,
    helpers: {
      combatPhysics: {
        applyImpulse(req) { impulses.push(req); return true; },
      },
      routeCombatDamage(req) { damage.push(req); return { ok: true }; },
    },
    registry: { get() { return null; } },
  });
  bus.emit('entity:killed', { id: origin.id, killerId, pos: { ...origin.pos } });
  system.update(1 / 60, state);
  return { events, impulses, damage, origin, pack };
}

test('throw-class lights cook; capitals stay out of the hop', () => {
  assert.equal(LIGHT_COOKOFF.massAtMost, THROW_CLASS_MAX_MASS);
});

test('a player kill hop credits the player and publishes a visible blast', () => {
  const h = harness({ killerId: 1 });
  assert.equal(h.damage.length, 1);
  assert.equal(h.damage[0].attackerId, 1);
  assert.equal(h.damage[0].targetId, 3);
  assert.ok(h.impulses.length >= 1, 'the neighbor physically hops');
  assert.equal(h.impulses[0].entityId, 3);
  const blast = h.events.find((e) => e.name === 'charge:detonated');
  assert.ok(blast, 'cookoff is not an invisible event');
  assert.equal(blast.payload.trigger, 'light_cookoff');
  assert.equal(blast.payload.hostId, 2);
  assert.ok(blast.payload.hits.includes(3));
  assert.ok(h.events.some((e) => e.name === 'audio:cue' && e.payload.id === 'sfx_explosion_small'));
});

test('an NPC kill hop does not steal the player chain', () => {
  const h = harness({ killerId: 99 });
  assert.equal(h.damage.length, 1);
  assert.equal(h.damage[0].attackerId, 2);
  assert.notEqual(h.damage[0].attackerId, 1);
});

test('an isolated death does not fake a blast', () => {
  const h = harness({ killerId: 1, neighbor: false });
  assert.equal(h.damage.length, 0);
  assert.equal(h.events.filter((e) => e.name === 'charge:detonated').length, 0);
});
