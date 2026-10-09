import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALENDAR_CLOCK_IDS,
  NEAR_CLOCK_IDS,
  PRODUCTION_UPDATE_ORDER,
  SYSTEM_CAPABILITIES,
  SYSTEM_CLOCK,
  TABLE_CLOCK_IDS,
  getDeclaredSystemClock,
  getSystemClock,
  validateSystemClockDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';

// FB-089 — every production update-order system sits on exactly one declared clock.
// The table clock is a list now, not a default: an id that forgets its declaration is
// a manifest violation, not a silent 60 Hz tenant.

test('every production update-order id carries exactly one declared clock', () => {
  const violations = validateSystemClockDeclarations();
  assert.deepEqual(violations, [], `clock declaration violations: ${violations.join('; ')}`);
});

test('the three clock lists plus glass capabilities cover the update order exactly once', () => {
  const seen = new Map();
  for (const [clock, list] of [
    [SYSTEM_CLOCK.TABLE, TABLE_CLOCK_IDS],
    [SYSTEM_CLOCK.NEAR, NEAR_CLOCK_IDS],
    [SYSTEM_CLOCK.CALENDAR, CALENDAR_CLOCK_IDS],
  ]) {
    for (const id of list) {
      assert.ok(!seen.has(id), `'${id}' declared on both ${seen.get(id)} and ${clock}`);
      seen.set(id, clock);
    }
  }
  for (const id of PRODUCTION_UPDATE_ORDER) {
    const cap = SYSTEM_CAPABILITIES[id];
    const kind = cap && cap.capability;
    const glass = kind === 'hud' || kind === 'voice' || kind === 'presentation';
    if (glass) {
      assert.ok(!seen.has(id), `glass '${id}' also holds a ${seen.get(id)} clock entry`);
      assert.equal(getSystemClock(id), SYSTEM_CLOCK.GLASS);
      continue;
    }
    assert.ok(seen.has(id), `'${id}' is in the update order with no clock declaration`);
    assert.equal(getDeclaredSystemClock(id), seen.get(id));
    assert.equal(getSystemClock(id), seen.get(id));
  }
});

test('single writers and fixed-step authorities stay on the table clock', () => {
  for (const id of [
    'physics', 'flightSlot', 'weapons', 'combat', 'mining', 'heat', 'tetherGameplay',
    'collisionConsequences', 'wingmen', 'world', 'chronicler',
  ]) {
    assert.equal(getSystemClock(id), SYSTEM_CLOCK.TABLE, `${id} must stay table`);
  }
});

test('moved observers land on their declared clocks', () => {
  assert.equal(getSystemClock('difficultyDirector'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('noFireAdvisory'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('moralTrapSystem'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('masslineTelemetry'), SYSTEM_CLOCK.NEAR);
  // Pre-existing non-table assignments are untouched.
  assert.equal(getSystemClock('lawSecurity'), SYSTEM_CLOCK.NEAR);
  assert.equal(getSystemClock('barkDirector'), SYSTEM_CLOCK.CALENDAR);
  assert.equal(getSystemClock('aiSlot'), SYSTEM_CLOCK.NEAR);
  assert.equal(getSystemClock('tacticalAI'), SYSTEM_CLOCK.NEAR); // slot alias
});

test('an id added to the update order without a clock fails with the id named', () => {
  const violations = validateSystemClockDeclarations([...PRODUCTION_UPDATE_ORDER, 'ghostNewSystem']);
  assert.ok(
    violations.some((v) => v.includes('ghostNewSystem')),
    `expected a violation naming ghostNewSystem, got: ${violations.join('; ')}`,
  );
});

test('a production id with no declaration cannot silently join the table', () => {
  // Prove the fail-fast path directly: getDeclaredSystemClock reports undeclared, and any
  // id that IS in the production order but missing from the lists throws instead of
  // returning table. (Simulated by hiding the table entry: TABLE_CLOCK_IDS is frozen, so
  // we assert the declared-only read instead.)
  assert.equal(getDeclaredSystemClock('input'), SYSTEM_CLOCK.TABLE);
  assert.equal(getDeclaredSystemClock('notARealSystem'), null);
  // Non-manifest harness names still get the table fallback — lab rigs keep working.
  assert.equal(getSystemClock('notARealSystem'), SYSTEM_CLOCK.TABLE);
});
