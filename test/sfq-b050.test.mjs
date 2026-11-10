import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { hintTextFor } from '../src/systems/survivalAnnounce.js';

// SFQ-B050: Complete counter hints for all 26 roster entries and specialist class audit.

const EXPECTED_SPECIALISTS = [
  'brood_queen',
  'brood_tendril',
  'customs_cutter',
  'field_anchor_controller',
  'forge_regent',
  'kilnback',
  'mine_layer_jackal',
  'mirrorjaw_foreman',
  'mothlight',
  'pallet_jack',
  'pd_screen_escort',
  'scissorwake',
  'tether_control_raider',
  'warden_escort',
];

const EXPECTED_NEW_HINTS = {
  wasp_swarmer: 'Wasp Swarmer: Light enough to throw — catch one on the line and whip it into its packmates.',
  lancer_sniper: 'Lancer Sniper: Watch the charge line, slip the rail shot, and close inside its standoff band.',
  mule_trader: 'Fleeing Trader: Runs for the nearest berth — snare or cut its drive before it clears the lane.',
  reaver_pirate: 'Reaver Pirate: Presses hard and calls swarmers — use its wingmen as ammunition against it.',
  corsair_raider: 'Corsair Raider: Fast ambush fighter — catch it on the line or slam it into belt rock.',
  choir_zealot: 'Choir Zealot: Screens its ward until you breach the ring — pull the zealot off its charge first.',
  pallet_jack: 'Pallet Jack: After your hold, not your hull — break its fork lock or outrun the clamp.',
  last_argument: 'The Last Argument: Break the flank battery banks, cross the locked spine cannon, and use cover between sweeps.',
};

test('SFQ-B050: every entry in the 26-ship roster has valid physicalClass, silhouette, and telegraph', () => {
  assert.equal(ENEMY_TYPES.length, 26, 'roster must contain exactly 26 entries');
  const validClasses = new Set(['ammunition', 'terrain', 'specialist']);
  for (const def of ENEMY_TYPES) {
    assert.ok(validClasses.has(def.physicalClass), `${def.id} must declare valid physicalClass`);
    assert.ok(typeof def.silhouette === 'string' && def.silhouette.length > 0, `${def.id} must have silhouette`);
    assert.ok(def.telegraph && typeof def.telegraph === 'object', `${def.id} must have telegraph object`);
    assert.ok(typeof def.telegraph.bark === 'string', `${def.id} must have telegraph.bark`);
    assert.ok(typeof def.telegraph.line === 'string' && def.telegraph.line.length > 0, `${def.id} must have telegraph.line`);
    assert.ok(typeof def.telegraph.cue === 'string' && def.telegraph.cue.length > 0, `${def.id} must have telegraph.cue`);
  }
});

test('SFQ-B050: the specialist set contains exactly the 14 functional-identity entries', () => {
  const specialists = ENEMY_TYPES.filter((d) => d.physicalClass === 'specialist').map((d) => d.id).sort();
  assert.deepEqual(specialists, EXPECTED_SPECIALISTS);
});

test('SFQ-B050: every roster row produces readable counter hint prose', () => {
  for (const def of ENEMY_TYPES) {
    const hint = hintTextFor(def.id);
    assert.ok(typeof hint === 'string' && hint.length > 0,
      `${def.id} missing counter hint prose (got ${hint})`);
    assert.ok(hint.startsWith(`${def.name}: `),
      `${def.id} hint must start with name prefix '${def.name}: ', got '${hint}'`);
    assert.ok(hint.includes(' '),
      `${def.id} hint must contain human prose, got '${hint}'`);
  }
});

test('SFQ-B050: newly completed counter hints match exact authored prose', () => {
  for (const [id, expectedText] of Object.entries(EXPECTED_NEW_HINTS)) {
    assert.equal(hintTextFor(id), expectedText, `counter hint mismatch for ${id}`);
  }
});

test('SFQ-B050: quiet/negative branch returns null for invalid or missing hints', () => {
  assert.equal(hintTextFor(null), null);
  assert.equal(hintTextFor(undefined), null);
  assert.equal(hintTextFor('non_existent_archetype'), null);
  assert.equal(hintTextFor(''), null);
});
