import test from 'node:test';
import assert from 'node:assert/strict';
import { world } from '../src/systems/world.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { onboarding } from '../src/systems/onboarding.js';
import { SquadCommander } from '../src/ai/squad.js';
import { normalizeSensorFrame } from '../src/ai/contracts.js';

test('Crucible releases Adventure actors without killing props, run enemies or player drones', () => {
  const entities = [
    { id: 1, type: 'ship' }, { id: 2, type: 'ship' }, { id: 3, type: 'drone' },
    { id: 4, type: 'asteroid' }, { id: 5, type: 'station' },
    { id: 6, type: 'ship', data: { runCohort: 'survival' } },
    { id: 7, type: 'drone', data: { ownerId: 1 } },
  ].map(entity => ({ alive: true, ...entity }));
  const state = { playerId: 1, entityList: entities, run: { kind: null, phase: 'inactive' } };
  const budget = makeBudgetApi(state);
  budget.request(2, 'ambient');
  budget.bindEntity(2, 'ambient'); budget.bindEntity(3, 'ambient');
  const removed = [];
  const ctx = { state, helpers: { spawnBudget: budget,
    removeEntity(id) { removed.push(id); entities.find(entity => entity.id === id).alive = false; },
  } };
  world._clearAdventureCombatantsForRun.call(ctx);
  assert.deepEqual(removed, [], 'Adventure is unchanged');
  state.run = { kind: 'survival', phase: 'loadout' };
  world._clearAdventureCombatantsForRun.call(ctx);
  assert.deepEqual(removed, [2, 3]);
  assert.equal(budget.current(), 0);
  assert.equal(budget.request(4, 'ambient'), 0);
  assert.equal(budget.request(4, 'encounter:patrol'), 0);
  assert.equal(budget.request(4, 'survival-wave:1'), 4);
  world._clearAdventureCombatantsForRun.call(ctx);
  assert.deepEqual(removed, [2, 3], 'cleanup is idempotent');
  state.run = { kind: null, phase: 'inactive' };
  assert.equal(budget.request(2, 'ambient'), 2, 'a later Adventure uses ordinary admission');
});

test('wounded survival pursuers cannot retreat off the map when the director requests respite', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  commander.registerSquad({ id: 'run', doctrine: 'scavenger', faction: 'fixture',
    members: [{ id: 2, capabilities: ['drive', 'sensor', 'weapon', 'ranged'] }] });
  const perception = normalizeSensorFrame({ self: { id: 2, team: 1, hullFraction: 0.05,
    moraleImmune: true, pos: { x: 900, z: 0 } }, contacts: [{ id: 1, kind: 'ship', team: 0,
    hostile: true, visible: true, confidence: 1, pos: { x: 0, z: 0 } }] }, 2, 60);
  assert.equal(perception.self.moraleImmune, true, 'the sensor contract carries the spawn policy');
  const order = { command: { type: 'order_retreat' } };
  const frames = new Map([[2, perception]]);
  const active = commander.update('run', 60, frames, order);
  assert.notEqual(active.tactic, 'fighting_retreat');
  assert.equal(active.focusTargetId, 1);
  frames.set(2, { ...perception, self: { ...perception.self, moraleImmune: false } });
  assert.equal(commander.update('run', 120, frames, order).tactic, 'fighting_retreat',
    'ordinary Adventure squads still obey retreat orders');
});

test('Adventure law cannot withdraw a run enemy or mutate a live run', () => {
  const enemy = { data: { runCohort: 'survival', ai: { huntPlayer: true } } };
  const context = { state: { run: { kind: 'survival', phase: 'wave_active' } },
    _reconcileJobResponses() { assert.fail('Adventure law ran in Crucible'); } };
  lawSecurity.update.call(context, 1 / 60, context.state);
  lawSecurity._withdrawFromSanctuary.call(context, enemy, null, null);
  assert.deepEqual(enemy.data.ai, { huntPlayer: true });
});

test('run onboarding clears the old panel without deleting reused actor IDs or teaching Adventure hints', () => {
  let panelRemoved = false;
  const context = Object.assign(Object.create(onboarding), {
    state: { run: { kind: 'survival', phase: 'wave_active' }, player: {} },
    _trainerId: 2, _derelictId: 3, _miningRockId: 4,
    _panel: { remove() { panelRemoved = true; } },
    _removeTrainingActors() { assert.fail('old IDs must not touch the new world'); },
    _clearObjectiveWaypoint() {}, bus: { emit() { assert.fail('Adventure hint in run'); } },
  });
  context._begin();
  context._showHint('firstWeapon', 'Hint');
  assert.equal(panelRemoved, true);
  assert.equal(context._trainerId, null);
  assert.equal(context.state.onboarding.active, false);
});
