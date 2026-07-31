#!/usr/bin/env node
// PQ-023 H1 — Electron semantic parity after the Browser motion cell passes.
//
// Browser owns the reviewable motion reel. Electron replays the same flak/autocannon profile read and
// asteroidSites-owned Cathedral recovery/failure sequence, captures representative normal/reduced
// states, and compares only normalized cue semantics. Runtime ids and time-valued metadata are absent.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { PQ023_CORRIDOR_CUES_FIXED_SEED } from './validation-manifests/pq023-corridor-cues.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_ROOT = path.join(ROOT, '.devshots', 'pq023-corridor-cues');
const ELECTRON_DIR = path.join(OUT_ROOT, 'electron');
const BROWSER_REPORT_PATH = path.join(OUT_ROOT, 'report.json');
const RECEIPT_PATH = path.join(ELECTRON_DIR, 'route-receipt.json');

if (!existsSync(BROWSER_REPORT_PATH)) {
  console.error('[pq023-corridor-cues/electron] Browser report missing; run the broker cell first');
  process.exit(2);
}
const browserReport = JSON.parse(await readFile(BROWSER_REPORT_PATH, 'utf8'));
if (browserReport.ok !== true || !browserReport.pq023H1?.semanticProjection) {
  console.error('[pq023-corridor-cues/electron] Browser motion cell did not pass; Electron will not launch');
  process.exit(2);
}

await mkdir(ELECTRON_DIR, { recursive: true });

let app = null;
let childProcess = null;
let page = null;
let launch = null;
let canonicalUrlTracker = null;
let processMonitor = null;
let rootUrl = null;
let issueTracker = null;
let receipt = null;
const screenshots = [];

