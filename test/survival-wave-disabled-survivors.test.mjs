import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

function setupSurvivalHarness(ruleset = 'scored') {
  const state = createGameState(4242);
  state.playerId = 1;
  const run = createRunState({ kind: 'survival' });
  run.phase = 'active';
  run.wave = 1;
  run.ruleset = ruleset;
  state.run = run;

  state.entities = new Map();
  const player = { id: 1, alive: true, team: 1, pos: { x: 0, z: 0 } };
  state.entities.set(1, player);

  const bus = createBus();
  const waveSys = Object.assign({}, survivalWave);
  waveSys.init({ state, bus, helpers: {} });

  const clearedEvents = [];
  const retiredEvents = [];
  bus.on('run:waveCleared', (payload) => clearedEvents.push(payload));
  bus.on('entity:killed', payload => retiredEvents.push(payload));

  return { state, bus, waveSys, clearedEvents, retiredEvents };
}

test('NXI-074: disabling the last relevant attacker clears and retires its already defeated body', () => {
  const { state, bus, waveSys, clearedEvents, retiredEvents } = setupSurvivalHarness();

  // Create an attacker entity
  const attacker = {
    id: 101,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 100, z: 100 },
    disabled: false,
    data: { runCohort: 'survival', runRole: 'enemy', ai: { state: 'hunt' } },
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
  waveSys._admittedTotal = 1;
  waveSys._plannedBodies = 1;

  // Update while attacker is active and dangerous — MUST NOT clear early
  waveSys.update();
  assert.equal(clearedEvents.length, 0, 'active dangerous attacker keeps wave open');

  // Disable the attacker (neutralized, alive, NOT despawned)
  attacker.disabled = true;

  // Next update should recognize the disabled survivor and clear without an impossible wait
  waveSys.update();
  assert.equal(clearedEvents.length, 1, 'disabling the last relevant attacker clears the wave');
  assert.equal(attacker.alive, false, 'only the already disabled body retires at its real cohort clear');
  assert.equal(state.entities.get(attacker.id), attacker, 'retirement leaves the dead record for ordinary aftermath ownership');
  assert.equal(clearedEvents[0].survivors, 0);
  assert.equal(clearedEvents[0].disabledSurvivors, 0);
  assert.equal(waveSys._resolved, 1);
  assert.equal(retiredEvents.length, 1); assert.equal(retiredEvents[0].id, attacker.id);
  assert.equal(retiredEvents[0].killerId, undefined, 'retirement does not fabricate a player kill');
});

test('NXI-074: a still-dangerous opponent is not falsely removed from wave blocking', () => {
  const { state, bus, waveSys, clearedEvents, retiredEvents } = setupSurvivalHarness();

  const disabledAttacker = {
    id: 201,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 50, z: 50 },
    disabled: true,
    data: { runCohort: 'survival', runRole: 'enemy', ai: { state: 'hunt' } },
  };
  const dangerousAttacker = {
    id: 202,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 150, z: 150 },
    disabled: false,
    data: { runCohort: 'survival', runRole: 'enemy', ai: { state: 'hunt' } },
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
  waveSys._admittedTotal = 2;
  waveSys._plannedBodies = 2;

  // Tick update: since 202 is still dangerous, wave must not clear
  waveSys.update();
  assert.equal(clearedEvents.length, 0, 'wave does not clear while a dangerous opponent remains');
  assert.equal(disabledAttacker.alive, true, 'a disabled body is not retired before the cohort clears');
  assert.equal(retiredEvents.length, 0);

  // Neutralize 202 as well
  dangerousAttacker.disabled = true;
  waveSys.update();
  assert.equal(clearedEvents.length, 1, 'wave clears once all remaining attackers are disabled');
  assert.equal(clearedEvents[0].survivors, 0);
  assert.equal(clearedEvents[0].disabledSurvivors, 0);
  assert.equal(disabledAttacker.alive, false); assert.equal(dangerousAttacker.alive, false);
  assert.equal(waveSys._resolved, 2);
  assert.deepEqual(retiredEvents.map(event => event.id), [201, 202]);
  assert.ok(retiredEvents.every(event => event.killerId === undefined));
});

test('NXI-074: swarm killTarget round clears when remaining admitted hostiles are neutralized', () => {
  const { state, bus, waveSys, clearedEvents, retiredEvents } = setupSurvivalHarness('swarm');
  noteSwarmPilotAction(state);

  const attacker = {
    id: 301,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 100, z: 100 },
    disabled: false,
    data: { runCohort: 'survival', runRole: 'enemy', ai: { state: 'hunt' } },
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
  assert.equal(clearedEvents[0].disabledSurvivors, 0);
  assert.equal(clearedEvents[0].survivors, 0);
  assert.equal(attacker.alive, false);
  assert.equal(waveSys._resolved, 1);
  assert.equal(retiredEvents.length, 1); assert.equal(retiredEvents[0].killerId, undefined);
});
