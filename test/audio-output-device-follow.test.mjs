// Board row 301 (AUDIO-DEVICE-FOLLOW): the mix follows an output-device change without a silent
// launch or doubled loops. Nothing in src/ or electron/ handled devicechange before this.

import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';
import {
  DEVICE_CHANGE_SETTLE_MS,
  bindOutputDeviceFollow,
  planDeviceChange,
  planSinkRebind,
} from '../src/audio/outputDeviceFollow.js';

function host(ctx, over = {}) {
  const h = Object.create(audio);
  h.bus = { emitted: [], emit(name, payload) { this.emitted.push([name, payload]); } };
  h._isMuted = () => over.muted === true;
  h._resumeMusicSchedulers = () => { h.schedulerResumes = (h.schedulerResumes || 0) + 1; };
  h._startFrameLoop = () => { h.frameLoopStarts = (h.frameLoopStarts || 0) + 1; };
  h.rt = {
    ctx,
    _lifecycleSuspended: over.lifecycleSuspended === true,
    _resumeAfterLifecycle: false,
    _resumePromise: null,
    _contextEverRan: over.everRan !== false,
    _lastWallTime: 5,
    stems: { A: null, B: null, C: null, D: null },
  };
  return h;
}

function fakeCtx(state) {
  return {
    state,
    resumes: 0,
    resume() { this.resumes += 1; this.state = 'running'; return Promise.resolve(); },
  };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

test('the plan: only a context that ran, stopped, and is not lifecycle-held is resumed', () => {
  const ran = { everRan: true, lifecycleSuspended: false, muted: false };
  assert.equal(planDeviceChange({ ...ran, ctxState: 'suspended' }), 'resume');
  assert.equal(planDeviceChange({ ...ran, ctxState: 'interrupted' }), 'resume');
  assert.equal(planDeviceChange({ ...ran, ctxState: 'running' }), 'none', 'a running context followed the default sink on its own');
  assert.equal(planDeviceChange({ ...ran, ctxState: 'closed' }), 'none');
  assert.equal(planDeviceChange({ ...ran, ctxState: undefined }), 'none');
  assert.equal(planDeviceChange({ ...ran, ctxState: 'suspended', everRan: false }), 'none',
    'SILENT LAUNCH: a device event is not a gesture, an autoplay-locked context stays locked');
  assert.equal(planDeviceChange({ ...ran, ctxState: 'suspended', lifecycleSuspended: true }), 'none',
    'a hidden page resumes through resumeFromLifecycle, not through a device event');
  assert.equal(planDeviceChange({ ...ran, ctxState: 'suspended', muted: true }), 'none');
});

test('a stopped, previously-running context resumes through the lifecycle owner and restarts its loops', async () => {
  const ctx = fakeCtx('suspended');
  const h = host(ctx);
  assert.equal(h._onOutputDeviceChange(), 'resume');
  await settle();
  assert.equal(ctx.resumes, 1, 'resumed exactly once');
  assert.equal(ctx.state, 'running');
  assert.equal(h.rt.ctx, ctx, 'the context is the same object: never rebuilt, so no second set of loops');
  assert.equal(h.schedulerResumes, 1, 'the paused music schedulers restart once');
  assert.equal(h.frameLoopStarts, 1, 'the frame loop restarts once');
  assert.equal(h.bus.emitted.length, 1);
  assert.equal(h.bus.emitted[0][0], 'audio:outputDeviceChanged');
  assert.equal(h.bus.emitted[0][1].action, 'resume');
  assert.equal(h.bus.emitted[0][1].state, 'running');
});

test('a burst of device events resumes once, not once per event', async () => {
  const ctx = fakeCtx('suspended');
  const h = host(ctx);
  assert.equal(h._onOutputDeviceChange(), 'resume');
  assert.equal(h._onOutputDeviceChange(), 'none', 'the second event finds a context that is already moving');
  await settle();
  assert.equal(ctx.resumes, 1);
  assert.equal(h.frameLoopStarts, 1);
});

test('a context that never ran stays locked and nothing is emitted as a launch', async () => {
  const ctx = fakeCtx('suspended');
  const h = host(ctx, { everRan: false });
  assert.equal(h._onOutputDeviceChange(), 'none');
  await settle();
  assert.equal(ctx.resumes, 0, 'no silent launch');
  assert.equal(ctx.state, 'suspended');
  assert.notEqual(h.rt._resumeAfterLifecycle, true);
});

test('a running context retargets the default sink without a second context or a resume', () => {
  const ctx = fakeCtx('running');
  const sinks = [];
  ctx.setSinkId = (id) => { sinks.push(id); return Promise.resolve(); };
  const h = host(ctx);
  assert.equal(h._onOutputDeviceChange(), 'none', 'already running: resume is not a second start');
  assert.deepEqual(sinks, [''], 'the same context follows the OS default output');
  assert.equal(ctx.resumes, 0);
  assert.equal(h.rt.ctx, ctx);
  assert.equal(h.frameLoopStarts, undefined);
  assert.deepEqual(h.bus.emitted, [['audio:outputDeviceChanged', { action: 'none', sink: 'rebind-default', state: 'running' }]]);
});

test('a stopped context retargets and then resumes once', async () => {
  const ctx = fakeCtx('suspended');
  const sinks = [];
  ctx.setSinkId = (id) => { sinks.push(id); return Promise.resolve(); };
  const h = host(ctx);
  assert.equal(h._onOutputDeviceChange(), 'resume');
  await settle();
  assert.deepEqual(sinks, ['']);
  assert.equal(ctx.resumes, 1);
  assert.equal(h.rt.ctx, ctx, 'retarget does not replace the context');
  assert.equal(h.schedulerResumes, 1);
});

test('an unlocked-never or muted context does not open a device', () => {
  const locked = fakeCtx('suspended');
  locked.setSinkId = () => { throw new Error('must not open'); };
  const h = host(locked, { everRan: false });
  assert.equal(h._onOutputDeviceChange(), 'none');
  const muted = fakeCtx('running');
  let calls = 0;
  muted.setSinkId = () => { calls += 1; return Promise.resolve(); };
  const hm = host(muted, { muted: true });
  assert.equal(hm._onOutputDeviceChange(), 'none');
  assert.equal(calls, 0);
  assert.equal(planSinkRebind({
    ctxState: 'running', everRan: true, muted: false, lifecycleSuspended: true, setSinkIdAvailable: true,
  }), 'none');
  assert.equal(planSinkRebind({
    ctxState: 'closed', everRan: true, muted: false, lifecycleSuspended: false, setSinkIdAvailable: true,
  }), 'none');
});

test('a running context is left alone, and no context at all is a no-op', () => {
  const ctx = fakeCtx('running');
  const h = host(ctx);
  assert.equal(h._onOutputDeviceChange(), 'none');
  assert.equal(ctx.resumes, 0);
  const bare = host(null);
  assert.equal(bare._onOutputDeviceChange(), 'none');
  assert.deepEqual(bare.bus.emitted, []);
});

test('the binder settles a burst into one call and unbinds cleanly', () => {
  const listeners = new Map();
  const mediaDevices = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const timers = [];
  let next = 1;
  const setTimer = (fn, ms) => { const id = next++; timers.push({ id, fn, ms }); return id; };
  const clearTimer = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  let calls = 0;
  const unbind = bindOutputDeviceFollow({ mediaDevices, onChange: () => { calls += 1; }, setTimer, clearTimer });
  const fire = listeners.get('devicechange');
  assert.equal(typeof fire, 'function');
  fire(); fire(); fire();
  assert.equal(timers.length, 1, 'only the newest settle timer is pending');
  assert.equal(timers[0].ms, DEVICE_CHANGE_SETTLE_MS);
  const fired = timers.shift();
  fired.fn();
  assert.equal(calls, 1);
  fire();
  assert.equal(timers.length, 1, 'a new burst arms a new settle');
  unbind();
  assert.equal(listeners.has('devicechange'), false);
  assert.equal(timers.length, 0, 'unbinding cancels a pending settle');
  assert.doesNotThrow(() => bindOutputDeviceFollow({ mediaDevices: null, onChange: () => {} })());
  assert.doesNotThrow(() => bindOutputDeviceFollow({ mediaDevices, onChange: null })());
});

test('the audio system binds on init and unbinds on destroy', () => {
  const h = host(fakeCtx('running'));
  let bound = 0;
  let unbound = 0;
  h._bindOutputDeviceFollow = audio._bindOutputDeviceFollow;
  const listeners = new Set();
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        addEventListener: (name, fn) => { bound += 1; listeners.add(fn); },
        removeEventListener: (name, fn) => { unbound += 1; listeners.delete(fn); },
      },
    },
  });
  try {
    h._bindOutputDeviceFollow();
    assert.equal(bound, 1);
    assert.equal(typeof h.rt._unbindOutputDeviceFollow, 'function');
    h._bindOutputDeviceFollow();
    assert.equal(bound, 2, 're-binding replaces the previous listener');
    assert.equal(unbound, 1, 'the previous listener was removed first');
    h._unbindOutputDeviceFollow();
    assert.equal(unbound, 2);
    assert.equal(listeners.size, 0);
    assert.equal(h.rt._unbindOutputDeviceFollow, null);
  } finally {
    if (original === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original });
  }
});

