import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { fnv1a } from '../src/save/checksum.js';

import {
  loadDeepStateFixtureLadder,
  validateDeepStateFixtureArtifacts,
  validateDeepStateFixtureLadder,
} from '../scripts/lib/deepStateFixtureLadder.mjs';

test('canonical deep-state ladder names all thirteen public-route states without fake captures', async () => {
  const manifest = await loadDeepStateFixtureLadder();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.fixtures.length, 13);
  assert.deepEqual(manifest.fixtures.map((fixture) => fixture.id), [
    'fresh-start',
    'first-station',
    'first-upgrade',
    'post-combat',
    'post-recovery',
    'active-market',
    'asteroid-entry',
    'productive-site',
    'route-loss',
    'faction-threshold',
    'discovered-wreck',
    'pre-ending',
    'post-ending-sandbox',
  ]);

  // G02/G03 captured the first two rungs through the public capture harness
  // (scripts/check-deep-state-capture.mjs); every later rung remains honestly planned.
  const CAPTURED = new Set(['fresh-start', 'first-station']);
  for (const fixture of manifest.fixtures) {
    if (CAPTURED.has(fixture.id)) {
      assert.equal(fixture.status, 'captured', `${fixture.id} is captured`);
      assert.match(fixture.artifact, /^test\/fixtures\/deep-state-ladder\/artifacts\//,
        `${fixture.id} artifact is a durable tracked path`);
      assert.match(fixture.sha256, /^[0-9a-f]{64}$/, `${fixture.id} carries a real digest`);
      assert.match(fixture.capture?.commit || '', /^[0-9a-f]{40}$/, `${fixture.id} is commit-bound`);
      assert.ok(fixture.capture?.publicRouteReceipt, `${fixture.id} names its route receipt`);
    } else {
      assert.equal(fixture.status, 'planned', `${fixture.id} stays honestly planned`);
      assert.equal(fixture.artifact, null, `${fixture.id} has no fake artifact`);
    }
  }
});

test('ladder validation rejects forward dependencies and dishonest capture claims', () => {
  const invalid = {
    schemaVersion: 1,
    fixtures: [
      {
        id: 'early',
        ordinal: 1,
        status: 'planned',
        dependsOn: ['later'],
        publicRoute: ['New Game'],
        requiredClaims: ['player exists'],
        artifact: 'test/fixtures/deep-state/early.json',
      },
      {
        id: 'later',
        ordinal: 2,
        status: 'captured',
        dependsOn: [],
        publicRoute: ['Continue'],
        requiredClaims: ['save restores'],
        artifact: null,
      },
    ],
  };
  const issues = validateDeepStateFixtureLadder(invalid);
  assert(issues.some((issue) => issue.code === 'invalid-artifact-format'));
  assert(issues.some((issue) => issue.code === 'dependency-not-earlier'));
  assert(issues.some((issue) => issue.code === 'planned-has-artifact'));
  assert(issues.some((issue) => issue.code === 'captured-missing-artifact'));
  assert(issues.some((issue) => issue.code === 'captured-missing-digest'));
  assert(issues.some((issue) => issue.code === 'captured-missing-receipt'));
});

