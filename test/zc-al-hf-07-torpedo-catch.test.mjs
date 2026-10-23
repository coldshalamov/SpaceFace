// AL-HF-07 — the Massline can catch a capital torpedo and throw it; the catch never defuses it.
//
// The admission path is the published eligibility flag: a wpn_torpedo_l missile spawns with
// data.masslineTetherable, which isAttachable's explicit-flag branch already honours, so the
// constraint layer (type-agnostic, verified by source slice) can hold and throw the body. The
// fuse is the projectile's own ttl + armed splash — nothing on the tether side reads or writes
// it, which the slices below pin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isAttachable, acquisitionDenialReason } from '../src/systems/tetherGameplay.js';

const WEAPONS_SRC = readFileSync(new URL('../src/systems/weapons.js', import.meta.url), 'utf8');
const TETHER_SRC = readFileSync(new URL('../src/systems/tetherGameplay.js', import.meta.url), 'utf8');

function projectileEntity(data) {
  return { id: 7, type: 'projectile', alive: true, pos: { x: 10, z: 0 }, radius: 0.8, collides: true, data };
}

const torpedoData = () => ({
  kind: 'missile', weaponId: 'wpn_torpedo_l', armed: true, ttl: 12,
  damagePacket: { channels: {}, statuses: [] }, splashRadius: 30, masslineTetherable: true,
});
const otherMissileData = () => ({ kind: 'missile', weaponId: 'wpn_missile_rack_m', armed: true, ttl: 9 });

test('a caught torpedo stays attachable — the flag admits the transient body', () => {
  assert.equal(isAttachable(projectileEntity(torpedoData()), 1, null), true,
    'the L torpedo must be a lawful Massline target');
  assert.equal(acquisitionDenialReason(projectileEntity(torpedoData()), 1), 'target-lost',
    'an eligible body reaches the range/geometry checks, not the class denial');
});

test('every other projectile class is refused exactly as before', () => {
  assert.equal(isAttachable(projectileEntity(otherMissileData()), 1, null), false,
    'a rack missile stays untetherable');
  assert.equal(isAttachable(projectileEntity({ kind: 'bullet', weaponId: 'wpn_pulse_s' }), 1, null), false,
    'a bullet stays untetherable');
  assert.equal(acquisitionDenialReason(projectileEntity(otherMissileData()), 1), 'not-tetherable');
});

test('the exception is authored at the one spawn site, for the L torpedo only', () => {
  const spawn = WEAPONS_SRC.slice(WEAPONS_SRC.indexOf('_spawnProjectile(e, w, def, dir, tgt, isMissile'),
    WEAPONS_SRC.indexOf('reserveProjectileCapacity(state, 1);'));
  assert.match(spawn, /wpn_torpedo_l/, 'the torpedo tag must be authored in the missile spawn block');
  const flagged = WEAPONS_SRC.match(/masslineTetherable = true/g) || [];
  assert.equal(flagged.length, 1, 'no other spawn path mints the eligibility flag');
});

test('the catch never defuses the body — the tether side reads no projectile lifecycle field', () => {
  // The fuse is data.ttl + data.armed; the warhead is damagePacket. None may be written by the
  // massline admission/constraint path (the constraint layer is type-agnostic by design).
  for (const needle of ['data.ttl', 'data.armed', 'damagePacket']) {
    assert.equal(TETHER_SRC.includes(needle), false, `tetherGameplay must not touch ${needle}`);
  }
  assert.match(TETHER_SRC, /TRANSIENT_NON_TETHERABLE_TYPES = new Set\(\['projectile', 'fx'\]\)/,
    'the transient gate stays for every unflagged projectile');
  assert.match(TETHER_SRC, /explicitlyTetherable && TRANSIENT_NON_TETHERABLE_TYPES/,
    'the explicit-flag branch is what admits the flagged body');
});
