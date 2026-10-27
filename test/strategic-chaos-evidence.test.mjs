import test from 'node:test';
import assert from 'node:assert/strict';
import { B12_POLICY as P, auditB12Report, compareStrategyTrials } from '../scripts/lib/strategicChaosEvidence.mjs';

// Deliberately fabricated data tests the report reader, NEVER gameplay behavior.
function fixture(count = 9) {
  const runs = P.seeds.map(seed => ({
    scenarioId: P.scenarioId, seed, simS: 60, ticks: 3600, required: 9, total: 11,
    detected: count, gateMet: count >= 9, exceededHardCap: false,
    realPath: { backend: 'rapier-dynamic', sg02Ready: true }, inputDevice: 'keyboard', relocatedAtTick: null,
    times: Object.fromEntries(P.beats.map((id, i) => [id, i < count ? i + 1 : null])),
  }));
  return { scenarioId: P.scenarioId, runs, worst: count, gateMet: count >= 9, required: 9 };
}
const clone = value => structuredClone(value);
test('complete imported report is diagnostic, never a certificate', () => {
  const result = auditB12Report(fixture());
  assert.equal(result.verdict, 'PASS'); assert.equal(result.acceptanceGranted, false);
  assert.equal(result.evidenceClass, 'diagnostic'); assert.equal(result.seeds.length, 5);
});
test('genuine measured miss is FAIL, not an incomplete or successful run', () => {
  const result = auditB12Report(fixture(8)); assert.equal(result.verdict, 'FAIL'); assert.equal(result.misses.length, 5);
});
for (const [name, mutate] of [
  ['empty suite cannot pass by vacuous every()', x => { x.runs = []; x.worst = 11; x.gateMet = true; }],
  ['missing seed', x => x.runs.pop()],
  ['duplicate seed', x => { x.runs[1].seed = x.runs[0].seed; }],
  ['unknown seed', x => { x.runs[1].seed = 999; }],
  ['lowered gate', x => { x.required = 1; x.runs.forEach(r => { r.required = 1; }); }],
  ['legacy backend', x => { x.runs[0].realPath.backend = 'legacy'; }],
  ['missing readiness', x => { delete x.runs[0].realPath.sg02Ready; }],
  ['zero ticks', x => { x.runs[0].ticks = 0; }],
  ['zero simulation time', x => { x.runs[0].simS = 0; }],
  ['nonfinite time', x => { x.runs[0].times.op_working = NaN; }],
  ['future beat', x => { x.runs[0].times.op_working = 999; }],
  ['unknown beat', x => { x.runs[0].times.fake_win = 1; }],
  ['absent beat field is not null', x => { delete x.runs[0].times.op_working; }],
  ['dishonest count', x => { x.runs[0].detected = 11; }],
  ['dishonest aggregate', x => { x.worst = 11; }],
  ['dishonest suite flag', x => { x.gateMet = false; }],
  ['wrong scenario', x => { x.runs[0].scenarioId = 'other'; }],
  ['diagnostic relocation', x => { x.runs[0].relocatedAtTick = 120; }],
  ['different input device', x => { x.runs[0].inputDevice = 'gamepad'; }],
]) test(`B12 rejects ${name}`, () => {
  const value = fixture(); mutate(value); assert.equal(auditB12Report(value).verdict, 'INCOMPLETE');
});
test('honestly reported over-cap run fails without tuning away the cap', () => {
  const value = fixture(); value.runs[0].simS = 91; value.runs[0].gateMet = false;
  value.runs[0].exceededHardCap = true; value.gateMet = false;
  assert.equal(auditB12Report(value).verdict, 'FAIL');
});
test('reader is pure and does not upgrade supplied metadata', () => {
  const value = fixture(), before = clone(value); value.provenance = 'public-route'; before.provenance = 'public-route';
  auditB12Report(value); assert.deepEqual(value, before); assert.equal(auditB12Report(value).acceptanceGranted, false);
});
test('caller cannot lower thresholds with a second argument', () => {
  assert.equal(auditB12Report(fixture(8), { ...P, required: 1 }).verdict, 'FAIL');
});
function trial(strategyId = 'defend') {
  return { schema: 'spaceface.strategyTrial.v1', scenarioId: 'ceres-freight', scenarioHash: 'same-definition',
    sourceTree: 'a'.repeat(40), seed: 47, initialStateHash: 'same-world', loadoutHash: 'same-kit',
    strategyId, evidenceClass: 'focused-fixture', outcome: 'partial-delivery', windowS: 60, setupExceptions: ['authored fixture'],
    metrics: { delivered: { value: 5, unit: 'units', definition: 'destination-owner accepted lot quantity' },
      damage: { value: 10, unit: 'hull', definition: 'initial minus final protected hull' } } };
}
test('comparison shows tradeoffs without declaring superiority', () => {
  const a = trial(), b = trial('steal'); b.metrics.delivered.value = 0; b.metrics.damage.value = 2; b.outcome = 'stolen';
  const r = compareStrategyTrials(a, b); assert.equal(r.comparable, true); assert.equal(r.acceptanceGranted, false);
  assert.deepEqual(r.deltas.map(x => x.delta), [-8, -5]); assert.deepEqual(r.outcomes, { baseline: 'partial-delivery', candidate: 'stolen' });
});
for (const key of ['scenarioHash', 'sourceTree', 'seed', 'initialStateHash', 'loadoutHash', 'evidenceClass', 'windowS']) test(`comparison refuses mismatched ${key}`, () => {
  const a = trial(), b = trial('steal'); b[key] = typeof b[key] === 'number' ? b[key] + 1 : 'different';
  assert.equal(compareStrategyTrials(a, b).comparable, false);
});
test('missing metrics are not fabricated zeroes', () => {
  const a = trial(), b = trial('steal'); delete b.metrics.damage;
  assert.deepEqual(compareStrategyTrials(a, b).deltas, []);
});
test('same unit with different measurement definition is incomparable', () => {
  const a = trial(), b = trial('steal'); b.metrics.damage.definition = 'entire-sector damage';
  assert.equal(compareStrategyTrials(a, b).comparable, false);
});
test('setup differences and same strategy are rejected', () => {
  const a = trial(), b = trial('steal'); b.setupExceptions.push('free reinforcements');
  assert.equal(compareStrategyTrials(a, b).comparable, false);
  assert.equal(compareStrategyTrials(a, a).comparable, false);
});
test('nonfinite measurements and overflowing deltas are rejected', () => {
  const a = trial(), b = trial('steal'); b.metrics.damage.value = NaN;
  assert.equal(compareStrategyTrials(a, b).comparable, false);
  a.metrics.damage.value = -Number.MAX_VALUE; b.metrics.damage.value = Number.MAX_VALUE;
  assert.equal(compareStrategyTrials(a, b).comparable, false);
});
test('malformed inputs fail as diagnostics without exceptions', () => {
  for (const value of [null, [], {}, 'yes', { runs: [null] }]) assert.equal(auditB12Report(value).verdict, 'INCOMPLETE');
  for (const value of [null, [], {}, 'yes']) assert.equal(compareStrategyTrials(value, value).comparable, false);
});
