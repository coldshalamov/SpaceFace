// A sustain burn cuts out at the energy>1 floor and says so once. A refused dash does not add a second line.
import test from 'node:test';
import assert from 'node:assert/strict';

import { flightV3 } from '../src/systems/flightV3.js';

function flight() {
  const events = [];
  const sys = Object.assign(Object.create(flightV3), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _prevBoost: false,
    _suppressBoostUntilRelease: false,
  });
  return { sys, events };
}

function texts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('a 60 Hz burn cuts out at the sustain floor and says so once', () => {
  const { sys, events } = flight();
  const ship = {
    id: 1,
    boost: {
      energy: 40, max: 100, regenRate: 18, drainRate: 22,
      dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0, _boostArmed: true,
    },
  };
  for (let i = 0; i < 8 * 60; i += 1) sys._stepPlayerBoost(ship, true, 1 / 60, {});
  assert.equal(ship.boost._boostArmed, false);
  assert.ok(ship.boost.energy > 1, 'regen after the cut-out must not relight the hold');
  assert.deepEqual(texts(events), ['Boost spent']);
});

test('the cut-out is one frame across the floor', () => {
  const { sys, events } = flight();
  const ship = {
    id: 1,
    boost: {
      energy: 1.4, max: 100, regenRate: 0, drainRate: 60,
      dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0, _boostArmed: true,
    },
  };
  sys._stepPlayerBoost(ship, true, 1 / 60, {});
  sys._stepPlayerBoost(ship, true, 1 / 60, {});
  assert.ok(ship.boost.energy <= 1);
  assert.equal(ship.boost._boostArmed, false);
  assert.deepEqual(texts(events), ['Boost spent']);
});

test('a refused dash on the same tick does not also say spent', () => {
  const { sys, events } = flight();
  const ship = {
    id: 1,
    boost: {
      energy: 10, max: 100, regenRate: 0, drainRate: 400,
      dashImpulse: 80, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0, _boostArmed: true,
    },
  };
  sys._stepPlayerBoost(ship, true, 1, { playerId: 1 });
  assert.equal(ship.boost._boostArmed, false);
  assert.deepEqual(texts(events), ['Boost empty']);
});

test('a dash that empties the tank disarms before regen can relight it', () => {
  const { sys, events } = flight();
  const ship = {
    id: 1,
    rot: 0,
    boost: {
      energy: 28, max: 100, regenRate: 18, drainRate: 22,
      dashImpulse: 80, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0, _boostArmed: true,
    },
  };
  const state = { playerId: 1 };
  sys._stepPlayerBoost(ship, true, 1 / 60, state);
  assert.equal(ship.boost.energy <= 1, true);
  assert.equal(ship.boost._boostArmed, false);
  assert.deepEqual(texts(events), ['Boost spent']);
  for (let i = 0; i < 60; i += 1) sys._stepPlayerBoost(ship, true, 1 / 60, state);
  assert.equal(ship.boost._boostArmed, false);
  assert.ok(ship.boost.energy > 1);
  assert.deepEqual(texts(events), ['Boost spent']);
});

test('a hold that arrives already under the floor cuts out once', () => {
  const { sys, events } = flight();
  sys._prevBoost = true;
  const ship = {
    id: 1,
    boost: {
      energy: 0.6, max: 100, regenRate: 18, drainRate: 22,
      dashImpulse: 80, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0, _boostArmed: true,
    },
  };
  sys._stepPlayerBoost(ship, true, 1 / 60, { playerId: 1 });
  assert.equal(ship.boost._boostArmed, false);
  assert.deepEqual(texts(events), ['Boost spent']);
  for (let i = 0; i < 60; i += 1) sys._stepPlayerBoost(ship, true, 1 / 60, { playerId: 1 });
  assert.equal(ship.boost._boostArmed, false);
  assert.ok(ship.boost.energy > 1);
  assert.deepEqual(texts(events), ['Boost spent']);
});

test('a press on an empty tank says empty, not spent', () => {
  const { sys, events } = flight();
  const ship = {
    id: 1,
    boost: {
      energy: 0, max: 100, regenRate: 18, drainRate: 40,
      dashImpulse: 80, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0,
    },
  };
  sys._stepPlayerBoost(ship, true, 1 / 60, { playerId: 1 });
  assert.equal(ship.boost._boostArmed, false);
  assert.deepEqual(texts(events), ['Boost empty']);
  for (let i = 0; i < 60; i += 1) sys._stepPlayerBoost(ship, true, 1 / 60, { playerId: 1 });
  assert.equal(ship.boost._boostArmed, false);
  assert.ok(ship.boost.energy > 1);
  assert.deepEqual(texts(events), ['Boost empty']);
});

test('a burn that still has charge stays quiet', () => {
  const { sys, events } = flight();
  const ship = {
    id: 1,
    boost: {
      energy: 50, max: 100, regenRate: 0, drainRate: 10,
      dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 0, burnCdS: 0, _boostArmed: true,
    },
  };
  sys._stepPlayerBoost(ship, true, 1 / 60, {});
  assert.ok(ship.boost.energy > 1);
  assert.equal(ship.boost._boostArmed, true);
  assert.deepEqual(texts(events), []);
});
