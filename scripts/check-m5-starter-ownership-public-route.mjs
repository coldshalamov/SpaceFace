#!/usr/bin/env node
// M5 starter ownership — primary Browser acceptance route.
//
// Canonical public route under test:
//   title New Game -> visible starter-role briefing -> F5 -> Pause -> Main Menu -> Continue.
//
// This route grants nothing, emits no gameplay event, writes no state, and teleports nothing.
// page.evaluate is observation-only: it reads the live game and subscribes to public receipts.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, '.devshots', 'alpha', 'm5-starter-ownership-public-route');
const RECEIPT = resolve(OUT_DIR, 'evidence.json');
const SHOTS = Object.freeze({
  newGameRole: resolve(OUT_DIR, '01-new-game-starter-role.png'),
  publicPauseRoute: resolve(OUT_DIR, '02-public-pause-main-menu-route.png'),
  continuedRole: resolve(OUT_DIR, '03-continued-starter-role.png'),
});

let browser = null;
let server = null;

try {
  await mkdir(OUT_DIR, { recursive: true });
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert.equal(new URL(page.url()).search, '', 'primary M5 route must use the canonical root URL');
  await waitForSf(page);
  await installObservation(page);

  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('#sf-ng-pilot-name').fill('M5 Starter Pilot');
  await page.locator('#sf-ng-difficulty').selectOption('casual');
  await page.getByRole('button', { name: 'Launch', exact: true }).click();

  await waitForRole(page, { source: 'new_game', visible: true });
  const newGame = await starterSnapshot(page, 'new_game');
  assertStarterOwnership(newGame, 'New Game');
  assert.match(newGame.visibleRoleToast, /Hitch active.*Starter Scout/i);
  assert.match(newGame.visibleRoleToast, /Mine, tow, or fight without changing hulls/i);
  assert.match(newGame.flightRoleReadout, /Hitch.*Starter/i);
  await page.screenshot({ path: SHOTS.newGameRole });

  await quickSave(page);
  await openPause(page);
  await page.screenshot({ path: SHOTS.publicPauseRoute });
  await returnToMainMenu(page);
  await publicContinue(page);

  const continued = await starterSnapshot(page, 'continued');
  assertStarterOwnership(continued, 'Continue');
  assert.match(continued.visibleRoleToast, /Hitch active.*Starter Scout/i);
  assert.match(continued.flightRoleReadout, /Hitch.*Starter/i);
  await page.screenshot({ path: SHOTS.continuedRole });

  const events = await observedEvents(page);
  const roleEvents = events.filter((event) => event.type === 'ship:roleContext');
  assert.ok(roleEvents.some((event) => event.payload?.source === 'new_game'
    && event.payload?.defId === 'ship_kestrel'));
  assert.ok(roleEvents.some((event) => event.payload?.source === 'save_loaded'
    && event.payload?.defId === 'ship_kestrel'));
  assert.ok(events.some((event) => event.type === 'save:completed'));
  assert.ok(events.some((event) => event.type === 'save:loaded'));
  assert.deepEqual(issues.errorIssues(), [], 'primary M5 route emitted page errors');

  const screenshots = {};
  for (const [key, path] of Object.entries(SHOTS)) screenshots[key] = await mediaReceipt(path);

  const report = {
    schema: 'spaceface.m5StarterOwnershipPublicRoute.v1',
    generatedAt: new Date().toISOString(),
    route: 'canonical root -> New Game -> Casual -> Launch -> F5 -> Pause -> Main Menu -> Continue',
    url: server.baseUrl,
    canonicalRoot: new URL(page.url()).search === '',
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    evidenceClassification: {
      primaryAcceptance: true,
      injectedState: false,
      setupWrites: 0,
      directStateWrites: 0,
      directEventEmits: 0,
      teleports: 0,
      hiddenHelpers: 0,
      observationOnlyEvaluate: true,
    },
    publicAcceptance: {
      actions: ['New Game', 'Casual', 'Launch', 'F5', 'Escape', 'Main Menu', 'Confirm Main Menu', 'Continue'],
      starterRoleVisibleOnNewGame: true,
      starterRoleVisibleAfterContinue: true,
      starterOwnershipPreserved: true,
      activeShipPreserved: true,
      saveCompleted: true,
      saveLoaded: true,
    },
    stages: { newGame, continued },
    screenshots,
    roleEvents,
    pageIssues: issues.errorIssues(),
    browserVersion: await browser.version(),
  };

  await writeFile(RECEIPT, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`M5 primary starter ownership public route PASS\n${JSON.stringify({
    receipt: relativePath(RECEIPT),
    screenshots: Object.fromEntries(Object.entries(SHOTS).map(([key, path]) => [key, relativePath(path)])),
    activeAfterContinue: continued.activeDefId,
    ownedAfterContinue: continued.ownedDefIds,
    pageErrors: report.pageIssues.length,
  }, null, 2)}\n`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await stopOwnedServer(server).catch(() => {});
}

async function waitForSf(page) {
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus && window.SF?.registry,
    null, { timeout: 30_000 });
}

