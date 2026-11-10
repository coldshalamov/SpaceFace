// The retail error toast. installGlobalErrorBoundary used to emit through `window.SF.bus`, but
// window.SF only exists inside SF_DEBUG_ONLY blocks that scripts/build-bundle.mjs strips from
// retail bundles — so in the shipped game an uncaught error was silent. The boundary now shows its
// line through the presentation-only receipt route (never a bus `toast`, which simulation
// listeners also hear), keeps a bounded ring of recent errors for the diagnostics report, and
// rate-limits the toast so an error loop cannot spam the player.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { presentReceipt, setReceiptPresenter } from '../src/core/receiptPresenter.js';
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
  // The bus channel simulation listeners hear: the boundary must never use it.
  const busToasts = [];
  bus.on('toast', (t) => busToasts.push(t));
  let clock = 1000;
  const logged = [];
  const boundary = createErrorBoundary({ now: () => clock, log: (label, err) => logged.push({ label, err }) });
  const target = new EventTarget();
  const state = { mode: 'flight', simTime: 42.34 };
  boundary.install(target);
  boundary.attach({ present: (spec) => { toasts.push(spec); }, getState: () => state });
  return { bus, toasts, busToasts, boundary, target, state, logged, advance: (ms) => { clock += ms; } };
}

