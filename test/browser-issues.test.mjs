import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  collectPageIssues,
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

test('request history backfills work that was already in flight when collection attached', async () => {
  const page = new FakePage();
  let failure = null;
  const pending = {
    url: () => 'http://game.test/pre-attachment.js',
    failure: () => failure,
    response: async () => ({ status: () => 200 }),
  };
  page.requests = async () => [pending];
  const tracker = collectPageIssues(page);

  assert.deepEqual(await tracker.backfillActiveRequests(), {
    supported: true,
    observed: 1,
    active: 1,
  });
  const token = tracker.beginExpectedNavigation('cold-continue');
  tracker.endExpectedNavigation(token);
  failure = { errorText: 'net::ERR_ABORTED' };
  page.emit('requestfailed', pending);

  assert.equal(tracker.errorIssues().length, 0);
  assert.equal(tracker.ignoredIssues.length, 1);
  assert.deepEqual(tracker.ignoredIssues[0].expectedNavigation, ['cold-continue']);
});

test('navigation-cancellation classification is exact', () => {
  assert.equal(isNavigationCancelledRequest({ errorText: 'net::ERR_ABORTED' }), true);
  assert.equal(isNavigationCancelledRequest({ errorText: 'NET::err_aborted' }), true);
  assert.equal(isNavigationCancelledRequest({ errorText: 'net::ERR_FAILED' }), false);
  assert.equal(isNavigationCancelledRequest(null), false);
});
