import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects, LAB_SPEED_MAX } from '../src/core/timeEffects.js';
import {
  LOOP_FIXED_DT,
  MAX_CATCHUP_STEPS,
  advanceFixedTimestep,
} from '../src/core/simulationRunner.js';
import { runSession } from '../src/systems/runSession.js';

function effectsFor(run) {
  const state = run === undefined ? { timeScale: 1 } : { timeScale: 1, run };
  return { state, effects: createTimeEffects(state) };
}

test('labSpeed validation: out-of-range values throw naming labSpeed; 1 / 2 / 4 are accepted', () => {
  const { effects } = effectsFor({ kind: 'lab', phase: 'active' });
  assert.throws(() => effects.set('lab', { labSpeed: 0.9 }), /labSpeed/);
  assert.throws(() => effects.set('lab', { labSpeed: 4.1 }), /labSpeed/);
  assert.throws(() => effects.set('lab', { labSpeed: NaN }), /labSpeed/);
  assert.throws(() => effects.set('lab', { labSpeed: Infinity }), /labSpeed/);
  assert.throws(() => effects.set('lab', { labSpeed: '2' }), /labSpeed/);
  assert.throws(() => effects.set('lab', { labSpeed: null }), /labSpeed/);
  assert.equal(effects.set('lab', { labSpeed: 1 }), 1);
  assert.equal(effects.set('lab', { labSpeed: 2 }), 2);
  assert.equal(effects.set('lab', { labSpeed: 4 }), 4);
  assert.equal(LAB_SPEED_MAX, 4);
  assert.equal(LAB_SPEED_MAX, MAX_CATCHUP_STEPS);
});

test('Adventure is unchanged: labSpeed is clamped to 1 when state.run is absent', () => {
  const { state, effects } = effectsFor(undefined);
  assert.equal(Object.hasOwn(state, 'run'), false);
  effects.set('lab', { labSpeed: 4 });
  assert.equal(state.timeScale, 1);
});

test('Adventure is unchanged: labSpeed is clamped to 1 when state.run is null', () => {
  const { state, effects } = effectsFor(null);
  effects.set('lab', { labSpeed: 4 });
  assert.equal(state.timeScale, 1);
});

test('Adventure is unchanged: labSpeed is clamped to 1 when kind is adventure', () => {
  const { state, effects } = effectsFor({ kind: 'adventure', phase: 'active' });
  effects.set('lab', { labSpeed: 4 });
  assert.equal(state.timeScale, 1);
});

test('Adventure is unchanged: labSpeed is clamped to 1 when kind is lab but phase is inactive', () => {
  const { state, effects } = effectsFor({ kind: 'lab', phase: 'inactive' });
  effects.set('lab', { labSpeed: 4 });
  assert.equal(state.timeScale, 1);
});

test('a live lab run admits labSpeed 2 and 4', () => {
  const { state, effects } = effectsFor({ kind: 'lab', phase: 'active' });
  assert.equal(effects.set('lab', { labSpeed: 2 }), 2);
  assert.equal(state.timeScale, 2);
  assert.equal(effects.set('lab', { labSpeed: 4 }), 4);
  assert.equal(state.timeScale, 4);
});

test('pause beats speed: scale 0 drives timeScale to 0; clearing it returns to 4', () => {
  const { state, effects } = effectsFor({ kind: 'lab', phase: 'active' });
  effects.set('lab', { labSpeed: 4 });
  assert.equal(state.timeScale, 4);
  effects.set('pause', { scale: 0 });
  assert.equal(state.timeScale, 0);
  effects.clear('pause');
  assert.equal(state.timeScale, 4);
});

test('slow composes: scale 0.5 times labSpeed 4 gives 2', () => {
  const { state, effects } = effectsFor({ kind: 'lab', phase: 'active' });
  effects.set('slow', { scale: 0.5 });
  effects.set('lab', { labSpeed: 4 });
  assert.equal(state.timeScale, 2);
});

test('the labSpeed gate closes on its own after runSession ends the Lab', () => {
  const state = createGameState(11);
  const bus = createBus();
  runSession.init({ state, bus });
  const effects = createTimeEffects(state);
  bus.emit('run:beginRequested', {
    kind: 'lab',
    ruleset: null,
    seed: 11,
    arenaId: 'lab-speed',
  });
  assert.equal(state.run.kind, 'lab');
  assert.notEqual(state.run.phase, 'inactive');
  effects.set('lab', { labSpeed: 4 });
  assert.equal(state.timeScale, 4);

  bus.emit('run:endRequested', { outcome: 'aborted', reason: 'lab-speed-test', tick: 0 });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'ended',
    nextPhase: 'inactive',
    reason: 'teardown',
    tick: 1,
  });
  assert.equal(state.run.phase, 'inactive');
  // runSession wrote phase inactive (kind still 'lab'). The request stays registered.
  // getEffectiveScale() re-runs applyMinimum, which re-reads the Lab gate and clamps to 1.
  assert.equal(effects.getEffectiveScale(), 1);
  assert.equal(state.timeScale, 1);
});

test('determinism: the same frameDt at scale 2 yields twice the steps of scale 1, every step is LOOP_FIXED_DT', () => {
  const frameDt = LOOP_FIXED_DT * 2;

  function runAt(scale) {
    const dts = [];
    const result = advanceFixedTimestep(0, frameDt, scale, (dt) => {
      dts.push(dt);
    });
    return { steps: result.steps, dts };
  }

  const atOne = runAt(1);
  const atTwo = runAt(2);
  assert.equal(atOne.steps * 2, atTwo.steps);
  assert.ok(atTwo.steps <= MAX_CATCHUP_STEPS);
  assert.ok(atOne.dts.length > 0);
  assert.ok(atTwo.dts.length > 0);
  assert.ok(atOne.dts.every((dt) => dt === LOOP_FIXED_DT));
  assert.ok(atTwo.dts.every((dt) => dt === LOOP_FIXED_DT));
  assert.equal(new Set(atTwo.dts).size, 1);
  assert.equal(atTwo.dts[0], LOOP_FIXED_DT);

  const atFour = runAt(4);
  assert.ok(atFour.dts.every((dt) => dt === LOOP_FIXED_DT));
  assert.equal(atFour.steps, MAX_CATCHUP_STEPS);
});
