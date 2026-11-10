/**
 * INFERENCE WF-05 — Small Concussion Cannon (wpn_concussion_cannon_s).
 *
 * Proves:
 * 1. Concussion Cannon S declares distinct physics-first identity for small hardpoints.
 * 2. High impulse-to-damage ratio: trades raw damage for massive directional momentum.
 * 3. Mass-scaled response: punches light hulls (Wasp mass 16) into high-velocity tumble
 *    while heavy hulls (mass 150) shrug the shove.
 * 4. Impulse kernel integration: resolveWeaponImpulseForHit extracts magnitude, tumble, and provenance.
 * 5. Presentation resolution: resolves to concussion family and concussion-slug variant.
 * 6. Tech and outfitting integration: unlocks in tech_kinetic_drivers and equips in S slots.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { TECH_NODES } from '../src/data/tech.js';
import { resolveWeaponImpulseForHit } from '../src/combat/impulseKernel.js';
import { resolveWeaponPresentationFamily } from '../src/render/vfxProfiles.js';
import { SANDBOX_PHYSICS_LOADOUTS } from '../src/ui/sandbox/sandboxSetup.js';

const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

test('wpn_concussion_cannon_s declares distinct S-slot physical identity', () => {
  const wpn = WEAPON_BY_ID.get('wpn_concussion_cannon_s');
  assert.ok(wpn, 'wpn_concussion_cannon_s must be defined in WEAPONS');
  assert.equal(wpn.slotType, 'weapon');
  assert.equal(wpn.size, 'S', 'Must fit small (S) hardpoints for light hulls');
  assert.equal(wpn.tier, 1);
  assert.ok(wpn.mass > 0 && wpn.mass <= 4, 'Reasonable light mass');
  assert.ok(wpn.price > 0, 'Acquirable via outfitting');
  assert.equal(wpn.damageType, 'kinetic');
  assert.equal(wpn.impulseProvenance, 'concussion_slug_s');
  assert.ok(wpn.impulsePerHit >= 500, 'Requires substantial impulsePerHit');
  assert.ok(wpn.tumbleTorque >= 30, 'Requires substantial tumbleTorque');
});

test('concussion cannon S trades damage for momentum (physics-first)', () => {
  const concussionS = WEAPON_BY_ID.get('wpn_concussion_cannon_s');
  const autocannonS = WEAPON_BY_ID.get('wpn_autocannon_s');
  const pulseLaserS = WEAPON_BY_ID.get('wpn_pulse_laser_s');

  // Low damage compared to standard weapons
  assert.ok(concussionS.dmg < autocannonS.dmg, 'Lower single-hit damage than autocannon');
  assert.ok(concussionS.dps < pulseLaserS.dps * 0.25, 'DPS is a fraction of DPS weapons');

  // Shove per damage is massive
  const concussionShoveRatio = concussionS.impulsePerHit / concussionS.dmg;
  const autocannonShoveRatio = autocannonS.impulsePerHit / autocannonS.dmg;
  assert.ok(concussionShoveRatio > 80, 'Over 80 impulse per point of damage');
  assert.ok(concussionShoveRatio > autocannonShoveRatio * 20, 'Vastly out-shoves autocannon per damage point');
});

test('mass response: throws light hulls, heavy hulls resist', () => {
  const concussionS = WEAPON_BY_ID.get('wpn_concussion_cannon_s');
  const waspMass = 16;
  const heavyMass = 150;

  const waspDeltaV = concussionS.impulsePerHit / waspMass;
  const heavyDeltaV = concussionS.impulsePerHit / heavyMass;

  // Wasp receives ~32.5 WU/s (over 30% of governed combat speed, well above tumble threshold of 18)
  assert.ok(waspDeltaV > 30, `Wasp delta-V is ${waspDeltaV.toFixed(1)} WU/s (significant shove)`);
  assert.ok(waspDeltaV > 18, 'Exceeds tumbleDeltaV hitstun threshold');

  // Heavy receives only ~3.47 WU/s
  assert.ok(heavyDeltaV < 5, `Heavy delta-V is ${heavyDeltaV.toFixed(1)} WU/s (shrugs shove)`);
});

test('resolveWeaponImpulseForHit extracts correct physical impulse record', () => {
  const concussionS = WEAPON_BY_ID.get('wpn_concussion_cannon_s');
  const impulseRecord = resolveWeaponImpulseForHit(concussionS, concussionS.dmg);

  assert.ok(impulseRecord);
  assert.equal(impulseRecord.magnitude, concussionS.impulsePerHit);
  assert.equal(impulseRecord.tumbleTorque, concussionS.tumbleTorque);
  assert.equal(impulseRecord.provenance, 'concussion_slug_s');
});

test('presentation family resolves to concussion VFX and audio', () => {
  const presentation = resolveWeaponPresentationFamily('wpn_concussion_cannon_s');
  assert.equal(presentation.family, 'concussion');
  assert.equal(presentation.variant, 'concussion-slug');
});

test('tech and outfitting integration: unlocks and sandbox availability', () => {
  const kineticTech = TECH_NODES.find((t) => t.id === 'tech_kinetic_drivers');
  assert.ok(kineticTech, 'tech_kinetic_drivers exists');
  assert.ok(
    kineticTech.unlocks.modules.includes('wpn_concussion_cannon_s'),
    'wpn_concussion_cannon_s is unlocked by tech_kinetic_drivers',
  );

  const sandboxLoadout = SANDBOX_PHYSICS_LOADOUTS.find((l) => l.id === 'light_impulse');
  assert.ok(sandboxLoadout, 'light_impulse sandbox loadout exists');
  assert.ok(sandboxLoadout.itemIds.includes('wpn_concussion_cannon_s'));
});
