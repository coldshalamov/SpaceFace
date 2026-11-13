// Lead look: what the bloom passes cost on the GPU in a live Swarm fight, plus what the
// local-light/atmosphere system (Nocturne) is doing there. Boots ?swarmRound=N like throw.mjs, waits
// for live hostiles, enables the GPU timers for a few seconds, prints per-pass median/p95 ms and
// the Nocturne media/light counts, and saves one frame.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/bloom-cost.mjs [outPrefix] [round]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = 8163;
const out = process.argv[2] || '.devshots/fleet/looks/bloomcost/run';
const round = Number(process.argv[3] || 20);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });

try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`);
  const t0 = Date.now();
  let live = 0;
  while (Date.now() - t0 < 420_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    live = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s || s.mode !== 'flight') return 0;
      return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length;
    }).catch(() => 0);
    if (live >= 3) break;
    await sleep(1500);
  }
  console.log(`fight live: ${live} hostiles after ${Math.round((Date.now() - t0) / 1000)} s`);
  await sleep(3000);
  const report = await page.evaluate(async () => {
    const s = window.SF.state;
    const timers = s.render && s.render.gpuTimers;
    const nocturne = s.render && s.render.nocturne;
    const noct = nocturne ? {
      media: nocturne.content && nocturne.content.media ? nocturne.content.media.length : null,
      atmosphere: !!nocturne.atmosphere,
      diag: nocturne.atmosphere && nocturne.atmosphere.getDiagnostics ? nocturne.atmosphere.getDiagnostics() : null,
    } : 'off';
    if (!timers) return { timers: 'none', noct };
    timers.reset && timers.reset();
    timers.setEnabled(true);
    await new Promise((r) => setTimeout(r, 5000));
    const rep = timers.getReport();
    timers.setEnabled(false);
    return { cap: rep.available, valid: rep.captureValid, passes: rep.passes, noct };
  });
  console.log(JSON.stringify(report, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)).slice(0, 3000));
  await page.screenshot({ path: `${out}-frame.png` });
  console.log(`saved ${out}-frame.png`);
  await browser.close();
} finally {
  server.kill();
  setTimeout(() => process.exit(0), 500);
}
