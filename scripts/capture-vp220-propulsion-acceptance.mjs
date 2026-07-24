#!/usr/bin/env node
/**
 * VP-220 propulsion acceptance capture.
 *
 * Schema: spaceface.vp220PropulsionAcceptance.v1
 *
 * Modes:
 *   --self-test          No browser. Validate synthetic good/bad reports + hash live files.
 *   --validate <path>    Validate an existing report.json (fail-closed; uses --artifact-root).
 *   --runtime browser    Headed/headless Playwright against normal game route (GPU).
 *   --runtime electron   Isolated Electron New Game route (GPU).
 *   --prepare-only       Write blocked artifact contract without launching GPU.
 *
 * Shared scenario contract lives in scripts/lib/vp220-propulsion-acceptance.mjs.
 * Browser and Electron use the same scenario ids and diagnostics shape.
 *
 * Output: .devshots/graphics/vp220-propulsion/{browser|electron}/
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, rename, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

import {
  SCHEMA_ID,
  SCENARIO_CONTRACT,
  REQUIRED_PROFILE_IDS,
  LIFECYCLE_PHASE_ORDER,
  KESTREL_SHIPPED_GLB_URL,
  createReportSkeleton,
  validateVp220PropulsionReport,
  runReportValidatorSelfTest,
  hashFileAbsolute,
  buildCurrentTreeCandidateIdentity,
  PAGE_DIAGNOSTICS_SOURCE,
  assertReadableCoreInner,
  buildRegistryFamilyMatrix,
  deriveStructuralSignature,
} from './lib/vp220-propulsion-acceptance.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'graphics', 'vp220-propulsion');
const ARGS = process.argv.slice(2);
const WIDTH = 1440;
const HEIGHT = 900;
const CAPTURE_TIME_SOURCE = 'capture:vp220-propulsion-acceptance';

function hasFlag(name) {
  return ARGS.includes(name);
}
function argValue(name, fallback = null) {
  const i = ARGS.indexOf(name);
  if (i < 0 || i + 1 >= ARGS.length) return fallback;
  return ARGS[i + 1];
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Current-tree candidate identity shared by self-test / prepare-only / full capture.
 * HEAD + sorted path/sha256/bytes of every RUNTIME_HASH_PATHS file (exact contents).
 */
function resolveCandidateIdentity(head = null) {
  return buildCurrentTreeCandidateIdentity(ROOT, head || gitHead() || 'unknown');
}

await mkdir(OUT, { recursive: true });

// ── No-browser paths ──────────────────────────────────────────────────────────

if (hasFlag('--self-test')) {
  const identity = resolveCandidateIdentity();
  const head = identity.gitHead;
  const result = runReportValidatorSelfTest({ root: ROOT, gitHead: head });
  const liveHashes = identity.runtimeHashes;
  const missingHash = liveHashes.filter((h) => h.missing);
  const payload = {
    schema: SCHEMA_ID,
    mode: 'self-test',
    ok: result.ok && missingHash.length === 0,
    gitHead: head,
    candidateHash: identity.candidateHash,
    candidateIdentity: identity.identityInputs,
    runtimeHashes: liveHashes,
    validator: result,
    missingRuntimeFiles: missingHash.map((h) => h.path),
    outputDir: OUT,
    visualStatus: 'N/A_SELF_TEST',
  };
  const outPath = path.join(OUT, 'self-test-report.json');
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: payload.ok,
    schema: SCHEMA_ID,
    gitHead: head,
    candidateHash: identity.candidateHash,
    identityInputs: {
      scheme: identity.identityInputs.scheme,
      gitHead: identity.identityInputs.gitHead,
      runtimeFileCount: identity.identityInputs.runtimeFiles.length,
      runtimeFiles: identity.identityInputs.runtimeFiles,
    },
    goodPassed: result.goodPassed,
    badPassed: result.badPassed,
    badCases: result.results.filter((r) => r.name !== 'good-report').map((r) => ({
      name: r.name,
      passed: r.passed,
      failureCount: (r.failures || []).length,
    })),
    runtimeHashCount: liveHashes.length,
    missingRuntimeFiles: payload.missingRuntimeFiles,
    outPath,
  }, null, 2));
  if (!payload.ok) process.exitCode = 1;
  process.exit(process.exitCode || 0);
}

