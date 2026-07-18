#!/usr/bin/env node
// capture-menu-overhaul.mjs — player-route visual evidence for the menu fascia redesign.
//
// Walks the canonical browser route with a seeded save index and photographs every surface
// the redesign touched: title (with Continue readout), New Game, Settings, pause over the
// live frozen frame, the Load/Main-Menu confirm gate, Save/Load, Help, and Codex.
// Evidence only — assertions live in the focused checks. Output: .devshots/menu-overhaul/.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(ROOT, '.devshots', 'menu-overhaul');
const VIEWPORT = { width: 1440, height: 900 };

const { chromium } = await loadPlaywright();
mkdirSync(OUT_DIR, { recursive: true });

let server = null;
let browser = null;
const failures = [];

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);

  await page.addInitScript((currentVersion) => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
      localStorage.removeItem('sf.save.index');
      const index = {
        quick: {
          slot: 'quick', savedAt: '2026-06-27T12:00:00.000Z', playtimeS: 420, credits: 5000,
          sectorName: 'Helios Reach', shipName: 'ship_kestrel',
          objectiveSummary: 'Story: Follow the anomaly', version: currentVersion,
        },
        3: {
          slot: '3', savedAt: '2026-06-27T13:15:00.000Z', playtimeS: 3660, credits: 12345,
          sectorName: 'Tethys Gate', shipName: 'ship_kestrel_runner',
          objectiveSummary: 'Route: Tethys Trade Hub - Provisions', version: currentVersion,
        },
      };
      for (const [slot, meta] of Object.entries(index)) {
        const envelope = {
          fmt: 'spaceface-save', version: currentVersion, savedAt: meta.savedAt,
          playtimeS: meta.playtimeS, slot,
          data: {
            meta: { seed: 47, playtimeS: meta.playtimeS, createdAt: meta.savedAt, lastSavedAt: meta.savedAt },
            player: { credits: meta.credits, ownedShips: [], activeShipIndex: 0 },
            cargo: { items: {}, capVolume: 40, capMass: 60 },
            economy: {}, factions: {},
            world: { currentSectorId: 'sector_helios_prime', fuel: { current: 100, max: 100 } },
            entities: {
              player: {
                type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { defId: meta.shipName },
                hull: 120, hullMax: 120, shield: 40, shieldMax: 40, cap: 140, capMax: 140,
              },
              persistent: [], simTime: 0, tick: 0,
            },
            missions: { boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } },
            automation: {}, crafting: { queues: {} }, settings: {},
          },
        };
        localStorage.setItem('sf.save.' + slot, JSON.stringify(envelope));
      }
      localStorage.setItem('sf.save.index', JSON.stringify(index));
    } catch (_) {}
  }, CURRENT_VERSION);

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 20000 });

  const shot = (name) => page.screenshot({ path: join(OUT_DIR, name), type: 'png' });
  const click = async (label) => {
    const b = page.getByRole('button', { name: label, exact: true }).first();
    if (await b.count() <= 0) throw new Error('button not found: ' + label);
    await b.click({ timeout: 10000 });
  };

  // 1 · Title (cinematic plate + fascia menu + Continue readout)
  await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu');
  await page.waitForTimeout(700); // stagger-in settles
  await shot('01-title.png');

  // 2 · New Game
  await click('New Game');
  await waitForVisible(page, '[data-screen="newGame"]', 'new game');
  await page.waitForTimeout(900); // ship preview turntable spins up
  await shot('02-newgame.png');
  await click('Back');
  await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu after back');

  // 3 · Settings
  await click('Settings');
  await waitForVisible(page, '[data-screen="settings"]', 'settings');
  await page.waitForTimeout(300);
  await shot('03-settings.png');
  await click('Back');
  await waitForVisible(page, '[data-screen="mainMenu"]', 'main menu after settings');

  // 4 · Continue → flight → pause over the live frozen frame
  await click('Continue');
  // Cold sector load in headless Chromium is slow (GLB ships + nebula); the soak probes allow 90s+.
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight',
    null, { timeout: 120000 });
  await page.waitForTimeout(2500); // let the sector present a few frames
  await page.keyboard.press('Escape');
  await waitForVisible(page, '[data-screen="pause"]', 'pause');
  await page.waitForTimeout(600);
  await shot('04-pause.png');

  // 5 · Pause → Main Menu confirm gate (danger default Cancel), then dismiss
  await click('Main Menu');
  await page.waitForSelector('#sf-confirm-root .sf-confirm', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(250);
  await shot('05-confirm-mainmenu.png');
  await page.locator('#sf-confirm-root .sf-confirm__cancel').click();
  await page.waitForSelector('#sf-confirm-root .sf-confirm', { state: 'detached', timeout: 5000 });

  // 6 · Pause → Save / Load
  await click('Save');
  await waitForVisible(page, '[data-screen="saveLoad"]', 'save/load');
  await page.waitForTimeout(300);
  await shot('06-saveload.png');
  await click('Back');
  await waitForVisible(page, '[data-screen="pause"]', 'pause after save/load');

  // 7 · Pause → Help / Controls
  await click('Help / Controls');
  await waitForVisible(page, '[data-screen="help"]', 'help');
  await page.waitForTimeout(300);
  await shot('07-help.png');
  await click('Close');
  await waitForVisible(page, '[data-screen="pause"]', 'pause after help');

  // 8 · Pause → Codex
  await click('Codex');
  await waitForVisible(page, '[data-screen="codex"]', 'codex');
  await page.waitForTimeout(300);
  await shot('08-codex.png');

  const errors = issues.errorIssues();
  if (errors.length) failures.push('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  console.log('menu overhaul captures written to .devshots/menu-overhaul/');
  for (const name of ['01-title', '02-newgame', '03-settings', '04-pause', '05-confirm-mainmenu', '06-saveload', '07-help', '08-codex']) {
    console.log('  ' + name + '.png');
  }
} catch (err) {
  failures.push(err && err.message ? err.message : String(err));
  try {
    const errors = issues.errorIssues();
    if (errors.length) failures.push('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  } catch (_) {}
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) await server.kill().catch(() => {});
}

if (failures.length) {
  console.error('capture-menu-overhaul FAIL:\n' + failures.join('\n'));
  process.exitCode = 1;
}

async function waitForVisible(page, selector, label) {
  await page.waitForFunction((wanted) => {
    const element = document.querySelector(wanted);
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }, selector, { timeout: 15000 }).catch((error) => {
    throw new Error(label + ' did not become visible: ' + error.message);
  });
}

async function startFreshServer() {
  const port = await findFreePort(8180);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', () => resolve());
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl,
    kill: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port found for menu overhaul capture');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
