// OVH-04b: inside a run the pause menu offers only what a run needs; Adventure's pause is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

const RUN = ['Resume', 'Settings', 'Help / Controls', 'Records Wall', 'Photo', 'End run'];
const BANNED = /^(Save|Load|Mission Log|My Ship|Operations|Physics|Sandbox|Codex|Achievements|Replay|Clips|Main Menu|Quit)/i;

async function pauseView(page, base, run) {
  await page.goto(`${base}tools/ui-bench.html?screen=pause&chrome=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BENCH_READY === true);
  await page.evaluate(async (r) => {
    const s = window.__BENCH_STATE;
    if (r) s.run = r;
    const pause = await import('/src/ui/screens/pause.js');
    pause.pauseScreen.onShow({ state: s, bus: window.__BENCH_BUS, registry: window.BENCH.registry, helpers: {} });
  }, run);
  await page.waitForTimeout(600);
  return page.evaluate(() => ({
    labels: [...document.querySelectorAll('[data-screen=pause] button')].map((b) => b.textContent.trim()),
    keys: [...document.querySelectorAll('.sf-pause-key')].map((k) => k.textContent.trim()),
  }));
}

test('Swarm pause lists exactly the run entries; Adventure pause keeps Save, Load and the rest', async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const swarm = await pauseView(page, server.baseUrl, { kind: 'survival', ruleset: 'swarm', phase: 'active', seed: 4242, wave: 3, retireToken: 7 });
    assert.deepEqual(swarm.labels, RUN);
    assert.ok(!swarm.labels.some((l) => BANNED.test(l)));
    assert.ok(!swarm.keys.includes('F5') && !swarm.keys.includes('F9'), 'no quick save/load hints in a run');
    assert.deepEqual(swarm.keys.slice(0, 2), ['Esc', 'P']);

    const adv = await pauseView(page, server.baseUrl, null);
    for (const want of ['Resume', 'Settings', 'Save', 'Load', 'Mission Log', 'My Ship', 'Operations', 'Help / Controls', 'Codex', 'Photo', 'Records Wall']) {
      assert.ok(adv.labels.some((l) => l.startsWith(want)), `Adventure still offers ${want}`);
    }
    assert.ok(adv.keys.includes('F5') && adv.keys.includes('F9'));
  } finally {
    await browser.close();
    await server.close?.();
  }
});
