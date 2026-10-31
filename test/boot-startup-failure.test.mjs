// D185 — "STARTUP COULD NOT FINISH" at 1.0%: the boot shell had one response to a failed game
// import, a dead end that said "reload to retry" and waited for the player to do it. A failed
// dynamic import is cached for the document's life, so the only recovery that works is a fresh
// load, and most of these failures are transient. The responder reloads once by itself, then
// stops and names the failure instead of looping. Review follow-up: the retry is remembered until the
// game starts (no time window to outlast), and storage that cannot remember it never retries.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STARTUP_RETRY_DELAY_MS,
  STARTUP_RETRY_KEY,
  annotateStartupFailure,
  clearStartupRetry,
  findBrokenModules,
  presentStartupFailure,
  startupParseOnlySource,
  startupProbeHrefs,
  summarizeStartupError,
} from '../src/ui/bootStartupFailure.js';

function fakeOverlay() {
  const label = { textContent: 'Loading flight systems' };
  const detail = {
    textContent: '',
    classList: { added: [], add(c) { this.added.push(c); } },
  };
  const attrs = {};
  return {
    label,
    detail,
    attrs,
    style: { display: 'none' },
    dataset: {},
    classList: { removed: [], remove(c) { this.removed.push(c); } },
    setAttribute(name, value) { attrs[name] = value; },
    querySelector(selector) {
      if (selector === '[data-loading-label]') return label;
      if (selector === '[data-loading-detail]') return detail;
      return null;
    },
  };
}

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

test('the first failure in a tab session reloads once on its own', () => {
  const overlay = fakeOverlay();
  const storage = fakeStorage();
  const timers = [];
  let reloads = 0;
  const outcome = presentStartupFailure({
    overlay, error: new Error('Failed to fetch dynamically imported module'),
    storage, reload: () => { reloads += 1; }, setTimer: (fn, ms) => timers.push({ fn, ms }), nowMs: 1_000_000,
  });
  assert.equal(outcome, 'retrying');
  assert.equal(storage.getItem(STARTUP_RETRY_KEY), '1000000', 'the retry is remembered');
  assert.equal(overlay.dataset.startupFailure, 'retrying');
  assert.equal(overlay.attrs['aria-busy'], 'true', 'the shell still reads as working while it retries');
  assert.equal(overlay.label.textContent, 'Restarting the flight systems');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, STARTUP_RETRY_DELAY_MS);
  assert.equal(reloads, 0, 'the reload waits out its short delay so the message is readable');
  timers[0].fn();
  assert.equal(reloads, 1);
});

test('a second failure stops, and says what went wrong', () => {
  const overlay = fakeOverlay();
  const storage = fakeStorage({ [STARTUP_RETRY_KEY]: String(1_000_000) });
  let reloads = 0;
  const timers = [];
  const outcome = presentStartupFailure({
    overlay, error: new Error("Unexpected token '<' in cinematic.js"),
    storage, reload: () => { reloads += 1; }, setTimer: (fn) => timers.push(fn),
    nowMs: 1_000_000 + 5_000,
  });
  assert.equal(outcome, 'failed', 'no reload loop');
  assert.equal(timers.length, 0);
  assert.equal(reloads, 0);
  assert.equal(overlay.dataset.startupFailure, 'failed');
  assert.equal(overlay.attrs['aria-busy'], 'false');
  assert.equal(overlay.label.textContent, 'Startup could not finish');
  assert.match(overlay.detail.textContent, /saved games have not been changed/);
  assert.match(overlay.detail.textContent, /Unexpected token/, 'the failure is named for whoever has to fix it');
  assert.deepEqual(overlay.detail.classList.added, ['boot-error']);
});

test('a slow persistent failure never renews its own retry, however late or odd the clock', () => {
  // The target laptop can take 68 s to fail: an expiring window would hand it a new retry every time.
  const storage = fakeStorage();
  let reloads = 0;
  const run = (nowMs) => presentStartupFailure({
    overlay: fakeOverlay(), error: new Error('still broken'), storage,
    reload: () => { reloads += 1; }, setTimer: (fn) => fn(), nowMs,
  });
  assert.equal(run(1_000_000), 'retrying');
  for (const nowMs of [1_061_200, 1_000_000 + 3_600_000, 5, 1_000_000]) {
    assert.equal(run(nowMs), 'failed', `no second retry at t=${nowMs}`);
  }
  assert.equal(reloads, 1, 'exactly one automatic reload for the whole persistent failure');
});

test('unavailable storage never reloads, even with a working reload hook, across repeated documents', () => {
  let reloads = 0;
  for (let document = 0; document < 3; document += 1) {
    const outcome = presentStartupFailure({
      overlay: fakeOverlay(), error: new Error('x'), storage: null,
      reload: () => { reloads += 1; }, setTimer: (fn) => fn(), nowMs: 1_000 + document,
    });
    assert.equal(outcome, 'failed');
  }
  // Storage whose reads work but whose writes are refused is just as unable to stop a loop.
  const readOnly = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); }, removeItem() {} };
  assert.equal(presentStartupFailure({
    overlay: fakeOverlay(), error: new Error('x'), storage: readOnly,
    reload: () => { reloads += 1; }, setTimer: (fn) => fn(), nowMs: 9,
  }), 'failed');
  assert.equal(reloads, 0);
});

test('blocked storage cannot loop: with nowhere to remember the retry, it never reloads', () => {
  const blocked = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  let reloads = 0;
  const outcome = presentStartupFailure({
    overlay: fakeOverlay(), error: new Error('x'), storage: blocked, reload: () => { reloads += 1; },
    setTimer: (fn) => fn(), nowMs: 5,
  });
  assert.equal(outcome, 'failed');
  assert.equal(reloads, 0);
  assert.doesNotThrow(() => clearStartupRetry(blocked));
  assert.equal(
    presentStartupFailure({ overlay: null, error: null, storage: null, reload: null }),
    'failed',
    'no storage and no reload hook still answers without touching a missing overlay',
  );
});

