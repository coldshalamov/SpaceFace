// NXI-078: A canceled retry leaves the finished record unchanged
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import {
  buildCrucibleRetryRequest,
  crucibleSetupFor,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import {
  crucibleResultsScreen,
  crucibleScreen,
} from '../src/ui/screens/crucible.js';
import { clearQueuedChallenge, queueSurvivalChallenge } from '../src/systems/survivalMutators.js';
import { fakeDom } from './helpers/fake-dom.mjs';

const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  const bus = createBus();
  const registry = {
    get(name) {
      if (name === 'survivalResults') return survivalResults;
      return null;
    },
  };
  const ctx = { state, bus, registry, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  return { state, bus, registry, ctx };
}

function beginActiveRun(harness, seed = SEED) {
  const setup = crucibleSetupFor({ starterId: 'energy_baseline', seed });
  requestCrucibleRun(harness.bus, setup.value);
  harness.bus.emit('run:beginRequested', { kind: 'survival', seed, arenaId: 'helios_core' });
  harness.bus.emit('run:transitionRequested', { to: 'arena_intro' });
  harness.bus.emit('run:transitionRequested', { to: 'wave_intro' });
  harness.bus.emit('run:transitionRequested', { to: 'active' });
}

test('NXI-078: open retry, cancel, reopen results leaves the finished attempt complete and identical', () => {
  const dom = fakeDom();
  const prevDoc = globalThis.document;
  globalThis.document = dom;

  try {
    const harness = boot();
    beginActiveRun(harness);

    // Advance simTime and tick
    harness.state.simTime = 120.5;
    harness.state.tick = 7230;

    // Player death ends the run
    harness.bus.emit('combat:damage', { targetId: 1, attackerId: 9, applied: 50, type: 'kinetic' });
    harness.bus.emit('player:death', {
      attacker: 'Corsair Raider',
      weapon: 'autocannon',
      dominantLayer: 'hull',
      direction: 'FRONT',
      simTime: 120.5,
      tick: 7230,
    });

    const firstResult = survivalResults.lastResult();
    assert.ok(firstResult, 'finished run produced a result');
    const firstRev = survivalResults.resultRevision();
    const initialEndedAt = { ...firstResult.endedAt };

    // Step 1: Open retry navigation (preview challenge terms, mount door screen)
    const retry = buildCrucibleRetryRequest();
    assert.ok(retry, 'retry request constructed from finished run');
    queueSurvivalChallenge({
      seed: retry.setup.seed,
      ruleset: retry.ruleset,
      mutators: [],
    });

    const doorEl = dom._make('div');
    crucibleScreen.mount(doorEl, harness.ctx);

    // Advance time during preview
    harness.state.simTime = 135.0;
    harness.state.tick = 8100;

    // Step 2: Cancel retry navigation (clear queued challenge, pop back)
    clearQueuedChallenge();
    crucibleScreen.onHide();

    // Step 3: Reopen results plate (mount and refresh crucibleResultsScreen)
    const resultsEl = dom._make('div');
    crucibleResultsScreen.mount(resultsEl, harness.ctx);
    crucibleResultsScreen.refresh(harness.ctx);

    // Step 4: Verify the finished attempt is still complete and identical
    const secondResult = survivalResults.lastResult();
    const secondRev = survivalResults.resultRevision();

    assert.equal(secondRev, firstRev, 'resultRevision must not bump on cancel/reopen');
    assert.deepEqual(secondResult.endedAt, initialEndedAt, 'endedAt timestamps must not mutate as a UI refresh');
    assert.deepEqual(secondResult, firstResult, 'finished record must remain strictly identical');

    // Step 5: A redundant run:ended event while ended cannot mutate the finished record
    harness.bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
    const thirdResult = survivalResults.lastResult();
    assert.deepEqual(thirdResult, firstResult, 'redundant run:ended cannot overwrite finished record');
  } finally {
    globalThis.document = prevDoc;
  }
});
