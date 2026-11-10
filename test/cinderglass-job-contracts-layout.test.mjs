import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

test('mounted Contracts keeps the recovery contact and terms readable in its scrollable rail', async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-webgl'] });
  try {
    for (const viewport of [{ width: 1360, height: 720 }, { width: 844, height: 390 }]) {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=station-contracts&chrome=0`);
        await page.waitForFunction(() => window.__BENCH_READY === true);
        await page.evaluate(() => {
          const s = window.BENCH.state;
          s.ui.dockedStationId = 'station_tethys';
          s.cinderglassJobView = { token: 'fixture', contacts: [{ title: 'Tala Rook · disputed consignment',
            line: 'A sealed consignment is held under disputed title.',
            detail: 'Return the original to Tala. Condition and custody determine settlement.',
            token: 'fixture', actor: 'tala', actions: [{ id: 'contact', label: 'Read recovery terms' }] }], navigation: [] };
          window.BENCH.bus.on('cinderglassJob:action', p => {
            if (p.action === 'contact') window.BENCH.bus.emit('cinderglassJob:offer', {
              token: 'fixture', epoch: 1, title: 'Tala Rook · recovery terms',
              headline: '450CR intact; 300CR damaged.', detail: '150CR inspection deposit is refunded only on accepted Tala return.',
              choices: [{ id: 'accept', label: 'Take the recovery' }, { id: 'decline', label: 'Leave it' }],
            });
          });
          window.BENCH.bus.emit('cinderglassJob:view', s.cinderglassJobView);
        });
        const panel = page.locator('[data-cinderglass-contracts]');
        const action = panel.getByRole('button', { name: 'Read recovery terms' });
        await action.scrollIntoViewIfNeeded();
        const layout = await panel.evaluate(e => {
          const rect = e.getBoundingClientRect(), heading = e.querySelector('h3').getBoundingClientRect();
          const next = e.nextElementSibling.getBoundingClientRect();
          return { rail: e.parentElement.className, width: heading.width, bottom: rect.bottom, nextTop: next.top,
            color: getComputedStyle(e.querySelector('button')).color };
        });
        assert.match(layout.rail, /sx-ct__hang/);
        assert.ok(layout.width > 140 && layout.bottom <= layout.nextTop + 1, JSON.stringify(layout));
        assert.equal(layout.color, 'rgb(241, 232, 214)');
        await action.click();
        assert.match(await panel.innerText(), /450CR intact; 300CR damaged/);
        const leave = panel.getByRole('button', { name: 'Leave it' });
        await leave.scrollIntoViewIfNeeded();
        assert.ok(await leave.isVisible());
      } finally { await page.close(); }
    }
  } finally { await browser.close(); await server.close(); }
});
