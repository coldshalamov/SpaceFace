// INF-038 — seeds and existing challenges at the front door.
//
// The door copies as well as pastes: doorRunShareCode encodes the pending configuration
// with the same envelope the paste path decodes, so a copied code reproduces the intended
// run. Malformed pastes fail closed with a useful error; no account or service anywhere.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  applyRunShareCode,
  doorRunShareCode,
} from '../src/ui/screens/shareCode.js';

const DOOR_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/ui/screens/crucible.js', import.meta.url)),
  'utf8',
);

const QUICK = {
  starterId: 'physics_toolkit',
  seed: 424242,
  arenaId: 'helios_core',
  ruleset: 'swarm',
};

test('INF-038: a copied door code reproduces the intended configuration', () => {
  const res = doorRunShareCode({
    ...QUICK,
    mutators: ['heavies_only'],
    dailyDateKey: '2026-09-21',
    weeklyMutatorId: 'glass_cannon',
  });
  assert.equal(res.ok, true);
  assert.ok(res.code.startsWith('SFC1-'), 'the existing challenge serialization');
  const applied = applyRunShareCode(res.code);
  assert.equal(applied.ok, true);
  assert.equal(applied.seed, QUICK.seed);
  assert.equal(applied.ruleset, QUICK.ruleset);
  assert.equal(applied.arenaId, QUICK.arenaId);
  assert.equal(applied.starterId, QUICK.starterId);
  assert.deepEqual(applied.mutators, ['heavies_only']);
  assert.equal(applied.dailyDateKey, '2026-09-21');
  assert.equal(applied.weeklyMutatorId, 'glass_cannon');
});

test('INF-038: a quick-play-shaped setup encodes cleanly', () => {
  const res = doorRunShareCode({ ...QUICK, seed: 987654321 });
  assert.equal(res.ok, true);
  const applied = applyRunShareCode(res.code);
  assert.equal(applied.ok, true);
  assert.equal(applied.ruleset, 'swarm');
  assert.equal(applied.seed, 987654321);
});

test('INF-038: malformed pastes fail closed with a useful error', () => {
  for (const bad of ['not a code', '', 'SFC1-broken']) {
    const res = applyRunShareCode(bad);
    assert.equal(res.ok, false);
    assert.ok(typeof res.error === 'string' && res.error.length > 0, 'the door has words for it');
  }
});

test('INF-038: the door carries Quick play, Copy code, and the daily identity', () => {
  assert.match(DOOR_SOURCE, /Quick play/, 'Quick play stands on the door');
  assert.match(DOOR_SOURCE, /Copy code/, 'the share-code action goes both ways');
  assert.match(DOOR_SOURCE, /Today's challenge/, 'the daily challenge names its date and seed');
});
