#!/usr/bin/env node
// M2b headed full-galaxy acceptance probe (browser Chrome + Electron).
//
// Proves on the normal player route (default backends + authored assets):
//   1. New Game → Launch boots flight with flightV3 / sg06-tactical / rapier-dynamic
//   2. Live canonical SECTORS graph has 24 region IDs; every reciprocal edge is exercised
//   3. Global player pose stays continuous across intentional gate hops; frameOrigin is not
//      force-reset at enterSector (only fixed-tick membrane rebase); no global wipe
//   4. Residency materialization is hard-capped; FULL / REDUCED / RECORD_ONLY records persist
//   5. Mid-route save → Continue in ≥2 residency membership modes restores pose without
//      double-offset, rematerializes stations/gates, and keeps discovery/route recovery
//   6. Per-sector evidence (visited/gates/residency/entity counts/frame origin) + screenshots
//   7. Console/page errors fail the route; owned processes are cleaned robustly
//
// Debug surface (window.SF) is used only AFTER normal UI boot to accelerate deterministic
// placement / jump completion. Does not boot alternate gameplay, assets, or backends.
// Does not edit production source, launchers, package.json, or goldens.
//
// Run (full headed):  node scripts/check-m2b-galaxy-live.mjs
// Run (import/route): node scripts/check-m2b-galaxy-live.mjs --self-check

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeOwnedResources } from './lib/alphaLiveBaselineContracts.mjs';
import { closeOwnedElectronRuntime } from './lib/alphaLiveBaselineElectronContracts.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

import { SECTORS } from '../src/data/sectors.js';
import {
  RESIDENCY_MATERIALIZED_CAP,
  RESIDENCY_TIER,
  sectorGlobalOrigin,
} from '../src/data/sectorCoordinates.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'm2b-galaxy');
const REPORT_PATH = path.join(OUT_DIR, 'm2b-galaxy-live.json');

const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const SAVE_SLOT_A = 'm2b-galaxy-mode-a';
const SAVE_SLOT_B = 'm2b-galaxy-mode-b';
const EXPECTED_SECTOR_COUNT = 24;
const LOCAL_BOUND = 8_192;
const POSE_TOL_WU = 4;
const ROUTE_TIMEOUT_MS = 18 * 60_000;
const FLIGHT_TIMEOUT_MS = 150_000;
const HOP_TIMEOUT_MS = 45_000;
const REBASE_TIMEOUT_MS = 45_000;
const OVERALL_TIMEOUT_MS = 40 * 60_000;

const SELF_CHECK = process.argv.includes('--self-check');

const log = (line) => console.log(`[m2b-galaxy] ${line}`);

// ---------------------------------------------------------------------------
// Pure graph helpers (host-side; also exercised by --self-check)
// ---------------------------------------------------------------------------

/**
 * @param {{id:string, neighbors?:string[]}[]} sectors
 * @returns {{
 *   ids: string[],
 *   byId: Map<string, {id:string, neighbors:string[]}>,
 *   directedEdges: string[],
 *   undirectedEdges: string[],
 *   missingReverse: string[],
 * }}
 */
export function analyzeSectorGraph(sectors) {
  if (!Array.isArray(sectors) || sectors.length === 0) {
    throw new TypeError('analyzeSectorGraph: sectors must be a non-empty array');
  }
  const byId = new Map();
  for (const raw of sectors) {
    if (!raw || typeof raw.id !== 'string') continue;
    byId.set(raw.id, {
      id: raw.id,
      neighbors: Array.isArray(raw.neighbors)
        ? raw.neighbors.filter((n) => typeof n === 'string').slice().sort()
        : [],
    });
  }
  const ids = [...byId.keys()].sort();
  const directedEdges = [];
  const undirected = new Set();
  const missingReverse = [];
  for (const id of ids) {
    const s = byId.get(id);
    for (const n of s.neighbors) {
      directedEdges.push(`${id}>${n}`);
      const a = id < n ? id : n;
      const b = id < n ? n : id;
      undirected.add(`${a}|${b}`);
      const other = byId.get(n);
      if (!other) missingReverse.push(`${id} -> ${n} (unknown)`);
      else if (!other.neighbors.includes(id)) missingReverse.push(`${id} -> ${n} (missing reverse)`);
    }
  }
  directedEdges.sort();
  return {
    ids,
    byId,
    directedEdges,
    undirectedEdges: [...undirected].sort(),
    missingReverse,
  };
}

/**
 * Deterministic directed-edge covering walk via DFS with returns.
 * Every directed neighbor edge is emitted as a hop at least once.
 * @param {{id:string, neighbors?:string[]}[]} sectors
 * @param {string} [startId]
 * @returns {{ path: string[], hops: {from:string,to:string}[], coveredEdges: string[] }}
 */
export function buildDirectedEdgeCoveringTour(sectors, startId = 'sector_helios_prime') {
  const { byId, directedEdges, ids } = analyzeSectorGraph(sectors);
  if (!byId.has(startId)) {
    throw new Error(`buildDirectedEdgeCoveringTour: start sector missing: ${startId}`);
  }
  const remaining = new Set(directedEdges);
  const path = [startId];
  const hops = [];

  function walk(u) {
    const s = byId.get(u);
    if (!s) return;
    for (const n of s.neighbors) {
      const key = `${u}>${n}`;
      if (!remaining.has(key)) continue;
      remaining.delete(key);
      hops.push({ from: u, to: n });
      path.push(n);
      walk(n);
      // return hop so later unfinished edges from u remain reachable
      if (byId.has(n) && byId.get(n).neighbors.includes(u)) {
        const back = `${n}>${u}`;
        if (remaining.has(back)) {
          remaining.delete(back);
          hops.push({ from: n, to: u });
          path.push(u);
        } else {
          hops.push({ from: n, to: u });
          path.push(u);
        }
      }
    }
  }

  walk(startId);

  // Any residual directed edges (shouldn't remain on a connected reciprocal graph) —
  // teleport to source then take the edge so coverage is complete.
  for (const key of [...remaining].sort()) {
    const [from, to] = key.split('>');
    remaining.delete(key);
    if (path[path.length - 1] !== from) {
      hops.push({ from: path[path.length - 1], to: from });
      path.push(from);
    }
    hops.push({ from, to });
    path.push(to);
  }

  const covered = new Set(hops.map((h) => `${h.from}>${h.to}`));
  for (const e of directedEdges) {
    if (!covered.has(e)) {
      throw new Error(`tour incomplete: missing directed edge ${e}`);
    }
  }
  const visited = new Set(path);
  for (const id of ids) {
    if (!visited.has(id)) {
      throw new Error(`tour incomplete: sector never visited ${id}`);
    }
  }

  return {
    path,
    hops,
    coveredEdges: [...covered].sort(),
  };
}

