// Drives the shipped next-N selector against live program-dispatch --ready
// (and readyDispatchUnits). A hardcoded 20-id list that ignores the dispatcher
// is the failure this file exists to catch.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyReviewClose,
  canIntegrate,
  groupByOverlap,
  loadReadyFromDispatcher,
  patchDispatchUnitDone,
  patchDispatchUnitReady,
  pathsOverlap,
  selectSlate,
  unitsOverlap,
} from '../tools/agentic/next20_pipeline_lib.mjs';
import {
  readyDispatchUnits,
  validateControlPlane,
} from '../scripts/lib/programControlPlane.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE = path.join(ROOT, 'design', 'program', 'roadmap', 'program-queue.json');

function spawnCli(args) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
}

test('live program-dispatch --ready matches readyDispatchUnits order', () => {
  const cliReady = loadReadyFromDispatcher(ROOT);
  assert.ok(cliReady.length >= 1, 'dispatcher returned no ready units');
  const control = validateControlPlane(ROOT, JSON.parse(fs.readFileSync(QUEUE, 'utf8')));
  const libIds = readyDispatchUnits(control).map((unit) => unit.id);
  assert.deepEqual(
    cliReady.map((unit) => unit.id),
    libIds,
    'selector must consume the same ordered ready list the dispatcher prints',
  );
});

test('selectSlate first 20 ids equal the live dispatcher prefix, not a hand-built list', () => {
  const ready = loadReadyFromDispatcher(ROOT);
  const selection = selectSlate(ready, { count: 20 });
  const expected = ready.slice(0, 20).map((unit) => unit.id);
  assert.deepEqual(
    selection.slate.map((unit) => unit.id),
    expected,
    'slate must be the dispatcher prefix; inventing a second queue is a defect',
  );
  assert.equal(selection.source, 'program-dispatch --ready');
  assert.equal(selection.families.length >= 1, true);
});

test('overlapping write-sets share a serial family; disjoint units may fan out', () => {
  const units = [
    { id: 'A', paths: ['src/audio/', 'src/ui/screens/settings.js'] },
    { id: 'B', paths: ['src/ui/screens/settings.js'] },
    { id: 'C', paths: ['src/data/modules.js'] },
    { id: 'D', paths: ['src/render/'] },
    { id: 'E', paths: ['src/render/thruster/'] },
  ];
  assert.equal(pathsOverlap('src/render/', 'src/render/thruster/foo.js'), true);
  assert.equal(pathsOverlap('src/audio/', 'src/ui/screens/settings.js'), false);
  assert.equal(unitsOverlap(units[0], units[1]), true);
  assert.equal(unitsOverlap(units[0], units[2]), false);
  const families = groupByOverlap(units);
  const byId = new Map();
  for (const family of families) {
    for (const id of family.ids) byId.set(id, family.id);
  }
  assert.equal(byId.get('A'), byId.get('B'), 'settings.js overlap must serialize A with B');
  assert.notEqual(byId.get('A'), byId.get('C'), 'modules.js is disjoint from audio/settings');
  assert.equal(byId.get('D'), byId.get('E'), 'src/render/ prefix must serialize D with E');
  assert.equal(families.find((f) => f.ids.includes('A')).serial, true);
});

test('substitute pulls the next ready unit when a frozen id is already gone', () => {
  const ready = [
    { id: 'PQ-KEEP.01', paths: ['src/a.js'] },
    { id: 'PQ-KEEP.02', paths: ['src/b.js'] },
    { id: 'PQ-NEXT.00', paths: ['src/c.js'] },
  ];
  const selection = selectSlate(ready, {
    count: 2,
    frozenIds: ['PQ-MISSING.00', 'PQ-KEEP.01'],
  });
  assert.deepEqual(selection.slate.map((u) => u.id), ['PQ-KEEP.01', 'PQ-KEEP.02']);
  assert.ok(selection.skipped.some((row) => row.id === 'PQ-MISSING.00' && row.reason === 'not-ready-or-done'));
  assert.ok(selection.skipped.some((row) => row.id === 'PQ-KEEP.02' && row.reason === 'substitute'));
});

