/**
 * INFERENCE VERB-32 — a mine dropped at speed keeps the deploying ship's velocity,
 * so laying a screen at cruise works.
 *
 * Seed 4242: deploy at 90 WU/s pins mine initial vel == ship vel;
 * deploy at rest pins ~zero. Fuse / cap / trigger radius untouched.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { mines, MINE_ARM_DELAY_S, MINE_TRIGGER_RADIUS, MINE_OWNER_CAP } from '../src/systems/mines.js';
import { combat } from '../src/systems/combat.js';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [mines, combat] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_verb32';
  state.world.activeSector = { id: 'sector_verb32', pois: [] };
  return { sim, state, minesSys: sim.registry.get('mines') };
}

test('VERB-32: mine deployed at 90 WU/s inherits ship velocity', () => {
  const { sim, minesSys } = boot(4242);
  const ship = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 90, z: 0 },
    radius: 12, hull: 200, hullMax: 200, data: {},
  });
  assert.equal(Math.hypot(ship.vel.x, ship.vel.z), 90);
  const mine = minesSys.placeMine({
    ownerId: ship.id, pos: { x: -20, z: 0 }, team: 0, telegraph: false,
  });
  assert.ok(mine, 'mine should place');
  assert.deepEqual({ x: mine.vel.x, z: mine.vel.z }, { x: 90, z: 0 });
  // Fuse / cap / trigger untouched by the velocity law.
  assert.equal(mine.data.armedAt - mine.data.placedAt, MINE_ARM_DELAY_S);
  assert.equal(mine.data.triggerRadius, MINE_TRIGGER_RADIUS);
  assert.equal(MINE_OWNER_CAP, 6);
});

test('VERB-32: mine deployed at rest starts at ~zero velocity', () => {
  const { sim, minesSys } = boot(4242);
  const ship = sim.spawn({
    type: 'ship', team: 0, pos: { x: 100, z: 50 },
    radius: 12, hull: 200, hullMax: 200, data: {},
  });
  const vx = ship.vel ? ship.vel.x || 0 : 0;
  const vz = ship.vel ? ship.vel.z || 0 : 0;
  assert.ok(Math.hypot(vx, vz) < 1e-9, `ship should be at rest (got ${vx},${vz})`);
  const mine = minesSys.placeMine({
    ownerId: ship.id, pos: { x: 80, z: 50 }, team: 0, telegraph: false,
  });
  assert.ok(mine, 'mine should place');
  assert.ok(
    Math.hypot(mine.vel.x, mine.vel.z) < 1e-9,
    `rest deployment should be ~zero (got ${mine.vel.x},${mine.vel.z})`,
  );
});

test('VERB-32: explicit opts.vel overrides owner velocity', () => {
  const { sim, minesSys } = boot(4242);
  const ship = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 90, z: 0 },
    radius: 12, hull: 200, hullMax: 200, data: {},
  });
  const mine = minesSys.placeMine({
    ownerId: ship.id, pos: { x: -20, z: 0 }, vel: { x: 0, z: -30 },
    team: 0, telegraph: false,
  });
  assert.deepEqual({ x: mine.vel.x, z: mine.vel.z }, { x: 0, z: -30 });
});
