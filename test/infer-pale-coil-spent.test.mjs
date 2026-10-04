// A fitted Pale Coil that has already blinked this fight must say so on the next dash.
import test from 'node:test';
import assert from 'node:assert/strict';

import { uniqueLootAbilities, PALE_COIL_BLINK_DISTANCE } from '../src/systems/uniqueLootAbilities.js';

function harness(uses) {
  const events = [];
  const player = {
    id: 1,
    alive: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    data: { fittings: ['unique_pale_coil_warp_drive'] },
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
            paleCoilUsed: uses >= 1,
            paleCoilUses: uses,
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
  return { sys, player, events, state };
}

test('a spent Pale Coil says so once and does not blink again', () => {
  const { sys, player, events } = harness(1);
  sys._onShipDash({ shipId: 1 });
  sys._onShipDash({ shipId: 1 });
  assert.equal(player.pos.x, 0);
  const toasts = events.filter((event) => event.name === 'toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'Pale Coil spent this fight');
  assert.equal(events.some((event) => event.name === 'uniqueLoot:paleCoilBlink'), false);
});

test('an unused Pale Coil still blinks and does not claim it is spent', () => {
  const { sys, player, events } = harness(0);
  sys._onShipDash({ shipId: 1 });
  assert.equal(player.pos.x, PALE_COIL_BLINK_DISTANCE);
  assert.equal(events.some((event) => event.name === 'toast'), false);
  assert.equal(events.some((event) => event.name === 'uniqueLoot:paleCoilBlink'), true);
});
