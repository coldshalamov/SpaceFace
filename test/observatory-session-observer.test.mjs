import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  canonicalStateHash,
  cloneObservatoryValue,
  sampleAppliedInput,
  stableObservatoryStringify,
} from '../src/observability/sessionSamplers.js';
import { createSessionObserver } from '../src/observability/sessionObserver.js';
import {
  validateFindingWindow,
  validateObserverRecords,
  validateObservatorySession,
  validateRecordingHealth,
  validateThreeRunSemantics,
} from '../src/contracts/observatorySchemas.js';

function stateAt(tick = 0) {
  const state = createGameState(47001);
  state.mode = 'flight';
  state.tick = tick;
  state.simTime = tick / 60;
  state.world.currentSectorId = 'sector_helios_prime';
  state.input.actions = {
    brake: false,
    cruise: true,
    tetherFire: false,
    tetherCut: false,
    reelDelta: -0.25,
    chargeThrow: false,
    chargeDetonate: true,
    scanPulse: false,
    autopursuit: true,
    deployBeacon: false,
    futureActionField: 'retained',
  };
  return state;
}

function hashes(char) { return char.repeat(64); }
function artifact(path, char) { return { path, sha256: hashes(char), bytes: 10 }; }

function sessionFixture() {
  const health = {
    appliedInputCount: 600,
    stateSampleCount: 200,
    assetSampleCount: 100,
    droppedRecordCount: 0,
    observerFaultCount: 0,
    rateShortfallCount: 0,
    overflowed: false,
    stopped: true,
    validForRecording: true,
  };
  const run = (observerEnabled, mediaStatus) => ({
    observerEnabled,
    mediaStatus,
    sessionArtifact: artifact(`${mediaStatus}-session.ndjson`, 'a'),
    performanceReport: artifact(`${mediaStatus}-perf.json`, 'b'),
    inputHz: observerEnabled ? 60 : 0,
    stateHz: observerEnabled ? 20 : 0,
    assetExposureHz: observerEnabled ? 10 : 0,
    p95Ms: 12,
  });
  return {
    schemaVersion: 2,
    lifecycle: 'observer_contract',
    sessionId: 'obs-fixture',
    candidateHash: hashes('c'),
    selectionCommitHash: hashes('d'),
    routeId: 'helios-novice-miner',
    policyId: 'novice-miner',
    seed: 47001,
    runtime: 'browser',
    scheduledRunIndex: 0,
    retained: true,
    validForAcceptance: false,
    inputTape: artifact('input-tape.json', 'e'),
    captureRun: run(true, 'pending'),
    observerControlReplay: run(true, 'off'),
    performanceReplay: run(false, 'off'),
    simHashComparison: {
      captureFinalHash: hashes('f'),
      observerControlFinalHash: hashes('f'),
      performanceFinalHash: hashes('f'),
      periodicMismatchCount: 0,
      orderedEventReceiptsMatch: true,
      match: true,
    },
    recordingHealth: {
      appliedInputCount: 600,
      stateSampleCount: 200,
      assetSampleCount: 100,
      droppedRecordCount: 0,
      observerFaultCount: 0,
    },
    artifacts: [artifact('timeline.ndjson', '1')],
    _health: health,
  };
}

function runEvidence() {
  const health = {
    appliedInputCount: 600, stateSampleCount: 200, assetSampleCount: 100,
    droppedRecordCount: 0, observerFaultCount: 0, rateShortfallCount: 0,
    overflowed: false, stopped: true, validForRecording: true,
  };
  const base = {
    identity: {
      candidateHash: hashes('c'), selectionCommitHash: hashes('d'), routeId: 'helios-novice-miner',
      policyId: 'novice-miner', seed: 47001, inputTapeSha256: hashes('e'),
    },
    periodicHashes: [{ tick: 300, hash: hashes('2') }, { tick: 600, hash: hashes('f') }],
    finalHash: hashes('f'),
    deterministicReceipts: [{ seq: 1, tick: 4, type: 'combat:fire', payload: { weaponId: 'w1' } }],
    health,
  };
  const evidence = {
    captureRun: structuredClone(base),
    observerControlReplay: structuredClone(base),
    performanceReplay: structuredClone(base),
  };
  evidence.performanceReplay.health = {
    appliedInputCount: 0, stateSampleCount: 0, assetSampleCount: 0,
    droppedRecordCount: 0, observerFaultCount: 0, rateShortfallCount: 0,
    overflowed: false, stopped: true, validForRecording: false,
  };
  return evidence;
}

