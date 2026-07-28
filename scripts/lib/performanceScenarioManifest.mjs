import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

import {
  PERFORMANCE_SCENARIO_IDS,
  PERFORMANCE_SCENARIOS,
} from './performanceClosureContracts.mjs';

export const PERFORMANCE_SCENARIO_MANIFEST_SCHEMA = 'spaceface.performanceScenarioManifest.v1';
export const PERFORMANCE_SCENARIO_MANIFEST_VALIDATION_SCHEMA = 'spaceface.performanceScenarioManifestValidation.v1';
export const PERFORMANCE_FRAME_IDENTIFIERS = Object.freeze([
  'display-frame',
  'simulation-tick',
  'render-frame',
  'GPU-query',
  'background-job',
]);
export const PERFORMANCE_SCENARIO_MANIFEST_LIMITS = Object.freeze({
  maxScenarios: 64,
  maxInputEvents: 100_000,
  maxInputFrames: 100_000,
  maxCameraRecords: 20_000,
  maxTelemetryIdentifiers: 64,
  maxIssues: 64,
  maxIssueBytes: 16 * 1024,
  maxIssueMessageBytes: 512,
  maxJsonDepth: 12,
  maxJsonNodes: 4_000_000,
  maxJsonEdges: 8_000_000,
  maxObjectKeys: 256,
  maxArrayItems: 4096,
  maxStringLength: 16_384,
  maxKeyLength: 256,
  maxCanonicalBytes: 16 * 1024 * 1024,
  maxSeed: 0xffffffff,
  maxTick: 10_000_000,
  maxSequence: 1_000_000,
  maxEntityMultiplier: 100,
});

