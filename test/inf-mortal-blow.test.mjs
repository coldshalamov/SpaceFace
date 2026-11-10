// inf-mortal-blow — the hit that kills reads as its own event at the contact.
//
// The killing strike used to present as one more ordinary hull hit: the death's own picture
// (overload flare, phased explosion) only opened on the kill receipt ~0.4 s later, so in a
// furball nothing told you WHICH shot ended them. Now the strike that empties the hull punches
// through and out the far side with a short white core and a `mortal` contact light, handing off
// to the overload flare as its window opens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isMortalBlowContact, resolveMortalBlowPlan } from '../src/render/vfx/mortalBlowRead.js';
import { presetFor } from '../src/render/vfxColorLightDirector.js';

function damageReceipt(overrides = {}) {
  return {
    hullHit: true,
    amount: 40,
    before: { hull: 30, shield: 0, armor: 0 },
    after: { hull: 0, shield: 0, armor: 0 },
    normal: { x: -0.6, z: 0.8 },
    approach: { x: 0.6, z: -0.8 },
    ...overrides,
  };
}

test('the strike that empties the hull is the mortal blow', () => {
  assert.equal(isMortalBlowContact(damageReceipt()), true);
});

test('ordinary hits, shield hits and pre-dead targets are not mortal blows', () => {
  // Hull survives the hit.
  assert.equal(isMortalBlowContact(damageReceipt({ after: { hull: 4, shield: 0, armor: 0 } })), false);
  // No hull layer involved (shield chip).
  assert.equal(isMortalBlowContact(damageReceipt({ hullHit: false })), false);
  // Legacy receipt without vitals snapshots reads as an ordinary hit, not a blow.
  assert.equal(isMortalBlowContact(damageReceipt({ before: null, after: null })), false);
  // The hull was already gone on entry (a replayed or overlapping receipt).
  assert.equal(isMortalBlowContact(damageReceipt({ before: { hull: 0, shield: 0, armor: 0 } })), false);
});

test('the blow-through exits along the travel axis, opposite the contact normal', () => {
  const plan = resolveMortalBlowPlan({ targetRadius: 10, normalX: -0.6, normalZ: 0.8 }, {});
  assert.equal(plan.measured, true);
  // Normal faces the incoming round; the exit continues past it.
  assert.ok(Math.abs(plan.exitX - 0.6) < 1e-9 && Math.abs(plan.exitZ + 0.8) < 1e-9);
  assert.equal(plan.exitRadius > 10 * 0.9 && plan.exitRadius < 10 * 1.5, true);
});

test('a degenerate normal falls back to the approach axis; none means no exit is invented', () => {
  const fromApproach = resolveMortalBlowPlan({
    targetRadius: 8, normalX: 0, normalZ: 0, approachX: 0, approachZ: 5,
  }, {});
  assert.equal(fromApproach.measured, true);
  assert.ok(Math.abs(fromApproach.exitX) < 1e-9 && Math.abs(fromApproach.exitZ + 1) < 1e-9);

  const directionless = resolveMortalBlowPlan({ targetRadius: 8, normalX: 0, normalZ: 0 }, {});
  assert.equal(directionless.measured, false);
  assert.equal(directionless.exitX, 0);
  assert.equal(directionless.exitZ, 0);
});

test('the white core burns out inside the overload window so the two reads hand off', () => {
  const chip = resolveMortalBlowPlan({ targetRadius: 6, amount: 5, overkill: 0 }, {});
  const hammer = resolveMortalBlowPlan({ targetRadius: 20, amount: 300, overkill: 260 }, {});
  // The kill receipt opens its flare at 0.4 s; the mortal core must be dying as it opens.
  assert.ok(chip.flashLife < 0.4, `chip flashLife ${chip.flashLife}`);
  assert.ok(hammer.flashLife < 0.5, `hammer flashLife ${hammer.flashLife}`);
  // A heavier finishing hit reads bigger and hotter, but within one bounded band.
  assert.ok(hammer.flashSize > chip.flashSize);
  assert.ok(hammer.exitRadius > chip.exitRadius);
  assert.equal(chip.lightSeverity, 'mortal');
  assert.equal(hammer.lightSeverity, 'mortal');
});

test('a reused plan scratch never carries a stale measured axis', () => {
  const out = {};
  resolveMortalBlowPlan({ targetRadius: 9, normalX: 0, normalZ: -1 }, out);
  assert.equal(out.measured, true);
  resolveMortalBlowPlan({ targetRadius: 9 }, out);
  assert.equal(out.measured, false);
  assert.equal(out.exitX, 0);
  assert.equal(out.exitZ, 0);
});

test('the mortal light severity sits between an ordinary hull hit and a shield tear', () => {
  const hull = presetFor('impact', 'hull');
  const mortal = presetFor('impact', 'mortal');
  const break_ = presetFor('shield', 'break');
  assert.ok(mortal, 'impactMortal preset row must exist');
  assert.equal(mortal.color, '#eaf6ff', 'the mortal punch reads white-hot, not ember orange');
  assert.ok(mortal.peak > hull.peak, 'hotter than an ordinary hull hit');
  assert.ok(mortal.peak < break_.peak, 'the death explosion still owns the louder light');
  assert.ok(mortal.priority > hull.priority, 'a killing blow never loses its light to an ordinary hit');
});

test('the live owner is wired: the damage handler reads the mortal blow and names its severity', () => {
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfx, /import \{ isMortalBlowContact, resolveMortalBlowPlan \} from '\.\/vfx\/mortalBlowRead\.js';/);
  assert.match(vfx, /MORTAL BLOW — the strike that emptied the hull/);
  assert.match(
    vfx,
    /if \(isMortalBlowContact\(p\)\) \{[\s\S]{0,1400}?_spawnProjectileTrailStreak/,
    'the killing blow draws its blow-through streak',
  );
  assert.match(
    vfx,
    /severity: isMortalBlowContact\(p\) \? 'mortal' : 'hull'/,
    'the contact light wears the mortal severity on the killing strike only',
  );
});