test('the real init subscribes to device changes and the real destroy removes the subscription', async () => {
  // Review R08: the test above calls the private binders directly, so it passed with both lifecycle
  // hooks deleted. This one drives audio.init / audio.destroy themselves.
  const { createBus } = await import('../src/core/eventBus.js');
  const listeners = new Map();
  const mediaDevices = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true, writable: true });
  const player = {
    id: 1, isPlayer: true, alive: true, type: 'ship', team: 'player', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, shield: 100, shieldMax: 100, flags: {},
  };
  const state = {
    playerId: 1, tick: 0, simTime: 0,
    entities: new Map([[1, player]]), entityList: [player],
    player: { credits: 0, fuel: 100, cruise: { phase: 'idle' }, cargo: { items: {} } },
    input: { moveX: 0, moveZ: 0, brake: false, fire: false, actions: {} },
    world: { currentSectorId: 'sector_helios_prime', sectors: {}, activeSector: { stations: [] } },
    settings: {
      audio: { muted: true, master: 0.5, sfx: 0.7, music: 0.3, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 0.7, comms: 0.7 },
      video: { motionReduce: true },
      accessibility: { audioCues: true, captions: false },
    },
    ui: { docked: false, screenStack: [] },
  };
  try {
    try { audio.destroy(); } catch (_) { /* a prior test may have left the singleton un-initialised */ }
    audio.init({ state, bus: createBus(), helpers: {} });
    assert.equal(typeof listeners.get('devicechange'), 'function', 'init must subscribe to devicechange by default');
    audio.destroy();
    assert.equal(listeners.has('devicechange'), false, 'destroy must remove the devicechange subscription');
    assert.equal(audio.rt?._unbindOutputDeviceFollow ?? null, null, 'no dangling unbinder is left on the runtime');
  } finally {
    try { audio.destroy(); } catch (_) { /* already destroyed */ }
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
});
