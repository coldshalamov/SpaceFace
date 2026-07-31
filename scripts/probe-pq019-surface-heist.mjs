#!/usr/bin/env node
// PQ-019C surface-heist route — broker-authorized headed Browser acceptance.
//
// One headed system-Chrome process runs six isolated, sequential contexts:
//   * the real Tethys station Missions DOM accepts the authored offer;
//   * the real J Mission Log DOM abandons it through the danger confirmation;
//   * fresh fixed-seed routes settle lawful arrival, fence success, confiscation, destruction, and
//     the opt-in reduced-stake recovery mechanism.
//
// Route compression is explicit and functional, not performance evidence. Travel uses the registered
// world.enterSector entry point; the witness/patrol fixture uses live entities and npcJobsRuntime;
// payload ownership/contact/destruction go through shipped tether:latched, physics:impact, and combat
// damage seams. No mission phase, candidate, receipt, outcome, payout, heat, or WANTED state is assigned
// by this probe. It records no frame time, percentile, hitch, or other speed measurement.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import manifest, {
  classifyPq019CapsuleWaitSnapshot,
  createPq019SurfaceHeistManifest,
  PQ019_SURFACE_HEIST_FIXED_SEED,
} from './validation-manifests/pq019-surface-heist.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq019-surface-heist');
const VIEWPORT = Object.freeze({ width: 1460, height: 900 });
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const CONTINUATION_ONLY = process.argv.includes('--continuation-only');
const FIXED_SEED = Number(process.env.SF_PROBE_SEED) > 0
  ? Number(process.env.SF_PROBE_SEED)
  : PQ019_SURFACE_HEIST_FIXED_SEED;
const HEIST_TYPE = 'heist_intercept';
const HEIST_STATION_ID = 'station_tethys';
const HEIST_SECTOR_ID = 'sector_tethys_junction';
const HEIST_VOICE_ID = 'pq019c:capsule-run';
const HEIST_VOICE_PRIORITY = 60;
const ACCEPTANCE_SETUP_ID = 'h1:pq019-surface-heist';

if (!DIAGNOSTIC && !CONTINUATION_ONLY) {
  console.error('[pq019-surface-heist] CONTINUATION_ONLY_REQUIRED: retained DOM-abandon and lawful-observe evidence must not be rerun');
  process.exit(2);
}

