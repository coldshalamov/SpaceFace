export const SCENARIO_CONTRACT_SCHEMA = 'spaceface.scenarioContract.v1';
export const SCENARIO_VALIDATION_RESULT_SCHEMA = 'spaceface.scenarioValidationResult.v1';

export const REQUIRED_47A_BEAT_IDS = Object.freeze([
  'drop_wreck_field',
  'stabilize_spindle',
  'scavenger_arrival',
  'debris_sling',
  'recovery_tug',
  'carrier_destabilizes',
  'civilian_pod_choice',
  'resolution_branch',
]);

export const REQUIRED_47A_BRANCH_IDS = Object.freeze([
  'escape_with_evidence',
  'surrender_evidence',
  'destroy_evidence',
  'deliver_to_contact',
]);

const ID_PATTERN = /^[a-z][a-z0-9_.:-]*$/;
const CUE_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9_-]+)+$/;
const TOP_KEYS = new Set([
  'schema',
  'id',
  'scenario',
  'version',
  'sourceSpec',
  'tickRate',
  'durationSeconds',
  'status',
  'actors',
  'facts',
  'presentationEventIds',
  'proofMetrics',
  'dialogue',
  'beats',
  'branches',
  'notes',
]);
const ACTOR_KEYS = new Set(['id', 'role', 'required', 'assetRef', 'factionId', 'capabilities', 'notes']);
const FACT_KEYS = new Set(['id', 'description', 'owner', 'initial']);
const METRIC_KEYS = new Set(['id', 'target', 'evidence', 'required', 'beatIds']);
const BEAT_KEYS = new Set([
  'id',
  'order',
  'timeStartS',
  'timeEndS',
  'title',
  'intent',
  'requiredActors',
  'requiredMechanics',
  'requiredPresentation',
  'presentationEventIds',
  'proofMetricIds',
  'worldFactRefs',
  'next',
  'branchIds',
]);
const BRANCH_KEYS = new Set(['id', 'unlockedByBeat', 'policyId', 'summary', 'outcomeTags', 'lifecycle', 'worldFactEffects', 'resolutionPredicate']);
const BRANCH_LIFECYCLE_KEYS = new Set(['offer', 'active', 'reminder', 'fail', 'abandon', 'complete', 'aftermath']);
const DIALOGUE_KEYS = new Set(['id', 'beatId', 'speakerActorId', 'speaker', 'channel', 'text', 'presentationEventId']);
const DIALOGUE_CHANNELS = new Set(['comms', 'distress', 'official', 'system']);
const EFFECT_KEYS = new Set(['factId', 'op', 'value']);
const BRANCH_PREDICATE_KEYS = new Set(['id', 'source', 'all']);
const BRANCH_PREDICATE_CONDITION_KEYS = new Set([
  'kind',
  'beatId',
  'actorId',
  'ownerActorId',
  'targetActorId',
  'actionId',
  'eventType',
  'minCount',
  'maxCount',
  'maxDistance',
]);
const BRANCH_PREDICATE_KINDS = new Set(['beatEntered', 'actionStarted', 'attachmentActive', 'actorDistance', 'eventCount']);