test('canIntegrate refuses failed checks or a teammate who would not ship it', () => {
  assert.equal(canIntegrate({ testsPass: true }).ok, true);
  assert.equal(canIntegrate({ testsPass: true, review: { wouldShip: true } }).ok, true);
  assert.equal(canIntegrate({ testsPass: false }).ok, false);
  assert.equal(canIntegrate({ testsPass: false }).reason, 'tests-failed');
  assert.equal(
    canIntegrate({ testsPass: true, review: { wouldShip: false, notes: 'tender weld is in empty space' } }).ok,
    false,
  );
  assert.equal(
    canIntegrate({ testsPass: true, review: { wouldShip: false, notes: 'tender weld is in empty space' } }).reason,
    'reviewer-would-not-ship',
  );
});

test('patchDispatchUnitDone flips only that unit and appends the receipt ref', () => {
  const fixture = `{
  "dispatchUnits": [
    {
      "id": "PQ-DEMO.01",
      "state": "ready",
      "paths": ["src/x.js"],
      "receiptRefs": []
    },
    {
      "id": "PQ-DEMO.02",
      "state": "ready",
      "receiptRefs": ["design/program/roadmap/receipts/keep.md"]
    }
  ]
}
`;
  const patched = patchDispatchUnitDone(fixture, 'PQ-DEMO.01', 'design/program/roadmap/receipts/PQ-DEMO.01-REPORT.md');
  const parsed = JSON.parse(patched);
  assert.equal(parsed.dispatchUnits[0].state, 'done');
  assert.deepEqual(parsed.dispatchUnits[0].receiptRefs, [
    'design/program/roadmap/receipts/PQ-DEMO.01-REPORT.md',
  ]);
  assert.equal(parsed.dispatchUnits[1].state, 'ready', 'sibling units must stay untouched');
  const reopened = patchDispatchUnitReady(patched, 'PQ-DEMO.01');
  assert.equal(JSON.parse(reopened).dispatchUnits[0].state, 'ready');
});

test('applyReviewClose keeps the unit ready when the teammate would not ship it', () => {
  const gate = applyReviewClose('PQ-DEMO.01', {
    testsPass: true,
    review: { wouldShip: false, notes: 'unfinished' },
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'reviewer-would-not-ship');
  assert.equal(gate.verdict, 'NOT-YET');
});

test('shipped CLI --schedule slate ids equal live --ready prefix', () => {
  const ready = spawnCli(['scripts/program-dispatch.mjs', '--ready']);
  assert.equal(ready.status, 0, ready.stderr || ready.stdout);
  const readyIds = JSON.parse(ready.stdout).slice(0, 20).map((unit) => unit.id);
  const scheduled = spawnCli(['tools/agentic/next20_pipeline.mjs', '--schedule', '--count', '20']);
  assert.equal(scheduled.status, 0, scheduled.stderr || scheduled.stdout);
  const payload = JSON.parse(scheduled.stdout);
  assert.equal(payload.source, 'program-dispatch --ready');
  assert.deepEqual(payload.slate.map((unit) => unit.id), readyIds);
});

test('shipped CLI --integrate refuses when the teammate would not ship it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next20-int-'));
  const reviewPath = path.join(dir, 'review.json');
  fs.writeFileSync(reviewPath, JSON.stringify({
    wouldShip: false,
    unfinished: 'tender weld sits in empty space',
  }));
  const result = spawnCli([
    'tools/agentic/next20_pipeline.mjs',
    '--integrate',
    '--id',
    'PQ-159.01',
    '--review',
    reviewPath,
    '--tests-pass',
  ]);
  assert.notEqual(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.integrated, false);
  assert.equal(body.reason, 'reviewer-would-not-ship');
});

test('shipped CLI --integrate without --tests-pass refuses', () => {
  const result = spawnCli([
    'tools/agentic/next20_pipeline.mjs',
    '--integrate',
    '--id',
    'PQ-159.01',
  ]);
  assert.notEqual(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.integrated, false);
  assert.equal(body.reason, 'tests-failed');
});
