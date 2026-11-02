// The station foot at 901–1199 wide: every destination tab owns the point at its centre, and a click on
// LEDGER's centre opens the Ledger rather than Help (1101×720 opened Help: the rail's words ran on under
// COMMS · HELP). Real station DOM over the ui-bench still; neighbours of 1101×720 and the bands either side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

const SIZES = ['1101x720', '1100x720', '1102x720', '1101x700', '1101x760', '1280x720', '1000x720', '901x720'];
const TABS = ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar', 'ledger'];

test('station foot: each tab centre hits its own tab, and LEDGER\'s centre opens the Ledger', { timeout: 300000 }, async () => {
  const server = await startBenchServer(), { chromium } = await loadPlaywright();
  const executablePath = process.env.SF_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-gpu', '--mute-audio'] });
    for (const size of SIZES) {
      const [width, height] = size.split('x').map(Number);
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      try {
        await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=station-market&chrome=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: 120000 });
        await page.waitForTimeout(600);
        const hits = await page.evaluate((tabs) => tabs.map((id) => {
          const tile = [...document.querySelectorAll(`.sxb-ops [data-nav="${id}"]`)].find(t => t.getClientRects().length);
          if (!tile) return { id, missing: true };
          const r = tile.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return { id, x: Math.round(x), y: Math.round(y), ok: !!hit && (hit === tile || tile.contains(hit)),
            hit: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : 'null',
            owner: hit?.closest('button') ? `${hit.closest('button').className}` : '' };
        }), TABS);
        for (const h of hits) {
          assert.ok(!h.missing, `${size}: no visible ${h.id} tab`);
          assert.ok(h.ok, `${size}: ${h.id} tab centre (${h.x},${h.y}) hits ${h.hit} (${h.owner})`);
        }
        const ledger = hits.find(h => h.id === 'ledger');
        await page.mouse.click(ledger.x, ledger.y);
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => ({
          ledger: !!document.querySelector('.sxb-ops [data-nav="ledger"].is-active, .sxb-ops [data-nav="ledger"][aria-current], .sxb-ops [data-nav="ledger"][aria-selected="true"]'),
          help: [...document.querySelectorAll('.sx-pop--help')].some(p => p.getClientRects().length && getComputedStyle(p).visibility !== 'hidden'),
        }));
        assert.equal(after.help, false, `${size}: a click on LEDGER opened Help`);
        assert.equal(after.ledger, true, `${size}: a click on LEDGER did not open the Ledger`);
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
});
