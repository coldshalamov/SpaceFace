// §22 A7 — starter muzzles move for the life of the shot. No new particle family.
// The drawn band travels with the flash's own age, one crossing before the flash dies.
import test from 'node:test';
import assert from 'node:assert/strict';

import { dischargeFlowAt, DISCHARGE_FLOW } from '../src/render/forceLanguage/weaponDischargePool.js';
import { weaponSignature } from '../src/render/forceLanguage/catalog.js';
import { SURFACE_VERTEX } from '../src/render/forceLanguage/sweptSurfaceBatch.js';

const STARTERS = [
  ['pulse-bolt', 'split-aperture', 0.11],
  ['autocannon', 'machined-burst', 0.08],
];

test('starter discharge flow stays steady until the shot ends and crosses the muzzle', () => {
  assert.match(SURFACE_VERTEX, /float motionTime = age \* uMotion/);
  for (const [variant, source, life] of STARTERS) {
    assert.equal(weaponSignature(variant).source, source, variant);
    const speed = DISCHARGE_FLOW[source];
    const samples = [0, life * 0.25, life * 0.5, life * 0.9];
    for (const age of samples) {
      assert.equal(dischargeFlowAt(source, age, life), speed, `${variant} holds one speed`);
    }
    assert.equal(dischargeFlowAt(source, life, life), 0, `${variant} ends with the shot`);
    // Fragment term is motionTime * flow * 5. One crossing is 2π before the flash dies.
    assert.ok(life * speed * 5 >= Math.PI * 2, `${variant} band crosses the bore`);
  }
});
