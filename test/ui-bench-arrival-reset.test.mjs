import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';
import { createBenchArrival } from '../scripts/lib/uiBenchArrival.mjs';

// Browser fixture evidence only. These checks do not boot the game or certify player routes.
// A missing browser is a failure, so CI cannot silently turn this regression into a skip.
test('walk arrival restores actual Help and station owners before the next control', { timeout: 240000 }, async t => {
  const server = await startBenchServer();
  let browser;
  try {
    const { chromium } = await loadPlaywright();
    const executablePath = process.env.SF_CHROMIUM
      || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
    browser = await chromium.launch({ headless: true, executablePath });
    await t.test('Help tab memory and persisted settings cannot replace the original Controls fixture', async () => {
      const page = await browser.newPage({ viewport: { width: 700, height: 461 }, reducedMotion: 'reduce' });
      try {
        const url = `${server.baseUrl}tools/ui-bench.html?screen=help&chrome=0&phone=1&arrival-test=exact%2Bquery`;
        const restoreArrival = await createBenchArrival(page, url, { timeoutMs: 60000 });
        await restoreArrival();
        const categories = await page.evaluate(() => window.BENCH.controls()
          .filter(row => row.identity.includes('help-section:')).map(row => row.identity));
        assert.equal(categories.length, 4, 'the arrival includes Flight, Interface, Pad and Touch');
        await page.locator('[role="tab"][data-action="Factions"]').click();
        assert.equal(await page.locator('[data-action^="help-section:"]').count(), 0,
          'the real Factions tab replaces the Controls categories');
        await page.evaluate(() => {
          localStorage.setItem('ui-bench-arrival-probe', 'dirty');
          sessionStorage.setItem('ui-bench-arrival-probe', 'dirty');
          window.__benchArrivalProbe = 'dirty';
        });
        await restoreArrival();
        assert.equal(page.url(), url, 'phone and custom fixture query parameters survive reset');
        assert.deepEqual(await page.evaluate(() => window.BENCH.controls()
          .filter(row => row.identity.includes('help-section:')).map(row => row.identity)), categories,
        'every original category returns with its exact identity');
        assert.deepEqual(await page.evaluate(() => ({
          local: localStorage.getItem('ui-bench-arrival-probe'),
          session: sessionStorage.getItem('ui-bench-arrival-probe'),
          realm: window.__benchArrivalProbe ?? null,
          phone: document.documentElement.dataset.sfMobile,
        })), { local: null, session: null, realm: null, phone: '1' });
      } finally { await page.close(); }
    });
    await t.test('station purchases restore credits, cargo, mission dispatch options and exact labels', async () => {
      const page = await browser.newPage({ viewport: { width: 700, height: 461 }, reducedMotion: 'reduce' });
      try {
        const url = `${server.baseUrl}tools/ui-bench.html?screen=station-contracts&chrome=0`;
        const restoreArrival = await createBenchArrival(page, url, { timeoutMs: 60000 });
        const snapshot = () => page.evaluate(() => {
          const state = window.__BENCH_STATE;
          return {
            credits: state.player.credits,
            cargo: structuredClone(state.player.cargo),
            controls: window.BENCH.controls().map(row => row.identity),
            dispatches: [...document.querySelectorAll('[data-adventure-option]')].map(el => el.getAttribute('aria-label')),
          };
        });
        await restoreArrival();
        const before = await snapshot();
        assert.ok(before.dispatches.length >= 2, 'the real board has viable dispatch alternatives');
        await page.locator('button[data-vital-act="resupply"]').click();
        await page.waitForFunction(credits => window.__BENCH_STATE.player.credits < credits, before.credits);
        const spent = await snapshot();
        assert.notDeepEqual(spent.cargo, before.cargo, 'the real economy purchase changes the hold');
        await restoreArrival();
        assert.deepEqual(await snapshot(), before,
          'the next control sees the original money, hold, dispatches and semantic identities');
      } finally { await page.close(); }
    });
  } finally { await browser?.close(); await server.close(); }
});
