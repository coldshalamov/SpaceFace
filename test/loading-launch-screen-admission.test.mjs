import test from 'node:test';
import assert from 'node:assert/strict';
import { runRenderUpdatePhase } from '../src/core/renderUpdatePhase.js';
import { shouldFreezeFlightSubmit, shouldSkipFullTickSystems, canvasIsProtectedDuringFreeze } from '../src/core/presentationFreeze.js';

test('loading cooks real opening actors while its public launcher stays modal', () => {
  const state = { mode: 'loading', ui: { screenStack: ['physicsVenues'] }, render: {} };
  const calls = [];
  const accepted = runRenderUpdatePhase({ state, alpha: 1, frameDt: 1 / 60,
    render: { prepareFrame() { calls.push('admit-opening-actors'); return true; },
      drawPreparedFrame() { calls.push('cook-opening-pipelines'); } },
    ui: { frame() { calls.push('paint-loading-ui'); } } });
  assert.equal(accepted, true, 'opening presentation journal must be consumed');
  assert.deepEqual(calls, ['admit-opening-actors', 'cook-opening-pipelines', 'paint-loading-ui']);
  assert.equal(shouldSkipFullTickSystems(state), true, 'the launcher still freezes physics, combat and clock');
  assert.equal(canvasIsProtectedDuringFreeze(state), true, 'UI stages cannot overwrite loading admission');
});

test('ordinary modal flight and sector-shell cooking retain their existing freeze', () => {
  const state = { mode: 'flight', ui: { screenStack: ['physicsVenues'] }, render: {} };
  assert.equal(shouldFreezeFlightSubmit(state), true);
  assert.equal(shouldSkipFullTickSystems(state), true);
  state.mode = 'loading'; state.render.sectorShellAdmission = true;
  assert.equal(shouldFreezeFlightSubmit(state), true, 'sector-shell cook owns its working set');
  assert.equal(shouldSkipFullTickSystems(state), true);
});
