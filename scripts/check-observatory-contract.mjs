#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  validateFindingWindow,
  validateObserverRecords,
  validateObservatorySession,
  validateRecordingHealth,
  validateThreeRunSemantics,
} from '../src/contracts/observatorySchemas.js';

const hash = (char) => char.repeat(64);
const artifact = (path, char) => ({ path, sha256: hash(char), bytes: 10 });
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
const session = {
  schemaVersion: 2,
  lifecycle: 'observer_contract',
  sessionId: 'obs-contract-fixture',
  candidateHash: hash('c'),
  selectionCommitHash: hash('d'),
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
    captureFinalHash: hash('f'), observerControlFinalHash: hash('f'), performanceFinalHash: hash('f'),
    periodicMismatchCount: 0, orderedEventReceiptsMatch: true, match: true,
  },
  recordingHealth: {
    appliedInputCount: 600, stateSampleCount: 200, assetSampleCount: 100,
    droppedRecordCount: 0, observerFaultCount: 0,
  },
  artifacts: [artifact('timeline.ndjson', '1')],
};
const evidenceBase = {
  identity: {
    candidateHash: hash('c'), selectionCommitHash: hash('d'), routeId: session.routeId,
    policyId: session.policyId, seed: session.seed, inputTapeSha256: session.inputTape.sha256,
  },
  periodicHashes: [{ tick: 300, hash: hash('2') }, { tick: 600, hash: hash('f') }],
  finalHash: hash('f'),
  deterministicReceipts: [{ seq: 1, tick: 4, type: 'combat:fire', payload: { weaponId: 'w1' } }],
  health: {
    appliedInputCount: 600, stateSampleCount: 200, assetSampleCount: 100,
    droppedRecordCount: 0, observerFaultCount: 0, rateShortfallCount: 0,
    overflowed: false, stopped: true, validForRecording: true,
  },
};
const evidence = {
  captureRun: structuredClone(evidenceBase),
  observerControlReplay: structuredClone(evidenceBase),
  performanceReplay: structuredClone(evidenceBase),
};
evidence.performanceReplay.health = {
  appliedInputCount: 0, stateSampleCount: 0, assetSampleCount: 0,
  droppedRecordCount: 0, observerFaultCount: 0, rateShortfallCount: 0,
  overflowed: false, stopped: true, validForRecording: false,
};

assert.equal(validateObservatorySession(session).ok, true, validateObservatorySession(session).issues.join('\n'));
assert.equal(validateThreeRunSemantics(session, evidence).ok, true,
  validateThreeRunSemantics(session, evidence).issues.join('\n'));

function rejected(label, mutate, matcher) {
  const hostileSession = structuredClone(session);
  const hostileEvidence = structuredClone(evidence);
  mutate(hostileSession, hostileEvidence);
  const validation = validateThreeRunSemantics(hostileSession, hostileEvidence);
  assert.equal(validation.ok, false, `${label} must reject`);
  if (matcher) assert.ok(validation.issues.some((issue) => matcher.test(issue)),
    `${label} missing issue ${matcher}: ${validation.issues.join(' | ')}`);
}

rejected('self-asserted final match', (_session, runs) => { runs.performanceReplay.finalHash = hash('9'); }, /final hash/i);
rejected('periodic hash mismatch', (_session, runs) => { runs.observerControlReplay.periodicHashes[0].hash = hash('8'); }, /periodic/i);
rejected('ordered receipt mismatch', (_session, runs) => { runs.captureRun.deterministicReceipts[0].type = 'fake'; }, /receipt/i);
rejected('candidate mismatch', (_session, runs) => { runs.captureRun.identity.candidateHash = hash('7'); }, /identity mismatch/i);
rejected('selection mismatch', (_session, runs) => { runs.captureRun.identity.selectionCommitHash = hash('7'); }, /identity mismatch/i);
rejected('input tape mismatch', (_session, runs) => { runs.captureRun.identity.inputTapeSha256 = hash('7'); }, /identity mismatch/i);
rejected('missing scheduled run', (_session, runs) => { delete runs.captureRun; }, /evidence is required/i);
rejected('missing recording health', (_session, runs) => { delete runs.captureRun.health; }, /health is required/i);
rejected('rate shortfall', (_session, runs) => {
  runs.observerControlReplay.health.stateSampleCount = 199;
  runs.observerControlReplay.health.rateShortfallCount = 1;
  runs.observerControlReplay.health.validForRecording = false;
}, /rate mismatch|shortfall/i);
rejected('observer-off fabricated rate', (candidate) => { candidate.performanceReplay.inputHz = 60; }, /observer-off rates/i);
rejected('pending fake media', (candidate) => {
  candidate.captureRun.videoPath = 'fake.webm';
  candidate.captureRun.videoSha256 = hash('6');
}, /forbidden while media is pending/i);
rejected('observer contract promoted', (candidate) => { candidate.validForAcceptance = true; }, /never validForAcceptance/i);

const health = {
  appliedInputCount: 600, stateSampleCount: 200, assetSampleCount: 100,
  droppedRecordCount: 1, observerFaultCount: 0, rateShortfallCount: 0,
  overflowed: true, validForRecording: false,
};
assert.equal(validateRecordingHealth(health, { expectedTicks: 600 }).ok, false);
assert.equal(validateObserverRecords([
  { schemaVersion: 1, sessionId: 'x', seq: 1, kind: 'applied_input', tick: 1, simTime: 1 / 60, input: {} },
  { schemaVersion: 1, sessionId: 'x', seq: 3, kind: 'applied_input', tick: 2, simTime: 2 / 60, input: {} },
]).ok, false, 'sequence gaps reject');
assert.equal(validateFindingWindow(
  { startTick: 20, endTick: 10, startSimTime: 3, endSimTime: 2 },
  { startTick: 0, endTick: 600, startSimTime: 0, endSimTime: 10 },
).ok, false, 'reversed finding window rejects');

const jsonSchema = JSON.parse(readFileSync(new URL('../design/production/schemas/observatory-session.schema.json', import.meta.url), 'utf8'));
assert.equal(jsonSchema.properties.schemaVersion.const, 2);
for (const key of jsonSchema.required) assert.ok(Object.prototype.hasOwnProperty.call(session, key), `fixture missing schema key ${key}`);
const samplerSource = readFileSync(new URL('../src/observability/sessionSamplers.js', import.meta.url), 'utf8');
const observerSource = readFileSync(new URL('../src/observability/sessionObserver.js', import.meta.url), 'utf8');
assert.doesNotMatch(samplerSource, /Math\.random|Date\.now|performance\.now|\.rng\s*\(/,
  'samplers cannot call RNG or wall clock');
assert.doesNotMatch(observerSource, /\.emit\s*\(/, 'observer cannot emit gameplay events');
assert.doesNotMatch(observerSource, /localStorage|writeFile|appendFile/, 'browser observer cannot persist files');

console.log('[check-observatory-contract] PASS — canonical session plus 12 hostile semantic fixtures');
