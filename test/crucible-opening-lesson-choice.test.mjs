import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearCrucibleSetup,
  canChooseSwarmOpeningLesson,
  crucibleLaunchConfig,
  crucibleSetupFor,
  lastCrucibleSetup,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import { useCrucibleMetaStorage } from '../src/systems/survivalRecords.js';

function memoryStorage() {
  const rows = new Map();
  return { getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, String(value)), removeItem: (key) => rows.delete(key) };
}

test('ordinary first Swarm launch opens the generated horde; explicit training choice keeps the lesson', () => {
  useCrucibleMetaStorage(memoryStorage());
  clearCrucibleSetup();
  const emitted = [];
  const bus = { emit: (event, payload) => emitted.push({ event, payload }), on() {}, off() {}, once() {} };
  try {
  const first = crucibleSetupFor({ starterId: 'kinetic_baseline', seed: 4242 });
  assert.equal(first.ok, true);
  const ordinary = crucibleLaunchConfig(first.value, 'swarm');
  assert.notEqual(ordinary.openingLesson, true, 'a fresh profile does not silently get the tutorial hold');
  assert.equal(ordinary.survivalSetup.seed, 4242);
  assert.equal(requestCrucibleRun(bus, first.value, 'swarm'), true);
  assert.notEqual(lastCrucibleSetup().openingLesson, true, 'default launch and retry remain immediate-horde runs');
  const ordinaryRequest = emitted.find(({ event }) => event === 'game:new');
  assert.ok(ordinaryRequest);
  assert.notEqual(ordinaryRequest.payload.crucibleSetup.openingLesson, true,
    'native boot payload does not re-enable the first-profile tutorial');

  const training = crucibleSetupFor({ starterId: 'kinetic_baseline', seed: 4243 });
  training.value.openingLesson = true;
  const lesson = crucibleLaunchConfig(training.value, 'swarm', { openingLesson: true });
  assert.equal(lesson.openingLesson, true, 'the visible training option survives launch config construction');
  assert.equal(lesson.survivalSetup.seed, 4243);
  assert.equal(requestCrucibleRun(bus, training.value, 'swarm'), true);
  assert.equal(lastCrucibleSetup().openingLesson, true, 'retry snapshot retains the chosen training opening');
  const trainingRequest = emitted.filter(({ event }) => event === 'game:new')[1];
  assert.equal(trainingRequest.payload.crucibleSetup.openingLesson, true,
    'native boot payload preserves the explicit training choice');

  const wrapped = crucibleSetupFor({ starterId: 'kinetic_baseline', seed: 4244 });
  assert.equal(requestCrucibleRun(bus, wrapped, 'swarm'), true);
  const wrappedRequest = emitted.filter(({ event }) => event === 'game:new')[2];
  assert.equal(wrappedRequest.payload.crucibleSetup.survivalSetup.hullId, wrapped.value.hullId);
  assert.equal(wrappedRequest.payload.crucibleSetup.survivalSetup.seed, 4244);
  assert.notEqual(wrappedRequest.payload.crucibleSetup.openingLesson, true);
  } finally {
    useCrucibleMetaStorage(null);
    clearCrucibleSetup();
  }
});

test('training availability follows selected challenge state, not offer availability', () => {
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm' }), true);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', weekly: true }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', daily: true }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', raceGhost: true }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', pendingShare: { ghostHash: 42 } }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', practiceQueued: true }), false);
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'scored' }), false);
  // An available weekly/ghost record is not itself a selection, so it cannot suppress training.
  assert.equal(canChooseSwarmOpeningLesson({ ruleset: 'swarm', weeklyOfferAvailable: true, ghostAvailable: true }), true);
});
