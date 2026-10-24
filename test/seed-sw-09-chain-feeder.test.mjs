// SEED-SW-09 — Chain Feeder: owning the `chain_feeder` swarm_legendary record scales each
// player damage packet by the live kill chain (+1% per point; chain 12 -> x1.12; zero at
// chain 0). The record rides the run's own modifier ledger, the scale resolves in
// swarmChain.js, and weapons.js applies it on the projectile and beam packet seams.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { ownedSwarmLegendaryIds, swarmLegendaryById } from '../src/data/swarmDraft.js';
import {
  swarmChain,
  swarmChainDamageScale,
  SWARM_CHAIN_FEEDER_STEP,
} from '../src/systems/swarmChain.js';

const SEED = 4242;

function feederRun({ legendaryId = 'chain_feeder', phase = 'active' } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  run.phase = phase;
  run.arenaId = 'helios_core';
  run.modifiers = legendaryId
    ? [{ kind: 'swarm_legendary', legendaryId, atWave: 4, price: 95 }]
    : [];
  return run;
}

test('chain_feeder is a catalogued service-counter legendary', () => {
  const row = swarmLegendaryById('chain_feeder');
  assert.ok(row, 'catalog row');
  assert.equal(row.offerId, 'legendary_chain_feeder');
  assert.equal(row.category, 'Service');
  const run = feederRun();
  assert.deepEqual(ownedSwarmLegendaryIds(run), ['chain_feeder']);
});

test('damage scale reads the live chain only while the record is owned', () => {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.run = feederRun();
  assert.equal(swarmChainDamageScale(state), 1, 'chain 0 reads x1');
  swarmChain._chain = 12;
  try {
    const scale = swarmChainDamageScale(state);
    assert.ok(Math.abs(scale - (1 + 12 * SWARM_CHAIN_FEEDER_STEP)) < 1e-9, `chain 12 -> ${scale}`);
    assert.equal(scale, 1.12);
  } finally {
    swarmChain._chain = 0;
  }
});

test('no record, no live run, and ended phases all read x1', () => {
  const state = createGameState(SEED);
  state.mode = 'flight';
  swarmChain._chain = 30;
  try {
    state.run = feederRun({ legendaryId: 'domino' });
    assert.equal(swarmChainDamageScale(state), 1, 'wrong legendary owns nothing here');
    state.run = feederRun({ phase: 'ended' });
    assert.equal(swarmChainDamageScale(state), 1, 'ended run');
    state.run = null;
    assert.equal(swarmChainDamageScale(state), 1, 'no run');
    state.run = feederRun({ legendaryId: null });
    assert.equal(swarmChainDamageScale(state), 1, 'empty ledger');
  } finally {
    swarmChain._chain = 0;
  }
});
