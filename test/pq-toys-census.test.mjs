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
    quadraticCurveTo() {}, bezierCurveTo() {}, arcTo() {}, ellipse() {}, fillText() {},
    measureText() { return { width: 0 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => stubCanvas() };

test.afterEach(() => invalidateVisualFactoryCaches());

test('physical mine reads as machined ordnance, not a primitive token', () => {
  const root = createVisualFactory().build({
    id: 71, type: 'mine', radius: 6, data: { kind: 'mine', armed: false },
  });
  const hull = root.getObjectByName('MinePressureHull');
  assert.equal(hull.geometry.type, 'LatheGeometry',
    'pressure hull must be a turned canister, not a flat-sided prism');
  assert.ok(hull.material.map,
    'casing must wear the generated hull-panel surface, not a flat color');
  assert.ok(root.getObjectByName('MineSensorTrack'), 'sensor crown needs a bearing rail');
  assert.ok(root.getObjectByName('MineLensBezel'), 'warning beacon must be recessed in a bezel');
  assert.equal(root.getObjectByName('MineArmingLens').geometry.type, 'SphereGeometry',
    'warning beacon is a dome, not a wafer');
  assert.ok(root.children.filter((c) => c.name.startsWith('MineAnchorSpike_')).length >= 3,
    'emplaced ordnance needs anchor spikes');
  assert.ok(root.children.filter((c) => c.name.startsWith('MineRingStud_')).length >= 6,
    'girth band must read as a bolted joint');
  assert.ok(root.children.filter((c) => c.name.startsWith('MineWhipAerial_')).length >= 2,
    'proximity field needs whip aerials');
});

test('vector mine reads as a caged field generator, not a glowing shuriken', () => {
  const root = createVisualFactory().build({
    id: 72, type: 'vectormine', radius: 1.6, data: { armed: false },
  });
  assert.ok(root.getObjectByName('VectorMineGimbalA') && root.getObjectByName('VectorMineGimbalB'),
    'charge core must sit inside a machined gimbal cradle');
  assert.ok(root.getObjectByName('VectorMineKeel'), 'body needs a deployed keel');
  assert.ok(root.getObjectByName('VectorMinePipMast'), 'arming pip rides a mast, not floating');
  const fin = root.getObjectByName('VectorMineEmitter_1');
  assert.ok(Array.isArray(fin.material),
    'emitter arm must keep a machined blade with only the nozzle on the emitter material');
});

test('vector mine arming lights the nozzle tips and pip, not the whole arm', () => {
  const vm = createVisualFactory().build({
    id: 73, type: 'vectormine', radius: 1.6, data: { armed: false },
  });
  const fin = vm.getObjectByName('VectorMineEmitter_1');
  const pip = vm.getObjectByName('VectorMineArmingPip');
  const bladeMaterial = fin.material[0];
  assert.equal(fin.material[2].name, 'VectorMineEmitterSafe');

  vm.userData.updateRuntimeState({ data: { armed: true } }, 10);
  assert.equal(vm.userData.visualArmed, true);
  assert.equal(fin.material[2].name, 'VectorMineEmitterArmed', 'nozzle group arms');
  assert.equal(fin.material[0], bladeMaterial, 'blade stays machined shell while armed');
  assert.equal(pip.material.name, 'VectorMineEmitterArmed', 'arming pip lights');

  vm.userData.updateRuntimeState({ data: { armed: false } }, 20);
  assert.equal(fin.material[2].name, 'VectorMineEmitterSafe', 'safe state restores');
  assert.equal(pip.material.name, 'VectorMineEmitterSafe');
});
