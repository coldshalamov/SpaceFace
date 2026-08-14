import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashOwnerKey,
  isActiveOwner,
  nextRunTick,
  ownerPhase,
  shouldOwnerThink,
  shouldRunOnTick,
} from '../src/core/activityScheduler.js';

test('period 1 always runs and phases are deterministic', () => {
  for (let tick = 0; tick < 24; tick++) {
    assert.equal(shouldRunOnTick(tick, 'traffic:planner', 1), true);
  }
  const phase = ownerPhase('traffic:planner', 4);
  assert.ok(phase >= 0 && phase < 4);
  assert.equal(ownerPhase('traffic:planner', 4), phase);
  assert.equal(hashOwnerKey('a'), hashOwnerKey('a'));
  assert.notEqual(hashOwnerKey('a'), hashOwnerKey('b'));
});

test('quantized owners fire exactly once per period on their phase', () => {
  const hits = [];
  for (let tick = 0; tick < 16; tick++) {
    if (shouldRunOnTick(tick, 'story:remote', 4)) hits.push(tick);
  }
  assert.equal(hits.length, 4);
  const spacing = hits.slice(1).map((tick, i) => tick - hits[i]);
  assert.deepEqual(spacing, [4, 4, 4]);
  assert.equal(nextRunTick(hits[0], 'story:remote', 4), hits[0]);
  assert.equal(nextRunTick(hits[0] + 1, 'story:remote', 4), hits[1]);
});

test('combatants and the player stay awake; far passive traffic may sleep', () => {
  const player = { id: 'p', isPlayer: true, pos: { x: 0, z: 0 } };
  const foe = { id: 'e', team: 1, ai: { combatant: true, passive: false }, pos: { x: 400, z: 0 } };
  const hauler = { id: 'h', team: 2, ai: { passive: true }, pos: { x: 400, z: 0 } };
  const opts = { playerId: 'p', playerTeam: 0, origin: { x: 0, z: 0 }, authorityRadius: 120 };
  assert.equal(isActiveOwner(player, opts), true);
  assert.equal(isActiveOwner(foe, opts), true);
  assert.equal(isActiveOwner(hauler, opts), false);
  assert.equal(shouldOwnerThink(0, foe, { ...opts, activePeriodTicks: 1 }), true);
  const sleepHits = [];
  for (let tick = 0; tick < 16; tick++) {
    if (shouldOwnerThink(tick, hauler, { ...opts, sleepPeriodTicks: 8 })) sleepHits.push(tick);
  }
  assert.ok(sleepHits.length >= 1 && sleepHits.length <= 3);
});