const TOP_LEVEL_KEYS = new Set(['schema', 'version', 'id', 'scenarios']);
const SCENARIO_KEYS = new Set([
  'id',
  'seed',
  'save',
  'inputTape',
  'cameraTape',
  'entityMultiplier',
  'requiredTelemetry',
  'expectedRouteCompletion',
]);
const SAVE_KEYS = new Set(['kind', 'path', 'sha256', 'slot', 'checkpointTick']);
const SAVE_KINDS = new Set(['new-game', 'fixture', 'save-file', 'continuation']);
const INPUT_TAPE_KEYS = new Set(['events', 'frames']);
const INPUT_EVENT_KEYS = new Set(['tick', 'sequence', 'device', 'code', 'pressed', 'keys', 'pointer', 'gamepad', 'touch']);
const INPUT_FRAME_KEYS = new Set(['tick', 'sequence', 'input', 'commands']);
// Mirrors the exact fields consumed by src/testing/lab/inputTape.js and the
// closed frame-input contract in src/contracts/simScenarioSchema.js.
const INPUT_FRAME_VALUE_KEYS = new Set([
  'moveX',
  'moveZ',
  'turnIntent',
  'boost',
  'fire',
  'aimAngle',
  'reelDelta',
  'masslineHeld',
  'lineLength',
  'orbitDirection',
]);
const INPUT_FRAME_NUMBER_KEYS = new Set([
  'moveX',
  'moveZ',
  'turnIntent',
  'aimAngle',
  'reelDelta',
  'lineLength',
  'orbitDirection',
]);
const INPUT_FRAME_BOOLEAN_KEYS = new Set(['boost', 'fire', 'masslineHeld']);
const INPUT_FRAME_REJECTED_KEYS = new Set(['fireGroup', 'brake', 'massline']);
const CAMERA_KEYS = new Set(['tick', 'sequence', 'mode', 'position', 'target', 'quaternion', 'fov']);
const COMPLETION_KEYS = new Set(['marker', 'value']);
const MANIFEST_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const TELEMETRY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const COMPLETION_MARKER_PATTERN = /^[a-z0-9][a-z0-9:._/-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SIMPLE_PATH_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SCENARIO_ID_SET = new Set(PERFORMANCE_SCENARIO_IDS);
const SCENARIO_ORDER = new Map(PERFORMANCE_SCENARIO_IDS.map((id, index) => [id, index]));
const SCENARIO_DEFINITION_BY_ID = createScenarioDefinitionIndex();
const FRAME_IDENTIFIER_SET = new Set(PERFORMANCE_FRAME_IDENTIFIERS);
const WINDOWS_RESERVED_SEGMENT = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const WINDOWS_INVALID_PATH_CHAR = /[<>:"\\|?*]/;
const ASCII_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const INVALID = Symbol('invalid-performance-manifest-value');
const ARRAY_SORT = Function.call.bind(Array.prototype.sort);
const MAP_GET = Function.call.bind(Map.prototype.get);
const REGEXP_TEST = Function.call.bind(RegExp.prototype.test);
const STRING_IS_WELL_FORMED = Function.call.bind(String.prototype.isWellFormed);
const STRING_NORMALIZE = Function.call.bind(String.prototype.normalize);
const STRING_SLICE = Function.call.bind(String.prototype.slice);
const STRING_SPLIT = Function.call.bind(String.prototype.split);
const STRING_STARTS_WITH = Function.call.bind(String.prototype.startsWith);
const STRING_TO_LOWER_CASE = Function.call.bind(String.prototype.toLowerCase);
const STRING_TRIM = Function.call.bind(String.prototype.trim);
const JSON_STRINGIFY = JSON.stringify;

const CONTEXT = Object.freeze({
  ROOT: 'root',
  SCENARIOS: 'scenarios',
  SCENARIO: 'scenario',
  SAVE: 'save',
  INPUT_TAPE: 'input-tape',
  INPUT_EVENTS: 'input-events',
  INPUT_EVENT: 'input-event',
  INPUT_FRAMES: 'input-frames',
  INPUT_FRAME: 'input-frame',
  CAMERA_TAPE: 'camera-tape',
  CAMERA_RECORD: 'camera-record',
  TELEMETRY: 'telemetry',
  COMPLETION: 'completion',
  KEYS: 'keys',
  VECTOR3: 'vector3',
  VECTOR4: 'vector4',
  GENERIC: 'generic',
});

export function validatePerformanceScenarioManifest(document, options = {}) {
  return preparePerformanceScenarioManifest(document, options).validation;
}

export function compilePerformanceScenarioManifest(document, options = {}) {
  const prepared = preparePerformanceScenarioManifest(document, options);
  const validation = prepared.validation;
  if (!validation.ok) {
    const error = new Error(`invalid performance scenario manifest (${validation.issueCount} observed issue(s))`);
    error.code = 'ERR_PERFORMANCE_SCENARIO_MANIFEST';
    error.issues = validation.issues;
    error.issueCount = validation.issueCount;
    error.validation = validation;
    throw error;
  }

  const source = prepared.options.source;
  if (source != null && !isSafeRepositoryRelativePath(source)) {
    const error = new TypeError('performance scenario manifest source must be a string containing a safe repository-relative POSIX path');
    error.code = 'ERR_PERFORMANCE_SCENARIO_SOURCE';
    throw error;
  }

  const scenarios = new Array(prepared.document.scenarios.length);
  for (let index = 0; index < prepared.document.scenarios.length; index += 1) {
    defineArrayValue(scenarios, index, compileScenario(prepared.document.scenarios[index]));
  }
  ARRAY_SORT(scenarios, (left, right) => (
    MAP_GET(SCENARIO_ORDER, left.id) - MAP_GET(SCENARIO_ORDER, right.id)
  ));

  const digestScenarios = new Array(scenarios.length);
  for (let index = 0; index < scenarios.length; index += 1) {
    defineArrayValue(digestScenarios, index, {
      id: scenarios[index].id,
      scenarioDigest: scenarios[index].scenarioDigest,
    });
  }
  const manifestDigest = sha256Canonical({
    schema: PERFORMANCE_SCENARIO_MANIFEST_SCHEMA,
    version: 1,
    id: prepared.document.id,
    scenarios: digestScenarios,
  });

  return deepFreeze({
    schema: PERFORMANCE_SCENARIO_MANIFEST_SCHEMA,
    version: 1,
    id: prepared.document.id,
    source,
    manifestDigest,
    scenarios,
  });
}

function preparePerformanceScenarioManifest(document, options) {
  const optionState = inspectManifestOptions(options);
  const limits = resolveLimits(optionState.limits);
  const issues = createIssueCollector(
    limits.maxIssues,
    limits.maxIssueBytes,
    limits.maxIssueMessageBytes,
  );
  const snapshot = snapshotJsonDocument(document, issues, limits);

  if (snapshot.value !== INVALID && !snapshot.halted) {
    deepFreeze(snapshot.value);
    validateManifestSnapshot(
      snapshot.value,
      optionState.requireCompleteMatrix,
      issues,
      limits,
    );
  }

  return {
    document: snapshot.value,
    options: optionState,
    validation: validationResult(issues, limits),
  };
}

function validateManifestSnapshot(document, requireCompleteMatrix, issues, limits) {
  if (!isPlainObject(document)) {
    issues.add('manifest must be a plain object');
    return;
  }

  rejectUnknownKeys(document, TOP_LEVEL_KEYS, '$', issues);
  if (document.schema !== PERFORMANCE_SCENARIO_MANIFEST_SCHEMA) {
    issues.add(`$.schema must be ${PERFORMANCE_SCENARIO_MANIFEST_SCHEMA}`);
  }
  if (document.version !== 1) issues.add('$.version must be 1');
  if (!boundedIdentifier(document.id, MANIFEST_ID_PATTERN, 128)) {
    issues.add('$.id must use lower-case dotted, kebab, or snake syntax and be at most 128 characters');
  }

  if (!Array.isArray(document.scenarios) || document.scenarios.length === 0) {
    issues.add('$.scenarios must be a non-empty array');
    return;
  }

  const seenScenarioIds = new Set();
  const scenarioCount = Math.min(document.scenarios.length, limits.maxScenarios);
  for (let index = 0; index < scenarioCount; index += 1) {
    validateScenario(document.scenarios[index], `$.scenarios[${index}]`, seenScenarioIds, issues, limits);
  }

  if (requireCompleteMatrix) {
    const missing = PERFORMANCE_SCENARIO_IDS.filter((id) => !seenScenarioIds.has(id));
    if (missing.length) issues.add(`complete matrix is missing scenarios: ${missing.join(', ')}`);
    if (document.scenarios.length !== PERFORMANCE_SCENARIO_IDS.length) {
      issues.add(`complete matrix must contain exactly ${PERFORMANCE_SCENARIO_IDS.length} scenarios`);
    }
  }
}

function validateScenario(scenario, prefix, seenScenarioIds, issues, limits) {
  if (!isPlainObject(scenario)) {
    issues.add(`${prefix} must be a plain object`);
    return;
  }
  rejectUnknownKeys(scenario, SCENARIO_KEYS, prefix, issues);

  if (!boundedIdentifier(scenario.id, MANIFEST_ID_PATTERN, 128)) {
    issues.add(`${prefix}.id must be a bounded scenario identifier`);
  } else {
    if (!SCENARIO_ID_SET.has(scenario.id)) {
      issues.add(`${prefix}.id names an unknown performance scenario: ${previewValue(scenario.id)}`);
    }
    if (seenScenarioIds.has(scenario.id)) {
      issues.add(`${prefix}.id is a duplicate scenario id: ${previewValue(scenario.id)}`);
    }
    seenScenarioIds.add(scenario.id);
  }

  if (!boundedSafeInteger(scenario.seed, 0, limits.maxSeed)) {
    issues.add(`${prefix}.seed must be a bounded safe integer from 0 to ${limits.maxSeed}`);
  }
  if (!Number.isFinite(scenario.entityMultiplier)
      || Object.is(scenario.entityMultiplier, -0)
      || scenario.entityMultiplier <= 0
      || scenario.entityMultiplier > limits.maxEntityMultiplier) {
    issues.add(`${prefix}.entityMultiplier must be a positive finite number at most ${limits.maxEntityMultiplier}`);
  }
  validateSave(scenario.save, `${prefix}.save`, issues, limits);
  validateInputTape(scenario.inputTape, `${prefix}.inputTape`, issues, limits);
  validateCameraTape(scenario.cameraTape, `${prefix}.cameraTape`, issues, limits);
  validateRequiredTelemetry(scenario.requiredTelemetry, `${prefix}.requiredTelemetry`, issues, limits);
  validateCompletion(scenario.expectedRouteCompletion, `${prefix}.expectedRouteCompletion`, issues);
}

function validateSave(save, prefix, issues, limits) {
  if (!isPlainObject(save)) {
    issues.add(`${prefix} must be a plain object`);
    return;
  }
  rejectUnknownKeys(save, SAVE_KEYS, prefix, issues);
  if (!SAVE_KINDS.has(save.kind)) issues.add(`${prefix}.kind must be one of: ${[...SAVE_KINDS].join(', ')}`);
  if (save.slot != null && !boundedString(save.slot, 128)) issues.add(`${prefix}.slot must be a non-empty string or null`);
  if (save.checkpointTick != null && !boundedSafeInteger(save.checkpointTick, 0, limits.maxTick)) {
    issues.add(`${prefix}.checkpointTick must be a bounded safe integer from 0 to ${limits.maxTick}`);
  }
  if (save.path != null && !isSafeRepositoryRelativePath(save.path)) {
    issues.add(`${prefix}.path must be a safe repository-relative POSIX path`);
  }
  if (save.sha256 != null && !(typeof save.sha256 === 'string' && REGEXP_TEST(SHA256_PATTERN, save.sha256))) {
    issues.add(`${prefix}.sha256 must be a full SHA-256 hex digest`);
  }

  const fileBound = save.kind === 'fixture' || save.kind === 'save-file' || save.kind === 'continuation';
  if (fileBound && !isNonEmptyString(save.path)) issues.add(`${prefix}.path is required for ${save.kind}`);
  if (fileBound && !(typeof save.sha256 === 'string' && REGEXP_TEST(SHA256_PATTERN, save.sha256))) {
    issues.add(`${prefix}.sha256 is required for ${save.kind}`);
  }
  if (save.kind === 'continuation' && !boundedSafeInteger(save.checkpointTick, 0, limits.maxTick)) {
    issues.add(`${prefix}.checkpointTick is required for continuation`);
  }
}

function validateInputTape(tape, prefix, issues, limits) {
  if (!isPlainObject(tape)) {
    issues.add(`${prefix} must be a plain object`);
    return;
  }
  rejectUnknownKeys(tape, INPUT_TAPE_KEYS, prefix, issues);
  validateOrderedRecords(tape.events, `${prefix}.events`, limits.maxInputEvents, issues, limits, validateInputEvent);
  validateOrderedRecords(tape.frames, `${prefix}.frames`, limits.maxInputFrames, issues, limits, validateInputFrame);
}

function validateInputEvent(event, prefix, issues, limits) {
  if (!isPlainObject(event)) {
    issues.add(`${prefix} must be a plain object`);
    return;
  }
  rejectUnknownKeys(event, INPUT_EVENT_KEYS, prefix, issues);
  validateTickSequence(event, prefix, issues, limits);

  const hasCode = Object.hasOwn(event, 'code');
  const hasPressed = Object.hasOwn(event, 'pressed');
  const transitionPayload = hasCode || hasPressed;
  const keysPayload = Object.hasOwn(event, 'keys');

  if (!transitionPayload && !keysPayload) {
    issues.add(`${prefix} must contain a consumed keyboard code/pressed transition or keys snapshot`);
  }
  if (transitionPayload && (!hasCode || !hasPressed)) {
    issues.add(`${prefix}.code and ${prefix}.pressed must be provided together`);
  }
  if (hasCode && !boundedString(event.code, 128)) issues.add(`${prefix}.code must be a non-empty string`);
  if (hasPressed && typeof event.pressed !== 'boolean') issues.add(`${prefix}.pressed must be boolean`);
  if (keysPayload) validateKeyState(event.keys, `${prefix}.keys`, issues);

  if (Object.hasOwn(event, 'device') && event.device !== 'keyboard') {
    issues.add(`${prefix}.device must be omitted or keyboard for the current replay owner`);
  }
  for (const unsupported of ['pointer', 'gamepad', 'touch']) {
    if (Object.hasOwn(event, unsupported)) {
      issues.add(`${prefix}.${unsupported} is unsupported by the current performance input replay owner`);
    }
  }
}

function validateInputFrame(frame, prefix, issues, limits) {
  if (!isPlainObject(frame)) {
    issues.add(`${prefix} must be a plain object`);
    return;
  }
  rejectUnknownKeys(frame, INPUT_FRAME_KEYS, prefix, issues);
  validateTickSequence(frame, prefix, issues, limits);
  validateFrameInput(frame.input, `${prefix}.input`, issues);
  if (!Array.isArray(frame.commands)) {
    issues.add(`${prefix}.commands must be an array`);
  } else if (frame.commands.length > 0) {
    issues.add(`${prefix}.commands must be empty; commands are unsupported by the shared cross-runtime replay owner`);
  }
}

function validateFrameInput(input, prefix, issues) {
  if (!isPlainObject(input)) {
    issues.add(`${prefix} must be a plain object containing replay-consumed values`);
    return;
  }
  for (const key of Object.keys(input)) {
    if (INPUT_FRAME_REJECTED_KEYS.has(key)) {
      issues.add(`${propertyPath(prefix, key)} is not applied by the current replay owner`);
    } else if (!INPUT_FRAME_VALUE_KEYS.has(key)) {
      issues.add(`${propertyPath(prefix, key)} is not allowed`);
    }

    const value = input[key];
    if (INPUT_FRAME_NUMBER_KEYS.has(key)
        && (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0))) {
      issues.add(`${propertyPath(prefix, key)} must be a finite number without signed zero`);
    } else if (INPUT_FRAME_BOOLEAN_KEYS.has(key) && typeof value !== 'boolean') {
      issues.add(`${propertyPath(prefix, key)} must be boolean`);
    }
  }
}

function validateCameraTape(tape, prefix, issues, limits) {
  validateOrderedRecords(tape, prefix, limits.maxCameraRecords, issues, limits, (entry, entryPrefix, collector) => {
    if (!isPlainObject(entry)) {
      collector.add(`${entryPrefix} must be a plain object`);
      return;
    }
    rejectUnknownKeys(entry, CAMERA_KEYS, entryPrefix, collector);
    validateTickSequence(entry, entryPrefix, collector, limits);
    if (!boundedString(entry.mode, 64)) collector.add(`${entryPrefix}.mode must be a non-empty string`);
    validateVector(entry.position, 3, `${entryPrefix}.position`, collector);
    validateVector(entry.target, 3, `${entryPrefix}.target`, collector);
    if (entry.quaternion != null) validateVector(entry.quaternion, 4, `${entryPrefix}.quaternion`, collector);
    if (!Number.isFinite(entry.fov) || Object.is(entry.fov, -0) || entry.fov <= 0 || entry.fov >= 180) {
      collector.add(`${entryPrefix}.fov must be a finite number between 0 and 180`);
    }
  });
}

function validateRequiredTelemetry(identifiers, prefix, issues, limits) {
  if (!Array.isArray(identifiers)) {
    issues.add(`${prefix} must be an array`);
    return;
  }
  const seen = new Set();
  const count = Math.min(identifiers.length, limits.maxTelemetryIdentifiers);
  for (let index = 0; index < count; index += 1) {
    const identifier = identifiers[index];
    if (!boundedIdentifier(identifier, TELEMETRY_ID_PATTERN, 128)) {
      issues.add(`${prefix}[${index}] must be a bounded telemetry identifier`);
      continue;
    }
    if (seen.has(identifier)) issues.add(`${prefix} contains duplicate telemetry identifier ${previewValue(identifier)}`);
    seen.add(identifier);
  }
  for (const required of PERFORMANCE_FRAME_IDENTIFIERS) {
    if (!seen.has(required)) issues.add(`${prefix} must include ${required}`);
  }
}

function validateCompletion(completion, prefix, issues) {
  if (!isPlainObject(completion)) {
    issues.add(`${prefix} must be a plain object`);
    return;
  }
  rejectUnknownKeys(completion, COMPLETION_KEYS, prefix, issues);
  if (!boundedIdentifier(completion.marker, COMPLETION_MARKER_PATTERN, 128)) {
    issues.add(`${prefix} completion marker must be a non-empty bounded identifier`);
  }
  if (!Object.hasOwn(completion, 'value') || !isJsonScalar(completion.value)) {
    issues.add(`${prefix} completion value must be a finite JSON scalar`);
  }
}

function validateOrderedRecords(records, prefix, limit, issues, limits, validateRecord) {
  if (!Array.isArray(records)) {
    issues.add(`${prefix} must be an array`);
    return;
  }
  const seen = new Set();
  const count = Math.min(records.length, limit);
  for (let index = 0; index < count; index += 1) {
    const record = records[index];
    validateRecord(record, `${prefix}[${index}]`, issues, limits);
    if (!isPlainObject(record)
        || !boundedSafeInteger(record.tick, 0, limits.maxTick)
        || !boundedSafeInteger(record.sequence, 0, limits.maxSequence)) continue;
    const identity = `${record.tick}/${record.sequence}`;
    if (seen.has(identity)) issues.add(`${prefix} contains duplicate tick/sequence ${identity}`);
    seen.add(identity);
  }
}

function validateTickSequence(record, prefix, issues, limits) {
  if (!boundedSafeInteger(record.tick, 0, limits.maxTick)) {
    issues.add(`${prefix}.tick must be a non-negative integer and bounded safe integer from 0 to ${limits.maxTick}`);
  }
  if (!boundedSafeInteger(record.sequence, 0, limits.maxSequence)) {
    issues.add(`${prefix}.sequence must be a non-negative integer and bounded safe integer from 0 to ${limits.maxSequence}`);
  }
}

function validateKeyState(value, prefix, issues) {
  if (!isPlainObject(value)) {
    issues.add(`${prefix} must be a plain object`);
    return;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    issues.add(`${prefix} must be a non-empty key-state object`);
  } else if (keys.length !== 1) {
    issues.add(`${prefix} must contain exactly one key-state transition; use separate sequenced events for multiple keys`);
  }
  for (const code of keys) {
    if (!boundedString(code, 128) || typeof value[code] !== 'boolean') {
      issues.add(`${propertyPath(prefix, code)} must be boolean key state`);
    }
  }
}

function snapshotJsonDocument(document, issues, limits) {
  const state = {
    issues,
    limits,
    seen: new WeakSet(),
    ancestors: new WeakSet(),
    bytes: 0,
    nodes: 0,
    edges: 0,
    halted: false,
  };
  const value = snapshotJsonValue(document, '$', CONTEXT.ROOT, state, 0);
  return { value, halted: state.halted };
}

function snapshotJsonValue(value, path, context, state, depth) {
  if (state.halted) return INVALID;
  if (!chargeNode(state)) return INVALID;

  if (value === null) {
    chargeText(state, 'null');
    return null;
  }
  if (typeof value === 'boolean') {
    chargeText(state, value ? 'true' : 'false');
    return value;
  }
  if (typeof value === 'number') return snapshotNumber(value, path, state);
  if (typeof value === 'string') return snapshotString(value, path, state);
  if (typeof value !== 'object') {
    state.issues.add(`${path} must contain finite JSON values; ${typeof value} is not allowed`);
    return INVALID;
  }
  if (depth > state.limits.maxJsonDepth) {
    state.issues.add(`${path} exceeds JSON depth limit ${state.limits.maxJsonDepth}`);
    return INVALID;
  }
  if (utilTypes.isProxy(value)) {
    state.issues.add(`${path} must not contain a Proxy`);
    return INVALID;
  }
  if (state.seen.has(value)) {
    state.issues.add(state.ancestors.has(value)
      ? `${path} must contain acyclic JSON values`
      : `${path} contains a repeated reference alias; JSON evidence must be a tree`);
    return INVALID;
  }

  state.seen.add(value);
  state.ancestors.add(value);
  let snapshot;
  if (Array.isArray(value)) snapshot = snapshotArray(value, path, context, state, depth);
  else if (hasOrdinaryObjectPrototype(value)) snapshot = snapshotObject(value, path, context, state, depth);
  else {
    state.issues.add(`${path} must contain a plain object with an ordinary prototype`);
    snapshot = INVALID;
  }
  state.ancestors.delete(value);
  return snapshot;
}

function snapshotNumber(value, path, state) {
  if (!Number.isFinite(value)) {
    state.issues.add(`${path} must contain finite JSON numbers`);
    return INVALID;
  }
  if (Object.is(value, -0)) {
    state.issues.add(`${path} must not contain signed zero`);
    return INVALID;
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    state.issues.add(`${path} integer must be a safe integer before hashing`);
    return INVALID;
  }
  chargeText(state, JSON_STRINGIFY(value));
  return value;
}

function snapshotString(value, path, state) {
  if (value.length > state.limits.maxStringLength) {
    state.issues.add(`${path} string exceeds limit ${state.limits.maxStringLength}`);
    if (value.length > state.limits.maxCanonicalBytes) canonicalBytesExceeded(state);
    return INVALID;
  }
  chargeText(state, JSON_STRINGIFY(value));
  return value;
}

function snapshotArray(value, path, context, state, depth) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    state.issues.add(`${path} must be an ordinary array with Array.prototype`);
    return INVALID;
  }

  const limit = arrayLimit(context, state.limits);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0) {
    state.issues.add(`${path} must have an ordinary safe array length`);
    return INVALID;
  }
  if (length > limit) state.issues.add(`${path} exceeds limit ${limit}`);

  chargeText(state, '[');
  const count = Math.min(length, limit);
  const result = new Array(count);
  for (let index = 0; index < count && !state.halted; index += 1) {
    if (index > 0) chargeText(state, ',');
    if (!chargeEdge(state)) break;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    const itemPath = `${path}[${index}]`;
    if (!descriptor) {
      state.issues.add(`${itemPath} is a sparse array entry and is not valid JSON evidence`);
      defineArrayValue(result, index, INVALID);
      continue;
    }
    if (!Object.hasOwn(descriptor, 'value')) {
      state.issues.add(`${itemPath} must use data properties, not accessors`);
      defineArrayValue(result, index, INVALID);
      continue;
    }
    if (!descriptor.enumerable) {
      state.issues.add(`${itemPath} must be an own enumerable data property`);
      defineArrayValue(result, index, INVALID);
      continue;
    }
    defineArrayValue(result, index, snapshotJsonValue(
      descriptor.value,
      itemPath,
      arrayItemContext(context),
      state,
      depth + 1,
    ));
  }
  if (!state.halted) chargeText(state, ']');
  return result;
}

