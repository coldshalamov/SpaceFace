import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

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

test('artifact validation checks containment, bytes, save envelope, player state, and digest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'spaceface-deep-state-'));
  try {
    const goodArtifact = 'good-fixture.json';
    const receipt = 'route-receipt.json';
    const goodBytes = Buffer.from(JSON.stringify({
      fmt: 'spaceface-save',
      version: 11,
      checksum: 'fixture-checksum',
      data: { entities: { player: { id: 'player', type: 'ship' } } },
    }));
    await writeFile(path.join(root, goodArtifact), goodBytes);
    await writeFile(path.join(root, receipt), JSON.stringify({ route: 'public', ok: true }));
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
        sha256: createHash('sha256').update(goodBytes).digest('hex'),
        capture: { commit: '1'.repeat(40), publicRouteReceipt: receipt },
      }],
    };
    assert.deepEqual(await validateDeepStateFixtureArtifacts(goodManifest, { root }), []);

    const artifact = 'fixture.json';
    const bytes = Buffer.from(JSON.stringify({ fmt: 'wrong-format', version: 11, data: {} }));
    await writeFile(path.join(root, artifact), bytes);
    const manifest = {
      schemaVersion: 1,
      artifactFormat: 'spaceface-save',
      fixtures: [{
        id: 'captured-fixture',
        ordinal: 1,
        status: 'captured',
        dependsOn: [],
        publicRoute: ['New Game'],
        requiredClaims: ['player exists'],
        artifact,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        capture: {
          commit: '1'.repeat(40),
          publicRouteReceipt: 'scratch/route.json',
        },
      }],
    };
    const issues = await validateDeepStateFixtureArtifacts(manifest, { root });
    assert(issues.some((issue) => issue.code === 'artifact-bad-format'));
    assert(issues.some((issue) => issue.code === 'artifact-missing-player'));

    manifest.fixtures[0].sha256 = '0'.repeat(64);
    const digestIssues = await validateDeepStateFixtureArtifacts(manifest, { root });
    assert(digestIssues.some((issue) => issue.code === 'artifact-digest-mismatch'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
