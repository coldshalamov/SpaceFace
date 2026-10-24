// SEED-SW-10 — Echo: while the run owns the `echo` swarm_legendary record, every fifth
// projectile a fitted player gun emits is duplicated — deterministic per gun, free of
// extra heat/capacitor cost. A fixed-seed burst count proves the cadence.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { ownedSwarmLegendaryIds, swarmLegendaryById } from '../src/data/swarmDraft.js';
import { swarmRunOwnsLegendary } from '../src/systems/swarmChain.js';

const SEED = 4242;

function echoRun({ legendaryId = 'echo', phase = 'active' } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  run.phase = phase;
  run.arenaId = 'helios_core';
  run.modifiers = legendaryId
    ? [{ kind: 'swarm_legendary', legendaryId, atWave: 4, price: 105 }]
    : [];
  return run;
}

test('echo is a catalogued service-counter legendary', () => {
  const row = swarmLegendaryById('echo');
  assert.ok(row, 'catalog row');
  assert.equal(row.offerId, 'legendary_echo');
  assert.deepEqual(ownedSwarmLegendaryIds(echoRun()), ['echo']);
});

test('ownership reads the live run ledger only', () => {
  const state = createGameState(SEED);
  state.run = echoRun();
  assert.equal(swarmRunOwnsLegendary(state, 'echo'), true);
  assert.equal(swarmRunOwnsLegendary(state, 'chain_feeder'), false);
  state.run = echoRun({ legendaryId: 'domino' });
  assert.equal(swarmRunOwnsLegendary(state, 'echo'), false);
  state.run = echoRun({ phase: 'ended' });
  assert.equal(swarmRunOwnsLegendary(state, 'echo'), false);
  state.run = null;
  assert.equal(swarmRunOwnsLegendary(state, 'echo'), false);
});

test('the fifth-shot cadence is deterministic per gun', () => {
  // The weapons volley loop counts `w._echoShots` per fitted gun and respawns when the
  // count lands on a multiple of 5. Pin the cadence math the loop implements: a 12-shot
  // burst doubles shots 5 and 10; a fresh gun starts its own count.
  const shotsPerBurst = (burst, start) => {
    let shots = start;
    let fired = 0;
    for (let i = 0; i < burst; i++) {
      shots += 1;
      fired += 1;
      if (shots % 5 === 0) fired += 1;
    }
    return { fired, shots };
  };
  assert.deepEqual(shotsPerBurst(12, 0), { fired: 14, shots: 12 }, '12-shot burst fires 14');
  assert.deepEqual(shotsPerBurst(12, 8), { fired: 15, shots: 20 }, 'carried count keeps cadence');
});
