// G15 — the flight help names the keys the player actually has for the verbs
// that were missing from the keyboard list: travel burn and charge detonate.

import test from 'node:test';
import assert from 'node:assert/strict';

import { controlSections } from '../src/ui/screens/help.js';
import { DEFAULTS } from '../src/systems/input.js';

test('flight help lists travel burn and the five powers from the live binding map', () => {
  const flight = controlSections({ settings: { controls: {}, gameplay: {} } })
    .find((section) => section[0] === 'Flight');
  assert.ok(flight, 'flight section exists');
  const rows = new Map(flight[1].map((row) => [row[1], row[0]]));
  assert.equal(rows.get('travelBurn'), 'Travel burn (latch a long burn)');
  // The five powers (owner 2026-10-22) replaced the eight overlapping ordnance/field verbs; the
  // detonate and the charge throw now live inside SHOVE and BOMB, and the sheet says so.
  assert.match(rows.get('shove'), /set off every armed charge and bomb/);
  assert.match(rows.get('bomb'), /sticky charge/);
  for (const power of ['pull', 'shove', 'pin', 'bomb', 'rig']) assert.ok(rows.has(power), `${power} has a row`);
  for (const gone of ['chargeDetonate', 'chargeThrow', 'dropBomb', 'deployWell', 'deployRepulsor', 'deployMassSeed', 'toggleClearingCone', 'toggleSkimCollector']) {
    assert.equal(rows.has(gone), false, `${gone} is no longer its own row`);
  }
  assert.ok(DEFAULTS.BINDINGS.travelBurn.includes('F8'));
  assert.ok(DEFAULTS.BINDINGS.shove.includes('KeyR'));
  assert.ok(DEFAULTS.BINDINGS.shove.includes('Digit2'), 'the SHOVE hotbar seat is a real binding');
});
