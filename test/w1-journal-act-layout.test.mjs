// W1 render-level regressions: the Journal keeps a persistent act strip beside tracked work and
// drops it after the book closes; the 290px nowrap tracker shows the short act form at 1280 and
// 960 without clipping, while the full canon heading stays on the title/aria label.
// Run: node --test test/w1-journal-act-layout.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';
import { HUD_CSS } from '../src/ui/views/hudStyles.js';
import { journeyActForBeat, journeyActLabel, journeyActTrackerLabel } from '../src/data/journeyActs.js';

test('the Journal renders the act beside a tracked job and suppresses it after the book', async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=missionLog&chrome=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__BENCH_READY === true);
    await page.evaluate(() => {
      const s = window.__BENCH_STATE;
      s.story.beatIndex = 5;
      s.story.flags = {};
      s.story.endgame = false;
      s.missions.active = [{
        id: 'w1:tracked', status: 'active', title: 'Tracked side job', type: 'cargo_delivery',
        objectiveProgress: 0, objectiveTarget: 1, destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
        params: { cmdtyId: 'cmdty_food', qty: 1 },
      }];
      s.ui.trackedMissionId = 'w1:tracked';
      s.onboarding = { active: false, finished: true };
      window.__benchRefresh();
    });
    const strip = page.locator('[data-journey-act="true"]');
    assert.ok(await strip.count() > 0, 'the act strip is a persistent Journal surface');
    assert.match(await page.locator('.sf-mlog-story-line').innerText(), /ACT III/);
    assert.match(await strip.first().innerText(), /ACT III - THREE DOORS, ONE ADMINISTRATOR/);
    assert.match(await strip.last().innerText(), /Pick a side/);

    await page.evaluate(() => {
      window.__BENCH_STATE.story.flags.endgame = true;
      window.__benchRefresh();
    });
    assert.equal(await page.locator('[data-journey-act="true"]').count(), 0,
      'a closed book leaves no live act strip in the Journal');
    await page.close();
  } finally { await browser.close(); await server.close(); }
});

test('the tracker act line fits 1280 and 960 and keeps the full heading on its label', async () => {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const short = journeyActTrackerLabel(journeyActForBeat(4));
  const full = journeyActLabel(journeyActForBeat(4));
  try {
    for (const width of [1280, 960]) {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      await page.setContent(`<!doctype html><html><head></head><body>
        <div id="hud"><div class="sf-leftcontext"><div class="sf-mission-tracker">
          <div class="sf-mt-title mono" title="${full}" aria-label="${full}">${short}</div>
        </div></div></div>
      </body></html>`);
      await page.addStyleTag({ content: `
        :root { --k-fs-data: 12px; --k-fs-body: 14px; --hud-data: ui-monospace, monospace;
          --hud-amber: #fff; --hud-paper: #fff; --hud-muted: #888; --k-text: ui-monospace, monospace;
          --k-signal: #fff; --k-hair: #333; --dp-lamp: #fff; --dp-metal-3: #333; }
        ${HUD_CSS}
      ` });
      const metrics = await page.locator('.sf-mt-title').evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        title: node.getAttribute('title'),
        aria: node.getAttribute('aria-label'),
        text: node.textContent,
      }));
      assert.equal(metrics.text, short);
      assert.equal(metrics.title, full, `the full canon heading stays on the title at ${width}`);
      assert.equal(metrics.aria, full, `the full canon heading stays on the aria label at ${width}`);
      assert.ok(metrics.clientWidth > 0, `the tracker has a laid-out width at ${width}`);
      assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1,
        `the short act line does not clip at ${width} (${metrics.scrollWidth} <= ${metrics.clientWidth})`);
      await page.close();
    }
  } finally { await browser.close(); }
});
