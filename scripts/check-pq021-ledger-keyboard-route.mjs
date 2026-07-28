#!/usr/bin/env node
// check-pq021-ledger-keyboard-route.mjs — the two ORDINARY read routes, in the live game, headless.
//
// This is NOT the broker route cell. It issues no claim, writes no acceptance receipt, and consumes
// no acceptance quota — scripts/probe-pq021-ledger-route.mjs remains unrun while PQ-034 holds the
// validation-broker / browser-gpu leases. What this does is narrower and cheap:
//
//   1. prove the flight keyboard route reaches the Ledger:  K -> Codex -> Ledger tab
//   2. prove the station route reaches the same panel:      dock -> Ledger destination
//   3. prove the five pages can be EARNED inside the live runtime through the ordinary operation API
//
// It exists because the route harness depends on live-game selectors and a live-registry earning
// path that no headless test had ever exercised. Shipping an unrun harness built on unvalidated
// selectors would be a harness that fails the moment the lease frees, for reasons that have nothing
// to do with the Ledger. Booting the game headlessly is already routine here
// (scripts/check-station-tab-navigation-runtime.mjs does it on every run).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { CATHEDRAL_ROUTE } from '../test/pq021-cathedral-route-harness.mjs';
import { WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS } from '../src/data/wreckCathedralEvidenceCatalog.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'pq021');
const SITE_ID = 'world_site_wreck_cathedral';
const SECTOR_ID = 'sector_ceres_belt';
const START_TIMEOUT_MS = 90_000;
const STEP_TIMEOUT_MS = 20_000;

const { chromium } = await loadPlaywright();
let server = null;
let browser = null;
const report = {};
const failures = [];

const check = (label, fn) => {
  try { fn(); } catch (err) { failures.push(`${label}: ${err && err.message ? err.message : String(err)}`); }
};

