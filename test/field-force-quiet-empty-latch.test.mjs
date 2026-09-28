import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';
import { FIELD_LIFECYCLES } from '../src/render/forceLanguage/effectLifecycle.js';

const field = (kind, id = kind) => ({
  id,
  kind,
  center: { x: 20, z: 30 },
  dir: { x: 1, z: 0 },
  radius: kind === 'seed' ? 42 : 170,
  halfAngleRad: 0.56,
  halfWidth: 52,
  engaged: false,
});
const state = (active = []) => ({
  simTime: 0,
  fields: { active },
  massSeed: { seedId: 3, phase: 'active' },
  settings: { video: {} },
  render: {
    camera: {
      projectionMatrix: new THREE.Matrix4(),
      matrixWorldInverse: new THREE.Matrix4(),
    },
  },
});
const step = (o, s, t) => {
  s.simTime = t;
  return o.update(0.016, s);
};

test('quiet empty field-force latches after first empty publish', () => {
  const o = new FieldForcePresentation(new THREE.Scene());
  const s = state([]);
  step(o, s, 0);
  assert.equal(o._quietEmpty, true, 'first empty publish latches');
  assert.equal(o.mesh.visible, false);
  assert.equal(o.mesh.count, 0);
  const frameBefore = o.frame;
  step(o, s, 1);
  step(o, s, 2);
  assert.equal(o._quietEmpty, true);
  assert.equal(o.frame, frameBefore, 'latched idle skips frame advance');
  o.dispose();
});

test('fields.active dirty-wake resumes update then re-latches when empty', () => {
  const o = new FieldForcePresentation(new THREE.Scene());
  const s = state([]);
  step(o, s, 0);
  assert.equal(o._quietEmpty, true);
  s.fields.active = [field('well')];
  step(o, s, 1);
  assert.equal(o._quietEmpty, false);
  assert.equal(o.stats.active, 1);
  assert.ok(o.mesh.count > 0);
  s.fields.active = [];
  step(o, s, 1.1);
  assert.equal(o.stats.releasing, 1, 'release residue still updates');
  assert.equal(o._quietEmpty, false, 'must not latch while releasing');
  const release = FIELD_LIFECYCLES.well.release;
  step(o, s, 1.1 + release + 0.05);
  assert.equal(o.mesh.count, 0);
  assert.equal(o._quietEmpty, true, 're-latches after residue drains');
  const frame = o.frame;
  step(o, s, 5);
  assert.equal(o.frame, frame);
  o.dispose();
});

test('picture unchanged while latched — mesh stays hidden/count 0', () => {
  const o = new FieldForcePresentation(new THREE.Scene());
  const s = state([field('repulsor')]);
  step(o, s, 0);
  step(o, s, 1);
  assert.ok(o.mesh.visible);
  s.fields.active = [];
  const release = FIELD_LIFECYCLES.repulsor.release;
  step(o, s, 1.05);
  step(o, s, 1.05 + release + 0.05);
  assert.equal(o._quietEmpty, true);
  assert.equal(o.mesh.visible, false);
  assert.equal(o.mesh.count, 0);
  for (let i = 0; i < 30; i++) step(o, s, 2 + i * 0.05);
  assert.equal(o.mesh.visible, false);
  assert.equal(o.mesh.count, 0);
  o.dispose();
});
