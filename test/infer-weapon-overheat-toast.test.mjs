// Holding fire on a cooked gun must say so once, then stay quiet until it cools.
import test from 'node:test';
import assert from 'node:assert/strict';

import { weapons } from '../src/systems/weapons.js';

function host() {
  const events = [];
  const sys = Object.assign(Object.create(weapons), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  const state = { playerId: 1, settings: { gameplay: {} } };
  const player = { id: 1, pos: { x: 0, z: 0 }, rot: 0 };
  return { sys, state, player, events };
}

test('an overheated gun says so once while fire is held', () => {
  const { sys, state, player, events } = host();
  const w = { _heat: 100, heatMax: 100, heat: 8, energyCost: 1, _cooldown: 0 };
  const def = { heatPerShot: 8, heatMax: 100, energyCost: 1 };
  sys._serviceProjectileWeapon(player, w, def, true, 50, 1 / 60, state, 0, null);
  sys._serviceProjectileWeapon(player, w, def, true, 50, 1 / 60, state, 0, null);
  const toasts = events.filter((event) => event.name === 'toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'Weapon overheated');
});

test('a cooled gun can say it again the next time it cooks', () => {
  const { sys, state, player, events } = host();
  sys._emitProjectileVolley = () => {};
  const w = { _heat: 100, heatMax: 100, heat: 8, energyCost: 0, _cooldown: 0 };
  const def = { heatPerShot: 8, heatMax: 100, energyCost: 0 };
  sys._serviceProjectileWeapon(player, w, def, true, 50, 1 / 60, state, 0, null);
  assert.equal(events.filter((event) => event.name === 'toast').length, 1);
  w._heat = 0;
  w._cooldown = 0;
  sys._serviceProjectileWeapon(player, w, def, true, 50, 1 / 60, state, 0, null);
  assert.equal(w._overheatTold, false);
  w._heat = 100;
  w._cooldown = 0;
  sys._serviceProjectileWeapon(player, w, def, true, 50, 1 / 60, state, 0, null);
  assert.equal(events.filter((event) => event.name === 'toast').length, 2);
});
