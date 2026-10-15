import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  collectAdmittedAuthoredReport,
  collectAuthoredLoaderDiagnostics,
  collectAuthoredReport,
  createAuthoredProbeCdpSession,
} from '../scripts/probe-authored-assets-live.mjs';

function fixture() {
  let now = 0, nextTimer = 0;
  const timers = new Map();
  class Socket extends EventTarget {
    sent = [];
    send(text) {
      if (this.failure) throw this.failure;
      this.sent.push(JSON.parse(text));
    }
    reply(id, result = {}, error) {
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id, result, error }) }));
    }
  }
  const socket = new Socket();
  const cdp = createAuthoredProbeCdpSession(socket, {
    now: () => now,
    setTimer(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer: id => timers.delete(id),
  });
  return { socket, cdp, timers,
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.fn(); }
      }
    } };
}

test('a silent evaluation rejects at the remaining phase budget with stage and method', async () => {
  const f = fixture();
  f.cdp.setStage('seeded flight session', 500);
  const pending = f.cdp.send('Runtime.evaluate', { awaitPromise: true });
  const rejected = assert.rejects(pending, /seeded flight session \/ Runtime.evaluate: no CDP reply within 500 ms/);
  f.advance(499);
  assert.equal(f.timers.size, 1);
  f.advance(1);
  await rejected;
  assert.equal(f.timers.size, 0);
  f.socket.reply(1, { late: true });
  await assert.rejects(f.cdp.send('Page.enable'), /stage deadline expired/);
  assert.equal(f.socket.sent.length, 1, 'an expired phase cannot send another request');
  f.cdp.dispose();
});

test('ordinary replies and protocol errors settle exact requests and clear their timers', async () => {
  const f = fixture();
  const first = f.cdp.send('Page.enable');
  const second = f.cdp.send('Runtime.enable');
  const rejected = assert.rejects(second, /CDP setup \/ Runtime.enable: fixture refusal/);
  f.socket.reply(2, {}, { message: 'fixture refusal' });
  assert.equal(f.timers.size, 1);
  f.socket.reply(1, { enabled: true });
  assert.deepEqual(await first, { enabled: true });
  await rejected;
  assert.equal(f.timers.size, 0);
  f.cdp.dispose();
});

test('socket close and error reject every pending request and reject later sends immediately', async () => {
  for (const type of ['close', 'error']) {
    const f = fixture();
    f.cdp.setStage('Helios approach admission', 150000);
    const first = assert.rejects(f.cdp.send('Runtime.evaluate'), new RegExp(`Helios approach admission / Runtime.evaluate: CDP socket ${type}`));
    const second = assert.rejects(f.cdp.send('Page.captureScreenshot'), new RegExp(`Page.captureScreenshot: CDP socket ${type}`));
    f.socket.dispatchEvent(new Event(type));
    await Promise.all([first, second]);
    assert.equal(f.timers.size, 0);
    await assert.rejects(f.cdp.send('Log.enable'), new RegExp(`CDP socket ${type}`));
    assert.equal(f.socket.sent.length, 2);
  }
});

test('cleanup rejects pending requests, removes event readers and leaves no request timers', async () => {
  const f = fixture();
  let eventReads = 0;
  f.cdp.onMessage(() => eventReads++);
  const pending = assert.rejects(f.cdp.send('Runtime.evaluate'), /CDP session disposed/);
  f.cdp.dispose(); f.cdp.dispose();
  await pending;
  assert.equal(f.timers.size, 0);
  f.socket.reply(1, { ignored: true });
  assert.equal(eventReads, 0);
});

test('unphased requests use a finite 45s maximum and synchronous send failures clear timers', async () => {
  const f = fixture();
  const timeout = assert.rejects(f.cdp.send('Page.enable'), /no CDP reply within 45000 ms/);
  f.advance(45000);
  await timeout;
  f.socket.failure = new Error('transport went away');
  await assert.rejects(f.cdp.send('Log.enable'), /CDP send failed: transport went away/);
  assert.equal(f.timers.size, 0);
  f.cdp.dispose();
});

test('asset-specific CDP labels retain one absolute report deadline and stop later sends', async () => {
  const f = fixture();
  const asset = 'assets/ships/release/parts/places/slow-authored-body.glb';
  f.cdp.setStage('authored ship report', 500);
  f.cdp.setStageLabel(`authored asset ${asset}`);
  const pending = assert.rejects(f.cdp.send('Runtime.evaluate'), new RegExp(
    `authored asset ${asset.replaceAll('/', '\\/')} \/ Runtime.evaluate: no CDP reply within 500 ms`,
  ));
  f.advance(499);
  assert.equal(f.timers.size, 1);
  f.advance(1);
  await pending;
  f.cdp.setStageLabel(`authored asset ${asset}`);
  await assert.rejects(f.cdp.send('Runtime.evaluate'), /authored asset .*stage deadline expired/);
  assert.equal(f.socket.sent.length, 1, 'an expired report budget cannot issue the next asset request');
  f.cdp.dispose();
});

