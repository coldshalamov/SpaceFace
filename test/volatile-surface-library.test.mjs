import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { getReadyVolatileSurface, preloadVolatileSurface, VOLATILE_SURFACE_URL } from '../src/render/volatileSurfaceLibrary.js';

test('volatile surface fails safely, retries, and upgrades existing bottles without changing their map shader', async () => {
  let disposed = false;
  const failedTexture = new THREE.Texture();
  failedTexture.dispose = () => { disposed = true; };
  const failed = await preloadVolatileSurface({ initTexture() { throw new Error('upload failed'); } }, {
    loadTexture: async () => failedTexture,
  });
  assert.equal(failed, null);
  assert.equal(getReadyVolatileSurface(), null);
  assert.equal(disposed, true);

  let resolveTexture;
  const loaded = new THREE.Texture();
  const initialized = [];
  const renderer = { initTexture(texture) { initialized.push(texture); } };
  const pending = preloadVolatileSurface(renderer, {
    loadTexture: () => new Promise(resolve => { resolveTexture = resolve; }),
  });
  const factory = createVisualFactory({ renderer, readyPackagedBodies: {} });
  const entity = { id: 1, type: 'payload', radius: 3, data: { volatileClass: 'cryogenic' } };
  const root = factory.build(entity);
  const bottle = root.getObjectByName('VolatilePod_Bottle');
  const placeholder = bottle.material.map;
  const materialVersion = bottle.material.version;
  assert.equal(bottle.material.color.getHex(), 0x8fe1fa, 'the old class color is the fallback');
  assert.ok(placeholder?.isDataTexture, 'a white map keeps the map shader variant present');
  await Promise.resolve();
  resolveTexture(loaded);
  assert.equal(await pending, loaded);
  await Promise.resolve();
  assert.deepEqual(initialized, [loaded]);
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
