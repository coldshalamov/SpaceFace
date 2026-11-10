// D37 — the works-screen fault strip must clear whenever ANY rebuild resolves, not only the
// screen-initiated one. The D34 watchdog's retry rebuild is fire-and-forget inside the
// lifecycle (`void rebuild(lastDesired)`), and a late template settle after a loud 'failed'
// still mounts the live generation — before this fix the strip sat over a live, dressed
// network until the next rebuildOverlays-triggering event. The lifecycle therefore reports
// every LIVE attempt's terminal settle through `onRebuildSettled`; superseded attempts stay
// silent. The loud path is preserved: a settle into 'failed' keeps the strip up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createConduitMountLifecycle } from '../src/ui/asteroid/asteroidRenderer3d.js';

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

const handle = (tag) => ({
  ids: [tag], instantiate: (id) => ({ id, tag }), release: () => true,
});

test('a watchdog retry that mounts reports an authored settle, clearing the strip', async () => {
  const clock = manualScheduler();
  const timeline = [];
  const deferreds = [];
  let calls = 0;
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => {
      calls += 1;
      if (calls === 1) return new Promise(() => {}); // the D34 starvation repro: never settles
      return new Promise((resolve) => deferreds.push(resolve)); // the retry's re-acquisition
    },
    scheduleWatchdog: clock.schedule,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => timeline.push(`watchdog:${kind}`),
    onRebuildSettled: (result) => timeline.push(`settled:${result.status}`),
  }));
  // This promise is the SCREEN's rebuild — the strip-clearing path that already worked.
  void lifecycle.rebuild([{ assetId: 'lane-end' }]);
  clock.fireOne();
  assert.deepEqual(timeline, ['watchdog:retry'], 'the retry raises the strip first');
  assert.equal(lifecycle.stats().phase, 'loading');

  // The retry's own rebuild — a promise nobody outside the lifecycle holds — settles authored.
  deferreds.pop()(handle('lane-end'));
  await flush();

  assert.equal(lifecycle.stats().phase, 'authored');
  assert.deepEqual(timeline, ['watchdog:retry', 'settled:authored'],
    'the fire-and-forget retry rebuild still reports the settle that clears the strip');
});

test('a late settle after the loud failure clears the strip once the live network mounts', async () => {
  const clock = manualScheduler();
  const timeline = [];
  const deferreds = [];
  const mounted = new Set();
  let calls = 0;
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => {
      calls += 1;
      if (calls === 1) return Promise.resolve(handle('old'));
      return new Promise((resolve) => deferreds.push(resolve));
    },
    mount: (record) => { mounted.add(record.source.tag); },
    unmount: (record) => { mounted.delete(record.source.tag); },
    scheduleWatchdog: clock.schedule,
    watchdogTimeoutMs: 1000,
    watchdogMaxRetries: 2,
    onWatchdogEvent: (kind) => timeline.push(`watchdog:${kind}`),
    onRebuildSettled: (result) => timeline.push(`settled:${result.status}`),
  }));
  void lifecycle.rebuild([{ assetId: 'old' }]);
  await flush();
  assert.deepEqual(timeline, ['settled:authored']);

  void lifecycle.rebuild([{ assetId: 'new' }]);
  clock.fireAll(); // retry, retry, loud failure — the strip is up and the budget is spent
  assert.deepEqual(timeline.slice(1), ['watchdog:retry', 'watchdog:retry', 'watchdog:failed']);
  assert.equal(lifecycle.stats().phase, 'failed');
  assert.deepEqual([...mounted], ['old'], 'the watchdog never unmounts the visible network');

  // The stalled acquisitions finally settle. Superseded attempts resolve 'cancelled' and must
  // NOT touch the glass; the live generation mounts the late arrival and reports 'authored'.
  while (deferreds.length) {
    deferreds.shift()(handle('new'));
    await flush();
  }
  assert.equal(lifecycle.stats().phase, 'authored');
  assert.ok(mounted.has('new'), 'the late settle mounted a fully working network');
  assert.equal(timeline.at(-1), 'settled:authored',
    'the last word to the glass is authored — the strip clears over the live network');
  assert.equal(timeline.filter((e) => e === 'settled:authored').length, 2,
    'the superseded retry attempts reported nothing while the live attempt was failed');
});

