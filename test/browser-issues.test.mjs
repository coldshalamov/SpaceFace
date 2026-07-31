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

test('only explicitly bracketed net::ERR_ABORTED requests are navigation cancellations', () => {
  const page = new FakePage();
  const tracker = collectPageIssues(page);

  page.emit('requestfailed', failedRequest('http://game.test/before.js', 'net::ERR_ABORTED'));
  const token = tracker.beginExpectedNavigation('cold-continue');
  page.emit('requestfailed', failedRequest('http://game.test/cancelled.js', 'net::ERR_ABORTED'));
  page.emit('requestfailed', failedRequest('http://game.test/broken.js', 'net::ERR_FAILED'));
  page.emit('console', consoleMessage('error', 'live console error'));
  page.emit('response', { status: () => 503, url: () => 'http://game.test/unavailable.js' });
  page.emit('pageerror', new Error('live page error'));
  assert.equal(tracker.endExpectedNavigation(token), true);
  page.emit('requestfailed', failedRequest('http://game.test/after.js', 'net::ERR_ABORTED'));

  assert.equal(tracker.ignoredIssues.length, 1);
  assert.deepEqual(tracker.ignoredIssues[0].expectedNavigation, ['cold-continue']);
  assert.match(tracker.ignoredIssues[0].text, /cancelled\.js: net::ERR_ABORTED/);
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

test('navigation-cancellation classification is exact', () => {
  assert.equal(isNavigationCancelledRequest({ errorText: 'net::ERR_ABORTED' }), true);
  assert.equal(isNavigationCancelledRequest({ errorText: 'NET::err_aborted' }), true);
  assert.equal(isNavigationCancelledRequest({ errorText: 'net::ERR_FAILED' }), false);
  assert.equal(isNavigationCancelledRequest(null), false);
});
