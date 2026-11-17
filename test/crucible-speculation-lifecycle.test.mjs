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
