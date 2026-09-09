#!/usr/bin/env node
// PQ-021 public route — ELECTRON half of the acceptance cell.
// Shares scripts/lib/pq021LedgerPublicRoute.mjs with the Browser probe, following the
// professional-travel pattern (one route module, two thin runtime entries, one schema).
//
// BUILT, NOT RUN. PQ-034 holds the browser-gpu / validation-broker leases and this worker was
// explicitly barred from launching Electron, so this entry has never been executed. Electron route
// parity is carried as an open row on the PQ-021 Phase 4 receipt, not claimed.
//
// When the lease frees:
//   node scripts/check-pq021-ledger-route-electron.mjs
//
// It must be run AFTER the Browser probe: it compares its own host readings against the Browser
// receipt so a runtime divergence is a named diff rather than two receipts nobody cross-checked.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  assertRouteContract,
  bootToFlight,
  earnInRuntime,
  PQ021_SCREENSHOTS,
  repoRel,
  runFlightReadRoute,
  runStationReadRoute,
} from './lib/pq021LedgerPublicRoute.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_ROOT = path.join(ROOT, '.devshots', 'pq021-ledger-route');
const ELECTRON_DIR = path.join(OUT_ROOT, 'electron');
const BROWSER_RECEIPT = path.join(OUT_ROOT, 'route-receipt.json');

mkdirSync(ELECTRON_DIR, { recursive: true });

let app = null;
let childProcess = null;
let page = null;
let receipt = null;
let launch = null;
let canonicalUrlTracker = null;
let processMonitor = null;
let rootUrl = null;

try {
  // createIsolatedElectronLaunch returns a launch DESCRIPTOR ({ options, cleanup, ... }); the caller
  // owns the spawn. The original never-run entry treated that descriptor as an ElectronApplication.
  // It also waited for DOMContentLoaded before following the normal about:blank -> loopback-root
  // bootstrap. Follow the same proven ownership and canonical-root pattern as the accepted Alpha
  // and professional-travel Electron evidence routes.
  const { _electron: electron } = await loadPlaywright();
  launch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'pq021-ledger-route' });
  app = await electron.launch(launch.options);
  childProcess = app.process();
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess });
  page = await app.firstWindow({ timeout: 90_000 });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
  rootUrl = assertIsolatedElectronRootUrl(rootUrl);
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });

  const shots = [];
  const screenshot = async (name) => {
    const file = path.join(ELECTRON_DIR, name);
    await page.screenshot({ path: file });
    shots.push(repoRel(ROOT, file));
  };

  await bootToFlight(page, rootUrl);
  const earning = await earnInRuntime(page);
  const station = await runStationReadRoute(page, { screenshot });
  const flight = await runFlightReadRoute(page, { screenshot });

  receipt = assertRouteContract({ earning, station, flight, runtimeLabel: 'electron' });
  receipt.screenshots = shots;
  receipt.expectedScreenshots = [...PQ021_SCREENSHOTS];

  // Cross-runtime parity: identical page information in Electron and Browser.
  if (existsSync(BROWSER_RECEIPT)) {
    const browserReceipt = JSON.parse(readFileSync(BROWSER_RECEIPT, 'utf8'));
    const informational = (doc, host) => (doc.hosts && doc.hosts[host] ? doc.hosts[host].pages : [])
      .map((page) => ({
        pageId: page.pageId, alt: page.alt, caption: page.caption,
        provenance: page.provenance, title: page.title, body: page.body,
      }));
    for (const host of ['station', 'flight']) {
      const mine = JSON.stringify(informational(receipt, host));
      const theirs = JSON.stringify(informational(browserReceipt, host));
      if (mine !== theirs) {
        receipt.disposition = 'FAIL';
        receipt.problems.push(`${host}: Electron and Browser disagree on page information`);
      }
    }
    receipt.crossRuntimeParity = 'compared against .devshots/pq021-ledger-route/route-receipt.json';
  } else {
    receipt.crossRuntimeParity = 'NOT COMPARED — run the Browser probe first';
  }
} catch (err) {
  receipt = {
    schema: 'spaceface.pq021-ledger-route.v1',
    runtime: 'electron',
    disposition: 'FAIL',
    problems: [err && err.message ? err.message : String(err)],
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
    cleanupReport = { pass: false, failures: [error && error.message ? error.message : String(error)] };
  }
  if (cleanupReport?.pass !== true) {
    receipt ||= {
      schema: 'spaceface.pq021-ledger-route.v1',
      runtime: 'electron',
      disposition: 'FAIL',
      problems: [],
    };
    receipt.disposition = 'FAIL';
    receipt.problems ||= [];
    receipt.problems.push(`owned Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ')}`);
  }
  // The isolated profile may only be removed against proof we owned and closed the runtime.
  if (launch && cleanupReport?.pass === true) {
    try { launch.cleanup({ runtimeClosed: true }); }
    catch (error) {
      receipt.disposition = 'FAIL';
      receipt.problems.push(`isolated profile cleanup failed: ${error && error.message ? error.message : String(error)}`);
    }
  }
}

writeFileSync(path.join(ELECTRON_DIR, 'route-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

if (receipt.disposition !== 'PASS') {
  console.error('[pq021-ledger-route/electron] FAIL');
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('[pq021-ledger-route/electron] PASS — Electron matches the Browser route receipt');
