import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SpaceBackground } from '../src/render/spaceBackground.js';
import { PaintedPlanets } from '../src/render/paintedPlanets.js';
import { PARALLAX_BANDS, PARALLAX_WRAP_ZOOM_CAP } from '../src/render/parallaxLayers.js';
import { RELEASE_COPY_MAPPINGS, copyReleaseRuntimeTrees } from '../scripts/lib/releasePackaging.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the entire extreme chase footprint remains inside the unshrunk debris cell', () => {
  const camera = new THREE.PerspectiveCamera(50, 4, 0.1, 20000);
  const distance = PARALLAX_WRAP_ZOOM_CAP;
  camera.position.set(0, distance * Math.sin(Math.PI / 3), -distance * 0.5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const spec of Object.values(PARALLAX_BANDS)) {
    assert.ok(spec.y + spec.yJitter / 2 + spec.radius1 * 2 < 0, 'dressing stays below gameplay');
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -spec.y + spec.yJitter / 2);
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const point = ray.ray.intersectPlane(plane, new THREE.Vector3());
      assert.ok(point);
      assert.ok(Math.max(Math.abs(point.x), Math.abs(point.z)) + spec.radius1 * 2 < spec.tile * 0.5 * 0.78);
    }
  }
});

function heroHarness() {
  const bg = Object.assign(Object.create(SpaceBackground.prototype), {
    H: 96, quadSize: 1000, camX: 0, camZ: 0, skySeed: 47,
    group: new THREE.Group(), planets: [], wormhole: null,
    backgroundComposition: { planetChance: 1, ringChance: 0, wormholeChance: 0 },
  });
  bg._spawnPlanet = function(spec) {
    const sprite = new THREE.Sprite();
    sprite.scale.setScalar(20);
    this.group.add(sprite);
    this.planets.push({ sprite, spec });
  };
  return bg;
}

test('crossing a wormhole-only grid boundary retains resident planets and their transforms', () => {
  const bg = heroHarness();
  bg.camX = 6719; // planet grid is still zero; worm grid crosses at 6720
  const spec = { bx: bg.camX * 0.055, bz: 0, seed: 5, kind: 'planet' };
  bg._spawnPlanet(spec);
  bg._refreshHeroes(false);
  const resident = bg.planets[0];
  const matrix = resident.sprite.matrix.clone();
  bg.camX = 6721;
  bg._refreshHeroes(false);
  assert.ok(bg.planets.includes(resident), 'unrelated grid must not respawn a visible landmark');
  assert.equal(resident.spec, spec);
  assert.deepEqual(resident.sprite.matrix, matrix);
});

test('window resize does not rebuild or rescale the sky geography', () => {
  const bg = Object.assign(Object.create(SpaceBackground.prototype), {
    H: 96, bgY: -211.2, starCell: 1800, heroSizeK: 4, quadSize: 5000,
    _computePerspScale: () => 1200, _publishOpeningSubmissionPackage() {},
    _buildLayers() { assert.fail('resize rebuilt layers'); },
    _rebuildStarsAndFlares() { assert.fail('resize reseeded stars'); },
    _refreshHeroes() { assert.fail('resize respawned heroes'); },
  });
  bg.onResize();
  assert.deepEqual([bg.H, bg.bgY, bg.starCell, bg.heroSizeK, bg.quadSize], [96, -211.2, 1800, 4, 5000]);
  assert.equal(bg.perspScale, 1200);
});

test('sector re-priming preserves the accumulated background phase', () => {
  const bg = Object.assign(Object.create(SpaceBackground.prototype), {
    _sectorId: 'same', layers: [{ streamU: 0.17, streamV: -0.23 }], camX: 300, camZ: 500,
  });
  bg.onSectorEnter({ id: 'same' });
  assert.deepEqual(bg.layers[0], { streamU: 0.17, streamV: -0.23 });
  assert.equal(bg._streamPrimed, false);
});

test('painted planet variants share image storage, update after decode, and dispose safely in flight', () => {
  const callbacks = [];
  const texture = new THREE.Texture();
  const library = new PaintedPlanets({ load(url, onLoad) {
    callbacks.push(onLoad); return callbacks.length === 1 ? texture : new THREE.Texture();
  } });
  for (const view of library.views) {
    assert.equal(view.source, texture.source);
    assert.deepEqual(view.repeat.toArray(), [0.5, 0.5]);
  }
  assert.equal(library.get({ type: 'gas', seed: 1 }), library.views[1]);
  const version = library.views[1].version;
  callbacks[1](); // the ring image may arrive before the atlas
  assert.equal(library.views[1].version, version, 'ring decode cannot upload an empty atlas');
  assert.equal(library.ready, false);
  callbacks[0]();
  assert.ok(library.views[1].version > version);
  assert.equal(library.ready, true);
  library.failed = true;
  assert.equal(library.get({ type: 'gas' }), null, 'missing art must allow the reported bake fallback');
  library.dispose();
  callbacks[0](); // late callback cannot re-upload disposed textures
  assert.equal(library.get({ type: 'gas' }), null);
});

test('the retail copy path contains the exact authored background pixels', async () => {
  const output = await mkdtemp(join(tmpdir(), 'spaceface-quiet-sky-'));
  try {
    const mappings = RELEASE_COPY_MAPPINGS.filter(m => m.source === 'assets/background');
    assert.equal(mappings.length, 1);
    await copyReleaseRuntimeTrees({ root: process.cwd(), webRoot: output, mappings });
    assert.deepEqual(await readFile(join(output, 'assets/background/quiet-planets.png')),
      await readFile('assets/background/quiet-planets.png'));
  } finally {
    await rm(output, { recursive: true, force: true }); // exact mkdtemp directory owned by this test
  }
});
