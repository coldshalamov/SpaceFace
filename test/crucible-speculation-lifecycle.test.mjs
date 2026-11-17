import assert from 'node:assert/strict';
import test from 'node:test';
import { crucibleScreen } from '../src/ui/screens/crucible.js';

test('Crucible activates the selected-ship preview and speculation only while shown', () => {
  const screen = Object.create(crucibleScreen);
  const observations = [];
  screen._preparation = { setActive: active => observations.push(['preview', active]) };
  screen._refreshDaily = () => observations.push(['refresh', screen._embarkSpecActive]);
  screen._armEmbarkSpec = () => observations.push(['arm', screen._embarkSpecActive]);
  screen._regions = null;

  screen.onShow();
  assert.deepEqual(observations, [['preview', true], ['refresh', true], ['arm', true]]);
  screen.onHide();
  assert.equal(screen._embarkSpecActive, false);
  assert.deepEqual(observations.at(-1), ['preview', false], 'a hidden hangar releases its live preview work');
  screen.onShow();
  assert.deepEqual(observations.slice(4), [['preview', true], ['refresh', true], ['arm', true]]);
});

test('disposing a Crucible door retires its retained speculation callback', () => {
  const screen = Object.create(crucibleScreen);
  let disposed = 0;
  screen._preparation = { dispose: () => disposed++ };
  screen._embarkSpecActive = true;
  screen._armEmbarkSpec = () => assert.fail('disposed door may not speculate');
  screen.dispose();
  assert.equal(screen._embarkSpecActive, false);
  assert.equal(screen._armEmbarkSpec, null);
  assert.equal(screen._preparation, null, 'the screen cannot retain a disposed ship preview');
  screen.dispose();
  assert.equal(disposed, 1, 'disposing twice does not dispose the same preview twice');
});

test('hangar controls stay visible and focused when preview warmup withholds animation frames', t => {
  const keys = ['document', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const frames = [];
  const region = () => {
    const classes = new Set();
    return { classes, classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
    }, dataset: {}, style: { setProperty() {}, removeProperty() {} },
    addEventListener() {}, removeEventListener() {} };
  };
  Object.assign(globalThis, {
    document: { createElement: region, documentElement: region() },
    HTMLElement: function HTMLElement() {},
    requestAnimationFrame: callback => frames.push(callback),
    cancelAnimationFrame() {},
  });
  const screen = Object.create(crucibleScreen);
  const preview = [];
  let focused = 0;
  screen._regions = { title: region(), stage: region(), foot: region() };
  screen._preparation = {
    setActive: active => { preview.push(active); return new Promise(() => {}); },
    focus: () => { focused++; },
  };

  screen.onShow();
  assert.deepEqual(preview, [true], 'the authored preview still warms on arrival');
  assert.equal(focused, 1, 'input focus does not wait for preview readiness');
  assert.equal(frames.length, 0, 'control visibility cannot depend on a queued animation frame');
  for (const element of Object.values(screen._regions)) {
    assert.equal(element.classes.has('k-in'), false, 'arrival never hides or translates a hangar region');
  }
  screen.onHide();
  screen.onShow();
  assert.deepEqual(preview, [true, false, true]);
  assert.equal(focused, 2, 'returning to the cached hangar restores focus synchronously');
  assert.equal(frames.length, 0);
});
