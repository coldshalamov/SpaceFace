// Pure assertion-consumption guard (Node + browser safe — no node: imports).
// H11/M3/M4: every declared assertion must produce exactly one oracle family result.
// Metrics measure; assertions bind pass/fail contracts.

/**
 * @param {object[]} assertions
 * @param {object[]} oracleResults
 * @param {{ metrics?: object[] }} [options]
 * @returns {{
 *   ok: boolean,
 *   expected: number,
 *   actual: number,
 *   reason: string|null,
 *   unconsumed: object[],
 *   consumedIds: (string|number)[],
 * }}
 */
export function assertAssertionsConsumed(assertions, oracleResults, options = {}) {
  const declared = Array.isArray(assertions) ? assertions : [];
  // M3: metrics measure but do not certify — at least one assertion is required.
  // Automatic finite/resource invariants alone must not certify a feature.
  if (declared.length === 0) {
    return {
      ok: false,
      expected: 1,
      actual: 0,
      reason: 'no assertion declared — metrics measure but do not certify',
      unconsumed: [],
      consumedIds: [],
    };
  }
  void options; // metrics no longer waive the assertion requirement
  const results = Array.isArray(oracleResults) ? oracleResults : [];
  const unconsumed = [];
  const consumedIds = [];

  for (let i = 0; i < declared.length; i++) {
    const a = declared[i];
    const matches = results.filter((r) => resultMatchesAssertion(r, a));
    if (matches.length !== 1) {
      unconsumed.push({
        index: i,
        kind: a && a.kind,
        metric: a && a.metric,
        matchCount: matches.length,
      });
    } else {
      consumedIds.push(matches[0].id || a.kind || i);
    }
  }

  if (unconsumed.length) {
    return {
      ok: false,
      expected: declared.length,
      actual: declared.length - unconsumed.length,
      reason: `${unconsumed.length} assertion(s) not consumed exactly once`,
      unconsumed,
      consumedIds,
    };
  }
  return {
    ok: true,
    expected: declared.length,
    actual: declared.length,
    reason: null,
    unconsumed: [],
    consumedIds,
  };
}

function resultMatchesAssertion(result, assertion) {
  if (!result || !assertion) return false;
  const kind = assertion.kind;
  if (kind === 'metric' || kind === 'quantitative') {
    if (!assertion.metric) return false;
    const metricKey = assertion.metric.includes('@') ? assertion.metric : `${assertion.metric}@1`;
    // H11: only match assertion-sourced results, not declared metric emissions (same id, 2×).
    if (result.source === 'metric') return false;
    return result.family === 'quantitative'
      && (result.source === 'assertion' || result.source == null)
      && (result.id === metricKey
        || result.id === assertion.metric
        || (typeof result.id === 'string' && result.id.startsWith(assertion.metric)));
  }
  if (kind === 'equivalence') {
    const name = assertion.equivalence || assertion.expected || assertion.signal || 'run-eq-repeat';
    return result.family === 'equivalence' && (result.id === name || result.id === assertion.equivalence);
  }
  if (kind === 'never' || kind === 'holds' || kind === 'settles' || kind === 'eventByTick' || kind === 'temporal') {
    // Oracle emits ids like `never:${signal}`, `holds:${signal}`, `eventByTick:${signal}`,
    // or bare `settles` (see oracleEngine evaluateTemporal).
    if (result.family !== 'temporal') return false;
    const signal = assertion.signal || assertion.never || assertion.event;
    if (result.id === kind) return true;
    if (signal && result.id === signal) return true;
    if (signal && result.id === `${kind}:${signal}`) return true;
    if (kind === 'never' && signal && result.id === `never:${signal}`) return true;
    if (kind === 'temporal' && assertion.signal === 'settles' && result.id === 'settles') return true;
    return false;
  }
  return result.id === kind;
}
