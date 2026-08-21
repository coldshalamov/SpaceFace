import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import manifest, {
  createPq024AsteroidClaimManifest,
  PQ024_ASTEROID_CLAIM_FIXED_SEED,
} from '../scripts/validation-manifests/pq024-asteroid-claim.mjs';
import committedManifest, {
  createPq024CommittedTransitionManifest,
  PQ024_COMMITTED_TRANSITION_FIXED_SEED,
} from '../scripts/validation-manifests/pq024-committed-transition.mjs';
import {
  formatPq024DockApproachTimeout,
  formatPq024MasslineLatchTimeout,
  formatPq024MasslineReleaseTimeout,
  observePq024DockPrompt,
  projectPq024RouteSemantics,
  retractPq024BuildMode,
} from '../scripts/lib/pq024AsteroidClaimParity.mjs';
import {
  assessPq024CommittedElectronPrelaunch,
  assessPq024CommittedPresentation,
  assessPq024CommittedTransitionReceipt,
  PQ024_COMMITTED_PRESENTATION_SCHEMA,
  PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA,
  PQ024_COMMITTED_TRANSITION_SEMANTICS_SCHEMA,
} from '../scripts/lib/pq024CommittedPresentation.mjs';
import { computeGateDigestsFromManifest } from '../scripts/lib/validationBroker.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';
import { routeAsteroidScreenKeyDown } from '../src/ui/asteroid/asteroidController.js';

const PROBE_URL = new URL('../scripts/probe-pq024-asteroid-claim.mjs', import.meta.url);
const ELECTRON_URL = new URL('../scripts/check-pq024-asteroid-claim-electron.mjs', import.meta.url);
const ASTEROID_SCREEN_URL = new URL('../src/ui/asteroid/asteroidScreen.js', import.meta.url);
const COMMITTED_ELECTRON_URL = new URL(
  '../scripts/check-pq024-committed-transition-electron.mjs',
  import.meta.url,
);

test('Asteroid Ops exclusively owns active Build and Drive keys', () => {
  const makeEvent = (code) => {
    const calls = { prevented: 0, stopped: 0 };
    return {
      code,
      calls,
      preventDefault() { calls.prevented += 1; },
      stopImmediatePropagation() { calls.stopped += 1; },
    };
  };

  let exits = 0;
  const buildEnter = makeEvent('Enter');
  assert.equal(routeAsteroidScreenKeyDown({
    controller: {
      onKeyDown(event) {
        event.preventDefault();
        return true;
      },
    },
    event: buildEnter,
    exit: () => { exits += 1; },
  }), true);
  assert.deepEqual(buildEnter.calls, { prevented: 1, stopped: 1 });
  assert.equal(exits, 0, 'a handled Build command must not leak into screen exit or button activation');

  const driveEscape = makeEvent('Escape');
  assert.equal(routeAsteroidScreenKeyDown({
    controller: { onKeyDown: () => false },
    event: driveEscape,
    exit: () => { exits += 1; },
  }), true);
  assert.deepEqual(driveEscape.calls, { prevented: 1, stopped: 1 });
  assert.equal(exits, 1, 'Drive Escape must retract Asteroid Ops exactly once');

  const unhandled = makeEvent('F5');
  assert.equal(routeAsteroidScreenKeyDown({
    controller: { onKeyDown: () => false },
    event: unhandled,
    exit: () => { exits += 1; },
  }), false);
  assert.deepEqual(unhandled.calls, { prevented: 0, stopped: 0 });
  assert.equal(exits, 1, 'unhandled global keys must keep their existing owner');

  const screenSource = readFileSync(ASTEROID_SCREEN_URL, 'utf8');
  assert.match(screenSource, /document\.addEventListener\('keydown', onKeyDown, true\)/,
    'Asteroid Ops must claim its active keys before the global modal router');
  assert.match(screenSource, /document\.removeEventListener\('keydown', onKeyDown, true\)/,
    'capture ownership must be released with the screen session');
});

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
    'scripts/lib/pq024CommittedPresentation.mjs',
  ]) {
    assert.ok(fresh.harnessSourcePaths.includes(required), `missing harness dependency ${required}`);
  }
});

