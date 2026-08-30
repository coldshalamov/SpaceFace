#!/usr/bin/env node
/**
 * Capture an authored whole-ship body on the real flight and F2 preview renderers.
 *
 * The DEV Sandbox is used only as the public setup actor: it launches the normal new-game
 * transition, then selects the requested hull through ships.buyShip({ grant, setActive }). From
 * that point this probe observes the same player entity, chase camera, HUD, authored admission,
 * renderer, and engineering preview used by ordinary play.
 *
 * Usage:
 *   node scripts/capture-wholeship-live.mjs --ship ship_ironback \
 *     --expected-asset SF_IRONBACK_PRODUCTION_V1 \
 *     --expected-part wholeships/ironback_production_v1.glb
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = args.find((entry) => entry.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

function findBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

const SHIP_ID = arg('ship', 'ship_ironback');
const EXPECTED_ASSET_ID = arg('expected-asset');
const EXPECTED_PART = arg('expected-part').replace(/\\/g, '/');
const OUT = path.resolve(arg('out', path.join(ROOT, '.devshots', 'wholeship-live', SHIP_ID)));
const HEADLESS = !args.includes('--headed');

function normalizedPartSuffix(value) {
  const text = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return text.startsWith('assets/ships/release/parts/')
    ? text.slice('assets/ships/release/parts/'.length)
    : text;
}

function observePlayer() {
  const sf = window.SF;
  const state = sf && sf.state;
  const player = state && state.entities && state.entities.get(state.playerId);
  const root = player && (player.mesh || (player.view && player.view.root));
  const userData = root && root.userData || {};
  const partUrls = [];
  const packageRecipes = [];
  const fallbackNodes = [];
  const visibleNodes = [];
  if (root && typeof root.traverse === 'function') {
    root.traverse((object) => {
      if (!object) return;
      const data = object.userData || {};
      if (data.spacefaceFlightPackageRecipe) {
        packageRecipes.push({ ...data.spacefaceFlightPackageRecipe });
      }
      if (data.spacefacePartUrl) partUrls.push(String(data.spacefacePartUrl));
      if (Array.isArray(data.spacefacePartUrls)) {
        for (const url of data.spacefacePartUrls) partUrls.push(String(url));
      }
      if (data.authoredVisualRoot === 'procedural-fallback') {
        fallbackNodes.push(object.name || object.type || 'unnamed');
      }
      if (object.visible !== false && (object.isMesh || object.isLine || object.isPoints)) {
        visibleNodes.push(object.name || object.type || 'unnamed');
      }
    });
  }
  return {
    mode: state && state.mode || null,
    playerId: state && state.playerId || null,
    defId: player && player.data && player.data.defId || null,
    alive: !!(player && player.alive !== false),
    speed: player ? Math.hypot(player.vel && player.vel.x || 0, player.vel && player.vel.z || 0) : 0,
    authoredAssetState: userData.authoredAssetState || null,
    assetId: userData.assetId || null,
    authoredCompositionId: userData.authoredCompositionId || null,
    wholeShip: userData.wholeShip === true || userData.renderContract?.wholeShip === true,
    rootWholeShip: userData.wholeShip === true,
    wholeShipLodActiveLevel: userData.wholeShipLodActiveLevel || null,
    partUrls: [...new Set(partUrls)].sort(),
    packageRecipes,
    fallbackNodes,
    visibleNodeCount: visibleNodes.length,
    authoredParts: Array.isArray(userData.authoredPartsCache) ? [...userData.authoredPartsCache] : [],
    authoredSlots: userData.authoredSlotsCache || userData.authoredSlots || null,
    renderContract: userData.authoredRenderContract || userData.renderContract || null,
    sourceEnvelope: userData.authoredSourceEnvelope || null,
  };
}

function observePreview() {
  const canvas = document.querySelector('[data-screen="ship"] canvas');
  let diagnostics = null;
  try {
    diagnostics = canvas && typeof canvas.__sfPreviewDiagnostics === 'function'
      ? canvas.__sfPreviewDiagnostics()
      : null;
  } catch (error) {
    diagnostics = { error: String(error && error.message || error) };
  }
  return {
    mounted: !!canvas,
    defId: canvas && canvas.dataset.previewDefId || null,
    ready: canvas && canvas.dataset.previewReady || null,
    assetState: canvas && canvas.dataset.previewAssetState || null,
    reveal: canvas && canvas.dataset.previewReveal || null,
    diagnostics,
  };
}

const executablePath = findBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for whole-ship live capture');

await mkdir(OUT, { recursive: true });
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: HEADLESS,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = [];
page.on('pageerror', (error) => issues.push(`pageerror: ${String(error && error.message || error)}`));
page.on('console', (message) => {
  // Resource failures are recorded below from the response itself, where the owner URL is known.
  // Chromium's generic console duplicate only says "Failed to load resource" and would make an
  // intentionally optional local persistence endpoint look like an unrelated runtime exception.
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
    issues.push(`console: ${message.text()}`);
  }
});
page.on('response', (response) => {
  if (response.status() >= 400 && !response.url().includes('/__spaceface_player_store')) {
    issues.push(`http ${response.status()}: ${response.url()}`);
  }
});

const report = {
  schema: 'spaceface.wholeshipLiveCapture.v1',
  requested: {
    shipId: SHIP_ID,
    expectedAssetId: EXPECTED_ASSET_ID || null,
    expectedPart: EXPECTED_PART || null,
  },
  viewport: '1440x900',
  route: 'DEV Sandbox public setup -> normal new-game transition -> live flight -> F2 preview',
  flight: null,
  thrust: null,
  preview: null,
  issues,
  verdict: null,
};

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* best effort */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, {
    timeout: 90_000,
  });

  await page.getByRole('button', { name: 'Sandbox', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-screen="sandbox"]');
    return !!(screen && getComputedStyle(screen).display !== 'none');
  }, null, { timeout: 30_000 });

  const shipSelect = page.locator('#sf-sandbox-ship');
  await shipSelect.selectOption(SHIP_ID, { force: true });
  const selected = await shipSelect.inputValue();
  if (selected !== SHIP_ID) throw new Error(`Sandbox did not select ${SHIP_ID}; selected ${selected}`);
  await page.getByRole('button', { name: 'Launch with these settings', exact: true }).click({
    timeout: 30_000,
  });

  await page.waitForFunction((shipId) => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false
      && player.data && player.data.defId === shipId);
  }, SHIP_ID, { timeout: 90_000 });

  await page.waitForFunction(({ assetId, part }) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const root = player && player.mesh;
    const data = root && root.userData || {};
    if (data.authoredAssetState !== 'authored' || data.renderContract?.wholeShip !== true) return false;
    let assetFound = !assetId;
    let partFound = !part;
    root.traverse((object) => {
      const ud = object && object.userData || {};
      const recipe = ud.spacefaceFlightPackageRecipe;
      if (recipe && recipe.assetId === assetId) assetFound = true;
      const urls = [ud.spacefacePartUrl, ...(Array.isArray(ud.spacefacePartUrls) ? ud.spacefacePartUrls : [])];
      if (urls.some((url) => String(url || '').replace(/\\/g, '/').endsWith(part))) partFound = true;
    });
    return assetFound && partFound;
  }, { assetId: EXPECTED_ASSET_ID, part: EXPECTED_PART }, { timeout: 30_000 });

  await page.waitForTimeout(1200);
  report.flight = await page.evaluate(observePlayer);
  await page.screenshot({ path: path.join(OUT, '01-flight-idle.png'), type: 'png' });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(350);
  report.thrust = await page.evaluate(observePlayer);
  await page.screenshot({ path: path.join(OUT, '02-flight-under-thrust.png'), type: 'png' });
  await page.keyboard.up('KeyW');

  await page.keyboard.press('F2');
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-screen="ship"]');
    return !!(screen && getComputedStyle(screen).display !== 'none');
  }, null, { timeout: 30_000 });
  await page.waitForFunction((shipId) => {
    const canvas = document.querySelector('[data-screen="ship"] canvas');
    return !!(canvas && canvas.dataset.previewDefId === shipId
      && canvas.dataset.previewReady === 'true'
      && canvas.dataset.previewAssetState === 'authored');
  }, SHIP_ID, { timeout: 60_000 });
  await page.waitForTimeout(500);
  report.preview = await page.evaluate(observePreview);
  await page.screenshot({ path: path.join(OUT, '03-f2-preview.png'), type: 'png' });

  const failures = [];
  if (report.flight.defId !== SHIP_ID) failures.push(`flight defId ${report.flight.defId}`);
  if (report.flight.authoredAssetState !== 'authored') failures.push(`flight state ${report.flight.authoredAssetState}`);
  if (report.flight.wholeShip !== true) failures.push('flight root is not a whole ship');
  if (report.flight.fallbackNodes.length) failures.push(`procedural fallbacks ${report.flight.fallbackNodes.join(', ')}`);
  if (EXPECTED_ASSET_ID && !report.flight.packageRecipes.some((recipe) => (
    recipe && recipe.assetId === EXPECTED_ASSET_ID
  ))) {
    failures.push(`missing package assetId ${EXPECTED_ASSET_ID}`);
  }
  if (EXPECTED_PART) {
    const expected = normalizedPartSuffix(EXPECTED_PART);
    const matched = report.flight.partUrls.some((url) => normalizedPartSuffix(url).endsWith(expected));
    if (!matched) failures.push(`missing part URL ${EXPECTED_PART}`);
  }
  if (report.preview.defId !== SHIP_ID || report.preview.ready !== 'true'
      || report.preview.assetState !== 'authored') {
    failures.push(`preview ${JSON.stringify(report.preview)}`);
  }
  const relevantIssues = issues.filter((issue) => !issue.includes('/__spaceface_player_store'));
  if (relevantIssues.length) failures.push(`${relevantIssues.length} page/runtime issue(s)`);

  report.verdict = failures.length
    ? { status: 'FAIL', failures }
    : { status: 'KEEP', failures: [] };
  await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ship: report.flight.defId,
    state: report.flight.authoredAssetState,
    assetId: report.flight.assetId,
    wholeShip: report.flight.wholeShip,
    partUrls: report.flight.partUrls,
    fallbackNodes: report.flight.fallbackNodes,
    preview: report.preview && {
      defId: report.preview.defId,
      ready: report.preview.ready,
      assetState: report.preview.assetState,
    },
    issues: relevantIssues,
    verdict: report.verdict,
    out: OUT,
  }, null, 2));

  if (failures.length) process.exitCode = 1;
} catch (error) {
  if (!report.flight) {
    report.flight = await page.evaluate(observePlayer).catch(() => null);
  }
  report.verdict = { status: 'FAIL', failures: [String(error && error.message || error)] };
  await page.screenshot({ path: path.join(OUT, 'failure.png'), type: 'png' }).catch(() => {});
  await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error('last player observation:', JSON.stringify(report.flight, null, 2));
  throw error;
} finally {
  await browser.close();
  if (server.close) await server.close();
}
