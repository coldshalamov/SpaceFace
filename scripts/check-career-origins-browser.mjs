#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { runBrowserPublicRoute } from './lib/alphaLiveBaselineRoute.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { closeOwnedResources } from './lib/alphaLiveBaselineContracts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CAREER_ID = String(process.argv.find((arg) => arg.startsWith('--career='))?.split('=')[1] || 'hauler');
assert(['hauler', 'hunter', 'prospector'].includes(CAREER_ID), `unsupported career ${CAREER_ID}`);
const OUTPUT = path.join(ROOT, '.devshots', 'm3-career-origins', CAREER_ID);
const FIRST_CONTRACT = Object.freeze({
  hauler: 'manifest_truth',
  hunter: 'yard_writ',
  prospector: 'ceres_survey',
});
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

  const routeEvidence = await runBrowserPublicRoute({
    page,
    outputDir: OUTPUT,
    expectedRootUrl: server.baseUrl,
    log: (line) => console.log(`[m3-browser] ${line}`),
    flightTimeoutMs: 150_000,
    dockTimeoutMs: 90_000,
  });

  // The normal station path keeps origins in the on-demand Mission Log. J is the public binding
  // promised by the station hub; do not bypass it with direct system calls or state injection.
  await page.keyboard.press('KeyJ');
  await page.locator('[data-screen="missionLog"]').waitFor({ state: 'visible', timeout: 20_000 });
  const originButtons = page.locator('button[data-career-act="originAccept"]');
  await originButtons.first().waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await originButtons.count(), 3,
    'public Mission Log route must expose all three origin choices');
  await page.screenshot({ path: path.join(OUTPUT, 'career-origin-before.png'), fullPage: true });

  const before = await page.evaluate(() => ({
    registered: window.SF?.registry?.get('careerOrigins')?.name || null,
    ids: window.SF?.registry?.get('careerOrigins')?.getOfferView()?.offers?.map((offer) => offer.careerId) || [],
    nonBinding: window.SF?.registry?.get('careerOrigins')?.getOfferView()?.nonBinding === true,
  }));
  assert.equal(before.registered, 'careerOrigins');
  assert.deepEqual(before.ids, ['hauler', 'hunter', 'prospector']);
  assert.equal(before.nonBinding, true);

  await page.locator(`button[data-career-act="originAccept"][data-career-id="${CAREER_ID}"]`).click();
  await page.waitForFunction((careerId) => {
    const state = window.SF?.state;
    const origins = state?.careers?.origins;
    const own = origins?.[careerId];
    const route = origins?.__meta?.routes?.[careerId];
    const missionId = careerId === 'hauler' ? own?.activeContract?.missionId : route?.activeMissionId;
    return missionId && state?.missions?.active?.some((mission) => mission.id === missionId);
  }, CAREER_ID, { timeout: 20_000 });

  const accepted = await page.evaluate((careerId) => {
    const state = window.SF.state;
    const own = state.careers.origins[careerId];
    const route = state.careers.origins.__meta.routes[careerId];
    const missionId = careerId === 'hauler' ? own.activeContract.missionId : route.activeMissionId;
    const mission = state.missions.active.find((candidate) => candidate.id === missionId);
    return {
      careerId,
      offerId: careerId === 'hauler' ? own.activeContract.offerId : route.activeOfferId,
      missionId,
      missionStoryTag: mission?.storyTag || null,
      missionTitle: mission?.title || null,
      missionObjective: mission?.mapLabel || mission?.description || null,
      missionRewardCr: mission?.reward_cr || 0,
      missionMarkerId: mission?.markerId || null,
      activeWaypointMarkerId: state.nav?.waypoint?.markerId || null,
      trackedMissionId: state.ui.trackedMissionId,
      credits: state.player.credits,
      cargo: { ...(state.player.cargo?.items || {}) },
      researchPoints: state.player.researchPoints || 0,
      playerAlive: state.entities?.get(state.playerId)?.alive !== false,
      upgradeReceipt: state.careers.origins.__meta.upgradeReceipts[careerId] || null,
      remainingOffers: window.SF.registry.get('careerOrigins').getOfferView().offers
        .filter((offer) => offer.canAccept).map((offer) => offer.careerId),
      peerStatuses: window.SF.registry.get('careerOrigins').getOfferView().offers
        .filter((offer) => offer.careerId !== careerId)
        .map((offer) => ({ careerId: offer.careerId, status: offer.status })),
      savedCareerSchema: window.SF.registry.get('save').serializeData().careerOrigins?.schemaId || null,
    };
  }, CAREER_ID);
  assert.match(accepted.offerId, new RegExp(`^mo_${CAREER_ID}_`));
  assert.match(accepted.missionId, /^m_/);
  assert.equal(accepted.missionStoryTag, `origin.${CAREER_ID}.v1:${FIRST_CONTRACT[CAREER_ID]}`);
  assert.equal(accepted.missionMarkerId, `origin:${CAREER_ID}:${FIRST_CONTRACT[CAREER_ID]}`);
  assert.equal(accepted.trackedMissionId, accepted.missionId);
  assert.deepEqual(accepted.remainingOffers, [], 'one active origin owns temporary first-hour focus');
  assert.deepEqual(accepted.peerStatuses.map((row) => row.careerId),
    ['hauler', 'hunter', 'prospector'].filter((id) => id !== CAREER_ID));
  assert.ok(accepted.peerStatuses.every((row) => row.status !== 'abandoned' && row.status !== 'completed'),
    'non-binding peers must remain available after the focused route releases');
  assert.equal(accepted.playerAlive, true);
  assert.equal(accepted.upgradeReceipt?.defId,
    { hauler: 'mod_market_data_s', hunter: 'mod_ram_plate', prospector: 'mod_winch_hd' }[CAREER_ID]);
  assert.equal(accepted.savedCareerSchema, 'spaceface.careerOrigins.v1');
  assert.equal(pageErrors.length, 0, `default route emitted page errors: ${pageErrors.join('\n')}`);
  await page.screenshot({ path: path.join(OUTPUT, `career-origin-after-${CAREER_ID}.png`), fullPage: true });
  await writeFile(path.join(OUTPUT, 'route-manifest.json'), `${JSON.stringify({
    schema: 'spaceface.m3.publicCareerRoute.v1',
    careerId: CAREER_ID,
    route: 'New Game -> authored flight -> public map waypoint -> physical Helios dock -> J Mission Log -> origin choice',
    canonicalUrl: server.baseUrl,
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: false,
    gpu: routeEvidence.gpu?.identity || null,
    screenshots: [
      '01-main-menu.png', '02-new-game.png', '03-flight-after-input.png', '04-galaxy-map.png',
      '05-dock-prompt.png', '06-station-hub.png', 'career-origin-before.png',
      `career-origin-after-${CAREER_ID}.png`,
    ],
    accepted,
    pageErrors,
    checks: [
      { name: 'public-route', status: 'pass' },
      { name: 'authored-assets-ready', status: routeEvidence.launchSnapshot?.authored?.ready ? 'pass' : 'fail' },
      { name: 'physical-dock', status: routeEvidence.stableStation?.pass ? 'pass' : 'fail' },
    ],
  }, null, 2)}\n`, 'utf8');

  console.log(`[m3-browser] PASS ${JSON.stringify(accepted)}`);
} finally {
  await closeOwnedResources({ page, context, browser, server }).catch(() => {});
}
