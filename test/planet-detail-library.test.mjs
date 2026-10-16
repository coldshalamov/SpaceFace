import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';

import {
  PLANET_DETAIL_ASSETS,
  PLANET_DETAIL_BY_TYPE,
  getReadyPlanetDetail,
  planetDetailFor,
  planetDetailParams,
  preloadPlanetDetailLibrary,
  whenPlanetDetailReady,
} from '../src/render/planetDetailLibrary.js';
import { PLANET_COLORS } from '../src/render/planetFactory.js';
import { buildPlanetSiteVisual } from '../src/render/planetSiteVisual.js';
import { prepareStartupGpuResidency } from '../src/render/startupGpuResidency.js';
import { createGpuResidencyAdmissionTracker } from '../src/render/pipelineReadiness.js';
import { createVisualFactory } from '../src/render/visualFactory.js';

const withCanvas = (fn) => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
    }),
  };
  try { return fn(); } finally { globalThis.document = previous; }
};

const site = (planetType) => ({
  id: 91, type: 'planet',
  data: { planetSite: { siteId: `site_${planetType}`, planetType, seed: 7, radius: 640, centerY: -420, bands: { reentry: 700, danger: 760, skim: 820 } } },
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function detailAdmissionFixture(uploadGate = null) {
  const initialized = [];
  const requests = [];
  const started = deferred();
  let generation = 0;
  const renderer = { initTexture: texture => initialized.push(texture) };
  const residency = createGpuResidencyAdmissionTracker((texture, options) => (
    prepareStartupGpuResidency(renderer, texture, {
      includeGeometry: false,
      yieldToMain: async () => { if (uploadGate) await uploadGate.promise; },
      paceQueue: async () => {},
      beforeSubmit: () => {
        if (!options.isActive()) throw new Error('detail owner inactive before upload');
      },
    })
  ));
  const admission = {
    generation: () => generation,
    prepare(texture, options) {
      requests.push(texture);
      started.resolve();
      return residency.prepare(texture, options);
    },
  };
  return { admission, initialized, requests, started, restoreContext: () => { generation++; } };
}

test('every tile ships and every planet type has one', () => {
  for (const [name, url] of Object.entries(PLANET_DETAIL_ASSETS)) {
    assert.match(url, /^\/assets\/ships\/release\//);
    assert.equal(existsSync(fileURLToPath(new URL(`..${url}`, import.meta.url))), true, `${name} is missing`);
  }
  for (const type of Object.keys(PLANET_COLORS)) {
    assert.ok(PLANET_DETAIL_BY_TYPE[type], `${type} needs a detail tile`);
    assert.ok(PLANET_DETAIL_ASSETS[PLANET_DETAIL_BY_TYPE[type]], `${type} maps to a tile that exists`);
  }
  const manifest = JSON.parse(readFileSync(new URL('../assets/ships/release/surfaces/planet-detail/manifest.json', import.meta.url), 'utf8'));
  for (const name of Object.keys(PLANET_DETAIL_ASSETS)) assert.ok(manifest.files[`${name}.jpg`], `${name}.jpg needs provenance`);
});

test('late detail decodes retain the neutral surface until the requested tile is resident', async () => {
  assert.equal(getReadyPlanetDetail(), null);
  const decode = deferred();
  const upload = deferred();
  const eagerUploads = [];
  const library = preloadPlanetDetailLibrary({ initTexture: t => eagerUploads.push(t) }, {
    loadTexture: async () => { await decode.promise; return new THREE.Texture(); },
  });
  const f = detailAdmissionFixture(upload);
  const group = withCanvas(() => buildPlanetSiteVisual(site('rocky'), { detailAdmission: f.admission }));
  const { bodyMat: mat, detail } = group.userData.planetVisual;
  assert.equal(mat.uniforms.uDetailAmt.value, 0, 'no detail until the tile exists');
  assert.equal(mat.uniforms.uDetail.value.isDataTexture, true, 'a neutral 1x1 stands in, so the program is final from the first draw');
  const shader = mat.fragmentShader;
  decode.resolve();
  await library;
  await f.started.promise;
  assert.equal(eagerUploads.length, 0, 'decoding all six tiles uploads none of the catalog');
  assert.equal(f.initialized.length, 0, 'requested upload is still waiting for its paced owner');
  assert.equal(mat.uniforms.uDetailAmt.value, 0);
  upload.resolve();
  await detail.ready;
  assert.equal(detail.status, 'ready');
  assert.deepEqual(f.initialized, [planetDetailFor('rocky')]);
  assert.equal(mat.uniforms.uDetail.value, f.initialized[0]);
  assert.equal(mat.fragmentShader, shader, 'publication changes the texture, not the authored program');
});

test('a failed decode publishes nothing and resolves null', async () => {
  const isolated = await import('../src/render/planetDetailLibrary.js?detail-failure-contract');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await isolated.preloadPlanetDetailLibrary(null, { loadTexture: async () => { throw new Error('decode failed'); } }), null);
    assert.equal(isolated.getReadyPlanetDetail(), null);
  } finally { console.warn = warn; }
});

test('decoded tiles retain authored settings without eagerly uploading unrequested tiles', async () => {
  const initialized = [];
  const tiles = await preloadPlanetDetailLibrary({ initTexture: (t) => initialized.push(t) }, { loadTexture: async () => new THREE.Texture() });
  assert.equal(getReadyPlanetDetail(), tiles);
  assert.equal(initialized.length, 0);
  for (const texture of Object.values(tiles)) {
    assert.equal(texture.colorSpace, THREE.NoColorSpace, 'a relief multiplier is data: 0.5 grey must be exactly x1.0');
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.generateMipmaps, true);
    assert.equal(texture.anisotropy, 8, 'the limb sweeps past at a grazing angle');
  }
  assert.equal(planetDetailFor('lava'), tiles.lava);
  assert.equal(planetDetailFor('gas_giant'), tiles.cloud);
  assert.equal(await whenPlanetDetailReady(), tiles);
  const params = planetDetailParams('arid', 640);
  assert.ok(Number.isInteger(params.scale) && params.scale >= 1, 'an integer repeat keeps the wrap seam invisible');
  assert.ok(params.amount > 0 && params.amount <= 1);
});

