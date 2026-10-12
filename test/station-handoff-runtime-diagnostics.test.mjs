import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { collectStationHandoffSnapshot, reportStationHandoffFailure } from '../scripts/lib/stationHandoffDiagnostics.mjs';

function collector(overrides = {}) {
  return runInNewContext(`(${collectStationHandoffSnapshot.toString()})()`, {
    window: {}, document: { querySelectorAll: () => [] }, ...overrides,
  });
}
function element(attrs = {}, options = {}) {
  return { isConnected: true, hidden: false, inert: false,
    getAttribute: (name) => attrs[name] ?? null,
    getBoundingClientRect: () => ({ x: 1, y: 2, width: 300, height: 150 }),
    querySelector: () => null, querySelectorAll: () => [], ...options };
}
test('missing runtime and missing station are distinct JSON-safe evidence', () => {
  const s = JSON.parse(JSON.stringify(collector()));
  assert.equal(s.lane, null);
  assert.equal(s.dockedStationId, null);
  assert.equal(s.stationRootCount, 0);
  assert.deepEqual(s.dock, { present: false });
  assert.equal(s.boardPresent, false);
});
test('collector records stale rendered rows, real lane counters and duplicate mounts without mutation', () => {
  const state = { mode: 'flight', tick: 30, simTime: .5, playerId: 1,
    entities: new Map([[1, { id: 1, alive: true, hull: 60 }]]),
    ui: { docked: true, dockedStationId: 'station_helios', screenStack: ['station'] },
    missions: { boards: { station_helios: { slots: [{ id: 'new_offer' }, { id: 'old_offer' }] } } } };
  const before = structuredClone(state);
  const rows = [element({ 'data-mid': 'old_offer' })];
  const contracts = element();
  const root = element({ 'data-operation': 'contracts' }, {
    querySelector: (selector) => selector === '.sx-ct' ? contracts : null,
    querySelectorAll: () => rows,
  });
  const snapshot = collector({
    window: { __SF_LANE_APPLIED: ['mission:updated', 'dock:docked'], SF: { state,
      ctx: { simLane: 'worker' }, simLaneDiag: () => ({ lane: 'worker', laneReady: true,
        replyCount: 12, pendingRpcs: 0, closed: false,
        domainAppliedKeys: { 'missions.boards.station_helios': 3, 'ui.docked': 2, 'player.credits': 99 },
        credentials: 'must not be copied', journal: { fullState: 'must not be copied' } }),
      registry: { get: () => ({ _fe: 2, _registeredScreens: new Set(['station']),
        screenManager: { top: () => 'station' } }) } } },
    document: { querySelectorAll: () => [root, element()] },
    getComputedStyle: () => ({ display: 'grid', visibility: 'visible', opacity: '1' }),
  });
  const s = JSON.parse(JSON.stringify(snapshot));
  assert.equal(s.stationRootCount, 2);
  assert.equal(s.contracts.rect.width, 300);
  assert.deepEqual(s.postedIds, ['new_offer', 'old_offer']);
  assert.deepEqual(s.renderedRows.map((r) => r.missionId), ['old_offer']);
  assert.deepEqual(s.recentLaneEvents, ['mission:updated', 'dock:docked']);
  assert.equal(s.lane.domainAppliedKeys['missions.boards.station_helios'], 3);
  assert.equal(s.lane.domainAppliedKeys['player.credits'], undefined);
  assert.equal(s.frameErrors, 2);
  assert.ok(!JSON.stringify(s).includes('must not be copied'));
  assert.deepEqual(state, before);
});
test('non-finite and unsupported diagnostic values cannot break JSON serialization', () => {
  const s = collector({ window: { SF: { state: { tick: 1n, simTime: Infinity,
    ui: { screenStack: [Symbol('bad'), undefined] } },
    simLaneDiag: () => ({ lane: 'worker', replyCount: NaN, domainAppliedKeys: { missions: 1n } }) } } });
  assert.equal(s.tick, null);
  assert.equal(s.lane.domainAppliedKeys.missions, null);
  assert.doesNotThrow(() => JSON.stringify(s));
});
test('lane diagnostic failure retains DOM and board evidence', () => {
  const s = collector({ window: { SF: { simLaneDiag: () => { throw new Error('observer failed'); } } } });
  assert.equal(s.lane, null);
  assert.equal(s.laneDiagnosticError, 'observer failed');
  assert.equal(s.stationRootCount, 0);
});

