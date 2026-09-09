#!/usr/bin/env node
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { canonicalStateHash, stableObservatoryStringify } from '../src/observability/sessionSamplers.js';
import { createSessionObserver } from '../src/observability/sessionObserver.js';

const TICKS = 600;
const SEED = 47001;

function execute(observerEnabled) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.input.actions = { cruise: false, tetherFire: false, reelDelta: 0, futureActionField: 'passive' };
  const observer = createSessionObserver({
    enabled: observerEnabled,
    capacity: 4096,
    sessionId: observerEnabled ? 'observer-on' : 'observer-off',
    getAIIntent: (s) => ({ tick: s.tick, decisions: [] }),
    getAssetExposure: () => ({ assets: [] }),
  });
  const periodicHashes = [];
  const deterministicReceipts = [];

  for (let tick = 1; tick <= TICKS; tick += 1) {
    state.tick = tick;
    state.simTime = tick / 60;
    state.input.moveX = ((tick * 7) % 5 - 2) / 2;
    state.input.moveZ = ((tick * 11) % 5 - 2) / 2;
    state.input.actions.cruise = tick % 180 === 0;
    state.player.credits += tick % 120 === 0 ? 5 : 0;
    state.player.stats.tradesCount += tick % 200 === 0 ? 1 : 0;
    if (tick % 150 === 0) {
      const receipt = { seq: deterministicReceipts.length + 1, tick, type: 'fixture:milestone', payload: { credits: state.player.credits } };
      deterministicReceipts.push(receipt);
      observer.recordEvent(receipt.type, receipt.payload, state);
    }
    observer.afterInput(state);
    observer.afterSimStep(state);
    observer.onRenderFrame(state, 1 / 60, 0.5);
    if (tick % 60 === 0) periodicHashes.push({ tick, hash: canonicalStateHash(state) });
  }
  const finalHash = canonicalStateHash(state);
  const stopped = observer.stop({ state, ...(observerEnabled ? { expectedTicks: TICKS } : {}) });
  return { state, finalHash, periodicHashes, deterministicReceipts, stopped };
}

const capture = execute(true);
const observerControl = execute(true);
const performance = execute(false);

assert.equal(capture.finalHash, observerControl.finalHash);
assert.equal(capture.finalHash, performance.finalHash, 'observer does not alter final canonical state');
assert.equal(stableObservatoryStringify(capture.periodicHashes), stableObservatoryStringify(performance.periodicHashes),
  'observer on/off periodic hashes match');
assert.equal(stableObservatoryStringify(capture.deterministicReceipts), stableObservatoryStringify(performance.deterministicReceipts),
  'observer on/off ordered deterministic receipts match');
assert.equal(stableObservatoryStringify(capture.state.player), stableObservatoryStringify(performance.state.player),
  'observer leaves authoritative player state byte-equivalent');
assert.equal(capture.stopped.health.validForRecording, true);
assert.equal(observerControl.stopped.health.validForRecording, true);
assert.equal(performance.stopped.health.appliedInputCount, 0);
assert.equal(performance.stopped.health.stateSampleCount, 0);
assert.equal(performance.stopped.health.assetSampleCount, 0);
assert.equal(performance.stopped.records.length, 0, 'observer-off run fabricates no observer records');

const observedReceipts = capture.stopped.records
  .filter((record) => record.kind === 'event_receipt')
  .map((record) => ({ type: record.type, payload: record.payload }));
assert.deepEqual(observedReceipts, capture.deterministicReceipts.map(({ type, payload }) => ({ type, payload })),
  'observer clones the same ordered receipts without becoming their authority');

console.log(`[check-observatory-passive] PASS — three matched 600-tick runs, final ${capture.finalHash.slice(0, 12)}`);
