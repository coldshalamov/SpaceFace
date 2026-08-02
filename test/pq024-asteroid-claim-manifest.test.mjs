import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import manifest, {
  createPq024AsteroidClaimManifest,
  PQ024_ASTEROID_CLAIM_FIXED_SEED,
} from '../scripts/validation-manifests/pq024-asteroid-claim.mjs';
import {
  formatPq024DockApproachTimeout,
  formatPq024MasslineReleaseTimeout,
  projectPq024RouteSemantics,
} from '../scripts/lib/pq024AsteroidClaimParity.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const PROBE_URL = new URL('../scripts/probe-pq024-asteroid-claim.mjs', import.meta.url);
const ELECTRON_URL = new URL('../scripts/check-pq024-asteroid-claim-electron.mjs', import.meta.url);

test('PQ-024 broker manifest binds one acceptance launch to the queue-listed headless gates', () => {
  const fresh = createPq024AsteroidClaimManifest();
  assert.equal(manifest.id, 'pq024-asteroid-claim');
  assert.equal(fresh.id, manifest.id);
  assert.equal(fresh.runtimeKind, 'browser');
  assert.equal(fresh.mode, 'acceptance');
  assert.equal(fresh.command, process.execPath);
  assert.deepEqual(fresh.commandArgs, ['scripts/probe-pq024-asteroid-claim.mjs']);
  assert.deepEqual(fresh.fastGateCommands, [
    'npm run check:pq024:survey-claim',
    'node --test test/asteroid-sites.test.mjs',
    'npm run check:sim:compare',
  ]);
  assert.equal(fresh.maxLaunchesPerCandidate, 1);
  assert.equal(fresh.requireBrokerClaim, true);
  assert.equal(fresh.cleanupPolicy, 'kill-tree');
  assert.equal(fresh.fixedSeed, PQ024_ASTEROID_CLAIM_FIXED_SEED);
  assert.match(String(fresh.artifactRoot), /pq024-asteroid-claim/);

  for (const required of [
    'test/pq024-asteroid-claim-manifest.test.mjs',
    'test/pq024-survey-claim.test.mjs',
    'test/asteroid-sites.test.mjs',
  ]) {
    assert.ok(fresh.regressionSourcePaths.includes(required), `missing regression dependency ${required}`);
  }
  for (const required of [
    'src/systems/asteroidSites.js',
    'src/systems/drill.js',
    'src/systems/economy.js',
    'src/save/saveSystem.js',
    'src/ui/asteroid/asteroidScreen.js',
    'src/ui/asteroid/asteroidController.js',
    'src/ui/station/screens/market.js',
  ]) {
    assert.ok(fresh.productionSourcePaths.includes(required), `missing production dependency ${required}`);
  }
  for (const required of [
    'scripts/check-pq024-asteroid-claim-electron.mjs',
    'scripts/lib/alphaLiveBaselineElectronContracts.mjs',
    'scripts/lib/electronTestIsolation.mjs',
    'scripts/lib/pq024AsteroidClaimParity.mjs',
  ]) {
    assert.ok(fresh.harnessSourcePaths.includes(required), `missing harness dependency ${required}`);
  }
});

