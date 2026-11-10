import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

// The actual wave-30 and Swarm extraction-window screens, including their native consequence text.
test('compact Refit keeps every offered consequence and control reachable', { timeout: 240000 }, async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgl', '--mute-audio'] });
    for (const viewport of [{ width: 700, height: 461 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      try {
        for (const shot of ['crucible-refit', 'crucible-refit-swarm']) {
          await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=${shot}&chrome=0`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => window.__BENCH_READY, null, { timeout: 120000 });
          await page.evaluate(() => document.fonts.ready);
          const notes = page.locator('.sf-crucible-refit .sf-cru-keynote:not([hidden])');
          assert.ok(await notes.count() >= 2, 'the fixture offers different ways to continue or settle the run');
          for (let i = 0; i < await notes.count(); i++) {
            const note = notes.nth(i);
            assert.equal(await note.isVisible(), true, 'the consequence must be visible before its action');
            await note.scrollIntoViewIfNeeded();
            assert.equal(await note.evaluate(element => {
              const style = getComputedStyle(element), box = element.getBoundingClientRect();
              const foot = element.closest('.k-foot').getBoundingClientRect();
              const range = document.createRange(); range.selectNodeContents(element);
              const lines = [...range.getClientRects()];
              return parseFloat(style.fontSize) >= 12 && lines.length > 0
                && lines.every(line => line.left >= Math.max(0, foot.left) - 1
                  && line.right <= Math.min(innerWidth, foot.right) + 1
                  && line.top >= Math.max(0, foot.top) - 1
                  && line.bottom <= Math.min(innerHeight, foot.bottom) + 1)
                && box.height + 1 >= range.getBoundingClientRect().height;
            }), true, 'scrolling reveals the entire consequence without truncation');
          }
          const controls = page.locator('.sf-crucible-refit .k-foot button:visible');
          for (let i = 0; i < await controls.count(); i++) {
            const control = controls.nth(i);
            await control.focus(); await control.scrollIntoViewIfNeeded();
            assert.equal(await control.evaluate(button => {
              const box = button.getBoundingClientRect();
              const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
              return document.activeElement === button && !!hit && (hit === button || button.contains(hit));
            }), true, 'each offered action remains focusable and owns its pointer centre');
          }
          const lastFitControl = page.locator('.sf-cru-rows button:visible').last();
          assert.ok(await lastFitControl.count(), 'the hardpoint controls remain present');
          await lastFitControl.focus(); await lastFitControl.scrollIntoViewIfNeeded();
          assert.equal(await lastFitControl.evaluate(button => {
            const box = button.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return !!hit && (hit === button || button.contains(hit));
          }), true, 'the final hardpoint control remains reachable above the footer');
        }
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
});