export function validateScenarioDocument(doc, options = {}) {
  const file = normalizePath(options.file || '');
  const issues = [];
  if (!isPlainObject(doc)) {
    addIssue(issues, file, '$', 'type', 'scenario document must be a JSON object');
    return result(doc, issues);
  }
  if (doc.schema !== SCENARIO_CONTRACT_SCHEMA) {
    addIssue(issues, file, '$.schema', 'schema', `unsupported scenario schema ${JSON.stringify(doc.schema)}`);
    return result(doc, issues);
  }

  validateKnownKeys(doc, TOP_KEYS, '$', issues, file);
  requireId(doc.id, '$.id', issues, file);
  requireString(doc.scenario, '$.scenario', issues, file);
  requireInteger(doc.version, '$.version', issues, file, { min: 1 });
  requireString(doc.sourceSpec, '$.sourceSpec', issues, file);
  requireInteger(doc.tickRate, '$.tickRate', issues, file, { min: 1, max: 240 });
  requireInteger(doc.durationSeconds, '$.durationSeconds', issues, file, { min: 60, max: 3600 });
  requireString(doc.status, '$.status', issues, file);
  validateStringArray(doc.notes, '$.notes', issues, file, { required: false, maxItemLength: 260 });

  const actors = validateActors(doc.actors, issues, file);
  const facts = validateFacts(doc.facts, issues, file);
  const cues = validatePresentationEventIds(doc.presentationEventIds, issues, file);
  const metrics = validateProofMetrics(doc.proofMetrics, issues, file);
  validateDialogue(doc.dialogue, issues, file);
  const beats = validateBeats(doc.beats, issues, file);
  const branches = validateBranches(doc.branches, issues, file);

  validateScenarioRefs({ doc, actors, facts, cues, metrics, beats, branches, issues, file });
  return result(doc, issues);
}

export function formatScenarioIssue(issue) {
  const file = issue.file ? `${issue.file}:` : '';
  return `${file}${issue.path} [${issue.rule}] ${issue.message}`;
}

function validateActors(value, issues, file) {
  const ids = new Set();
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, file, '$.actors', 'minItems', 'actors must contain at least one actor');
    return ids;
  }
  value.forEach((actor, index) => {
    const path = `$.actors[${index}]`;
    if (!isPlainObject(actor)) {
      addIssue(issues, file, path, 'type', 'actor must be an object');
      return;
    }
    validateKnownKeys(actor, ACTOR_KEYS, path, issues, file);
    requireUniqueId(actor.id, `${path}.id`, ids, issues, file);
    requireString(actor.role, `${path}.role`, issues, file);
    if (typeof actor.required !== 'boolean') addIssue(issues, file, `${path}.required`, 'type', 'required must be a boolean');
    optionalString(actor.assetRef, `${path}.assetRef`, issues, file);
    optionalString(actor.factionId, `${path}.factionId`, issues, file);
    validateStringArray(actor.capabilities, `${path}.capabilities`, issues, file, { minItems: actor.required ? 1 : 0 });
    validateStringArray(actor.notes, `${path}.notes`, issues, file, { required: false, maxItemLength: 200 });
  });
  return ids;
}

function validateFacts(value, issues, file) {
  const ids = new Set();
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, file, '$.facts', 'minItems', 'facts must contain at least one world fact');
    return ids;
  }
  value.forEach((fact, index) => {
    const path = `$.facts[${index}]`;
    if (!isPlainObject(fact)) {
      addIssue(issues, file, path, 'type', 'fact must be an object');
      return;
    }
    validateKnownKeys(fact, FACT_KEYS, path, issues, file);
    requireUniqueId(fact.id, `${path}.id`, ids, issues, file);
    requireString(fact.description, `${path}.description`, issues, file);
    optionalString(fact.owner, `${path}.owner`, issues, file);
    optionalString(fact.initial, `${path}.initial`, issues, file);
  });
  return ids;
}

function validatePresentationEventIds(value, issues, file) {
  const ids = new Set();
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, file, '$.presentationEventIds', 'minItems', 'presentationEventIds must contain at least one cue');
    return ids;
  }
  value.forEach((id, index) => {
    const path = `$.presentationEventIds[${index}]`;
    if (typeof id !== 'string' || !CUE_PATTERN.test(id)) addIssue(issues, file, path, 'cueId', 'presentation event id must be dotted lower-case syntax');
    if (typeof id === 'string') {
      if (ids.has(id)) addIssue(issues, file, path, 'uniqueItems', `duplicate presentation event id ${id}`);
      ids.add(id);
    }
  });
  return ids;
}

