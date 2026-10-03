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
  data: { planetSite: { siteId: `site_${planetType}`, planetType, seed: 7, radius: 640, centerY: -420, bands: { reentry: 700, danger: 760, skim: 820 } } },
});

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

test('before the tiles decode, a planet draws plain and swaps the tile in without a new program', async () => {
  const isolated = await import('../src/render/planetDetailLibrary.js?detail-swap-contract');
  assert.equal(isolated.getReadyPlanetDetail(), null);
  const group = withCanvas(() => buildPlanetSiteVisual(site('rocky')));
  const mat = group.userData.planetVisual.bodyMat;
  assert.equal(mat.uniforms.uDetailAmt.value, 0, 'no detail until the tile exists');
  assert.equal(mat.uniforms.uDetail.value.isDataTexture, true, 'a neutral 1x1 stands in, so the program is final from the first draw');
  assert.equal(mat.fragmentShader.includes('uDetail'), true);
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

test('decoded tiles are linear, repeating, mipmapped, anisotropic and warmed once each', async () => {
  const initialized = [];
  const tiles = await preloadPlanetDetailLibrary({ initTexture: (t) => initialized.push(t) }, { loadTexture: async () => new THREE.Texture() });
  assert.equal(getReadyPlanetDetail(), tiles);
  assert.equal(initialized.length, Object.keys(PLANET_DETAIL_ASSETS).length);
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

test('a planet built after the library publishes gets its tile at once', () => {
  const group = withCanvas(() => buildPlanetSiteVisual(site('ice')));
  const mat = group.userData.planetVisual.bodyMat;
  assert.equal(mat.uniforms.uDetail.value, planetDetailFor('ice'));
  assert.ok(mat.uniforms.uDetailAmt.value > 0);
  assert.ok(mat.uniforms.uDetailScale.value >= 1);
});
