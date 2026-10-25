// Standing at a departed hauler's empty berth, the scan says they are gone.
// Seed 4242. A berth outside the 1400 reach is skipped. The gone sentence,
// the 1400 reach, and the memory record stay as they are.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { discoveryPlaceCandidates } from '../src/systems/scanReveal.js';

const GONE = 'The hauler is gone. The berth remains. Their cargo is not yours.';

function remember(state, subjects) {
  state.signalInvestigation = {
    ...(state.signalInvestigation || {}),
    discoveryMemory: { subjects },
  };
}

function departed(id, x, z = 0) {
  return { subjectId: id, pos: { x, z }, entityId: null };
}

function berth(state, origin) {
  const rows = discoveryPlaceCandidates(state, origin, 0, []);
  return rows.find((row) => row && row.sourceId === 'SF-175') || null;
}

test('the nearer empty berth says the hauler is gone when an earlier berth is out of reach', () => {
  const state = createGameState(4242);
  remember(state, {
    'worker:far': departed('worker:far', 4000),
    'worker:near': departed('worker:near', 180),
  });
  const row = berth(state, { x: 180, z: 0 });
  assert.ok(row);
  assert.equal(row.range, 1400);
  assert.equal(row.pos.x, 180);
  assert.equal(row.pos.z, 0);
  assert.equal(row.discovery.parts['SF-175'].fallback, true);
  assert.equal(row.discovery.parts['SF-175'].sentence, GONE);
  assert.equal(row.discovery.parts['SF-175'].pos.x, 180);
});

test('two empty berths inside reach still offer the one remembered first', () => {
  const state = createGameState(4242);
  remember(state, {
    'worker:first': departed('worker:first', 500),
    'worker:second': departed('worker:second', 200),
  });
  const row = berth(state, { x: 200, z: 0 });
  assert.ok(row);
  assert.equal(row.pos.x, 500);
  assert.equal(row.discovery.parts['SF-175'].sentence, GONE);
});

test('a berth past 1400 is not offered, and a berth at 1400 is', () => {
  const past = createGameState(4242);
  remember(past, { 'worker:past': departed('worker:past', 1401) });
  assert.equal(berth(past, { x: 0, z: 0 }), null);

  const edge = createGameState(4242);
  remember(edge, { 'worker:edge': departed('worker:edge', 1400) });
  const row = berth(edge, { x: 0, z: 0 });
  assert.ok(row);
  assert.equal(row.pos.x, 1400);
  assert.equal(row.range, 1400);
  assert.equal(row.discovery.parts['SF-175'].sentence, GONE);
});