if (hasFlag('--validate')) {
  const reportPath = argValue('--validate');
  if (!reportPath || !existsSync(reportPath)) {
    console.error(`--validate requires an existing report path, got ${reportPath}`);
    process.exit(2);
  }
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const artifactRoot = argValue('--artifact-root', OUT);
  const result = validateVp220PropulsionReport(report, { artifactRoot });
  console.log(JSON.stringify({ path: reportPath, artifactRoot, ...result }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (hasFlag('--prepare-only') || (!hasFlag('--runtime') && !hasFlag('--force-gpu'))) {
  // Staged blocked contract: explicit missing evidence, validation ok:false, exit 0.
  const identity = resolveCandidateIdentity();
  const head = identity.gitHead;
  const runtimeHashes = identity.runtimeHashes;
  const cand = identity.candidateHash;
  const report = createReportSkeleton({
    ok: false,
    prepareOnly: true,
    runtime: 'prepare-only',
    gitHead: head,
    candidateHash: cand,
    candidateIdentity: identity.identityInputs,
    runtimeHashes,
    artifacts: [],
    temporalMatrices: { browser: null, electron: null },
    projection: null,
    kestrel: null,
    families: [],
    scenarios: [],
    visualStatus: 'BLOCKED_BY_OCCUPIED_LARK_GPU_LEASE',
    blocked: {
      reason: 'BLOCKED_BY_OCCUPIED_LARK_GPU_LEASE',
      note: 'Headed Browser/Electron/GPU capture is leased to a foreign Lark lane (NOW.md). '
        + 'Do not copy baseline thruster shots as candidate proof. Run --runtime browser|electron '
        + 'only after the GPU lease is free. This prepare-only package is incomplete evidence.',
      missingEvidence: [
        'artifacts',
        'temporalMatrices.browser',
        'temporalMatrices.electron',
        'projection',
        'kestrel sockets',
        'allocation samples',
        'gpu identity',
      ],
    },
    preparedCommands: {
      browser: 'node scripts/capture-vp220-propulsion-acceptance.mjs --runtime browser --force-gpu',
      electron: 'node scripts/capture-vp220-propulsion-acceptance.mjs --runtime electron --force-gpu',
      selfTest: 'node scripts/capture-vp220-propulsion-acceptance.mjs --self-test',
      validate: 'node scripts/capture-vp220-propulsion-acceptance.mjs --validate .devshots/graphics/vp220-propulsion/report-browser.json --artifact-root .devshots/graphics/vp220-propulsion',
    },
    artifactPaths: {
      dir: OUT,
      browserRoot: path.join(OUT, 'browser'),
      electronRoot: path.join(OUT, 'electron'),
      reportBrowser: path.join(OUT, 'report-browser.json'),
      reportElectron: path.join(OUT, 'report-electron.json'),
      selfTest: path.join(OUT, 'self-test-report.json'),
      prepare: path.join(OUT, 'prepare-only.json'),
      temporalPhases: LIFECYCLE_PHASE_ORDER.slice(),
    },
    scenarioContract: SCENARIO_CONTRACT,
    requiredProfiles: REQUIRED_PROFILE_IDS.slice(),
  });
  const validation = validateVp220PropulsionReport(report, { artifactRoot: OUT });
  report.validation = validation;
  report.ok = false;
  const outPath = path.join(OUT, 'prepare-only.json');
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: false,
    validationOk: validation.ok,
    schema: SCHEMA_ID,
    visualStatus: report.visualStatus,
    gitHead: head,
    candidateHash: cand,
    identityInputs: {
      scheme: identity.identityInputs.scheme,
      gitHead: identity.identityInputs.gitHead,
      runtimeFileCount: identity.identityInputs.runtimeFiles.length,
      runtimeFiles: identity.identityInputs.runtimeFiles,
    },
    runtimeHashCount: runtimeHashes.length,
    scenarioCount: SCENARIO_CONTRACT.length,
    requiredProfiles: REQUIRED_PROFILE_IDS.length,
    failureCount: validation.failures.length,
    failures: validation.failures.slice(0, 12),
    outPath,
    preparedCommands: report.preparedCommands,
  }, null, 2));
  // prepare-only is an intentional incomplete artifact — exit 0 so CI/harness can stage the contract.
  process.exit(0);
}

// ── GPU runtime capture (browser | electron) ──────────────────────────────────

const runtime = argValue('--runtime', 'browser');
if (runtime !== 'browser' && runtime !== 'electron') {
  console.error(`--runtime must be browser|electron, got ${runtime}`);
  process.exit(2);
}

if (!hasFlag('--force-gpu')) {
  console.error(
    'GPU capture refused: NOW.md assigns browser-gpu to an occupied foreign Lark lane.\n'
    + 'Re-run with --force-gpu only when the lease is free.\n'
    + 'Use --self-test or --prepare-only for safe no-GPU paths.',
  );
  process.exit(3);
}

const RUNTIME_OUT = path.join(OUT, runtime);
await mkdir(RUNTIME_OUT, { recursive: true });

const { loadPlaywright } = await import('./lib/load-playwright.mjs');
const issues = [];
const captures = [];
let report = null;
let videoMeta = null;

try {
  if (runtime === 'browser') {
    const { acquireVisualProbeServer } = await import('./lib/visualProbeServer.mjs');
    const { chromium } = await loadPlaywright();
    const executablePath = findSystemBrowser();
    if (!executablePath) throw new Error('Chrome or Edge required for browser capture');
    const ownedServer = await acquireVisualProbeServer({
      explicitUrl: process.env.SF_PROBE_URL || '',
      root: ROOT,
    });
    const browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--ignore-gpu-blocklist', '--enable-webgl'],
    });
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      recordVideo: { dir: RUNTIME_OUT, size: { width: WIDTH, height: HEIGHT } },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => issues.push({
      type: 'pageerror',
      text: error?.stack || error?.message || String(error),
    }));
    page.on('console', (message) => {
      if (message.type() === 'error') issues.push({ type: 'console.error', text: message.text() });
    });

    try {
      await page.addInitScript(() => {
        try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
      });
      await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, {
        timeout: 30_000,
      });
      await page.evaluate(() => window.SF.bus.emit('game:new', {
        name: 'VP220 Propulsion Acceptance',
        seed: 220,
      }));
      await waitFlight(page);
      await dismissTutorial(page);
      report = await runScenarioMatrix(page, {
        runtime: 'browser',
        baseUrl: ownedServer.baseUrl,
        runtimeOut: RUNTIME_OUT,
      });
    } finally {
      // Optional supplemental browser video only if page.video() exists.
      const video = typeof page.video === 'function' ? page.video() : null;
      await context.close().catch(() => {});
      if (video) {
        try {
          const rawPath = await video.path();
          if (rawPath && existsSync(rawPath)) {
            const dest = path.join(RUNTIME_OUT, 'vp220-propulsion-route.webm');
            if (path.resolve(rawPath) !== path.resolve(dest)) {
              try {
                await rename(rawPath, dest);
              } catch {
                await copyFile(rawPath, dest);
              }
            }
            const hashed = hashFileAbsolute(dest);
            if (!hashed.missing && !hashed.empty) {
              videoMeta = {
                supported: true,
                path: path.relative(OUT, dest).replace(/\\/g, '/'),
                runtime: 'browser',
                bytes: hashed.bytes,
                sha256: hashed.sha256,
              };
            } else {
              videoMeta = { supported: true, path: null, error: 'video file empty or missing after close' };
            }
          } else {
            videoMeta = { supported: true, path: null, error: 'video path missing after context close' };
          }
        } catch (err) {
          videoMeta = { supported: true, path: null, error: err?.message || String(err) };
          issues.push({ type: 'video', text: videoMeta.error });
        }
      } else {
        videoMeta = { supported: false, path: null };
      }
      await browser.close().catch(() => {});
      await ownedServer.close().catch(() => {});
    }
  } else {
    const {
      assertIsolatedElectronRootUrl,
      createIsolatedElectronLaunch,
    } = await import('./lib/electronTestIsolation.mjs');
    const { _electron: electron } = await loadPlaywright();
    const isolated = createIsolatedElectronLaunch({
      root: ROOT,
      taskId: 'vp220-propulsion-electron',
    });
    let app;
    let runtimeClosed = false;
    try {
      app = await electron.launch(isolated.options);
      const page = await app.firstWindow({ timeout: 90_000 });
      page.on('pageerror', (error) => issues.push({
        type: 'pageerror',
        text: error?.stack || error?.message || String(error),
      }));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          issues.push({ type: 'console.error', text: message.text() });
        }
      });
      await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
      await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, {
        timeout: 90_000,
      });
      const rootUrl = assertIsolatedElectronRootUrl(page.url());
      await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
      await waitFlight(page);
      await dismissTutorial(page);
      report = await runScenarioMatrix(page, {
        runtime: 'electron',
        baseUrl: rootUrl,
        runtimeOut: RUNTIME_OUT,
      });
      // Electron capture must not invent a video path when unsupported.
      videoMeta = { supported: false, videoSupported: false, path: null };
    } finally {
      if (app) {
        await app.close().catch(() => {});
        runtimeClosed = true;
      }
      isolated.cleanup({ runtimeClosed });
    }
  }

  if (report) {
    report.issues = issues;
    report.video = videoMeta;
    // Full report validation always uses artifactRoot = OUT (runtime-scoped paths under it).
    const validation = validateVp220PropulsionReport(report, { artifactRoot: OUT });
    report.validation = validation;
    report.ok = validation.ok && issues.length === 0;
    const outName = runtime === 'electron' ? 'report-electron.json' : 'report-browser.json';
    const outPath = path.join(OUT, outName);
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: report.ok,
      schema: SCHEMA_ID,
      runtime,
      outPath,
      runtimeOut: RUNTIME_OUT,
      failures: validation.failures,
      issueCount: issues.length,
      captures: captures.length,
      video: videoMeta,
    }, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}

