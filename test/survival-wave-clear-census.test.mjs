import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { threatPopulationLabel } from '../src/ui/survivalHud.js';

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

test('Swarm progress names the ship quota, and the live wave owner waits for the wave-ten boss', () => {
  const plan = planWave({ seed: 4242, arenaId: 'helios_core', wave: 10, ruleset: 'swarm', mutators: [] });
  assert.equal(plan.mode, 'swarm');
  assert.equal(plan.objective.kind, 'boss');
  assert.equal(plan.objective.population, 'ships');
  assert.equal(plan.objective.supplementalPopulation, 'brood');
  assert.equal(plan.swarm.bossScoreId, 'capital_boss_hulk', 'the opening first-ten boss is the authored Iron Maw encounter');
  assert.equal(threatPopulationLabel('swarm', plan.objective), 'HOSTILE SHIPS');
  assert.equal(threatPopulationLabel('swarm', { kind: 'boss' }), 'HOSTILES', 'legacy plans keep their explicit fallback');

  const state = createGameState(4242);
  state.run = createRunState({ kind: 'survival' });
  Object.assign(state.run, { phase: 'active', ruleset: 'swarm', wave: 10, arenaId: 'helios_core' });
  state.playerId = 1;
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  state.entities = new Map([[1, player]]);
  const bus = createBus();
  const owner = Object.assign({}, survivalWave);
  owner.init({ state, bus, helpers: {} });
  owner._plan = plan;
  owner._swarm = plan.swarm;
  owner._active = true;
  owner._cleared = false;
  owner._pending = [];
  owner._plannedBodies = owner._admittedTotal = plan.swarm.killTarget;
  owner._resolved = plan.swarm.killTarget - 1;
  owner._cohort = new Map();
  owner._bossIds = new Set();
  const boss = { id: 10, alive: true, pos: { x: 10, z: 0 }, data: { isBoss: true, bossId: plan.swarm.bossScoreId } };
  state.entities.set(boss.id, boss);
  owner._cohort.set(boss.id, { role: 'elite', entity: boss });
  owner._bossIds.add(boss.id);
  const progress = [];
  const clears = [];
  bus.on('run:waveProgress', (payload) => progress.push(payload));
  bus.on('run:waveCleared', (payload) => clears.push(payload));

  owner._publishWaveProgress({ force: true });
  assert.equal(progress.at(-1).objectiveKind, 'boss');
  assert.equal(progress.at(-1).objectivePopulation, 'ships');
  assert.equal(progress.at(-1).supplementalPopulation, 'brood');
  owner._checkCleared(state.run);
  assert.equal(clears.length, 0, 'a living champion blocks the quota clear');

  boss.alive = false;
  bus.emit('entity:killed', { id: boss.id });
  owner._checkCleared(state.run);
  assert.equal(clears.length, 1, 'the real cohort kill receipt resolves the boss and clears once');
  assert.equal(clears[0].objectiveKind, 'boss');
  assert.equal(clears[0].objectivePopulation, 'ships');
  assert.equal(clears[0].supplementalPopulation, 'brood');
  owner._checkCleared(state.run);
  assert.equal(clears.length, 1, 'the clear receipt is once-only');
  owner.destroy();
});