test('startup failure reporting does not import loaders or request any new assets', async () => {
  let imports = 0;
  const cdp = { async send(method, params) {
    assert.equal(method, 'Runtime.evaluate');
    const value = await runInNewContext(params.expression, { window: {} }, {
      timeout: 1000,
      importModuleDynamically() { imports++; throw new Error('failure reporting may not import loaders'); },
    });
    return { result: { value } };
  } };
  const report = await collectAuthoredReport(cdp);
  assert.equal(imports, 0);
  assert.equal(report.loaderDiagnostics.skipped, true);
  assert.equal(report.loaderDiagnostics.available, false);
  assert.equal(report.shipCount, 0);
});

test('authored catalog diagnostics aggregate successful and failed part and whole-ship entries', async () => {
  const entries = [
    { slot: 'hull', url: 'assets/ships/release/parts/hulls/first.glb', wholeShip: false },
    { slot: 'cockpit', url: 'assets/ships/release/parts/cockpits/missing.glb', wholeShip: false },
    { slot: 'hull', url: 'assets/ships/release/parts/wholeships/second.glb', wholeShip: true },
  ];
  const replies = [
    { available: true, runtime: { ready: true }, release: true,
      partRoot: 'assets/ships/release/parts/', entries },
    { loaded: true, assetId: 'first', primitiveCount: 3, markerCount: 2 },
    { loaded: false, name: 'MissingAsset', message: 'not found' },
    { loaded: true, assetId: 'second', primitiveCount: 5, markerCount: 1 },
  ];
  const labels = [];
  const expressions = [];
  const cdp = {
    setStageLabel(label) { labels.push(label); },
    async send(method, params) {
      assert.equal(method, 'Runtime.evaluate');
      expressions.push(params.expression);
      const reply = replies.shift();
      return { result: { value: JSON.stringify(reply) } };
    },
  };

  const report = await collectAuthoredLoaderDiagnostics(cdp);
  assert.equal(replies.length, 0);
  assert.equal(expressions.length, 1 + entries.length);
  assert.deepEqual(labels, [
    'authored asset catalog',
    ...entries.map((entry) => `authored asset ${entry.url}`),
  ]);
  for (let i = 0; i < entries.length; i++) assert.ok(expressions[i + 1].includes(entries[i].url));
  assert.equal(report.available, true);
  assert.equal(report.declaredCount, 3);
  assert.equal(report.declaredPartCount, 2);
  assert.equal(report.loadedCount, 2);
  assert.equal(report.loadedSlots.hull, 1);
  assert.equal(report.wholeShipDeclaredCount, 1);
  assert.equal(report.wholeShipLoadedCount, 1);
  assert.equal(report.failureCount, 1);
  assert.deepEqual(report.failures, [{
    slot: 'cockpit',
    url: entries[1].url,
    name: 'MissingAsset',
    message: 'not found',
  }]);
  assert.equal(report.progress.totalEntries, 3);
  assert.equal(report.progress.completedEntries, 3);
  assert.equal(report.progress.lastCompletedUrl, entries[2].url);
  assert.equal(report.progress.failedUrl, null);
});

test('a stalled catalog asset reports its URL, elapsed time and completed progress without a passive read', async () => {
  const entries = [
    ...Array.from({ length: 5 }, (_, index) => ({
      slot: 'hull',
      url: `assets/ships/release/parts/hulls/part-${index}.glb`,
      wholeShip: false,
    })),
  ];
  let time = 0;
  let calls = 0;
  const labels = [];
  const expressions = [];
  const cdp = {
    setStageLabel(label) { labels.push(label); },
    async send(method, params) {
      assert.equal(method, 'Runtime.evaluate');
      expressions.push(params.expression);
      calls++;
      if (calls === 1) {
        time += 1;
        return { result: { value: JSON.stringify({ available: true, runtime: { ready: true },
          release: true, partRoot: 'assets/ships/release/parts/', entries }) } };
      }
      if (calls <= 5) {
        return { result: { value: JSON.stringify({ loaded: true, assetId: `part-${calls}`, primitiveCount: 3, markerCount: 1 }) } };
      }
      time += 44_979;
      throw new Error(`[authored-assets] authored asset ${entries[4].url} / Runtime.evaluate: no CDP reply within 44979 ms`);
    },
  };

  await assert.rejects(collectAdmittedAuthoredReport(cdp, true, { now: () => time }), (error) => {
    assert.match(error.message, new RegExp(entries[4].url.replaceAll('/', '\\/')));
    const payload = JSON.parse(error.message.slice(error.message.indexOf('{')));
    assert.equal(payload.error, `[authored-assets] authored asset ${entries[4].url} / Runtime.evaluate: no CDP reply within 44979 ms`);
    assert.equal(payload.progress.totalEntries, 5);
    assert.equal(payload.progress.completedEntries, 4);
    assert.equal(payload.progress.failedEntryIndex, 5);
    assert.equal(payload.progress.failedUrl, entries[4].url);
    assert.equal(payload.progress.failedAssetMs, 44_979);
    assert.ok(entries.slice(0, 4).some((entry) => entry.url === payload.progress.lastCompletedUrl));
    assert.equal(payload.progress.maxCompletedMs, 44_979);
    return true;
  });
  assert.equal(expressions.length, 1 + entries.length);
  assert.equal(calls, 1 + entries.length, 'no passive ship-report evaluation follows a catalog failure');
  assert.equal(labels.at(-1), `authored asset ${entries[4].url}`);
  for (let i = 0; i < entries.length; i++) assert.ok(expressions[i + 1].includes(entries[i].url));
});

