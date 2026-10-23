// The diagnostics report a beta tester pastes into an issue, and the clipboard helper behind
// "Copy details". Pure builder: it must carry the version, machine, graphics, quality, place and
// recent errors — and nothing personal — and it must never throw, even with no game state.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { createErrorBoundary } from '../src/core/errorBoundary.js';
import {
  buildDiagnosticsReport,
  copyDiagnosticsReport,
  copyTextToClipboard,
  resetDiagnosticsReportCache,
} from '../src/ui/diagnosticsReport.js';

const ENV = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Electron/33.0 SpaceFace/0.1.0',
  hardwareConcurrency: 8,
  deviceMemory: 8,
  viewport: { width: 1920, height: 1080, dpr: 1.25 },
};
const NOW = new Date('2026-10-22T12:00:00.000Z');

function liveState() {
  const state = createGameState(7);
  state.mode = 'flight';
  state.tick = 600;
  state.simTime = 10;
  state.world.currentSectorId = 'ceres';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.physicsRuntime = { diagnostics: { sg02Ready: true } };
  state.render = {
    gpu: { renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620)', vendor: 'Google Inc. (Intel)', software: false, tier: 'integrated' },
    dynResScale: 0.82,
    renderGraph: { big: 'object that must never be printed' },
    spaceBg: { alsoAnObject: true },
  };
  // Things a report must never carry.
  state.player.credits = 987654;
  state.player.name = 'SecretCaptainName';
  return state;
}

test('the report names version, machine, graphics, quality, place, physics and recent errors', () => {
  resetDiagnosticsReportCache();
  const boundary = createErrorBoundary({ now: () => 12345, log: () => {} });
  boundary.record('uncaught error', Object.assign(new Error('mesh pool exhausted'), {
    stack: 'Error: x\n    at spawn (file:///C:/Users/93rob/Game/src/world/spawn.js:44:7)',
  }), { silent: true });
  const text = buildDiagnosticsReport(liveState(), {
    env: ENV, now: NOW, version: { version: '0.1.0', build: 'abc123def456' }, errors: boundary.recent(),
  });
  assert.match(text, /^SpaceFace diagnostics\n/);
  assert.match(text, /Game: SpaceFace v0\.1\.0 · abc123def456/);
  assert.match(text, /Captured: 2026-10-22T12:00:00\.000Z/);
  assert.match(text, new RegExp('Save format: v' + CURRENT_VERSION + '\\b'));
  assert.match(text, /Browser: Mozilla\/5\.0 .*Electron\/33\.0 SpaceFace\/0\.1\.0\n/, 'the whole user agent survives');
  assert.match(text, /Machine: 8 cores, ~8 GB memory, 1920x1080 @1\.25x/);
  assert.match(text, /Graphics: ANGLE \(Intel, Intel\(R\) UHD Graphics 620\) \(Google Inc\. \(Intel\)\)/);
  assert.match(text, /Graphics tier: integrated\n/);
  assert.match(text, /Mode: flight\n/);
  assert.match(text, /Sector: ceres\n/);
  assert.match(text, /Sim: tick 600, 10 s/);
  assert.match(text, /Quality: qualityPreset=medium, renderScale=1/);
  assert.match(text, /Renderer flags: dynResScale=0\.82, renderGraph=on/);
  assert.match(text, /Physics: rapier-dynamic, authority ready/);
  assert.match(text, /Recent errors \(1\)\n {2}\[\+12s\] uncaught error: mesh pool exhausted\n {6}at spawn \(spawn\.js:44:7\)/);
});

test('no personal data: no save contents, no seed, no user paths', () => {
  const text = buildDiagnosticsReport(liveState(), {
    env: ENV, now: NOW, version: { version: '0.1.0', build: '' },
    errors: [{ at: 0, label: 'x', message: 'opened C:\\Users\\93rob\\saves\\slot1.json', stack: '' }],
    failure: { code: 'BOOT_FAILED', message: 'Failed at file:///C:/Users/93rob/AppData/x/main.js:1:1' },
  });
  for (const secret of ['987654', 'SecretCaptainName', '93rob', 'AppData', 'object that must never be printed', 'alsoAnObject']) {
    assert.ok(!text.includes(secret), `"${secret}" must not appear in the report:\n${text}`);
  }
  assert.match(text, /slot1\.json/);
  assert.match(text, /Message: Failed at main\.js:1:1/);
});

test('a failure block carries code, wording, message and loop coordinates', () => {
  const text = buildDiagnosticsReport(liveState(), {
    env: ENV, now: NOW, version: { version: '0.1.0', build: '' }, errors: [],
    failure: {
      code: 'FLIGHT_INTERRUPTED', headline: 'Flight interrupted', fills: 'The simulation stopped.',
      detail: 'Restart from the main menu to recover.',
      message: 'fault-injection: broken component', site: 'at registry.step', tick: 12, simTime: 4.5,
    },
  });
  assert.match(text, /\nFailure\n {2}Code: FLIGHT_INTERRUPTED\n {2}What: Flight interrupted\n {2}Detail: The simulation stopped\.\n {2}Next step: Restart from the main menu to recover\.\n {2}Message: fault-injection: broken component\n {2}Site: at registry\.step\n {2}Tick: 12\n {2}Sim time: 4\.5\n/);
  assert.match(text, /Recent errors \(0\)\n {2}none recorded/);
});