test('PQ-024 committed presentation rejects the captured stale frame and accepts settled UI', () => {
  const owner = {
    siteId: 'site_1',
    anchored: true,
    lifecycle: 'committed',
    cells: 3,
  };
  // PQ-130.06/.09: the stale frame is now read off the surfaces that still exist — the two crest
  // chips and the crest's one alert slot. The old `.ast-inspector` kicker/title/body assertions
  // were retired with the context bay they read (design law §10); kept, they would have passed
  // against an empty string forever.
  const stale = assessPq024CommittedPresentation({
    owner,
    claimText: 'No claim',
    assayText: 'Assay 2/3',
    alertText: 'Unanchored — install a Core before leaving',
  }, { expectedSiteId: 'site_1' });
  assert.equal(stale.schema, PQ024_COMMITTED_PRESENTATION_SCHEMA);
  assert.equal(stale.pass, false);
  assert.ok(stale.failures.some((row) => row.includes('claim chip')));
  assert.ok(stale.failures.some((row) => row.includes('assay chip')));
  assert.ok(stale.failures.some((row) => row.includes('crest alert')));

  const settled = assessPq024CommittedPresentation({
    owner,
    claimText: 'Anchored',
    assayText: 'Assay 3 cells',
    alertText: '',
  }, { expectedSiteId: 'site_1' });
  assert.equal(settled.schema, PQ024_COMMITTED_PRESENTATION_SCHEMA);
  assert.equal(settled.pass, true);
  assert.deepEqual(settled.failures, []);
});