const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq019SurfaceHeistManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq019-surface-heist] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq019-surface-heist] invoke via: node scripts/validation-broker-cli.mjs --manifest pq019-surface-heist');
  console.error('[pq019-surface-heist] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

await mkdir(ARTIFACT_ROOT, { recursive: true });

let server = null;
let browser = null;
let activePage = null;
let activeScenario = null;
let receipt = null;
let gpu = null;
const completed = [];

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const executablePath = findSystemBrowser();
  assert(executablePath, 'headed Chrome or Edge is required for PQ-019C acceptance');
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--incognito',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--force-device-scale-factor=1',
    ],
  });

  const runScenario = async (id, options, body) => {
    activeScenario = id;
    const context = await browser.newContext({
      viewport: VIEWPORT,
      screen: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
      reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });
    const issueTracker = collectPageIssues(page, { includeWarnings: false });
    const screenshots = [];
    const screenshot = async (name) => {
      const record = await capturePng(page, name);
      screenshots.push(record);
      return record;
    };
    try {
      await bootSeededFlight(page, server.baseUrl);
      const scenarioGpu = await readGpu(page);
      assert.equal(scenarioGpu.available, true, `${id}: WebGL must be available`);
      assert.doesNotMatch(scenarioGpu.renderer, /SwiftShader|llvmpipe|software/i,
        `${id}: acceptance requires the real GPU path, got ${scenarioGpu.renderer}`);
      if (!gpu) gpu = scenarioGpu;
      else assert.equal(scenarioGpu.renderer, gpu.renderer, `${id}: GPU renderer changed between contexts`);
      await installObservers(page);
      const result = await body({ page, screenshot });
      const pageIssues = issueTracker.errorIssues();
      assert.deepEqual(pageIssues, [], `${id}: the live route emitted page errors`);
      const wrapped = { id, ...result, pageIssues, screenshots };
      completed.push(wrapped);
      return wrapped;
    } catch (error) {
      await page.screenshot({
        path: path.join(ARTIFACT_ROOT, `failure-${safeName(id)}.png`),
        type: 'png',
        animations: 'allow',
      }).catch(() => {});
      error.routePhase = id;
      throw error;
    } finally {
      activePage = null;
      await context.close().catch(() => {});
    }
  };

  const abandon = CONTINUATION_ONLY ? null : await runScenario('dom-abandon', {}, async ({ page, screenshot }) => {
    const fixture = await prepareFixture(page, { recoveryEnabled: false });
    const accepted = await acceptOfferThroughStationDom(page, fixture.offer.id, {
      screenshot,
      boardShot: 'dom-abandon-board.png',
    });
    await page.keyboard.press('KeyJ');
    await waitVisible(page, '[data-screen="missionLog"]', 'Mission Log after J');
    const abandonButton = page.locator(`[data-screen="missionLog"] [data-act="abandon"][data-mid="${accepted.mission.id}"]`);
    await abandonButton.waitFor({ state: 'visible' });
    await abandonButton.focus();
    assert.equal(await abandonButton.evaluate((el) => document.activeElement === el), true,
      'Mission Log abandon control must take focus');
    await screenshot('dom-abandon-log.png');
    await abandonButton.click();
    await waitVisible(page, '#sf-confirm-root .sf-confirm', 'abandon confirmation');
    const confirmation = await page.evaluate(() => {
      const dialog = document.querySelector('#sf-confirm-root .sf-confirm');
      const cancel = dialog?.querySelector('.sf-confirm__cancel');
      return {
        role: dialog?.getAttribute('role') || null,
        ariaModal: dialog?.getAttribute('aria-modal') || null,
        labelledBy: dialog?.getAttribute('aria-labelledby') || null,
        describedBy: dialog?.getAttribute('aria-describedby') || null,
        title: dialog?.querySelector('#sf-confirm-title')?.textContent || '',
        body: dialog?.querySelector('#sf-confirm-body')?.textContent || '',
        initialFocusIsCancel: document.activeElement === cancel,
      };
    });
    assert.equal(confirmation.role, 'dialog');
    assert.equal(confirmation.ariaModal, 'true');
    assert.equal(confirmation.initialFocusIsCancel, true,
      'danger confirmation must default to Cancel');
    assert.match(confirmation.title, /Abandon Capsule Run/i);
    assert.match(confirmation.body, /lose all progress/i);
    await screenshot('dom-abandon-confirm.png');
    await page.locator('#sf-confirm-root .sf-confirm__ok').click();
    const terminal = await waitForOutcome(page, accepted.mission.id, 'abandoned');
    await page.waitForTimeout(220);
    const focusAfter = await page.evaluate(() => ({
      confirmOpen: !!document.querySelector('#sf-confirm-root .sf-confirm'),
      activeTag: document.activeElement?.tagName || null,
      activeClass: document.activeElement?.className || null,
    }));
    assert.equal(focusAfter.confirmOpen, false, 'confirmation must close after abandonment');
    return {
      fixture,
      accepted,
      confirmation,
      focusAfter,
      terminal,
      trace: await readTrace(page),
      declaredRoute: 'station Missions DOM accept -> J Mission Log -> danger confirmation -> abandon',
    };
  });

  const lawful = CONTINUATION_ONLY ? null : await runScenario('lawful-observe', {}, async ({ page, screenshot }) => {
    const fixture = await prepareFixture(page, { recoveryEnabled: false });
    const accepted = await acceptOfferThroughStationDom(page, fixture.offer.id, {
      screenshot,
      boardShot: 'lawful-observe-board.png',
    });
    await waitForCapsule(page, accepted.mission.id);
    await clearVoiceAndStage(page, 'lawful_catcher_visual');
    await emitFacilityContact(page, 'lawful_catcher');
    const terminal = await waitForOutcome(page, accepted.mission.id, 'lawful_arrival_observed');
    const floor = await settleFloorForScreenshot(page, /Capsule caught by Concord/i);
    await screenshot('lawful-arrival.png');
    await unfreeze(page);
    return summarizeNamedRoute({ page, fixture, accepted, terminal, floor,
      declaredRoute: 'live capsule -> production physics:impact at lawful catcher' });
  });

  const fenced = await runScenario('heist-plus-fence', {}, async ({ page, screenshot }) => {
    const fixture = await prepareFixture(page, { recoveryEnabled: false });
    const accepted = await acceptOfferThroughStationDom(page, fixture.offer.id);
    await waitForCapsule(page, accepted.mission.id);
    const theft = await latchAndPresentTheft(page);
    const composedFloor = await readFloor(page);
    assertComposedFloor(composedFloor);
    await screenshot('fenced-composed-wanted.png');
    await unfreeze(page);
    await emitFacilityContact(page, 'fence_receiver');
    const terminal = await waitForOutcome(page, accepted.mission.id, 'fenced_success');
    const floor = await settleFloorForScreenshot(page, /Capsule fenced/i);
    await screenshot('fenced-success.png');
    await unfreeze(page);
    const summary = await summarizeNamedRoute({ page, fixture, accepted, terminal, floor,
      declaredRoute: 'production tether:latched -> witnessed WANTED pursuit -> physics:impact at fence' });
    summary.theft = theft;
    summary.composedFloor = composedFloor;
    return summary;
  });

  const confiscated = await runScenario('confiscation', {}, async ({ page, screenshot }) => {
    const fixture = await prepareFixture(page, { recoveryEnabled: false });
    const accepted = await acceptOfferThroughStationDom(page, fixture.offer.id);
    await waitForCapsule(page, accepted.mission.id);
    const theft = await latchAndPresentTheft(page);
    assertComposedFloor(await readFloor(page));
    await unfreeze(page);
    await emitFacilityContact(page, 'lawful_catcher');
    const terminal = await waitForOutcome(page, accepted.mission.id, 'lawful_confiscation');
    const floor = await settleFloorForScreenshot(page, /Capsule confiscated/i);
    await screenshot('confiscation.png');
    await unfreeze(page);
    const summary = await summarizeNamedRoute({ page, fixture, accepted, terminal, floor,
      declaredRoute: 'production tether:latched -> physics:impact at lawful catcher' });
    summary.theft = theft;
    return summary;
  });

  const destroyed = await runScenario('destruction', {}, async ({ page, screenshot }) => {
    const fixture = await prepareFixture(page, { recoveryEnabled: false });
    const accepted = await acceptOfferThroughStationDom(page, fixture.offer.id);
    await waitForCapsule(page, accepted.mission.id);
    const theft = await latchAndPresentTheft(page);
    assertComposedFloor(await readFloor(page));
    await unfreeze(page);
    const damage = await destroyCapsuleThroughCombat(page);
    assert.equal(damage.ok, true, 'the production combat kernel must accept capsule destruction');
    const terminal = await waitForOutcome(page, accepted.mission.id, 'payload_destroyed');
    const floor = await settleFloorForScreenshot(page, /Capsule destroyed/i);
    await screenshot('destruction.png');
    await unfreeze(page);
    const summary = await summarizeNamedRoute({ page, fixture, accepted, terminal, floor,
      declaredRoute: 'production tether:latched -> production combat damage -> entity:destroyed' });
    summary.theft = theft;
    summary.damage = damage;
    return summary;
  });

  const recovery = await runScenario('reduced-stake-recovery', { reducedMotion: true }, async ({ page, screenshot }) => {
    const fixture = await prepareFixture(page, { recoveryEnabled: true });
    const accepted = await acceptOfferThroughStationDom(page, fixture.offer.id);
    await waitForCapsule(page, accepted.mission.id);
    const firstTheft = await latchAndPresentTheft(page);
    assertComposedFloor(await readFloor(page));
    await unfreeze(page);
    const damage = await destroyCapsuleThroughCombat(page);
    assert.equal(damage.ok, true);
    const firstTerminal = await waitForOutcome(page, accepted.mission.id, 'payload_destroyed');

    const recoveryOffer = await page.waitForFunction(({ stationId, type }) => {
      const board = window.SF.registry.get('missions').ensureBoard(stationId);
      const offer = board.slots.find((row) => row && row.type === type && row.heistAttempt === 1);
      if (!offer) return null;
      offer.params.launchWindowS = 4;
      return {
        id: offer.id,
        title: offer.title,
        heistAttempt: offer.heistAttempt,
        rewardCr: offer.reward_cr,
        recoveryFromMissionId: offer.recoveryFromMissionId,
      };
    }, { stationId: HEIST_STATION_ID, type: HEIST_TYPE }, { timeout: 15_000 }).then((handle) => handle.jsonValue());
    assert.equal(recoveryOffer.heistAttempt, 1);
    assert.ok(recoveryOffer.rewardCr < fixture.offer.rewardCr, 'recovery must be reduced-stake');
    assert.equal(recoveryOffer.recoveryFromMissionId, accepted.mission.id);

    const retryAccepted = await acceptOfferThroughStationDom(page, recoveryOffer.id, {
      screenshot,
      boardShot: 'recovery-offer-reduced-motion.png',
    });
    await waitForCapsule(page, retryAccepted.mission.id);
    const retryTheft = await latchAndPresentTheft(page);
    assertComposedFloor(await readFloor(page));
    await unfreeze(page);
    await emitFacilityContact(page, 'fence_receiver');
    const terminal = await waitForOutcome(page, retryAccepted.mission.id, 'fenced_success');
    const floor = await settleFloorForScreenshot(page, /Capsule fenced/i);
    await screenshot('recovery-success-reduced-motion.png');
    await unfreeze(page);

    const summary = await summarizeNamedRoute({ page, fixture, accepted, terminal, floor,
      declaredRoute: 'recovery-enabled authored fixture -> destroyed attempt 0 -> DOM-accepted half-stake attempt 1 -> fence' });
    summary.firstTheft = firstTheft;
    summary.firstTerminal = firstTerminal;
    summary.damage = damage;
    summary.recoveryOffer = recoveryOffer;
    summary.retryAccepted = retryAccepted;
    summary.retryTheft = retryTheft;
    summary.accessibility = await page.evaluate(() => ({
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      floorCarriesMeaningInText: /Capsule fenced/i.test(document.querySelector('#alerts .sf-alert--floor .sf-alert__text')?.textContent || ''),
    }));
    return summary;
  });

  receipt = CONTINUATION_ONLY
    ? assertContinuationContract({ fenced, confiscated, destroyed, recovery })
    : assertAcceptanceContract({ abandon, lawful, fenced, confiscated, destroyed, recovery });
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({
      path: path.join(ARTIFACT_ROOT, `failure-${safeName(activeScenario || 'unknown')}.png`),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  receipt = {
    schema: 'spaceface.pq019-surface-heist.v1',
    runtime: 'browser-chromium-headed',
    disposition: 'FAIL',
    failureClass: 'UNCLASSIFIED_BY_PROBE',
    phase: error.routePhase || activeScenario || null,
    problems: [error?.message || String(error)],
    stack: error?.stack || null,
    fixedSeed: FIXED_SEED,
    gpu,
    completed,
    noPerformanceEvidence: true,
  };
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}

await writeFile(path.join(ARTIFACT_ROOT, 'route-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

if (receipt.disposition !== 'PASS') {
  console.error(`[pq019-surface-heist] FAIL in ${receipt.phase || 'unknown phase'}`);
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(CONTINUATION_ONLY
  ? '[pq019-surface-heist] PASS — four missing terminal/composition routes; retained contexts skipped'
  : '[pq019-surface-heist] PASS — five terminal routes plus DOM abandonment');
console.log(`  receipt: ${repoRel(path.join(ARTIFACT_ROOT, 'route-receipt.json'))}`);

function assertContinuationContract({ fenced, confiscated, destroyed, recovery }) {
  assert.equal(fenced.terminal.outcome, 'fenced_success');
  assert.equal(confiscated.terminal.outcome, 'lawful_confiscation');
  assert.equal(destroyed.terminal.outcome, 'payload_destroyed');
  assert.equal(recovery.firstTerminal.outcome, 'payload_destroyed');
  assert.equal(recovery.terminal.outcome, 'fenced_success');
  assert.equal(recovery.recoveryOffer.heistAttempt, 1);
  assert.ok(recovery.recoveryOffer.rewardCr < recovery.fixture.offer.rewardCr);
  assert.equal(recovery.accessibility.reducedMotion, true);
  assert.equal(recovery.accessibility.floorCarriesMeaningInText, true);
  assertComposedFloor(fenced.composedFloor);

  const all = [fenced, confiscated, destroyed, recovery];
  for (const route of all) {
    assert.equal(route.accepted.acceptedThroughDom, true, `${route.id}: offer must be accepted through DOM`);
    assert.equal(route.recordedSeed ?? route.fixture?.recordedSeed, FIXED_SEED,
      `${route.id}: fixed seed drifted`);
    assert.equal(route.pageIssues.length, 0, `${route.id}: page errors are not allowed`);
    assert.equal(route.terminal.terminalReceiptCount, 1, `${route.id}: exactly one terminal receipt`);
    assert.equal(route.terminal.missionSettlementCount, 1, `${route.id}: mission settles exactly once`);
  }
  return {
    schema: 'spaceface.pq019-surface-heist.v1',
    runtime: 'browser-chromium-headed',
    disposition: 'PASS',
    problems: [],
    continuationOnly: true,
    retainedEvidenceReferences: [
      'design/program/roadmap/evidence/h1/row4-pq019-surface-heist/EVIDENCE.md#functional-evidence-that-survived',
    ],
    skippedAcceptedContexts: ['dom-abandon', 'lawful-observe'],
    fixedSeed: FIXED_SEED,
    recordedSeeds: all.map((row) => ({ id: row.id, seed: row.recordedSeed ?? row.fixture?.recordedSeed })),
    gpu,
    brokerManifestId: manifest.id,
    launchContract: 'one headed browser process; four missing isolated route contexts run sequentially',
    noPerformanceEvidence: true,
    noPerformanceEvidenceNote:
      'This continuation contains functional states, DOM facts, counts, booleans, and screenshots only. '
      + 'It records no frame timing, percentile, hitch, or speed measurement; matched performance remains Phase H3.',
    routes: { fenced, confiscated, destroyed, recovery },
    screenshots: all.flatMap((row) => row.screenshots || []),
  };
}

function assertAcceptanceContract({ abandon, lawful, fenced, confiscated, destroyed, recovery }) {
  assert.equal(abandon.terminal.outcome, 'abandoned');
  assert.equal(lawful.terminal.outcome, 'lawful_arrival_observed');
  assert.equal(fenced.terminal.outcome, 'fenced_success');
  assert.equal(confiscated.terminal.outcome, 'lawful_confiscation');
  assert.equal(destroyed.terminal.outcome, 'payload_destroyed');
  assert.equal(recovery.firstTerminal.outcome, 'payload_destroyed');
  assert.equal(recovery.terminal.outcome, 'fenced_success');
  assert.equal(recovery.recoveryOffer.heistAttempt, 1);
  assert.ok(recovery.recoveryOffer.rewardCr < recovery.fixture.offer.rewardCr);
  assert.equal(recovery.accessibility.reducedMotion, true);
  assert.equal(recovery.accessibility.floorCarriesMeaningInText, true);
  assertComposedFloor(fenced.composedFloor);

  const all = [abandon, lawful, fenced, confiscated, destroyed, recovery];
  for (const route of all) {
    assert.equal(route.accepted.acceptedThroughDom, true, `${route.id}: offer must be accepted through DOM`);
    assert.equal(route.recordedSeed ?? route.fixture?.recordedSeed, FIXED_SEED,
      `${route.id}: fixed seed drifted`);
    assert.equal(route.pageIssues.length, 0, `${route.id}: page errors are not allowed`);
    assert.equal(route.terminal.terminalReceiptCount, 1, `${route.id}: exactly one terminal receipt`);
    assert.equal(route.terminal.missionSettlementCount, 1, `${route.id}: mission settles exactly once`);
  }
  return {
    schema: 'spaceface.pq019-surface-heist.v1',
    runtime: 'browser-chromium-headed',
    disposition: 'PASS',
    problems: [],
    fixedSeed: FIXED_SEED,
    recordedSeeds: all.map((row) => ({ id: row.id, seed: row.recordedSeed ?? row.fixture?.recordedSeed })),
    gpu,
    brokerManifestId: manifest.id,
    launchContract: 'one headed browser process; isolated route contexts run sequentially',
    noPerformanceEvidence: true,
    noPerformanceEvidenceNote:
      'This receipt contains functional states, DOM facts, counts, booleans, and screenshots only. '
      + 'It records no frame timing, percentile, hitch, or speed measurement; matched performance remains Phase H3.',
    declaredCompressions: [
      'registered world.enterSector travel instead of flying from Helios to Tethys',
      'live lawful station plus live npcJobsRuntime patrol fixture near the authored launcher so witness/WANTED/pursuit is non-vacuous',
      'per-offer launchWindowS shortened to four seconds; frozen shared tuning is untouched',
      'production tether:latched and physics:impact events compress manual acquisition and multi-thousand-WU contact travel',
      'production combat kernel destroys the live payload; no alive/hull/outcome field is assigned by the probe',
      'the recovery mechanism is exercised with offer.params.recoveryEnabled=true because authored shipping policy is false',
      'the one-voice queue is cleared after launch so the composed heist line is judged without unrelated onboarding/tracking copy',
    ],
    routes: { abandon, lawful, fenced, confiscated, destroyed, recovery },
    screenshots: all.flatMap((row) => row.screenshots || []),
  };
}

async function bootSeededFlight(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'route must use the canonical root with no debug flags');
  await page.bringToFront();
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry && window.SF?.helpers),
    null, { timeout: 45_000 });
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu');
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await waitVisible(page, '[data-screen="newGame"]', 'New Game');
  await page.fill('#sf-ng-seed', String(FIXED_SEED));
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: 120_000 });
  const recordedSeed = await page.evaluate(() => window.SF.state.meta?.seed ?? null);
  assert.equal(recordedSeed, FIXED_SEED, 'New Game must consume the broker seed');

  const begin = page.getByRole('button', { name: /^Begin$/i });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await page.evaluate(() => {
    const sf = window.SF;
    if (sf.state.onboarding) {
      sf.state.onboarding.active = false;
      sf.state.onboarding.finished = true;
    }
    sf.bus.emit('ui:closeAll', {});
    sf.bus.emit('voice:clear', {});
    sf.registry.get('voiceArbiter')?.newGame?.();
  });
}

