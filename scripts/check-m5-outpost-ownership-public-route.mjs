#!/usr/bin/env node
// M5 visible outpost ownership — canonical Browser route.
//
// Each route uses the normal title/New Game/Launch path, the public U claim/Base interaction,
// pointer-driven Build + Commission controls, F5, Main Menu, Continue, and the public N map.
// Progression resources, prerequisite research points, and travel to the authored Ceres claim are
// transparent setup assistance because an Outpost Charter is a multi-hour progression capstone.
// Setup uses production owners for credits, research unlocks, sector entry, and claiming; the only
// direct fixture writes are research-point seed and collision-safe player placement. Evidence is
// therefore supporting public-route proof (primaryAcceptance:false), never mislabeled uninjected.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, '.devshots', 'alpha', 'm5-outpost-ownership-public-route');
const REPORT = resolve(OUT_DIR, 'route-report.json');
const EVIDENCE = resolve(OUT_DIR, 'evidence.json');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const CLAIM_POI_ID = 'poi_claim_rookery';
const CLAIM_NAME = 'Rookery Prospect';
const TECH_SEQUENCE = Object.freeze([
  'tech_tractor_systems',
  'tech_drone_control',
  'tech_drone_swarm',
  'tech_autonomous_fleets',
  'tech_outpost_charter',
  'tech_industrial_mining',
  'tech_focused_extraction',
  'tech_deep_core_mining',
]);
const ROUTES = Object.freeze([
  Object.freeze({
    id: 'spec_refinery', role: 'REFINERY', name: 'Industrial Refinery', module: 'On-Site Refinery',
    verb: 'Deliver raw ore. Collect refined output.',
    baseShot: '01-refinery-commissioned.png', continuedShot: '02-refinery-continued-map.png',
  }),
  Object.freeze({
    id: 'spec_relay', role: 'RELAY', name: 'Trade Relay', module: 'Cargo Depot',
    verb: 'Deliver freight. The relay sells it by scheduled convoy.',
    baseShot: '03-relay-commissioned.png', continuedShot: '04-relay-continued-map.png',
  }),
  Object.freeze({
    id: 'spec_bastion', role: 'BASTION', name: 'Defense Bastion', module: 'Defense Battery',
    verb: 'Answer raid warnings. Fight at the threatened claim.',
    baseShot: '05-bastion-commissioned.png', continuedShot: '06-bastion-continued-map.png',
  }),
]);