test('with window.SF undefined, an uncaught error toasts exactly once and lands in the ring', () => {
  assert.equal(globalThis.window?.SF, undefined, 'the retail condition: no debug handle exists');
  const { target, toasts, busToasts, boundary, logged } = rig();
  target.dispatchEvent(errorEvent(new Error('thruster map exploded')));
  assert.equal(toasts.length, 1, 'exactly one receipt reached the presenter');
  assert.equal(busToasts.length, 0, 'and none reached the bus, where a sim listener would hear it');
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

test('an error before the route is armed is ringed, never toasted, and does not burn the cooldown', () => {
  const toasts = [];
  const boundary = createErrorBoundary({ now: () => 5, log: () => {} });
  const target = new EventTarget();
  boundary.install(target);
  target.dispatchEvent(errorEvent(new Error('during module load')));
  assert.equal(toasts.length, 0);
  assert.equal(boundary.recent().length, 1, 'but it is remembered for the report');
  boundary.attach({ present: (spec) => { toasts.push(spec); }, getState: () => ({ mode: 'menu', simTime: 0 }) });
  target.dispatchEvent(errorEvent(new Error('after attach')));
  assert.equal(toasts.length, 1, 'the first post-attach error still gets its toast');
});

test('a line nobody could show (receipt lane not up yet) does not burn the cooldown or the count', () => {
  let ready = false;
  const shown = [];
  const boundary = createErrorBoundary({ now: () => 7, log: () => {} });
  const target = new EventTarget();
  boundary.install(target);
  boundary.attach({ present: (spec) => { if (!ready) return false; shown.push(spec); return true; } });
  target.dispatchEvent(errorEvent(new Error('before the lane')));
  assert.equal(shown.length, 0);
  ready = true;
  target.dispatchEvent(errorEvent(new Error('after the lane')));
  assert.equal(shown.length, 1, 'the first error the lane can show still gets its line');
  assert.doesNotMatch(shown[0].text, /again/, 'the unseen one was not counted as swallowed');
});

test('the default route is the shared presenter and leaves the bus silent', () => {
  const bus = createBus();
  const busToasts = [];
  bus.on('toast', (t) => busToasts.push(t));
  const shown = [];
  const off = setReceiptPresenter((spec) => { shown.push(spec); });
  try {
    const boundary = createErrorBoundary({ now: () => 3, log: () => {} });
    const target = new EventTarget();
    boundary.install(target);
    boundary.attach({ getState: () => ({ mode: 'flight', simTime: 1 }) });
    target.dispatchEvent(errorEvent(new Error('default route')));
    assert.equal(shown.length, 1);
    assert.equal(shown[0].kind, 'warn');
    assert.equal(busToasts.length, 0);
  } finally {
    off();
  }
  assert.equal(presentReceipt({ text: 'nobody home', kind: 'info' }), false, 'no presenter: nothing shows, nothing throws');
});

test('install is idempotent per target and the boundary never throws', () => {
  const { target, boundary, toasts } = rig();
  assert.equal(boundary.install(target), false, 'a second install on the same target adds no listeners');
  target.dispatchEvent(errorEvent(new Error('once')));
  assert.equal(toasts.length, 1, 'one listener pair, one toast');
  assert.equal(boundary.install(null), false);
  assert.equal(boundary.install({}), false);

  const hostile = createErrorBoundary({ now: () => 0, log: () => { throw new Error('console broke'); } });
  hostile.attach({ present() { throw new Error('presenter broke'); }, getState: () => { throw new Error('state broke'); } });
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

test('user paths never reach the ring or a pasted report: UNC shares and home folders with spaces', () => {
  const R = String.raw;
  const cases = [
    [R`/Users/Jane Doe/Library/SpaceFace/save.json`, 'save.json'],
    [R`\\HOME-SERVER\Users\Jane Doe\save.json`, 'save.json'],
    [R`\\\\HOME-SERVER\\Users\\Jane Doe\\save.json`, 'save.json'],
    [R`C:\Users\Jane Doe\AppData\Roaming\SpaceFace\save.json`, 'save.json'],
    [R`C:\\Users\\Jane Doe\\AppData\\save.json`, 'save.json'],
    [R`\\?\C:\Users\Jane Doe\x\y.js:3:4`, 'y.js:3:4'],
    [R`/home/jane doe/.config/SpaceFace/save.json:12:5`, 'save.json:12:5'],
    [R`/root/.config/sf/save.json`, 'save.json'],
    [R`/mnt/c/Users/Jane Doe/Documents/x.json`, 'x.json'],
    [R`/Users/O'Brien/My Games/SpaceFace/save.json`, 'save.json'],
    [R`file:///C:/Users/Jane Doe/app/main.js:12:5`, 'main.js:12:5'],
    [R`file:///Users/Jane Doe/Library/x.json`, 'x.json'],
    [R`file:///C:/Users/Jane%20Doe/app/main.js:12:5`, 'main.js:12:5'],
  ];
  for (const [raw, kept] of cases) {
    const out = sanitizeErrorText(raw, 400);
    assert.equal(out, kept, `${raw} -> ${out}`);
    assert.ok(!/Jane|Doe|HOME-SERVER|jane|Brien/.test(out), `leaked: ${out}`);
  }
  // The path sits inside a sentence: the prose stays, the folders go.
  assert.equal(
    sanitizeErrorText(R`ENOENT: no such file or directory, scandir '/Users/Jane Doe'`),
    "ENOENT: no such file or directory, scandir '<path>'",
    'a bare home folder never turns into the account name',
  );
  assert.equal(sanitizeErrorText(R`ENOENT open C:\Users\Jane Doe`), 'ENOENT open <path>');
  assert.equal(sanitizeErrorText(R`at load (/Users/Jane Doe/app/main.js:12:5)`), 'at load (main.js:12:5)');
  assert.equal(
    sanitizeErrorText(R`x.json failed to open \\HOME-SERVER\share\dir\save.json then retried`),
    'x.json failed to open save.json then retried',
  );
  assert.equal(sanitizeErrorText(R`\\HOME-SERVER\share`), '<path>', 'a bare share name is not a file name');
  // Ordinary text and a URL on the page's own origin keep their meaning.
  assert.equal(sanitizeErrorText('a/b and c//d'), 'a/b and c//d');
  assert.equal(sanitizeErrorText('at http://localhost:3000/assets/main.js:1:2'), 'at main.js:1:2');

  // Through the ring: both the message and the stack head are cleaned.
  const err = new Error(R`cannot read \\HOME-SERVER\Users\Jane Doe\save.json`);
  err.stack = ['Error: x', R`    at open (/Users/Jane Doe/Library/SpaceFace/io.js:4:2)`,
    R`    at \\HOME-SERVER\Users\Jane Doe\lib\main.js:9:1`].join('\n');
  const { target, boundary } = rig();
  target.dispatchEvent(errorEvent(err));
  const [entry] = boundary.recent();
  assert.ok(!/Jane|Doe|HOME-SERVER/.test(`${entry.message} ${entry.stack}`), `${entry.message} ${entry.stack}`);
  assert.match(entry.stack, /io\.js:4:2/);
  assert.match(entry.stack, /main\.js:9:1/);
});

test('the path scrubber stays cheap on hostile text (the boundary runs inside an error handler)', () => {
  const hostile = [
    '\\'.repeat(200000),
    '\\'.repeat(19000) + 'x',
    '/Users/' + 'a '.repeat(100000),
    '/Users/' + 'a b/'.repeat(50000),
    'C:\\' + 'a b\\'.repeat(30000),
    '\\\\a\\b '.repeat(20000),
    'file:///' + 'a b/'.repeat(50000),
  ];
  for (const text of hostile) {
    const started = performance.now();
    const out = sanitizeErrorText(text);
    const took = performance.now() - started;
    assert.ok(took < 250, `${took.toFixed(0)} ms for ${text.slice(0, 24)}...`);
    assert.ok(out.length <= 240);
  }
});

test('main.js arms the boundary right after createBus() with the receipt route, not the bus or window.SF', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /attachErrorBoundary\(\{ getState:/, 'armed with a state reader and the default presenter');
  assert.ok(!/attachErrorBoundary\(\{ bus/.test(source), 'the bus is not the toast route');
  const afterBus = source.indexOf('const bus = createBus();');
  assert.ok(afterBus > 0 && source.indexOf('attachErrorBoundary(', afterBus) - afterBus < 400,
    'attach happens immediately after createBus()');
  assert.ok(!/function installGlobalErrorBoundary/.test(source),
    'the window.SF-based boundary is gone from main.js');
});
