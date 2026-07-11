#!/usr/bin/env node
// check-first-15-runtime.mjs - browser smoke for the default first-session route.
//
// Boots the normal player URL (canonical repo root via server.js), opens New Game, verifies the
// first-15 rail is visible before scrolling, launches through the normal game:new path, then
// checks live objective surfaces — including B0 one-verb exclusivity:
//   • during active B0: no simultaneous non-empty onboarding-panel objective + HUD tracker command
//   • firstFlight hint wall deferred until B0 completion/silence
//   • Mission Log remains optional on-demand context (not a second always-on teacher)
//
// Does NOT weaken authored-asset startup gates. If that gate blocks flight entry, this probe
// reports a clear BLOCKER and exits non-zero; source/headless coverage lives in check-first-hour.mjs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 90000;
// firstFlight historically fires after ~3s of flight; sample past that so deferral is observable.
const B0_SAMPLE_WAIT_MS = 3800;
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

  // Canonical player root only — no alternate probe routes / debug game paths.
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');
  await waitForBootOverlayGone(page);

  const opened = await clickButton(page, 'New Game');
  assert.equal(opened, true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game route rail');

  const routeReport = await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
    };
    const screen = document.querySelector('[data-screen="newGame"]');
    const route = document.querySelector('[data-screen="newGame"] .sf-ng-route');
    const startingShip = [...document.querySelectorAll('[data-screen="newGame"] h2')]
      .find((el) => (el.textContent || '').trim() === 'Starting Ship');
    return {
      screenVisible: visible(screen),
      routeVisible: visible(route),
      screenRect: screen ? screen.getBoundingClientRect().toJSON() : null,
      routeRect: route ? route.getBoundingClientRect().toJSON() : null,
      startingShipRect: startingShip ? startingShip.getBoundingClientRect().toJSON() : null,
      steps: [...document.querySelectorAll('[data-screen="newGame"] .sf-ng-route__step')]
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
    };
  });

  assert.equal(routeReport.screenVisible, true, 'New Game panel should be visible');
  assert.equal(routeReport.routeVisible, true, 'first-15 route rail should be visible');
  assert.equal(routeReport.steps.length, 4, 'first-15 route rail should have four steps');
  for (const phrase of ['Wake at the beacon', 'Tether the derelict', 'Mine the first seam', 'Dock and pick work']) {
    assert(routeReport.steps.some((step) => step.includes(phrase)), 'route rail missing step: ' + phrase);
  }
  assert(routeReport.routeRect.top >= routeReport.screenRect.top && routeReport.routeRect.bottom <= routeReport.screenRect.bottom,
    'first-15 rail should be visible without scrolling');
  assert(routeReport.routeRect.bottom <= routeReport.startingShipRect.top,
    'first-15 rail should appear before the starter ship block');

  const launched = await clickButton(page, 'Launch');
  assert.equal(launched, true, 'New Game should expose Launch');
  try {
    await page.waitForFunction(() => {
      const sf = window.SF;
      const state = sf && sf.state;
      const player = state && state.entities && state.entities.get(state.playerId);
      return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
    }, null, { timeout: START_TIMEOUT_MS });
  } catch (err) {
    const diag = await page.evaluate(() => {
      const sf = window.SF;
      const state = sf && sf.state;
      const body = (document.body && document.body.innerText) || '';
      const boot = document.getElementById('boot-overlay');
      return {
        mode: state && state.mode,
        hasPlayer: !!(state && state.playerId && state.entities && state.entities.get(state.playerId)),
        bootHidden: !boot || boot.classList.contains('hidden'),
        bodySnippet: body.replace(/\s+/g, ' ').trim().slice(0, 600),
        consoleHint: body.match(/authored ship|preload|procedural fallback|refusing to/i)?.[0] || null,
      };
    }).catch(() => ({ mode: null, bodySnippet: '', consoleHint: null }));
    const blob = `${diag.bodySnippet || ''} ${diag.consoleHint || ''} ${err.message || ''}`;
    const assetBlocked = /authored ship|preload|procedural fallback|refusing to (start|enter) flight/i.test(blob)
      || (diag.mode && diag.mode !== 'flight' && !diag.hasPlayer);
    console.error(
      'BLOCKER: flight entry failed after Launch'
      + (assetBlocked
        ? ' — authored-asset startup gate (or boot path) likely blocked canonical play.'
        : '.')
      + '\nDo not weaken main.js asset gates. Source/headless one-verb coverage remains in check-first-hour.mjs.\n'
      + `diag=${JSON.stringify(diag)}\n`
      + `cause=${err.message}`,
    );
    throw new Error(
      'Timed out waiting for flight after Launch'
      + (assetBlocked ? ' (authored-asset / boot blocked — see BLOCKER above)' : '')
      + ': ' + err.message,
    );
  }

  // Hold in B0 long enough that an undeferred firstFlight wall would have fired (~3s).
  await page.waitForTimeout(B0_SAMPLE_WAIT_MS);

  // ── B0 one-verb exclusivity sample (before opening Mission Log) ─────────────
  const b0Report = await page.evaluate(() => {
    const visibleText = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { text: '', visible: false };
      let n = el;
      while (n && n.nodeType === 1) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
          return { text: '', visible: false };
        }
        n = n.parentElement;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return { text: '', visible: false };
      return { text: (el.textContent || '').replace(/\s+/g, ' ').trim(), visible: true };
    };

    const sf = window.SF;
    const state = sf.state;
    const ob = state.onboarding || {};
    const hints = (state.player && state.player.hints) || {};
    const panel = visibleText('#sf-onboarding .sf-ob-title');
    const trackerObj = visibleText('.sf-mission-tracker .sf-mt-obj');
    const trackerRoot = document.querySelector('.sf-mission-tracker');
    const trackerRootShown = !!(trackerRoot && getComputedStyle(trackerRoot).display !== 'none');
    // Generic flight copy is preloaded into #control-hints even while the bar is opacity-hidden;
    // only visible text can compete with the B0 objective.
    const controlHints = visibleText('#control-hints');
    const toastBlob = [...document.querySelectorAll('.sf-toast, .toast, [data-kind], [class*="toast"]')]
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' | ')
      .slice(0, 500);
    const voiceText = (sf.ctx && sf.ctx.helpers && sf.ctx.helpers.voice && sf.ctx.helpers.voice.active
      && sf.ctx.helpers.voice.active.text) || '';
    const top = sf.ctx.screenManager && sf.ctx.screenManager.top
      ? sf.ctx.screenManager.top()
      : null;

    return {
      mode: state.mode,
      storyBeat: state.story && state.story.beatIndex,
      onboardingActive: !!ob.active,
      onboardingFinished: !!ob.finished,
      currentBeat: ob.currentBeat,
      panelTitle: panel.text,
      panelVisible: panel.visible,
      trackerObj: trackerObj.text,
      trackerVisible: trackerObj.visible && trackerRootShown,
      trackerText: (trackerRoot?.textContent || '').replace(/\s+/g, ' ').trim(),
      firstFlightHint: !!hints.firstFlight,
      waypoint: state.nav && state.nav.waypoint || null,
      controlHints: controlHints.visible ? controlHints.text : '',
      toastBlob,
      voiceText,
      topScreen: top,
      screenStack: state.ui && state.ui.screenStack && state.ui.screenStack.slice(),
    };
  });

  assert.equal(b0Report.mode, 'flight', 'Launch should enter flight mode');
  assert.equal(b0Report.storyBeat, 0, 'first run should start on story beat 0');
  assert.equal(b0Report.onboardingActive, true, 'B0 sample requires active onboarding');
  assert.equal(b0Report.onboardingFinished, false, 'B0 sample requires unfinished onboarding');
  assert.equal(b0Report.currentBeat, 0, 'B0 sample should still be on wake (currentBeat 0)');
  assert(b0Report.waypoint && (b0Report.waypoint.kind === 'story' || b0Report.waypoint.onboarding === true),
    'first run should seed a story or onboarding waypoint');
  assert.match(
    `${b0Report.waypoint.reason || ''} ${b0Report.waypoint.label || ''}`,
    /47-A|mass signal|manifest|beacon/i,
    'first waypoint should point at the opening beacon/anomaly',
  );

  const panelCmd = !!(b0Report.panelVisible && b0Report.panelTitle);
  const trackerCmd = !!(b0Report.trackerVisible && b0Report.trackerObj);
  assert.ok(
    !(panelCmd && trackerCmd),
    'B0 one-verb exclusivity: onboarding-panel objective and HUD tracker command must not both be non-empty '
    + `during active B0 (panel="${b0Report.panelTitle}" tracker="${b0Report.trackerObj}")`,
  );
  assert.ok(
    panelCmd || trackerCmd,
    'B0 must still expose exactly one persistent actionable objective surface '
    + '(panel demoted or tracker primary — not neither)',
  );
  if (trackerCmd) {
    assert.match(
      b0Report.trackerText,
      /Story|Tutorial|47-A|signal|anomaly|Mission Log|Objective|beacon|thrust/i,
      'HUD tracker should expose first objective context when it owns the command',
    );
  }

  // firstFlight wall deferred past the historical 3s mark while B0 is still active.
  assert.equal(
    b0Report.firstFlightHint,
    false,
    'firstFlight hint wall must be deferred until B0 completion/silence '
    + '(state.player.hints.firstFlight must remain false during active B0)',
  );
  const firstFlightWallRe = /W thrusts|W\/Up to thrust|Left stick flies|Nose follows the mouse|A\/D \(or arrows\) turn/i;
  assert.doesNotMatch(
    `${b0Report.controlHints} ${b0Report.toastBlob} ${b0Report.voiceText}`,
    firstFlightWallRe,
    'firstFlight multi-verb control wall must not surface in control-hints/toasts/voice during active B0',
  );

  // Mission Log is optional context: must not already own the screen as a forced B0 teacher,
  // but remains reachable when the player (or this probe) opens it on demand.
  assert.notEqual(
    b0Report.topScreen,
    'missionLog',
    'Mission Log must not auto-own the screen during B0 (optional context only)',
  );

  const flightReport = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const beat = state.story && state.story.beatIndex;
    const waypoint = state.nav && state.nav.waypoint || null;
    const trackerText = (document.querySelector('.sf-mission-tracker')?.textContent || '').replace(/\s+/g, ' ').trim();
    const topBefore = sf.ctx.screenManager.top();
    sf.ctx.screenManager.pushScreen('missionLog');
    sf.ctx.screenManager.syncVisibility && sf.ctx.screenManager.syncVisibility();
    const logText = (document.querySelector('[data-screen="missionLog"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      mode: state.mode,
      beat,
      waypoint,
      trackerText,
      topBefore,
      topAfter: sf.ctx.screenManager.top(),
      missionLogText: logText,
      screenStack: state.ui && state.ui.screenStack && state.ui.screenStack.slice(),
    };
  });

  assert.equal(flightReport.topAfter, 'missionLog', 'mission log should open on demand after launch');
  assert.match(flightReport.missionLogText, /RECOMMENDED NEXT/i, 'mission log should show recommended next rail (optional context)');
  assert.match(flightReport.missionLogText, /Follow the anomaly/i, 'mission log should carry the first route action as optional context');
  assert.deepEqual(issues.errorIssues(), [], 'first-15 runtime probe should not record page errors');

  console.log(
    'First-15 runtime route OK: New Game rail -> flight B0 one-verb exclusivity '
    + `(panelCmd=${panelCmd} trackerCmd=${trackerCmd} firstFlight=deferred) `
    + '-> optional mission-log context',
  );
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
  const button = page.getByRole('button', { name: label, exact: true }).first();
  if (await button.count() <= 0) return false;
  await button.click({ timeout: 10000 });
  return true;
}

// The full-screen boot overlay (z-index 2000, pointer-events:auto) intercepts clicks until
// precompilePipelines() finishes and hideBootOverlay() adds `.hidden` (→ pointer-events:none). That's
// sub-second on a real GPU but ~20 s under software rendering (SwiftShader), which would otherwise
// blow the New Game click's 10 s actionability timeout. Wait for it to clear first.
async function waitForBootOverlayGone(page, timeoutMs = 90000) {
  await page.waitForFunction(() => {
    const o = document.getElementById('boot-overlay');
    if (!o) return true;
    const s = getComputedStyle(o);
    return o.classList.contains('hidden') || s.pointerEvents === 'none' || s.display === 'none' || s.visibility === 'hidden';
  }, null, { timeout: timeoutMs });
}

async function startFreshServer() {
  const port = await findFreePort(8130);
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
  throw new Error('No free local port found for first-15 runtime check');
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
