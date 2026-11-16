import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

test('the New Game owner marks the loadout wrapper without a relational label selector', async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [viewport, phone] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=new-game&chrome=0${phone ? '&phone=1' : ''}`);
        await page.waitForFunction(() => window.__BENCH_READY === true);
        const read = () => page.evaluate(() => {
          const list = document.querySelector('.orr-ng-caption > div > ul[aria-label="Loadout"]');
          const wrapper = list?.parentElement;
          const selectors = [];
          const walk = parent => {
            let rules;
            try { rules = [...parent.cssRules]; } catch { return; }
            for (const rule of rules) {
              if (rule.selectorText?.includes(':has(> ul[aria-label="Loadout"])')) selectors.push(rule.selectorText);
              if (rule.cssRules) walk(rule);
            }
          };
          for (const sheet of document.styleSheets) walk(sheet);
          return { marked: wrapper?.classList.contains('orr-ng-loadout'), count: list?.children.length, text: list?.textContent,
            displayed: wrapper && getComputedStyle(wrapper).display !== 'none', selectors };
        });
        let result = await read();
        assert.equal(result.marked, true, 'the real screen marks its Loadout owner');
        assert.ok(result.displayed && result.count > 0, 'the selected hull retains its displayed loadout');
        assert.deepEqual(result.selectors, [], 'no selector watches every aria-label mutation for this layout');
        const firstLoadout = result.text;
        await page.locator('[data-action^="starter:"]').nth(1).evaluate(button => button.click());
        result = await read();
        assert.equal(result.marked, true, 'switching the starter keeps the same owner hook');
        assert.ok(result.displayed && result.count > 0, 'the new starter still has a displayed loadout');
        assert.notEqual(result.text, firstLoadout, 'the real starter selection updates its loadout');
      } finally { await page.close(); }
    }
  } finally {
    await browser.close();
    await server.close();
  }
});
