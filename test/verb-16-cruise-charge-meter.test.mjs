// VERB-16: the cruise charge has a meter on the verb shelf (INFERENCE_IDEAS.md).
//
// The rail owns no cruise clock — readRailModel reads the cruise writer through
// cruiseChargeProgress/isCharging/isCruising, so the shelf shows 0→1 while charging
// and the engaged state after. Charge time itself is untouched (cruise.js owns it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { readRailModel } from '../src/ui/powerRail.js';
import { cruise, cruiseChargeProgress } from '../src/systems/cruise.js';

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: { defId: 'ship_kestrel' } };
  state.entities.set(1, player);
  state.entityList = [player];
  state.playerId = 1;
  state.player.cruise = { phase: 'off', t: 0, stumbleT: 0, stumbleCdT: 0 };
  if (!state.input) state.input = {};
  if (!state.input.actions) state.input.actions = {};
  state.input.actions.cruise = false;
  return state;
}

test('idle rail shows off, zero progress, not engaged', () => {
  const state = boot();
  const model = readRailModel(state, state.simTime || 0);
  assert.equal(model.cruiseChargeProgress, 0);
  assert.equal(model.cruiseEngaged, false);
  assert.equal(model.cruiseCharging, false);
  assert.equal(model.cruiseState, 'off');
});

test('mid-charge progress reads half and the shelf says charging', () => {
  const state = boot();
  state.player.cruise = { phase: 'charging', t: 1.5, stumbleT: 0, stumbleCdT: 0 };
  assert.equal(cruiseChargeProgress(state), 0.5);
  const model = readRailModel(state, state.simTime || 0);
  assert.equal(model.cruiseChargeProgress, 0.5);
  assert.equal(model.cruiseCharging, true);
  assert.equal(model.cruiseEngaged, false);
  assert.equal(model.cruiseState, 'charging');
});

test('seed-4242 drive: V starts the spool, 0→1 rises over the charge, then engaged', () => {
  const state = boot();
  const emitted = [];
  const host = Object.create(cruise);
  host.init({ state, bus: { on() { return () => {}; }, emit(name, p) { emitted.push(name); } }, helpers: {} });
  const tick = (dt) => { state.tick += 1; host.update(dt, state); };
  const model = () => readRailModel(state, state.simTime || 0);

  state.input.actions.cruise = true;
  tick(1 / 60);
  state.input.actions.cruise = false;
  assert.equal(state.player.cruise.phase, 'charging');
  assert.equal(model().cruiseCharging, true);

  let prev = 0;
  for (let i = 0; i < 90; i++) {
    tick(1 / 60);
    const p = model().cruiseChargeProgress;
    assert.ok(p >= prev, `progress never runs backward (${prev} → ${p})`);
    prev = p;
  }
  assert.ok(prev > 0.4 && prev < 0.7, `mid-spool reads about half, got ${prev}`);

  for (let i = 0; i < 120; i++) tick(1 / 60);
  assert.equal(state.player.cruise.phase, 'cruising');
  assert.ok(emitted.includes('cruise:engaged'), 'the engage event fired');
  const done = model();
  assert.equal(done.cruiseEngaged, true);
  assert.equal(done.cruiseCharging, false);
  assert.equal(done.cruiseState, 'cruising');
});

test('existing slots are untouched by the cruise meter', () => {
  const state = boot();
  const model = readRailModel(state, state.simTime || 0);
  for (let i = 1; i <= 9; i++) assert.ok(model[i] && typeof model[i].state === 'string', `slot ${i} still reads`);
});

test('pressure log stays bounded under beam-rate fire', () => {
  const state = boot();
  state.simTime = 1000;
  const host = Object.create(cruise);
  host.init({ state, bus: { on() { return () => {}; }, emit() {} }, helpers: {} });
  host.state = state;
  for (let i = 0; i < 600; i++) {
    state.simTime = 1000 + i * (1 / 60);
    host._recordWeaponPressure(1);
  }
  assert.ok(state.player.cruise.hitLog.length <= 256, `log capped, got ${state.player.cruise.hitLog.length}`);
});