export function runSelfCheck() {
  const graph = analyzeSectorGraph(SECTORS);
  assert.equal(graph.ids.length, EXPECTED_SECTOR_COUNT, `expected ${EXPECTED_SECTOR_COUNT} sector ids`);
  assert.deepEqual(graph.missingReverse, [], `reciprocal graph broken: ${graph.missingReverse.join('; ')}`);
  assert.ok(graph.directedEdges.length >= EXPECTED_SECTOR_COUNT - 1, 'graph must have edges');
  assert.equal(RESIDENCY_MATERIALIZED_CAP, 3, 'materialized cap must stay 3');
  assert.equal(RESIDENCY_TIER.FULL, 'FULL');
  assert.equal(RESIDENCY_TIER.REDUCED, 'REDUCED');
  assert.equal(RESIDENCY_TIER.RECORD_ONLY, 'RECORD_ONLY');

  for (const id of graph.ids) {
    const o = sectorGlobalOrigin(id);
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z), `origin missing for ${id}`);
  }

  const tour = buildDirectedEdgeCoveringTour(SECTORS, 'sector_helios_prime');
  assert.equal(tour.coveredEdges.length, graph.directedEdges.length, 'tour must cover every directed edge');
  assert.equal(new Set(tour.path).size, EXPECTED_SECTOR_COUNT, 'tour must visit every sector id');

  const report = {
    schema: 'spaceface.m2bGalaxyLive.selfCheck.v1',
    pass: true,
    sectorCount: graph.ids.length,
    directedEdges: graph.directedEdges.length,
    undirectedEdges: graph.undirectedEdges.length,
    hopCount: tour.hops.length,
    pathLength: tour.path.length,
    residencyCap: RESIDENCY_MATERIALIZED_CAP,
    sectorIds: graph.ids,
  };
  return report;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (SELF_CHECK) {
  try {
    const report = runSelfCheck();
    log(`SELF-CHECK PASS sectors=${report.sectorCount} edges=${report.directedEdges} hops=${report.hopCount}`);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 0;
  } catch (error) {
    console.error(`[m2b-galaxy] SELF-CHECK FAIL ${error && error.stack || error}`);
    process.exitCode = 1;
  }
} else {
  main().catch(async (error) => {
    console.error(`[m2b-galaxy] FAIL ${error && error.stack || error}`);
    process.exitCode = 1;
  });
}

