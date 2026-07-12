import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './browser-issues.mjs';
import { loadPlaywright } from './load-playwright.mjs';
import { runBrowserPublicRoute } from './alphaLiveBaselineRoute.mjs';
import {
  createCanonicalUrlTracker,
  inspectCanonicalRootUrl,
  publishAcceptedArtifacts,
  worktreeFingerprint,
} from './alphaLiveBaselineContracts.mjs';
import { validateArtifactFiles, strictWorktreeFingerprint } from './releaseSoakContracts.mjs';
import { acquireVisualProbeServer } from './visualProbeServer.mjs';
import {
  APPROVED_RELEASE_CAPTURE_ENTRYPOINTS,
  APPROVED_RELEASE_CAPTURE_RUNNER,
  GAMEPLAY_MILESTONES,
  MONEY_MOMENTS,
  MOMENT_BINDING_CONTRACTS,
  RELEASE_CAPTURE_SCHEMA,
  artifactClaimFromBytes,
  buildReleaseCaptureReceipt,
  canonicalCaptureJson,
  validateReleaseCaptureManifest,
  validateReleaseCaptureReceipt,
} from './releaseCaptureContracts.mjs';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CAPTURE_ROOT = path.join(ROOT, '.devshots', 'spec2', 'release-capture');
const HISTORY_ROOT = path.join(ROOT, '.devshots', 'spec2', 'release-capture-history');
const ACCEPTED_ROOT = path.join(CAPTURE_ROOT, 'accepted');
const SHOT_WIDTH = 2560;
const SHOT_HEIGHT = 1440;
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const VIDEO_MIN_SECONDS = 58;
const VIDEO_MAX_SECONDS = 65;
const MAXIMUM_VIDEO_SETTINGS = Object.freeze({
  bloom: true,
  bloomStrength: 0.9,
  energyMaterials: true,
  renderGraph: true,
  renderScale: 2,
  dynamicResolution: false,
  particleQuality: 'high',
  engineTrails: true,
});

/**
 * Produce the release-capture packet through the normal public route. This function deliberately
 * has no dependency-injected browser or predicate seam: acceptance evidence must come from the
 * shipped route, headed system Chrome/Edge, and visible keyboard/mouse actions.
 */
