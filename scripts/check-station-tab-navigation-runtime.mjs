#!/usr/bin/env node
// check-station-tab-navigation-runtime.mjs — browser smoke for the docked station ("Orbital Command").
//
// Boots the canonical player URL, starts a real New Game through the UI, docks through the same
// dock:docked event path used by flight, then drives the Command Dock with pointer + keyboard.
// QA probe only: it does not change routes, assets, render settings, or gameplay defaults.
//
// DESIGN TRUTH (src/ui/station/): one Command Dock is the whole navigation — seven destinations
// (Market, Shipworks, Industry, Contracts/Missions, Factions, Bar, Ledger) plus dock actions
// (Repair, Refuel, Resupply, Undock). There is no tab rail, no Hold tab (the hold is a manifest
// popover on the Hold readout), and no Services tab (repair/refuel/resupply are dock actions with
// live costs). Departure readiness rides on the Undock tile; launching while not ready opens a
// Departure Check.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 90000;
const DOCK_TIMEOUT_MS = 15000;
const DESTINATIONS = ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar', 'ledger'];
const DOCK_ACTIONS = ['repair', 'refuel', 'resupply', 'undock'];
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
let issues = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });
  issues = collectPageIssues(page, { includeWarnings: true });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    window.dockSnapshot = () => {
      const tabs = [...document.querySelectorAll('[data-screen="station"] .sx-dock [data-nav]')];
      const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      return {
        activeNav: active ? active.getAttribute('data-nav') : null,
        focusedNav: document.activeElement && document.activeElement.getAttribute
          ? document.activeElement.getAttribute('data-nav') : null,
        selectedCount: tabs.filter((t) => t.getAttribute('aria-selected') === 'true').length,
        tabbableCount: tabs.filter((t) => t.getAttribute('tabindex') === '0').length,
      };
    };
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'station dock probe must use the canonical root URL with no query flags');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 15000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');

  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game first-session rail');
  assert.equal(await clickButton(page, 'Launch'), true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList && sf.state.entityList.find((e) =>
      e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId };
  });

  await waitForVisible(page, '[data-screen="station"] .sx-dock', DOCK_TIMEOUT_MS, 'command dock after dock');

  // ---- structure: one dock, six destinations, four actions, a labelled tabpanel ----
  const shell = await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.hidden && r.width > 20 && r.height > 10;
    };
    const dock = document.querySelector('[data-screen="station"] .sx-dock');
    const navGroup = document.querySelector('[data-screen="station"] .sx-dock__group--nav');
    const tabs = [...document.querySelectorAll('[data-screen="station"] .sx-dock [data-nav]')];
    const acts = [...document.querySelectorAll('[data-screen="station"] .sx-dock [data-act]')];
    const panel = document.querySelector('[data-screen="station"] #sx-panel');
    const first = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
    if (first) first.focus();
    return {
      dockRole: dock && dock.getAttribute('role'),
      navRole: navGroup && navGroup.getAttribute('role'),
      navs: tabs.map((t) => ({
        id: t.getAttribute('data-nav'),
        role: t.getAttribute('role'),
        selected: t.getAttribute('aria-selected'),
        tabIndex: t.getAttribute('tabindex'),
        controls: t.getAttribute('aria-controls'),
        label: (t.textContent || '').replace(/\s+/g, ' ').trim(),
      })),
      acts: acts.map((a) => ({
        id: a.getAttribute('data-act'),
        cost: (a.querySelector('[data-cost]') || {}).textContent || '',
        label: a.getAttribute('aria-label'),
      })),
      panelVisible: visible(panel),
      panelRole: panel && panel.getAttribute('role'),
      panelLabelledBy: panel && panel.getAttribute('aria-labelledby'),
      // hold manifest lives on the Hold readout now (there is no Hold tab)
      holdButton: !!document.querySelector('[data-screen="station"] [data-hold]'),
      readouts: [...document.querySelectorAll('[data-screen="station"] .sx-readout')].map((readout) => {
        const track = readout.querySelector('.sx-readout__track');
        const rect = track && track.getBoundingClientRect();
        return {
          label: readout.querySelector('.sx-readout__label')?.textContent?.trim() || '',
          value: readout.querySelector('.sx-readout__v')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          trackWidth: rect ? rect.width : 0,
        };
      }),
      commsToggle: !!document.querySelector('[data-screen="station"] .sx-comms__toggle'),
    };
  });

  assert.equal(shell.dockRole, 'toolbar', 'the command dock should expose role=toolbar');
  assert.equal(shell.navRole, 'tablist', 'the destination group should expose role=tablist');
  assert.deepEqual(shell.navs.map((n) => n.id), DESTINATIONS, 'command dock should preserve the authored destination order');
  for (const nav of shell.navs) {
    assert.equal(nav.role, 'tab', 'destination should be a tab: ' + nav.id);
    assert.equal(nav.controls, 'sx-panel', 'destination should control the workspace panel: ' + nav.id);
    assert.ok(nav.label, 'destination should carry a visible label: ' + nav.id);
  }
  assert.equal(shell.navs.filter((n) => n.selected === 'true').length, 1, 'exactly one destination should be selected');
  assert.equal(shell.navs.filter((n) => n.tabIndex === '0').length, 1, 'exactly one destination should be tabbable (roving tab stop)');
  assert.equal(shell.panelVisible, true, 'the workspace panel should be visible');
  assert.equal(shell.panelRole, 'tabpanel', 'the workspace should expose role=tabpanel');
  assert.match(String(shell.panelLabelledBy || ''), /^sx-tab-/, 'the panel should be labelled by its owning tab');
  assert.equal(shell.holdButton, true, 'the Hold readout should open the cargo manifest (there is no Hold tab)');
  assert.equal(shell.readouts.length, 3, 'Hull, Fuel, and Hold should each be a global instrument');
  assert.deepEqual(shell.readouts.map((readout) => readout.label), ['Hull', 'Fuel', 'Hold'],
    'global status instruments should name their systems without relying on tiny icons');
  assert.ok(shell.readouts.every((readout) => readout.trackWidth >= 60),
    'global status tracks should be substantial enough to scan: ' + JSON.stringify(shell.readouts));
  assert.match(shell.readouts[2].value, /\d+\s*\/\s*\d+\s*u/i,
    'Hold should expose used and total capacity, got: ' + shell.readouts[2].value);
  assert.equal(shell.commsToggle, true, 'Station Comms should expose its session ledger control');

  assert.deepEqual(shell.acts.map((a) => a.id), DOCK_ACTIONS, 'dock actions should be repair/refuel/resupply/undock');
  for (const act of shell.acts) {
    assert.ok(act.cost && act.cost.trim(), 'dock action should surface a live cost/state label: ' + act.id);
  }
  const undock = shell.acts.find((a) => a.id === 'undock');
  assert.match(undock.cost.trim(), /^(READY|CHECK|RISK)$/, 'Undock should surface departure readiness, got: ' + undock.cost);

  // ---- kinetic field: distance response, equilibrium selection, and reduced-motion parity ----
  const marketTile = page.locator('[data-screen="station"] .sx-tile[data-nav="market"]');
  const marketBox = await marketTile.boundingBox();
  assert.ok(marketBox, 'Market tile should expose a pointer target for the magnetic field');
  await page.mouse.move(marketBox.x + marketBox.width / 2, marketBox.y + marketBox.height / 2);
  await page.waitForTimeout(100);
  const kinetic = await page.evaluate(() => [...document.querySelectorAll('[data-screen="station"] .sx-tile')].map((tile) => ({
    id: tile.getAttribute('data-nav') || tile.getAttribute('data-act'),
    scale: Number(tile.style.getPropertyValue('--dock-scale')),
    lift: tile.style.getPropertyValue('--dock-lift'),
  })));
  const marketMotion = kinetic.find((entry) => entry.id === 'market');
  const shipworksMotion = kinetic.find((entry) => entry.id === 'shipworks');
  const undockMotion = kinetic.find((entry) => entry.id === 'undock');
  assert.ok(marketMotion.scale > 1.25 && parseFloat(marketMotion.lift) < -10,
    'pointer target should respond physically, got: ' + JSON.stringify(marketMotion));
  assert.ok(marketMotion.scale <= 1.32 && parseFloat(marketMotion.lift) >= -13,
    'dock response should stay controlled rather than ballooning: ' + JSON.stringify(marketMotion));
  assert.ok(shipworksMotion.scale > 1.01 && shipworksMotion.scale < marketMotion.scale,
    'magnetic response should yield through neighboring items, got: ' + JSON.stringify(shipworksMotion));
  assert.ok(Math.abs(undockMotion.scale - 1) < 0.01,
    'far dock actions should remain seated, got: ' + JSON.stringify(undockMotion));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(80);
  const seated = await page.evaluate(() => [...document.querySelectorAll('[data-screen="station"] .sx-tile')].map((tile) => ({
    scale: Number(tile.style.getPropertyValue('--dock-scale')),
    selected: tile.getAttribute('aria-selected'),
    hasSeat: !!tile.querySelector('.sx-tile__seat'),
  })));
  assert.ok(seated.every((entry) => Math.abs(entry.scale - 1) < 0.001),
    'the field should return every tile to equilibrium after pointer leave: ' + JSON.stringify(seated));
  assert.ok(seated.find((entry) => entry.selected === 'true' && entry.hasSeat),
    'selection should be carried by a stable physical seat, not frozen hover magnification');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(marketBox.x + marketBox.width / 2, marketBox.y + marketBox.height / 2);
  await page.waitForTimeout(80);
  const reducedScales = await page.evaluate(() => [...document.querySelectorAll('[data-screen="station"] .sx-tile')]
    .map((tile) => Number(tile.style.getPropertyValue('--dock-scale'))));
  assert.ok(reducedScales.every((scale) => Math.abs(scale - 1) < 0.001),
    'reduced motion should keep the command dock composed and static: ' + JSON.stringify(reducedScales));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(5, 5);

  // ---- first-dock handoff (the opening docked route guides a new player) ----
  const handoff = await page.evaluate(() => {
    const strip = document.querySelector('[data-screen="station"] .sx-handoff:not([hidden])');
    return {
      visible: !!strip,
      text: strip ? (strip.textContent || '').replace(/\s+/g, ' ').trim() : '',
      steps: [...document.querySelectorAll('[data-screen="station"] .sx-hstep')].map((b) => ({
        target: b.getAttribute('data-handoff'),
        label: b.getAttribute('aria-label'),
      })),
    };
  });
  assert.equal(handoff.visible, true, 'first dock should show the handoff guidance strip');
  assert.ok(handoff.steps.length >= 3, 'first-dock handoff should expose cargo, jobs and launch steps: ' + JSON.stringify(handoff.steps));
  assert.ok(handoff.steps.every((s) => s.label), 'handoff steps need accessible labels: ' + JSON.stringify(handoff.steps));
  assert.ok(handoff.steps.every((s) => DESTINATIONS.includes(s.target)),
    'handoff steps must route to real destinations: ' + JSON.stringify(handoff.steps));
  assert.ok(handoff.steps.some((s) => s.target === 'contracts'), 'handoff should route the jobs step to Contracts');

  // handoff steps actually navigate
  await clickAndExpectNav(page, '[data-screen="station"] .sx-hstep[data-handoff="contracts"]', 'contracts');

  // ---- keyboard: roving tabindex + arrows/Home/End, Enter/Space activate ----
  await focusNav(page, 'market');
  await pressAndExpectNav(page, 'End', 'ledger');
  await pressAndExpectNav(page, 'Home', 'market');
  await pressAndExpectNav(page, 'ArrowRight', 'shipworks');
  await pressAndExpectNav(page, 'ArrowRight', 'industry');
  await pressAndExpectNav(page, 'ArrowLeft', 'shipworks');
  await focusNav(page, 'factions');
  await pressAndExpectNav(page, 'Enter', 'factions');
  await focusNav(page, 'contracts');
  await pressAndExpectNav(page, ' ', 'contracts');

  // ---- mini-game depth: object focus and task-preserving cross-system handoffs ----
  await clickAndExpectNav(page, '[data-screen="station"] .sx-tile[data-nav="shipworks"]', 'shipworks');
  await page.waitForSelector('[data-screen="station"] [data-spatial-slot]', { timeout: 15000 });
  await page.locator('[data-screen="station"] [data-spatial-slot]').first().focus();
  await page.keyboard.press('Enter');
  await waitForVisible(page, '[data-screen="station"] .sx-sw__chooser.is-open', 5000, 'anchored compatible-module tray');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-screen="station"] .sx-sw__chooser.is-open'), null, { timeout: 3000 });

  await clickAndExpectNav(page, '[data-screen="station"] .sx-tile[data-nav="industry"]', 'industry');
  const missingCommodity = await page.evaluate(() => {
    const source = document.querySelector('[data-screen="station"] [data-source-cmdty]');
    return source && source.getAttribute('data-source-cmdty');
  });
  assert.ok(missingCommodity, 'Industry should expose a real missing-input source action in the empty starting hold');
  await domClick(page, `[data-screen="station"] [data-source-cmdty="${missingCommodity}"]`);
  await waitForNav(page, 'market', 'Industry missing-input source action');
  await page.waitForFunction((commodityId) => {
    const active = document.querySelector('[data-screen="station"] .sx-mkt-row.is-active');
    const buy = document.querySelector('[data-screen="station"] [data-mode="buy"].is-on');
    return !!(active && active.getAttribute('data-cmdty') === commodityId && buy);
  }, missingCommodity, { timeout: 5000 });

  await clickAndExpectNav(page, '[data-screen="station"] .sx-tile[data-nav="factions"]', 'factions');
  const relationTarget = await page.evaluate(() => {
    const node = document.querySelector('[data-screen="station"] .sx-fac-node[data-fac]');
    return node && node.getAttribute('data-fac');
  });
  assert.ok(relationTarget, 'the selected station authority should expose consequential faction links');
  await domClick(page, `[data-screen="station"] .sx-fac-node[data-fac="${relationTarget}"]`);
  await page.waitForFunction((factionId) => {
    const active = document.querySelector('[data-screen="station"] .sx-fac-row.is-active');
    return !!(active && active.getAttribute('data-fac') === factionId);
  }, relationTarget, { timeout: 3000 });

  await clickAndExpectNav(page, '[data-screen="station"] .sx-tile[data-nav="bar"]', 'bar');
  const leadId = await page.evaluate(() => {
    const lead = document.querySelector('[data-screen="station"] [data-inspect]');
    return lead && lead.getAttribute('data-inspect');
  });
  assert.ok(leadId, 'the contact table should expose at least one inspectable live contract lead');
  await domClick(page, `[data-screen="station"] [data-inspect="${leadId}"]`);
  await waitForNav(page, 'contracts', 'Bar lead inspection');
  await page.waitForFunction((missionId) => {
    const active = document.querySelector('[data-screen="station"] .sx-ct-row.is-active');
    return !!(active && active.getAttribute('data-mid') === missionId);
  }, leadId, { timeout: 5000 });

  // ---- departure check: not-ready launch must surface the risks, never strand the player ----
  await page.evaluate(() => { const f = window.SF.state.fuel; if (f && f.max) f.current = Math.max(1, Math.round(f.max * 0.08)); });
  await domClick(page, '[data-screen="station"] .sx-tile[data-act="undock"]');
  await page.waitForFunction(() => !!document.querySelector('.sx-pop--dep'), null, { timeout: 5000 });
  const gate = await page.evaluate(() => ({
    docked: window.SF.state.ui.docked,
    status: (document.querySelector('.sx-pop--dep .sx-pop__head em') || {}).textContent || '',
    chips: [...document.querySelectorAll('.sx-pop--dep .sx-depchip')].map((c) => ({
      text: (c.textContent || '').replace(/\s+/g, ' ').trim(),
      label: c.getAttribute('aria-label'),
      tag: c.tagName,
    })),
    launch: !!document.querySelector('.sx-pop--dep [data-pop-launch]'),
  }));
  assert.equal(gate.docked, true, 'a not-ready launch must NOT undock — it must surface the Departure Check first');
  assert.match(gate.status.trim(), /^(CHECK|RISK)$/, 'Departure Check should report CHECK or RISK, got: ' + gate.status);
  assert.ok(gate.chips.length >= 4, 'Departure Check should list route/track, hold, fuel and hull: ' + JSON.stringify(gate.chips));
  assert.ok(gate.chips.some((c) => /fuel/i.test(c.text)), 'Departure Check should name the low-fuel risk: ' + JSON.stringify(gate.chips));
  assert.ok(gate.chips.every((c) => c.tag === 'BUTTON' && c.label),
    'Departure Check chips should be labelled buttons that jump to the fix: ' + JSON.stringify(gate.chips));
  assert.equal(gate.launch, true, 'Departure Check must still allow "Launch Anyway"');

  // Launch Anyway really undocks.
  await domClick(page, '.sx-pop--dep [data-pop-launch]');
  await page.waitForFunction(() => window.SF.state.ui.docked === false, null, { timeout: 6000 });

  assert.deepEqual(issues.errorIssues(), [], 'station dock probe should not record page errors');
  console.log('Station command dock OK: New Game -> dock -> 7 destinations (pointer + keyboard) -> first-dock handoff -> Departure Check -> undock');
  console.log('Dock target:', dockTarget.stationId);
} catch (err) {
  if (typeof issues !== 'undefined' && issues) console.error('Captured page issues during run:', issues.issues);
  throw err;
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

// ---- helpers ----
async function domClick(page, selector) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
  assert.equal(ok, true, 'probe should be able to click: ' + selector);
}

