import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  collectPageIssues,
  isExpectedNavigationTextureAbort,
  isNavigationCancelledRequest,
} from '../scripts/lib/browser-issues.mjs';

class FakePage extends EventEmitter {}

const failedRequest = (url, errorText) => ({
  url: () => url,
  failure: () => ({ errorText }),
});

const consoleMessage = (type, text) => ({
  type: () => type,
  text: () => text,
});

test('only requests tagged at expected-navigation start or during its live call may become cancellations', () => {
  const page = new FakePage();
  const tracker = collectPageIssues(page);

  page.emit('requestfailed', failedRequest('http://game.test/before.js', 'net::ERR_ABORTED'));
  const cancelled = failedRequest('http://game.test/cancelled.js', 'net::ERR_ABORTED');
  page.emit('request', cancelled);
  const token = tracker.beginExpectedNavigation('cold-continue');
  const startedDuringNavigation = failedRequest('http://game.test/new-page.js', 'net::ERR_ABORTED');
  page.emit('request', startedDuringNavigation);
  page.emit('requestfailed', failedRequest('http://game.test/broken.js', 'net::ERR_FAILED'));
  page.emit('console', consoleMessage('error', 'live console error'));
  page.emit('response', { status: () => 503, url: () => 'http://game.test/unavailable.js' });
  page.emit('pageerror', new Error('live page error'));
  assert.equal(tracker.endExpectedNavigation(token), true);
  page.emit('requestfailed', cancelled);
  page.emit('requestfailed', startedDuringNavigation);
  page.emit('requestfailed', failedRequest('http://game.test/after.js', 'net::ERR_ABORTED'));

  assert.equal(tracker.ignoredIssues.length, 2);
  assert.deepEqual(tracker.ignoredIssues[0].expectedNavigation, ['cold-continue']);
  assert.match(tracker.ignoredIssues[0].text, /cancelled\.js: net::ERR_ABORTED/);
  assert.deepEqual(tracker.ignoredIssues[1].expectedNavigation, ['cold-continue']);
  assert.match(tracker.ignoredIssues[1].text, /new-page\.js: net::ERR_ABORTED/);
  assert.deepEqual(
    tracker.errorIssues().map((issue) => issue.text),
    [
      'Request failed http://game.test/before.js: net::ERR_ABORTED',
      'Request failed http://game.test/broken.js: net::ERR_FAILED',
      'live console error',
      'HTTP 503 http://game.test/unavailable.js',
      'live page error',
      'Request failed http://game.test/after.js: net::ERR_ABORTED',
    ],
  );
});

test('completed requests lose expected-navigation attribution', () => {
  const page = new FakePage();
  const tracker = collectPageIssues(page);
  const completed = failedRequest('http://game.test/completed.js', 'net::ERR_ABORTED');

  page.emit('request', completed);
  const token = tracker.beginExpectedNavigation('cold-continue');
  page.emit('requestfinished', completed);
  tracker.endExpectedNavigation(token);
  page.emit('requestfailed', completed);

  assert.equal(tracker.ignoredIssues.length, 0);
  assert.deepEqual(tracker.errorIssues().map((issue) => issue.text), [
    'Request failed http://game.test/completed.js: net::ERR_ABORTED',
  ]);
});

test('navigation-cancellation classification is exact', () => {
  assert.equal(isNavigationCancelledRequest({ errorText: 'net::ERR_ABORTED' }), true);
  assert.equal(isNavigationCancelledRequest({ errorText: 'NET::err_aborted' }), true);
  assert.equal(isNavigationCancelledRequest({ errorText: 'net::ERR_FAILED' }), false);
  assert.equal(isNavigationCancelledRequest(null), false);
});

test('an optional save-store deadline is ignored only on an explicitly store-less server', () => {
  const page = new FakePage();
  const absent = collectPageIssues(page, { playerStoreMounted: false });
  const mounted = collectPageIssues(page, { playerStoreMounted: true });
  const unknown = collectPageIssues(page);
  page.emit('requestfailed', failedRequest('http://game.test/__spaceface_player_store', 'net::ERR_ABORTED'));
  assert.equal(absent.issues.length, 0);
  assert.equal(absent.ignoredIssues[0].absentPlayerStore, true);
  assert.equal(mounted.issues.length, 1);
  assert.equal(unknown.issues.length, 1);
  page.emit('requestfailed', failedRequest('http://game.test/__spaceface_player_store', 'net::ERR_FAILED'));
  page.emit('requestfailed', failedRequest('http://game.test/asset.glb', 'net::ERR_ABORTED'));
  assert.equal(absent.issues.length, 2, 'asset failures and real transport faults remain visible');
});

test('GLTF blob errors are ignored only during the harness-owned reload', () => {
  const blobError = "THREE.GLTFLoader: Couldn't load texture blob:http://game.test/texture";
  assert.equal(isExpectedNavigationTextureAbort(blobError, 'harness-reload'), true);
  assert.equal(isExpectedNavigationTextureAbort(blobError, 'flight'), false);
  assert.equal(isExpectedNavigationTextureAbort('unrelated texture failure', 'harness-reload'), false);
});

test('collectPageIssues routes GLTF texture-blob aborts to ignored only during expected navigation', () => {
  const page = new EventEmitter();
  const tracker = collectPageIssues(page);
  const blobError = "THREE.GLTFLoader: Couldn't load texture blob:http://game.test/texture";

  page.emit('console', consoleMessage('error', blobError));
  assert.equal(tracker.issues.length, 1, 'blob abort outside navigation is a real issue');

  const token = tracker.beginExpectedNavigation('gold-corridor-continue');
  page.emit('console', consoleMessage('error', blobError));
  page.emit('console', consoleMessage('error', 'live console error'));
  tracker.endExpectedNavigation(token);
  page.emit('console', consoleMessage('error', blobError));

  assert.equal(tracker.ignoredIssues.length, 1);
  assert.match(tracker.ignoredIssues[0].text, /Couldn't load texture blob/);
  assert.deepEqual(tracker.ignoredIssues[0].expectedNavigation, ['gold-corridor-continue']);
  assert.equal(tracker.issues.length, 3, 'live error and post-navigation blob abort stay issues');
});

test('a cancelled media stream is ignored; a failed or missing clip and cancelled scripts still count', () => {
  const page = new FakePage();
  const tracker = collectPageIssues(page);
  const media = (url, errorText) => ({ ...failedRequest(url, errorText), resourceType: () => 'media' });

  page.emit('requestfailed', media('http://game.test/assets/cinematics/intro-visualizer.mp4', 'net::ERR_ABORTED'));
  page.emit('requestfailed', media('http://game.test/assets/cinematics/broken.mp4', 'net::ERR_FAILED'));
  page.emit('response', { status: () => 404, url: () => 'http://game.test/assets/cinematics/missing.mp4' });
  page.emit('requestfailed', { ...failedRequest('http://game.test/app.js', 'net::ERR_ABORTED'), resourceType: () => 'script' });

  assert.equal(tracker.ignoredIssues.length, 1);
  assert.equal(tracker.ignoredIssues[0].cancelledMedia, true);
  assert.deepEqual(
    tracker.errorIssues().map((issue) => issue.text),
    [
      'Request failed http://game.test/assets/cinematics/broken.mp4: net::ERR_FAILED',
      'HTTP 404 http://game.test/assets/cinematics/missing.mp4',
      'Request failed http://game.test/app.js: net::ERR_ABORTED',
    ],
  );
});
