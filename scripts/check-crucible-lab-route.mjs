#!/usr/bin/env node
// Browser witness for the real Sandbox -> Combat Lab route. This intentionally uses the public
// form and Relaunch control; state reads are observer evidence after each live UI action.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PLAYER_STORE_DIR = mkdtempSync(join(tmpdir(), 'spaceface-crucible-lab-route-'));
const SEED = 1864401122;
const ARENA_ID = 'lagrange_crucible';
const ENEMY_PACKAGE_ID = 'wasp_flight';
const EXPECTED = Object.freeze({ sectorId: 'sector_helios_prime', x: -500, z: 800 });
const POSITION_EPSILON = 1e-6;
const BROWSER_CLOSE_TIMEOUT_MS = 5000;
const ELECTRON_ROUTE = process.argv.includes('--electron');
const RUNTIME_LABEL = ELECTRON_ROUTE ? 'Electron' : 'Browser';
const SCREENSHOT_SUFFIX = ELECTRON_ROUTE ? '-electron' : '';

const { chromium, _electron: electron } = await loadPlaywright();
let server = null;
let browser = null;
let electronApp = null;
let isolatedElectronLaunch = null;
let phase = 'BOOT';
const results = [];

function record(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(9)} ${detail}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const available = await new Promise((resolve) => {
      const listener = createNetServer();
      listener.once('error', () => resolve(false));
      listener.once('listening', () => listener.close(() => resolve(true)));
      listener.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error('no free local port for Crucible Lab route');
}

async function startServer() {
  const port = await findFreePort(8460);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: PLAYER_STORE_DIR },
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`server exited before ready: ${output}`);
    try {
      if ((await fetch(baseUrl)).ok) return { baseUrl, kill: () => child.kill() };
    } catch { /* wait for the normal server root */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`server did not become reachable: ${output}`);
}

async function clickExact(page, label, root = null, { noWaitAfter = false } = {}) {
  const scope = root || page;
  const button = scope.getByRole('button', { name: label, exact: true });
  await button.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await button.isEnabled(), true, `${label} must be enabled`);
  await button.click({ noWaitAfter });
}

async function selectViaVisibleWidget(page, selector, value) {
  const root = page.locator(selector);
  const field = root.locator('.sf-select__field');
  await field.waitFor({ state: 'visible', timeout: 30000 });
  await field.click();
  const option = root.locator(`.sf-select__opt[data-value="${value}"]`);
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click();
  await page.waitForFunction(([id, wanted]) => {
    const node = document.querySelector(id);
    return !!node && node.value === wanted;
  }, [selector, value], { timeout: 10000 });
}

