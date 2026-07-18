import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createVfxPrecompileSalvo, vfx } from '../src/render/vfx.js';
import {
  commitInstancedSpriteBuckets,
  createInstancedSpriteBuckets,
  resetInstancedSpriteBuckets,
  writeInstancedSpriteFields,
} from '../src/render/combat/instancedSpritePool.js';

function makeHarness() {
  const scene = new THREE.Scene();
  const state = {
    playerId: 1,
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } }]]),
    entityList: [],
    settings: {
      video: { particleQuality: 'high', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene },
    content: {},
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });
  return { scene, system };
}

test('discrete VFX use four role-specific batched buckets instead of per-effect Sprite objects', () => {
  const { scene, system } = makeHarness();
  const sprites = [];
  const batches = [];
  scene.traverse((object) => {
    if (object.isSprite) sprites.push(object);
    if (object.userData?.spacefaceVfxSpriteBatch) batches.push(object);
  });

  assert.equal(sprites.length, 0, 'the VFX pool must not preallocate individual Sprite draws');
  assert.equal(batches.length, 4,
    'glow, ring, irregular smoke, and irregular combustion each use one instanced draw bucket');
  assert.equal(new Set(batches.map((batch) => batch.material)).size, 4);
  const smoke = batches.find((batch) => batch.userData.spriteBucket === 'smoke');
  assert(smoke);
  assert.equal(smoke.material.blending, THREE.NormalBlending,
    'dark smoke needs ordinary alpha blending instead of additive disappearance');
  const combustion = batches.find((batch) => batch.userData.spriteBucket === 'combustion');
  assert(combustion);
  assert.equal(combustion.geometry.getAttribute('aSpriteScale').itemSize, 2,
    'directional combustion and vapor cards require nonuniform scale');

  system._spawnSprite(0, 10, 0, 20, 0.2, 2, 5, 0.9, 0, '#ffffff', 0, 0);
  system._spawnSprite(1, -10, 0, -20, 0.3, 3, 8, 0.7, 0, '#66ccff', 0, 0);
  system._spawnSprite(2, 0, 0, -10, 0.8, 3, 9, 0.45, 0, '#39302c', 2, 1);
  system._spawnSprite(4, 5, 0, -5, 0.3, 2, 5, 0.7, 0, '#ff6a24', 2, 1, 2.2, 0.4);
  system.update(1 / 60);

  assert.equal(batches.reduce((sum, batch) => sum + batch.count, 0), 4,
    'four role events stay four live instances without allocating scene objects');
  assert.ok(combustion.geometry.getAttribute('aSpriteScale').getX(0)
    > combustion.geometry.getAttribute('aSpriteScale').getY(0),
  'combustion aspect must survive the CPU-to-GPU instance write');
});

test('pipeline warmup compiles the same four sprite-batch shaders used in gameplay', () => {
  const salvo = createVfxPrecompileSalvo();
  const sprites = [];
  const batches = [];
  salvo.traverse((object) => {
    if (object.isSprite) sprites.push(object);
    if (object.userData?.spacefaceVfxSpriteBatch) batches.push(object);
  });

  assert.equal(sprites.length, 0, 'warmup must not compile an obsolete SpriteMaterial path');
  assert.equal(batches.length, 4);
  assert.ok(batches.every((batch) => batch.count > 0), 'both batched shaders need a warmup instance');
});

test('batched sprite shaders preserve Three output color and tone mapping', () => {
  const { scene } = makeHarness();
  const batches = [];
  scene.traverse((object) => {
    if (object.userData?.spacefaceVfxSpriteBatch) batches.push(object);
  });
  for (const batch of batches) {
    assert.match(batch.material.fragmentShader, /#include <tonemapping_fragment>/);
    assert.match(batch.material.fragmentShader, /#include <colorspace_fragment>/);
  }
});

test('smoke participates in performance isolation and writes far-to-near', () => {
  const { scene, system } = makeHarness();
  const smoke = scene.children.find((object) => object.userData?.spriteBucket === 'smoke');
  assert(smoke);

  system._spawnSprite(2, 1, 0, 0, 1, 2, 4, 0.5, 0, '#39302c', 0, 0);
  system._spawnSprite(2, 20, 0, 0, 1, 2, 4, 0.5, 0, '#39302c', 0, 0);
  system.update(1 / 60);
  assert.equal(smoke.geometry.getAttribute('aSpritePosition').getX(0), 20,
    'normally blended smoke instances must be written far-to-near');

  system.state.render.perfVfxIsolation.hideAll();
  assert.equal(smoke.visible, false);
  system.state.render.perfVfxIsolation.restore();
  assert.equal(smoke.visible, true);
});

test('allocation-free instance writes degrade safely when a dense bucket is saturated', () => {
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
  const buckets = createInstancedSpriteBuckets(scene, 2, texture, texture, texture, texture);
  resetInstancedSpriteBuckets(buckets);

  assert.equal(writeInstancedSpriteFields(
    buckets, 'combustion', 0, 0, 0, 1, 2, 1, 0, 1, 0.5, 0.2, 0.8,
  ), true);
  assert.equal(writeInstancedSpriteFields(
    buckets, 'combustion', 1, 0, 0, 1, 2, 1, 0, 1, 0.5, 0.2, 0.8,
  ), true);
  assert.equal(writeInstancedSpriteFields(
    buckets, 'combustion', 2, 0, 0, 1, 2, 1, 0, 1, 0.5, 0.2, 0.8,
  ), false, 'dense fallback drops excess work instead of throwing or growing the pool');
  commitInstancedSpriteBuckets(buckets);
  assert.equal(buckets.combustion.writeCount, 2);
  assert.equal(buckets.combustion.mesh.count, 2);
});
