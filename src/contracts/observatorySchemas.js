// Runtime semantic validators for OBS-001. JSON Schema remains the artifact shape authority; these
// checks recompute cross-run claims that JSON Schema alone cannot establish.

import { stableObservatoryStringify } from '../observability/sessionSamplers.js';

export const OBSERVATORY_SESSION_SCHEMA_VERSION = 2;
export const OBSERVATORY_RECORD_KINDS = Object.freeze([
  'applied_input',
  'state_sample',
  'asset_exposure',
  'asset_lifecycle',
  'frame_perf',
  'hash_checkpoint',
  'event_receipt',
  'observer_fault',
]);

const RECORD_KIND_SET = new Set(OBSERVATORY_RECORD_KINDS);
const HASH_RE = /^[a-f0-9]{64}$/;
const SESSION_KEYS = new Set([
  'schemaVersion', 'lifecycle', 'sessionId', 'candidateHash', 'selectionCommitHash', 'routeId',
  'policyId', 'seed', 'runtime', 'scheduledRunIndex', 'retained', 'validForAcceptance', 'inputTape',
  'captureRun', 'observerControlReplay', 'performanceReplay', 'simHashComparison',
  'recordingHealth', 'artifacts',
]);
const RUN_KEYS = new Set([
  'observerEnabled', 'mediaStatus', 'sessionArtifact', 'performanceReport', 'inputHz', 'stateHz',
  'assetExposureHz', 'p95Ms', 'videoPath', 'videoSha256', 'mixedAudioPath', 'mixedAudioSha256',
  'sourceFps', 'captureOverheadPercent',
]);

export function validateObserverRecords(records, options = {}) {
  const issues = [];
  if (!Array.isArray(records)) return result(['records must be an array']);
  let expectedSeq = Number.isInteger(options.startingSeq)
    ? options.startingSeq
    : (records.length && Number.isInteger(records[0].seq) ? records[0].seq : 1);
  let previousTick = -1;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const path = `records[${index}]`;
    if (!plainObject(record)) { issues.push(`${path} must be an object`); continue; }
    if (record.schemaVersion !== 1) issues.push(`${path}.schemaVersion must equal 1`);
    if (!nonEmpty(record.sessionId)) issues.push(`${path}.sessionId is required`);
    if (record.seq !== expectedSeq) issues.push(`${path}.seq must be ${expectedSeq}, got ${record.seq}`);
    expectedSeq += 1;
    if (!RECORD_KIND_SET.has(record.kind)) issues.push(`${path}.kind is unknown: ${record.kind}`);
    if (!Number.isInteger(record.tick) || record.tick < 0) issues.push(`${path}.tick must be non-negative integer`);
    if (Number.isInteger(record.tick) && record.tick < previousTick) issues.push(`${path}.tick regressed`);
    if (Number.isInteger(record.tick)) previousTick = record.tick;
    if (!Number.isFinite(record.simTime) || record.simTime < 0) issues.push(`${path}.simTime must be non-negative`);
    if (record.kind === 'applied_input' && !plainObject(record.input)) issues.push(`${path}.input is required`);
    if (record.kind === 'event_receipt' && !nonEmpty(record.type)) issues.push(`${path}.type is required`);
    if (record.kind === 'hash_checkpoint' && !HASH_RE.test(String(record.hash || ''))) {
      issues.push(`${path}.hash must be 64 lowercase hex characters`);
    }
    if (record.kind === 'frame_perf' && (!Number.isFinite(record.frameDt) || record.frameDt < 0)) {
      issues.push(`${path}.frameDt must be non-negative`);
    }
  }
  return result(issues);
}

export function validateRecordingHealth(health, options = {}) {
  const issues = [];
  if (!plainObject(health)) return result(['recording health must be an object']);
  for (const key of [
    'appliedInputCount', 'stateSampleCount', 'assetSampleCount', 'droppedRecordCount',
    'observerFaultCount', 'rateShortfallCount',
  ]) {
    if (!Number.isInteger(health[key]) || health[key] < 0) issues.push(`${key} must be a non-negative integer`);
  }
  if (Number.isInteger(options.expectedTicks)) {
    const expectedTicks = Math.max(0, options.expectedTicks);
    const expected = {
      appliedInputCount: expectedTicks,
      stateSampleCount: Math.floor(expectedTicks / 3),
      assetSampleCount: Math.floor(expectedTicks / 6),
    };
    for (const [key, value] of Object.entries(expected)) {
      if (health[key] !== value) issues.push(`${key} rate mismatch: expected ${value}, got ${health[key]}`);
    }
  }
  if (health.droppedRecordCount !== 0) issues.push('dropped records invalidate recording');
  if (health.observerFaultCount !== 0) issues.push('observer faults invalidate recording');
  if (health.rateShortfallCount !== 0) issues.push('rate shortfall invalidates recording');
  if (health.overflowed === true) issues.push('buffer overflow invalidates recording');
  if (health.validForRecording !== true) issues.push('validForRecording must be true');
  return result(issues);
}

