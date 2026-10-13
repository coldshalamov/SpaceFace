import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  PLAN_CHAIN,
  nextPlanUnit,
  planStatus,
} from '../scripts/lib/planFrontDoor.mjs';
import { validateControlPlane } from '../scripts/lib/programControlPlane.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVENESS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-now-liveness.mjs');

const tempRoots = [];
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spaceface-plan-front-door-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'design', 'program', 'roadmap'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { 'check:example': 'node --version' } }),
  );
  fs.writeFileSync(path.join(root, 'design', 'source.md'), '# Source\n');
  // The stale-adoption leg spawns the real liveness script; a fixture root needs its own copy
  // (it resolves the repo root from its own location) and a NOW.md to read.
  fs.copyFileSync(LIVENESS_SCRIPT, path.join(root, 'scripts', 'check-now-liveness.mjs'));
  fs.writeFileSync(path.join(root, 'design', 'program', 'NOW.md'), [
    '# NOW — threads changing the shared checkout',
    '',
    '## Active mutation windows',
    '',
    '| Task | Thread | State | Exact paths being changed now | Next terminal action |',
    '|---|---|---|---|---|',
    '',
  ].join('\n'));
  return root;
}

function writeLedger(root, rows) {
  fs.writeFileSync(path.join(root, 'design', 'program', 'DEMO_READINESS_2026-09-20.md'), [
    '# Demo readiness',
    '',
    '## 6. The demo defect ledger',
    '',
    '| # | Where | What | Demo step | State |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '## 7. Another section',
    '',
  ].join('\n'));
}

function writeBoard(root, { seams = true } = {}) {
  fs.writeFileSync(path.join(root, 'build_map.md'), [
    '# Build map',
    '',
    '## 1C. The board',
    '',
    ...(seams
      ? [
        '| Seam | Claim | Files — one agent | Rows, in order |',
        '|---|---|---|---|',
        '| accept | free | src/thing.js | 100 |',
        '| reservoir | wf-x | catalogs | 285 |',
        '',
      ]
      : []),
    '| 100 | ACC-1 | do the thing | OPEN — pending |',
    '| 285 | ADMIT-SFQ-B | admit the next catalog level | OPEN — serial, one level per sitting |',
    '',
    '## 2. Another section',
    '',
  ].join('\n'));
}

function writeInference(root, rows = []) {
  fs.writeFileSync(path.join(root, 'design', 'program', 'INFERENCE_IDEAS.md'), [
    '# INFERENCE ideas',
    '',
    '| Id | Change | Paths | Done | Do not | Status |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n'));
}

function writeVmDrop(root, name = 'job-a') {
  const jobDir = path.join(root, 'design', 'program', 'vm-drop', name);
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'DONE.md'), '# DONE\n');
  fs.writeFileSync(path.join(jobDir, 'IMPORT.md'), '# IMPORT\n');
}

const LEDGER_STATES = {
  contract: {
    allowed: [
      'planned', 'ready', 'claimed', 'implemented', 'focused_green',
      'route_accepted', 'integrated', 'blocked', 'deferred', 'historical',
    ],
    checkedOff: ['integrated', 'historical'],
    integrationRequires: ['integratedCommit', 'acceptanceRef', 'receipt'],
  },
};

function taskRow(id, priority, state, dependsOn = []) {
  return {
    id,
    priority,
    title: `Packet ${id}`,
    state,
    canonical: [`CANON-${id}`],
    aliases: [],
    dependsOn,
    mutexes: [],
    sources: ['design/source.md'],
    checks: ['npm run check:example'],
    evidence: ['focused'],
    brief: `Brief for ${id}`,
  };
}

function unitRow(id, parentId, priority, overrides = {}) {
  return {
    id,
    parentId,
    priority,
    title: `Unit ${id}`,
    kind: 'implementation',
    state: 'ready',
    dependsOn: [],
    mutexes: [],
    paths: ['src/thing.js'],
    checks: ['npm run check:example'],
    receiptRefs: [],
    brief: `Brief for ${id}`,
    ...overrides,
  };
}

function controlOf(root, document) {
  return validateControlPlane(root, document, { allowNoGit: true });
}

test('the precedence chain names every leg in dispatch order', () => {
  assert.deepEqual([...PLAN_CHAIN], [
    'defect-ledger',
    'now-adoption',
    'queue-unit',
    'legacy-packet',
    'ledger-change-loop',
    'board-seam',
    'reservoir-admission',
    'vm-drop-import',
    'inference',
  ]);
});

