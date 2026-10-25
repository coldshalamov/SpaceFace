import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { devices } from 'playwright';

const source = readFileSync(new URL('../scripts/probe-deployed-mobile.mjs', import.meta.url), 'utf8');
const flightSource = source.slice(source.indexOf('  const waitForFlight = '), source.indexOf('\n  await waitForMenu();'));
const state = (mode, loading = []) => ({ loading, alerts: [], runtime: { frame: { mode } } });

async function replay(states, { errors = [], menuVisible = true, click = null, baseline = [] } = {}) {
  let now = 0, index = 0;
  const report = { observations: [], console: errors, continueClick: click,
    stages: [{ stage: 'continue-menu', simLaneEvents: baseline }] };
  const scope = { Date: { now: () => now }, report, engine: 'fixture', out: '', menu: 'menu',
    console: { log() {} }, join: () => '', writeFile: async () => {},
    page: { waitForTimeout: async ms => { now += ms; } },
    snapshot: async () => states[Math.min(index++, states.length - 1)], visible: async () => menuVisible };
  const wait = runInNewContext(`${flightSource}\nwaitForFlight`, scope);
  try { return { result: await wait('continue', 0), now, report }; }
  catch (error) { return { error, now, report }; }
}

test('a pending all-menu restore keeps the original five-minute bound', async () => {
  // The failed production capture never observed departure: menu, tick 0, no player.
  const pending = { ...state('menu'), flight: '0' };
  pending.runtime.frame = { mode: 'menu', tick: 0, playerId: null };
  const result = await replay([pending]);
  assert.match(result.error.message, /did not observe an advancing simulation tick/);
  assert.equal(result.now, 300000);
  assert.equal(result.report.observations.length, 150);
});

test('a visible title beneath loading is pending; a witnessed return to menu fails', async () => {
  const loading = state('loading', ['Restoring save']);
  const result = await replay([loading, loading, loading, state('menu', ['Restoring save']), state('menu')]);
  assert.match(result.error.message, /returned to the main menu/);
  assert.equal(result.now, 10000, 'neither the title under loading nor uncleared loading is a return');
  const missing = await replay([state(undefined)]);
  assert.equal(missing.now, 300000, 'missing mode cannot establish departure or return');
});

test('playable flight and explicit startup failures retain their existing verdicts', async () => {
  const flight = (tick) => {
    const next = state('flight');
    next.flight = '1'; next.runtime.post = { firstPlayableFrameAt: 123 };
    next.runtime.frame.tick = tick;
    return next;
  };
  // The Continue route only counts playable flight once the tick itself has advanced.
  const passed = await replay([state('menu'), flight(6), flight(8)]);
  assert.equal(passed.result, 6000);
  assert.equal(passed.error, undefined);
  const failed = await replay([state('menu')], { errors: [
    { route: 'continue', text: '[SpaceFace] save restore failed' },
  ] });
  assert.match(failed.error.message, /startup-readiness failure/);
  assert.equal(failed.now, 2000);
});

test('a new post-click save rejection fails promptly with the existing hidden feedback', async () => {
  const baseline = ['save:store-synced'];
  const click = { action: 'continue', isTrusted: true, disabled: false, ariaDisabled: null,
    at: 100, simLaneEventsBeforeClick: baseline };
  const rejected = { ...state('menu'), simLaneEvents: [...baseline, 'save:error'],
    toastLive: 'Autosave is corrupt or not a SpaceFace save',
    toasts: ['Autosave is corrupt or not a SpaceFace save'] };
  const result = await replay([rejected], { click, baseline });
  assert.match(result.error.message, /new save:error after its accepted click: Autosave is corrupt/);
  assert.equal(result.now, 2000);
  assert.deepEqual([...result.report.continueRejection.feedback], [rejected.toastLive]);
  assert.deepEqual([...result.report.continueRejection.appendedEvents], ['save:error']);
});

