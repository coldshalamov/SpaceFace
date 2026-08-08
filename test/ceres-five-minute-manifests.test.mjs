import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import browserManifest, {
  CERES_FIVE_MINUTE_FIXED_SEED,
  CERES_FIVE_MINUTE_SIMULATION_SECONDS,
  CERES_FIVE_MINUTE_SIMULATION_TICKS,
  CERES_FIVE_MINUTE_SOURCE_IDENTITY,
  createCeresFiveMinuteBrowserManifest,
} from '../scripts/validation-manifests/ceres-five-minute-browser.mjs';
import electronManifest from '../scripts/validation-manifests/ceres-five-minute-electron.mjs';

const pairedManifests = Object.freeze([browserManifest, electronManifest]);
const checkerSource = readFileSync(
  new URL('../scripts/check-ceres-five-minute.mjs', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(
  new URL('../package.json', import.meta.url),
  'utf8',
));

test('paired Ceres manifests grant one broker-authorized source launch per runtime', () => {
  assert.equal(browserManifest.id, 'ceres-five-minute-browser');
  assert.equal(browserManifest.runtimeKind, 'browser');
  assert.equal(electronManifest.id, 'ceres-five-minute-electron');
  assert.equal(electronManifest.runtimeKind, 'electron');

  for (const manifest of pairedManifests) {
    assert.equal(manifest.mode, 'acceptance');
    assert.equal(manifest.requireBrokerClaim, true);
    assert.equal(manifest.requireFastReceipt, true);
    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.fixedSeed, CERES_FIVE_MINUTE_FIXED_SEED);
    assert.equal(manifest.command, process.execPath);
    assert.equal(manifest.cleanupPolicy, 'kill-tree');
    assert.equal(manifest.runtimeProfile, 'default-ceres-five-minute-source-runtime');
    assert.equal(manifest.timeoutMs, 900_000);
    assert.equal(manifest.fastGateTimeoutMs, 600_000);
    assert.deepEqual(manifest.commandArgs, [
      'scripts/check-ceres-five-minute.mjs',
      `--runtime=${manifest.runtimeKind}`,
      '--acceptance',
    ]);
  }

  assert.match(browserManifest.artifactRoot.replaceAll('\\', '/'), /\/browser$/);
  assert.match(electronManifest.artifactRoot.replaceAll('\\', '/'), /\/electron$/);
  assert.notEqual(path.normalize(browserManifest.artifactRoot), path.normalize(electronManifest.artifactRoot));
});

test('paired Ceres manifests run a runtime-specific no-launch preflight before broker quota', () => {
  for (const manifest of pairedManifests) {
    const expected = `node scripts/check-ceres-five-minute.mjs --runtime=${manifest.runtimeKind} --preflight`;
    const checkerGates = manifest.fastGateCommands.filter((command) => (
      command.startsWith('node scripts/check-ceres-five-minute.mjs ')
    ));

    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.fastGateCommands[0], expected);
    assert.deepEqual(checkerGates, [expected]);
    assert.doesNotMatch(expected, /--acceptance|--diagnostic|validation-broker|playwright/i);
  }

  const electronViaBrowserFactory = createCeresFiveMinuteBrowserManifest({
    runtimeKind: 'electron',
  });
  assert.equal(
    electronViaBrowserFactory.fastGateCommands[0],
    'node scripts/check-ceres-five-minute.mjs --runtime=electron --preflight',
  );
});

