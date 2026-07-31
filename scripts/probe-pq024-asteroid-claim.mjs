#!/usr/bin/env node
// PQ-024 default-route asteroid claim acceptance.
//
// Run only through the validation broker:
//   node scripts/validation-broker-cli.mjs --manifest pq024-asteroid-claim
//
// The actor uses shipped DOM/pointer/keyboard controls. Page observers choose a rendered map dot,
// read placement validity, and collect system receipts; they never write cargo, survey, producing,
// site, or exterior state. This is functional H1 evidence, not performance evidence.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { projectPq024RouteSemantics } from './lib/pq024AsteroidClaimParity.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import manifest, {
  createPq024AsteroidClaimManifest,
  PQ024_ASTEROID_CLAIM_FIXED_SEED,
} from './validation-manifests/pq024-asteroid-claim.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ELECTRON_PARITY = process.argv.includes('--electron-parity');
const BASE_ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq024-asteroid-claim');
const ARTIFACT_ROOT = ELECTRON_PARITY
  ? path.join(BASE_ARTIFACT_ROOT, 'electron')
  : BASE_ARTIFACT_ROOT;
const BROWSER_RECEIPT_PATH = path.join(BASE_ARTIFACT_ROOT, 'route-receipt.json');
const VIEWPORT = Object.freeze({ width: 1460, height: 900 });
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const FIXED_SEED = Number(process.env.SF_PROBE_SEED) > 0
  ? Number(process.env.SF_PROBE_SEED)
  : PQ024_ASTEROID_CLAIM_FIXED_SEED;
const SCREENSHOTS = Object.freeze([
  '01-market-materials.png',
  '02-survey-reveal.png',
  '03-core-committed.png',
  '04-producing-relay.png',
  '05-continue-reentered.png',
]);

const brokerGate = ELECTRON_PARITY ? { ok: true } : await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest: createPq024AsteroidClaimManifest(),
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq024-asteroid-claim] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq024-asteroid-claim] invoke via: node scripts/validation-broker-cli.mjs --manifest pq024-asteroid-claim');
  console.error('[pq024-asteroid-claim] or pass --diagnostic for non-promoting inspection');
  process.exit(2);
}

await mkdir(ARTIFACT_ROOT, { recursive: true });

let server = null;
let browser = null;
let electronApp = null;
let electronChildProcess = null;
let electronLaunch = null;
let electronUrlTracker = null;
let electronProcessMonitor = null;
let page = null;
let issueTracker = null;
let receipt = null;
let browserReceipt = null;
let rootUrl = null;
const screenshots = [];

