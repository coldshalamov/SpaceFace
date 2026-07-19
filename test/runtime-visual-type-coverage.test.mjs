import assert from 'node:assert/strict';
import test from 'node:test';

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

function inspect(root) {
  const meshNames = [];
  const geometryTypes = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshNames.push(object.name);
    geometryTypes.push(object.geometry?.type || null);
  });
  return { meshNames, geometryTypes };
}

test.afterEach(() => invalidateVisualFactoryCaches());

test('live mine entities receive an armored proximity-mine visual', () => {
  const root = createVisualFactory().build({
    id: 41,
    type: 'mine',
    radius: 6,
    data: { kind: 'mine', armed: true },
  });
  const receipt = inspect(root);
  assert.equal(root.visible, true);
  assert.equal(root.userData.interactionKind, 'combat-mine');
  assert.equal(root.userData.visualLanguage, 'armored-proximity-mine');
  assert.ok(receipt.meshNames.includes('MinePressureHull'));
  assert.ok(receipt.meshNames.includes('MineArmingLens'));
  assert.ok(receipt.meshNames.some((name) => name.startsWith('MineProximityAntenna_')));
  assert.ok(receipt.geometryTypes.length >= 7, 'mine needs body, ring, lens, and directional vanes');
});

test('mine arming state changes only its own warning material', () => {
  const factory = createVisualFactory();
  const mineA = factory.build({ id: 43, type: 'mine', radius: 6, data: { armed: false } });
  const mineB = factory.build({ id: 44, type: 'mine', radius: 6, data: { armed: false } });
  const lensA = mineA.getObjectByName('MineArmingLens');
  const lensB = mineB.getObjectByName('MineArmingLens');
  const safeMaterial = lensA.material;

  mineA.userData.updateRuntimeState({ data: { armed: true } });

  assert.equal(mineA.userData.visualArmed, true);
  assert.equal(mineB.userData.visualArmed, false);
  assert.notEqual(lensA.material, safeMaterial);
  assert.equal(lensB.material, safeMaterial, 'shared safe material must not be mutated by another mine');
  assert.equal(lensA.material.name, 'MineWarningLensArmed');
  assert.equal(lensB.material.name, 'MineWarningLensSafe');
});

test('live impulse-charge entities receive a sticky engineered charge visual', () => {
  const root = createVisualFactory().build({
    id: 42,
    type: 'charge',
    radius: 1.2,
    data: { kind: 'impulse_charge', armed: true },
  });
  const receipt = inspect(root);
  assert.equal(root.visible, true);
  assert.equal(root.userData.interactionKind, 'impulse-charge');
  assert.equal(root.userData.visualLanguage, 'sticky-impulse-charge');
  assert.ok(receipt.meshNames.includes('ImpulseChargePressureBody'));
  assert.ok(receipt.meshNames.includes('ImpulseChargeArmingStrip'));
  assert.equal(receipt.meshNames.filter((name) => name === 'ImpulseChargeAdhesionPad').length, 2);
  assert.ok(receipt.geometryTypes.length >= 6, 'charge needs a body, collars, arming strip, and adhesion pads');
});

test('charge arming state swaps immutable status materials without cross-entity leakage', () => {
  const factory = createVisualFactory();
  const chargeA = factory.build({ id: 45, type: 'charge', radius: 1.2, data: { armed: false } });
  const chargeB = factory.build({ id: 46, type: 'charge', radius: 1.2, data: { armed: false } });
  const stripA = chargeA.getObjectByName('ImpulseChargeArmingStrip');
  const stripB = chargeB.getObjectByName('ImpulseChargeArmingStrip');
  const safeMaterial = stripA.material;

  chargeA.userData.updateRuntimeState({ data: { armed: true } });

  assert.equal(chargeA.userData.visualArmed, true);
  assert.equal(chargeB.userData.visualArmed, false);
  assert.notEqual(stripA.material, safeMaterial);
  assert.equal(stripB.material, safeMaterial, 'shared safe material must not be mutated by another charge');
  assert.equal(stripA.material.name, 'ImpulseChargeStatusArmed');
  assert.equal(stripB.material.name, 'ImpulseChargeStatusSafe');
});

test('unknown runtime types still fail hidden instead of becoming generic boxes', () => {
  const root = createVisualFactory().build({ type: 'not-a-runtime-type', radius: 6, data: {} });
  assert.equal(root.visible, false);
  assert.equal(root.userData.visualBuildFailed, true);
  assert.equal(inspect(root).geometryTypes.length, 0);
});

test('displaced smooth asteroid variants publish final-surface normal policy', () => {
  const icy = createVisualFactory().build({
    id: 43,
    type: 'asteroid',
    radius: 12,
    data: { typeId: 'ast_icy' },
  });
  let body = null;
  icy.traverse((object) => { if (!body && object.isMesh) body = object; });
  assert.ok(body?.geometry?.userData?.spacefaceGeology);
  assert.equal(body.geometry.userData.spacefaceGeology.typeId, 'ast_icy');
  assert.match(body.geometry.userData.spacefaceGeology.normalPolicy, /displaced-surface crease/);
  const positions = body.geometry.getAttribute('position');
  const normals = body.geometry.getAttribute('normal');
  assert.equal(normals.count, positions.count);
  let maxRadialDeviation = 0;
  for (let i = 0; i < positions.count; i++) {
    const length = Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)) || 1;
    const dot = (
      positions.getX(i) / length * normals.getX(i)
      + positions.getY(i) / length * normals.getY(i)
      + positions.getZ(i) / length * normals.getZ(i)
    );
    maxRadialDeviation = Math.max(maxRadialDeviation, 1 - dot);
  }
  assert.ok(maxRadialDeviation > 0.001,
    `normals must follow the displaced surface rather than the source sphere: ${maxRadialDeviation}`);
});
