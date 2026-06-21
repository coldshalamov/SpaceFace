import { SCENARIO_CONTRACT_SCHEMA, validateScenarioDocument } from './scenarioSchemas.js';

export const GOLDEN_INPUT_TAPE_SCHEMA = 'spaceface.goldenInputTape.v1';
export const TELEMETRY_ENVELOPE_SCHEMA = 'spaceface.telemetryEnvelope.v1';
export const EVIDENCE_VALIDATION_RESULT_SCHEMA = 'spaceface.evidenceValidationResult.v1';

const REQUIRED_EVENT_FAMILIES = ['flight', 'combat', 'economy', 'story', 'ai', 'camera', 'scenario', 'tether', 'presentation'];
const TAPE_KEYS = new Set(['schema', 'id', 'scenario', 'seed', 'tickRate', 'notes', 'frames']);
const FRAME_KEYS = new Set(['tick', 'input', 'commands']);
const INPUT_KEYS = new Set(['moveX', 'moveZ', 'turnIntent', 'boost', 'fire', 'fireGroup', 'aimAngle']);
const COMMAND_KEYS = new Set(['kind', 'actionId', 'actor', 'target', 'attachment', 'branchId', 'source']);
const ENVELOPE_KEYS = new Set([
  'schema',
  'id',
  'scenario',
  'seed',
  'sourceInputTape',
  'sourceScenarioContract',
  'requiredEventFamilies',
  'phase0ExpectedTraceTypes',
  'phase0ObservedTraceCounts',
  'acceptancePlaceholders',
  'notes',
]);
const ACCEPTANCE_KEYS = new Set([
  'authoritativeHash',
  'firstMeaningfulSteeringTickMax',
  'firstTetherAttachTickMax',
  'firstHostileShotTickMax',
  'policyCompletionCountMin',
  'enemyCounterTetherBehaviorCountMin',
  'cleanRunCountRequired',
  'canonicalLongBranchId',
  'canonicalLongBranchFactChanges',
]);

export function validateEvidenceDocument(doc, options = {}) {
  const file = normalizePath(options.file || '');
  const issues = [];
  if (!isPlainObject(doc)) {
    addIssue(issues, file, '$', 'type', 'document must be a JSON object');
    return documentResult(doc, issues);
  }

  if (doc.schema === GOLDEN_INPUT_TAPE_SCHEMA) validateGoldenInputTape(doc, issues, file);
  else if (doc.schema === TELEMETRY_ENVELOPE_SCHEMA) validateTelemetryEnvelope(doc, issues, file);
  else if (doc.schema === SCENARIO_CONTRACT_SCHEMA) issues.push(...validateScenarioDocument(doc, { file }).issues);
  else addIssue(issues, file, '$.schema', 'schema', `unsupported evidence schema ${JSON.stringify(doc.schema)}`);

  return documentResult(doc, issues);
}

export function validateEvidenceCorpus(entries) {
  const files = entries.map((entry) => {
    const path = normalizePath(entry.path || '');
    if (entry.error) {
      return {
        path,
        schema: null,
        ok: false,
        issues: [makeIssue(path, '$', 'parse', entry.error)],
      };
    }
    const result = validateEvidenceDocument(entry.data, { file: path });
    return {
      path,
      schema: result.documentSchema,
      ok: result.ok,
      issues: result.issues,
    };
  });

  const issues = files.flatMap((file) => file.issues);
  validateEvidenceCrossRefs(entries, issues);

  return {
    schema: EVIDENCE_VALIDATION_RESULT_SCHEMA,
    ok: issues.length === 0,
    fileCount: files.length,
    issueCount: issues.length,
    files: files.map((file) => ({
      path: file.path,
      schema: file.schema,
      ok: !issues.some((issue) => issue.file === file.path),
      issues: issues.filter((issue) => issue.file === file.path),
    })),
    issues,
  };
}

export function formatEvidenceIssue(issue) {
  const file = issue.file ? `${issue.file}:` : '';
  return `${file}${issue.path} [${issue.rule}] ${issue.message}`;
}

