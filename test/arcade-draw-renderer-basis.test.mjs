import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDrawFlightGesture } from '../src/systems/drawFlightInput.js';

test('production renderer shared raycast storage cannot erase trackpad movement', () => {
  const player = { pos: { x: 0, z: 0 } }, scratch = { x: 0, z: 0 }, camera = { x: 0, z: 0 };
  const host = { state: { playerId: 1, entities: new Map([[1, player]]), input: { autoFire: true } }, helpers: {
    worldToScreen: p => ({ x: 500 + p.x - camera.x, y: 300 + p.z - camera.z }),
    // Same scratch-return contract as renderer.raycastToPlane with its frame membrane.
    raycastToPlane: n => Object.assign(scratch, { x: camera.x + n.x * 500, z: camera.z - n.y * 300 }),
  } };
  assert.equal(recordDrawFlightGesture(host, 24, -12, 0, 1000, 600), true);
  camera.x = 600; camera.z = -300;
  assert.equal(recordDrawFlightGesture(host, -12, 24, 16, 1000, 600), true);
  assert.deepEqual(host.state.input.autoTargetPath.points.map(p => ({ x: Math.round(p.x), z: Math.round(p.z) })),
    [{ x: 0, z: 0 }, { x: 24, z: -12 }, { x: 12, z: 12 }]);
});