async function installObservation(page) {
  await page.evaluate(() => {
    window.__m5StarterRouteEvents = [];
    for (const type of ['ship:roleContext', 'toast', 'save:completed', 'save:loaded']) {
      window.SF.bus.on(type, (payload) => window.__m5StarterRouteEvents.push({
        type,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
        mode: window.SF.state.mode,
        docked: !!window.SF.state.ui?.docked,
        atMs: performance.now(),
      }));
    }
  });
}

async function waitForRole(page, { source, visible }) {
  await page.waitForFunction(({ wantedSource, needsVisible }) => {
    const state = window.SF?.state;
    if (!state || state.mode !== 'flight' || state.ui?.docked) return false;
    const active = state.player?.ownedShips?.[state.player.activeShipIndex]?.defId;
    if (active !== 'ship_kestrel') return false;
    const matching = (window.__m5StarterRouteEvents || []).some((event) =>
      event.type === 'ship:roleContext'
      && event.payload?.defId === 'ship_kestrel'
      && event.payload?.source === wantedSource);
    if (!matching || !needsVisible) return matching;
    const root = document.querySelector('#toasts');
    const text = [...document.querySelectorAll('.sf-toast')]
      .map((node) => (node.textContent || '').trim())
      .find((value) => value.includes('Hitch active'));
    return !!text && (!root || Number.parseFloat(getComputedStyle(root).opacity || '1') > 0.5);
  }, { wantedSource: source, needsVisible: visible }, { timeout: 90_000 });
}

async function starterSnapshot(page, label) {
  return page.evaluate((stageLabel) => {
    const state = window.SF.state;
    const active = state.player?.ownedShips?.[state.player.activeShipIndex] || null;
    const player = state.entities?.get?.(state.playerId) || null;
    const toastsRoot = document.querySelector('#toasts');
    const toastsVisible = !toastsRoot || Number.parseFloat(getComputedStyle(toastsRoot).opacity || '1') > 0.5;
    const roleToasts = [...document.querySelectorAll('.sf-toast')]
      .map((node) => (node.textContent || '').trim())
      .filter((text) => / active · /.test(text));
    const hud = document.querySelector('#hud');
    return {
      label: stageLabel,
      mode: state.mode,
      docked: !!state.ui?.docked,
      activeShipIndex: state.player?.activeShipIndex,
      activeDefId: active?.defId || null,
      ownedDefIds: (state.player?.ownedShips || []).map((ship) => ship.defId),
      playerId: state.playerId,
      playerPosition: player?.pos ? { x: Number(player.pos.x), z: Number(player.pos.z) } : null,
      visibleRoleToast: toastsVisible ? (roleToasts[0] || '') : '',
      rawRoleToasts: roleToasts,
      flightRoleReadout: hud && getComputedStyle(hud).opacity !== '0'
        ? (hud.textContent || '').replace(/\s+/g, ' ').trim()
        : '',
      pendingRoleBriefingSource: window.SF.registry.get('presentationAdapters')?.inspect?.().pendingRoleBriefingSource || null,
    };
  }, label);
}