async function readLiveWitness(page) {
  return page.evaluate((ownerId) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const ownedShip = state?.player?.ownedShips?.[state.player.activeShipIndex];
    const budget = sf && sf.ctx && sf.ctx.helpers && sf.ctx.helpers.spawnBudget;
    const owned = (state && Array.isArray(state.entityList) ? state.entityList : [])
      .filter((entity) => entity && entity.alive && budget && typeof budget.ownerForEntity === 'function'
        && budget.ownerForEntity(entity.id) === ownerId)
      .map((entity) => ({
        id: entity.id,
        enemyId: entity.data && entity.data.enemyId || null,
        pos: { x: entity.pos && entity.pos.x, z: entity.pos && entity.pos.z },
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const controls = document.querySelector('.sf-lab-runtime');
    const telemetry = document.querySelector('[aria-label="Combat Lab telemetry"]');
    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const inViewport = (node) => {
      if (!visible(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
    };
    const seed = document.querySelector('#sf-sandbox-lab-seed');
    return {
      mode: state && state.mode,
      run: state && state.run ? {
        kind: state.run.kind,
        phase: state.run.phase,
        seed: state.run.seed,
        arenaId: state.run.arenaId,
      } : null,
      sectorId: state && state.world && state.world.currentSectorId,
      playerPos: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
      playerBuild: ownedShip ? {
        hullId: ownedShip.defId || null,
        fittings: Array.isArray(ownedShip.fittings) ? [...ownedShip.fittings] : [],
      } : null,
      owned,
      controlsVisible: visible(controls),
      runtimeControls: controls ? [...controls.querySelectorAll('button')].map((button) => ({
        label: button.getAttribute('aria-label') || button.textContent.trim(),
        disabled: button.disabled,
        inViewport: inViewport(button),
      })) : [],
      telemetryVisible: visible(telemetry),
      controlsInViewport: inViewport(controls),
      telemetryInViewport: inViewport(telemetry),
      telemetryText: telemetry ? telemetry.textContent.replace(/\s+/g, ' ').trim() : '',
      labForm: {
        starterId: document.querySelector('#sf-sandbox-lab-starter')?.value || null,
        hullId: document.querySelector('#sf-sandbox-lab-hull')?.value || null,
        enemyPackageId: document.querySelector('#sf-sandbox-lab-enemy')?.value || null,
        arenaId: document.querySelector('#sf-sandbox-lab-arena')?.value || null,
        seed: document.querySelector('#sf-sandbox-lab-seed')?.value || null,
        wave: document.querySelector('#sf-sandbox-lab-wave')?.value || null,
      },
      seedInput: seed ? { visible: visible(seed), width: seed.getBoundingClientRect().width } : null,
    };
  }, `combat-lab:${ENEMY_PACKAGE_ID}`);
}

async function readOpeningProgramWitness(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const receipt = state?.render?.openingSubmissionReceipt;
    const plan = state?.render?.openingSubmissionPlan;
    const validation = state?.render?.openingSubmissionPreSubmitValidation;
    const renderSystem = window.SF?.registry?.get?.('render');
    const renderer = renderSystem?.renderer;
    const current = renderer?.info?.programs || [];
    const keyList = (entries) => entries.map((entry) => String(
      typeof entry === 'string' ? entry : entry?.cacheKey || '',
    )).filter(Boolean).sort();
    const materialRows = [];
    for (const leaf of plan?.compileSubjects || []) {
      const materials = Array.isArray(leaf?.material) ? leaf.material : [leaf?.material];
      for (const material of materials) {
        if (!material) continue;
        const program = renderer?.properties?.get?.(material)?.currentProgram;
        materialRows.push({
          leaf: leaf.name || leaf.userData?.openingSubmissionPackage?.assetId || leaf.uuid || null,
          material: material.name || material.type || null,
          materialType: material.type || null,
          program: program?.cacheKey || null,
        });
      }
    }
    return {
      receiptRequiredCount: keyList(receipt?.required?.programCacheKeys || []).length,
      receiptBeforeCount: keyList(receipt?.before?.programCacheKeys || []).length,
      currentCount: keyList(current).length,
      missing: keyList(validation?.missingProgramKeys || []),
      uncaptured: keyList(validation?.uncapturedProgramKeys || []),
      withoutCurrentProgram: materialRows.filter((row) => !row.program),
    };
  });
}

async function waitForLabFlight(page, label, issues) {
  try {
    await page.waitForFunction(({ seed, arenaId }) => {
      const state = window.SF && window.SF.state;
      return !!(state && state.mode === 'flight' && state.run && state.run.kind === 'lab'
        && state.run.seed === seed && state.run.arenaId === arenaId);
    }, { seed: SEED, arenaId: ARENA_ID }, { timeout: 90000 });
    await page.waitForFunction(() => {
      const state = window.SF?.state;
      return state?.mode === 'menu'
        || (state?.mode === 'flight' && state?.render?.openingSubmissionPreSubmitValidation != null);
    }, null, { timeout: 90000 });
    const admission = await page.evaluate(() => {
      const validation = window.SF?.state?.render?.openingSubmissionPreSubmitValidation;
      return {
        mode: window.SF?.state?.mode || null,
        validation: validation ? {
          ok: validation.ok === true,
          reason: validation.reason || null,
          baseline: validation.baseline || null,
          current: validation.current || null,
          missing: validation.missingProgramKeys || [],
          uncaptured: validation.uncapturedProgramKeys || [],
        } : null,
      };
    });
    if (admission.mode !== 'flight' || admission.validation?.ok !== true) {
      const programs = await readOpeningProgramWitness(page);
      throw new Error(`${label}: first visible submission was not admitted; ${JSON.stringify({ admission, programs })}`);
    }
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const state = window.SF && window.SF.state;
      const readiness = window.SF?.authoredVisualReadiness?.();
      return {
        mode: state && state.mode,
        run: state && state.run ? {
          kind: state.run.kind,
          phase: state.run.phase,
          seed: state.run.seed,
          arenaId: state.run.arenaId,
        } : null,
        loading: document.querySelector('[data-screen="loading"]')?.textContent.replace(/\s+/g, ' ').trim() || null,
        authoredReadiness: readiness ? {
          pipelineReady: readiness.pipelineReady === true,
          ready: readiness.ready === true,
          playerStatus: readiness.playerStatus || null,
          flightReadyBlockers: readiness.flightReadyBlockers || [],
        } : null,
        playerVisualTrace: Array.isArray(window.__sfCruciblePlayerVisualTrace?.samples)
          ? window.__sfCruciblePlayerVisualTrace.samples.slice(-20)
          : [],
      };
    });
    const pageErrors = issues ? summarizeIssues(issues.errorIssues()) : [];
    throw new Error(`${label}: ${error.message}; live=${JSON.stringify(diagnostic)}; pageErrors=${JSON.stringify(pageErrors)}`);
  }
}

