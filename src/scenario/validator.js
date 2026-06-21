import { CONDITION_OPERATORS } from './conditions.js';
import { validateMigrationChain } from './migrations.js';
import { collectScenarioEvents } from './runtime.js';

const PHASES = new Set(['offer', 'active', 'fail', 'abandon', 'complete', 'aftermath']);
const ACTION_TYPES = new Set([
  'setFact', 'clearFact', 'setVar', 'incrementVar', 'appendVar', 'removeVarValue',
  'bindActor', 'unbindActor', 'spawn', 'despawn', 'emit', 'consequence', 'directorBeat',
  'cue', 'discoverLore', 'recordOutcome', 'extension', 'noop',
]);
const REF_FIELDS = Object.freeze({
  actorId: 'actor', speakerActorId: 'actor',
  subsystem: 'subsystem', cueId: 'cue', stationId: 'station', factionId: 'faction',
  loreId: 'lore', localizationId: 'localization', titleLocalizationId: 'localization', sectorId: 'sector', commodityId: 'commodity',
});
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function validateScenario(definition, options = {}) {
  const errors = [];
  const warnings = [];
  const extensionIds = new Set(Object.keys(options.extensions || {}));
  const catalog = normalizeCatalog(options.catalog, definition);

  validateSerializable(definition, errors);
  if (!definition || typeof definition !== 'object') {
    return { ok: false, errors: [issue('$', 'definition_type', 'scenario definition must be an object')], warnings, graph: emptyGraph() };
  }
  requiredString(definition.id, '$.id', errors);
  requiredString(definition.entry, '$.entry', errors);
  if (!Number.isInteger(definition.schemaVersion) || definition.schemaVersion < 1) {
    errors.push(issue('$.schemaVersion', 'schema_version', 'schemaVersion must be a positive integer'));
  }
  if (!Number.isInteger(definition.contentVersion) || definition.contentVersion < 1) {
    errors.push(issue('$.contentVersion', 'content_version', 'contentVersion must be a positive integer'));
  }
  for (const message of validateMigrationChain(definition)) errors.push(issue('$.migrations', 'migration_chain', message));

  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  if (!nodes.length) errors.push(issue('$.nodes', 'nodes_empty', 'scenario requires at least one node'));
  const nodeIds = new Set();
  const outcomes = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const path = `$.nodes[${i}]`;
    if (!node || typeof node !== 'object') {
      errors.push(issue(path, 'node_type', 'node must be an object'));
      continue;
    }
    requiredString(node.id, `${path}.id`, errors);
    if (nodeIds.has(node.id)) errors.push(issue(`${path}.id`, 'duplicate_node', `duplicate node id ${node.id}`));
    nodeIds.add(node.id);
    if (!PHASES.has(node.phase)) errors.push(issue(`${path}.phase`, 'node_phase', `node phase must be one of ${[...PHASES].join(', ')}`));
    if (node.terminal && node.phase === 'active') warnings.push(issue(path, 'active_terminal', 'active-phase terminal node is unusual'));
    if (node.outcome) {
      if (outcomes.has(node.outcome)) warnings.push(issue(`${path}.outcome`, 'duplicate_outcome', `outcome ${node.outcome} is used by multiple nodes`));
      outcomes.set(node.outcome, node.id);
    }
    validateChoices(node, path, errors);
    validateObjectives(node, path, errors);
    validateTimers(node, path, errors);
    validateInterrupts(node.interrupts, `${path}.interrupts`, errors);
    validateTransitions(node.transitions, `${path}.transitions`, errors);
    validateActions(node.onEnter, `${path}.onEnter`, errors, extensionIds);
    validateActions(node.onExit, `${path}.onExit`, errors, extensionIds);
    for (let j = 0; j < (node.choices || []).length; j++) validateActions(node.choices[j].actions, `${path}.choices[${j}].actions`, errors, extensionIds);
    for (let j = 0; j < (node.objectives || []).length; j++) validateActions(node.objectives[j].actions, `${path}.objectives[${j}].actions`, errors, extensionIds);
    for (let j = 0; j < (node.timers || []).length; j++) validateActions(node.timers[j].actions, `${path}.timers[${j}].actions`, errors, extensionIds);
    for (let j = 0; j < (node.transitions || []).length; j++) validateActions(node.transitions[j].actions, `${path}.transitions[${j}].actions`, errors, extensionIds);
    for (let j = 0; j < (node.interrupts || []).length; j++) validateActions(node.interrupts[j].actions, `${path}.interrupts[${j}].actions`, errors, extensionIds);
  }

  validateInterrupts(definition.interrupts, '$.interrupts', errors);
  validateEventRules(definition.eventRules, '$.eventRules', errors, extensionIds);
  if (definition.abandonNode && !nodeIds.has(definition.abandonNode)) {
    errors.push(issue('$.abandonNode', 'missing_node_ref', `abandonNode ${definition.abandonNode} does not resolve`));
  }
  if (definition.entry && !nodeIds.has(definition.entry)) errors.push(issue('$.entry', 'missing_entry', `entry node ${definition.entry} does not resolve`));

  const graph = analyzeScenarioGraph(definition);
  for (const edge of graph.unresolvedEdges) {
    errors.push(issue(edge.path, 'missing_node_ref', `transition target ${edge.to} does not resolve`));
  }
  for (const nodeId of graph.deadNodes) errors.push(issue('$.nodes', 'dead_node', `node ${nodeId} is unreachable from ${definition.entry}`));

  for (const outcome of definition.requiredOutcomes || []) {
    if (!graph.reachableOutcomes.includes(outcome)) {
      errors.push(issue('$.requiredOutcomes', 'unreachable_outcome', `required outcome ${outcome} is not reachable`));
    }
  }
  validateBranches(definition, graph, errors);
  validateConditionsAndSymbols(definition, errors);
  validateReferences(definition, catalog, errors);
  for (let i = 0; i < ((definition.referenceManifest && definition.referenceManifest.subsystems) || []).length; i++) {
    const id = definition.referenceManifest.subsystems[i];
    if (!catalog.subsystem.has(id)) errors.push(issue(`$.referenceManifest.subsystems[${i}]`, 'unresolved_reference', `subsystem reference ${id} does not resolve`));
  }

  const eventNames = collectScenarioEvents(definition);
  if (!eventNames.length) warnings.push(issue('$', 'no_events', 'scenario declares no objective, interrupt, or event-rule events'));
  if (!(definition.nodes || []).some((node) => node.phase === 'offer')) errors.push(issue('$.nodes', 'lifecycle_offer', 'scenario has no offer phase'));
  if (!(definition.nodes || []).some((node) => node.phase === 'active')) errors.push(issue('$.nodes', 'lifecycle_active', 'scenario has no active phase'));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    graph: { ...graph, events: eventNames },
  };
}

