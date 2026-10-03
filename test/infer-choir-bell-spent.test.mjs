// A fitted Choir Bell that already turned one missile says so when the next one comes in.
import test from 'node:test';
import assert from 'node:assert/strict';

import { uniqueLootAbilities } from '../src/systems/uniqueLootAbilities.js';

function harness(uses) {
  const events = [];
  const player = {
    id: 1,
    alive: true,
    pos: { x: 0, z: 0 },
    data: { fittings: ['unique_choir_bell_aegis'] },
  };
  const state = {
    playerId: 1,
    simTime: 4,
    entities: new Map([[1, player]]),
    player: {
      uniqueLootAbilities: {
        schemaVersion: 1,
        sequence: 1,
        encounters: {
          fight: {
            active: true,
            choirBellUsed: uses >= 1,
            choirBellUses: uses,
            order: 1,
          },
        },
      },
    },
  };
  const sys = Object.assign(Object.create(uniqueLootAbilities), {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  return { sys, player, events };
}

function missile(id) {
  return {
    id,
    alive: true,
    type: 'projectile',
    pos: { x: 80, z: 0 },
    vel: { x: -40, z: 0 },
    mass: 2,
    data: { kind: 'missile', targetId: 1, encounterId: 'fight' },
  };
}

test('a spent Choir Bell says so once and does not turn the missile', () => {
  const { sys, events } = harness(1);
  const player = sys.state.entities.get(1);
  const first = missile(9);
  const second = missile(10);
  assert.equal(sys._tryChoirBellDeflection(first, player), false);
  assert.equal(sys._tryChoirBellDeflection(second, player), false);
  assert.equal(first.data.targetId, 1);
  assert.equal(second.data.targetId, 1);
  const toasts = events.filter((event) => event.name === 'toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'Choir Bell spent this fight');
});

test('an unused Choir Bell still turns the missile and does not claim it is spent', () => {
  const { sys, events } = harness(0);
  const player = sys.state.entities.get(1);
  const round = missile(11);
  assert.equal(sys._tryChoirBellDeflection(round, player), true);
  assert.equal(round.data.choirBellDeflected, true);
  assert.equal(events.some((event) => event.name === 'toast'), false);
  assert.equal(events.some((event) => event.name === 'uniqueLoot:choirBellPulse'), true);
});