async function revealLabRuntime(page) {
  const controls = page.locator('.sf-lab-runtime');
  const telemetry = page.locator('[aria-label="Combat Lab telemetry"]');
  await controls.waitFor({ state: 'visible', timeout: 30000 });
  await telemetry.waitFor({ state: 'visible', timeout: 30000 });
  await controls.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await telemetry.evaluate((node) => node.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  await page.waitForFunction(() => {
    const intersectsViewport = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
    };
    const controlsNode = document.querySelector('.sf-lab-runtime');
    const telemetryNode = document.querySelector('[aria-label="Combat Lab telemetry"]');
    const usable = [...(controlsNode?.querySelectorAll('button') || [])]
      .filter((button) => ['Clear enemies', 'Invulnerable: off'].includes(button.getAttribute('aria-label') || button.textContent.trim()))
      .every((button) => !button.disabled && intersectsViewport(button));
    return intersectsViewport(controlsNode) && intersectsViewport(telemetryNode) && usable;
  }, null, { timeout: 30000 });
}

async function readLoadingAdmissionLatch(page) {
  await page.waitForFunction(() => window.SF?.state?.mode === 'loading', null, { timeout: 30000 });
  return page.evaluate(() => ({
    mode: window.SF?.state?.mode || null,
    postOpeningAdmissionReleased: window.SF?.registry?.get?.('render')?._postOpeningPipelineAdmissionReleased === true,
  }));
}

async function readSandboxLayoutWitness(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.screen.sf-sandbox');
    const stage = root?.querySelector(':scope > .sf-stage');
    const apron = root?.querySelector(':scope > .sf-apron');
    if (!root || !stage || !apron) return null;
    const stageChildren = [...stage.children].filter((node) => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const stageContentBottom = stageChildren.reduce(
      (bottom, node) => Math.max(bottom, node.getBoundingClientRect().bottom),
      stage.getBoundingClientRect().top,
    );
    const apronTop = apron.getBoundingClientRect().top;
    return {
      overflowY: getComputedStyle(root).overflowY,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      stageContentBottom,
      apronTop,
      contentOverlapPx: Math.max(0, stageContentBottom - apronTop),
    };
  });
}

async function beginPlayerVisualTrace(page) {
  await page.evaluate(() => {
    const samples = [];
    const sample = () => {
      const sf = window.SF;
      const state = sf?.state;
      const render = sf?.registry?.get?.('render');
      const player = state?.entities?.get?.(state.playerId);
      const rendererMesh = render?._meshes?.get?.(state?.playerId);
      const userData = player?.mesh?.userData || {};
      samples.push({
        mode: state?.mode || null,
        playerId: state?.playerId ?? null,
        playerPresent: !!player,
        playerDefId: player?.data?.defId || null,
        playerFactionId: player?.factionId || null,
        playerData: player?.data ? {
          shipId: player.data.shipId || null,
          loadoutId: player.data.loadoutId || null,
          sectorId: player.data.sectorId || null,
        } : null,
        playerAssetState: userData.authoredAssetState || null,
        playerVisualRoot: userData.authoredVisualRoot || null,
        playerFailureReason: userData.authoredFailureReason || null,
        playerFailureMessage: userData.authoredFailureMessage || null,
        playerAdmission: player?.presentationAdmission || null,
        rendererMeshPresent: !!rendererMesh,
        deferNoncritical: state?.render?.deferNoncriticalMeshStreaming === true,
        meshReconcileDirty: render?._meshReconcileDirty === true,
      });
      if (samples.length > 120) samples.shift();
    };
    window.__sfCruciblePlayerVisualTrace = { samples, sample, interval: setInterval(sample, 100) };
    sample();
  });
}

