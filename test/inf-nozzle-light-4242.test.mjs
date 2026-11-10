// The warm cooldown light stays behind the nozzles. Seed 4242.
// Root yaw is minus the heading. Brightness and reach stay as they are.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createFlightOverheadPresentation } from '../src/render/flightOverheadPresentation.js';
import { globalShipMicroMotion } from '../src/render/shipMicroMotion.js';

function stubNode(name) {
  return {
    name,
    parent: null,
    children: [],
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    userData: {},
    traverse(fn) { fn(this); },
  };
}

function cooldownAt(rot, yaw = -rot) {
  const state = createGameState(4242);
  const player = {
    id: 1,
    type: 'ship',
    isPlayer: true,
    alive: true,
    pos: { x: 100, y: 0, z: 200 },
    vel: { x: 0, y: 0, z: 0 },
    rot,
    radius: 10,
    flags: { boosting: true },
  };
  state.playerId = 1;
  state.meta.seed = 4242;
  state.entities.set(1, player);
  const hull = stubNode('hull');
  const mesh = stubNode('ship');
  mesh.userData.hull = hull;
  hull.parent = mesh;
  for (let i = 0; i < 12; i++) {
    globalShipMicroMotion.updateCraftMicroMotion(player, mesh, 10 + i * 0.05, 0.05, {
      playerId: player.id,
    });
  }
  mesh.position.x = 100;
  mesh.position.z = 200;
  mesh.rotation.y = yaw;
  let light = null;
  const cues = createFlightOverheadPresentation({ add(obj) { light = obj; } });
  cues.sync(player, mesh, 0.05, state, { reducedFlash: false });
  const full = light ? light.intensity : 0;
  cues.sync(player, mesh, 0.05, state, { reducedFlash: true });
  return { light, full };
}

test('the cooldown light stays behind the nozzles when the ship turns', () => {
  const aft = 10 * 0.82;
  const north = cooldownAt(Math.PI / 2);
  assert.ok(north.light);
  assert.equal(north.light.name, 'nozzle-cooldown-light');
  assert.equal(north.light.visible, true);
  assert.ok(north.full > 0.02);
  assert.ok(Math.abs(north.light.intensity / north.full - 0.22 / 0.85) < 0.001);
  assert.equal(north.light.position.y, 1.35);
  assert.equal(north.light.distance, 18 + 10 * 1.4);
  assert.ok(Math.abs(north.light.position.x - 100) < 0.01);
  assert.ok(Math.abs(north.light.position.z - (200 - aft)) < 0.01, `light z ${north.light.position.z}`);

  const east = cooldownAt(0);
  assert.ok(east.full > 0.02);
  assert.ok(Math.abs(east.light.position.x - (100 - aft)) < 0.01);
  assert.ok(Math.abs(east.light.position.z - 200) < 0.01);

  const fallback = cooldownAt(Math.PI / 2, Number.NaN);
  assert.ok(fallback.full > 0.02);
  assert.ok(Math.abs(fallback.light.position.x - 100) < 0.01);
  assert.ok(Math.abs(fallback.light.position.z - (200 - aft)) < 0.01, `fallback z ${fallback.light.position.z}`);
});
