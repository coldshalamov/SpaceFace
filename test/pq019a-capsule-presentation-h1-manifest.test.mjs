// PQ-019A H1 continuation — static authority for the one-use capsule presentation cell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import manifest, {
  createPq019aCapsulePresentationManifest,
  PQ019A_CAPSULE_PRESENTATION_FIXED_SEED,
} from '../scripts/validation-manifests/pq019a-capsule-presentation.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const abs = (relative) => fileURLToPath(new URL(relative, ROOT));

test('the repaired capsule presentation is one candidate-bound Browser cell', () => {
  assert.equal(manifest.id, 'pq019a-capsule-presentation');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/capture-pq019a-acceptance.mjs']);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.fixedSeed, PQ019A_CAPSULE_PRESENTATION_FIXED_SEED);
  assert.equal(PQ019A_CAPSULE_PRESENTATION_FIXED_SEED, 0x50513139);
  assert.match(manifest.artifactRoot.replace(/\\/g, '/'), /^\.devshots\/pq019a-acceptance$/);
  assert.equal(createPq019aCapsulePresentationManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('all manifest invalidation paths exist and the focused repair runs before claim issue', () => {
  const missing = [];
  for (const group of ['regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths']) {
    assert.ok(manifest[group].length > 0, `${group} must not be empty`);
    for (const relative of manifest[group]) {
      if (!existsSync(abs(relative))) missing.push(`${group}: ${relative}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(manifest.fastGateCommands, [
    'node --test test/pq019a-capsule-capture-repair.test.mjs test/pq019a-capsule-presentation-h1-manifest.test.mjs',
    'npm run check:pq019a:facility-embodiment',
    'npm run check:sim:compare',
  ]);
});

test('the capture consumes a broker claim and cannot silently turn a direct run into evidence', () => {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  assert.match(source, /requireBrokerClaimOrDiagnostic/);
  assert.match(source, /process\.env\.SF_BROKER_CLAIM/);
  assert.match(source, /process\.exit\(2\)/);
  assert.match(source, /requiredRuntimeKind:\s*'browser'/);
  assert.match(source, /page\.fill\('#sf-ng-seed', String\(CAPTURE_SEED\)\)/);
  assert.match(source, /assert\.equal\(recordedSeed, CAPTURE_SEED/);
  assert.match(source, /assertInFrame\(receipt, `cargo_capsule\/\$\{framing\.name\}`\)/);
});

test('the frozen-subject page context declares every returned player-relative fact', () => {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  const body = source.slice(
    source.indexOf('async function trackFrozenSubject'),
    source.indexOf('async function clearFrozenSubjectTracking'),
  );
  assert.match(body, /const player = state\.entities\.get\(state\.playerId\)/,
    'the accepted run failed with ReferenceError: player is not defined');
  assert.match(body, /const separation = Math\.hypot\(/,
    'separationFromPlayer must be computed inside the same page.evaluate context');
});

test('the broker CLI registers and lists the capsule presentation cell', () => {
  const cli = read('scripts/validation-broker-cli.mjs');
  assert.match(cli, /'pq019a-capsule-presentation': \(\) => import\('\.\/validation-manifests\/pq019a-capsule-presentation\.mjs'\)/);
  const help = cli.slice(cli.indexOf('Manifests:'), cli.indexOf('Environment on spawned probes:'));
  assert.match(help, /pq019a-capsule-presentation/);
});

test('the cell stays presentation-only', () => {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  for (const forbidden of [
    /performance\.now\s*\(/,
    /frameTimes?\s*[:=]/,
    /hitch(?:Count|es)\s*[:=]/i,
    /p(?:95|99)\s*[:=]/i,
  ]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /Presentation stills only/);
  assert.match(source, /'matched traffic performance'/);
});
