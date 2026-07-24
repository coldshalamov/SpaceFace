// Stable name+version metric registration. Thresholds are authored independently of candidate runs.

const METRICS = new Map();

/**
 * @param {string} name
 * @param {number|string} version
 * @param {{
 *   compute: (trace: object[], params?: object, ctx?: object) => number|object,
 *   description?: string,
 * }} def
 */
export function registerMetric(name, version, def) {
  if (!name || typeof name !== 'string') throw new Error('metric name required');
  if (!def || typeof def.compute !== 'function') throw new Error(`metric ${name}: compute required`);
  const key = metricKey(name, version);
  METRICS.set(key, {
    name,
    version,
    compute: def.compute,
    description: def.description || '',
  });
  return key;
}

export function metricKey(name, version = 1) {
  return `${name}@${version}`;
}

export function getMetric(name, version = 1) {
  return METRICS.get(metricKey(name, version)) || null;
}

export function listMetrics() {
  return [...METRICS.values()].map((m) => ({ name: m.name, version: m.version, description: m.description }));
}

/**
 * Evaluate registered metrics for a scenario. Thresholds come from the scenario, never from the candidate.
 * @param {object[]} metricSpecs compiled metrics with optional threshold
 * @param {object[]} trace
 * @param {object} [ctx]
 */
export function evaluateMetrics(metricSpecs, trace, ctx = {}) {
  const results = [];
  for (const spec of metricSpecs || []) {
    const def = getMetric(spec.name, spec.version ?? 1);
    if (!def) {
      results.push({
        name: spec.name,
        version: spec.version ?? 1,
        ok: false,
        error: `unknown metric ${spec.name}@${spec.version ?? 1}`,
        value: null,
        threshold: spec.threshold,
      });
      continue;
    }
    const value = def.compute(trace, spec.params || {}, ctx);
    const threshold = spec.threshold;
    let ok = true;
    let delta = null;
    if (threshold != null) {
      const cmp = compareThreshold(value, threshold);
      ok = cmp.ok;
      delta = cmp.delta;
    }
    results.push({
      name: spec.name,
      version: spec.version ?? 1,
      ok,
      value,
      threshold,
      delta,
      signedDelta: delta,
    });
  }
  return results;
}

/**
 * Threshold shapes:
 *   { op: '<=', value: N }
 *   { op: '>=', value: N }
 *   { op: '==', value: N, epsilon?: n }
 *   { op: 'range', min, max }
 *   { max: N }  // shorthand <=
 *   { min: N }  // shorthand >=
 */
export function compareThreshold(value, threshold) {
  if (threshold == null) return { ok: true, delta: 0 };
  const num = typeof value === 'number' ? value : Number(value && value.value);
  if (!Number.isFinite(num)) {
    return { ok: false, delta: null };
  }

  if (typeof threshold === 'number') {
    const delta = num - threshold;
    return { ok: Math.abs(delta) < 1e-9, delta };
  }

  if (threshold.op === '<=' || threshold.max != null && threshold.op == null && threshold.min == null && threshold.value == null) {
    const bound = threshold.op === '<=' ? threshold.value : threshold.max;
    const delta = num - bound;
    return { ok: num <= bound, delta };
  }
  if (threshold.op === '>=' || (threshold.min != null && threshold.op == null && threshold.max == null && threshold.value == null)) {
    const bound = threshold.op === '>=' ? threshold.value : threshold.min;
    const delta = num - bound;
    return { ok: num >= bound, delta };
  }
  if (threshold.op === '==' || threshold.op === 'eq') {
    const eps = Number.isFinite(threshold.epsilon) ? threshold.epsilon : 1e-6;
    const delta = num - threshold.value;
    return { ok: Math.abs(delta) <= eps, delta };
  }
  if (threshold.op === 'range' || (threshold.min != null && threshold.max != null)) {
    const lo = threshold.min;
    const hi = threshold.max;
    const ok = num >= lo && num <= hi;
    const delta = num < lo ? num - lo : (num > hi ? num - hi : 0);
    return { ok, delta };
  }
  if (threshold.op === '<' ) {
    const delta = num - threshold.value;
    return { ok: num < threshold.value, delta };
  }
  if (threshold.op === '>' ) {
    const delta = num - threshold.value;
    return { ok: num > threshold.value, delta };
  }
  // Default: treat as max bound
  if (Number.isFinite(threshold.value)) {
    const delta = num - threshold.value;
    return { ok: num <= threshold.value, delta };
  }
  return { ok: true, delta: 0 };
}
