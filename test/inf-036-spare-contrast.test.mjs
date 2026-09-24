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
import { refitRowLines, weaponSpareContrast } from '../src/ui/screens/crucibleDraft.js';

const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def && def.id, def]));
const PULSE = WEAPON_BY_ID.get('wpn_pulse_laser_s');
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

test('INF-036: split leaders read as sustained fire versus shove, with the defs’ numbers', () => {
  const text = weaponSpareContrast([spare(PLASMA, 1), spare(RAILGUN, 2)]);
  assert.match(text, /Most sustained fire: .*Plasma.*102 dps/);
  assert.match(text, /Hardest shove: .*Railgun.*impulse 168/);
  assert.doesNotMatch(text, /range|homing|heat/i, 'no capability beyond the two axes');
});

test('INF-036: one spare leading both says so plainly', () => {
  const text = weaponSpareContrast([spare(PULSE, 1), spare(AUTO, 2)]);
  assert.match(text, /Pulse Laser S leads sustained fire \(44 dps\) and shove \(impulse 84\)/);
});

test('INF-036: no comparison where there is none', () => {
  assert.equal(weaponSpareContrast([spare(PULSE, 1)]), null, 'a lone spare is not a comparison');
  assert.equal(weaponSpareContrast([spare(PULSE, 1), spare(PULSE, 2)]), null, 'identical twins differ in nothing');
  assert.equal(weaponSpareContrast([{ instanceId: 1, defId: 'mod_unknown', name: 'Mystery' }, spare(PULSE, 2)]), null);
  assert.equal(weaponSpareContrast(null), null);
  assert.equal(refitRowLines({ slotIndex: 0, defId: 'wpn_pulse_laser_s', name: 'Pulse', spares: [] }).contrast, null);
});

test('INF-036: option labels carry the figures, mod spares stay bare', () => {
  const lines = refitRowLines({ slotIndex: 0, defId: null, name: null, spares: [spare(PULSE, 1), spare(AUTO, 2)] });
  assert.match(lines.options[0].label, /44 dps/);
  assert.match(lines.options[0].label, /impulse 84/);
  assert.match(lines.options[1].label, /31 dps/);
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
