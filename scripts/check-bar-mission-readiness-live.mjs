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
import { BINDINGS } from '../src/ui/bindings.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 90000;
const MISSION_LOG_LABEL = `Mission Log (${BINDINGS.missionLog.label})`;
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
    sf.state.ui.trackedMissionId = 'departure_probe';
    sf.state.missions.active = [{
      id: 'departure_probe',
      status: 'active',
      type: 'cargo_delivery',
      title: 'Probe Delivery',
    }].concat(sf.state.missions.active || []);
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

  const departureReport = await page.evaluate(() => {
    const strip = document.querySelector('.st-departure');
    const chips = [...document.querySelectorAll('.st-departure-chip')].map((chip) => ({
      label: (chip.querySelector('b') && chip.querySelector('b').textContent || '').trim(),
      text: (chip.querySelector('span') && chip.querySelector('span').textContent || '').trim(),
      className: chip.className,
    }));
    return {
      visible: !!strip && getComputedStyle(strip).display !== 'none',
      label: (document.querySelector('.st-departure-label') && document.querySelector('.st-departure-label').textContent || '').trim(),
      chips,
    };
  });
  assert.equal(departureReport.visible, true, 'station should render the Departure Check strip');
  assert.equal(departureReport.label, 'Departure Check', 'departure strip should be labeled for pre-undock trust');
  for (const label of ['Track', 'Hold', 'Fuel', 'Hull']) {
    assert(departureReport.chips.some((chip) => chip.label === label),
      `departure strip missing ${label} chip: ${JSON.stringify(departureReport)}`);
  }
  assert(departureReport.chips.some((chip) => chip.label === 'Track' && /Probe Delivery/.test(chip.text)),
    'departure strip should show the tracked mission title: ' + JSON.stringify(departureReport));

  const bountyButton = page.getByRole('button', { name: 'Any bounties worth chasing?' });
  assert.equal(await bountyButton.count(), 1, 'Rook bounty choice should be reachable in the Bar');
  await bountyButton.click();
  await page.waitForFunction(() => !!document.querySelector('.st-bar-offer .st-mission-preflight-chip'), null, {
    timeout: 5000,
  }).catch(async (err) => {
    const debug = await page.evaluate(() => ({
      activeTab: window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.activeStationTab,
      dockedStationId: window.SF && window.SF.state && window.SF.state.ui && window.SF.state.ui.dockedStationId,
      boardSlots: window.SF && window.SF.state && window.SF.state.missions
        && window.SF.state.missions.boards.station_coalition
        && window.SF.state.missions.boards.station_coalition.slots
        && window.SF.state.missions.boards.station_coalition.slots.map((slot) => ({ id: slot.id, type: slot.type, title: slot.title })),
      barText: (document.querySelector('.st-bar') && document.querySelector('.st-bar').textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200),
      offerCount: document.querySelectorAll('.st-bar-offer').length,
    }));
    throw new Error('Timed out waiting for Bar offer chips: ' + err.message + ' ' + JSON.stringify(debug));
  });

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
      consequenceChips: [...(offer ? offer.querySelectorAll('.st-mission-consequence') : [])]
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
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
  assert(report.consequenceChips.some((chip) => /Success/.test(chip) && /\+1,200 cr/.test(chip) && /\+7 rep/.test(chip) && /collateral returned/.test(chip)),
    'bar offer should show success consequence stakes: ' + JSON.stringify(report));
  assert(report.consequenceChips.some((chip) => /Fail\/expire/.test(chip) && /-5 rep/.test(chip) && /collateral forfeited/.test(chip) && /no payout/.test(chip)),
    'bar offer should show failure consequence stakes: ' + JSON.stringify(report));
  assert.equal(report.blocker, 'Need 500 cr collateral',
    'bar offer should show visible collateral blocker: ' + JSON.stringify(report));
  assert.equal(report.buttonText, 'ACCEPT + TRACK', 'bar button should match board tracking language');
  assert.equal(report.buttonDisabled, true, 'bar button should disable blocked offers');

  await page.evaluate(() => {
    const sf = window.SF;
    sf.state.player.credits = 5000;
    sf.state.missions.boards.station_coalition = {
      refreshEpoch: 0,
      slots: [{
        id: 'bar_probe_ready_bounty',
        type: 'bounty_hunt',
        title: 'Ready Bar Bounty',
        factionId: 'faction_scn',
        reward_cr: 1500,
        collateral_cr: 0,
        riskTier: 0,
        destSectorId: 'sector_ceres',
        distance: 800,
        params: { targetName: 'Ready Probe Target' },
        time_limit_s: 900,
      }],
    };
    sf.bus.emit('mission:updated', { missionId: null });
  });
  await bountyButton.click();
  await page.waitForFunction(() => {
    const button = document.querySelector('.st-bar-offer [data-accept-mission="bar_probe_ready_bounty"]');
    return !!(button && !button.disabled);
  }, null, { timeout: 5000 });
  const acceptClickReport = await page.evaluate((missionLogLabel) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const button = document.querySelector('.st-bar-offer [data-accept-mission="bar_probe_ready_bounty"]');
    if (!button) throw new Error('Ready Bar bounty accept button not found');
    button.click();
    const state = window.SF.state;
    const trackedId = state.ui && state.ui.trackedMissionId;
    const tracked = state.missions.active.find((m) => m && m.id === trackedId);
    const board = state.missions.boards.station_coalition;
    const offer = document.querySelector('.st-bar-offer');
    const card = offer && offer.closest('.st-bar-card');
    const openButton = offer && offer.querySelector('[data-open-mission-log]');
    return {
      trackedId,
      trackedTitle: tracked && tracked.title,
      trackedType: tracked && tracked.type,
      activeCount: state.missions.active.length,
      boardSlots: board && board.slots && board.slots.map((slot) => slot && slot.id),
      reply: normalize(card && card.querySelector('.st-bar-reply') && card.querySelector('.st-bar-reply').textContent),
      hasOpenButton: !!openButton,
      openButtonText: normalize(openButton && openButton.textContent),
      openButtonDisabled: openButton ? openButton.disabled : null,
      hasAcceptButton: !!(offer && offer.querySelector('[data-accept-mission]')),
      offerAccepted: !!(offer && offer.classList.contains('accepted')),
      missionLogLabel,
    };
  }, MISSION_LOG_LABEL);
  await page.waitForFunction(() => {
    const button = document.querySelector('.st-bar-offer [data-open-mission-log]');
    return !!(button && !button.disabled);
  }, null, { timeout: 10000 }).catch(async (err) => {
    const debug = await page.evaluate((clickReport) => {
      const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const state = window.SF.state;
      const trackedId = state.ui && state.ui.trackedMissionId;
      const tracked = state.missions.active.find((m) => m && m.id === trackedId);
      const board = state.missions.boards.station_coalition;
      const offer = document.querySelector('.st-bar-offer');
      const button = offer && (offer.querySelector('[data-open-mission-log]') || offer.querySelector('[data-accept-mission]'));
      return {
        clickReport,
        top: window.SF.ctx.screenManager.top(),
        activeTab: state.ui && state.ui.activeStationTab,
        trackedId,
        trackedTitle: tracked && tracked.title,
        trackedType: tracked && tracked.type,
        activeMissions: state.missions.active.map((m) => ({ id: m.id, title: m.title, type: m.type, status: m.status })),
        boardSlots: board && board.slots && board.slots.map((slot) => ({ id: slot.id, title: slot.title, type: slot.type })),
        offerText: normalize(offer && offer.textContent),
        buttonText: normalize(button && button.textContent),
        buttonAttrs: button ? {
          accept: button.getAttribute('data-accept-mission'),
          open: button.getAttribute('data-open-mission-log'),
          disabled: button.disabled,
        } : null,
        visibleBarText: normalize(document.querySelector('.st-bar') && document.querySelector('.st-bar').textContent).slice(0, 1000),
      };
    }, acceptClickReport);
    throw new Error('Timed out waiting for accepted Bar Mission Log handoff: ' + err.message + ' ' + JSON.stringify(debug));
  });

  const acceptedReport = await page.evaluate((missionLogLabel) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const state = window.SF.state;
    const trackedId = state.ui && state.ui.trackedMissionId;
    const tracked = state.missions.active.find((m) => m && m.id === trackedId);
    const offer = document.querySelector('.st-bar-offer');
    const card = offer && offer.closest('.st-bar-card');
    const button = offer && offer.querySelector('[data-open-mission-log]');
    return {
      top: window.SF.ctx.screenManager.top(),
      activeTab: state.ui.activeStationTab,
      trackedId,
      trackedTitle: tracked && tracked.title,
      trackedType: tracked && tracked.type,
      reply: normalize(card && card.querySelector('.st-bar-reply') && card.querySelector('.st-bar-reply').textContent),
      buttonText: normalize(button && button.textContent),
      buttonTitle: button && button.title || '',
      buttonDisabled: button ? button.disabled : null,
      offerAccepted: !!(offer && offer.classList.contains('accepted')),
      hasAcceptButton: !!(offer && offer.querySelector('[data-accept-mission]')),
      missionLogLabel,
    };
  }, MISSION_LOG_LABEL);
  assert.equal(acceptedReport.top, 'station', 'Bar should remain in the station after accepting before handoff: ' + JSON.stringify(acceptedReport));
  assert.equal(acceptedReport.activeTab, 'bar', 'Bar tab should stay active before Mission Log handoff: ' + JSON.stringify(acceptedReport));
  assert.equal(acceptedReport.trackedTitle, 'Ready Bar Bounty', 'ready Bar offer should become the tracked mission: ' + JSON.stringify(acceptedReport));
  assert.equal(acceptedReport.offerAccepted, true, 'accepted Bar offer should mark the offer wrapper accepted: ' + JSON.stringify(acceptedReport));
  assert.equal(acceptedReport.hasAcceptButton, false, 'accepted Bar offer should replace the accept intent with a handoff intent: ' + JSON.stringify(acceptedReport));
  assert(acceptedReport.reply.includes(MISSION_LOG_LABEL),
    'accepted Bar reply should name the bound Mission Log shortcut: ' + JSON.stringify(acceptedReport));
  assert.match(acceptedReport.reply, /Departure Check is green/i,
    'accepted Bar reply should route players through Departure Check before undock: ' + JSON.stringify(acceptedReport));
  assert.match(acceptedReport.buttonText, /OPEN MISSION LOG/i,
    'accepted Bar button should become an Open Mission Log action: ' + JSON.stringify(acceptedReport));
  assert(acceptedReport.buttonText.includes(BINDINGS.missionLog.label),
    'accepted Bar button should include the bound Mission Log key: ' + JSON.stringify(acceptedReport));
  assert.equal(acceptedReport.buttonDisabled, false,
    'accepted Bar Mission Log handoff button should stay enabled: ' + JSON.stringify(acceptedReport));

  await page.evaluate(() => {
    const button = document.querySelector('.st-bar-offer [data-open-mission-log]');
    if (!button) throw new Error('Open Mission Log button not found');
    button.click();
  });
  await waitForVisible(page, '[data-screen="missionLog"]', 10000, 'Mission Log opened from Bar handoff');
  const logReport = await page.evaluate(() => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const state = window.SF.state;
    const trackedId = state.ui && state.ui.trackedMissionId;
    const tracked = state.missions.active.find((m) => m && m.id === trackedId);
    const screen = document.querySelector('[data-screen="missionLog"]');
    return {
      top: window.SF.ctx.screenManager.top(),
      trackedTitle: tracked && tracked.title,
      text: normalize(screen && screen.textContent),
      trackedCard: normalize(screen && screen.querySelector('.sf-mlog-card.tracked') && screen.querySelector('.sf-mlog-card.tracked').textContent),
    };
  });
  assert.equal(logReport.top, 'missionLog', 'Bar handoff button should push Mission Log: ' + JSON.stringify(logReport));
  assert(logReport.text.includes('Ready Bar Bounty'),
    'Mission Log should show the Bar-accepted mission: ' + JSON.stringify(logReport));
  assert(logReport.trackedCard.includes('TRACKING'),
    'Mission Log should show the Bar-accepted mission as tracked: ' + JSON.stringify(logReport));
  assert.deepEqual(issues.errorIssues(), [], 'bar live smoke should not record page errors');

  console.log('Bar mission readiness live OK: Bar offer chips, blocker, Accept + Track, and Mission Log handoff render on the default route.');
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
