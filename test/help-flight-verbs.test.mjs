// G15 — the flight help names the keys the player actually has for the verbs
// that were missing from the keyboard list: travel burn and charge detonate.

import test from 'node:test';
import assert from 'node:assert/strict';

import { controlSections } from '../src/ui/screens/help.js';
import { DEFAULTS } from '../src/systems/input.js';

test('flight help lists travel burn and the five powers from the live binding map', () => {
  const state = { settings: { controls: {}, gameplay: {} }, mode: 'flight', ui: {} };
  const flight = controlSections(state)
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
  // G18-02: the wheel teaches the overflow verbs — they ship unbound, and the sheet says
  // where they live rather than printing an em-dash.
  assert.ok(rows.has('contextWheel'), 'the wheel itself has a row');
  const travelRow = flight[1].find((row) => row[1] === 'travelBurn');
  assert.match(String(travelRow[2] || ''), /context wheel/, 'travel burn names the wheel');
  const brakeRow = flight[1].find((row) => row[1] === 'brake');
  assert.match(String(brakeRow[2] || ''), /context wheel/, 'brake names the wheel');
  assert.deepEqual(DEFAULTS.BINDINGS.travelBurn, [], 'travel burn ships on the wheel');
  assert.deepEqual(DEFAULTS.BINDINGS.shove, ['Digit2'], 'the SHOVE hotbar seat is a real binding');
});