export function validateObservatorySession(session) {
  const issues = [];
  if (!plainObject(session)) return result(['session must be an object']);
  rejectUnknownKeys(session, SESSION_KEYS, 'session', issues);
  if (session.schemaVersion !== OBSERVATORY_SESSION_SCHEMA_VERSION) issues.push('schemaVersion must equal 2');
  if (!['observer_contract', 'media_complete'].includes(session.lifecycle)) issues.push('invalid lifecycle');
  for (const key of ['sessionId', 'routeId', 'policyId']) if (!nonEmpty(session[key])) issues.push(`${key} is required`);
  for (const key of ['candidateHash', 'selectionCommitHash']) if (!HASH_RE.test(String(session[key] || ''))) issues.push(`${key} must be sha256`);
  if (!Number.isInteger(session.seed)) issues.push('seed must be integer');
  if (!['browser', 'electron'].includes(session.runtime)) issues.push('runtime must be browser or electron');
  if (!Number.isInteger(session.scheduledRunIndex) || session.scheduledRunIndex < 0) issues.push('scheduledRunIndex must be non-negative integer');
  if (session.retained !== true) issues.push('retained must be true');
  validateArtifact(session.inputTape, 'inputTape', issues);
  validateRun(session.captureRun, 'captureRun', { observerEnabled: true, mediaStatus: session.lifecycle === 'observer_contract' ? 'pending' : 'complete' }, issues);
  validateRun(session.observerControlReplay, 'observerControlReplay', { observerEnabled: true, mediaStatus: 'off' }, issues);
  validateRun(session.performanceReplay, 'performanceReplay', { observerEnabled: false, mediaStatus: 'off' }, issues);
  validateComparison(session.simHashComparison, issues);
  validateSessionHealth(session.recordingHealth, issues);
  if (!Array.isArray(session.artifacts) || session.artifacts.length < 1) issues.push('artifacts must contain at least one item');
  else session.artifacts.forEach((artifact, index) => validateArtifact(artifact, `artifacts[${index}]`, issues));

  if (session.lifecycle === 'observer_contract') {
    if (session.validForAcceptance !== false) issues.push('observer_contract is never validForAcceptance');
    rejectMediaClaims(session.captureRun, 'captureRun', issues);
  }
  if (session.lifecycle === 'media_complete') {
    if (session.validForAcceptance === true) {
      requireDecodedMedia(session.captureRun, issues);
      if (session.simHashComparison && session.simHashComparison.match !== true) issues.push('acceptance requires matching hashes');
      if (session.simHashComparison && session.simHashComparison.periodicMismatchCount !== 0) issues.push('acceptance requires zero periodic mismatches');
      if (session.simHashComparison && session.simHashComparison.orderedEventReceiptsMatch !== true) issues.push('acceptance requires matching receipts');
    }
  }
  return result(issues);
}

