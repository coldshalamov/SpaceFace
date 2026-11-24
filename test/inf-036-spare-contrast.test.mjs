// INF-036 — one refit choice explains a new tactic.
//
// Weapon spares for the same empty hardpoint are contrasted on the two authored axes
// combat actually pays — sustained fire (dps) and shove (impulsePerHit). The picker is
// untouched; the contrast only advises. The advertised numbers are the defs' own, and the
// damage order holds in the compiled encounter spec.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { describeAttackMetrics } from '../src/combat/attackSpec.js';
import { createRunState } from '../src/core/runState.js';
import { compileFittedAttackSpec } from '../src/systems/adventureMigration.js';
import { plainWeaponComparison, refitRowLines, weaponSpareContrast } from '../src/ui/screens/crucibleDraft.js';
import { arsenalIdentity } from '../src/data/arsenalIdentity.js';

const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def && def.id, def]));
const PULSE = WEAPON_BY_ID.get('wpn_pulse_laser_s');
const PULSE_M = WEAPON_BY_ID.get('wpn_pulse_laser_m');
const AUTO = WEAPON_BY_ID.get('wpn_autocannon_s');
const RAILGUN = WEAPON_BY_ID.get('wpn_railgun_m');
const PLASMA = WEAPON_BY_ID.get('wpn_plasma_cannon_m');

function spare(def, instanceId) {
  return { instanceId, defId: def.id, name: def.name };
}

function fitWith(weaponId) {
  return { id: 1, data: { defId: 'ship_kestrel', fittings: [weaponId, null, null, null, null, null] } };
}

function compiledDamage(weaponId) {
  const state = { run: createRunState({ kind: 'adventure' }) };
  const result = compileFittedAttackSpec(state, fitWith(weaponId), weaponId);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return describeAttackMetrics(result.spec).payloadTotal;
}

test('INF-036: split leaders read as hitting versus pushing, with the defs’ numbers', () => {
  // The plain comparison the packet asked for — 'hits hardest', 'pushes hardest' — no dps/impulse jargon.
  const text = weaponSpareContrast([spare(PLASMA, 1), spare(RAILGUN, 2)]);
  assert.match(text, /Plasma.*hits hardest \(fire 102\)/);
  assert.match(text, /Railgun.*pushes hardest \(impact 168\)/);
  assert.doesNotMatch(text, /range|homing|heat|dps|impulse/i, 'no capability beyond the two axes, no jargon');
});

test('INF-036: one spare leading both says so plainly', () => {
  // Pulse Laser M leads Pulse Laser S on both axes since the ROW 482 pulse rebalance.
  const text = weaponSpareContrast([spare(PULSE_M, 1), spare(PULSE, 2)]);
  assert.match(text, /Pulse Laser M hits hardest \(fire 72\) and pushes hardest \(impact 126\)/);
});

test('INF-036: no comparison where there is none', () => {
  assert.equal(weaponSpareContrast([spare(PULSE, 1)]), null, 'a lone spare is not a comparison');
  assert.equal(weaponSpareContrast([spare(PULSE, 1), spare(PULSE, 2)]), null, 'identical twins differ in nothing');
  assert.equal(weaponSpareContrast([{ instanceId: 1, defId: 'mod_unknown', name: 'Mystery' }, spare(PULSE, 2)]), null);
  assert.equal(weaponSpareContrast(null), null);
  const fitted = refitRowLines({ slotIndex: 0, defId: 'wpn_pulse_laser_s', name: 'Pulse', spares: [] });
  assert.equal(fitted.contrast, null, 'a fitted part is not a spare comparison');
  assert.equal(fitted.description, arsenalIdentity('wpn_pulse_laser_s').sentence,
    'fitted rows still carry the arsenalIdentity sentence');
});

test('INF-036: option labels carry the figures in plain words, mod spares stay bare', () => {
  const lines = refitRowLines({ slotIndex: 0, defId: null, name: null, spares: [spare(PULSE, 1), spare(AUTO, 2)] });
  assert.match(lines.options[0].label, /fire 55/);
  assert.match(lines.options[0].label, /impact 84/);
  assert.match(lines.options[1].label, /fire 31/);
  assert.ok(lines.contrast && lines.contrast.length > 0, 'the row carries the contrast');
  const modLines = refitRowLines({
    slotIndex: 1, defId: null, name: null,
    spares: [{ instanceId: 9, defId: 'mod_twin_mount', name: 'Twin Mount' }],
  });
  assert.equal(modLines.options[0].label, 'Twin Mount');
  assert.equal(modLines.contrast, null, 'the one comparison is weapons-only');
});

test('INF-036: the advertised damage difference appears in the compiled encounter spec', () => {
  // Per-shot damage in the live spec follows the defs' own dmg in the same slot: the screen
  // advertises the same figures combat will fire.
  const defOrder = Math.sign(AUTO.dmg - PULSE.dmg);
  const specOrder = Math.sign(compiledDamage(AUTO.id) - compiledDamage(PULSE.id));
  assert.equal(specOrder, defOrder, 'the encounter spec keeps the defs’ damage order');
  assert.ok(compiledDamage(PULSE.id) > 0 && compiledDamage(AUTO.id) > 0);
});

test('plainWeaponComparison speaks trade-offs in plain words with zero jargon', () => {
  const vsSibling = plainWeaponComparison(PLASMA.id, [spare(PLASMA, 1), spare(RAILGUN, 2)], []);
  assert.ok(vsSibling, 'compares against the sibling spare');
  assert.equal(vsSibling.sentence, `Hits harder, pushes less than ${RAILGUN.name}.`);
  assert.doesNotMatch(vsSibling.sentence, /dps|impulse/i);

  const vsFitted = plainWeaponComparison(AUTO.id, [spare(AUTO, 1)], [{ defId: 'wpn_bank_stream_m', name: 'Bank Stream M' }]);
  assert.ok(vsFitted, 'falls back to comparing a lone weapon spare against the ship’s fitted gun');
  assert.equal(vsFitted.sentence, 'Hits softer, pushes harder than Bank Stream M.');
  assert.doesNotMatch(vsFitted.sentence, /dps|impulse/i);
});
