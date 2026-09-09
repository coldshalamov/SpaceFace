import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { resolveHitstunLaw, HITSTUN_LAW } from '../src/combat/impulseKernel.js';

const BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

// The current real-path denominator after PQ-137.03 is Wasp mass 16, governed cruise 105 WU/s.
const WASP_MASS = 16;
const WASP_CRUISE = 105;
const KESTREL_MASS = 18;

test('five exact production impulse values and Mirrorjaw parity', () => {
  const pulse = BY_ID.get('wpn_pulse_laser_s');
  const mirrorjaw = BY_ID.get('unique_mirrorjaw_pulse');
  const railgun = BY_ID.get('wpn_railgun_m');
  const concussion = BY_ID.get('wpn_concussion_cannon_m');
  const mine = BY_ID.get('wpn_vector_mine_m');

  assert.ok(pulse, 'wpn_pulse_laser_s must exist');
  assert.ok(mirrorjaw, 'unique_mirrorjaw_pulse must exist');
  assert.ok(railgun, 'wpn_railgun_m must exist');
  assert.ok(concussion, 'wpn_concussion_cannon_m must exist');
  assert.ok(mine, 'wpn_vector_mine_m must exist');

  assert.equal(pulse.impulsePerHit, 84, 'wpn_pulse_laser_s impulsePerHit must be 84');
  assert.equal(mirrorjaw.impulsePerHit, 84, 'unique_mirrorjaw_pulse impulsePerHit must be 84');
  assert.equal(railgun.impulsePerHit, 168, 'wpn_railgun_m impulsePerHit must be 168');
  assert.equal(concussion.impulsePerHit, 920, 'wpn_concussion_cannon_m impulsePerHit must be 920');
  assert.equal(mine.impulsePerHit, 756, 'wpn_vector_mine_m impulsePerHit must be 756');

  // Mirrorjaw parity
  assert.equal(mirrorjaw.impulsePerHit, pulse.impulsePerHit, 'Mirrorjaw must have parity with starter pulse impulse');
  assert.equal(mirrorjaw.dmg, pulse.dmg, 'Mirrorjaw must have parity with starter pulse damage');
  assert.equal(mirrorjaw.rof, pulse.rof, 'Mirrorjaw must have parity with starter pulse ROF');
  assert.equal(mirrorjaw.impulseProvenance, pulse.impulseProvenance, 'Mirrorjaw shares starter pulse provenance');
});

test('Wasp delta-V fractions of cruise match authored expectations', () => {
  const pulse = BY_ID.get('wpn_pulse_laser_s');
  const railgun = BY_ID.get('wpn_railgun_m');
  const concussion = BY_ID.get('wpn_concussion_cannon_m');
  const mine = BY_ID.get('wpn_vector_mine_m');

  // Pulse: exactly 5% cruise delta-V (84 / 16 = 5.25 WU/s = 0.05 * 105)
  const pulseDV = pulse.impulsePerHit / WASP_MASS;
  assert.equal(pulseDV, 5.25);
  assert.equal(pulseDV / WASP_CRUISE, 0.05);

  // Railgun: exactly 10% (168 / 16 = 10.5 WU/s = 0.10 * 105)
  const railDV = railgun.impulsePerHit / WASP_MASS;
  assert.equal(railDV, 10.5);
  assert.equal(railDV / WASP_CRUISE, 0.10);

  // Concussion: ~54.76% (920 / 16 = 57.5 WU/s = ~0.5476 * 105, clearing one visible depth in 2 s)
  const concussionDV = concussion.impulsePerHit / WASP_MASS;
  assert.equal(concussionDV, 57.5);
  assert.ok(Math.abs(concussionDV / WASP_CRUISE - 920 / (16 * 105)) < 1e-9);
  assert.ok(concussionDV / WASP_CRUISE >= 0.30, 'concussion clears the 30% shove bar');

  // Vector Mine: exactly 45% at centre (756 / 16 = 47.25 WU/s = 0.45 * 105)
  const mineDV = mine.impulsePerHit / WASP_MASS;
  assert.equal(mineDV, 47.25);
  assert.equal(mineDV / WASP_CRUISE, 0.45);
});

