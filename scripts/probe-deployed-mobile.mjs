// Read-only public deployment probe. Fresh browser profile; no player-store or debug-state writes.
// MOBILE_PROBE_URL=https://... MOBILE_PROBE_ENGINE=webkit node scripts/probe-deployed-mobile.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const url = new URL(process.env.MOBILE_PROBE_URL || 'https://spaceface-play-demo.vercel.app/');
if (!['https:', 'http:'].includes(url.protocol)) throw new Error('HTTP(S) deployment URL required');
const engine = process.env.MOBILE_PROBE_ENGINE || 'webkit';
if (!['webkit', 'chromium'].includes(engine)) throw new Error('Engine must be webkit or chromium');
const out = resolve(process.env.MOBILE_PROBE_OUT || `.devshots/mobile-deployment/${engine}`);
await mkdir(out, { recursive: true });
const report = { url: url.href, engine, startedAt: new Date().toISOString(), passed: false,
  responses: [], requestFailures: [], pageErrors: [], console: [], stages: [], observations: [] };
let browser;
const snapshot = page => page.evaluate(() => ({
  title: document.title, mobile: document.documentElement.dataset.sfMobile,
  flight: document.documentElement.dataset.sfMobileFlight,
  loading: [...document.querySelectorAll('[data-loading-label], [data-loading-detail]')]
    .filter(e => e.getBoundingClientRect().width > 0).map(e => e.textContent),
  screens: [...document.querySelectorAll('[data-screen]')]
    .filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden')
    .map(e => e.dataset.screen),
  errors: [...document.querySelectorAll('[role="alert"], .boot-error')].map(e => e.textContent),
}));
const visible = async (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' ? { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] } : {}) });
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type()) && report.console.length < 250)
      report.console.push({ type: message.type(), text: message.text().slice(0, 3000) });
  });
  page.on('requestfailed', request => {
    if (report.requestFailures.length < 500) report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    const request = response.request();
    if (report.responses.length < 3000) report.responses.push({ url: response.url(), status: response.status(),
      type: request.resourceType(), mime: response.headers()['content-type'], bytes: response.headers()['content-length'] });
  });
  const navigation = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  report.navigation = { status: navigation?.status(), url: page.url() };
  report.html = await page.content();
  const menu = '[data-screen="mainMenu"] button[data-action="newGame"]';
  const beforeMenu = Date.now();
  while (!(await visible(page, menu)) && Date.now() - beforeMenu < 180000) {
    if (await visible(page, '#cinematic-splash .cine-begin')) {
      await page.locator('#cinematic-splash .cine-begin').tap().catch(() => {});
    }
    const motion = page.locator('[data-screen="motionAsk"] button').filter({ hasText: /^Full/i }).first();
    if (await motion.isVisible().catch(() => false)) await motion.tap();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: join(out, '01-menu.png') });
  if (!(await visible(page, menu))) throw new Error('Main menu never became playable');
  report.stages.push({ stage: 'menu', ...await snapshot(page) });
  await page.locator(menu).tap();
  await page.locator('.sf-ng-launch').waitFor({ state: 'visible', timeout: 30000 });
  await page.screenshot({ path: join(out, '02-new-game.png') });
  await page.locator('.sf-ng-launch').tap();
  const launchAt = Date.now();
  let reachedFlight = false;
  while (Date.now() - launchAt < 300000) {
    await page.waitForTimeout(2000);
    const state = await snapshot(page);
    report.observations.push({ elapsedMs: Date.now() - launchAt, ...state });
    if (state.flight === '1') { reachedFlight = true; break; }
    if (Date.now() - launchAt > 5000 && await visible(page, menu))
      throw new Error('New Game returned to the main menu without entering flight');
  }
  report.launchMs = Date.now() - launchAt;
  await page.screenshot({ path: join(out, '03-launch-result.png') });
  if (!reachedFlight) throw new Error('New Game did not enter flight within five minutes');
  await page.locator('.mf-pause').tap();
  await page.locator('[data-screen="pause"]').waitFor({ state: 'visible' });
  report.stages.push({ stage: 'pause', ...await snapshot(page) });
  await page.screenshot({ path: join(out, '04-pause.png') });
  if (report.pageErrors.length) throw new Error(`${report.pageErrors.length} unhandled page error(s)`);
  report.passed = true;
} catch (error) {
  report.failure = String(error?.stack || error);
  const page = browser?.contexts()[0]?.pages()[0];
  if (page && !page.isClosed()) {
    report.final = await snapshot(page).catch(() => null);
    await page.screenshot({ path: join(out, 'failure.png'), timeout: 15000 }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ engine, passed: report.passed, launchMs: report.launchMs,
    failure: report.failure, final: report.final, pageErrors: report.pageErrors,
    failedHttp: report.responses.filter(r => r.status >= 400), requestFailures: report.requestFailures }, null, 2));
}