function validateProofMetrics(value, issues, file) {
  const ids = new Set();
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, file, '$.proofMetrics', 'minItems', 'proofMetrics must contain at least one metric');
    return ids;
  }
  value.forEach((metric, index) => {
    const path = `$.proofMetrics[${index}]`;
    if (!isPlainObject(metric)) {
      addIssue(issues, file, path, 'type', 'proof metric must be an object');
      return;
    }
    validateKnownKeys(metric, METRIC_KEYS, path, issues, file);
    requireUniqueId(metric.id, `${path}.id`, ids, issues, file);
    requireString(metric.target, `${path}.target`, issues, file);
    requireString(metric.evidence, `${path}.evidence`, issues, file);
    if (typeof metric.required !== 'boolean') addIssue(issues, file, `${path}.required`, 'type', 'required must be a boolean');
    validateStringArray(metric.beatIds, `${path}.beatIds`, issues, file, { minItems: 1 });
  });
  return ids;
}

function validateDialogue(value, issues, file) {
  const ids = new Set();
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, file, '$.dialogue', 'minItems', 'dialogue must contain at least one authored line');
    return ids;
  }
  value.forEach((line, index) => {
    const path = `$.dialogue[${index}]`;
    if (!isPlainObject(line)) {
      addIssue(issues, file, path, 'type', 'dialogue line must be an object');
      return;
    }
    validateKnownKeys(line, DIALOGUE_KEYS, path, issues, file);
    requireUniqueId(line.id, `${path}.id`, ids, issues, file);
    requireId(line.beatId, `${path}.beatId`, issues, file);
    requireId(line.speakerActorId, `${path}.speakerActorId`, issues, file);
    requireString(line.speaker, `${path}.speaker`, issues, file);
    requireString(line.channel, `${path}.channel`, issues, file);
    if (typeof line.channel === 'string' && !DIALOGUE_CHANNELS.has(line.channel)) {
      addIssue(issues, file, `${path}.channel`, 'enum', `channel must be one of ${[...DIALOGUE_CHANNELS].join(', ')}`);
    }
    requireString(line.text, `${path}.text`, issues, file);
    if (typeof line.text === 'string' && line.text.length > 150) {
      addIssue(issues, file, `${path}.text`, 'maxLength', 'dialogue text must be <= 150 characters');
    }
    requireString(line.presentationEventId, `${path}.presentationEventId`, issues, file);
    if (typeof line.presentationEventId === 'string' && !CUE_PATTERN.test(line.presentationEventId)) {
      addIssue(issues, file, `${path}.presentationEventId`, 'cueId', 'presentationEventId must use dotted lower-case syntax');
    }
  });
  return ids;
}

function validateBeats(value, issues, file) {
  const ids = new Set();
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, file, '$.beats', 'minItems', 'beats must contain at least one beat');
    return ids;
  }
  let previousOrder = 0;
  let previousEnd = -1;
  value.forEach((beat, index) => {
    const path = `$.beats[${index}]`;
    if (!isPlainObject(beat)) {
      addIssue(issues, file, path, 'type', 'beat must be an object');
      return;
    }
    validateKnownKeys(beat, BEAT_KEYS, path, issues, file);
    requireUniqueId(beat.id, `${path}.id`, ids, issues, file);
    requireInteger(beat.order, `${path}.order`, issues, file, { min: 1 });
    if (Number.isSafeInteger(beat.order) && beat.order <= previousOrder) addIssue(issues, file, `${path}.order`, 'order', 'beat order must strictly increase');
    previousOrder = Number.isSafeInteger(beat.order) ? beat.order : previousOrder;
    requireNumber(beat.timeStartS, `${path}.timeStartS`, issues, file, { min: 0 });
    requireNumber(beat.timeEndS, `${path}.timeEndS`, issues, file, { min: 0 });
    if (Number.isFinite(beat.timeStartS) && Number.isFinite(beat.timeEndS) && beat.timeEndS <= beat.timeStartS) {
      addIssue(issues, file, `${path}.timeEndS`, 'range', 'timeEndS must be greater than timeStartS');
    }
    if (Number.isFinite(beat.timeStartS) && beat.timeStartS < previousEnd) {
      addIssue(issues, file, `${path}.timeStartS`, 'order', 'beat windows must not overlap');
    }
    previousEnd = Number.isFinite(beat.timeEndS) ? beat.timeEndS : previousEnd;
    requireString(beat.title, `${path}.title`, issues, file);
    requireString(beat.intent, `${path}.intent`, issues, file);
    validateStringArray(beat.requiredActors, `${path}.requiredActors`, issues, file, { minItems: 1 });
    validateStringArray(beat.requiredMechanics, `${path}.requiredMechanics`, issues, file, { minItems: 1 });
    validateStringArray(beat.requiredPresentation, `${path}.requiredPresentation`, issues, file, { minItems: 1 });
    validateStringArray(beat.presentationEventIds, `${path}.presentationEventIds`, issues, file, { minItems: 0 });
    validateStringArray(beat.proofMetricIds, `${path}.proofMetricIds`, issues, file, { minItems: 1 });
    validateStringArray(beat.worldFactRefs, `${path}.worldFactRefs`, issues, file, { minItems: 1 });
    validateStringArray(beat.next, `${path}.next`, issues, file, { minItems: 0 });
    validateStringArray(beat.branchIds, `${path}.branchIds`, issues, file, { minItems: 0 });
  });
  return ids;
}

