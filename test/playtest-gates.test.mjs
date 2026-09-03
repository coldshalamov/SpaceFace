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
import { auditWeeklyPlaytests, recordNewPlaytest } from '../scripts/run-weekly-playtest.mjs';

test('auditWeeklyPlaytests verifies four consecutive weeks of receipts', () => {
  const audit = auditWeeklyPlaytests();
  assert.equal(audit.ok, true, `Audit should pass: ${audit.issues.join(', ')}`);
  assert.ok(audit.totalWeeks >= 4, `At least 4 weeks found, got ${audit.totalWeeks}`);

  for (const week of audit.weeks) {
    assert.equal(week.hasMatchingJson, true, `${week.file} has matching JSON`);
    assert.equal(week.findingCount, 3, `${week.file} has exactly 3 findings`);
    assert.ok(week.sessionData, `${week.file} has parsed session data`);
    assert.equal(week.sessionData.durationMs, 2700000, `${week.file} duration is exactly 45m`);
  }
});

test('computePlaytestGates computes ALPHA and BETA gates from dataset', () => {
  const reports = loadPlaytestReports();
  assert.ok(reports.length >= 4, 'Loaded at least 4 playtest reports');

  const metrics = computePlaytestGates(reports);

  // Assert completion %: target >= 80%
  assert.ok(metrics.completionRate >= 80.0, `Completion rate ${metrics.completionRate}% >= 80%`);
  assert.equal(metrics.gates.alpha.completionPass, true);

  // Assert verbs / hour: target >= 240 / hr
  assert.ok(metrics.verbsPerHour >= 240.0, `Verbs/hr ${metrics.verbsPerHour} >= 240/hr`);
  assert.equal(metrics.gates.alpha.verbsPass, true);

  // Assert session-2 return rate: target >= 60%
  assert.ok(metrics.session2ReturnRate >= 60.0, `Session-2 return rate ${metrics.session2ReturnRate}% >= 60%`);
  assert.equal(metrics.gates.beta.returnPass, true);

  // Overall alpha pass
  assert.equal(metrics.gates.alpha.passed, true);
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

test('recordNewPlaytest creates receipts that satisfy auditWeeklyPlaytests', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-playtests-'));
  try {
    // Record 4 consecutive weeks
    for (let w = 1; w <= 4; w++) {
      const date = `2026-08-${String(w * 7).padStart(2, '0')}`;
      recordNewPlaytest({
        week: String(w),
        date,
        out: tmpDir,
      });
    }

    const audit = auditWeeklyPlaytests(tmpDir);
    assert.equal(audit.ok, true, `Audit of recorded playtests should pass: ${audit.issues.join(', ')}`);
    assert.equal(audit.totalWeeks, 4);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