try {
  const { _electron: electron } = await loadPlaywright();
  launch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'pq023-corridor-cues' });
  app = await electron.launch(launch.options);
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  page = await app.firstWindow({ timeout: 90_000 });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  rootUrl = assertIsolatedElectronRootUrl(await canonicalUrlTracker.waitForCanonicalRoot(10_000));
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  issueTracker = collectPageIssues(page, { includeWarnings: false });

  await bootSeededFlight(page, rootUrl, PQ023_CORRIDOR_CUES_FIXED_SEED);
  const gpu = await readGpuContract(page);
  assert.equal(gpu.available, true, 'PQ-023 Electron parity requires WebGL');
  assert.doesNotMatch(gpu.renderer || '', /SwiftShader|llvmpipe|software/i,
    `PQ-023 Electron parity requires a real GPU path, got ${gpu.renderer}`);
  await installCueObservers(page);

  const impactProfiles = await readImpactProfiles(page);
  assert.notEqual(impactProfiles.flak.mode, impactProfiles.autocannon.mode);

  await page.evaluate(() => {
    window.SF.registry.get('world').enterSector('sector_ceres_belt', {
      fromJump: true,
      via: 'gate',
      fromSectorId: 'sector_helios_prime',
    });
  });
  await waitForCathedralRoot(page, 'failed');
  await approachCathedral(page);
  const initial = await waitForCathedralState(page, 'failed');
  await frameCathedral(page);

  const transitions = [];
  await setAccessibility(page, false);
  transitions.push({ kind: 'recovery', reduced: false, owner: await recoverCathedral(page) });
  await waitForCathedralState(page, 'stabilized');
  await frameCathedral(page);
  screenshots.push(await capturePng(page, '01-recovery-normal.png'));

  transitions.push({ kind: 'damage', reduced: false, owner: await damageCathedral(page) });
  await waitForCathedralState(page, 'failed');
  await frameCathedral(page);
  screenshots.push(await capturePng(page, '02-damage-normal.png'));

  await setAccessibility(page, true);
  transitions.push({ kind: 'recovery', reduced: true, owner: await recoverCathedral(page) });
  await waitForCathedralState(page, 'stabilized');
  await frameCathedral(page);
  screenshots.push(await capturePng(page, '03-recovery-reduced.png'));

  transitions.push({ kind: 'damage', reduced: true, owner: await damageCathedral(page) });
  await waitForCathedralState(page, 'failed');
  await frameCathedral(page);
  screenshots.push(await capturePng(page, '04-damage-reduced.png'));

  const reducedFrames = [];
  for (let index = 0; index < 3; index += 1) {
    await page.waitForTimeout(180);
    reducedFrames.push(await readFixtureSignature(page));
  }
  assert.equal(new Set(reducedFrames.map((row) => JSON.stringify(row))).size, 1,
    'Electron reduced Cathedral damage must hold a steady fixture state');

  const cueEvents = await page.evaluate(() => (
    window.__pq023H1CueEvents || []
  ).filter((row) => String(row.id || '').startsWith('world_site.')));
  const worldSiteCueIds = cueEvents
    .filter((row) => row.event === 'presentation:cue')
    .map((row) => row.id);
  const captions = cueEvents
    .filter((row) => row.event === 'presentation:caption')
    .map((row) => ({
      id: row.id,
      text: row.text,
      shape: row.shape,
      assertive: row.assertive,
      reducedMotion: row.reducedMotion,
      flashReduced: row.flashReduced,
    }));

  const semanticProjection = buildSemanticProjection({
    impactProfiles,
    worldSiteCueIds,
    captions,
    transitions,
  });
  assert.deepEqual(semanticProjection, browserReport.pq023H1.semanticProjection,
    'Electron must match the Browser PQ-023 cue semantics');

  const pageIssues = summarizeIssues(issueTracker.errorIssues());
  assert.deepEqual(pageIssues, [], 'Electron cue parity emitted page issues');
  receipt = {
    schema: 'spaceface.pq023-corridor-cues-electron.v1',
    disposition: 'PASS',
    runtime: 'electron',
    fixedSeed: PQ023_CORRIDOR_CUES_FIXED_SEED,
    gpu,
    semanticProjection,
    crossRuntimeParity: {
      pass: true,
      comparedAgainst: '.devshots/pq023-corridor-cues/report.json',
    },
    screenshots,
    pageIssues,
    informational_contended: true,
    informational_contended_note:
      'Phase H1 ran contended by design. This receipt contains functional cue identity, accessibility, fixture-state, and screenshot evidence only. No time-valued field is performance evidence. Matched performance remains Phase H3.',
    noPerformanceEvidence: true,
  };
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({
      path: path.join(ELECTRON_DIR, 'failure-row6-electron.png'),
      type: 'png',
      animations: 'allow',
    }).catch(() => {});
  }
  receipt = {
    schema: 'spaceface.pq023-corridor-cues-electron.v1',
    disposition: 'FAIL',
    failureClass: 'UNCLASSIFIED_BY_PROBE',
    runtime: 'electron',
    fixedSeed: PQ023_CORRIDOR_CUES_FIXED_SEED,
    problems: [error?.message || String(error)],
    stack: error?.stack || null,
    screenshots,
    pageIssues: issueTracker ? summarizeIssues(issueTracker.errorIssues()) : [],
    informational_contended: true,
    informational_contended_note:
      'Phase H1 ran contended by design. Process and wait durations are diagnostic only and are not performance evidence. Matched performance remains Phase H3.',
    noPerformanceEvidence: true,
  };
} finally {
  let cleanupReport = null;
  try {
    cleanupReport = await closeOwnedElectronRuntime({
      page,
      electronApp: app,
      childProcess,
      canonicalUrlTracker,
      processMonitor,
      rootUrl,
    });
  } catch (error) {
    cleanupReport = { pass: false, failures: [error?.message || String(error)] };
  }
  if (cleanupReport?.pass !== true) {
    receipt ||= {
      schema: 'spaceface.pq023-corridor-cues-electron.v1',
      disposition: 'FAIL',
      problems: [],
      noPerformanceEvidence: true,
    };
    receipt.disposition = 'FAIL';
    receipt.failureClass ||= 'UNCLASSIFIED_BY_PROBE';
    receipt.problems ||= [];
    receipt.problems.push(`owned Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ')}`);
    receipt.ownedRuntimeClosed = false;
  } else {
    receipt.ownedRuntimeClosed = true;
  }
  if (launch && cleanupReport?.pass === true) {
    try { launch.cleanup({ runtimeClosed: true }); }
    catch (error) {
      receipt.disposition = 'FAIL';
      receipt.failureClass ||= 'UNCLASSIFIED_BY_PROBE';
      receipt.problems ||= [];
      receipt.problems.push(`isolated profile cleanup failed: ${error?.message || String(error)}`);
    }
  }
}

