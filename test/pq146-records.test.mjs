import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRunRecords, compactRunResult, recordKey, recordRulesFor, roundProgress, settleCrucibleRun, emptyCrucibleProfile, parseCrucibleMeta, normalizeBestLine, bestLineRows, useCrucibleMetaStorage } from '../src/systems/survivalRecords.js';
import { bestLineReviewRows, resultRows } from '../src/ui/screens/crucible.js';
const rules = { mode: 'swarm', arenaId: 'helios_core', balanceRevision: 'test-balance-1', physicsRevision: 'test-physics-1', scoringRevision: 2,
  difficulty: 'standard', loadoutRules: 'open', simulationAssistProfile: 'flow' };
const result = (overrides = {}) => ({ outcome: 'defeat', seed: 146, recordRules: rules, ruleset: 'swarm', arenaId: 'helios_core',
  highestRoundEntered: 4, lastRoundCleared: 3, roundThreatBudget: 100, roundThreatResolved: 50, remainingEnemies: 5, score: 1000, ...overrides });
const line = (points, overrides = {}) => ({ points, seed: 146, recordRules: rules, multiplier: 2, raw: points / 2, bankId: points, tick: 180,
  acts: [{ episodeId: `e${points}`, trickId: 'bolas', name: 'Bolas', tick: 180, rootTick: 100,
    evidence: [{ kind: 'impulse', before: { x: 0, z: 2 }, after: { x: 10, z: 2 } }, { kind: 'release' }, { kind: 'collision', victimLifeId: 'life:1' }] }], ...overrides });
const store = () => { const rows = new Map(); return { getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value) }; };

test('round entered outranks score; authored threat fraction outranks score; exact ties have no hidden timer', () => {
  assert.equal(compareRunRecords(result({ highestRoundEntered: 20, score: 1 }), result({ highestRoundEntered: 19, score: 100000 })), 1);
  assert.equal(compareRunRecords(result({ roundThreatResolved: 51, score: 1 }), result({ score: 100000 })), 1);
  assert.equal(compareRunRecords(result({ roundThreatBudget: 200, roundThreatResolved: 100, durationTicks: 1 }), result({ durationTicks: 10000 })), 0);
  assert.equal(compareRunRecords(result({ score: 1001 }), result()), 1);
});
test('every comparison dimension separates records; no unknown progress is invented', () => {
  for (const field of Object.keys(rules)) {
    const alternate = result({ recordRules: { ...rules, [field]: `${rules[field]}-other` } });
    assert.notEqual(recordKey(result()), recordKey(alternate), field);
    assert.equal(compareRunRecords(result(), alternate), null);
  }
  assert.equal(compareRunRecords(result({ roundThreatResolved: null }), result()), null);
  const legacy = compactRunResult({ seed: 3, wave: 2, score: 40 }, {}, []);
  assert.equal(legacy.roundThreatResolved, null); assert.equal(legacy.remainingEnemies, null);
  assert.equal(legacy.recordRules.physicsRevision, null); assert.equal(legacy.recordRules.complete, false);
  assert.notEqual(recordKey(legacy), recordKey(result()));
});
test('settlement selects seed by survival tuple and retains exact ties', () => {
  const storage = store();
  let settled = settleCrucibleRun({ result: result({ seed: 1, highestRoundEntered: 5, score: 20 }), storage });
  settled = settleCrucibleRun({ result: result({ seed: 2, highestRoundEntered: 4, score: 10000 }), storage });
  let row = settled.profile.records.byKey[recordKey(settled.result)];
  assert.equal(row.bestSeed, 1); assert.equal(row.bestScore, 10000); assert.equal(row.bestResult.score, 20);
  settled = settleCrucibleRun({ result: result({ seed: 3, highestRoundEntered: 5, score: 20 }), storage });
  row = settled.profile.records.byKey[recordKey(settled.result)];
  assert.equal(row.bestSeed, 1); assert.equal(row.tieCount, 2);
  assert.deepEqual(row.tiedResults.map(r => r.seed), [1, 3]);
});
test('migration preserves old records without manufacturing rule metadata or causal replay', () => {
  const old = emptyCrucibleProfile();
  old.records.byKey['helios_core|swarm|'] = { bestSeed: 7, bestScore: 700, deepestWave: 20 };
  old.history.push({ seed: 7, score: 700 });
  const migrated = parseCrucibleMeta(JSON.stringify(old));
  assert.deepEqual(migrated.records.byKey['helios_core|swarm|'], old.records.byKey['helios_core|swarm|']);
  assert.equal(migrated.history[0].recordRules, undefined);
  assert.deepEqual(migrated.bestLines, []);
  assert.equal(normalizeBestLine({ points: 100, seed: 1, frames: [{ t: 1, x: 0, z: 0, r: 0 }] }), null);
});
test('five automatically retained Best Lines contain actual named causal records, seed/rules and truthful video status', () => {
  const storage = store(); let settled;
  for (let i = 1; i <= 7; i++) settled = settleCrucibleRun({ result: result({ bestLine: line(i * 100) }), storage });
  const lines = bestLineRows(settled.profile);
  assert.deepEqual(lines.map(l => l.points), [700, 600, 500, 400, 300]);
  assert.equal(lines[0].seed, 146); assert.equal(lines[0].recordRules.physicsRevision, rules.physicsRevision);
  assert.equal(lines[0].namedLine, 'Bolas'); assert.equal(lines[0].acts[0].evidence.length, 3);
  assert.equal(lines[0].videoAvailable, false); assert.match(lines[0].videoStatus, /unavailable/i);
  assert.equal(settled.profile.history.at(-1).bestLine, undefined, 'history references line once rather than cloning all evidence per record');
  assert.equal(settled.profile.history.at(-1).bestLineId, lines[0].id);
  const restored = parseCrucibleMeta(JSON.stringify(settled.profile));
  assert.equal(restored.bestLines[0].id, lines[0].id);
});
test('practice and live assist profiles cannot silently share main comparison', () => {
  const practice = result({ recordRules: { ...rules, mode: 'practice' } });
  const cinematic = result({ recordRules: { ...rules, simulationAssistProfile: 'cinematic' } });
  assert.equal(compareRunRecords(practice, result()), null);
  assert.equal(compareRunRecords(cinematic, result()), null);
});
test('reachable Crucible text presents clear/remaining honestly and Best Line account without claiming video', () => {
  const rows = resultRows(result());
  assert.deepEqual(rows.find(([label]) => label === 'Last round cleared'), ['Last round cleared', '3']);
  assert.deepEqual(rows.find(([label]) => label === 'Enemies remaining'), ['Enemies remaining', '5']);
  assert.deepEqual(rows.find(([label]) => label === 'Round threat resolved'), ['Round threat resolved', '50 / 100']);
  const review = bestLineReviewRows(line(460));
  assert.deepEqual(review.find(([label]) => label === 'Seed'), ['Seed', '146']);
  assert.match(review.find(([label]) => label === 'Video')[1], /Unavailable/);
  const unknown = resultRows({ score: 0 });
  assert.deepEqual(unknown.find(([label]) => label === 'Enemies remaining'), ['Enemies remaining', 'Not recorded']);
});
