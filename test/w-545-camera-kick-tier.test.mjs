// Row 545 (W-CAMERA): the directed impact kick answers only T4+ (hulk-class) contact. Lighter
// slams still carry trauma and hitstop — they just never slide the frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollisionFeel, impactKickFromMomentum } from '../src/render/feel.js';
import { lineThrowTierForBody } from '../src/data/lineRating.js';

const slam = { deltaV: 200 };
const ctx = (extra = {}) => ({ mode: 'flight', deltaV: 200, momentum: 4000, playerDistance: 0, ...extra });

test('w-545: hulk-class contact kicks; lighter tiers stay silent', () => {
  const full = resolveCollisionFeel(slam, ctx({ kickTier: 4 }), null);
  assert.ok(full.kickWu > 0, 'a hulk slam slides the frame');
  assert.equal(full.kickWu, impactKickFromMomentum(4000), 'the momentum table still sets magnitude');
  for (const tier of [0, 1, 2, 3]) {
    const r = resolveCollisionFeel(slam, ctx({ kickTier: tier }), null);
    assert.equal(r.kickWu, 0, `tier ${tier} never kicks`);
    assert.ok(r.trauma >= 0 && r.hsDur > 0, 'trauma and hitstop still read below T4');
  }
  const plate = resolveCollisionFeel(slam, ctx({ kickTier: 5 }), null);
  assert.ok(plate.kickWu > 0, 'dreadnought plate is heavier than hulk — it kicks');
});

test('w-545: a caller that cannot name a tier keeps the momentum answer', () => {
  const r = resolveCollisionFeel(slam, ctx(), null);
  assert.ok(r.kickWu > 0, 'absent kickTier falls back to the momentum table');
});

test('w-545: body radii land on the expected rungs of the throw-tier ladder', () => {
  assert.equal(lineThrowTierForBody({ radius: 8 }), 0);
  assert.equal(lineThrowTierForBody({ radius: 40 }), 3);
  assert.equal(lineThrowTierForBody({ radius: 50 }), 4, 'a hulk is T4');
  assert.equal(lineThrowTierForBody({ radius: 120 }), 5);
});
