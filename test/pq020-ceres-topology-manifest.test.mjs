// PQ-020 Phase H1 — static readiness for the one-attempt Browser/Electron functional cell.
//
// These tests do not launch a browser, Electron, or the broker. They pin the packet-declared manifest,
// its invalidation surface, the shared public-control route, detailed failure state, real-GPU contract,
// natural Cathedral framing, sequential runtime ownership, and the explicit absence of Phase H3
// performance evidence before the single headed attempt is consumed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import manifest, {
  createPq020CeresTopologyManifest,
  PQ020_CERES_TOPOLOGY_FIXED_SEED,
} from '../scripts/validation-manifests/pq020-ceres-topology.mjs';
import {
  assertEndpointApproach,
  PQ020_CATHEDRAL_SITE_ID,
  PQ020_CERES_FUNCTIONAL_SCHEMA,
  PQ020_CERES_SECTOR_ID,
  PQ020_FUNCTIONAL_SCREENSHOTS,
  PQ020_ROUTE_TARGETS,
} from '../scripts/lib/pq020CeresFunctionalRoute.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const abs = (relative) => fileURLToPath(new URL(relative, ROOT));
const route = () => read('scripts/lib/pq020CeresFunctionalRoute.mjs');
const browser = () => read('scripts/probe-pq020-ceres-topology.mjs');
const electron = () => read('scripts/check-pq020-ceres-topology-electron.mjs');

