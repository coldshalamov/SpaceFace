import test from 'node:test';
import assert from 'node:assert/strict';
import { createVeiledFoundryEnvDrainScheduler } from '../src/core/veiledFoundryEnvDrain.js';

function harness() {
  let serial = 0, calls = 0;
  const frames = new Map(), timers = new Map(), listeners = new Set();
  const host = {
    requestAnimationFrame: fn => { const id = serial++; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, delay) => { const id = serial++; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const bus = { on(type, fn) { assert.equal(type, 'mode:changed'); listeners.add(fn); return () => listeners.delete(fn); } };
  const render = { renderer: {}, _foundryEnvPending: true,
    _drainFoundryEnvPending() { assert.equal(this, render); calls++; this._foundryEnvPending = false; } };
  const state = { mode: 'loading', render };
  const schedule = createVeiledFoundryEnvDrainScheduler(host);
  const fireFrame = () => { const entry = frames.entries().next().value; assert.ok(entry); frames.delete(entry[0]); entry[1](); };
  const fireTimer = delay => { const entry = [...timers].find(([, timer]) => timer.delay === delay); assert.ok(entry, `timer ${delay}`); timers.delete(entry[0]); entry[1].fn(); };
  const mode = value => { state.mode = value; for (const fn of [...listeners]) fn({ mode: value }); };
  const clean = () => { assert.equal(frames.size, 0); assert.equal(timers.size, 0); assert.equal(listeners.size, 0); };
  return { host, bus, render, state, schedule, frames, timers, listeners, fireFrame, fireTimer, mode, clean, calls: () => calls };
}

test('Launch and the animation callback never bake synchronously', () => {
  const h = harness(); h.schedule(h.state, h.bus); assert.equal(h.calls(), 0);
  h.fireFrame(); assert.equal(h.calls(), 0); h.fireTimer(0);
  assert.equal(h.calls(), 1); h.clean();
});
test('starved rAF fallback cancels the stranded frame and runs once', () => {
  const h = harness(); h.schedule(h.state, h.bus);
  const stale = [...h.frames.values()][0]; h.fireTimer(100);
  assert.equal(h.calls(), 0); stale(); h.fireTimer(0); stale();
  assert.equal(h.calls(), 1); h.clean();
});
for (const kind of ['absent', 'throws']) test(`rAF ${kind} still makes bounded progress`, () => {
  const h = harness(); h.host.requestAnimationFrame = kind === 'absent' ? undefined : () => { throw Error('compositor unavailable'); };
  h.schedule(h.state, h.bus); h.fireTimer(100); h.fireTimer(0);
  assert.equal(h.calls(), 1); h.clean();
});
for (const phase of ['frame', 'task']) test(`explicit cancellation cleans up during ${phase}`, () => {
  const h = harness(); const cancel = h.schedule(h.state, h.bus);
  if (phase === 'task') h.fireFrame();
  cancel(); cancel(); assert.equal(h.calls(), 0); assert.equal(h.render._foundryEnvPending, true); h.clean();
});
for (const mode of ['menu', 'flight']) test(`leaving loading for ${mode} revokes queued work`, () => {
  const h = harness(); h.schedule(h.state, h.bus); h.fireFrame();
  const stale = [...h.timers.values()][0].fn; h.mode(mode); stale();
  assert.equal(h.calls(), 0); assert.equal(h.render._foundryEnvPending, true); h.clean();
});
test('cancelled session cannot bake during a later loading session', () => {
  const h = harness(); h.schedule(h.state, h.bus); h.fireFrame();
  const stale = [...h.timers.values()][0].fn;
  h.mode('menu'); h.mode('loading'); h.schedule(h.state, h.bus); stale();
  assert.equal(h.calls(), 0); h.fireFrame(); h.fireTimer(0); assert.equal(h.calls(), 1); h.clean();
});
test('rescheduling replaces rather than accumulates callbacks and listeners', () => {
  const h = harness(); h.schedule(h.state, h.bus);
  const stale = [...h.frames.values()][0]; h.schedule(h.state, h.bus); stale();
  assert.equal(h.frames.size, 1); assert.equal(h.timers.size, 1); assert.equal(h.listeners.size, 1);
  h.fireFrame(); h.fireTimer(0); assert.equal(h.calls(), 1); h.clean();
});
for (const kind of ['render', 'renderer', 'generation', 'bake', 'pending', 'mode']) test(`revalidates ${kind} immediately before baking`, () => {
  const h = harness(); h.schedule(h.state, h.bus); h.fireFrame();
  if (kind === 'render') h.state.render = { ...h.render };
  if (kind === 'renderer') h.render.renderer = {};
  if (kind === 'generation') h.render.admissionRunGeneration = 2;
  if (kind === 'bake') h.render._drainFoundryEnvPending = () => assert.fail('replacement bake');
  if (kind === 'pending') h.render._foundryEnvPending = false;
  if (kind === 'mode') h.state.mode = 'flight';
  h.fireTimer(0); assert.equal(h.calls(), 0); h.clean();
});
test('optional bake failure leaves pending state for another seam, with no timer leak', () => {
  const h = harness(); h.render._drainFoundryEnvPending = () => { throw Error('GPU lost'); };
  h.schedule(h.state, h.bus); h.fireFrame(); assert.doesNotThrow(() => h.fireTimer(0));
  assert.equal(h.render._foundryEnvPending, true); h.clean();
});
test('an unarmed reschedule cancels previous work too', () => {
  const h = harness(); h.schedule(h.state, h.bus); h.render._foundryEnvPending = false;
  h.schedule(h.state, h.bus)(); assert.equal(h.calls(), 0); h.clean();
});
test('no renderer or drain method creates no scheduler work', () => {
  const h = harness(); delete h.state.render; h.schedule(h.state, h.bus)(); h.clean();
  h.state.render = { _foundryEnvPending: true }; h.schedule(h.state, h.bus)(); h.clean();
});
test('id zero is cancelled, not mistaken for an absent handle', () => {
  const h = harness(); h.schedule(h.state, h.bus); assert.ok(h.timers.has(0)); h.mode('menu'); h.clean();
});
test('independent states do not cancel one another', () => {
  const h = harness(); const second = { mode: 'loading', render: { ...h.render, _drainFoundryEnvPending() { this._foundryEnvPending = false; } } };
  const cancelFirst = h.schedule(h.state), cancelSecond = h.schedule(second);
  cancelFirst(); assert.equal(h.frames.size, 1); h.fireFrame(); h.fireTimer(0);
  assert.equal(second.render._foundryEnvPending, false); assert.equal(h.render._foundryEnvPending, true);
  cancelSecond(); h.clean();
});