function validateGoldenInputTape(tape, issues, file) {
  validateKnownKeys(tape, TAPE_KEYS, '$', issues, file);
  requireString(tape.id, '$.id', issues, file, { pattern: /^[a-z0-9][a-z0-9_.:-]*$/ });
  requireString(tape.scenario, '$.scenario', issues, file);
  requireInteger(tape.seed, '$.seed', issues, file, { min: 1 });
  requireInteger(tape.tickRate, '$.tickRate', issues, file, { min: 1, max: 240 });
  validateStringArray(tape.notes, '$.notes', issues, file, { required: false, maxItemLength: 240 });

  if (!Array.isArray(tape.frames)) {
    addIssue(issues, file, '$.frames', 'type', 'frames must be an array');
    return;
  }
  if (tape.frames.length === 0) addIssue(issues, file, '$.frames', 'minItems', 'frames must contain at least one input frame');

  let prevTick = -1;
  for (let i = 0; i < tape.frames.length; i++) {
    const frame = tape.frames[i];
    const path = `$.frames[${i}]`;
    if (!isPlainObject(frame)) {
      addIssue(issues, file, path, 'type', 'frame must be an object');
      continue;
    }
    validateKnownKeys(frame, FRAME_KEYS, path, issues, file);
    if (!Number.isSafeInteger(frame.tick) || frame.tick < 0) {
      addIssue(issues, file, `${path}.tick`, 'integer', 'frame tick must be a non-negative safe integer');
    } else {
      if (i === 0 && frame.tick !== 0) addIssue(issues, file, `${path}.tick`, 'startTick', 'first frame must start at tick 0');
      if (frame.tick <= prevTick) addIssue(issues, file, `${path}.tick`, 'order', 'frame ticks must strictly increase in file order');
      prevTick = frame.tick;
    }
    validateInputFrame(frame.input, `${path}.input`, issues, file);
    validateTapeCommands(frame.commands, `${path}.commands`, issues, file);
  }
}

function validateInputFrame(input, path, issues, file) {
  if (!isPlainObject(input)) {
    addIssue(issues, file, path, 'type', 'input must be an object');
    return;
  }
  validateKnownKeys(input, INPUT_KEYS, path, issues, file);
  optionalUnit(input.moveX, `${path}.moveX`, issues, file);
  optionalUnit(input.moveZ, `${path}.moveZ`, issues, file);
  optionalUnit(input.turnIntent, `${path}.turnIntent`, issues, file);
  optionalBoolean(input.boost, `${path}.boost`, issues, file);
  optionalBoolean(input.fire, `${path}.fire`, issues, file);
  if (input.fireGroup != null && (!Number.isSafeInteger(input.fireGroup) || input.fireGroup < 0 || input.fireGroup > 9)) {
    addIssue(issues, file, `${path}.fireGroup`, 'range', 'fireGroup must be null or an integer from 0 to 9');
  }
  if (input.aimAngle != null && (!Number.isFinite(input.aimAngle) || Math.abs(input.aimAngle) > Math.PI * 2)) {
    addIssue(issues, file, `${path}.aimAngle`, 'range', 'aimAngle must be finite radians in [-2pi, 2pi]');
  }
}