test('initial detail publication uses existing residency and dedupes only the shared requested tile', async () => {
  const f = detailAdmissionFixture();
  const factory = createVisualFactory({ planetDetailAdmission: f.admission });
  const group = withCanvas(() => factory.build(site('ice')));
  const { bodyMat: mat, detail } = group.userData.planetVisual;
  assert.equal(mat.uniforms.uDetailAmt.value, 0, 'decoded readiness alone cannot publish the tile');
  await detail.ready;
  assert.equal(mat.uniforms.uDetail.value, planetDetailFor('ice'));
  assert.ok(mat.uniforms.uDetailAmt.value > 0);
  assert.ok(mat.uniforms.uDetailScale.value >= 1);
  const second = withCanvas(() => factory.build({ ...site('ice'), id: 92 }));
  await second.userData.planetVisual.detail.ready;
  assert.deepEqual(f.initialized, [planetDetailFor('ice')], 'the existing residency stamp avoids a duplicate upload');
});

test('disposal cancels a pending detail upload and cannot mutate the retired material', async () => {
  const upload = deferred();
  const f = detailAdmissionFixture(upload);
  const group = withCanvas(() => buildPlanetSiteVisual(site('lava'), { detailAdmission: f.admission }));
  const { bodyMat: mat, detail } = group.userData.planetVisual;
  await f.started.promise;
  const neutral = mat.uniforms.uDetail.value;
  mat.dispose();
  upload.resolve();
  await detail.ready;
  assert.equal(detail.status, 'cancelled');
  assert.equal(f.initialized.length, 0);
  assert.equal(mat.uniforms.uDetail.value, neutral);
});

test('stale context admission cannot publish and an unbound planet retries after restoration', async () => {
  const upload = deferred();
  const f = detailAdmissionFixture(upload);
  const group = withCanvas(() => buildPlanetSiteVisual(site('arid'), { detailAdmission: f.admission }));
  const { bodyMat: mat, detail } = group.userData.planetVisual;
  await f.started.promise;
  const old = detail.ready;
  f.restoreContext();
  mat.onBeforeRender();
  const current = detail.ready;
  assert.notEqual(current, old);
  upload.resolve();
  await old;
  await current;
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.initialized, [planetDetailFor('arid')], 'only the current context owner uploads');
  assert.equal(detail.status, 'ready');
  assert.equal(mat.uniforms.uDetail.value, planetDetailFor('arid'));
});

test('retiring one planet cannot cancel a concurrent successor sharing its tile', async () => {
  const upload = deferred();
  const f = detailAdmissionFixture(upload);
  const first = withCanvas(() => buildPlanetSiteVisual(site('ice'), { detailAdmission: f.admission }));
  const second = withCanvas(() => buildPlanetSiteVisual(site('ice'), { detailAdmission: f.admission }));
  const old = first.userData.planetVisual;
  const current = second.userData.planetVisual;
  const neutral = old.bodyMat.uniforms.uDetail.value;
  await f.started.promise;
  old.bodyMat.dispose();
  upload.resolve();
  await Promise.all([old.detail.ready, current.detail.ready]);
  assert.equal(old.detail.status, 'cancelled');
  assert.equal(old.bodyMat.uniforms.uDetail.value, neutral);
  assert.equal(current.detail.status, 'ready');
  assert.equal(current.bodyMat.uniforms.uDetail.value, planetDetailFor('ice'));
  assert.deepEqual(f.initialized, [planetDetailFor('ice')]);
});

test('failed or incomplete residency preserves the prior detail and reports the refusal', async () => {
  for (const prepare of [
    async () => { throw new Error('upload failed'); },
    ...[{ skipped: true }, { partial: true }, { cancelled: true }].map(result => async () => result),
  ]) {
    const group = withCanvas(() => buildPlanetSiteVisual(site('rocky'), {
      detailAdmission: { generation: () => 0, prepare },
    }));
    const { bodyMat: mat, detail } = group.userData.planetVisual;
    const prior = mat.uniforms.uDetail.value;
    await detail.ready;
    assert.equal(detail.status, 'error');
    assert.ok(detail.error);
    assert.equal(mat.uniforms.uDetail.value, prior);
    assert.equal(mat.uniforms.uDetailAmt.value, 0);
  }
});
