import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveAggregateCommand,
  splitCommandChain,
} from '../scripts/lib/ciGateGraph.mjs';
import {
  scanEvidenceTree,
} from '../scripts/lib/alphaEvidenceChecker.mjs';
import {
  formatEvidenceIssue,
  validateEvidenceDocument,
} from '../src/contracts/evidenceSchemas.js';

const ALPHA_SCHEMA = 'spaceface.alphaEvidence.v1';
const TEST_FILE = '.\\test\\alpha\\evidence.json';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTHORITY_CHAIN = 'root `ARCHITECTURE.md` (technical) > `design/GDD_2_0.md` (design) > `design/spec2/00_MASTER_TASTE.md` (historical taste reference; visual tokens not binding)';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function describe(result) {
  return result.issues.map(formatEvidenceIssue).join('\n');
}

function assertIssue(result, expectedPath, expectedRule, label) {
  assert.equal(result.ok, false, `${label} should fail`);
  assert.ok(
    result.issues.some((issue) => issue.path === expectedPath && issue.rule === expectedRule),
    `${label} should report ${expectedPath} [${expectedRule}]:\n${describe(result)}`,
  );
}

function validate(doc) {
  return validateEvidenceDocument(doc, { file: TEST_FILE });
}

function primaryDocument(taskId = 'm0-alpha-evidence') {
  return {
    schema: ALPHA_SCHEMA,
    taskId,
    worktreeId: 'master@test+dirty',
    route: '/new-game/flight/flyby-focus',
    viewport: { width: 1440, height: 900 },
    runtime: { kind: 'browser', gpu: 'ANGLE (hardware)' },
    captureKind: 'browser',
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: true,
    checks: [{ name: 'headed flyby route', status: 'pass' }],
    artifacts: [{ kind: 'screenshot', path: `.devshots/alpha/${taskId}/capture.png` }],
    notes: ['Captured through the public keyboard and mouse route.'],
  };
}

function supportingDocument(taskId = 'm0-alpha-evidence') {
  return {
    schema: ALPHA_SCHEMA,
    taskId,
    worktreeId: 'master@test+dirty',
    route: 'contract/self-test',
    viewport: { width: 1, height: 1 },
    runtime: { kind: 'node', gpu: null },
    captureKind: 'synthetic',
    inputSource: 'fixture',
    injectedState: true,
    primaryAcceptance: false,
    checks: [
      { name: 'known passing support check', status: 'pass' },
      { name: 'known blocked support check', status: 'blocked' },
      { name: 'known failing support check', status: 'fail' },
    ],
    artifacts: [{ kind: 'report', path: `.devshots/alpha/${taskId}/report.json` }],
    notes: ['Supporting records may preserve failures and blockers.'],
  };
}

