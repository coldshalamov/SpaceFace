import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  _resetProceduralPbrFallbackForTest as reset,
  applyProceduralPbrFallback as apply,
  proceduralPbrFallbackDiagnostics as diagnostics,
} from '../src/render/proceduralPbrFallback.js';

const roles = [
  'hull', 'accent', 'mechanical', 'warning', 'geology', 'radiator',
  'docking', 'ceramic', 'service', 'rubber', 'repair',
];

test('procedural maps preserve the established pixels for all role variants', () => {
  reset();
  const digest = createHash('sha256');
  for (const role of roles) {
    const seen = new Set();
    for (let i = 0; seen.size < 4; i++) {
      const material = new THREE.MeshStandardMaterial();
      material.name = `sample-${i}`;
      assert.equal(apply(material, role, { assetId: 'benchmark' }), true);
      const variant = material.userData.spacefaceProceduralPbrFallback.variant;
      if (seen.has(variant)) continue;
      seen.add(variant);
      for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
        digest.update(`${role}:${variant}:${texture.name}:${texture.colorSpace};`);
        digest.update(texture.image.data);
      }
    }
  }
  // Recorded from the pre-change recipe, including color-space and name metadata.
  assert.equal(digest.digest('hex'), '1a87f33443bc9ddcc53dfa066285a4ed64dc2fa2662e47ec17f8e01e5a5201ba');
});

test('mixed authored coverage lazily shares each missing map without replacing authored maps', () => {
  for (const role of ['hull', 'mechanical', 'geology']) {
    reset();
    const reference = new THREE.MeshStandardMaterial();
    reference.name = 'mixed-coverage';
    apply(reference, role, { assetId: 'test-asset' });
    const expected = [reference.map, reference.normalMap, reference.roughnessMap]
      .map(texture => Buffer.from(texture.image.data));
    reset();

    const authored = new THREE.Texture();
    const material = options => {
      const result = new THREE.MeshStandardMaterial(options);
      result.name = 'mixed-coverage';
      return result;
    };

    const base = material({ normalMap: authored, roughnessMap: authored, metalnessMap: authored });
    assert.equal(apply(base, role, { assetId: 'test-asset' }), true);
    assert.strictEqual(base.normalMap, authored);
    assert.strictEqual(base.roughnessMap, authored);
    assert.strictEqual(base.metalnessMap, authored);
    assert.equal(diagnostics().textures, 1);
    assert.deepEqual(Buffer.from(base.map.image.data), expected[0]);

    const normal = material({ map: authored, roughnessMap: authored, metalnessMap: authored });
    apply(normal, role, { assetId: 'test-asset' });
    assert.strictEqual(normal.map, authored);
    assert.equal(diagnostics().textures, 2);
    assert.deepEqual(Buffer.from(normal.normalMap.image.data), expected[1]);
    assert.ok(normal.normalScale.x > 0);

    const roughness = material({ map: authored, normalMap: authored, metalnessMap: authored });
    apply(roughness, role, { assetId: 'test-asset' });
    assert.strictEqual(roughness.metalnessMap, authored);
    assert.equal(diagnostics().textures, 3);
    assert.deepEqual(Buffer.from(roughness.roughnessMap.image.data), expected[2]);

    const metalness = material({ map: authored, normalMap: authored, roughnessMap: authored });
    apply(metalness, role, { assetId: 'test-asset' });
    assert.strictEqual(metalness.metalnessMap, roughness.roughnessMap);
    assert.strictEqual(metalness.roughnessMap, authored);
    assert.equal(diagnostics().textures, 3);

    const again = material({ normalMap: authored, roughnessMap: authored, metalnessMap: authored });
    apply(again, role, { assetId: 'test-asset' });
    assert.strictEqual(again.map, base.map);
    let disposed = false;
    base.map.addEventListener('dispose', () => { disposed = true; });
    base.map.dispose();
    assert.equal(disposed, false, 'shared map lifetime remains owned by the fallback cache');
    assert.deepEqual(base.userData.spacefaceProceduralPbrFallback.supplied,
      { baseColor: true, normal: false, roughness: false, metalness: false });
  }
});