test('PQ-024 committed-transition manifest is a distinct one-shot broker candidate', async () => {
  const fresh = createPq024CommittedTransitionManifest();
  assert.equal(committedManifest.id, 'pq024-committed-transition');
  assert.equal(fresh.id, committedManifest.id);
  assert.equal(fresh.runtimeKind, 'browser');
  assert.equal(fresh.mode, 'acceptance');
  assert.deepEqual(fresh.commandArgs, [
    'scripts/probe-pq024-asteroid-claim.mjs',
    '--committed-transition',
  ]);
  assert.equal(fresh.fixedSeed, PQ024_COMMITTED_TRANSITION_FIXED_SEED);
  assert.equal(fresh.fixedSeed, PQ024_ASTEROID_CLAIM_FIXED_SEED);
  assert.equal(fresh.maxLaunchesPerCandidate, 1);
  assert.equal(fresh.requireBrokerClaim, true);
  assert.match(String(fresh.artifactRoot), /pq024-committed-transition/);
  assert.deepEqual(fresh.fastGateCommands, [
    'node --test test/pq024-survey-claim.test.mjs test/pq024-asteroid-claim-manifest.test.mjs test/station-docking-corridor.test.mjs',
  ]);
  for (const required of [
    'scripts/probe-pq024-asteroid-claim.mjs',
    'scripts/check-pq024-committed-transition-electron.mjs',
    'scripts/lib/pq024CommittedPresentation.mjs',
    'scripts/validation-manifests/pq024-committed-transition.mjs',
  ]) {
    assert.ok(fresh.harnessSourcePaths.includes(required),
      `committed-transition digest misses ${required}`);
  }
  assert.ok(fresh.regressionSourcePaths.includes('test/station-docking-corridor.test.mjs'),
    'committed-transition regression identity must include the station berth contract');
  assert.ok(fresh.productionSourcePaths.includes('src/systems/flightV3.js'),
    'committed-transition production identity must include the station autopilot owner');

  const root = fileURLToPath(new URL('../', import.meta.url));
  const [boundedDigests, fullDigests] = await Promise.all([
    computeGateDigestsFromManifest({ root, manifest: fresh }),
    computeGateDigestsFromManifest({ root, manifest: createPq024AsteroidClaimManifest() }),
  ]);
  assert.match(boundedDigests.manifestDigest, /^[0-9a-f]{64}$/);
  assert.match(boundedDigests.candidateDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(boundedDigests.manifestDigest, fullDigests.manifestDigest,
    'the bounded manifest has an independent policy digest');
  assert.notEqual(boundedDigests.candidateDigest, fullDigests.candidateDigest,
    'the bounded launch has an independent candidate identity');
});

test('PQ-024 committed-transition actor retains one screenshot and returns before downstream work', () => {
  const source = readFileSync(PROBE_URL, 'utf8');
  assert.match(source,
    /COMMITTED_TRANSITION_SCREENSHOTS\s*=\s*Object\.freeze\(\['03-core-committed\.png'\]\)/,
    'the bounded actor may retain only the committed Core screenshot');
  assert.match(source, /if \(!options\.stopAfterCore\) await screenshot\('01-market-materials\.png'\)/);
  assert.match(source, /if \(!options\.stopAfterCore\) await screenshot\('02-survey-reveal\.png'\)/);

  const corePlacement = source.indexOf("const core = await placeSiteMachine(page, 'sm_massline_core'");
  const presentation = source.indexOf('waitForCommittedPresentation(page, core)', corePlacement);
  const screenshot = source.indexOf("screenshot('03-core-committed.png')", presentation);
  const stop = source.indexOf('if (options.stopAfterCore) {', screenshot);
  const extractorPhase = source.indexOf("phase = 'extractor-install'", stop);
  assert.ok(corePlacement >= 0 && presentation > corePlacement && screenshot > presentation
    && stop > screenshot && extractorPhase > stop,
  'bounded actor must settle, capture, and return before the extractor phase');
  const stopBranch = source.slice(stop, extractorPhase);
  const actorPrefix = source.slice(source.indexOf('async function runDefaultRoute'), stop);
  assert.match(actorPrefix, /readGpuContract\(page\)/);
  assert.match(actorPrefix, /gpu\.available, true/);
  assert.match(actorPrefix, /SwiftShader\|llvmpipe\|software/i,
    'bounded acceptance keeps the real-GPU contract used by the full actor');
  assert.match(stopBranch, /return \{/);
  assert.match(stopBranch, /PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA/);
  assert.match(stopBranch, /committedPresentation/);
  assert.match(source, /asteroidId:\s*site\.asteroidId\s*\?\?\s*state\?\.drill\?\.asteroidId/,
    'installed Core evidence must retain its owner asteroid for within-receipt route binding');
  assert.doesNotMatch(stopBranch,
    /placeSiteMachine\(page, 'sm_extractor'|waitForPositiveProduction\(|assertExactlyOneExteriorRelay\(|quickSave\(|coldContinue\(|reenterAsteroidOps\(/,
    'bounded branch must not spend any downstream route phase');
  for (const forbidden of [
    /\bsiteSys\.installMachine\s*\(/,
    /\bstate\.player\.cargo(?:\.items)?\s*=/,
    /\b(?:producing|inventory|survey|exteriorRelay)\s*=\s*(?:true|false|\{|\[)/,
  ]) {
    assert.doesNotMatch(stopBranch, forbidden,
      `bounded branch contains forbidden owner mutation ${forbidden}`);
  }
});

test('PQ-024 committed-transition Electron wrapper is exact-Browser gated before launch', () => {
  const source = readFileSync(PROBE_URL, 'utf8');
  const wrapper = readFileSync(COMMITTED_ELECTRON_URL, 'utf8');
  assert.match(wrapper, /process\.argv\.push\(['"]--committed-transition['"]\)/);
  assert.match(wrapper, /process\.argv\.push\(['"]--electron-parity['"]\)/);
  assert.match(wrapper, /import\(['"]\.\/probe-pq024-asteroid-claim\.mjs['"]\)/);
  const prelaunchCall = source.indexOf(
    'browserCommittedPrelaunch = assessPq024CommittedElectronPrelaunch(browserReceipt',
  );
  const prelaunchPass = source.indexOf(
    'assert.equal(browserCommittedPrelaunch.pass, true',
    prelaunchCall,
  );
  const playwrightLoad = source.indexOf('await loadPlaywright()', prelaunchPass);
  const electronLaunch = source.indexOf('electron.launch(electronLaunch.options)', playwrightLoad);
  assert.ok(prelaunchCall >= 0 && prelaunchPass > prelaunchCall
    && playwrightLoad > prelaunchPass && electronLaunch > playwrightLoad,
  'complete Browser receipt PASS assertion must precede Playwright load and Electron launch');
});

test('PQ-024 committed-transition projection is fail-closed and runtime-id neutral', () => {
  const receipt = {
    schema: PQ024_COMMITTED_TRANSITION_ROUTE_SCHEMA,
    runtime: 'browser-chromium-headed',
    disposition: 'PASS',
    fixedSeed: 24024,
    recordedSeed: 24024,
    brokerManifestId: 'pq024-committed-transition',
    screenshots: [{
      path: '.devshots/pq024-committed-transition/03-core-committed.png',
      bytes: 4096,
      sha256: 'a'.repeat(64),
    }],
    observations: {
      cargo: [{
        commodityId: 'cmdty_regocrete', qty: 7,
        before: { owned: 2 }, after: { owned: 9 },
      }],
      asteroid: { targetEntityId: 91, siteId: null },
      surveyReveal: { revealed: 3, cells: 3 },
      core: {
        siteId: 'site_claim_1', asteroidId: 91,
        anchored: true, lifecycle: 'committed', machineId: 101,
        cell: { col: 4, row: 6 },
      },
      committedPresentation: {
        owner: { siteId: 'site_claim_1', anchored: true, lifecycle: 'committed', cells: 3 },
        claimText: ' Anchored ',
        assayText: 'Assay 3 cells',
        alertText: '',
      },
    },
  };
  const browser = assessPq024CommittedTransitionReceipt(receipt, {
    expectedFixedSeed: 24024,
    expectedRuntime: 'browser-chromium-headed',
  });
  assert.equal(browser.pass, true, browser.failures.join('; '));
  assert.equal(browser.projection.schema, PQ024_COMMITTED_TRANSITION_SEMANTICS_SCHEMA);

  const electronReceipt = structuredClone(receipt);
  electronReceipt.runtime = 'electron';
  electronReceipt.observations.asteroid.targetEntityId = 9001;
  electronReceipt.observations.core.asteroidId = 9001;
  electronReceipt.observations.core.machineId = 9002;
  electronReceipt.screenshots[0].bytes = 8192;
  electronReceipt.screenshots[0].sha256 = 'b'.repeat(64);
  const electron = assessPq024CommittedTransitionReceipt(electronReceipt, {
    expectedFixedSeed: 24024,
    expectedRuntime: 'electron',
  });
  assert.equal(electron.pass, true, electron.failures.join('; '));
  assert.deepEqual(electron.projection, browser.projection,
    'runtime ids and image bytes do not alter committed presentation semantics');

  const wrongOwnerReceipt = structuredClone(electronReceipt);
  wrongOwnerReceipt.observations.core.asteroidId = 9002;
  const wrongOwner = assessPq024CommittedTransitionReceipt(wrongOwnerReceipt, {
    expectedFixedSeed: 24024,
    expectedRuntime: 'electron',
  });
  assert.equal(wrongOwner.pass, false);
  assert.equal(wrongOwner.projection.sameAsteroid, false);
  assert.ok(wrongOwner.failures.some((row) => row.includes('asteroid identity mismatch')),
    'the selected public target must be the asteroid that owns the installed Core');

  const stale = structuredClone(receipt);
  stale.observations.committedPresentation.claimText = 'No claim';
  stale.observations.extractor = { siteId: 'site_claim_1' };
  const rejected = assessPq024CommittedTransitionReceipt(stale, {
    expectedFixedSeed: 24024,
    expectedRuntime: 'browser-chromium-headed',
  });
  assert.equal(rejected.pass, false);
  assert.ok(rejected.failures.some((row) => row.includes('claim chip')));
  assert.ok(rejected.failures.some((row) => row.includes('downstream observation')));

  const missingNumbers = structuredClone(receipt);
  missingNumbers.fixedSeed = null;
  missingNumbers.recordedSeed = '   ';
  missingNumbers.observations.asteroid.targetEntityId = undefined;
  missingNumbers.observations.core.asteroidId = null;
  missingNumbers.observations.core.cell.col = null;
  missingNumbers.screenshots[0].bytes = null;
  const numericRejection = assessPq024CommittedTransitionReceipt(missingNumbers, {
    expectedFixedSeed: 24024,
    expectedRuntime: 'browser-chromium-headed',
  });
  assert.equal(numericRejection.pass, false);
  assert.equal(numericRejection.projection.fixedSeed, null);
  assert.equal(numericRejection.projection.recordedSeed, null);
  assert.equal(numericRejection.projection.sameAsteroid, false);
  assert.equal(numericRejection.projection.core.cell.col, null);
  assert.ok(numericRejection.failures.some((row) => row.includes('asteroid identity mismatch')));
  assert.ok(numericRejection.failures.some((row) => row.includes('screenshot metadata')));

  const identityDigests = {
    candidateDigest: '1'.repeat(64),
    sourceCandidateDigest: '2'.repeat(64),
    routeDigest: '3'.repeat(64),
    regressionDigest: '4'.repeat(64),
    profileDigest: '5'.repeat(64),
    manifestDigest: '6'.repeat(64),
  };
  const acceptedBrowser = structuredClone(receipt);
  acceptedBrowser.broker = {
    manifestId: 'pq024-committed-transition',
    primaryAcceptance: true,
    digests: identityDigests,
  };
  const prelaunch = assessPq024CommittedElectronPrelaunch(acceptedBrowser, {
    expectedFixedSeed: 24024,
    currentDigests: identityDigests,
  });
  assert.equal(prelaunch.pass, true, prelaunch.failures.join('; '));
  assert.deepEqual(prelaunch.projection, browser.projection);

  const invalidSemantics = structuredClone(acceptedBrowser);
  invalidSemantics.observations.committedPresentation.claimText = 'No claim';
  const invalidSemanticGate = assessPq024CommittedElectronPrelaunch(invalidSemantics, {
    expectedFixedSeed: 24024,
    currentDigests: identityDigests,
  });
  assert.equal(invalidSemanticGate.pass, false);
  assert.ok(invalidSemanticGate.failures.some((row) => row.includes('claim chip')));

  const invalidRuntime = structuredClone(acceptedBrowser);
  invalidRuntime.runtime = 'electron';
  const invalidRuntimeGate = assessPq024CommittedElectronPrelaunch(invalidRuntime, {
    expectedFixedSeed: 24024,
    currentDigests: identityDigests,
  });
  assert.equal(invalidRuntimeGate.pass, false);
  assert.ok(invalidRuntimeGate.failures.some((row) => row.includes('runtime is')));

  const staleDigests = { ...identityDigests, candidateDigest: 'f'.repeat(64) };
  const staleDigestGate = assessPq024CommittedElectronPrelaunch(acceptedBrowser, {
    expectedFixedSeed: 24024,
    currentDigests: staleDigests,
  });
  assert.equal(staleDigestGate.pass, false);
  assert.ok(staleDigestGate.failures.some((row) => row.includes('stale for candidateDigest')));
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
    "page.keyboard.down('Space')",
    "page.keyboard.press('KeyB')",
    "page.keyboard.press('KeyC')",
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
  const corePlacement = source.indexOf("const core = await placeSiteMachine(page, 'sm_massline_core'");
  const committedSettle = source.indexOf('waitForCommittedPresentation(page, core)', corePlacement);
  const committedScreenshot = source.indexOf("screenshot('03-core-committed.png')", committedSettle);
  assert.ok(corePlacement >= 0 && committedSettle > corePlacement && committedScreenshot > committedSettle,
    'the Core screenshot must follow the visible committed-presentation settle');

  const committedStart = source.indexOf('async function waitForCommittedPresentation');
  const committedEnd = source.indexOf('async function moveBuildCursor', committedStart);
  const committedSource = source.slice(committedStart, committedEnd);
  assert.match(committedSource, /retractPq024BuildMode\(\{/,
    'the actor must guard the mode-sensitive Build retraction before proving the site overview');
  assert.match(committedSource, /pressEscape:\s*\(\)\s*=>\s*page\.keyboard\.press\('Escape'\)/,
    'the guarded actor must retain the shipped Build-to-Drive keyboard control');
  assert.doesNotMatch(committedSource, /^\s*await page\.keyboard\.press\('Escape'\);/m,
    'the committed presentation actor must never issue an unconditional screen-exit Escape');
  assert.match(committedSource, /assessPq024CommittedPresentation/,
    'the actor must apply the pure committed-presentation contract to the settled DOM snapshot');
  for (const visibleTruth of [
    '[data-chip="claim"]',
    '[data-chip="assay"]',
    '.aw-alert',
  ]) {
    assert.ok(committedSource.includes(visibleTruth),
      `the committed settle must bind visible truth ${visibleTruth}`);
  }
  // The context bay is deleted (design law §10) and the cursor lens that replaced it is hover-only
  // and closed in this frame. Binding the settle to it again would be an assertion that can only
  // ever pass, so the retired selectors are banned outright.
  for (const retired of ['.ast-inspector', '.ast-insp-kicker', '.ast-insp-title']) {
    assert.ok(!source.includes(retired),
      `the probe must not read the deleted context bay surface ${retired}`);
  }
  for (const forbidden of [
    /\bsiteSys\.installMachine\s*\(/,
    /\bstate\.player\.cargo(?:\.items)?\s*=/,
    /\b(?:producing|inventory|survey|exteriorRelay)\s*=\s*(?:true|false|\{|\[)/,
  ]) {
    assert.doesNotMatch(committedSource, forbidden,
      `committed presentation wait contains forbidden owner mutation ${forbidden}`);
  }
  const enterStart = source.indexOf('async function enterAsteroidOps');
  const enterEnd = source.indexOf('async function createPq024MasslineLatchError', enterStart);
  const enterSource = source.slice(enterStart, enterEnd);
  assert.match(enterSource, /masslineAcquisition[\s\S]*selected\?\.targetId[\s\S]*selected\?\.status === 'ready'/,
    'Asteroid Ops entry must wait until the exact route-anchor acquisition is visibly ready');
  assert.match(enterSource, /latchStartTick[\s\S]*keyboard\.down\('Space'\)[\s\S]*Number\(state\?\.tick\) > Number\(startTick\)[\s\S]*tether\?\.active === true[\s\S]*keyboard\.up\('Space'\)/,
    'Asteroid Ops entry must hold the ordinary Massline input through terminal owner confirmation on a later fixed tick');
  assert.doesNotMatch(enterSource, /actions\?\.massline\?\.source === 'keyboard'/,
    'the actor must not miss a successful latch while polling a one-tick input edge');
  assert.doesNotMatch(enterSource, /keyboard\.(?:down|press)\(['"]Control/,
    'Asteroid Ops entry must not replace the selected asteroid with the nearest-surface override');
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

test('PQ-024 dock actor catches the transient public prompt between diagnostic samples', async () => {
  const publicPrompt = { text: '[ E ] DOCK AT STATION' };
  let resolveVisible;
  const visible = new Promise((resolve) => { resolveVisible = resolve; });
  let waits = 0;
  let snapshots = 0;
  const arrivedHandoff = {
    player: { alive: true, pos: { x: 1234, z: -451 }, speed: 0.25 },
    autopilot: { active: false, status: 'arrived', distance: 38, arrivalRadius: 90 },
    resolvedTarget: { dockingStage: 'berth', x: 1234, z: -489, arrivalRadius: 38 },
    dockingCorridor: {
      phase: 'capture',
      distToBerth: 17.5,
      distCenter: 77,
      inCorridor: true,
      inCapture: true,
    },
  };

  const observation = await observePq024DockPrompt({
    waitForVisible: () => visible,
    readSnapshot: async () => {
      snapshots += 1;
      return arrivedHandoff;
    },
    waitForSample: async () => {
      waits += 1;
      if (waits === 1) return;
      // Model the live failure's short dock:range window after the 38-WU autopilot handoff. The
      // old actor checked visibility only after each 500-ms sleep and could miss this entire pulse.
      resolveVisible(publicPrompt);
      return new Promise(() => {});
    },
    timeoutMs: 120_000,
    sampleIntervalMs: 500,
  });

  assert.equal(observation.prompt, publicPrompt);
  assert.equal(observation.waitError, null);
  assert.equal(snapshots, 1, 'the event-driven prompt must win before the next 500-ms snapshot');
  assert.equal(observation.evidence.bestBerthDistance, 17.5);
  assert.equal(observation.evidence.last.autopilot.status, 'arrived');
});

test('PQ-024 committed presentation never presses Escape when the public console is already Drive', async () => {
  let escapePresses = 0;
  const result = await retractPq024BuildMode({
    readMode: async () => 'drive',
    pressEscape: async () => { escapePresses += 1; },
  });

  assert.deepEqual(result, { before: 'drive', after: 'drive', escapePressed: false });
  assert.equal(escapePresses, 0,
    'Escape from Drive would exit Asteroid Ops instead of retracting a build cursor');
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

test('PQ-024 Massline latch timeout preserves exact route-vs-nearest evidence', () => {
  const samples = [{
    label: 'latch-timeout',
    desired: { id: 88, type: 'asteroid', centerDistance: 156, radius: 18, surfaceDistance: 138 },
    waypoint: { targetEntityId: 88 },
    acquisition: { selected: { targetId: 88, status: 'ready', context: 'route-anchor' } },
    input: { tetherMode: 'nearest', command: { latch: true, source: 'keyboard' } },
    tether: { active: true, targetId: 12 },
  }];
  const events = [{ name: 'tether:latched', tick: 500, payload: { targetId: 12 } }];
  const message = formatPq024MasslineLatchTimeout({ targetEntityId: 88, samples, events });
  assert.match(message, /^public Massline did not latch the selected asteroid; evidence=/);
  const evidence = JSON.parse(message.slice(message.indexOf('evidence=') + 'evidence='.length));
  assert.deepEqual(evidence, { targetEntityId: 88, samples, events });
  assert.equal(evidence.samples[0].acquisition.selected.context, 'route-anchor');
  assert.equal(evidence.samples[0].tether.targetId, 12);
  assert.notEqual(evidence.samples[0].tether.targetId, evidence.targetEntityId,
    'the regression fixture retains the competing nearest-surface latch');
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

test('the tracked registry resolves the bounded PQ-024 committed-transition manifest', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(new URL('../', import.meta.url)),
    id: 'pq024-committed-transition',
  });
  assert.equal(registered.id, committedManifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq024-committed-transition\.mjs$/);
});
