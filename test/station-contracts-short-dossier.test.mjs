import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

// Real station screen and mission owner over the bench's existing Helios board.
test('short station dossier keeps its terms readable and its hold-to-accept reachable', { timeout: 180000 }, async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgl', '--mute-audio'] });
    for (const viewport of [{ width: 844, height: 390 }, { width: 700, height: 461 }]) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=station-contracts&chrome=0`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__BENCH_READY, null, { timeout: 120000 });
        await page.evaluate(async () => {
          const { missions } = await import('/src/systems/missions.js');
          const owner = Object.create(missions);
          owner.init({ state: BENCH.state, bus: BENCH.bus, helpers: {}, registry: BENCH.registry });
          window.__accepted = [];
          BENCH.bus.on('mission:accepted', event => window.__accepted.push(event));
        });
        const rows = page.locator('.sx-ct__board [data-mid]');
        const last = rows.last();
        await last.scrollIntoViewIfNeeded();
        await last.click();
        assert.equal(await last.getAttribute('aria-selected'), 'true');
        const first = rows.first();
        await first.scrollIntoViewIfNeeded();
        await first.click();
        assert.equal(await first.getAttribute('aria-selected'), 'true');
        const offerId = await first.getAttribute('data-mid');
        const measure = await page.locator('.sx-dossier').evaluate(root => {
          const box = selector => root.querySelector(selector).getBoundingClientRect().toJSON();
          const label = root.querySelector('.sx-dossier__terms .k-62');
          const labelRange = document.createRange();
          labelRange.selectNodeContents(label);
          return { dossier: box('.sx-dossier__title'), reward: box('.sx-dossier__reward'),
            risk: box('.sx-dossier__risk'), terms: box('.sx-dossier__terms'),
            foot: box('.sx-dossier__foot'), labelWidth: label.getBoundingClientRect().width,
            labelTextWidth: labelRange.getBoundingClientRect().width };
        });
        assert.ok(measure.dossier.bottom <= measure.reward.top + 1, 'title and payout do not overlap');
        assert.ok(measure.risk.bottom <= measure.terms.top + 1, 'risk and terms do not overlap');
        if (viewport.width === 844) assert.ok(measure.terms.bottom <= measure.foot.top + 1, 'terms precede the action');
        assert.ok(measure.labelTextWidth <= measure.labelWidth + 1, 'term labels fit their column');
        for (const selector of ['.sx-dossier__risk', '.sx-dossier__terms > li:last-child']) {
          const item = page.locator(selector).first();
          await item.scrollIntoViewIfNeeded();
          const visible = await item.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const scroller = element.closest('.sx-dossier').getBoundingClientRect();
            const footer = document.querySelector('.sxb-ops').getBoundingClientRect();
            return rect.top >= Math.max(0, scroller.top) - 1
              && rect.bottom <= Math.min(scroller.bottom, footer.top, innerHeight) + 1;
          });
          assert.ok(visible, `${selector} is fully readable after scrolling`);
        }
        const accept = page.locator('.sx-ct-commit[data-accept]').first();
        // A longer instruction must participate in layout without relying on the English split.
        if (viewport.width === 700) {
          await accept.locator('.orr-lampkey__note').evaluate(note => {
            note.textContent = 'Hold to accept this mission and commit the stated collateral';
          });
        }
        await accept.focus();
        await accept.scrollIntoViewIfNeeded();
        const reach = await accept.evaluate(button => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          const note = button.querySelector('.orr-lampkey__note').getBoundingClientRect();
          const dossier = button.closest('.sx-dossier').getBoundingClientRect();
          return { hit: !!hit && (hit === button || button.contains(hit)), noteRight: note.right,
            note: note.toJSON(), focused: document.activeElement === button,
            dossierRight: dossier.right, rect: rect.toJSON() };
        });
        assert.ok(reach.hit, 'the scrolled Accept control owns its pointer centre');
        assert.ok(reach.focused, 'Accept remains keyboard focusable after revealing it');
        assert.ok(reach.rect.height >= 44, 'the held target remains at least 44px tall');
        assert.ok(reach.note.left >= reach.rect.left - 1 && reach.note.right <= reach.rect.right + 1
          && reach.note.top >= reach.rect.top - 1 && reach.note.bottom <= reach.rect.bottom + 1,
        'the whole instruction is contained in the measured key');
        assert.ok(reach.noteRight <= reach.dossierRight + 1, 'hold instruction stays inside the dossier');
        await page.mouse.move(reach.rect.x + reach.rect.width / 2, reach.rect.y + reach.rect.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.up();
        assert.equal(await page.evaluate(() => window.__accepted.length), 0, 'an early release does not accept');
        await page.mouse.down();
        await page.waitForTimeout(1000); // the shipped control requires a sustained hold
        await page.mouse.up();
        await page.waitForFunction(id => window.__accepted.some(event => event.sourceOfferId === id), offerId);
        assert.ok(await page.evaluate(id => BENCH.state.missions.active.some(mission => mission.sourceOfferId === id), offerId));
        assert.deepEqual(errors, []);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