async function installObservers(page) {
  await page.evaluate(() => {
    const clone = (value) => {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return { uncloneable: true }; }
    };
    const trace = window.__PQ019_H1_TRACE__ = {
      cues: [], surfaces: [], clears: [], settlements: [], grants: [], accepts: [], vfxCues: [],
      capsuleWaits: [],
    };
    const bus = window.SF.bus;
    bus.on('heist:missionCue', (payload) => trace.cues.push(clone(payload)));
    bus.on('voice:surface', (payload) => trace.surfaces.push(clone(payload)));
    bus.on('voice:clear', (payload) => trace.clears.push(clone(payload)));
    bus.on('mission:completed', (payload) => trace.settlements.push({ kind: 'completed', ...clone(payload) }));
    bus.on('mission:failed', (payload) => trace.settlements.push({ kind: 'failed', ...clone(payload) }));
    bus.on('mission:expired', (payload) => trace.settlements.push({ kind: 'expired', ...clone(payload) }));
    bus.on('economy:grantCredits', (payload) => trace.grants.push(clone(payload)));
    bus.on('ui:acceptMission', (payload) => trace.accepts.push(clone(payload)));
    bus.on('presentation:vfxCue', (payload) => trace.vfxCues.push(clone(payload)));
    window.__PQ019_H1_MISSIONS__ = Object.create(null);
  });
}

