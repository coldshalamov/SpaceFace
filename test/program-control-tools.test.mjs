import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ProgramControlError,
  dispatchUnitReady,
  evidenceDependenciesSatisfied,
  parsePacketDocument,
  readyDispatchUnits,
  selectNextPacket,
  validateControlPlane,
  validateQueueDocument,
} from '../scripts/lib/programControlPlane.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())), `refusing to remove non-temp path ${root}`);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function row(id, priority, state, dependsOn = []) {
  return {
    id,
    priority,
    title: `Packet ${id}`,
    state,
    canonical: [`CANON-${id}`],
    aliases: [`ALIAS-${id}`],
    dependsOn,
    mutexes: [],
    sources: ['design/source.md'],
    checks: ['npm run check:example'],
    evidence: ['focused'],
    brief: `Brief for ${id}`,
  };
}

function queue(tasks) {
  return {
    schemaVersion: 1,
    stateContract: {
      allowed: [
        'planned',
        'ready',
        'claimed',
        'implemented',
        'focused_green',
        'route_accepted',
        'integrated',
        'blocked',
        'deferred',
        'historical',
      ],
      checkedOff: ['integrated', 'historical'],
      integrationRequires: ['integratedCommit', 'acceptanceRef', 'receipt'],
    },
    tasks,
  };
}

function integrated(id, priority, commit = '01234567') {
  return {
    ...row(id, priority, 'integrated'),
    integratedCommit: commit,
    acceptanceRef: 'design/receipt.md',
    receipt: 'design/receipt.md',
  };
}

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function controlRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spaceface-program-control-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'design', 'program', 'roadmap', 'active'), { recursive: true });
  fs.writeFileSync(path.join(root, 'design', 'source.md'), '# Source\n');
  fs.writeFileSync(path.join(root, 'design', 'receipt.md'), '# Receipt\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { 'check:example': 'node --version' },
  }));
  runGit(root, ['init', '--quiet']);
  runGit(root, ['config', 'user.email', 'program-control@example.invalid']);
  runGit(root, ['config', 'user.name', 'Program Control Test']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '--quiet', '-m', 'fixture']);
  return { root, commit: runGit(root, ['rev-parse', 'HEAD']) };
}

function packetText(id, overrides = {}) {
  const metadata = {
    queueId: id,
    lifecycle: 'planned',
    acceptance: 'unproven',
    packetRevision: '1',
    owner: 'unclaimed',
    ...overrides,
  };
  return `<!-- LIFETIME: ACTIVE_PACKET -->
# ${id}

\`\`\`yaml
${Object.entries(metadata).map(([key, value]) => `${key}: ${value}`).join('\n')}
\`\`\`

## Outcome
Test outcome.
`;
}

test('queue validation fails closed on missing fields that alter dispatch', () => {
  const missingPriority = row('PQ-001', 1, 'planned');
  delete missingPriority.priority;
  assert.throws(
    () => validateQueueDocument(queue([missingPriority])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('priority must be a positive integer')),
  );

  const missingDependencyList = row('PQ-001', 1, 'planned');
  delete missingDependencyList.dependsOn;
  assert.throws(
    () => validateQueueDocument(queue([missingDependencyList])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('dependsOn must be an array')),
  );

  const selfAuthorizing = queue([row('PQ-001', 1, 'integrated')]);
  selfAuthorizing.stateContract.integrationRequires = [];
  assert.throws(
    () => validateQueueDocument(selfAuthorizing),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('integrationRequires must contain exactly')),
  );

  const unknownSchema = queue([row('PQ-001', 1, 'planned')]);
  unknownSchema.schemaVersion = 2;
  assert.throws(
    () => validateQueueDocument(unknownSchema),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('schemaVersion must be 1')),
  );
});

test('checked-off dependencies require exact evidence and historical waiver', () => {
  const incomplete = row('PQ-001', 1, 'integrated');
  assert.throws(
    () => validateQueueDocument(queue([incomplete])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('integratedCommit')),
  );

  const historical = {
    ...integrated('PQ-001', 1),
    state: 'historical',
  };
  assert.throws(
    () => validateQueueDocument(queue([historical])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('dependencyWaiver')),
  );

  historical.dependencyWaiver = 'Superseded by PQ-002 receipt';
  assert.doesNotThrow(() => validateQueueDocument(queue([historical])));
});

