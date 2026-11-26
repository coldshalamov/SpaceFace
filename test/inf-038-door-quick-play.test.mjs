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

test('the Easy bare-Hornet SFC1 v1 code still means the legacy funded opening', () => {
  const literal = 'SFC1-eyJhIjoiaGVsaW9zX2NvcmUiLCJnIjowLCJoIjoic2hpcF9ob3JuZXQiLCJrIjoiaHVsbDpzaGlwX2hvcm5ldCIsInIiOiJzd2FybSIsInMiOjQyNDIsInQiOiJleGhpYml0aW9uIiwidiI6MX0-9afcb9b4';
  const written = doorRunShareCode({ ...QUICK, seed: 4242, starterId: 'hull:ship_hornet', stake: 'exhibition' });
  assert.equal(written.code, literal);
  const applied = applyRunShareCode(literal);
  assert.equal(applied.ok, true);
  assert.equal(applied.starterId, 'hull:ship_hornet');
  assert.equal(applied.stake, 'exhibition');
  assert.equal(applied.ghostHash, 0);
  assert.equal(applied.zeroScrapOpening, undefined);
});

test('an ordinary opening code keeps the exact bare hull and effective choices', () => {
  const written = doorRunShareCode({ ...QUICK, starterId: 'hull:ship_kestrel', stake: 'contender',
    zeroScrapOpening: true, swarmThreats: ['fast_lane', 'thick_pack'], openingLesson: true });
  assert.equal(written.ok, true);
  const applied = applyRunShareCode(written.code);
  assert.equal(applied.zeroScrapOpening, true);
  assert.equal(applied.starterId, 'hull:ship_kestrel');
  assert.equal(applied.hullId, 'ship_kestrel');
  assert.equal(applied.stake, 'contender');
  assert.deepEqual(applied.loadout, []);
  assert.deepEqual(applied.swarmThreats, ['fast_lane', 'thick_pack']);
  assert.equal(applied.openingLesson, true);
  assert.equal(applied.ghostHash, null);
});

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

test('INF-038: the door carries Copy code and the daily identity', () => {
  assert.match(DOOR_SOURCE, /Copy code/, 'the share-code action goes both ways');
  assert.match(DOOR_SOURCE, /Today's challenge/, 'the daily challenge names its date and seed');
});
