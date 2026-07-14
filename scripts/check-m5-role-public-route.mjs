#!/usr/bin/env node
// M5 visible second-hull role transition — supporting Browser route.
//
// This route grants the multi-hour second-hull precondition through the ships authority and emits
// dock arrival before exercising public Shipworks, Undock, save, and Continue controls. It is useful
// supporting evidence, but injected setup means it can never be primary public acceptance.

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
const OUT_DIR = resolve(ROOT, '.devshots', 'alpha', 'm5-role-public-route-v2');
const RECEIPT = resolve(OUT_DIR, 'evidence.json');
const SHOTS = Object.freeze({
  newGame: resolve(OUT_DIR, '01-new-game-starter-role.png'),
  starterContinue: resolve(OUT_DIR, '02-starter-continue-role.png'),
  switchedDocked: resolve(OUT_DIR, '03-shipyard-role-transition.png'),
  switchedFlight: resolve(OUT_DIR, '04-wasp-role-after-undock.png'),
  switchedContinue: resolve(OUT_DIR, '05-wasp-role-after-continue.png'),
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
  assert.equal(new URL(page.url()).search, '', 'M5 acceptance must remain on the canonical root URL');
  await waitForSf(page);
  await installObservation(page);

  // Public New Game/Launch — no bus shortcut.
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('#sf-ng-pilot-name').fill('M5 Route Pilot');
  await page.locator('#sf-ng-difficulty').selectOption('casual');
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await waitForRole(page, { defId: 'ship_kestrel', source: 'new_game', visible: true });
  const newGame = await roleSnapshot(page, 'new_game');
  assert.match(newGame.visibleRoleToast, /Hitch active.*Starter Scout/i);
  assert.match(newGame.flightRoleReadout, /Hitch.*Starter/i);
  await page.screenshot({ path: SHOTS.newGame });

  // Public F5 -> title -> Continue proves starter ownership survives the real load boundary.
  await quickSave(page, 'ship_kestrel');
  await returnToMainMenu(page);
  await publicContinue(page, 'ship_kestrel', 'save_loaded');
  const starterContinue = await roleSnapshot(page, 'starter_continue');
  assert.match(starterContinue.visibleRoleToast, /Hitch active.*Starter Scout/i);
  await page.screenshot({ path: SHOTS.starterContinue });

  // Transparent setup assistance: canonical ships authority grants a progression precondition,
  // then the canonical dock event opens the normal station route. The acceptance action itself is
  // the visible Shipyard control below, not this setup call.
  const setup = await page.evaluate(() => {
    const ships = window.SF.registry.get('ships');
    const granted = ships.buyShip({ defId: 'ship_wasp', grant: true, setActive: false });
    window.SF.bus.emit('dock:docked', { stationId: 'station_helios', source: 'm5-route-setup' });
    return {
      granted,
      activeDefId: window.SF.state.player.ownedShips[window.SF.state.player.activeShipIndex]?.defId,
      ownedDefIds: window.SF.state.player.ownedShips.map((ship) => ship.defId),
    };
  });
  assert.equal(setup.granted, true);
  assert.deepEqual(setup.ownedDefIds, ['ship_kestrel', 'ship_wasp']);
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector('[data-nav="shipworks"], .st-tab[data-tab="shipyard"]'),
    null, { timeout: 10_000 });
  const stationFamily = await page.evaluate(() => document.querySelector('[data-nav="shipworks"]') ? 'stationApp' : 'stationHub');
  const shipyardTab = stationFamily === 'stationApp'
    ? page.locator('[data-nav="shipworks"]')
    : page.locator('.st-tab[data-tab="shipyard"]');
  try {
    await shipyardTab.click({ timeout: 10_000 });
  } catch (error) {
    const stationDiagnostic = await page.evaluate(() => ({
      mode: window.SF?.state?.mode,
      docked: window.SF?.state?.ui?.docked,
      dockedStationId: window.SF?.state?.ui?.dockedStationId,
      screenStack: [...(window.SF?.state?.ui?.screenStack || [])],
      stationMounted: !!document.querySelector('[data-screen="station"]'),
      stationHidden: document.querySelector('[data-screen="station"]')?.hidden ?? null,
      stationText: (document.querySelector('[data-screen="station"]')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      stationButtons: [...(document.querySelector('[data-screen="station"]')?.querySelectorAll('button') || [])]
        .slice(0, 30)
        .map((button) => ({ text: (button.textContent || '').trim(), className: button.className, dataTab: button.dataset.tab || null })),
      bodyClass: document.body.className,
    }));
    await page.screenshot({ path: resolve(OUT_DIR, 'failure-station-route.png') });
    process.stderr.write(`M5 station route diagnostic ${JSON.stringify(stationDiagnostic)}\n`);
    throw error;
  }
  if (stationFamily === 'stationApp') {
    await page.locator('.sx-sw-row[data-fleet="1"]').click();
  } else {
    await page.getByRole('button', { name: 'Make Active', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Make Active', exact: true }).click();
  }
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    return state?.player?.ownedShips?.[state.player.activeShipIndex]?.defId === 'ship_wasp';
  }, null, { timeout: 10_000 });
  const switchedDocked = await roleSnapshot(page, 'switched_docked');
  assert.equal(switchedDocked.activeDefId, 'ship_wasp');
  assert.match(switchedDocked.shipyardText, /Wasp[\s\S]*(ACTIVE|Active)/i);
  assert.match(switchedDocked.shipyardText, /(T1\s*·\s*fighter|fighter\s*·\s*T1)/i);
  assert.equal(switchedDocked.visibleRoleToast, '', 'role toast must not spend its TTL behind Shipyard');
  assert.equal(switchedDocked.pendingRoleBriefingSource, 'active_ship_changed');
  await page.screenshot({ path: SHOTS.switchedDocked });

  // Use the active station family's real public Undock control. The Station Hub intentionally
  // requires a 600 ms pointer hold; Station App exposes an immediate command-dock action.
  if (stationFamily === 'stationApp') {
    await page.locator('[data-act="undock"]').click();
  } else {
    const undock = page.locator('.st-undock');
    await undock.hover();
    await page.mouse.down();
    await page.waitForTimeout(750);
    await page.mouse.up();
  }
  await waitForRole(page, { defId: 'ship_wasp', source: 'active_ship_changed', visible: true });
  const switchedFlight = await roleSnapshot(page, 'switched_flight');
  assert.equal(switchedFlight.docked, false);
  assert.match(switchedFlight.visibleRoleToast, /Wasp active.*Light Fighter/i);
  assert.match(switchedFlight.visibleRoleToast, /fast pass/i);
  assert.match(switchedFlight.flightRoleReadout, /Wasp.*Fighter/i);
  await page.screenshot({ path: SHOTS.switchedFlight });

  // Persist the changed ownership, then prove cold title Continue reconstructs and surfaces it.
  await quickSave(page, 'ship_wasp');
  await returnToMainMenu(page);
  await publicContinue(page, 'ship_wasp', 'save_loaded');
  // Continue has restored the playable state, but the authored Wasp material can still be in its
  // first-frame warmup. Let the cached model settle before taking visual acceptance evidence.
  await page.waitForTimeout(1_500);
  const switchedContinue = await roleSnapshot(page, 'switched_continue');
  assert.match(switchedContinue.visibleRoleToast, /Wasp active.*Light Fighter/i);
  assert.match(switchedContinue.flightRoleReadout, /Wasp.*Fighter/i);
  await page.screenshot({ path: SHOTS.switchedContinue });

  const events = await page.evaluate(() => window.__m5RoleRouteEvents || []);
  const roleEvents = events.filter((event) => event.type === 'ship:roleContext');
  assert.ok(roleEvents.some((event) => event.payload?.source === 'new_game' && event.payload?.defId === 'ship_kestrel'));
  assert.ok(roleEvents.some((event) => event.payload?.source === 'active_ship_changed' && event.payload?.defId === 'ship_wasp'));
  assert.ok(roleEvents.some((event) => event.payload?.source === 'save_loaded' && event.payload?.defId === 'ship_wasp'));
  assert.deepEqual(issues.errorIssues(), [], 'M5 public role route emitted page errors');

  const screenshotEvidence = {};
  for (const [key, path] of Object.entries(SHOTS)) screenshotEvidence[key] = await mediaReceipt(path);
  const report = {
    schema: 'spaceface.m5RoleSupportingRoute.v3',
    generatedAt: new Date().toISOString(),
    route: 'canonical root -> New Game/Launch -> F5 -> Continue -> public ship switch -> public Undock -> F5 -> Continue',
    url: server.baseUrl,
    canonicalRoot: new URL(page.url()).search === '',
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    evidenceClassification: {
      primaryAcceptance: false,
      injectedState: true,
      reason: 'The second hull is granted through ships authority and dock arrival is emitted by the harness.',
      setupWrites: 1,
      directStateWrites: 0,
      directEventEmits: 1,
      teleports: 0,
    },
    setupAssistance: {
      reason: 'Second-hull ownership is a multi-hour progression precondition; setup uses ships.buyShip grant plus canonical dock event without direct state writes.',
      ...setup,
    },
    supportingAcceptance: {
      primaryAcceptance: false,
      injectedState: true,
      difficulty: 'casual',
      stationFamily,
      actions: ['New Game', 'Casual', 'Launch', 'F5', 'Main Menu', 'Continue', 'Shipworks/Shipyard', 'Make Active', 'Undock', 'F5', 'Main Menu', 'Continue'],
      directStateWrites: 0,
      starterRoleVisible: true,
      roleTransitionVisibleInShipyard: true,
      deferredBriefingVisibleAfterUndock: true,
      changedRolePersistsThroughContinue: true,
    },
    stages: { newGame, starterContinue, switchedDocked, switchedFlight, switchedContinue },
    screenshots: screenshotEvidence,
    roleEvents,
    pageIssues: issues.errorIssues(),
    browserVersion: await browser.version(),
  };
  await writeFile(RECEIPT, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`M5 supporting second-hull ownership route PASS\n${JSON.stringify({
    receipt: relativePath(RECEIPT),
    screenshots: Object.fromEntries(Object.entries(SHOTS).map(([key, path]) => [key, relativePath(path)])),
    activeAfterContinue: switchedContinue.activeDefId,
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
    window.__m5RoleRouteEvents = [];
    for (const type of ['ship:roleContext', 'toast', 'save:completed', 'save:loaded', 'dock:undocked']) {
      window.SF.bus.on(type, (payload) => window.__m5RoleRouteEvents.push({
        type,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
        mode: window.SF.state.mode,
        docked: !!window.SF.state.ui?.docked,
        atMs: performance.now(),
      }));
    }
  });
}

async function waitForRole(page, { defId, source, visible }) {
  await page.waitForFunction(({ wantedDefId, wantedSource, needsVisible }) => {
    const sf = window.SF;
    if (!sf?.state || sf.state.mode !== 'flight' || sf.state.ui?.docked) return false;
    const active = sf.state.player?.ownedShips?.[sf.state.player.activeShipIndex]?.defId;
    if (active !== wantedDefId) return false;
    const matchingEvent = (window.__m5RoleRouteEvents || []).some((event) =>
      event.type === 'ship:roleContext'
      && event.payload?.defId === wantedDefId
      && event.payload?.source === wantedSource);
    if (!matchingEvent) return false;
    if (!needsVisible) return true;
    const expectedHud = wantedDefId === 'ship_wasp' ? /Wasp.*Fighter/i : /Hitch.*Starter/i;
    const hud = document.querySelector('#hud');
    if (!hud || Number.parseFloat(getComputedStyle(hud).opacity || '1') < 0.5) return false;
    const hudText = (hud.textContent || '').replace(/\s+/g, ' ').trim();
    if (!expectedHud.test(hudText)) return false;
    const root = document.querySelector('#toasts');
    const text = [...document.querySelectorAll('.sf-toast')]
      .map((node) => (node.textContent || '').trim())
      .find((value) => value.includes(wantedDefId === 'ship_wasp' ? 'Wasp active' : 'Hitch active'));
    return !!text && Number.parseFloat(getComputedStyle(root).opacity || '1') > 0.5;
  }, { wantedDefId: defId, wantedSource: source, needsVisible: visible }, { timeout: 60_000 });
}

async function roleSnapshot(page, label) {
  return page.evaluate((stageLabel) => {
    const state = window.SF.state;
    const active = state.player?.ownedShips?.[state.player.activeShipIndex] || null;
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
      visibleRoleToast: toastsVisible ? (roleToasts[0] || '') : '',
      rawRoleToasts: roleToasts,
      toastsRootOpacity: toastsRoot ? getComputedStyle(toastsRoot).opacity : null,
      flightRoleReadout: hud && getComputedStyle(hud).opacity !== '0' ? (hud.textContent || '').replace(/\s+/g, ' ').trim() : '',
      shipyardText: (document.querySelector('[data-screen="station"] [data-panel="shipyard"], #st-panel-shipyard, .sx-sw, [data-screen="station"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
      pendingRoleBriefingSource: window.SF.registry.get('presentationAdapters')?.inspect?.().pendingRoleBriefingSource || null,
    };
  }, label);
}

async function quickSave(page, expectedDefId) {
  const before = await page.evaluate(() => (window.__m5RoleRouteEvents || []).filter((event) => event.type === 'save:completed').length);
  await page.keyboard.press('F5');
  await page.waitForFunction(({ n, defId }) => {
    const state = window.SF?.state;
    const active = state?.player?.ownedShips?.[state.player.activeShipIndex]?.defId;
    return active === defId
      && (window.__m5RoleRouteEvents || []).filter((event) => event.type === 'save:completed').length > n
      && !!localStorage.getItem('sf.save.quick');
  }, { n: before, defId: expectedDefId }, { timeout: 60_000 });
}

async function returnToMainMenu(page) {
  await page.keyboard.press('Escape');
  const menuButtons = page.getByRole('button', { name: 'Main Menu', exact: true });
  await menuButtons.first().waitFor({ state: 'visible', timeout: 10_000 });
  await menuButtons.first().click();
  await menuButtons.last().waitFor({ state: 'visible', timeout: 10_000 });
  await menuButtons.last().click();
  await page.waitForFunction(() => window.SF?.state?.mode === 'menu', null, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor({ state: 'visible' });
}

async function publicContinue(page, expectedDefId, source) {
  const prior = await page.evaluate(({ defId, wantedSource }) => (window.__m5RoleRouteEvents || [])
    .filter((event) => event.type === 'ship:roleContext'
      && event.payload?.defId === defId
      && event.payload?.source === wantedSource).length,
  { defId: expectedDefId, wantedSource: source });
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await page.waitForFunction(() => {
    const candidate = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Continue');
    return !!candidate && !candidate.disabled;
  }, null, { timeout: 20_000 });
  await button.click();
  await page.waitForFunction(({ defId, wantedSource, previous }) => {
    const state = window.SF?.state;
    const active = state?.player?.ownedShips?.[state.player.activeShipIndex]?.defId;
    const matching = (window.__m5RoleRouteEvents || []).filter((event) => event.type === 'ship:roleContext'
      && event.payload?.defId === defId
      && event.payload?.source === wantedSource).length;
    const root = document.querySelector('#toasts');
    const toast = [...document.querySelectorAll('.sf-toast')].some((node) =>
      (node.textContent || '').includes(defId === 'ship_wasp' ? 'Wasp active' : 'Hitch active'));
    return state?.mode === 'flight' && !state.ui?.docked && active === defId && matching > previous
      && toast && Number.parseFloat(getComputedStyle(root).opacity || '1') > 0.5;
  }, { defId: expectedDefId, wantedSource: source, previous: prior }, { timeout: 90_000 });
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
  for (let port = 8770; port < 8840; port++) {
    if (!(await isPortFree(port))) continue;
    const child = spawn(process.execPath, ['server.js', String(port)], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-4000); });
    const baseUrl = `http://127.0.0.1:${port}/`;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode != null) throw new Error(`M5 server exited early\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok) return { child, baseUrl };
      } catch {}
      await new Promise((done) => setTimeout(done, 100));
    }
    child.kill();
  }
  throw new Error('No free M5 Browser proof port');
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
    throw new Error(`owned M5 server route remained reachable: ${baseUrl}`);
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