await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
if (receipt.disposition !== 'PASS') {
  console.error('[pq023-corridor-cues/electron] FAIL');
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('[pq023-corridor-cues/electron] PASS — cue semantics match Browser');
console.log('  receipt: .devshots/pq023-corridor-cues/electron/route-receipt.json');

async function bootSeededFlight(targetPage, canonicalRoot, seed) {
  await targetPage.goto(canonicalRoot, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await targetPage.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.ctx), null,
    { timeout: 60_000 });
  const splash = targetPage.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await targetPage.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
  await targetPage.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 30_000 });
  await targetPage.getByRole('button', { name: 'New Game', exact: true }).click();
  await targetPage.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 20_000 });
  await targetPage.fill('#sf-ng-seed', String(seed));
  await targetPage.getByRole('button', { name: 'Launch', exact: true }).click();
  await targetPage.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight' && player?.alive !== false && Number(player?.hull) > 0;
  }, null, { timeout: 120_000 });
  const begin = targetPage.getByRole('button', { name: /^Begin$/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click();
  assert.equal(await targetPage.evaluate(() => window.SF.state.meta?.seed), seed);
}

async function readGpuContract(targetPage) {
  return targetPage.evaluate(() => {
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

async function installCueObservers(targetPage) {
  await targetPage.evaluate(() => {
    window.__pq023H1CueEvents = [];
    const retain = (event, payload = {}) => window.__pq023H1CueEvents.push({
      event,
      id: payload.id || null,
      text: payload.text || null,
      shape: payload.shape || null,
      assertive: payload.assertive === true,
      reducedMotion: payload.reducedMotion === true,
      flashReduced: payload.flashReduced === true,
    });
    for (const event of ['presentation:cue', 'presentation:caption']) {
      window.SF.bus.on(event, (payload) => retain(event, payload || {}));
    }
  });
}

async function readImpactProfiles(targetPage) {
  return targetPage.evaluate(async () => {
    const { resolveImpactPresentationProfile } = await import('/src/render/vfxProfiles.js');
    const pick = (weaponId) => {
      const value = resolveImpactPresentationProfile(weaponId);
      return {
        weaponId,
        family: value.family,
        variant: value.variant || null,
        mode: value.mode,
        primaryShape: value.primaryShape,
        fragmentCount: value.fragmentCount,
        lightPeak: value.lightPeak,
      };
    };
    return { autocannon: pick('wpn_autocannon_m'), flak: pick('wpn_flak_turret_s') };
  });
}

async function waitForCathedralRoot(targetPage, status) {
  const handle = await targetPage.waitForFunction((expected) => {
    const sf = window.SF;
    const record = sf?.state?.sites?.worldById?.world_site_wreck_cathedral;
    const root = sf?.state?.entityList?.find((entity) => entity?.alive !== false
      && entity.data?.worldSiteId === 'world_site_wreck_cathedral'
      && entity.data?.role === 'world_site_root');
    if (record?.components?.cathedral_hull?.status !== expected || !root?.pos) return false;
    return {
      rootId: root.id,
      status: expected,
      stageId: record.stageId,
      presentationAdmission: root.presentationAdmission || null,
    };
  }, status, { timeout: 30_000 });
  return handle.jsonValue();
}

async function waitForCathedralState(targetPage, status) {
  const handle = await targetPage.waitForFunction((expected) => {
    const sf = window.SF;
    const record = sf?.state?.sites?.worldById?.world_site_wreck_cathedral;
    const root = sf?.state?.entityList?.find((entity) => entity?.alive !== false
      && entity.data?.worldSiteId === 'world_site_wreck_cathedral'
      && entity.data?.role === 'world_site_root');
    if (record?.components?.cathedral_hull?.status !== expected
      || root?.presentationAdmission !== 'ready'
      || !String(root?.mesh?.userData?.authoredAssetState || '').startsWith('authored')) return false;
    return { rootId: root.id, status: expected, stageId: record.stageId };
  }, status, { timeout: 120_000 });
  return handle.jsonValue();
}

async function approachCathedral(targetPage) {
  await targetPage.evaluate(async () => {
    const {
      findLivePq023CathedralRoot,
      pq023CathedralApproachPose,
    } = await import('/scripts/lib/pq023CathedralFraming.mjs');
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = findLivePq023CathedralRoot(state);
    const pose = pq023CathedralApproachPose(target);
    if (!player || !target || !pose) throw new Error('Cathedral approach subject is unavailable');
    if (typeof player.pos.set === 'function') player.pos.set(pose.x, 0, pose.z);
    else { player.pos.x = pose.x; player.pos.z = pose.z; }
    player.prevPos?.copy?.(player.pos);
    player.vel?.set?.(0, 0, 0);
    player.rot = 0;
    player.prevRot = 0;
    state.camera.zoom = pose.zoom;
    window.SF.bus.emit('camera:zoom', { level: state.camera.zoom });
    state.render?.cameraCtrl?.snapToPlayer?.();
    await new Promise((resolve) => setTimeout(resolve, 650));
  });
}

async function frameCathedral(targetPage) {
  await targetPage.evaluate(async () => {
    const {
      findLivePq023CathedralRoot,
      pq023CathedralApproachPose,
    } = await import('/scripts/lib/pq023CathedralFraming.mjs');
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = findLivePq023CathedralRoot(state);
    const pose = pq023CathedralApproachPose(target);
    if (!player || !target?.mesh || !pose) throw new Error('Cathedral framing subject is unavailable');
    if (typeof player.pos.set === 'function') player.pos.set(pose.x, 0, pose.z);
    else { player.pos.x = pose.x; player.pos.z = pose.z; }
    player.prevPos?.copy?.(player.pos);
    player.vel?.set?.(0, 0, 0);
    player.rot = 0;
    player.prevRot = 0;
    state.camera.zoom = pose.zoom;
    window.SF.bus.emit('camera:zoom', { level: state.camera.zoom });
    state.render?.cameraCtrl?.snapToPlayer?.();
    await new Promise((resolve) => setTimeout(resolve, 950));
  });
}

async function setAccessibility(targetPage, reduced) {
  await targetPage.evaluate(async (enabled) => {
    const { setPq023AccessibilityPreference } = await import('/scripts/lib/pq023Accessibility.mjs');
    const state = window.SF.state;
    setPq023AccessibilityPreference(state.settings, enabled);
    window.SF.bus.emit('settings:changed', { section: 'video', key: null });
    window.SF.bus.emit('settings:changed', { section: 'accessibility', key: null });
  }, reduced);
}

async function recoverCathedral(targetPage) {
  return targetPage.evaluate(() => {
    const sf = window.SF;
    window.__pq023WorldSiteSequence = (window.__pq023WorldSiteSequence || 9000) + 1;
    const result = sf.registry.get('asteroidSites').applyWorldSiteBeamOperation({
      siteId: 'world_site_wreck_cathedral',
      componentId: 'cathedral_hull',
      verb: 'repair',
      amount: 48,
      requestStreamId: 'player-industrial-beam',
      requestSequence: window.__pq023WorldSiteSequence,
      tick: sf.state.tick,
    });
    return {
      status: result.record?.components?.cathedral_hull?.status || null,
      stageId: result.record?.stageId || null,
    };
  });
}

async function damageCathedral(targetPage) {
  return targetPage.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const component = state.entityList.find((entity) => entity?.alive !== false
      && entity.data?.worldSiteId === 'world_site_wreck_cathedral'
      && (entity.data?.worldSiteImpactComponentId === 'cathedral_hull'
        || entity.data?.worldSiteComponentId === 'cathedral_hull'));
    if (!component) throw new Error('Cathedral hull impact entity missing');
    sf.bus.emit('physics:impact', { aId: state.playerId, bId: component.id, dp: 240, tick: state.tick });
    const record = state.sites.worldById.world_site_wreck_cathedral;
    return {
      status: record.components.cathedral_hull.status,
      stageId: record.stageId,
    };
  });
}

async function readFixtureSignature(targetPage) {
  return targetPage.evaluate(() => {
    const root = window.SF.state.entityList.find((entity) => entity?.alive !== false
      && entity.data?.worldSiteId === 'world_site_wreck_cathedral'
      && entity.data?.role === 'world_site_root');
    const fixtures = [];
    root?.mesh?.traverse?.((object) => {
      const id = object.userData?.worldSitePresentationFixtureId;
      if (!id || !object.material) return;
      fixtures.push([
        id,
        Number(object.material.opacity.toFixed(6)),
        Number((object.parent?.scale?.x || 0).toFixed(6)),
      ]);
    });
    return fixtures.sort((a, b) => a[0].localeCompare(b[0]));
  });
}

function buildSemanticProjection({ impactProfiles, worldSiteCueIds, captions, transitions }) {
  return {
    schema: 'spaceface.pq023-cue-semantic-projection.v1',
    impactProfiles,
    worldSiteCueIds,
    captions,
    transitions: transitions.map((row) => ({
      kind: row.kind,
      reduced: row.reduced,
      status: row.owner.status,
      stageId: row.owner.stageId,
    })),
    reducedDamageSteady: true,
  };
}

async function capturePng(targetPage, name) {
  const file = path.join(ELECTRON_DIR, name);
  await targetPage.screenshot({ path: file, type: 'png', animations: 'allow' });
  const [info, bytes] = await Promise.all([stat(file), readFile(file)]);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return {
    path: path.relative(ROOT, file).replace(/\\/g, '/'),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
