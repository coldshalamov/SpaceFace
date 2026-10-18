import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMachineMesh } from '../src/render/machineVisuals.js';

test('SFQ-I059: buildMachineMesh(custodian) exposes updateAuthoredMotion and toggles cust_tip emissive intensity', () => {
  const mesh = buildMachineMesh('custodian');
  assert.ok(mesh, 'buildMachineMesh("custodian") must return a Three.js group');
  assert.equal(typeof mesh.userData.updateAuthoredMotion, 'function', 'custodian must expose userData.updateAuthoredMotion');

  const tips = [];
  mesh.traverse((child) => {
    if (child.name === 'cust_tip' || child.geometry?.userData?.spacefaceSharedAsset) {
      if (child.name === 'cust_tip') tips.push(child);
    }
  });
  assert.ok(tips.length > 0, 'must have cust_tip meshes');

  // Quiet / idle branch: repairing is false/falsy -> drops emissiveIntensity to <= 0.35
  const idleEntity = { data: { machine: { kind: 'custodian', repairing: false } } };
  mesh.userData.updateAuthoredMotion(0.016, idleEntity);
  for (const tip of tips) {
    assert.ok(
      tip.material.emissiveIntensity <= 0.35,
      `idle custodian tip emissiveIntensity must be <= 0.35, got ${tip.material.emissiveIntensity}`
    );
  }

  // Also verify when repairing is omitted / falsy
  const emptyEntity = { data: { machine: { kind: 'custodian' } } };
  mesh.userData.updateAuthoredMotion(0.016, emptyEntity);
  for (const tip of tips) {
    assert.ok(
      tip.material.emissiveIntensity <= 0.35,
      `unspecified custodian tip emissiveIntensity must be <= 0.35, got ${tip.material.emissiveIntensity}`
    );
  }

  // Active branch: repairing is true -> restores active pulse >= 1.8
  const activeEntity = { data: { machine: { kind: 'custodian', repairing: true } } };
  mesh.userData.updateAuthoredMotion(0.016, activeEntity);
  for (const tip of tips) {
    assert.ok(
      tip.material.emissiveIntensity >= 1.8,
      `active custodian tip emissiveIntensity must be >= 1.8, got ${tip.material.emissiveIntensity}`
    );
  }
});

test('SFQ-I059: buildMachineMesh(mason) exposes updateAuthoredMotion and toggles msn_weld emissive intensity', () => {
  const mesh = buildMachineMesh('mason');
  assert.ok(mesh, 'buildMachineMesh("mason") must return a Three.js group');
  assert.equal(typeof mesh.userData.updateAuthoredMotion, 'function', 'mason must expose userData.updateAuthoredMotion');

  const welds = [];
  mesh.traverse((child) => {
    if (child.name === 'msn_weld') welds.push(child);
  });
  assert.ok(welds.length > 0, 'must find msn_weld mesh');

  // Quiet / idle branch: working is false/falsy -> drops emissiveIntensity to <= 0.35
  const idleEntity = { data: { machine: { kind: 'mason', working: false } } };
  mesh.userData.updateAuthoredMotion(0.016, idleEntity);
  for (const weld of welds) {
    assert.ok(
      weld.material.emissiveIntensity <= 0.35,
      `idle mason weld emissiveIntensity must be <= 0.35, got ${weld.material.emissiveIntensity}`
    );
  }

  // Active branch: working is true -> restores active pulse >= 1.8
  const activeEntity = { data: { machine: { kind: 'mason', working: true } } };
  mesh.userData.updateAuthoredMotion(0.016, activeEntity);
  for (const weld of welds) {
    assert.ok(
      weld.material.emissiveIntensity >= 1.8,
      `active mason weld emissiveIntensity must be >= 1.8, got ${weld.material.emissiveIntensity}`
    );
  }
});

test('SFQ-I059: renderer calling convention updateAuthoredMotion(entity, authoredNow, a11y, state) works', () => {
  const custMesh = buildMachineMesh({ data: { machine: { kind: 'custodian' } } });
  assert.ok(custMesh, 'buildMachineMesh with entity object must work');
  assert.equal(typeof custMesh.userData.updateAuthoredMotion, 'function');

  const tip = custMesh.getObjectByName('cust_tip');
  assert.ok(tip, 'cust_tip found by getObjectByName');

  const entity = { data: { machine: { kind: 'custodian', repairing: true } } };
  custMesh.userData.updateAuthoredMotion(entity, 120.5, {}, null);
  assert.ok(tip.material.emissiveIntensity >= 1.8, `active intensity >= 1.8, got ${tip.material.emissiveIntensity}`);

  entity.data.machine.repairing = false;
  custMesh.userData.updateAuthoredMotion(entity, 120.6, {}, null);
  assert.ok(tip.material.emissiveIntensity <= 0.35, `idle intensity <= 0.35, got ${tip.material.emissiveIntensity}`);
});