export function analyzeScenarioGraph(definition) {
  const nodes = Array.isArray(definition && definition.nodes) ? definition.nodes : [];
  const nodeMap = new Map(nodes.filter(Boolean).map((node) => [node.id, node]));
  const edges = new Map([...nodeMap.keys()].map((id) => [id, []]));
  const unresolvedEdges = [];

  function add(from, to, kind, path) {
    if (!to) return;
    const edge = { from, to, kind, path };
    if (!nodeMap.has(to)) unresolvedEdges.push(edge);
    else if (edges.has(from)) edges.get(from).push(edge);
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || !node.id) continue;
    for (let j = 0; j < (node.choices || []).length; j++) add(node.id, node.choices[j].to, 'choice', `$.nodes[${i}].choices[${j}].to`);
    for (let j = 0; j < (node.transitions || []).length; j++) add(node.id, node.transitions[j].to, 'transition', `$.nodes[${i}].transitions[${j}].to`);
    for (let j = 0; j < (node.objectives || []).length; j++) add(node.id, node.objectives[j].to, 'objective', `$.nodes[${i}].objectives[${j}].to`);
    for (let j = 0; j < (node.timers || []).length; j++) add(node.id, node.timers[j].to, 'timer', `$.nodes[${i}].timers[${j}].to`);
    for (let j = 0; j < (node.interrupts || []).length; j++) add(node.id, node.interrupts[j].to, 'interrupt', `$.nodes[${i}].interrupts[${j}].to`);
  }

  // Global interrupts and explicit abandon are possible from every nonterminal node.
  for (const [nodeId, node] of nodeMap) {
    if (node.terminal) continue;
    for (let j = 0; j < (definition.interrupts || []).length; j++) {
      add(nodeId, definition.interrupts[j].to, 'global-interrupt', `$.interrupts[${j}].to`);
    }
    if (definition.abandonNode) add(nodeId, definition.abandonNode, 'abandon', '$.abandonNode');
  }

  const reachable = reachableFrom(definition.entry, edges);
  const deadNodes = [...nodeMap.keys()].filter((id) => !reachable.has(id)).sort();
  const reachableOutcomes = [...reachable]
    .map((id) => nodeMap.get(id))
    .filter((node) => node && node.outcome)
    .map((node) => node.outcome)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort();
  const cycles = stronglyConnectedComponents(edges)
    .filter((component) => component.length > 1 || hasSelfLoop(component[0], edges));

  return {
    nodeCount: nodeMap.size,
    edgeCount: [...edges.values()].reduce((sum, list) => sum + list.length, 0),
    edges: Object.fromEntries([...edges].map(([id, list]) => [id, list.map((edge) => ({ to: edge.to, kind: edge.kind }))])),
    reachableNodes: [...reachable].sort(),
    deadNodes,
    unresolvedEdges,
    reachableOutcomes,
    cycles,
  };
}