let browser = null;
let server = null;
try {
  await mkdir(OUT_DIR, { recursive: true });
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForSf(page);
  assert.equal(new URL(page.url()).search, '', 'ownership proof stays on the canonical root route');

  const stages = [];
  for (const [index, route] of ROUTES.entries()) {
    if (index > 0) await returnToMainMenu(page);
    await clearQuickSave(page);
    await startNewGame(page, route);
    const setup = await setupProgressionAndTravel(page);
    assert.equal(setup.poiId, CLAIM_POI_ID, `${route.id}: authored claim POI exists`);
    assert.deepEqual(setup.unlocked, TECH_SEQUENCE, `${route.id}: production research path unlocks`);

    await page.keyboard.press('u');
    await page.locator('#sf-base').waitFor({ state: 'visible', timeout: 20_000 });
    const body = await claimSnapshot(page);
    assert.equal(body.poiId, CLAIM_POI_ID, `${route.id}: U claims the authored body`);
    assert.equal(body.owned, true, `${route.id}: claim records explicit ownership`);

    const moduleCard = page.locator('#sf-base .base-mod').filter({ hasText: route.module });
    await moduleCard.waitFor({ state: 'visible' });
    await moduleCard.locator('button').click();
    await page.waitForFunction(({ moduleName }) => {
      const body = window.SF?.registry?.get('claims')?.list?.()[0];
      const ids = body?.modules || [];
      const byName = {
        'On-Site Refinery': 'mod_refinery',
        'Cargo Depot': 'mod_depot',
        'Defense Battery': 'mod_defense',
      };
      return ids.includes(byName[moduleName]);
    }, { moduleName: route.module }, { timeout: 10_000 });

    const specCard = page.locator('#sf-base .base-spec').filter({ hasText: route.name });
    await specCard.waitFor({ state: 'visible' });
    await specCard.locator('button').click();
    await page.waitForFunction(({ specId }) =>
      window.SF?.registry?.get('claims')?.list?.()[0]?.spec?.id === specId,
    { specId: route.id }, { timeout: 10_000 });

    const commissioned = await baseSnapshot(page, route);
    assert.equal(commissioned.specId, route.id);
    assert.match(commissioned.visibleText, new RegExp(route.role, 'i'));
    assert.match(commissioned.visibleText, new RegExp(escapeRegExp(route.verb), 'i'));
    assert.equal(commissioned.ledger.specId, route.id);
    assert.equal(commissioned.mapIdentity.role, route.role);
    const baseShot = resolve(OUT_DIR, route.baseShot);
    await page.screenshot({ path: baseShot });

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('#sf-base').waitFor({ state: 'hidden', timeout: 10_000 });
    await quickSave(page, route.id);
    await returnToMainMenu(page);
    await publicContinue(page, route.id);
    const continued = await continuedSnapshot(page, route);
    assert.equal(continued.specId, route.id, `${route.id}: specialization survives Continue`);
    assert.equal(continued.deploymentReceipt.claimSpecId, route.id,
      `${route.id}: physical outpost ownership receipt survives Continue`);

    await openOwnedClaimOnMap(page, route);
    const map = await mapSnapshot(page, route);
    assert.match(map.inspectorText, new RegExp(`PLAYER-OWNED ${route.role}`, 'i'));
    assert.match(map.inspectorText, new RegExp(escapeRegExp(route.verb), 'i'));
    assert.equal(map.canvasLabel.includes(`${route.role} · ${CLAIM_NAME}`), true,
      `${route.id}: accessible map label exposes ownership identity`);
    const continuedShot = resolve(OUT_DIR, route.continuedShot);
    await page.screenshot({ path: continuedShot });

    stages.push({
      route: route.id,
      setup,
      commissioned,
      continued,
      map,
      screenshots: {
        commissioned: await mediaReceipt(baseShot),
        continuedMap: await mediaReceipt(continuedShot),
      },
    });
    await page.locator('#sf-galaxymap .gm-close').click();
    await page.locator('#sf-galaxymap').waitFor({ state: 'hidden', timeout: 10_000 });
  }

  assert.deepEqual(issues.errorIssues(), [], 'M5 outpost route emitted no page errors');
  const gpu = await gpuString(page);
  const report = {
    schema: 'spaceface.m5OutpostOwnershipPublicRoute.v1',
    generatedAt: new Date().toISOString(),
    worktreeId: worktreeId(),
    route: 'canonical root -> New Game/Launch -> production progression setup -> public U claim/Base -> pointer Build/Commission -> F5 -> Main Menu -> Continue -> public N map',
    url: server.baseUrl,
    canonicalRoot: new URL(page.url()).search === '',
    viewport: { ...VIEWPORT, deviceScaleFactor: 1 },
    setupAssistance: {
      primaryAcceptance: false,
      reason: 'Outpost Charter and Deep-Core Mining are multi-hour progression prerequisites. Setup seeds RP and collision-safe position, while credits, tech, sector entry, claiming, building, commissioning, save, Continue, and visible inspection use production owners or public UI.',
      directStateWritesPerRoute: ['player.researchPoints', 'player.pos/prevPos/vel fixture placement'],
    },
    publicActions: ['New Game', 'Casual', 'Launch', 'U', 'Build', 'Commission', 'Close', 'F5', 'Main Menu', 'Continue', 'N', '/', 'Search result'],
    acceptance: {
      allThreeCommissionedThroughVisibleControls: true,
      allThreeVisibleInBaseLedger: true,
      allThreePersistThroughContinue: true,
      allThreeVisibleAndActionableOnMap: true,
      noPageErrors: true,
    },
    stages,
    pageIssues: issues.errorIssues(),
    browserVersion: await browser.version(),
    gpu,
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2) + '\n');

  const evidence = {
    schema: 'spaceface.alphaEvidence.v1',
    taskId: 'm5-outpost-ownership-public-route',
    worktreeId: report.worktreeId,
    route: report.route,
    viewport: VIEWPORT,
    runtime: { kind: 'browser', gpu },
    captureKind: 'browser',
    inputSource: 'keyboard-mouse',
    injectedState: true,
    primaryAcceptance: false,
    checks: [
      { name: 'three public Base commissioning routes', status: 'pass' },
      { name: 'three F5 -> Main Menu -> Continue durability routes', status: 'pass' },
      { name: 'three public owned-claim map inspections', status: 'pass' },
      { name: 'runtime/page errors absent', status: 'pass' },
    ],
    artifacts: [
      ...stages.flatMap((stage) => [
        { kind: 'screenshot', path: stage.screenshots.commissioned.path },
        { kind: 'screenshot', path: stage.screenshots.continuedMap.path },
      ]),
      { kind: 'report', path: relativePath(REPORT) },
    ],
    notes: [
      'Supporting public-route proof: visible claim, build, commission, save, Continue, and map inspection use normal keyboard/mouse controls.',
      'The progression prerequisite and collision-safe authored-site placement are transparent fixture setup, so this evidence is intentionally non-primary.',
      'No entities were invented and no claim/specialization/save payload was injected; every owned body and operating identity was created by the live claims system.',
    ],
  };
  await writeFile(EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');

  process.stdout.write(`M5 outpost ownership public route PASS\n${JSON.stringify({
    evidence: relativePath(EVIDENCE),
    report: relativePath(REPORT),
    routes: stages.map((stage) => ({
      id: stage.route,
      continued: stage.continued.specId,
      mapRole: stage.map.role,
      screenshots: stage.screenshots,
    })),
    pageErrors: report.pageIssues.length,
  }, null, 2)}\n`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await stopOwnedServer(server).catch(() => {});
}

async function startNewGame(page, route) {
  await page.getByRole('button', { name: 'New Game', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('#sf-ng-pilot-name').fill(`M5 ${route.role} Pilot`);
  await page.locator('#sf-ng-difficulty').selectOption('casual');
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await waitForFlight(page);
}

async function setupProgressionAndTravel(page) {
  const unlock = await page.evaluate((sequence) => {
    const sf = window.SF;
    sf.bus.emit('economy:grantCredits', { amount: 3_000_000, reason: 'm5-outpost-public-route-setup' });
    sf.state.player.researchPoints = 2_500;
    const ships = sf.registry.get('ships');
    const unlocked = [];
    for (const nodeId of sequence) {
      if (ships.unlockTech(nodeId)) unlocked.push(nodeId);
    }
    sf.registry.get('world').enterSector('sector_ceres_belt', { fromJump: true });
    return { unlocked, credits: sf.state.player.credits, researchPoints: sf.state.player.researchPoints };
  }, TECH_SEQUENCE);
  await page.waitForFunction((poiId) => [...(window.SF?.state?.entityList || [])]
    .some((entity) => entity?.alive !== false && entity?.data?.poiId === poiId), CLAIM_POI_ID,
  { timeout: 20_000 });
  const placement = await page.evaluate((poiId) => {
    const state = window.SF.state;
    const poi = [...state.entityList].find((entity) => entity?.alive !== false && entity?.data?.poiId === poiId);
    const player = state.entities.get(state.playerId);
    const x = poi.pos.x - 100;
    const z = poi.pos.z;
    player.pos.x = x; player.pos.y = 0; player.pos.z = z;
    if (player.prevPos?.set) player.prevPos.set(x, 0, z);
    else if (player.prevPos) { player.prevPos.x = x; player.prevPos.y = 0; player.prevPos.z = z; }
    if (player.vel?.set) player.vel.set(0, 0, 0);
    else if (player.vel) { player.vel.x = 0; player.vel.y = 0; player.vel.z = 0; }
    return { poiId: poi.data.poiId, poiName: poi.data.name, distance: Math.hypot(poi.pos.x - x, poi.pos.z - z) };
  }, CLAIM_POI_ID);
  assert.ok(placement.distance < 220, 'fixture placement remains inside the public U interaction radius');
  return { ...unlock, ...placement };
}

async function quickSave(page, specId) {
  const prior = await page.evaluate(() => window.__m5OutpostSaveCount || 0);
  await page.evaluate(() => {
    if (!window.__m5OutpostSaveObservation) {
      window.__m5OutpostSaveObservation = true;
      window.__m5OutpostSaveCount = 0;
      window.SF.bus.on('save:completed', () => { window.__m5OutpostSaveCount += 1; });
    }
  });
  const baseline = Math.max(prior, await page.evaluate(() => window.__m5OutpostSaveCount || 0));
  await page.keyboard.press('F5');
  await page.waitForFunction(({ n, wanted }) => {
    const body = window.SF?.registry?.get('claims')?.list?.()[0];
    return (window.__m5OutpostSaveCount || 0) > n
      && body?.spec?.id === wanted
      && !!localStorage.getItem('sf.save.quick');
  }, { n: baseline, wanted: specId }, { timeout: 30_000 });
}

async function publicContinue(page, specId) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((node) => node.textContent?.trim() === 'Continue' && !node.disabled), null, { timeout: 20_000 });
  await button.click();
  await waitForFlight(page);
  await page.waitForFunction((wanted) =>
    window.SF?.registry?.get('claims')?.list?.()[0]?.spec?.id === wanted,
  specId, { timeout: 60_000 });
}

async function returnToMainMenu(page) {
  if (await page.locator('#sf-galaxymap').isVisible().catch(() => false)) {
    await page.locator('#sf-galaxymap .gm-close').click();
  }
  await page.keyboard.press('Escape');
  const menuButtons = page.getByRole('button', { name: 'Main Menu', exact: true });
  await menuButtons.first().waitFor({ state: 'visible', timeout: 10_000 });
  await menuButtons.first().click();
  await menuButtons.last().waitFor({ state: 'visible', timeout: 10_000 });
  await menuButtons.last().click();
  await page.waitForFunction(() => window.SF?.state?.mode === 'menu', null, { timeout: 15_000 });
}

async function clearQuickSave(page) {
  await page.evaluate(() => localStorage.removeItem('sf.save.quick'));
}

async function openOwnedClaimOnMap(page, route) {
  await page.keyboard.press('n');
  await page.locator('#sf-galaxymap').waitFor({ state: 'visible', timeout: 15_000 });
  await page.keyboard.press('/');
  const search = page.locator('#sf-galaxymap .gm-search-input');
  await search.fill(CLAIM_NAME);
  const result = page.locator('#sf-galaxymap .gm-search-item').filter({ hasText: route.role }).first();
  await result.waitFor({ state: 'visible', timeout: 10_000 });
  await result.click();
  await page.waitForFunction((role) => {
    const text = document.querySelector('#sf-galaxymap .gm-inspector-details')?.textContent || '';
    return text.includes(`PLAYER-OWNED ${role}`);
  }, route.role, { timeout: 10_000 });
}

async function baseSnapshot(page, route) {
  return page.evaluate(({ specId, role }) => {
    const claims = window.SF.registry.get('claims');
    const body = claims.list()[0];
    const ledger = claims.ledger(body.id);
    const visibleText = (document.querySelector('#sf-base')?.textContent || '').replace(/\s+/g, ' ').trim();
    const mapIdentity = {
      role,
      poiName: [...window.SF.state.entityList]
        .find((entity) => entity?.data?.poiId === body.poiId)?.data?.name || null,
      claimSpecId: [...window.SF.state.entityList]
        .find((entity) => entity?.data?.poiId === body.poiId)?.data?.claimSpecId || null,
    };
    return {
      bodyId: body.id,
      poiId: body.poiId,
      specId: body.spec?.id || null,
      modules: [...(body.modules || [])],
      deploymentReceipt: body.deploymentReceipt || null,
      visibleText,
      ledger,
      mapIdentity,
      expected: specId,
    };
  }, { specId: route.id, role: route.role });
}

async function continuedSnapshot(page, route) {
  return page.evaluate(({ specId }) => {
    const claims = window.SF.registry.get('claims');
    const body = claims.list()[0];
    return {
      bodyId: body.id,
      poiId: body.poiId,
      specId: body.spec?.id || null,
      modules: [...(body.modules || [])],
      deploymentReceipt: body.deploymentReceipt || null,
      ledger: claims.ledger(body.id),
      expected: specId,
    };
  }, { specId: route.id });
}

async function claimSnapshot(page) {
  return page.evaluate(() => {
    const body = window.SF.registry.get('claims').list()[0];
    return body ? JSON.parse(JSON.stringify(body)) : null;
  });
}

async function mapSnapshot(page, route) {
  return page.evaluate(({ role }) => {
    const inspectorText = (document.querySelector('#sf-galaxymap .gm-inspector-details')?.textContent || '')
      .replace(/\s+/g, ' ').trim();
    const canvasLabel = document.querySelector('#sf-galaxymap canvas')?.getAttribute('aria-label') || '';
    const claims = window.SF.registry.get('claims');
    const body = claims.list()[0];
    return { role, inspectorText, canvasLabel, ledger: claims.ledger(body.id) };
  }, { role: route.role });
}

async function waitForSf(page) {
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.registry,
    null, { timeout: 30_000 });
}

