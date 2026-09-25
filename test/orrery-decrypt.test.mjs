// D45: the ORRERY decrypt reveal could be left mid-scramble on a settled screen — rAF
// starvation on a loaded host meant no late frame ever landed the final string. These
// tests run the real driver on a fake frame pump and fake timers: frames can be dropped
// entirely and the element must still end on its target.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { decrypt } from '../src/ui/orrery/text.js';

// One shared rAF stub for the file: motion.js keeps a module-level frameHandle, and a
// fresh queue per test would orphan the re-armed tick and starve every later driver.
const rafQueue = [];
const prevRAF = globalThis.requestAnimationFrame;
const prevDoc = globalThis.document;

// Present one frame; whatever the driver wanted this frame runs, then the browser
// 'starves' — the harness simply does not pump again until asked.
function pump(now) {
  const pending = rafQueue.splice(0);
  for (const cb of pending) cb(now);
}

const element = () => ({ textContent: '' });
const fakeDocument = { documentElement: { classList: { contains: () => false } } };

before(() => {
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.document = fakeDocument;
});

after(() => {
  if (prevRAF === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = prevRAF;
  if (prevDoc === undefined) delete globalThis.document;
  else globalThis.document = prevDoc;
});

test('decrypt ends on the target string when rAF starves mid-scramble', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  t.after(() => t.mock.timers.reset());
  const el = element();
  decrypt(el, 'READINESS', { duration: 260 });
  pump(0);
  pump(130); // ~halfway: settled prefix plus glyph noise
  assert.notEqual(el.textContent, 'READINESS', 'mid-scramble frame must not equal the target');
  // The tab starves: no frame ever presents again. The timer backstop must still land
  // the final string at the scheduled end.
  t.mock.timers.tick(1000);
  assert.equal(el.textContent, 'READINESS');
});

test('decrypt snaps to the final string on a late frame past the deadline', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  t.after(() => t.mock.timers.reset());
  const el = element();
  decrypt(el, 'READINESS', { duration: 260 });
  pump(0);
  pump(40);
  assert.notEqual(el.textContent, 'READINESS');
  pump(5000); // frames were dropped; the next tick is already past the end
  assert.equal(el.textContent, 'READINESS');
});

test('a replaced decrypt resolves to the newest target, never a scramble of the old', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  t.after(() => t.mock.timers.reset());
  const el = element();
  decrypt(el, 'READINESS', { duration: 260 });
  pump(0);
  pump(130);
  decrypt(el, 'SIGNAL LOST', { duration: 200 });
  pump(200);
  pump(400);
  // The retired driver's own timer must not resurrect the old word afterwards either.
  t.mock.timers.tick(2000);
  assert.equal(el.textContent, 'SIGNAL LOST');
});

test('cancelling a decrypt leaves its target string, not scramble', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  t.after(() => t.mock.timers.reset());
  const el = element();
  const stop = decrypt(el, 'READINESS', { duration: 260 });
  pump(0);
  pump(130);
  stop();
  assert.equal(el.textContent, 'READINESS');
});

test('reduced motion still lands the target immediately', (t) => {
  const reduced = { documentElement: { classList: { contains: () => true } } };
  globalThis.document = reduced;
  t.after(() => { globalThis.document = fakeDocument; });
  const el = element();
  decrypt(el, 'READINESS');
  assert.equal(el.textContent, 'READINESS');
});