export function validateThreeRunSemantics(session, evidence) {
  const issues = [...validateObservatorySession(session).issues];
  if (!plainObject(evidence)) return result([...issues, 'three-run evidence is required']);
  const names = ['captureRun', 'observerControlReplay', 'performanceReplay'];
  const expectedIdentity = {
    candidateHash: session && session.candidateHash,
    selectionCommitHash: session && session.selectionCommitHash,
    routeId: session && session.routeId,
    policyId: session && session.policyId,
    seed: session && session.seed,
    inputTapeSha256: session && session.inputTape && session.inputTape.sha256,
  };
  for (const name of names) {
    const run = evidence[name];
    if (!plainObject(run)) { issues.push(`${name} evidence is required`); continue; }
    for (const [key, value] of Object.entries(expectedIdentity)) {
      if (!run.identity || run.identity[key] !== value) issues.push(`${name} identity mismatch for ${key}`);
    }
    if (!HASH_RE.test(String(run.finalHash || ''))) issues.push(`${name} final hash is invalid`);
    if (!Array.isArray(run.periodicHashes)) issues.push(`${name} periodic hashes are required`);
    if (!Array.isArray(run.deterministicReceipts)) issues.push(`${name} deterministic receipts are required`);
    const observerEnabled = session && session[name] && session[name].observerEnabled === true;
    if (observerEnabled && !plainObject(run.health)) {
      issues.push(`${name} recording health is required`);
    } else if (observerEnabled) {
      const expectedTicks = session && session.recordingHealth && session.recordingHealth.appliedInputCount;
      const healthValidation = validateRecordingHealth(run.health, {
        ...(Number.isInteger(expectedTicks) ? { expectedTicks } : {}),
      });
      if (!healthValidation.ok) {
        issues.push(...healthValidation.issues.map((issue) => `${name}: ${issue}`));
      }
    } else if (plainObject(run.health)) {
      for (const key of ['appliedInputCount', 'stateSampleCount', 'assetSampleCount']) {
        if (run.health[key] !== 0) issues.push(`${name} observer-off health ${key} must equal zero`);
      }
      if ((run.health.droppedRecordCount || 0) !== 0 || (run.health.observerFaultCount || 0) !== 0) {
        issues.push(`${name} observer-off health cannot report drops or faults`);
      }
    }
  }
  if (names.some((name) => !plainObject(evidence[name]))) return result(issues);

  const finalHashes = names.map((name) => evidence[name].finalHash);
  const actualFinalMatch = finalHashes.every((hash) => hash === finalHashes[0]);
  if (!actualFinalMatch) issues.push('three-run final hash mismatch');
  const periodicMismatchCount = mismatchCount(names.map((name) => evidence[name].periodicHashes));
  if (periodicMismatchCount > 0) issues.push(`three-run periodic hash mismatch count ${periodicMismatchCount}`);
  const receiptStrings = names.map((name) => stableObservatoryStringify(evidence[name].deterministicReceipts));
  const receiptsMatch = receiptStrings.every((value) => value === receiptStrings[0]);
  if (!receiptsMatch) issues.push('three-run ordered deterministic receipt mismatch');

  const declared = session && session.simHashComparison || {};
  const declaredHashes = [declared.captureFinalHash, declared.observerControlFinalHash, declared.performanceFinalHash];
  for (let index = 0; index < names.length; index += 1) {
    if (declaredHashes[index] !== finalHashes[index]) issues.push(`${names[index]} declared final hash mismatch`);
  }
  if (declared.periodicMismatchCount !== periodicMismatchCount) issues.push('declared periodicMismatchCount is not recomputed truth');
  if (declared.orderedEventReceiptsMatch !== receiptsMatch) issues.push('declared orderedEventReceiptsMatch is not recomputed truth');
  if (declared.match !== (actualFinalMatch && periodicMismatchCount === 0 && receiptsMatch)) {
    issues.push('declared match is not recomputed truth');
  }
  return result(issues, { actualFinalMatch, periodicMismatchCount, receiptsMatch });
}

export function validateFindingWindow(window, parent) {
  const issues = [];
  if (!plainObject(window)) return result(['finding window must be an object']);
  if (!plainObject(parent)) return result(['parent session window must be an object']);
  for (const key of ['startSimTime', 'endSimTime']) {
    if (!Number.isFinite(window[key]) || window[key] < 0) issues.push(`${key} must be non-negative`);
  }
  if (Number.isFinite(window.startSimTime) && Number.isFinite(window.endSimTime)
    && window.endSimTime < window.startSimTime) issues.push('finding endSimTime precedes startSimTime');
  if (Number.isFinite(parent.startSimTime) && window.startSimTime < parent.startSimTime) issues.push('finding starts before parent session');
  if (Number.isFinite(parent.endSimTime) && window.endSimTime > parent.endSimTime) issues.push('finding ends after parent session');
  if (window.startTick != null || window.endTick != null) {
    if (!Number.isInteger(window.startTick) || !Number.isInteger(window.endTick)) issues.push('finding ticks must be integers');
    else if (window.endTick < window.startTick) issues.push('finding endTick precedes startTick');
    if (Number.isInteger(parent.startTick) && window.startTick < parent.startTick) issues.push('finding tick starts before parent');
    if (Number.isInteger(parent.endTick) && window.endTick > parent.endTick) issues.push('finding tick ends after parent');
  }
  return result(issues);
}