// ── Scenario matrix (shared browser/electron) ─────────────────────────────────

async function runScenarioMatrix(page, meta) {
  const identity = resolveCandidateIdentity();
  const head = identity.gitHead;
  const cand = identity.candidateHash;
  const runtimeHashes = identity.runtimeHashes;
  const scenarios = [];
  const artifacts = [];
  const temporalMatrix = Object.create(null);
  const phaseFrames = Object.create(null);
  const plumeSamples = [];
  const rcsSamples = [];
  const fleetSamples = [];
  const denseSamples = [];
  let projection = null;
  let kestrel = null;

  // Baseline settings via public settings events (not private VFX).
  await page.evaluate(() => {
    const state = window.SF.state;
    state.settings.video.engineTrails = true;
    state.settings.video.energyMaterials = true;
    state.settings.video.particleQuality = 'high';
    state.settings.accessibility.motionPreference = 'full';
    state.settings.accessibility.flashReduce = false;
    window.SF.bus.emit('settings:changed', { section: 'video', key: 'engineTrails' });
  });

  // Synthetic dense multi-family fixtures only — labeled, never authored.
  // Direct state edits allowed solely for this labeled fixture creation.
  await page.evaluate((profileIds) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    if (!player) return;
    if (!player.data) player.data = {};
    player.data.defId = player.data.defId || 'ship_kestrel';
    let nextId = 9200;
    for (const profileId of profileIds) {
      if (profileId === 'engine_ion_small') continue;
      const id = nextId++;
      if (state.entities.has(id)) continue;
      const angle = (id - 9200) * 0.9;
      const e = {
        id,
        type: 'ship',
        alive: true,
        isPlayer: false,
        pos: {
          x: (player.pos?.x || 0) + Math.cos(angle) * 40,
          z: (player.pos?.z || 0) + Math.sin(angle) * 40,
        },
        vel: { x: Math.cos(angle) * 20, z: Math.sin(angle) * 20 },
        rot: angle,
        radius: 6,
        maxSpeed: 120,
        data: {
          defId: profileId === 'engine_vector' ? 'ship_wasp'
            : profileId === 'engine_industrial' ? 'ship_mule'
              : profileId === 'engine_plasma_ring' ? 'ship_bastion'
                : profileId === 'engine_ion_twin' ? 'ship_pelican'
                  : profileId === 'engine_resonator' ? 'ship_ranger'
                    : 'ship_wasp',
          engineProfileId: profileId,
          fixtureSource: 'synthetic',
        },
        // Fixture drive authority for synthetic dense entities only (not live player input).
        _flightFrame: { throttle: 0.85, boost: 0, maxSpeed: 120 },
        flags: { fixtureSource: 'synthetic' },
        source: 'synthetic',
      };
      e.data.slots = { engine: [`engines/${profileId}.glb`] };
      state.entities.set(id, e);
      if (Array.isArray(state.entityList)) state.entityList.push(e);
    }
  }, REQUIRED_PROFILE_IDS);

  /**
   * Capture a still: freeze real loop frame, screenshot (must exist), hash, projection/pixels.
   * Never swallow screenshot errors or record a nonexistent path.
   */
  async function snap(id, title, opts = {}) {
    const fileName = `${id}.png`;
    const absPath = path.join(meta.runtimeOut, fileName);
    const relPath = path.relative(OUT, absPath).replace(/\\/g, '/');
    const phase = opts.phase || null;

    const frozenFrame = await freezeRenderedFrame(page);
    let captureRecord = null;
    try {
      const projectedPlume = await readProjectedPlume(page);
      const diag = await page.evaluate(PAGE_DIAGNOSTICS_SOURCE);
      const pngBuf = await page.screenshot({ path: absPath, fullPage: false });
      if (!existsSync(absPath)) {
        throw new Error(`screenshot did not create file: ${absPath}`);
      }
      const st = await stat(absPath);
      if (!(st.size > 0)) {
        throw new Error(`screenshot is zero-byte: ${absPath}`);
      }
      const hashed = hashFileAbsolute(absPath);
      if (hashed.missing || hashed.empty || !hashed.sha256) {
        throw new Error(`screenshot hash failed: ${absPath}`);
      }
      const projectionAfter = await readProjectedPlume(page);
      const layerPixelEvidence = (projectedPlume?.layers || []).map((layer) => ({
        role: layer.role,
        ...measurePlumePixels(pngBuf, layer),
      }));
      const pixelEvidence = aggregatePixelEvidence(layerPixelEvidence);
      const pngMeta = PNG.sync.read(pngBuf);

      const artifact = {
        path: relPath,
        runtime: meta.runtime,
        scenario: id,
        width: pngMeta.width || WIDTH,
        height: pngMeta.height || HEIGHT,
        bytes: hashed.bytes,
        sha256: hashed.sha256,
        candidateHash: cand,
        frame: Number.isFinite(diag.renderFrame) ? diag.renderFrame : frozenFrame.renderFrameAfter,
        timestamp: Number.isFinite(diag.simTime) ? diag.simTime : Date.now() / 1000,
        phase: phase || id,
      };
      artifacts.push(artifact);

      if (phase && LIFECYCLE_PHASE_ORDER.includes(phase)) {
        temporalMatrix[phase] = {
          path: relPath,
          runtime: meta.runtime,
          phase,
          frame: artifact.frame,
          timestamp: artifact.timestamp,
          width: artifact.width,
          height: artifact.height,
          bytes: artifact.bytes,
          sha256: artifact.sha256,
          candidateHash: cand,
        };
        phaseFrames[phase] = artifact.frame;
      }

      // Record actual allocation counters (null if absent — fail-closed later).
      const alloc = diag.allocations || {};
      plumeSamples.push(alloc.plumeFrameAllocations == null ? null : Number(alloc.plumeFrameAllocations));
      rcsSamples.push(alloc.rcsFrameAllocations == null ? null : Number(alloc.rcsFrameAllocations));
      fleetSamples.push(alloc.fleetFrameAllocations == null ? null : Number(alloc.fleetFrameAllocations));

      const layers = diag.layers || [];
      const entry = {
        id,
        title,
        layers,
        rcs: {
          drawCount: diag.rcsActive,
          activeCount: diag.rcsActive,
          layers: diag.rcsLayers || [],
        },
        settings: diag.settings,
        engineProfileId: diag.engineProfileId,
        plumeRecipeId: diag.plumeRecipeId,
        rcsRecipeId: diag.rcsRecipeId,
        frameAllocations: alloc.plumeFrameAllocations,
        fleetDiag: diag.fleetDiag,
        productionOwnedCount: diag.productionOwnedCount,
        screenshot: relPath,
        gpu: diag.gpu,
        projectedPlume,
        pixelEvidence,
        frameSync: {
          ...frozenFrame,
          projectionDeltaPx: maxProjectionDelta(projectedPlume, projectionAfter),
        },
      };

      if (id === 'dense-multi-family') {
        const live = (diag.families || [])
          .filter((f) => f.plumeActive > 0 || f.plumeVisible)
          .map((f) => f.profileId);
        if (diag.engineProfileId && !live.includes(diag.engineProfileId)) {
          live.push(diag.engineProfileId);
        }
        entry.liveProfiles = live;
        entry.profilesActive = live;
        entry.familiesSnapshot = diag.families;
        entry.fixtureSource = 'synthetic';
      }

      if (id === 'cleanup') {
        entry.cleanup = {
          trigger: 'sector:enter',
          plumeActiveCount: diag.plumeActive,
          rcsActiveCount: diag.rcsActive,
          ownershipCount: diag.productionOwnedCount,
          activeDraws: diag.activeDraws,
          activeInstances: diag.activeInstances,
          meshCounts: {
            plume: (diag.layers || []).reduce((n, l) => n + (l.drawCount || 0), 0),
            rcs: (diag.rcsLayers || []).reduce((n, l) => n + (l.drawCount || 0), 0),
          },
        };
      }

      // Prefer a sustain/boost projection with measured positive screen-space width + pixel signal.
      // Never invent widthPx from worldWidth or lengthPx ratios — fail closed if unmeasured.
      if (
        projectedPlume?.visible
        && isPositive(projectedPlume.lengthPx)
        && isPositive(projectedPlume.widthPx)
        && isPositive(pixelEvidence.signalPixels)
      ) {
        if (!projection || (opts.preferProjection && isPositive(projectedPlume.widthPx))) {
          projection = {
            lengthPx: projectedPlume.lengthPx,
            widthPx: projectedPlume.widthPx,
            pixelSignal: pixelEvidence.signalPixels,
            cyanPixels: pixelEvidence.cyanPixels,
            contrastPixels: pixelEvidence.contrastPixels,
            measured: true,
            widthMeasured: true,
            widthSource: 'measured-screen-project',
            scenario: id,
            runtime: meta.runtime,
          };
        }
      }

      if (!kestrel && diag.player) {
        const url = normalizeAssetUrl(diag.player.assetUrl);
        kestrel = {
          authoredState: diag.player.authoredAssetState || null,
          authoredAssetState: diag.player.authoredAssetState || null,
          url: url || null,
          visualRoot: diag.player.authoredVisualRoot
            || diag.player.visualRootName
            || null,
          visualRootId: diag.player.visualRootId || null,
          mainSockets: (diag.mainSockets || []).filter(Boolean),
          rcsSockets: (diag.rcsSockets || []).filter(Boolean),
          source: 'live-diagnostics',
        };
      }

      scenarios.push(entry);
      captureRecord = { id, title, screenshot: relPath, artifact };
      captures.push(captureRecord);
      return { entry, diag, artifact, projectedPlume, pixelEvidence };
    } finally {
      const resumed = await resumeRenderedFrame(page);
      if (captureRecord) captureRecord.frameSyncResume = resumed;
    }
  }

  function isPositive(v) {
    return Number.isFinite(v) && Number(v) > 0;
  }

  function normalizeAssetUrl(url) {
    if (!url) return null;
    let u = String(url).replace(/\\/g, '/');
    if (u.startsWith('/')) u = u.slice(1);
    // Prefer exact shipped path when any kestrel wholeship URL is observed.
    if (/wholeships\/kestrel\.glb/i.test(u)) return KESTREL_SHIPPED_GLB_URL;
    return u;
  }

  // Release all keys first.
  for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'ArrowLeft', 'ArrowRight']) {
    await page.keyboard.up(key).catch(() => {});
  }

  // idle — public keyboard only (no _flightFrame player spoof)
  await snap('idle', 'normal idle');

  // onset (temporal phase)
  await page.keyboard.down('KeyW');
  await waitRealFrames(page, 4);
  await snap('onset', 'initial onset', { phase: 'onset', preferProjection: true });

  // growth
  await waitRealFrames(page, 10);
  await snap('growth', 'growth', { phase: 'growth' });

  // sustain
  await waitRealFrames(page, 20);
  await snap('sustain', 'sustain', { phase: 'sustain', preferProjection: true });

  // cruise (scenario)
  await waitRealFrames(page, 24);
  await snap('cruise', 'cruise', { preferProjection: true });

  // boost / transition
  await page.keyboard.down('ShiftLeft');
  await waitRealFrames(page, 8);
  await snap('boost', 'boost transition', { phase: 'transition', preferProjection: true });
  await page.keyboard.up('ShiftLeft');

  // hard-turn RCS — public keyboard only
  await page.keyboard.down('ArrowRight');
  await waitRealFrames(page, 3);
  await snap('hard-turn-rcs', 'hard-turn RCS');
  await page.keyboard.up('ArrowRight');

  // brake/reverse
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await waitRealFrames(page, 6);
  await snap('brake-reverse', 'brake/reverse');
  await page.keyboard.up('KeyS');

  // compact trails off via settings event
  await page.evaluate(() => {
    const state = window.SF.state;
    state.settings.video.engineTrails = false;
    window.SF.bus.emit('settings:changed', { section: 'video', key: 'engineTrails' });
  });
  await page.keyboard.down('KeyW');
  await waitRealFrames(page, 8);
  await snap('compact-trails-off', 'engineTrails=false compact', { preferProjection: true });
  await page.keyboard.up('KeyW');

  // reduced motion + flash via public settings
  await page.evaluate(() => {
    const state = window.SF.state;
    state.settings.video.engineTrails = true;
    state.settings.accessibility.motionPreference = 'reduce';
    state.settings.accessibility.flashReduce = true;
    window.SF.bus.emit('settings:changed', { section: 'accessibility', key: 'motionPreference' });
  });
  await page.waitForFunction(() => window.SF?.state?.settings?.video?.motionReduce === true);
  await page.keyboard.down('KeyW');
  await waitRealFrames(page, 8);
  await snap('reduced-motion-flash', 'reduced-motion+flash');
  await page.keyboard.up('KeyW');

  // dense multi-family — restore a11y, drive via keyboard; synthetic NPCs already labeled
  await page.evaluate(() => {
    const state = window.SF.state;
    state.settings.accessibility.motionPreference = 'full';
    state.settings.accessibility.flashReduce = false;
    state.settings.video.engineTrails = true;
    window.SF.bus.emit('settings:changed', { section: 'accessibility', key: 'motionPreference' });
  });
  await page.keyboard.down('KeyW');
  // Sustained bounded sample sequence for dense allocation counters.
  for (let i = 0; i < 16; i++) {
    await waitRealFrames(page, 2);
    const sample = await page.evaluate(PAGE_DIAGNOSTICS_SOURCE);
    const a = sample.allocations || {};
    denseSamples.push(a.plumeFrameAllocations == null && a.fleetFrameAllocations == null
      ? null
      : Number(a.fleetFrameAllocations ?? a.plumeFrameAllocations ?? 0));
    plumeSamples.push(a.plumeFrameAllocations == null ? null : Number(a.plumeFrameAllocations));
    rcsSamples.push(a.rcsFrameAllocations == null ? null : Number(a.rcsFrameAllocations));
    fleetSamples.push(a.fleetFrameAllocations == null ? null : Number(a.fleetFrameAllocations));
  }
  await snap('dense-multi-family', 'dense multi-family', { preferProjection: true });
  await page.keyboard.up('KeyW');

  // Family structural identity from registry recipes (never fabricated).
  const families = buildRegistryFamilyMatrix().map((fam) => ({
    ...fam,
    structuralSignature: deriveStructuralSignature(fam.profileId),
    fixtureSource: 'synthetic',
    source: 'registry',
  }));
  // Attach live socket snapshot only when real transforms exist.
  if (kestrel?.mainSockets?.length) {
    const ion = families.find((f) => f.profileId === 'engine_ion_small');
    if (ion) ion.sockets = kestrel.mainSockets.slice();
  }

  // release
  for (const key of ['KeyW', 'KeyS', 'ShiftLeft', 'ArrowLeft', 'ArrowRight']) {
    await page.keyboard.up(key).catch(() => {});
  }
  await waitRealFrames(page, 12);
  await snap('release', 'release', { phase: 'release' });

  // cleanup — public lifecycle bus route already wired in src/render/vfx.js (sector:enter).
  // Do not call private underscore helpers; wait real frames after the public event.
  await page.evaluate(() => {
    const state = window.SF?.state;
    const sectorId = state?.world?.currentSectorId
      || state?.sector?.id
      || 'vp220-capture-cleanup-fixture';
    const sector = state?.world?.currentSector
      || state?.sector
      || { id: sectorId };
    window.SF.bus.emit('sector:enter', {
      sectorId,
      sector,
      entryPoint: 'vp220-propulsion-acceptance-cleanup',
      firstVisit: false,
      continuous: false,
      captureFixture: true,
      source: 'capture:vp220-propulsion-acceptance',
    });
  });
  await waitRealFrames(page, 4);
  const cleanupSnap = await snap('cleanup', 'reset/cleanup', { phase: 'cleanup' });

  const lastDiag = cleanupSnap.diag;

  // Fail-closed: if any required counter sample is null, leave null so validator fails.
  const hasNull = (arr) => !arr.length || arr.some((v) => v == null || !Number.isFinite(v));
  const finiteOrNull = (arr) => (hasNull(arr) ? null : arr.map(Number));
  const maxOrNull = (arr) => {
    const f = finiteOrNull(arr);
    return f == null ? null : f.reduce((m, v) => Math.max(m, v), 0);
  };

  const temporalMatrices = {
    browser: meta.runtime === 'browser' ? temporalMatrix : null,
    electron: meta.runtime === 'electron' ? temporalMatrix : null,
  };

  const reportOut = createReportSkeleton({
    ok: false,
    runtime: meta.runtime,
    gitHead: head,
    candidateHash: cand,
    candidateIdentity: identity.identityInputs,
    baseUrl: meta.baseUrl,
    runtimeHashes,
    viewport: { width: WIDTH, height: HEIGHT },
    families,
    artifacts,
    temporalMatrices,
    scenarios,
    projection,
    kestrel,
    fixtureSource: 'synthetic',
    lifecycle: {
      release: scenarios.find((s) => s.id === 'release') || null,
      cleanup: cleanupSnap.entry.cleanup
        ? { ...cleanupSnap.entry.cleanup, trigger: 'sector:enter' }
        : { trigger: 'sector:enter' },
      phaseFrames: Object.keys(phaseFrames).length === LIFECYCLE_PHASE_ORDER.length
        ? { ...phaseFrames }
        : null,
    },
    gpu: lastDiag.gpu || {},
    allocations: {
      plumeFrameAllocations: maxOrNull(plumeSamples.filter((v) => v != null)),
      rcsFrameAllocations: maxOrNull(rcsSamples.filter((v) => v != null)),
      fleetFrameAllocations: maxOrNull(fleetSamples.filter((v) => v != null)),
      denseSweepFrameAllocationsMax: maxOrNull(denseSamples.filter((v) => v != null)),
      plumeSamples: finiteOrNull(plumeSamples),
      rcsSamples: finiteOrNull(rcsSamples),
      fleetSamples: finiteOrNull(fleetSamples),
      denseSamples: finiteOrNull(denseSamples),
      plumeMax: maxOrNull(plumeSamples),
      rcsMax: maxOrNull(rcsSamples),
      fleetMax: maxOrNull(fleetSamples),
      denseMax: maxOrNull(denseSamples),
    },
    visualStatus: 'CAPTURED',
    issues: [],
  });

  // If counters were partially collected, prefer lastDiag allocations as scalars when arrays ok.
  if (reportOut.allocations.plumeFrameAllocations == null
    && lastDiag.allocations?.plumeFrameAllocations != null) {
    reportOut.allocations.plumeFrameAllocations = Number(lastDiag.allocations.plumeFrameAllocations);
  }

  const compact = scenarios.find((s) => s.id === 'compact-trails-off');
  if (compact) {
    reportOut.compactCheck = assertReadableCoreInner(compact.layers, { compact: true });
  }
  return reportOut;
}