test('a specific open ledger defect outranks every other surface', () => {
  const root = makeRoot();
  writeLedger(root, [
    '| D901 | route X | a broken thing a player hits | Open the game | OPEN 2026-10-12. Fix the thing. |',
    '| D902 | route Y | a standing perf loop | Fly | open as a change-loop: pick a site, change the code, re-run the fixture |',
    '| D903 | route Z | diagnosed, waiting on a resoak | Menu | DIAGNOSED + FIXED, pending resoak on the quiet host |',
  ]);
  writeBoard(root);
  writeVmDrop(root);
  writeInference(root, ['| TOOL-99 | a change | src/x.js | done check | do not | OPEN |']);

  const { unit, skipped } = nextPlanUnit(root, {});
  assert.equal(unit.source, 'defect-ledger');
  assert.equal(unit.kind, 'open');
  assert.equal(unit.id, 'D901');
  assert.match(unit.instruction, /delete|remove.*row/s);
  // Watch rows and loop rows stay in the counts but never win over an open row.
  const status = planStatus(root, {});
  assert.deepEqual(status.surfaces.ledger.open, ['D901']);
  assert.deepEqual(status.surfaces.ledger.changeLoops, ['D902']);
  assert.deepEqual(status.surfaces.ledger.watchOnly, ['D903']);
  assert.equal(status.plan, 'ready');
  assert.deepEqual(skipped, []);
});

test('a standing change-loop ranks below fresh queue build work', () => {
  const root = makeRoot();
  writeLedger(root, [
    '| D902 | route Y | a standing perf loop | Fly | open as a change-loop: pick a site, change the code |',
  ]);
  writeBoard(root);
  const document = {
    schemaVersion: 1,
    stateContract: LEDGER_STATES.contract,
    tasks: [taskRow('PQ-900', 1, 'planned')],
    dispatchUnits: [unitRow('PQ-900.build', 'PQ-900', 1)],
  };
  const control = controlOf(root, document);

  const withQueue = nextPlanUnit(root, { control });
  assert.equal(withQueue.unit.source, 'queue-unit');
  assert.equal(withQueue.unit.id, 'PQ-900.build');

  document.dispatchUnits[0].state = 'claimed';
  const drainedQueue = nextPlanUnit(root, { control: controlOf(root, document) });
  assert.equal(drainedQueue.unit.source, 'defect-ledger');
  assert.equal(drainedQueue.unit.kind, 'change-loop');
  assert.match(drainedQueue.unit.instruction, /change-loop/);
});

test('fresh lookahead reservations fall through to the next leg; --include-reserved overrides', () => {
  const root = makeRoot();
  writeLedger(root, [
    '| D902 | route Y | a standing perf loop | Fly | open as a change-loop: pick a site |',
  ]);
  writeBoard(root);
  const document = {
    schemaVersion: 1,
    stateContract: LEDGER_STATES.contract,
    tasks: [taskRow('PQ-900', 1, 'planned')],
    dispatchUnits: [unitRow('PQ-900.build', 'PQ-900', 1)],
  };
  const control = controlOf(root, document);
  const reservations = new Map([['PQ-900.build', [{ owner: 'someone', checkpoint: 'x', ageMinutes: 5 }]]]);

  const reserved = nextPlanUnit(root, { control, reservations });
  assert.equal(reserved.unit.source, 'defect-ledger');
  assert.equal(reserved.unit.kind, 'change-loop');
  assert.ok(reserved.skipped.some((entry) => entry.leg === 'queue-unit' && entry.reason.includes('reservations')));

  const forced = nextPlanUnit(root, { control, reservations, includeReserved: true });
  assert.equal(forced.unit.source, 'queue-unit');
});

test('the board seam and reservoir legs answer when the queue is drained', () => {
  const root = makeRoot();
  writeLedger(root, [
    '| D903 | route Z | diagnosed | Menu | DIAGNOSTIC only, not player-facing |',
  ]);
  writeBoard(root);

  const seamUnit = nextPlanUnit(root, {});
  assert.equal(seamUnit.unit.source, 'board-seam');
  assert.equal(seamUnit.unit.id, 'seam:accept');
  assert.deepEqual(seamUnit.unit.rows, [100]);

  // With the seam claimed by someone else, the reservoir admission row is the remaining plan.
  fs.writeFileSync(path.join(root, 'build_map.md'), [
    '# Build map',
    '',
    '## 1C. The board',
    '',
    '| Seam | Claim | Files — one agent | Rows, in order |',
    '|---|---|---|---|',
    '| accept | some-lane | src/thing.js | 100 |',
    '| reservoir | wf-x | catalogs | 285 |',
    '',
    '| 100 | ACC-1 | do the thing | OPEN — pending |',
    '| 285 | ADMIT-SFQ-B | admit the next catalog level | OPEN — serial, one level per sitting |',
    '',
    '## 2. Another section',
    '',
  ].join('\n'));
  const reservoirUnit = nextPlanUnit(root, {});
  assert.equal(reservoirUnit.unit.source, 'reservoir-admission');
  assert.equal(reservoirUnit.unit.id, 'ADMIT-SFQ-B');
  assert.equal(reservoirUnit.unit.boardRow, 285);
});

