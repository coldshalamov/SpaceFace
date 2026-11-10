// The kill printer follows the ship through Kepler Scar. Seed 4242.
// The credit record has no place in space. Follow speed and the receipt lines stay as they are.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { RECEIPT } from '../src/data/receipt.js';
import { createReceipt } from '../src/systems/receipt.js';

test('the kill printer follows the ship instead of staying parked', () => {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.world.currentSectorId = RECEIPT.sectorId;
  state.playerId = 1;
  assert.equal(state.player.pos, undefined);
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 2000, y: 0, z: 2000 },
    vel: { x: 0, y: 0, z: 0 },
    radius: 12,
  };
  state.entities.set(1, ship);
  const drone = {
    id: 2,
    type: 'drone',
    alive: true,
    pos: { x: RECEIPT.spawn.x, y: 0, z: RECEIPT.spawn.z },
    vel: { x: 0, z: 0 },
    mass: 18,
    radius: 8,
    data: { receipt: true },
  };
  state.entities.set(2, drone);
  state.entityList.push(ship, drone);

  const receipt = createReceipt();
  receipt.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: { spawnEntity() {}, removeEntity() {} },
  });
  receipt.update();

  const command = consumePhysicsCommand(drone);
  assert.ok(command && command.impulses.length > 0, 'the printer was given a heading');
  const impulse = command.impulses[0];
  assert.ok(impulse.x > 0, `impulse x ${impulse.x}`);
  assert.ok(impulse.z > 0, `impulse z ${impulse.z}`);
  assert.equal(state.player.pos, undefined);
});
