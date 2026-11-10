import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { palletJackPhysicalBody, PALLET_JACK_RADIUS, palletJackCradleSocket } from '../src/data/palletJackBody.js';

test('measured forklift has three native solids and a genuinely empty load gap', async () => {
  const sim = createSimulation({ seed: 9, systems: [] }), native = await createSg02DynamicBodyOwner();
  try {
    const body = palletJackPhysicalBody(), e = sim.spawn({ type: 'ship', mass: 100, radius: PALLET_JACK_RADIUS,
      hull: 160, pos: { x: 0, z: 0 }, physicsBody: body, data: {} });
    native.syncFromEntities(sim.state.entityList); native.step(1 / 60);
    const r = native.records.get(e.id); assert.equal(r.colliders.length, 3); assert.equal(r.body.mass(), 100);
    const contains = (x, z) => r.colliders.some(c => c.containsPoint({ x, y: 0, z }));
    for (const x of [2, 7, 11]) {
      assert.equal(contains(x, 0), false); assert.equal(contains(x, 7), true); assert.equal(contains(x, -7), true);
    }
    assert.equal(contains(-7, 0), true); assert.deepEqual(palletJackCradleSocket(), { x: 7, z: 0 });
    assert.equal(body.revision, 0);
  } finally { native.dispose(); sim.dispose(); }
});

test('fixed native parts are the three authored source assemblies; a returned proxy is independent', () => {
  const source = JSON.parse(readFileSync(new URL('../assets/ships/forge/sources/pallet_jack/measured-contract.json', import.meta.url)));
  const b = palletJackPhysicalBody(); assert.equal(source.collision.components.length, 3);
  for (const part of b.collisionProxyManifest.convexParts) {
    const vertices = source.collision.components.find(c => c.id === part.id).verticesGltf;
    for (const p of part.points) assert(vertices.some(v => Math.abs(v[0] - p.x * 20) < 1e-5 && Math.abs(v[2] - p.z * 20) < 1e-5));
  }
  b.collisionProxyManifest.convexParts[0].points[0].x = 100;
  assert.notEqual(palletJackPhysicalBody().collisionProxyManifest.convexParts[0].points[0].x, 100);
});