function validateChoices(node, path, errors) {
  const seen = new Set();
  for (let i = 0; i < (node.choices || []).length; i++) {
    const choice = node.choices[i];
    const cpath = `${path}.choices[${i}]`;
    requiredString(choice && choice.id, `${cpath}.id`, errors);
    requiredString(choice && choice.to, `${cpath}.to`, errors);
    if (choice && seen.has(choice.id)) errors.push(issue(`${cpath}.id`, 'duplicate_choice', `duplicate choice id ${choice.id} in node ${node.id}`));
    if (choice) seen.add(choice.id);
    validateCondition(choice && choice.when, `${cpath}.when`, errors);
  }
}

function validateObjectives(node, path, errors) {
  const seen = new Set();
  for (let i = 0; i < (node.objectives || []).length; i++) {
    const objective = node.objectives[i];
    const opath = `${path}.objectives[${i}]`;
    requiredString(objective && objective.id, `${opath}.id`, errors);
    requiredString(objective && objective.event, `${opath}.event`, errors);
    if (objective && seen.has(objective.id)) errors.push(issue(`${opath}.id`, 'duplicate_objective', `duplicate objective id ${objective.id}`));
    if (objective) seen.add(objective.id);
    if (objective && objective.target != null && (!(Number.isFinite(objective.target)) || objective.target <= 0)) {
      errors.push(issue(`${opath}.target`, 'objective_target', 'objective target must be finite and > 0'));
    }
    validateCondition(objective && objective.where, `${opath}.where`, errors);
  }
}

function validateTimers(node, path, errors) {
  const seen = new Set();
  for (let i = 0; i < (node.timers || []).length; i++) {
    const timer = node.timers[i];
    const tpath = `${path}.timers[${i}]`;
    requiredString(timer && timer.id, `${tpath}.id`, errors);
    if (timer && seen.has(timer.id)) errors.push(issue(`${tpath}.id`, 'duplicate_timer', `duplicate timer id ${timer.id}`));
    if (timer) seen.add(timer.id);
    if (!timer || !(Number.isFinite(timer.durationS) && timer.durationS > 0)) {
      errors.push(issue(`${tpath}.durationS`, 'timer_duration', 'timer durationS must be finite and > 0'));
    }
  }
}

