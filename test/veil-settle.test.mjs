import test from 'node:test';
import assert from 'node:assert/strict';
import { createVeilSettle } from '../src/render/veilSettle.js';

function harness() {
  let t = 0; const cbs = [];
  const host = { requestIdleCallback: (cb) => { cbs.push(cb); return cbs.length; } };
  const idle = (ms) => { const q = cbs.splice(0); for (const cb of q) cb({ didTimeout: false, timeRemaining: () => ms }); };
  return { host, idle, now: () => t, advance: (ms) => { t += ms; } };
}

test('veil settle is 0 before the first picture and when the veil is not held', () => {
  const h = harness(); const render = { flightVeilHoldsSim: false, firstPlayableFrameAt: 5 };
  const p = createVeilSettle(render, { host: h.host, now: h.now });
  assert.equal(p(), 0);
  render.flightVeilHoldsSim = true; render.firstPlayableFrameAt = null;
  assert.equal(p(), 0);
});

test('veil settle holds one unit until min time and idle periods, then releases', () => {
  const h = harness(); const render = { flightVeilHoldsSim: true, firstPlayableFrameAt: 1 };
  const p = createVeilSettle(render, { host: h.host, now: h.now });
  assert.equal(p(), 1);
  h.idle(40); h.idle(40); h.idle(40);
  assert.equal(p(), 1, 'minimum veiled time not reached');
  h.advance(1300);
  assert.equal(p(), 0);
  assert.equal(render.veilSettle.capped, false);
});

test('veil settle is bounded by its cap even when the main thread never idles', () => {
  const h = harness(); const render = { flightVeilHoldsSim: true, firstPlayableFrameAt: 1 };
  const p = createVeilSettle(render, { host: h.host, now: h.now });
  assert.equal(p(), 1); h.idle(2); h.advance(2000); assert.equal(p(), 1);
  h.advance(700); assert.equal(p(), 0); assert.equal(render.veilSettle.capped, true);
});

test('veil settle re-arms for the next veil', () => {
  const h = harness(); const render = { flightVeilHoldsSim: true, firstPlayableFrameAt: 1 };
  const p = createVeilSettle(render, { host: h.host, now: h.now });
  p(); h.advance(3000); assert.equal(p(), 0);
  render.flightVeilHoldsSim = false; assert.equal(p(), 0);
  render.flightVeilHoldsSim = true; assert.equal(p(), 1);
});
