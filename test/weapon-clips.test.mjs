import test from 'node:test';
import assert from 'node:assert/strict';
import { weaponClipUrl, WEAPON_CLIP_MANIFEST } from '../src/ui/weaponClips.js';

test('armory media requests are admitted only by the shipped clip manifest', () => {
  for (const defId of ['wpn_autocannon_s', 'mod_shield_booster_s', 'wpn_pulse_laser_s']) {
    assert.equal(weaponClipUrl(defId), null, `${defId} has no shipped recording`);
  }
  for (const [defId, file] of Object.entries(WEAPON_CLIP_MANIFEST)) {
    assert.equal(typeof file, 'string');
    assert.match(weaponClipUrl(defId), new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  }
});

test('invalid fitting ids never become media URLs', () => {
  for (const defId of [null, '', 'wpn/escape', '../clip', 'wpn bad']) {
    assert.equal(weaponClipUrl(defId), null);
  }
});
