// probe-crucible-runlog.mjs — photograph the crucible door's run-log drawer populated.
// One-off visual evidence for the PQ-133.10 results-history surface: the bench mounts with an
// empty profile, so the drawer never renders there. Seed a realistic profile into the same
// storage key loadCrucibleMeta reads, open the real screen on the bench page, open both drawers.
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const server = await startBenchServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

const profile = {
  schemaVersion: 1,
  unlocks: {},
  records: { byKey: {}, lifetime: { runs: 4, victories: 1, bestScore: 999, deepestWave: 30, kills: 80 } },
  history: [
    { outcome: 'defeat', wave: 4, deepestWave: 6, kills: 9, wavesCleared: 4, credits: 120, score: 10, arenaId: 'arena_lagrange_crucible', ruleset: 'scored', recordedAt: '2026-09-24T10:00:00Z' },
    { outcome: 'aborted', wave: 10, kills: 22, wavesCleared: 10, credits: 340, score: 210, arenaId: 'arena_cryo_drift', ruleset: 'scored', mutators: ['glass_hull'], recordedAt: '2026-09-25T11:00:00Z' },
    { outcome: 'victory', wave: 30, kills: 41, wavesCleared: 30, score: 999, arenaId: 'arena_helios_core', ruleset: 'boss_circuit', mutators: ['glass'], dailyDateKey: '2026-09-26', ghostHash: 'abc123', bestLineId: 'line_1', recordedAt: '2026-09-26T12:00:00Z' },
    { outcome: 'aborted', wave: 2, score: 1, arenaId: 'arena_cinder_sluice', ruleset: 'scored', mutators: ['a', 'b'], recordedAt: '2026-09-26T13:00:00Z' },
  ],
  daily: { byDate: {} },
  ghosts: { byHash: {}, lastHash: null },
  bestLines: [],
};

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript((meta) => {
    try {
      localStorage.setItem('sf.save.crucible_meta', JSON.stringify({
        fmt: 'spaceface-crucible-meta', schemaVersion: 1,
        savedAt: '2026-09-26T13:00:00Z', updatedAt: '2026-09-26T13:00:00Z',
        data: meta,
      }));
    } catch { /* seeding is best-effort */ }
  }, profile);
  await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=crucible&chrome=0`,
    { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: 120_000 });
  // Open the records drawer, then the run-log drawer nested inside it.
  await page.evaluate(() => {
    for (const sel of ['details.sf-crd-records', 'details.sf-crd-log']) {
      const d = document.querySelector(sel);
      if (d) d.open = true;
    }
  });
  await page.waitForTimeout(200);
  const report = await page.evaluate(() => {
    const drawer = document.querySelector('details.sf-crd-log');
    const rows = [...(drawer?.querySelectorAll('.sf-crd-log__row') || [])].map((r) => r.textContent.trim());
    const problems = [];
    if (!drawer) problems.push('run-log drawer not in the DOM');
    if (drawer && !rows.length) problems.push('drawer rendered with no rows');
    // Flag any clipped text inside the drawer: scroll overflow means the row truncates content.
    for (const el of drawer ? drawer.querySelectorAll('*') : []) {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
        const t = (el.textContent || '').trim().slice(0, 60);
        if (t) problems.push(`overflow in <${el.tagName.toLowerCase()} class="${el.className}">: "${t}"`);
      }
    }
    return { drawerOpen: drawer?.open ?? null, rowCount: rows.length, rows, problems };
  });
  console.log(JSON.stringify(report, null, 2));
  await page.screenshot({ path: '.devshots/ui-bench/crucible-runlog.png', timeout: 60_000, fullPage: false });
  // Also capture the drawer region alone for a closer look.
  const drawer = await page.$('details.sf-crd-log');
  if (drawer) await drawer.screenshot({ path: '.devshots/ui-bench/crucible-runlog-drawer.png', timeout: 60_000 });
  console.log('shots: .devshots/ui-bench/crucible-runlog.png, crucible-runlog-drawer.png');
} finally {
  await browser.close();
  await server.close();
}