async function endPlayerVisualTrace(page) {
  return page.evaluate(() => {
    const trace = window.__sfCruciblePlayerVisualTrace;
    if (!trace) return [];
    clearInterval(trace.interval);
    trace.sample();
    delete window.__sfCruciblePlayerVisualTrace;
    return trace.samples.slice(-20);
  });
}

async function beginLabSpawnReceipt(page) {
  await page.evaluate(() => {
    const rows = [];
    const bus = window.SF?.bus;
    const unsubscribe = bus?.on?.('entity:spawned', ({ entity } = {}) => {
      if (!entity || entity.id == null || !entity.pos) return;
      rows.push({
        id: entity.id,
        pos: { x: entity.pos.x, z: entity.pos.z },
        defId: entity.data?.defId || null,
        lootTableId: entity.data?.lootTableId || null,
        level: entity.data?.level ?? null,
      });
    });
    window.__sfCrucibleLabSpawnReceipt = { rows, unsubscribe };
  });
}

async function endLabSpawnReceipt(page) {
  return page.evaluate((ownerId) => {
    const receipt = window.__sfCrucibleLabSpawnReceipt;
    if (!receipt) return [];
    if (typeof receipt.unsubscribe === 'function') receipt.unsubscribe();
    delete window.__sfCrucibleLabSpawnReceipt;
    const budget = window.SF?.ctx?.helpers?.spawnBudget;
    return receipt.rows.filter((row) => budget?.ownerForEntity?.(row.id) === ownerId);
  }, `combat-lab:${ENEMY_PACKAGE_ID}`);
}

function assertRunWitness(witness, label, { allowPaused = false } = {}) {
  assert.ok(
    witness.mode === 'flight' || (allowPaused && witness.mode === 'paused'),
    `${label}: game is ${allowPaused ? 'in flight or paused by the Lab screen' : 'in flight'}`,
  );
  assert.equal(witness.run?.kind, 'lab', `${label}: run kind is lab`);
  assert.equal(witness.run?.seed, SEED, `${label}: seed survives real game:new`);
  assert.equal(witness.run?.arenaId, ARENA_ID, `${label}: selected arena survives real game:new`);
  assert.equal(witness.sectorId, EXPECTED.sectorId, `${label}: Lab entered Lagrange sector`);
  assert.ok(witness.playerPos, `${label}: player exists`);
  assert.ok(Math.abs(witness.playerPos.x - EXPECTED.x) <= POSITION_EPSILON, `${label}: player x is authored center`);
  assert.ok(Math.abs(witness.playerPos.z - EXPECTED.z) <= POSITION_EPSILON, `${label}: player z is authored center`);
  assert.equal(witness.playerBuild?.hullId, 'ship_hornet', `${label}: selected Hornet is the active hull`);
  assert.deepEqual(witness.playerBuild?.fittings?.slice(0, 3), [
    'wpn_concussion_cannon_m',
    'wpn_gravity_marker_s',
    'wpn_momentum_sink_s',
  ], `${label}: selected Physics Toolkit is fitted through the live ship owner`);
  assert.ok(witness.owned.length > 0, `${label}: budget-owned Lab enemies materialized`);
}

function assertVisibleLabWitness(witness, label) {
  assertRunWitness(witness, label, { allowPaused: true });
  assert.equal(witness.labForm.starterId, 'physics_toolkit', `${label}: selected starter remains visible`);
  assert.equal(witness.labForm.hullId, 'ship_hornet', `${label}: selected hull remains visible`);
  assert.equal(witness.labForm.enemyPackageId, ENEMY_PACKAGE_ID, `${label}: selected enemy package remains visible`);
  assert.equal(witness.labForm.arenaId, ARENA_ID, `${label}: selected arena remains visible`);
  assert.equal(witness.labForm.seed, String(SEED), `${label}: selected seed remains visible`);
  assert.equal(witness.labForm.wave, '1', `${label}: selected starting wave remains visible`);
  assert.equal(witness.seedInput?.visible, true, `${label}: seed input is visible`);
  assert.ok(witness.seedInput.width >= 96, `${label}: seed input remains legible (${witness.seedInput.width}px)`);
  assert.equal(witness.controlsVisible, true, `${label}: Combat Lab controls are visible`);
  assert.equal(witness.telemetryVisible, true, `${label}: Combat Lab telemetry is visible`);
  assert.equal(witness.controlsInViewport, true, `${label}: Combat Lab controls are in the viewport`);
  assert.equal(witness.telemetryInViewport, true, `${label}: Combat Lab telemetry is in the viewport`);
  for (const control of ['Clear enemies', 'Invulnerable: off']) {
    const button = witness.runtimeControls.find((entry) => entry.label === control);
    assert.ok(button, `${label}: ${control} control is mounted`);
    assert.equal(button.disabled, false, `${label}: ${control} control is usable after reopening`);
    assert.equal(button.inViewport, true, `${label}: ${control} control is in the viewport`);
  }
}

