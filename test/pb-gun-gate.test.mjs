// Row 291 PB-GUN-GATE. Seed 4242. A refused weapon tag names the status that
// blocked it. Overheated says cooked. Tumbling says tumbling. A reason with no
// cause keeps the combined line. The kernel prefixes this return with "disabled:".

import test from 'node:test';
import assert from 'node:assert/strict';

import { actionBlockedByCombatant } from '../src/combat/subsystems.js';
import { combatDenialToastSpec } from '../src/ui/toasts.js';

const SEED = 4242;
const WEAPON = { tags: ['weapon'], requiresCapabilities: [] };

function runtime(source) {
  const base = { capabilities: {}, blockedActionTags: ['weapon'], subsystems: {}, statuses: {} };
  if (source === 'status_overheated' || source === 'both') {
    base.statuses.status_overheated = { pending: false, stacks: 1 };
  }
  if (source === 'status_tumbling' || source === 'both') {
    base.statuses.status_tumbling = { pending: false, stacks: 1 };
  }
  if (source === 'subsystem_weapon') {
    base.subsystems.subsystem_weapon = { effectiveDisabled: true };
  }
  return base;
}

test('seed 4242 a refused gun names the gate that fired', () => {
  assert.equal(SEED, 4242);
  const cooked = actionBlockedByCombatant(runtime('status_overheated'), WEAPON);
  assert.equal(cooked, 'tag:weapon:status_overheated');
  const cookedToast = combatDenialToastSpec({ reason: `disabled:${cooked}` });
  assert.equal(cookedToast.text, 'Guns won\'t answer — cooked');
  assert.equal(cookedToast.hint, 'Ease off until heat falls');

  const tumble = actionBlockedByCombatant(runtime('status_tumbling'), WEAPON);
  assert.equal(tumble, 'tag:weapon:status_tumbling');
  const tumbleToast = combatDenialToastSpec({ reason: `disabled:${tumble}` });
  assert.equal(tumbleToast.text, 'Guns won\'t answer — the ship is tumbling');
  assert.equal(tumbleToast.hint, 'Wait until the tumble stops');

  const battery = actionBlockedByCombatant(runtime('subsystem_weapon'), WEAPON);
  assert.equal(battery, 'tag:weapon:subsystem_weapon');
  assert.equal(
    combatDenialToastSpec({ reason: `disabled:${battery}` }).text,
    'Guns won\'t answer — the battery is dark',
  );

  const unnamed = combatDenialToastSpec({ reason: 'disabled:tag:weapon' });
  assert.equal(unnamed.text, 'Guns won\'t answer — out, tumbling, or cooked');

  const both = actionBlockedByCombatant(runtime('both'), WEAPON);
  assert.equal(both, 'tag:weapon:status_overheated');
});