function validateTransitions(transitions, path, errors) {
  for (let i = 0; i < (transitions || []).length; i++) {
    const transition = transitions[i];
    requiredString(transition && transition.to, `${path}[${i}].to`, errors);
    validateCondition(transition && transition.when, `${path}[${i}].when`, errors);
  }
}

function validateInterrupts(interrupts, path, errors) {
  const seen = new Set();
  for (let i = 0; i < (interrupts || []).length; i++) {
    const interrupt = interrupts[i];
    const ipath = `${path}[${i}]`;
    requiredString(interrupt && interrupt.id, `${ipath}.id`, errors);
    requiredString(interrupt && interrupt.event, `${ipath}.event`, errors);
    requiredString(interrupt && interrupt.to, `${ipath}.to`, errors);
    if (interrupt && seen.has(interrupt.id)) errors.push(issue(`${ipath}.id`, 'duplicate_interrupt', `duplicate interrupt id ${interrupt.id}`));
    if (interrupt) seen.add(interrupt.id);
    validateCondition(interrupt && interrupt.when, `${ipath}.when`, errors);
  }
}

function validateEventRules(rules, path, errors, extensionIds) {
  const seen = new Set();
  for (let i = 0; i < (rules || []).length; i++) {
    const rule = rules[i];
    const rpath = `${path}[${i}]`;
    requiredString(rule && rule.id, `${rpath}.id`, errors);
    requiredString(rule && rule.event, `${rpath}.event`, errors);
    if (rule && seen.has(rule.id)) errors.push(issue(`${rpath}.id`, 'duplicate_event_rule', `duplicate event rule id ${rule.id}`));
    if (rule) seen.add(rule.id);
    validateCondition(rule && rule.when, `${rpath}.when`, errors);
    validateActions(rule && rule.actions, `${rpath}.actions`, errors, extensionIds);
  }
}

function validateActions(actions, path, errors, extensionIds) {
  for (let i = 0; i < (actions || []).length; i++) {
    const action = actions[i];
    const apath = `${path}[${i}]`;
    if (!action || typeof action !== 'object') {
      errors.push(issue(apath, 'action_type', 'action must be an object'));
      continue;
    }
    if (!ACTION_TYPES.has(action.type)) errors.push(issue(`${apath}.type`, 'action_unknown', `unsupported action type ${action.type || '<missing>'}`));
    if (action.type === 'extension' && !extensionIds.has(action.extensionId)) {
      errors.push(issue(`${apath}.extensionId`, 'extension_unregistered', `extension ${action.extensionId || '<missing>'} is not registered`));
    }
  }
}

function validateCondition(condition, path, errors) {
  if (condition == null || typeof condition === 'boolean') return;
  if (Array.isArray(condition)) {
    condition.forEach((child, i) => validateCondition(child, `${path}[${i}]`, errors));
    return;
  }
  if (!condition || typeof condition !== 'object') {
    errors.push(issue(path, 'condition_type', 'condition must be boolean, array, or object'));
    return;
  }
  if (condition.all != null) {
    if (!Array.isArray(condition.all)) errors.push(issue(`${path}.all`, 'condition_all', 'all must be an array'));
    else condition.all.forEach((child, i) => validateCondition(child, `${path}.all[${i}]`, errors));
    return;
  }
  if (condition.any != null) {
    if (!Array.isArray(condition.any)) errors.push(issue(`${path}.any`, 'condition_any', 'any must be an array'));
    else condition.any.forEach((child, i) => validateCondition(child, `${path}.any[${i}]`, errors));
    return;
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'not')) {
    validateCondition(condition.not, `${path}.not`, errors);
    return;
  }
  const sources = ['fact', 'var', 'state', 'payload', 'actor', 'literal'].filter((key) => Object.prototype.hasOwnProperty.call(condition, key));
  if (sources.length !== 1) errors.push(issue(path, 'condition_source', 'condition leaf requires exactly one source'));
  if (condition.op && !CONDITION_OPERATORS.includes(condition.op)) errors.push(issue(`${path}.op`, 'condition_operator', `unsupported condition operator ${condition.op}`));
}

