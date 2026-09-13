import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fallbackMaterials,
  runFlightRootTemplateCacheProbe,
} from '../src/render/partsLibrary.js';
import * as kit from '../src/render/ships/shipKit.js';

// Count the canvases the procedural texture painters create. kit.pbrHullMaterial paints its
// albedo, normal and roughness maps on 1024px canvases, so a 1024px canvas is the fingerprint of a
// procedural hull being generated.
const canvases = [];
const context = {
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
  bezierCurveTo() {}, quadraticCurveTo() {},
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  measureText() { return { width: 10 }; },
};
globalThis.document = {
  createElement: (tag) => {
    const element = { width: 256, height: 256, style: {}, getContext: () => context, addEventListener() {} };
    if (tag === 'canvas') canvases.push(element);
    return element;
  },
};
const hullSizedCanvases = () => canvases.filter((canvas) => canvas.width === 1024).length;

test('fallback materials are built on first use, once, as the same memoized kit materials', () => {
  const palette = { hull: '#51606f', accent: '#6fd8ff', dark: '#10161b' };
  const seed = 0x2a51f;
  const { materials, built } = fallbackMaterials(palette, seed);
  assert.equal(built.size, 0, 'asking for the fallback set builds nothing');
  assert.equal(hullSizedCanvases(), 0);

  const hull = materials.hull;
  assert.equal(hullSizedCanvases(), 3, 'the hull paints its albedo, normal and roughness maps on first use');
  assert.equal(materials.hull, hull, 'a second read reuses the built hull');
  assert.equal(hull, kit.pbrHullMaterial({
    hull: palette.hull, accent: palette.accent, seed: seed & 0xffff,
    panelCount: 10, metalness: 0.18, roughness: 0.58,
  }), 'a procedural piece gets the exact kit hull material the eager set used to hold');
  assert.equal(hullSizedCanvases(), 3, 'nothing repaints');

  const { dark, accent, glass } = materials;
  assert.ok(dark.isMeshStandardMaterial && accent.isMeshStandardMaterial);
  assert.ok(glass.isMeshPhysicalMaterial);
  assert.equal(glass.transmission, 0.6);
  assert.equal(glass.ior, 1.4);
  assert.equal(glass.depthWrite, false);
  assert.equal(materials.glass, glass);
  assert.deepEqual(new Set(built), new Set([hull, dark, accent, glass]),
    'the disposal set holds exactly what was built');
});

test('an authored whole-ship composition paints no procedural hull textures', () => {
  const before = hullSizedCanvases();
  assert.deepEqual(runFlightRootTemplateCacheProbe(), {
    distinctRoots: true,
    sharedGeometry: true,
    distinctMaterials: true,
    reboundHooks: true,
    geometryDisposedOnce: true,
  }, 'the composition itself must still build, instance and dispose correctly');
  assert.equal(hullSizedCanvases() - before, 0,
    'three authored compositions must not generate the 1024px fallback hull maps they never draw');
});
