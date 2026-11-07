import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

// Real screen and paused construction owner. This checks decision feedback, not live combat.
test('compact Fortify keeps purchase refusal and repair feedback readable', { timeout: 180000 }, async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgl', '--mute-audio'] });
    for (const viewport of [{ width: 700, height: 461 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      try {
        await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=crucible-fortify&chrome=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__BENCH_READY, null, { timeout: 120000 });
        const note = page.locator('.sf-fortify-receipt');
        async function readableFeedback(pattern) {
          await page.waitForFunction(source => new RegExp(source).test(document.querySelector('.sf-fortify-receipt')?.textContent || ''), pattern.source);
          assert.equal(await note.isVisible(), true, 'the live receipt must not disappear on short frames');
          await note.scrollIntoViewIfNeeded();
          const visible = await note.evaluate(element => {
            const style = getComputedStyle(element), box = element.getBoundingClientRect();
            const foot = element.closest('.k-foot').getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(element);
            const lines = [...range.getClientRects()];
            return element.getAttribute('role') === 'status' && element.getAttribute('aria-live') === 'polite'
              && parseFloat(style.fontSize) >= 12 && style.visibility === 'visible'
              && lines.length > 0 && lines.every(line => line.left >= Math.max(0, foot.left) - 1
                && line.right <= Math.min(innerWidth, foot.right) + 1
                && line.top >= Math.max(0, foot.top) - 1
                && line.bottom <= Math.min(innerHeight, foot.bottom) + 1)
              && box.height + 1 >= range.getBoundingClientRect().height;
          });
          assert.equal(visible, true, 'every line of the result fits the visible footer');
        }
        const build = page.locator('.sf-fortify-build');
        assert.equal(await build.isEnabled(), true, 'the ordinary paused fixture offers a clear position');
        // A competing spend after the screen read forces the real owner to refuse the stale offer.
        await page.evaluate(() => { BENCH.state.run.credits = 0; });
        await build.click();
        await readableFeedback(/cannot cover/);
        assert.equal(await page.evaluate(() => BENCH.state.run.credits), 0);
        assert.equal(await build.isEnabled(), false, 'the refreshed purse explains the disabled purchase');
        await page.evaluate(() => BENCH.goto('crucible-fortify'));
        const repair = page.locator('.sf-fortify-state [data-repair-id]').first();
        await repair.scrollIntoViewIfNeeded();
        await repair.click();
        await readableFeedback(/structure repaired and ready/);
        const close = page.locator('.sf-fortify-close');
        await close.focus(); await close.scrollIntoViewIfNeeded();
        assert.equal(await close.evaluate(button => {
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return document.activeElement === button && !!hit && (hit === button || button.contains(hit));
        }), true, 'the receipt does not bury the Return control');
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
});
