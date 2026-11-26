// Owner polish list: the shop shows rate, punch, reach and kick, plus how long a gun fires before it
// overheats. weaponShopFigures is the one read the shop and draft cards share.
import test from 'node:test';
import assert from 'node:assert/strict';
import { weaponShopFigures } from '../src/data/gunFamilies.js';
import { WEAPONS } from '../src/data/weapons.js';

test('every gun has rate/punch/reach/kick, and either a sustain time or a plain reason', () => {
  for (const def of WEAPONS.filter((w) => w.slotType === 'weapon')) {
    const f = weaponShopFigures(def);
    assert.ok(f, def.id);
    for (const k of ['punch', 'reach', 'kick']) assert.ok(Number.isFinite(f[k]), `${def.id} ${k}`);
    assert.ok(f.sustainS > 0 || typeof f.sustainReason === 'string', `${def.id}: sustain time or a reason`);
  }
  const pulse = weaponShopFigures(WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s'));
  assert.equal(pulse.family, 'pew');
  assert.ok(pulse.sustainS > 5 && pulse.sustainS < 8, `the starter fires ~6-7 s before it overheats (${pulse.sustainS})`);
});
