import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';

const DAY_SECONDS = 600;

test('Continue/load does not invent a multi-day day:tick from a restored simTime', () => {
  const sim = createSimulation({ seed: 7, systems: [] });
  const ticks = [];
  sim.bus.on('day:tick', (payload) => ticks.push({ ...payload }));

  // Mid-run save: clock already on day 50. Core still has _lastDay from init (0) until load sync.
  sim.state.simTime = DAY_SECONDS * 50 + 12;
  sim.bus.emit('save:loaded', { slot: 'test' });

  sim.step(SIM_DT);

  assert.equal(ticks.length, 0, 'restored clock must not emit elapsed catch-up days');
  assert.equal(sim.state.days, 50);
});

test('crossing the next day boundary after Continue still emits a single day:tick', () => {
  const sim = createSimulation({ seed: 11, systems: [] });
  const ticks = [];
  sim.bus.on('day:tick', (payload) => ticks.push({ ...payload }));

  sim.state.simTime = DAY_SECONDS * 50 - SIM_DT / 2;
  sim.bus.emit('save:loaded', { slot: 'test' });
  assert.equal(sim.state.days, 49);

  sim.step(SIM_DT);

  assert.equal(ticks.length, 1);
  assert.deepEqual(ticks[0], { days: 50, elapsed: 1 });
  assert.equal(sim.state.days, 50);
});

test('New Game clock reset does not emit a negative day:tick catch-up', () => {
  const sim = createSimulation({ seed: 13, systems: [] });
  const ticks = [];
  sim.bus.on('day:tick', (payload) => ticks.push({ ...payload }));

  // Advance into day 2 without going through save:loaded.
  sim.state.simTime = DAY_SECONDS * 2 + 1;
  sim.step(SIM_DT);
  assert.equal(ticks.length, 1);
  assert.equal(ticks[0].days, 2);
  ticks.length = 0;

  // Title New Game resets the clock while the same core instance keeps running.
  sim.state.simTime = 0;
  sim.state.days = 0;
  sim.step(SIM_DT);

  assert.equal(ticks.length, 0, 'resetting the clock must adopt day 0 silently');
  assert.equal(sim.state.days, 0);
});
