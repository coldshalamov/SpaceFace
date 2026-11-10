import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const helperUrl = new URL('../scripts/lib/mobileWorkerContract.mjs', import.meta.url);
const helperSource = await readFile(helperUrl, 'utf8');
const verifyStart = helperSource.indexOf('  const verifyWorkerAsset = async');
const verifyEnd = helperSource.indexOf('\n  const roundTrip', verifyStart);
assert.ok(verifyStart >= 0 && verifyEnd > verifyStart, 'candidate helper still contains private verifyWorkerAsset');
const verifySource = helperSource.slice(verifyStart, verifyEnd)
  .replace('const verifyWorkerAsset =', 'globalThis.verifyWorkerAsset =');

function makeHarness(fetchImpl) {
  let timer = null;
  const controllers = [];
  class FakeAbortController {
    constructor() {
      this.signal = { aborted: false };
      controllers.push(this);
    }
    abort() { this.signal.aborted = true; }
  }
  const context = vm.createContext({
    fetch: fetchImpl,
    fetchTimeoutMs: 25,
    isJsMime: mime => typeof mime === 'string' && /(?:^|\/)(?:java|ecma)script(?:\s*;|$)/i.test(mime.trim()),
    AbortController: FakeAbortController,
    setTimeout(callback, delay) {
      timer = { callback, delay, cleared: false };
      return timer;
    },
    clearTimeout(value) { if (value) value.cleared = true; },
  });
  vm.runInContext(verifySource, context, { filename: 'mobileWorkerContract.mjs#verifyWorkerAsset' });
  return { verify: context.verifyWorkerAsset, get timer() { return timer; }, controllers };
}

function response({ status = 200, mime = 'application/javascript; charset=utf-8', arrayBuffer }) {
  return {
    status,
    headers: { get(name) { return name === 'content-type' ? mime : null; } },
    arrayBuffer,
  };
}

test('verifyWorkerAsset drains the body before clearing the fetch abort timer', async () => {
  let bodyRead = false;
  let resolveBody;
  const bodyDone = new Promise(resolve => { resolveBody = resolve; });
  const harness = makeHarness(async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal.aborted, false);
    return response({ arrayBuffer: () => {
      bodyRead = true;
      return bodyDone;
    } });
  });
  const pending = harness.verify('digest', 'https://game.test/workers/digest.js');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodyRead, true, 'header fetch must proceed to a full body read');
  assert.equal(harness.timer.cleared, false, 'abort timer stays armed while body is pending');
  resolveBody(new ArrayBuffer(0));
  const result = await pending;
  assert.equal(result.status, 200);
  assert.equal(result.mime, 'application/javascript; charset=utf-8');
  assert.equal(harness.timer.cleared, true, 'abort timer clears only after body completion');
});

test('verifyWorkerAsset propagates a body failure and still clears its timer', async () => {
  const harness = makeHarness(async () => response({ arrayBuffer: async () => {
    throw new Error('net::ERR_ABORTED');
  } }));
  await assert.rejects(
    harness.verify('prepass', 'https://game.test/workers/prepass.js'),
    error => /net::ERR_ABORTED/.test(error.message),
  );
  assert.equal(harness.timer.cleared, true);
});

test('an abort during body drain remains a timeout failure instead of being ignored', async () => {
  let rejectBody;
  let bodyRead = false;
  const bodyPending = new Promise((_, reject) => { rejectBody = reject; });
  const harness = makeHarness(async () => response({ arrayBuffer: () => {
    bodyRead = true;
    return bodyPending;
  } }));
  const pending = harness.verify('digest', 'https://game.test/workers/digest.js');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodyRead, true);
  assert.equal(harness.timer.cleared, false);
  harness.timer.callback();
  rejectBody(new Error('net::ERR_ABORTED'));
  await assert.rejects(pending, /timed out after .*ms/);
  assert.equal(harness.timer.cleared, true);
  assert.equal(harness.controllers[0].signal.aborted, true);
});

test('request failure rows retain ERR_ABORTED provenance metadata without changing critical counts', async () => {
  const { createMobileResponseLedger, recordMobileRequestFailure } = await import('../scripts/lib/mobileWorkerContract.mjs');
  const ledger = createMobileResponseLedger();
  const result = recordMobileRequestFailure(ledger, {
    url: 'https://game.test/assets/worker.js',
    error: 'net::ERR_ABORTED',
    resourceType: 'script',
    actorStage: 'continue-launch',
    timestamp: '2026-10-16T12:00:00.000Z',
  });
  assert.equal(result.critical, true);
  assert.equal(ledger.requestFailureCount, 1);
  assert.equal(ledger.criticalRequestFailureCount, 1);
  assert.deepEqual(ledger.requestFailures[0], {
    url: 'https://game.test/assets/worker.js',
    error: 'net::ERR_ABORTED',
    resourceType: 'script',
    actorStage: 'continue-launch',
    timestamp: '2026-10-16T12:00:00.000Z',
  });
});

test('probe wires resource type, actor stage, and timestamp on every requestfailed row', async () => {
  const probe = await readFile(new URL('../scripts/probe-deployed-mobile.mjs', import.meta.url), 'utf8');
  assert.match(probe, /recordMobileRequestFailure\(report, \{[\s\S]*?resourceType: request\.resourceType\?\.\(\) \|\| null,[\s\S]*?actorStage,[\s\S]*?timestamp: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(probe, /ERR_ABORTED.*ignored|ignore.*ERR_ABORTED/i);
});
