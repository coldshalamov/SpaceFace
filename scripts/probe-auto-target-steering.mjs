import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  createAutoTargetRuntime,
  tickAutoTarget,
  toggleAutoTarget,
} from '../src/combat/autoTargetMode.js';

const state = createGameState(0xa0707a12);
const bus = createBus();
const runtime = createAutoTargetRuntime();
const player = {
  id: 1,
  type: 'ship',
  alive: true,
  pos: { x: 0, z: 0 },
  vel: { x: 0, z: 0 },
  rot: 0,
  data: { weapons: [{ projSpeed: 360 }] },
};
const target = {
  id: 2,
  type: 'ship',
  alive: true,
  pos: { x: 240, z: 0 },
  vel: { x: 0, z: 45 },
  rot: 0,
};

state.mode = 'flight';
state.playerId = player.id;
state.player.targetId = target.id;
state.entities.set(player.id, player);
state.entities.set(target.id, target);
state.entityList.push(player, target);

assert.equal(toggleAutoTarget(state, bus, runtime), true);
assert.equal(state.input.autoFire, true);
tickAutoTarget(state, 1 / 60, bus, runtime);
assert(state.input.aimWorld.z > target.pos.z,
  'auto-target must lead a laterally moving target');

state.input.autoTargetPath = {
  active: true,
  drawing: false,
  cursorX: 0,
  cursorY: 0,
  pointIndex: 1,
  points: [
    { x: player.pos.x, z: player.pos.z },
    { x: player.pos.x, z: player.pos.z + 180 },
  ],
};
tickAutoTarget(state, 1 / 60, bus, runtime);
assert(Math.abs(state.input.moveX) + Math.abs(state.input.moveZ) + Math.abs(state.input.turnIntent) > 0,
  'draw-to-fly path must create a flight command');

assert.equal(toggleAutoTarget(state, bus, runtime), false);
assert.equal(state.input.autoFire, false);

console.log('Auto-target steering probe OK');
