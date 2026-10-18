import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { estimateTextureUploadBytes, prepareStartupGpuResidency } from '../src/render/startupGpuResidency.js';

function serialRenderer(timeline) {
  const gl = { finish() { timeline.push('finish'); }, isContextLost: () => false, getExtension: () => null };
  return {
    getContext: () => gl,
    extensions: { get: () => null },
    initTexture(texture) { timeline.push(`up:${texture.name}`); },
    info: { memory: { geometries: 0, textures: 0 } },
  };
}

function textures(count, size = 4) {
  return Array.from({ length: count }, (_, index) => {
    const texture = new THREE.Texture({ width: size, height: size });
    texture.name = `t${index}`;
    texture.generateMipmaps = false;
    return texture;
  });
}

async function run(list, options = {}) {
  const timeline = [];
  const renderer = serialRenderer(timeline);
  const result = await prepareStartupGpuResidency(renderer, [], {
    textures: list,
    includeGeometry: false,
    yieldToMain: async () => { timeline.push('yield'); },
    paceQueue: async () => { timeline.push('pace'); },
    ...options,
  });
  return { timeline, result };
}

const uploadsPerPace = (timeline) => {
  const out = [];
  let n = 0;
  for (const step of timeline) {
    if (step.startsWith('up:')) n += 1;
    if (step === 'pace') { out.push(n); n = 0; }
  }
  return out;
};

test('texture residency keeps one serial unit and one yield per texture by default', async () => {
  const { timeline, result } = await run(textures(5));
  assert.equal(result.uploads.length, 5);
  assert.deepEqual(uploadsPerPace(timeline), [1, 1, 1, 1, 1]);
  assert.equal(timeline.filter((step) => step === 'yield').length >= 5, true);
});

test('textureBatchCount shares one yield and one serial unit per batch', async () => {
  const { timeline, result } = await run(textures(5), { textureBatchCount: 2 });
  assert.equal(result.uploads.length, 5);
  assert.deepEqual(uploadsPerPace(timeline), [2, 2, 1]);
  // One yield opens each batch: no yield between two uploads of the same batch.
  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i].startsWith('up:') && timeline[i - 1] === 'yield') {
      assert.notEqual(timeline[i + 1], 'yield');
    }
  }
  assert.deepEqual(timeline.filter((step) => step.startsWith('up:')), ['up:t0', 'up:t1', 'up:t2', 'up:t3', 'up:t4']);
});

test('textureBatchBytes closes a batch before the count cap', async () => {
  // 4x4 RGBA = 64 bytes each; a 100-byte cap closes every second texture.
  const { timeline } = await run(textures(5), { textureBatchCount: 16, textureBatchBytes: 100 });
  assert.deepEqual(uploadsPerPace(timeline), [2, 2, 1]);
});

test('a resident texture inside a batch is skipped and the open batch still flushes', async () => {
  const list = textures(4);
  const timeline0 = [];
  const renderer = serialRenderer(timeline0);
  await prepareStartupGpuResidency(renderer, [], {
    textures: [list[3]], includeGeometry: false, yieldToMain: async () => {}, paceQueue: async () => {},
  });
  const timeline = [];
  renderer.initTexture = (texture) => { timeline.push(`up:${texture.name}`); };
  const result = await prepareStartupGpuResidency(renderer, [], {
    textures: list,
    includeGeometry: false,
    textureBatchCount: 8,
    yieldToMain: async () => { timeline.push('yield'); },
    paceQueue: async () => { timeline.push('pace'); },
  });
  assert.equal(result.uploads.length, 3);
  assert.equal(result.residentTextures, 1);
  assert.deepEqual(uploadsPerPace(timeline), [3]);
});

test('estimateTextureUploadBytes counts mips, typed payloads and plain images', () => {
  const plain = new THREE.Texture({ width: 8, height: 4 });
  plain.generateMipmaps = false;
  assert.equal(estimateTextureUploadBytes(plain), 128);
  plain.generateMipmaps = true;
  assert.equal(estimateTextureUploadBytes(plain), Math.ceil(128 * 4 / 3));
  const data = new THREE.DataTexture(new Uint8Array(40), 5, 2);
  assert.equal(estimateTextureUploadBytes(data), 40);
  const mipped = new THREE.Texture();
  mipped.mipmaps = [{ data: new Uint8Array(64), width: 4, height: 4 }, { data: new Uint8Array(16), width: 2, height: 2 }];
  assert.equal(estimateTextureUploadBytes(mipped), 80);
  assert.equal(estimateTextureUploadBytes(null), 0);
});

test('only the serial-link route behind the loading shell batches texture uploads', () => {
  const renderer = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /const residencyTextureBatch = \(\) => \(serialLinkRoute && state\.mode === 'loading'\s*\? \{ textureBatchCount: 16, textureBatchBytes: 8 \* 1024 \* 1024 \} : null\);/);
  assert.match(renderer, /firstFrameResidency = await prepareStartupGpuResidency\(renderer, scene, \{\s*geometryBatchDrawables: residencyBatchDrawables\(\),\s*\.\.\.residencyTextureBatch\(\),/);
  assert.match(renderer, /const bufferTextureBatch = bufferBatchDrawables \? \{ textureBatchCount: 16, textureBatchBytes: 8 \* 1024 \* 1024 \} : null;/);
  assert.equal((renderer.match(/geometryBatchDrawables: bufferBatchDrawables,\s*\.\.\.bufferTextureBatch,/g) || []).length, 2);
  const bufferGate = renderer.indexOf('const bufferBatchDrawables = state.mode === \'loading\'');
  assert.ok(bufferGate > 0);
  assert.match(renderer.slice(bufferGate, bufferGate + 200), /!shouldAwaitOpeningGpuCook\(/);
});
