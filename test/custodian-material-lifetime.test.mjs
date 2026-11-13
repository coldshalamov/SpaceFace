import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMachineMesh } from '../src/render/machineVisuals.js';
import { disposeObjectNode } from '../src/render/renderer.js';

test('custodian arms share finishes only within one independently animated lifetime', () => {
  const entity = () => ({ data: { machine: { kind: 'custodian', repairing: false } } });
  const firstEntity = entity();
  const otherEntity = entity();
  const first = buildMachineMesh(firstEntity);
  const other = buildMachineMesh(otherEntity);
  const arms = root => {
    const found = [];
    root.traverse(o => { if (o.geometry?.parameters?.depth === 2.4) found.push(o); });
    return found;
  };
  const firstArms = arms(first);
  const otherArms = arms(other);
  assert.equal(firstArms.length, 4);
  assert.ok(firstArms.every(arm => arm.material === firstArms[0].material));
  assert.notEqual(firstArms[0].material, otherArms[0].material);
  const firstTip = firstArms[0].children[0].material;
  const otherTip = otherArms[0].children[0].material;
  assert.ok(firstArms.every(arm => arm.children[0].material === firstTip));
  assert.notEqual(firstTip, otherTip);
  firstEntity.data.machine.repairing = true;
  first.userData.updateAuthoredMotion(1, firstEntity);
  assert.notEqual(firstTip.emissiveIntensity, otherTip.emissiveIntensity);

  let armDisposals = 0; let tipDisposals = 0; let otherDisposals = 0; let geometryDisposals = 0;
  firstArms[0].material.addEventListener('dispose', () => armDisposals++);
  firstTip.addEventListener('dispose', () => tipDisposals++);
  otherTip.addEventListener('dispose', () => otherDisposals++);
  const cachedGeometry = firstArms[0].geometry;
  assert.equal(cachedGeometry, otherArms[0].geometry);
  cachedGeometry.addEventListener('dispose', () => geometryDisposals++);
  first.traverse(object => disposeObjectNode(object));
  assert.equal(armDisposals, 1);
  assert.equal(tipDisposals, 1);
  assert.equal(otherDisposals, 0);
  assert.equal(geometryDisposals, 0);
  other.userData.updateAuthoredMotion(0.016, otherEntity);
  assert.ok(Number.isFinite(otherTip.emissiveIntensity));
});
