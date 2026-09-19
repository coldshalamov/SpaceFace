import assert from 'node:assert/strict';
import test from 'node:test';

import { selfSlingBonusDv } from '../src/systems/masslineThrow.js';

test('CADENCE: the compatibility self-sling export grants zero free energy at any speed/load', () => {
  // Cadence authored change (INTEGRATION-NOTES §3, DESIGN §6): a cut removes a constraint and adds
  // ZERO momentum. The old pin asserted the 15%-of-speed load-scaled bonus; the export remains only
  // so existing feedback consumers keep compiling — it must now return 0 in every case, and the
  // massline:selfSling event still fires with physicsEarned: true / bonusDv: 0 / impulses: [].
  assert.equal(selfSlingBonusDv(1, 1, true), 0, 'a near-stationary release gets no kick');
  assert.equal(selfSlingBonusDv(100, 1, false), 0, 'a slack line gets no kick at any speed');
  assert.equal(selfSlingBonusDv(100, 0, true), 0, 'an unloaded line gets no kick at any speed');
  assert.equal(selfSlingBonusDv(24.99, 1, true), 0, 'an accidental low-speed tap gets no kick');
  assert.equal(selfSlingBonusDv(100, 0.55, true), 0,
    'CADENCE: ordinary loaded tension no longer scales a fifteen-percent ceiling — zero is zero');
  assert.equal(selfSlingBonusDv(100, 1, true), 0,
    'CADENCE: a full-load max-speed release earns no free bonus either');
  assert.equal(selfSlingBonusDv(-100, 2, true), 0,
    'speed stays unsigned and the authored answer is zero at every magnitude');
});
