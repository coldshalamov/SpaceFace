// Declarative condition evaluator for scenario data. No eval, Function, DOM, or engine imports.

const BLOCKED = Object.freeze({ valid: false, blockers: [] });
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function readPath(root, path, fallback) {
  if (path == null || path === '') return root === undefined ? fallback : root;
  const parts = Array.isArray(path) ? path : String(path).split('.');
  let value = root;
  for (const key of parts) {
    if (!key || UNSAFE_KEYS.has(key) || value == null) return fallback;
    value = value[key];
  }
  return value === undefined ? fallback : value;
}

export function evaluateCondition(condition, context = {}) {
  return explainCondition(condition, context).valid;
}

export function explainCondition(condition, context = {}) {
  return explain(condition, context, '$');
}

function explain(condition, context, path) {
  if (condition == null || condition === true) return { valid: true, blockers: [] };
  if (condition === false) return blocker(path, 'always_false', false, true, 'condition is explicitly false');
  if (Array.isArray(condition)) return explainAll(condition, context, path);
  if (!isPlainObject(condition)) {
    return blocker(path, 'invalid_condition', condition, 'condition object', 'condition must be declarative data');
  }

  if (Array.isArray(condition.all)) return explainAll(condition.all, context, `${path}.all`);
  if (Array.isArray(condition.any)) return explainAny(condition.any, context, `${path}.any`);
  if (Object.prototype.hasOwnProperty.call(condition, 'not')) {
    const child = explain(condition.not, context, `${path}.not`);
    return child.valid
      ? blocker(path, 'not_failed', true, false, 'negated condition currently passes')
      : { valid: true, blockers: [] };
  }

  const source = readSource(condition, context);
  if (!source.found) {
    return blocker(path, 'invalid_source', undefined, undefined, 'condition has no supported value source');
  }
  const expected = Object.prototype.hasOwnProperty.call(condition, 'valueFrom')
    ? readOperand(condition.valueFrom, context)
    : condition.value;
  const op = condition.op || (Object.prototype.hasOwnProperty.call(condition, 'value') || condition.valueFrom ? 'eq' : 'truthy');
  const valid = compare(source.value, op, expected);
  if (valid) return { valid: true, blockers: [] };

  const label = source.label || 'value';
  return blocker(
    path,
    `condition_${op}`,
    cloneDiagnostic(source.value),
    cloneDiagnostic(expected),
    `${label} must satisfy ${describeOp(op, expected)}`,
  );
}

function explainAll(items, context, path) {
  const blockers = [];
  for (let i = 0; i < items.length; i++) {
    const result = explain(items[i], context, `${path}[${i}]`);
    if (!result.valid) blockers.push(...result.blockers);
  }
  return blockers.length ? { valid: false, blockers } : { valid: true, blockers: [] };
}

function explainAny(items, context, path) {
  if (!items.length) return blocker(path, 'empty_any', [], 'at least one branch', 'any-group has no branches');
  const branchBlockers = [];
  for (let i = 0; i < items.length; i++) {
    const result = explain(items[i], context, `${path}[${i}]`);
    if (result.valid) return { valid: true, blockers: [] };
    branchBlockers.push({ branch: i, blockers: result.blockers });
  }
  return {
    valid: false,
    blockers: [{ path, code: 'no_any_branch', message: 'at least one alternative must pass', alternatives: branchBlockers }],
  };
}

function readSource(spec, context) {
  if (typeof spec.fact === 'string') {
    const facts = context.facts || {};
    const value = Object.prototype.hasOwnProperty.call(facts, spec.fact) ? facts[spec.fact] : readPath(facts, spec.fact);
    return { found: true, value, label: `fact ${spec.fact}` };
  }
  if (typeof spec.var === 'string') {
    const variables = context.variables || {};
    const value = Object.prototype.hasOwnProperty.call(variables, spec.var) ? variables[spec.var] : readPath(variables, spec.var);
    return { found: true, value, label: `variable ${spec.var}` };
  }
  if (typeof spec.state === 'string') {
    const value = typeof context.readState === 'function'
      ? context.readState(spec.state)
      : readPath(context.state || {}, spec.state);
    return { found: true, value, label: `state ${spec.state}` };
  }
  if (typeof spec.payload === 'string' || spec.payload === '') {
    const key = spec.payload || '';
    return { found: true, value: readPath(context.payload, key), label: `event payload ${key || '<root>'}` };
  }
  if (typeof spec.actor === 'string') {
    const actor = readPath(context.actors || {}, spec.actor);
    const value = spec.field ? readPath(actor, spec.field) : actor;
    return { found: true, value, label: `actor ${spec.actor}${spec.field ? `.${spec.field}` : ''}` };
  }
  if (Object.prototype.hasOwnProperty.call(spec, 'literal')) {
    return { found: true, value: spec.literal, label: 'literal' };
  }
  return { found: false, value: undefined, label: '' };
}

function readOperand(spec, context) {
  if (!isPlainObject(spec)) return spec;
  const source = readSource(spec, context);
  return source.found ? source.value : undefined;
}

function compare(actual, op, expected) {
  switch (op) {
    case 'truthy': return !!actual;
    case 'falsy': return !actual;
    case 'exists': return actual !== undefined && actual !== null;
    case 'notExists': return actual === undefined || actual === null;
    case 'eq': return deepEqual(actual, expected);
    case 'ne': return !deepEqual(actual, expected);
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'lt': return actual < expected;
    case 'lte': return actual <= expected;
    case 'in': return Array.isArray(expected) && expected.some((item) => deepEqual(item, actual));
    case 'notIn': return Array.isArray(expected) && !expected.some((item) => deepEqual(item, actual));
    case 'contains':
      return typeof actual === 'string'
        ? actual.includes(String(expected))
        : Array.isArray(actual) && actual.some((item) => deepEqual(item, expected));
    case 'startsWith': return typeof actual === 'string' && actual.startsWith(String(expected));
    case 'endsWith': return typeof actual === 'string' && actual.endsWith(String(expected));
    default: return false;
  }
}

function describeOp(op, expected) {
  const exp = diagnosticString(expected);
  switch (op) {
    case 'truthy': return 'be truthy';
    case 'falsy': return 'be falsy';
    case 'exists': return 'exist';
    case 'notExists': return 'not exist';
    case 'eq': return `equal ${exp}`;
    case 'ne': return `not equal ${exp}`;
    case 'gt': return `be greater than ${exp}`;
    case 'gte': return `be at least ${exp}`;
    case 'lt': return `be less than ${exp}`;
    case 'lte': return `be at most ${exp}`;
    case 'in': return `be in ${exp}`;
    case 'notIn': return `not be in ${exp}`;
    case 'contains': return `contain ${exp}`;
    case 'startsWith': return `start with ${exp}`;
    case 'endsWith': return `end with ${exp}`;
    default: return `satisfy operator ${op}`;
  }
}

function blocker(path, code, actual, expected, message) {
  return { valid: false, blockers: [{ path, code, message, actual, expected }] };
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i] || !deepEqual(a[ak[i]], b[bk[i]])) return false;
  }
  return true;
}

function cloneDiagnostic(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return String(value); }
}

function diagnosticString(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export const CONDITION_OPERATORS = Object.freeze([
  'truthy', 'falsy', 'exists', 'notExists', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
  'in', 'notIn', 'contains', 'startsWith', 'endsWith',
]);