test('it never throws: no state, partial state, hostile state, no browser globals', () => {
  resetDiagnosticsReportCache();
  const opts = { env: {}, now: NOW, version: { version: '0.1.0', build: '' }, errors: [], document: null };
  for (const state of [null, undefined, {}, { render: null, settings: null, world: null }, 'nope']) {
    let text;
    assert.doesNotThrow(() => { text = buildDiagnosticsReport(state, opts); });
    assert.match(text, /^SpaceFace diagnostics/);
  }
  const noState = buildDiagnosticsReport(null, opts);
  assert.match(noState, /Game state: not created yet/);
  assert.match(noState, /Graphics: not detected yet/);

  const hostile = {
    get mode() { throw new Error('mode getter'); },
    get settings() { throw new Error('settings getter'); },
    get render() { throw new Error('render getter'); },
    get world() { throw new Error('world getter'); },
  };
  assert.doesNotThrow(() => buildDiagnosticsReport(hostile, opts));
  assert.doesNotThrow(() => buildDiagnosticsReport(liveState(), { ...opts, env: null, version: null, now: 'bad' }));
});

test('with no game GPU it probes WebGL once, and says so when WebGL is missing', () => {
  resetDiagnosticsReportCache();
  let created = 0;
  const noWebgl = { createElement() { created += 1; return { getContext: () => null }; } };
  const opts = { env: {}, now: NOW, version: { version: '0.1.0', build: '' }, errors: [], document: noWebgl };
  assert.match(buildDiagnosticsReport(null, opts), /Graphics: WebGL is not available/);
  buildDiagnosticsReport(null, opts);
  assert.equal(created, 1, 'the throwaway canvas is created once, not per report');

  resetDiagnosticsReportCache();
  const gl = {
    getExtension: (name) => (name === 'WEBGL_debug_renderer_info'
      ? { UNMASKED_RENDERER_WEBGL: 1, UNMASKED_VENDOR_WEBGL: 2 }
      : { loseContext() {} }),
    getParameter: (p) => (p === 1 ? 'NVIDIA GeForce RTX 3060' : 'NVIDIA Corporation'),
  };
  const withGl = { createElement: () => ({ getContext: () => gl }) };
  const text = buildDiagnosticsReport(null, { ...opts, document: withGl });
  assert.match(text, /Graphics: NVIDIA GeForce RTX 3060 \(NVIDIA Corporation\)/);
  assert.match(text, /Graphics tier: discrete/);
  resetDiagnosticsReportCache();
});

function fakeClipboardDoc({ execResult = true } = {}) {
  const log = { appended: 0, removed: 0, copied: 0, selected: 0, textareaValue: null, focusRestored: 0 };
  const prior = { focus() { log.focusRestored += 1; } };
  const area = {
    style: {}, parentNode: null, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    focus() {}, select() { log.selected += 1; }, setSelectionRange() {},
  };
  const doc = {
    activeElement: prior,
    body: {
      appendChild(node) { node.parentNode = doc.body; log.appended += 1; log.textareaValue = node.value; },
      removeChild(node) { node.parentNode = null; log.removed += 1; },
    },
    createElement() { return area; },
    execCommand(cmd) { if (cmd === 'copy') log.copied += 1; return execResult; },
  };
  return { doc, log };
}

test('copy uses navigator.clipboard when it works', async () => {
  const written = [];
  const nav = { clipboard: { writeText: (t) => { written.push(t); return Promise.resolve(); } } };
  const { doc, log } = fakeClipboardDoc();
  assert.equal(await copyTextToClipboard('hello', { navigator: nav, document: doc }), true);
  assert.deepEqual(written, ['hello']);
  assert.equal(log.copied, 0, 'the textarea route is only a fallback');
});

test('copy falls back to a hidden textarea when the clipboard API is missing or refuses', async () => {
  const { doc, log } = fakeClipboardDoc();
  assert.equal(await copyTextToClipboard('details', { navigator: {}, document: doc }), true);
  assert.equal(log.textareaValue, 'details');
  assert.equal(log.copied, 1);
  assert.equal(log.removed, 1, 'the scratch textarea is removed');
  assert.equal(log.focusRestored, 1, 'focus goes back where it was');

  const refusing = { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } };
  const second = fakeClipboardDoc();
  assert.equal(await copyTextToClipboard('x', { navigator: refusing, document: second.doc }), true);
  assert.equal(second.log.copied, 1);

  const throwing = { clipboard: { writeText: () => { throw new Error('sync throw'); } } };
  const third = fakeClipboardDoc();
  assert.equal(await copyTextToClipboard('x', { navigator: throwing, document: third.doc }), true);
});

test('copy resolves false (never rejects) when nothing can copy', async () => {
  assert.equal(await copyTextToClipboard('x', { navigator: {}, document: null }), false);
  const { doc } = fakeClipboardDoc({ execResult: false });
  assert.equal(await copyTextToClipboard('x', { navigator: {}, document: doc }), false);
  const broken = { createElement() { throw new Error('dom gone'); }, execCommand() { return true; } };
  assert.equal(await copyTextToClipboard('x', { navigator: null, document: broken }), false);
});

test('copyDiagnosticsReport copies the built report', async () => {
  resetDiagnosticsReportCache();
  const written = [];
  const nav = { clipboard: { writeText: (t) => { written.push(t); return Promise.resolve(); } } };
  const ok = await copyDiagnosticsReport(liveState(), {
    navigator: nav, document: null, env: ENV, now: NOW, errors: [], version: { version: '0.1.0', build: 'cafe' },
  });
  assert.equal(ok, true);
  assert.match(written[0], /^SpaceFace diagnostics\nGame: SpaceFace v0\.1\.0 · cafe/);
});