function validateBranches(value, issues, file) {
  const ids = new Set();
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, file, '$.branches', 'minItems', 'branches must contain at least one outcome branch');
    return ids;
  }
  value.forEach((branch, index) => {
    const path = `$.branches[${index}]`;
    if (!isPlainObject(branch)) {
      addIssue(issues, file, path, 'type', 'branch must be an object');
      return;
    }
    validateKnownKeys(branch, BRANCH_KEYS, path, issues, file);
    requireUniqueId(branch.id, `${path}.id`, ids, issues, file);
    requireId(branch.unlockedByBeat, `${path}.unlockedByBeat`, issues, file);
    requireId(branch.policyId, `${path}.policyId`, issues, file);
    requireString(branch.summary, `${path}.summary`, issues, file);
    validateStringArray(branch.outcomeTags, `${path}.outcomeTags`, issues, file, { minItems: 1 });
    validateBranchLifecycle(branch.lifecycle, `${path}.lifecycle`, issues, file);
    validateWorldFactEffects(branch.worldFactEffects, `${path}.worldFactEffects`, issues, file);
    validateBranchResolutionPredicate(branch.resolutionPredicate, `${path}.resolutionPredicate`, issues, file);
  });
  return ids;
}

function validateBranchLifecycle(value, path, issues, file) {
  if (!isPlainObject(value)) {
    addIssue(issues, file, path, 'type', 'branch lifecycle must be an object');
    return;
  }
  validateKnownKeys(value, BRANCH_LIFECYCLE_KEYS, path, issues, file);
  for (const key of BRANCH_LIFECYCLE_KEYS) {
    const itemPath = `${path}.${key}`;
    requireString(value[key], itemPath, issues, file);
    if (typeof value[key] === 'string' && value[key].length > 220) {
      addIssue(issues, file, itemPath, 'maxLength', 'branch lifecycle text must be <= 220 characters');
    }
  }
}

function validateWorldFactEffects(value, path, issues, file) {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, file, path, 'minItems', 'worldFactEffects must contain at least one immediate world fact change');
    return;
  }
  value.forEach((effect, index) => {
    const epath = `${path}[${index}]`;
    if (!isPlainObject(effect)) {
      addIssue(issues, file, epath, 'type', 'world fact effect must be an object');
      return;
    }
    validateKnownKeys(effect, EFFECT_KEYS, epath, issues, file);
    requireId(effect.factId, `${epath}.factId`, issues, file);
    if (!['set', 'increment', 'append'].includes(effect.op)) addIssue(issues, file, `${epath}.op`, 'enum', 'op must be set, increment, or append');
    if (effect.value == null || (typeof effect.value === 'string' && !effect.value.trim())) addIssue(issues, file, `${epath}.value`, 'required', 'value is required');
  });
}

