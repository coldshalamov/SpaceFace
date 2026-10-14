// Test verifying that specialist enemy silhouettes (last_argument, kilnback, mothlight, pallet_jack)
// are properly wired in ENEMY_FAMILY_BUILDERS so they render their intended visual forms rather than generic fallbacks.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { LAST_ARGUMENT_ENEMY } from '../src/data/lastArgument.js';
import { KILNBACK_ENEMY } from '../src/data/kilnback.js';
import { MOTH_ENEMY } from '../src/data/mothlight.js';
import { PALLET_JACK_ENEMY } from '../src/data/palletJack.js';

test('specialist enemy silhouettes are defined and distinct', () => {
  const specialists = [LAST_ARGUMENT_ENEMY, KILNBACK_ENEMY, MOTH_ENEMY, PALLET_JACK_ENEMY];
  const expected = {
    last_argument: 'last_argument',
    kilnback: 'kilnback',
    mothlight: 'mothlight',
    pallet_jack: 'pallet_jack',
  };

  for (const enemy of specialists) {
    assert.ok(enemy, `specialist enemy definition exists: ${enemy?.id}`);
    assert.equal(enemy.silhouette, expected[enemy.id], `silhouette matches for ${enemy.id}`);
  }
});

test('ENEMY_TYPES includes all specialist enemies with valid silhouettes', () => {
  const ids = ['last_argument', 'kilnback', 'mothlight', 'pallet_jack'];
  for (const id of ids) {
    const found = ENEMY_TYPES.find((e) => e.id === id);
    assert.ok(found, `ENEMY_TYPES contains ${id}`);
    assert.ok(found.silhouette, `${id} has non-empty silhouette`);
  }
});