async function withTempRepo(run) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'spaceface-alpha-evidence-'));
  try {
    return await run(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

async function createEvidenceFileLink(targetFile, linkPath) {
  try {
    await symlink(targetFile, linkPath, 'file');
    return;
  } catch (error) {
    if (process.platform !== 'win32' || error?.code !== 'EPERM') throw error;
  }

  // Windows without Developer Mode cannot create file symlinks. A junction named
  // evidence.json is the equivalent reparse-point tree entry and must be rejected
  // before the walker asks whether it is a file or directory.
  const fallbackTarget = `${targetFile}.reparse-target`;
  await mkdir(fallbackTarget, { recursive: true });
  await writeFile(path.join(fallbackTarget, 'evidence.json'), await readFile(targetFile));
  await symlink(fallbackTarget, linkPath, 'junction');
}

async function writeRecord(repoRoot, doc, artifacts = []) {
  const taskRoot = path.join(repoRoot, '.devshots', 'alpha', doc.taskId);
  await mkdir(taskRoot, { recursive: true });
  for (const artifact of artifacts) {
    const artifactPath = path.join(repoRoot, artifact.path);
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, artifact.bytes);
  }
  await writeFile(path.join(taskRoot, 'evidence.json'), `${JSON.stringify(doc, null, 2)}\n`);
  return path.join(repoRoot, '.devshots', 'alpha');
}

function runSchemaMatrix() {
  const valid = primaryDocument();
  assert.equal(validate(valid).ok, true, `complete primary evidence should pass:\n${describe(validate(valid))}`);

  for (const field of [
    'schema',
    'taskId',
    'worktreeId',
    'route',
    'viewport',
    'runtime',
    'captureKind',
    'inputSource',
    'injectedState',
    'primaryAcceptance',
    'checks',
    'artifacts',
    'notes',
  ]) {
    const missing = clone(valid);
    delete missing[field];
    assertIssue(validate(missing), `$.${field}`, 'required', `missing ${field}`);
  }

  for (const artifactPath of [
    '.devshots/alpha/m0-alpha-evidence/capture.png:Zone.Identifier',
    '.devshots/alpha/m0-alpha-evidence/capture\u0007.png',
  ]) {
    const candidate = clone(valid);
    candidate.artifacts[0].path = artifactPath;
    assertIssue(validate(candidate), '$.artifacts[0].path', 'path', `unsafe artifact path ${JSON.stringify(artifactPath)}`);
  }

  for (const taskId of ['..', '../escape', 'bad:ads', 'bad/task']) {
    const candidate = clone(valid);
    candidate.taskId = taskId;
    assertIssue(validate(candidate), '$.taskId', 'pattern', `unsafe task id ${JSON.stringify(taskId)}`);
  }

  const mismatch = clone(valid);
  mismatch.runtime.kind = 'electron';
  assertIssue(validate(mismatch), '$.runtime.kind', 'captureRuntime', 'browser/electron runtime mismatch');

  const failedPrimary = clone(valid);
  failedPrimary.checks.push({ name: 'failed gate', status: 'fail' });
  assertIssue(validate(failedPrimary), '$.checks', 'primaryAcceptance', 'primary evidence with pass and fail checks');

  const noChecks = clone(valid);
  noChecks.checks = [];
  assertIssue(validate(noChecks), '$.checks', 'primaryAcceptance', 'primary evidence without checks');

  const noMedia = clone(valid);
  noMedia.artifacts = [{ kind: 'report', path: '.devshots/alpha/m0-alpha-evidence/report.json' }];
  assertIssue(validate(noMedia), '$.artifacts', 'primaryAcceptance', 'primary evidence without media');

  const supporting = supportingDocument();
  assert.equal(validate(supporting).ok, true, `supporting pass/fail/blocked checks should be valid:\n${describe(validate(supporting))}`);

  for (const [captureKind, runtimeKind] of [
    ['browser', 'browser'],
    ['electron', 'electron'],
    ['blender', 'blender'],
    ['synthetic', 'node'],
  ]) {
    const candidate = clone(supporting);
    candidate.captureKind = captureKind;
    candidate.runtime.kind = runtimeKind;
    candidate.runtime.gpu = ['browser', 'electron'].includes(runtimeKind) ? 'GPU' : null;
    assert.equal(validate(candidate).ok, true, `${captureKind} capture should pair with ${runtimeKind} runtime`);
  }

  for (const [captureKind, runtimeKind] of [
    ['browser', 'electron'],
    ['electron', 'browser'],
    ['blender', 'node'],
    ['synthetic', 'blender'],
  ]) {
    const candidate = clone(supporting);
    candidate.captureKind = captureKind;
    candidate.runtime.kind = runtimeKind;
    candidate.runtime.gpu = ['browser', 'electron'].includes(runtimeKind) ? 'GPU' : null;
    assertIssue(validate(candidate), '$.runtime.kind', 'captureRuntime', `${captureKind}/${runtimeKind} runtime mismatch`);
  }

  const browserWithoutGpu = clone(valid);
  browserWithoutGpu.runtime.gpu = '';
  assertIssue(validate(browserWithoutGpu), '$.runtime.gpu', 'type', 'browser capture without GPU provenance');
}

async function runRepositoryWiringAssertions() {
  const pkg = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['check:alpha:evidence'],
    'node scripts/check-alpha-evidence.mjs',
    'the real evidence command scans the default .devshots/alpha tree',
  );
  assert.equal(
    pkg.scripts['check:alpha:evidence:contract'],
    'node scripts/check-alpha-evidence.mjs --self-test',
    'the clean-CI contract command runs the rejection matrix',
  );
  for (const aggregate of ['check', 'check:ci']) {
    // `check:ci` delegates (`npm run check:ci:report` -> `node scripts/check-ci-report.mjs`), so its
    // own body lists none of the links it runs. Resolve the delegation to the chain the ci-report
    // runner expands; both assertions below then read the commands CI genuinely executes.
    const commands = splitCommandChain(resolveAggregateCommand(pkg.scripts, aggregate));
    assert.ok(
      commands.includes('npm run check:alpha:evidence:contract'),
      `${aggregate} must include the clean-CI evidence contract gate`,
    );
    assert.equal(
      commands.includes('npm run check:alpha:evidence'),
      false,
      `${aggregate} must not require ignored runtime evidence artifacts`,
    );
  }

  for (const relativePath of [
    'design/vision/00_CONSTITUTION.md',
    'design/vision/03_MASTER_BUILD_PLAN.md',
    'design/spec2/00_MASTER_TASTE.md',
  ]) {
    const head = (await readFile(path.join(PROJECT_ROOT, relativePath), 'utf8')).split(/\r?\n/).slice(0, 14).join('\n');
    const normalizedHead = head.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
    assert.ok(normalizedHead.includes(AUTHORITY_CHAIN), `${relativePath} must show the current authority chain at its top`);
    assert.ok(head.includes('design/vision/ALPHA_PROGRAM.md'), `${relativePath} must identify ALPHA_PROGRAM as current execution authority`);
  }

  const constitution = await readFile(path.join(PROJECT_ROOT, 'design/vision/00_CONSTITUTION.md'), 'utf8');
  assert.doesNotMatch(constitution, /\*\*Status:\*\* AUTHORITATIVE/, 'vision constitution is supporting framing, not authority');
  assert.equal(
    constitution.includes('This file supersedes conflicting clauses in `design/spec2/00_MASTER_TASTE.md`'),
    false,
    'vision constitution cannot supersede MASTER_TASTE',
  );

  const masterPlan = await readFile(path.join(PROJECT_ROOT, 'design/vision/03_MASTER_BUILD_PLAN.md'), 'utf8');
  const masterPlanHeading = masterPlan.split(/\r?\n/, 1)[0];
  assert.doesNotMatch(masterPlanHeading, /point agents here/i, 'supporting roadmap heading must not route agents here');
  assert.match(masterPlanHeading, /supporting|historical/i, 'supporting roadmap heading identifies its non-authoritative role');
  assert.doesNotMatch(masterPlan, /\*\*Status:\*\* LIVE execution authority/, 'old master plan is not current execution authority');
  assert.equal(masterPlan.includes('Use [`05_GOAL_PROMPTS.md`](./05_GOAL_PROMPTS.md) to dispatch.'), false, 'old goal prompts are not default dispatch');
  assert.equal(masterPlan.includes('Do not apply superseded MASTER_TASTE rules'), false, 'supporting roadmap cannot supersede taste rules');
  assert.doesNotMatch(masterPlan, /ignore[^\n]*constitution/i, 'supporting roadmap cannot tell agents to ignore rules in favor of the constitution');
  const normalizedMasterPlan = masterPlan.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
  assert.match(normalizedMasterPlan, /active only when `?ALPHA_PROGRAM\.md`? (?:cites|activates)/i);

  const taste = await readFile(path.join(PROJECT_ROOT, 'design/spec2/00_MASTER_TASTE.md'), 'utf8');
  assert.equal(
    taste.includes('Authority chain: 00_MASTER_TASTE > the specific spec2 file > design/GDD_2_0.md > older docs.'),
    false,
    'taste body must not retain the reversed authority chain',
  );
  assert.match(
    taste,
    /ARCHITECTURE\.md.*>.*GDD_2_0\.md.*>.*00_MASTER_TASTE\.md.*historical taste reference/is,
    'taste banner keeps architecture and GDD authoritative while marking taste historical',
  );
  assert.match(
    taste,
    /never outranks the\s+current program, an activated task spec, or stronger player-facing evidence/is,
    'taste body defers to the current program, activated task specs, and player-facing evidence',
  );

  const rootAgents = await readFile(path.join(PROJECT_ROOT, 'AGENTS.md'), 'utf8');
  const authorityHead = rootAgents.split(/\r?\n/).slice(0, 18).join('\n');
  assert.match(authorityHead, /00_MASTER_TASTE\.md[\s\S]*ALPHA_PROGRAM\.md[\s\S]*specific.*spec/i);
  const productRoute = rootAgents.split(/\r?\n/).find((line) => line.includes('Product sprints')) || '';
  assert.ok(
    productRoute.indexOf('vision/README.md') < productRoute.indexOf('vision/ALPHA_PROGRAM.md')
      && productRoute.indexOf('vision/ALPHA_PROGRAM.md') < productRoute.indexOf('vision/01_CURRENT_STATE.md'),
    'product sprint routing reads README then ALPHA_PROGRAM then current state',
  );
  assert.match(
    rootAgents.split(/\r?\n/).slice(0, 45).join('\n'),
    /00_CONSTITUTION\.md.*03_MASTER_BUILD_PLAN\.md.*supporting only when.*ALPHA_PROGRAM/i,
    'root routing marks the old constitution and master plan supporting-only unless activated',
  );

  const alphaProgram = await readFile(path.join(PROJECT_ROOT, 'design/vision/ALPHA_PROGRAM.md'), 'utf8');
  assert.ok(
    /\| 0\.1 \|[^\n]+\| Complete \|/.test(alphaProgram),
    'Task 0.1 is complete only after independent spec and quality approval',
  );
  assert.match(alphaProgram, /independent spec and quality reviews approved/i,
    'Task 0.1 completion records both independent approvals');
  assert.ok(alphaProgram.includes('npm run check:alpha:evidence:contract'), 'ledger names the clean-CI contract command');
  assert.ok(alphaProgram.includes('npm run check:alpha:evidence'), 'ledger names the real evidence scan command');
  assert.ok(
    alphaProgram.includes('.devshots/alpha/m0-alpha-evidence/evidence.json'),
    'ledger names the supporting M0.1 evidence record',
  );
}

