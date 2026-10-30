#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildErrorEvidence,
  buildPostTeardownGlDeleteTrapDiagnostic,
  readPostRecoveryRenderDiagnostics,
} from '../scripts/lib/releaseSoakProbe.mjs';

test('post-recovery diagnostic preserves late resize identity and separate batch failure', () => {
  const previous = globalThis.window;
  const resize = { contextGeneration: 1, expectedByteLength: 80, actualByteLength: 0,
    error: { message: 'size mismatch', stack: 'render-stack' }, matchingSceneSlots: [{ slot: 'attribute:normal' }] };
  const batch = { contextGeneration: 1, object: { uuid: 'batch-id' } };
  try {
    globalThis.window = { SF: { state: { render: { bufferResizeDiagnostic: {
      lastFailure: resize, lastBatchedFailure: batch,
    } } } } };
    assert.deepEqual(readPostRecoveryRenderDiagnostics(), {
      lastFailureAfterRecovery: resize, lastBatchedFailure: batch,
    });
    globalThis.window.SF.state.render = { renderer: { __sfBufferResizeFailure: resize } };
    assert.deepEqual(readPostRecoveryRenderDiagnostics(), {
      lastFailureAfterRecovery: resize, lastBatchedFailure: null,
    });
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('failure-path teardown diagnostic preserves the one-shot caller snapshot', () => {
  const snapshot = {
    armed: true,
    entries: [{ api: 'deleteTexture', count: 12, alive: true, stack: 'dispose-stack' }],
    evicted: 0,
    dropped: 0,
  };
  const diagnostic = buildPostTeardownGlDeleteTrapDiagnostic({
    runtimeKind: 'electron',
    install: { installed: true, already: false },
    snapshot,
  });

  assert.equal(diagnostic.schema, 'spaceface.post-teardown-gl-delete-trap.v1');
  assert.equal(diagnostic.runtimeKind, 'electron');
  assert.equal(diagnostic.available, true);
  assert.deepEqual(diagnostic.snapshot, snapshot);
  assert.equal(diagnostic.snapshot.entries[0].stack, 'dispose-stack');
});

test('error evidence retains exact store request provenance without waiving writes or unknown methods', () => {
  const url = 'http://127.0.0.1:54369/__spaceface_player_store';
  const provenance = {
    source: 'cdp-network', requestId: '39096.24', method: 'PUT', resourceType: 'Fetch',
    startedAt: '2026-10-15T10:08:24.100Z', startedPhase: 'save',
    responseAt: '2026-10-15T10:08:24.141Z', responsePhase: 'save',
  };
  const raw = [
    { source: 'response', level: 'error', text: `HTTP 404 ${url}`, networkProvenance: provenance },
    { source: 'response', level: 'error', text: `HTTP 404 ${url}`, networkProvenance: {
      source: 'playwright-unmatched-cdp-response', status: 404, url,
      method: 'GET', methodSource: 'playwright-response-request',
      requestId: '39096.25', requestIdSource: 'unique-pending-cdp-request-url-method',
      cdpRequestCandidateCount: 1,
      cdpRequestCandidates: [{
        requestId: '39096.25', method: 'GET', resourceType: 'Fetch',
        startedAt: '2026-10-15T10:08:24.100Z', startedPhase: 'electron-bootstrap',
      }],
    } },
    { source: 'console', level: 'error', text: 'WebGL shader compilation failed' },
  ];
  const evidence = buildErrorEvidence('electron', { all: () => raw });
  assert.deepEqual(evidence.all[0].networkProvenance, provenance);
  assert.notEqual(evidence.all[0].networkProvenance, provenance, 'saved evidence owns a bounded copy');
  assert.deepEqual(evidence.all[1].networkProvenance, raw[1].networkProvenance);
  assert.deepEqual(evidence.httpErrors, [`HTTP 404 ${url}`, `HTTP 404 ${url}`]);
  assert.deepEqual(evidence.glErrors, ['WebGL shader compilation failed']);
  assert.deepEqual(evidence.consoleErrors, ['WebGL shader compilation failed']);
});

test('network provenance bounds text and excludes arbitrary request payloads', () => {
  const evidence = buildErrorEvidence('browser', { issues: [{
    source: 'response', type: 'error', text: 'HTTP 404 optional store', networkProvenance: {
      source: 'cdp-network', requestId: 'r'.repeat(300), url: 'u'.repeat(3000), method: null,
      cdpRequestCandidates: Array.from({ length: 10 }, (_, index) => ({
        requestId: `request-${index}`,
        method: 'GET',
        resourceType: 'Fetch',
        startedAt: '2026-10-15T10:08:24.100Z',
        startedPhase: 'save',
        payload: 'must not be copied',
      })),
      status: 404, body: 'must not be copied', request: { arbitrary: true },
    },
  }] });
  const copied = evidence.all[0].networkProvenance;
  assert.equal(copied.requestId.length, 256);
  assert.equal(copied.url.length, 2048);
  assert.equal(copied.method, null, 'an unknown method must remain unknown');
  assert.equal(copied.status, 404);
  assert.deepEqual(copied.truncatedFields, ['requestId', 'url']);
  assert.equal(copied.cdpRequestCandidates.length, 8);
  assert.equal(copied.cdpRequestCandidatesTruncated, true);
  assert.equal(copied.cdpRequestCandidateCount, undefined);
  assert.equal('body' in copied, false);
  assert.equal('request' in copied, false);
  assert.equal('payload' in copied.cdpRequestCandidates[0], false);
  assert.deepEqual(evidence.httpErrors, ['HTTP 404 optional store']);
});

test('error evidence keeps ignored diagnostics and bounded tracker coverage without waiving unknown 404s', () => {
  const unknownUrl = 'http://127.0.0.1:54369/assets/missing.bin?token=private';
  const ignoredUrl = 'http://127.0.0.1:54369/__spaceface_player_store?token=private';
  const coverage = {
    schema: 'spaceface.electronApplicationIssueCoverage.v1',
    contextAvailable: true,
    applicationEvents: ['console', 'response'],
    contextEvents: ['weberror'],
    pageEvents: ['console', 'response', 'request'],
    currentPhase: 'soak',
    networkProvenance: {
      schema: 'spaceface.electronNetworkProvenance.v1', attempted: true, supported: true,
      attached: true, enabled: true, trackedRequests: 12, observedResponses: 10,
      pendingStoreRequests: 2, errors: ['CDP still attached'],
    },
    backfill: { requests: { supported: true, attempted: true, completed: false,
      retiredAfterPageClose: true, retirementReason: 'page-closed', pageCount: 2,
      itemCount: 9, unsupportedPageCount: 1, errors: ['late request unavailable'] } },
  };
  const longErrorText = 'page error '.repeat(300);
  const evidence = buildErrorEvidence('electron', {
    all: () => [{
      source: 'response', level: 'error', text: `HTTP 404 ${unknownUrl}`,
      location: { url: 'http://127.0.0.1:54369/app.js?token=private', lineNumber: 12, columnNumber: 3 },
      networkProvenance: { source: 'cdp-network', requestId: 'req-unknown', method: null,
        resourceType: 'Fetch', url: unknownUrl, status: 404 },
    }, { source: 'pageerror', level: 'error', text: longErrorText }],
    ignored: () => [{
      source: 'response', level: 'diagnostic', text: `HTTP 404 ${ignoredUrl}`,
      absentPlayerStore: true,
      networkProvenance: { source: 'cdp-network', requestId: 'req-ignored', method: 'GET',
        resourceType: 'Fetch', url: ignoredUrl, status: 404 },
    }, {
      source: 'request', level: 'diagnostic', text: 'cancelled navigation',
      requestProvenance: { method: 'REQUEST', url: 'http://127.0.0.1:54369/app.js?secret=x',
        startedAt: '2026-10-15T10:08:24.100Z', startedPhase: 'electron-bootstrap' },
      expectedNavigation: ['cold-reload'],
    }],
    coverage: () => coverage,
  });

  assert.deepEqual(evidence.httpErrors, [`HTTP 404 ${unknownUrl}`], 'unknown 404 remains fatal');
  assert.equal(evidence.all[0].networkProvenance.method, null, 'unknown method remains unknown');
  assert.equal(evidence.all[0].url, '/assets/missing.bin', 'diagnostic URL path excludes query data');
  assert.equal(evidence.all[0].networkProvenance.url, unknownUrl, 'existing provenance URL semantics stay intact');
  assert.equal(evidence.all[1].text, longErrorText, 'existing issue text is not truncated');
  assert.deepEqual(evidence.all[0].location, { path: '/app.js', lineNumber: 12, columnNumber: 3 });
  assert.equal(evidence.ignored[0].absentPlayerStore, true, 'ignored reason stays explicit and separate');
  assert.equal(evidence.ignored[0].networkProvenance.method, 'GET');
  assert.equal(evidence.ignored[0].url, '/__spaceface_player_store');
  assert.equal(evidence.ignored[1].url, '/app.js', 'request URL is included only as a scrubbed path');
  assert.deepEqual(evidence.ignored[1].expectedNavigation, ['cold-reload']);
  assert.deepEqual(evidence.trackerCoverage, coverage, 'reuse the tracker controlled coverage DTO');
  assert.equal(evidence.ignoredTruncated, false);
});

test('failure-path teardown diagnostic records unavailable capture instead of implying clean teardown', () => {
  const diagnostic = buildPostTeardownGlDeleteTrapDiagnostic({
    runtimeKind: 'electron',
    install: { installed: false, reason: 'registry-destroy-unavailable' },
    snapshot: null,
  });

  assert.equal(diagnostic.available, false);
  assert.deepEqual(diagnostic.install, { installed: false, reason: 'registry-destroy-unavailable' });
  assert.equal(diagnostic.snapshot, null);
});
