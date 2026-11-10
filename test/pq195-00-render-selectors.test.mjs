// PQ-195.00 render-boundary contract (R1–R3): the authored-payload selectors route the
// SP-07 spindle to its own file/slot/scale and leave the PQ-019 capsule bit-identical.
// Fixed fixtures; no sim run, no headed capture.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authoredPayloadDrawScale,
  authoredPayloadFileForEntity,
  authoredPayloadSlotForEntity,
} from '../src/render/partsLibrary.js';
import { hasExplicitAuthoredPayloadPresentation } from '../src/core/presentationAdmission.js';

// No jsdom in this repo: partsLibrary paints to canvas at import time, so stub document
// the way pq-193-05-census-a-bodies does.
function makeStubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 }, fillRect() {}, strokeRect() {}, clearRect() {},
    fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return { width: 256, height: 256, getContext: () => context, style: {}, addEventListener() {} };
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeStubCanvas() : { style: {}, appendChild() {}, addEventListener() {} }),
};

const SP07 = 'place_breakaway_sp07';
const CAPSULE = 'pod_cargo_container';

const spindle = { type: 'payload', alive: true, radius: 16, data: { authoredPayloadAssetId: SP07 } };
const capsule = { type: 'payload', alive: true, radius: 16, data: { authoredPayloadAssetId: CAPSULE } };
const unknown = { type: 'payload', alive: true, radius: 16, data: { authoredPayloadAssetId: 'nope' } };
const missing = { type: 'payload', alive: true, radius: 16, data: {} };

test('spindle file/slot route to the authored body, capsule keeps the pod', () => {
  assert.equal(authoredPayloadFileForEntity(spindle), 'places/place_breakaway_sp07.glb');
  assert.equal(authoredPayloadSlotForEntity(spindle), 'place');
  assert.equal(authoredPayloadFileForEntity(capsule), 'pods/pod_cargo_container.glb');
  assert.equal(authoredPayloadSlotForEntity(capsule), 'pod');
});

test('unknown or missing asset ids fall back to the capsule, never the spindle', () => {
  assert.equal(authoredPayloadFileForEntity(unknown), 'pods/pod_cargo_container.glb');
  assert.equal(authoredPayloadSlotForEntity(unknown), 'pod');
  assert.equal(authoredPayloadFileForEntity(missing), 'pods/pod_cargo_container.glb');
  assert.equal(authoredPayloadSlotForEntity(missing), 'pod');
});

test('spindle draws at scale 1 (authored 1:1 in WU); capsule keeps the longest-axis fit', () => {
  // Spindle envelope 27.8 with a 16 WU body would fit at 32/27.8 = 1.15x — the rule
  // forbids that: the 15.02 circumradius number only holds at draw time with scale 1.
  assert.equal(authoredPayloadDrawScale(spindle, 16, 27.8), 1);
  assert.equal(authoredPayloadDrawScale(capsule, 16, 27.8), (16 * 2) / 27.8);
  // (3*2)/5 = 1.2 ≠ 1: proves the unknown id takes the capsule fit branch, not the rule.
  assert.equal(authoredPayloadDrawScale(unknown, 3, 5), (3 * 2) / 5);
});

test('payload admission accepts the spindle exactly like the capsule', () => {
  assert.equal(hasExplicitAuthoredPayloadPresentation(spindle), true);
  assert.equal(hasExplicitAuthoredPayloadPresentation(capsule), true);
  assert.equal(hasExplicitAuthoredPayloadPresentation(unknown), false);
  assert.equal(hasExplicitAuthoredPayloadPresentation({ type: 'ship', alive: true, data: {} }), false);
  assert.equal(hasExplicitAuthoredPayloadPresentation({ type: 'payload', alive: false, data: {} }), false);
  assert.equal(hasExplicitAuthoredPayloadPresentation(null), false);
});

// R1 (PLACE_FILES membership for the two new files) is verified by reading plus the
// corridor-assets gate, which resolves both derivations end to end.