async function runScannerMatrix() {
  await withTempRepo(async (repoRoot) => {
    const result = await scanEvidenceTree({ repoRoot, scanRoot: path.join(repoRoot, '.devshots', 'alpha') });
    assertIssue(result, '$', 'root', 'absent evidence root');
  });

  await withTempRepo(async (repoRoot) => {
    const scanRoot = path.join(repoRoot, '.devshots', 'alpha');
    await mkdir(scanRoot, { recursive: true });
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$', 'records', 'evidence root without records');
  });

  await withTempRepo(async (repoRoot) => {
    const taskRoot = path.join(repoRoot, '.devshots', 'alpha', 'malformed');
    await mkdir(taskRoot, { recursive: true });
    await writeFile(path.join(taskRoot, 'evidence.json'), '{ definitely-not-json');
    const result = await scanEvidenceTree({ repoRoot, scanRoot: path.join(repoRoot, '.devshots', 'alpha') });
    assertIssue(result, '$', 'parse', 'malformed evidence JSON');
  });

  const validMedia = [
    ['screenshot', 'png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
    ['screenshot', 'jpg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ['screenshot', 'webp', Buffer.from('RIFF0000WEBP', 'ascii')],
    ['video', 'mp4', Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])],
    ['video', 'webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00])],
  ];
  for (const [kind, extension, bytes] of validMedia) {
    await withTempRepo(async (repoRoot) => {
      const taskId = `valid-${extension}`;
      const doc = primaryDocument(taskId);
      doc.artifacts = [{ kind, path: `.devshots/alpha/${taskId}/capture.${extension}` }];
      const scanRoot = await writeRecord(repoRoot, doc, [{ path: doc.artifacts[0].path, bytes }]);
      const result = await scanEvidenceTree({ repoRoot, scanRoot });
      assert.equal(result.ok, true, `${extension} magic should pass:\n${describe(result)}`);
      assert.equal(result.recordCount, 1, `${extension} scan should count one evidence record`);
    });
  }

  await withTempRepo(async (repoRoot) => {
    const doc = supportingDocument();
    const scanRoot = await writeRecord(repoRoot, doc, [
      { path: doc.artifacts[0].path, bytes: Buffer.from('{"supporting":true}\n') },
    ]);
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assert.equal(result.ok, true, `supporting fail/blocked record should pass:\n${describe(result)}`);

    const cli = spawnSync(
      process.execPath,
      [path.join(PROJECT_ROOT, 'scripts', 'check-alpha-evidence.mjs'), '--root', scanRoot],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.equal(cli.status, 0, `--root CLI should scan real records:\n${cli.stdout}\n${cli.stderr}`);
    assert.match(cli.stdout, /PASS alpha evidence scan: 1 record\(s\)/);
  });

  await withTempRepo(async (repoRoot) => {
    const doc = supportingDocument('supporting-fake-png');
    doc.artifacts = [{ kind: 'screenshot', path: '.devshots/alpha/supporting-fake-png/capture.png' }];
    const scanRoot = await writeRecord(repoRoot, doc, [
      { path: doc.artifacts[0].path, bytes: Buffer.from('{"not":"an image"}\n') },
    ]);
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$.artifacts[0].path', 'mediaMagic', 'supporting JSON renamed to PNG');
  });

  await withTempRepo(async (repoRoot) => {
    const doc = supportingDocument('supporting-wrong-extension');
    doc.artifacts = [{ kind: 'screenshot', path: '.devshots/alpha/supporting-wrong-extension/capture.txt' }];
    const scanRoot = await writeRecord(repoRoot, doc, [
      { path: doc.artifacts[0].path, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    ]);
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$.artifacts[0].path', 'mediaExtension', 'supporting PNG labeled with a text extension');
  });

  await withTempRepo(async (repoRoot) => {
    const doc = primaryDocument('fake-package-screenshot');
    const scanRoot = await writeRecord(repoRoot, doc, [
      { path: doc.artifacts[0].path, bytes: Buffer.from('{"name":"spaceface"}\n') },
    ]);
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$.artifacts[0].path', 'mediaMagic', 'package JSON renamed to PNG');
  });

  await withTempRepo(async (repoRoot) => {
    const doc = primaryDocument('missing-artifact');
    const scanRoot = await writeRecord(repoRoot, doc);
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$.artifacts[0].path', 'artifactExists', 'nonexistent artifact');
  });

  await withTempRepo(async (repoRoot) => {
    const doc = primaryDocument('wrong-extension');
    doc.artifacts[0].path = '.devshots/alpha/wrong-extension/capture.txt';
    const scanRoot = await writeRecord(repoRoot, doc, [
      { path: doc.artifacts[0].path, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    ]);
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$.artifacts[0].path', 'mediaExtension', 'PNG magic with disallowed extension');
  });

  await withTempRepo(async (repoRoot) => {
    const doc = primaryDocument('contained-task');
    doc.artifacts[0].path = '.devshots/alpha/different-task/capture.png';
    const scanRoot = await writeRecord(repoRoot, doc, [
      { path: doc.artifacts[0].path, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    ]);
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$.artifacts[0].path', 'artifactContainment', 'artifact outside its task directory');
  });

  await withTempRepo(async (repoRoot) => {
    const taskId = 'junction-artifact';
    const doc = supportingDocument(taskId);
    doc.artifacts = [{ kind: 'report', path: `.devshots/alpha/${taskId}/linked-outside/report.json` }];
    const scanRoot = await writeRecord(repoRoot, doc);
    const outsideRoot = path.join(repoRoot, 'outside-artifacts');
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(path.join(outsideRoot, 'report.json'), '{"outside":true}\n');
    await symlink(
      outsideRoot,
      path.join(repoRoot, '.devshots', 'alpha', taskId, 'linked-outside'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$.artifacts[0].path', 'artifactContainment', 'artifact junction escaping its task directory');
  });

  await withTempRepo(async (repoRoot) => {
    const outsideAlpha = path.join(repoRoot, 'outside-alpha');
    const taskId = 'junction-root';
    const doc = supportingDocument(taskId);
    const outsideTask = path.join(outsideAlpha, taskId);
    await mkdir(outsideTask, { recursive: true });
    await writeFile(path.join(outsideTask, 'evidence.json'), `${JSON.stringify(doc, null, 2)}\n`);
    await writeFile(path.join(outsideTask, 'report.json'), '{"outside":true}\n');
    await mkdir(path.join(repoRoot, '.devshots'), { recursive: true });
    const scanRoot = path.join(repoRoot, '.devshots', 'alpha');
    await symlink(outsideAlpha, scanRoot, process.platform === 'win32' ? 'junction' : 'dir');
    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$', 'root', 'evidence-root junction escape');
  });

  await withTempRepo(async (repoRoot) => {
    const valid = supportingDocument('valid-beside-linked-task');
    const scanRoot = await writeRecord(repoRoot, valid, [
      { path: valid.artifacts[0].path, bytes: Buffer.from('{"valid":true}\n') },
    ]);

    const outsideTask = path.join(repoRoot, 'outside-linked-task');
    const linked = supportingDocument('outside-linked-task');
    await mkdir(outsideTask, { recursive: true });
    await writeFile(path.join(outsideTask, 'evidence.json'), `${JSON.stringify(linked, null, 2)}\n`);
    await writeFile(path.join(outsideTask, 'report.json'), '{"outside":true}\n');
    await symlink(
      outsideTask,
      path.join(scanRoot, 'nested-task-link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$', 'unsafeTreeEntry', 'nested task directory junction beside a valid record');
    assert.equal(result.recordCount, 1, 'unsafe linked task is rejected rather than followed or counted');
  });

  await withTempRepo(async (repoRoot) => {
    const valid = supportingDocument('valid-beside-linked-file');
    const scanRoot = await writeRecord(repoRoot, valid, [
      { path: valid.artifacts[0].path, bytes: Buffer.from('{"valid":true}\n') },
    ]);

    const outsideEvidence = path.join(repoRoot, 'outside-evidence.json');
    await writeFile(outsideEvidence, `${JSON.stringify(supportingDocument('linked-file-task'), null, 2)}\n`);
    const linkedTask = path.join(scanRoot, 'linked-file-task');
    await mkdir(linkedTask, { recursive: true });
    await createEvidenceFileLink(outsideEvidence, path.join(linkedTask, 'evidence.json'));

    const result = await scanEvidenceTree({ repoRoot, scanRoot });
    assertIssue(result, '$', 'unsafeTreeEntry', 'evidence.json file symlink beside a valid record');
    assert.equal(result.recordCount, 1, 'unsafe linked evidence file is rejected rather than followed or counted');
  });
}

export async function runAlphaEvidenceContractTests() {
  runSchemaMatrix();
  await runScannerMatrix();
  await runRepositoryWiringAssertions();
  console.log('PASS alpha evidence contract: schema rejection matrix and real filesystem scanner');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  await runAlphaEvidenceContractTests();
}
