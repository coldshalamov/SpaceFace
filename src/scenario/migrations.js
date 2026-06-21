// Data-only migrations for saved scenario snapshots. Ordinary content migrations cannot execute code.

export const SCENARIO_RUNTIME_VERSION = 1;

export function migrateScenarioSnapshot(definition, input) {
  const snapshot = cloneJson(input);
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Scenario snapshot must be an object');
  if (snapshot.scenarioId !== definition.id) {
    throw new Error(`Snapshot scenario ${snapshot.scenarioId || '<missing>'} does not match ${definition.id}`);
  }
  const target = positiveVersion(definition.contentVersion, 1);
  let version = positiveVersion(snapshot.contentVersion, 1);
  if (version > target) throw new Error(`Scenario ${definition.id} snapshot v${version} is newer than content v${target}`);
  const migrations = Array.isArray(definition.migrations) ? definition.migrations : [];
  let guard = 0;
  while (version < target && guard++ < 128) {
    const step = migrations.find((item) => item && item.from === version);
    if (!step || step.to !== version + 1) {
      throw new Error(`Scenario ${definition.id} has no contiguous migration ${version}→${version + 1}`);
    }
    for (const op of step.ops || []) applyMigrationOperation(snapshot, op);
    version = step.to;
    snapshot.contentVersion = version;
  }
  if (version !== target) throw new Error(`Scenario ${definition.id} migration did not reach v${target}`);
  snapshot.runtimeVersion = SCENARIO_RUNTIME_VERSION;
  return snapshot;
}

export function applyMigrationOperation(snapshot, op) {
  if (!op || typeof op !== 'object') throw new TypeError('Scenario migration operation must be an object');
  const instance = snapshot.instance || (snapshot.instance = {});
  const facts = snapshot.facts || (snapshot.facts = {});
  const variables = instance.variables || (instance.variables = {});
  const actors = instance.actors || (instance.actors = {});

  switch (op.type) {
    case 'renameFact':
      renameOwn(facts, op.from, op.to);
      break;
    case 'renameVar':
      renameOwn(variables, op.from, op.to);
      break;
    case 'renameActor':
      renameOwn(actors, op.from, op.to);
      break;
    case 'deleteFact':
      delete facts[op.id];
      break;
    case 'deleteVar':
      delete variables[op.id];
      break;
    case 'setFactDefault':
      if (!Object.prototype.hasOwnProperty.call(facts, op.id)) facts[op.id] = cloneJson(op.value);
      break;
    case 'setVarDefault':
      if (!Object.prototype.hasOwnProperty.call(variables, op.id)) variables[op.id] = cloneJson(op.value);
      break;
    case 'mapNode':
      if (instance.nodeId === op.from) instance.nodeId = op.to;
      for (const entry of instance.history || []) {
        if (entry && entry.nodeId === op.from) entry.nodeId = op.to;
      }
      break;
    case 'mapOutcome':
      if (instance.outcome === op.from) instance.outcome = op.to;
      break;
    case 'renameObjective':
      renameOwn(instance.objectives || {}, op.from, op.to);
      break;
    case 'renameTimer':
      renameOwn(instance.timers || {}, op.from, op.to);
      break;
    default:
      throw new Error(`Unsupported scenario migration operation: ${op.type || '<missing>'}`);
  }
}

export function validateMigrationChain(definition) {
  const errors = [];
  const target = positiveVersion(definition && definition.contentVersion, 1);
  const steps = Array.isArray(definition && definition.migrations) ? definition.migrations : [];
  const seen = new Set();
  for (const step of steps) {
    if (!step || !Number.isInteger(step.from) || !Number.isInteger(step.to)) {
      errors.push('migration steps require integer from/to versions');
      continue;
    }
    if (step.to !== step.from + 1) errors.push(`migration ${step.from}→${step.to} is not contiguous`);
    if (seen.has(step.from)) errors.push(`duplicate migration from version ${step.from}`);
    seen.add(step.from);
    if (!Array.isArray(step.ops)) errors.push(`migration ${step.from}→${step.to} requires ops[]`);
  }
  if (target > 1) {
    for (let version = 1; version < target; version++) {
      if (!seen.has(version)) errors.push(`missing migration ${version}→${version + 1}`);
    }
  }
  return errors;
}

function renameOwn(object, from, to) {
  if (!from || !to) throw new Error('rename migration requires from and to');
  if (!Object.prototype.hasOwnProperty.call(object, from)) return;
  if (!Object.prototype.hasOwnProperty.call(object, to)) object[to] = object[from];
  delete object[from];
}

function positiveVersion(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
