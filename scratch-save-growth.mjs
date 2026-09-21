// scratch-save-growth.mjs — PQ-033.02 diagnostic (temporary; delete when done).
// Boots the public route in a headed browser, then loops F5 quick-save / F9 quick-load and prints
// the localStorage key sizes plus the top-level save-payload section sizes each roundtrip, so the
// growth that killed the release soak at the 5 MB quota can be attributed to one section.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { acquireVisualProbeServer } from './scripts/lib/visualProbeServer.mjs';
import { loadPlaywright } from './scripts/lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const ITERATIONS = Number(process.env.SF_SAVE_GROWTH_ITERS || 30);
const VIEWPORT = { width: 1280, height: 800 };

function findSystemBrowser() {
  const candidates = [
    process.env.SPACEFACE_BROWSER_EXE,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

const readSizes = (page) => page.evaluate(() => {
  const out = { total: 0, keys: {}, sections: {}, jobs: null };
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key) || '';
      out.keys[key] = value.length;
      out.total += value.length;
    }
    const env = JSON.parse(localStorage.getItem('sf.save.quick') || 'null');
    const data = env && env.data && typeof env.data === 'object' ? env.data : {};
    for (const [key, value] of Object.entries(data)) {
      try { out.sections[key] = JSON.stringify(value)?.length ?? 0; } catch { out.sections[key] = -1; }
    }
    out.savedAt = env?.savedAt || null;
    const bag = data.npcJobs && typeof data.npcJobs === 'object' ? data.npcJobs : {};
    const byId = bag.byId && typeof bag.byId === 'object' ? bag.byId : {};
    const rows = Object.entries(byId).map(([jobId, entry]) => {
      let size = 0;
      try { size = JSON.stringify(entry)?.length ?? 0; } catch { size = -1; }
      return { jobId, kind: entry?.kind || entry?.job?.kind || '?', sectorId: entry?.sectorId || null, size };
    }).sort((a, b) => b.size - a.size);
    out.jobs = {
      count: rows.length,
      total: rows.reduce((sum, row) => sum + row.size, 0),
      top: rows.slice(0, 6),
      couriers: bag.siteCouriers ? Object.keys(bag.siteCouriers).length : 0,
      ids: rows.map((row) => row.jobId),
    };
    const ledger = (window.SF?.state?.world?.records?.byId) || {};
    const ledgerIds = new Set(Object.keys(ledger));
    const orphanKinds = {};
    let orphans = 0;
    for (const row of rows) {
      const recordId = row.jobId.startsWith('job:') ? row.jobId.slice(4) : row.jobId;
      if (ledgerIds.has(recordId)) continue;
      orphans += 1;
      orphanKinds[row.kind] = (orphanKinds[row.kind] || 0) + 1;
    }
    out.jobs.orphans = orphans;
    out.jobs.orphanKinds = orphanKinds;
    out.jobs.ledgerCount = ledgerIds.size;
    out.jobs.ledgerConvoy = Object.values(ledger).filter((rec) => rec && rec.kind === 'convoy').length;
  } catch (error) {
    out.error = String(error && error.message || error);
  }
  return out;
});

const topSections = (sections, n = 8) => Object.entries(sections || {})
  .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}=${v}`).join(' ');

async function main() {
  const executablePath = findSystemBrowser();
  if (!executablePath) throw new Error('headed Chrome or Edge is required');
  const server = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: false,
    executablePath,
    args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'dark' });
  const page = await context.newPage();
  try {
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      await page.keyboard.press('Space');
      await splash.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    }
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
    await page.waitForFunction(() => window.SF?.state?.mode === 'flight' && window.SF?.state?.tick > 5, null, { timeout: 180_000 });
    console.log('[diag] flight ready');

    let previousSavedAt = null;
    let previousIds = null;
    for (let i = 0; i < ITERATIONS; i += 1) {
      await page.keyboard.press('F5');
      await page.waitForFunction((prev) => {
        const env = JSON.parse(localStorage.getItem('sf.save.quick') || 'null');
        return !!env && env.savedAt !== prev;
      }, previousSavedAt, { timeout: 30_000 }).catch(() => {});
      const afterSave = await readSizes(page);
      previousSavedAt = afterSave.savedAt;
      await page.keyboard.press('F9');
      await page.waitForTimeout(2500);
      const afterLoad = await readSizes(page);
      const ids = new Set(afterLoad.jobs?.ids || []);
      const added = previousIds ? [...ids].filter((id) => !previousIds.has(id)) : [];
      previousIds = ids;
      console.log(`[diag] ${i} save=${afterSave.keys['sf.save.quick']} total=${afterSave.total} afterLoad=${afterLoad.keys['sf.save.quick']} total=${afterLoad.total}`);
      console.log(`[diag]   jobs count=${afterLoad.jobs?.count} bytes=${afterLoad.jobs?.total} couriers=${afterLoad.jobs?.couriers} added=${added.length} sample=${added.slice(0, 3).join(',')}`);
      console.log(`[diag]   orphans=${afterLoad.jobs?.orphans} kinds=${JSON.stringify(afterLoad.jobs?.orphanKinds)} ledger=${afterLoad.jobs?.ledgerCount} ledgerConvoy=${afterLoad.jobs?.ledgerConvoy}`);
      if (i % 5 === 0 || i === ITERATIONS - 1) {
        console.log(`[diag]   keys ${JSON.stringify(afterLoad.keys)}`);
        console.log(`[diag]   sections ${topSections(afterLoad.sections)}`);
        console.log(`[diag]   top jobs ${JSON.stringify(afterLoad.jobs?.top)}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch((error) => { console.error('[diag] FAIL', error); process.exitCode = 1; });
