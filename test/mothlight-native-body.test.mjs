import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { mothlightPhysicalBody, mothlightLampPhysicalBody, mothlightLampSocket,
  MOTHLIGHT_RADIUS, MOTHLIGHT_LAMP_RADIUS } from '../src/data/mothlightBody.js';

test('all four measured release centers clear the retained native skin by a whole original lamp radius', async () => {
  const sim = createSimulation({ seed: 10, systems: [] }), native = await createSg02DynamicBodyOwner();
  try {
    const e = sim.spawn({ type: 'ship', hull: 95, mass: 60, radius: MOTHLIGHT_RADIUS,
      pos: { x: 0, z: 0 }, physicsBody: mothlightPhysicalBody(), data: {} });
    native.syncFromEntities(sim.state.entityList); native.step(1 / 60);
    const record = native.records.get(e.id); assert.equal(record.colliders.length, 1);
    assert(Math.abs(record.body.mass() - 60) < 1e-5, 'native f32 mass preserves the sixty-unit source');
    for (let i = 0; i < 4; i++) {
      const p = mothlightLampSocket(i), point = { ...p, y: 0 }, skin = record.colliders[0].projectPoint(point, true);
      assert.equal(skin.isInside, false);
      const distance = Math.hypot(p.x - skin.point.x, p.z - skin.point.z);
      assert(distance > MOTHLIGHT_LAMP_RADIUS, `source exit ${i} has ${distance}m clearance`);
    }
    assert.throws(() => mothlightLampSocket(4), RangeError);
    assert.equal(mothlightLampPhysicalBody().mass, 2); assert.equal(mothlightLampPhysicalBody().revision, 0);
  } finally { native.dispose(); sim.dispose(); }
});

test('source-exact stock mass and lever arm inertia decrease before independent bodies are created', () => {
  const c = JSON.parse(readFileSync(new URL('../assets/ships/forge/sources/mothlight/measured-contract.json', import.meta.url)));
  const lamp = JSON.parse(readFileSync(new URL('../assets/ships/forge/sources/mothlight_lamp/measured-contract.json', import.meta.url)));
  assert(lamp.bounds.maxRootDistanceMetres < MOTHLIGHT_LAMP_RADIUS);
  const full = mothlightPhysicalBody(); let prior = full;
  for (let stock = 3; stock >= 0; stock--) {
    const b = mothlightPhysicalBody(stock, 4 - stock), p = mothlightLampSocket(3 - stock);
    assert.equal(prior.mass - b.mass, 2);
    assert(Math.abs(prior.inertiaY - b.inertiaY - (2 * (p.x ** 2 + p.z ** 2) + mothlightLampPhysicalBody().inertiaY)) < 1e-8);
    assert.deepEqual(b.collisionProxyManifest, full.collisionProxyManifest);
    assert.equal(b.revision, 4 - stock); prior = b;
  }
  assert.equal(prior.mass, 52);
  for (let i = 0; i < 4; i++) {
    const p = c.sockets[`SOCKET_Lamp_Release_${i + 1}`].positionGltf;
    assert.deepEqual(mothlightLampSocket(i), { x: p[0], z: p[2] });
  }
  for (const p of full.collisionProxyManifest.convexParts[0].points)
    assert(c.collision.components[0].verticesGltf.some(v => Math.abs(v[0] - p.x * 21) < 1e-5 && Math.abs(v[2] - p.z * 21) < 1e-5));
});