test('an unreadable surface is a recorded skip, never a dead board', () => {
  const root = makeRoot();
  writeLedger(root, [
    '| D903 | route Z | diagnosed | Menu | DIAGNOSTIC only |',
  ]);
  writeVmDrop(root);
  // No build_map.md at all: both board legs must fail safely.
  const { unit, skipped } = nextPlanUnit(root, {});
  assert.equal(unit.source, 'vm-drop-import');
  assert.equal(unit.id, 'vm-drop:job-a');
  const failedLegs = skipped.filter((entry) => entry.reason.startsWith('error:'));
  assert.deepEqual(failedLegs.map((entry) => entry.leg), ['board-seam', 'reservoir-admission']);
});

test('the inference catalog dispatches only with the lane flag', () => {
  const root = makeRoot();
  writeLedger(root, [
    '| D903 | route Z | diagnosed | Menu | DIAGNOSTIC only |',
  ]);
  fs.writeFileSync(path.join(root, 'build_map.md'), [
    '# Build map',
    '',
    '## 1C. The board',
    '',
    '| Seam | Claim | Files — one agent | Rows, in order |',
    '|---|---|---|---|',
    '| accept | free | src/thing.js | |',
    '',
    '## 2. Another section',
    '',
  ].join('\n'));
  writeInference(root, ['| TOOL-99 | a change | src/x.js | done check | do not | OPEN |']);

  const gated = nextPlanUnit(root, {});
  assert.equal(gated.unit, null);
  assert.ok(gated.skipped.some((entry) => entry.leg === 'inference' && entry.reason.includes('gated')));
  const status = planStatus(root, {});
  assert.equal(status.plan, 'all-closed');

  const opened = nextPlanUnit(root, { lane: 'inference' });
  assert.equal(opened.unit.source, 'inference');
  assert.match(opened.unit.instruction, /INFERENCE/);
});

test('expired integration evidence never blocks dispatch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spaceface-plan-expired-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'design', 'program', 'roadmap'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { 'check:example': 'node --version' } }));
  fs.writeFileSync(path.join(root, 'design', 'source.md'), '# Source\n');
  fs.writeFileSync(path.join(root, 'design', 'receipt.md'), '# Receipt\n');
  const run = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  run(['init', '--quiet']);
  run(['config', 'user.email', 'front-door@example.invalid']);
  run(['config', 'user.name', 'Front Door Test']);
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'fixture']);

  // The integrated row's proof commit was lost to history maintenance (the 2026-09-08 squash
  // did this to 40+ rows); the front door must still dispatch ready units.
  const integrated = {
    ...taskRow('PQ-900', 1, 'integrated'),
    integratedCommit: 'deadbeef',
    acceptanceRef: 'design/receipt.md',
    receipt: 'design/receipt.md',
  };
  fs.writeFileSync(path.join(root, 'design', 'program', 'NOW.md'), '');
  const document = {
    schemaVersion: 1,
    stateContract: LEDGER_STATES.contract,
    tasks: [integrated],
    dispatchUnits: [],
  };
  const control = validateControlPlane(root, document);
  assert.ok(control.integrationEvidenceExpired.has('PQ-900'));
  assert.ok(control.warnings.some((warning) => warning.includes('expired evidence')));

  // A ready unit on top of the expired row dispatches; a dependent row's gate is satisfied.
  document.tasks.push(taskRow('PQ-901', 2, 'planned', ['PQ-900']));
  document.dispatchUnits.push(unitRow('PQ-901.build', 'PQ-901', 2));
  const control2 = validateControlPlane(root, document);
  const { unit } = nextPlanUnit(root, { control: control2 });
  assert.equal(unit.source, 'queue-unit');
  assert.equal(unit.id, 'PQ-901.build');
});

test('planStatus is honest when every ungated surface is closed', () => {
  const root = makeRoot();
  writeLedger(root, [
    '| D903 | route Z | diagnosed | Menu | DIAGNOSTIC only |',
  ]);
  // No open rows and no admission rows anywhere on the board.
  fs.writeFileSync(path.join(root, 'build_map.md'), [
    '# Build map',
    '',
    '## 1C. The board',
    '',
    '| Seam | Claim | Files — one agent | Rows, in order |',
    '|---|---|---|---|',
    '| accept | free | src/thing.js | |',
    '',
    '## 2. Another section',
    '',
  ].join('\n'));
  writeInference(root, ['| TOOL-98 | another | src/y.js | done | no | CLAIMED |']);

  const status = planStatus(root, {});
  assert.equal(status.plan, 'all-closed');
  assert.equal(status.next, null);
  assert.equal(status.surfaces.inference.open, 0);
  assert.equal(status.surfaces.inference.claimed, 1);
  assert.equal(status.surfaces.board.openRowCount, 0);
});
