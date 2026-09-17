// Ledger logic for the INFERENCE hygiene loop: bounded, tolerant, and honest
// about staleness. Git stays in the CLI; everything here is pure data.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyLedger, normalizeLedger, recordInspection, addGap, closeGap, setGrade,
  inspectionFreshness, domainFreshness, rankDomains, openGaps,
  validWf, validGrade, MAX_INSPECTIONS, MAX_OPEN_GAPS,
} from '../scripts/lib/inferenceLedger.mjs';

const TODAY = '2026-09-17';

test('empty ledger grades every domain U (honest default, never a soft grade)', () => {
  const ledger = emptyLedger(TODAY);
  assert.equal(Object.keys(ledger.domains).length, 19);
  for (const entry of Object.values(ledger.domains)) {
    assert.equal(entry.grade, 'U');
    assert.deepEqual(entry.inspections, []);
    assert.deepEqual(entry.gaps, []);
  }
});

test('normalize tolerates corrupt shapes field-by-field instead of crashing', () => {
  const { ledger, warnings } = normalizeLedger({ schema: 'foreign', domains: { 'WF-10': { grade: 'Z' } } }, TODAY);
  assert.ok(warnings.length >= 1);
  assert.equal(ledger.domains['WF-10'].grade, 'U');
  assert.equal(ledger.domains['WF-01'].grade, 'U');
  const empty = normalizeLedger(null, TODAY);
  assert.equal(Object.keys(empty.ledger.domains).length, 19);
});

test('inspections prune to the newest three on write', () => {
  const ledger = emptyLedger(TODAY);
  for (let i = 0; i < 5; i++) {
    recordInspection(ledger, {
      wf: 'WF-10', date: TODAY, atCommit: `c${i}`, paths: ['a.js'], finding: `look ${i}`,
    });
  }
  const findings = ledger.domains['WF-10'].inspections.map((i) => i.finding);
  assert.equal(findings.length, MAX_INSPECTIONS);
  assert.deepEqual(findings, ['look 2', 'look 3', 'look 4']);
});

test('gaps cap at five open; done gaps leave the working set', () => {
  const ledger = emptyLedger(TODAY);
  for (let i = 0; i < MAX_OPEN_GAPS; i++) {
    assert.equal(addGap(ledger, { wf: 'WF-10', id: `g${i}`, note: 'x', date: TODAY }).ok, true);
  }
  assert.equal(addGap(ledger, { wf: 'WF-10', id: 'overflow', note: 'x', date: TODAY }).ok, false);
  closeGap(ledger, { wf: 'WF-10', id: 'g0', byUnit: 'u1', date: TODAY });
  assert.equal(openGaps(ledger.domains['WF-10']).length, MAX_OPEN_GAPS - 1);
  assert.equal(addGap(ledger, { wf: 'WF-10', id: 'fits-now', note: 'x', date: TODAY }).ok, true);
});

test('freshness: only movement under inspected paths invalidates', () => {
  const inspection = { date: TODAY, atCommit: 'abc', paths: ['a.js'], finding: 'x' };
  assert.equal(inspectionFreshness(inspection, { atCommitKnown: true, pathsChanged: false }), 'valid');
  assert.equal(inspectionFreshness(inspection, { atCommitKnown: true, pathsChanged: true }), 'stale');
  assert.equal(inspectionFreshness(inspection, { atCommitKnown: false, pathsChanged: false }), 'stale');
  assert.equal(inspectionFreshness(null, { atCommitKnown: true, pathsChanged: false }), 'none');
  const ledger = emptyLedger(TODAY);
  assert.equal(domainFreshness(ledger.domains['WF-10'], {}), 'none');
});

test('ranking puts broken, weak, unknown, and stale before polish', () => {
  const ledger = emptyLedger(TODAY);
  setGrade(ledger, { wf: 'WF-01', grade: 'A', date: '2026-09-01' });
  setGrade(ledger, { wf: 'WF-02', grade: 'D', date: '2026-09-01' });
  setGrade(ledger, { wf: 'WF-03', grade: 'B', date: '2026-09-01' });
  const fresh = (wf) => (wf === 'WF-01' ? 'stale' : wf === 'WF-03' ? 'valid' : 'none');
  const order = rankDomains(ledger, fresh).map((r) => r.wf);
  assert.equal(order[0], 'WF-02', 'broken first');
  assert.ok(order.indexOf('WF-01') < order.indexOf('WF-03'), 'stale A refreshes before valid B polish');
  assert.ok(order.indexOf('WF-03') > order.indexOf('WF-10'), 'uninspected domains precede valid B polish');
});

test('unknown workflows and grades fail closed', () => {
  const ledger = emptyLedger(TODAY);
  assert.equal(validWf('WF-99'), false);
  assert.equal(validGrade('Z'), false);
  assert.throws(() => recordInspection(ledger, { wf: 'WF-99', date: TODAY, finding: 'x' }));
  assert.throws(() => setGrade(ledger, { wf: 'WF-10', grade: 'Z', date: TODAY }));
});
