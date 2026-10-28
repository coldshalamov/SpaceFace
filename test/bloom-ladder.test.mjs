// W-BLOOM data spine: the ladder catalog is honest, the arena engine reads the shared pathology
// timings instead of restating them, and the tide plan is a pure function of (sector, seq).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BLOOM_AGGRESSION_S,
  BLOOM_CASCADE_RADIUS,
  BLOOM_FILAMENT_FLARE_S,
  BLOOM_GRIEF_RING,
  BLOOM_GRIEF_S,
  BLOOM_LADDER,
  BLOOM_PANIC_KILL_MASS,
  BLOOM_PANIC_REFORM_S,
  BLOOM_PANIC_SCATTER_MAX_S,
  BLOOM_PANIC_SCATTER_MIN_S,
  BLOOM_THRASH_RADIUS,
  BLOOM_THRASH_S,
  BLOOM_THRASH_SWEEP,
  BLOOM_TIDE_SECTORS,
  bloomLadderForBrood,
  bloomLadderIssues,
  bloomTidePlan,
} from '../src/data/bloomLadder.js';
import {
  BROOD_AGGRESSION_S,
  BROOD_CASCADE_RADIUS,
  BROOD_FILAMENT_FLARE_S,
  BROOD_GRIEF_RING,
  BROOD_GRIEF_S,
  BROOD_PANIC_KILL_MASS,
  BROOD_PANIC_REFORM_S,
  BROOD_PANIC_SCATTER_MAX_S,
  BROOD_PANIC_SCATTER_MIN_S,
  SWARM_BROOD_FAMILIES,
  TENDRIL_THRASH_RADIUS,
  TENDRIL_THRASH_S,
  TENDRIL_THRASH_SWEEP,
} from '../src/data/swarmBrood.js';

test('the Bloom ladder catalog passes its own law check', () => {
  assert.deepEqual(bloomLadderIssues(), []);
  assert.equal(BLOOM_LADDER.length, 23);
  const tiers = BLOOM_LADDER.map((row) => row.tier);
  assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b), 'tiers read in nondecreasing order');
});

test('ladder rows have unique ids', () => {
  const ids = BLOOM_LADDER.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('non-hostile rows carry no fight language; hostile rows keep theirs', () => {
  for (const row of BLOOM_LADDER) {
    if (row.kind === 'nonhostile') {
      assert.equal(row.telegraph, '—', `${row.id} telegraph`);
      assert.equal(row.counter, '—', `${row.id} counter`);
    } else if (row.kind !== 'environment') {
      assert.ok(row.telegraph.length >= 4 && row.counter.length >= 8, `${row.id} fight language`);
    }
  }
  assert.ok(BLOOM_LADDER.some((row) => row.id === 'lostcalls' && row.kind === 'nonhostile'));
});

test('every live brood family rides a ladder row', () => {
  for (const family of SWARM_BROOD_FAMILIES) {
    const row = bloomLadderForBrood(family.id);
    assert.ok(row, `${family.id} has a ladder row`);
  }
});

test('swarmBrood timings are the bloomLadder timings, not copies', () => {
  assert.equal(BROOD_FILAMENT_FLARE_S, BLOOM_FILAMENT_FLARE_S);
  assert.equal(BROOD_PANIC_KILL_MASS, BLOOM_PANIC_KILL_MASS);
  assert.equal(BROOD_PANIC_SCATTER_MIN_S, BLOOM_PANIC_SCATTER_MIN_S);
  assert.equal(BROOD_PANIC_SCATTER_MAX_S, BLOOM_PANIC_SCATTER_MAX_S);
  assert.equal(BROOD_PANIC_REFORM_S, BLOOM_PANIC_REFORM_S);
  assert.equal(BROOD_CASCADE_RADIUS, BLOOM_CASCADE_RADIUS);
  assert.equal(BROOD_AGGRESSION_S, BLOOM_AGGRESSION_S);
  assert.equal(BROOD_GRIEF_S, BLOOM_GRIEF_S);
  assert.equal(BROOD_GRIEF_RING, BLOOM_GRIEF_RING);
  assert.equal(TENDRIL_THRASH_S, BLOOM_THRASH_S);
  assert.equal(TENDRIL_THRASH_RADIUS, BLOOM_THRASH_RADIUS);
  assert.equal(TENDRIL_THRASH_SWEEP, BLOOM_THRASH_SWEEP);
});

test('the authored values did not drift when they moved', () => {
  assert.equal(BLOOM_PANIC_KILL_MASS, 90);
  assert.equal(BLOOM_PANIC_SCATTER_MIN_S, 1.5);
  assert.equal(BLOOM_PANIC_SCATTER_MAX_S, 2.5);
  assert.equal(BLOOM_PANIC_REFORM_S, 1.3);
  assert.equal(BLOOM_CASCADE_RADIUS, 220);
  assert.equal(BLOOM_AGGRESSION_S, 4.0);
  assert.equal(BLOOM_GRIEF_S, 5.0);
  assert.equal(BLOOM_GRIEF_RING, 30);
  assert.equal(BLOOM_THRASH_S, 2.2);
  assert.equal(BLOOM_THRASH_RADIUS, 14);
  assert.equal(BLOOM_FILAMENT_FLARE_S, 0.7);
});

test('bloomTidePlan is deterministic per (sector, seq) and differs across sectors', () => {
  const sectors = Object.keys(BLOOM_TIDE_SECTORS);
  assert.ok(sectors.length >= 2);
  const [a, b] = sectors;
  const first = bloomTidePlan(a, { seq: 3 });
  assert.deepEqual(bloomTidePlan(a, { seq: 3 }), first, 'same sector + seq → same plan');
  assert.deepEqual(bloomTidePlan(a, { seq: 3, kills: 0 }), first, 'no kills is the same plan');
  assert.notDeepEqual(bloomTidePlan(b, { seq: 3 }).anchor, first.anchor, 'another sector routes elsewhere');
  assert.notDeepEqual(bloomTidePlan(a, { seq: 4 }).anchor, first.anchor, 'the next tide routes elsewhere');
  // Every named sector yields a distinct first-tide lane.
  const anchors = new Set(sectors.map((id) => JSON.stringify(bloomTidePlan(id, null).anchor)));
  assert.equal(anchors.size, sectors.length);
  // Bloom-clean sectors never field a tide.
  assert.equal(bloomTidePlan('sector_nowhere', null), null);
});