test('PQ-024 probe preserves the public route and observes owner-produced terminal truth', () => {
  const source = readFileSync(PROBE_URL, 'utf8');

  assert.doesNotMatch(source, /\.isFocused\s*\(/,
    'Playwright Locator has no isFocused API');
  assert.match(source, /element\s*===\s*document\.activeElement/,
    'map search focus must use a real DOM active-element comparison');

  for (const publicSeam of [
    "page.keyboard.type('Helios Station')",
    '.sf-alert--dock',
    "getByRole('tab', { name: 'Market', exact: true })",
    '[data-market-search]',
    '[data-cmdty="${item.commodityId}"]',
    '.sx-qty__in',
    '[data-go]',
    '[data-screen="station"] .sx-dock button[data-act="undock"]',
    "page.keyboard.press('KeyM')",
    '#sf-galaxymap',
    '_clickTargets',
    '#gm-set-course-btn',
    "page.keyboard.down('Control')",
    "page.keyboard.down('Space')",
    "page.keyboard.press('KeyB')",
    '.ao-survey',
    '[data-item-id="${defId}"]',
    "page.keyboard.press('Enter')",
    "page.keyboard.press('F5')",
    'page.reload(',
    "name: 'Continue'",
  ]) {
    assert.ok(source.includes(publicSeam), `probe must retain public seam ${publicSeam}`);
  }
  assert.doesNotMatch(source, /locator\(['"]button\.st-undock['"]\)/,
    'the PQ-024 default route must not wait on the retired Station Hub Undock control');
  assert.doesNotMatch(source, /button\[data-act=["']undock["']\][\s\S]{0,160}getByRole\(['"]button['"],\s*\{\s*name:/,
    'the exact Station App action must not be intersected with its dynamic readiness title');
  assert.doesNotMatch(
    source,
    /#sf-localmap|_lastClickTargets|def\?\.id\s*===\s*['"]localmap['"]/,
    'the PQ-024 player route must not reopen the compatibility local-map implementation');
  assert.match(source, /String\(selected\?\.entityId \?\? selected\?\.targetEntityId\) === String\(id\)/,
    'same-site reentry must accept the exact active waypoint across restored id representation');
  assert.match(source, /if \(options\.siteId\) await hideWaypointOverlayForReentry\(page\)/,
    'same-site reentry must clear the higher-priority restored waypoint before pointer selection');
  assert.match(source, /for \(const layer of \['route', 'mission'\]\)[\s\S]*\.gm-layer-btn\[data-layer=[\s\S]*aria-pressed[\s\S]*target\.kind === 'waypoint'/,
    'reentry must use the two shipped lens controls and verify the overlay click target is gone');

  const orderedMilestones = [
    'openStationMarket(page)',
    'buyConstructionCargo(page)',
    'selectAsteroidOnLocalMap(page)',
    'carveCoreBuildCorridor(page)',
    'pulseSurveyReveal(page)',
    "placeSiteMachine(page, 'sm_massline_core'",
    "placeSiteMachine(page, 'sm_extractor'",
    'waitForPositiveProduction(page',
    'assertExactlyOneExteriorRelay(page',
    'quickSave(page)',
    'coldContinue(page',
    'reenterAsteroidOps(page',
  ];
  let cursor = -1;
  for (const milestone of orderedMilestones) {
    const next = source.indexOf(milestone, cursor + 1);
    assert.ok(next > cursor, `route milestone is absent or out of order: ${milestone}`);
    cursor = next;
  }

  assert.match(source, /driveOneCell\(page, 'ArrowDown', \{ dc: 0, dr: 1 \}\)[\s\S]*driveOneCell\(page, 'ArrowRight', \{ dc: 1, dr: 0 \}\)/,
    'the public route must pre-bore a deterministic dogleg before Survey/Core placement');
  assert.ok(source.indexOf('carveCoreBuildCorridor(page)') < source.indexOf('pulseSurveyReveal(page)'),
    'the route must not mutate the formation after recording the volatile survey');
  assert.match(source, /enterAsteroidOps[\s\S]*keyboard\.down\('Control'\)[\s\S]*keyboard\.down\('Space'\)[\s\S]*tether\?\.active === true[\s\S]*keyboard\.up\('Space'\)[\s\S]*keyboard\.up\('Control'\)/,
    'Asteroid Ops entry must hold the shipped nearest-target chord across an input tick and verify its exact rock');
  assert.doesNotMatch(source, /keyboard\.press\('Control\+Space'\)/,
    'a zero-duration chord may vanish between fixed input ticks');
  assert.match(source, /releaseMassline[\s\S]*keyboard\.down\('Space'\)[\s\S]*actions\?\.massline\?\.source === 'keyboard'[\s\S]*keyboard\.up\('Space'\)[\s\S]*tether\?\.active !== true/,
    'Massline release must cross a fixed input tick before the public key is released');
  assert.match(source, /Number\(window\.SF\?\.state\?\.tick\) > tick/,
    'Massline cleanup must retain the key for a distinct fixed tick before release');
  assert.doesNotMatch(source, /releaseMassline[\s\S]{0,220}keyboard\.press\('Space'\)/,
    'a zero-duration Massline cut may vanish between fixed input ticks');

  assert.match(source, /requireBrokerClaimOrDiagnostic/);
  assert.match(source, /headless:\s*false/);
  assert.match(source, /site:producing/);
  assert.match(source, /positiveQuantity/);
  assert.match(source, /place_claim_outpost_relay/);
  assert.match(source, /survey\.lifecycle\s*===\s*['"]producing['"]/);
  assert.match(source, /readPq024DockApproachSnapshot/,
    'a dock timeout must retain exact navigation, corridor, input, and physics-owner evidence');

  for (const forbidden of [
    /\bworld\.enterSector\s*\(/,
    /\bsiteSys\.installMachine\s*\(/,
    /\bdrillSys\.pulseScan\s*\(/,
    /\._ensureBeacon\s*\(/,
    /\._emitProductionReceipt\s*\(/,
    /\._acceptProductionReceipt\s*\(/,
    /\bstate\.player\.cargo(?:\.items)?\s*=/,
    /\b(?:producing|inventory|survey|exteriorRelay)\s*=\s*(?:true|false|\{|\[)/,
  ]) {
    assert.doesNotMatch(source, forbidden, `probe contains forbidden terminal mutation ${forbidden}`);
  }
});

test('PQ-024 dock timeout reports the reproduced route stall as structured evidence', () => {
  const last = {
    tick: 7200,
    player: { alive: true, pos: { x: 1234, z: -489 }, speed: 0 },
    autopilot: { active: true, status: 'braking', targetEntityId: 286 },
    resolvedTarget: { dockingStage: 'berth', x: 1234, z: -489 },
    dockingCorridor: { phase: 'approach', distToBerth: 115.11, inCapture: false },
    physicsDockStationId: null,
  };
  const message = formatPq024DockApproachTimeout({
    timeoutMs: 120_000,
    sampleCount: 240,
    bestBerthDistance: 115.11,
    bestCenterDistance: 83.4,
    last,
  });
  assert.match(message, /^public Helios approach did not expose the dock prompt; evidence=/);
  const evidence = JSON.parse(message.slice(message.indexOf('evidence=') + 'evidence='.length));
  assert.deepEqual(evidence, {
    timeoutMs: 120_000,
    sampleCount: 240,
    bestBerthDistance: 115.11,
    bestCenterDistance: 83.4,
    last,
  });
  assert.equal(evidence.last.autopilot.status, 'braking');
  assert.equal(evidence.last.dockingCorridor.inCapture, false);
  assert.equal(evidence.last.physicsDockStationId, null);
});

test('PQ-024 Massline cleanup reports the reproduced release stall as structured evidence', () => {
  const samples = [{
    label: 'release-timeout',
    tick: 9000,
    spaceHeld: false,
    command: { phase: 'latched', cut: false, source: null },
    tether: { active: true, targetId: 44, attachmentId: 7 },
    owner: { active: { targetId: 44 }, pendingCut: null },
  }];
  const events = [];
  const message = formatPq024MasslineReleaseTimeout({ samples, events });
  assert.match(message, /^public Massline tap did not release the active tether; evidence=/);
  const evidence = JSON.parse(message.slice(message.indexOf('evidence=') + 'evidence='.length));
  assert.deepEqual(evidence, { samples, events });
  assert.equal(evidence.samples[0].tether.active, true);
  assert.equal(evidence.samples[0].spaceHeld, false);
});

test('PQ-024 Electron parity reuses one public actor after Browser PASS and owns teardown', () => {
  const source = readFileSync(PROBE_URL, 'utf8');
  const electron = readFileSync(ELECTRON_URL, 'utf8');
  assert.match(electron, /process\.argv\.push\(['"]--electron-parity['"]\)/);
  assert.match(electron, /import\(['"]\.\/probe-pq024-asteroid-claim\.mjs['"]\)/);
  assert.equal((source.match(/async function runDefaultRoute/g) || []).length, 1,
    'Browser and Electron must share one public route actor');
  const browserGuard = source.indexOf("browserReceipt.disposition, 'PASS'");
  const electronLaunch = source.indexOf('electron.launch(electronLaunch.options)');
  assert.ok(browserGuard >= 0 && electronLaunch > browserGuard,
    'Electron must remain gated behind a passing Browser receipt');
  for (const required of [
    'createIsolatedElectronLaunch',
    'createElectronCanonicalUrlTracker',
    'assertIsolatedElectronRootUrl',
    'createElectronProcessMonitor',
    'closeOwnedElectronRuntime',
    'electronLaunch?.cleanup({ runtimeClosed: true })',
    'projectPq024RouteSemantics(browserReceipt)',
    "beginExpectedNavigation?.('pq024-cold-continue')",
    'endExpectedNavigation?.(navigationToken)',
  ]) assert.ok(source.includes(required), `missing Electron/shared-route contract: ${required}`);

  const bootStart = source.indexOf('async function bootSeededFlight');
  const bootEnd = source.indexOf('async function installObservers', bootStart);
  const boot = source.slice(bootStart, bootEnd);
  assert.match(boot, /if \(navigateInitialRoot\)[\s\S]*page\.goto/);
  assert.match(boot, /else \{[\s\S]*new URL\(page\.url\(\)\)\.href/);
});

test('PQ-024 semantic parity ignores runtime ids while retaining the claim corridor', () => {
  const sample = {
    fixedSeed: 24024,
    recordedSeed: 24024,
    observations: {
      cargo: [{ commodityId: 'cmdty_regocrete', qty: 7, before: { owned: 2 }, after: { owned: 9 } }],
      asteroid: { targetEntityId: 91, siteId: 'site_claim_1' },
      surveyReveal: { revealed: 2, cells: 5 },
      core: {
        siteId: 'site_claim_1', anchored: true, lifecycle: 'committed', machineId: 101,
        cell: { col: 4, row: 6 },
      },
      extractor: { siteId: 'site_claim_1', machineId: 102, cell: { col: 5, row: 6 } },
      production: {
        siteId: 'site_claim_1', lifecycle: 'producing', eventCount: 1,
        receipt: { receiptId: 'a', outputId: 'cmdty_iron_ore', positiveQuantity: 1 },
      },
      relay: {
        count: 1, entityId: 201, placeId: 'place_claim_outpost_relay', siteId: 'site_claim_1',
      },
      continued: {
        siteId: 'site_claim_1', lifecycle: 'producing', outputId: 'cmdty_iron_ore',
        positiveQuantity: 1, receiptMatches: true, relayCount: 1,
      },
      restoredAsteroid: { targetEntityId: 301, siteId: 'site_claim_1' },
      reentered: { siteId: 'site_claim_1', lifecycle: 'producing', chips: ['Producing'] },
      restoredRelay: {
        count: 1, entityId: 401, placeId: 'place_claim_outpost_relay', siteId: 'site_claim_1',
      },
    },
  };
  const otherRuntime = structuredClone(sample);
  otherRuntime.runtime = 'electron';
  otherRuntime.observations.asteroid.targetEntityId = 9991;
  otherRuntime.observations.core.machineId = 9992;
  otherRuntime.observations.production.receipt.receiptId = 'other-runtime';
  otherRuntime.observations.relay.entityId = 9993;
  otherRuntime.observations.restoredAsteroid.targetEntityId = 9994;
  otherRuntime.observations.restoredRelay.entityId = 9995;
  assert.deepEqual(projectPq024RouteSemantics(otherRuntime), projectPq024RouteSemantics(sample));
  const projected = projectPq024RouteSemantics(sample);
  assert.deepEqual(projected.production, {
    siteId: 'site_claim_1', lifecycle: 'producing', outputId: 'cmdty_iron_ore',
    positiveQuantity: 1, eventCount: 1,
  });
  assert.equal(projected.continue.receiptMatches, true);
  assert.equal(projected.reentered.producingChip, true);
});

test('the tracked registry resolves the PQ-024 manifest default export', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(new URL('../', import.meta.url)),
    id: 'pq024-asteroid-claim',
  });
  assert.equal(registered.id, manifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq024-asteroid-claim\.mjs$/);
});
