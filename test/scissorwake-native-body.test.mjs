import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { scissorwakePhysicalBody, SCISSORWAKE_RADIUS, SCISSORWAKE_SOURCE_SCALE, SCISSORWAKE_MASS } from '../src/data/scissorwakeBody.js';

test('Scissorwake contacts only its measured main hull; forward V and cosmetic blades stay empty', async () => {
  const sim = createSimulation({ seed: 7, systems: [] }), native = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  try {
    const entity = sim.spawn({ type: 'ship', hull: 105, radius: SCISSORWAKE_RADIUS, mass: SCISSORWAKE_MASS,
      pos: { x: 20, z: -30 }, rot: 0, physicsBody: scissorwakePhysicalBody(),
      data: { lootTableId: 'scissorwake', authoredAssetId: 'SF_SHIP_SCISSORWAKE' } });
    native.syncFromEntities(sim.state.entityList);
    native.step(1 / 60);
    const record = native.records.get(entity.id); assert.equal(record.colliders.length, 1);
    assert(record.body.isDynamic()); assert.equal(record.colliders[0].isSensor(), false);
    assert.equal(record.spec.mass, 28);
    assert(Math.abs(record.body.mass() - 28) < 1e-5, 'Rapier f32 mass preserves the 28-unit source contract');
    const contains = (x, z) => record.colliders[0].containsPoint({ x: 20 + x, y: 0, z: -30 + z });
    assert.equal(contains(-4, 0), true); assert.equal(contains(0, 2.5), true);
    assert.equal(contains(7, 0), false, 'actual negative V has no invisible hull');
    assert.equal(contains(9, 4), false, 'render-only blade is resolved by the existing cut sweep');
    assert.equal(contains(-4, 4), false); assert.equal(SCISSORWAKE_SOURCE_SCALE, 1);
  } finally { native.dispose(); sim.dispose(); }
});

test('native proxy vertices come directly from the source collision assembly and cannot mutate a second body', () => {
  const contract = JSON.parse(readFileSync(new URL('../assets/ships/forge/sources/scissorwake/measured-contract.json', import.meta.url)));
  const body = scissorwakePhysicalBody(), parts = contract.collision.components;
  assert.equal(parts.length, 1); assert.equal(parts[0].id, 'core');
  const source = parts[0].verticesGltf;
  for (const point of body.collisionProxyManifest.convexParts[0].points) {
    assert(source.some(v => Math.abs(v[0] - point.x * 17) < 1e-5 && Math.abs(v[2] - point.z * 17) < 1e-5));
  }
  body.collisionProxyManifest.convexParts[0].points[0].x = 100;
  assert.notEqual(scissorwakePhysicalBody().collisionProxyManifest.convexParts[0].points[0].x, 100);
});