test('a genuinely failed mount still reports failed, keeping the loud strip up', async () => {
  const settles = [];
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => Promise.resolve(null), // loader closed / lease dead: mount fails
    onRebuildSettled: (result) => settles.push(result.status),
  }));
  const result = await lifecycle.rebuild([{ assetId: 'power-straight' }]);
  assert.equal(result.status, 'failed');
  assert.equal(lifecycle.stats().phase, 'failed');
  assert.match(lifecycle.stats().failure, /unavailable/u);
  assert.deepEqual(settles, ['failed'],
    'a real mount failure reaches the glass as failed — the hard strip stays loud');
});

test('an emptied board and a recovering rebuild both reach the strip through the same hook', async () => {
  const settles = [];
  const deferreds = [];
  let calls = 0;
  const lifecycle = createConduitMountLifecycle(baseOptions({
    acquireTemplates: () => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('decode blew up'));
      return new Promise((resolve) => deferreds.push(resolve));
    },
    onRebuildSettled: (result) => settles.push(result.status),
  }));
  await lifecycle.rebuild([{ assetId: 'power-end' }]);
  assert.deepEqual(settles, ['failed']);

  await lifecycle.rebuild([]); // topology cleared while the fault was up
  assert.deepEqual(settles, ['failed', 'empty'], 'an empty settle clears the strip too');

  void lifecycle.rebuild([{ assetId: 'power-end' }]);
  deferreds.pop()(handle('power-end'));
  await flush();
  assert.deepEqual(settles, ['failed', 'empty', 'authored'],
    'a rebuild after a genuine failure recovers and reports authored');
});

test('the renderer wires every live rebuild settle to the fault strip', () => {
  const source = readFileSync(
    new URL('../src/ui/asteroid/asteroidRenderer3d.js', import.meta.url), 'utf8',
  );
  // The lifecycle reports terminal settles of the LIVE attempt from inside rebuild, so the
  // watchdog's fire-and-forget retry reaches the glass through the same rebuild function.
  assert.match(source, /onRebuildSettled = null/u, 'the lifecycle accepts the settle hook');
  assert.match(source, /return settled\(\{ status: 'authored'/u,
    'an authored mount reports its settle');
  assert.match(source, /return settled\(\{ status: 'empty'/u,
    'an emptied board reports its settle');
  assert.match(source, /return settled\(\{ status: 'failed'/u,
    'a genuine failure reports its settle');
  assert.match(source, /result\.status === 'cancelled'\) return result/u,
    'a superseded attempt never reports — the live attempt may be genuinely failed');
  const fireAt = source.indexOf('const fireWatchdog =');
  assert.ok(fireAt > 0, 'fireWatchdog exists');
  assert.match(source.slice(fireAt, fireAt + 900), /void rebuild\(lastDesired\)/u,
    'the watchdog retry is still the same fire-and-forget rebuild — now reported by the hook');

  // The renderer maps the settle stream onto the strip: authored/empty clears, failed stays.
  const lifecycleAt = source.indexOf('function ensureConduitMountLifecycle()');
  assert.ok(lifecycleAt > 0, 'ensureConduitMountLifecycle exists');
  const lifecycleBody = source.slice(lifecycleAt, source.indexOf('function disposeOverlayParts', lifecycleAt));
  assert.match(lifecycleBody, /onRebuildSettled:\s*onConduitMountSettled/u,
    'the renderer registers the settle hook on the lifecycle');
  const handlerAt = source.indexOf('function onConduitMountSettled(');
  assert.ok(handlerAt > 0, 'the settle handler exists');
  const handlerBody = source.slice(handlerAt, source.indexOf('\n  }', handlerAt));
  assert.match(handlerBody, /hideConduitMountFault\(\)/u,
    'an authored/empty settle hides the strip — the D37 fix');
  assert.match(handlerBody, /showConduitMountFault\('failed'\)/u,
    'a failed settle keeps the loud path: the hard strip still shows');
  assert.match(handlerBody, /'cancelled'/u,
    'a stale-attempt settle is ignored by the strip');
});
