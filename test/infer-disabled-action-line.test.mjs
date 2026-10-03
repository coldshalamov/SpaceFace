// A refused verb names the dead part. It does not print capability:tether.
import test from 'node:test';
import assert from 'node:assert/strict';

import { combatDenialToastSpec, formatCombatActionRejectLine } from '../src/ui/toasts.js';

test('a dead spool, clamp, drive, or gun names that part', () => {
  assert.equal(
    formatCombatActionRejectLine('disabled:capability:tether'),
    'Massline spool out — the rope will not hold',
  );
  assert.equal(
    formatCombatActionRejectLine('disabled:tag:reel'),
    'Massline spool out — the rope will not hold',
  );
  assert.equal(
    formatCombatActionRejectLine('disabled:capability:transport_clamp'),
    'Clamp out — the load is no longer held',
  );
  assert.equal(
    formatCombatActionRejectLine('disabled:capability:drive'),
    'Drive out — the ship is not pushing',
  );
  assert.equal(
    formatCombatActionRejectLine('disabled:tag:sling'),
    'Can\'t throw — the drive or the Massline spool is out',
  );
  assert.equal(
    formatCombatActionRejectLine('disabled:tag:weapon'),
    'Guns out — the battery is dark',
  );
  const spec = combatDenialToastSpec({ actorId: 1, reason: 'disabled:capability:sensor' });
  assert.equal(spec.text, 'Sensors out — the board is blind');
  assert.equal(spec.hint, 'Repair it, or wait for the part to come back');
});

test('an unknown disabled token stays readable and a mystery reason stays silent', () => {
  assert.equal(formatCombatActionRejectLine('disabled:capability:mystery'), 'capability:mystery disabled');
  assert.equal(combatDenialToastSpec({ reason: 'mystery_snake_reason' }), null);
  assert.equal(formatCombatActionRejectLine('heat_limit'), 'Too hot to act');
});