function validateBranchResolutionPredicate(value, path, issues, file) {
  if (value == null) return;
  if (!isPlainObject(value)) {
    addIssue(issues, file, path, 'type', 'resolutionPredicate must be an object');
    return;
  }
  validateKnownKeys(value, BRANCH_PREDICATE_KEYS, path, issues, file);
  requireId(value.id, `${path}.id`, issues, file);
  requireId(value.source, `${path}.source`, issues, file);
  if (!Array.isArray(value.all) || value.all.length === 0) {
    addIssue(issues, file, `${path}.all`, 'minItems', 'resolutionPredicate.all must contain at least one condition');
    return;
  }
  value.all.forEach((condition, index) => {
    const cpath = `${path}.all[${index}]`;
    if (!isPlainObject(condition)) {
      addIssue(issues, file, cpath, 'type', 'predicate condition must be an object');
      return;
    }
    validateKnownKeys(condition, BRANCH_PREDICATE_CONDITION_KEYS, cpath, issues, file);
    requireString(condition.kind, `${cpath}.kind`, issues, file);
    if (typeof condition.kind === 'string' && !BRANCH_PREDICATE_KINDS.has(condition.kind)) {
      addIssue(issues, file, `${cpath}.kind`, 'enum', `condition kind must be one of ${[...BRANCH_PREDICATE_KINDS].join(', ')}`);
    }
    validateOptionalCount(condition.minCount, `${cpath}.minCount`, issues, file);
    validateOptionalCount(condition.maxCount, `${cpath}.maxCount`, issues, file);
    if (condition.maxDistance != null) requireNumber(condition.maxDistance, `${cpath}.maxDistance`, issues, file, { min: 0.001, max: 1000000 });
    if (Number.isSafeInteger(condition.minCount) && Number.isSafeInteger(condition.maxCount)
      && condition.maxCount < condition.minCount) {
      addIssue(issues, file, `${cpath}.maxCount`, 'range', 'maxCount must be >= minCount');
    }
    if (condition.kind === 'beatEntered') {
      requireId(condition.beatId, `${cpath}.beatId`, issues, file);
    } else if (condition.kind === 'actionStarted') {
      requireId(condition.actorId, `${cpath}.actorId`, issues, file);
      requireId(condition.actionId, `${cpath}.actionId`, issues, file);
      if (condition.targetActorId != null) requireId(condition.targetActorId, `${cpath}.targetActorId`, issues, file);
      if (condition.ownerActorId != null) requireId(condition.ownerActorId, `${cpath}.ownerActorId`, issues, file);
    } else if (condition.kind === 'attachmentActive') {
      requireId(condition.ownerActorId, `${cpath}.ownerActorId`, issues, file);
      requireId(condition.targetActorId, `${cpath}.targetActorId`, issues, file);
    } else if (condition.kind === 'actorDistance') {
      requireId(condition.actorId, `${cpath}.actorId`, issues, file);
      requireId(condition.targetActorId, `${cpath}.targetActorId`, issues, file);
      if (condition.maxDistance == null) addIssue(issues, file, `${cpath}.maxDistance`, 'required', 'actorDistance requires maxDistance');
    } else if (condition.kind === 'eventCount') {
      requireString(condition.eventType, `${cpath}.eventType`, issues, file);
      if (typeof condition.eventType === 'string' && !/^[a-z][a-z0-9-]*:[a-zA-Z0-9_.-]+$/.test(condition.eventType)) {
        addIssue(issues, file, `${cpath}.eventType`, 'eventType', 'eventType must use family:eventName syntax');
      }
      if (condition.actorId != null) requireId(condition.actorId, `${cpath}.actorId`, issues, file);
      if (condition.ownerActorId != null) requireId(condition.ownerActorId, `${cpath}.ownerActorId`, issues, file);
      if (condition.targetActorId != null) requireId(condition.targetActorId, `${cpath}.targetActorId`, issues, file);
      if (condition.actionId != null) requireId(condition.actionId, `${cpath}.actionId`, issues, file);
    }
  });
}

