import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';
import { SURVIVAL_CLEANUP_TICKS, survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';

function eventBus(events = []) {
  const listeners = new Map();
  return {
    on(name, listener) {
      const rows = listeners.get(name) || [];
      rows.push(listener);
      listeners.set(name, rows);
      return () => {
        const index = rows.indexOf(listener);
        if (index >= 0) rows.splice(index, 1);
      };
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const listener of [...(listeners.get(name) || [])]) listener(payload);
    },
  };
}

function announceHarness(ruleset = SWARM_RULESET) {
  const state = createGameState(4242);
  const player = { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 } };
  state.mode = 'flight';
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.run = createRunState({ kind: 'survival', ruleset, seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = 1;
  state.run.arenaId = 'helios_core';
  const events = [];
  const bus = eventBus(events);
  const announcer = Object.assign({}, survivalAnnounce);
  announcer.init({ state, bus });
  bus.emit('run:wavePlanned', {
    wave: 1,
    plan: { packages: [], schedule: [], objective: { kind: 'resolve_hostiles' } },
  });
  events.length = 0;
  return { state, bus, announcer, events };
}

function clearTexts(h) {
  return h.events
    .filter((event) => event.name === 'voice:say' && event.payload?.id === 'survival:w1:clear')
    .map((event) => event.payload.text);
}

test('Swarm clear and timed survival never turn admissions into a kill tally', () => {
  for (const completionKind of ['cohort', 'duration']) {
    for (const killed of [undefined, null, -1, 1.5, NaN]) {
      const h = announceHarness();
      h.bus.emit('run:waveCleared', { wave: 1, completionKind, admitted: 8, killed });
      assert.deepEqual(clearTexts(h), [completionKind === 'duration' ? 'Wave 1 survived.' : 'Wave 1 clear.']);
      h.announcer.destroy();
    }
  }
  const h = announceHarness();
  h.bus.emit('run:waveCleared', { wave: 1, completionKind: 'cohort', admitted: 8, killed: 0 });
  assert.deepEqual(clearTexts(h), ['Wave 1 clear.']);
  h.announcer.destroy();
});

test('an explicit Swarm resolution count names threats out of the fight and is spoken once', () => {
  const h = announceHarness();
  const receipt = { wave: 1, completionKind: 'cohort', admitted: 8, killed: 2 };
  h.bus.emit('run:waveCleared', receipt);
  h.bus.emit('run:waveCleared', receipt);
  assert.deepEqual(clearTexts(h), ['Wave 1 clear. Two threats out of the fight.']);
  h.announcer.destroy();

  const timed = announceHarness();
  timed.bus.emit('run:waveCleared', { wave: 1, completionKind: 'duration', admitted: 8, killed: 1 });
  assert.deepEqual(clearTexts(timed), ['Wave 1 survived. One threat out of the fight.']);
  timed.announcer.destroy();
});

test('named objective and starved-wave messages keep their existing outcome copy', () => {
  const named = announceHarness();
  named.bus.emit('run:waveCleared', {
    wave: 1, admitted: 8, killed: 8, killWord: 'Broodmother down',
  });
  assert.deepEqual(named.events.filter((event) => event.name === 'voice:say').map((event) => event.payload.text), [
    'Broodmother down',
  ]);
  named.announcer.destroy();

  const starved = announceHarness();
  starved.bus.emit('run:waveCleared', { wave: 1, requested: 8, admitted: 0, starved: true });
  assert.ok(starved.events.some((event) => event.name === 'voice:say'
    && event.payload.channel === 'alert'
    && event.payload.text === 'Wave 1 closed empty. Nothing reached the field. That was not a clear.'));
  assert.deepEqual(clearTexts(starved), []);
  starved.announcer.destroy();
});

test('non-Swarm announcements retain their existing admission fallback and wording', () => {
  const h = announceHarness(null);
  h.bus.emit('run:waveCleared', { wave: 1, completionKind: 'cohort', admitted: 2 });
  assert.deepEqual(clearTexts(h), ['Wave 1 clear. Two down.']);
  h.announcer.destroy();
});

test('the actual first Swarm resolution receipt speaks honestly, opens the shop, and starts wave two', () => {
  const state = createGameState(4242);
  const player = { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 } };
  state.mode = 'flight';
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = 1;
  state.run.arenaId = 'helios_core';

  const events = [];
  const bus = eventBus(events);
  const sessions = Object.assign({}, runSession);
  const phases = Object.assign({}, survivalRun);
  const waveOwner = Object.assign({}, survivalWave);
  const announcer = Object.assign({}, survivalAnnounce);
  sessions.init({ state, bus });
  phases.init({ state, bus });
  waveOwner.init({ state, bus, helpers: {} });
  announcer.init({ state, bus });

  bus.emit('run:wavePlanned', {
    wave: 1,
    plan: {
      id: 'swarm:w1:test',
      packages: [],
      schedule: [],
      objective: { kind: 'resolve_hostiles', population: 'ships' },
      swarm: { killTarget: 1, concurrent: 1, rewardReferenceKills: 1 },
      completionRules: { kind: 'cohort', cleanupTicks: SURVIVAL_CLEANUP_TICKS },
    },
  });
  bus.emit('run:waveStarted', { wave: 1, tick: 1 });

  // An out-of-fight retreat is an actual terminal cohort outcome, not a kill.
  const fled = {
    id: 2, type: 'ship', alive: true, team: 2, pos: { x: 30, z: 0 },
    data: { runCohort: 'survival', runRole: 'enemy', ai: { forceFlee: true } },
  };
  state.entities.set(fled.id, fled);
  state.entityList.push(fled);
  waveOwner._plannedBodies = waveOwner._admittedTotal = waveOwner._requestedTotal = 1;
  waveOwner._cohort.set(fled.id, { role: 'mass', entity: fled });
  waveOwner._checkCleared(state.run);

  const receipt = events.findLast((event) => event.name === 'run:waveCleared')?.payload;
  assert.equal(receipt?.killed, 1, 'the legacy field is the resolved cohort-slot count');
  assert.equal(fled.alive, true, 'a fleeing hull resolves without being killed');
  assert.ok(events.some((event) => event.name === 'voice:say'
    && event.payload.id === 'survival:w1:clear'
    && event.payload.text === 'Wave 1 clear. One threat out of the fight.'));

  phases.update(1 / 60);
  assert.equal(state.run.phase, 'cleanup');
  for (let tick = 0; tick < SURVIVAL_CLEANUP_TICKS; tick++) phases.update(1 / 60);
  assert.equal(state.run.phase, 'draft', 'wave one routes into the shop');
  bus.emit('run:draftResolved', { wave: 1 });
  phases.update(1 / 60);
  assert.equal(state.run.phase, 'wave_intro');
  assert.equal(state.run.wave, 2);
  assert.ok(events.some((event) => event.name === 'run:wavePlanned' && event.payload.wave === 2));

  announcer.destroy();
  waveOwner.destroy();
  phases.destroy();
  sessions.destroy();
});
