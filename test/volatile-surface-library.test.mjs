import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { getReadyVolatileSurface, preloadVolatileSurface, VOLATILE_SURFACE_URL } from '../src/render/volatileSurfaceLibrary.js';

test('volatile surface bounds and shares retries, then upgrades existing bottles without a new shader', async () => {
  let disposed = 0;
  const failedTexture = new THREE.Texture();
  failedTexture.dispose = () => { disposed++; };
  let failures = 0;
  let releaseFailedRetry;
  let signalFailedRetry;
  const failedRetryScheduled = new Promise((resolve) => { signalFailedRetry = resolve; });
  const failed = preloadVolatileSurface({ initTexture() { throw new Error('upload failed'); } }, {
    loadTexture: async () => { failures++; return failedTexture; },
    retryDelay: () => {
      signalFailedRetry();
      return new Promise((resolve) => { releaseFailedRetry = resolve; });
    },
  });
  assert.equal(preloadVolatileSurface({}), failed, 'concurrent factories share the pending retry');
  await failedRetryScheduled;
  assert.equal(failures, 1, 'the second attempt waits for the retry delay');
  releaseFailedRetry();
  assert.equal(await failed, null);
  assert.equal(failures, 2, 'a failed wave has exactly one retry');
  assert.equal(getReadyVolatileSurface(), null);
  assert.equal(disposed, 2, 'each failed upload releases its decoded texture');

  let resolveTexture;
  let releaseRetry;
  let signalRetry;
  let signalSecondLoad;
  let attempts = 0;
  const retryScheduled = new Promise((resolve) => { signalRetry = resolve; });
  const secondLoadStarted = new Promise((resolve) => { signalSecondLoad = resolve; });
  const loaded = new THREE.Texture();
  const initialized = [];
  const renderer = { initTexture(texture) { initialized.push(texture); } };
  const pending = preloadVolatileSurface(renderer, {
    loadTexture: () => {
      attempts++;
      if (attempts === 1) return Promise.reject(new Error('temporary load failure'));
      signalSecondLoad();
      return new Promise((resolve) => { resolveTexture = resolve; });
    },
    retryDelay: () => {
      signalRetry();
      return new Promise((resolve) => { releaseRetry = resolve; });
    },
  });
  const factory = createVisualFactory({ renderer, readyPackagedBodies: {} });
  const entity = { id: 1, type: 'payload', radius: 3, data: { volatileClass: 'cryogenic' } };
  const oldBottle = factory.build(entity).getObjectByName('VolatilePod_Bottle');
  const oldMaterial = oldBottle.material;
  const oldPlaceholder = oldMaterial.map;
  // An invalidation while loading must not upgrade a retired material.
  invalidateVisualFactoryCaches();
  const bottle = factory.build(entity).getObjectByName('VolatilePod_Bottle');
  const otherBottle = factory.build({ ...entity, id: 2, data: { volatileClass: 'corrosive' } })
    .getObjectByName('VolatilePod_Bottle');
  const placeholder = bottle.material.map;
  const materialVersion = bottle.material.version;
  assert.equal(bottle.material.color.getHex(), 0x898f91, 'the fallback is neutral, not a glowing class color');
  assert.equal(bottle.material.emissiveIntensity, 0);
  assert.equal(otherBottle.material, bottle.material, 'hazard classes share the same pending shell material');
  assert.ok(placeholder?.isDataTexture, 'a white map keeps the map shader variant present');
  await retryScheduled;
  assert.equal(attempts, 1);
  releaseRetry();
  await secondLoadStarted;
  resolveTexture(loaded);
  assert.equal(await pending, loaded);
  await Promise.resolve();
  assert.deepEqual(initialized, [loaded]);
  assert.equal(oldMaterial.map, oldPlaceholder, 'invalidated material stays retired');
  assert.equal(bottle.material.map, loaded, 'the existing shared material receives the warmed texture');
  assert.equal(bottle.material.version, materialVersion, 'swapping an existing map does not request a new shader');
  assert.equal(bottle.material.color.getHex(), 0xffffff);
  assert.equal(bottle.material.emissiveIntensity, 0);
  assert.equal(loaded.colorSpace, THREE.SRGBColorSpace);
  assert.equal(loaded.wrapS, THREE.RepeatWrapping);
  assert.equal(getReadyVolatileSurface(), loaded);

  const classes = [
    ['explosive', 0xffb340], ['corrosive', 0x7dd66a],
    ['superdense', 0xa77dff], ['cryogenic', 0x8fe1fa],
  ];
  const cages = [];
  for (const [klass, expected] of classes) {
    for (const type of ['payload', 'pickup']) {
      const data = { volatileClass: klass };
      const before = JSON.stringify(data);
      const visual = factory.build({ id: `${klass}:${type}`, type, radius: 3, data });
      const shell = visual.getObjectByName('VolatilePod_Bottle');
      const cage = visual.getObjectByName('VolatilePod_ContainmentAndValve');
      assert.equal(visual.children[0], shell, 'pickup motion still owns child zero');
      assert.equal(cage.parent, shell);
      assert.equal(shell.material.map, loaded, 'classes share one surface texture');
      assert.equal(shell.material, bottle.material, 'all hazard classes share one shell material');
      const colors = cage.geometry.getAttribute('color');
      const wanted = new THREE.Color(expected);
      assert.ok(Array.from({ length: colors.count }, (_, i) => i).some(i =>
        Math.abs(colors.getX(i) - wanted.r) < 1e-6
        && Math.abs(colors.getY(i) - wanted.g) < 1e-6
        && Math.abs(colors.getZ(i) - wanted.b) < 1e-6), `${klass} keeps its physical warning color`);
      assert.equal(JSON.stringify(data), before, 'render construction does not mutate simulation data');
      shell.geometry.computeBoundingSphere();
      cage.geometry.computeBoundingSphere();
      assert.ok(cage.geometry.boundingSphere.radius <= 1);
      assert.ok(shell.geometry.boundingSphere.radius <= 1);
      const positions = cage.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        assert.ok(Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)) <= 1 + 1e-6,
          'containment geometry stays inside the entity collision envelope');
      }
      cages.push(cage);
    }
  }
  assert.equal(cages[0].geometry.getAttribute('position'), cages[2].geometry.getAttribute('position'),
    'class variants share the same geometry buffers');
  assert.notEqual(cages[0].geometry.getAttribute('color'), cages[2].geometry.getAttribute('color'));
  assert.equal(cages[0].geometry.index.count / 3 + bottle.geometry.index.count / 3, 1020);
  invalidateVisualFactoryCaches();
});

test('the shipped generated surface matches its provenance', async () => {
  const base = new URL('../assets/ships/release/surfaces/volatile-vessel/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  const bytes = await readFile(new URL('pressure-shell.webp', base));
  assert.equal(VOLATILE_SURFACE_URL, '/assets/ships/release/surfaces/volatile-vessel/pressure-shell.webp');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files['pressure-shell.webp'].sha256);
});
