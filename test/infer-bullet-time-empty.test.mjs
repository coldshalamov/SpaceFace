// Holding bullet time on an empty meter has to say so, once, and must not dilate.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bulletTime } from '../src/systems/bulletTime.js';

function host(energy, { active = false, held = true } = {}) {
  const events = [];
  const state = {
    mode: 'flight',
    simTime: 2,
    input: { actions: { bulletTime: held } },
    runtime: { features: { massline2: { enabled: true, bulletTime: true } } },
    massline2: { bulletTime: { active, energy } },
  };
  const sys = Object.assign(Object.create(bulletTime), {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    timeEffects: { set() {}, clear() {} },
    _updateMomentPulse() {},
    _requireRelease: false,
    _emptyTold: false,
  });
  return { sys, state, events };
}

function texts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('an empty meter says to wait and does not engage', () => {
  const { sys, state, events } = host(0.05);
  sys.update(1 / 60, state);
  sys.update(1 / 60, state);
  assert.equal(state.massline2.bulletTime.active, false);
  assert.deepEqual(texts(events), ['Bullet time spent — let it refill']);
});

test('running the meter out says it is spent', () => {
  const { sys, state, events } = host(0.01, { active: true });
  sys.update(1, state);
  assert.equal(state.massline2.bulletTime.active, false);
  assert.deepEqual(texts(events), ['Bullet time spent']);
  assert.equal(events.some((event) => event.name === 'bulletTime:end'), true);
});

test('the refused hold stays off after the meter recovers', () => {
  const { sys, state, events } = host(0);
  for (let i = 0; i < 60; i += 1) sys.update(1 / 60, state);
  assert.equal(state.massline2.bulletTime.active, false);
  assert.ok(state.massline2.bulletTime.energy >= 0.15);
  assert.deepEqual(texts(events), ['Bullet time spent — let it refill']);
  state.input.actions.bulletTime = false;
  sys.update(1 / 60, state);
  state.input.actions.bulletTime = true;
  sys.update(1 / 60, state);
  assert.equal(state.massline2.bulletTime.active, true);
});

test('a meter that crosses the floor this tick still engages', () => {
  const { sys, state, events } = host(0.149);
  sys.update(1 / 60, state);
  assert.equal(state.massline2.bulletTime.active, true);
  assert.deepEqual(texts(events), []);
});

test('a full meter still engages', () => {
  const { sys, state, events } = host(1);
  sys.update(1 / 60, state);
  assert.equal(state.massline2.bulletTime.active, true);
  assert.deepEqual(texts(events), []);
  assert.equal(events.some((event) => event.name === 'bulletTime:start'), true);
});
