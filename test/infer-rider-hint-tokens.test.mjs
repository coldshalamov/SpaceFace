// Total-fix rider (spotted during INFERENCE swarm-as-toybox): scissorwake's
// counterHint token had no prose mapping, so its debut taught nothing.
// Every snake_case token must map — an unmapped token prints nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { hintTextFor } from '../src/systems/survivalAnnounce.js';

test('scissorwake teaches its counter', () => {
  assert.equal(
    hintTextFor('scissorwake'),
    'Scissorwake: Opens a fixed crossing. Move off the line, or throw the cutter off it.',
  );
});

test('every snake_case counterHint token maps to prose', () => {
  const unmapped = [];
  for (const def of ENEMY_TYPES) {
    if (typeof def.counterHint !== 'string' || def.counterHint.length === 0) continue;
    if (def.counterHint.includes(' ')) continue;
    if (hintTextFor(def.id) == null) unmapped.push(def.id);
  }
  assert.deepEqual(unmapped, []);
});
