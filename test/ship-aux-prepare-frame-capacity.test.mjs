import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createShipAuxPool,
  ensureShipAuxPoolCapacityForFrame,
  syncShipAuxPools,
  waitForShipAuxPoolGrowth,
} from '../src/render/renderer.js';

function shipFixture(id) {
  const root = new THREE.Group();
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(1, 4, 3),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x5fd0ff) },
        uFlash: { value: 0.25 },
        uBase: { value: 0.22 },
      },
    }),
  );
  root.add(bubble);
  root.userData.shieldBubble = bubble;
  const nav = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.025, 4, 3),
    new THREE.MeshBasicMaterial(),
    2,
  );
  nav.name = 'GLTFKit_Nav_Lights';
  nav.userData.damageRole = 'navLight';
  root.add(nav);
  root.updateMatrixWorld(true);
  return {
    entity: { id, alive: true, type: 'ship', shield: 100 },
    root,
    dispose() {
      bubble.geometry.dispose();
      bubble.material.dispose();
      nav.geometry.dispose();
      nav.material.dispose();
      nav.dispose();
    },
  };
}

test('production aux pools pre-size at opening and replace overflow only after post-paint admission', async () => {
  const scene = new THREE.Scene();
  const timeline = [];
  let releasePostPaint;
  const postPaint = new Promise((resolve) => { releasePostPaint = resolve; });
  const pool = createShipAuxPool(scene, {
    deferGrowth: true,
    yieldToPostPaint: async () => {
      timeline.push('wait-post-paint');
      await postPaint;
      timeline.push('post-paint');
    },
    prepareGpuResidency: async (roots) => {
      timeline.push(`admit:${roots.length}`);
      assert.ok(roots.every((root) => root.count === 1),
        'detached zero-count pools must be drawable inside the hidden admission pass');
    },
  });
  const fixtures = Array.from({ length: 72 }, (_, index) => shipFixture(index + 1));
  const meshes = new Map(fixtures.map(({ entity, root }) => [entity.id, root]));
  const opening = fixtures.slice(0, 40).map(({ entity }) => entity);

  ensureShipAuxPoolCapacityForFrame(pool, opening, meshes);
  assert.ok(pool.shield.capacity >= 40);
  assert.ok(pool.nav.capacity >= 80);
  const openingShield = pool.shield.mesh;
  const openingNav = pool.nav.mesh;
  syncShipAuxPools(pool, opening, meshes);
  assert.strictEqual(pool.shield.mesh, openingShield);
  assert.strictEqual(pool.nav.mesh, openingNav);
  assert.equal(pool.shield.mesh.count, 40);
  assert.equal(pool.nav.mesh.count, 80);

  const crowded = fixtures.map(({ entity }) => entity);
  syncShipAuxPools(pool, crowded, meshes);
  await Promise.resolve();
  assert.strictEqual(pool.shield.mesh, openingShield,
    'prepareFrame sync keeps drawing the resident shield allocation');
  assert.strictEqual(pool.nav.mesh, openingNav,
    'prepareFrame sync keeps drawing the resident nav allocation');
  assert.equal(pool.shield.mesh.count, pool.shield.capacity);
  assert.equal(pool.nav.mesh.count, pool.nav.capacity);
  assert.deepEqual(timeline, ['wait-post-paint']);

  releasePostPaint();
  await waitForShipAuxPoolGrowth(pool);
  assert.deepEqual(timeline, ['wait-post-paint', 'post-paint', 'admit:2']);
  assert.equal(pool.shield.mesh.count, 0);
  assert.equal(pool.nav.mesh.count, 0);
  assert.notStrictEqual(pool.shield.mesh, openingShield);
  assert.notStrictEqual(pool.nav.mesh, openingNav);
  assert.ok(pool.shield.capacity >= 72);
  assert.ok(pool.nav.capacity >= 144);

  syncShipAuxPools(pool, crowded, meshes);
  assert.equal(pool.shield.mesh.count, 72);
  assert.equal(pool.nav.mesh.count, 144);

  for (const fixture of fixtures) fixture.dispose();
  pool.shield.mesh.geometry.dispose();
  pool.shield.material.dispose();
  pool.shield.mesh.dispose();
  pool.nav.material.dispose();
  pool.nav.mesh.dispose();
});