// The packet names this exact L3BrokerManifest and allows one acceptance attempt per candidate digest.
test('pq020-ceres-topology is a one-use fixed-seed Browser acceptance manifest', () => {
  assert.equal(manifest.id, 'pq020-ceres-topology');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/probe-pq020-ceres-topology.mjs']);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.fixedSeed, PQ020_CERES_TOPOLOGY_FIXED_SEED);
  assert.equal(PQ020_CERES_TOPOLOGY_FIXED_SEED, 47);
  assert.match(manifest.artifactRoot.replace(/\\/g, '/'), /^\.devshots\/pq020-ceres-topology$/);
  assert.ok(manifest.timeoutMs >= 480_000, 'the four-stop public route needs a non-toy timeout');
  assert.equal(createPq020CeresTopologyManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('every source path declared by the manifest exists', () => {
  const missing = [];
  for (const group of ['regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths']) {
    assert.ok(manifest[group].length > 0, `${group} must not be empty`);
    for (const relative of manifest[group]) {
      if (!existsSync(abs(relative))) missing.push(`${group}: ${relative}`);
    }
  }
  assert.deepEqual(missing, [], `manifest declares missing paths: ${missing.join(', ')}`);
});

test('deterministic PQ-020, sim, and route-contract gates run before claim issue', () => {
  assert.deepEqual(manifest.fastGateCommands, [
    'npm run check:pq020:proofs',
    'npm run check:pq020:ceres-topology',
    'npm run check:sim:compare',
    'node --test test/pq020-ceres-topology-manifest.test.mjs',
  ]);
});

test('the broker CLI registers and lists pq020-ceres-topology', () => {
  const cli = read('scripts/validation-broker-cli.mjs');
  assert.ok(cli.includes("'pq020-ceres-topology': () => import('./validation-manifests/pq020-ceres-topology.mjs')"));
  const help = cli.slice(cli.indexOf('Manifests:'), cli.indexOf('Environment on spawned probes:'));
  assert.ok(help.includes('pq020-ceres-topology'));
});

test('the Browser entry is inert without a broker claim and owns one headed real-GPU process', () => {
  const source = browser();
  assert.ok(source.includes('requireBrokerClaimOrDiagnostic'));
  assert.ok(source.includes('process.env.SF_BROKER_CLAIM'));
  assert.ok(source.includes('process.exit(2)'));
  assert.ok(source.includes('process.env.SF_PROBE_SEED'));
  assert.ok(source.includes('headless: false'));
  assert.equal((source.match(/chromium\.launch\(/g) || []).length, 1);
  assert.equal((source.match(/browser\.newContext\(/g) || []).length, 1);
  assert.ok(source.includes('findSystemBrowser'));
  assert.ok(route().includes('SwiftShader|llvmpipe|software'));
  assert.ok(source.includes('await browser.close()'));
  assert.ok(source.includes('await server.close()'));
});

test('Browser and Electron share one route schema and the full declared still set', () => {
  const browserSource = browser();
  const electronSource = electron();
  for (const [label, source] of [['Browser', browserSource], ['Electron', electronSource]]) {
    assert.ok(source.includes('pq020CeresFunctionalRoute.mjs'), `${label} must import the shared route`);
    assert.ok(source.includes('runPq020CeresFunctionalRoute'), `${label} must execute the shared route`);
    assert.ok(source.includes('PQ020_FUNCTIONAL_SCREENSHOTS'), `${label} must bind the declared still set`);
  }
  assert.equal(PQ020_CERES_FUNCTIONAL_SCHEMA, 'spaceface.pq020-ceres-functional-route.v1');
  assert.equal(PQ020_CERES_SECTOR_ID, 'sector_ceres_belt');
  assert.equal(PQ020_CATHEDRAL_SITE_ID, 'world_site_wreck_cathedral');
  assert.equal(PQ020_FUNCTIONAL_SCREENSHOTS.length, 21);
  assert.deepEqual(PQ020_FUNCTIONAL_SCREENSHOTS.slice(9, 12), [
    '10-cathedral-far.png',
    '11-cathedral-default.png',
    '12-cathedral-close.png',
  ]);
});

test('the shared route uses visible player controls and production owners only', () => {
  const source = route();
  for (const required of [
    "getByRole('button', { name: 'New Game'",
    "page.fill('#sf-ng-seed', String(fixedSeed))",
    "getByRole('button', { name: 'Launch'",
    "page.keyboard.press('KeyN')",
    "page.keyboard.press('/')",
    '.gm-search-input',
    '.gm-search-item',
    '#gm-set-course-btn',
    "page.keyboard.press('F5')",
    "name: 'Continue'",
    'autopilot.status === \'arrived\'',
    "state.jump?.state === 'IDLE'",
  ]) assert.ok(source.includes(required), `missing public route contract: ${required}`);

  for (const forbidden of [
    /world\.enterSector\s*\(/,
    /\.emit\(['"]world:requestJump/,
    /\.emit\(['"]ui:setCourse/,
    /state\.world\.currentSectorId\s*=/,
    /player\.pos\.[xz]\s*=/,
    /state\.camera\.zoom\s*=/,
    /camera:zoom/,
  ]) assert.doesNotMatch(source, forbidden);
});

test('the four-stop itinerary reads civic, production, transit, and Cathedral identities', () => {
  assert.deepEqual({
    refinery: PQ020_ROUTE_TARGETS.refinery,
    beltOutpost: PQ020_ROUTE_TARGETS.beltOutpost,
    beacon: PQ020_ROUTE_TARGETS.beacon,
    cathedral: PQ020_ROUTE_TARGETS.cathedral,
  }, {
    refinery: {
      query: 'Ceres Refinery', name: 'Ceres Refinery', action: 'Set Waypoint',
      zoneId: 'zone_ceres_refinery', zoneName: 'Ceres Refinery Approach',
    },
    beltOutpost: {
      query: 'Belt Outpost', name: 'Belt Outpost', action: 'Set Waypoint',
      zoneId: 'zone_ceres_belt', zoneName: 'Ceres Mining Belt',
    },
    beacon: {
      query: 'Throughline Weigh Beacon', name: 'Throughline Weigh Beacon', action: 'Track Target',
      zoneId: 'zone_ceres_throughline', zoneName: 'Throughline Weigh',
    },
    cathedral: {
      query: 'Wreck Cathedral', name: 'Wreck Cathedral', action: 'Track Target',
    },
  });
  const source = route();
  assert.ok(source.includes('inspectorCarriesIdentityInText: true'));
  assert.ok(source.includes('assertZone(refinery'));
  assert.ok(source.includes('assertZone(beltOutpost'));
  assert.ok(source.includes('assertZone(beacon'));
});

test('both Ceres endpoint directions and cold Continue are non-vacuous assertions', () => {
  const source = route();
  assert.ok(source.includes('assertEndpointApproach(heliosApproach, PQ020_HELIOS_SECTOR_ID)'));
  assert.ok(source.includes('assertEndpointApproach(tethysApproach, PQ020_TETHYS_SECTOR_ID)'));
  assert.ok(source.includes('closestEndpointGateTo'));
  assert.ok(source.includes('endpointGates.find((gate) => gate.gateTo === sourceSectorId)'));
  assert.doesNotMatch(source, /sourceGate\.distance\s*<=\s*300/);
  assert.ok(source.includes("PQ020_SAVE_STORAGE_KEY = 'sf.save.quick'"));
  assert.ok(source.includes("state.world?.currentSectorId === sectorId && beaconCount === 1 && cathedralCount === 15"));
  assert.ok(source.includes('poseDelta <= 8'));
  assert.ok(source.includes('repeatedBeacon'));
  assert.ok(source.includes('repeatedCathedral'));
});

test('the recorded 429.564-WU Helios arrival is valid by source-direction identity', () => {
  const recordedArrival = {
    closestEndpointGateTo: 'sector_helios_prime',
    endpointGates: [
      { gateTo: 'sector_helios_prime', distance: 429.564 },
      { gateTo: 'sector_tethys_junction', distance: 1573.512 },
    ],
  };

  assert.doesNotThrow(() => assertEndpointApproach(recordedArrival, 'sector_helios_prime'));
  assert.throws(
    () => assertEndpointApproach(
      { ...recordedArrival, closestEndpointGateTo: 'sector_tethys_junction' },
      'sector_helios_prime',
    ),
    /must land closest to the gate back to that endpoint/,
  );
  assert.throws(
    () => assertEndpointApproach(
      { ...recordedArrival, endpointGates: recordedArrival.endpointGates.slice(1) },
      'sector_helios_prime',
    ),
    /exposes no endpoint gate back to sector_helios_prime/,
  );
});

test('Cathedral frames use public camera controls after natural arrival and require authored admission', () => {
  const source = route();
  for (const required of [
    "name: 'far', cameraZoom: 112",
    "name: 'default', cameraZoom: 72",
    "name: 'close', cameraZoom: 64",
    "const key = current < targetZoom ? 'Minus' : 'Equal'",
    "framingControl: 'public keyboard +/-'",
    "root.presentationAdmission === 'ready'",
    "authoredAssetState || '').startsWith('authored')",
    'admittedComponents === 7',
    'projection?.inFrame',
  ]) assert.ok(source.includes(required), `missing Cathedral framing contract: ${required}`);
  assert.ok(source.indexOf("setPhase('cathedral-arrival')")
    < source.indexOf('for (const framing of CATHEDRAL_FRAMINGS)'),
  'the public autopilot must arrive before player-controlled camera framing');
  assert.doesNotMatch(source, /minDistance:\s*1100|maxDistance:\s*1600|missed-distance-band/);
  assert.doesNotMatch(source, /snapToPlayer/);
});

test('failure evidence contains enough simulation state to classify one attempt', () => {
  const source = route();
  for (const required of [
    'tick: state.tick',
    'simTime: state.simTime',
    'timeScale: state.timeScale',
    'sectorId: state.world?.currentSectorId',
    'jump: state.jump',
    'autopilot: state.nav?.autopilot',
    'currentZone: state.world?.currentZone',
    'beaconEntities:',
    'cathedralEntities:',
    'cathedralRoot:',
    'projection: projectEntity',
    "trace: (window.__PQ020_H1_TRACE__?.events || []).slice(-40)",
  ]) assert.ok(source.includes(required), `missing failure-classification state: ${required}`);
});

test('Electron cannot launch before Browser PASS and follows isolated canonical-root ownership', () => {
  const source = electron();
  const browserGuard = source.indexOf("browserReceipt.disposition !== 'PASS'");
  const launch = source.indexOf('electron.launch(launch.options)');
  assert.ok(browserGuard >= 0 && launch > browserGuard, 'Browser PASS must be checked before Electron launch');
  for (const required of [
    'createIsolatedElectronLaunch',
    'createElectronCanonicalUrlTracker',
    'waitForCanonicalRoot',
    'assertIsolatedElectronRootUrl',
    'createElectronProcessMonitor',
    'closeOwnedElectronRuntime',
    'launch.cleanup({ runtimeClosed: true })',
    'buildPq020ParityProjection',
    'assert.deepEqual(electronProjection, browserProjection',
  ]) assert.ok(source.includes(required), `missing Electron ownership/parity contract: ${required}`);
});

test('the H1 cell creates no Phase H3 performance evidence', () => {
  const source = [route(), browser(), electron()].join('\n');
  for (const forbidden of [
    /performance\.now\s*\(/,
    /renderer\.info\s*[.[]/,
    /frameTimes?\s*[:=]/,
    /hitch(?:Count|es)\s*[:=]/i,
    /p(?:95|99)\s*[:=]/i,
    /gpuResidencyBytes\s*[:=]/,
    /appliedLod\s*[:=]/i,
  ]) assert.doesNotMatch(source, forbidden);
  assert.ok(browser().includes('noPerformanceEvidence: true'));
  assert.ok(electron().includes('noPerformanceEvidence: true'));
  assert.ok(route().includes('Matched performance and renderer structure remain Phase H3'));
});