function validateTapeCommands(commands, path, issues, file) {
  if (commands == null) return;
  if (!Array.isArray(commands)) {
    addIssue(issues, file, path, 'type', 'commands must be an array when present');
    return;
  }
  if (commands.length > 8) addIssue(issues, file, path, 'maxItems', 'a frame may issue at most 8 commands');
  commands.forEach((command, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isPlainObject(command)) {
      addIssue(issues, file, itemPath, 'type', 'command must be an object');
      return;
    }
    validateKnownKeys(command, COMMAND_KEYS, itemPath, issues, file);
    if (!['combatAction', 'scenarioBranch'].includes(command.kind)) {
      addIssue(issues, file, `${itemPath}.kind`, 'enum', 'command kind must be combatAction or scenarioBranch');
      return;
    }
    if (command.kind === 'combatAction') {
      requireString(command.actionId, `${itemPath}.actionId`, issues, file, { pattern: /^action_[a-z0-9_:-]+$/ });
      validateActorRef(command.actor, `${itemPath}.actor`, issues, file, { required: true });
      validateActorRef(command.target, `${itemPath}.target`, issues, file, { required: false });
      validateActorRef(command.attachment, `${itemPath}.attachment`, issues, file, { required: false });
      if (command.branchId != null) addIssue(issues, file, `${itemPath}.branchId`, 'forbidden', 'combatAction commands cannot include branchId');
    } else {
      requireString(command.branchId, `${itemPath}.branchId`, issues, file, { pattern: /^[a-z0-9][a-z0-9_.:-]*$/ });
      if (command.actionId != null) addIssue(issues, file, `${itemPath}.actionId`, 'forbidden', 'scenarioBranch commands cannot include actionId');
      if (command.actor != null) addIssue(issues, file, `${itemPath}.actor`, 'forbidden', 'scenarioBranch commands cannot include actor');
      if (command.target != null) addIssue(issues, file, `${itemPath}.target`, 'forbidden', 'scenarioBranch commands cannot include target');
      if (command.attachment != null) addIssue(issues, file, `${itemPath}.attachment`, 'forbidden', 'scenarioBranch commands cannot include attachment');
    }
    if (command.source != null && !/^[a-z][a-z0-9_.:-]*$/.test(String(command.source))) {
      addIssue(issues, file, `${itemPath}.source`, 'pattern', 'source must be a stable lowercase token');
    }
  });
}

function validateTelemetryEnvelope(envelope, issues, file) {
  validateKnownKeys(envelope, ENVELOPE_KEYS, '$', issues, file);
  requireString(envelope.id, '$.id', issues, file, { pattern: /^[a-z0-9][a-z0-9_.:-]*$/ });
  requireString(envelope.scenario, '$.scenario', issues, file);
  requireInteger(envelope.seed, '$.seed', issues, file, { min: 1 });
  requireString(envelope.sourceInputTape, '$.sourceInputTape', issues, file);
  requireString(envelope.sourceScenarioContract, '$.sourceScenarioContract', issues, file);
  validateStringArray(envelope.requiredEventFamilies, '$.requiredEventFamilies', issues, file, { minItems: 1 });
  validateStringArray(envelope.phase0ExpectedTraceTypes, '$.phase0ExpectedTraceTypes', issues, file, { minItems: 1 });
  validateTraceCountMap(envelope.phase0ObservedTraceCounts, '$.phase0ObservedTraceCounts', issues, file);
  validateStringArray(envelope.notes, '$.notes', issues, file, { required: false, maxItemLength: 260 });

  for (const family of REQUIRED_EVENT_FAMILIES) {
    if (!Array.isArray(envelope.requiredEventFamilies) || !envelope.requiredEventFamilies.includes(family)) {
      addIssue(issues, file, '$.requiredEventFamilies', 'requiredFamily', `missing required event family ${family}`);
    }
  }
  if (Array.isArray(envelope.requiredEventFamilies)) {
    validateUniqueStrings(envelope.requiredEventFamilies, '$.requiredEventFamilies', issues, file);
  }
  if (Array.isArray(envelope.phase0ExpectedTraceTypes)) {
    validateUniqueStrings(envelope.phase0ExpectedTraceTypes, '$.phase0ExpectedTraceTypes', issues, file);
    envelope.phase0ExpectedTraceTypes.forEach((type, index) => {
      if (typeof type === 'string' && !/^[a-z][a-z0-9-]*:[a-zA-Z0-9_.-]+$/.test(type)) {
        addIssue(issues, file, `$.phase0ExpectedTraceTypes[${index}]`, 'eventType', 'trace type must use family:eventName syntax');
      }
    });
  }

  validateAcceptancePlaceholders(envelope.acceptancePlaceholders, issues, file);
}