export async function runReleaseCapture({ log = defaultLog, producerEntrypoint } = {}) {
  assert(APPROVED_RELEASE_CAPTURE_ENTRYPOINTS.includes(producerEntrypoint),
    `release capture requires an approved producer entrypoint, got ${producerEntrypoint}`);
  const captureId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
  const stagingRoot = path.join(CAPTURE_ROOT, `.tmp-${captureId}`);
  assertDescendant(CAPTURE_ROOT, stagingRoot, 'release capture staging root');
  await mkdir(CAPTURE_ROOT, { recursive: true });
  await mkdir(stagingRoot, { recursive: false });

  const startAlpha = await worktreeFingerprint(ROOT);
  const startStrict = await strictWorktreeFingerprint(ROOT);
  assert.equal(startAlpha.head, startStrict.head, 'capture fingerprint helpers must agree on HEAD');
  const candidate = {
    head: startAlpha.head,
    worktreeDigest: startAlpha.digest,
    selectionDigest: sha256(`${startAlpha.head}\0${startAlpha.digest}\0${startStrict.digest}`),
  };

  let server = null;
  let browser = null;
  let activePage = null;
  let activeContext = null;
  let activeTracker = null;
  let primaryError = null;
  let shotTrackerPassed = false;
  let shotPageClosed = false;
  let shotContextClosed = false;
  const publicActions = [];
  const browserIssues = [];
  const logs = [];
  const captureLog = (message) => {
    const row = `${new Date().toISOString()} ${message}`;
    logs.push(row);
    log(message);
  };

  try {
    server = await acquireVisualProbeServer({ root: ROOT });
    assert.equal(server.ownsServer, true, 'release capture must own an ephemeral visualProbeServer');
    const canonicalUrl = `${server.baseUrl.replace(/\/$/, '')}/`;
    assert.deepEqual(inspectCanonicalRootUrl(canonicalUrl, canonicalUrl).failures, []);

    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed system Chrome or Edge is required for release capture');
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: false,
      executablePath,
      args: [
        '--incognito',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--window-size=${SHOT_WIDTH},${SHOT_HEIGHT}`,
        '--force-device-scale-factor=1',
      ],
    });

    // Money-shot session: the existing alpha route proves normal launch, authored ship assets,
    // hardware rendering, station approach, physical docking, and canonical-root continuity.
    activeContext = await browser.newContext({
      viewport: { width: SHOT_WIDTH, height: SHOT_HEIGHT },
      screen: { width: SHOT_WIDTH, height: SHOT_HEIGHT },
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
    });
    activePage = await activeContext.newPage();
    activeTracker = createCanonicalUrlTracker(activePage, canonicalUrl);
    const shotIssues = collectPageIssues(activePage, { includeWarnings: false, ignoreProbeWarnings: true });
    activePage.setDefaultTimeout(30_000);
    activePage.setDefaultNavigationTimeout(60_000);
    await gotoCanonicalRoot(activePage, canonicalUrl, activeTracker);
    await dismissSplashWithKeyboard(activePage, publicActions);
    const shotSettings = await applyMaximumQualityThroughUi(activePage, publicActions);

    const baselineRoot = path.join(stagingRoot, 'alpha-route');
    await mkdir(baselineRoot, { recursive: true });
    const routeResult = await runBrowserPublicRoute({
      page: activePage,
      outputDir: baselineRoot,
      expectedRootUrl: canonicalUrl,
      log: captureLog,
      flightTimeoutMs: 150_000,
      dockTimeoutMs: 90_000,
    });
    assert.equal(routeResult.pass, true, 'alpha live baseline route must pass before release moments');

    const shots = [];
    const stationPath = shotRelativePath(MONEY_MOMENTS[2], 3);
    await mkdir(path.dirname(path.join(stagingRoot, stationPath)), { recursive: true });
    await copyFile(path.join(baselineRoot, '05-dock-prompt.png'), path.join(stagingRoot, stationPath));
    const stationProof = await inspectPng(path.join(stagingRoot, stationPath));
    assert.deepEqual(stationProof, { width: SHOT_WIDTH, height: SHOT_HEIGHT },
      'alpha station-approach capture must retain exact release-capture dimensions');
    shots.push(await claimShot(stagingRoot, stationPath, MONEY_MOMENTS[2], publicActions.length, {
      reached: routeResult.steps.some((step) => step.name === 'physical-dock-prompt'),
      hudVisible: true,
      authoredAssetsReady: routeResult.launchSnapshot?.authored?.ready === true,
      binding: {
        targetId: routeResult.navSnapshot?.autopilot?.targetEntityId || 'station_helios',
        ...MOMENT_BINDING_CONTRACTS[MONEY_MOMENTS[2].id],
        capturedTick: Math.max(0, Math.trunc(routeResult.approachSnapshot?.tick || 0)),
      },
    }));
    await rm(baselineRoot, { recursive: true, force: true });

    await visibleClick(activePage, activePage.getByRole('button', { name: /undock/i }).first(), 'Undock', publicActions);
    await activePage.waitForFunction(() => window.SF?.state?.mode === 'flight' && window.SF?.state?.ui?.docked !== true,
      null, { timeout: 30_000 });

    for (const moment of [MONEY_MOMENTS[1], MONEY_MOMENTS[3], MONEY_MOMENTS[0], MONEY_MOMENTS[4], MONEY_MOMENTS[5]]) {
      await driveMomentWithPublicInput(activePage, moment, publicActions);
      const predicate = await waitForReleaseMoment(activePage, moment.predicateId, 90_000);
      assert.equal(predicate.reached, true, `${moment.id} predicate was not reached`);
      const runtime = await readRuntimeVisualProof(activePage);
      assert.equal(runtime.hudVisible, true, `${moment.id} requires visible HUD`);
      assert.equal(runtime.authoredAssetsReady, true, `${moment.id} requires authored ship assets`);
      const relativePath = shotRelativePath(moment, MONEY_MOMENTS.indexOf(moment) + 1);
      await activePage.screenshot({ path: path.join(stagingRoot, relativePath), type: 'png' });
      const dimensions = await inspectPng(path.join(stagingRoot, relativePath));
      assert.deepEqual(dimensions, { width: SHOT_WIDTH, height: SHOT_HEIGHT }, `${moment.id} dimensions drifted`);
      shots.push(await claimShot(stagingRoot, relativePath, moment, publicActions.length, {
        reached: true,
        hudVisible: runtime.hudVisible,
        authoredAssetsReady: runtime.authoredAssetsReady,
        binding: predicate.binding,
      }));
    }
    shots.sort((a, b) => MONEY_MOMENTS.findIndex((moment) => moment.id === a.momentId)
      - MONEY_MOMENTS.findIndex((moment) => moment.id === b.momentId));

    await restoreSettingsThroughUi(activePage, shotSettings.original, publicActions);
    const restoredShotSettings = await readVideoSettings(activePage);
    assert.equal(settingsDigest(restoredShotSettings), shotSettings.originalSha256,
      'money-shot settings were not restored through visible Settings UI');
    browserIssues.push(...shotIssues.errorIssues());
    assert.deepEqual(browserIssues, [], `money-shot route emitted browser issues: ${JSON.stringify(browserIssues)}`);
    activeTracker.observeNow('money-shots-post-settings-restore');
    await activePage.close();
    shotPageClosed = activePage.isClosed();
    const shotTrackerReport = await activeTracker.stopAfterPageClose();
    assert.equal(shotTrackerReport.pass, true, `money-shot canonical URL lifecycle failed: ${JSON.stringify(shotTrackerReport)}`);
    shotTrackerPassed = shotTrackerReport.pass === true;
    await activeContext.close();
    shotContextClosed = true;
    activePage = null;
    activeContext = null;
    activeTracker = null;

    const videoCapture = await captureGameplayVideo({
      browser,
      canonicalUrl,
      stagingRoot,
      publicActions,
      browserIssues,
      log: captureLog,
    });
    const { cleanup: videoCleanup, ...videoResult } = videoCapture;

    await browser.close();
    const browserClosed = browser.isConnected() === false;
    browser = null;
    await server.close();
    const serverClosed = server.server?.listening === false;
    server = null;

    const cleanup = {
      completedBeforeManifest: true,
      shotPageClosed,
      shotContextClosed,
      videoPageClosed: videoCleanup.videoPageClosed,
      videoContextClosed: videoCleanup.videoContextClosed,
      browserClosed,
      serverClosed,
      canonicalTrackersPassed: shotTrackerPassed && videoCleanup.canonicalTrackersPassed,
    };
    assert(Object.values(cleanup).every((value) => value === true),
      `owned cleanup incomplete before manifest: ${JSON.stringify(cleanup)}`);

    const afterStrict = await strictWorktreeFingerprint(ROOT);
    const afterAlpha = await worktreeFingerprint(ROOT);
    assert.equal(afterStrict.digest, startStrict.digest, 'strict worktree fingerprint changed during capture');
    assert.equal(afterAlpha.digest, startAlpha.digest, 'alpha worktree fingerprint changed during capture');

    const artifacts = await collectArtifactClaims(stagingRoot, [
      ...shots.map((shot) => shot.path),
      videoResult.path,
      ...videoResult.decodedFrames.map((frame) => frame.path),
    ]);
    const verifiedResult = await validateArtifactFiles(stagingRoot, artifacts, { requireClaims: true });
    assert.equal(verifiedResult.pass, true, `release artifacts failed independent validation: ${verifiedResult.failures.join('; ')}`);
    const verifiedMedia = await independentlyVerifyCapturedMedia(stagingRoot, videoResult);
    const expectedTreeFiles = [...artifacts.map((artifact) => artifact.path), 'manifest.json', 'receipt.json'].sort(codeUnitCompare);

    const manifest = {
      schema: RELEASE_CAPTURE_SCHEMA,
      captureId,
      runtime: 'browser',
      canonicalUrl,
      candidate,
      policy: {
        canonicalRootOnly: true,
        visibleKeyboardMouseOnly: true,
        noInjection: true,
        authoredAssetsRequired: true,
        hudRequired: true,
        noSubstitutions: true,
      },
      settings: {
        changedOnlyThroughVisibleUi: true,
        maximumPresetVerified: shotSettings.maximumPresetVerified,
        originalSha256: shotSettings.originalSha256,
        captureSha256: shotSettings.captureSha256,
        restoredSha256: settingsDigest(restoredShotSettings),
        restored: true,
        visibleActions: shotSettings.visibleActions,
      },
      worktree: {
        beforeDigest: startAlpha.digest,
        afterDigest: afterAlpha.digest,
        unchanged: startAlpha.digest === afterAlpha.digest && startStrict.digest === afterStrict.digest,
      },
      route: {
        reusedVisualProbeServer: true,
        reusedAlphaLiveBaseline: true,
        browserIssues: summarizeIssues(browserIssues),
        publicActions: publicActions.map((action, index) => ({ ...action, seq: index + 1 })),
      },
      producer: {
        entrypoint: producerEntrypoint,
        runner: APPROVED_RELEASE_CAPTURE_RUNNER,
      },
      cleanup,
      shots,
      video: videoResult,
      artifacts,
    };
    const manifestValidation = validateReleaseCaptureManifest(manifest, {
      verifiedArtifacts: verifiedResult.verified,
      verifiedMedia,
      acceptedTreeFiles: expectedTreeFiles,
    });
    assert.equal(manifestValidation.ok, true, manifestValidation.issues.join('\n'));

    const manifestBytes = Buffer.from(`${canonicalCaptureJson(manifest)}\n`);
    const receipt = buildReleaseCaptureReceipt({
      manifestBytes,
      manifest,
      verifiedArtifacts: verifiedResult.verified,
      verifiedMedia,
      acceptedTreeFiles: expectedTreeFiles,
    });
    const receiptValidation = validateReleaseCaptureReceipt(receipt, {
      manifestBytes,
      manifest,
      verifiedArtifacts: verifiedResult.verified,
      verifiedMedia,
      acceptedTreeFiles: expectedTreeFiles,
    });
    assert.equal(receiptValidation.ok, true, receiptValidation.issues.join('\n'));
    await writeAtomic(path.join(stagingRoot, 'manifest.json'), manifestBytes);
    await writeAtomic(path.join(stagingRoot, 'receipt.json'), Buffer.from(`${canonicalCaptureJson(receipt)}\n`));
    const actualTreeFiles = await listTreeFiles(stagingRoot);
    assert.deepEqual(actualTreeFiles, expectedTreeFiles, 'staging tree contains undeclared release-capture files');
    const finalReceiptValidation = validateReleaseCaptureReceipt(receipt, {
      manifestBytes,
      manifest,
      verifiedArtifacts: verifiedResult.verified,
      verifiedMedia,
      acceptedTreeFiles: actualTreeFiles,
    });
    assert.equal(finalReceiptValidation.ok, true, finalReceiptValidation.issues.join('\n'));

    const publication = await publishAcceptedArtifacts({
      alphaRoot: CAPTURE_ROOT,
      historyRoot: HISTORY_ROOT,
      stagingRoot,
      acceptedRoot: ACCEPTED_ROOT,
    });
    return { pass: true, captureId, acceptedRoot: publication.acceptedRoot, manifest, receipt, publication };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (activePage || activeContext || browser || server) {
      try {
        if (activePage && !activePage.isClosed()) await activePage.close();
        if (activeTracker) await activeTracker.stopAfterPageClose().catch(() => {});
        if (activeContext) await activeContext.close();
        if (browser) await browser.close();
        if (server) await server.close();
      } catch (cleanupError) {
        if (!primaryError) throw cleanupError;
        primaryError.cleanupError = serializeError(cleanupError);
      }
    }
  }
}

async function captureGameplayVideo({ browser, canonicalUrl, stagingRoot, publicActions, browserIssues, log }) {
  const videoScratch = path.join(stagingRoot, '.video-source');
  await mkdir(videoScratch, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    screen: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'dark',
    recordVideo: { dir: videoScratch, size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } },
  });
  // Set quality and create a normal save on a visible setup page. A second page in the same
  // incognito context then reaches that save through the visible Continue button. This keeps the
  // accepted WebM inside 58-65 seconds without storage injection or recording a long setup pass.
  const setupPage = await context.newPage();
  const setupTracker = createCanonicalUrlTracker(setupPage, canonicalUrl);
  const setupIssues = collectPageIssues(setupPage, { includeWarnings: false, ignoreProbeWarnings: true });
  await gotoCanonicalRoot(setupPage, canonicalUrl, setupTracker);
  await dismissSplashWithKeyboard(setupPage, publicActions);
  const settings = await applyMaximumQualityThroughUi(setupPage, publicActions);
  await launchNewGameWithVisibleUi(setupPage, publicActions);
  await pressKey(setupPage, 'Escape', publicActions, 'pause setup session after normal save creation');

  const page = await context.newPage();
  const tracker = createCanonicalUrlTracker(page, canonicalUrl);
  const issues = collectPageIssues(page, { includeWarnings: false, ignoreProbeWarnings: true });
  const startedAt = Date.now();
  let videoHandle = null;
  let trackerReport = null;
  let setupTrackerReport = null;
  let sampler = null;
  let contextClosed = false;
  try {
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await gotoCanonicalRoot(page, canonicalUrl, tracker);
    await dismissSplashWithKeyboard(page, publicActions);
    await visibleClick(page, page.getByRole('button', { name: /^continue$/i }).first(), 'Continue', publicActions);
    await waitForAuthoredFlight(page, 150_000);
    assert.equal(settingsDigest(await readVideoSettings(page)), settings.captureSha256,
      'video page did not inherit the visibly selected maximum quality settings');
    sampler = startRuntimePolicySampler(page, startedAt);
    const milestones = [];
    milestones.push(milestone('launch', startedAt));

    await pressKey(page, 'KeyC', publicActions, 'scanner pulse');
    await page.waitForTimeout(900);
    milestones.push(milestone('scan', startedAt));

    await page.mouse.move(Math.round(VIDEO_WIDTH * 0.68), Math.round(VIDEO_HEIGHT * 0.48));
    recordAction(publicActions, 'pointer', 'aim mining beam');
    await page.mouse.down({ button: 'right' });
    recordAction(publicActions, 'pointer', 'RMB down mining beam');
    await waitForVideoMilestone(page, 'mine', 12_000);
    await page.mouse.up({ button: 'right' });
    recordAction(publicActions, 'pointer', 'RMB up mining beam');
    milestones.push(milestone('mine', startedAt));

    await pressKey(page, 'KeyV', publicActions, 'engage cruise');
    await page.keyboard.down('KeyW');
    recordAction(publicActions, 'keyboard', 'KeyW down');
    await waitForVideoMilestone(page, 'interdiction', 25_000);
    milestones.push(milestone('interdiction', startedAt));

    await page.mouse.move(Math.round(VIDEO_WIDTH * 0.62), Math.round(VIDEO_HEIGHT * 0.5));
    recordAction(publicActions, 'pointer', 'aim tether');
    await pressKey(page, 'KeyF', publicActions, 'tether latch');
    await waitForVideoMilestone(page, 'slingshot_escape', 15_000);
    milestones.push(milestone('slingshot_escape', startedAt));
    await page.keyboard.up('KeyW');
    recordAction(publicActions, 'keyboard', 'KeyW up');

    await dockThroughVisibleNavigation(page, publicActions);
    await waitForVideoMilestone(page, 'dock', 30_000);
    milestones.push(milestone('dock', startedAt));

    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed < VIDEO_MIN_SECONDS + 0.5) await page.waitForTimeout((VIDEO_MIN_SECONDS + 0.5 - elapsed) * 1000);
    assert((Date.now() - startedAt) / 1000 <= VIDEO_MAX_SECONDS,
      'public gameplay route exceeded the 65 second recording ceiling');

    const runtimeSamples = await sampler.stop();
    sampler = null;
    const runtimePolicy = inspectRuntimePolicySamples(runtimeSamples);
    assert.equal(runtimePolicy.pass, true, runtimePolicy.failures.join('; '));
    browserIssues.push(...issues.errorIssues(), ...setupIssues.errorIssues());
    assert.deepEqual(issues.errorIssues(), [], `video route emitted browser issues: ${JSON.stringify(issues.errorIssues())}`);
    videoHandle = page.video();
    tracker.observeNow('video-preclose');
    await page.close();
    trackerReport = await tracker.stopAfterPageClose();
    assert.equal(trackerReport.pass, true, `video canonical URL lifecycle failed: ${JSON.stringify(trackerReport)}`);

    // Restore through the still-visible setup page after the accepted WebM has stopped recording.
    await restoreSettingsThroughUi(setupPage, settings.original, publicActions);
    assert.equal(settingsDigest(await readVideoSettings(setupPage)), settings.originalSha256,
      'video-session settings were not restored through visible Settings UI');
    setupTracker.observeNow('video-setup-post-settings-restore');
    await setupPage.close();
    setupTrackerReport = await setupTracker.stopAfterPageClose();
    assert.equal(setupTrackerReport.pass, true,
      `video setup canonical URL lifecycle failed: ${JSON.stringify(setupTrackerReport)}`);
    await context.close();
    contextClosed = true;

    const sourcePath = await videoHandle.path();
    const relativePath = 'video/gameplay-60s.webm';
    const finalPath = path.join(stagingRoot, relativePath);
    await mkdir(path.dirname(finalPath), { recursive: true });
    await copyFile(sourcePath, finalPath);
    const media = await probeWebm(finalPath);
    assert(media.durationS >= VIDEO_MIN_SECONDS && media.durationS <= VIDEO_MAX_SECONDS,
      `decoded WebM duration must be ${VIDEO_MIN_SECONDS}-${VIDEO_MAX_SECONDS}s, got ${media.durationS}`);
    assert(media.width >= VIDEO_WIDTH && media.height >= VIDEO_HEIGHT,
      `decoded WebM must be at least ${VIDEO_WIDTH}x${VIDEO_HEIGHT}, got ${media.width}x${media.height}`);

    const decodedFrames = [];
    for (const [index, atS] of [5, 30, 55].entries()) {
      const framePath = `video/decoded-${index + 1}.png`;
      await decodeVideoFrame(finalPath, path.join(stagingRoot, framePath), atS);
      const dimensions = await inspectPng(path.join(stagingRoot, framePath));
      const bytes = await readFile(path.join(stagingRoot, framePath));
      decodedFrames.push({ atS, ...dimensions, ...artifactClaimFromBytes(framePath, bytes) });
    }
    await rm(videoScratch, { recursive: true, force: true });
    const bytes = await readFile(finalPath);
    log(`video decoded ${media.durationS.toFixed(2)}s ${media.width}x${media.height}`);
    return {
      ...artifactClaimFromBytes(relativePath, bytes),
      container: 'webm',
      durationS: media.durationS,
      width: media.width,
      height: media.height,
      decodedFrameCount: decodedFrames.length,
      decodedFrames,
      milestones,
      runtimeSamples,
      hudVisibleThroughout: runtimePolicy.hudVisibleThroughout,
      authoredAssetsThroughout: runtimePolicy.authoredAssetsThroughout,
      cleanup: {
        videoPageClosed: page.isClosed() && setupPage.isClosed(),
        videoContextClosed: contextClosed,
        canonicalTrackersPassed: trackerReport.pass === true && setupTrackerReport.pass === true,
      },
    };
  } finally {
    if (sampler) await sampler.stop().catch(() => {});
    if (!page.isClosed()) await page.close().catch(() => {});
    if (!trackerReport) await tracker.stopAfterPageClose().catch(() => {});
    if (!setupPage.isClosed()) await setupPage.close().catch(() => {});
    if (!setupTrackerReport) await setupTracker.stopAfterPageClose().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function applyMaximumQualityThroughUi(page, publicActions) {
  const original = await readVideoSettings(page);
  const originalSha256 = settingsDigest(original);
  await openSettingsVideo(page, publicActions);
  const visibleActions = ['Settings', 'Video'];
  for (const [label, value] of [
    ['Bloom', true],
    ['Bloom strength', 0.9],
    ['HDR energy materials', true],
    ['Render graph (GTAO + bloom)', true],
    ['Render scale', 2],
    ['Emergency dynamic resolution', false],
    ['Particle quality', 'high'],
    ['Engine trails', true],
  ]) {
    await setVisibleControl(page, label, value, publicActions);
    visibleActions.push(`${label}=${String(value)}`);
  }
  const capture = await readVideoSettings(page);
  assert.deepEqual(pickQualitySettings(capture), MAXIMUM_VIDEO_SETTINGS,
    'visible Settings UI did not apply the maximum release-exposed quality preset');
  await visibleClick(page, page.getByRole('button', { name: /^back$/i }).first(), 'Back', publicActions);
  visibleActions.push('Back');
  return {
    original,
    originalSha256,
    captureSha256: settingsDigest(capture),
    maximumPresetVerified: true,
    visibleActions,
  };
}

async function restoreSettingsThroughUi(page, original, publicActions) {
  // Escape/docking overlays are closed only through their public controls before opening Settings.
  if (await page.locator('[data-screen="station"]').isVisible().catch(() => false)) {
    await visibleClick(page, page.getByRole('button', { name: /undock/i }).first(), 'Undock before settings restore', publicActions);
    await page.waitForFunction(() => window.SF?.state?.ui?.docked !== true, null, { timeout: 30_000 });
  }
  await pressKey(page, 'Escape', publicActions, 'open pause menu');
  await openSettingsVideo(page, publicActions);
  for (const [label, value] of [
    ['Bloom', original.bloom],
    ['Bloom strength', original.bloomStrength],
    ['HDR energy materials', original.energyMaterials],
    ['Render graph (GTAO + bloom)', original.renderGraph],
    ['Render scale', original.renderScale],
    ['Emergency dynamic resolution', original.dynamicResolution],
    ['Particle quality', original.particleQuality],
    ['Engine trails', original.engineTrails],
  ]) await setVisibleControl(page, label, value, publicActions);
  await visibleClick(page, page.getByRole('button', { name: /^back$/i }).first(), 'Back', publicActions);
  await pressKey(page, 'Escape', publicActions, 'resume gameplay');
}

async function openSettingsVideo(page, publicActions) {
  const settings = page.getByRole('button', { name: /^settings$/i }).first();
  if (!(await settings.isVisible().catch(() => false))) {
    await pressKey(page, 'Escape', publicActions, 'open pause menu for Settings');
  }
  await visibleClick(page, page.getByRole('button', { name: /^settings$/i }).first(), 'Settings', publicActions);
  const video = page.getByRole('button', { name: /^video$/i }).first();
  if (await video.isVisible().catch(() => false)) await visibleClick(page, video, 'Video', publicActions);
  await page.getByLabel('Render scale', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
}

async function setVisibleControl(page, label, value, publicActions) {
  const control = page.getByLabel(label, { exact: true });
  await control.waitFor({ state: 'visible', timeout: 15_000 });
  const tag = await control.evaluate((element) => element.tagName.toLowerCase());
  const type = await control.getAttribute('type');
  if (tag === 'select') {
    await control.selectOption(String(value));
  } else if (type === 'range') {
    await control.fill(String(value));
    await control.dispatchEvent('input');
  } else {
    const pressed = await control.getAttribute('aria-pressed');
    if ((pressed === 'true') !== Boolean(value)) await control.click();
  }
  recordAction(publicActions, 'settings_control', `${label}=${String(value)}`);
}

async function readVideoSettings(page) {
  return page.evaluate(() => {
    const video = window.SF?.state?.settings?.video || {};
    return {
      bloom: video.bloom === true,
      bloomStrength: Number(video.bloomStrength),
      energyMaterials: video.energyMaterials === true,
      renderGraph: video.renderGraph === true,
      renderScale: Number(video.renderScale),
      dynamicResolution: video.dynamicResolution === true,
      particleQuality: String(video.particleQuality || ''),
      engineTrails: video.engineTrails !== false,
    };
  });
}

function pickQualitySettings(settings) {
  return Object.fromEntries(Object.keys(MAXIMUM_VIDEO_SETTINGS).map((key) => [key, settings[key]]));
}

async function driveMomentWithPublicInput(page, moment, actions) {
  switch (moment.predicateId) {
    case 'seam_lit_asteroid_under_beam':
      await page.mouse.move(Math.round(SHOT_WIDTH * 0.68), Math.round(SHOT_HEIGHT * 0.48));
      recordAction(actions, 'pointer', 'aim seam-lit asteroid');
      await page.mouse.down({ button: 'right' });
      recordAction(actions, 'pointer', 'RMB down mining beam');
      break;
    case 'wedge_formation_telegraphing':
      await pressKey(page, 'KeyC', actions, 'scanner pulse reveal formation');
      break;
    case 'tether_slingshot_mid_arc':
      await page.mouse.move(Math.round(SHOT_WIDTH * 0.62), Math.round(SHOT_HEIGHT * 0.5));
      recordAction(actions, 'pointer', 'aim tether anchor');
      await pressKey(page, 'KeyF', actions, 'tether latch');
      await page.keyboard.down('KeyW');
      recordAction(actions, 'keyboard', 'KeyW down through tether arc');
      await page.keyboard.down('KeyD');
      recordAction(actions, 'keyboard', 'KeyD down through tether arc');
      break;
    case 'cruise_streaks':
      await page.keyboard.up('KeyD').catch(() => {});
      await page.keyboard.up('KeyW').catch(() => {});
      await pressKey(page, 'KeyF', actions, 'release tether before cruise');
      await pressKey(page, 'KeyV', actions, 'engage cruise');
      await page.keyboard.down('KeyW');
      recordAction(actions, 'keyboard', 'KeyW down in cruise');
      break;
    case 'capital_kill_bloom':
      await page.keyboard.up('KeyW').catch(() => {});
      await pressKey(page, 'KeyV', actions, 'drop cruise');
      await page.mouse.move(Math.round(SHOT_WIDTH * 0.62), Math.round(SHOT_HEIGHT * 0.5));
      recordAction(actions, 'pointer', 'aim capital target');
      await page.mouse.down({ button: 'left' });
      recordAction(actions, 'pointer', 'LMB down fire at capital');
      break;
    default:
      throw new Error(`unsupported release moment: ${moment.predicateId}`);
  }
}

async function waitForReleaseMoment(page, predicateId, timeout) {
  const deadline = Date.now() + timeout;
  let proof = null;
  while (Date.now() < deadline) {
    proof = await page.evaluate(releaseMomentPredicateInPage, predicateId);
    if (proof?.reached === true) break;
    await page.waitForTimeout(100);
  }
  assert.equal(proof?.reached, true, `${predicateId} exact target/evidence/cue predicate timed out`);
  if (predicateId === 'seam_lit_asteroid_under_beam') await page.mouse.up({ button: 'right' });
  if (predicateId === 'tether_slingshot_mid_arc') {
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
  }
  if (predicateId === 'capital_kill_bloom') await page.mouse.up({ button: 'left' });
  return proof;
}

function releaseMomentPredicateInPage(predicateId) {
  const state = window.SF?.state;
  const player = state?.entities?.get?.(state.playerId);
  const list = Array.isArray(state?.entityList) ? state.entityList : [];
  const trace = window.SF?.eventTrace?.snapshot?.() || [];
  const recent = trace.slice(-160);
  if (!state || !player || player.alive === false) return { reached: false, reason: 'live player unavailable' };
  if (predicateId === 'tether_slingshot_mid_arc') {
    const tether = state.player?.tether;
    const speed = Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0));
    const targetId = tether?.targetId ?? null;
    const cue = [...recent].reverse().find((row) => row.type === 'presentation:cue'
      && row.payload?.id === 'tether.attach' && row.payload?.targetId === targetId);
    const applied = cue && recent.some((row) => row.seq >= cue.seq
      && row.type === 'presentation:cueApplied' && row.payload?.id === 'tether.attach');
    return {
      reached: tether?.active === true && targetId != null && speed >= 16 && !!applied,
      speed,
      binding: targetId == null ? null : {
        targetId: String(targetId), targetKind: 'tether_anchor', evidenceId: 'tether:attached',
        cueId: 'tether.attach', capturedTick: Math.max(0, Math.trunc(state.tick || 0)),
      },
    };
  }
  if (predicateId === 'seam_lit_asteroid_under_beam') {
    const vfx = window.SF?.registry?.get?.('vfx');
    const targetId = vfx?._miningSeamPulseId ?? null;
    const target = list.find((entity) => entity?.id === targetId && entity?.alive !== false);
    const hasSeamedTarget = !!(target && Array.isArray(target.data?.seams) && target.data.seams.length > 0);
    const mining = state.input?.fireGroup === 2 && Number(state.player?.miningNoise || 0) > 0;
    const cue = [...recent].reverse().find((row) => row.type === 'presentation:cue'
      && row.payload?.id === 'mining.seam.quality' && row.payload?.targetId === targetId
      && Array.isArray(row.payload?.tags) && row.payload.tags.includes('on_seam'));
    const applied = cue && recent.some((row) => row.seq >= cue.seq
      && row.type === 'presentation:cueApplied' && row.payload?.id === 'mining.seam.quality');
    return {
      reached: mining && hasSeamedTarget && !!applied,
      mining,
      hasSeamedTarget,
      binding: targetId == null ? null : {
        targetId: String(targetId), targetKind: 'asteroid', evidenceId: 'mining:tick',
        cueId: 'mining.seam.quality', capturedTick: Math.max(0, Math.trunc(state.tick || 0)),
      },
    };
  }
  if (predicateId === 'station_approach_core_palette') {
    const prompt = document.querySelector('#hud-dock-prompt, .dock-prompt, [data-dock-prompt]');
    const style = prompt ? getComputedStyle(prompt) : null;
    const visible = !!(prompt && style?.display !== 'none' && style?.visibility !== 'hidden');
    return { reached: visible && state.ui?.docked !== true, visible };
  }
  if (predicateId === 'wedge_formation_telegraphing') {
    const wedge = list.filter((entity) => entity?.type === 'ship' && entity?.alive !== false
      && entity.id !== state.playerId && (entity.data?.ai?.formation === 'wedge' || entity.data?.ai?.formationSlot));
    const groups = new Set(wedge.map((entity) => entity.data?.ai?.formationGroupId || entity.data?.ai?.squadId).filter(Boolean));
    const groupId = [...groups][0] ?? null;
    const memberIds = new Set(wedge.filter((entity) => (entity.data?.ai?.formationGroupId || entity.data?.ai?.squadId) === groupId)
      .map((entity) => entity.id));
    const cue = [...recent].reverse().find((row) => row.type === 'presentation:cue'
      && row.payload?.id === 'combat.doctrine.telegraph' && memberIds.has(row.payload?.sourceId));
    const applied = cue && recent.some((row) => row.seq >= cue.seq
      && row.type === 'presentation:cueApplied' && row.payload?.id === 'combat.doctrine.telegraph');
    return {
      reached: memberIds.size >= 3 && groupId != null && !!applied,
      shipCount: memberIds.size,
      groupCount: groups.size,
      binding: groupId == null ? null : {
        targetId: String(groupId), targetKind: 'hostile_squad', evidenceId: 'ai:telegraph',
        cueId: 'combat.doctrine.telegraph', capturedTick: Math.max(0, Math.trunc(state.tick || 0)),
      },
    };
  }
  if (predicateId === 'cruise_streaks') {
    const speed = Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0));
    const cue = [...recent].reverse().find((row) => row.type === 'presentation:cue'
      && row.payload?.id === 'travel.cruise.engaged' && row.payload?.sourceId === state.playerId);
    const applied = cue && recent.some((row) => row.seq >= cue.seq
      && row.type === 'presentation:cueApplied' && row.payload?.id === 'travel.cruise.engaged');
    return {
      reached: state.player?.cruise?.phase === 'cruising' && speed >= 40 && !!applied,
      speed,
      phase: state.player?.cruise?.phase || 'off',
      binding: {
        targetId: String(state.playerId), targetKind: 'player_ship', evidenceId: 'cruise:engaged',
        cueId: 'travel.cruise.engaged', capturedTick: Math.max(0, Math.trunc(state.tick || 0)),
      },
    };
  }
  if (predicateId === 'capital_kill_bloom') {
    const kill = [...recent].reverse().find((row) => row.type === 'entity:killed'
      && /capital|flagship|cruiser|gunship|battleship|dread/i.test(String(row.payload?.victimClass || row.payload?.type || '')));
    const targetId = kill?.payload?.id ?? kill?.payload?.targetId ?? kill?.payload?.victimId ?? null;
    const cue = kill && [...recent].reverse().find((row) => row.seq >= kill.seq && row.type === 'presentation:cue'
      && row.payload?.id === 'combat.player.kill' && row.payload?.targetId === targetId);
    const applied = cue && recent.some((row) => row.seq >= cue.seq
      && row.type === 'presentation:cueApplied' && row.payload?.id === 'combat.player.kill');
    return {
      reached: !!(kill && cue && applied && targetId != null),
      killSeq: kill?.seq ?? null,
      presentationCue: !!applied,
      binding: targetId == null ? null : {
        targetId: String(targetId), targetKind: 'capital_ship', evidenceId: 'entity:killed',
        cueId: 'combat.player.kill', capturedTick: Math.max(0, Math.trunc(state.tick || 0)),
      },
    };
  }
  return { reached: false, reason: `unknown predicate ${predicateId}` };
}

async function readRuntimeVisualProof(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const ships = Array.isArray(state?.entityList)
      ? state.entityList.filter((entity) => entity?.type === 'ship' && entity?.alive !== false)
      : [];
    const hud = document.getElementById('hud');
    const style = hud ? getComputedStyle(hud) : null;
    const rect = hud?.getBoundingClientRect();
    return {
      hudVisible: !!(hud && !hud.hidden && style?.display !== 'none' && style?.visibility !== 'hidden'
        && Number(style?.opacity || 1) > 0.01 && Number(rect?.width || 0) > 1 && Number(rect?.height || 0) > 1),
      authoredAssetsReady: ships.length > 0
        && ships.every((ship) => ship?.mesh?.userData?.authoredAssetState === 'authored'),
      shipCount: ships.length,
    };
  });
}

async function launchNewGameWithVisibleUi(page, actions) {
  await visibleClick(page, page.getByRole('button', { name: 'New Game', exact: true }), 'New Game', actions);
  const launch = page.getByRole('button', { name: /launch/i }).first();
  await visibleClick(page, launch, 'Launch', actions);
  await waitForAuthoredFlight(page, 150_000);
}

async function waitForAuthoredFlight(page, timeout) {
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state.playerId);
    const ships = Array.isArray(state?.entityList) ? state.entityList.filter((entry) => entry?.type === 'ship' && entry.alive !== false) : [];
    return state?.mode === 'flight' && player?.alive !== false && Number(player?.hull || 0) > 0
      && ships.length > 0 && ships.every((ship) => ship?.mesh?.userData?.authoredAssetState === 'authored');
  }, null, { timeout });
}

async function waitForVideoMilestone(page, id, timeout) {
  await page.waitForFunction((milestoneId) => {
    const state = window.SF?.state;
    const trace = window.SF?.eventTrace?.snapshot?.() || [];
    if (milestoneId === 'mine') return Number(state?.player?.miningNoise || 0) > 0 && state?.input?.fireGroup === 2;
    if (milestoneId === 'interdiction') return state?.player?.cruise?.phase !== 'cruising'
      && trace.some((row) => row.type === 'presentation:cueApplied'
        && /interdiction/i.test(JSON.stringify(row.payload || {})));
    if (milestoneId === 'slingshot_escape') {
      const player = state?.entities?.get?.(state.playerId);
      return state?.player?.tether?.active === true
        && Math.hypot(Number(player?.vel?.x || 0), Number(player?.vel?.z || 0)) >= 16;
    }
    if (milestoneId === 'dock') return state?.ui?.docked === true;
    return false;
  }, id, { timeout });
}

async function dockThroughVisibleNavigation(page, actions) {
  await pressKey(page, 'KeyM', actions, 'open local map');
  const station = page.getByText(/Helios Station/i).first();
  await visibleClick(page, station, 'Helios Station', actions);
  const waypoint = page.getByRole('button', { name: /set waypoint/i }).first();
  await visibleClick(page, waypoint, 'Set Waypoint', actions);
  await pressKey(page, 'KeyM', actions, 'close local map');
  await page.waitForFunction(() => window.SF?.state?.nav?.autopilot?.active === true, null, { timeout: 10_000 });
  await page.getByText(/\bE\b.*\bDOCK\b|\bDOCK\b.*\bE\b/i).first().waitFor({ state: 'visible', timeout: 30_000 });
  await pressKey(page, 'KeyE', actions, 'dock');
}

async function dismissSplashWithKeyboard(page, actions) {
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 30_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await pressKey(page, 'Space', actions, 'dismiss cinematic splash');
    await splash.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

async function gotoCanonicalRoot(page, canonicalUrl, tracker) {
  const response = await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert(response, 'canonical root navigation did not return a response');
  assert.deepEqual(inspectCanonicalRootUrl(response.url(), canonicalUrl).failures, []);
  assert.deepEqual(inspectCanonicalRootUrl(page.url(), canonicalUrl).failures, []);
  const observation = tracker.observeNow('post-navigation-live');
  assert.deepEqual(observation.failures, []);
}

async function visibleClick(page, locator, label, actions) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
  await locator.click();
  recordAction(actions, label === 'Settings' || label === 'Video' ? 'settings_click' : 'pointer', label);
}

async function pressKey(page, key, actions, purpose) {
  await page.keyboard.press(key);
  recordAction(actions, 'keyboard', `${key}: ${purpose}`);
}

function recordAction(actions, kind, value) {
  actions.push({ kind, value: String(value) });
}

function milestone(id, startedAt) {
  assert(GAMEPLAY_MILESTONES.includes(id), `unknown gameplay milestone ${id}`);
  return { id, reached: true, atS: Math.round((Date.now() - startedAt) / 10) / 100 };
}

function shotRelativePath(moment, index) {
  return `shots/${String(index).padStart(2, '0')}-${moment.id}.png`;
}

async function claimShot(root, relativePath, moment, publicActionCount, proof) {
  const bytes = await readFile(path.join(root, relativePath));
  const claim = artifactClaimFromBytes(relativePath, bytes);
  const expectedBinding = MOMENT_BINDING_CONTRACTS[moment.id];
  assert(proof.binding && proof.binding.targetKind === expectedBinding.targetKind
    && proof.binding.evidenceId === expectedBinding.evidenceId
    && proof.binding.cueId === expectedBinding.cueId,
  `${moment.id} runtime proof is not bound to its exact target/evidence/cue`);
  return {
    momentId: moment.id,
    predicateId: moment.predicateId,
    reached: proof.reached === true,
    width: SHOT_WIDTH,
    height: SHOT_HEIGHT,
    hudVisible: proof.hudVisible === true,
    authoredAssetsReady: proof.authoredAssetsReady === true,
    canonicalRoot: true,
    publicActionCount,
    ...claim,
    binding: { ...proof.binding, frameSha256: claim.sha256 },
  };
}

async function collectArtifactClaims(root, relativePaths) {
  const unique = [...new Set(relativePaths)].sort(codeUnitCompare);
  const claims = [];
  for (const relativePath of unique) {
    const bytes = await readFile(path.join(root, relativePath));
    claims.push(artifactClaimFromBytes(relativePath, bytes));
  }
  return claims;
}

async function independentlyVerifyCapturedMedia(root, video) {
  const videoPath = path.join(root, video.path);
  const bytes = await readFile(videoPath);
  const claim = artifactClaimFromBytes(video.path, bytes);
  const probed = await probeWebm(videoPath);
  const scratch = path.join(root, '.independent-media-verify');
  await mkdir(scratch, { recursive: false });
  try {
    const decodedFrames = [];
    for (const [index, expected] of video.decodedFrames.entries()) {
      const decodedPath = path.join(scratch, `decoded-${index + 1}.png`);
      await decodeVideoFrame(videoPath, decodedPath, expected.atS);
      const decodedBytes = await readFile(decodedPath);
      const dimensions = await inspectPng(decodedPath);
      const independentClaim = artifactClaimFromBytes(expected.path, decodedBytes);
      assert.equal(independentClaim.sha256, expected.sha256,
        `independent decoded frame ${expected.atS}s differs from declared artifact`);
      decodedFrames.push({
        atS: expected.atS,
        ...dimensions,
        ...independentClaim,
        magicVerified: true,
        decodedFromVideoSha256: claim.sha256,
      });
    }
    return {
      video: {
        ...claim,
        container: probed.container,
        durationS: probed.durationS,
        width: probed.width,
        height: probed.height,
        magicVerified: true,
        ffprobeVerified: true,
      },
      decodedFrames,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function listTreeFiles(root) {
  const files = [];
  async function visit(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => codeUnitCompare(a.name, b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const metadata = await lstat(absolute);
      assert.equal(metadata.isSymbolicLink(), false, `release tree refuses symlink ${relative}`);
      if (metadata.isDirectory()) await visit(absolute, relative);
      else {
        assert.equal(metadata.isFile(), true, `release tree refuses non-file ${relative}`);
        files.push(relative.replace(/\\/g, '/'));
      }
    }
  }
  await visit(root);
  return files.sort(codeUnitCompare);
}

async function probeWebm(filePath) {
  const bytes = await readFile(filePath);
  assert(bytes.length > 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
    'recorded gameplay artifact is not an EBML WebM');
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:format=duration,format_name', '-of', 'json', filePath,
  ], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] || {};
  assert(/webm|matroska/i.test(String(parsed.format?.format_name || '')), 'ffprobe did not identify WebM/Matroska');
  return {
    container: 'webm',
    width: Number(stream.width),
    height: Number(stream.height),
    durationS: Math.round(Number(parsed.format?.duration) * 1000) / 1000,
  };
}

async function decodeVideoFrame(inputPath, outputPath, atS) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y', '-ss', String(atS), '-i', inputPath,
    '-map_metadata', '-1', '-threads', '1', '-frames:v', '1', outputPath,
  ], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function inspectPng(filePath) {
  const bytes = await readFile(filePath);
  assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `${filePath} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function startRuntimePolicySampler(page, startedAt) {
  let stopping = false;
  const samples = [];
  const promise = (async () => {
    while (!stopping) {
      if (page.isClosed()) break;
      const proof = await readRuntimeVisualProof(page);
      samples.push({
        atS: Math.round((Date.now() - startedAt) / 10) / 100,
        hudVisible: proof.hudVisible,
        authoredAssetsReady: proof.authoredAssetsReady,
        shipCount: proof.shipCount,
      });
      await delay(250);
    }
  })();
  return {
    async stop() {
      stopping = true;
      await promise;
      return samples.slice();
    },
  };
}

function inspectRuntimePolicySamples(samples) {
  const failures = [];
  if (!Array.isArray(samples) || samples.length < 20) failures.push('video needs at least 20 live HUD/asset samples');
  if (samples.some((sample) => sample.hudVisible !== true)) failures.push('HUD disappeared during captured gameplay');
  if (samples.some((sample) => sample.authoredAssetsReady !== true)) failures.push('authored ship readiness lapsed during captured gameplay');
  if (samples.some((sample) => !Number.isFinite(sample.atS) || sample.atS < 0)) failures.push('runtime sample timestamps are invalid');
  return {
    pass: failures.length === 0,
    failures,
    hudVisibleThroughout: failures.every((failure) => !failure.startsWith('HUD disappeared')),
    authoredAssetsThroughout: failures.every((failure) => !failure.startsWith('authored ship')),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function settingsDigest(value) {
  return sha256(canonicalCaptureJson(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function codeUnitCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function findSystemBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

async function writeAtomic(filePath, bytes) {
  assertDescendant(CAPTURE_ROOT, filePath, 'release capture artifact');
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  await writeFile(temporary, bytes);
  await rename(temporary, filePath);
}

function assertDescendant(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `${label} escaped ${parent}: ${child}`);
}

function serializeError(error) {
  return { name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null };
}

function defaultLog(message) {
  console.log(`[release-capture] ${message}`);
}
