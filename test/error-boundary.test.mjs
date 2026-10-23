// The retail error toast. installGlobalErrorBoundary used to emit through `window.SF.bus`, but
// window.SF only exists inside SF_DEBUG_ONLY blocks that scripts/build-bundle.mjs strips from
// retail bundles — so in the shipped game an uncaught error was silent. The boundary now toasts
// over the bus main.js captures right after createBus(), keeps a bounded ring of recent errors
// for the diagnostics report, and rate-limits the toast so an error loop cannot spam the player.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import {
  RING_MAX,
  TOAST_COOLDOWN_MS,
  createErrorBoundary,
  sanitizeErrorText,
} from '../src/core/errorBoundary.js';

function errorEvent(error, message) {
  return Object.assign(new Event('error'), { error, message: message ?? (error && error.message) });
}
function rejectionEvent(reason) {
  return Object.assign(new Event('unhandledrejection'), { reason });
}

function rig() {
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  let clock = 1000;
  const logged = [];
  const boundary = createErrorBoundary({ now: () => clock, log: (label, err) => logged.push({ label, err }) });
  const target = new EventTarget();
  const state = { mode: 'flight', simTime: 42.34 };
  boundary.install(target);
  boundary.attach({ bus, getState: () => state });
  return { bus, toasts, boundary, target, state, logged, advance: (ms) => { clock += ms; } };
}

test('with window.SF undefined, an uncaught error toasts exactly once and lands in the ring', () => {
  assert.equal(globalThis.window?.SF, undefined, 'the retail condition: no debug handle exists');
  const { target, toasts, boundary, logged } = rig();
  target.dispatchEvent(errorEvent(new Error('thruster map exploded')));
  assert.equal(toasts.length, 1, 'exactly one toast reached the bus');
  assert.equal(toasts[0].kind, 'warn');
  assert.match(toasts[0].text, /Something went wrong/);
  assert.equal(logged.length, 1, 'the console still gets the full error');
  const ring = boundary.recent();
  assert.equal(ring.length, 1);
  assert.equal(ring[0].message, 'thruster map exploded');
  assert.equal(ring[0].label, 'uncaught error');
  assert.equal(ring[0].mode, 'flight');
  assert.equal(ring[0].simTime, 42.3);
});

test('an unhandled rejection toasts exactly once and lands in the ring', () => {
  const { target, toasts, boundary } = rig();
  target.dispatchEvent(rejectionEvent(new Error('texture decode failed')));
  assert.equal(toasts.length, 1);
  assert.equal(boundary.recent()[0].label, 'unhandled rejection');
  assert.equal(boundary.recent()[0].message, 'texture decode failed');
  // Non-Error reasons are described too.
  const second = rig();
  second.target.dispatchEvent(rejectionEvent('plain string reason'));
  assert.equal(second.boundary.recent()[0].message, 'plain string reason');
  const third = rig();
  third.target.dispatchEvent(rejectionEvent(undefined));
  assert.equal(third.toasts.length, 1, 'an undefined reason still surfaces');
});

test('an error loop toasts once per cooldown and the next toast counts what it swallowed', () => {
  const { target, toasts, boundary, advance } = rig();
  for (let i = 0; i < 50; i += 1) {
    target.dispatchEvent(errorEvent(new Error('loop ' + i)));
    advance(100);
  }
  assert.equal(toasts.length, 1, '50 errors in 5 s are one toast');
  assert.equal(boundary.recent().length, RING_MAX, 'the ring is bounded');
  assert.equal(boundary.recent().at(-1).message, 'loop 49', 'the ring keeps the newest');
  assert.equal(boundary.recent()[0].message, 'loop ' + (50 - RING_MAX));

  advance(TOAST_COOLDOWN_MS);
  target.dispatchEvent(errorEvent(new Error('after the cooldown')));
  assert.equal(toasts.length, 2, 'the cooldown expires');
  assert.match(toasts[1].text, /\d+ errors were logged/);
});

test('an error before the bus is attached is ringed, never toasted, and does not burn the cooldown', () => {
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));
  const boundary = createErrorBoundary({ now: () => 5, log: () => {} });
  const target = new EventTarget();
  boundary.install(target);
  target.dispatchEvent(errorEvent(new Error('during module load')));
  assert.equal(toasts.length, 0);
  assert.equal(boundary.recent().length, 1, 'but it is remembered for the report');
  boundary.attach({ bus, getState: () => ({ mode: 'menu', simTime: 0 }) });
  target.dispatchEvent(errorEvent(new Error('after attach')));
  assert.equal(toasts.length, 1, 'the first post-attach error still gets its toast');
});

test('install is idempotent per target and the boundary never throws', () => {
  const { target, boundary, toasts } = rig();
  assert.equal(boundary.install(target), false, 'a second install on the same target adds no listeners');
  target.dispatchEvent(errorEvent(new Error('once')));
  assert.equal(toasts.length, 1, 'one listener pair, one toast');
  assert.equal(boundary.install(null), false);
  assert.equal(boundary.install({}), false);

  const hostile = createErrorBoundary({ now: () => 0, log: () => { throw new Error('console broke'); } });
  hostile.attach({ bus: { emit() { throw new Error('bus broke'); } }, getState: () => { throw new Error('state broke'); } });
  const evil = { get message() { throw new Error('getter'); }, get stack() { throw new Error('getter'); } };
  assert.doesNotThrow(() => hostile.record('x', evil));
  assert.doesNotThrow(() => hostile.record('x', null));
});

test('user paths never reach the ring: Windows, file URL, and POSIX stacks collapse to file names', () => {
  const stack = [
    'Error: boom',
    '    at drawShip (file:///C:/Users/93rob/AppData/Local/Programs/SpaceFace/resources/app/src/render/renderer.js:812:9)',
    '    at C:\\Users\\John Smith\\Documents\\SpaceFace\\src\\main.js:77:3',
    '    at tick (/home/ana/game/src/core/loop.js:20:1)',
    '    at https://spaceface.example.com/assets/index-abc.js?v=1:3:40',
  ].join('\n');
  const err = new Error("ENOENT: open 'C:\\Users\\93rob\\saves\\slot1.json'");
  err.stack = stack;
  const { target, boundary } = rig();
  target.dispatchEvent(errorEvent(err));
  const [entry] = boundary.recent();
  const blob = `${entry.message} ${entry.stack}`;
  for (const secret of ['93rob', 'John', 'Smith', 'ana', 'AppData', 'Documents', 'home/']) {
    assert.ok(!blob.includes(secret), `"${secret}" leaked into: ${blob}`);
  }
  assert.match(entry.message, /slot1\.json/);
  assert.match(entry.stack, /renderer\.js:812:9/);
  assert.match(entry.stack, /main\.js:77:3/);
  assert.equal(entry.stack.split(' | ').length, 3, 'only a short stack head is kept');
  assert.equal(sanitizeErrorText(null), '');
  assert.equal(sanitizeErrorText('x'.repeat(1000)).length, 240);
});

test('main.js routes the boundary through the captured bus, not window.SF', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /attachErrorBoundary\(\{ bus,/, 'the bus is captured right after createBus()');
  const afterBus = source.indexOf('const bus = createBus();');
  assert.ok(afterBus > 0 && source.indexOf('attachErrorBoundary(', afterBus) - afterBus < 400,
    'attach happens immediately after createBus()');
  assert.ok(!/function installGlobalErrorBoundary/.test(source),
    'the window.SF-based boundary is gone from main.js');
});
