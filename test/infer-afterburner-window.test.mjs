// A live afterburner that runs out says so once. A later press during cooldown names the wait.
import test from 'node:test';
import assert from 'node:assert/strict';

import { flightV3 } from '../src/systems/flightV3.js';

function flight() {
  const events = [];
  const sys = Object.assign(Object.create(flightV3), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _prevBoost: true,
    _suppressBoostUntilRelease: false,
    _burnerCoolTold: false,
  });
  return { sys, events };
}

function ship(overrides = {}) {
  return {
    id: 1,
    boost: {
      energy: 80, max: 100, regenRate: 0, drainRate: 0,
      dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0,
      burnDurS: 4, burnCdS: 12, _burnT: 0.01, _burnCdT: 0, _burnActive: true,
      _boostArmed: true,
      ...overrides,
    },
  };
}

function texts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('a held burn that runs out says the afterburner is spent, once', () => {
  const { sys, events } = flight();
  const hull = ship();
  sys._stepPlayerBoost(hull, true, 1 / 60, { playerId: 1 });
  sys._stepPlayerBoost(hull, true, 1 / 60, { playerId: 1 });
  assert.equal(hull.boost._burnT, 0);
  assert.equal(hull.boost._burnCdT > 0, true);
  assert.equal(sys._stepPlayerBoost(hull, true, 1 / 60, { playerId: 1 }), false);
  assert.deepEqual(texts(events), ['Afterburner spent']);
});

test('a press during cooldown names the wait, once per hold', () => {
  const { sys, events } = flight();
  const hull = ship({ _burnT: 0, _burnCdT: 8, _burnActive: false });
  sys._prevBoost = false;
  sys._stepPlayerBoost(hull, true, 1 / 60, { playerId: 1 });
  sys._stepPlayerBoost(hull, true, 1 / 60, { playerId: 1 });
  assert.deepEqual(texts(events), ['Afterburner cooling — 8s']);
  sys._stepPlayerBoost(hull, false, 1 / 60, { playerId: 1 });
  sys._prevBoost = false;
  sys._stepPlayerBoost(hull, true, 1 / 60, { playerId: 1 });
  assert.equal(texts(events).length, 2);
  assert.match(texts(events)[1], /^Afterburner cooling — \d+s$/);
});

test('a window that ends with the key up stays quiet', () => {
  const { sys, events } = flight();
  const hull = ship();
  sys._stepPlayerBoost(hull, false, 1 / 60, { playerId: 1 });
  assert.equal(hull.boost._burnT, 0);
  assert.deepEqual(texts(events), []);
});

test('a ship with no afterburner does not use the window lines', () => {
  const { sys, events } = flight();
  const hull = ship({ burnDurS: 0, burnCdS: 0, _burnT: 0, _burnActive: false, energy: 40, drainRate: 10 });
  sys._stepPlayerBoost(hull, true, 1 / 60, { playerId: 1 });
  assert.deepEqual(texts(events), []);
});