test('packet metadata must be authoritative top matter and portfolio containers are blocked', () => {
  const spoofed = `<!-- LIFETIME: ACTIVE_PACKET -->
# PQ-001

Text first.

\`\`\`yaml
queueId: PQ-001
lifecycle: planned
acceptance: unproven
packetRevision: 1
owner: unclaimed
\`\`\``;
  assert.throws(() => parsePacketDocument(spoofed, 'spoofed.md'), ProgramControlError);

  assert.throws(
    () => parsePacketDocument(packetText('PQ-001', {
      owner: 'portfolio-container',
      dispatchPolicy: 'leaf_required',
    }), 'portfolio.md'),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('must remain blocked')),
  );

  assert.doesNotThrow(() => parsePacketDocument(packetText('PQ-001', {
    lifecycle: 'blocked',
    owner: 'portfolio-container',
    dispatchPolicy: 'leaf_required',
  }), 'portfolio.md'));
});

test('selection requires verified integration evidence and skips blocked leaf containers', () => {
  const { root, commit } = controlRoot();
  const activeDir = path.join(root, 'design', 'program', 'roadmap', 'active');

  const dependency = integrated('PQ-001', 1, commit);
  const direct = row('PQ-002', 2, 'planned', ['PQ-001']);
  const container = row('PQ-003', 3, 'planned', ['PQ-001']);
  fs.writeFileSync(path.join(activeDir, 'PQ-002.md'), packetText('PQ-002'));
  fs.writeFileSync(path.join(activeDir, 'PQ-003.md'), packetText('PQ-003', {
    lifecycle: 'blocked',
    owner: 'portfolio-container',
    dispatchPolicy: 'leaf_required',
  }));

  const unverified = validateQueueDocument(queue([dependency, direct, container]));
  assert.equal(selectNextPacket(unverified, root), null);
  const control = validateControlPlane(root, queue([dependency, direct, container]));
  assert.equal(selectNextPacket(control, root)?.row.id, 'PQ-002');

  direct.state = 'integrated';
  Object.assign(direct, {
    integratedCommit: commit,
    acceptanceRef: 'design/receipt.md',
    receipt: 'design/receipt.md',
  });
  const onlyContainer = validateControlPlane(root, queue([dependency, direct, container]));
  assert.equal(selectNextPacket(onlyContainer, root), null);
});

test('dispatch rejects missing, non-commit, and unavailable integration evidence', () => {
  const { root, commit } = controlRoot();
  const valid = integrated('PQ-001', 1, commit);
  assert.doesNotThrow(() => validateControlPlane(root, queue([valid])));

  const missingReceipt = { ...valid, receipt: 'design/missing.md' };
  assert.throws(
    () => validateControlPlane(root, queue([missingReceipt])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('missing path design/missing.md')),
  );

  const blob = runGit(root, ['hash-object', 'design/source.md']);
  const nonCommit = { ...valid, integratedCommit: blob };
  assert.throws(
    () => validateControlPlane(root, queue([nonCommit])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('integratedCommit is unavailable')),
  );

  const unavailable = { ...valid, integratedCommit: 'deadbeef' };
  assert.throws(
    () => validateControlPlane(root, queue([unavailable])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('integratedCommit is unavailable')),
  );
});

test('structured leaf evidence is a semantic, committed-blob dispatch gate', () => {
  const { root, commit } = controlRoot();
  const activeDir = path.join(root, 'design', 'program', 'roadmap', 'active');
  const dependency = integrated('PQ-001', 1, commit);
  const target = row('PQ-002', 2, 'planned', ['PQ-001']);
  target.evidenceDependencies = [{
    packetId: 'PQ-001',
    leafId: 'PQ-001.accepted-leaf',
    requiredAcceptance: 'route_accepted',
    receipt: 'design/leaf-receipt.md',
    receiptBlob: null,
  }];
  fs.writeFileSync(path.join(activeDir, 'PQ-002.md'), packetText('PQ-002'));

  const unresolved = validateControlPlane(root, queue([dependency, target]));
  assert.equal(evidenceDependenciesSatisfied(target, unresolved), false);
  assert.equal(selectNextPacket(unresolved, root), null);

  fs.writeFileSync(path.join(root, 'design', 'leaf-receipt.md'), `<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-001
leafId: PQ-001.accepted-leaf
acceptance: route_accepted
disposition: PASS
candidateCommit: ${commit}
-->
# Accepted leaf
`);
  runGit(root, ['add', 'design/leaf-receipt.md']);
  runGit(root, ['commit', '--quiet', '-m', 'accepted leaf receipt']);
  target.evidenceDependencies[0].receiptBlob = runGit(
    root,
    ['rev-parse', 'HEAD:design/leaf-receipt.md'],
  );
  const resolved = validateControlPlane(root, queue([dependency, target]));
  assert.equal(evidenceDependenciesSatisfied(target, resolved), true);
  assert.equal(selectNextPacket(resolved, root)?.row.id, 'PQ-002');

  target.evidenceDependencies[0].requiredAcceptance = 'milestone_accepted';
  assert.throws(
    () => validateControlPlane(root, queue([dependency, target])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('receipt acceptance route_accepted does not match')),
  );
  target.evidenceDependencies[0].requiredAcceptance = 'route_accepted';

  target.evidenceDependencies[0].leafId = 'PQ-001.other-leaf';
  assert.throws(
    () => validateControlPlane(root, queue([dependency, target])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('receipt leafId PQ-001.accepted-leaf does not match')),
  );
  target.evidenceDependencies[0].leafId = 'PQ-001.accepted-leaf';

  target.evidenceDependencies[0].receiptBlob = '0'.repeat(40);
  assert.throws(
    () => validateControlPlane(root, queue([dependency, target])),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('receipt Git blob mismatch')),
  );
});