const issues = { errorIssues: () => [], warningIssues: () => [] };
test('report caps issues, excludes request bodies and throws the identical original error', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const original = new Error('original actor timeout');
  await assert.rejects(reportStationHandoffFailure({ evaluate: async (fn) => {
    assert.equal(fn, collectStationHandoffSnapshot); return { boardCount: 3 };
  } }, { boundary: 'posted mission row' }, {
    errorIssues: () => Array.from({ length: 20 }, () => ({ text: 'x'.repeat(2000), body: 'secret' })),
    warningIssues: () => [],
  }, original), (e) => e === original);
  const s = JSON.parse(logs[0][1]);
  assert.equal(s.boundary, 'posted mission row');
  assert.equal(s.pageErrors.length, 8);
  assert.equal(s.pageErrors[0].text.length, 1200);
  assert.equal(s.pageErrors[0].body, undefined);
});
test('stuck evaluation is bounded at 2000ms and cannot replace original failure', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = new Error('actor failed');
  const pending = assert.rejects(reportStationHandoffFailure({ evaluate: () => new Promise(() => {}) }, {}, issues, original), (e) => e === original);
  t.mock.timers.tick(2000);
  await pending;
  assert.match(logs[0][1], /exceeded 2000ms/);
});
test('closed page, unserializable snapshot and failing logger preserve original error', async (t) => {
  t.mock.method(console, 'error', () => { throw new Error('logger unavailable'); });
  for (const evaluate of [() => { throw new Error('page closed'); }, async () => ({ bad: 1n })]) {
    const original = new Error('actor failed');
    await assert.rejects(reportStationHandoffFailure({ evaluate }, {}, issues, original), (e) => e === original);
  }
});
test('runtime probes retain actor deadlines and instrument each observed boundary', () => {
  const mission = readFileSync(new URL('../scripts/check-mission-accept-handoff-runtime.mjs', import.meta.url), 'utf8');
  const market = readFileSync(new URL('../scripts/check-market-first-loop-runtime.mjs', import.meta.url), 'utf8');
  assert.match(mission, /timeout: 6000.*\)\.catch/);
  assert.match(mission, /boundary: 'posted mission row'/);
  assert.match(mission, /boundary: 'mission dock identity'/);
  assert.match(market, /boundary: 'market dock visibility'/);
  for (const s of [mission, market]) assert.match(s, /DOCK_TIMEOUT_MS = 15000/);
});

test('passive long-task observer is bounded, idempotent and never installs a frame or timer pump', async () => {
  const { installStationHandoffTimingObserver } = await import('../scripts/lib/stationHandoffDiagnostics.mjs');
  let callback, installs = 0;
  const window = {};
  class Observer {
    static supportedEntryTypes = ['longtask'];
    constructor(fn) { callback = fn; installs += 1; }
    observe(options) { assert.deepEqual(JSON.parse(JSON.stringify(options)), { type: 'longtask', buffered: true }); }
  }
  const sandbox = { window, PerformanceObserver: Observer,
    requestAnimationFrame() { assert.fail('observer cannot pump frames'); },
    setInterval() { assert.fail('observer cannot pump timers'); } };
  const script = `(${installStationHandoffTimingObserver.toString()})();`;
  runInNewContext(script + script, sandbox);
  callback({ getEntries: () => Array.from({ length: 50 }, (_, i) => ({ startTime: i, duration: i + 50, attribution: 'private' })) });
  assert.equal(installs, 1);
  assert.equal(window.__SF_HANDOFF_TIMING.longTasks.length, 16);
  assert.equal(window.__SF_HANDOFF_TIMING.longTasks[0].startTime, 34);
  assert.ok(!JSON.stringify(window).includes('private'));
  const unsupported = { window: {} };
  runInNewContext(script, unsupported);
  assert.equal(unsupported.window.__SF_HANDOFF_TIMING.supported, false);
});

test('timing evidence keeps bounded production witness frames and initial-paint semantics', () => {
  const row = { wallMs: 123, executedFrames: 7, renderUpdates: 6, callbackMs: 14000,
    renderMs: 13900, lifecycle: 'presenting', suspended: false, contextLost: false,
    private: 'must not copy' };
  const s = JSON.parse(JSON.stringify(collector({
    window: { __SF_WITNESS__: { snapshot: () => row, recent: () => Array(20).fill(row) },
      __SF_HANDOFF_TIMING: { supported: true, longTasks: Array(20).fill({ startTime: 20, duration: 14000 }) } },
    document: { querySelectorAll: () => [], hidden: false, visibilityState: 'visible' },
    performance: { now: () => 15000, getEntriesByType: (type) => {
      assert.equal(type, 'paint'); return [{ name: 'first-paint', startTime: 10, duration: 0 }];
    } },
  })));
  assert.equal(s.timing.witness.recent.length, 8);
  assert.equal(s.timing.witness.current.renderMs, 13900);
  assert.equal(s.timing.longTasks.length, 16);
  assert.equal(s.timing.initialPaints[0].name, 'first-paint');
  assert.ok(!JSON.stringify(s).includes('must not copy'));
});