function snapshotObject(value, path, context, state, depth) {
  // Own-key discovery is necessarily eager in JavaScript. The limit bounds all
  // descriptor reads and recursive descent after that one JSON-projection pass.
  const keys = Object.keys(value);
  if (keys.length > state.limits.maxObjectKeys) {
    state.issues.add(`${path} exceeds own enumerable-key limit ${state.limits.maxObjectKeys}`);
    state.halted = true;
    return INVALID;
  }

  chargeText(state, '{');
  const result = Object.create(null);
  const count = keys.length;
  let written = 0;
  for (let index = 0; index < count && !state.halted; index += 1) {
    const key = keys[index];
    if (key.length > state.limits.maxKeyLength) {
      state.issues.add(`${path} contains a key that exceeds limit ${state.limits.maxKeyLength}: ${previewValue(key)}`);
      if (key.length > state.limits.maxCanonicalBytes) canonicalBytesExceeded(state);
      continue;
    }

    const childPath = propertyPath(path, key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      state.issues.add(`${childPath} must use data properties, not accessors`);
      continue;
    }

    if (written > 0) chargeText(state, ',');
    chargeText(state, JSON_STRINGIFY(key));
    chargeText(state, ':');
    if (!chargeEdge(state)) break;
    Object.defineProperty(result, key, {
      value: snapshotJsonValue(
        descriptor.value,
        childPath,
        objectChildContext(context, key),
        state,
        depth + 1,
      ),
      enumerable: true,
      configurable: true,
      writable: true,
    });
    written += 1;
  }
  if (!state.halted) chargeText(state, '}');
  return result;
}

