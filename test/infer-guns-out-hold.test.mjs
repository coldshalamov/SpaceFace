// Holding fire on a dead battery says so once. A live mount keeps the line quiet.
import test from 'node:test';
import assert from 'node:assert/strict';

import { weapons } from '../src/systems/weapons.js';

function host(disabled) {
  const events = [];
  const sys = Object.assign(Object.create(weapons), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _byId: new Map([['pulse', { energyCost: 4 }]]),
  });
  const state = {
    playerId: 1,
    simTime: 0,
    settings: { gameplay: {} },
    combat: {
      entities: {
        1: { subsystems: { subsystem_weapon: { effectiveDisabled: disabled } } },
      },
    },
  };
  const player = {
    id: 1,
    pos: { x: 0, z: 0 },
    rot: 0,
    cap: 40,
    data: { weapons: [{ defId: 'pulse', energyCost: 4, _cooldown: 0, _heat: 0 }] },
  };
  return { sys, state, player, events };
}

function toasts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('a dead battery says the guns are out once while fire is held', () => {
  const { sys, state, player, events } = host(true);
  sys._serviceShip(player, true, true, 1 / 60, state, 0, null);
  sys._serviceShip(player, true, true, 1 / 60, state, 0, null);
  assert.deepEqual(toasts(events), ['Guns out — the battery is dark']);
  sys._releasePlayerOrdnanceNotices(player);
  sys._serviceShip(player, true, true, 1 / 60, state, 0, null);
  assert.equal(toasts(events).length, 2);
});

test('a live battery and another ship stay quiet', () => {
  const live = host(false);
  live.player.data.weapons[0]._cooldown = 1;
  live.sys._serviceShip(live.player, true, true, 1 / 60, live.state, 0, null);
  assert.deepEqual(toasts(live.events), []);

  const npc = host(true);
  npc.state.combat.entities[9] = { subsystems: { subsystem_weapon: { effectiveDisabled: true } } };
  const other = {
    id: 9, pos: { x: 0, z: 0 }, rot: 0, cap: 40,
    data: { weapons: [{ defId: 'pulse', energyCost: 4, _cooldown: 0, _heat: 0 }] },
  };
  npc.sys._serviceShip(other, true, false, 1 / 60, npc.state, 0, null);
  assert.deepEqual(toasts(npc.events), []);
});