test('requested iPhone touch profile is reported against effective runtime capabilities', () => {
  const profile = devices['iPhone 14'];
  assert.equal(profile.isMobile, true);
  assert.equal(profile.hasTouch, true);
  assert.match(source, /const mobileDeviceName = 'iPhone 14'/);
  assert.match(source, /browser\.newContext\(\{ \.\.\.mobileDeviceProfile/);
  assert.doesNotMatch(source, /navigator\.maxTouchPoints\s*=|Object\.defineProperty\([^\n]*maxTouchPoints/,
    'the probe observes capabilities without manufacturing browser identity');

  const start = source.indexOf('function recordMobileCapabilities(');
  const end = source.indexOf('\nconst MAX_RENDERER_ERROR_SAMPLES', start);
  const report = { mobileProfile: { requested: { hasTouch: true, isMobile: true }, effective: null, mismatches: [] },
    acceptance: { mobileCapabilities: 'pending' } };
  runInNewContext(`${source.slice(start, end)}\nrecordMobileCapabilities`, { report })({
    touchPoints: 0, touchEvents: true, coarse: true, anyCoarse: true, mobileUserAgent: true,
    userAgent: 'iPhone UA', platform: 'iPhone', width: 390, height: 664, dpr: 3,
  });
  assert.equal(report.acceptance.mobileCapabilities, 'mismatch');
  assert.deepEqual([...report.mobileProfile.mismatches],
    ['requested touch support but navigator.maxTouchPoints is not positive']);
  assert.equal(report.mobileProfile.effective.maxTouchPoints, 0);
});

test('bus-free public recovery text is retained in startup failure diagnostics', async () => {
  const baseline = [];
  const click = { action: 'continue', isTrusted: true, disabled: false, ariaDisabled: null,
    at: 100, simLaneEventsBeforeClick: baseline };
  const rejected = { ...state('menu'), simLaneEvents: ['save:error'],
    startupObserver: { busAvailable: false, events: [] },
    alerts: ['Slot quick is corrupt or not a SpaceFace save'],
    toastLive: 'Slot quick is corrupt or not a SpaceFace save', toasts: [] };
  const result = await replay([rejected], { click, baseline });
  assert.match(result.error.message, /Slot quick is corrupt or not a SpaceFace save/);
  assert.deepEqual([...result.report.continueRejection.feedback],
    ['Slot quick is corrupt or not a SpaceFace save']);
  assert.equal(result.report.continueRejection.debugBusAvailable, false);
});

test('historical save errors and unaccepted clicks cannot become a new Continue rejection', async () => {
  const baseline = ['save:store-synced', 'save:error'];
  const click = { action: 'continue', isTrusted: true, disabled: false, ariaDisabled: null,
    at: 100, simLaneEventsBeforeClick: baseline };
  const historical = { ...state('menu'), simLaneEvents: [...baseline, 'contactHail:availability'],
    startupObserver: { events: [{ type: 'save:error', reason: 'load_failed', at: 50 }] } };
  const pending = await replay([historical], { click, baseline });
  assert.equal(pending.now, 300000);
  assert.match(pending.error.message, /did not observe an advancing simulation tick/);
  assert.equal(pending.report.continueRejection, undefined);
  const unaccepted = await replay([{ ...state('menu'), simLaneEvents: [...baseline, 'save:error'] }],
    { click: { ...click, isTrusted: false }, baseline });
  assert.equal(unaccepted.now, 300000);
  assert.equal(unaccepted.report.continueRejection, undefined);
  const repeated = await replay([{ ...state('menu'), simLaneEvents: [...baseline, 'save:error'] }], { click, baseline });
  assert.equal(repeated.now, 2000, 'a second save:error is new even when the baseline already contained one');
});

test('public click receipt survives heartbeat eviction and is removed with observer cleanup', () => {
  const listeners = new Map(), bus = new Map();
  const document = {
    addEventListener(type, listener, capture) { assert.equal(capture, true); listeners.set(type, listener); },
    removeEventListener(type, listener, capture) { assert.equal(capture, true); if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const scope = { document, performance: { now: () => 100 }, window: {
    __SF_WITNESS__: { snapshot: () => ({ mode: 'menu' }) },
    __SF_LANE_APPLIED: ['save:store-synced', 'save:error'],
    SF: { bus: { on(type, listener) { bus.set(type, listener); return () => bus.delete(type); } } },
  } };
  const observerSource = source.slice(source.indexOf('function installStartupObserver()'), source.indexOf('\nconst snapshotBase'));
  runInNewContext(`${observerSource}\ninstallStartupObserver()`, scope);
  bus.get('save:completed')({ slot: 'quick' });
  assert.ok(scope.window.__SF_MOBILE_STARTUP_OBSERVER__.snapshot().events
    .some(event => event.type === 'save:completed' && event.slot === 'quick'));
  const control = { disabled: false, textContent: 'Continue', classList: { contains: () => false },
    getAttribute: name => name === 'data-action' ? 'continue' : null };
  listeners.get('click')({ target: { closest: () => control }, isTrusted: true, clientX: 120, clientY: 240 });
  for (let i = 0; i < 80; i++) bus.get('game:loadingProgress')({ progress: i });
  const api = scope.window.__SF_MOBILE_STARTUP_OBSERVER__;
  const snapshot = api.snapshot();
  assert.equal(snapshot.events.length, 64);
  assert.equal(snapshot.lastPublicClick.action, 'continue');
  assert.equal(snapshot.lastPublicClick.isTrusted, true);
  assert.equal(snapshot.lastPublicClick.disabled, false);
  assert.equal(snapshot.lastPublicClick.mode, 'menu');
  assert.deepEqual([...snapshot.lastPublicClick.simLaneEventsBeforeClick], ['save:store-synced', 'save:error']);
  snapshot.lastPublicClick.simLaneEventsBeforeClick.push('mutated');
  assert.equal(api.snapshot().lastPublicClick.simLaneEventsBeforeClick.length, 2);
  snapshot.lastPublicClick.action = 'mutated';
  assert.equal(api.snapshot().lastPublicClick.action, 'continue');
  api.stop();
  assert.equal(listeners.size, 0);
  assert.equal(bus.size, 0);
});

test('Continue route makes a public empty-slot save and waits for its completion before reload', () => {
  const routeStart = source.indexOf("  if (checkContinue) {");
  const routeEnd = source.indexOf("    await tapControl('[data-screen=\"mainMenu\"] button[data-action=\"continue\"]');", routeStart);
  const route = source.slice(routeStart, routeEnd);
  const pause = route.indexOf("await page.locator('.mf-pause').tap()");
  const saveMenu = route.indexOf("[data-screen=\"pause\"] button");
  const emptySlot = route.indexOf("[data-screen=\"saveLoad\"] .sf-slot.empty");
  const saveAction = route.indexOf("[data-screen=\"saveLoad\"] button[data-action=\"save\"]");
  const clickReceipt = route.indexOf("report.saveClick?.action !== 'save'");
  const receipt = route.indexOf('await waitForPublicSave(page, { slot: saveSlot, afterAt: saveAt })');
  const reload = route.indexOf("await page.reload(");
  assert.ok(pause >= 0 && pause < saveMenu && saveMenu < emptySlot && emptySlot < saveAction,
    'actor opens Pause, Save, selects an empty slot, then taps Save here');
  assert.ok(saveAction < clickReceipt && clickReceipt < receipt && receipt < reload,
    'reload follows the trusted public save click and successful save receipt');
  assert.match(source, /localStorage\.getItem\('sf\.save\.' \+ slot\)/,
    'bus-free receipt verifies the selected slot envelope without writing storage');
  assert.match(source, /'save:completed'/, 'observer captures the save authority completion event');
});

test('save receipt uses the read-only stored envelope when the retail bus observer is unavailable', async () => {
  const start = source.indexOf('async function waitForPublicSave(');
  const end = source.indexOf('\nasync function waitForContinueEnabled', start);
  const helper = source.slice(start, end);
  let now = 0, reads = 0, writes = 0;
  const stored = JSON.stringify({ fmt: 'spaceface-save', version: 1, savedAt: '2026-10-15T00:00:00Z' });
  const scope = { Date: { now: () => now += 100 }, boundedBrowserRead: read => read(),
    window: { __SF_MOBILE_STARTUP_OBSERVER__: { snapshot: () => ({ busAvailable: false, events: [] }) } },
    localStorage: { getItem(key) { assert.equal(key, 'sf.save.quick'); return ++reads < 2 ? null : stored; },
      setItem() { writes++; }, removeItem() { writes++; } },
    page: { evaluate: async function(callback, arg) { assert.equal(arguments.length, 2); return callback(arg); },
      waitForTimeout: async ms => { now += ms; } } };
  const run = runInNewContext(`${helper}\nwaitForPublicSave`, scope);
  assert.deepEqual({ ...(await run(scope.page, { slot: 'quick', afterAt: 120, timeoutMs: 1000 })) },
    { source: 'storage-envelope', slot: 'quick', format: 'spaceface-save', savedAt: '2026-10-15T00:00:00Z' });
  assert.equal(writes, 0, 'receipt inspection never mutates browser storage');

  const noReceipt = runInNewContext(`${helper}\nwaitForPublicSave`, {
    Date: { now: (() => { let time = 0; return () => time += 100; })() },
    boundedBrowserRead: read => read(), window: { __SF_MOBILE_STARTUP_OBSERVER__: null },
    localStorage: { getItem: () => '{bad-json' }, page: null,
  });
  const noReceiptPage = { evaluate: async function(callback, arg) { assert.equal(arguments.length, 2); return callback(arg); },
    waitForTimeout: async () => {} };
  await assert.rejects(noReceipt(noReceiptPage, { slot: 'quick', afterAt: 0, timeoutMs: 300 }),
    /Public Save did not emit save:completed/);
});

test('Continue enabled wait reports a disabled-control timeout instead of renderer nonresponse', async () => {
  const start = source.indexOf('async function waitForContinueEnabled(');
  const end = source.indexOf('\nconst snapshotBase', start);
  const helper = source.slice(start, end);
  const run = runInNewContext(`${helper}\nwaitForContinueEnabled`, {});
  await assert.rejects(run({ waitForFunction: async (_predicate, _arg, options) => {
    assert.equal(options.timeout, 30000);
    throw new Error('Timeout 30000ms exceeded');
  } }, 30000), /Continue remained disabled after reload for 30 seconds/);
  assert.doesNotMatch(source.slice(start, end), /boundedBrowserRead/);
});

function menuWaitFixture(stateOrError) {
  let now = 0;
  const DateFixture = class extends Date { static now() { return now; } };
  const report = { menuWaitObservations: [] };
  const start = source.indexOf('  const inspectMenuState = async ');
  const end = source.indexOf('\n  const waitForFlight = ', start);
  const fragment = source.slice(start, end);
  const scope = { Date: DateFixture, report, activeRoute: 'continue', actorStage: 'continue-reload',
    engine: 'webkit', out: 'out', throttle: null, page: {
      async evaluate() {
        if (stateOrError instanceof Error) throw stateOrError;
        return stateOrError;
      },
      async waitForTimeout(ms) { now += ms; },
      locator() { return { filter() { return this; }, first() { return this; }, isVisible: async () => false }; },
    },
    boundedBrowserRead: read => read(), visible: async () => false, tapControl: async () => {},
    join: (...parts) => parts.join('/'), writeFile: async () => {}, console: { log() {} } };
  const run = runInNewContext(`${fragment}\nwaitForMenu`, scope);
  return { run, report, get now() { return now; } };
}

test('reload menu wait records cinematic/hidden-screen observations through its unchanged deadline', async () => {
  const fixture = menuWaitFixture({ timeOrigin: 123, readyState: 'complete', newGameButtonCount: 1,
    newGameButtonVisible: false, mainMenuVisible: false, motionAskVisible: false, cinematicVisible: true,
    witnessFrame: { mode: 'menu', tick: 18, playerId: null } });
  await assert.rejects(fixture.run(), error => {
    assert.match(error.message, /Main menu never became playable within 180 seconds/);
    assert.match(error.message, /cinematicVisible\\?":true/);
    return true;
  });
  assert.equal(fixture.now, 180000, 'the diagnostic loop retains the original menu deadline');
  assert.equal(fixture.report.menuWaitObservations.length, 18, 'recent observations are written every ten seconds');
  assert.equal(fixture.report.menuWaitObservations.at(-1).elapsedMs, 170000);
  assert.equal(fixture.report.menuWaitObservations.at(-1).witnessFrame.mode, 'menu');
});

test('reload menu wait retains explicit unresponsive-read errors instead of reporting hidden UI', async () => {
  const fixture = menuWaitFixture(new Error('WebKit evaluate timed out'));
  await assert.rejects(fixture.run(), error => {
    assert.match(error.message, /available\\?":false/);
    assert.match(error.message, /WebKit evaluate timed out/);
    return true;
  });
  assert.equal(fixture.now, 180000);
  assert.equal(fixture.report.menuWaitObservations.length, 18);
  assert.equal(fixture.report.menuWaitObservations[0].available, false);
  assert.match(fixture.report.menuWaitObservations[0].error, /WebKit evaluate timed out/);
});

test('menu diagnostic reader captures document, visibility, and witness-frame state', async () => {
  const start = source.indexOf('  const inspectMenuState = async ');
  const end = source.indexOf('\n  const waitForMenu = ', start);
  const nodes = {
    mainMenu: { id: 'menu', getBoundingClientRect: () => ({ width: 50, height: 20 }) },
    motionAsk: { id: 'motion', getBoundingClientRect: () => ({ width: 0, height: 0 }) },
    cinematic: { id: 'cinematic', getBoundingClientRect: () => ({ width: 0, height: 0 }) },
    newGame: { id: 'new-game', textContent: '', getBoundingClientRect: () => ({ width: 50, height: 20 }) },
    full: { id: 'full', textContent: 'Full motion', getBoundingClientRect: () => ({ width: 0, height: 0 }) },
    cineBegin: { id: 'begin', getBoundingClientRect: () => ({ width: 0, height: 0 }) },
  };
  const scope = { boundedBrowserRead: read => read(), performance: { timeOrigin: 123 },
    document: { readyState: 'interactive',
      querySelector(selector) { return selector === '[data-screen="mainMenu"]' ? nodes.mainMenu
        : selector === '[data-screen="motionAsk"]' ? nodes.motionAsk
          : selector === '#cinematic-splash .cine-begin' ? nodes.cineBegin : nodes.cinematic; },
      querySelectorAll(selector) { return selector.includes('newGame') ? [nodes.newGame] : [nodes.full]; } },
    getComputedStyle(element) { return { visibility: ['menu', 'new-game'].includes(element.id) ? 'visible' : 'hidden',
      display: 'block' }; },
    window: { __SF_WITNESS__: { snapshot: () => ({ mode: 'menu', tick: 42, playerId: null, loading: false }) } },
  };
  const run = runInNewContext(`${source.slice(start, end)}\ninspectMenuState`, scope);
  const state = await run({ evaluate: async callback => callback() });
  assert.deepEqual(JSON.parse(JSON.stringify(state)), { available: true, timeOrigin: 123, readyState: 'interactive', newGameButtonCount: 1,
    newGameButtonVisible: true, mainMenuVisible: true, motionAskVisible: false, motionFullVisible: false,
    firstLightPlayVisible: false,
    cinematicVisible: false, cinematicBeginVisible: false,
    witnessReadError: null,
    witnessFrame: { mode: 'menu', tick: 42, playerId: null, loading: false } });
});

test('a visible reload menu remains playable when the optional witness throws', async () => {
  const start = source.indexOf('  const inspectMenuState = async ');
  const end = source.indexOf('\n  const waitForFlight = ', start);
  const element = (id, visible) => ({ id, hidden: false, textContent: '',
    getBoundingClientRect: () => ({ width: visible ? 50 : 0, height: visible ? 20 : 0 }) });
  const nodes = { mainMenu: element('menu', true), newGame: element('new-game', true),
    motionAsk: element('motion', false), full: element('full', false),
    cinematic: element('cinematic', false), cineBegin: element('begin', false) };
  let now = 0;
  const DateFixture = class extends Date { static now() { return now; } };
  const report = { menuWaitObservations: [] };
  const scope = { Date: DateFixture, report, activeRoute: 'continue', actorStage: 'continue-reload',
    engine: 'webkit', out: 'out', throttle: null, boundedBrowserRead: read => read(),
    page: { evaluate: async callback => callback(), waitForTimeout: async ms => { now += ms; },
      locator() { throw new Error('visible menu should return before acting'); } },
    document: { readyState: 'complete',
      querySelector(selector) { return selector === '[data-screen="mainMenu"]' ? nodes.mainMenu
        : selector === '[data-screen="motionAsk"]' ? nodes.motionAsk
          : selector === '#cinematic-splash .cine-begin' ? nodes.cineBegin : nodes.cinematic; },
      querySelectorAll(selector) { return selector.includes('newGame') ? [nodes.newGame] : [nodes.full]; } },
    getComputedStyle: () => ({ visibility: 'visible', display: 'block' }), performance: { timeOrigin: 456 },
    window: { __SF_WITNESS__: { snapshot() { throw new Error('witness snapshot unavailable'); } } },
    tapControl: async () => {}, join: (...parts) => parts.join('/'), writeFile: async () => {},
    console: { log() {} } };
  const run = runInNewContext(`${source.slice(start, end)}\nwaitForMenu`, scope);
  await run();
  assert.equal(now, 0, 'the visible menu is accepted without waiting for the optional witness');
  assert.match(report.menuWitnessReadError, /witness snapshot unavailable/);
});

test('failure snapshot and screenshot errors remain in the report', async () => {
  const start = source.indexOf('async function captureFailureDiagnostics(');
  const end = source.indexOf('\nconst visible = ', start);
  const report = { final: null, finalDiagnosticErrors: [] };
  const run = runInNewContext(`${source.slice(start, end)}\ncaptureFailureDiagnostics`, {});
  await run({ screenshot: async () => { throw new Error('screenshot unavailable'); } }, {
    report, snapshot: async () => { throw new Error('page evaluate unavailable'); }, screenshotPath: 'failure.png' });
  assert.equal(report.final, null);
  assert.deepEqual(report.finalDiagnosticErrors.map(row => row.kind), ['final-snapshot', 'failure-screenshot']);
  assert.match(report.finalDiagnosticErrors[0].error, /page evaluate unavailable/);
  assert.match(report.finalDiagnosticErrors[1].error, /screenshot unavailable/);
});

test('Continue requires a delivered enabled public click before waiting for flight', async () => {
  const start = source.indexOf('    const continueClick = ');
  const end = source.indexOf('    report.continueLaunchMs = ', start);
  const check = source.slice(start, end);
  for (const receipt of [null, { action: 'newGame' }, { action: 'continue', disabled: true },
    { action: 'continue', ariaDisabled: 'true' }, { action: 'continue', isTrusted: false }]) {
    const run = runInNewContext(`(async () => { ${check} })`, {
      report: {}, page: { evaluate: async () => receipt }, boundedBrowserRead: read => read(),
    });
    await assert.rejects(run(), /tap was not delivered to an enabled Continue control/);
  }
  const receipt = { action: 'continue', isTrusted: true, disabled: false, ariaDisabled: null };
  const report = {};
  const run = runInNewContext(`(async () => { ${check} })`, {
    report, page: { evaluate: async () => receipt }, boundedBrowserRead: read => read(),
  });
  await run();
  assert.equal(report.continueClick, receipt);
});

// The finally-block health fragment calls finalizeRendererHealth; hand it the real one.
const finalizeRendererHealth = runInNewContext(
  `${source.slice(source.indexOf('function finalizeRendererHealth('),
    source.indexOf('\nlet browser;', source.indexOf('function finalizeRendererHealth(')))}\nfinalizeRendererHealth`,
  {});

test('observed invalid draws fail renderer health independently of console emission', () => {
  const start = source.indexOf('  const contextFailures = new Set();');
  const end = source.indexOf('  // Persist diagnostics', start);
  const health = source.slice(start, end);
  for (const drawErrors of [{ invalidDraws: 3, witnesses: [] }, { witnesses: [{}] }]) {
    const report = { stages: [{ drawErrors }], observations: [], passed: true,
      rendererErrorCount: 0, acceptance: { startupAndControls: 'passed' } };
    const notes = [], process = {};
    runInNewContext(health, { report, process, drawErrorProbe: true, finalizeRendererHealth,
      activeRoute: 'new-game', actorStage: 'fixture',
      noteRendererError(target, text, route, stage, source) {
        target.rendererErrorCount++; notes.push({ text, source });
      } });
    assert.equal(report.acceptance.rendererHealth, 'failed');
    assert.equal(report.passed, false);
    assert.equal(process.exitCode, 1);
    assert.equal(notes[0].source, 'draw-observer');
  }
});

test('handset throttle profiles parse and stay Chromium-gated', () => {
  const start = source.indexOf('const HANDSET_NETWORK_PROFILES');
  const end = source.indexOf('\nconst throttle = parseMobileThrottle', start);
  const parse = runInNewContext(`${source.slice(start, end)}\nparseMobileThrottle`, {});
  assert.equal(parse('off', 'chromium'), null);
  assert.equal(parse('', 'chromium'), null);
  assert.equal(parse(undefined, 'chromium'), null);
  const handset = parse('handset', 'chromium');
  assert.equal(handset.cpuRate, 4);
  // vm-realm objects fail deepStrictEqual on prototype identity; compare fields.
  assert.equal(handset.network.latency, 100);
  assert.equal(handset.network.downloadThroughput, 500000);
  assert.equal(handset.network.uploadThroughput, 375000);
  assert.equal(parse('cpu:6', 'chromium').cpuRate, 6);
  const fast = parse('net:fast3g', 'chromium').network;
  assert.deepEqual([fast.latency, fast.downloadThroughput, fast.uploadThroughput], [150, 200000, 93750]);
  const slow = parse('net:slow3g', 'chromium').network;
  assert.deepEqual([slow.latency, slow.downloadThroughput, slow.uploadThroughput], [400, 50000, 50000]);
  const netOff = parse('handset,net:off', 'chromium');
  assert.equal(netOff.cpuRate, 4);
  assert.equal(netOff.network, null);
  assert.throws(() => parse('handset', 'webkit'), /MOBILE_PROBE_ENGINE=chromium/);
  assert.throws(() => parse('cpu:1', 'chromium'), /Invalid CPU throttle rate/);
  assert.throws(() => parse('net:5g', 'chromium'), /Unknown MOBILE_PROBE_THROTTLE/);
});

test('context-loss exercise runs after pause-resume and before rotation on the public canvas', () => {
  const resume = source.indexOf("await page.locator('[data-screen=\"pause\"]').waitFor({ state: 'hidden' });");
  const exerciseCall = source.indexOf('await exerciseRendererRecovery(page, { report });');
  const rotation = source.indexOf("actorStage = 'new-game-rotation';");
  assert.ok(resume >= 0 && resume < exerciseCall && exerciseCall < rotation,
    'the injected loss sits between resume-from-pause and the rotation check');
  assert.match(source, /WEBGL_lose_context/, 'loss injection uses the standard extension');
  assert.match(source, /getElementById\('gl-canvas'\)/, 'injection targets the public main canvas');
  assert.match(source, /rendererRecovery: contextLossExercise \? 'pending' : 'not-requested'/,
    'recovery gets its own acceptance verdict');
  assert.match(source, /05b-context-recovered\.png/, 'recovery leaves picture evidence');
});

async function replayRecovery(states, { loss = { available: true }, restore = { restored: true }, tickMs = 1500 } = {}) {
  let now = 0, snapshotIndex = 0, evaluateIndex = 0;
  const evaluates = [loss, restore];
  const report = { acceptance: {}, contextLossExercise: { requested: false } };
  const DateFixture = class extends Date { static now() { return now; } };
  const scope = { Date: DateFixture, report, join: (...parts) => parts.join('/'), out: 'out',
    boundedBrowserRead: read => read(),
    snapshot: async () => states[Math.min(snapshotIndex++, states.length - 1)],
    visible: async () => true,
    page: { evaluate: async () => evaluates[Math.min(evaluateIndex++, evaluates.length - 1)],
      waitForTimeout: async ms => { now += ms; },
      screenshot: async () => {} } };
  const start = source.indexOf('const injectContextLoss = ');
  const end = source.indexOf('\nconst visible = ', start);
  const run = runInNewContext(`${source.slice(start, end)}\nexerciseRendererRecovery`, scope);
  try { return { result: await run(scope.page, { report, timeoutMs: tickMs * 8 }), report, now }; }
  catch (error) { return { error, report, now }; }
}

test('exerciseRendererRecovery passes only after loss and restore receipts plus sim resume', async () => {
  const before = { runtime: { frame: { tick: 100 },
    context: { lost: false, recovery: { losses: 0, restores: 0, pending: false, generation: 0 } } } };
  const duringLoss = { runtime: { frame: { tick: 100 },
    context: { lost: true, recovery: { losses: 1, restores: 0, pending: true, generation: 0 } } } };
  const recovered = { runtime: { frame: { tick: 104 },
    context: { lost: false, recovery: { losses: 1, restores: 1, pending: false, generation: 1 } } } };
  const passed = await replayRecovery([before, duringLoss, duringLoss, recovered]);
  assert.equal(passed.error, undefined);
  assert.equal(passed.report.acceptance.rendererRecovery, 'passed');
  assert.equal(passed.report.contextLossExercise.recovered, true);
  assert.equal(passed.report.contextLossExercise.before.tick, 100);
  assert.equal(passed.report.contextLossExercise.recoveredTick, 104);
  assert.ok(passed.report.contextLossExercise.recoveryElapsedMs >= 2 * 1500,
    'recovery time covers the observed loss window');

  const stalled = await replayRecovery([before, duringLoss, duringLoss, duringLoss]);
  assert.match(stalled.error.message, /did not fully recover within/);
  assert.equal(stalled.report.acceptance.rendererRecovery, undefined);
  assert.equal(stalled.report.contextLossExercise.recovered, false);
  // The fixture clock runs the full 12 s deadline at 1.5 s polls: eight bounded observations.
  assert.equal(stalled.report.contextLossExercise.observations.length, 8);

  const unavailable = await replayRecovery([before], { loss: { available: false } });
  assert.match(unavailable.error.message, /WEBGL_lose_context is unavailable/);
});

test('a recovered injected loss is renderer-recovery evidence, not a health failure', () => {
  const start = source.indexOf('  const contextFailures = new Set();');
  const end = source.indexOf('  // Persist diagnostics', start);
  const health = source.slice(start, end);
  const stage = { runtime: { context: { lost: true, recovery: { losses: 1, restores: 1, pending: false } } },
    startupObserver: { events: [{ type: 'webglcontextlost', canvasId: 'gl-canvas', statusMessage: 'injected' }] } };
  const report = { stages: [stage], observations: [], final: null, passed: true, rendererErrorCount: 0,
    acceptance: { startupAndControls: 'passed' }, contextLossExercise: { recovered: true } };
  runInNewContext(health, { report, process: {}, drawErrorProbe: false, finalizeRendererHealth,
    activeRoute: 'new-game', actorStage: 'fixture',
    noteRendererError() { throw new Error('a recovered loss must not note a renderer error'); } });
  assert.equal(report.acceptance.rendererHealth, 'passed');
  assert.equal(report.passed, true);

  const unrecovered = { stages: [stage], observations: [], final: null, passed: true, rendererErrorCount: 0,
    acceptance: { startupAndControls: 'passed' }, contextLossExercise: { recovered: false } };
  runInNewContext(health, { report: unrecovered, process: {}, drawErrorProbe: false, finalizeRendererHealth,
    activeRoute: 'new-game', actorStage: 'fixture',
    noteRendererError() { unrecovered.rendererErrorCount++; } });
  assert.equal(unrecovered.acceptance.rendererHealth, 'failed');
  assert.equal(unrecovered.passed, false);
});
