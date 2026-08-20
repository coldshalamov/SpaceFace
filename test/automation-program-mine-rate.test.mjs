import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';

function bootMiner() {
  const state = {
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 },
    },
  };
  const inst = Object.create(automation);
  inst.state = state;
  inst.bus = { emit() {} };
  inst._nearestAsteroid = () => null;
  inst._playerPos = () => ({ x: 0, z: 0 });
  return { state, inst, group: { count: 1, oreType: 'cmdty_ore_iron' }, def: { mineRate: 0.8 } };
}

test('programmed drones accrue at the authored mineRate, not one unit per sim tick', () => {
  const { state, inst, group, def } = bootMiner();
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) inst._programMineIntoCargo(group, def, dt);
  assert.equal(state.player.cargo.items.cmdty_ore_iron || 0, 0, '0.8u/s cannot mint a whole unit in one second');

  for (let i = 0; i < 60; i++) inst._programMineIntoCargo(group, def, dt);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 1, 'two seconds at 0.8u/s grants one whole unit');
  assert.ok(group._programMineCarry > 0.5 && group._programMineCarry < 0.7, 'fractional remainder stays on the carry');
});
