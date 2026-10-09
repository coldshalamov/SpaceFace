import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { thimbleDoorBody, thimbleRecorderBody, thimbleDoorCollisionSegments,
  THIMBLE_DOOR_RADIUS, THIMBLE_RECORDER_RADIUS } from '../src/data/thimbleDoorBody.js';

test('twelve source rim solids leave both mouths and the complete flat-XZ throat open', async () => {
  const sim = createSimulation({ seed: 13, systems: [] }), native = await createSg02DynamicBodyOwner();
  try {
    const e = sim.spawn({ type: 'wreck', hull: 600, mass: 1e9, radius: THIMBLE_DOOR_RADIUS,
      pos: { x: 0, z: 0 }, physicsBody: thimbleDoorBody(), data: {} });
    const recorder = sim.spawn({ type: 'payload', hull: 30, mass: 2, radius: THIMBLE_RECORDER_RADIUS,
      pos: { x: 90, z: 0 }, physicsBody: thimbleRecorderBody(), data: {} });
    native.syncFromEntities(sim.state.entityList); native.step(1 / 60);
    const r = native.records.get(e.id); assert.equal(r.colliders.length, 12); assert.equal(r.body.isDynamic(), false);
    const contains = (x, z) => r.colliders.some(c => c.containsPoint({ x, y: 0, z }));
    for (const x of [-70, -59, -40, -20, 0, 20, 40, 59, 70]) for (const z of [-16.5, 0, 16.5])
      assert.equal(contains(x, z), false, `empty passage ${x},${z}`);
    // X0 is the visible small rib joint; sample the actual neighboring rim skin.
    assert.equal(contains(10, 28), true); assert.equal(contains(10, -28), true);
    assert.equal(contains(-59, 0), false); assert.equal(contains(59, 0), false);
    for (const x of [-60, -30, 0, 30, 60]) {
      const p = { x, y: 0, z: 0 };
      const clear = Math.min(...r.colliders.map(c => { const q = c.projectPoint(p, true).point; return Math.hypot(q.x - x, q.z); }));
      assert(clear >= 16.99, `narrowest route clearance ${clear}m`);
    }
    const rr = native.records.get(recorder.id); assert(rr.body.isDynamic()); assert(Math.abs(rr.body.mass() - 2) < 1e-6);
    assert.equal(rr.colliders.length, 1);
  } finally { native.dispose(); sim.dispose(); }
});

test('the conservative-query halfspaces are exact source vertices and never bridge the central void', () => {
  const c = JSON.parse(readFileSync(new URL('../assets/ships/forge/sources/thimble_door/measured-contract.json', import.meta.url)));
  const segments = thimbleDoorCollisionSegments(); assert.equal(segments.length, 12);
  const b = thimbleDoorBody(); assert.equal(b.revision, 0); assert.equal(thimbleRecorderBody().revision, 0);
  for (const segment of segments) {
    const actual = c.collision.components.find(p => p.id === segment.id).verticesGltf;
    for (const p of segment.vertices) {
      assert(actual.some(v => Math.abs(v[0] - p.x) < 1e-5 && Math.abs(v[2] - p.z) < 1e-5));
      assert(Math.abs(p.z) >= 16.99);
      for (const plane of segment.halfspaces) assert(plane.normal.x * p.x + plane.normal.z * p.z <= plane.offset + 1e-6);
    }
    assert(segment.vertices.every(v => v.z > 0) || segment.vertices.every(v => v.z < 0));
  }
  segments[0].vertices[0].x = 1e6;
  assert.notEqual(thimbleDoorCollisionSegments()[0].vertices[0].x, 1e6);
});