test('damage and ROF remain unchanged while force table is set', () => {
  const pulse = BY_ID.get('wpn_pulse_laser_s');
  const railgun = BY_ID.get('wpn_railgun_m');
  const concussion = BY_ID.get('wpn_concussion_cannon_m');
  const mine = BY_ID.get('wpn_vector_mine_m');

  assert.equal(pulse.dmg, 8);
  assert.equal(pulse.rof, 5.5);

  assert.equal(railgun.dmg, 60);
  assert.equal(railgun.rof, 0.8);

  assert.equal(concussion.dmg, 12);
  assert.equal(concussion.rof, 1.0);

  assert.equal(mine.dmg, 0);
  assert.equal(mine.rof, 0.5);
});

test('Pulse nominal sustained pressure: 27.5% cruise/s, 55% over two seconds if all 11 land', () => {
  const pulse = BY_ID.get('wpn_pulse_laser_s');
  const deltaVPerHit = pulse.impulsePerHit / WASP_MASS;
  const deltaVFractionPerHit = deltaVPerHit / WASP_CRUISE;

  const pressurePerSecFraction = pulse.rof * deltaVFractionPerHit;
  assert.equal(pressurePerSecFraction, 0.275, '5.5 * 5% = 27.5% cruise/s');

  const shotsInTwoSeconds = pulse.rof * 2;
  assert.equal(shotsInTwoSeconds, 11);

  const twoSecondFraction = shotsInTwoSeconds * deltaVFractionPerHit;
  assert.equal(twoSecondFraction, 0.55, '55% over two seconds if all 11 land');
  assert.equal(shotsInTwoSeconds * deltaVPerHit, 57.75, '57.75 WU/s total delta-V over 2 seconds');
});

test('post-.04 hitstun law behavior: one Pulse/Rail hit does not take helm; Concussion/Mine do', () => {
  const pulse = BY_ID.get('wpn_pulse_laser_s');
  const railgun = BY_ID.get('wpn_railgun_m');
  const concussion = BY_ID.get('wpn_concussion_cannon_m');
  const mine = BY_ID.get('wpn_vector_mine_m');

  // Single Pulse hit on Wasp (attacker Kestrel 18, victim Wasp 16)
  const pulseLaw = resolveHitstunLaw({
    deltaV: pulse.impulsePerHit / WASP_MASS,
    victimCruise: WASP_CRUISE,
    attackerMass: KESTREL_MASS,
    victimMass: WASP_MASS,
  });
  assert.equal(pulseLaw.durationS, 0, 'one Pulse hit does not take the helm (u <= uFloor)');
  assert.equal(pulseLaw.entrySpin, 0);

  // Single Railgun hit on Wasp
  const railLaw = resolveHitstunLaw({
    deltaV: railgun.impulsePerHit / WASP_MASS,
    victimCruise: WASP_CRUISE,
    attackerMass: KESTREL_MASS,
    victimMass: WASP_MASS,
  });
  assert.equal(railLaw.durationS, 0, 'one Railgun hit does not take the helm (u <= uFloor)');
  assert.equal(railLaw.entrySpin, 0);

  // Concussion Cannon hit on Wasp
  const concussionLaw = resolveHitstunLaw({
    deltaV: concussion.impulsePerHit / WASP_MASS,
    victimCruise: WASP_CRUISE,
    attackerMass: KESTREL_MASS,
    victimMass: WASP_MASS,
  });
  assert.ok(concussionLaw.durationS >= 1.0, 'concussion hit stuns light hostile for >= 1 s');
  assert.ok(concussionLaw.entrySpin > 0, 'concussion hit produces entry spin');

  // Vector Mine centre-hit on Wasp
  const mineLaw = resolveHitstunLaw({
    deltaV: mine.impulsePerHit / WASP_MASS,
    victimCruise: WASP_CRUISE,
    attackerMass: KESTREL_MASS,
    victimMass: WASP_MASS,
  });
  assert.ok(mineLaw.durationS >= 1.0, 'vector mine centre-hit stuns light hostile for >= 1 s');
  assert.ok(mineLaw.entrySpin > 0, 'vector mine centre-hit produces entry spin');

  // Both Concussion and Vector Mine use the exact same universal law
  assert.equal(typeof concussionLaw.durationS, 'number');
  assert.equal(typeof mineLaw.durationS, 'number');
  assert.ok(concussionLaw.durationS <= HITSTUN_LAW.durationMaxS);
  assert.ok(mineLaw.durationS <= HITSTUN_LAW.durationMaxS);
});