function validateRun(run, path, expected, issues) {
  if (!plainObject(run)) { issues.push(`${path} must be an object`); return; }
  rejectUnknownKeys(run, RUN_KEYS, path, issues);
  if (run.observerEnabled !== expected.observerEnabled) issues.push(`${path}.observerEnabled mismatch`);
  if (run.mediaStatus !== expected.mediaStatus) issues.push(`${path}.mediaStatus mismatch`);
  validateArtifact(run.sessionArtifact, `${path}.sessionArtifact`, issues);
  validateArtifact(run.performanceReport, `${path}.performanceReport`, issues);
  for (const key of ['inputHz', 'stateHz', 'assetExposureHz', 'p95Ms']) {
    if (!Number.isFinite(run[key]) || run[key] < 0) issues.push(`${path}.${key} must be non-negative`);
  }
  if (expected.observerEnabled) {
    if (run.inputHz !== 60) issues.push(`${path}.inputHz must equal 60`);
    if (run.stateHz < 20) issues.push(`${path}.stateHz must be at least 20`);
    if (run.assetExposureHz < 10) issues.push(`${path}.assetExposureHz must be at least 10`);
  } else if (run.inputHz !== 0 || run.stateHz !== 0 || run.assetExposureHz !== 0) {
    issues.push(`${path} observer-off rates must all equal zero`);
  }
}

function validateComparison(value, issues) {
  if (!plainObject(value)) { issues.push('simHashComparison must be an object'); return; }
  for (const key of ['captureFinalHash', 'observerControlFinalHash', 'performanceFinalHash']) {
    if (!HASH_RE.test(String(value[key] || ''))) issues.push(`simHashComparison.${key} must be sha256`);
  }
  if (!Number.isInteger(value.periodicMismatchCount) || value.periodicMismatchCount < 0) issues.push('periodicMismatchCount must be non-negative integer');
  if (typeof value.orderedEventReceiptsMatch !== 'boolean') issues.push('orderedEventReceiptsMatch must be boolean');
  if (typeof value.match !== 'boolean') issues.push('match must be boolean');
}

function validateSessionHealth(value, issues) {
  if (!plainObject(value)) { issues.push('recordingHealth must be an object'); return; }
  for (const key of ['appliedInputCount', 'stateSampleCount', 'assetSampleCount', 'droppedRecordCount', 'observerFaultCount']) {
    if (!Number.isInteger(value[key]) || value[key] < 0) issues.push(`recordingHealth.${key} must be non-negative integer`);
  }
  if (value.droppedRecordCount !== 0) issues.push('session recordingHealth reports dropped records');
  if (value.observerFaultCount !== 0) issues.push('session recordingHealth reports observer faults');
}

function validateArtifact(value, path, issues) {
  if (!plainObject(value)) { issues.push(`${path} must be a hashed artifact`); return; }
  const allowed = new Set(['path', 'sha256', 'bytes', 'decodeValidated']);
  rejectUnknownKeys(value, allowed, path, issues);
  if (!nonEmpty(value.path)) issues.push(`${path}.path is required`);
  if (!HASH_RE.test(String(value.sha256 || ''))) issues.push(`${path}.sha256 must be sha256`);
  if (!Number.isInteger(value.bytes) || value.bytes < 1) issues.push(`${path}.bytes must be positive integer`);
}

function rejectMediaClaims(run, path, issues) {
  if (!plainObject(run)) return;
  for (const key of ['videoPath', 'videoSha256', 'mixedAudioPath', 'mixedAudioSha256', 'sourceFps', 'captureOverheadPercent']) {
    if (Object.prototype.hasOwnProperty.call(run, key)) issues.push(`${path}.${key} forbidden while media is pending`);
  }
}

function requireDecodedMedia(run, issues) {
  if (!plainObject(run)) return;
  for (const key of ['videoPath', 'mixedAudioPath']) if (!nonEmpty(run[key])) issues.push(`captureRun.${key} required`);
  for (const key of ['videoSha256', 'mixedAudioSha256']) if (!HASH_RE.test(String(run[key] || ''))) issues.push(`captureRun.${key} must be sha256`);
  if (!Number.isFinite(run.sourceFps) || run.sourceFps < 30) issues.push('captureRun.sourceFps must be at least 30');
  if (!Number.isFinite(run.captureOverheadPercent) || run.captureOverheadPercent < 0 || run.captureOverheadPercent > 5) issues.push('capture overhead must be within 0..5 percent');
}

function mismatchCount(series) {
  if (!series.length) return 0;
  const max = Math.max(...series.map((values) => Array.isArray(values) ? values.length : 0));
  let count = 0;
  for (let index = 0; index < max; index += 1) {
    const encoded = series.map((values) => stableObservatoryStringify(Array.isArray(values) ? values[index] : null));
    if (!encoded.every((value) => value === encoded[0])) count += 1;
  }
  return count;
}

function rejectUnknownKeys(value, allowed, path, issues) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`${path}.${key} is not allowed`);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function result(issues, computed = {}) {
  return { ok: issues.length === 0, issues, ...computed };
}
