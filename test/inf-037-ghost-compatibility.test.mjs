// INF-037 — ghost comparisons are honest across rules changes.
//
// A ghost row carries its launch-config stamp; the race offer compares the pending run's
// rules and rejects mismatches with the differing fields named. Same seed alone never
// implies the same run, and a rejection never touches the stored personal best.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STUNT_RULE_REVISIONS } from '../src/combat/stuntRunRules.js';
import {
  ghostComparability,
  ghostRaceOffer,
  resetCrucibleMetaForTests,
  sampleGhostPose,
  beginGhostRecording,
  settleCrucibleRun,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';

const SEED = 37010;
const HULL = 'ship_kestrel';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function loadoutRules(mutators = [], starter = 'starter_kestrel') {
  return JSON.stringify({ ruleset: 'swarm', mutators, starter });
}

function fullRules(overrides = {}) {
  return {
    mode: 'swarm',
    arenaId: 'helios_core',
    ...STUNT_RULE_REVISIONS,
    difficulty: 'authored',
    loadoutRules: loadoutRules(),
    simulationAssistProfile: 'cinematic',
    ...overrides,
  };
}

function recordTape() {
  beginGhostRecording({ seed: SEED, hullId: HULL });
  sampleGhostPose({ tick: 0, x: 0, z: 0, r: 0, seed: SEED, hullId: HULL });
  sampleGhostPose({ tick: 6, x: 6, z: 0, r: 0.5, seed: SEED, hullId: HULL });
}

function settleWithRules(storage, recordRules) {
  recordTape();
  return settleCrucibleRun({
    result: {
      outcome: 'defeat', seed: SEED, arenaId: 'helios_core', wave: 4, deepestWave: 4,
      wavesCleared: 4, kills: 8, score: 900, credits: 0, xp: 0, picks: [], recordRules,
    },
    run: { kind: 'survival', seed: SEED, arenaId: 'helios_core', ruleset: 'swarm' },
    storage,
  });
}

function settledProfile() {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => '2026-09-08T12:00:00.000Z');
  useCrucibleMetaStorage(storage);
  const settled = settleWithRules(storage, fullRules());
  return { settled, storage };
}

test('INF-037: identical configuration races with the compatibility named', () => {
  const { settled } = settledProfile();
  const row = Object.values(settled.profile.ghosts.byHash)[0];
  assert.ok(row.recordRules, 'the stamp travels with the tape');
  assert.equal(row.recordRules.mode, 'swarm');
  const offer = ghostRaceOffer(settled.profile, SEED, fullRules());
  assert.equal(offer.available, true);
  assert.equal(offer.comparability, 'compatible');
  assert.match(offer.blurb, /Same rules, same arena, same assists/);
});

test('INF-037: a different arena, assists, or build is rejected with the field named', () => {
  const { settled } = settledProfile();
  const arena = ghostRaceOffer(settled.profile, SEED, fullRules({ arenaId: 'other_arena' }));
  assert.equal(arena.available, false);
  assert.equal(arena.comparability, 'incompatible');
  assert.match(arena.blurb, /arena/);
  assert.match(arena.blurb, /Same seed, different run/);

  const assists = ghostRaceOffer(settled.profile, SEED, fullRules({ simulationAssistProfile: 'flow' }));
  assert.equal(assists.available, false);
  assert.match(assists.blurb, /assists/);

  const build = ghostRaceOffer(settled.profile, SEED, fullRules({ loadoutRules: loadoutRules([], 'starter_other') }));
  assert.equal(build.available, false);
  assert.match(build.blurb, /build/);

  const physics = ghostRaceOffer(settled.profile, SEED,
    fullRules({ physicsRevision: 'rapier-dynamic-pq146-99' }));
  assert.equal(physics.available, false);
  assert.match(physics.blurb, /physics rules/);

  // The rejection contaminates nothing: the stored row is untouched.
  const row = Object.values(settled.profile.ghosts.byHash)[0];
  assert.equal(row.seed, SEED);
  assert.ok(Array.isArray(row.frames) && row.frames.length > 0);
});

test('INF-037: mutator order is not a different build', () => {
  assert.equal(ghostComparability(
    fullRules({ loadoutRules: loadoutRules(['a', 'b']) }),
    fullRules({ loadoutRules: loadoutRules(['b', 'a']) }),
  ).status, 'compatible');
  assert.equal(ghostComparability(
    fullRules({ loadoutRules: loadoutRules(['a']) }),
    fullRules({ loadoutRules: loadoutRules(['a', 'b']) }),
  ).status, 'incompatible');
});

test('INF-037: rows that predate the stamp are unknown, never rejected on a guess', () => {
  const { settled } = settledProfile();
  const profile = {
    ...settled.profile,
    ghosts: {
      ...settled.profile.ghosts,
      byHash: Object.fromEntries(Object.entries(settled.profile.ghosts.byHash)
        .map(([hash, row]) => [hash, { ...row, recordRules: null }])),
    },
  };
  const offer = ghostRaceOffer(profile, SEED, fullRules());
  assert.equal(offer.available, true, 'an old ghost still races');
  assert.equal(offer.comparability, 'unknown');
  assert.match(offer.blurb, /comparability unknown/);
});

test('INF-037: callers without pending rules keep the old behavior', () => {
  const { settled } = settledProfile();
  const offer = ghostRaceOffer(settled.profile, SEED);
  assert.equal(offer.available, true);
  assert.equal(offer.comparability, 'unknown');
  assert.equal(ghostRaceOffer(settled.profile, 424242).available, false);
  assert.equal(ghostRaceOffer(settled.profile, 424242).comparability, 'none');
});