function objectChildContext(context, key) {
  if (context === CONTEXT.ROOT && key === 'scenarios') return CONTEXT.SCENARIOS;
  if (context === CONTEXT.SCENARIO) {
    if (key === 'save') return CONTEXT.SAVE;
    if (key === 'inputTape') return CONTEXT.INPUT_TAPE;
    if (key === 'cameraTape') return CONTEXT.CAMERA_TAPE;
    if (key === 'requiredTelemetry') return CONTEXT.TELEMETRY;
    if (key === 'expectedRouteCompletion') return CONTEXT.COMPLETION;
  }
  if (context === CONTEXT.INPUT_TAPE) {
    if (key === 'events') return CONTEXT.INPUT_EVENTS;
    if (key === 'frames') return CONTEXT.INPUT_FRAMES;
  }
  if (context === CONTEXT.INPUT_FRAME && key === 'input') return CONTEXT.GENERIC;
  if (context === CONTEXT.CAMERA_RECORD) {
    if (key === 'position' || key === 'target') return CONTEXT.VECTOR3;
    if (key === 'quaternion') return CONTEXT.VECTOR4;
  }
  if (context === CONTEXT.INPUT_EVENT && key === 'keys') return CONTEXT.KEYS;
  return CONTEXT.GENERIC;
}

