#!/usr/bin/env node
// PQ-021 public route — broker-authorized BROWSER acceptance.
//
// Drives both ordinary read routes (station dock -> Ledger destination, and flight K -> Codex ->
// Ledger tab) over evidence earned in the live runtime through the ordinary operation API, then
// writes one receipt plus four screenshots.
//
// BUILT, NOT RUN. PQ-034 holds the performance-evidence / validation-broker / browser-gpu leases at
// the time of writing, so this has never been executed. It is deliberately inert without a claim:
// direct execution without SF_BROKER_CLAIM exits 2, exactly like the other broker probes.
//
// When the lease frees, one command runs it:
//   node scripts/validation-broker-cli.mjs --manifest pq021-ledger-route
// or, for non-promoting local inspection:
//   node scripts/probe-pq021-ledger-route.mjs --diagnostic

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { collectPageIssues } from './lib/browser-issues.mjs';
import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import { createPq021LedgerRouteManifest } from './validation-manifests/pq021-ledger-route.mjs';
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
const ARTIFACT_ROOT = path.join(ROOT, '.devshots', 'pq021-ledger-route');
const DIAGNOSTIC = process.argv.includes('--diagnostic');

const manifest = createPq021LedgerRouteManifest();
const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest,
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[pq021-ledger-route] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[pq021-ledger-route] invoke via: node scripts/validation-broker-cli.mjs --manifest pq021-ledger-route');
  console.error('[pq021-ledger-route] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

mkdirSync(ARTIFACT_ROOT, { recursive: true });

const { chromium } = await loadPlaywright();
let server = null;
let browser = null;
let receipt = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });
  const issues = collectPageIssues(page, { includeWarnings: false });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });

  const shots = [];
  const screenshot = async (name) => {
    const file = path.join(ARTIFACT_ROOT, name);
    await page.screenshot({ path: file });
    shots.push(repoRel(ROOT, file));
  };

  await bootToFlight(page, server.baseUrl);
  const earning = await earnInRuntime(page);
  const station = await runStationReadRoute(page, { screenshot });
  const flight = await runFlightReadRoute(page, { screenshot });

  receipt = assertRouteContract({ earning, station, flight, runtimeLabel: 'browser-chromium-headless' });
  receipt.screenshots = shots;
  receipt.expectedScreenshots = [...PQ021_SCREENSHOTS];
  receipt.pageIssues = issues.errorIssues();
  if (receipt.pageIssues.length) {
    receipt.disposition = 'FAIL';
    receipt.problems.push(`page issues: ${receipt.pageIssues.length}`);
  }
} catch (err) {
  receipt = {
    schema: 'spaceface.pq021-ledger-route.v1',
    runtime: 'browser-chromium-headless',
    disposition: 'FAIL',
    problems: [err && err.message ? err.message : String(err)],
  };
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}

writeFileSync(path.join(ARTIFACT_ROOT, 'route-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

if (receipt.disposition !== 'PASS') {
  console.error('[pq021-ledger-route] FAIL');
  for (const problem of receipt.problems || []) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('[pq021-ledger-route] PASS — station and Codex read routes agree on five earned pages');
console.log(`  receipt: ${repoRel(ROOT, path.join(ARTIFACT_ROOT, 'route-receipt.json'))}`);

// ---- local dev server ---------------------------------------------------------------------------

async function startFreshServer() {
  const port = await findFreePort(8260);
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
  throw new Error('No free local port found for the PQ-021 ledger route probe');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
