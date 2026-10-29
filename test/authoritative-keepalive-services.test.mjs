import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeStepper } from '../src/core/authoritativeSimStep.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';

test('worker keepalive advances detention and dock acknowledgement while simulation is paused', () => {
  const state = { tick: 10, simTime: 20, ui: { docked: true }, input: {} };
  const calls = [];
  const owners = new Map([
    ['input', { update(dt, live) { calls.push(['input', dt, live]); } }],
    ['save', { update(dt, live) { calls.push(['save', dt, live]); } }],
    ['stationServices', { update(dt, live) { calls.push(['yard', dt, live]); } }],
    ['lawSecurity', { keepalive(dt) { calls.push(['law', dt]); } }],
    ['latchNine', { keepalive(dt) { calls.push(['latch', dt]); } }],
  ]);
  const stepper = createAuthoritativeStepper({ state, getSystem: id => owners.get(id) });
  stepper.keepalive(0, 2);
  assert.deepEqual(calls, [
    ['input', 0, state], ['save', 0, state],
    ['yard', 2, state], ['law', 2], ['latch', 2],
  ]);
  assert.equal(state.simTime, 20, 'wall-clock service must not advance the world');
  assert.equal(state.tick, 10);
  calls.length = 0;
  stepper.keepalive(0, 0);
  assert.deepEqual(calls, [
    ['input', 0, state], ['save', 0, state], ['latch', 0],
  ], 'zero-time sync preserves browser input/save and acknowledgement owner behavior');
  const boundaries = [];
  stepper.step(0.5, { publishInputCommand: (input, tick, stamp) => boundaries.push([input, tick, stamp]) });
  assert.deepEqual(boundaries, [[state.input, 11, null]], 'frozen worker step still publishes the consumed input snapshot');
  assert.equal(state.tick, 11);
  assert.equal(state.simTime, 20, 'frozen worker keepalive never advances the simulation clock');
});

test('headless frozen step uses the shared keepalive methods without advancing simulation time', () => {
  const state = createGameState(19);
  state.ui.docked = true;
  state.tick = 27;
  state.simTime = 13.5;
  const calls = [];
  const counted = [];
  state.perfRuntime = { tier1: {
    isEnabled: () => true,
    countSystemInvocation: name => counted.push(name),
  } };
  const systems = [
    { name: 'input', update(dt, live) { calls.push(['input', dt, live]); } },
    { name: 'save', update(dt, live) { calls.push(['save', dt, live]); } },
    { name: 'stationServices', update(dt, live) { calls.push(['yard', dt, live]); } },
    { name: 'lawSecurity', update(dt) { calls.push(['law-update', dt]); }, keepalive(dt) { calls.push(['law', dt]); } },
    { name: 'latchNine', update(dt) { calls.push(['latch-update', dt]); }, keepalive(dt) { calls.push(['latch', dt]); } },
  ];
  const sim = createSimulation({ state, systems });
  sim.step(0.25);

  assert.deepEqual(calls, [
    ['input', 0.25, state],
    ['save', 0.25, state],
    ['yard', 0.25, state],
    ['law', 0.25],
    ['latch', 0.25],
  ]);
  assert.deepEqual(counted, ['input', 'save', 'stationServices', 'lawSecurity', 'latchNine']);
  assert.equal(state.tick, 27, 'the headless frozen path keeps its existing no-tick behavior');
  assert.equal(state.simTime, 13.5, 'keepalive elapsed time never advances the world clock');
});
