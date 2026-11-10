// FIGHT-08: A triggered mine snaps before it detonates
// On seed 4242, `mines:triggered` produces one trigger record before the detonation record so the last half-second is readable.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { mines, MINE_TYPE } from '../src/systems/mines.js';
import { combat } from '../src/systems/combat.js';

test('FIGHT-08: on seed 4242, mines:triggered emits before mines:detonated', () => {
  const sim = createSimulation({ seed: 4242, systems: [mines, combat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_test_mines';
  state.world.activeSector = { id: 'sector_test_mines', pois: [] };

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 500, z: 0 }, radius: 12,
    hull: 200, hullMax: 200, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    data: {},
  });
  state.playerId = player.id;

  const eventOrder = [];
  const triggered = [];
  const detonated = [];

  bus.on('mines:triggered', (p) => {
    eventOrder.push('mines:triggered');
    triggered.push(p);
  });
  bus.on('mines:detonated', (p) => {
    eventOrder.push('mines:detonated');
    detonated.push(p);
  });

  const minesSys = sim.registry.get('mines');
  const enemy = sim.spawn({
    type: 'ship', team: 1, pos: { x: 100, z: 0 }, radius: 14, hull: 100, hullMax: 100,
    data: {},
  });

  // Place mine owned by enemy at (100, 0), armed immediately (armDelayS: 0)
  const mine = minesSys.placeMine({
    ownerId: enemy.id,
    pos: { x: 100, z: 0 },
    team: 1,
    armDelayS: 0,
  });
  assert.ok(mine && mine.type === MINE_TYPE);

  // Move player into mine trigger radius (< 55 WU)
  player.pos.x = 120;
  player.pos.z = 0;

  // Run a simulation tick
  sim.runTicks(1);

  // Verify that triggered fired before detonated
  assert.equal(triggered.length, 1, 'mines:triggered must emit exactly once');
  assert.equal(detonated.length, 1, 'mines:detonated must emit exactly once');
  assert.deepEqual(
    eventOrder,
    ['mines:triggered', 'mines:detonated'],
    'mines:triggered must strictly precede mines:detonated in event sequence',
  );

  assert.equal(triggered[0].mineId, mine.id);
  assert.equal(detonated[0].mineId, mine.id);
  assert.equal(triggered[0].targetId, player.id);
  assert.equal(detonated[0].targetId, player.id);
  assert.equal(mine.alive, false, 'mine is destroyed after detonation');
});