test('checker preflight and paired evidence command cannot relaunch a runtime', () => {
  assert.match(
    checkerSource,
    /const acceptance = acceptanceRequested && !diagnostic/,
    'an explicit broker diagnostic must override the manifest-authored acceptance flag',
  );
  assert.match(checkerSource, /preflight && \(acceptanceRequested \|\| diagnostic\)/,
    'the no-launch preflight mode must remain exclusive');

  const preflightStart = checkerSource.indexOf('  if (preflight) {');
  const runtimeStart = checkerSource.indexOf('  const outputRoot =', preflightStart);
  assert.ok(preflightStart >= 0 && runtimeStart > preflightStart);
  const preflightBranch = checkerSource.slice(preflightStart, runtimeStart);
  assert.match(preflightBranch, /preflightCeresFiveMinuteRuntime\s*\(/);
  assert.match(preflightBranch, /PREFLIGHT PASS \([^)]*no runtime launched\)/);
  assert.doesNotMatch(
    preflightBranch,
    /runCeresFiveMinuteAcceptance|--acceptance|--diagnostic|launchCeres(?:Browser|Electron)Runtime/,
  );

  const aggregateStart = checkerSource.indexOf('  if (!runtimeKind) {');
  const runtimeModeStart = checkerSource.indexOf("  if (!['browser', 'electron'].includes(runtimeKind))", aggregateStart);
  assert.ok(aggregateStart >= 0 && runtimeModeStart > aggregateStart);
  const aggregateBranch = checkerSource.slice(aggregateStart, runtimeModeStart);
  assert.match(aggregateBranch, /checkCeresFiveMinuteEvidence\s*\(/);
  assert.doesNotMatch(
    aggregateBranch,
    /runCeresFiveMinuteAcceptance|preflightCeresFiveMinuteRuntime|launchCeres(?:Browser|Electron)Runtime/,
  );

  const pairCommand = packageJson.scripts['check:ceres:five-minute:pair'];
  assert.equal(pairCommand, 'node scripts/check-ceres-five-minute.mjs');
  assert.doesNotMatch(
    pairCommand,
    /validation-broker|--runtime=|--preflight|--acceptance|--diagnostic|npm\s+run/,
  );
});

test('paired runtimes share exact route, source, scenario, regression, production, and harness identity', () => {
  assert.equal(browserManifest.sourceIdentity, CERES_FIVE_MINUTE_SOURCE_IDENTITY);
  assert.equal(electronManifest.sourceIdentity, CERES_FIVE_MINUTE_SOURCE_IDENTITY);
  assert.deepEqual(browserManifest.scenarioPaths, ['scripts/lib/ceresFiveMinuteAcceptance.mjs']);
  assert.deepEqual(browserManifest.scenarioPaths, electronManifest.scenarioPaths);
  assert.deepEqual(browserManifest.regressionSourcePaths, electronManifest.regressionSourcePaths);
  assert.deepEqual(browserManifest.productionSourcePaths, electronManifest.productionSourcePaths);
  assert.deepEqual(browserManifest.harnessSourcePaths, electronManifest.harnessSourcePaths);
  for (const manifest of pairedManifests) {
    for (const key of [
      'fastGateCommands',
      'scenarioPaths',
      'regressionSourcePaths',
      'productionSourcePaths',
      'harnessSourcePaths',
    ]) {
      assert.equal(
        new Set(manifest[key]).size,
        manifest[key].length,
        `${manifest.id} ${key} must not contain duplicates`,
      );
    }
  }
  assert.ok(browserManifest.fastGateCommands.some((command) => (
    command.includes('test/npc-jobs-runtime-spatial-query.test.mjs')
  )), 'the current Ceres NPC route regression must run before broker authority');
  const propulsionAuthorityGate = 'node --test test/propulsion-spawned-ship-authority.test.mjs';
  for (const manifest of pairedManifests) {
    assert.ok(
      manifest.fastGateCommands.includes(propulsionAuthorityGate),
      `${manifest.id} must run propulsion spawned-ship authority before broker authority`,
    );
  }

  for (const productionPath of [
    'electron/main.cjs',
    'electron/preload.cjs',
    'package.json',
    'src/main.js',
    'src/core/spatialQuery.js',
    'src/data/sectorActivityPockets.js',
    'src/data/sectorCoordinates.js',
    'src/data/ships.js',
    'src/data/weapons.js',
    'src/data/modules.js',
    'src/render/camera.js',
    'src/render/renderer.js',
    'src/runtime/nodeSystemFactoryTable.js',
    'src/systems/asteroidFormations.js',
    'src/systems/factionPresence.js',
    'src/systems/traffic.js',
    'src/systems/npcJobsRuntime.js',
    'src/systems/encounterDirector.js',
    'src/systems/encounterScripts.js',
    'src/ui/screens/mainMenu.js',
    'src/ui/screens/sandbox.js',
    'src/ui/sandbox/sandboxSetup.js',
  ]) assert.ok(browserManifest.productionSourcePaths.includes(productionPath), productionPath);

  for (const regressionPath of [
    'test/ceres-five-minute-acceptance.test.mjs',
    'test/ceres-five-minute-manifests.test.mjs',
    'test/ceres-active-pockets.test.mjs',
    'test/sandbox-recovery-launcher.test.mjs',
    'test/ceres-activity-traffic-cast.test.mjs',
    'test/ceres-activity-faction-tender.test.mjs',
    'test/ceres-activity-ambush-director.test.mjs',
    'test/ceres-activity-runtime-lifecycle.test.mjs',
    'test/npc-jobs-runtime-spatial-query.test.mjs',
    'test/npc-jobs-runtime-wiring.test.mjs',
    'test/propulsion-spawned-ship-authority.test.mjs',
    'test/pq020-ceres-topology.test.mjs',
    'test/pq020-ceres-proofs.test.mjs',
  ]) assert.ok(browserManifest.regressionSourcePaths.includes(regressionPath), regressionPath);

  for (const harnessPath of [
    'scripts/lib/electronRuntimeProvisioning.mjs',
    'scripts/lib/playwrightCspPolling.mjs',
    'scripts/lib/pq020CeresFunctionalRoute.mjs',
    'scripts/lib/releaseSoakProbe.mjs',
    'scripts/lib/validationAtomicWrite.mjs',
  ]) assert.ok(browserManifest.harnessSourcePaths.includes(harnessPath), harnessPath);
});

test('source identity pins the public five-minute route without inventing a numeric void threshold', () => {
  const identity = CERES_FIVE_MINUTE_SOURCE_IDENTITY;
  assert.equal(CERES_FIVE_MINUTE_FIXED_SEED, 47);
  assert.equal(CERES_FIVE_MINUTE_SIMULATION_SECONDS, 300);
  assert.equal(CERES_FIVE_MINUTE_SIMULATION_TICKS, 18_000);
  assert.equal(identity.schema, 'spaceface.ceresFiveMinuteSourceIdentity.v1');
  assert.equal(identity.route, 'ceres-reference-pocket-five-minute-v1');
  assert.equal(identity.electronRoute, 'source-native-electron');
  assert.equal(identity.packagedElectronClaim, false);
  assert.equal(identity.controllerClaim, false);
  assert.equal(identity.saveManifest.kind, 'production-sandbox-new-game');
  assert.equal(identity.saveManifest.scenarioId, 'ceres_reference_pocket');
  assert.equal(identity.saveManifest.seed, 47);
  assert.equal(identity.inputTapeManifest.kind, 'procedural-public-keyboard-mouse-route');
  assert.equal(identity.inputTapeManifest.replayedSyntheticTape, false);
  assert.equal(identity.inputTapeManifest.controllerClaim, false);
  assert.equal(identity.cameraManifest.kind, 'production-runtime-camera');
  assert.equal(identity.cameraManifest.settingsOverride, false);
  assert.equal(identity.observationManifest.simulationSeconds, 300);
  assert.equal(identity.observationManifest.simulationTicks, 18_000);
  assert.equal(identity.observationManifest.activityGapMetric, 'maxZeroVisibleActivityS');
  assert.equal(identity.observationManifest.numericActivityGapThresholdS, null);
  assert.equal(identity.observationManifest.humanReview, 'browser-candidate-bound-KEEP-or-REVISE');
  assert.equal(identity.observationManifest.visibilitySemantics, 'world-camera-renderability-v1');
  assert.equal(identity.observationManifest.browserKeepRequired, true);
  assert.equal(identity.observationManifest.electronReviewRequired, false);
  assert.equal(Object.hasOwn(identity.observationManifest, 'keepRequired'), false);
  assert.equal(Object.isFrozen(identity), true);
  for (const nested of [
    identity.saveManifest,
    identity.inputTapeManifest,
    identity.cameraManifest,
    identity.observationManifest,
  ]) assert.equal(Object.isFrozen(nested), true);

  const encoded = JSON.stringify(identity);
  assert.doesNotMatch(encoded, /12(?:\.0)?\s*s/i);
  assert.doesNotMatch(encoded, /packaged-build|controller-parity|\bR8\b|G0-G7/i);
});

test('browser factory copies mutable path arrays and permits only deliberate runtime overrides', () => {
  const first = createCeresFiveMinuteBrowserManifest();
  const second = createCeresFiveMinuteBrowserManifest();
  assert.notEqual(first.fastGateCommands, second.fastGateCommands);
  assert.notEqual(first.scenarioPaths, second.scenarioPaths);
  assert.notEqual(first.regressionSourcePaths, second.regressionSourcePaths);
  assert.notEqual(first.productionSourcePaths, second.productionSourcePaths);
  assert.notEqual(first.harnessSourcePaths, second.harnessSourcePaths);
  first.productionSourcePaths.push('local-review-only');
  assert.equal(second.productionSourcePaths.includes('local-review-only'), false);

  const diagnostic = createCeresFiveMinuteBrowserManifest({ mode: 'diagnostic' });
  assert.equal(diagnostic.mode, 'diagnostic');
  assert.equal(browserManifest.mode, 'acceptance');
});
