import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSwarmFortifyVisual } from '../src/render/swarmFortifyVisuals.js';

function structure(deviceId, health = 140) {
  return { radius: 12, alive: true, hull: health, hullMax: 140, data: { swarmFortify: { deviceId } } };
}

test('Fortify hardware resources survive retiring another instance and do not share health state', () => {
  const first = buildSwarmFortifyVisual(structure('gravity_beacon'));
  const secondEntity = structure('gravity_beacon');
  const second = buildSwarmFortifyVisual(secondEntity);
  assert.equal(first.children[0].geometry, second.children[0].geometry, 'instances share the finite hardware geometry');
  let disposed = 0;
  first.children[0].geometry.addEventListener('dispose', () => disposed++);
  first.children[0].geometry.dispose();
  first.children[0].material.dispose();
  assert.equal(disposed, 0, 'one retired entity cannot evict the shared kit');

  const healthy = second.children[2].material;
  first.userData.updateRuntimeState(structure('gravity_beacon', 20));
  assert.notEqual(first.children[2].material, healthy);
  assert.equal(second.children[2].material, healthy, 'damage changes only the affected emitter');
  const snapshot = JSON.stringify(secondEntity);
  second.userData.updateRuntimeState(secondEntity);
  assert.equal(JSON.stringify(secondEntity), snapshot, 'presentation never writes simulation health');
  secondEntity.alive = false;
  second.userData.updateRuntimeState(secondEntity);
  assert.notEqual(second.children[2].material, healthy, 'a destroyed device visibly powers down');
});

test('each Fortify device has physical hardware inside its collision footprint', () => {
  for (const deviceId of ['gravity_beacon', 'repulsor_pylon', 'tesla_pair', 'kinetic_turret']) {
    const model = buildSwarmFortifyVisual(structure(deviceId));
    assert.equal(model.userData.interactionKind, 'fortify-structure');
    for (const child of model.children) {
      const positions = child.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        assert.ok(Math.hypot(positions.getX(i), positions.getZ(i)) <= 1.02,
          `${deviceId} hardware protrudes outside the physical footprint`);
      }
      assert.ok(!child.material.transparent, 'hardware is solid geometry, not a transparent card');
    }
  }
  assert.equal(buildSwarmFortifyVisual(structure('missing-device')), null);
});

test('turret hardware faces the canonical shot heading without turning its physical body', () => {
  const entity = structure('kinetic_turret');
  entity.rot = 0.25;
  entity.data.swarmFortify.aimHeading = Math.PI / 2;
  const model = buildSwarmFortifyVisual(entity);
  const snapshot = JSON.stringify(entity);
  model.userData.updateRuntimeState(entity);
  assert.equal(model.children[0].rotation.y, -(Math.PI / 2 - entity.rot));
  assert.equal(JSON.stringify(entity), snapshot);
});
