import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { survivalWave } from '../src/systems/survivalWave.js';

function setupSurvivalHarness() {
  const state = createGameState(4242);
  state.playerId = 1;
  const run = createRunState({ kind: 'survival' });
  run.phase = 'active';
  run.wave = 1;
  state.run = run;

  state.entities = new Map();
  const player = { id: 1, alive: true, team: 1, pos: { x: 0, z: 0 } };
  state.entities.set(1, player);

  const bus = createBus();
  const waveSys = Object.assign({}, survivalWave);
  waveSys.init({ state, bus, helpers: {} });

  const clearedEvents = [];
  bus.on('run:waveCleared', (payload) => clearedEvents.push(payload));

  return { state, bus, waveSys, clearedEvents };
}

test('NXI-074: disabling the last relevant attacker clears the wave without despawning or hanging', () => {
  const { state, bus, waveSys, clearedEvents } = setupSurvivalHarness();

  // Create an attacker entity
  const attacker = {
    id: 101,
    alive: true,
    team: 2,
    pos: { x: 100, z: 100 },
    disabled: false,
    data: { runCohort: 'survival' },
  };
  state.entities.set(101, attacker);

  // Plan a wave
  bus.emit('run:wavePlanned', {
    wave: 1,
    plan: {
      ok: true,
      schedule: [],
      completionRules: { blockingRoles: ['mass'] },
    },
  });

  // Materialize the hostile into the wave cohort
  waveSys._cohort.set(101, {
    role: 'mass',
    entity: attacker,
  });
  waveSys._blockingRoles.add('mass');
  waveSys._admittedTotal = 1;

  bus.emit('run:waveStarted', { wave: 1 });

  // Update while attacker is active and dangerous — MUST NOT clear early
  waveSys.update();
  assert.equal(clearedEvents.length, 0, 'active dangerous attacker keeps wave open');

  // Disable the attacker (neutralized, alive, NOT despawned)
  attacker.disabled = true;

  // Next update should recognize the disabled survivor and clear without an impossible wait
  waveSys.update();
  assert.equal(clearedEvents.length, 1, 'disabling the last relevant attacker clears the wave');
  assert.equal(attacker.alive, true, 'disabled attacker was NOT despawned to force a clear');
  assert.equal(clearedEvents[0].survivors, 1, 'survivor count reflects remaining living entities');
  assert.equal(clearedEvents[0].disabledSurvivors, 1, 'disabled survivors explicitly counted on receipt');
});

test('NXI-074: a still-dangerous opponent is not falsely removed from wave blocking', () => {
  const { state, bus, waveSys, clearedEvents } = setupSurvivalHarness();

  const disabledAttacker = {
    id: 201,
    alive: true,
    team: 2,
    pos: { x: 50, z: 50 },
    disabled: true,
    data: { runCohort: 'survival' },
  };
  const dangerousAttacker = {
    id: 202,
    alive: true,
    team: 2,
    pos: { x: 150, z: 150 },
    disabled: false,
    data: { runCohort: 'survival' },
  };
  state.entities.set(201, disabledAttacker);
  state.entities.set(202, dangerousAttacker);

  bus.emit('run:wavePlanned', {
    wave: 1,
    plan: {
      ok: true,
      schedule: [],
      completionRules: { blockingRoles: ['mass'] },
    },
  });

  waveSys._cohort.set(201, { role: 'mass', entity: disabledAttacker });
  waveSys._cohort.set(202, { role: 'mass', entity: dangerousAttacker });
  waveSys._blockingRoles.add('mass');
  waveSys._admittedTotal = 2;

  bus.emit('run:waveStarted', { wave: 1 });

  // Tick update: since 202 is still dangerous, wave must not clear
  waveSys.update();
  assert.equal(clearedEvents.length, 0, 'wave does not clear while a dangerous opponent remains');

  // Neutralize 202 as well
  dangerousAttacker.disabled = true;
  waveSys.update();
  assert.equal(clearedEvents.length, 1, 'wave clears once all remaining attackers are disabled');
  assert.equal(clearedEvents[0].survivors, 2);
  assert.equal(clearedEvents[0].disabledSurvivors, 2);
});

test('NXI-074: swarm killTarget round clears when remaining admitted hostiles are neutralized', () => {
  const { state, bus, waveSys, clearedEvents } = setupSurvivalHarness();

  const attacker = {
    id: 301,
    alive: true,
    team: 2,
    pos: { x: 100, z: 100 },
    disabled: false,
    data: { runCohort: 'survival' },
  };
  state.entities.set(301, attacker);

  bus.emit('run:wavePlanned', {
    wave: 1,
    plan: {
      ok: true,
      schedule: [],
      swarm: {
        killTarget: 1,
        quota: 1,
        concurrent: 4,
      },
    },
  });
  bus.emit('run:waveStarted', { wave: 1 });

  waveSys._cohort.set(301, { role: 'mass', entity: attacker });
  waveSys._admittedTotal = 1;
  waveSys._plannedBodies = 1;
  waveSys._pending = [];

  waveSys.update();
  assert.equal(clearedEvents.length, 0, 'swarm killTarget round open while hostile is actionable');

  attacker.disabled = true;
  waveSys.update();
  assert.equal(clearedEvents.length, 1, 'swarm killTarget round clears when hostile is neutralized');
  assert.equal(clearedEvents[0].disabledSurvivors, 1);
  assert.equal(attacker.alive, true);
});