async function waitVisible(page, selector, label, timeout = STEP_TIMEOUT_MS) {
  try {
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 10;
    }, selector, { timeout });
  } catch (_) {
    throw new Error(`${label} never became visible (${selector})`);
  }
}

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });

  // ---- boot a real run through the ordinary main-menu route -------------------------------------
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx,
    null, { timeout: 15_000 });
  await waitVisible(page, '[data-screen="mainMenu"]', 'main menu');
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((b) => (b.textContent || '').trim() === 'New Game').click());
  await waitVisible(page, '[data-screen="newGame"] .sf-ng-route', 'new-game rail');
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((b) => (b.textContent || '').trim() === 'Launch').click());
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });

  // ---- earn the five pages in the LIVE runtime through the ordinary operation API ---------------
  const earning = await page.evaluate(async ({ route, sectorId, siteId }) => {
    const sf = window.SF;
    const sites = sf.ctx && sf.ctx.registry && sf.ctx.registry.get && sf.ctx.registry.get('asteroidSites');
    if (!sites || typeof sites.applyWorldSiteBeamOperation !== 'function') {
      return { ok: false, reason: 'asteroidSites unreachable from the live registry' };
    }
    // Declared shortcut: travel only. Arriving mints nothing; it materializes the site's entities so
    // the payload can be physically delivered.
    //
    // Use the game's OWN intentional-jump entry point rather than assigning currentSectorId. The
    // world system owns that field (src/systems/world.js:404) and re-derives it, so a forced
    // assignment is reverted on the next frame and the Ceres entities are despawned again — which is
    // exactly how the first version of this check failed, with the payload missing at settlement.
    const world = sf.ctx.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') {
      return { ok: false, reason: 'the world system exposes no enterSector entry point' };
    }
    world.enterSector(sectorId, { fromJump: true });
    for (let i = 0; i < 40 && sf.state.world.currentSectorId !== sectorId; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (sf.state.world.currentSectorId !== sectorId) {
      return { ok: false, reason: `the world stayed in ${sf.state.world.currentSectorId}` };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    const record = () => sf.state.sites && sf.state.sites.worldById && sf.state.sites.worldById[siteId];
    if (!record()) return { ok: false, reason: 'the Cathedral record never materialized in Ceres' };
    const live = (worldRecordId) => [...sf.state.entities.values()].filter((entity) => entity
      && entity.alive !== false && entity.data && entity.data.worldRecordId === worldRecordId);

    let tick = Math.max(600, (sf.state.tick | 0) + 600);
    for (const step of route) {
      if (step.towPayloadId) {
        // Give the owner a frame to materialize the released payload before towing it.
        for (let i = 0; i < 20 && !live(`${siteId}/payload/${step.towPayloadId}`)[0]; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const payload = live(`${siteId}/payload/${step.towPayloadId}`)[0];
        const receiver = live(`${siteId}/component/${step.componentId}`)[0];
        if (!payload || !receiver) {
          const worldIds = [...sf.state.entities.values()]
            .filter((entity) => entity && entity.alive !== false && entity.data && entity.data.worldSiteId === siteId)
            .map((entity) => entity.data.worldRecordId);
          return {
            ok: false,
            reason: `payload/receiver missing for ${step.operationId}`,
            sector: sf.state.world.currentSectorId,
            payloadStatus: record().payloads && record().payloads[step.towPayloadId]
              && record().payloads[step.towPayloadId].status,
            liveWorldRecordIds: worldIds,
          };
        }
        payload.pos = { x: receiver.pos.x, z: receiver.pos.z };
        payload.vel = { x: 0, z: 0 };
      }
      for (const amount of step.partials || [step.threshold]) {
        sf.state.tick = tick;
        if (Number.isFinite(sf.state.simTime)) sf.state.simTime = tick / 60;
        const applied = sites.applyWorldSiteBeamOperation({
          siteId, componentId: step.componentId, verb: step.verb, amount,
          requestStreamId: 'player-industrial-beam', requestSequence: tick, tick,
        });
        if (!applied.ok || applied.duplicate || !(applied.moved > 0)) {
          return { ok: false, reason: `${step.operationId}: ${applied.reason || 'no progress'}` };
        }
        tick += 120;
      }
      if (!record().completedOperations[step.operationId]) {
        return { ok: false, reason: `${step.operationId} did not complete durably` };
      }
    }
    return {
      ok: true,
      pageIds: Object.keys(record().evidenceReceiptsByPageId).sort(),
      stageId: record().stageId,
    };
  }, { route: CATHEDRAL_ROUTE.map((step) => ({ ...step })), sectorId: SECTOR_ID, siteId: SITE_ID });
  report.earning = earning;

  check('the five pages can be earned inside the live runtime', () => {
    assert.equal(earning.ok, true, `live earning failed: ${earning.reason}`);
    assert.deepEqual(earning.pageIds, [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS].sort());
    assert.equal(earning.stageId, 'archived');
  });
  if (!earning.ok) throw new Error(`live earning failed: ${earning.reason}`);

  // ---- route 1: flight keyboard — K -> Codex -> Ledger tab --------------------------------------
  await page.keyboard.press('k');
  await waitVisible(page, '[data-screen="codex"]', 'codex screen after pressing K');
  const codexTabs = await page.evaluate(() => [...document.querySelectorAll('[data-screen="codex"] .sf-tabbar .sf-tab')]
    .map((button) => (button.textContent || '').trim()));
  check('K opens the Codex and the Codex offers a Ledger tab', () => {
    assert.ok(codexTabs.includes('Ledger'), `codex tabs: ${codexTabs.join(', ')}`);
  });
  await page.evaluate(() => [...document.querySelectorAll('[data-screen="codex"] .sf-tabbar .sf-tab')]
    .find((button) => (button.textContent || '').trim() === 'Ledger').click());
  await waitVisible(page, '[data-screen="codex"] .st-ledger', 'Ledger panel inside the Codex');
  const flight = await readPanel(page, '[data-screen="codex"] .st-ledger');
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, 'keyboard-route-codex-ledger.png') });
  report.flight = flight;

  // ---- route 2: station — dock -> Ledger destination ---------------------------------------------
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: STEP_TIMEOUT_MS });
  const stationId = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList && sf.state.entityList.find((entity) => entity
      && entity.alive !== false && entity.type === 'station' && entity.data
      && entity.data.stationId && !entity.data.isGate);
    if (!station) return null;
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return station.data.stationId;
  });
  if (!stationId) throw new Error('no dockable station was reachable');
  await waitVisible(page, '[data-screen="station"] .sx-dock', 'command dock');
  await page.evaluate(() => document.querySelector('[data-screen="station"] .sx-dock [data-nav="ledger"]').click());
  await waitVisible(page, '[data-screen="station"] .st-ledger', 'Ledger panel inside the station');
  const station = await readPanel(page, '[data-screen="station"] .st-ledger');
  await page.screenshot({ path: path.join(OUT_DIR, 'keyboard-route-station-ledger.png') });
  report.station = station;

  check('both ordinary routes reach the same five earned pages', () => {
    for (const host of [flight, station]) {
      // A real run also projects the other receipt families (trade, loss, witness, ...), so the
      // panel legitimately shows more than five rows. Exactly five of them must be evidence pages.
      const evidence = host.rows.filter((row) => row.pageId);
      assert.equal(evidence.length, 5,
        `${host.labelledBy}: ${evidence.length} evidence rows of ${host.rows.length} total`);
      assert.deepEqual(evidence.map((row) => row.pageId).sort(),
        [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS].sort());
      assert.equal(host.images, 1, 'exactly one bounded figure per host');
    }
    assert.deepEqual(flight.rows, station.rows,
      'the two routes must present identical rows, evidence and non-evidence alike');
    assert.equal(flight.labelledBy, 'st-ledger-codex-title');
    assert.equal(station.labelledBy, 'st-ledger-station-title');
  });

  check('the evidence figure is bounded on the live station route', () => {
    assert.ok(station.figure.renderedWidth > 0 && station.figure.renderedWidth <= 900,
      `station figure rendered at ${station.figure.renderedWidth}px`);
    const natural = station.figure.naturalWidth / station.figure.naturalHeight;
    const rendered = station.figure.renderedWidth / station.figure.renderedHeight;
    assert.ok(Math.abs(rendered - natural) / natural <= 0.01,
      `live station crop is lossy: ${station.figure.naturalWidth}x${station.figure.naturalHeight}`
      + ` -> ${station.figure.renderedWidth}x${station.figure.renderedHeight}`);
    assert.equal(station.figure.figureState, 'admitted');
    assert.ok(station.figure.alt, 'the live figure carries alt text');
  });

  writeFileSync(path.join(OUT_DIR, 'keyboard-route.json'), `${JSON.stringify(report, null, 2)}\n`);
} catch (err) {
  failures.push(err && err.message ? err.message : String(err));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}

