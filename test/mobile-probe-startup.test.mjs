import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../scripts/probe-deployed-mobile.mjs', import.meta.url), 'utf8');
const flightSource = source.slice(source.indexOf('  const waitForFlight = '), source.indexOf('\n  await waitForMenu();'));
const state = (mode, loading = []) => ({ loading, alerts: [], runtime: { frame: { mode } } });

async function replay(states, { errors = [], menuVisible = true } = {}) {
  let now = 0, index = 0;
  const report = { observations: [], console: errors };
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
  assert.match(result.error.message, /within five minutes/);
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
  const flight = state('flight');
  flight.flight = '1'; flight.runtime.post = { firstPlayableFrameAt: 123 };
  const passed = await replay([state('menu'), flight]);
  assert.equal(passed.result, 4000);
  assert.equal(passed.error, undefined);
  const failed = await replay([state('menu')], { errors: [
    { route: 'continue', text: '[SpaceFace] save restore failed' },
  ] });
  assert.match(failed.error.message, /startup-readiness failure/);
  assert.equal(failed.now, 2000);
});

test('public click receipt survives heartbeat eviction and is removed with observer cleanup', () => {
  const listeners = new Map(), bus = new Map();
  const document = {
    addEventListener(type, listener, capture) { assert.equal(capture, true); listeners.set(type, listener); },
    removeEventListener(type, listener, capture) { assert.equal(capture, true); if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const scope = { document, performance: { now: () => 100 }, window: {
    __SF_WITNESS__: { snapshot: () => ({ mode: 'menu' }) },
    SF: { bus: { on(type, listener) { bus.set(type, listener); return () => bus.delete(type); } } },
  } };
  const observerSource = source.slice(source.indexOf('function installStartupObserver()'), source.indexOf('\nconst snapshotBase'));
  runInNewContext(`${observerSource}\ninstallStartupObserver()`, scope);
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
  snapshot.lastPublicClick.action = 'mutated';
  assert.equal(api.snapshot().lastPublicClick.action, 'continue');
  api.stop();
  assert.equal(listeners.size, 0);
  assert.equal(bus.size, 0);
});

test('Continue requires a delivered enabled public click before waiting for flight', async () => {
  const start = source.indexOf('    const continueClick = ');
  const end = source.indexOf('    report.continueLaunchMs = ', start);
  const check = source.slice(start, end);
  for (const receipt of [null, { action: 'newGame' }, { action: 'continue', disabled: true },
    { action: 'continue', ariaDisabled: 'true' }]) {
    const run = runInNewContext(`(async () => { ${check} })`, {
      report: {}, page: { evaluate: async () => receipt }, boundedBrowserRead: read => read(),
    });
    await assert.rejects(run(), /tap was not delivered to an enabled Continue control/);
  }
  const receipt = { action: 'continue', disabled: false, ariaDisabled: null };
  const report = {};
  const run = runInNewContext(`(async () => { ${check} })`, {
    report, page: { evaluate: async () => receipt }, boundedBrowserRead: read => read(),
  });
  await run();
  assert.equal(report.continueClick, receipt);
});

test('observed invalid draws fail renderer health independently of console emission', () => {
  const start = source.indexOf('  const contextFailures = new Set();');
  const end = source.indexOf('  // Persist diagnostics', start);
  const health = source.slice(start, end);
  for (const drawErrors of [{ invalidDraws: 3, witnesses: [] }, { witnesses: [{}] }]) {
    const report = { stages: [{ drawErrors }], observations: [], passed: true,
      rendererErrorCount: 0, acceptance: { startupAndControls: 'passed' } };
    const notes = [], process = {};
    runInNewContext(health, { report, process, drawErrorProbe: true,
      noteRendererError(text, source) { report.rendererErrorCount++; notes.push({ text, source }); } });
    assert.equal(report.acceptance.rendererHealth, 'failed');
    assert.equal(report.passed, false);
    assert.equal(process.exitCode, 1);
    assert.equal(notes[0].source, 'draw-observer');
  }
});