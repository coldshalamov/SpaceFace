import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

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

function bucketCounts(system) {
  const buckets = system._spriteBatches;
  if (!buckets) return null;
  return {
    glow: buckets.glow.mesh.count,
    ring: buckets.ring.mesh.count,
    smoke: buckets.smoke.mesh.count,
    combustion: buckets.combustion.mesh.count,
    live: system._liveSpriteCount,
    idle: !!system._spritesPublishedIdle,
  };
}

test('quiet empty sprites latch after first idle commit and skip reset+commit', () => {
  const { system } = makeHarness();
  assert.equal(system._liveSpriteCount, 0);
  assert.equal(system._spritesPublishedIdle, false);

  system._integrateSprites(1 / 60);
  const afterFirst = bucketCounts(system);
  assert.equal(afterFirst.idle, true, 'first empty integrate publishes idle');
  assert.equal(afterFirst.glow, 0);
  assert.equal(afterFirst.ring, 0);
  assert.equal(afterFirst.smoke, 0);
  assert.equal(afterFirst.combustion, 0);

  // Force a dirty mesh.count so a missed skip would republish and clear it.
  system._spriteBatches.glow.mesh.count = 7;
  system._integrateSprites(1 / 60);
  const afterLatch = bucketCounts(system);
  assert.equal(afterLatch.idle, true);
  assert.equal(afterLatch.glow, 7,
    'latched quiet path must not re-commit (picture already at count 0 from first publish)');
});

test('activateSprite dirty-wake clears idle latch then re-latches after drain', () => {
  const { system } = makeHarness();
  system._integrateSprites(1 / 60);
  assert.equal(system._spritesPublishedIdle, true);

  system._spawnSprite(0, 10, 0, 20, 0.2, 2, 5, 0.9, 0, '#ffffff', 0, 0);
  assert.equal(system._liveSpriteCount, 1);
  assert.equal(system._spritesPublishedIdle, false, 'activate must clear idle latch');

  system._integrateSprites(1 / 60);
  assert.equal(system._spritesPublishedIdle, false);
  assert.ok(system._liveSpriteCount >= 1 || system._spriteBatches.glow.mesh.count
    + system._spriteBatches.ring.mesh.count
    + system._spriteBatches.smoke.mesh.count
    + system._spriteBatches.combustion.mesh.count >= 1);

  // Age out the sprite by integrating past life.
  for (let i = 0; i < 400; i++) system._integrateSprites(1 / 30);
  assert.equal(system._liveSpriteCount, 0, 'sprite must drain');
  assert.equal(system._spritesPublishedIdle, true, 'empty path re-latches after drain');
  const counts = bucketCounts(system);
  assert.equal(counts.glow + counts.ring + counts.smoke + counts.combustion, 0);
});

test('picture unchanged while latched — all four bucket meshes stay count 0', () => {
  const { system } = makeHarness();
  system._integrateSprites(1 / 60);
  for (let i = 0; i < 60; i++) system._integrateSprites(1 / 60);
  const counts = bucketCounts(system);
  assert.equal(counts.idle, true);
  assert.equal(counts.glow, 0);
  assert.equal(counts.ring, 0);
  assert.equal(counts.smoke, 0);
  assert.equal(counts.combustion, 0);
});