test('aggregate report deadline exhaustion is distinct from one slow asset', async () => {
  const entries = Array.from({ length: 5 }, (_, index) => ({
    slot: 'hull', url: `assets/ships/release/parts/hulls/part-${index}.glb`, wholeShip: false,
  }));
  let time = 0;
  let calls = 0;
  const cdp = {
    setStageLabel(label) {
      if (label === `authored asset ${entries[4].url}`) time = 45_000;
    },
    async send(method) {
      assert.equal(method, 'Runtime.evaluate');
      calls++;
      if (calls === 1) {
        time += 1;
        return { result: { value: JSON.stringify({ available: true, runtime: {}, release: true,
          partRoot: 'assets/ships/release/parts/', entries }) } };
      }
      if (calls <= 5) {
        return { result: { value: JSON.stringify({ loaded: true, assetId: `part-${calls}` }) } };
      }
      throw new Error(`[authored-assets] authored asset ${entries[4].url} / Runtime.evaluate: stage deadline expired`);
    },
  };

  await assert.rejects(collectAdmittedAuthoredReport(cdp, true, { now: () => time }), (error) => {
    assert.match(error.message, /stage deadline expired/);
    const payload = JSON.parse(error.message.slice(error.message.indexOf('{')));
    assert.equal(payload.progress.totalEntries, 5);
    assert.equal(payload.progress.completedEntries, 4);
    assert.equal(payload.progress.failedEntryIndex, 5);
    assert.equal(payload.progress.failedUrl, entries[4].url);
    assert.equal(payload.progress.failedAssetMs, 0);
    assert.equal(payload.progress.maxCompletedMs, 44_999);
    assert.equal(payload.progress.elapsedMs, 45_000);
    return true;
  });
  assert.equal(calls, 6, 'the expired request is the final operation; no passive report is sent');
});

test('catalog failure drains the in-flight batch and does not launch later entries', async () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    slot: 'hull', url: `assets/ships/release/parts/hulls/part-${index}.glb`, wholeShip: false,
  }));
  const pending = [];
  let calls = 0;
  const cdp = {
    setStageLabel() {},
    send(_method, params) {
      calls++;
      if (calls === 1) return Promise.resolve({ result: { value: JSON.stringify({ available: true,
        runtime: {}, release: true, partRoot: 'assets/ships/release/parts/', entries }) } });
      const url = entries.find((entry) => params.expression.includes(entry.url))?.url;
      assert.ok(url, 'each asset evaluation names its catalog URL');
      if (url === entries[0].url) {
        return Promise.reject(new Error(`[authored-assets] authored asset ${url} / Runtime.evaluate: controlled failure`));
      }
      return new Promise((resolve) => pending.push(() => resolve({ result: { value: JSON.stringify({ loaded: true }) } })));
    },
  };
  const releaseInFlight = new Promise((resolve) => setImmediate(() => {
    for (const release of pending) release();
    resolve();
  }));
  const resultPromise = collectAuthoredLoaderDiagnostics(cdp);
  await releaseInFlight;
  const result = await resultPromise;
  assert.equal(result.available, false);
  assert.match(result.error, new RegExp(entries[0].url.replaceAll('/', '\\/')));
  assert.equal(result.progress.failedEntryIndex, 1);
  assert.equal(result.progress.inFlightAtFailure, 3);
  assert.equal(result.progress.drainedInFlight, 3);
  assert.equal(result.progress.completedEntries, 3);
  assert.equal(calls, 5, 'four initial requests drain and no fifth asset launches after failure');
});
