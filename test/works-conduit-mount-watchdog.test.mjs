// D34 — the works conduit mount must never sit silently in `loading`. If the template
// acquisition starves (shared admission queue) or a decode promise never settles, the mount
// watchdog retries the acquisition within a bounded budget and then fails LOUDLY: phase
// `failed` with a failure message, a retry/failed event for the renderer's on-glass signal.
// Red→green by construction: every behavior here was absent when this file was written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createConduitMountLifecycle } from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  WORKS_CONDUIT_TEMPLATE_IDS,
  WORKS_PARTS,
  createWorksPartLoader,
} from '../src/ui/asteroid/worksPartLoader.js';

// A scheduler the test fires by hand: no real timers, fully deterministic.
function manualScheduler({ honorCancel = true } = {}) {
  const pending = [];
  return {
    schedule(fire) {
      const entry = { fire };
      pending.push(entry);
      return () => {
        if (!honorCancel) return;
        const idx = pending.indexOf(entry);
        if (idx >= 0) pending.splice(idx, 1);
      };
    },
    fireAll() {
      while (pending.length) pending.shift().fire();
    },
    fireOne() {
      if (!pending.length) return false;
      pending.shift().fire();
      return true;
    },
    size: () => pending.length,
  };
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
};

function baseOptions(overrides = {}) {
  return {
    prepare: () => ({ ok: true }),
    mount: () => {},
    unmount: () => {},
    release: () => {},
    ...overrides,
  };
}

test('a stalled template acquisition is retried, then fails loudly within a bounded budget', () => {
  const clock = manualScheduler();
  const events = [];
  let mounts = 0;
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => new Promise(() => {}), // the D34 starvation repro: never settles
    mount: () => { mounts += 1; },
    scheduleWatchdog: clock.schedule,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => events.push(kind),
  }));
  void lifecycle.rebuild([{ assetId: 'power-straight' }, { assetId: 'lane-corner' }]);
  assert.equal(lifecycle.stats().phase, 'loading');

  clock.fireAll(); // budget: attempt -> retry -> retry -> loud failure

  const stats = lifecycle.stats();
  assert.deepEqual(events, ['retry', 'retry', 'failed']);
  assert.equal(stats.phase, 'failed', 'the mount must not stay in `loading` past the budget');
  assert.match(stats.failure, /watchdog/u, 'the failure names the watchdog, not a silent hang');
  assert.match(stats.failure, /3/u, 'the failure states the bounded budget that was spent');
  assert.equal(stats.desiredCount, 2, 'the desired topology stays visible on the failed state');
  assert.equal(mounts, 0, 'nothing mounts from a stalled acquisition');
});

test('a watchdog retry recovers the mount when the re-acquired templates settle', async () => {
  const clock = manualScheduler();
  const events = [];
  const deferreds = [];
  let calls = 0;
  let mountedId = null;
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => {
      calls += 1;
      if (calls === 1) return new Promise(() => {}); // first attempt starves
      return new Promise((resolve) => deferreds.push(resolve)); // retry re-acquires
    },
    mount: (record) => { mountedId = record.source.id; },
    scheduleWatchdog: clock.schedule,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => events.push(kind),
  }));
  void lifecycle.rebuild([{ assetId: 'lane-end' }]);
  clock.fireOne();
  assert.deepEqual(events, ['retry'], 'the watchdog retries instead of failing immediately');
  assert.equal(lifecycle.stats().phase, 'loading', 'a retry is still loading, not failed');

  deferreds.pop()({ ids: ['lane-end'], instantiate: (id) => ({ id }), release: () => true });
  await flush();

  const stats = lifecycle.stats();
  assert.equal(stats.phase, 'authored', 'the retried acquisition mounts when templates arrive');
  assert.equal(stats.failure, null);
  assert.equal(mountedId, 'lane-end');
});

test('a successful mount resets the retry budget and disarms the armed timer', async () => {
  const clock = manualScheduler();
  const events = [];
  const deferreds = [];
  let calls = 0;
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => deferreds.push(resolve));
      return new Promise((resolve) => deferreds.push(resolve));
    },
    scheduleWatchdog: clock.schedule,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => events.push(kind),
  }));
  const handle = () => ({ ids: ['x'], instantiate: (id) => ({ id }), release: () => true });

  void lifecycle.rebuild([{ assetId: 'power-end' }]);
  clock.fireOne(); // one retry spent by the stalled first attempt
  deferreds.pop()(handle()); // the retry's acquisition (the newest deferred) succeeds
  await flush();
  assert.equal(lifecycle.stats().phase, 'authored');
  assert.equal(clock.size(), 0, 'a completed attempt disarms its watchdog timer');

  // The next stall gets the FULL budget again: two retries before the loud failure.
  void lifecycle.rebuild([{ assetId: 'lane-end' }]);
  clock.fireAll();
  assert.deepEqual(events, ['retry', 'retry', 'retry', 'failed'],
    'success resets the budget; a spent budget would have failed one fire earlier');
  assert.equal(lifecycle.stats().phase, 'failed');
});

