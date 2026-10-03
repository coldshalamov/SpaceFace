// One "Capacitor empty" for the ship per trigger hold. A passed energy check does not re-arm it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { weapons } from '../src/systems/weapons.js';

function host() {
  const events = [];
  const sys = Object.assign(Object.create(weapons), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _byId: new Map(),
    _beamFiring: new Set(),
    _beamFiringPrev: new Set(),
    _attackLive: new Set(),
  });
  const state = {
    playerId: 1,
    simTime: 0,
    tick: 1,
    settings: { gameplay: {} },
    input: { fire: true },
    player: {},
  };
  const player = {
    id: 1, alive: true, flags: {}, pos: { x: 0, z: 0 }, rot: 0, cap: 0,
    data: { weapons: [] },
  };
  return { sys, state, player, events };
}

function toasts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('an empty capacitor says so once while fire is held', () => {
  const { sys, state, player, events } = host();
  const w = { energyCost: 4, _cooldown: 0, _heat: 0 };
  const def = { energyCost: 4 };
  sys._serviceProjectileWeapon(player, w, def, true, 0, 1 / 60, state, 0, null);
  sys._serviceProjectileWeapon(player, w, def, true, 0, 1 / 60, state, 0, null);
  assert.deepEqual(toasts(events), ['Capacitor empty']);
});

test('a mount that sees charge, then misses its lock, does not speak again in the same hold', () => {
  const { sys, state, player, events } = host();
  sys.state = state;
  const w = { energyCost: 4, tracking: 'homing', _cooldown: 0, _heat: 0 };
  const def = { energyCost: 4, tracking: 'homing' };
  sys._serviceProjectileWeapon(player, w, def, true, 0, 1 / 60, state, 0, null);
  sys._serviceProjectileWeapon(player, w, def, true, 80, 1 / 60, state, 0, null);
  sys._serviceProjectileWeapon(player, w, def, true, 0, 1 / 60, state, 0, null);
  assert.deepEqual(toasts(events), ['Capacitor empty']);
  assert.equal(sys._playerCapEmptyTold, true);
});

test('two dry mounts share one line', () => {
  const { sys, state, player, events } = host();
  const a = { defId: 'pulse', energyCost: 4, _cooldown: 0, _heat: 0 };
  const b = { defId: 'pulse', energyCost: 4, _cooldown: 0, _heat: 0 };
  player.data.weapons = [a, b];
  sys._byId.set('pulse', { energyCost: 4 });
  sys._serviceShip(player, true, true, 1 / 60, state, 0, null);
  assert.deepEqual(toasts(events), ['Capacitor empty']);
});

test('forcing the guns quiet while the button is down does not re-arm the line', () => {
  const { sys, state, player, events } = host();
  const w = { defId: 'pulse', energyCost: 4, _cooldown: 0, _heat: 0 };
  player.data.weapons = [w];
  sys._byId.set('pulse', { energyCost: 4 });
  sys._playerCapEmptyTold = true;
  sys._serviceShip(player, false, true, 1 / 60, state, 0, null);
  assert.equal(sys._playerCapEmptyTold, true);
  sys._serviceProjectileWeapon(player, w, { energyCost: 4 }, true, 0, 1 / 60, state, 0, null);
  assert.deepEqual(toasts(events), []);
});

test('releasing the trigger lets the next empty press speak again', () => {
  const { sys, state, player, events } = host();
  const w = { defId: 'pulse', energyCost: 4, _cooldown: 0, _heat: 0, _mineBankTold: true };
  player.data.weapons = [w];
  sys._playerCapEmptyTold = true;
  state.input.fire = false;
  sys._releasePlayerOrdnanceNotices(player);
  assert.equal(sys._playerCapEmptyTold, false);
  assert.equal(w._mineBankTold, false);
  sys._serviceProjectileWeapon(player, w, { energyCost: 4 }, true, 0, 1 / 60, state, 0, null);
  assert.deepEqual(toasts(events), ['Capacitor empty']);
});

test('the quiet idle skip clears the latch when the trigger is up', () => {
  const { sys, state, player } = host();
  const w = { _mineBankTold: true };
  player.data.weapons = [w];
  sys._playerCapEmptyTold = true;
  state.input.fire = false;
  state.entities = new Map([[1, player]]);
  sys.helpers = { getEntity() { return player; } };
  sys._tickPlayerWeaponsOnly = () => {};
  sys._emitStoppedBeams = () => {};
  sys._runWeaponsNpcQuietIdle(1 / 60, state);
  assert.equal(sys._playerCapEmptyTold, false);
  assert.equal(w._mineBankTold, false);
});

test('another ship stays silent, and a cooked gun names the heat instead', () => {
  const { sys, state, player, events } = host();
  const npc = { id: 9, pos: { x: 0, z: 0 }, rot: 0, data: {} };
  sys._serviceProjectileWeapon(npc, { energyCost: 4, _cooldown: 0, _heat: 0 }, { energyCost: 4 }, false, 0, 1 / 60, state, 0, null);
  const cooked = { energyCost: 4, _cooldown: 0, _heat: 100, heat: 8, heatMax: 100 };
  sys._serviceProjectileWeapon(player, cooked, { energyCost: 4, heatPerShot: 8, heatMax: 100 }, true, 0, 1 / 60, state, 0, null);
  assert.deepEqual(toasts(events), ['Weapon overheated']);
});

test('a cooked empty mine names the heat, not the capacitor', () => {
  const { sys, state, player, events } = host();
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    const w = { energyCost: 8, _cooldown: 0, _heat: 100, heat: 6, heatMax: 100 };
    sys._serviceDeployWeapon(player, w, { energyCost: 8, heatPerShot: 6, heatMax: 100 }, true, 0, state, 0);
    assert.deepEqual(toasts(events), ['Weapon overheated']);
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = prev;
  }
});

test('a beam with no capacitor says so once and does not fire', () => {
  const { sys, state, player, events } = host();
  const w = { energyCost: 60, heatPerSec: 0, heatMax: 100, range: 400, _heat: 0 };
  const def = { energyCost: 60, continuous: true, range: 400 };
  sys._serviceBeam(player, w, def, true, 0, 1 / 60, state, 0, null, null);
  sys._serviceBeam(player, w, def, true, 0, 1 / 60, state, 0, null, null);
  assert.deepEqual(toasts(events), ['Capacitor empty']);
  assert.equal(state.combat, undefined);
});