async function clickAndExpectNav(page, selector, expected) {
  await domClick(page, selector);
  await waitForNav(page, expected, 'click ' + selector);
}

async function focusNav(page, navId) {
  const ok = await page.evaluate((wanted) => {
    const tab = document.querySelector(`[data-screen="station"] .sx-dock [data-nav="${wanted}"]`);
    if (!tab) return false;
    tab.focus();
    return document.activeElement === tab;
  }, navId);
  assert.equal(ok, true, 'probe should be able to focus destination: ' + navId);
}

async function pressAndExpectNav(page, key, expected) {
  await page.keyboard.press(key === ' ' ? 'Space' : key);
  await waitForNav(page, expected, 'key ' + key);
}

async function waitForNav(page, expected, source) {
  await page.waitForFunction((wanted) => {
    const snap = window.dockSnapshot ? window.dockSnapshot() : null;
    return !!(snap && snap.activeNav === wanted && snap.selectedCount === 1 && snap.tabbableCount === 1);
  }, expected, { timeout: 5000 }).catch(async (err) => {
    const snap = await page.evaluate(() => window.dockSnapshot());
    throw new Error(`Command dock ${source} did not select ${expected}: ${err.message}\n${JSON.stringify(snap, null, 2)}`);
  });
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
  return page.evaluate((wanted) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const exact = [...document.querySelectorAll('button')].find((b) => normalize(b.textContent) === normalize(wanted));
    const button = exact || [...document.querySelectorAll('button')].find((b) => normalize(b.textContent).includes(normalize(wanted)));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}

async function startFreshServer() {
  const port = await findFreePort(8150);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) if (await isPortFree(port)) return port;
  throw new Error('No free local port found for the station dock runtime check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try { const res = await fetch(url, { method: 'GET' }); return !!res.ok; } catch (_) { return false; }
}