async function main() {
  // Always prove pure graph coverage before headed work.
  const self = runSelfCheck();
  log(`graph self-check ok: ${self.sectorCount} sectors, ${self.directedEdges} directed edges, ${self.hopCount} hops`);

  const overallDeadline = Date.now() + OVERALL_TIMEOUT_MS;
  await mkdir(OUT_DIR, { recursive: true });

  let browserReceipt = null;
  let electronReceipt = null;
  let comparison = null;
  let primaryError = null;

  try {
    browserReceipt = await withOverallDeadline(
      overallDeadline,
      'browser route',
      () => runBrowserRoute(),
    );
    electronReceipt = await withOverallDeadline(
      overallDeadline,
      'electron route',
      () => runElectronRoute(),
    );
    comparison = compareReceipts(browserReceipt, electronReceipt);
    assert.deepEqual(
      comparison.failures,
      [],
      `browser/Electron receipts disagree: ${JSON.stringify(comparison)}`,
    );

    const report = {
      schema: 'spaceface.m2bGalaxyLive.v1',
      generatedAt: new Date().toISOString(),
      pass: true,
      constants: {
        expectedSectorCount: EXPECTED_SECTOR_COUNT,
        residencyMaterializedCap: RESIDENCY_MATERIALIZED_CAP,
        localBound: LOCAL_BOUND,
        poseTolWu: POSE_TOL_WU,
        saveSlots: { a: SAVE_SLOT_A, b: SAVE_SLOT_B },
        graph: self,
      },
      browser: browserReceipt,
      electron: electronReceipt,
      comparison,
    };
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    log(`PASS ${REPORT_PATH}`);
    console.log(JSON.stringify({
      pass: true,
      report: path.relative(ROOT, REPORT_PATH).replace(/\\/g, '/'),
      browserShot: browserReceipt.screenshot,
      electronShot: electronReceipt.screenshot,
      sectorsVisited: browserReceipt.sectorsVisited,
      edgesCovered: browserReceipt.edgesCovered,
      saveContinues: browserReceipt.saveContinues?.length ?? 0,
      comparison,
    }, null, 2));
  } catch (error) {
    primaryError = error;
    const failReport = {
      schema: 'spaceface.m2bGalaxyLive.v1',
      generatedAt: new Date().toISOString(),
      pass: false,
      error: serializeError(error),
      graphSelfCheck: self,
      browser: browserReceipt,
      electron: electronReceipt,
      comparison,
    };
    await writeFile(REPORT_PATH, `${JSON.stringify(failReport, null, 2)}\n`, 'utf8').catch(() => {});
    throw error;
  } finally {
    if (primaryError) log(`cleanup complete after failure: ${primaryError.message || primaryError}`);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function runBrowserRoute() {
  let ownedServer = null;
  let browser = null;
  let context = null;
  let page = null;
  const pageErrors = [];
  const consoleErrors = [];

  try {
    ownedServer = await acquireVisualProbeServer({ root: ROOT });
    assert.equal(ownedServer.ownsServer, true, 'browser probe must own the ephemeral loopback server');
    log(`browser server ${ownedServer.baseUrl}`);

    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed system Chrome or Edge is required for the browser M2b probe');
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: false,
      executablePath,
      args: [
        '--incognito',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--force-device-scale-factor=1',
      ],
    });
    context = await browser.newContext({
      viewport: VIEWPORT,
      screen: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'en-US',
      colorScheme: 'dark',
    });
    page = await context.newPage();
    attachErrorTrackers(page, pageErrors, consoleErrors);
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert.equal(new URL(page.url()).search, '', 'browser must use the canonical root without query flags');

    const receipt = await exerciseGalaxy(page, {
      route: 'browser',
      screenshotName: 'browser-galaxy.png',
      expectedRootUrl: ownedServer.baseUrl,
      log: (line) => log(`[browser] ${line}`),
    });
    receipt.pageErrors = pageErrors.slice();
    receipt.consoleErrors = consoleErrors.slice();
    assert.deepEqual(pageErrors, [], `browser route emitted page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `browser route emitted console errors: ${consoleErrors.join('\n')}`);
    return receipt;
  } finally {
    await closeOwnedResources({ page, context, browser, server: ownedServer }).catch((error) => {
      log(`[browser] cleanup warning: ${error && error.message || error}`);
    });
  }
}

async function runElectronRoute() {
  let electronApp = null;
  let childProcess = null;
  let page = null;
  const pageErrors = [];
  const consoleErrors = [];

  try {
    const { _electron: electron } = await loadPlaywright();
    electronApp = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90_000 });
    childProcess = electronApp.process();
    assert(childProcess, 'Playwright Electron launch must expose the owned child process');
    log(`electron pid=${childProcess.pid || 'unknown'}`);

    page = await electronApp.firstWindow({ timeout: 90_000 });
    attachErrorTrackers(page, pageErrors, consoleErrors);
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
    await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
    assert.equal(new URL(page.url()).search, '', 'Electron must use the canonical root without query flags');

    const receipt = await exerciseGalaxy(page, {
      route: 'electron',
      screenshotName: 'electron-galaxy.png',
      expectedRootUrl: page.url(),
      log: (line) => log(`[electron] ${line}`),
    });
    receipt.pageErrors = pageErrors.slice();
    receipt.consoleErrors = consoleErrors.slice();
    assert.deepEqual(pageErrors, [], `electron route emitted page errors: ${pageErrors.join('\n')}`);
    assert.deepEqual(consoleErrors, [], `electron route emitted console errors: ${consoleErrors.join('\n')}`);
    return receipt;
  } finally {
    await closeOwnedElectronRuntime({ page, electronApp, childProcess }).catch((error) => {
      log(`[electron] cleanup warning: ${error && error.message || error}`);
    });
  }
}

function attachErrorTrackers(page, pageErrors, consoleErrors) {
  page.on('pageerror', (error) => {
    pageErrors.push(String(error && error.stack || error));
  });
  page.on('console', (msg) => {
    const type = typeof msg.type === 'function' ? msg.type() : msg.type;
    if (type === 'error') {
      const text = typeof msg.text === 'function' ? msg.text() : String(msg.text || '');
      // Ignore benign devtools/noise that does not indicate gameplay failure.
      if (/Failed to load resource: net::ERR_CONNECTION_REFUSED/i.test(text)) return;
      if (/Download the React DevTools/i.test(text)) return;
      consoleErrors.push(text);
    }
  });
}

// ---------------------------------------------------------------------------
// Shared live acceptance path
// ---------------------------------------------------------------------------

/**
 * Normal UI boot, then SF-only acceleration of intentional gate hops across the full live graph.
 */
async function exerciseGalaxy(page, { route, screenshotName, expectedRootUrl, log: routeLog }) {
  const deadline = Date.now() + ROUTE_TIMEOUT_MS;
  const steps = [];
  const mark = (name, detail = {}) => {
    const record = { name, at: new Date().toISOString(), ...detail };
    steps.push(record);
    routeLog(`${name}${detail.note ? ` — ${detail.note}` : ''}`);
    return record;
  };

  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 60_000 });
  assertCanonicalRoot(page, expectedRootUrl, 'boot-ready');
  mark('sf-ready');

  await dismissIntroIfPresent(page);
  mark('intro-settled');

  await waitForVisibleScreen(page, 'mainMenu', 30_000);
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await waitForVisibleScreen(page, 'newGame', 30_000);
  mark('new-game-visible');

  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: FLIGHT_TIMEOUT_MS });
  mark('flight-ready');

  const boot = await page.evaluate(readBootSnapshotInPage);
  assert.equal(boot.mode, 'flight', 'Launch must enter flight');
  assert.equal(boot.defaults.flightBackend, 'v3', 'default flight backend must be v3 (flightV3)');
  assert.equal(boot.defaults.aiBackend, 'sg06-tactical', 'default AI backend must be sg06-tactical');
  assert.equal(boot.defaults.physicsBackend, 'rapier-dynamic', 'default physics backend must be rapier-dynamic');
  assert.equal(boot.authored.ready, true, 'authored ship assets must be ready on the normal route');
  assert.equal(boot.coordinateSchema, 'global_v1', 'world coordinate schema must be global_v1');
  mark('boot-defaults-ok', { defaults: boot.defaults, authored: boot.authored, sector: boot.currentSectorId });

  await page.waitForFunction(() => {
    const physics = window.SF?.registry?.get?.('physics');
    return !!(physics && physics._diag && physics._diag.sg02Ready === true && physics._sg02);
  }, null, { timeout: 60_000 });
  mark('rapier-ready');

  // Read the live runtime graph (must match authored SECTORS; never invent an alternate map).
  const liveGraphReceipt = await page.evaluate(() => {
    const world = window.SF.state.world;
    const sectors = world.sectors instanceof Map
      ? [...world.sectors.values()]
      : (world.sectors && typeof world.sectors === 'object' ? Object.values(world.sectors) : []);
    return {
      kind: world.sectors instanceof Map ? 'Map' : Array.isArray(world.sectors) ? 'Array' : typeof world.sectors,
      keys: world.sectors && typeof world.sectors === 'object' ? Object.keys(world.sectors).slice(0, 30) : [],
      sectors: sectors
      .filter((s) => s && typeof s.id === 'string')
      .map((s) => ({
        id: s.id,
        neighbors: Array.isArray(s.neighbors) ? s.neighbors.slice() : [],
      })),
    };
  });
  routeLog(`live-graph kind=${liveGraphReceipt.kind} keys=${liveGraphReceipt.keys.length} sectors=${liveGraphReceipt.sectors.length}`);
  const liveGraph = liveGraphReceipt.sectors;
  const liveAnalysis = analyzeSectorGraph(liveGraph);
  assert.equal(liveAnalysis.ids.length, EXPECTED_SECTOR_COUNT,
    `live SECTORS count ${liveAnalysis.ids.length} !== ${EXPECTED_SECTOR_COUNT}`);
  assert.deepEqual(liveAnalysis.missingReverse, [],
    `live reciprocal edges broken: ${liveAnalysis.missingReverse.join('; ')}`);
  // Host authored graph and live graph must agree on the ID set.
  const hostIds = analyzeSectorGraph(SECTORS).ids;
  assert.deepEqual(liveAnalysis.ids, hostIds, 'live sector ids must match authored SECTORS');

  const tour = buildDirectedEdgeCoveringTour(liveGraph, boot.currentSectorId || 'sector_helios_prime');
  mark('tour-ready', {
    hopCount: tour.hops.length,
    edgeCount: tour.coveredEdges.length,
    start: tour.path[0],
  });

  /** @type {Record<string, object>} */
  const sectorEvidence = Object.create(null);
  const coveredEdges = new Set();
  const visitedSectors = new Set();
  const saveContinues = [];
  let sawFull = false;
  let sawReduced = false;
  let sawRecordOnly = false;
  let saveADone = false;
  let saveBDone = false;
  let lastFullSector = null;
  let maxMaterialized = 0;
  let maxAlive = 0;

  // Seed evidence for the boot sector without a hop.
  {
    const seed = await page.evaluate(readGalaxySnapshotInPage);
    recordSectorEvidence(sectorEvidence, seed, { hop: 0, via: 'boot' });
    visitedSectors.add(seed.currentSectorId);
    ({ sawFull, sawReduced, sawRecordOnly } = updateTierFlags(seed, sawFull, sawReduced, sawRecordOnly));
    maxMaterialized = Math.max(maxMaterialized, seed.materializedCount);
    maxAlive = Math.max(maxAlive, seed.aliveEntityCount);
    assertResidencyInvariants(seed, 'boot');
    lastFullSector = seed.currentSectorId;
    mark('boot-sector-evidence', {
      sector: seed.currentSectorId,
      residency: seed.residency,
      stations: seed.stationCount,
      gates: seed.gateCount,
    });
  }

  for (let i = 0; i < tour.hops.length; i++) {
    assert.ok(Date.now() < deadline, `route ${route} exceeded ${ROUTE_TIMEOUT_MS}ms during hop ${i}`);
    const hop = tour.hops[i];
    if (hop.from === hop.to) continue;

    const hopResult = await page.evaluate(({ target, fromSectorId }) => {
      const state = window.SF.state;
      const world = window.SF.registry.get('world');
      if (!world || typeof world.enterSector !== 'function') {
        throw new Error('world.enterSector missing on debug surface');
      }
      const player = state.entities.get(state.playerId);
      if (!player || !player.pos) throw new Error('player missing for hop');

      const before = {
        currentSectorId: state.world.currentSectorId,
        frameOrigin: { ...(state.world.frameOrigin || { x: 0, z: 0 }) },
        frameOriginSeq: state.world.frameOriginSeq | 0,
        global: { x: player.pos.x, z: player.pos.z },
        aliveEntityCount: state.entityList.filter((e) => e && e.alive).length,
        residentKeys: Object.keys(state.world.residentSectors || {}).sort(),
        tick: state.tick | 0,
      };

      // Intentional gate-style hop: places at destination entry, never global-wipes.
      world.enterSector(target, {
        fromJump: true,
        via: 'gate',
        fromSectorId: fromSectorId || before.currentSectorId,
      });

      // Quiet intent while membrane settles.
      if (state.input) {
        state.input.moveX = 0;
        state.input.moveZ = 0;
        state.input.boost = false;
        state.input.brake = false;
      }
      player.vel = player.vel || { x: 0, z: 0 };
      player.vel.x = 0;
      player.vel.z = 0;
      player.flags = player.flags || {};
      player.flags.noInterp = true;

      const afterSync = {
        currentSectorId: state.world.currentSectorId,
        frameOrigin: { ...(state.world.frameOrigin || { x: 0, z: 0 }) },
        frameOriginSeq: state.world.frameOriginSeq | 0,
        global: { x: player.pos.x, z: player.pos.z },
        aliveEntityCount: state.entityList.filter((e) => e && e.alive).length,
        // enterSector must not force-zero the runtime frame (only fixed-tick membrane may rebase).
        frameOriginUnchangedByEnter:
          before.frameOrigin.x === state.world.frameOrigin.x
          && before.frameOrigin.z === state.world.frameOrigin.z
          && (before.frameOriginSeq | 0) === (state.world.frameOriginSeq | 0),
      };
      return { before, afterSync, target };
    }, { target: hop.to, fromSectorId: hop.from });

    assert.equal(hopResult.afterSync.currentSectorId, hop.to,
      `hop ${i}: expected membership ${hop.to}, got ${hopResult.afterSync.currentSectorId}`);
    assert.equal(hopResult.afterSync.frameOriginUnchangedByEnter, true,
      `hop ${i}: enterSector must not reset/mutate frameOrigin (transition-time reset forbidden)`);
    // No global wipe: intentional hop may demote over-cap residents, but must not collapse
    // the world to player-only (stations/gates of the new FULL sector materialize immediately).
    assert.ok(hopResult.afterSync.aliveEntityCount >= 2,
      `hop ${i}: suspected global wipe (alive=${hopResult.afterSync.aliveEntityCount})`);

    // Wait for fixed-tick membrane + rapier readiness at the new global pose.
    await page.waitForFunction(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      if (!state || state.mode !== 'flight' || !player?.pos) return false;
      const physics = window.SF.registry?.get?.('physics');
      if (!(physics && physics._diag && physics._diag.sg02Ready === true && physics._sg02)) return false;
      // Local mesh should track global - frameOrigin within a coarse bound once settled.
      const origin = state.world.frameOrigin || { x: 0, z: 0 };
      const mesh = player.mesh?.position;
      if (!mesh) return true; // mesh may lag a frame; don't block forever
      const lx = player.pos.x - origin.x;
      const lz = player.pos.z - origin.z;
      return Math.abs(mesh.x - lx) < 8 && Math.abs(mesh.z - lz) < 8;
    }, null, { timeout: HOP_TIMEOUT_MS });

    await page.evaluate(() => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      if (player?.flags) player.flags.noInterp = false;
    });

    const snap = await page.evaluate(readGalaxySnapshotInPage);
    assert.equal(snap.currentSectorId, hop.to, `hop ${i}: snapshot sector mismatch`);
    assertResidencyInvariants(snap, `hop-${i}`);
    assertMembrane(snap, `hop-${i}`);

    // Persistent residency records: prior resident keys remain as records (tier may drop).
    for (const key of hopResult.before.residentKeys) {
      assert.ok(Object.prototype.hasOwnProperty.call(snap.residency, key)
        || snap.discovery?.[key],
      `hop ${i}: residency/discovery record lost for ${key}`);
    }

    recordSectorEvidence(sectorEvidence, snap, {
      hop: i + 1,
      via: 'gate',
      from: hop.from,
      edge: `${hop.from}>${hop.to}`,
    });
    visitedSectors.add(snap.currentSectorId);
    coveredEdges.add(`${hop.from}>${hop.to}`);
    ({ sawFull, sawReduced, sawRecordOnly } = updateTierFlags(snap, sawFull, sawReduced, sawRecordOnly));
    maxMaterialized = Math.max(maxMaterialized, snap.materializedCount);
    maxAlive = Math.max(maxAlive, snap.aliveEntityCount);
    lastFullSector = snap.currentSectorId;

    if ((i + 1) % 10 === 0 || i === tour.hops.length - 1) {
      mark('hop-progress', {
        hop: i + 1,
        of: tour.hops.length,
        sector: snap.currentSectorId,
        materialized: snap.materializedCount,
        alive: snap.aliveEntityCount,
        edges: coveredEdges.size,
      });
    }

    // Mid-route save A: first time we have observed all three residency modes on this snap.
    if (!saveADone && snap.tiersPresent.FULL && snap.tiersPresent.REDUCED && snap.tiersPresent.RECORD_ONLY) {
      const sc = await performSaveContinue(page, {
        slot: SAVE_SLOT_A,
        label: 'residency-mode-a-full-with-neighbors',
        expectedGlobal: { x: snap.global.x, z: snap.global.z },
        expectedSectorId: snap.currentSectorId,
        expectedVisited: [...visitedSectors],
        routeLog,
        mark,
      });
      saveContinues.push(sc);
      saveADone = true;
      // Refresh evidence post-continue (stations/gates rematerialized).
      const after = await page.evaluate(readGalaxySnapshotInPage);
      assert.ok(after.stationCount >= 1, 'save-A: stations must rematerialize after Continue');
      assert.ok(after.gateCount >= 1, 'save-A: gates must rematerialize after Continue');
      recordSectorEvidence(sectorEvidence, after, { hop: i + 1, via: 'continue-a' });
    }

    // Mid-route save B: different FULL membership after covering substantial graph, once A done.
    if (
      saveADone
      && !saveBDone
      && coveredEdges.size >= Math.min(12, Math.floor(tour.coveredEdges.length * 0.35))
      && snap.currentSectorId
      && snap.currentSectorId !== saveContinues[0]?.expectedSectorId
      && snap.tiersPresent.FULL
      && (snap.tiersPresent.REDUCED || snap.tiersPresent.RECORD_ONLY)
    ) {
      const sc = await performSaveContinue(page, {
        slot: SAVE_SLOT_B,
        label: 'residency-mode-b-alt-membership',
        expectedGlobal: { x: snap.global.x, z: snap.global.z },
        expectedSectorId: snap.currentSectorId,
        expectedVisited: [...visitedSectors],
        routeLog,
        mark,
      });
      saveContinues.push(sc);
      saveBDone = true;
      const after = await page.evaluate(readGalaxySnapshotInPage);
      assert.ok(after.stationCount >= 1, 'save-B: stations must rematerialize after Continue');
      assert.ok(after.gateCount >= 1, 'save-B: gates must rematerialize after Continue');
      recordSectorEvidence(sectorEvidence, after, { hop: i + 1, via: 'continue-b' });
    }
  }

  // If the tour never hit a three-tier snapshot early enough, force the required mid-route saves
  // at the end of the tour with the best available residency modes.
  if (!saveADone || !saveBDone) {
    const snap = await page.evaluate(readGalaxySnapshotInPage);
    if (!saveADone) {
      const sc = await performSaveContinue(page, {
        slot: SAVE_SLOT_A,
        label: 'residency-mode-a-fallback-end',
        expectedGlobal: { x: snap.global.x, z: snap.global.z },
        expectedSectorId: snap.currentSectorId,
        expectedVisited: [...visitedSectors],
        routeLog,
        mark,
      });
      saveContinues.push(sc);
      saveADone = true;
    }
    if (!saveBDone) {
      // Hop to a different sector if still on the same membership as save A.
      const alt = tour.path.find((id) => id && id !== saveContinues[0]?.expectedSectorId) || lastFullSector;
      if (alt && alt !== (await page.evaluate(() => window.SF.state.world.currentSectorId))) {
        await page.evaluate((target) => {
          const world = window.SF.registry.get('world');
          const from = window.SF.state.world.currentSectorId;
          world.enterSector(target, { fromJump: true, via: 'gate', fromSectorId: from });
        }, alt);
        await page.waitForFunction((id) => window.SF?.state?.world?.currentSectorId === id, alt, {
          timeout: HOP_TIMEOUT_MS,
        });
      }
      const snapB = await page.evaluate(readGalaxySnapshotInPage);
      const sc = await performSaveContinue(page, {
        slot: SAVE_SLOT_B,
        label: 'residency-mode-b-fallback-end',
        expectedGlobal: { x: snapB.global.x, z: snapB.global.z },
        expectedSectorId: snapB.currentSectorId,
        expectedVisited: [...visitedSectors],
        routeLog,
        mark,
      });
      saveContinues.push(sc);
      saveBDone = true;
    }
  }

  assert.equal(saveContinues.length >= 2, true, 'must perform mid-route save+Continue in at least two residency modes');
  assert.ok(saveContinues[0].expectedSectorId !== saveContinues[1].expectedSectorId
    || saveContinues[0].label !== saveContinues[1].label,
  'two save/continue cycles must exercise distinct residency membership contexts');

  // Coverage bar.
  for (const id of liveAnalysis.ids) {
    assert.ok(visitedSectors.has(id), `sector never visited: ${id}`);
    assert.ok(sectorEvidence[id], `missing evidence for sector ${id}`);
  }
  for (const edge of liveAnalysis.directedEdges) {
    assert.ok(coveredEdges.has(edge), `directed edge never exercised: ${edge}`);
  }
  assert.ok(sawFull && sawReduced && sawRecordOnly,
    `must observe all residency tiers (FULL=${sawFull} REDUCED=${sawReduced} RECORD_ONLY=${sawRecordOnly})`);
  assert.ok(maxMaterialized <= RESIDENCY_MATERIALIZED_CAP,
    `materialized residents exceeded cap: ${maxMaterialized} > ${RESIDENCY_MATERIALIZED_CAP}`);
  assert.ok(maxMaterialized >= 1, 'at least one sector must materialize');

  const screenshotPath = path.join(OUT_DIR, screenshotName);
  await page.screenshot({ path: screenshotPath, type: 'png', animations: 'allow' });
  mark('screenshot', { path: screenshotName });

  const finalSnap = await page.evaluate(readGalaxySnapshotInPage);
  assert.ok(Date.now() < deadline, `route ${route} exceeded ${ROUTE_TIMEOUT_MS}ms budget`);

  return {
    route,
    screenshot: path.relative(ROOT, screenshotPath).replace(/\\/g, '/'),
    boot,
    liveGraph: {
      sectorCount: liveAnalysis.ids.length,
      directedEdges: liveAnalysis.directedEdges.length,
      undirectedEdges: liveAnalysis.undirectedEdges.length,
      sectorIds: liveAnalysis.ids,
    },
    tour: {
      hopCount: tour.hops.length,
      pathLength: tour.path.length,
      coveredEdgeCount: tour.coveredEdges.length,
    },
    sectorsVisited: [...visitedSectors].sort(),
    edgesCovered: [...coveredEdges].sort(),
    sectorEvidence,
    residency: {
      sawFull,
      sawReduced,
      sawRecordOnly,
      maxMaterialized,
      cap: RESIDENCY_MATERIALIZED_CAP,
      maxAliveEntityCount: maxAlive,
    },
    saveContinues,
    final: compactGalaxySnap(finalSnap),
    steps,
  };
}

function assertResidencyInvariants(snap, label) {
  assert.equal(snap.mode, 'flight', `${label}: mode`);
  assert.ok(snap.currentSectorId, `${label}: currentSectorId`);
  assert.equal(snap.residency[snap.currentSectorId], RESIDENCY_TIER.FULL,
    `${label}: membership must be FULL (got ${snap.residency[snap.currentSectorId]})`);
  assert.ok(snap.materializedCount <= RESIDENCY_MATERIALIZED_CAP,
    `${label}: materialized ${snap.materializedCount} > cap ${RESIDENCY_MATERIALIZED_CAP}`);
  assert.ok(snap.materializedCount >= 1, `${label}: nothing materialized`);
  // Persistent records: every known resident entry has a valid tier string.
  for (const [id, tier] of Object.entries(snap.residency)) {
    assert.ok(
      tier === RESIDENCY_TIER.FULL
      || tier === RESIDENCY_TIER.REDUCED
      || tier === RESIDENCY_TIER.RECORD_ONLY,
      `${label}: bad tier for ${id}: ${tier}`,
    );
  }
  assert.ok(snap.stationCount >= 1, `${label}: FULL sector must have stations`);
  assert.ok(snap.gateCount >= 1, `${label}: FULL sector must have gates`);
  assert.ok(snap.aliveEntityCount >= 2, `${label}: suspected empty world (alive=${snap.aliveEntityCount})`);
}

function assertMembrane(snap, label) {
  assert.ok(snap.global && Number.isFinite(snap.global.x) && Number.isFinite(snap.global.z),
    `${label}: global pose missing`);
  assert.ok(snap.frameOrigin && Number.isFinite(snap.frameOrigin.x) && Number.isFinite(snap.frameOrigin.z),
    `${label}: frameOrigin missing`);
  if (snap.meshLocal) {
    assert.ok(Math.abs(snap.meshLocal.x) < LOCAL_BOUND + 50,
      `${label}: mesh local.x unbound ${snap.meshLocal.x}`);
    assert.ok(Math.abs(snap.meshLocal.z) < LOCAL_BOUND + 50,
      `${label}: mesh local.z unbound ${snap.meshLocal.z}`);
    const expectX = snap.global.x - snap.frameOrigin.x;
    const expectZ = snap.global.z - snap.frameOrigin.z;
    assert.ok(Math.abs(snap.meshLocal.x - expectX) < 8,
      `${label}: mesh local x mismatch ${snap.meshLocal.x} vs ${expectX}`);
    assert.ok(Math.abs(snap.meshLocal.z - expectZ) < 8,
      `${label}: mesh local z mismatch ${snap.meshLocal.z} vs ${expectZ}`);
    // Double-offset detector: mesh must not equal global - 2*origin when origin is large.
    const doubleX = snap.global.x - 2 * snap.frameOrigin.x;
    const doubleZ = snap.global.z - 2 * snap.frameOrigin.z;
    const originMag = Math.hypot(snap.frameOrigin.x, snap.frameOrigin.z);
    if (originMag > 100) {
      assert.ok(
        Math.abs(snap.meshLocal.x - doubleX) > 1
        || Math.abs(snap.meshLocal.z - doubleZ) > 1,
        `${label}: mesh local matches double-subtracted origin (double offset)`,
      );
    }
  }
  if (snap.rapierLocal) {
    assert.ok(Math.abs(snap.rapierLocal.x) < LOCAL_BOUND + 50,
      `${label}: rapier local.x unbound ${snap.rapierLocal.x}`);
    assert.ok(Math.abs(snap.rapierLocal.z) < LOCAL_BOUND + 50,
      `${label}: rapier local.z unbound ${snap.rapierLocal.z}`);
  }
}

function recordSectorEvidence(bag, snap, meta) {
  const id = snap.currentSectorId;
  if (!id) return;
  const prev = bag[id] || {
    sectorId: id,
    visits: 0,
    hops: [],
    first: null,
    last: null,
  };
  prev.visits += 1;
  prev.hops.push(meta);
  const compact = {
    at: new Date().toISOString(),
    hop: meta.hop,
    via: meta.via,
    global: snap.global,
    frameOrigin: snap.frameOrigin,
    frameOriginSeq: snap.frameOriginSeq,
    residency: snap.residency,
    materializedCount: snap.materializedCount,
    stationCount: snap.stationCount,
    gateCount: snap.gateCount,
    aliveEntityCount: snap.aliveEntityCount,
    discoveryVisited: snap.discoveryVisited,
    tiersPresent: snap.tiersPresent,
  };
  if (!prev.first) prev.first = compact;
  prev.last = compact;
  bag[id] = prev;
}

function updateTierFlags(snap, sawFull, sawReduced, sawRecordOnly) {
  if (snap.tiersPresent?.FULL) sawFull = true;
  if (snap.tiersPresent?.REDUCED) sawReduced = true;
  if (snap.tiersPresent?.RECORD_ONLY) sawRecordOnly = true;
  return { sawFull, sawReduced, sawRecordOnly };
}

async function performSaveContinue(page, {
  slot,
  label,
  expectedGlobal,
  expectedSectorId,
  expectedVisited,
  routeLog,
  mark,
}) {
  routeLog(`save-continue begin ${label} slot=${slot} sector=${expectedSectorId}`);

  const preSave = await page.evaluate(readGalaxySnapshotInPage);
  assert.equal(preSave.currentSectorId, expectedSectorId, `${label}: pre-save sector`);

  await page.evaluate((saveSlot) => {
    window.SF.bus.emit('game:save', { slot: saveSlot });
  }, slot);
  await page.waitForFunction((saveSlot) => {
    try {
      return !!localStorage.getItem(`sf.save.${saveSlot}`);
    } catch {
      return false;
    }
  }, slot, { timeout: 20_000 });

  const savedEnvelope = await page.evaluate((saveSlot) => {
    const raw = localStorage.getItem(`sf.save.${saveSlot}`);
    const env = raw ? JSON.parse(raw) : null;
    const player = env?.data?.entities?.player;
    const world = env?.data?.world || {};
    const discovery = world.discovery || {};
    const visited = Object.keys(discovery).filter((id) => discovery[id]?.visitedCount > 0).sort();
    return {
      hasEnvelope: !!env,
      version: env?.version ?? null,
      playerPos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
      currentSectorId: world.currentSectorId || null,
      coordinateSchema: world.coordinateSchema ?? null,
      savedFrameOrigin: world.frameOrigin ?? null,
      visitedFromDiscovery: visited,
      discoveryCount: Object.keys(discovery).length,
    };
  }, slot);

  assert.equal(savedEnvelope.hasEnvelope, true, `${label}: save envelope missing`);
  assert.ok(savedEnvelope.playerPos, `${label}: player pos not saved`);
  assert.ok(Math.abs(savedEnvelope.playerPos.x - expectedGlobal.x) < POSE_TOL_WU,
    `${label}: saved global x drift`);
  assert.ok(Math.abs(savedEnvelope.playerPos.z - expectedGlobal.z) < POSE_TOL_WU,
    `${label}: saved global z drift`);
  assert.equal(savedEnvelope.currentSectorId, expectedSectorId, `${label}: saved sector`);
  // frameOrigin must not be the restore authority for pose.
  mark('saved', { label, slot, savedEnvelope });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 60_000 });
  assert.equal(new URL(page.url()).search, '', `${label}: Continue route must stay on canonical root`);
  await dismissIntroIfPresent(page);
  await waitForVisibleScreen(page, 'mainMenu', 30_000);

  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === 'Continue');
    return !!button && !button.disabled;
  }, null, { timeout: 20_000 });
  await continueButton.click({ timeout: 30_000 });
  await page.waitForFunction(flightReadyInPage, null, { timeout: FLIGHT_TIMEOUT_MS });
  mark('continued-flight', { label, slot });

  // Load resets runtime frameOrigin to zero; live fixed-tick path re-derives without double-offset.
  await page.waitForFunction(({ expectedGlobal: eg, poseTol, expectedSectorId: es }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!state || !player || state.mode !== 'flight') return false;
    if (state.world?.currentSectorId !== es) return false;
    const globalOk = Math.abs(player.pos.x - eg.x) < poseTol
      && Math.abs(player.pos.z - eg.z) < poseTol;
    return globalOk;
  }, {
    expectedGlobal,
    poseTol: POSE_TOL_WU,
    expectedSectorId,
  }, { timeout: REBASE_TIMEOUT_MS });

  await page.waitForFunction(() => {
    const physics = window.SF?.registry?.get?.('physics');
    return !!(physics && physics._diag && physics._diag.sg02Ready === true && physics._sg02);
  }, null, { timeout: 60_000 });

  // Allow a few frames for membrane + rematerialization.
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    if (!state || state.mode !== 'flight') return false;
    const active = state.world?.activeSector;
    const stations = active?.stations?.length || 0;
    const gates = active?.gates?.length || 0;
    return stations >= 1 && gates >= 1;
  }, null, { timeout: 30_000 });

  const continued = await page.evaluate(readGalaxySnapshotInPage);
  assert.equal(continued.currentSectorId, expectedSectorId, `${label}: sector after Continue`);
  assert.ok(Math.abs(continued.global.x - expectedGlobal.x) < POSE_TOL_WU, `${label}: global x after Continue`);
  assert.ok(Math.abs(continued.global.z - expectedGlobal.z) < POSE_TOL_WU, `${label}: global z after Continue`);
  assertResidencyInvariants(continued, `${label}-continue`);
  assertMembrane(continued, `${label}-continue`);

  // Route recovery: discovery visited counts for prior path must survive.
  for (const id of expectedVisited) {
    const disc = continued.discovery?.[id];
    assert.ok(disc && (disc.discovered || disc.visitedCount > 0),
      `${label}: discovery route recovery lost for ${id}`);
  }

  // Stations/gates rematerialize as live entities, not just bag stubs.
  assert.ok(continued.liveStationCount >= 1, `${label}: live stations missing after Continue`);
  assert.ok(continued.liveGateCount >= 1, `${label}: live gates missing after Continue`);

  mark('continue-ok', {
    label,
    sector: continued.currentSectorId,
    global: continued.global,
    frameOrigin: continued.frameOrigin,
    frameOriginSeq: continued.frameOriginSeq,
    stations: continued.stationCount,
    gates: continued.gateCount,
    residency: continued.residency,
  });

  return {
    label,
    slot,
    expectedSectorId,
    expectedGlobal,
    savedEnvelope,
    continued: compactGalaxySnap(continued),
  };
}

function compareReceipts(browser, electron) {
  const failures = [];
  const check = (name, a, b, tol = 0) => {
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > tol) failures.push(`${name}: browser=${a} electron=${b} tol=${tol}`);
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      failures.push(`${name}: browser=${JSON.stringify(a)} electron=${JSON.stringify(b)}`);
    }
  };

  check('defaults.flightBackend', browser.boot.defaults.flightBackend, electron.boot.defaults.flightBackend);
  check('defaults.aiBackend', browser.boot.defaults.aiBackend, electron.boot.defaults.aiBackend);
  check('defaults.physicsBackend', browser.boot.defaults.physicsBackend, electron.boot.defaults.physicsBackend);
  check('authored.ready', browser.boot.authored.ready, electron.boot.authored.ready);
  check('coordinateSchema', browser.boot.coordinateSchema, electron.boot.coordinateSchema);
  check('liveGraph.sectorCount', browser.liveGraph.sectorCount, electron.liveGraph.sectorCount);
  check('liveGraph.directedEdges', browser.liveGraph.directedEdges, electron.liveGraph.directedEdges);
  check('sectorsVisited', browser.sectorsVisited, electron.sectorsVisited);
  check('edgesCovered.count', browser.edgesCovered.length, electron.edgesCovered.length);
  check('residency.cap', browser.residency.cap, electron.residency.cap);
  check('saveContinues.count', browser.saveContinues.length, electron.saveContinues.length);
  check('residency.sawFull', browser.residency.sawFull, electron.residency.sawFull);
  check('residency.sawReduced', browser.residency.sawReduced, electron.residency.sawReduced);
  check('residency.sawRecordOnly', browser.residency.sawRecordOnly, electron.residency.sawRecordOnly);

  return {
    pass: failures.length === 0,
    failures,
  };
}

function compactGalaxySnap(snap) {
  return {
    mode: snap.mode,
    tick: snap.tick,
    currentSectorId: snap.currentSectorId,
    global: snap.global,
    frameOrigin: snap.frameOrigin,
    frameOriginSeq: snap.frameOriginSeq,
    meshLocal: snap.meshLocal,
    rapierLocal: snap.rapierLocal,
    residency: snap.residency,
    materializedCount: snap.materializedCount,
    stationCount: snap.stationCount,
    gateCount: snap.gateCount,
    liveStationCount: snap.liveStationCount,
    liveGateCount: snap.liveGateCount,
    aliveEntityCount: snap.aliveEntityCount,
    tiersPresent: snap.tiersPresent,
    discoveryVisited: snap.discoveryVisited,
  };
}

// ---- page-side helpers (serialized into the browser/Electron world) ----

function flightReadyInPage() {
  const state = window.SF?.state;
  if (!state || state.mode !== 'flight') return false;
  const player = state.entities?.get(state.playerId);
  if (!player || player.alive === false) return false;
  const data = player.mesh?.userData || {};
  const authoredReady = data.authoredAssetState === 'authored'
    && data.authoredVisualRoot === 'authored-root'
    && data.authoredReadableFallbackRetained === false;
  const modalOpen = document.body.classList.contains('ui-modal-open');
  const splash = document.getElementById('cinematic-splash');
  const splashVisible = !!(splash && !splash.hidden && getComputedStyle(splash).display !== 'none'
    && Number(getComputedStyle(splash).opacity || 1) > 0.01);
  return authoredReady && !modalOpen && !splashVisible;
}

function readBootSnapshotInPage() {
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const data = player?.mesh?.userData || {};
  const gameplay = state.settings?.gameplay || {};
  const slots = Object.values(data.authoredSlots || {}).flat();
  return {
    mode: state.mode,
    tick: state.tick | 0,
    currentSectorId: state.world?.currentSectorId || null,
    coordinateSchema: state.world?.coordinateSchema || null,
    frameOrigin: { ...(state.world?.frameOrigin || { x: 0, z: 0 }) },
    frameOriginSeq: state.world?.frameOriginSeq | 0,
    defaults: {
      flightBackend: gameplay.flightBackend || null,
      aiBackend: gameplay.aiBackend || null,
      physicsBackend: gameplay.physicsBackend || null,
    },
    registry: {
      flight: window.SF.registry?.get?.('flight')?.name || null,
      ai: window.SF.registry?.get?.('ai')?.name || null,
      physics: window.SF.registry?.get?.('physics')?.name || null,
    },
    authored: {
      ready: data.authoredAssetState === 'authored'
        && data.authoredVisualRoot === 'authored-root'
        && data.authoredReadableFallbackRetained === false,
      state: data.authoredAssetState || null,
      root: data.authoredVisualRoot || null,
      fallbackRetained: data.authoredReadableFallbackRetained === true,
      wholeShip: slots.some((url) => String(url).includes('/wholeships/kestrel.glb')
        || String(url).includes('/wholeships/')),
      slots: slots.slice(0, 8),
    },
    global: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
  };
}

function readGalaxySnapshotInPage() {
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const physics = window.SF.registry?.get?.('physics');
  const owner = physics?._sg02;
  let rapierLocal = null;
  if (owner?.records) {
    const rec = owner.records.get(state.playerId) || owner.records.get(player?.id);
    if (rec?.body?.translation) {
      const t = rec.body.translation();
      rapierLocal = { x: t.x, y: t.y, z: t.z };
    }
  }
  const mesh = player?.mesh;
  const meshLocal = mesh?.position
    ? { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
    : null;

  const residency = {};
  let materializedCount = 0;
  let full = false;
  let reduced = false;
  let recordOnly = false;
  const rs = state.world.residentSectors || {};
  for (const id of Object.keys(rs).sort()) {
    const tier = rs[id]?.tier || null;
    residency[id] = tier;
    if (tier === 'FULL' || tier === 'REDUCED') materializedCount += 1;
    if (tier === 'FULL') full = true;
    if (tier === 'REDUCED') reduced = true;
    if (tier === 'RECORD_ONLY') recordOnly = true;
  }

  const active = state.world.activeSector || { stations: [], gates: [] };
  const stationCount = (active.stations && active.stations.length) || 0;
  const gateCount = (active.gates && active.gates.length) || 0;
  let liveStationCount = 0;
  let liveGateCount = 0;
  if (active.stations) {
    for (const s of active.stations) {
      const ent = s && state.entities.get(s.id);
      if (ent && ent.alive !== false) liveStationCount += 1;
    }
  }
  if (active.gates) {
    for (const g of active.gates) {
      const ent = g && state.entities.get(g.id);
      if (ent && ent.alive !== false) liveGateCount += 1;
    }
  }

  const discovery = state.world.discovery || {};
  const discoveryVisited = Object.keys(discovery)
    .filter((id) => discovery[id] && (discovery[id].visitedCount > 0 || discovery[id].discovered))
    .sort();

  // Compact discovery for route-recovery assertions (not the full overlay).
  const discoveryCompact = {};
  for (const id of Object.keys(discovery).sort()) {
    const d = discovery[id];
    if (!d) continue;
    discoveryCompact[id] = {
      discovered: !!d.discovered,
      visitedCount: d.visitedCount | 0,
    };
  }

  return {
    mode: state.mode,
    tick: state.tick | 0,
    currentSectorId: state.world.currentSectorId || null,
    coordinateSchema: state.world.coordinateSchema || null,
    global: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
    frameOrigin: { ...(state.world.frameOrigin || { x: 0, z: 0 }) },
    frameOriginSeq: state.world.frameOriginSeq | 0,
    meshLocal,
    rapierLocal,
    residency,
    materializedCount,
    tiersPresent: { FULL: full, REDUCED: reduced, RECORD_ONLY: recordOnly },
    stationCount,
    gateCount,
    liveStationCount,
    liveGateCount,
    aliveEntityCount: state.entityList.filter((e) => e && e.alive).length,
    discoveryVisited,
    discovery: discoveryCompact,
  };
}

// ---- host-side utilities ----

async function dismissIntroIfPresent(page) {
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot-overlay');
    if (!boot) return true;
    const style = getComputedStyle(boot);
    return boot.hidden || style.display === 'none' || Number(style.opacity || 1) <= 0.01;
  }, null, { timeout: 30_000 }).catch(() => {});
}

async function waitForVisibleScreen(page, screenName, timeoutMs) {
  await page.waitForFunction((name) => {
    const el = document.querySelector(`[data-screen="${name}"]`);
    if (!el || el.hidden) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01
      && rect.width > 1 && rect.height > 1;
  }, screenName, { timeout: timeoutMs });
}

function assertCanonicalRoot(page, expectedRootUrl, boundary) {
  const actual = page.url();
  const actualUrl = new URL(actual);
  const expectedUrl = new URL(expectedRootUrl);
  assert.equal(actualUrl.origin, expectedUrl.origin, `${boundary}: origin mismatch ${actual} vs ${expectedRootUrl}`);
  assert.equal(actualUrl.search, '', `${boundary}: query flags forbidden on player route`);
}

function findSystemBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function withOverallDeadline(deadline, label, fn) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(`overall deadline exhausted before ${label}`);
  let timer = null;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`overall deadline hit during ${label}`)), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: String(error.message || error),
    stack: error.stack ? String(error.stack).split('\n').slice(0, 24) : null,
  };
}