test('stale watchdog fires are inert', async () => {
  const clock = manualScheduler({ honorCancel: false }); // fires survive cancellation on purpose
  const events = [];
  const deferreds = [];
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => new Promise((resolve) => deferreds.push(resolve)),
    scheduleWatchdog: clock.schedule,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => events.push(kind),
  }));
  void lifecycle.rebuild([{ assetId: 'power-end' }]); // attempt 1 stalls, timer armed
  deferreds.shift()({ ids: ['power-end'], instantiate: (id) => ({ id }), release: () => true });
  void lifecycle.rebuild([{ assetId: 'lane-end' }]); // attempt 2 supersedes it
  deferreds.shift()({ ids: ['lane-end'], instantiate: (id) => ({ id }), release: () => true });
  await flush();
  assert.equal(lifecycle.stats().phase, 'authored');

  clock.fireAll(); // both stale timers fire
  assert.deepEqual(events, [], 'a stale or completed attempt never retries or fails');
  assert.equal(lifecycle.stats().phase, 'authored');
});

test('watchdog failure preserves the mounted batch, and a late template arrival still mounts', async () => {
  const clock = manualScheduler();
  const events = [];
  const released = [];
  const deferreds = [];
  const mounted = new Set();
  let calls = 0;
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          ids: ['old'], instantiate: (id) => ({ id, tag: 'old' }),
          release: () => { released.push('old'); return true; },
        });
      }
      return new Promise((resolve) => deferreds.push(resolve));
    },
    mount: (record) => { mounted.add(record.source.tag); },
    unmount: (record) => { mounted.delete(record.source.tag); },
    scheduleWatchdog: clock.schedule,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => events.push(kind),
  }));
  void lifecycle.rebuild([{ assetId: 'old' }]);
  await flush();
  assert.equal(lifecycle.stats().phase, 'authored');

  void lifecycle.rebuild([{ assetId: 'new' }]);
  clock.fireAll(); // retry, retry, loud failure — the mounted batch must survive all of it
  assert.equal(lifecycle.stats().phase, 'failed');
  assert.deepEqual([...mounted], ['old'], 'the visible network is never unmounted by the watchdog');
  assert.deepEqual(events, ['retry', 'retry', 'failed']);

  // The stalled attempts eventually settle: superseded ones release their template handle
  // exactly once; the newest generation is still live and mounts the late arrival.
  while (deferreds.length) {
    deferreds.shift()({
      ids: ['new'], instantiate: (id) => ({ id, tag: `late-${id}` }),
      release: () => { released.push('late'); return true; },
    });
    await flush();
  }
  const stats = lifecycle.stats();
  assert.equal(stats.phase, 'authored', 'a late arrival after a watchdog failure still mounts');
  assert.equal(released.filter((tag) => tag === 'late').length, 2,
    'the two superseded retry attempts release their template handles exactly once');
});

test('cancel disarms the watchdog and later fires are inert', () => {
  const clock = manualScheduler({ honorCancel: false });
  const events = [];
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => new Promise(() => {}),
    scheduleWatchdog: clock.schedule,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => events.push(kind),
  }));
  void lifecycle.rebuild([{ assetId: 'power-end' }]);
  lifecycle.cancel('disposed');
  assert.equal(lifecycle.stats().phase, 'disposed');
  clock.fireAll();
  assert.deepEqual(events, [], 'a cancelled mount never retries or fails');
  assert.equal(lifecycle.stats().phase, 'disposed');
});

test('the watchdog deadline is enforced by the frame tick even when timers never run', () => {
  // The contended-host case that timers alone miss: the page's setTimeout queue starves for the
  // whole settle window while rAF frames keep flowing. tick() is the renderer's frame heartbeat.
  let clockMs = 0;
  const events = [];
  const never = () => () => {}; // schedule that never fires — the starved setTimeout queue
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => new Promise(() => {}),
    scheduleWatchdog: never,
    now: () => clockMs,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => events.push(kind),
  }));
  void lifecycle.rebuild([{ assetId: 'power-straight' }]);

  lifecycle.tick();
  assert.deepEqual(events, [], 'before the deadline the tick is a no-op');

  clockMs = 1000;
  lifecycle.tick();
  assert.deepEqual(events, ['retry'], 'one tick past the deadline retries the acquisition');

  clockMs = 2000;
  lifecycle.tick();
  clockMs = 3000;
  lifecycle.tick();
  assert.deepEqual(events, ['retry', 'retry', 'failed'],
    'the tick drives the same bounded retry budget, then fails loudly');
  assert.equal(lifecycle.stats().phase, 'failed');
  assert.match(lifecycle.stats().failure, /watchdog/u);
});

