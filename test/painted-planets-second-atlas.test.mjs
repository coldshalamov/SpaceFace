import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';

import {
  PAINTED_PLANET_URL,
  PAINTED_PLANET_URL_2,
  PAINTED_RING_URL,
  PAINTED_RING_URL_2,
  PaintedPlanets,
} from '../src/render/paintedPlanets.js';

function makeLibrary() {
  const loads = [];
  const library = new PaintedPlanets({
    load(url, onLoad, _progress, onError) {
      const texture = new THREE.Texture();
      loads.push({ url, onLoad, onError, texture });
      return texture;
    },
  });
  return { library, loads };
}

test('the second atlas and ring ship beside the first', () => {
  for (const url of [PAINTED_PLANET_URL, PAINTED_PLANET_URL_2, PAINTED_RING_URL, PAINTED_RING_URL_2]) {
    assert.equal(existsSync(fileURLToPath(new URL(`..${url}`, import.meta.url))), true, `${url} is missing`);
  }
});

test('the first pair still loads first, so the original sky never waits on the second atlas', () => {
  const { loads } = makeLibrary();
  assert.deepEqual(loads.map((load) => load.url), [PAINTED_PLANET_URL, PAINTED_RING_URL, PAINTED_PLANET_URL_2, PAINTED_RING_URL_2]);
});

test('four more painted looks share the second image, laid out like the first atlas', () => {
  const { library, loads } = makeLibrary();
  const second = loads[2].texture;
  assert.equal(library.extraViews.length, 4);
  library.extraViews.forEach((view, i) => {
    assert.equal(view.source, second.source, 'extra views share the second atlas storage');
    assert.deepEqual(view.repeat.toArray(), [0.5, 0.5]);
    assert.deepEqual(view.offset.toArray(), [(i % 2) * 0.5, i < 2 ? 0.5 : 0]);
    assert.equal(view.userData.paintedPlanet, true);
  });
  const version = library.extraViews[0].version;
  loads[2].onLoad();
  assert.ok(library.extraViews[0].version > version, 'a decoded second atlas uploads its views');
  assert.equal(library.ready, false, '`ready` still means the first pair only');
});

test('each planet type reaches both atlases and every one of the eight looks across seeds', () => {
  const { library } = makeLibrary();
  const looks = new Set();
  const byType = { gas: new Set(), ice: new Set(), rocky: new Set() };
  for (let seed = 0; seed < 64; seed += 1) {
    for (const type of Object.keys(byType)) {
      const view = library.get({ type, seed });
      assert.ok(view, `${type} seed ${seed} must resolve`);
      byType[type].add(view);
      looks.add(view);
    }
  }
  assert.equal(byType.gas.size, 2, 'gas giants: the original and the cyan ice giant');
  assert.equal(byType.ice.size, 2, 'ice worlds: the original and the frozen rift world');
  assert.equal(byType.rocky.size, 4, 'rocky worlds: both originals plus the ember and dune worlds');
  assert.equal(looks.size, 8);
  // Selection is deterministic: a sector keeps its planets.
  assert.equal(library.get({ type: 'rocky', seed: 12345 }), library.get({ type: 'rocky', seed: 12345 }));
  // The original mapping is preserved for the seeds that already existed.
  assert.equal(library.get({ type: 'gas', seed: 1 }), library.views[1]);
});

test('the two ringed giants are chosen by seed', () => {
  const { library } = makeLibrary();
  assert.equal(library.get({ type: 'gas', ring: true, seed: 0 }), library.ringTexture);
  assert.equal(library.get({ type: 'gas', ring: true, seed: 2 }), library.ringTexture2);
  assert.ok(library.ringTexture2.userData.paintedPlanetDiameter > 0.4 && library.ringTexture2.userData.paintedPlanetDiameter < 0.55);
});

test('a failed second atlas uses the same reported fallback, so no planet is ever left blank', () => {
  const { library, loads } = makeLibrary();
  const error = console.error;
  console.error = () => {};
  try { loads[2].onError(new Error('404')); } finally { console.error = error; }
  assert.equal(library.failed, true);
  assert.equal(library.get({ type: 'rocky', seed: 4 }), null);
});

test('dispose frees the second atlas and ring and ignores late callbacks', () => {
  const { library, loads } = makeLibrary();
  library.dispose();
  loads[2].onLoad();
  loads[3].onError?.(new Error('late'));
  assert.equal(library.get({ type: 'gas', seed: 3 }), null);
});