test('pure samplers clone every present input/action field without mutation or aliasing', () => {
  const state = stateAt(7);
  const before = stableObservatoryStringify(state.input);
  const sample = sampleAppliedInput(state);
  assert.equal(sample.tick, 7);
  assert.equal(sample.input.actions.futureActionField, 'retained');
  assert.deepEqual(Object.keys(sample.input.actions), Object.keys(state.input.actions).sort());
  sample.input.actions.futureActionField = 'mutated-copy';
  sample.input.aimWorld.x = 999;
  assert.equal(state.input.actions.futureActionField, 'retained');
  assert.notEqual(state.input.aimWorld.x, 999);
  assert.equal(stableObservatoryStringify(state.input), before);
  assert.equal(canonicalStateHash(state), canonicalStateHash(state));
  assert.deepEqual(cloneObservatoryValue(new Map([['b', 2], ['a', 1]])), { a: 1, b: 2 });
});

test('observer emits exact cadences, monotonic sequence ids, drains, and isolated clones', () => {
  const state = stateAt();
  const observer = createSessionObserver({
    enabled: true,
    capacity: 100,
    getAIIntent: () => ({ decisions: [{ entityId: 9, action: 'hold' }] }),
    getAssetExposure: () => ({ assets: [{ id: 'ship_hitch', lod: 0, authored: true }] }),
  });
  for (let tick = 1; tick <= 6; tick += 1) {
    state.tick = tick;
    state.simTime = tick / 60;
    observer.afterInput(state);
    observer.afterSimStep(state);
    observer.onRenderFrame(state, 1 / 60, 0.5);
  }
  observer.recordEvent('combat:fire', { nested: { weaponId: 'starter' } }, state);
  const first = observer.drain();
  const kinds = first.records.reduce((counts, record) => {
    counts[record.kind] = (counts[record.kind] || 0) + 1;
    return counts;
  }, {});
  assert.equal(kinds.applied_input, 6);
  assert.equal(kinds.state_sample, 2);
  assert.equal(kinds.asset_exposure, 1);
  assert.equal(kinds.frame_perf, 6);
  assert.equal(kinds.event_receipt, 1);
  assert.deepEqual(first.records.map((record) => record.seq), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.equal(validateObserverRecords(first.records).ok, true);

  first.records.at(-1).payload.nested.weaponId = 'mutated-drain';
  const second = observer.drain();
  assert.equal(second.records.length, 0);
  assert.equal(second.health.drainedRecordCount, 16);
  assert.equal(second.health.bufferedRecordCount, 0);
  assert.equal(state.input.actions.futureActionField, 'retained');

  state.tick = 7;
  state.simTime = 7 / 60;
  observer.afterInput(state);
  const third = observer.drain();
  assert.equal(third.records[0].seq, 17, 'sequence continues across drains');
  assert.equal(third.records[0].input.actions.futureActionField, 'retained');
});

test('observer envelope fields remain authoritative over hostile sampler output', () => {
  const state = stateAt(9);
  const observer = createSessionObserver({
    enabled: true,
    sessionId: 'authoritative-session',
    samplers: {
      sampleAppliedInput() {
        return {
          schemaVersion: 999,
          sessionId: 'sampler-forgery',
          seq: -40,
          kind: 'forged_kind',
          seed: 1,
          tick: 2,
          simTime: 3,
          input: { retained: true },
        };
      },
    },
  });

  assert.equal(observer.afterInput(state), true);
  const [record] = observer.drain().records;
  assert.deepEqual({
    schemaVersion: record.schemaVersion,
    sessionId: record.sessionId,
    seq: record.seq,
    kind: record.kind,
    seed: record.seed,
    tick: record.tick,
    simTime: record.simTime,
  }, {
    schemaVersion: 1,
    sessionId: 'authoritative-session',
    seq: 1,
    kind: 'applied_input',
    seed: 47001,
    tick: 9,
    simTime: 0.15,
  });
  assert.deepEqual(record.input, { retained: true });
});

test('overflow, sampler faults, and stopped hooks are loss-detecting and gameplay-safe', () => {
  const state = stateAt();
  const overflow = createSessionObserver({ enabled: true, capacity: 2 });
  for (let tick = 1; tick <= 5; tick += 1) {
    state.tick = tick;
    overflow.afterInput(state);
  }
  const overflowStop = overflow.stop({ state, expectedTicks: 5 });
  assert.equal(overflowStop.health.overflowed, true);
  assert.equal(overflowStop.health.droppedRecordCount, 3);
  assert.equal(overflowStop.health.validForRecording, false);

  const fault = createSessionObserver({
    enabled: true,
    samplers: { sampleAppliedInput() { throw new Error('synthetic observer fault'); } },
  });
  assert.doesNotThrow(() => fault.afterInput(state));
  const faultStop = fault.stop({ state, expectedTicks: 1 });
  assert.equal(faultStop.health.observerFaultCount, 1);
  assert.equal(faultStop.health.validForRecording, false);
  const countAtStop = faultStop.health.totalRecordCount;
  fault.afterInput(state);
  fault.afterSimStep(state);
  assert.equal(fault.health().totalRecordCount, countAtStop, 'stopped observer is inert');
});

test('semantic validators recompute three-run equality and reject hostile claims', () => {
  const session = sessionFixture();
  const health = session._health;
  delete session._health;
  const evidence = runEvidence();
  assert.equal(validateObservatorySession(session).ok, true);
  assert.equal(validateRecordingHealth(health, { expectedTicks: 600 }).ok, true);
  assert.equal(validateThreeRunSemantics(session, evidence).ok, true);

  const forgedMatch = structuredClone(evidence);
  forgedMatch.performanceReplay.finalHash = hashes('9');
  const mismatch = validateThreeRunSemantics(session, forgedMatch);
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.issues.some((issue) => issue.includes('final hash')));

  const missingHealth = structuredClone(evidence);
  delete missingHealth.captureRun.health;
  assert.equal(validateThreeRunSemantics(session, missingHealth).ok, false,
    'observer run cannot omit recording health');

  const rateShortfall = structuredClone(evidence);
  rateShortfall.observerControlReplay.health.stateSampleCount = 199;
  rateShortfall.observerControlReplay.health.rateShortfallCount = 1;
  rateShortfall.observerControlReplay.health.validForRecording = false;
  assert.equal(validateThreeRunSemantics(session, rateShortfall).ok, false,
    'rate-short observer run cannot pass three-run semantics');

  const fakeMedia = structuredClone(session);
  fakeMedia.captureRun.videoPath = 'fake.webm';
  fakeMedia.captureRun.videoSha256 = hashes('8');
  assert.equal(validateObservatorySession(fakeMedia).ok, false,
    'observer_contract cannot smuggle fake media claims');

  const offRates = structuredClone(session);
  offRates.performanceReplay.inputHz = 60;
  assert.equal(validateObservatorySession(offRates).ok, false,
    'observer-off run cannot fabricate observer samples');

  assert.equal(validateFindingWindow({
    startTick: 20, endTick: 10, startSimTime: 2, endSimTime: 1,
  }, { startTick: 0, endTick: 600, startSimTime: 0, endSimTime: 10 }).ok, false);
});