function arrayItemContext(context) {
  if (context === CONTEXT.SCENARIOS) return CONTEXT.SCENARIO;
  if (context === CONTEXT.INPUT_EVENTS) return CONTEXT.INPUT_EVENT;
  if (context === CONTEXT.INPUT_FRAMES) return CONTEXT.INPUT_FRAME;
  if (context === CONTEXT.CAMERA_TAPE) return CONTEXT.CAMERA_RECORD;
  return CONTEXT.GENERIC;
}

function arrayLimit(context, limits) {
  if (context === CONTEXT.SCENARIOS) return limits.maxScenarios;
  if (context === CONTEXT.INPUT_EVENTS) return limits.maxInputEvents;
  if (context === CONTEXT.INPUT_FRAMES) return limits.maxInputFrames;
  if (context === CONTEXT.CAMERA_TAPE) return limits.maxCameraRecords;
  if (context === CONTEXT.TELEMETRY) return limits.maxTelemetryIdentifiers;
  if (context === CONTEXT.VECTOR3) return 3;
  if (context === CONTEXT.VECTOR4) return 4;
  return limits.maxArrayItems;
}

function chargeNode(state) {
  state.nodes += 1;
  if (state.nodes <= state.limits.maxJsonNodes) return true;
  state.issues.addOnce('json-nodes', `manifest exceeds JSON node limit ${state.limits.maxJsonNodes}`);
  state.halted = true;
  return false;
}

