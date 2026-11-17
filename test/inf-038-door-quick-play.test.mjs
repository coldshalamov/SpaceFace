// INF-038 — seeds and existing challenges survive the ship-first preparation route.
//
// The door copies as well as pastes: doorRunShareCode encodes the pending configuration
// with the same envelope the paste path decodes, so a copied code reproduces the intended
// run. Malformed pastes fail closed with a useful error; no account or service anywhere.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyRunShareCode,
  doorRunShareCode,
} from '../src/ui/screens/shareCode.js';
import { crucibleSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';

const SETUP = {
  starterId: 'physics_toolkit',
  seed: 424242,
  arenaId: 'helios_core',
  ruleset: 'swarm',
};

test('INF-038: a copied door code reproduces the intended configuration', () => {
  const res = doorRunShareCode({
    ...SETUP,
    mutators: ['heavies_only'],
    dailyDateKey: '2026-09-21',
    weeklyMutatorId: 'glass_cannon',
  });
  assert.equal(res.ok, true);
  assert.ok(res.code.startsWith('SFC1-'), 'the existing challenge serialization');
  const applied = applyRunShareCode(res.code);
  assert.equal(applied.ok, true);
  assert.equal(applied.seed, SETUP.seed);
  assert.equal(applied.ruleset, SETUP.ruleset);
  assert.equal(applied.arenaId, SETUP.arenaId);
  assert.equal(applied.starterId, SETUP.starterId);
  assert.deepEqual(applied.mutators, ['heavies_only']);
  assert.equal(applied.dailyDateKey, '2026-09-21');
  assert.equal(applied.weeklyMutatorId, 'glass_cannon');
});

test('INF-038: a configured seed encodes cleanly', () => {
  const res = doorRunShareCode({ ...SETUP, seed: 987654321 });
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

test('INF-038: a shared build retains its difficulty and opens equipment review before combat', () => {
  const copied = doorRunShareCode({ ...SETUP, stake: 'veteran' });
  assert.equal(copied.ok, true);
  const applied = applyRunShareCode(copied.code);
  assert.equal(applied.ok, true);
  assert.equal(applied.stake, 'veteran');
  const setup = crucibleSetupFor({ ...applied, swarmStake: applied.stake });
  assert.equal(setup.ok, true);
  const launch = crucibleLaunchConfig(setup.value, applied.ruleset, { swarmStake: applied.stake });
  assert.equal(launch.survivalSetup.seed, SETUP.seed);
  assert.equal(launch.survivalSetup.hullId, setup.value.hullId);
  assert.deepEqual(launch.survivalSetup.loadout, setup.value.loadout);
  assert.equal(launch.swarmStake, 'veteran');
  assert.notEqual(launch.openArmoryBeforeRound1, false,
    'sharing a configuration must not recreate the removed public quick-play bypass');
});
