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
let receipt = null;

try {
  const launch = await createIsolatedElectronLaunch({ root: ROOT, label: 'pq021-ledger-route' });
  app = launch.app ?? launch.electronApp ?? launch;
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  assertIsolatedElectronRootUrl(page.url());

  const shots = [];
  const screenshot = async (name) => {
    const file = path.join(ELECTRON_DIR, name);
    await page.screenshot({ path: file });
    shots.push(repoRel(ROOT, file));
  };

  await bootToFlight(page, page.url());
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
  if (app && typeof app.close === 'function') await app.close().catch(() => {});
}

writeFileSync(path.join(ELECTRON_DIR, 'route-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

if (receipt.disposition !== 'PASS') {
  console.error('[pq021-ledger-route/electron] FAIL');
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('[pq021-ledger-route/electron] PASS — Electron matches the Browser route receipt');
