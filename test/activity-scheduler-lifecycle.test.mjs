import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerPhase, takeNearWorkSlice } from '../src/core/activityScheduler.js';

test('retiring many owners does not change a returning actor scheduling phase', () => {
  const phase = ownerPhase('returning-actor', 30);
  for (let id = 0; id < 10000; id++) ownerPhase(`retired:${id}`, 8);
  assert.equal(ownerPhase('returning-actor', 30), phase);
});

test('reused scheduling scratch preserves returned actors and resumes in stable order', () => {
  const state = {};
  const actors = [5, 1, 4, 2, 3].map(id => ({ id }));
  const first = takeNearWorkSlice(state, 'traffic', actors, actor => actor.id, 2);
  assert.deepEqual(first.map(actor => actor.id), [1, 2]);
  const next = takeNearWorkSlice(state, 'traffic', actors, actor => actor.id, 2);
  assert.deepEqual(next.map(actor => actor.id), [3, 4]);
  assert.equal(first[0], actors[1], 'later work must not mutate a previously returned slice');
});
