/**
 * A seeker the player fired says so once when chaff or a decoy breaks it.
 * Later ticks of that same round stay quiet. An enemy round never speaks.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { countermeasures } from '../src/systems/countermeasures.js';

const DT = 1 / 60;

function makeBus() {
  const toasts = [];
  const handlers = {};
  return {
    toasts,
    on(name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
    },
    emit(name, payload) {
      if (name === 'toast') toasts.push(payload);
      for (const fn of handlers[name] || []) fn(payload);
    },
  };
}

function missile(id, ownerId, x) {
  return {
    id,
    type: 'projectile',
    alive: true,
    pos: { x, z: 0 },
    vel: { x: -40, z: 0 },
    rot: Math.PI,
    radius: 1,
    ownerId,
    data: {
      kind: 'missile',
      ownerId,
      targetId: 2,
      turnRate: 2.8,
      projSpeed: 90,
    },
  };
}

function boot({ kind, missiles }) {
  const enemy = {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    data: {
      fittings: [],
      cm: {
        cooldownT: 0,
        effectT: 3,
        effect: {
          cfg: { kind, radius: 620, divertPct: 1 },
          decoyId: 'decoy-test',
          originX: 0,
          originZ: 0,
          lineage: {
            shooterId: 1,
            targetId: 2,
            generation: 0,
            targetGeneration: null,
            missileId: null,
          },
        },
      },
    },
  };
  const entities = new Map([[2, enemy]]);
  for (const m of missiles) entities.set(m.id, m);
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 120,
    simTime: 2,
    meta: { seed: 4242 },
    rng: () => 0,
    player: {},
    input: { fire: false, deployCountermeasure: false, actions: {} },
    combat: { beams: [] },
    entities,
    entityList: [enemy, ...missiles],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: [enemy],
      weaponShips: [enemy],
      projectiles: missiles,
    },
  };
  const bus = makeBus();
  const cm = Object.create(countermeasures);
  cm.init({
    state,
    bus,
    helpers: {
      getEntity: (id) => state.entities.get(id),
      spawnEntity() { return null; },
      hash32,
      mulberry32,
    },
  });
  return { state, cm, bus, missiles };
}

function seekerLines(bus) {
  return bus.toasts.filter((t) => t && typeof t.text === 'string' && t.text.startsWith('Seeker broke'));
}

test('chaff names a player seeker once, and a later tick still diverts without speaking', () => {
  const round = missile(20, 1, 180);
  const { state, cm, bus } = boot({ kind: 'chaff', missiles: [round] });

  cm.update(DT, state);
  assert.equal(round.data.guidanceBroken, true);
  assert.equal(round.data.diverted, true);
  assert.deepEqual(seekerLines(bus).map((t) => t.text), ['Seeker broke — chaff.']);

  cm.update(DT, state);
  assert.equal(round.data.guidanceBroken, true);
  assert.deepEqual(seekerLines(bus).map((t) => t.text), ['Seeker broke — chaff.']);
});

test('a decoy in the same water breaks an enemy seeker without a player line', () => {
  const ours = missile(20, 1, 180);
  const theirs = missile(21, 50, 200);
  const { state, cm, bus } = boot({ kind: 'decoy', missiles: [ours, theirs] });

  cm.update(DT, state);
  assert.equal(ours.data.guidanceBroken, true);
  assert.equal(theirs.data.guidanceBroken, true);
  assert.deepEqual(seekerLines(bus).map((t) => t.text), ['Seeker broke — decoy.']);

  // A decoy keeps re-baiting. The broken flag must not skip that roll, and it must not speak again.
  ours.data.divertPos = { x: -999, z: -999 };
  cm.update(DT, state);
  assert.notEqual(ours.data.divertPos.x, -999, 'a later tick still rolls the divert');
  assert.equal(theirs.data.guidanceBroken, true);
  assert.deepEqual(seekerLines(bus).map((t) => t.text), ['Seeker broke — decoy.']);
});

test('a player seeker is recognized from the round record when the body has no owner', () => {
  const round = missile(20, 1, 180);
  delete round.ownerId;
  const { state, cm, bus } = boot({ kind: 'chaff', missiles: [round] });
  cm.update(DT, state);
  assert.deepEqual(seekerLines(bus).map((t) => t.text), ['Seeker broke — chaff.']);
});
