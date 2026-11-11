// G17-01 — the `?swarmRound=N` developer route's start request. swarmStartAtRound turns a
// requested round into the run's starting state (round index + purse): it clamps to the
// ladder's authored 1..30 and pays the same checkpoint purse a player-earned mid-ladder
// start would carry into the opening armory.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SWARM_START_ROUND_MIN,
  SWARM_START_ROUND_MAX,
  swarmStartAtRound,
  swarmCheckpointPurseFor,
  swarmZoneIndexFor,
} from '../src/data/swarmLadder.js';

test('returns N for every in-range round', () => {
  for (let n = SWARM_START_ROUND_MIN; n <= SWARM_START_ROUND_MAX; n += 1) {
    assert.equal(swarmStartAtRound(n).startWave, n);
    assert.equal(swarmStartAtRound(String(n)).startWave, n);
  }
});

test('clamps out-of-range input to 1..30', () => {
  assert.equal(swarmStartAtRound(0).startWave, 1);
  assert.equal(swarmStartAtRound(-7).startWave, 1);
  assert.equal(swarmStartAtRound(31).startWave, 30);
  assert.equal(swarmStartAtRound(999).startWave, 30);
});

test('non-numeric input falls back to the ordinary opening', () => {
  for (const bad of [undefined, null, NaN, 'abc', 'Infinity']) {
    assert.equal(swarmStartAtRound(bad).startWave, 1, String(bad));
  }
  assert.equal(swarmStartAtRound('').startWave, 1);
});

test('fractional input truncates before clamping', () => {
  assert.equal(swarmStartAtRound(20.9).startWave, 20);
  assert.equal(swarmStartAtRound('4.2').startWave, 4);
});

test('purse is the checkpoint purse a real mid-ladder start pays', () => {
  for (let n = SWARM_START_ROUND_MIN; n <= SWARM_START_ROUND_MAX; n += 1) {
    assert.equal(
      swarmStartAtRound(n).purse,
      swarmCheckpointPurseFor(swarmZoneIndexFor(n)),
      `round ${n}`,
    );
  }
  // Round 20 sits in zone 2's purse band; round 1-10 carry no checkpoint purse.
  assert.equal(swarmStartAtRound(20).purse, 800);
  assert.equal(swarmStartAtRound(1).purse, 0);
});