test('a successful start clears the stamp so a later failure gets its own retry', () => {
  const storage = fakeStorage({ [STARTUP_RETRY_KEY]: String(1) });
  clearStartupRetry(storage);
  assert.equal(storage.getItem(STARTUP_RETRY_KEY), null);
});

test('the dead-end probe names the file V8 rejects, not just the token', async () => {
  // The import() rejection is a bare SyntaxError — the filename is recovered by re-parsing
  // each warmed module. A failed link is ignored; only a parser SyntaxError names a culprit.
  const sources = {
    './src/main.js': 'import "./a.js"; import "./b.js";',
    './src/a.js': 'export const a = 1;',
    './src/render/vfx.js': 'export const ok = 1;\n... [truncated for diff preview]',
    './src/b.js': 'export const b = 2;',
  };
  const culprits = await findBrokenModules({
    hrefs: Object.keys(sources),
    fetchText: async (href) => sources[href] ?? null,
    tryParse: async (text) => (text.includes('[truncated')
      ? new SyntaxError("Unexpected token '...'")
      : new TypeError('Failed to resolve module specifier')),
  });
  assert.equal(culprits.length, 1);
  assert.equal(culprits[0].href, './src/render/vfx.js');
  assert.match(culprits[0].message, /Unexpected token/);
});

test('parse-only module probe blocks candidate dynamic imports but still reports syntax errors', async () => {
  const sideEffectKey = '__spacefaceStartupProbeCandidateExecuted__';
  const importKey = '__spacefaceStartupProbeDynamicImportRan__';
  delete globalThis[sideEffectKey];
  delete globalThis[importKey];
  try {
    const candidate = [
      `globalThis.${sideEffectKey} = true;`,
      `import('./densityVolumeData/rle.js').catch(() => { globalThis.${importKey} = true; });`,
      'export const validCandidate = true;',
    ].join('\n');
    const validProbeUrl = `data:text/javascript,${encodeURIComponent(startupParseOnlySource(candidate))}`;
    await assert.rejects(import(validProbeUrl), { code: 'ERR_UNSUPPORTED_ESM_URL_SCHEME' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(globalThis[sideEffectKey], undefined, 'valid candidate body must not execute');
    assert.equal(globalThis[importKey], undefined, 'candidate relative import must not start');

    const malformed = startupParseOnlySource('export const broken = ;');
    const malformedUrl = `data:text/javascript,${encodeURIComponent(malformed)}`;
    await assert.rejects(import(malformedUrl), SyntaxError,
      'a parser error is reported before the deliberate dependency-link failure');
  } finally {
    delete globalThis[sideEffectKey];
    delete globalThis[importKey];
  }
});

test('the probe skips files it cannot fetch and stops when the clock is spent', async () => {
  const culprits = await findBrokenModules({
    hrefs: ['./src/a.js', './src/missing.js', './src/c.js'],
    fetchText: async (href) => (href === './src/missing.js' ? null : 'export default 0;'),
    tryParse: async () => null,
  });
  assert.deepEqual(culprits, []);
  // A spent budget leaves the rest of the list unscanned rather than hanging the dead end.
  let fetches = 0;
  let now = 0;
  await findBrokenModules({
    hrefs: ['./a.js', './b.js', './c.js', './d.js'],
    fetchText: async () => { fetches += 1; now += 30_000; return ''; },
    tryParse: async () => null,
    nowMs: () => now,
    budgetMs: 10_000,
  });
  assert.ok(fetches < 4, `budget stopped the scan after ${fetches} fetch(es)`);
});

test('the annotated dead end puts the broken file on screen', () => {
  const overlay = fakeOverlay();
  overlay.detail.textContent = 'Reload to retry. Your saved games have not been changed. (Unexpected token)';
  assert.equal(annotateStartupFailure({
    overlay,
    culprits: [{ href: './src/render/vfx.js', message: "Unexpected token '...'" }],
    summary: "Unexpected token '...'",
  }), true);
  assert.match(overlay.detail.textContent, /src\/render\/vfx\.js/);
  assert.match(overlay.detail.textContent, /saved games have not been changed/);
  // No culprits, no annotation — the plain message stands.
  assert.equal(annotateStartupFailure({ overlay, culprits: [], summary: 'x' }), false);
  assert.doesNotMatch(overlay.detail.textContent, /\+1 more/);
});

test('the probe list is every warmed module plus the game entry', () => {
  const href = (u) => ({ getAttribute: () => u });
  const doc = { querySelectorAll: () => [href('./vendor/three.module.js'), href('./src/a.js')] };
  assert.deepEqual(startupProbeHrefs(doc), ['./src/main.js', './vendor/three.module.js', './src/a.js']);
  assert.deepEqual(startupProbeHrefs({ querySelectorAll: () => [href('./src/main.js')] }), ['./src/main.js']);
  assert.deepEqual(startupProbeHrefs(null), []);
});

test('the on-screen reason is one short, whitespace-collapsed line', () => {
  assert.equal(summarizeStartupError(new Error('  a\n\n b\tc  ')), 'a b c');
  assert.equal(summarizeStartupError(null), 'unknown error');
  assert.equal(summarizeStartupError(''), 'unknown error');
  assert.equal(summarizeStartupError('plain string'), 'plain string');
  const long = summarizeStartupError(new Error('x'.repeat(500)));
  assert.equal(long.length, 140);
  assert.ok(long.endsWith('…'));
});
