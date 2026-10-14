import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { survivalWave } from '../src/systems/survivalWave.js';

test('Gauntlet clear publishes the final dead cohort member before a delayed lifecycle receipt', () => {
  const state = createGameState(4242);
  state.run = createRunState({ kind: 'survival' });
  Object.assign(state.run, { phase: 'active', ruleset: 'scored', wave: 3 });
  state.playerId = 1;
  state.entities = new Map([[1, { id: 1, alive: true }]]);
  const bus = createBus();
  const owner = Object.assign({}, survivalWave);
  owner.init({ state, bus, helpers: {} });
  bus.emit('run:wavePlanned', { wave: 3, plan: {
    ok: true, schedule: [], completionRules: { blockingRoles: ['mass'] },
  } });
  bus.emit('run:waveStarted', { wave: 3 });
  // The empty fixture starts cleared; now reproduce the final real admitted hull.
  owner._active = true;
  owner._cleared = false;
  owner._plannedBodies = owner._admittedTotal = 9;
  owner._resolved = 8;
  const hull = { id: 453, alive: true, data: { runCohort: 'survival' } };
  state.entities.set(hull.id, hull);
  owner._cohort.set(hull.id, { role: 'mass', entity: hull });
  const sequence = [];
  bus.on('run:threatRequested', receipt => sequence.push(['census', receipt.resolvedThreat]));
  bus.on('run:waveCleared', () => sequence.push(['clear', owner._resolved]));
  owner.update();
  assert.deepEqual(sequence, [], 'a living admitted hull still blocks cleanup');
  hull.alive = false; // Lifecycle receipt is deferred until after wave update.
  owner.update();
  assert.deepEqual(sequence, [['census', 9], ['clear', 9]]);
  assert.equal(owner._cohort.size, 0);
  const wreck = { id: hull.id, alive: true, type: 'wreck' };
  state.entities.set(wreck.id, wreck);
  bus.emit('entity:killed', { id: hull.id });
  bus.emit('entity:destroyed', { id: hull.id, entity: hull });
  assert.equal(owner._resolved, 9, 'late receipts never double-count the settled hull');
  assert.equal(wreck.alive, true, 'clear does not retire the replacement generation');
  owner.destroy();
});