function validateScenarioRefs(ctx) {
  const { doc, actors, facts, cues, metrics, beats, branches, issues, file } = ctx;
  const beatList = Array.isArray(doc.beats) ? doc.beats : [];
  const branchList = Array.isArray(doc.branches) ? doc.branches : [];
  const metricList = Array.isArray(doc.proofMetrics) ? doc.proofMetrics : [];
  const dialogueList = Array.isArray(doc.dialogue) ? doc.dialogue : [];

  for (const id of REQUIRED_47A_BEAT_IDS) {
    if (!beats.has(id)) addIssue(issues, file, '$.beats', 'requiredBeat', `missing required 47-A beat ${id}`);
  }
  for (let i = 0; i < REQUIRED_47A_BEAT_IDS.length && i < beatList.length; i++) {
    if (beatList[i] && beatList[i].id !== REQUIRED_47A_BEAT_IDS[i]) {
      addIssue(issues, file, `$.beats[${i}].id`, 'beatOrder', `expected beat ${REQUIRED_47A_BEAT_IDS[i]} at position ${i}`);
    }
  }
  for (const id of REQUIRED_47A_BRANCH_IDS) {
    if (!branches.has(id)) addIssue(issues, file, '$.branches', 'requiredBranch', `missing required 47-A branch ${id}`);
  }

  beatList.forEach((beat, index) => {
    if (!isPlainObject(beat)) return;
    for (const actorId of beat.requiredActors || []) {
      if (!actors.has(actorId)) addIssue(issues, file, `$.beats[${index}].requiredActors`, 'actorRef', `missing actor ${actorId}`);
    }
    for (const factId of beat.worldFactRefs || []) {
      if (!facts.has(factId)) addIssue(issues, file, `$.beats[${index}].worldFactRefs`, 'factRef', `missing fact ${factId}`);
    }
    for (const cueId of beat.presentationEventIds || []) {
      if (!cues.has(cueId)) addIssue(issues, file, `$.beats[${index}].presentationEventIds`, 'cueRef', `missing presentation event ${cueId}`);
    }
    for (const metricId of beat.proofMetricIds || []) {
      if (!metrics.has(metricId)) addIssue(issues, file, `$.beats[${index}].proofMetricIds`, 'metricRef', `missing proof metric ${metricId}`);
    }
    for (const nextId of beat.next || []) {
      if (!beats.has(nextId)) addIssue(issues, file, `$.beats[${index}].next`, 'beatRef', `missing next beat ${nextId}`);
    }
    for (const branchId of beat.branchIds || []) {
      if (!branches.has(branchId)) addIssue(issues, file, `$.beats[${index}].branchIds`, 'branchRef', `missing branch ${branchId}`);
    }
  });

  branchList.forEach((branch, index) => {
    if (!isPlainObject(branch)) return;
    if (!beats.has(branch.unlockedByBeat)) addIssue(issues, file, `$.branches[${index}].unlockedByBeat`, 'beatRef', `missing beat ${branch.unlockedByBeat}`);
    for (const effect of branch.worldFactEffects || []) {
      if (effect && !facts.has(effect.factId)) addIssue(issues, file, `$.branches[${index}].worldFactEffects`, 'factRef', `missing fact ${effect.factId}`);
    }
    const conditions = branch.resolutionPredicate && Array.isArray(branch.resolutionPredicate.all) ? branch.resolutionPredicate.all : [];
    conditions.forEach((condition, conditionIndex) => {
      if (!isPlainObject(condition)) return;
      const cpath = `$.branches[${index}].resolutionPredicate.all[${conditionIndex}]`;
      if (condition.beatId != null && !beats.has(condition.beatId)) addIssue(issues, file, `${cpath}.beatId`, 'beatRef', `missing beat ${condition.beatId}`);
      for (const key of ['actorId', 'ownerActorId', 'targetActorId']) {
        if (condition[key] != null && !actors.has(condition[key])) addIssue(issues, file, `${cpath}.${key}`, 'actorRef', `missing actor ${condition[key]}`);
      }
    });
  });

  dialogueList.forEach((line, index) => {
    if (!isPlainObject(line)) return;
    if (!beats.has(line.beatId)) addIssue(issues, file, `$.dialogue[${index}].beatId`, 'beatRef', `missing beat ${line.beatId}`);
    if (!actors.has(line.speakerActorId)) addIssue(issues, file, `$.dialogue[${index}].speakerActorId`, 'actorRef', `missing actor ${line.speakerActorId}`);
    if (!cues.has(line.presentationEventId)) addIssue(issues, file, `$.dialogue[${index}].presentationEventId`, 'cueRef', `missing presentation event ${line.presentationEventId}`);
  });

  metricList.forEach((metric, index) => {
    if (!isPlainObject(metric)) return;
    for (const beatId of metric.beatIds || []) {
      if (!beats.has(beatId)) addIssue(issues, file, `$.proofMetrics[${index}].beatIds`, 'beatRef', `missing beat ${beatId}`);
    }
  });
}