test('artifact validation checks containment, bytes, envelope integrity, receipts, and identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'spaceface-deep-state-'));
  try {
    // A GENUINELY good captured fixture under the hardened contract: real internal fnv1a
    // checksum over the data payload, an existing commit object (this repo's HEAD), and
    // cross-matching capture + restore receipts. This is what the round-3 hardening demands —
    // the previous "good" fixture carried a fake checksum and a fabricated commit and passed.
    const data = { entities: { player: { id: 'player', type: 'ship' } } };
    const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.dirname(fileURLToPath(import.meta.url)), encoding: 'utf8',
    }).trim();
    const goodArtifact = 'good-fixture.json';
    const goodBytes = Buffer.from(JSON.stringify({
      fmt: 'spaceface-save',
      version: 11,
      checksum: fnv1a(JSON.stringify(data)),
      data,
    }));
    const goodSha = createHash('sha256').update(goodBytes).digest('hex');
    await writeFile(path.join(root, goodArtifact), goodBytes);
    await writeFile(path.join(root, 'capture.json'), JSON.stringify({
      fixtureId: 'captured-fixture', artifactSha256: goodSha, injectedState: false,
      milestones: ['title-visible', 'run-started'],
    }));
    await writeFile(path.join(root, 'restore.json'), JSON.stringify({
      fixtureId: 'captured-fixture', claimsOk: true,
      steps: [{ name: 'boot', ok: true }, { name: 'restored', ok: true }],
    }));
    const goodManifest = {
      schemaVersion: 1,
      artifactFormat: 'spaceface-save',
      fixtures: [{
        id: 'captured-fixture',
        ordinal: 1,
        status: 'captured',
        dependsOn: [],
        publicRoute: ['New Game'],
        requiredClaims: ['player exists'],
        artifact: goodArtifact,
        sha256: goodSha,
        capture: {
          commit: headCommit,
          publicRouteReceipt: 'capture.json',
          restoreReceipt: 'restore.json',
        },
      }],
    };
    assert.deepEqual(await validateDeepStateFixtureArtifacts(goodManifest, { root }), []);

    // Each hardened rejection, independently: fake internal checksum, out-of-range version
    // (the reviewed 1e308 hole), fabricated commit, injected-state receipt, failed restore.
    const variant = (mutate) => {
      const m = JSON.parse(JSON.stringify(goodManifest));
      mutate(m.fixtures[0]);
      return m;
    };
    const withArtifact = async (name, envelope) => {
      const b = Buffer.from(JSON.stringify(envelope));
      await writeFile(path.join(root, name), b);
      return createHash('sha256').update(b).digest('hex');
    };

    const badChecksumSha = await withArtifact('bad-checksum.json',
      { fmt: 'spaceface-save', version: 11, checksum: 'fixture-checksum', data });
    let issues = await validateDeepStateFixtureArtifacts(
      variant((f) => { f.artifact = 'bad-checksum.json'; f.sha256 = badChecksumSha; }), { root });
    assert(issues.some((i) => i.code === 'artifact-checksum-mismatch'), 'fake internal checksum rejected');

    const hugeVersionSha = await withArtifact('huge-version.json',
      { fmt: 'spaceface-save', version: 1e308, checksum: fnv1a(JSON.stringify(data)), data });
    issues = await validateDeepStateFixtureArtifacts(
      variant((f) => { f.artifact = 'huge-version.json'; f.sha256 = hugeVersionSha; }), { root });
    assert(issues.some((i) => i.code === 'artifact-bad-version'), 'version 1e308 rejected');

    issues = await validateDeepStateFixtureArtifacts(
      variant((f) => { f.capture.commit = '1'.repeat(40); }), { root });
    assert(issues.some((i) => i.code === 'capture-commit-unknown'), 'fabricated commit rejected');

    await writeFile(path.join(root, 'injected.json'), JSON.stringify({
      fixtureId: 'captured-fixture', artifactSha256: goodSha, injectedState: true,
      milestones: ['run-started'],
    }));
    issues = await validateDeepStateFixtureArtifacts(
      variant((f) => { f.capture.publicRouteReceipt = 'injected.json'; }), { root });
    assert(issues.some((i) => i.code === 'receipt-injected-state'), 'injected provenance rejected');

    await writeFile(path.join(root, 'failed-restore.json'), JSON.stringify({
      fixtureId: 'captured-fixture', claimsOk: false,
      steps: [{ name: 'boot', ok: true }, { name: 'restored', ok: false }],
    }));
    issues = await validateDeepStateFixtureArtifacts(
      variant((f) => { f.capture.restoreReceipt = 'failed-restore.json'; }), { root });
    assert(issues.some((i) => i.code === 'restore-claims-failed'), 'failed restore rejected');
    assert(issues.some((i) => i.code === 'restore-steps-failed'), 'failed step rejected');

    issues = await validateDeepStateFixtureArtifacts(
      variant((f) => { delete f.capture.restoreReceipt; }), { root });
    assert(issues.some((i) => i.code === 'restore-receipt-missing'), 'absent restore evidence rejected');

    // The original envelope-shape rejections still hold.
    const wrongSha = await withArtifact('wrong.json', { fmt: 'wrong-format', version: 11, data: {} });
    issues = await validateDeepStateFixtureArtifacts(
      variant((f) => { f.artifact = 'wrong.json'; f.sha256 = wrongSha; }), { root });
    assert(issues.some((i) => i.code === 'artifact-bad-format'));
    assert(issues.some((i) => i.code === 'artifact-missing-player'));

    issues = await validateDeepStateFixtureArtifacts(
      variant((f) => { f.sha256 = '0'.repeat(64); }), { root });
    assert(issues.some((i) => i.code === 'artifact-digest-mismatch'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
