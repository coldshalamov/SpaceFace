import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import ceresBrowserManifest from '../scripts/validation-manifests/ceres-five-minute-browser.mjs';
import pq048Manifest, {
  createPq048OreCycleBrowserManifest,
} from '../scripts/validation-manifests/pq048-ore-cycle-browser.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

test('PQ-048 Browser manifest owns one broker launch and a distinct artifact root', () => {
  assert.equal(pq048Manifest.id, 'pq048-ore-cycle-browser');
  assert.equal(pq048Manifest.runtimeKind, 'browser');
  assert.equal(pq048Manifest.mode, 'acceptance');
  assert.equal(pq048Manifest.command, process.execPath);
  assert.deepEqual(pq048Manifest.commandArgs, [
    'scripts/check-pq048-ore-cycle.mjs',
    '--acceptance',
  ]);
  assert.equal(pq048Manifest.maxLaunchesPerCandidate, 1);
  assert.equal(pq048Manifest.requireBrokerClaim, true);
  assert.equal(pq048Manifest.requireFastReceipt, true);
  assert.equal(pq048Manifest.cleanupPolicy, 'kill-tree');
  assert.equal(pq048Manifest.fixedSeed, 47);
  assert.equal(pq048Manifest.sourceIdentity, ceresBrowserManifest.sourceIdentity);
  assert.equal(
    pq048Manifest.artifactRoot.replaceAll('\\', '/'),
    '.devshots/pq048-ore-cycle/browser',
  );
  assert.notEqual(path.normalize(pq048Manifest.artifactRoot), path.normalize(ceresBrowserManifest.artifactRoot));
  assert.equal(ceresBrowserManifest.artifactRoot.replaceAll('\\', '/'),
    '.devshots/physics-as-spectacle/ceres-five-minute/browser');
});

test('PQ preflight and inherited shared gates run before broker claim issuance', () => {
  assert.equal(
    pq048Manifest.fastGateCommands[0],
    'node scripts/check-pq048-ore-cycle.mjs --preflight',
  );
  for (const sharedGate of ceresBrowserManifest.fastGateCommands.slice(1)) {
    assert.ok(pq048Manifest.fastGateCommands.includes(sharedGate),
      `PQ manifest dropped shared no-launch gate: ${sharedGate}`);
  }
  assert.equal(new Set(pq048Manifest.fastGateCommands).size, pq048Manifest.fastGateCommands.length,
    'fast gates must not burn time by repeating an identical command');
  const checker = readFileSync(path.join(ROOT, 'scripts/check-pq048-ore-cycle.mjs'), 'utf8');
  assert.match(checker, /preflightCeresFiveMinuteRuntime\s*\(/);
  assert.match(checker, /PREFLIGHT PASS \(browser; no runtime launched\)/);
  assert.ok(checker.indexOf('if (preflight)') < checker.indexOf('runCeresFiveMinuteAcceptance({'),
    'no-launch preflight must return before the runtime acceptance call');
});

test('manifest reuses the shared Ceres driver and binds every PQ product/harness dependency', () => {
  for (const [key, required] of Object.entries({
    scenarioPaths: [
      'scripts/lib/ceresFiveMinuteAcceptance.mjs',
      'scripts/lib/pq048OreCycleAcceptance.mjs',
    ],
    regressionSourcePaths: [
      'test/ceres-active-pockets.test.mjs',
      'test/ceres-activity-traffic-cast.test.mjs',
      'test/ceres-visible-job-actions.test.mjs',
      'test/freight-cargo-custody.test.mjs',
      'test/ore-carrier-freight-route.test.mjs',
      'test/pq048-ore-cycle-acceptance.test.mjs',
      'test/pq048-ore-cycle-manifest.test.mjs',
    ],
    productionSourcePaths: [
      'package.json',
      'src/core/eventBus.js',
      'src/data/sectorActivityPockets.js',
      'src/economy/freightCausality.js',
      'src/systems/economy.js',
      'src/systems/surrenderRecovery.js',
      'src/systems/traffic.js',
    ],
    harnessSourcePaths: [
      'scripts/check-pq048-ore-cycle.mjs',
      'scripts/lib/ceresFiveMinuteAcceptance.mjs',
      'scripts/lib/pq048OreCycleAcceptance.mjs',
      'scripts/validation-manifests/pq048-ore-cycle-browser.mjs',
    ],
  })) {
    assert.equal(new Set(pq048Manifest[key]).size, pq048Manifest[key].length, `${key} has duplicates`);
    for (const relative of required) {
      assert.ok(pq048Manifest[key].includes(relative), `${key} is missing ${relative}`);
    }
    for (const relative of pq048Manifest[key]) {
      assert.equal(existsSync(path.join(ROOT, relative)), true, `${key} path does not exist: ${relative}`);
    }
  }

  const checker = readFileSync(path.join(ROOT, 'scripts/check-pq048-ore-cycle.mjs'), 'utf8');
  assert.match(checker, /runCeresFiveMinuteAcceptance\s*\(/);
  assert.doesNotMatch(checker, /loadPlaywright|chromium\.launch|electron\.launch|createIsolatedElectronLaunch/);
  const sharedRoute = readFileSync(path.join(ROOT, 'scripts/lib/ceresFiveMinuteAcceptance.mjs'), 'utf8');
  for (const publicStep of ['Main Menu', 'Sandbox', 'ceres_reference_pocket']) {
    assert.ok(sharedRoute.includes(publicStep), `shared public driver is missing ${publicStep}`);
  }
});

test('manifest filename/default export is registry-loadable once the file is committed', () => {
  const relative = 'scripts/validation-manifests/pq048-ore-cycle-browser.mjs';
  assert.equal(path.basename(relative, '.mjs'), pq048Manifest.id);
  assert.notEqual(pq048Manifest.registryEnabled, false);
  assert.equal(existsSync(path.join(ROOT, relative)), true);
});

test('manifest factory copies arrays and permits bounded explicit overrides', () => {
  const first = createPq048OreCycleBrowserManifest();
  const second = createPq048OreCycleBrowserManifest({ timeoutMs: 123_456 });
  first.scenarioPaths.push('foreign');
  first.regressionSourcePaths.push('foreign');
  first.productionSourcePaths.push('foreign');
  first.harnessSourcePaths.push('foreign');
  assert.equal(second.timeoutMs, 123_456);
  for (const key of [
    'scenarioPaths', 'regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths',
  ]) {
    assert.equal(second[key].includes('foreign'), false, `${key} leaked between factories`);
  }
});

test('package exposes only the broker-mediated public PQ command', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['check:pq048:ore-cycle:browser'],
    'node scripts/validation-broker-cli.mjs --manifest pq048-ore-cycle-browser',
  );
});