function result(doc, issues) {
  return {
    schema: SCENARIO_VALIDATION_RESULT_SCHEMA,
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

function requireUniqueId(value, path, seen, issues, file) {
  requireId(value, path, issues, file);
  if (typeof value !== 'string') return;
  if (seen.has(value)) addIssue(issues, file, path, 'uniqueItems', `duplicate id ${value}`);
  seen.add(value);
}

function requireId(value, path, issues, file) {
  requireString(value, path, issues, file);
  if (typeof value === 'string' && !ID_PATTERN.test(value)) addIssue(issues, file, path, 'pattern', 'id must be lower-case dotted/kebab/snake syntax');
}

function optionalString(value, path, issues, file) {
  if (value == null) return;
  requireString(value, path, issues, file);
}

function requireString(value, path, issues, file) {
  if (typeof value !== 'string' || !value.trim()) addIssue(issues, file, path, 'type', 'must be a non-empty string');
}

function requireInteger(value, path, issues, file, options = {}) {
  if (!Number.isSafeInteger(value)) {
    addIssue(issues, file, path, 'integer', 'must be a safe integer');
    return;
  }
  if (options.min != null && value < options.min) addIssue(issues, file, path, 'minimum', `must be >= ${options.min}`);
  if (options.max != null && value > options.max) addIssue(issues, file, path, 'maximum', `must be <= ${options.max}`);
}

function requireNumber(value, path, issues, file, options = {}) {
  if (!Number.isFinite(value)) {
    addIssue(issues, file, path, 'number', 'must be a finite number');
    return;
  }
  if (options.min != null && value < options.min) addIssue(issues, file, path, 'minimum', `must be >= ${options.min}`);
  if (options.max != null && value > options.max) addIssue(issues, file, path, 'maximum', `must be <= ${options.max}`);
}

function validateOptionalCount(value, path, issues, file) {
  if (value == null) return;
  requireInteger(value, path, issues, file, { min: 0, max: 1000000 });
}

function validateStringArray(value, path, issues, file, options = {}) {
  if (value == null && options.required === false) return;
  if (!Array.isArray(value)) {
    addIssue(issues, file, path, 'type', 'must be an array of strings');
    return;
  }
  if (options.minItems != null && value.length < options.minItems) addIssue(issues, file, path, 'minItems', `must contain at least ${options.minItems} item(s)`);
  const seen = new Set();
  value.forEach((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      addIssue(issues, file, `${path}[${index}]`, 'type', 'must be a non-empty string');
      return;
    }
    if (seen.has(item)) addIssue(issues, file, `${path}[${index}]`, 'uniqueItems', `duplicate string ${item}`);
    seen.add(item);
    if (options.maxItemLength && item.length > options.maxItemLength) addIssue(issues, file, `${path}[${index}]`, 'maxLength', `must be <= ${options.maxItemLength} characters`);
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