function validateConditionsAndSymbols(definition, errors) {
  const facts = new Set(Object.keys(definition.facts || {}));
  const variables = new Set(Object.keys(definition.variables || {}));
  walk(definition, '$', (value, key, path, parent) => {
    if ((key === 'fact' || key === '$fact' || key === 'completeFact') && typeof value === 'string' && !facts.has(value)) {
      errors.push(issue(path, 'undeclared_fact', `fact ${value} is not declared`));
    }
    if ((key === 'var' || key === '$var') && typeof value === 'string' && !variables.has(value)) {
      errors.push(issue(path, 'undeclared_variable', `variable ${value} is not declared`));
    }
    if (key === 'valueFrom' && value && typeof value === 'object') {
      if (typeof value.fact === 'string' && !facts.has(value.fact)) errors.push(issue(`${path}.fact`, 'undeclared_fact', `fact ${value.fact} is not declared`));
      if (typeof value.var === 'string' && !variables.has(value.var)) errors.push(issue(`${path}.var`, 'undeclared_variable', `variable ${value.var} is not declared`));
    }
    if (parent && parent.type === 'setFact' && key === 'fact' && !facts.has(value)) errors.push(issue(path, 'undeclared_fact', `fact ${value} is not declared`));
    if (parent && ['setVar', 'incrementVar', 'appendVar', 'removeVarValue'].includes(parent.type) && key === 'var' && !variables.has(value)) {
      errors.push(issue(path, 'undeclared_variable', `variable ${value} is not declared`));
    }
  });
}

function validateReferences(definition, catalog, errors) {
  walk(definition, '$', (value, key, path) => {
    const kind = REF_FIELDS[key];
    if (kind && typeof value === 'string' && !catalog[kind].has(value)) {
      errors.push(issue(path, 'unresolved_reference', `${kind} reference ${value} does not resolve`));
    }
    if (key === 'loreIds' && Array.isArray(value)) {
      value.forEach((id, i) => { if (!catalog.lore.has(id)) errors.push(issue(`${path}[${i}]`, 'unresolved_reference', `lore reference ${id} does not resolve`)); });
    }
  });
}

function validateBranches(definition, graph, errors) {
  const nodeMap = new Map((definition.nodes || []).map((node) => [node.id, node]));
  const edges = new Map(Object.entries(graph.edges).map(([id, list]) => [id, list.map((edge) => ({ to: edge.to }))]));
  const seen = new Set();
  for (let i = 0; i < (definition.branches || []).length; i++) {
    const branch = definition.branches[i];
    const path = `$.branches[${i}]`;
    requiredString(branch && branch.id, `${path}.id`, errors);
    requiredString(branch && branch.entry, `${path}.entry`, errors);
    if (branch && seen.has(branch.id)) errors.push(issue(`${path}.id`, 'duplicate_branch', `duplicate branch id ${branch.id}`));
    if (branch) seen.add(branch.id);
    if (!branch || !nodeMap.has(branch.entry)) {
      errors.push(issue(`${path}.entry`, 'branch_entry', `branch entry ${branch && branch.entry} does not resolve`));
      continue;
    }
    const reachable = reachableFrom(branch.entry, edges);
    const phases = new Set([...reachable].map((id) => nodeMap.get(id)).filter(Boolean).map((node) => node.phase));
    for (const phase of branch.requiredPhases || []) {
      if (!phases.has(phase)) errors.push(issue(`${path}.requiredPhases`, 'branch_phase', `branch ${branch.id} cannot reach required phase ${phase}`));
    }
    for (const outcome of branch.requiredOutcomes || []) {
      const canReach = [...reachable].some((id) => nodeMap.get(id) && nodeMap.get(id).outcome === outcome);
      if (!canReach) errors.push(issue(`${path}.requiredOutcomes`, 'branch_outcome', `branch ${branch.id} cannot reach outcome ${outcome}`));
    }
  }
}