function validateTraceCountMap(value, path, issues, file) {
  if (!isPlainObject(value)) {
    addIssue(issues, file, path, 'type', 'phase0ObservedTraceCounts must be an object');
    return;
  }
  for (const [type, count] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]*:[a-zA-Z0-9_.-]+$/.test(type)) {
      addIssue(issues, file, `${path}.${type}`, 'eventType', 'observed trace key must use family:eventName syntax');
    }
    if (!Number.isSafeInteger(count) || count < 0) {
      addIssue(issues, file, `${path}.${type}`, 'count', 'observed trace count must be a non-negative safe integer');
    }
  }
}

function validateActorRef(value, path, issues, file, options = {}) {
  if (value == null) {
    if (options.required) addIssue(issues, file, path, 'required', 'actor reference is required');
    return;
  }
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_.:-]*$/.test(value)) {
    addIssue(issues, file, path, 'pattern', 'actor reference must be a stable scenario id');
  }
}

function validateAcceptancePlaceholders(value, issues, file) {
  const path = '$.acceptancePlaceholders';
  if (!isPlainObject(value)) {
    addIssue(issues, file, path, 'type', 'acceptancePlaceholders must be an object');
    return;
  }
  validateKnownKeys(value, ACCEPTANCE_KEYS, path, issues, file);
  for (const key of ACCEPTANCE_KEYS) {
    if (!(key in value)) addIssue(issues, file, `${path}.${key}`, 'required', 'required acceptance placeholder is missing');
  }
  if (value.authoritativeHash != null && !/^[a-f0-9]{64}$/.test(value.authoritativeHash)) {
    addIssue(issues, file, `${path}.authoritativeHash`, 'hash', 'authoritativeHash must be null or a 64-character lowercase sha256 hex string');
  }
  requireIntegerOrNull(value.firstMeaningfulSteeringTickMax, `${path}.firstMeaningfulSteeringTickMax`, issues, file, { min: 0 });
  requireIntegerOrNull(value.firstTetherAttachTickMax, `${path}.firstTetherAttachTickMax`, issues, file, { min: 0 });
  requireIntegerOrNull(value.firstHostileShotTickMax, `${path}.firstHostileShotTickMax`, issues, file, { min: 0 });
  requireIntegerOrNull(value.policyCompletionCountMin, `${path}.policyCompletionCountMin`, issues, file, { min: 1 });
  requireIntegerOrNull(value.enemyCounterTetherBehaviorCountMin, `${path}.enemyCounterTetherBehaviorCountMin`, issues, file, { min: 0 });
  requireIntegerOrNull(value.cleanRunCountRequired, `${path}.cleanRunCountRequired`, issues, file, { min: 1 });
}

function validateEvidenceCrossRefs(entries, issues) {
  const byPath = new Map(entries.map((entry) => [normalizePath(entry.path || ''), entry]));
  for (const entry of entries) {
    if (!entry || !entry.data || entry.data.schema !== TELEMETRY_ENVELOPE_SCHEMA) continue;
    const envelopePath = normalizePath(entry.path || '');
    const sourcePath = normalizePath(entry.data.sourceInputTape || '');
    const scenarioPath = normalizePath(entry.data.sourceScenarioContract || '');
    const source = byPath.get(sourcePath);
    if (!source) {
      addIssue(issues, envelopePath, '$.sourceInputTape', 'crossRef', `source input tape ${sourcePath || '<empty>'} was not part of this validation corpus`);
      continue;
    }
    if (!source.data || source.data.schema !== GOLDEN_INPUT_TAPE_SCHEMA) {
      addIssue(issues, envelopePath, '$.sourceInputTape', 'crossRef', 'sourceInputTape must point to a golden input tape');
      continue;
    }
    if (source.data.seed !== entry.data.seed) addIssue(issues, envelopePath, '$.seed', 'crossRef', 'telemetry seed must match source input tape seed');
    if (source.data.scenario !== entry.data.scenario) addIssue(issues, envelopePath, '$.scenario', 'crossRef', 'telemetry scenario must match source input tape scenario');
    const scenario = byPath.get(scenarioPath);
    if (!scenario) {
      addIssue(issues, envelopePath, '$.sourceScenarioContract', 'crossRef', `source scenario contract ${scenarioPath || '<empty>'} was not part of this validation corpus`);
      continue;
    }
    if (!scenario.data || scenario.data.schema !== SCENARIO_CONTRACT_SCHEMA) {
      addIssue(issues, envelopePath, '$.sourceScenarioContract', 'crossRef', 'sourceScenarioContract must point to a scenario contract');
      continue;
    }
    if (scenario.data.scenario !== entry.data.scenario) {
      addIssue(issues, envelopePath, '$.scenario', 'crossRef', 'telemetry scenario must match source scenario contract');
    }
  }
}

