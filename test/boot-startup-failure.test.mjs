// D185 — "STARTUP COULD NOT FINISH" at 1.0%: the boot shell had one response to a failed game
// import, a dead end that said "reload to retry" and waited for the player to do it. A failed
// dynamic import is cached for the document's life, so the only recovery that works is a fresh
// load, and most of these failures are transient. The responder reloads once by itself, then
// stops and names the failure instead of looping.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STARTUP_RETRY_DELAY_MS,
  STARTUP_RETRY_KEY,
  STARTUP_RETRY_WINDOW_MS,
  clearStartupRetry,
  presentStartupFailure,
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

test('a second failure inside the retry window stops, and says what went wrong', () => {
  const overlay = fakeOverlay();
  const storage = fakeStorage({ [STARTUP_RETRY_KEY]: String(1_000_000) });
  let reloads = 0;
  const timers = [];
  const outcome = presentStartupFailure({
    overlay, error: new Error('Unexpected token \'<\' in cinematic.js'),
    storage, reload: () => { reloads += 1; }, setTimer: (fn) => timers.push(fn),
    nowMs: 1_000_000 + STARTUP_RETRY_WINDOW_MS - 1,
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

test('an old retry stamp does not block a fresh, unrelated failure', () => {
  const storage = fakeStorage({ [STARTUP_RETRY_KEY]: String(1_000_000) });
  const outcome = presentStartupFailure({
    overlay: fakeOverlay(), error: new Error('late'), storage, reload: () => {}, setTimer: () => {},
    nowMs: 1_000_000 + STARTUP_RETRY_WINDOW_MS,
  });
  assert.equal(outcome, 'retrying', 'the window is closed at exactly its length');
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

test('the on-screen reason is one short, whitespace-collapsed line', () => {
  assert.equal(summarizeStartupError(new Error('  a\n\n b\tc  ')), 'a b c');
  assert.equal(summarizeStartupError(null), 'unknown error');
  assert.equal(summarizeStartupError(''), 'unknown error');
  assert.equal(summarizeStartupError('plain string'), 'plain string');
  const long = summarizeStartupError(new Error('x'.repeat(500)));
  assert.equal(long.length, 140);
  assert.ok(long.endsWith('…'));
});
