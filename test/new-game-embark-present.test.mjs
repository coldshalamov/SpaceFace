import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { armCallbackAfterPresent } from '../src/render/compilePresentSlice.js';
import { parseUniverseSeed } from '../src/ui/screens/newGame.js';

// Exercise the screen's actual methods with its real post-present scheduler, without
// constructing the whole UI, loading assets, or creating a WebGL context.
const source = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
const emitAt = source.indexOf('  _emitEmbarkSpec() {');
const showAt = source.indexOf('  onShow(ctx) {');
const methods = source.slice(emitAt, source.indexOf('\n\n  _setStarter', emitAt))
  + source.slice(showAt, source.lastIndexOf('\n};'));
assert.ok(emitAt >= 0 && showAt >= 0);

function fixture({ frames = true } = {}) {
  const previous = Object.fromEntries(['requestAnimationFrame', 'scheduler', 'setTimeout', 'clearTimeout']
    .map(key => [key, globalThis[key]]));
  const frameQueue = [];
  const tasks = [];
  const timers = new Map();
  const events = [];
  let now = 0;
  let nextTimer = 0;
  globalThis.requestAnimationFrame = frames ? callback => { frameQueue.push(callback); return frameQueue.length; } : undefined;
  globalThis.scheduler = { postTask: callback => { tasks.push(callback); } };
  globalThis.setTimeout = (callback, delay = 0) => {
    const id = ++nextTimer;
    timers.set(id, { callback, due: now + delay });
    return id;
  };
  globalThis.clearTimeout = id => timers.delete(id);
  const refs = {
    ctx: { bus: { emit: (type, payload) => events.push({ type, payload }) } },
    seed: { value: '47' }, specSeedRoll: 71, starter: { shipId: 'ship_kestrel' },
    setLaunching() {}, launchError: { hidden: false, textContent: '' }, cancelHullRelease() {},
    name: {}, title: {}, body: {}, stage: {}, foot: {},
  };
  const owner = new Function('initialRefs', 'armCallbackAfterPresent', 'parseUniverseSeed', `
    let refs = initialRefs;
    const NEW_GAME = { startingSectorId: 'sector_helios_prime' };
    const cue = () => {}, settle = () => {}, isPhoneLayout = () => true;
    return { screen: { ${methods} }, replaceRefs(next) { refs = next; } };
  `)(refs, armCallbackAfterPresent, parseUniverseSeed);
  const tick = target => {
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      now = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = target;
  };
  return { refs, screen: owner.screen, replaceRefs: owner.replaceRefs, events,
    frame() { const batch = frameQueue.splice(0); for (const callback of batch) callback(now); },
    tasks() { const batch = tasks.splice(0); for (const callback of batch) callback(); },
    tick,
    close() { for (const [key, value] of Object.entries(previous)) globalThis[key] = value; },
  };
}

test('embark speculation waits past the first frame and coalesces the latest fields', () => {
  const f = fixture();
  try {
    f.screen.onShow(f.refs.ctx);
    f.tick(0);
    assert.deepEqual(f.events, [], 'a timer task before first rAF cannot enumerate the opening');
    f.refs.seed.value = '1234';
    f.refs.starter.shipId = 'ship_mule';
    f.screen._emitEmbarkSpec();
    f.frame();
    assert.deepEqual(f.events, [], 'work does not run inside the paint callback');
    f.tasks();
    assert.deepEqual(f.events, [{ type: 'game:embarkSpeculation', payload: {
      sectorId: 'sector_helios_prime', seed: 1234, shipDefId: 'ship_mule',
    } }]);
    f.tick(200);
    f.tasks();
    assert.equal(f.events.length, 1, 'fallback arms cannot duplicate the delivered request');
  } finally { f.close(); }
});

test('hide cancels old speculation and a re-show owns a fresh request', () => {
  const f = fixture();
  try {
    f.screen.onShow(f.refs.ctx);
    f.screen.onHide();
    f.frame();
    f.tasks();
    assert.deepEqual(f.events, []);
    f.screen.onShow(f.refs.ctx);
    f.refs.seed.value = '';
    f.frame();
    f.tasks();
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].payload.seed, 71, 'blank still warms the exact pre-rolled launch seed');
  } finally { f.close(); }
});

test('an older hidden callback cannot clear the new show request', () => {
  const f = fixture();
  try {
    f.screen.onShow(f.refs.ctx);
    f.frame();
    f.screen.onHide();
    f.screen.onShow(f.refs.ctx);
    f.tasks();
    assert.deepEqual(f.events, []);
    assert.ok(f.screen._embarkSpecQueued, 'the old callback leaves its successor owned');
    f.frame();
    f.tasks();
    assert.equal(f.events.length, 1);
  } finally { f.close(); }
});

test('dispose and a replaced mount cannot receive a late speculation callback', () => {
  for (const retire of [f => f.screen.dispose(), f => f.replaceRefs({ ...f.refs })]) {
    const f = fixture();
    try {
      f.screen.onShow(f.refs.ctx);
      f.frame();
      retire(f);
      f.tasks();
      f.tick(200);
      f.tasks();
      assert.deepEqual(f.events, []);
    } finally { f.close(); }
  }
});

test('a document with throttled rAF and background tasks still delivers its owned warm', () => {
  const f = fixture();
  try {
    f.screen.onShow(f.refs.ctx);
    f.tick(47);
    assert.deepEqual(f.events, []);
    f.tick(96);
    assert.equal(f.events.length, 1, 'the bounded scheduler escapes an unpresented hidden document');
    f.frame();
    f.tasks();
    assert.equal(f.events.length, 1);
  } finally { f.close(); }
});

test('an unshown mount does not strand a pending request and legacy hosts still warm', () => {
  const f = fixture({ frames: false });
  try {
    f.screen._emitEmbarkSpec();
    f.tick(200);
    assert.deepEqual(f.events, []);
    assert.equal(f.screen._embarkSpecQueued, undefined);
    f.screen.onShow(f.refs.ctx);
    f.tick(200);
    f.tasks();
    assert.equal(f.events.length, 1);
  } finally { f.close(); }
});