async function reopenLabFromPause(page) {
  await page.keyboard.press('P');
  await page.locator('[data-screen="pause"]').waitFor({ state: 'visible', timeout: 30000 });
  await clickExact(page, 'Sandbox', page.locator('[data-screen="pause"]'));
  await page.locator('#sf-sandbox-lab-arena').waitFor({ state: 'visible', timeout: 30000 });
}

function spawnReceiptDigest(receipt) {
  return JSON.stringify({
    owned: receipt
      .map(({ defId, lootTableId, level, pos }) => ({ defId, lootTableId, level, pos }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

async function closeBrowserWithinDeadline(instance) {
  if (!instance) return;
  await Promise.race([
    instance.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, BROWSER_CLOSE_TIMEOUT_MS)),
  ]);
}

async function openBrowserRoute() {
  server = await startServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
    } catch { /* browser storage unavailable */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return page;
}

async function openElectronRoute() {
  if (!electron) throw new Error('this Playwright build has no _electron; cannot drive the desktop route');
  isolatedElectronLaunch = createIsolatedElectronLaunch({
    root: ROOT,
    taskId: 'crucible-lab-route',
    timeout: 180000,
    baseEnv: { ...process.env, SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' },
  });
  electronApp = await electron.launch(isolatedElectronLaunch.options);
  const page = await electronApp.firstWindow({ timeout: 180000 });
  installCspSafePlaywrightPolling(page);
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    win.setContentSize(1440, 900);
    win.show();
    win.focus();
    if (win.moveTop) win.moveTop();
  });
  await page.bringToFront().catch(() => {});
  await page.waitForLoadState('domcontentloaded', { timeout: 180000 });
  assertIsolatedElectronRootUrl(page.url());
  return page;
}

try {
  console.log(`\nCrucible Lab ${RUNTIME_LABEL} route\n`);
  const page = ELECTRON_ROUTE ? await openElectronRoute() : await openBrowserRoute();
  const issues = collectPageIssues(page);

  phase = 'BOOT';
  console.log('  phase=BOOT navigating normal game root');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 90000 });
  if (ELECTRON_ROUTE) {
    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      await page.keyboard.press('Space');
      await splash.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
  }
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 90000 });
  record(phase, true, `normal ${RUNTIME_LABEL.toLowerCase()} game root reached with isolated player store`);

  phase = 'SANDBOX';
  await clickExact(page, 'Sandbox');
  await page.locator('#sf-sandbox-lab-arena').waitFor({ state: 'visible', timeout: 30000 });
  record(phase, true, 'actual main-menu Sandbox control opened the Combat Lab form');

  phase = 'CONFIGURE';
  console.log('  phase=CONFIGURE selecting starter package');
  await selectViaVisibleWidget(page, '#sf-sandbox-lab-starter', 'physics_toolkit');
  console.log('  phase=CONFIGURE selecting enemy package');
  await selectViaVisibleWidget(page, '#sf-sandbox-lab-enemy', ENEMY_PACKAGE_ID);
  console.log('  phase=CONFIGURE selecting arena');
  await selectViaVisibleWidget(page, '#sf-sandbox-lab-arena', ARENA_ID);
  await page.locator('#sf-sandbox-lab-seed').fill(String(SEED));
  await page.locator('#sf-sandbox-lab-wave').fill('1');
  await page.waitForFunction(() => {
    const launch = [...document.querySelectorAll('.sf-sandbox-lab-actions button')]
      .find((button) => button.textContent.trim() === 'Launch');
    return !!launch && !launch.disabled;
  }, null, { timeout: 10000 });
  await page.locator('#sf-sandbox-lab-seed').scrollIntoViewIfNeeded();
  const layout = await readSandboxLayoutWitness(page);
  assert.ok(layout, 'Sandbox stage/apron layout witness is available');
  assert.ok(layout.contentOverlapPx <= 1,
    `Sandbox stage content must not paint under its apron (${layout.contentOverlapPx}px overlap)`);
  assert.match(layout.overflowY, /auto|scroll/, 'long Sandbox chassis owns a real vertical scroll route');
  await page.screenshot({
    path: (() => {
      const dir = join(ROOT, '.devshots', 'crucible-lab-route');
      mkdirSync(dir, { recursive: true });
      return join(dir, `lagrange-config${SCREENSHOT_SUFFIX}.png`);
    })(),
    fullPage: false,
  });
  record(phase, true, `${ARENA_ID} · ${ENEMY_PACKAGE_ID} · seed ${SEED}`);

  phase = 'LAUNCH';
  const actions = page.locator('.sf-sandbox-lab-actions');
  await beginLabSpawnReceipt(page);
  await clickExact(page, 'Launch', actions, { noWaitAfter: true });
  await waitForLabFlight(page, 'launch', issues);
  const firstSpawnReceipt = await endLabSpawnReceipt(page);
  const first = await readLiveWitness(page);
  assertRunWitness(first, 'launch');
  assert.equal(firstSpawnReceipt.length, first.owned.length,
    'launch receipt records every budget-owned enemy at materialization before simulation movement');
  record(phase, true, `${first.owned.length} owned enemies · ${first.sectorId} · (${first.playerPos.x}, ${first.playerPos.z})`);

  phase = 'REOPEN';
  await reopenLabFromPause(page);
  await revealLabRuntime(page);
  const firstVisible = await readLiveWitness(page);
  assertVisibleLabWitness(firstVisible, 'reopened Lab');
  const firstSpawnDigest = spawnReceiptDigest(firstSpawnReceipt);
  await page.screenshot({
    path: (() => {
      const dir = join(ROOT, '.devshots', 'crucible-lab-route');
      mkdirSync(dir, { recursive: true });
      return join(dir, `lagrange-lab${SCREENSHOT_SUFFIX}.png`);
    })(),
    fullPage: false,
  });
  assert.match(firstVisible.telemetryText, /Live hostiles/i, 'telemetry surface identifies its hostile row');
  record(phase, true, 'reopened Lab controls and telemetry are visibly mounted');

  phase = 'RELAUNCH';
  await beginLabSpawnReceipt(page);
  await clickExact(page, 'Relaunch same seed', page.locator('.sf-sandbox-lab-actions'), { noWaitAfter: true });
  await beginPlayerVisualTrace(page);
  const relaunchLoading = await readLoadingAdmissionLatch(page);
  assert.equal(relaunchLoading.postOpeningAdmissionReleased, false,
    'second loading transition resets the post-opening pipeline admission latch before the exact census');
  await waitForLabFlight(page, 'relaunch', issues);
  await endPlayerVisualTrace(page);
  const secondSpawnReceipt = await endLabSpawnReceipt(page);
  record(phase, true, 'actual Relaunch same seed re-entered the real game:new path');

  phase = 'REOPEN-2';
  await reopenLabFromPause(page);
  await revealLabRuntime(page);
  const secondVisible = await readLiveWitness(page);
  assertVisibleLabWitness(secondVisible, 'reopened relaunch Lab');
  assert.equal(secondSpawnReceipt.length, secondVisible.owned.length,
    'relaunch receipt records every budget-owned enemy at materialization before simulation movement');
  assert.equal(spawnReceiptDigest(secondSpawnReceipt), firstSpawnDigest,
    'actual Relaunch same seed reproduces the deterministic owned-enemy materialization receipt');
  record(phase, true, 'reopened controls remain usable after the real Relaunch path');

  phase = 'CLEAN';
  const errors = issues.errorIssues();
  assert.deepEqual(errors, [], `page errors: ${JSON.stringify(summarizeIssues(errors))}`);
  record(phase, true, 'no page errors or failed requests');
  console.log(`\nCRUCIBLE LAB ${RUNTIME_LABEL.toUpperCase()} ROUTE PASS`);
} catch (error) {
  record(phase, false, error && error.message ? error.message : String(error));
  console.log(`\nCRUCIBLE LAB ${RUNTIME_LABEL.toUpperCase()} ROUTE FAIL`);
  process.exitCode = 1;
} finally {
  await closeBrowserWithinDeadline(browser);
  if (server) server.kill();
  if (electronApp) {
    await electronApp.close().catch(() => {});
    try { isolatedElectronLaunch?.cleanup({ runtimeClosed: true }); } catch { /* preserve profile if cleanup proof fails */ }
  }
  try { rmSync(PLAYER_STORE_DIR, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
}
