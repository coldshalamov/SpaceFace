import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMobileResponseLedger,
  observedWorkerFailures,
  recordMobileRequestFailure,
  recordMobileResponse,
  resolveWorkerContractUrls,
  validateWorkerContractFixture,
} from '../scripts/lib/mobileWorkerContract.mjs';

const host = 'spaceface-play-demo-md1aaeje0-robin-gattis-projects.vercel.app';
const validAssets = () => ({
  digest: { status: 200, mime: 'application/javascript; charset=utf-8' },
  prepass: { status: 200, mime: 'application/javascript; charset=utf-8' },
});
const validRoundTrips = () => ({
  digest: { kind: 'message', expectedHex: 'abc', hex: 'abc', returnedText: 'SpaceFace mobile worker contract', detached: true },
  prepass: { kind: 'message', ok: true, glbMatches: true, detached: true },
});

test('worker URLs resolve through the actual runtime contract for raw, retail, and pinned releases', () => {
  assert.deepEqual(resolveWorkerContractUrls({
    moduleUrl: 'https://game.test/src/render/host.js', production: false,
  }), {
    digest: 'https://game.test/src/render/renderPackageDigestWorker.js',
    prepass: 'https://game.test/src/render/glbPrepassWorker.js',
  });
  assert.deepEqual(resolveWorkerContractUrls({
    moduleUrl: 'https://game.test/chunks/a.js', production: true,
    documentBase: 'https://game.test/demo/index.html',
  }), {
    digest: 'https://game.test/demo/workers/renderPackageDigestWorker.js',
    prepass: 'https://game.test/demo/workers/glbPrepassWorker.js',
  });
  assert.deepEqual(resolveWorkerContractUrls({
    moduleUrl: 'https://spaceface-play-demo.vercel.app/_releases/entry/main.js', production: true,
    documentBase: 'https://spaceface-play-demo.vercel.app/', releaseBase: `/_releases/${host}/`,
  }), {
    digest: `https://spaceface-play-demo.vercel.app/_releases/${host}/workers/renderPackageDigestWorker.js`,
    prepass: `https://spaceface-play-demo.vercel.app/_releases/${host}/workers/glbPrepassWorker.js`,
  });
});

test('a lazy worker response beyond the capped journal is still accepted by the native contract path', () => {
  const ledger = createMobileResponseLedger();
  for (let index = 0; index < 3001; index++) {
    recordMobileResponse(ledger, { url: `https://game.test/assets/chunk-${index}.json`, status: 200,
      type: 'script', mime: 'application/json' });
  }
  const workerUrls = resolveWorkerContractUrls({ moduleUrl: 'https://game.test/', production: true });
  assert.equal(ledger.responseCount, 3001);
  assert.equal(ledger.responses.length, 3000);
  assert.equal(ledger.criticalResponseCount, 0);
  assert.deepEqual(observedWorkerFailures(ledger.responses, workerUrls), []);
  assert.deepEqual(observedWorkerFailures([{
    url: workerUrls.digest, status: 200, mime: 'text/plain',
  }], workerUrls), [{ id: 'digest', reason: 'wrong-mime', mime: 'text/plain', status: 200, url: workerUrls.digest }]);
  assert.equal(validateWorkerContractFixture({ assets: validAssets(), roundTrips: validRoundTrips() }).ok, true);
});

test('critical HTTP failures remain visible after the normal response cap', () => {
  const ledger = createMobileResponseLedger();
  for (let index = 0; index < 3000; index++) {
    recordMobileResponse(ledger, { url: `https://game.test/assets/chunk-${index}.json`, status: 200 });
  }
  recordMobileResponse(ledger, { url: 'https://game.test/workers/renderPackageDigestWorker.js', status: 404,
    type: 'script', mime: 'text/html' });
  recordMobileRequestFailure(ledger, { url: 'https://game.test/workers/glbPrepassWorker.js', error: 'net::ERR_FAILED' });
  assert.equal(ledger.responses.length, 3000);
  assert.equal(ledger.criticalResponseCount, 1);
  assert.equal(ledger.criticalResponses.length, 1);
  assert.equal(ledger.criticalResponses[0].status, 404);
  assert.equal(ledger.workerResponseFailureCount, 1);
  assert.equal(ledger.workerResponseFailures[0].reason, 'http-status');
  assert.equal(ledger.criticalRequestFailureCount, 1);
  assert.equal(ledger.criticalRequestFailures[0].url.endsWith('/glbPrepassWorker.js'), true);
});