async function prepareFixture(page, { recoveryEnabled }) {
  return page.evaluate(async ({ sectorId, stationId, type, recovery }) => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    if (!world?.enterSector) throw new Error('registered world.enterSector is unavailable');
    world.enterSector(sectorId, {
      fromJump: true,
      placePlayer: true,
      via: 'h1-pq019-surface-heist',
      fromSectorId: state.world.currentSectorId,
    });
    for (let i = 0; i < 100 && state.world.currentSectorId !== sectorId; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (state.world.currentSectorId !== sectorId) throw new Error(`world remained in ${state.world.currentSectorId}`);

    const findRole = (role) => state.entityList.find((entity) => (
      entity?.alive !== false && entity.data?.heistFacilityRole === role
    ));
    for (let i = 0; i < 100 && !findRole('heist_launcher_head'); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const launcher = findRole('heist_launcher_head');
    if (!launcher) throw new Error('authored heist launcher head did not materialize');

    const station = sf.helpers.spawnEntity({
      type: 'station', team: 2, factionId: 'faction_scn',
      pos: { x: launcher.pos.x + 120, z: launcher.pos.z },
      radius: 42, mass: 1e9, hull: 1e9, hullMax: 1e9, collides: false, ttl: Infinity,
      data: {
        stationId: 'station_tethys_customs_h1', dockRadius: 72, factionId: 'faction_scn',
        worldRecordId: 'h1_pq019_customs_witness', acceptanceFixture: true,
      },
    });
    const patrol = sf.helpers.spawnEntity({
      type: 'ship', team: 2, factionId: 'faction_scn',
      pos: { x: launcher.pos.x + 200, z: launcher.pos.z + 60 },
      radius: 9, mass: 24, hull: 100, hullMax: 100, collides: true, ttl: Infinity,
      data: {
        worldRecordId: 'h1_pq019_patrol', acceptanceFixture: true,
        ai: { lawful: true, archetype: 'patrol_lawman', passive: true },
      },
    });
    const jobs = sf.registry.get('npcJobsRuntime');
    const job = jobs.assign(patrol, {
      kind: 'patrol',
      route: [
        { id: 'h1-b0', pos: { x: launcher.pos.x + 200, z: launcher.pos.z } },
        { id: 'h1-b1', pos: { x: launcher.pos.x, z: launcher.pos.z + 200 } },
      ],
      sectorId,
      speed: 100, commissionS: 1, departS: 1, approachS: 1,
      workS: 2, loadS: 1, unloadS: 1, dwellS: 1,
    });
    if (!job) throw new Error('npcJobsRuntime refused the lawful patrol fixture');

    const { buildHeistOffer } = await import('/src/data/heistMission.js');
    const missions = sf.registry.get('missions');
    const board = missions.ensureBoard(stationId);
    board.slots = board.slots.filter((offer) => offer && offer.type !== type);
    const offer = buildHeistOffer({ epoch: 0 });
    offer.params.launchWindowS = 4;
    offer.params.recoveryEnabled = recovery;
    board.slots.unshift(offer);

    return {
      recordedSeed: state.meta?.seed ?? null,
      sectorId: state.world.currentSectorId,
      offer: {
        id: offer.id,
        title: offer.title,
        type: offer.type,
        stationId: offer.stationId,
        rewardCr: offer.reward_cr,
        launchWindowS: offer.params.launchWindowS,
        recoveryEnabled: offer.params.recoveryEnabled,
      },
      witnessStationId: station.id,
      patrolEntityId: patrol.id,
      patrolJobId: typeof job === 'string' ? job : (job.id || job.jobId || null),
      launcherHeadId: launcher.id,
      setup: 'live station witness + live npcJobsRuntime patrol; no law receipt or heist state injected',
    };
  }, {
    sectorId: HEIST_SECTOR_ID,
    stationId: HEIST_STATION_ID,
    type: HEIST_TYPE,
    recovery: recoveryEnabled,
  });
}

async function acceptOfferThroughStationDom(page, offerId, { screenshot = null, boardShot = null } = {}) {
  await page.evaluate((stationId) => window.SF.bus.emit('dock:docked', { stationId }), HEIST_STATION_ID);
  await waitVisible(page, '[data-screen="station"] .sx-dock', 'station command dock');
  const nav = page.locator('[data-screen="station"] .sx-dock [data-nav="contracts"]');
  await nav.waitFor({ state: 'visible' });
  await nav.click();
  await waitVisible(page, '[data-screen="station"] .sx-ct', 'station Missions board');
  const row = page.locator(`[data-screen="station"] .sx-ct-row[data-mid="${offerId}"]`);
  await row.waitFor({ state: 'visible' });
  await row.click();
  const commit = page.locator(`[data-screen="station"] [data-accept="${offerId}"]`);
  await commit.waitFor({ state: 'visible' });
  assert.equal(await commit.isEnabled(), true, `${offerId}: station dossier must allow acceptance`);
  await commit.focus();
  const focusOnCommit = await commit.evaluate((el) => document.activeElement === el);
  assert.equal(focusOnCommit, true, `${offerId}: accept control must take keyboard focus`);
  const boardText = await page.locator('[data-screen="station"] .sx-ct__dossier').innerText();
  assert.match(boardText, /Capsule Run/i);
  assert.match(boardText, /1,800|900/);
  if (screenshot && boardShot) await screenshot(boardShot);
  await commit.click();
  await page.waitForFunction((id) => (
    window.SF.state.missions.active || []
  ).some((mission) => mission?.sourceOfferId === id && mission.heist), offerId, { timeout: 15_000 });
  const mission = await page.evaluate((id) => {
    const active = (window.SF.state.missions.active || [])
      .find((candidate) => candidate?.sourceOfferId === id && candidate.heist);
    window.__PQ019_H1_MISSIONS__[active.id] = active;
    return {
      id: active.id,
      sourceOfferId: active.sourceOfferId,
      title: active.title,
      attempt: active.heist.attempt,
      recoveryAllowed: active.heist.recoveryAllowed,
      trackedMissionId: window.SF.state.ui.trackedMissionId,
    };
  }, offerId);
  assert.equal(mission.sourceOfferId, offerId, 'the DOM offer must create the corresponding active mission');
  const undock = page.locator('[data-screen="station"] .sx-dock [data-act="undock"]');
  await undock.waitFor({ state: 'visible' });
  await undock.click();
  const launchAnyway = page.locator('[data-screen="station"] .sx-pop--dep [data-pop-launch]');
  if (await launchAnyway.isVisible().catch(() => false)) await launchAnyway.click();
  await page.waitForFunction(() => {
    const state = window.SF.state;
    return state.mode === 'flight' && state.ui?.docked !== true
      && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 15_000 });
  return {
    acceptedThroughDom: true,
    stationNavSelector: '[data-nav="contracts"]',
    acceptSelector: `[data-accept="${offerId}"]`,
    focusOnCommit,
    boardTextIncludesAuthoredTitle: /Capsule Run/i.test(boardText),
    mission,
  };
}

async function waitForCapsule(page, missionId) {
  const startedAtSimT = await page.evaluate(() => Number(window.SF.state.simTime) || 0);
  const protectiveWallDeadline = Date.now() + 45_000;
  let latestSnapshot = null;

  while (Date.now() < protectiveWallDeadline) {
    const snapshot = await page.evaluate(({ id, started }) => {
      const sf = window.SF;
      const state = sf.state;
      const mission = window.__PQ019_H1_MISSIONS__?.[id]
        || (state.missions.active || []).find((candidate) => candidate?.id === id)
        || null;
      const heist = mission?.heist || null;
      const owned = state.heistFacilities || {};
      const capsuleId = owned.capsuleEntityId ?? heist?.capsuleEntityId ?? null;
      const capsule = capsuleId == null ? null : state.entities.get(capsuleId);
      const schedule = owned.schedule || null;
      return {
        missionId: id,
        startedAtSimT: started,
        simTime: Number(state.simTime) || 0,
        tick: state.tick | 0,
        timeScale: Number(state.timeScale) || 0,
        mode: state.mode || null,
        schedule: schedule ? {
          scheduleId: schedule.scheduleId || null,
          status: schedule.status || null,
          launchAtSimT: Number.isFinite(schedule.launchAtSimT) ? schedule.launchAtSimT : null,
          launchedAtTick: Number.isInteger(schedule.launchedAtTick) ? schedule.launchedAtTick : null,
          capsuleEntityId: schedule.capsuleEntityId ?? null,
          receipt: schedule.receipt || null,
        } : null,
        mission: {
          found: !!mission,
          status: mission?.status || null,
          heist: heist ? {
            scheduleId: heist.scheduleId || null,
            scheduleRequested: !!heist.scheduleRequested,
            launchAtSimT: Number.isFinite(heist.launchAtSimT) ? heist.launchAtSimT : null,
            launchTick: Number.isInteger(heist.launchTick) ? heist.launchTick : null,
            capsuleEntityId: heist.capsuleEntityId ?? null,
            capsuleSeen: !!heist.capsuleSeen,
            settled: !!heist.settled,
            settledOutcome: heist.settledOutcome || null,
            terminalReceipt: heist.arbiter?.receipt || null,
          } : null,
        },
        capsule: capsule?.alive !== false && capsule?.data?.heistFacilityRole === 'cargo_capsule'
          ? { id: capsule.id, role: capsule.data.heistFacilityRole, hull: capsule.hull }
          : null,
      };
    }, { id: missionId, started: startedAtSimT });
    latestSnapshot = snapshot;
    const verdict = classifyPq019CapsuleWaitSnapshot(snapshot);
    if (verdict.status === 'ready') {
      const evidence = { missionId, verdict, snapshot };
      await page.evaluate((row) => window.__PQ019_H1_TRACE__?.capsuleWaits?.push(row), evidence);
      return { ...snapshot.capsule, waitEvidence: evidence };
    }
    if (verdict.status === 'terminal_race' || verdict.status === 'launch_missed') {
      throw new Error(`PQ019_CAPSULE_WAIT_${verdict.status.toUpperCase()} ${JSON.stringify({
        verdict,
        snapshot,
      })}`);
    }
    await page.waitForTimeout(50);
  }

  throw new Error(`PQ019_CAPSULE_WAIT_HARNESS_STALLED ${JSON.stringify({
    reason: 'protective_wall_deadline_without_simulation_verdict',
    verdict: classifyPq019CapsuleWaitSnapshot(latestSnapshot || { startedAtSimT }),
    snapshot: latestSnapshot,
  })}`);
}

async function clearVoiceAndStage(page, role) {
  await page.evaluate((wantedRole) => {
    const sf = window.SF;
    sf.timeEffects.clear('h1:pq019-surface-heist');
    sf.bus.emit('voice:clear', {});
    sf.registry.get('voiceArbiter')?.newGame?.();
    const subject = sf.state.entityList.find((entity) => (
      entity?.alive !== false && entity.data?.heistFacilityRole === wantedRole
    ));
    const player = sf.state.entities.get(sf.state.playerId);
    if (subject && player) {
      const x = subject.pos.x + Math.max(60, (Number(subject.radius) || 10) * 3);
      const z = subject.pos.z + Math.max(40, (Number(subject.radius) || 10) * 2);
      if (player.pos?.set) player.pos.set(x, 0, z); else Object.assign(player.pos, { x, z });
      player.prevPos?.copy?.(player.pos);
      player.vel?.set?.(0, 0, 0);
      sf.state.render?.cameraCtrl?.snapToPlayer?.();
    }
  }, role);
}

async function latchAndPresentTheft(page) {
  const theft = await page.evaluate((freezeId) => {
    const sf = window.SF;
    const state = sf.state;
    const capsuleId = state.heistFacilities?.capsuleEntityId;
    const capsule = capsuleId == null ? null : state.entities.get(capsuleId);
    const player = state.entities.get(state.playerId);
    if (!capsule || !player) throw new Error('latch needs the live capsule and player');
    sf.timeEffects.clear(freezeId);
    sf.bus.emit('voice:clear', {});
    const arbiter = sf.registry.get('voiceArbiter');
    arbiter?.newGame?.();
    const x = capsule.pos.x + 65;
    const z = capsule.pos.z + 45;
    if (player.pos?.set) player.pos.set(x, 0, z); else Object.assign(player.pos, { x, z });
    player.prevPos?.copy?.(player.pos);
    player.vel?.set?.(0, 0, 0);
    state.render?.cameraCtrl?.snapToPlayer?.();
    sf.bus.emit('tether:latched', { targetId: capsule.id, type: 'tether_massline' });
    arbiter?.update?.(0, state);
    const mission = (state.missions.active || []).find((candidate) => candidate?.heist);
    return {
      capsuleId: capsule.id,
      possessed: mission?.heist?.possessed === true,
      lawIncidentReceiptId: mission?.heist?.lawIncidentReceiptId || null,
      responderAvailability: mission?.heist?.responderAvailability || null,
      leaseCount: mission?.heist?.leases?.length || 0,
      heat: state.player.heat,
    };
  }, ACCEPTANCE_SETUP_ID);
  assert.equal(theft.possessed, true, 'tether:latched must transfer heist ownership');
  assert.ok(theft.lawIncidentReceiptId, 'the live law owner must sign the witnessed theft');
  assert.equal(theft.responderAvailability, 'available');
  assert.ok(theft.leaseCount >= 1, 'a real patrol job lease must be active');
  assert.ok(theft.heat > 0, 'the heat owner must consume the law-signed incident');
  try {
    await page.waitForFunction(({ voiceId, priority }) => {
      const floor = document.querySelector('#alerts .sf-alert--floor');
      const text = floor?.querySelector('.sf-alert__text')?.textContent || '';
      const surfaces = window.__PQ019_H1_TRACE__?.surfaces || [];
      return floor && /Theft witnessed/i.test(text) && /WANTED/.test(text) && /patrol/i.test(text)
        && surfaces.some((row) => row.id === voiceId && row.priority === priority && row.text === text);
    }, { voiceId: HEIST_VOICE_ID, priority: HEIST_VOICE_PRIORITY }, { timeout: 10_000 });
  } catch (_) {
    const snapshot = await page.evaluate((voiceId) => {
      const sf = window.SF;
      const trace = window.__PQ019_H1_TRACE__ || {};
      const arbiter = sf.registry.get('voiceArbiter');
      const mission = (sf.state.missions.active || []).find((candidate) => candidate?.heist);
      const clone = (value) => {
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
      };
      return {
        mode: sf.state.mode || null,
        simTime: Number(sf.state.simTime) || 0,
        tick: sf.state.tick | 0,
        timeScale: Number(sf.state.timeScale) || 0,
        heistCues: clone(mission?.heist?.cues || {}),
        cueReceipts: clone((trace.cues || []).filter((row) => row?.voiceId === voiceId)),
        traceSurfaces: clone(trace.surfaces || []),
        traceClears: clone(trace.clears || []),
        queue: {
          active: clone(arbiter?.queue?.active || null),
          pending: clone(arbiter?.queue?.pending || []),
          size: arbiter?.queue?.size || 0,
          activeKey: arbiter?._activeKey || null,
          presentSig: arbiter?._presentSig || null,
        },
        floors: [...document.querySelectorAll('#alerts .sf-alert--floor')].map((element) => ({
          className: element.className,
          role: element.getAttribute('role'),
          text: element.querySelector('.sf-alert__text')?.textContent || '',
        })),
      };
    }, HEIST_VOICE_ID);
    throw new Error(`PQ019_THEFT_PRESENTATION_STALLED ${JSON.stringify(snapshot)}`);
  }
  await page.evaluate((freezeId) => {
    window.SF.timeEffects.set(freezeId, { scale: 0 });
  }, ACCEPTANCE_SETUP_ID);
  return theft;
}

async function emitFacilityContact(page, facilityId) {
  await page.evaluate(({ wantedFacility, freezeId }) => {
    const sf = window.SF;
    const state = sf.state;
    sf.timeEffects.clear(freezeId);
    const capsuleId = state.heistFacilities?.capsuleEntityId;
    const capsule = capsuleId == null ? null : state.entities.get(capsuleId);
    const head = state.entityList.find((entity) => (
      entity?.alive !== false && entity.data?.heistFacilityRole === `${wantedFacility}_head`
    ));
    if (!capsule || !head) throw new Error(`contact needs live capsule and ${wantedFacility} head`);
    sf.bus.emit('physics:impact', {
      tick: (state.tick | 0) + 1,
      aId: capsule.id,
      bId: head.id,
      dp: 50,
      pos: { x: head.pos.x, z: head.pos.z },
      source: 'h1-pq019-route-compression',
    });
  }, { wantedFacility: facilityId, freezeId: ACCEPTANCE_SETUP_ID });
}

async function destroyCapsuleThroughCombat(page) {
  return page.evaluate((freezeId) => {
    const sf = window.SF;
    const state = sf.state;
    sf.timeEffects.clear(freezeId);
    const capsuleId = state.heistFacilities?.capsuleEntityId;
    const capsule = capsuleId == null ? null : state.entities.get(capsuleId);
    if (!capsule) throw new Error('combat destruction needs the live capsule');
    const request = {
      attackerId: state.playerId,
      targetId: capsule.id,
      packet: {
        channels: { kinetic: Math.max(10_000, (Number(capsule.hullMax) || 1) * 20) },
        penetration: 1,
        shieldBypass: 1,
        heat: 0,
        statuses: [],
        flags: { allowAnyTarget: true, ignoreFriendlyFire: true },
        hit: { pos: { x: capsule.pos.x, z: capsule.pos.z } },
      },
      origin: { kind: 'acceptance_fixture', id: 'pq019c-live-payload-destruction' },
    };
    const routed = typeof sf.helpers.routeCombatDamage === 'function'
      ? sf.helpers.routeCombatDamage(request)
      : sf.registry.get('combat')?.ensureKernel?.().routeDamage(request);
    return {
      ok: routed?.ok === true,
      targetId: capsule.id,
      totalApplied: routed?.totalApplied ?? null,
      hullBefore: routed?.before?.hull ?? null,
      hullAfter: routed?.after?.hull ?? capsule.hull,
      aliveAfterRoute: capsule.alive !== false,
      source: 'production combat kernel',
    };
  }, ACCEPTANCE_SETUP_ID);
}

async function waitForOutcome(page, missionId, expected) {
  const terminal = await page.waitForFunction(({ id, outcome }) => {
    const mission = window.__PQ019_H1_MISSIONS__?.[id];
    const receipt = mission?.heist?.arbiter?.receipt;
    if (!receipt || receipt.outcome !== outcome) return null;
    const effects = mission.heist.arbiter.effects || {};
    const effectCount = (slot) => receipt.effectKeys?.[slot] && effects[receipt.effectKeys[slot]] ? 1 : 0;
    return {
      missionId: id,
      outcome: receipt.outcome,
      status: receipt.status || null,
      winner: receipt.winner || null,
      terminalReceiptCount: 1,
      missionSettlementCount: effectCount('missionSettlement'),
      economyRewardCount: effectCount('economyReward'),
      factionOutcomeCount: effectCount('factionOutcome'),
      heatApplicationCount: effectCount('heatApplication'),
      lawIncidentCount: effectCount('lawIncident'),
      attempt: mission.heist.attempt,
      recoveryAllowed: mission.heist.recoveryAllowed,
    };
  }, { id: missionId, outcome: expected }, { timeout: 15_000 }).then((handle) => handle.jsonValue());
  assert.equal(terminal.terminalReceiptCount, 1, `${missionId}: exactly one terminal receipt`);
  return terminal;
}

async function settleFloorForScreenshot(page, expectedText) {
  await page.waitForFunction((source) => {
    const text = document.querySelector('#alerts .sf-alert--floor .sf-alert__text')?.textContent || '';
    return new RegExp(source, 'i').test(text);
  }, expectedText.source, { timeout: 10_000 });
  await page.evaluate((freezeId) => {
    const sf = window.SF;
    sf.registry.get('voiceArbiter')?.update?.(0, sf.state);
    sf.timeEffects.set(freezeId, { scale: 0 });
  }, ACCEPTANCE_SETUP_ID);
  return readFloor(page);
}

async function readFloor(page) {
  return page.evaluate((voiceId) => {
    const floors = [...document.querySelectorAll('#alerts .sf-alert--floor')];
    const text = floors[0]?.querySelector('.sf-alert__text')?.textContent || '';
    const trace = window.__PQ019_H1_TRACE__ || {};
    const matchingSurfaces = (trace.surfaces || []).filter((row) => row?.id === voiceId);
    const matchingToasts = [...document.querySelectorAll('#toasts .sf-toast')].filter((row) => (
      (row.textContent || '').trim() === text.trim()
    ));
    const arbiter = window.SF.registry.get('voiceArbiter');
    return {
      count: floors.length,
      text,
      role: floors[0]?.getAttribute('role') || null,
      matchingToastCount: matchingToasts.length,
      latestSurface: matchingSurfaces.at(-1) || null,
      heistSurfaceCount: matchingSurfaces.length,
      queue: {
        activeId: arbiter?.queue?.active?.id || null,
        activeText: arbiter?.queue?.active?.text || null,
        pendingCount: arbiter?.queue?.pending?.length || 0,
        size: arbiter?.queue?.size || 0,
      },
    };
  }, HEIST_VOICE_ID);
}

function assertComposedFloor(floor) {
  assert.equal(floor.count, 1, 'the headed route must show exactly one one-voice floor pill');
  assert.equal(floor.role, 'group', 'the one-voice floor keeps its grouped accessible surface');
  assert.match(floor.text, /witness/i, 'the composed floor must state the witness fact');
  assert.match(floor.text, /WANTED/, 'the composed floor must state the WANTED fact');
  assert.match(floor.text, /patrol/i, 'the composed floor must state the pursuit fact');
  assert.equal(floor.matchingToastCount, 0, 'the one-voice line must not duplicate as a toast');
  assert.equal(floor.latestSurface?.id, HEIST_VOICE_ID);
  assert.equal(floor.latestSurface?.priority, HEIST_VOICE_PRIORITY);
  assert.equal(floor.queue.activeId, HEIST_VOICE_ID);
  assert.equal(floor.queue.pendingCount, 0, 'no second voice may wait behind the composed line');
  assert.equal(floor.queue.size, 1, 'the heist line must occupy one queue slot');
}

async function summarizeNamedRoute({ page, fixture, accepted, terminal, floor, declaredRoute }) {
  const trace = await readTrace(page);
  const cueMoments = trace.cues.map((row) => row.moment).filter(Boolean);
  assert.equal(new Set(cueMoments).size, cueMoments.length, 'cue moments must be bounded, not repeated');
  const payouts = trace.grants.filter((row) => String(row?.reason || '').startsWith('mission:'));
  if (terminal.outcome === 'fenced_success') assert.equal(payouts.length, 1, 'fence success pays exactly once');
  else assert.equal(payouts.length, 0, `${terminal.outcome} must not pay`);
  return {
    fixture,
    recordedSeed: fixture.recordedSeed,
    accepted,
    terminal,
    floor,
    cueMoments,
    payouts,
    trace,
    declaredRoute,
  };
}

async function readTrace(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__PQ019_H1_TRACE__ || {})));
}

async function unfreeze(page) {
  await page.evaluate((freezeId) => window.SF.timeEffects.clear(freezeId), ACCEPTANCE_SETUP_ID);
}

async function readGpu(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { available: false, vendor: null, renderer: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
      renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    };
  });
}

async function waitVisible(page, selector, label) {
  try {
    await page.waitForFunction((sel) => {
      const element = document.querySelector(sel);
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 10;
    }, selector, { timeout: 30_000 });
  } catch (_) {
    throw new Error(`${label} never became visible (${selector})`);
  }
}

async function capturePng(page, name) {
  const file = path.join(ARTIFACT_ROOT, name);
  await page.screenshot({ path: file, type: 'png', animations: 'allow' });
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a real PNG`);
  return {
    path: repoRel(file),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function repoRel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function safeName(value) {
  return String(value || 'unknown').replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
}

function findSystemBrowser() {
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : process.platform === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/chromium'];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}
