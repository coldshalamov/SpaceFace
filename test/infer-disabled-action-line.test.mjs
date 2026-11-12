// A refused verb names the gate that fired. A tumble is not a wrecked drive.
import test from 'node:test';
import assert from 'node:assert/strict';

import { combatDenialToastSpec, formatCombatActionRejectLine } from '../src/ui/toasts.js';

test('a dead part is named only when the capability gate fired', () => {
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
    formatCombatActionRejectLine('disabled:capability:weapon'),
    'Guns out — the battery is dark',
  );
  const drive = combatDenialToastSpec({ reason: 'disabled:capability:drive' });
  assert.equal(drive.hint, 'Repair it, or wait for the part to come back');
});

test('a tumble, cooked guns, and a jam do not claim the part is wrecked', () => {
  const dash = combatDenialToastSpec({ reason: 'disabled:tag:dash' });
  assert.equal(dash.text, 'Can\'t dash — the ship is tumbling');
  assert.equal(dash.hint, 'Wait until the tumble stops');
  const rope = combatDenialToastSpec({ reason: 'disabled:tag:tether' });
  assert.equal(rope.text, 'Can\'t use the rope — the ship is tumbling');
  assert.equal(rope.hint, 'Wait until the tumble stops');
  const guns = combatDenialToastSpec({ reason: 'disabled:tag:weapon' });
  assert.equal(guns.text, 'Guns won\'t answer — out, tumbling, or cooked');
  assert.equal(guns.hint, 'Wait it out, or repair the battery');
  const sensors = combatDenialToastSpec({ reason: 'disabled:capability:sensor' });
  assert.equal(sensors.text, 'Sensors aren\'t answering — jammed or out');
  assert.equal(sensors.hint, 'Wait out the jam, or repair the sensors');
});

test('an unknown disabled token stays readable and a mystery reason stays silent', () => {
  assert.equal(formatCombatActionRejectLine('disabled:capability:mystery'), 'capability:mystery disabled');
  assert.equal(combatDenialToastSpec({ reason: 'disabled:capability:mystery' }).hint, '');
  assert.equal(combatDenialToastSpec({ reason: 'mystery_snake_reason' }), null);
  assert.equal(formatCombatActionRejectLine('heat_limit'), 'Too hot to act');
  assert.equal(combatDenialToastSpec({ reason: 'heat_limit' }).hint, 'Ease off until heat falls');
});
