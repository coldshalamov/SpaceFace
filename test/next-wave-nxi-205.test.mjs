// NXI-205 — A missing optional sample does not create an unhandled audio failure
// A failed optional sample leaves the sound system and remaining cues usable with a recorded cause.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSampleRuntime,
  SAMPLE_MANIFEST,
} from '../src/audio/sampleLibrary.js';

function fakeCtx() {
  return {
    decodeAudioData: async (buf) => {
      if (buf && buf.byteLength === 0) {
        throw new Error('decodeAudioData: corrupted or empty buffer');
      }
      return {
        duration: 0.5,
        length: 22050,
        numberOfChannels: 1,
        sampleRate: 44100,
      };
    },
  };
}

function drainQueue(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('NXI-205: A missing optional sample records failure cause and does not throw', async () => {
  const ctx = fakeCtx();
  const mockFiles = new Map([
    [SAMPLE_MANIFEST.get('wpn_pulse').file, new ArrayBuffer(16)],
  ]);

  const fakeFetch = async (url) => {
    if (mockFiles.has(url)) {
      return {
        ok: true,
        arrayBuffer: async () => mockFiles.get(url),
      };
    }
    return {
      ok: false,
      status: 404,
    };
  };

  const rt = createSampleRuntime({
    ctx,
    fetchImpl: fakeFetch,
    byteBudget: 1024 * 1024,
  });

  // Acquire a non-existent/failing optional sample ('near_miss')
  assert.equal(rt.acquire('near_miss'), null, 'Initial acquire returns null (not resident)');
  await drainQueue(20);

  // Failure should be cleanly recorded without unhandled rejections
  assert.equal(rt.stats.decodeFailures, 1, 'decodeFailures count incremented');
  assert.equal(rt.stats.lastFailedId, 'near_miss', 'lastFailedId recorded');
  assert.match(rt.stats.lastFailureCause, /sample fetch failed/i, 'lastFailureCause recorded');
  assert.equal(rt.hasFailed('near_miss'), true, 'hasFailed returns true');
  assert.ok(rt.getFailure('near_miss'), 'getFailure returns failure object');

  const fetchesBefore = rt.stats.fetches;

  // Subsequent acquire on failed sample must NOT re-enqueue or re-fetch
  assert.equal(rt.acquire('near_miss'), null, 'Subsequent acquire returns null');
  await drainQueue(10);
  assert.equal(rt.stats.fetches, fetchesBefore, 'No additional fetch attempts scheduled for failed sample');

  // Neighboring valid sample still succeeds
  assert.equal(rt.acquire('wpn_pulse'), null, 'Initial acquire on valid sample');
  await drainQueue(20);
  assert.ok(rt.acquire('wpn_pulse'), 'Valid sample became resident successfully');

  rt.dispose();
});

test('NXI-205: A decode error records cause and leaves runtime operational', async () => {
  const ctx = fakeCtx();
  const mockFiles = new Map([
    [SAMPLE_MANIFEST.get('near_miss').file, new ArrayBuffer(0)], // empty buffer triggers decode error in fakeCtx
  ]);

  const fakeFetch = async (url) => {
    if (mockFiles.has(url)) {
      return {
        ok: true,
        arrayBuffer: async () => mockFiles.get(url),
      };
    }
    return { ok: false };
  };

  const rt = createSampleRuntime({
    ctx,
    fetchImpl: fakeFetch,
    byteBudget: 1024 * 1024,
  });

  rt.acquire('near_miss');
  await drainQueue(20);

  assert.equal(rt.stats.decodeFailures, 1);
  assert.equal(rt.stats.lastFailedId, 'near_miss');
  assert.match(rt.stats.lastFailureCause, /corrupted or empty buffer/i);
  assert.equal(rt.hasFailed('near_miss'), true);

  rt.dispose();
});