/** Wait for N real animation frames without manually calling vfx.update. */
async function waitRealFrames(page, count = 1) {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) {
      await new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  }, count);
}

async function freezeRenderedFrame(targetPage) {
  return targetPage.evaluate(async (source) => {
    const sf = window.SF;
    const timeEffects = sf?.timeEffects || sf?.ctx?.timeEffects;
    if (!sf?.state || !timeEffects?.set || !timeEffects?.clear) {
      throw new Error('vp220 capture requires the public timeEffects authority');
    }
    if (window.__SF_VP220_CAPTURE_FRAME__) {
      throw new Error('vp220 capture frame barrier is already active');
    }

    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const pending = new Map();
    let nextSyntheticId = -1;
    const barrier = {
      originalRequestAnimationFrame,
      originalCancelAnimationFrame,
      pending,
    };
    window.__SF_VP220_CAPTURE_FRAME__ = barrier;
    timeEffects.set(source, { scale: 0 });

    try {
      window.requestAnimationFrame = (callback) => {
        const id = nextSyntheticId--;
        pending.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        if (id < 0) pending.delete(id);
        else originalCancelAnimationFrame.call(window, id);
      };

      const renderFrameBefore = sf.state.render?.renderer?.info?.render?.frame ?? null;
      await new Promise((resolve) => {
        originalRequestAnimationFrame.call(window, resolve);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (pending.size === 0) {
        throw new Error('vp220 capture frame barrier did not intercept the live render loop');
      }
      return {
        frozen: true,
        effectiveScale: timeEffects.getEffectiveScale?.() ?? sf.state.timeScale,
        renderFrameBefore,
        renderFrameAfter: sf.state.render?.renderer?.info?.render?.frame ?? null,
        heldAnimationFrameCallbacks: pending.size,
      };
    } catch (error) {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      window.__SF_VP220_CAPTURE_FRAME__ = null;
      timeEffects.clear(source);
      throw error;
    }
  }, CAPTURE_TIME_SOURCE);
}

async function resumeRenderedFrame(targetPage) {
  return targetPage.evaluate((source) => {
    const sf = window.SF;
    const timeEffects = sf?.timeEffects || sf?.ctx?.timeEffects;
    const barrier = window.__SF_VP220_CAPTURE_FRAME__;
    if (!barrier) {
      timeEffects?.clear?.(source);
      return { restored: false, reason: 'frame barrier was not active' };
    }

    const callbacks = [...barrier.pending.values()];
    window.requestAnimationFrame = barrier.originalRequestAnimationFrame;
    window.cancelAnimationFrame = barrier.originalCancelAnimationFrame;
    window.__SF_VP220_CAPTURE_FRAME__ = null;
    for (const callback of callbacks) {
      barrier.originalRequestAnimationFrame.call(window, callback);
    }
    const effectiveScale = timeEffects.clear(source);
    return {
      restored: true,
      resumedAnimationFrameCallbacks: callbacks.length,
      effectiveScale,
    };
  }, CAPTURE_TIME_SOURCE);
}

function maxProjectionDelta(before, after) {
  const points = (projection) => [
    ...(projection?.layers || []).flatMap((layer) => [layer.nozzle, layer.tip]),
    ...(projection?.rcs?.instances || []).flatMap((instance) => [instance.nozzle, instance.tip]),
  ];
  const beforePoints = points(before);
  const afterPoints = points(after);
  if (beforePoints.length !== afterPoints.length) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let i = 0; i < beforePoints.length; i++) {
    maximum = Math.max(maximum, Math.hypot(
      afterPoints[i].x - beforePoints[i].x,
      afterPoints[i].y - beforePoints[i].y,
    ));
  }
  return maximum;
}

async function readProjectedPlume(targetPage) {
  return targetPage.evaluate(({ width, height }) => {
    const sf = window.SF;
    const camera = sf?.state?.render?.camera;
    const energy = sf?.registry?.get?.('vfx')?._energy;
    const plume = energy?.plumeSystem;
    const rcsSystem = energy?.rcsSystem;
    const activeBatches = plume?.layerBatches?.filter(
      (entry) => entry.role !== 'distortion' && entry.mesh?.count > 0,
    ) || [];
    if (!camera || !activeBatches.length || !plume?.group?.visible) {
      return {
        visible: false,
        role: null,
        lengthPx: 0,
        widthPx: null,
        layers: [],
      };
    }
    const Vec3 = camera.position.constructor;
    plume.group.updateMatrixWorld(true);
    camera.updateMatrixWorld?.(true);
    // Billboard width axis: camera-right in world space (camera-facing axial plumes).
    const cameraRight = new Vec3().setFromMatrixColumn(camera.matrixWorld, 0);
    if (cameraRight.lengthSq() > 1e-12) cameraRight.normalize();
    else cameraRight.set(1, 0, 0);

    const toScreen = (point) => {
      const ndc = point.clone().project(camera);
      return { x: (ndc.x * 0.5 + 0.5) * width, y: (-ndc.y * 0.5 + 0.5) * height };
    };
    const layers = activeBatches.map((entry) => {
      const nozzle = new Vec3(entry.offset[0], entry.offset[1], entry.offset[2]);
      const axis = new Vec3(entry.axisScale[0], entry.axisScale[1], entry.axisScale[2]).normalize();
      const visibleTail = entry.role === 'core' ? 0.76 : entry.role === 'inner' ? 0.9 : 0.84;
      const liveLength = entry.axisScale[3];
      const liveWidth = entry.params[0];
      const tip = nozzle.clone().addScaledVector(axis, -liveLength * visibleTail);
      // Midpoint along the visible plume for width sampling (nozzle↔tip).
      const mid = nozzle.clone().addScaledVector(axis, -liveLength * visibleTail * 0.5);
      nozzle.applyMatrix4(plume.group.matrixWorld);
      tip.applyMatrix4(plume.group.matrixWorld);
      mid.applyMatrix4(plume.group.matrixWorld);
      const start = toScreen(nozzle);
      const end = toScreen(tip);

      // Measure screen-space width by projecting ±half live layer width along camera-right.
      let widthPx = null;
      let left = null;
      let right = null;
      if (Number.isFinite(liveWidth) && liveWidth > 0 && cameraRight.lengthSq() > 0) {
        const halfW = liveWidth * 0.5;
        // Prefer midpoint; also sample at nozzle and take max positive span (robust).
        const samples = [mid, nozzle];
        let maxSpan = 0;
        let bestLeft = null;
        let bestRight = null;
        for (const sample of samples) {
          const leftWorld = sample.clone().addScaledVector(cameraRight, -halfW);
          const rightWorld = sample.clone().addScaledVector(cameraRight, halfW);
          const leftScreen = toScreen(leftWorld);
          const rightScreen = toScreen(rightWorld);
          const span = Math.hypot(
            rightScreen.x - leftScreen.x,
            rightScreen.y - leftScreen.y,
          );
          if (Number.isFinite(span) && span > maxSpan) {
            maxSpan = span;
            bestLeft = leftScreen;
            bestRight = rightScreen;
          }
        }
        if (maxSpan > 0) {
          widthPx = maxSpan;
          left = bestLeft;
          right = bestRight;
        }
      }

      return {
        role: entry.role,
        nozzle: start,
        tip: end,
        left,
        right,
        lengthPx: Math.hypot(end.x - start.x, end.y - start.y),
        // Measured screen pixels only; null when measurement unavailable (fail closed).
        widthPx,
        drawCount: entry.mesh.count,
        worldLength: liveLength,
        worldWidth: liveWidth,
      };
    });
    const primary = layers.find((entry) => entry.role === 'inner') || layers[0];
    const measuredWidths = layers
      .map((entry) => entry.widthPx)
      .filter((w) => Number.isFinite(w) && w > 0);
    const summaryWidthPx = measuredWidths.length ? Math.max(...measuredWidths) : null;
    const rcsBatch = rcsSystem?.layerBatches?.find((entry) => entry.role === 'core' && entry.mesh?.count > 0)
      || rcsSystem?.layerBatches?.find((entry) => entry.mesh?.count > 0);
    const rcsInstances = [];
    if (rcsBatch && rcsSystem?.group?.visible) {
      rcsSystem.group.updateMatrixWorld(true);
      for (let i = 0; i < rcsBatch.mesh.count; i++) {
        const o = i * 3;
        const s = i * 4;
        const rcsNozzle = new Vec3(rcsBatch.offset[o], rcsBatch.offset[o + 1], rcsBatch.offset[o + 2]);
        const rcsAxis = new Vec3(
          rcsBatch.axisScale[s],
          rcsBatch.axisScale[s + 1],
          rcsBatch.axisScale[s + 2],
        ).normalize();
        const rcsTip = rcsNozzle.clone().addScaledVector(rcsAxis, -rcsBatch.axisScale[s + 3]);
        rcsNozzle.applyMatrix4(rcsSystem.group.matrixWorld);
        rcsTip.applyMatrix4(rcsSystem.group.matrixWorld);
        const start = toScreen(rcsNozzle);
        const end = toScreen(rcsTip);
        rcsInstances.push({
          nozzle: start,
          tip: end,
          lengthPx: Math.hypot(end.x - start.x, end.y - start.y),
        });
      }
    }
    return {
      visible: true,
      role: primary.role,
      nozzle: primary.nozzle,
      tip: primary.tip,
      lengthPx: Math.max(...layers.map((entry) => entry.lengthPx)),
      // Summary max measured screen-space width; null if any/all layers unmeasured.
      widthPx: summaryWidthPx,
      drawCount: primary.drawCount,
      worldLength: primary.worldLength,
      worldWidth: primary.worldWidth,
      layers,
      rcs: {
        visible: !!(rcsSystem?.group?.visible && rcsInstances.length),
        role: rcsBatch?.role || null,
        drawCount: rcsBatch?.mesh?.count || 0,
        instances: rcsInstances,
      },
    };
  }, { width: WIDTH, height: HEIGHT });
}

function measurePlumePixels(buffer, projected) {
  const png = PNG.sync.read(buffer);
  const ax = projected.nozzle.x;
  const ay = projected.nozzle.y;
  const bx = projected.tip.x;
  const by = projected.tip.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = Math.max(1, dx * dx + dy * dy);
  const radius = Math.max(6, Math.min(24, (projected.lengthPx || 10) * 0.1));
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
  const maxX = Math.min(png.width - 1, Math.ceil(Math.max(ax, bx) + radius));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius));
  const maxY = Math.min(png.height - 1, Math.ceil(Math.max(ay, by) + radius));
  let sampledPixels = 0;
  let cyanPixels = 0;
  let luminousPixels = 0;
  let contrastPixels = 0;
  let accumulatedContrast = 0;
  let signalPixels = 0;
  const invLength = 1 / Math.sqrt(lenSq);
  const normalX = -dy * invLength;
  const normalY = dx * invLength;
  const comparisonOffset = Math.max(10, radius * 1.65);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = ((x - ax) * dx + (y - ay) * dy) / lenSq;
      if (t < 0.12 || t > 1.04) continue;
      const px = ax + dx * t;
      const py = ay + dy * t;
      if (Math.hypot(x - px, y - py) > radius) continue;
      const offset = (y * png.width + x) * 4;
      const r = png.data[offset];
      const g = png.data[offset + 1];
      const b = png.data[offset + 2];
      const localLuma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      let backgroundLuma = 0;
      let backgroundSamples = 0;
      for (const side of [-1, 1]) {
        const sampleX = Math.round(x + normalX * comparisonOffset * side);
        const sampleY = Math.round(y + normalY * comparisonOffset * side);
        if (sampleX < 0 || sampleX >= png.width || sampleY < 0 || sampleY >= png.height) continue;
        const sampleOffset = (sampleY * png.width + sampleX) * 4;
        backgroundLuma += png.data[sampleOffset] * 0.2126
          + png.data[sampleOffset + 1] * 0.7152
          + png.data[sampleOffset + 2] * 0.0722;
        backgroundSamples++;
      }
      const localContrast = backgroundSamples ? localLuma - (backgroundLuma / backgroundSamples) : 0;
      sampledPixels++;
      if (Math.max(r, g, b) >= 62) luminousPixels++;
      const cyan = g >= 48 && b >= 58 && g > r * 1.12 && b > r * 1.08;
      if (cyan) cyanPixels++;
      const contrasting = localContrast >= 9 && b >= r + 3 && g >= r + 2;
      if (contrasting) contrastPixels++;
      if (cyan || contrasting) signalPixels++;
      accumulatedContrast += Math.max(0, localContrast);
    }
  }
  return {
    sampledPixels,
    cyanPixels,
    luminousPixels,
    contrastPixels,
    meanPositiveContrast: sampledPixels ? accumulatedContrast / sampledPixels : 0,
    cyanFraction: sampledPixels ? cyanPixels / sampledPixels : 0,
    corridorRadiusPx: radius,
    signalPixels,
  };
}

