#!/usr/bin/env node
// Browser smoke for station Bar mission offers.
//
// Boots the normal player URL, launches a real run, opens the Station Bar through
// the screen manager, and verifies Bar offers share the Mission Board readiness
// language/chips/button state.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 45000;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');
  await clickButton(page, 'New Game');
  await waitForVisible(page, '[data-screen="newGame"]', 10000, 'new game');
  await clickButton(page, 'Launch');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight', null, {
    timeout: START_TIMEOUT_MS,
  });

  await page.evaluate(() => {
    const sf = window.SF;
    sf.state.player.credits = 100;
    sf.state.missions.boards.station_coalition = {
      refreshEpoch: 0,
      slots: [{
        id: 'bar_probe_bounty',
        type: 'bounty_hunt',
        title: 'Probe Bounty',
        factionId: 'faction_scn',
        reward_cr: 1200,
        collateral_cr: 500,
        riskTier: 1,
        destSectorId: 'sector_ceres',
        params: { targetName: 'Probe Target' },
        time_limit_s: 900,
      }],
    };
    sf.state.ui.dockedStationId = 'station_coalition';
    sf.state.ui.activeStationTab = 'bar';
    sf.ctx.screenManager.pushScreen('station');
    sf.ctx.screenManager.syncVisibility && sf.ctx.screenManager.syncVisibility();
  });
  await waitForVisible(page, '.st-bar', 10000, 'station bar');

  const clickedBounty = await page.evaluate(() => {
    const visible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1;
    };
    const btn = [...document.querySelectorAll('.st-bar-card button[data-choice]')]
      .find((b) => visible(b) && /bounties worth chasing/i.test(b.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  assert.equal(clickedBounty, true, 'Rook bounty choice should be reachable in the Bar');
  await page.waitForSelector('.st-bar-offer .st-mission-preflight-chip', { timeout: 5000 });

  const report = await page.evaluate(() => {
    const offer = document.querySelector('.st-bar-offer');
    const card = offer && offer.closest('.st-bar-card');
    const text = (root, sel) => (root && root.querySelector(sel) && root.querySelector(sel).textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    const button = offer && offer.querySelector('[data-accept-mission]');
    return {
      hasOffer: !!offer,
      hasCard: !!card,
      cardContact: card && card.getAttribute('data-contact') || '',
      reply: text(card, '.st-bar-reply'),
      chips: [...(offer ? offer.querySelectorAll('.st-mission-preflight-chip') : [])]
        .map((el) => (el.textContent || '').trim()),
      blocker: text(offer, '.st-bar-offer-blocker'),
      buttonText: button ? (button.textContent || '').trim() : '',
      buttonDisabled: button ? button.disabled : null,
      offerText: (offer && offer.textContent || '').replace(/\s+/g, ' ').trim(),
      visibleBarText: (document.querySelector('.st-bar') && document.querySelector('.st-bar').textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 800),
      top: window.SF.ctx.screenManager.top(),
    };
  });

  assert.equal(report.top, 'station', 'station screen should remain open');
  assert.equal(report.hasCard, true, 'bar offer should belong to a contact card: ' + JSON.stringify(report));
  assert.match(report.reply, /Accept \+ Track/i, 'bar reply should use tracking language: ' + JSON.stringify(report));
  assert(report.chips.some((chip) => /500 cr collateral/.test(chip)),
    'bar offer should show collateral readiness chip: ' + JSON.stringify(report));
  assert.equal(report.blocker, 'Need 500 cr collateral',
    'bar offer should show visible collateral blocker: ' + JSON.stringify(report));
  assert.equal(report.buttonText, 'ACCEPT + TRACK', 'bar button should match board tracking language');
  assert.equal(report.buttonDisabled, true, 'bar button should disable blocked offers');
  assert.deepEqual(issues.errorIssues(), [], 'bar live smoke should not record page errors');

  console.log('Bar mission readiness live OK: Bar offer chips, blocker, and Accept + Track button render on the default route.');
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => {
    throw new Error('Timed out waiting for ' + label + ': ' + err.message);
  });
}

async function clickButton(page, label) {
  const clicked = await page.evaluate((wanted) => {
    const button = [...document.querySelectorAll('button')]
      .find((b) => (b.textContent || '').trim() === wanted);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  assert.equal(clicked, true, 'button should exist: ' + label);
}

async function startFreshServer() {
  const port = await findFreePort(8210);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) {
      throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    }
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('No free local port found for Bar mission readiness check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return !!res.ok;
  } catch (_) {
    return false;
  }
}