test('broken runtime witness does not discard lane or DOM evidence', () => {
  const s = collector({ window: { __SF_WITNESS__: { recent() { throw new Error('witness unavailable'); } } } });
  assert.equal(s.timing.witness, null);
  assert.equal(s.timing.witnessError, 'witness unavailable');
  assert.equal(s.stationRootCount, 0);
});

test('failure screenshot uses uploaded artifact tree with original animations and bounded timeout', async () => {
  const { captureStationHandoffScreenshot } = await import('../scripts/lib/stationHandoffDiagnostics.mjs');
  let options;
  const path = await captureStationHandoffScreenshot({ screenshot: async (value) => { options = value; } }, { boundary: 'mission dock identity' });
  assert.match(path.replaceAll('\\', '/'), /scratch\/check-ci-report\/station-handoff\/\d+-mission-dock-identity\.png$/);
  assert.deepEqual(options, { path, type: 'png', timeout: 2000 });
});

test('a stuck screenshot cannot delay beyond the observer ceiling or replace original error', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = new Error('original timeout');
  const pending = assert.rejects(reportStationHandoffFailure({
    evaluate: async () => ({ docked: true }), screenshot: () => new Promise(() => {}),
  }, {}, issues, original), (e) => e === original);
  t.mock.timers.tick(2000);
  await pending;
  assert.ok(logs.some((row) => /screenshot unavailable/.test(row[0])));
});

test('presentation observation exposes real frame starvation counters without stepping the game', () => {
  const s = collector({ window: { SF: {
    state: { perfRuntime: { readFrameSample: () => ({ callbackMs: 2, externalCallbackGapMs: 16000,
      callbackDispatchLagMs: 3, renderMs: 1, credential: 'never' }) } },
    loop: { getDiagnostics: () => ({ requestedFrames: 8, executedFrames: 7, renderUpdates: 6,
      lifecycleState: 'running', suspended: false, presentationStalled: false, lastPresentMs: 1,
      simulation: { private: 'never' } }),
      simStep() { assert.fail('observers cannot step the game'); } },
  } } });
  assert.equal(s.timing.presentation.requestedFrames, 8);
  assert.equal(s.timing.frameTiming.externalCallbackGapMs, 16000);
  assert.ok(!JSON.stringify(s).includes('never'));
});

function traceSession({ startFailure = null, readFailure = null, stuckEnd = false, oversized = false } = {}) {
  const calls = [], listeners = new Map();
  const session = {
    on: (name, fn) => listeners.set(name, fn),
    removeListener: (name) => listeners.delete(name),
    async detach() { calls.push(['detach']); },
    async send(method, args) {
      calls.push([method, args]);
      if (method === 'Tracing.start' && startFailure) throw startFailure;
      if (method === 'Tracing.end') {
        if (stuckEnd) return new Promise(() => {});
        listeners.get('Tracing.tracingComplete')?.({ stream: 'trace-stream' });
      }
      if (method === 'IO.read') {
        if (readFailure) throw readFailure;
        // Synthetic fixture bytes; this is not a runtime trace or screenshot.
        return { data: oversized ? 'x'.repeat(16 * 1024 * 1024 + 1) : 'fixture trace bytes', eof: true };
      }
      return {};
    },
  };
  return { session, calls };
}

test('targeted browser trace caps its buffer, streams to CI artifacts and cleans up once', async (t) => {
  const { startStationHandoffTrace } = await import('../scripts/lib/stationHandoffDiagnostics.mjs');
  const { readFile, unlink } = await import('node:fs/promises');
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const { session, calls } = traceSession();
  const trace = await startStationHandoffTrace({ newBrowserCDPSession: async () => session });
  await trace.stop(); await trace.stop();
  const config = calls.find(([method]) => method === 'Tracing.start')[1];
  assert.equal(config.transferMode, 'ReturnAsStream');
  assert.equal(config.traceConfig.traceBufferSizeInKb, 8192);
  assert.equal(config.traceConfig.recordMode, 'recordContinuously');
  assert.ok(config.traceConfig.includedCategories.includes('disabled-by-default-v8.cpu_profiler'));
  assert.equal(calls.filter(([method]) => method === 'Tracing.end').length, 1);
  assert.equal(calls.filter(([method]) => method === 'IO.close').length, 1);
  assert.equal(calls.filter(([method]) => method === 'detach').length, 1);
  assert.equal(calls.find(([method]) => method === 'IO.read')[1].size, 65536);
  const path = logs.find(([message]) => message === '[station-handoff] browser trace:')[1];
  try { assert.equal(await readFile(path, 'utf8'), 'fixture trace bytes'); }
  finally { await unlink(path); }
});

