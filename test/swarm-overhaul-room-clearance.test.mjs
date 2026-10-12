import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalArena } from '../src/systems/survivalArena.js';

test('a room solid laid over the pilot is pushed clear of the hull; one already clear keeps its place', () => {
  const spawned = [];
  const sys = Object.create(survivalArena);
  sys._roomIds = [];
  sys._roomSolids = new Map();
  sys.ctx = { helpers: { spawnEntity: (spec) => { spawned.push(spec); return { id: spawned.length, ...spec }; } } };
  sys.state = {
    playerId: 1,
    entities: new Map([[1, { id: 1, alive: true, radius: 10, pos: { x: -1499.7, z: -2909.6 } }]]),
    entityList: [],
  };
  sys._materializeRoom([
    { id: 'hub', solid: true, radius: 20, pos: { x: -1497.2, z: -2909.6 } },
    { id: 'far', solid: true, radius: 20, pos: { x: -1200, z: -2909.6 } },
  ], 2);
  const [hub, far] = spawned;
  const d = Math.hypot(hub.pos.x + 1499.7, hub.pos.z + 2909.6);
  assert.ok(d >= 20 + 10 + 24 - 1e-6, `hub clears the hull (${d.toFixed(1)} u)`);
  assert.ok(hub.pos.x > -1499.7, 'pushed straight out from the ship');
  assert.deepEqual(far.pos, { x: -1200, z: -2909.6 });
});
