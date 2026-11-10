import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { probeReadiness, classifyReadiness, parseArgs } from '../scripts/check-continuation-readiness.mjs';

const timestamp = '2026-10-08T00:00:00.000Z';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'continuation-readiness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '--initial-branch=fixture');
  writeFileSync(join(root, 'package.json'), '{"private":true}');
  writeFileSync(join(root, 'source.js'), 'export const value = 1;\n');
  git('add', '--', 'package.json', 'source.js');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  return { root, git };
}
const inspect = (root, extra = {}) => probeReadiness({ root, sources: ['source.js'],
  dependencies: ['node:fs'], now: () => timestamp, ...extra });

test('missing local checkout never claims the public repository or connector is unavailable', t => {
  const { root } = fixture(t);
  const report = inspect(join(root, 'absent'));
  assert.equal(report.readiness.localImplementation.status, 'needs_local_action');
  assert.equal(report.probes[0].kind, 'checkout');
  assert.equal(report.probes[0].status, 'failed');
  assert.ok(report.nextLocalActions.every(action => action.failedProbe && action.step && action.command));
  assert.equal(report.readiness.publicRepositoryRead.status, 'not_probed');
  assert.equal(report.readiness.connectorWrite.status, 'not_probed');
});

test('clean checkout records real identity and operation-specific timestamped prerequisites without writes', t => {
  const { root, git } = fixture(t);
  const before = git('status', '--porcelain');
  const report = inspect(root, { operation: 'implement fixture behavior' });
  assert.equal(report.head, git('rev-parse', 'HEAD'));
  assert.equal(report.branch, 'fixture');
  assert.equal(report.checkedAt, timestamp);
  assert.equal(report.operation, 'implement fixture behavior');
  assert.ok(report.probes.every(probe => probe.checkedAt === timestamp && probe.status === 'passed'));
  assert.equal(report.readiness.localImplementation.status, 'prerequisites_present');
  assert.equal(report.readiness.localValidation.status, 'prerequisites_present');
  assert.deepEqual(report.nextLocalActions, []);
  assert.equal(git('status', '--porcelain'), before);
});

test('missing dependency affects validation, not source implementation; missing source is precisely named', t => {
  const { root } = fixture(t);
  const dependency = 'spaceface-intentionally-missing-fixture-dependency';
  const report = inspect(root, { dependencies: [dependency] });
  assert.equal(report.readiness.localImplementation.status, 'prerequisites_present');
  assert.deepEqual(report.readiness.localValidation.failedProbes, [`dependency:${dependency}`]);
  const missing = inspect(root, { sources: ['absent.js'] });
  assert.deepEqual(missing.readiness.localImplementation.failedProbes, ['source:absent.js']);
  assert.match(missing.nextLocalActions[0].command, /ls-files -- 'absent.js'/);
});

test('unavailable CLI auth cannot forbid local work or imply failed connector access', t => {
  const { root } = fixture(t);
  const report = inspect(root);
  for (const cliAuth of ['unavailable', 'unauthenticated', 'failed']) {
    const readiness = classifyReadiness(report.probes, cliAuth);
    assert.equal(readiness.localImplementation.status, 'prerequisites_present');
    assert.equal(readiness.localValidation.status, 'prerequisites_present');
    assert.equal(readiness.connectorRead.status, 'not_probed');
    assert.equal(readiness.connectorWrite.status, 'not_probed');
    assert.equal(readiness.publicRepositoryRead.status, 'not_probed');
    assert.equal(readiness.cliAuthentication.status, cliAuth);
  }
});

test('dependency resolution never executes package entry points', t => {
  const { root } = fixture(t);
  const packageDir = join(root, 'node_modules', 'unsafe-fixture');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), '{"main":"index.js"}');
  writeFileSync(join(packageDir, 'index.js'), 'throw new Error("must never execute");');
  const report = inspect(root, { dependencies: ['unsafe-fixture'] });
  assert.equal(report.readiness.localValidation.status, 'prerequisites_present');
});

test('ancestor repositories are rejected while detached HEAD remains usable', t => {
  const { root, git } = fixture(t);
  mkdirSync(join(root, 'nested'));
  const nested = inspect(join(root, 'nested'), { sources: [], dependencies: [] });
  assert.equal(nested.probes[0].status, 'failed');
  assert.match(nested.probes[0].detail, /ancestor checkout/);
  git('checkout', '--detach');
  const detached = inspect(root);
  assert.equal(detached.branch, '(detached)');
  assert.equal(detached.readiness.localImplementation.status, 'prerequisites_present');
});

test('CLI emits parseable JSON and replacement requirement lists', t => {
  const { root } = fixture(t);
  const script = resolve('scripts/check-continuation-readiness.mjs');
  const result = spawnSync(process.execPath, [script, '--root', root, '--source', 'source.js',
    '--dependency', 'node:fs', '--operation', 'fixture'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.requirements, { sources: ['source.js'], dependencies: ['node:fs'] });
  assert.equal(report.operation, 'fixture');
  assert.throws(() => parseArgs(['--source']), /Missing value/);
  assert.throws(() => parseArgs(['--login']), /Unknown option/);
  const bad = spawnSync(process.execPath, [script, '--login'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.equal(JSON.parse(bad.stdout).failedProbe, 'arguments');
});


test('parent escapes and outward source symlinks are not checkout-local sources', t => {
  const { root } = fixture(t);
  const { root: outside } = fixture(t);
  const escaped = relative(root, join(outside, 'source.js'));
  assert.ok(escaped.startsWith(`..${sep}`));
  const escapedReport = inspect(root, { sources: [escaped] });
  assert.equal(escapedReport.readiness.localImplementation.status, 'needs_local_action');
  assert.match(escapedReport.probes.find(probe => probe.kind === 'source').detail, /resolve inside/);
  // A directory junction also works without Windows file-symlink privileges.
  symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const linkedReport = inspect(root, { sources: [join('linked', 'source.js')] });
  assert.equal(linkedReport.readiness.localImplementation.status, 'needs_local_action');
  assert.match(linkedReport.probes.find(probe => probe.kind === 'source').detail, /symlink targets/);
});
