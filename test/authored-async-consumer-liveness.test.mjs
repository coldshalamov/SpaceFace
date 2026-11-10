import assert from 'node:assert/strict';
import test from 'node:test';

import {
  disposeAuthoredAssetRuntime,
  getAuthoredAssetDiagnostic,
  loadAuthoredPart,
} from '../src/render/assetLoader.js';

const ASSET_URL = 'https://spaceface.test/assets/ships/source/test-live-creator.glb';

test('canceled in-flight joiners do not cancel a live creator parse', async () => {
  const originalFetch = globalThis.fetch;
  const originalProgressEvent = globalThis.ProgressEvent;
  const renderer = {
    capabilities: { isWebGL2: false },
    extensions: { has: () => false },
  };
  const controllerA = new AbortController();
  const controllerB = new AbortController();
  const buffer = minimalLegacyHullGlb();
  let requestStarted;
  let releaseResponse;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const responseReady = new Promise((resolve) => { releaseResponse = resolve; });
  const fetchedRequests = [];
  let startTimer = null;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || input?.href || String(input));
    const cache = init.cache || input?.cache || 'default';
    fetchedRequests.push({ url, cache });
    if (url !== ASSET_URL) return new Response(null, { status: 404 });
    if (cache !== 'force-cache') {
      requestStarted();
      await responseReady;
    }
    return new Response(buffer, { headers: { 'Content-Type': 'model/gltf-binary' } });
  };
  globalThis.ProgressEvent ||= class ProgressEvent {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
  };

  try {
    const creator = loadAuthoredPart(ASSET_URL, {
      renderer,
      slot: 'hull',
      optional: true,
    });
    await Promise.race([
      started,
      new Promise((_, reject) => {
        startTimer = setTimeout(() => reject(new Error(`timed out waiting for GLB request ${ASSET_URL}`)), 10000);
      }),
    ]);
    clearTimeout(startTimer);
    startTimer = null;

    const joinerA = loadAuthoredPart(ASSET_URL, {
      renderer,
      slot: 'hull',
      optional: true,
      signal: controllerA.signal,
    });
    const joinerB = loadAuthoredPart(ASSET_URL, {
      renderer,
      slot: 'hull',
      optional: true,
      signal: controllerB.signal,
    });
    // Let each caller pass the resolved runtime await and register on the queued task.
    await new Promise((resolve) => setImmediate(resolve));

    controllerA.abort();
    controllerB.abort();
    assert.equal(await joinerA, null);
    assert.equal(await joinerB, null);

    releaseResponse();
    const record = await creator;
    assert.ok(record, `the still-live creator should receive the parsed blueprint (${await getAuthoredAssetDiagnostic(renderer, ASSET_URL, 'hull') || 'no loader diagnostic'})`);
    const glbRequests = fetchedRequests.filter((request) => request.url === ASSET_URL);
    assert.equal(glbRequests.filter((request) => request.cache !== 'force-cache').length, 1,
      `only the admitted loader request should transfer the GLB (${JSON.stringify(glbRequests)})`);
    assert.equal(glbRequests.filter((request) => request.cache === 'force-cache').length, 1,
      'the source-detach digest may reread the GLB through the force-cache path');
  } finally {
    releaseResponse();
    if (startTimer !== null) clearTimeout(startTimer);
    await disposeAuthoredAssetRuntime(renderer);
    globalThis.fetch = originalFetch;
    if (originalProgressEvent === undefined) delete globalThis.ProgressEvent;
    else globalThis.ProgressEvent = originalProgressEvent;
  }
});

function minimalLegacyHullGlb() {
  const metadata = {
    assetId: 'test_live_creator_hull',
    category: 'hulls',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    textureCompression: 'PNG-source',
  };
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0], extras: { spacefaceAsset: metadata } }],
    nodes: [{ name: 'HullBody', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 } }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 24 },
    ],
    buffers: [{ byteLength: 96 }],
  };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const binaryLength = 96;
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, jsonLength).fill(0x20);
  new Uint8Array(buffer, 20, json.length).set(json);
  view.setUint32(20 + jsonLength, binaryLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  const binary = new Float32Array(buffer, 28 + jsonLength, 24);
  binary.set([
    -1, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, 1, 0, 0, 1,
  ]);
  return buffer;
}