try {
  if (ELECTRON_PARITY) {
    browserReceipt = JSON.parse(await readFile(BROWSER_RECEIPT_PATH, 'utf8'));
    assert.equal(browserReceipt.disposition, 'PASS',
      'PQ-024 Electron parity requires a passing Browser route receipt');
    const { _electron: electron } = await loadPlaywright();
    electronLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'pq024-asteroid-claim' });
    electronApp = await electron.launch(electronLaunch.options);
    electronChildProcess = electronApp.process();
    electronProcessMonitor = createElectronProcessMonitor({
      electronApp,
      childProcess: electronChildProcess,
    });
    page = await electronApp.firstWindow({ timeout: 90_000 });
    electronUrlTracker = createElectronCanonicalUrlTracker(page, {
      bootstrapTimeoutMs: 10_000,
      pollIntervalMs: 75,
      allowAnyLoopbackPort: true,
    });
    rootUrl = assertIsolatedElectronRootUrl(await electronUrlTracker.waitForCanonicalRoot(10_000));
    await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  } else {
    server = await acquireVisualProbeServer({ root: ROOT });
    rootUrl = server.baseUrl;
    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed Chrome or Edge is required for PQ-024 route acceptance');
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
    const context = await browser.newContext({
      viewport: VIEWPORT,
      screen: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
    });
    page = await context.newPage();
  }
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  issueTracker = collectPageIssues(page, { includeWarnings: false });
  const screenshot = async (name) => {
    assert(SCREENSHOTS.includes(name), `undeclared PQ-024 screenshot ${name}`);
    const file = path.join(ARTIFACT_ROOT, name);
    await page.screenshot({ path: file, type: 'png', animations: 'allow' });
    const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a PNG`);
    const row = {
      path: repoRel(file),
      bytes: info.size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    screenshots.push(row);
    return row;
  };

  receipt = await runDefaultRoute(page, rootUrl, screenshot, {
    runtime: ELECTRON_PARITY ? 'electron' : 'browser-chromium-headed',
    navigateInitialRoot: !ELECTRON_PARITY,
    pageIssueTracker: issueTracker,
  });
  receipt.screenshots = screenshots;
  receipt.pageIssues = summarizeIssues(issueTracker.errorIssues());
  assert.equal(receipt.pageIssues.length, 0, `page issues: ${JSON.stringify(receipt.pageIssues)}`);
  receipt.semanticProjection = projectPq024RouteSemantics(receipt);
  if (ELECTRON_PARITY) {
    assert.deepEqual(
      receipt.semanticProjection,
      projectPq024RouteSemantics(browserReceipt),
      'PQ-024 Electron route semantics must match the accepted Browser route',
    );
    receipt.crossRuntimeParity = {
      pass: true,
      comparedAgainst: repoRel(BROWSER_RECEIPT_PATH),
    };
  }
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(ARTIFACT_ROOT, 'failure.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  receipt = {
    schema: 'spaceface.pq024-asteroid-claim-route.v1',
    runtime: ELECTRON_PARITY ? 'electron' : 'browser-chromium-headed',
    disposition: 'FAIL',
    phase: error?.routePhase || null,
    problems: [error?.message || String(error)],
    stack: error?.stack || null,
    fixedSeed: FIXED_SEED,
    brokerManifestId: manifest.id,
    screenshots,
    pageIssues: issueTracker ? summarizeIssues(issueTracker.errorIssues()) : [],
    noPerformanceEvidence: true,
  };
} finally {
  if (ELECTRON_PARITY) {
    let cleanup = null;
    try {
      cleanup = await closeOwnedElectronRuntime({
        page,
        electronApp,
        childProcess: electronChildProcess,
        canonicalUrlTracker: electronUrlTracker,
        processMonitor: electronProcessMonitor,
        rootUrl,
      });
    } catch (error) {
      cleanup = { pass: false, failures: [error?.message || String(error)] };
    }
    receipt ||= {
      schema: 'spaceface.pq024-asteroid-claim-route.v1',
      runtime: 'electron',
      disposition: 'FAIL',
      problems: [],
      fixedSeed: FIXED_SEED,
      noPerformanceEvidence: true,
    };
    if (cleanup?.pass === true) {
      receipt.ownedRuntimeClosed = true;
      try { electronLaunch?.cleanup({ runtimeClosed: true }); }
      catch (error) {
        receipt.disposition = 'FAIL';
        receipt.problems ||= [];
        receipt.problems.push(`isolated profile cleanup failed: ${error?.message || String(error)}`);
      }
    } else {
      receipt.disposition = 'FAIL';
      receipt.ownedRuntimeClosed = false;
      receipt.problems ||= [];
      receipt.problems.push(`owned Electron cleanup failed: ${(cleanup?.failures || []).join('; ')}`);
    }
  } else {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
}

await writeFile(
  path.join(ARTIFACT_ROOT, 'route-receipt.json'),
  `${JSON.stringify(receipt, null, 2)}\n`,
  'utf8',
);

if (receipt.disposition !== 'PASS') {
  console.error(`[pq024-asteroid-claim] FAIL in ${receipt.phase || 'route contract'}`);
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`[pq024-asteroid-claim/${ELECTRON_PARITY ? 'electron' : 'browser'}] PASS — public claim route survived save/Continue/re-entry`);
console.log(`  receipt: ${repoRel(path.join(ARTIFACT_ROOT, 'route-receipt.json'))}`);

async function runDefaultRoute(page, rootUrl, screenshot, options = {}) {
  let phase = 'boot';
  try {
    const runtime = options.runtime || 'browser-chromium-headed';
    const boot = await bootSeededFlight(page, rootUrl, {
      navigateInitialRoot: options.navigateInitialRoot !== false,
    });
    const gpu = await readGpuContract(page);
    assert.equal(gpu.available, true, 'PQ-024 headed route requires WebGL');
    assert.doesNotMatch(gpu.renderer || '', /SwiftShader|llvmpipe|software/i,
      `PQ-024 headed route requires a real GPU path, got ${gpu.renderer}`);
    await installObservers(page);

    phase = 'dock-helios';
    await dockAtHelios(page);
    phase = 'market-materials';
    const cargo = await buyConstructionCargo(page);
    await screenshot('01-market-materials.png');
    await publicUndock(page);

    phase = 'asteroid-course';
    const asteroid = await selectAsteroidOnLocalMap(page);
    await waitForAutopilotArrival(page, asteroid);
    await enterAsteroidOps(page, asteroid.targetEntityId);

    phase = 'survey-reveal';
    const surveyReveal = await pulseSurveyReveal(page);
    await screenshot('02-survey-reveal.png');

    phase = 'core-commit';
    const corePlan = await planCorePlacement(page);
    const core = await placeSiteMachine(page, 'sm_massline_core', corePlan);
    await screenshot('03-core-committed.png');

    phase = 'extractor-install';
    const extractorPlan = await planExtractorPlacement(page, core);
    const extractor = await placeSiteMachine(page, 'sm_extractor', extractorPlan);
    await exitAsteroidOps(page);

    phase = 'positive-production';
    const production = await waitForPositiveProduction(page, core.siteId);
    const relay = await assertExactlyOneExteriorRelay(page, core.siteId);
    await screenshot('04-producing-relay.png');
    await releaseMassline(page);

    phase = 'quick-save';
    const saved = await quickSave(page);
    phase = 'cold-continue';
    const continued = await coldContinue(
      page,
      rootUrl,
      core.siteId,
      production.receipt,
      options.pageIssueTracker,
    );

    phase = 'public-re-entry';
    const restoredAsteroid = await selectAsteroidOnLocalMap(page, { siteId: core.siteId });
    await waitForAutopilotArrival(page, restoredAsteroid);
    const reentered = await reenterAsteroidOps(page, restoredAsteroid.targetEntityId, core.siteId);
    const restoredRelay = await assertExactlyOneExteriorRelay(page, core.siteId);
    await screenshot('05-continue-reentered.png');

    return {
      schema: 'spaceface.pq024-asteroid-claim-route.v1',
      runtime,
      disposition: 'PASS',
      problems: [],
      fixedSeed: FIXED_SEED,
      recordedSeed: boot.recordedSeed,
      brokerManifestId: manifest.id,
      gpu,
      routeContract:
        'New Game -> Helios public market -> public local-map asteroid course -> Massline -> Asteroid Ops '
        + '-> survey reveal -> Core -> real extractor output -> one relay -> F5 -> cold Continue -> public re-entry',
      noPerformanceEvidence: true,
      noPerformanceEvidenceNote:
        'Functional H1 receipt only: visible controls, owner receipts, identity, counts, and screenshots. '
        + 'No frame timing, percentile, hitch, or speed claim is recorded.',
      informational_contended: true,
      actorControls: [
        'New Game and Launch buttons',
        'N galaxy map search and Set Waypoint',
        'held E dock and canonical Undock',
        'Market search, commodity tabs, quantity input, and Confirm Purchase',
        'M local-map asteroid dot and production autopilot',
        'Space Massline, B Asteroid Ops, Pulse survey, command-card machine keys, cursor arrows, Enter',
        'F5, Continue, and the same public asteroid-entry chain after restore',
      ],
      observations: {
        cargo,
        asteroid,
        surveyReveal,
        core,
        extractor,
        production,
        relay,
        saved,
        continued,
        restoredAsteroid,
        reentered,
        restoredRelay,
      },
    };
  } catch (error) {
    error.routePhase ||= phase;
    throw error;
  }
}

async function bootSeededFlight(page, rootUrl, { navigateInitialRoot = true } = {}) {
  if (navigateInitialRoot) {
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
  } else {
    assert.equal(
      new URL(page.url()).href,
      new URL(rootUrl).href,
      'PQ-024 Electron parity must continue from the already-loaded canonical first window',
    );
  }
  const url = new URL(page.url());
  assert.equal(url.search, '', 'PQ-024 uses the canonical root without debug flags');
  assert.equal(url.hash, '', 'PQ-024 uses the canonical root without hash flags');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry && window.SF?.ctx),
    null, { timeout: 60_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu');
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await waitVisible(page, '[data-screen="newGame"]', 'New Game');
  await page.fill('#sf-ng-seed', String(FIXED_SEED));
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  const begin = page.getByRole('button', { name: /^Begin$/i });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight' && player?.alive !== false && Number(player?.hull) > 0;
  }, null, { timeout: 120_000 });
  const recordedSeed = await page.evaluate(() => window.SF.state.meta?.seed ?? null);
  assert.equal(recordedSeed, FIXED_SEED, 'New Game consumed the broker seed');
  return { recordedSeed };
}

async function installObservers(page) {
  await page.evaluate(() => {
    const clone = (value) => {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return { uncloneable: true }; }
    };
    const trace = window.__PQ024_H1_TRACE__ = {
      surveys: [],
      commitments: [],
      production: [],
      saves: [],
    };
    const bus = window.SF.bus;
    bus.on('site:surveyDetected', (payload) => trace.surveys.push(clone(payload)));
    bus.on('site:surveyCommitted', (payload) => trace.commitments.push(clone(payload)));
    bus.on('site:producing', (payload) => trace.production.push(clone(payload)));
    bus.on('save:completed', (payload) => trace.saves.push(clone(payload)));
  });
}

async function dockAtHelios(page) {
  await page.keyboard.press('KeyN');
  await waitVisible(page, '#sf-galaxymap', 'galaxy map');
  await page.keyboard.press('/');
  const search = page.locator('.gm-search-input');
  if (!(await search.isFocused().catch(() => false))) await search.click();
  await page.keyboard.type('Helios Station');
  await page.locator('.gm-search-item-name', { hasText: 'Helios Station' }).first()
    .waitFor({ state: 'visible' });
  await page.keyboard.press('Enter');
  const waypoint = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await waypoint.waitFor({ state: 'visible' });
  await waypoint.click();
  const prompt = page.locator('.sf-alert--dock');
  await prompt.waitFor({ state: 'visible', timeout: 120_000 });
  assert.match(await prompt.innerText(), /\bE\b.*\bDOCK\b|\bDOCK\b.*\bE\b/i);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await page.keyboard.down('KeyE');
      await page.waitForTimeout(300);
    } finally {
      await page.keyboard.up('KeyE').catch(() => {});
    }
    const docked = await page.waitForFunction(
      () => window.SF?.state?.ui?.docked === true,
      null,
      { timeout: 1_000 },
    ).then(() => true, () => false);
    if (docked) break;
  }
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 5_000 });
  await waitVisible(page, '[data-screen="station"]', 'station hub');
}

async function buyConstructionCargo(page) {
  const purchases = [
    { commodityId: 'cmdty_regocrete', name: 'Regocrete', qty: 7 },
    { commodityId: 'cmdty_control_unit', name: 'Machine Control Unit', qty: 2 },
    { commodityId: 'cmdty_refined_metals', name: 'Refined Metals', qty: 2 },
  ];
  const result = [];
  for (const item of purchases) {
    const search = page.locator('[data-market-search]');
    await search.fill(item.name);
    const row = page.locator(`[data-cmdty="${item.commodityId}"]`).first();
    await row.waitFor({ state: 'visible' });
    await row.click();
    const qtyInput = page.locator('.sx-trade:visible .sx-qty__in').first();
    await qtyInput.fill(String(item.qty));
    const before = await readCargo(page, item.commodityId);
    const buy = page.locator('.sx-trade:visible [data-go]').first();
    await buy.waitFor({ state: 'visible' });
    await buy.click();
    await page.waitForFunction(({ commodityId, owned, qty }) => (
      Number(window.SF?.state?.player?.cargo?.items?.[commodityId] || 0) >= owned + qty
    ), { commodityId: item.commodityId, owned: before.owned, qty: item.qty });
    const after = await readCargo(page, item.commodityId);
    result.push({ ...item, before, after });
  }
  return result;
}

async function readCargo(page, commodityId) {
  return page.evaluate((id) => ({
    owned: Number(window.SF?.state?.player?.cargo?.items?.[id] || 0),
    credits: Number(window.SF?.state?.player?.credits || 0),
  }), commodityId);
}

async function publicUndock(page) {
  const undock = page.locator('button.st-undock').and(page.getByRole('button', { name: /\bundock\b/i }));
  await undock.waitFor({ state: 'visible' });
  await undock.click();
  const confirm = page.locator('[data-pop-launch]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForFunction(() => window.SF?.state?.ui?.docked !== true, null, { timeout: 20_000 });
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight');
}

async function selectAsteroidOnLocalMap(page, options = {}) {
  await page.keyboard.press('KeyM');
  await waitVisible(page, '#sf-localmap', 'local map');
  await page.waitForFunction((siteId) => {
    const def = window.SF?.ctx?.screenManager?.getActiveScreenDef?.();
    const state = window.SF?.state;
    return def?.id === 'localmap' && (def._lastClickTargets || []).some((target) => {
      if (target.kind !== 'asteroid') return false;
      const entity = state?.entities?.get(target.targetEntityId);
      return !siteId || entity?.data?.siteId === siteId;
    });
  }, options.siteId || null, { timeout: 20_000 });
  const target = await page.evaluate((siteId) => {
    const def = window.SF.ctx.screenManager.getActiveScreenDef();
    const state = window.SF.state;
    const candidates = (def._lastClickTargets || []).filter((row) => {
      if (row.kind !== 'asteroid') return false;
      const entity = state.entities.get(row.targetEntityId);
      if (!entity || entity.alive === false || entity.data?.respawnAt != null) return false;
      return !siteId || entity.data?.siteId === siteId;
    });
    const player = state.entities.get(state.playerId);
    candidates.sort((a, b) => (
      Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z)
      - Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z)
    ));
    const row = candidates[0];
    return row ? {
      targetEntityId: row.targetEntityId,
      label: row.label,
      sx: row.sx,
      sy: row.sy,
      siteId: state.entities.get(row.targetEntityId)?.data?.siteId || null,
    } : null;
  }, options.siteId || null);
  assert(target, `local map did not expose ${options.siteId ? `site ${options.siteId}` : 'an asteroid'} dot`);
  const canvas = page.locator('#sf-localmap canvas');
  const box = await canvas.boundingBox();
  assert(box, 'local map canvas has no pointer box');
  await page.mouse.click(box.x + target.sx, box.y + target.sy);
  await page.waitForFunction((id) => window.SF?.state?.nav?.autopilot?.targetEntityId === id,
    target.targetEntityId, { timeout: 10_000 });
  return target;
}

async function waitForAutopilotArrival(page, target) {
  const result = await page.waitForFunction((id) => {
    const state = window.SF?.state;
    const nav = state?.nav?.autopilot;
    const player = state?.entities?.get(state.playerId);
    if (!nav || !player || player.alive === false || Number(player.hull) <= 0) return null;
    if (nav.targetEntityId !== id) return null;
    if (nav.active === false) return {
      status: nav.status || null,
      distance: Number(nav.distance),
      speed: Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0),
    };
    return null;
  }, target.targetEntityId, { timeout: 120_000 });
  const row = await result.jsonValue();
  assert.equal(row.status, 'arrived', `asteroid autopilot ended as ${row.status}`);
  return row;
}

async function enterAsteroidOps(page, targetEntityId) {
  const current = await page.evaluate(() => ({
    active: window.SF?.state?.player?.tether?.active === true,
    targetId: window.SF?.state?.player?.tether?.targetId ?? null,
  }));
  if (!(current.active && current.targetId === targetEntityId)) {
    await page.keyboard.press('Space');
    await page.waitForFunction((id) => {
      const tether = window.SF?.state?.player?.tether;
      return tether?.active === true && tether.targetId === id;
    }, targetEntityId, { timeout: 10_000 });
  }
  await page.keyboard.press('KeyB');
  await waitVisible(page, '[data-screen="drill"]', 'Asteroid Ops');
  await page.waitForFunction((id) => window.SF?.state?.drill?.active === true
    && window.SF.state.drill.asteroidId === id, targetEntityId);
}

async function pulseSurveyReveal(page) {
  const button = page.locator('.ao-survey');
  await button.waitFor({ state: 'visible' });
  await button.click();
  await page.waitForFunction(() => {
    const chips = [...document.querySelectorAll('[data-screen="drill"] .ao-chip')];
    return chips.some((chip) => /^Assay\s+\d+\/\d+$/i.test((chip.textContent || '').trim()));
  }, null, { timeout: 10_000 });
  const text = await page.locator('[data-screen="drill"] .ao-chip')
    .filter({ hasText: /^Assay / }).first().innerText();
  const match = text.match(/Assay\s+(\d+)\/(\d+)/i);
  assert(match && Number(match[1]) > 0 && Number(match[2]) >= Number(match[1]),
    `visible survey chip did not reveal geology: ${text}`);
  return { visibleText: text.trim(), revealed: Number(match[1]), cells: Number(match[2]) };
}

async function planCorePlacement(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const owner = window.SF.registry.get('asteroidSites');
    const d = state.drill;
    const offsets = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (const [dc, dr] of offsets) {
      const col = d.avatar.col + dc;
      const row = d.avatar.row + dr;
      const check = owner.canInstall({
        asteroidId: d.asteroidId,
        defId: 'sm_massline_core',
        col,
        row,
      });
      if (check.ok) return { from: { ...d.avatar }, to: { col, row } };
    }
    return null;
  }).then((plan) => {
    assert(plan, 'no public cursor-reachable Massline Core placement exists beside the rover');
    return plan;
  });
}

async function planExtractorPlacement(page, core) {
  return page.evaluate(({ coreCell, siteId }) => {
    const state = window.SF.state;
    const owner = window.SF.registry.get('asteroidSites');
    const d = state.drill;
    const offsets = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (const [dc, dr] of offsets) {
      const col = coreCell.col + dc;
      const row = coreCell.row + dr;
      const check = owner.canInstall({
        asteroidId: d.asteroidId,
        defId: 'sm_extractor',
        col,
        row,
      });
      if (check.ok && Number(check.profile?.solid) > 0) {
        return { from: { ...coreCell }, to: { col, row }, siteId };
      }
    }
    return null;
  }, { coreCell: core.cell, siteId: core.siteId }).then((plan) => {
    assert(plan, 'no powered, geology-contacting extractor placement exists beside the Core');
    return plan;
  });
}

async function placeSiteMachine(page, defId, plan) {
  const palette = page.locator(`[data-item-id="${defId}"]`);
  await palette.waitFor({ state: 'visible' });
  await palette.click();
  await moveBuildCursor(page, plan.from, plan.to);
  const before = await page.evaluate(() => {
    const owner = window.SF.registry.get('asteroidSites');
    const site = owner.siteForAsteroid(window.SF.state.drill.asteroidId);
    return site?.machines?.length || 0;
  });
  await page.keyboard.press('Enter');
  const handle = await page.waitForFunction(({ id, count }) => {
    const state = window.SF?.state;
    const owner = window.SF?.registry?.get('asteroidSites');
    const site = owner?.siteForAsteroid(state?.drill?.asteroidId);
    const machine = site?.machines?.find((row) => row.defId === id);
    return site && site.machines.length > count && machine ? {
      siteId: site.id,
      anchored: site.anchored === true,
      lifecycle: site.survey?.lifecycle || null,
      machineId: machine.id,
      cell: { col: machine.col, row: machine.row },
    } : null;
  }, { id: defId, count: before }, { timeout: 10_000 });
  const installed = await handle.jsonValue();
  if (defId === 'sm_massline_core') {
    assert.equal(installed.anchored, true, 'Core DOM placement must anchor the site');
    assert.equal(installed.lifecycle, 'committed', 'Core DOM placement must commit the survey');
  }
  return installed;
}

async function moveBuildCursor(page, from, to) {
  const horizontal = to.col - from.col;
  const vertical = to.row - from.row;
  const hKey = horizontal < 0 ? 'ArrowLeft' : 'ArrowRight';
  const vKey = vertical < 0 ? 'ArrowUp' : 'ArrowDown';
  for (let i = 0; i < Math.abs(horizontal); i += 1) await page.keyboard.press(hKey);
  for (let i = 0; i < Math.abs(vertical); i += 1) await page.keyboard.press(vKey);
}

async function exitAsteroidOps(page) {
  const drive = page.getByRole('button', { name: 'Drive', exact: true });
  await drive.click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.SF?.state?.drill == null, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight');
}

async function waitForPositiveProduction(page, siteId) {
  const handle = await page.waitForFunction((id) => {
    const events = window.__PQ024_H1_TRACE__?.production || [];
    const event = events.find((row) => row.siteId === id && Number(row.receipt?.positiveQuantity) > 0);
    const owner = window.SF?.registry?.get('asteroidSites');
    const site = owner?.getSite(id);
    if (!event || site?.survey?.lifecycle !== 'producing') return null;
    return {
      siteId: id,
      lifecycle: site.survey.lifecycle,
      receipt: event.receipt,
      eventCount: events.filter((row) => row.siteId === id).length,
    };
  }, siteId, { timeout: 240_000 });
  const row = await handle.jsonValue();
  assert.equal(row.lifecycle, 'producing');
  assert.ok(Number(row.receipt.positiveQuantity) > 0, 'production receipt must contain positive output');
  return row;
}

async function assertExactlyOneExteriorRelay(page, siteId) {
  const handle = await page.waitForFunction((id) => {
    const entities = [...(window.SF?.state?.entities?.values?.() || [])];
    const relays = entities.filter((entity) => (
      entity?.alive !== false
      && entity.data?.siteBeacon === id
      && entity.data?.placeId === 'place_claim_outpost_relay'
    ));
    return relays.length === 1 ? {
      count: relays.length,
      entityId: relays[0].id,
      placeId: relays[0].data.placeId,
      siteId: relays[0].data.siteBeacon,
    } : null;
  }, siteId, { timeout: 20_000 });
  const row = await handle.jsonValue();
  assert.equal(row.count, 1, 'producing site must project exactly one exterior relay');
  return row;
}

async function releaseMassline(page) {
  const active = await page.evaluate(() => window.SF?.state?.player?.tether?.active === true);
  if (!active) return;
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.SF?.state?.player?.tether?.active !== true);
}

async function quickSave(page) {
  const before = await page.evaluate(() => window.__PQ024_H1_TRACE__?.saves?.length || 0);
  await page.keyboard.press('F5');
  const handle = await page.waitForFunction((count) => {
    const saves = window.__PQ024_H1_TRACE__?.saves || [];
    return saves.length > count ? saves.at(-1) : null;
  }, before, { timeout: 30_000 });
  return handle.jsonValue();
}

async function coldContinue(page, rootUrl, siteId, productionReceipt, pageIssueTracker) {
  const navigationToken = pageIssueTracker?.beginExpectedNavigation?.('pq024-cold-continue');
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } finally {
    pageIssueTracker?.endExpectedNavigation?.(navigationToken);
  }
  assert.equal(new URL(page.url()).href, new URL(rootUrl).href, 'Continue reload stays on canonical root');
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
    null, { timeout: 60_000 });
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu after reload');
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await button.waitFor({ state: 'visible' });
  await button.click();
  const handle = await page.waitForFunction(({ id, outputId, positiveQuantity }) => {
    const state = window.SF?.state;
    const owner = window.SF?.registry?.get('asteroidSites');
    const site = owner?.getSite(id);
    const entities = [...(state?.entities?.values?.() || [])];
    const relays = entities.filter((entity) => entity?.alive !== false && entity.data?.siteBeacon === id);
    if (state?.mode !== 'flight' || site?.survey?.lifecycle !== 'producing' || relays.length !== 1) return null;
    const receipt = site.survey.receipt;
    return {
      siteId: site.id,
      lifecycle: site.survey.lifecycle,
      outputId: receipt?.outputId || null,
      positiveQuantity: Number(receipt?.positiveQuantity) || 0,
      receiptMatches: receipt?.outputId === outputId
        && Number(receipt?.positiveQuantity) === Number(positiveQuantity),
      relayCount: relays.length,
    };
  }, {
    id: siteId,
    outputId: productionReceipt.outputId,
    positiveQuantity: productionReceipt.positiveQuantity,
  }, { timeout: 120_000 });
  const row = await handle.jsonValue();
  assert.equal(row.receiptMatches, true, 'Continue must restore the same positive production receipt');
  return row;
}

async function reenterAsteroidOps(page, targetEntityId, siteId) {
  await enterAsteroidOps(page, targetEntityId);
  const handle = await page.waitForFunction((id) => {
    const chips = [...document.querySelectorAll('[data-screen="drill"] .ao-chip')]
      .map((chip) => (chip.textContent || '').trim()).filter(Boolean);
    const owner = window.SF?.registry?.get('asteroidSites');
    const site = owner?.getSite(id);
    return site && site.survey && site.survey.lifecycle === 'producing'
      && chips.some((text) => text === 'Producing')
      ? { siteId: id, lifecycle: site.survey.lifecycle, chips } : null;
  }, siteId, { timeout: 20_000 });
  return handle.jsonValue();
}

async function waitVisible(page, selector, label, timeout = 30_000) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout });
  assert.equal(await locator.isVisible(), true, `${label} must be visible`);
  return locator;
}

async function readGpuContract(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas') || document.querySelector('canvas');
    const gl = canvas?.getContext?.('webgl2') || canvas?.getContext?.('webgl');
    if (!gl) return { available: false, vendor: null, renderer: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
}

function repoRel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
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
