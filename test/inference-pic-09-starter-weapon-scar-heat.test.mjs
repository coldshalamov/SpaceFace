import assert from 'node:assert/strict';
import test from 'node:test';

import { heatForWeaponVariant } from '../src/render/weapons/contactMarks.js';

test('PIC-09: starter weapon IDs map to named scorch heat instead of unknown default', () => {
  // Starter pulse laser variants should resolve to pulse-bolt heat (0.65), not default 0.8
  assert.equal(heatForWeaponVariant('wpn_pulse_laser_s'), 0.65,
    'wpn_pulse_laser_s must resolve to pulse-bolt heat (0.65), not default 0.8');
  assert.equal(heatForWeaponVariant('wpn_pulse_laser_m'), 0.65,
    'wpn_pulse_laser_m must resolve to pulse-bolt heat (0.65), not default 0.8');
  assert.equal(heatForWeaponVariant('unique_mirrorjaw_pulse'), 0.65,
    'unique_mirrorjaw_pulse must resolve to pulse-bolt heat (0.65)');

  // Autocannon starter weapons resolve to autocannon heat (0.8)
  assert.equal(heatForWeaponVariant('wpn_autocannon_s'), 0.80,
    'wpn_autocannon_s must resolve to autocannon heat (0.80)');
  assert.equal(heatForWeaponVariant('wpn_autocannon_m'), 0.80,
    'wpn_autocannon_m must resolve to autocannon heat (0.80)');

  // Flak starter turret resolves to flak heat (0.75)
  assert.equal(heatForWeaponVariant('wpn_flak_turret_s'), 0.75,
    'wpn_flak_turret_s must resolve to flak heat (0.75)');

  // Continuous beam starter weapon resolves to continuous-beam heat (0.95)
  assert.equal(heatForWeaponVariant('wpn_beam_laser_m'), 0.95,
    'wpn_beam_laser_m must resolve to continuous-beam heat (0.95)');

  // Direct variant identifiers continue to resolve correctly
  assert.equal(heatForWeaponVariant('pulse-bolt'), 0.65);
  assert.equal(heatForWeaponVariant('thermal-bolt'), 1.0);
  assert.equal(heatForWeaponVariant('continuous-beam'), 0.95);
  assert.equal(heatForWeaponVariant('concussion-slug'), 0.9);
  assert.equal(heatForWeaponVariant('siege-lance'), 0.95);
  assert.equal(heatForWeaponVariant('torpedo'), 0.9);
  assert.equal(heatForWeaponVariant('missile'), 0.85);
  assert.equal(heatForWeaponVariant('railgun'), 0.85);
  assert.equal(heatForWeaponVariant('vector-mine'), 0.85);
  assert.equal(heatForWeaponVariant('flak'), 0.75);
  assert.equal(heatForWeaponVariant('disruptor'), 0.7);
  assert.equal(heatForWeaponVariant('autocannon'), 0.8);

  // Unknown weapon id or variant falls back to 0.8 default
  assert.equal(heatForWeaponVariant('nonexistent_weapon_unknown'), 0.8,
    'unknown weapon must fall back to 0.8 default');
  assert.equal(heatForWeaponVariant(null), 0.8);
  assert.equal(heatForWeaponVariant(undefined), 0.8);
});
