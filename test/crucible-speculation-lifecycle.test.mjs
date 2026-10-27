import assert from 'node:assert/strict';
import test from 'node:test';
import { crucibleScreen } from '../src/ui/screens/crucible.js';

test('Crucible opens speculation before refreshing choices and closes it on hide', () => {
  const screen = Object.create(crucibleScreen);
  const observations = [];
  screen._refreshDaily = () => observations.push(['refresh', screen._embarkSpecActive]);
  screen._armEmbarkSpec = () => observations.push(['arm', screen._embarkSpecActive]);
  screen._regions = null;

  screen.onShow();
  assert.deepEqual(observations, [['refresh', true], ['arm', true]]);
  screen.onHide();
  assert.equal(screen._embarkSpecActive, false);
  screen.onShow();
  assert.deepEqual(observations.slice(2), [['refresh', true], ['arm', true]]);
});

test('disposing a Crucible door retires its retained speculation callback', () => {
  const screen = Object.create(crucibleScreen);
  screen._embarkSpecActive = true;
  screen._armEmbarkSpec = () => assert.fail('disposed door may not speculate');
  screen.dispose();
  assert.equal(screen._embarkSpecActive, false);
  assert.equal(screen._armEmbarkSpec, null);
});
