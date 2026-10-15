import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { collectAuthoredReport, createAuthoredProbeCdpSession } from '../scripts/probe-authored-assets-live.mjs';

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
  const report = await collectAuthoredReport(cdp, { loadAssets: false });
  assert.equal(imports, 0);
  assert.equal(report.loaderDiagnostics.skipped, true);
  assert.equal(report.loaderDiagnostics.available, false);
  assert.equal(report.shipCount, 0);
});