function documentResult(doc, issues) {
  return {
    schema: EVIDENCE_VALIDATION_RESULT_SCHEMA,
    ok: issues.length === 0,
    documentSchema: doc && typeof doc === 'object' ? doc.schema || null : null,
    issueCount: issues.length,
    issues,
  };
}

function validateKnownKeys(obj, allowed, path, issues, file) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) addIssue(issues, file, `${path}.${key}`, 'unknownKey', `unknown key ${key}`);
  }
}

function requireString(value, path, issues, file, options = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    addIssue(issues, file, path, 'type', 'must be a non-empty string');
    return;
  }
  if (options.pattern && !options.pattern.test(value)) addIssue(issues, file, path, 'pattern', 'string does not match required pattern');
}

function requireInteger(value, path, issues, file, options = {}) {
  if (!Number.isSafeInteger(value)) {
    addIssue(issues, file, path, 'integer', 'must be a safe integer');
    return;
  }
  if (options.min != null && value < options.min) addIssue(issues, file, path, 'minimum', `must be >= ${options.min}`);
  if (options.max != null && value > options.max) addIssue(issues, file, path, 'maximum', `must be <= ${options.max}`);
}

function requireIntegerOrNull(value, path, issues, file, options = {}) {
  if (value == null) return;
  requireInteger(value, path, issues, file, options);
}

function optionalBoolean(value, path, issues, file) {
  if (value != null && typeof value !== 'boolean') addIssue(issues, file, path, 'type', 'must be a boolean when present');
}

function optionalUnit(value, path, issues, file) {
  if (value == null) return;
  if (!Number.isFinite(value) || value < -1 || value > 1) addIssue(issues, file, path, 'range', 'must be finite and in [-1, 1]');
}

function validateStringArray(value, path, issues, file, options = {}) {
  if (value == null && options.required === false) return;
  if (!Array.isArray(value)) {
    addIssue(issues, file, path, 'type', 'must be an array of strings');
    return;
  }
  if (options.minItems != null && value.length < options.minItems) addIssue(issues, file, path, 'minItems', `must contain at least ${options.minItems} item(s)`);
  value.forEach((item, index) => {
    if (typeof item !== 'string' || !item.trim()) addIssue(issues, file, `${path}[${index}]`, 'type', 'must be a non-empty string');
    if (options.maxItemLength && typeof item === 'string' && item.length > options.maxItemLength) {
      addIssue(issues, file, `${path}[${index}]`, 'maxLength', `must be <= ${options.maxItemLength} characters`);
    }
  });
}

function validateUniqueStrings(values, path, issues, file) {
  const seen = new Set();
  values.forEach((value, index) => {
    if (typeof value !== 'string') return;
    if (seen.has(value)) addIssue(issues, file, `${path}[${index}]`, 'uniqueItems', `duplicate string ${value}`);
    seen.add(value);
  });
}

function makeIssue(file, path, rule, message) {
  return { file: normalizePath(file), path, rule, message };
}

function addIssue(issues, file, path, rule, message) {
  issues.push(makeIssue(file, path, rule, message));
}

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
