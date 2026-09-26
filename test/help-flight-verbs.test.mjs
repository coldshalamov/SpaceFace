// G15 — the flight help names the keys the player actually has for the verbs
// that were missing from the keyboard list: travel burn and charge detonate.

import test from 'node:test';
import assert from 'node:assert/strict';

import { controlSections } from '../src/ui/screens/help.js';
import { DEFAULTS } from '../src/systems/input.js';

test('flight help lists travel burn and charge detonate from the live binding map', () => {
  const flight = controlSections({ settings: { controls: {}, gameplay: {} } })
    .find((section) => section[0] === 'Flight');
  assert.ok(flight, 'flight section exists');
  const rows = new Map(flight[1].map((row) => [row[1], row[0]]));
  assert.equal(rows.get('travelBurn'), 'Travel burn (latch a long burn)');
  assert.equal(rows.get('chargeDetonate'), 'Detonate armed charge');
  // The throw was the one ORDNANCE verb the bind sheet never named — the gap behind
  // "I press keys and I don't know what they do".
  assert.equal(rows.get('chargeThrow'), 'Throw impulse charge (sticks where it lands; detonate later)');
  assert.ok(DEFAULTS.BINDINGS.travelBurn.includes('KeyH'));
  assert.ok(DEFAULTS.BINDINGS.chargeDetonate.includes('KeyR'));
  assert.ok(DEFAULTS.BINDINGS.chargeDetonate.includes('Digit2'), 'the ORDNANCE hotbar seat is a real binding');
});
