// The real refit jig must not put Sell under a pointer aimed at Strip or Fit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

test('lighting a Swarm hardpoint leaves its intended control under the pointer', { timeout: 45000 }, async (t) => {
  let chromium;
  try { ({ chromium } = await loadPlaywright()); } catch { t.skip('Playwright unavailable'); return; }
  const winChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const executablePath = process.env.SF_CHROMIUM || (existsSync(winChrome) ? winChrome : undefined);
  let browser;
  try { browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-gpu'] }); }
  catch { t.skip('Chromium unavailable'); return; }
  const server = await startBenchServer();
  try {
    const page = await browser.newPage({ viewport: { width: 1460, height: 900 } });
    await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=crucible-refit-swarm&chrome=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__BENCH_READY === true);
    await page.waitForFunction(() => document.querySelector('.orr-hull--settled'));

    const row = (name) => page.locator('.sf-cru-row').filter({ hasText: name });
    const check = async (other, name, verb) => {
      await row(other).getByRole('button', { name: 'Strip', exact: true }).hover();
      await page.waitForTimeout(450); // the jig's existing settled transition
      const intended = row(name).getByRole('button', { name: verb, exact: true });
      const before = await intended.boundingBox();
      assert.ok(before, `${name} ${verb} is visible`);
      const x = before.x + before.width / 2, y = before.y + before.height / 2;
      await page.mouse.move(x, y);
      await page.waitForTimeout(450);
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent.trim(), { x, y });
      const after = await intended.boundingBox();
      assert.equal(hit, verb, `the pointer still hits ${verb}, never Sell`);
      assert.ok(Math.abs(after.x - before.x) <= 2 && Math.abs(after.y - before.y) <= 2,
        `${name} ${verb} remains in place when lit`);
    };
    await check('Concussion Cannon M', 'Bank Stream M', 'Strip');
    await check('Bank Stream M', 'Autocannon S', 'Fit');
  } finally {
    await browser.close();
    await server.close();
  }
});