test('paired missing maps and later turns reproduce the original surfaces', async () => {
  for (const role of ['hull', 'mechanical', 'geology']) {
    reset();
    const full = new THREE.MeshStandardMaterial();
    full.name = 'paired-maps';
    apply(full, role, { assetId: 'test-asset' });
    const expected = [full.map, full.normalMap, full.roughnessMap]
      .map(texture => Buffer.from(texture.image.data));
    const authored = new THREE.Texture();
    for (const missing of [[true, true, false], [true, false, true], [false, true, true]]) {
      reset();
      const material = new THREE.MeshStandardMaterial({
        map: missing[0] ? null : authored,
        normalMap: missing[1] ? null : authored,
        roughnessMap: missing[2] ? null : authored,
        metalnessMap: missing[2] ? null : authored,
      });
      material.name = 'paired-maps';
      apply(material, role, { assetId: 'test-asset' });
      const actual = [material.map, material.normalMap, material.roughnessMap];
      for (let i = 0; i < actual.length; i++) {
        if (missing[i]) assert.deepEqual(Buffer.from(actual[i].image.data), expected[i]);
        else assert.strictEqual(actual[i], authored);
      }
      assert.equal(diagnostics().textures, 2);

      // The field cache is allowed to expire; a later request must still regenerate the exact map.
      await Promise.resolve();
      const later = new THREE.MeshStandardMaterial({
        map: missing[0] ? authored : null,
        normalMap: missing[1] ? authored : null,
        roughnessMap: missing[2] ? authored : null,
        metalnessMap: missing[2] ? authored : null,
      });
      later.name = 'paired-maps';
      apply(later, role, { assetId: 'test-asset' });
      const added = [later.map, later.normalMap, later.roughnessMap];
      for (let i = 0; i < added.length; i++) {
        if (!missing[i]) assert.deepEqual(Buffer.from(added[i].image.data), expected[i]);
        else assert.strictEqual(added[i], authored);
      }
      assert.equal(diagnostics().textures, 3);
    }
  }
});

test('complete, disabled, and unsupported materials do not allocate fallback maps', () => {
  reset();
  const authored = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    map: authored, bumpMap: authored, roughnessMap: authored, metalnessMap: authored,
  });
  assert.equal(apply(material, 'hull'), false);
  assert.equal(apply(new THREE.MeshStandardMaterial(), 'hull', { allowTextures: false }), false);
  assert.equal(apply(new THREE.MeshStandardMaterial(), 'glass'), false);
  assert.equal(diagnostics().bundles, 0);
  assert.equal(diagnostics().textures, 0);
  assert.strictEqual(material.bumpMap, authored);
  assert.equal(material.normalMap, null);
});

test('the reusable intermediate stays bounded and is released after the material pass', async () => {
  reset();
  const authored = new THREE.Texture();
  for (const role of ['hull', 'mechanical', 'geology']) {
    const material = new THREE.MeshStandardMaterial({
      normalMap: authored, roughnessMap: authored, metalnessMap: authored,
    });
    apply(material, role, { assetId: 'test-asset' });
    assert.equal(diagnostics().temporaryFieldBytes, 128 * 128 * (4 + 4 * 8));
  }
  await Promise.resolve();
  assert.equal(diagnostics().temporaryFieldBytes, 0);
});

test('mixed-map fallback uses the shipped Three renderer types and settings', async () => {
  const vendorUrl = new URL('../vendor/three.module.js', import.meta.url);
  const shippedThree = await import(vendorUrl.href);
  const sourceUrl = new URL('../src/render/proceduralPbrFallback.js', import.meta.url);
  const source = (await readFile(sourceUrl, 'utf8'))
    .replace("import * as THREE from 'three';", `import * as THREE from ${JSON.stringify(vendorUrl.href)};`);
  const shippedFallback = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const nodeMaterial = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  const shippedMaterial = new shippedThree.MeshStandardMaterial({ map: new shippedThree.Texture() });
  nodeMaterial.name = shippedMaterial.name = 'vendor-comparison';
  reset();
  apply(nodeMaterial, 'geology', { assetId: 'test-asset' });
  shippedFallback.applyProceduralPbrFallback(shippedMaterial, 'geology', { assetId: 'test-asset' });

  assert.ok(shippedMaterial.normalMap instanceof shippedThree.DataTexture);
  assert.strictEqual(shippedMaterial.roughnessMap, shippedMaterial.metalnessMap);
  assert.equal(shippedFallback.proceduralPbrFallbackDiagnostics().textures, 2);
  for (const key of ['normalMap', 'roughnessMap']) {
    assert.deepEqual(Buffer.from(shippedMaterial[key].image.data), Buffer.from(nodeMaterial[key].image.data));
    assert.equal(shippedMaterial[key].colorSpace, nodeMaterial[key].colorSpace);
    assert.equal(shippedMaterial[key].wrapS, shippedThree.RepeatWrapping);
    assert.equal(shippedMaterial[key].version, 1);
  }
  assert.equal(shippedMaterial.normalScale.x, nodeMaterial.normalScale.x);
});
