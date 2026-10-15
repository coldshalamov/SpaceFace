#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildErrorEvidence,
  buildPostTeardownGlDeleteTrapDiagnostic,
} from '../scripts/lib/releaseSoakProbe.mjs';

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
      source: 'playwright-unmatched-cdp-response', status: 404, url, method: null,
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
      status: 404, body: 'must not be copied', request: { arbitrary: true },
    },
  }] });
  const copied = evidence.all[0].networkProvenance;
  assert.equal(copied.requestId.length, 256);
  assert.equal(copied.url.length, 2048);
  assert.equal(copied.method, null, 'an unknown method must remain unknown');
  assert.equal(copied.status, 404);
  assert.deepEqual(copied.truncatedFields, ['requestId', 'url']);
  assert.equal('body' in copied, false);
  assert.equal('request' in copied, false);
  assert.deepEqual(evidence.httpErrors, ['HTTP 404 optional store']);
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