async function waitForFlight(page) {
  await page.waitForFunction(() => {
    const sf = window.SF;
    return sf?.state?.mode === 'flight'
      && !sf.state.ui?.docked
      && !!sf.state.entities?.get?.(sf.state.playerId);
  }, null, { timeout: 90_000 });
}

async function gpuString(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'browser WebGL unavailable';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext
      ? `${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)} / ${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}`
      : `${gl.getParameter(gl.VENDOR)} / ${gl.getParameter(gl.RENDERER)}`;
  });
}

async function mediaReceipt(path) {
  const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
  return {
    path: relativePath(path),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: VIEWPORT.width,
    height: VIEWPORT.height,
  };
}

function worktreeId() {
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim() || 'detached';
  const hash = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return `${branch}@${hash}+dirty`;
}

function relativePath(path) {
  return path.slice(ROOT.length + 1).replaceAll('\\', '/');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function startServer() {
  for (let port = 8840; port < 8910; port++) {
    if (!(await isPortFree(port))) continue;
    const child = spawn(process.execPath, ['server.js', String(port)], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    const baseUrl = `http://127.0.0.1:${port}/`;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode != null) throw new Error(`M5 ownership server exited early\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok) return { child, baseUrl };
      } catch {}
      await new Promise((done) => setTimeout(done, 100));
    }
    child.kill();
  }
  throw new Error('No free M5 ownership Browser proof port');
}

async function stopOwnedServer({ child, baseUrl }) {
  if (child.exitCode == null && child.signalCode == null) child.kill();
  await new Promise((done) => {
    if (child.exitCode != null || child.signalCode != null) return done();
    const timer = setTimeout(done, 5_000);
    child.once('exit', () => { clearTimeout(timer); done(); });
  });
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(250) });
    throw new Error(`owned M5 ownership server remained reachable: ${baseUrl}`);
  } catch (error) {
    if (/remained reachable/.test(String(error))) throw error;
  }
}

function isPortFree(port) {
  return new Promise((done) => {
    const probe = createNetServer();
    probe.once('error', () => done(false));
    probe.once('listening', () => probe.close(() => done(true)));
    probe.listen(port, '127.0.0.1');
  });
}
