#!/usr/bin/env node
/**
 * Live Electron route evidence for Hauler + Hunter + Prospector career ladders.
 *
 * One Game Path only (canonical Electron launcher root, no query flags). Proves
 * the same live careerLadders runtime seam as the browser check: three definition
 * packs registered, reachable without exclusive origin binding, save/restore, and
 * stable offer/progress view models.
 *
 * Fail-closed when the registry seam or branch definition modules are absent.
 * Does not edit package/registry/UI/HUD/assets. Does not inspect SAFE-001.
 *
 * Run: node scripts/check-career-ladders-electron.mjs
 */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  EXPECTED_CAREER_IDS,
  SCHEMA_ID,
  exerciseCareerLaddersLive,
} from './check-career-ladders-browser.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'career-ladders-live');
const REPORT_PATH = path.join(OUT_DIR, 'electron-route.json');
const FLIGHT_TIMEOUT_MS = 150_000;
const ELECTRON_FIXED_PORT = 41788;

let electronApp = null;
let page = null;

try {
  mkdirSync(OUT_DIR, { recursive: true });

  const { _electron: electron } = await loadPlaywright();
  electronApp = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90_000 });
  const childProcess = electronApp.process();
  assert(childProcess, 'Playwright Electron launch must expose owned child process');

  page = await electronApp.firstWindow({ timeout: 90_000 });
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  await page.waitForFunction(
    () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry),
    null,
    { timeout: 90_000 },
  );
  assert.equal(new URL(page.url()).search, '', 'Electron must use canonical root without query flags');

  const url = new URL(page.url());
  // Soft note when fixed port differs (dev shell may bind differently); still require loopback One Game Path.
  const electronPort = Number(url.port) || (url.protocol === 'http:' ? 80 : 443);
  if (electronPort !== ELECTRON_FIXED_PORT) {
    console.log(`[career-ladders-electron] note: port ${electronPort} (fixed origin convention ${ELECTRON_FIXED_PORT})`);
  }

  // Public New Game → Launch (One Game Path).
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: FLIGHT_TIMEOUT_MS });

  const receipt = await exerciseCareerLaddersLive(page, {
    route: 'electron',
    log: (line) => console.log(`[career-ladders-electron] ${line}`),
  });

  const errorIssues = issues.errorIssues();
  const ignored = summarizeIssues(issues.ignoredIssues);
  assert.deepEqual(errorIssues, [], `electron page errors: ${JSON.stringify(summarizeIssues(errorIssues))}`);

  const report = {
    schema: 'spaceface.careerLaddersLiveElectron.v1',
    generatedAt: new Date().toISOString(),
    route: 'electron',
    origin: url.origin,
    electronPort,
    expectedCareerIds: EXPECTED_CAREER_IDS,
    schemaId: SCHEMA_ID,
    pass: true,
    receipt,
    pageErrors: [],
    ignoredPageIssues: ignored,
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`[career-ladders-electron] PASS ${JSON.stringify({
    registeredIds: receipt.registeredIds,
    nonBinding: receipt.offerView.nonBinding,
    exclusiveOriginBinding: receipt.exclusiveOriginBinding,
    saveSchemaId: receipt.save.schemaId,
    restoredStatuses: receipt.restored.statuses,
    ignoredPageIssues: ignored.length,
    electronPort,
  })}`);
  console.log(`[career-ladders-electron] report: ${path.relative(ROOT, REPORT_PATH)}`);
} catch (error) {
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify({
      schema: 'spaceface.careerLaddersLiveElectron.v1',
      generatedAt: new Date().toISOString(),
      route: 'electron',
      pass: false,
      error: {
        name: error && error.name,
        message: error && error.message,
        stack: error && error.stack,
      },
    }, null, 2)}\n`);
  } catch (_) { /* best-effort */ }
  console.error(`[career-ladders-electron] FAIL: ${error && error.stack || error}`);
  process.exitCode = 1;
} finally {
  try { if (page && !page.isClosed()) await page.close(); } catch (_) { /* ignore */ }
  try { if (electronApp) await electronApp.close(); } catch (_) { /* ignore */ }
}