function normalizeCatalog(input, definition) {
  const catalog = {};
  for (const kind of ['actor', 'subsystem', 'cue', 'station', 'faction', 'lore', 'localization', 'sector', 'commodity']) {
    const value = input && input[kind];
    catalog[kind] = value instanceof Set ? new Set(value) : new Set(Array.isArray(value) ? value : []);
  }
  for (const id of Object.keys(definition.actors || {})) catalog.actor.add(id);
  const manifest = definition.referenceManifest || {};
  addAll(catalog.cue, manifest.cues);
  addAll(catalog.lore, manifest.lore);
  addAll(catalog.localization, manifest.localization);
  return catalog;
}

function validateSerializable(value, errors) {
  const seen = new WeakSet();
  function visit(item, path) {
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint' || item === undefined) {
      errors.push(issue(path, 'non_data_value', `scenario content must be JSON-compatible data, found ${typeof item}`));
      return;
    }
    if (typeof item === 'number' && !Number.isFinite(item)) {
      errors.push(issue(path, 'non_finite_number', 'scenario numbers must be finite'));
      return;
    }
    if (!item || typeof item !== 'object') return;
    if (seen.has(item)) { errors.push(issue(path, 'cyclic_data', 'scenario content must not contain cycles')); return; }
    seen.add(item);
    const proto = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) {
      errors.push(issue(path, 'non_plain_object', 'scenario content must use plain objects and arrays'));
    }
    for (const [key, child] of Object.entries(item)) {
      if (UNSAFE_KEYS.has(key)) errors.push(issue(`${path}.${key}`, 'unsafe_key', `unsafe object key ${key}`));
      visit(child, Array.isArray(item) ? `${path}[${key}]` : `${path}.${key}`);
    }
    seen.delete(item);
  }
  visit(value, '$');
}

function reachableFrom(entry, edges) {
  const visited = new Set();
  if (!entry || !edges.has(entry)) return visited;
  const queue = [entry];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of edges.get(id) || []) if (!visited.has(edge.to)) queue.push(edge.to);
  }
  return visited;
}

function stronglyConnectedComponents(edges) {
  let index = 0;
  const indices = new Map(), low = new Map(), stack = [], onStack = new Set(), components = [];
  function strongConnect(v) {
    indices.set(v, index); low.set(v, index); index++;
    stack.push(v); onStack.add(v);
    for (const edge of edges.get(v) || []) {
      const w = edge.to;
      if (!indices.has(w)) { strongConnect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), indices.get(w)));
    }
    if (low.get(v) === indices.get(v)) {
      const component = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); component.push(w); } while (w !== v);
      components.push(component.sort());
    }
  }
  for (const v of edges.keys()) if (!indices.has(v)) strongConnect(v);
  return components;
}

function hasSelfLoop(id, edges) { return (edges.get(id) || []).some((edge) => edge.to === id); }
function addAll(set, values) { for (const value of values || []) set.add(value); }
function requiredString(value, path, errors) { if (typeof value !== 'string' || !value) errors.push(issue(path, 'required_string', 'non-empty string required')); }
function issue(path, code, message) { return { path, code, message }; }
function emptyGraph() { return { nodeCount: 0, edgeCount: 0, edges: {}, reachableNodes: [], deadNodes: [], unresolvedEdges: [], reachableOutcomes: [], cycles: [], events: [] }; }

function walk(value, path, visitor, parent = null) {
  if (Array.isArray(value)) {
    value.forEach((child, i) => { visitor(child, String(i), `${path}[${i}]`, value); walk(child, `${path}[${i}]`, visitor, value); });
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      visitor(child, key, childPath, value);
      walk(child, childPath, visitor, value);
    }
  }
}