if (failures.length) {
  console.error('PQ-021 live read-route check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('PQ-021 live read-route check OK');
  console.log(`  earned in-runtime   ${report.earning.pageIds.length} pages, stage ${report.earning.stageId}`);
  console.log(`  flight route        K -> Codex -> Ledger tab -> ${report.flight.rows.filter((r) => r.pageId).length} evidence of ${report.flight.rows.length} rows`);
  console.log(`  station route       dock -> Ledger destination -> ${report.station.rows.filter((r) => r.pageId).length} evidence of ${report.station.rows.length} rows`);
  console.log(`  live figure         ${report.station.figure.naturalWidth}x${report.station.figure.naturalHeight}`
    + ` -> ${report.station.figure.renderedWidth}x${report.station.figure.renderedHeight}`);
  console.log('  report              .devshots/pq021/keyboard-route.json');
}

async function readPanel(page, selector) {
  return page.evaluate(async (sel) => {
    const root = document.querySelector(sel);
    const rows = [...root.querySelectorAll('.st-ledger-entry')].map((li) => ({
      cycle: li.querySelector('.st-ledger-cycle').textContent,
      line: li.querySelector('.st-ledger-line').textContent,
      pageId: li.querySelector('[data-ledger-evidence]')
        ? li.querySelector('[data-ledger-evidence]').getAttribute('data-ledger-evidence') : null,
    }));
    const opener = root.querySelector('[data-ledger-evidence]');
    let figure = null;
    if (opener) {
      opener.click();
      const img = root.querySelector('.st-ledger-figure-img');
      await new Promise((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 20_000);
      });
      const rect = img.getBoundingClientRect();
      figure = {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
        alt: img.getAttribute('alt'),
        figureState: root.querySelector('.st-ledger-figure').getAttribute('data-ledger-figure-state'),
      };
      root.querySelector('[data-ledger-back]').click();
    }
    return {
      labelledBy: root.getAttribute('aria-labelledby'),
      rows,
      images: root.querySelectorAll('img').length,
      figure,
    };
  }, selector);
}

// ---- local dev server ----------------------------------------------------------------------------

async function startFreshServer() {
  const port = await findFreePort(8290);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + String(chunk)).slice(-4000); });
  child.stderr.on('data', (chunk) => { output = (output + String(chunk)).slice(-4000); });
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode != null) throw new Error(`Dev server exited before becoming reachable\n${output}`);
    if (await reachable(url)) return { baseUrl: url, kill: () => child.kill() };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${url}\n${output}`);
}

async function reachable(url) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok || response.status === 404;
  } catch (_) {
    return false;
  }
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port += 1) if (await isPortFree(port)) return port;
  throw new Error('No free local port found for the PQ-021 live read-route check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
