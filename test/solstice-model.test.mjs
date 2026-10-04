import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { buildSolsticeVisual, disposeSolsticeVisual } from '../src/render/characters/solsticeModel.js';
import { solsticeEntitySpec } from '../src/systems/solstice.js';
import { freezeStaticChildMatrices } from '../src/render/staticChildMatrices.js';

const parts = [
  { part: 'core', index: 0 },
  { part: 'prism', index: 0 },
  { part: 'prism', index: 1 },
  { part: 'prism', index: 2 },
  { part: 'wisp', index: 0 },
];

function makeEntity(part, index = 0) {
  const e = solsticeEntitySpec(part, index);
  e.vel = { x: 0, y: 0, z: 0 };
  return e;
}

test('authored solstice parts have finite geometry, bounded triangle and mesh budget', () => {
  let meshes = 0;
  let triangles = 0;

  for (const { part, index } of parts) {
    const e = makeEntity(part, index);
    const root = buildSolsticeVisual(e);
    root.updateMatrixWorld(true);

    assert.equal(root.userData.authoredAssetState, 'authored');
    assert.equal(root.userData.solstice, true);

    root.traverse(o => {
      if (o.isMesh) {
        meshes++;
        const pos = o.geometry.attributes.position;
        assert.ok(pos, 'Mesh has position attribute');
        const count = o.geometry.index ? o.geometry.index.count : pos.count;
        triangles += count / 3;
        for (let i = 0; i < pos.array.length; i++) {
          assert.ok(Number.isFinite(pos.array[i]), `Finite position at ${i}`);
        }
        assert.equal(o.material.map, null, 'No missing canvas/file textures');
      }
    });

    const box = new THREE.Box3().setFromObject(root);
    assert.ok(Number.isFinite(box.min.x));
    assert.ok(box.max.x - box.min.x < 350, 'Bounded bounding box');
    disposeSolsticeVisual(root);
  }

  assert.ok(meshes <= 80, `meshes: ${meshes}`);
  assert.ok(triangles < 18000, `triangles: ${triangles}`);
});

test('animated solstice joints survive renderer static-child freezing', () => {
  const e = makeEntity('core', 0);
  const root = buildSolsticeVisual(e);
  freezeStaticChildMatrices(root);

  for (const name of ['solstice_core_hub', 'outer_gimbal_ring', 'mid_gimbal_ring', 'inner_gimbal_ring', 'petal_hinge_0', 'volumetric_beam_cone']) {
    const obj = root.getObjectByName(name);
    assert.ok(obj, `Found ${name}`);
    assert.equal(obj.matrixAutoUpdate, true, `${name} keeps matrixAutoUpdate`);
  }

  e.data.solsticePose = {
    simTime: 3.5,
    beamAngle: 0.45,
    beamActive: true,
    beamIntensity: 1.2,
    bloomProgress: 0.6,
    folded: false,
    bloomed: true,
  };

  root.userData.updateAuthoredMotion(e, 3.5, {});
  root.updateMatrixWorld(true);

  const shockwave = root.getObjectByName('bloom_shockwave');
  assert.ok(shockwave.visible, 'Shockwave visible during bloom');
  disposeSolsticeVisual(root);
});

test('reduced motion and reduced flash adjust lighting and suppresses rapid oscillations', () => {
  const e = makeEntity('core', 0);
  const root = buildSolsticeVisual(e);
  e.data.solsticePose = {
    simTime: 2.0,
    beamAngle: 0,
    beamActive: true,
    bloomProgress: 0.5,
  };

  root.userData.updateAuthoredMotion(e, 2.0, { reducedMotion: true, reducedFlash: true });
  const shockwave = root.getObjectByName('bloom_shockwave');
  assert.equal(shockwave.visible, false, 'Shockwave suppressed under reducedMotion');

  disposeSolsticeVisual(root);
});

test('model posing cannot mutate simulation or depend on ambient random', () => {
  const oldRandom = Math.random;
  const e = makeEntity('core', 0);
  const root = buildSolsticeVisual(e);
  const beforeJson = JSON.stringify(e);

  Math.random = () => { throw new Error('ambient Math.random in update'); };
  try {
    for (let i = 0; i < 300; i++) {
      root.userData.updateAuthoredMotion(e, i / 60, {});
    }
    assert.equal(JSON.stringify(e), beforeJson);
  } finally {
    Math.random = oldRandom;
    disposeSolsticeVisual(root);
  }
});

test('disposal is idempotent and releases all GPU resources cleanly', () => {
  for (const { part, index } of parts) {
    const root = buildSolsticeVisual(makeEntity(part, index));
    const scene = new THREE.Scene();
    scene.add(root);

    const geos = new Set();
    const mats = new Set();
    root.traverse(o => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
      }
    });

    let gCount = 0;
    let mCount = 0;
    for (const g of geos) g.addEventListener('dispose', () => gCount++);
    for (const m of mats) m.addEventListener('dispose', () => mCount++);

    disposeSolsticeVisual(root);
    disposeSolsticeVisual(root); // idempotent second call

    assert.equal(gCount, geos.size);
    assert.equal(mCount, mats.size);
    assert.equal(root.parent, null);
  }
});

test('visual factory dispatches solsticePart correctly', async () => {
  const content = await readFile(new URL('../src/render/visualFactory.js', import.meta.url), 'utf8');
  assert.match(content, /if \(e\.data\?\.solsticePart\) return stampBuiltVisual\(buildSolsticeVisual\(e\)\)/);
});