test('dispatcher rejects conflicting modes and unknown flags', () => {
  const script = path.join(ROOT, 'scripts', 'program-dispatch.mjs');
  const conflicting = spawnSync(process.execPath, [script, '--list', '--next'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(conflicting.status, 2);
  assert.match(conflicting.stderr, /choose exactly one/);

  const unknown = spawnSync(process.execPath, [script, '--next', '--typo'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown option/);
});

test('dispatch units expose exact ready work and fail closed on incomplete checkoff', () => {
  const parsed = queue([
    row('PQ-001', 1, 'planned'),
    row('PQ-002', 2, 'planned'),
  ]);
  parsed.dispatchUnits = [
    {
      id: 'PQ-001.headless',
      parentId: 'PQ-001',
      priority: 1,
      title: 'Headless implementation',
      kind: 'implementation',
      state: 'done',
      dependsOn: [],
      mutexes: [],
      paths: ['src/example.js'],
      checks: ['npm run check:example'],
      receiptRefs: ['design/receipt.md'],
      brief: 'Completed implementation slice.',
    },
    {
      id: 'PQ-001.acceptance-repair',
      parentId: 'PQ-001',
      priority: 2,
      title: 'Repair the acceptance harness',
      kind: 'acceptance_repair',
      state: 'ready',
      dependsOn: ['PQ-001.headless'],
      mutexes: ['validation-harness'],
      paths: ['scripts/example.mjs'],
      checks: ['npm run check:example'],
      receiptRefs: [],
      brief: 'Repair the reproduced harness defect without launching headed acceptance.',
    },
    {
      id: 'PQ-002.capture',
      parentId: 'PQ-002',
      priority: 3,
      title: 'Run capture',
      kind: 'acceptance_capture',
      state: 'blocked',
      dependsOn: ['PQ-001.acceptance-repair'],
      mutexes: ['browser-gpu'],
      paths: ['scripts/example.mjs'],
      checks: ['npm run check:example'],
      receiptRefs: [],
      brief: 'Run one broker capture after the repair lands.',
      blocker: 'The acceptance repair is not done.',
    },
  ];
  const control = validateQueueDocument(parsed);
  assert.equal(dispatchUnitReady(control.dispatchById.get('PQ-001.acceptance-repair'), control), true);
  assert.deepEqual(
    readyDispatchUnits(control).map((unit) => unit.id),
    ['PQ-001.acceptance-repair'],
  );

  parsed.dispatchUnits[0].receiptRefs = [];
  assert.throws(
    () => validateQueueDocument(parsed),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('done requires at least one receiptRefs')),
  );

  parsed.dispatchUnits[0].receiptRefs = ['design/missing-receipt.md'];
  assert.throws(
    () => validateControlPlane(ROOT, parsed),
    (error) => error instanceof ProgramControlError
      && error.details.some((detail) => detail.includes('missing path design/missing-receipt.md')),
  );
});

test('program-doc checker validates the live control plane and rejects unknown flags', () => {
  const script = path.join(ROOT, 'scripts', 'check-program-docs.mjs');
  const live = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(live.status, 0, live.stderr);
  assert.match(live.stdout, /program-docs: PASS/);

  const unknown = spawnSync(process.execPath, [script, '--typo'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown option/);
});
