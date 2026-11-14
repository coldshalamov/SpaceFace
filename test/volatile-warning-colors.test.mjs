import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { stampVolatilePresentation } from '../src/systems/lootShards.js';

function carriesWarningColor(root, color) {
  const cage = root.getObjectByName('VolatilePod_ContainmentAndValve');
  const attribute = cage?.geometry.getAttribute('color');
  const expected = new THREE.Color(color);
  if (!attribute) return false;
  for (let i = 0; i < attribute.count; i++) {
    if (Math.abs(attribute.getX(i) - expected.r) < 1e-6
        && Math.abs(attribute.getY(i) - expected.g) < 1e-6
        && Math.abs(attribute.getZ(i) - expected.b) < 1e-6) return true;
  }
  return false;
}

test('volatile bottle uses the warning color stamped by each real commodity class', () => {
  const factory = createVisualFactory();
  const cases = [
    ['cmdty_fuel_cells', 0xffb340],
    ['cmdty_volatiles', 0x7dd66a],
    ['cmdty_ore_einsteinium', 0xa77dff],
    ['cmdty_gas_helium3', 0x8fe1fa],
  ];
  for (const [commodityId, expected] of cases) {
    const data = stampVolatilePresentation({}, commodityId);
    for (const type of ['payload', 'pickup']) {
      const root = factory.build({ id: `${commodityId}:${type}`, type, radius: 3, data });
      const bottle = root.getObjectByName('VolatilePod_Bottle');
      assert.ok(bottle, `${commodityId} ${type} uses the hazard bottle`);
      assert.ok(carriesWarningColor(root, expected), `${commodityId} ${type} has its warning color`);
    }
  }
});

test('unknown volatile classes can still carry a known lamp color', () => {
  const root = createVisualFactory().build({
    id: 'unknown-cyan', type: 'payload', radius: 3,
    data: { volatileClass: 'future-class', volatileLamp: 'cyan' },
  });
  assert.ok(carriesWarningColor(root, 0x8fe1fa));
});
