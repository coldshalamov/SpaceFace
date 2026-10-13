// I021 — the results plate already holds the seed. It must also say which rules
// the run was stamped with, in the same row grammar, without the raw stamp ids.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { crucibleSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';
import { resultRows } from '../src/ui/screens/crucible.js';

const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  const bus = createBus();
  runSession.init({ state, bus });
  survivalResults.init({ state, bus });
  return { state, bus };
}

test('a finished seed-4242 run shows the seed and the rules version in plain words', () => {
  const harness = boot();
  try {
    const setup = crucibleSetupFor({ starterId: 'energy_baseline', seed: SEED });
    assert.equal(setup.ok, true);
    assert.equal(requestCrucibleRun(harness.bus, setup.value), true);
    harness.bus.emit('run:beginRequested', { kind: 'survival', seed: SEED, arenaId: 'helios_core' });
    harness.bus.emit('run:transitionRequested', { to: 'arena_intro' });
    harness.bus.emit('run:transitionRequested', { to: 'wave_intro' });
    harness.bus.emit('run:transitionRequested', { to: 'active' });
    harness.state.simTime = 40;
    harness.state.tick = 2400;
    harness.bus.emit('run:waveStarted', { wave: 1 });
    harness.bus.emit('player:death', {
      attacker: 'Corsair Raider',
      weapon: 'autocannon',
      dominantLayer: 'hull',
      direction: 'FRONT',
      simTime: 40,
      tick: 2400,
    });

    const result = survivalResults.lastResult();
    assert.ok(result, 'the run finishes through the results publisher');
    assert.equal(result.seed, SEED);
    assert.equal(result.recordRules && result.recordRules.balanceRevision, 'pq146-threat-2');
    const rows = new Map(resultRows(result));
    assert.equal(rows.get('Seed'), '4242');
    const rules = rows.get('Rules version');
    assert.equal(rules, 'Scoring 2, threat balance 2, dynamic physics 2');
    assert.doesNotMatch(rules, /pq146|rapier|_[a-z]/);
    assert.equal(new Map(resultRows({ seed: SEED })).get('Rules version'), 'Not recorded');
  } finally {
    survivalResults.destroy();
    runSession.destroy();
  }
});
