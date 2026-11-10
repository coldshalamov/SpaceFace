/**
 * Read-only diagnostics over EXISTING proofSixtySeconds output. This module cannot
 * certify gameplay, execute a simulation, or promote an imported report's provenance.
 */
export const B12_POLICY = Object.freeze({
  scenarioId: 'proof.sixty_seconds',
  seeds: Object.freeze([47, 4242, 8008, 1337, 2026]),
  required: 9,
  hardCapS: 90,
  beats: Object.freeze([
    'op_working', 'hauler_leaves', 'pirates_intercept', 'shove_spins_one',
    'rope_projectile', 'collateral', 'cargo_spills', 'hauler_flees',
    'patrol_arrives', 'grab_pod', 'run_wanted',
  ]),
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Non-promoting: PASS means the supplied data meets the receipt contract, not that it is authentic. */
export function auditB12Report(report) {
  const policy = B12_POLICY;
  const errors = [], misses = [], seedReports = [];
  const problem = (path, message) => errors.push({ path, message });
  if (!object(report) || !Array.isArray(report.runs)) {
    problem('runs', 'A complete suite, not a single-run or empty report, is required.');
    return finish();
  }
  if (report.scenarioId !== policy.scenarioId) problem('scenarioId', 'Wrong proof owner.');
  if (report.runs.length !== policy.seeds.length) problem('runs', 'Every required seed must run exactly once.');
  const seen = new Set();
  report.runs.forEach((run, index) => {
    const at = `runs[${index}]`;
    if (!object(run)) { problem(at, 'Run must be an object.'); return; }
    if (!Number.isSafeInteger(run.seed) || !policy.seeds.includes(run.seed) || seen.has(run.seed)) {
      problem(`${at}.seed`, 'Unexpected, non-integer or duplicate seed.');
    }
    seen.add(run.seed);
    if (run.scenarioId !== policy.scenarioId) problem(`${at}.scenarioId`, 'Run belongs to a different scenario.');
    if (run.required !== policy.required || run.total !== policy.beats.length) problem(at, 'B12 thresholds changed.');
    if (!Number.isFinite(run.simS) || run.simS <= 0) problem(`${at}.simS`, 'Missing/invalid simulation duration.');
    if (!Number.isSafeInteger(run.ticks) || run.ticks <= 0) problem(`${at}.ticks`, 'An unexecuted run is not evidence.');
    if (run.realPath?.backend !== 'rapier-dynamic' || run.realPath?.sg02Ready !== true) {
      problem(`${at}.realPath`, 'The existing authoritative physics-path witness is required.');
    }
    if (run.relocatedAtTick != null) problem(`${at}.relocatedAtTick`, 'Diagnostic relocation cannot qualify this unmodified proof.');
    if (run.inputDevice !== 'keyboard') problem(`${at}.inputDevice`, 'Compare the default keyboard proof separately from device variants.');
    if (!object(run.times)) { problem(`${at}.times`, 'Missing beat-time map.'); return; }
    for (const key of Object.keys(run.times)) if (!policy.beats.includes(key)) problem(`${at}.times.${key}`, 'Unknown beat.');
    let detected = 0;
    const missing = [];
    for (const beat of policy.beats) {
      if (!own(run.times, beat)) { problem(`${at}.times.${beat}`, 'Missing field; use null for an unobserved beat.'); missing.push(beat); continue; }
      const time = run.times[beat];
      if (time === null) { missing.push(beat); continue; }
      if (!Number.isFinite(time) || time < 0 || time > run.simS + 0.001) {
        problem(`${at}.times.${beat}`, 'Beat time must be finite and inside the measured run.');
        continue;
      }
      detected++;
    }
    if (run.detected !== detected) problem(`${at}.detected`, 'Reported count disagrees with measured beat cells.');
    const exceeded = Number.isFinite(run.simS) && run.simS > policy.hardCapS;
    if (typeof run.exceededHardCap !== 'boolean' || run.exceededHardCap !== exceeded) {
      problem(`${at}.exceededHardCap`, 'Hard-cap flag disagrees with simulation duration.');
    }
    const met = detected >= policy.required && Number.isFinite(run.simS) && !exceeded;
    if (run.gateMet !== met) problem(`${at}.gateMet`, 'Reported gate disagrees with the fixed B12 criterion.');
    if (!met) misses.push({ seed: run.seed, detected, missing, exceededHardCap: exceeded });
    seedReports.push({ seed: run.seed, detected, missing, simS: run.simS, gateMet: met });
  });
  for (const seed of policy.seeds) if (!seen.has(seed)) problem('runs', `Seed ${seed} was not measured.`);
  const allMet = seedReports.length === policy.seeds.length && seedReports.every(row => row.gateMet);
  if (report.gateMet !== allMet) problem('gateMet', 'Suite flag disagrees with individual runs.');
  if (report.required != null && report.required !== policy.required) problem('required', 'Suite lowered or changed the required beat count.');
  if (report.worst !== Math.min(...seedReports.map(row => row.detected))) problem('worst', 'Worst-seed count disagrees with runs.');
  return finish();
  function finish() {
    return {
      schema: 'spaceface.strategicChaosB12Audit.v1',
      verdict: errors.length ? 'INCOMPLETE' : misses.length ? 'FAIL' : 'PASS',
      evidenceClass: 'diagnostic', acceptanceGranted: false,
      errors, misses, seeds: seedReports,
      limits: ['Receipt coverage is not causal-chain proof.', 'No strategic-depth, visual, performance or ordinary-player-route acceptance.'],
    };
  }
}

/**
 * Diagnostic paired-trial comparison. The same scenario/seed/kit/world and measurement
 * definitions are required; only the declared player strategy may differ. No fun score.
 */
export function compareStrategyTrials(baseline, candidate) {
  const errors = [], deltas = [];
  const err = message => errors.push(message);
  for (const [name, trial] of [['baseline', baseline], ['candidate', candidate]]) {
    if (!object(trial)) { err(`${name}: trial must be an object`); continue; }
    if (trial.schema !== 'spaceface.strategyTrial.v1') err(`${name}: wrong schema`);
    for (const key of ['scenarioId', 'scenarioHash', 'sourceTree', 'initialStateHash', 'loadoutHash', 'strategyId', 'evidenceClass', 'outcome']) {
      if (typeof trial[key] !== 'string' || !trial[key].trim()) err(`${name}: missing ${key}`);
    }
    if (!/^[a-f0-9]{40}$/.test(trial.sourceTree || '')) err(`${name}: sourceTree must be an exact Git tree SHA`);
    if (!Number.isSafeInteger(trial.seed)) err(`${name}: seed must be an integer`);
    if (trial.evidenceClass !== 'production-fixture' && trial.evidenceClass !== 'public-route' && trial.evidenceClass !== 'focused-fixture') err(`${name}: unsupported evidence class`);
    if (!Number.isFinite(trial.windowS) || trial.windowS <= 0) err(`${name}: invalid observation window`);
    if (!Array.isArray(trial.setupExceptions) || trial.setupExceptions.some(x => typeof x !== 'string')) err(`${name}: explicitly list setup exceptions`);
    if (!object(trial.metrics) || !Object.keys(trial.metrics).length) err(`${name}: no measured metrics`);
    for (const [metric, value] of Object.entries(trial.metrics || {})) {
      if (!object(value) || !Number.isFinite(value.value) || typeof value.unit !== 'string' || !value.unit || typeof value.definition !== 'string' || !value.definition) {
        err(`${name}: ${metric} requires finite value, unit and measurement definition`);
      }
    }
  }
  if (!errors.length) {
    for (const key of ['scenarioId', 'scenarioHash', 'sourceTree', 'seed', 'initialStateHash', 'loadoutHash', 'evidenceClass', 'windowS']) {
      if (baseline[key] !== candidate[key]) err(`Mismatched ${key}; this is not an isolated strategy comparison.`);
    }
    if (baseline.strategyId === candidate.strategyId) err('Compare two different strategies.');
    if (JSON.stringify([...baseline.setupExceptions].sort()) !== JSON.stringify([...candidate.setupExceptions].sort())) err('Setup exceptions differ.');
    const keys = Object.keys(baseline.metrics).sort();
    if (JSON.stringify(keys) !== JSON.stringify(Object.keys(candidate.metrics).sort())) err('Metric coverage differs; missing is not zero.');
    for (const key of keys) {
      const before = baseline.metrics[key], after = candidate.metrics[key];
      if (!after) continue;
      if (before.unit !== after.unit || before.definition !== after.definition) { err(`${key}: measurement definitions differ`); continue; }
      const delta = after.value - before.value;
      if (!Number.isFinite(delta)) { err(`${key}: non-finite delta`); continue; }
      deltas.push({ metric: key, unit: before.unit, before: before.value, after: after.value, delta });
    }
  }
  return {
    schema: 'spaceface.strategyComparison.v1', comparable: errors.length === 0,
    evidenceClass: 'diagnostic', acceptanceGranted: false, errors,
    deltas: errors.length ? [] : deltas,
    outcomes: errors.length ? null : { baseline: baseline.outcome, candidate: candidate.outcome },
    note: 'Differences describe tradeoffs, not superiority or fun. One pair establishes neither balance nor causation.',
  };
}
