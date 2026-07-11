#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { runBrowserPublicRoute } from './lib/alphaLiveBaselineRoute.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { closeOwnedResources } from './lib/alphaLiveBaselineContracts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT = path.join(ROOT, '.devshots', 'm3-career-origins');
const browserPath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);

assert(browserPath, 'headed Chrome or Edge is required for the M3 default-route proof');
await mkdir(OUTPUT, { recursive: true });

let server;
let browser;
let context;
let page;
const pageErrors = [];

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: false,
    executablePath: browserPath,
    args: ['--incognito', '--no-first-run', '--disable-extensions', '--window-size=1440,900'],
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await runBrowserPublicRoute({
    page,
    outputDir: OUTPUT,
    expectedRootUrl: server.baseUrl,
    log: (line) => console.log(`[m3-browser] ${line}`),
    flightTimeoutMs: 150_000,
    dockTimeoutMs: 90_000,
  });

  const rail = page.getByTestId('career-origin-rail');
  await rail.waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await page.locator('[data-testid^="career-origin-choice-"]').count(), 3,
    'default station route must expose all three origin choices');
  await page.screenshot({ path: path.join(OUTPUT, 'career-origin-before.png'), fullPage: true });

  const before = await page.evaluate(() => ({
    registered: window.SF?.registry?.get('careerOrigins')?.name || null,
    ids: window.SF?.registry?.get('careerOrigins')?.getOfferView()?.offers?.map((offer) => offer.careerId) || [],
    nonBinding: window.SF?.registry?.get('careerOrigins')?.getOfferView()?.nonBinding === true,
  }));
  assert.equal(before.registered, 'careerOrigins');
  assert.deepEqual(before.ids, ['hauler', 'hunter', 'prospector']);
  assert.equal(before.nonBinding, true);

  await page.getByTestId('career-origin-choice-hauler').click();
  await page.getByTestId('career-origin-accept').click();
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const own = state?.careers?.origins?.hauler;
    return own?.status === 'active' && own?.activeContract?.missionId
      && state?.missions?.active?.some((mission) => mission.id === own.activeContract.missionId);
  }, null, { timeout: 20_000 });

  const accepted = await page.evaluate(() => {
    const state = window.SF.state;
    const own = state.careers.origins.hauler;
    const mission = state.missions.active.find((candidate) => candidate.id === own.activeContract.missionId);
    return {
      offerId: own.activeContract.offerId,
      missionId: own.activeContract.missionId,
      missionStoryTag: mission?.storyTag || null,
      trackedMissionId: state.ui.trackedMissionId,
      remainingOffers: window.SF.registry.get('careerOrigins').getOfferView().offers
        .filter((offer) => offer.canAccept).map((offer) => offer.careerId),
      savedCareerSchema: window.SF.registry.get('save').serializeData().careerOrigins?.schemaId || null,
    };
  });
  assert.match(accepted.offerId, /^mo_hauler_/);
  assert.match(accepted.missionId, /^m_/);
  assert.equal(accepted.missionStoryTag, 'origin.hauler.v1:manifest_truth');
  assert.equal(accepted.trackedMissionId, accepted.missionId);
  assert.deepEqual(accepted.remainingOffers, ['hunter', 'prospector']);
  assert.equal(accepted.savedCareerSchema, 'spaceface.careerOrigins.v1');
  assert.equal(pageErrors.length, 0, `default route emitted page errors: ${pageErrors.join('\n')}`);
  await page.screenshot({ path: path.join(OUTPUT, 'career-origin-after-hauler.png'), fullPage: true });

  console.log(`[m3-browser] PASS ${JSON.stringify(accepted)}`);
} finally {
  await closeOwnedResources({ page, context, browser, server }).catch(() => {});
}
