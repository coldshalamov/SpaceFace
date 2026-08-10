// PQ-047 encounter warning and physical freight-pickup presentation contract.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ENCOUNTERS, ENCOUNTER_BARKS, barkText } from '../src/data/encounters.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';

function stubCanvas() {
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => stubCanvas() };

function meshes(root) {
  const result = [];
  root.traverse((object) => {
    if (object.isMesh) result.push(object);
  });
  return result;
}

test.after(() => invalidateVisualFactoryCaches());

test('Curtain warning resolves through an authored bark key before predation can fire', () => {
  const curtain = ENCOUNTERS.curtain_convoy;

  assert.equal(curtain.bark, 'curtain_convoy_alert');
  assert.equal(Object.hasOwn(ENCOUNTER_BARKS, curtain.bark), true);
  assert.equal(barkText(curtain.bark, null, 'pq047:presentation'), curtain.primaryLine);
  assert.ok(curtain.predation.responseWindowS >= 4,
    'the no-fire interval must leave the four-second HUD warning readable');
  assert.ok(curtain.predation.responseWindowS <= 6,
    'the warning interval stays bounded so the encounter keeps moving');
});

test('freight-custody pickups use the sealed canister presentation while remaining pickups', () => {
  const root = createVisualFactory().build({
    id: 'pq047:freight-pod',
    type: 'pickup',
    radius: 2.2,
    data: {
      kind: 'cargo',
      commodityId: 'cmdty_refined_metals',
      freightCustodyPod: { custodyId: 'pq047:custody', podIdentity: 'pod:1' },
    },
  });
  const freightMeshes = meshes(root);

  assert.equal(root.userData.kind, 'pickup');
  assert.equal(root.userData.interactionKind, 'pickup');
  assert.equal(root.userData.visualLanguage, 'sealed-cargo-canister');
  assert.equal(root.userData.gem, undefined);
  assert.equal(freightMeshes[0]?.geometry?.type, 'CylinderGeometry',
    'the primary freight form must be the payload canister body');
  assert.ok(freightMeshes.some((mesh) => mesh.geometry?.type === 'TorusGeometry'),
    'the sealed payload collars must remain part of the freight read');
});

test('ordinary pickups retain the glowing octahedral gem presentation', () => {
  const root = createVisualFactory().build({
    id: 'ordinary:cargo-pickup',
    type: 'pickup',
    radius: 2.2,
    data: { kind: 'cargo', commodityId: 'cmdty_refined_metals' },
  });
  const ordinaryMeshes = meshes(root);

  assert.equal(root.userData.kind, 'pickup');
  assert.equal(root.userData.visualLanguage, undefined);
  assert.equal(root.userData.gem?.geometry?.type, 'OctahedronGeometry');
  assert.deepEqual(ordinaryMeshes.map((mesh) => mesh.geometry?.type), ['OctahedronGeometry']);
});