test('a capped worker wrong-MIME response remains a failure after a later good preflight response', () => {
  const ledger = createMobileResponseLedger();
  const workerUrls = resolveWorkerContractUrls({ moduleUrl: 'https://game.test/', production: true });
  for (let index = 0; index < 3000; index++) {
    recordMobileResponse(ledger, { url: `https://game.test/assets/chunk-${index}.json`, status: 200 });
  }
  recordMobileResponse(ledger, { url: workerUrls.digest, status: 200, type: 'script', mime: 'text/html' });
  recordMobileResponse(ledger, { url: workerUrls.digest, status: 200, type: 'script', mime: 'application/javascript; charset=utf-8' });
  const failures = observedWorkerFailures(ledger.responses, workerUrls, ledger.workerResponseFailures);
  assert.equal(ledger.responses.length, 3000);
  assert.equal(ledger.workerResponseFailureCount, 1);
  assert.equal(ledger.workerResponseFailures[0].reason, 'wrong-mime');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason, 'wrong-mime');
});

test('a passive 304 is accepted only after the identical worker URL had a valid JavaScript 200', () => {
  const url = 'https://game.test/_releases/phone-abc/workers/renderPackageDigestWorker.js?release=phone-abc';
  const workerUrls = { digest: url };
  const ledger = createMobileResponseLedger();
  recordMobileResponse(ledger, { url, status: 200, type: 'script', mime: 'application/javascript; charset=utf-8' });
  recordMobileResponse(ledger, { url, status: 304, type: 'script', mime: '' });
  assert.equal(ledger.workerResponseFailureCount, 0);
  assert.deepEqual(observedWorkerFailures(ledger.responses, workerUrls,
    ledger.workerResponseFailures, ledger.workerResponseSuccesses), []);
});

test('orphan, wrong-MIME, different-release and future-200 cache responses remain failures', () => {
  const base = 'https://game.test/_releases/phone-abc/workers/renderPackageDigestWorker.js';
  const cases = [
    ['orphan 304', [{ url: `${base}?release=phone-abc`, status: 304, mime: '' }]],
    ['wrong MIME before 304', [
      { url: `${base}?release=phone-abc`, status: 200, mime: 'text/html' },
      { url: `${base}?release=phone-abc`, status: 304, mime: '' },
    ]],
    ['different release URL', [
      { url: `${base}?release=phone-old`, status: 200, mime: 'application/javascript' },
      { url: `${base}?release=phone-abc`, status: 304, mime: '' },
    ]],
    ['future 200', [
      { url: `${base}?release=phone-abc`, status: 304, mime: '' },
      { url: `${base}?release=phone-abc`, status: 200, mime: 'application/javascript' },
    ]],
    ['200 HTML', [{ url: `${base}?release=phone-abc`, status: 200, mime: 'text/html' }]],
    ['404', [{ url: `${base}?release=phone-abc`, status: 404, mime: 'text/html' }]],
  ];
  for (const [label, responses] of cases) {
    const ledger = createMobileResponseLedger();
    for (const response of responses) recordMobileResponse(ledger, response);
    const failures = observedWorkerFailures(ledger.responses, { digest: `${base}?release=phone-abc` },
      ledger.workerResponseFailures, ledger.workerResponseSuccesses);
    assert.ok(ledger.workerResponseFailureCount > 0, `${label}: ledger failure`);
    assert.ok(failures.length > 0, `${label}: observed failure`);
  }
});

test('HTTP, MIME, worker error, timeout, and bad replies fail closed', () => {
  const cases = [
    ['404', { assets: { ...validAssets(), digest: { status: 404, mime: 'text/html' } }, roundTrips: validRoundTrips() }],
    ['wrong MIME', { assets: { ...validAssets(), prepass: { status: 200, mime: 'text/plain' } }, roundTrips: validRoundTrips() }],
    ['error', { assets: validAssets(), roundTrips: { ...validRoundTrips(), digest: { kind: 'error' } } }],
    ['timeout', { assets: validAssets(), roundTrips: { ...validRoundTrips(), prepass: { kind: 'timeout' } } }],
    ['bad reply', { assets: validAssets(), roundTrips: { ...validRoundTrips(), prepass: { kind: 'badreply' } } }],
  ];
  for (const [label, fixture] of cases) {
    const result = validateWorkerContractFixture(fixture);
    assert.equal(result.ok, false, label);
    assert.ok(result.failures.length > 0, label);
  }
});
