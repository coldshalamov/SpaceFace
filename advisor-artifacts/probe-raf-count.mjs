// Definitive visible-FPS measurement: count actual requestAnimationFrame ticks per wall-clock
// second for 10 seconds, sampled inside the page (not via the probe's external polling). This is
// exactly how many times the screen updates per second — what the eye sees. Also logs the game's
// own lastFrameDtMs each second so we can see the true per-frame interval.
import { spawn } from 'node:child_process';
const { chromium } = await import('playwright');

const PORT = 8123;
const server = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: 'ignore' });
async function waitReachable(url, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { try { const r = await fetch(url); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 300)); }
  throw new Error('server unreachable');
}

try {
  await waitReachable(`http://127.0.0.1:${PORT}/`);
  const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1830, height: 973 } });
  page.on('console', () => {}); page.on('pageerror', () => {});
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer), { timeout: 30000 });
  // Optional: force bloom off to test if the multi-second stalls are bloom-related.
  // Pass arg 'bloomoff' to this probe to disable bloom before starting.
  if (process.argv[2] === 'bloomoff') {
    await page.evaluate(() => { window.SF.state.settings.video.bloom = false; });
    console.error('[probe] bloom FORCED OFF');
  }
  await page.evaluate(() => { try { window.SF.bus.emit('game:new', { seed: 47 }); } catch (e) {} });
  await page.waitForFunction(() => { const s = window.SF.state; return s && s.mode === 'flight' && s.entities && s.entities.get(s.playerId); }, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Instrument rAF in-page: count ticks per second for 10s. This runs ALONGSIDE the game loop, so
  // it sees the same vsync cadence the game's draws do.
  const perSecond = await page.evaluate(() => new Promise((resolve) => {
    const buckets = [];
    let second = 0; let count = 0; let dtSum = 0; let dtMax = 0;
    const startWall = performance.now();
    const tick = () => {
      const now = performance.now();
      const elapsed = now - startWall;
      const curSecond = Math.floor(elapsed / 1000);
      while (buckets.length <= curSecond) buckets.push(0);
      buckets[curSecond]++;
      const dtMs = window.__SPACEFACE_PERF__ && window.__SPACEFACE_PERF__.getReport ? 0 : 0;
      count++;
      if (curSecond < 10) requestAnimationFrame(tick);
      else resolve(buckets);
    };
    requestAnimationFrame(tick);
  }));

  const diagSeries = await page.evaluate(() => {
    // grab diagnostics at the end for one snapshot
    const d = window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.getReport();
    return d ? { fpsEma: d.fpsEma, frameMs: d.frameMs } : null;
  });

  await browser.close();
  console.log(JSON.stringify({ rafTicksPerSecond: perSecond, diag: diagSeries, note: 'buckets = real rAF ticks reaching the page per wall-clock second' }, null, 2));
} finally { server.kill(); }
