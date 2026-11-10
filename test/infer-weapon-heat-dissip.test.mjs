// An overheated ship cools its guns at the combat heatDissipation rate, not the full rate.
import test from 'node:test';
import assert from 'node:assert/strict';

import { weapons } from '../src/systems/weapons.js';

function cool(scale) {
  const player = {
    id: 1, alive: true, type: 'ship',
    data: { weapons: [{ defId: 'pulse', _heat: 10, heatDissip: 4, _cooldown: 0 }] },
  };
  const sys = Object.assign(Object.create(weapons), {
    _byId: new Map([['pulse', { heatDissip: 4 }]]),
    helpers: { getEntity() { return player; } },
    _tickVent() {},
    _tickLock() {},
    _publishIncomingLock() {},
    _momentumSinkImpulse: null,
    _entityGetter() { return null; },
  });
  const state = {
    playerId: 1,
    combat: scale == null ? { entities: {} } : {
      entities: { 1: { multipliers: { heatDissipation: scale } } },
    },
  };
  sys._tickPlayerWeaponsOnly(1, state);
  return player.data.weapons[0]._heat;
}

test('a healthy gun cools at the full recharge rate', () => {
  assert.equal(cool(null), 10 - 4 * 1.15);
  assert.equal(cool(1), 10 - 4 * 1.15);
});

test('an overheated gun cools at 0.35 of that rate', () => {
  assert.equal(cool(0.35), 10 - 4 * 1.15 * 0.35);
});
