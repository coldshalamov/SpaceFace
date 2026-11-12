// test/session-report.test.mjs
// Tests for sessionReport.js and export-session-report.mjs (PQ-167 Leaf .00).

import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  formatDuration,
  buildSessionReportData,
  renderSessionReportMarkdown,
  exportSessionReportJson,
} from '../src/observability/sessionReport.js';
import { createDemoSession, loadSession } from '../scripts/export-session-report.mjs';

test('formatDuration formats ms into human-readable strings', () => {
  assert.equal(formatDuration(0), '0m 00s');
  assert.equal(formatDuration(45000), '0m 45s');
  assert.equal(formatDuration(125000), '2m 05s');
  assert.equal(formatDuration(3665000), '1h 01m 05s');
  assert.equal(formatDuration(-50), '00:00');
  assert.equal(formatDuration(NaN), '00:00');
});

test('buildSessionReportData computes funnel and verb rates correctly', () => {
  const session = createDemoSession({
    durationMs: 3600000, // exactly 1 hour
    verbs: {
      thrust: 120,
      brake: 40,
      latch: 20,
      release: 20,
      shove: 40,
    },
  });

  const report = buildSessionReportData(session);

  assert.equal(report.durationHours, 1.0);
  assert.equal(report.verbs.totalCount, 240);
  assert.equal(report.verbs.verbsPerHour, 240.0);
  assert.equal(report.verbs.verbsPerMinute, 4.0);
  assert.equal(report.verbs.distinctCount, 5);

  // Check core funnel progression
  assert.equal(report.funnel.coreTotalCount, 5);
  assert.equal(report.funnel.coreReachedCount, 5);
  assert.equal(report.funnel.coreCompletionRate, 100);
  assert.equal(report.funnel.firstHourComplete, true);

  // Economy metrics
  assert.equal(report.economy.creditsEarned, 14500);
  assert.equal(report.economy.creditsSpent, 4200);
  assert.equal(report.economy.netCredits, 10300);

  // Combat metrics
  assert.equal(report.combat.killsTotal, 7);
  assert.equal(report.combat.deathsTotal, 2);
  assert.equal(report.combat.deathsByCause['ship:fighter'], 1);
  assert.equal(report.combat.deathsByCause['collision:asteroid'], 1);
});

test('renderSessionReportMarkdown generates all required sections', () => {
  const session = createDemoSession();
  const md = renderSessionReportMarkdown(session);

  assert.ok(md.includes('# SpaceFace Session Telemetry Report'));
  assert.ok(md.includes('## 1. Onboarding Funnel Progression'));
  assert.ok(md.includes('## 2. Physical Verbs & Rhythm'));
  assert.ok(md.includes('## 3. Combat & Survivability'));
  assert.ok(md.includes('## 4. Economy, Missions & Navigation'));
  assert.ok(md.includes('## 5. Release Gate Status (§15.1 Alignment)'));

  // Key fields present
  assert.ok(md.includes('First Flight'));
  assert.ok(md.includes('First Swing'));
  assert.ok(md.includes('First Shove'));
  assert.ok(md.includes('First Station Dock'));
  assert.ok(md.includes('First Heat'));
  assert.ok(md.includes('Physical Verbs / Hour'));
  assert.ok(md.includes('Player Kills:'));
  assert.ok(md.includes('Player Defeats / Deaths:'));
});

test('exportSessionReportJson outputs valid JSON-serializable object', () => {
  const session = createDemoSession();
  const json = exportSessionReportJson(session);

  assert.equal(json.schemaVersion, 1);
  const serialized = JSON.stringify(json);
  const roundtripped = JSON.parse(serialized);
  assert.deepEqual(roundtripped, json);
});

test('buildSessionReportData safely handles zero duration and preserves cohort metadata', () => {
  const session = {
    sessionId: 'zero_dur_test',
    startedAt: 1000,
    endedAt: 1000,
    durationMs: 0,
    verbs: { thrust: 5 },
    testerId: 'tester_alpha',
    sessionNumber: 2,
    cohort: { cohortId: 'cohort_1', testersTotal: 4, testersReturnedSession2: 3 },
  };

  const report = buildSessionReportData(session);
  assert.equal(report.durationMs, 0);
  assert.equal(report.verbs.verbsPerHour, 0, 'Zero duration reports 0 verbs/hr, never division-by-zero anomaly');
  assert.equal(report.testerId, 'tester_alpha');
  assert.equal(report.sessionNumber, 2);
  assert.deepEqual(report.cohort, { cohortId: 'cohort_1', testersTotal: 4, testersReturnedSession2: 3 });
});

test('loadSession handles file, storage, session queries, and corrupted JSON', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-session-test-'));
  try {
    // 1. Valid file
    const validFile = path.join(tmpDir, 'valid.json');
    const s1 = createDemoSession({ sessionId: 'session_valid_1' });
    fs.writeFileSync(validFile, JSON.stringify(s1), 'utf8');

    const loaded1 = loadSession({ file: validFile });
    assert.equal(loaded1.sessionId, 'session_valid_1');

    // 2. Corrupted file error
    const corruptFile = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{"sessionId": "truncated...', 'utf8');
    assert.throws(() => loadSession({ file: corruptFile }), /Malformed or truncated JSON/);

    // 3. Storage file with multiple sessions
    const storageFile = path.join(tmpDir, 'storage.json');
    const s2 = createDemoSession({ sessionId: 'session_valid_2' });
    fs.writeFileSync(storageFile, JSON.stringify({ sessions: [s1, s2] }), 'utf8');

    const loadedLatest = loadSession({ storage: storageFile });
    assert.equal(loadedLatest.sessionId, 'session_valid_2');

    const loadedSpecific = loadSession({ storage: storageFile, session: 'session_valid_1' });
    assert.equal(loadedSpecific.sessionId, 'session_valid_1');

    assert.throws(() => loadSession({ storage: storageFile, session: 'nonexistent' }), /not found/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
