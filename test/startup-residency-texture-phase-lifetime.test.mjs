import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createPackageDetachManifest,
  detachPackageTexture,
  isPackageTextureDetached,
  measureLivePackageCpuPayloads,
  resetPackageDetachManifestsForTests,
  retainPresentedTextureLeases,
} from '../src/render/packageCpuDetach.js';
import { prepareStartupGpuResidency } from '../src/render/startupGpuResidency.js';

function fixture(count = 1) {
  resetPackageDetachManifestsForTests();
  const textures = Array.from({ length: count }, () => {
    const texture = new THREE.DataTexture(new Uint8Array(4 * 1024 * 1024), 1024, 1024);
    texture.needsUpdate = true;
    return texture;
  });
  const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({
    map: textures[0], normalMap: textures[1] || null,
  }));
  createPackageDetachManifest({ contentHash: 'texture-phase-lifetime', resources: textures }, {
    redecode: async () => { throw new Error('unexpected decode'); },
    collectResources: value => value.resources,
  });
  const renderer = {
    initTexture(texture) {
      assert.equal(texture.source.data.data.byteLength, 4 * 1024 * 1024,
        'the queued texture upload must retain its original payload');
    },
    getRenderTarget() { return null; },
    setRenderTarget() {},
    render() {},
  };
  const options = { yieldToMain: async () => {}, paceQueue: async () => {} };
  return { textures, root, renderer, options };
}

test('completed texture payloads release before the texture-free geometry proxy', async () => {
  const { textures, root, renderer, options } = fixture();
  let geometryDraws = 0;
  let uploadCalls = 0;
  const upload = renderer.initTexture;
  renderer.initTexture = texture => { uploadCalls++; upload(texture); };
  renderer.render = scene => {
    geometryDraws++;
    assert.ok(scene.children.length > 0);
    assert.ok(scene.children.every(object => !object.material.map));
    assert.equal(isPackageTextureDetached(textures[0]), true);
    assert.equal(measureLivePackageCpuPayloads([{ textures, geometries: [] }]).liveCpuBufferBytes, 0);
  };
  options.yieldToMain = async () => {
    if (uploadCalls === 0) {
      assert.equal(detachPackageTexture(textures[0]), false,
        'a competing detach must not empty a queued texture upload');
    }
  };
  const result = await prepareStartupGpuResidency(renderer, root, options);
  assert.equal(uploadCalls, 1);
  assert.equal(geometryDraws, 1);
  assert.equal(result.geometryResidency.drawables, 1);
  assert.equal(result.uploads.length, 1);
});

test('the texture phase releases only its own lease before geometry', async () => {
  const { textures, root, renderer, options } = fixture();
  const releaseExternal = retainPresentedTextureLeases(textures);
  let geometryDraws = 0;
  renderer.render = () => {
    geometryDraws++;
    assert.equal(isPackageTextureDetached(textures[0]), false);
    assert.equal(detachPackageTexture(textures[0]), false);
    assert.equal(textures[0].source.data.data.byteLength, 4 * 1024 * 1024);
  };
  try {
    await prepareStartupGpuResidency(renderer, root, options);
    assert.equal(geometryDraws, 1);
    assert.equal(detachPackageTexture(textures[0]), false, 'the external owner still holds its lease');
  } finally { releaseExternal(); }
  assert.equal(detachPackageTexture(textures[0]), true, 'no phase lease remains after external release');
});

test('a real texture upload failure preserves its error and only detaches completed uploads', async () => {
  const { textures, root, renderer, options } = fixture(2);
  const error = new Error('texture upload failed');
  const upload = renderer.initTexture;
  renderer.initTexture = texture => {
    upload(texture);
    if (texture === textures[1]) throw error;
  };
  renderer.render = () => assert.fail('geometry must not run after a texture failure');
  await assert.rejects(prepareStartupGpuResidency(renderer, root, options), value => value === error);
  assert.equal(isPackageTextureDetached(textures[0]), true);
  assert.equal(isPackageTextureDetached(textures[1]), false, 'a failed upload has no residency proof');
  assert.equal(detachPackageTexture(textures[1]), true, 'the failed pass released its own lease');
});

test('a geometry failure preserves its error after completed texture payloads release', async () => {
  const { textures, root, renderer, options } = fixture();
  const error = new Error('geometry upload failed');
  renderer.render = () => {
    assert.equal(isPackageTextureDetached(textures[0]), true);
    throw error;
  };
  await assert.rejects(prepareStartupGpuResidency(renderer, root, options), value => value === error);
  assert.equal(isPackageTextureDetached(textures[0]), true);
});