function chargeEdge(state) {
  state.edges += 1;
  if (state.edges <= state.limits.maxJsonEdges) return true;
  state.issues.addOnce('json-edges', `manifest exceeds JSON edge limit ${state.limits.maxJsonEdges}`);
  state.halted = true;
  return false;
}

function chargeText(state, text) {
  if (state.halted) return false;
  state.bytes += Buffer.byteLength(text, 'utf8');
  if (state.bytes <= state.limits.maxCanonicalBytes) return true;
  canonicalBytesExceeded(state);
  return false;
}

function canonicalBytesExceeded(state) {
  state.issues.addOnce(
    'canonical-bytes',
    `manifest canonical bytes exceed limit ${state.limits.maxCanonicalBytes}`,
  );
  state.halted = true;
}

function createScenarioDefinitionIndex() {
  const result = Object.create(null);
  for (let index = 0; index < PERFORMANCE_SCENARIOS.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(PERFORMANCE_SCENARIOS, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('production performance scenarios must contain own data values');
    }
    const definition = descriptor.value;
    const idDescriptor = Object.getOwnPropertyDescriptor(definition, 'id');
    if (!idDescriptor || !Object.hasOwn(idDescriptor, 'value')) {
      throw new TypeError('production performance scenario definitions must contain own id values');
    }
    Object.defineProperty(result, idDescriptor.value, {
      value: definition,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(result);
}

function scenarioDefinition(id) {
  const descriptor = Object.getOwnPropertyDescriptor(SCENARIO_DEFINITION_BY_ID, id);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
}

function compileScenario(scenario) {
  const save = compileSave(scenario.save);
  const inputTape = {
    events: canonicalInputEvents(scenario.inputTape.events),
    frames: canonicalOrderedRecords(scenario.inputTape.frames),
  };
  const cameraTape = canonicalOrderedRecords(scenario.cameraTape);

  const extras = [];
  for (const identifier of scenario.requiredTelemetry) {
    if (!FRAME_IDENTIFIER_SET.has(identifier)) {
      defineArrayValue(extras, extras.length, identifier);
    }
  }
  ARRAY_SORT(extras);
  const requiredTelemetry = new Array(PERFORMANCE_FRAME_IDENTIFIERS.length + extras.length);
  let telemetryIndex = 0;
  for (const identifier of PERFORMANCE_FRAME_IDENTIFIERS) {
    defineArrayValue(requiredTelemetry, telemetryIndex, identifier);
    telemetryIndex += 1;
  }
  for (const identifier of extras) {
    defineArrayValue(requiredTelemetry, telemetryIndex, identifier);
    telemetryIndex += 1;
  }

  const definition = scenarioDefinition(scenario.id);
  if (!definition) throw new Error(`missing production performance scenario definition: ${scenario.id}`);
  const scenarioDefinitionDigest = sha256Canonical(definition);
  const expectedRouteCompletion = canonicalize(scenario.expectedRouteCompletion);
  const saveDigest = sha256Canonical(save);
  const inputDigest = sha256Canonical(inputTape);
  const cameraDigest = sha256Canonical(cameraTape);
  const identity = {
    id: scenario.id,
    scenarioDefinitionDigest,
    seed: scenario.seed,
    saveDigest,
    inputDigest,
    cameraDigest,
    entityMultiplier: scenario.entityMultiplier,
    requiredTelemetry,
    expectedRouteCompletion,
  };
  return {
    ...identity,
    scenarioDigest: sha256Canonical(identity),
    save,
    inputTape,
    cameraTape,
  };
}

function compileSave(save) {
  const result = canonicalize(save);
  if (result.sha256) result.sha256 = STRING_TO_LOWER_CASE(result.sha256);
  return result;
}

function canonicalInputEvents(records) {
  const result = canonicalOrderedRecords(records);
  for (let index = 0; index < result.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(result, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('canonical input events must contain own data values');
    }
    Object.defineProperty(descriptor.value, 'device', {
      value: 'keyboard',
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function canonicalOrderedRecords(records) {
  const result = new Array(records.length);
  for (let index = 0; index < records.length; index += 1) {
    defineArrayValue(result, index, canonicalize(records[index]));
  }
  ARRAY_SORT(result, compareOrderedRecord);
  return result;
}

function compareOrderedRecord(left, right) {
  return (left.tick - right.tick) || (left.sequence - right.sequence);
}

function rejectUnknownKeys(value, allowed, prefix, issues) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.add(`${propertyPath(prefix, key)} is not allowed`);
  }
}

function validateVector(value, length, prefix, issues) {
  if (!Array.isArray(value) || value.length !== length) {
    issues.add(`${prefix} must be an array of ${length} finite numbers`);
    return;
  }
  for (let index = 0; index < length; index += 1) {
    if (!Number.isFinite(value[index]) || Object.is(value[index], -0)) {
      issues.add(`${prefix} must be an array of ${length} finite numbers without signed zero`);
      return;
    }
  }
}

function isSafeRepositoryRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return false;
  if (!STRING_IS_WELL_FORMED(value) || STRING_NORMALIZE(value, 'NFC') !== value) return false;
  if (Buffer.byteLength(value, 'utf8') > 1024) return false;
  if (REGEXP_TEST(ASCII_CONTROL, value) || REGEXP_TEST(WINDOWS_INVALID_PATH_CHAR, value)) return false;
  if (STRING_STARTS_WITH(value, '/') || STRING_STARTS_WITH(value, '//')) return false;

  const parts = STRING_SPLIT(value, '/');
  for (let index = 0; index < parts.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(parts, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
    const part = descriptor.value;
    if (
      part.length === 0
      || part === '.'
      || part === '..'
      || part.length > 255
      || Buffer.byteLength(part, 'utf8') > 255
      || REGEXP_TEST(/[ .]$/, part)
      || REGEXP_TEST(WINDOWS_RESERVED_SEGMENT, part)
    ) return false;
  }
  return true;
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    const result = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      defineArrayValue(result, index, canonicalize(value[index]));
    }
    return result;
  }
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  ARRAY_SORT(keys);
  const result = Object.create(null);
  for (const key of keys) {
    Object.defineProperty(result, key, {
      value: canonicalize(value[key]),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function sha256Canonical(value) {
  const hash = createHash('sha256');
  writeCanonicalJson(hash, value);
  return hash.digest('hex');
}

function writeCanonicalJson(hash, value) {
  if (value === null) {
    hash.update('null');
    return;
  }
  if (typeof value === 'boolean') {
    hash.update(value ? 'true' : 'false');
    return;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    hash.update(JSON_STRINGIFY(value));
    return;
  }
  if (Array.isArray(value)) {
    hash.update('[');
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) hash.update(',');
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('canonical JSON arrays must contain own data values');
      }
      writeCanonicalJson(hash, descriptor.value);
    }
    hash.update(']');
    return;
  }
  if (!isPlainObject(value)) {
    throw new TypeError('canonical JSON values must be plain data');
  }

  const keys = Object.keys(value);
  ARRAY_SORT(keys);
  hash.update('{');
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) hash.update(',');
    const key = keys[index];
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('canonical JSON objects must contain own data values');
    }
    hash.update(JSON_STRINGIFY(key));
    hash.update(':');
    writeCanonicalJson(hash, descriptor.value);
  }
  hash.update('}');
}

function defineArrayValue(array, index, value) {
  Object.defineProperty(array, String(index), {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function deepFreeze(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) deepFreeze(value[index]);
  } else {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

function resolveLimits(overrides) {
  const limits = { ...PERFORMANCE_SCENARIO_MANIFEST_LIMITS };
  if (overrides == null) return limits;
  assertOrdinaryOptionObject(overrides, 'performance scenario manifest limits');
  for (const key of Object.keys(PERFORMANCE_SCENARIO_MANIFEST_LIMITS)) {
    const descriptor = Object.getOwnPropertyDescriptor(overrides, key);
    if (!descriptor) continue;
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`performance scenario manifest limit ${key} must be a data property`);
    }
    const value = descriptor.value;
    if (!Number.isSafeInteger(value) || value < 0) continue;
    limits[key] = Math.min(limits[key], value);
  }
  return limits;
}

function createIssueCollector(maxIssues, maxIssueBytes, maxMessageBytes) {
  const once = new Set();
  return {
    count: 0,
    values: [],
    usedBytes: 0,
    truncatedMessageCount: 0,
    add(message) {
      this.count += 1;
      if (this.values.length >= maxIssues) return;
      const separatorBytes = this.values.length > 0 ? 1 : 0;
      const available = maxIssueBytes - this.usedBytes - separatorBytes;
      if (available <= 0) return;
      const text = String(message);
      const bounded = truncateUtf8(text, Math.min(maxMessageBytes, available));
      if (!bounded) return;
      if (bounded !== text) this.truncatedMessageCount += 1;
      defineArrayValue(this.values, this.values.length, bounded);
      this.usedBytes += separatorBytes + Buffer.byteLength(bounded, 'utf8');
    },
    addOnce(key, message) {
      if (once.has(key)) return;
      once.add(key);
      this.add(message);
    },
  };
}

function validationResult(issues, limits) {
  const omittedIssueCount = Math.max(0, issues.count - issues.values.length);
  const summary = [];
  if (omittedIssueCount > 0) {
    defineArrayValue(summary, summary.length, `${omittedIssueCount} issue(s) omitted by validation diagnostic limits`);
  }
  if (issues.truncatedMessageCount > 0) {
    defineArrayValue(summary, summary.length, `${issues.truncatedMessageCount} issue message(s) truncated by validation diagnostic limits`);
  }
  return {
    schema: PERFORMANCE_SCENARIO_MANIFEST_VALIDATION_SCHEMA,
    ok: issues.count === 0,
    issueCount: issues.count,
    emittedIssueCount: issues.values.length,
    issues: [...issues.values],
    omittedIssueCount,
    diagnosticUtf8Bytes: issues.usedBytes,
    diagnosticsTruncated: omittedIssueCount > 0 || issues.truncatedMessageCount > 0,
    summary: summary.join('; '),
    limits: { ...limits },
  };
}

function truncateUtf8(value, maxBytes) {
  if (maxBytes <= 0) return '';
  const probe = value.length > maxBytes + 1
    ? STRING_SLICE(value, 0, maxBytes + 1)
    : value;
  if (Buffer.byteLength(probe, 'utf8') <= maxBytes && probe.length === value.length) return probe;

  const ellipsis = maxBytes >= 3 ? '…' : '';
  const targetBytes = maxBytes - Buffer.byteLength(ellipsis, 'utf8');
  let result = '';
  let bytes = 0;
  for (const character of probe) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > targetBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return `${result}${ellipsis}`;
}

function propertyPath(prefix, key) {
  if (key.length <= 64 && REGEXP_TEST(SIMPLE_PATH_KEY, key)) return `${prefix}.${key}`;
  return `${prefix}[${previewValue(key)}]`;
}

function previewValue(value) {
  if (typeof value === 'string') {
    const bounded = value.length > 64 ? `${STRING_SLICE(value, 0, 64)}…` : value;
    return JSON_STRINGIFY(bounded);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
  return `<${typeof value}>`;
}

function inspectManifestOptions(options) {
  if (options == null) return { requireCompleteMatrix: false, limits: null, source: null };
  assertOrdinaryOptionObject(options, 'performance scenario manifest options');
  const requireCompleteMatrix = readOwnDataOption(options, 'requireCompleteMatrix');
  const limits = readOwnDataOption(options, 'limits');
  const source = readOwnDataOption(options, 'source');
  if (requireCompleteMatrix != null && typeof requireCompleteMatrix !== 'boolean') {
    throw new TypeError('performance scenario manifest requireCompleteMatrix option must be boolean');
  }
  return {
    requireCompleteMatrix: requireCompleteMatrix === true,
    limits: limits ?? null,
    source: source ?? null,
  };
}

function readOwnDataOption(options, key) {
  const descriptor = Object.getOwnPropertyDescriptor(options, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) {
    throw new TypeError(`performance scenario manifest option ${key} must be a data property`);
  }
  return descriptor.value;
}

function assertOrdinaryOptionObject(value, label) {
  if (typeof value !== 'object' || value == null || utilTypes.isProxy(value) || !hasOrdinaryObjectPrototype(value)) {
    throw new TypeError(`${label} must be a plain non-Proxy object`);
  }
}

function boundedSafeInteger(value, min, max) {
  return Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max;
}

function boundedString(value, maxLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && STRING_TRIM(value).length > 0;
}

function boundedIdentifier(value, pattern, maxLength) {
  return boundedString(value, maxLength) && REGEXP_TEST(pattern, value);
}

function isJsonScalar(value) {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
    || (typeof value === 'number'
      && Number.isFinite(value)
      && !Object.is(value, -0)
      && (!Number.isInteger(value) || Number.isSafeInteger(value)));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && STRING_TRIM(value).length > 0;
}

function hasOrdinaryObjectPrototype(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPlainObject(value) {
  return value !== INVALID && hasOrdinaryObjectPrototype(value);
}