function assertStarterOwnership(snapshot, stage) {
  assert.equal(snapshot.mode, 'flight', `${stage} must reach playable flight`);
  assert.equal(snapshot.docked, false, `${stage} must remain on the ordinary flight route`);
  assert.equal(snapshot.activeShipIndex, 0, `${stage} must retain the starter slot`);
  assert.equal(snapshot.activeDefId, 'ship_kestrel', `${stage} must retain the starter hull`);
  assert.deepEqual(snapshot.ownedDefIds, ['ship_kestrel'], `${stage} must not gain an injected hull`);
  assert.ok(Number.isFinite(snapshot.playerPosition?.x) && Number.isFinite(snapshot.playerPosition?.z),
    `${stage} must expose a physical player position`);
}

async function quickSave(page) {
  const before = (await observedEvents(page)).filter((event) => event.type === 'save:completed').length;
  await page.keyboard.press('F5');
  await page.waitForFunction((previous) => {
    const state = window.SF?.state;
    const active = state?.player?.ownedShips?.[state.player.activeShipIndex]?.defId;
    const completed = (window.__m5StarterRouteEvents || []).filter((event) => event.type === 'save:completed').length;
    return active === 'ship_kestrel' && completed > previous && !!localStorage.getItem('sf.save.quick');
  }, before, { timeout: 60_000 });
}

async function openPause(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Main Menu', exact: true }).first()
    .waitFor({ state: 'visible', timeout: 10_000 });
}

async function returnToMainMenu(page) {
  const menuButtons = page.getByRole('button', { name: 'Main Menu', exact: true });
  await menuButtons.first().click();
  await menuButtons.last().waitFor({ state: 'visible', timeout: 10_000 });
  await menuButtons.last().click();
  await page.waitForFunction(() => window.SF?.state?.mode === 'menu', null, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor({ state: 'visible' });
}

async function publicContinue(page) {
  const prior = (await observedEvents(page)).filter((event) =>
    event.type === 'ship:roleContext'
    && event.payload?.defId === 'ship_kestrel'
    && event.payload?.source === 'save_loaded').length;
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await page.waitForFunction(() => {
    const candidate = [...document.querySelectorAll('button')]
      .find((node) => node.textContent?.trim() === 'Continue');
    return !!candidate && !candidate.disabled;
  }, null, { timeout: 20_000 });
  await button.click();
  await page.waitForFunction((previous) => {
    const state = window.SF?.state;
    const active = state?.player?.ownedShips?.[state.player.activeShipIndex]?.defId;
    const matching = (window.__m5StarterRouteEvents || []).filter((event) =>
      event.type === 'ship:roleContext'
      && event.payload?.defId === 'ship_kestrel'
      && event.payload?.source === 'save_loaded').length;
    const root = document.querySelector('#toasts');
    const toast = [...document.querySelectorAll('.sf-toast')]
      .some((node) => (node.textContent || '').includes('Hitch active'));
    return state?.mode === 'flight' && !state.ui?.docked && active === 'ship_kestrel'
      && matching > previous && toast
      && (!root || Number.parseFloat(getComputedStyle(root).opacity || '1') > 0.5);
  }, prior, { timeout: 90_000 });
}

async function observedEvents(page) {
  return page.evaluate(() => window.__m5StarterRouteEvents || []);
}

async function mediaReceipt(path) {
  const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
  return {
    path: relativePath(path),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: 1440,
    height: 900,
  };
}

function relativePath(path) {
  return path.slice(ROOT.length + 1).replaceAll('\\', '/');
}

async function startServer() {
  for (let port = 8840; port < 8910; port++) {
    if (!(await isPortFree(port))) continue;
    const child = spawn(process.execPath, ['server.js', String(port)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    const baseUrl = `http://127.0.0.1:${port}/`;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode != null) throw new Error(`M5 starter server exited early\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok) return { child, baseUrl };
      } catch {}
      await new Promise((done) => setTimeout(done, 100));
    }
    child.kill();
  }
  throw new Error('No free M5 starter Browser proof port');
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
    throw new Error(`owned M5 starter server route remained reachable: ${baseUrl}`);
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
