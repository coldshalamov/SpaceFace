// test/playtest-gates.test.mjs
// Tests for check-playtest-gates.mjs and weekly playtest auditing (PQ-167 Leaf .01 & .02).

import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadPlaytestReports,
  computePlaytestGates,
  formatSection15Rows,
} from '../scripts/check-playtest-gates.mjs';
import { createDemoSession } from '../scripts/export-session-report.mjs';
import { auditWeeklyPlaytests, recordNewPlaytest } from '../scripts/run-weekly-playtest.mjs';

test('Demo receipts cannot count as owner playtests', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-demo-playtests-'));
  try {
    fs.writeFileSync(path.join(dir, 'demo-session.json'), JSON.stringify(createDemoSession()));
    assert.equal(auditWeeklyPlaytests(dir).ok, false);
    assert.equal(loadPlaytestReports(dir).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('formatSection15Rows prints all three milestone rows', () => {
  const reports = loadPlaytestReports();
  const metrics = computePlaytestGates(reports);
  const text = formatSection15Rows(metrics, reports);

  assert.ok(text.includes('SPACEFACE RELEASE GATES (§15.1)'));
  assert.ok(text.includes('Milestone: ALPHA — "The Toy Works"'));
  assert.ok(text.includes('Milestone: BETA — "The World Works"'));
  assert.ok(text.includes('Milestone: RELEASE — "It Ships"'));
  assert.ok(text.includes('First ten minutes power fantasy (PQ-163)'));
  assert.ok(text.includes('Physical verbs rate:'));
  assert.ok(text.includes('Session-2 return rate:'));
  assert.ok(text.includes('Telemetry funnels and weekly playtest loop (PQ-167)'));
});

test('computePlaytestGates dynamically derives session-2 return rate from data', () => {
  // Test 1: Cohort with 0 returns
  const reportsZeroReturn = [
    {
      sessionId: 's1', durationMs: 2700000, verbs: { totalCount: 200 },
      funnel: { steps: [], coreReachedCount: 5, coreTotalCount: 5, firstHourComplete: true },
      combat: { deathsByCause: {} },
      cohort: { cohortId: 'c1', testersTotal: 10, testersReturnedSession2: 0 },
    },
  ];
  const m1 = computePlaytestGates(reportsZeroReturn);
  assert.equal(m1.session2ReturnRate, 0.0, 'Reports 0% return when cohort has 0 returns');
  assert.equal(m1.gates.beta.returnPass, false);

  // Test 2: Cohort with 65% returns (meets >= 60% beta target)
  const reports65Return = [
    {
      sessionId: 's2', durationMs: 2700000, verbs: { totalCount: 200 },
      funnel: { steps: [], coreReachedCount: 5, coreTotalCount: 5, firstHourComplete: true },
      combat: { deathsByCause: {} },
      cohort: { cohortId: 'c2', testersTotal: 20, testersReturnedSession2: 13 },
    },
  ];
  const m2 = computePlaytestGates(reports65Return);
  assert.equal(m2.session2ReturnRate, 65.0);
  assert.equal(m2.gates.beta.returnPass, true);

  // Test 3: Tester IDs with 1 out of 2 returning
  const reportsTesters = [
    {
      sessionId: 't1_s1', testerId: 'tester_1', durationMs: 2700000, verbs: { totalCount: 150 },
      funnel: { steps: [], coreReachedCount: 5, coreTotalCount: 5, firstHourComplete: true },
      combat: { deathsByCause: {} },
    },
    {
      sessionId: 't1_s2', testerId: 'tester_1', durationMs: 2700000, verbs: { totalCount: 150 },
      funnel: { steps: [], coreReachedCount: 5, coreTotalCount: 5, firstHourComplete: true },
      combat: { deathsByCause: {} },
    },
    {
      sessionId: 't2_s1', testerId: 'tester_2', durationMs: 2700000, verbs: { totalCount: 150 },
      funnel: { steps: [], coreReachedCount: 5, coreTotalCount: 5, firstHourComplete: true },
      combat: { deathsByCause: {} },
    },
  ];
  const m3 = computePlaytestGates(reportsTesters);
  assert.equal(m3.session2ReturnRate, 50.0, '1 of 2 testers returned -> 50% return rate');
});

test('Recording refuses invented sessions and findings', () => {
  assert.throws(() => recordNewPlaytest({ week: '1' }), /no demo session/);
});

test('Observed inputs round-trip; missing capture and nonconsecutive weeks fail', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-playtests-'));
  try {
    const capture = path.join(dir, 'capture.mp4');
    fs.writeFileSync(capture, 'test fixture capture, not production evidence');
    const findings = [1, 2, 3].map(n => ({ observation: 'Fixture observation ' + n, packet: 'PQ-137' }));
    for (let w = 1; w <= 4; w++) {
      const startedAt = Date.UTC(2026, 7, w * 7, 12);
      const input = path.join(dir, 'input.json');
      fs.writeFileSync(input, JSON.stringify({ sessionId: 'fixture_' + w, startedAt, endedAt: startedAt + 2700000, durationMs: 2700000, verbs: { shove: 200 }, funnel: { firstFlightAt: 0 } }));
      const args = { file: input, capture, findings, commit: 'a'.repeat(40), observedByOwner: true, week: w, out: dir };
      const result = recordNewPlaytest(args);
      assert.throws(() => recordNewPlaytest(args), /already exists/);
      const loaded = JSON.parse(fs.readFileSync(result.sessionJsonPath));
      assert.equal(loaded.funnel.firstFlightAt, 0);
      const report = fs.readFileSync(result.mdPath, 'utf8');
      assert.ok(!report.includes('baselineCheck: green'));
      assert.ok(report.includes('Not Reached'), 'Missing funnel milestones remain missing');
    }
    assert.equal(auditWeeklyPlaytests(dir).ok, true);
    assert.equal(loadPlaytestReports(dir).length, 4);
    const p = path.join(dir, '2026-08-28-week-4-session.json');
    const fourth = JSON.parse(fs.readFileSync(p));
    fourth.startedAt -= 86400000 * 4; fourth.endedAt -= 86400000 * 4;
    fs.writeFileSync(p, JSON.stringify(fourth));
    assert.equal(auditWeeklyPlaytests(dir).ok, false, 'Four files are not four consecutive weeks');
    fs.unlinkSync(capture);
    assert.equal(loadPlaytestReports(dir).length, 0, 'Missing capture cannot admit evidence');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Empty and anonymous datasets do not crash or invent a return rate', () => {
  const empty = computePlaytestGates([]);
  assert.doesNotThrow(() => formatSection15Rows(empty));
  assert.equal(empty.gates.alpha.passed, false);
  const report = { durationMs: 2700000, verbs: { totalCount: 20 }, funnel: { steps: [], firstHourComplete: false }, combat: {} };
  const anonymous = computePlaytestGates([report, report, report, report]);
  assert.equal(anonymous.session2ReturnRate, null);
  assert.equal(anonymous.gates.beta.passed, false);
  assert.ok(!formatSection15Rows(anonymous).includes('[MET]'));
});
