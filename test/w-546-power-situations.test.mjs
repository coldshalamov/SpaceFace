// w-546: teach by situation — the first ten minutes place one setup per power,
// trying the verb resolves it, an ignored setup stands down, flown-before skips all.
import assert from 'node:assert/strict';
import test from 'node:test';

import { onboarding } from '../src/systems/onboarding.js';
import {
  POWER_SITUATIONS, POWER_SITUATION_FIRST_S, POWER_SITUATION_GAP_S,
  POWER_SITUATION_TTL_S, POWER_SITUATION_WINDOW_S,
} from '../src/onboarding/powerSituations.js';

function harness({ flownBefore = false, startedAt = 0 } = {}) {
  const spawned = [];
  const removed = [];
  const milestones = [];
  const state = {
    mode: 'flight',
    simTime: startedAt,
    entities: new Map(),
    playerId: 'p1',
    onboarding: { active: true, finished: false, startedAt, pace: { flownBefore } },
    input: { actions: {} },
  };
  state.entities.set('p1', { id: 'p1', pos: { x: 0, z: 0 }, rot: 0 });
  const sys = Object.create(onboarding);
  sys.state = state;
  sys.bus = { emit: () => {} };
  sys.helpers = {
    spawnEntity: (spec) => { const e = { id: `rock${spawned.length}`, ...spec }; spawned.push(e); return e; },
    removeEntity: (id) => removed.push(id),
  };
  sys._emitMilestone = (id, payload) => milestones.push({ id, ...payload });
  sys._sayTutorial = () => {};
  return { state, sys, spawned, removed, milestones };
}

test('w-546: the first situation lands after the stick drills, and using the power resolves it', () => {
  const h = harness();
  const { state, sys } = h;
  state.simTime = POWER_SITUATION_FIRST_S - 1;
  sys._tickPowerSituations(state);
  assert.equal(h.spawned.length, 0, 'nothing placed before the first window');
  state.simTime = POWER_SITUATION_FIRST_S + 1;
  sys._tickPowerSituations(state);
  assert.ok(h.spawned.length > 0, 'first setup placed');
  const power = state.onboarding.powerSit.active.power;
  state.input.actions[power] = { held: true, pressed: false };
  sys._tickPowerSituations(state);
  assert.equal(state.onboarding.powerSit.active, null);
  assert.equal(state.onboarding.powerSit.doneAt[power], state.simTime);
  assert.ok(h.milestones.some((m) => m.id === 'powerSituation' && m.used === true));
});

test('w-546: an ignored setup expires on TTL and the ladder resumes after the voice gap', () => {
  const h = harness();
  const { state, sys } = h;
  state.simTime = POWER_SITUATION_FIRST_S + 1;
  sys._tickPowerSituations(state);
  const placed = h.spawned.length;
  state.simTime += POWER_SITUATION_TTL_S + 0.1;
  sys._tickPowerSituations(state);
  assert.equal(state.onboarding.powerSit.active, null, 'ignored setup stands down');
  assert.equal(h.removed.length, placed, 'its props despawn');
  assert.ok(h.milestones.some((m) => m.id === 'powerSituation' && m.used === false));
  const spawnedAt = h.spawned.length;
  state.simTime += POWER_SITUATION_GAP_S - 1;
  sys._tickPowerSituations(state);
  assert.equal(h.spawned.length, spawnedAt, 'the gap is respected');
  state.simTime += 2;
  sys._tickPowerSituations(state);
  assert.ok(h.spawned.length > spawnedAt, 'next situation lands after the gap');
});

test('w-546: flown-before places nothing; past the window the ladder stands down', () => {
  const h = harness({ flownBefore: true });
  const { state, sys } = h;
  for (let t = POWER_SITUATION_FIRST_S; t < POWER_SITUATION_WINDOW_S; t += 30) {
    state.simTime = t;
    sys._tickPowerSituations(state);
  }
  assert.equal(h.spawned.length, 0, 'veterans skip the whole ladder');

  const h2 = harness();
  const { state: s2, sys: sys2 } = h2;
  s2.simTime = POWER_SITUATION_FIRST_S + 1;
  sys2._tickPowerSituations(s2);
  assert.ok(h2.spawned.length > 0);
  s2.simTime = POWER_SITUATION_WINDOW_S + 1;
  sys2._tickPowerSituations(s2);
  assert.equal(s2.onboarding.powerSit.active, null, 'live setup expires past the window');
  assert.equal(s2.onboarding.powerSit.next, POWER_SITUATIONS.length, 'ladder exhausted');
  const before = h2.spawned.length;
  s2.simTime += 60;
  sys2._tickPowerSituations(s2);
  assert.equal(h2.spawned.length, before, 'nothing new after the window');
});
