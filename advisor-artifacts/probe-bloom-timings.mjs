// Focused bloom per-pass timing probe. Boots the game with ?sf_bench_bloom=1&debug=flight, waits for
// window.__SF_BLOOM_TIMINGS to collect samples, then reports the per-pass breakdown. This gives
// direct CPU-wall timing of each bloom pass (scene render / downsample / upsample / composite) so we
// can see which pass actually costs the frame budget — instead of guessing from variant names.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = await import('playwright');

const PORT = 8699;
const server = spawn('node', ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });

async function waitReachable(url, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('server unreachable');
}

try {
  await waitReachable(`http://127.0.0.1:${PORT}/`);
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=desktop', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1830, height: 973 } });
  page.on('console', () => {}); // silence
  page.on('pageerror', (e) => console.error('pageerror:', e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?sf_bench_bloom=1&debug=flight`, { waitUntil: 'domcontentloaded' });

  // Wait for the game to boot + reach playable flight, then emit game:new to start a scenario.
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.state.render && window.SF.state.render.renderer), { timeout: 30000 });
  await page.evaluate(() => { try { window.SF.bus.emit('game:new', { seed: 47 }); } catch (e) {} try { window.SF.bus.emit('ui:closeAll', {}); } catch (e) {} });
  // wait for flight mode + player alive
  await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    return s && s.mode === 'flight' && s.entities && s.entities.get(s.playerId) && s.entities.get(s.playerId).alive;
  }, { timeout: 30000 }).catch(() => {});

  // Let it run ~15s to collect bloom timings AND catch the recurring multi-second freezes.
  await page.waitForTimeout(15000);

  const timings = await page.evaluate(() => {
    const t = window.__SF_BLOOM_TIMINGS || { samples: [], stalls: {} };
    // also capture any page console errors that might indicate GL context loss
    return { ...t, programCount: window.SF.state.render.renderer.info.programs ? window.SF.state.render.renderer.info.programs.length : 'n/a' };
  });
  const rafStats = await page.evaluate(() => {
    // also grab a quick rAF sample to correlate
    return new Promise((resolve) => {
      const samples = []; let last = performance.now(); let count = 0;
      const tick = () => {
        const now = performance.now(); samples.push(now - last); last = now; count++;
        if (count < 120) requestAnimationFrame(tick);
        else {
          samples.sort((a, b) => a - b);
          resolve({ p50: samples[60], p95: samples[114], avg: samples.reduce((x, y) => x + y, 0) / samples.length });
        }
      };
      requestAnimationFrame(tick);
    });
  });

  await browser.close();

  if (!timings || !timings.samples || !timings.samples.length) {
    console.log(JSON.stringify({ error: 'no bloom timings collected (bloom may have been off or game not in flight)' }));
    process.exit(1);
  }
  const s = timings.samples;
  const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[a.length / 2 | 0]; };
  const reduce = (key) => s.map((x) => x[key]);
  const out = {
    samples: s.length,
    programCount: timings.programCount,
    raf: rafStats,
    stalls_over_100ms: timings.stalls,
    passes_ms: {
      scene:    { median: med(reduce('scene')).toFixed(2),    max: Math.max(...reduce('scene')).toFixed(2) },
      down:     { median: med(reduce('down')).toFixed(2),     max: Math.max(...reduce('down')).toFixed(2) },
      up:       { median: med(reduce('up')).toFixed(2),       max: Math.max(...reduce('up')).toFixed(2) },
      composite:{ median: med(reduce('composite')).toFixed(2),max: Math.max(...reduce('composite')).toFixed(2) },
      total:    { median: med(reduce('total')).toFixed(2),    max: Math.max(...reduce('total')).toFixed(2) },
    },
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  server.kill();
}