test('the prewarm id list covers every conduit part either register can ask for', () => {
  assert.equal(WORKS_CONDUIT_TEMPLATE_IDS.length, 12);
  assert.equal(new Set(WORKS_CONDUIT_TEMPLATE_IDS).size, 12, 'ids are unique');
  for (const id of WORKS_CONDUIT_TEMPLATE_IDS) {
    const entry = WORKS_PARTS[id];
    assert.ok(entry, `${id} is registered in WORKS_PARTS`);
    assert.match(entry.binding, /^works-conduit-(power|lane)$/u, `${id} is an authored conduit part`);
    assert.equal(entry.lod0, entry.lod1, `${id} shares one release file, so prewarm covers both registers`);
  }
});

test('a prewarmed acquire makes the mount-time acquire a cache read, not a second decode', async () => {
  const loadedUrls = [];
  const blueprint = (assetId) => ({
    assetId,
    primitives: [{ name: `${assetId}_body`, geometry: {}, material: {}, matrix: { decompose() {} }, tags: {} }],
    markers: [],
  });
  const lease = {
    isActive: () => true,
    load(url, options = {}) {
      loadedUrls.push(`${url}::${options.slot || '*'}`);
      return Promise.resolve(blueprint(url));
    },
    release: () => 0,
  };
  const loader = createWorksPartLoader({ renderer: {}, lease });
  const prewarm = await loader.acquireWorksConduitTemplates(WORKS_CONDUIT_TEMPLATE_IDS);
  assert.ok(prewarm, 'the prewarm acquire succeeds');
  const prewarmLoads = loadedUrls.length;
  assert.ok(prewarmLoads > 0, 'the prewarm admitted its loads');

  const mount = await loader.acquireWorksConduitTemplates(WORKS_CONDUIT_TEMPLATE_IDS.slice(0, 4));
  assert.equal(loadedUrls.length, prewarmLoads, 'the mount-time acquire issued zero new lease loads');
  assert.deepEqual(mount.ids, WORKS_CONDUIT_TEMPLATE_IDS.slice(0, 4));
  prewarm.release();
  mount.release();
  loader.dispose('test');
});

test('the renderer prewarms the templates at loader creation and releases the retain at retirement', () => {
  const source = readFileSync(
    new URL('../src/ui/asteroid/asteroidRenderer3d.js', import.meta.url), 'utf8',
  );
  const ensureAt = source.indexOf('function ensureWorksLoader()');
  assert.ok(ensureAt > 0, 'ensureWorksLoader exists');
  const ensureBody = source.slice(ensureAt, source.indexOf('\n  }', source.indexOf('prewarmWorksConduitTemplates', ensureAt)));
  assert.match(ensureBody, /prewarmWorksConduitTemplates\(\)/u,
    'loader creation starts the conduit template prewarm');
  assert.match(source, /prewarmWorksConduitTemplates\(\)\s*\{/, 'the prewarm function exists');
  const retireAt = source.indexOf('function retireWorksAssets(');
  assert.ok(retireAt > 0, 'retireWorksAssets exists');
  const retireBody = source.slice(retireAt, retireAt + 900);
  assert.match(retireBody, /conduitPrewarm\.then/u,
    'loader retirement releases the prewarm retain');
});

test('the renderer wires the watchdog events to an on-glass fault strip', () => {
  const source = readFileSync(
    new URL('../src/ui/asteroid/asteroidRenderer3d.js', import.meta.url), 'utf8',
  );
  const lifecycleAt = source.indexOf('function ensureConduitMountLifecycle()');
  const lifecycleBody = source.slice(lifecycleAt, source.indexOf('}', source.indexOf('onWatchdogEvent', lifecycleAt)));
  assert.ok(lifecycleAt > 0, 'ensureConduitMountLifecycle exists');
  assert.match(lifecycleBody, /onWatchdogEvent:\s*\w+/u,
    'the mount lifecycle reports retry/failed events to the renderer');

  const styleAt = source.indexOf('.ast3d-conduit-fault');
  assert.ok(styleAt > 0, 'the renderer-owned style block carries the fault strip');
  const overlayAt = source.indexOf('function buildDomOverlay()');
  const overlayBody = source.slice(overlayAt, source.indexOf('\n  }', overlayAt));
  assert.match(overlayBody, /conduitFault/u, 'the overlay builds the fault strip element');
  const rebuildAt = source.indexOf('function rebuildOverlays(');
  const rebuildBody = source.slice(rebuildAt, source.indexOf('\n  }', rebuildAt));
  assert.match(rebuildBody, /hideConduitMountFault/u,
    'a successful authored mount clears the on-glass fault strip');
  assert.match(source, /conduitMountLifecycle\.tick\(\)/u,
    'the frame loop enforces the watchdog deadline when setTimeout starves');
  const prepareAt = source.indexOf('function prepareAuthoredOverlay(');
  assert.ok(prepareAt > 0, 'prepareAuthoredOverlay exists');
  const prepareBody = source.slice(prepareAt, source.indexOf('\n  }', source.indexOf('dressAuthoredConduitComponent(prepared', prepareAt)));
  assert.match(prepareBody, /dressAuthoredConduitComponent\(prepared/u,
    'a freshly mounted run is dressed at mount time, never left at default emissive');
});