function emptyPixelEvidence() {
  return {
    sampledPixels: 0,
    cyanPixels: 0,
    luminousPixels: 0,
    contrastPixels: 0,
    meanPositiveContrast: 0,
    cyanFraction: 0,
    signalPixels: 0,
  };
}

function aggregatePixelEvidence(entries) {
  if (!entries.length) return emptyPixelEvidence();
  const out = emptyPixelEvidence();
  for (const entry of entries) {
    out.sampledPixels += entry.sampledPixels || 0;
    out.cyanPixels += entry.cyanPixels || 0;
    out.luminousPixels += entry.luminousPixels || 0;
    out.contrastPixels += entry.contrastPixels || 0;
    out.meanPositiveContrast += entry.meanPositiveContrast || 0;
    out.signalPixels += entry.signalPixels || 0;
  }
  out.meanPositiveContrast /= entries.length;
  out.cyanFraction = out.sampledPixels ? out.cyanPixels / out.sampledPixels : 0;
  return out;
}

async function waitFlight(page) {
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf && sf.state && sf.state.entities.get(sf.state.playerId);
    return sf.state.mode === 'flight'
      && player
      && player.mesh
      && player.data?.defId === 'ship_kestrel'
      && String(player.mesh.userData?.authoredAssetState || '').startsWith('authored');
  }, null, { timeout: 120_000 });
}

async function dismissTutorial(page) {
  await page.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')]
        .find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
  await waitRealFrames(page, 4);
}

function findSystemBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}