test('trace start/read/storage failures never replace actor errors and still detach', async (t) => {
  const { startStationHandoffTrace } = await import('../scripts/lib/stationHandoffDiagnostics.mjs');
  t.mock.method(console, 'error', () => {});
  for (const options of [{ startFailure: new Error('start denied') }, { readFailure: new Error('stream lost') }, { oversized: true }]) {
    const { session, calls } = traceSession(options);
    const trace = await startStationHandoffTrace({ newBrowserCDPSession: async () => session });
    const original = new Error('actor timeout');
    await assert.rejects((async () => {
      try { throw original; } finally { await trace.stop(); }
    })(), (error) => error === original);
    assert.equal(calls.filter(([method]) => method === 'detach').length, 1);
    if (!options.startFailure) assert.equal(calls.filter(([method]) => method === 'IO.close').length, 1);
  }
});

test('unresponsive browser trace end is bounded and detach still runs', async (t) => {
  const { startStationHandoffTrace } = await import('../scripts/lib/stationHandoffDiagnostics.mjs');
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, calls } = traceSession({ stuckEnd: true });
  const trace = await startStationHandoffTrace({ newBrowserCDPSession: async () => session });
  const stopping = trace.stop();
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(15000);
  await stopping;
  assert.equal(calls.filter(([method]) => method === 'detach').length, 1);
  const failure = logs.find(([message]) => message === '[station-handoff] browser trace unavailable:');
  assert.match(failure[1], /exceeded 15000ms/);
  assert.match(failure[2], /stage=Tracing.end, bytes=0/);
});

test('market trace surrounds original dock boundary, without tracing the mission actor', () => {
  const market = readFileSync(new URL('../scripts/check-market-first-loop-runtime.mjs', import.meta.url), 'utf8');
  const mission = readFileSync(new URL('../scripts/check-mission-accept-handoff-runtime.mjs', import.meta.url), 'utf8');
  assert.ok(market.indexOf('dockTrace = await startStationHandoffTrace(browser)') < market.indexOf('const dockTarget = await page.evaluate'));
  assert.match(market, /issues, error\)\)\.finally\(\(\) => dockTrace.stop\(\)\)/);
  assert.match(market, /if \(dockTrace\) await dockTrace.stop\(\);\n  if \(browser\) await browser.close/);
  assert.doesNotMatch(mission, /startStationHandoffTrace/);
});

test('trace stream-close error still detaches the browser session', async (t) => {
  const { startStationHandoffTrace } = await import('../scripts/lib/stationHandoffDiagnostics.mjs');
  t.mock.method(console, 'error', () => {});
  const { session, calls } = traceSession({ readFailure: new Error('read failed') });
  const send = session.send;
  session.send = async (method, args) => {
    if (method === 'IO.close') throw new Error('close failed');
    return send(method, args);
  };
  const trace = await startStationHandoffTrace({ newBrowserCDPSession: async () => session });
  await trace.stop();
  assert.equal(calls.filter(([method]) => method === 'detach').length, 1);
});

test('post-actor trace flush can settle after two seconds without changing page collector limits', async (t) => {
  const { startStationHandoffTrace } = await import('../scripts/lib/stationHandoffDiagnostics.mjs');
  const { unlink } = await import('node:fs/promises');
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session } = traceSession();
  const send = session.send;
  session.send = async (method, args) => {
    if (method === 'Tracing.end') await new Promise((resolve) => setTimeout(resolve, 5000));
    return send(method, args);
  };
  const trace = await startStationHandoffTrace({ newBrowserCDPSession: async () => session });
  let settled = false;
  const stopping = trace.stop().then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(2000);
  await Promise.resolve();
  assert.equal(settled, false, 'post-actor flush is distinct from the two-second page collector');
  t.mock.timers.tick(3000);
  await stopping;
  const path = logs.find(([message]) => message === '[station-handoff] browser trace:')?.[1];
  assert.ok(path, 'five-second browser finalization produces the trace');
  await unlink(path);
});
